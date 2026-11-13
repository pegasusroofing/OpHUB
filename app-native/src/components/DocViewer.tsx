// The built-in document viewer (030 viewPdfInApp / viewDrawing): a full-screen dark viewer with the
// name at the top, + / − zoom, ⬇ Download and ✕. On the office laptop PDFs are drawn page by page
// (pdf.js) and photos shown, so nothing opens in a new tab. Drawings also get ✏️ Mark up.
// Phones show photos here and hand PDFs to the phone's own viewer.
import { useEffect, useRef, useState } from 'react';
import { Image, Linking, Modal, Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { loadPdfJs } from '@/lib/pdfjs';
import { deliverFile } from '@/lib/pdf';

export type DocReq = { url: string; name: string; onMarkup?: (src: string) => void };
const listeners = new Set<(r: DocReq | null) => void>();

const isPdf = (r: DocReq) => /\.pdf$/i.test(r.name) || /\.pdf($|\?)/i.test(r.url.split('#')[0]);
const isImg = (r: DocReq) => /\.(jpe?g|png|gif|webp|heic)$/i.test(r.name) || /\.(jpe?g|png|gif|webp)($|\?)/i.test(r.url.split('#')[0]);

// The file's name from its link (without the random prefix uploads are given).
function nameFromUrl(u: string) {
  let n = u.split('?')[0].split('#')[0].split('/').pop() || 'Document';
  try { n = decodeURIComponent(n); } catch { /* keep */ }
  return n.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, '').replace(/^\d{10,}-/, '').replace(/_/g, ' ');
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
  const bytes = useRef<Promise<{ data: Uint8Array; mime: string } | null>>(Promise.resolve(null));
  // Got ready as soon as the file opens (030 sharePdfViewerDoc): phones want the share to start from the press.
  useEffect(() => {
    if (!req) return;
    bytes.current = fetch(req.url).then(async (r) => (r.ok ? { data: new Uint8Array(await r.arrayBuffer()), mime: r.headers.get('content-type') || 'application/octet-stream' } : null)).catch(() => null);
  }, [req]);
  useEffect(() => {
    const l = (r: DocReq | null) => { setZoom(1); setReq(r); };
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  if (!req) return null;
  const close = () => setReq(null);
  const btn = { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: 'rgba(255,255,255,.12)' };
  const exportFile = async () => {
    const ready = await bytes.current;
    if (!ready) { const u = req.url; void Linking.openURL(u + (u.includes('?') ? '&' : '?') + 'download=' + encodeURIComponent(req.name)); return; }
    await deliverFile(ready.data, req.name, ready.mime);
  };
  return (
    <Modal visible transparent={false} animationType="fade" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: '#1c1f24' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: Platform.OS === 'ios' ? 50 : 10, paddingBottom: 10, backgroundColor: '#111317' }}>
          <Text numberOfLines={1} style={{ flex: 1, color: '#fff', fontWeight: '600', fontSize: 15 }}>{req.name}</Text>
          {!!req.onMarkup && <Pressable accessibilityRole="button" onPress={() => { const m = req.onMarkup; close(); m?.(req.url); }} style={btn}><Text style={{ color: '#fff', fontWeight: '600' }}>✏️ Mark up</Text></Pressable>}
          <Pressable accessibilityRole="button" accessibilityLabel="Export" onPress={() => void exportFile()} style={btn}><Text style={{ color: '#fff', fontWeight: '600' }}>📤 Export</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} style={btn}><Text style={{ color: '#fff', fontWeight: '600' }}>✕</Text></Pressable>
        </View>
        {isPdf(req) && Platform.OS === 'web' ? <PdfPages url={req.url} zoom={1} zoomButtons /> : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
            <ScrollView horizontal contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center' }}>
              <Image source={{ uri: req.url }} resizeMode="contain" style={{ width: (W - 16) * zoom, height: (H - 90) * zoom }} />
            </ScrollView>
          </ScrollView>
        )}
        {/* PDFs have their own + / −, sharing one zoom with the pinch. */}
        {!(isPdf(req) && Platform.OS === 'web') && <View style={{ position: 'absolute', right: 16, bottom: 24, gap: 8 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Zoom in" onPress={() => setZoom((z) => Math.min(6, z * 1.5))} style={zb}><Text style={zt}>+</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Zoom out" onPress={() => setZoom((z) => Math.max(1, z / 1.5))} style={zb}><Text style={zt}>−</Text></Pressable>
        </View>}
      </View>
    </Modal>
  );
}
// Dark, so they show up on a white page as well as the dark background (Andy, 14 Nov 2026: "I can't zoom in").
const zb = { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(17,19,23,.85)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,.7)', alignItems: 'center' as const, justifyContent: 'center' as const };
const zt = { fontSize: 26, fontWeight: '600' as const, color: '#fff' };

// Laptop: every page drawn into the scroll area, sharp enough to zoom into.
/** zoomButtons: + and − in the corner (the full-screen viewer), on the same zoom as the pinch and double-tap. */
export function PdfPages({ url, zoom, width: w0, light, zoomButtons }: { url: string; zoom: number; width?: number; light?: boolean; zoomButtons?: boolean }) {
  const host = useRef<HTMLElement | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'bad'>('loading');
  const [fit, setFit] = useState(800);
  // Zoom while the mouse is over the document (Andy, 5 and 6 Nov 2026): the wheel scrolls; the + and − keys (the number
  // pad's too) zoom in and out, 0 goes back to normal; Ctrl + wheel or a touchpad pinch zooms as well.
  const wrap = useRef<HTMLElement | null>(null);
  // Kept per document, so a new one opens at its normal size.
  const [wzs, setWzs] = useState<{ u: string; z: number }>({ u: url, z: 1 });
  const wz = wzs.u === url ? wzs.z : 1;
  const urlNow = useRef(url);
  useEffect(() => { urlNow.current = url; }, [url]);
  // Phones (Andy, 14 Nov 2026: "I can't zoom in"): pinch with two fingers, or double-tap to zoom in / back out. The
  // point between your fingers stays put while the pages grow.
  const zNow = useRef(1);
  useEffect(() => { zNow.current = wz; }, [wz]);
  const vScroll = useRef<unknown>(null), hScroll = useRef<unknown>(null);
  const focus = useRef<{ x: number; y: number; from: number } | null>(null);
  // + / −: zoom about the middle of what's on screen.
  const bump = (f: number) => {
    const v = node(vScroll); const r = v?.getBoundingClientRect();
    focus.current = { x: (r?.width || 0) / 2, y: (r?.height || 0) / 2, from: zNow.current };
    const u = urlNow.current; setWzs((w) => ({ u, z: Math.max(1, Math.min(6, (w.u === u ? w.z : 1) * f)) }));
  };
  const node = (r: { current: unknown }) => (r.current as { getScrollableNode?: () => HTMLElement } | null)?.getScrollableNode?.() ?? null;
  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof el.addEventListener !== 'function') return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const u = urlNow.current;
      setWzs((w) => ({ u, z: Math.max(0.5, Math.min(6, (w.u === u ? w.z : 1) * Math.exp(-e.deltaY * 0.0025))) }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    const at = (cx: number, cy: number) => { const r = (node(vScroll) || el).getBoundingClientRect(); focus.current = { x: cx - r.left, y: cy - r.top, from: zNow.current }; };
    const zoomTo = (z: number) => { const u = urlNow.current; setWzs({ u, z: Math.max(1, Math.min(6, z)) }); };
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY) || 1;
    let pinch: { d: number; z: number } | null = null, moved = false, lastUp = { t: 0, x: 0, y: 0 };
    const ts = (e: TouchEvent) => {
      if (e.touches.length === 2) { e.preventDefault(); pinch = { d: dist(e.touches), z: zNow.current }; }
      else if (e.touches.length === 1) moved = false;
    };
    const tm = (e: TouchEvent) => {
      if (pinch && e.touches.length === 2) {
        e.preventDefault();
        at((e.touches[0].clientX + e.touches[1].clientX) / 2, (e.touches[0].clientY + e.touches[1].clientY) / 2);
        zoomTo(pinch.z * dist(e.touches) / pinch.d);
      } else moved = true;
    };
    const te = (e: TouchEvent) => {
      if (e.touches.length < 2 && pinch) { pinch = null; lastUp = { t: 0, x: 0, y: 0 }; return; }
      if (e.touches.length || moved || !e.changedTouches[0]) return;
      const c = e.changedTouches[0], now = Date.now();
      if (now - lastUp.t < 320 && Math.abs(c.clientX - lastUp.x) < 30 && Math.abs(c.clientY - lastUp.y) < 30) {
        e.preventDefault(); at(c.clientX, c.clientY); zoomTo(zNow.current > 1.05 ? 1 : 2.5); lastUp = { t: 0, x: 0, y: 0 };
      } else lastUp = { t: now, x: c.clientX, y: c.clientY };
    };
    const noPageZoom = (e: Event) => e.preventDefault();
    el.addEventListener('touchstart', ts, { passive: false }); el.addEventListener('touchmove', tm, { passive: false }); el.addEventListener('touchend', te, { passive: false });
    el.addEventListener('gesturestart', noPageZoom); el.addEventListener('gesturechange', noPageZoom);
    let over = false;
    const enter = () => { over = true; }, leave = () => { over = false; };
    const onKey = (e: KeyboardEvent) => {
      if (!over || e.ctrlKey || e.metaKey || e.altKey) return;
      const a = document.activeElement as HTMLElement | null;
      if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return; // typing in a box
      const k = e.key, inK = k === '+' || k === '=' || e.code === 'NumpadAdd', outK = k === '-' || k === '_' || e.code === 'NumpadSubtract', reset = k === '0' || e.code === 'Numpad0';
      if (!inK && !outK && !reset) return;
      e.preventDefault();
      const u = urlNow.current;
      setWzs((w) => ({ u, z: reset ? 1 : Math.max(0.5, Math.min(6, (w.u === u ? w.z : 1) * (inK ? 1.2 : 1 / 1.2))) }));
    };
    el.addEventListener('mouseenter', enter); el.addEventListener('mouseleave', leave); window.addEventListener('keydown', onKey);
    return () => { el.removeEventListener('touchstart', ts); el.removeEventListener('touchmove', tm); el.removeEventListener('touchend', te); el.removeEventListener('gesturestart', noPageZoom); el.removeEventListener('gesturechange', noPageZoom); el.removeEventListener('wheel', onWheel); el.removeEventListener('mouseenter', enter); el.removeEventListener('mouseleave', leave); window.removeEventListener('keydown', onKey); };
  }, []);
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
        const width = w0 && w0 > 100 ? w0 : Math.min(globalThis.innerWidth || 800, 1100) - 32;
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
  }, [url, w0]);
  // Zoom: resize the drawn pages (the area scrolls both ways).
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    el.querySelectorAll('canvas').forEach((c) => { const w = Math.round(fit * zoom * wz); c.style.width = `${w}px`; c.style.height = `${Math.round(w * Number(c.dataset.ratio || 1.4))}px`; });
    // Keep the spot under the fingers (or the double-tap) where it was.
    const f = focus.current, v = node(vScroll), h = node(hScroll);
    if (f && f.from !== wz && v && h) {
      const k = wz / f.from;
      v.scrollTop = (v.scrollTop + f.y) * k - f.y; h.scrollLeft = (h.scrollLeft + f.x) * k - f.x;
      f.from = wz;
    }
  }, [zoom, wz, fit, state]);
  return (
    <View ref={wrap as never} style={[{ flex: 1 }, { touchAction: 'pan-x pan-y' } as never]}>
    <ScrollView ref={vScroll as never} style={{ flex: 1 }} contentContainerStyle={{ padding: 8 }}>
      <ScrollView ref={hScroll as never} horizontal contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
        <View>
          {state === 'loading' && <Text style={{ color: light ? '#6b7280' : '#fff', opacity: 0.7, marginTop: 40, textAlign: 'center' }}>Loading document…</Text>}
          {state === 'bad' && <Text style={{ color: light ? '#6b7280' : '#fff', marginTop: 40, textAlign: 'center' }} onPress={() => void Linking.openURL(url)}>Couldn’t show this document here — tap to open it directly.</Text>}
          <View ref={host as never} style={{ minWidth: 300 }} />
        </View>
      </ScrollView>
    </ScrollView>
    {zoomButtons && <View style={{ position: 'absolute', right: 16, bottom: 24, gap: 8 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Zoom in" onPress={() => bump(1.5)} style={zb}><Text style={zt}>+</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Zoom out" onPress={() => bump(1 / 1.5)} style={zb}><Text style={zt}>−</Text></Pressable>
    </View>}
    </View>
  );
}
