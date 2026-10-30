// Signature-box editor (600 renderRamsBoxes): shows the PDF a page at a time
// and lets a manager draw every box where someone signs — who it's for
// (Operative 1…, Project Manager, Client 1…) and what goes in it (signature,
// name, date). Tap boxes to select, drag to move, align, delete, and copy one
// operative's row to the next with one tap. The drawing layer is the same on the
// laptop and phones; phones get the page as a picture (NativePdfPage).
/* eslint-disable react-hooks/refs, react-hooks/immutability -- the canvas is drawn in an effect and the pointer handlers only run on touch, never during render */
import { createElement as h, useEffect, useRef, useState } from 'react';
import { PanResponder, Platform, Pressable, Text, View, type GestureResponderEvent } from 'react-native';

import { NativePdfPage } from '@/components/NativePdfPage';
import { useToast } from '@/components/toast';
import { Button, Card, Muted } from '@/components/ui';
import { fetchBytes } from '@/lib/pdf';
import { loadPdfJs, type PdfDoc } from '@/lib/pdfjs';
import { publicUrl } from '@/lib/privateFiles';
import { align, BOX_WHAT, clientNum, MAX_OPS, opNum, repeatBoxes, repeatOffset, summary, whoColor, whoLabel, type SBox } from '@/lib/rules/signBoxes';
import { base, radius } from '@/theme/theme';

const r4 = (n: number) => Math.round(n * 10000) / 10000;

export function SignBoxEditor({ storagePath, initial, intro, saveLabel, onSave, extra }: {
  storagePath: string; initial: SBox[]; intro: string; saveLabel: string;
  onSave: (boxes: SBox[], numPages: number) => Promise<void>;
  extra?: (o: { boxes: SBox[]; numPages: number; setBoxes: (b: SBox[]) => void; setPage: (p: number) => void }) => React.ReactNode;
}) {
  const toast = useToast();
  const [pdf, setPdf] = useState<PdfDoc | null>(null);
  const [err, setErr] = useState('');
  const [page, setPage] = useState(initial[0]?.p || 1);
  const [boxes, setBoxes] = useState<SBox[]>(initial);
  const [who, setWho] = useState('op1');
  const [lastOp, setLastOp] = useState(1);
  const [lastClient, setLastClient] = useState(1);
  const [mode, setMode] = useState<string | null>(null);
  const [sels, setSels] = useState<number[]>([]);
  const [offset, setOffset] = useState<{ dx: number; dy: number } | null>(null);
  const [drag, setDrag] = useState<number[] | null>(null);
  const [moveBy, setMoveBy] = useState<{ group: number[]; dx: number; dy: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
  const [nativePages, setNativePages] = useState(0);
  const size = useRef({ w: 1, h: 1 });
  const start = useRef({ x: 0, y: 0 });
  const handlers = useRef({ want: (_x: number, _y: number) => false as boolean, down: (_x: number, _y: number) => {}, move: (_x: number, _y: number, _dx: number, _dy: number) => {}, up: (_x: number, _y: number) => {}, cancel: () => {} });
  const [pan] = useState(() => {
    const clamp = (n: number) => Math.min(1, Math.max(0, n));
    const at = (e: GestureResponderEvent) => ({ x: clamp(e.nativeEvent.locationX / size.current.w), y: clamp(e.nativeEvent.locationY / size.current.h) });
    return PanResponder.create({
      onStartShouldSetPanResponder: (e) => { const p = at(e); return handlers.current.want(p.x, p.y); },
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => { start.current = at(e); handlers.current.down(start.current.x, start.current.y); },
      onPanResponderMove: (_, g) => handlers.current.move(clamp(start.current.x + g.dx / size.current.w), clamp(start.current.y + g.dy / size.current.h), g.dx, g.dy),
      onPanResponderRelease: (_, g) => handlers.current.up(clamp(start.current.x + g.dx / size.current.w), clamp(start.current.y + g.dy / size.current.h)),
      onPanResponderTerminate: () => handlers.current.cancel(),
    });
  });
  const gesture = useRef<{ kind: 'draw' | 'move'; x0: number; y0: number; i?: number; group?: number[]; start?: number[][]; moved?: boolean } | null>(null);
  const web = Platform.OS === 'web';

  useEffect(() => {
    if (!web) return;
    let off = false;
    (async () => {
      const lib = await loadPdfJs(); if (!lib) { setErr('The PDF reader failed to load — check your connection.'); return; }
      const bytes = await fetchBytes(publicUrl('rams-docs', storagePath)); if (!bytes) { setErr('Could not open this document.'); return; }
      try { const d = await lib.getDocument({ data: bytes }).promise; if (!off) { setPdf(d); setPage((p) => (p > d.numPages ? 1 : p)); } }
      catch (e) { setErr(`Could not open this document — it needs to be a PDF. ${(e as Error).message || ''}`); }
    })();
    return () => { off = true; };
  }, [storagePath, web]);
  useEffect(() => {
    if (!pdf || !canvasEl) return;
    let off = false;
    (async () => {
      const pg = await pdf.getPage(page), c = canvasEl; if (off) return;
      const cssW = c.parentElement?.clientWidth || 360, b1 = pg.getViewport({ scale: 1 });
      const vp = pg.getViewport({ scale: Math.min(3, (cssW * Math.min(2, window.devicePixelRatio || 1)) / b1.width) });
      c.width = vp.width; c.height = vp.height;
      await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    })();
    return () => { off = true; };
  }, [pdf, page, canvasEl]);

  const numPages = (web ? pdf?.numPages : nativePages) || 0;
  const on = opNum(who), cn = clientNum(who);
  const minePage = boxes.filter((b) => b.w === who && b.p === page);
  const selNow = sels.filter((i) => boxes[i] && boxes[i].p === page);
  const pageCount = boxes.filter((b) => b.p === page).length;
  const pagesWith = Array.from(new Set(boxes.map((b) => b.p))).sort((a, b) => a - b);
  const pick = (w: string) => { if (opNum(who)) setLastOp(opNum(who)); if (clientNum(who)) setLastClient(clientNum(who)); setWho(w); setMode(null); setSels([]); };
  const goPage = (p: number) => { if (!numPages) return; const n = Math.min(numPages, Math.max(1, p)); if (n !== page) { setPage(n); setMode(null); setSels([]); } };
  // The box under a finger, top one first, with a little give for fingers.
  const hitAt = (x: number, y: number) => { for (let i = boxes.length - 1; i >= 0; i--) { const b = boxes[i]; if (b.p === page && x >= b.r[0] - 0.012 && x <= b.r[0] + b.r[2] + 0.012 && y >= b.r[1] - 0.012 && y <= b.r[1] + b.r[3] + 0.012) return i; } return -1; };
  const doRepeat = (bx: SBox[], w: string, off: { dx: number; dy: number }) => {
    const r = repeatBoxes(bx, w, page, off);
    if (!r) { toast(opNum(w) >= MAX_OPS ? "That's the most operatives a document can have." : `That would put ${whoLabel(`op${opNum(w) + 1}`)}'s boxes off the page. Draw theirs by hand, or go to the next page.`); setMode(null); return; }
    setBoxes(r.boxes); setWho(r.next); setLastOp(opNum(r.next)); setSels([]); setMode(null);
  };
  const down = (x: number, y: number) => {
    if (mode === 'repeat') {
      const off = repeatOffset(minePage, x, y);
      if (!off) { toast("Tap on the next person's space, not the same one."); return; }
      setOffset(off); doRepeat(boxes, who, off); return;
    }
    if (mode) { gesture.current = { kind: 'draw', x0: x, y0: y }; return; }
    const i = hitAt(x, y); if (i < 0) return;
    const group = selNow.includes(i) ? selNow.slice() : [i];
    gesture.current = { kind: 'move', x0: x, y0: y, i, group, start: group.map((k) => boxes[k].r.slice()) };
  };
  const move = (x: number, y: number, dx: number, dy: number) => {
    const g = gesture.current; if (!g) return;
    if (g.kind === 'draw') { setDrag([Math.min(g.x0, x), Math.min(g.y0, y), Math.abs(x - g.x0), Math.abs(y - g.y0)]); return; }
    if (!g.moved && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
    g.moved = true;
    const st = g.start!, minX = Math.min(...st.map((r) => r[0])), minY = Math.min(...st.map((r) => r[1])), maxX = Math.max(...st.map((r) => r[0] + r[2])), maxY = Math.max(...st.map((r) => r[1] + r[3]));
    setMoveBy({ group: g.group!, dx: Math.max(-minX, Math.min(1 - maxX, x - g.x0)), dy: Math.max(-minY, Math.min(1 - maxY, y - g.y0)) });
  };
  const up = (x: number, y: number) => {
    const g = gesture.current; gesture.current = null; if (!g) return;
    if (g.kind === 'draw') {
      setDrag(null);
      const w = Math.abs(x - g.x0), hh = Math.abs(y - g.y0);
      if (w < 0.03 || hh < 0.008) { toast('Drag across the space to draw the box.'); return; }
      const nb = boxes.concat([{ p: page, w: who, t: mode!, r: [Math.min(g.x0, x), Math.min(g.y0, y), w, hh].map(r4) }]);
      setBoxes(nb); setSels([nb.length - 1]);
      const have = nb.filter((b) => b.w === who && b.p === page).map((b) => b.t);
      setMode(BOX_WHAT.find((k) => !have.includes(k.key))?.key ?? null);
      return;
    }
    if (g.moved && moveBy) {
      setBoxes(boxes.map((b, k) => { const n = g.group!.indexOf(k); return n < 0 ? b : { ...b, r: [r4(g.start![n][0] + moveBy.dx), r4(g.start![n][1] + moveBy.dy), b.r[2], b.r[3]] }; }));
      setSels(g.group!); setMoveBy(null);
    } else {
      setMoveBy(null);
      const i = g.i!, b = boxes[i];
      if (selNow.includes(i)) setSels(selNow.filter((k) => k !== i));
      else { setSels(selNow.concat([i])); if (opNum(b.w)) setLastOp(opNum(b.w)); if (clientNum(b.w)) setLastClient(clientNum(b.w)); setWho(b.w); }
    }
  };
  handlers.current = { want: (x, y) => !!mode || hitAt(x, y) >= 0, down, move, up, cancel: () => { gesture.current = null; setDrag(null); setMoveBy(null); } };
  const chip = (active: boolean, color: string, label: string, onPress: () => void) => (
    <Pressable onPress={onPress} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1.5, borderColor: color, backgroundColor: active ? color : 'transparent' }}><Text style={{ fontWeight: '700', fontSize: 12.5, color: active ? '#fff' : color }}>{label}</Text></Pressable>
  );
  const pm = (l: string, f: () => void) => <Pressable onPress={f} style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: base.line, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 16, color: base.ink }}>{l}</Text></Pressable>;
  const help = mode === 'repeat' ? `Tap where ${whoLabel(`op${on + 1}`)}'s space is (the next row).` : mode ? `Drag a box where ${whoLabel(who)}'s ${BOX_WHAT.find((x) => x.key === mode)?.label.toLowerCase()} goes.` : '';
  return (
    <View>
      <Card><Muted>{intro}</Muted></Card>
      {err ? <Card><Muted>{err}</Muted></Card> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {pm('‹', () => goPage(page - 1))}
        <Text style={{ flex: 1, textAlign: 'center', fontWeight: '700', color: base.ink }}>Page {page}{numPages ? ` of ${numPages}` : ''}</Text>
        {pm('›', () => goPage(page + 1))}
      </View>
      {pagesWith.length > 0 && <Text style={{ color: base.slate, marginBottom: 8 }}>{summary(boxes)} · pages with boxes: {pagesWith.map((p) => <Text key={p} onPress={() => goPage(p)} style={{ color: base.blue, fontWeight: p === page ? '800' : '400' }}>{p} </Text>)}</Text>}
      <Card>
        <Muted style={{ fontWeight: '700', marginBottom: 6 }}>1. Who signs here?</Muted>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {chip(!!on, whoColor(`op${on || lastOp}`), `Operative ${on || lastOp}`, () => pick(`op${on || lastOp}`))}
          {pm('−', () => { const c = on || lastOp; pick(`op${Math.max(1, on ? c - 1 : c)}`); })}
          {pm('+', () => { const c = on || lastOp; pick(`op${Math.min(MAX_OPS, on ? c + 1 : c)}`); })}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 6 }}>
          {chip(!!cn, whoColor(`client${cn || lastClient}`), `Client ${cn || lastClient}`, () => pick(`client${cn || lastClient}`))}
          {pm('−', () => { const c = cn || lastClient; pick(`client${Math.max(1, cn ? c - 1 : c)}`); })}
          {pm('+', () => { const c = cn || lastClient; pick(`client${Math.min(20, cn ? c + 1 : c)}`); })}
          {chip(who === 'pm', whoColor('pm'), 'Project Manager', () => pick('pm'))}
        </View>
        <Muted style={{ fontWeight: '700', marginTop: 12, marginBottom: 6 }}>2. What goes in the box? Then drag it on the page.</Muted>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {BOX_WHAT.map((x) => { const n = minePage.filter((b) => b.t === x.key).length; return <View key={x.key} style={{ flex: 1 }}><Button kind={mode === x.key ? 'primary' : 'ghost'} title={`${x.label}${n ? ` ✓${n > 1 ? n : ''}` : ''}`} onPress={() => { setMode(mode === x.key ? null : x.key); setSels([]); }} /></View>; })}
        </View>
        {on > 0 && minePage.length > 0 && (
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
            <View style={{ flex: 1 }}><Button kind={mode === 'repeat' ? 'primary' : 'ghost'} title={`Copy to Operative ${on + 1} — tap where`} onPress={() => { setMode(mode === 'repeat' ? null : 'repeat'); setSels([]); }} /></View>
            {offset && <View style={{ flex: 1 }}><Button kind="ghost" title="Copy again, same spacing" onPress={() => doRepeat(boxes, who, offset)} /></View>}
          </View>
        )}
        {help ? <Text style={{ marginTop: 10, fontWeight: '700', color: base.blue }}>{help}</Text> : <Muted style={{ marginTop: 10 }}>Tap a box on the page to select it, tap others to add them, or drag a box to move it.</Muted>}
        {selNow.length > 0 ? (
          <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderColor: base.line }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ flex: 1, fontWeight: '700', color: base.ink }}>{selNow.length === 1 ? `Selected: ${whoLabel(boxes[selNow[0]].w)} · ${BOX_WHAT.find((x) => x.key === boxes[selNow[0]].t)?.label}` : `${selNow.length} boxes selected`}</Text>
              <Pressable onPress={() => setSels([])}><Text style={{ color: base.blue }}>Clear</Text></Pressable>
            </View>
            {selNow.length > 1 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {([['v', '⬍ Align vertically'], ['h', '⬌ Align horizontally'], ['size', '▭ Make same size']] as const).map(([k, l]) => <View key={k} style={{ flexGrow: 1 }}><Button kind="ghost" title={l} onPress={() => setBoxes(align(boxes, selNow, k))} /></View>)}
                <Muted>They line up with the first box you tapped (the one with the thick outline).</Muted>
              </View>
            )}
            <View style={{ marginTop: 6 }}><Button kind="ghost" title={`Delete ${selNow.length === 1 ? 'box' : `${selNow.length} boxes`}`} onPress={() => { const gone = new Set(selNow); setBoxes(boxes.filter((_, i) => !gone.has(i))); setSels([]); }} /></View>
          </View>
        ) : pageCount > 1 && !mode ? <Pressable onPress={() => setSels(boxes.map((b, i) => (b.p === page ? i : -1)).filter((i) => i >= 0))} style={{ marginTop: 8 }}><Text style={{ color: base.blue }}>Select all {pageCount} boxes on this page</Text></Pressable> : null}
      </Card>
      <View style={{ position: 'relative', marginVertical: 10, borderWidth: 1, borderColor: base.line, borderRadius: radius.row, overflow: 'hidden', backgroundColor: '#fff' }}>
        {web
          ? h('canvas', { ref: setCanvasEl, style: { display: 'block', width: '100%', height: 'auto' } })
          : <NativePdfPage url={publicUrl('rams-docs', storagePath)} page={page} onPages={(n) => { setNativePages(n); setPage((p) => (p > n ? 1 : p)); }} onError={setErr} />}
        <View {...pan.panHandlers} testID="sign-overlay" onLayout={(e) => { size.current = { w: e.nativeEvent.layout.width || 1, h: e.nativeEvent.layout.height || 1 }; }}
          style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }, web ? ({ touchAction: mode || selNow.length ? 'none' : 'auto', cursor: mode ? 'crosshair' : 'default', userSelect: 'none' } as never) : null]}>
          {boxes.map((b, i) => {
            if (b.p !== page) return null;
            const color = whoColor(b.w), sel = selNow.includes(i), first = selNow[0] === i, mine = b.w === who;
            const mv = moveBy && moveBy.group.includes(i) ? moveBy : null;
            return (
              <View key={i} pointerEvents="none" style={{ position: 'absolute', left: `${(b.r[0] + (mv?.dx || 0)) * 100}%`, top: `${(b.r[1] + (mv?.dy || 0)) * 100}%`, width: `${b.r[2] * 100}%`, height: `${b.r[3] * 100}%`, borderWidth: first ? 4 : sel ? 2.5 : mine ? 2 : 1.5, borderStyle: b.t === 'sig' ? 'solid' : 'dashed', borderColor: sel ? '#111' : color, backgroundColor: `${color}${mine ? '38' : '1c'}`, borderRadius: 3, paddingHorizontal: 2, overflow: 'hidden' }}>
                <Text numberOfLines={1} style={{ fontSize: 9, fontWeight: '800', color, lineHeight: 10 }}>{`${whoLabel(b.w, true)} ${b.t === 'sig' ? 'sign' : b.t}`}</Text>
              </View>
            );
          })}
          {drag ? <View pointerEvents="none" style={{ position: 'absolute', left: `${drag[0] * 100}%`, top: `${drag[1] * 100}%`, width: `${drag[2] * 100}%`, height: `${drag[3] * 100}%`, borderWidth: 2, borderColor: '#111', backgroundColor: 'rgba(17,17,17,.12)', borderRadius: 3 }} /> : null}
        </View>
      </View>
      <Button busy={busy} title={saveLabel} onPress={async () => { setBusy(true); try { await onSave(boxes, numPages); } finally { setBusy(false); } }} />
      {extra?.({ boxes, numPages, setBoxes: (b) => { setBoxes(b); setSels([]); setMode(null); if (b[0]) setPage(b[0].p); }, setPage })}
    </View>
  );
}
