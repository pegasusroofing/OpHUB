// The built-in document viewer (030 viewPdfInApp / viewDrawing): a full-screen dark viewer with the
// name at the top, + / − zoom, ⬇ Download and ✕. On the office laptop PDFs are drawn page by page
// (pdf.js) and photos shown, so nothing opens in a new tab. Drawings also get ✏️ Mark up.
// Phones show photos here and hand PDFs to the phone's own viewer.
import { useEffect, useRef, useState } from 'react';
import { Image, Linking, Modal, Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { loadPdfJs } from '@/lib/pdfjs';

export type DocReq = { url: string; name: string; onMarkup?: (src: string) => void };
const listeners = new Set<(r: DocReq | null) => void>();

const isPdf = (r: DocReq) => /\.pdf$/i.test(r.name) || /\.pdf($|\?)/i.test(r.url.split('#')[0]);
const isImg = (r: DocReq) => /\.(jpe?g|png|gif|webp|heic)$/i.test(r.name) || /\.(jpe?g|png|gif|webp)($|\?)/i.test(r.url.split('#')[0]);

// The file's name from its link (without the random prefix uploads are given).
function nameFromUrl(u: string) {
  let n = u.split('?')[0].split('#')[0].split('/').pop() || 'Document';
  try { n = decodeURIComponent(n); } catch { /* keep */ }
  return n.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, '').replace(/^d{10,}-/, '').replace(/_/g, ' ');
}

/** Open a stored file in the viewer (falls back to the phone / browser for other file types). */
export function viewDoc(url: string, name = '', opts: { onMarkup?: (src: string) => void } = {}) {
  const r = { url, name: name || nameFromUrl(url), ...opts };
  if (!isImg(r) && !(isPdf(r) && Platform.OS === 'web')) { void Linking.openURL(url); return; }
  listeners.forEach((l) => l(r));
}

/** Page 1 of a PDF as a picture (for marking up a drawing). Laptop only. */
export async function pdfFirstPageImage(url: string): Promise<string | null> {
  const lib = await loadPdfJs(); if (!lib || typeof document === 'undefined') return null;
  try {
    const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
    const pdf = await lib.getDocument({ data: bytes }).promise;
    const page = await pdf.getPage(1);
    const v1 = page.getViewport({ scale: 1 });
    const scale = Math.min(4, 3000 / Math.max(v1.width, v1.height));
    const vp = page.getViewport({ scale });
    const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
    const ctx = c.getContext('2d'); if (!ctx) return null;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    return c.toDataURL('image/jpeg', 0.92);
  } catch { return null; }
}

export function DocViewerHost() {
  const [req, setReq] = useState<DocReq | null>(null);
  const [zoom, setZoom] = useState(1);
  const { width: W, height: H } = useWindowDimensions();
  useEffect(() => {
    const l = (r: DocReq | null) => { setZoom(1); setReq(r); };
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  if (!req) return null;
  const close = () => setReq(null);
  const btn = { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: 'rgba(255,255,255,.12)' };
  const download = () => { const u = req.url; void Linking.openURL(u + (u.includes('?') ? '&' : '?') + 'download=' + encodeURIComponent(req.name)); };
  return (
    <Modal visible transparent={false} animationType="fade" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: '#1c1f24' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: Platform.OS === 'ios' ? 50 : 10, paddingBottom: 10, backgroundColor: '#111317' }}>
          <Text numberOfLines={1} style={{ flex: 1, color: '#fff', fontWeight: '700', fontSize: 15 }}>{req.name}</Text>
          {!!req.onMarkup && <Pressable accessibilityRole="button" onPress={() => { const m = req.onMarkup; close(); m?.(req.url); }} style={btn}><Text style={{ color: '#fff', fontWeight: '700' }}>✏️ Mark up</Text></Pressable>}
          <Pressable accessibilityRole="button" accessibilityLabel="Download" onPress={download} style={btn}><Text style={{ color: '#fff', fontWeight: '700' }}>⬇</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} style={btn}><Text style={{ color: '#fff', fontWeight: '800' }}>✕</Text></Pressable>
        </View>
        {isPdf(req) && Platform.OS === 'web' ? <PdfPages url={req.url} zoom={zoom} /> : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
            <ScrollView horizontal contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center' }}>
              <Image source={{ uri: req.url }} resizeMode="contain" style={{ width: (W - 16) * zoom, height: (H - 90) * zoom }} />
            </ScrollView>
          </ScrollView>
        )}
        <View style={{ position: 'absolute', right: 16, bottom: 24, gap: 8 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Zoom in" onPress={() => setZoom((z) => Math.min(6, z * 1.5))} style={zb}><Text style={zt}>+</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Zoom out" onPress={() => setZoom((z) => Math.max(1, z / 1.5))} style={zb}><Text style={zt}>−</Text></Pressable>
        </View>
      </View>
    </Modal>
  );
}
const zb = { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(255,255,255,.92)', alignItems: 'center' as const, justifyContent: 'center' as const };
const zt = { fontSize: 24, fontWeight: '800' as const, color: '#111' };

// Laptop: every page drawn into the scroll area, sharp enough to zoom into.
function PdfPages({ url, zoom }: { url: string; zoom: number }) {
  const host = useRef<HTMLElement | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'bad'>('loading');
  const [fit, setFit] = useState(800);
  useEffect(() => {
    let alive = true;
    const el = host.current;
    if (!el) return;
    (async () => {
      const lib = await loadPdfJs();
      if (!lib) { if (alive) setState('bad'); return; }
      try {
        const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
        const pdf = await lib.getDocument({ data: bytes }).promise;
        const width = Math.min(globalThis.innerWidth || 800, 1100) - 32;
        if (alive) setFit(width);
        el.innerHTML = '';
        const dpr = Math.min(3, globalThis.devicePixelRatio || 1);
        const budget = 60000000 / pdf.numPages;
        for (let i = 1; i <= pdf.numPages && alive; i++) {
          const page = await pdf.getPage(i);
          const b = page.getViewport({ scale: 1 });
          const fitScale = width / b.width;
          let rs = fitScale * dpr * 3;
          const maxDim = Math.min(6000, Math.max(Math.sqrt(budget / Math.max(b.height / b.width, 0.01)), 1400));
          if (b.width * rs > maxDim || b.height * rs > maxDim) rs = Math.min(maxDim / b.width, maxDim / b.height);
          const vp = page.getViewport({ scale: rs });
          const c = document.createElement('canvas');
          c.width = vp.width; c.height = vp.height;
          c.dataset.ratio = String(b.height / b.width);
          c.style.cssText = `display:block;margin:0 auto 10px;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.4);width:${width}px;height:${Math.round(width * b.height / b.width)}px`;
          el.appendChild(c);
          const ctx = c.getContext('2d'); if (ctx) await page.render({ canvasContext: ctx, viewport: vp }).promise;
        }
        if (alive) setState('ok');
      } catch { if (alive) setState('bad'); }
    })();
    return () => { alive = false; };
  }, [url]);
  // Zoom: resize the drawn pages (the area scrolls both ways).
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    el.querySelectorAll('canvas').forEach((c) => { const w = Math.round(fit * zoom); c.style.width = `${w}px`; c.style.height = `${Math.round(w * Number(c.dataset.ratio || 1.4))}px`; });
  }, [zoom, fit, state]);
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 8 }}>
      <ScrollView horizontal contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
        <View>
          {state === 'loading' && <Text style={{ color: '#fff', opacity: 0.7, marginTop: 40, textAlign: 'center' }}>Loading document…</Text>}
          {state === 'bad' && <Text style={{ color: '#fff', marginTop: 40, textAlign: 'center' }} onPress={() => void Linking.openURL(url)}>Couldn’t show this document here — tap to open it directly.</Text>}
          <View ref={host as never} style={{ minWidth: 300 }} />
        </View>
      </ScrollView>
    </ScrollView>
  );
}
