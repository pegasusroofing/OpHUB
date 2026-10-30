// Drawing mark-up (498 planMarkup): full screen over a drawing — numbered
// circles (auto-numbering, or the report items ticked "Add to drawing"),
// crosses, ticks, warning triangles, arrows, pen and text, in 7 colours and 4
// sizes; eraser, undo and clear. Press on a number, symbol or text already placed to pick it up: drag
// to move it, then − / + to resize, a colour to recolour, Edit text / Change number, or 🗑 to delete.
// "Number from…" sets the next number placed. Marks are kept in the current app's format
// so a drawing can be re-opened in either app. Save gives a JPEG with the
// marks drawn in (the office laptop draws it full size; phones snapshot the
// screen) plus the marks. pinch or − / + zoom in up to 4×, and ✋ Move scrolls round
// the drawing (drawing is paused while moving).
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Image, Modal, PanResponder, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Rect, Text as SvgText } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';

import { confirmAsk, promptText, useToast } from '@/components/toast';
import {
  arrowParts, hitMark, hitStroke, scaleMark, shiftMark, PHOTO_COLOURS, ringBox, crossPath, haloOf, isLight, MARK_COLOURS, MARK_SIZES, markCanvas, markRadius, nearestOp, nextFree, numFont, penPath, refreshKeyColours, tickPath, warnPath,
  type MarkKey, type MarkOp, type MarkSize, type Pt,
} from '@/lib/rules/markup';
import { renderMarked } from '@/lib/markupRender';
import { base } from '@/theme/theme';

type Tool = 'num' | 'key' | 'cross' | 'tick' | 'warn' | 'arrow' | 'ring' | 'pen' | 'text' | 'erase' | 'select';
const TOOLS: [Tool, string][] = [['num', '① Number'], ['cross', '✕ Cross'], ['tick', '✓ Tick'], ['warn', '⚠ Warning'], ['arrow', '➜ Arrow'], ['pen', '✎ Pen'], ['text', 'T Text'], ['erase', '⌫ Eraser'], ['select', '☝ Select']];
// Photos (snags, deliveries — 499 photoMarkup): pen, arrow, circle and text.
const PHOTO_TOOLS: [Tool, string][] = [['pen', '✎ Pen'], ['arrow', '➜ Arrow'], ['ring', '◯ Circle'], ['text', 'T Text'], ['erase', '⌫ Eraser'], ['select', '☝ Select']];

export function MarkOps({ ops }: { ops: MarkOp[] }) {
  return <>{ops.map((o, i) => <MarkShape key={i} o={o} />)}</>;
}
function MarkShape({ o }: { o: MarkOp }) {
  const halo = haloOf(o.c);
  if (o.t === 'num') { const fs = numFont(o); return <G><Circle cx={o.x} cy={o.y} r={o.r} fill={o.c} stroke={halo} strokeWidth={Math.max(3, o.r * 0.16)} /><SvgText x={o.x} y={o.y} dy={fs * 0.36} fontSize={fs} fontWeight="bold" textAnchor="middle" fill={isLight(o.c) ? '#111' : '#fff'}>{String(o.n)}</SvgText></G>; }
  if (o.t === 'cross' || o.t === 'tick') { const d = o.t === 'cross' ? crossPath(o) : tickPath(o); return <G><Path d={d} stroke={halo} strokeWidth={o.r * 0.5} strokeLinecap="round" strokeLinejoin="round" fill="none" /><Path d={d} stroke={o.c} strokeWidth={o.r * 0.3} strokeLinecap="round" strokeLinejoin="round" fill="none" /></G>; }
  if (o.t === 'warn') { const r = o.r * 1.15; return <G><Path d={warnPath(o)} fill={o.c} stroke={halo} strokeWidth={Math.max(3, r * 0.14)} strokeLinejoin="round" /><SvgText x={o.x} y={o.y + r * 0.18} dy={r * 0.36} fontSize={Math.round(r * 1.05)} fontWeight="bold" textAnchor="middle" fill={isLight(o.c) ? '#111' : '#fff'}>!</SvgText></G>; }
  if (o.t === 'text') return <G><SvgText x={o.x} y={o.y} dy={o.fs * 0.35} fontSize={o.fs} fontWeight="bold" stroke={halo} strokeWidth={Math.max(3, o.fs / 5)} strokeLinejoin="round" fill={halo}>{o.s}</SvgText><SvgText x={o.x} y={o.y} dy={o.fs * 0.35} fontSize={o.fs} fontWeight="bold" fill={o.c}>{o.s}</SvgText></G>;
  if (!('pts' in o)) return null;
  if (o.t === 'ring') { if (!o.pts[1]) return null; const b = ringBox(o.pts[0], o.pts[1]); return <Ellipse cx={b.cx} cy={b.cy} rx={b.rx} ry={b.ry} stroke={o.c} strokeWidth={o.w} fill="none" />; }
  if (o.t === 'pen') return <Path d={penPath(o.pts)} stroke={o.c} strokeWidth={o.w} strokeLinecap="round" strokeLinejoin="round" fill="none" />;
  if (!o.pts[1]) return null;
  const a = arrowParts(o.pts[0], o.pts[1], o.w);
  return <G><Path d={a.shaft} stroke={o.c} strokeWidth={o.w} strokeLinecap="round" fill="none" /><Path d={a.head} fill={o.c} /></G>;
}

export function MarkupEditor({ src, ops: initial, keys = [], photo = false, onClose }: { src: string; ops?: MarkOp[]; keys?: MarkKey[]; photo?: boolean; onClose: (out: { image: string; ops: MarkOp[] } | null) => void }) {
  const toast = useToast();
  const [size, setSize] = useState<{ W: number; H: number } | null>(null);
  const [area, setArea] = useState({ w: 0, h: 0 });
  const [ops, setOps] = useState<MarkOp[]>(() => { const c = JSON.parse(JSON.stringify(initial || [])) as MarkOp[]; refreshKeyColours(c, keys); return c; });
  const [tool, setTool] = useState<Tool>(photo ? 'pen' : keys.length ? 'key' : 'num');
  const COLOURS = photo ? PHOTO_COLOURS : MARK_COLOURS;
  const [colour, setColour] = useState(COLOURS[0].k);
  const [picked, setPicked] = useState(false);
  const [sz, setSz] = useState<MarkSize>('m');
  const [z, setZ] = useState(1);
  const [moving, setMoving] = useState(false);
  const [keyPick, setKeyPick] = useState<number | null>(() => { const placed = new Set((initial || []).filter((o) => o.t === 'num').map((o) => +(o as { n: number }).n)); return keys.find((k) => !placed.has(+k.n))?.n ?? null; });
  const [cur, setCur] = useState<MarkOp | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const view = useRef<ComponentRef<typeof View>>(null);
  const st = useRef({ ops, tool, colour, picked, sz, keyPick, k: 1, size, cur: null as MarkOp | null, nextNum: 0, moving: false, z: 1, pinch: null as { d0: number; z0: number } | null, sel: null as number | null, drag: null as { i: number; dx: number; dy: number; lx: number; ly: number } | null });
  useEffect(() => { Object.assign(st.current, { ops, tool, colour, picked, sz, keyPick, size, moving, z, sel }); }, [ops, tool, colour, picked, sz, keyPick, size, moving, z, sel]);

  useEffect(() => { Image.getSize(src, (w, h) => setSize(markCanvas(w, h)), () => { toast('Could not open that drawing.'); onClose(null); }); }, [src]); // eslint-disable-line react-hooks/exhaustive-deps
  const k = size && area.w ? Math.min(area.w / size.W, area.h / size.H) * z : 0;
  useEffect(() => { st.current.k = k; }, [k]);

  // The handlers read the latest state from st at touch time, not during render.
  // eslint-disable-next-line react-hooks/refs
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !st.current.moving,
    onMoveShouldSetPanResponder: () => !st.current.moving,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => {
      const s = st.current; if (!s.size || !s.k) return;
      const p = { x: e.nativeEvent.locationX / s.k, y: e.nativeEvent.locationY / s.k };
      // Pressing on a mark already placed picks it up (select, and drag to move).
      if (s.tool !== 'erase') {
        const hit = hitMark(s.ops, p, 14 / s.k);
        // The Select tool also picks up pen lines, arrows and circles (499 photo mark-up select).
        const any = hit >= 0 ? hit : s.tool === 'select' ? hitStroke(s.ops, p, 14 / s.k) : -1;
        if (s.tool === 'select' && any < 0) { s.sel = null; setSel(null); s.cur = null; (s as unknown as { tap: Pt | null }).tap = null; return; }
        if (any >= 0 && hit < 0) { s.drag = { i: any, dx: 0, dy: 0, lx: p.x, ly: p.y }; s.sel = any; setSel(any); s.cur = null; (s as unknown as { tap: Pt | null }).tap = null; return; }
        if (hit >= 0) { const o = s.ops[hit] as { x: number; y: number }; s.drag = { i: hit, dx: o.x - p.x, dy: o.y - p.y, lx: p.x, ly: p.y }; s.sel = hit; setSel(hit); s.cur = null; (s as unknown as { tap: Pt | null }).tap = null; return; }
      }
      if (s.tool === 'pen' || s.tool === 'arrow' || s.tool === 'ring') { s.cur = { t: s.tool, c: s.colour, w: Math.max(4, Math.round(markRadius(s.size.W, s.size.H, s.sz) / 4)), pts: [p] }; setCur({ ...s.cur }); }
      else s.cur = null;
      (s as unknown as { tap: Pt }).tap = p;
    },
    onPanResponderMove: (e) => {
      const s = st.current;
      // Two fingers: pinch to zoom (1× to 4×); nothing gets marked by this touch.
      const tch = e.nativeEvent.touches;
      if (tch && tch.length >= 2) {
        const d = Math.hypot(tch[0].pageX - tch[1].pageX, tch[0].pageY - tch[1].pageY);
        if (!s.pinch) { s.pinch = { d0: d || 1, z0: s.z }; s.cur = null; setCur(null); }
        else setZ(Math.max(1, Math.min(4, s.pinch.z0 * (d / s.pinch.d0))));
        return;
      }
      if (s.drag && s.k && !s.pinch) {
        const q = { x: e.nativeEvent.locationX / s.k, y: e.nativeEvent.locationY / s.k }, d = s.drag;
        const mx = q.x - d.lx, my = q.y - d.ly; d.lx = q.x; d.ly = q.y;
        setOps((x) => x.map((o, j) => (j !== d.i ? o : 'pts' in o ? shiftMark(o, mx, my) : { ...o, x: q.x + d.dx, y: q.y + d.dy })));
        return;
      }
      if (s.pinch || !s.cur || !('pts' in s.cur) || !s.k) return;
      const p = { x: e.nativeEvent.locationX / s.k, y: e.nativeEvent.locationY / s.k };
      if (s.cur.t === 'pen') s.cur.pts.push(p); else s.cur.pts[1] = p;
      setCur({ ...s.cur, pts: [...s.cur.pts] });
    },
    onPanResponderRelease: () => { void release(); },
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  const release = async () => {
    const s = st.current; if (!s.size) return;
    if (s.pinch) { s.pinch = null; return; } // the end of a pinch places nothing
    if (s.drag) { s.drag = null; return; } // a mark was picked up / moved
    // With a mark selected, a tap elsewhere just lets go of it.
    if (s.sel != null) { s.sel = null; setSel(null); return; }
    const r = markRadius(s.size.W, s.size.H, s.sz), p = (s as unknown as { tap: Pt }).tap;
    if (s.cur && 'pts' in s.cur) {
      const o = s.cur; s.cur = null; setCur(null);
      const ok = o.t === 'pen' ? o.pts.length > 1 : !!o.pts[1] && Math.hypot(o.pts[1].x - o.pts[0].x, o.pts[1].y - o.pts[0].y) > 8;
      if (ok) setOps((x) => [...x, o]);
      return;
    }
    if (!p) return;
    if (s.tool === 'erase') { const i = nearestOp(s.ops, p, r); if (i >= 0) setOps((x) => x.filter((_, j) => j !== i)); return; }
    if (s.tool === 'key' && s.keyPick != null) {
      const kc = keys.find((x) => +x.n === +s.keyPick!)?.color || null;
      const op: MarkOp = { t: 'num', n: +s.keyPick, c: !s.picked && kc ? kc : s.colour, r, x: p.x, y: p.y, key: true, auto: !s.picked };
      const placed = new Set(s.ops.filter((o) => o.t === 'num').map((o) => +(o as { n: number }).n)); placed.add(+s.keyPick);
      const nxt = keys.find((x) => !placed.has(+x.n));
      setKeyPick(nxt ? +nxt.n : null); if (!nxt) setTool('num');
      setOps((x) => [...x, op]); return;
    }
    if (s.tool === 'num' || s.tool === 'key') {
      const keyNums = new Set(keys.map((x) => +x.n));
      let n = s.nextNum || nextFree(s.ops, keys);
      while (keyNums.has(n)) n++;
      s.nextNum = n + 1;
      setOps((x) => [...x, { t: 'num', n, c: s.colour, r, x: p.x, y: p.y }]); return;
    }
    if (s.tool === 'cross' || s.tool === 'tick' || s.tool === 'warn') { setOps((x) => [...x, { t: s.tool as 'cross', c: s.colour, r, x: p.x, y: p.y }]); return; }
    if (s.tool === 'text') {
      const txt = (await promptText('Text to add to the drawing', ''))?.trim();
      if (txt) setOps((x) => [...x, { t: 'text', c: s.colour, fs: Math.round(r * 1.1), s: txt, x: p.x, y: p.y }]);
    }
  };

  const save = async () => {
    if (!size) return;
    setSaving(true);
    try {
      let image: string | null = null;
      if (Platform.OS === 'web') image = await renderMarked(src, ops);
      else {
        // The phone snapshots what's on screen: no selection outline, and back to the whole drawing first.
        if (sel != null || z !== 1) { setSel(null); setZ(1); await new Promise((r) => setTimeout(r, 350)); }
        image = await captureRef(view, { format: 'jpg', quality: 0.86, result: 'tmpfile' });
      }
      if (!image) { toast('Could not save the marked-up drawing.'); return; }
      onClose({ image, ops });
    } catch { toast('Could not save the marked-up drawing.'); } finally { setSaving(false); }
  };
  const close = async () => { if (ops.length && !(await confirmAsk('Close without saving your marks?', 'Close'))) return; onClose(null); };
  const chip = (on: boolean, label: string, onPress: () => void, key?: string) => (
    <Pressable key={key ?? label} onPress={onPress} style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, backgroundColor: on ? '#fff' : 'rgba(255,255,255,0.12)' }}>
      <Text style={{ color: on ? base.ink : '#fff', fontWeight: '700', fontSize: 12.5 }}>{label}</Text>
    </Pressable>
  );
  return (
    <Modal animationType="fade" onRequestClose={() => void close()}>
      <View style={{ flex: 1, backgroundColor: '#1c1f24' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 10, gap: 8 }}>
          {chip(false, 'Cancel', () => void close())}
          <Text style={{ flex: 1, color: '#fff', fontWeight: '800', textAlign: 'center' }}>{photo ? 'Mark up photo' : 'Mark up drawing'}</Text>
          {chip(false, '↶ Undo', () => setOps((x) => x.slice(0, -1)))}
          {chip(false, 'Clear', async () => { if (ops.length && (await confirmAsk('Remove all the marks?', 'Clear'))) setOps([]); })}
          <Pressable onPress={() => void save()} disabled={saving} style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, backgroundColor: base.blue }}><Text style={{ color: '#fff', fontWeight: '800' }}>{saving ? 'Saving…' : 'Save'}</Text></Pressable>
        </View>
        {sel != null && ops[sel] ? (
          <ScrollView horizontal style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 6, paddingHorizontal: 10, paddingBottom: 6, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '700', marginRight: 4 }}>Selected {(() => { const o = ops[sel]; return o.t === 'num' ? o.n : o.t === 'text' ? 'text' : o.t; })()}</Text>
            {chip(false, '−', () => setOps((x) => x.map((o, j) => (j === sel && size ? scaleMark(o, 1 / 1.2, size.W) : o))), 'sm')}
            {chip(false, '+', () => setOps((x) => x.map((o, j) => (j === sel && size ? scaleMark(o, 1.2, size.W) : o))), 'sb')}
            {ops[sel].t === 'text' && chip(false, '✎ Edit text', async () => { const o = ops[sel] as { s: string }; const t = (await promptText('Edit text', o.s))?.trim(); if (t) setOps((x) => x.map((q, j) => (j === sel ? { ...q, s: t } as MarkOp : q))); }, 'et')}
            {ops[sel].t === 'num' && chip(false, '# Change number', async () => { const o = ops[sel] as { n: number }; const n = parseInt((await promptText('Number', String(o.n))) || '', 10); if (n > 0) setOps((x) => x.map((q, j) => (j === sel ? { ...q, n } as MarkOp : q))); }, 'cn')}
            {chip(false, '🗑 Delete', () => { setOps((x) => x.filter((_, j) => j !== sel)); setSel(null); }, 'dl')}
            {chip(true, 'Done', () => setSel(null), 'dn')}
          </ScrollView>
        ) : (
        <ScrollView horizontal style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 6, paddingHorizontal: 10, paddingBottom: 6 }}>
          {keys.length > 0 && chip(tool === 'key', '📍 Report items', () => setTool('key'))}
          {(photo ? PHOTO_TOOLS : TOOLS).map(([t, l]) => chip(tool === t && !moving, l, () => { setTool(t); setMoving(false); }, t))}
          <View style={{ width: 8 }} />
          {chip(false, '−', () => setZ((x) => Math.max(1, x / 1.5)), 'zo')}
          {chip(false, `${Math.round(z * 100)}%`, () => { setZ(1); setMoving(false); }, 'zf')}
          {chip(false, '+', () => setZ((x) => Math.min(4, x * 1.5)), 'zi')}
          {/* eslint-disable-next-line react-hooks/refs -- read when tapped, not while drawing */}
          {!photo && chip(false, 'Number from…', async () => { const n = parseInt((await promptText('Next number to place', String(st.current.nextNum || nextFree(ops, keys)))) || '', 10); if (n > 0) { st.current.nextNum = n; setTool('num'); setMoving(false); } }, 'nf')}
          {z > 1 && chip(moving, '✋ Move', () => setMoving(!moving), 'mv')}
        </ScrollView>
        )}
        <ScrollView horizontal style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 10, paddingBottom: 8, alignItems: 'center' }}>
          {COLOURS.map((c) => <Pressable key={c.k} accessibilityLabel={c.n} onPress={() => { if (sel != null) { setOps((x) => x.map((o, j) => (j === sel ? { ...o, c: c.k, ...(o.t === 'num' ? { auto: false } : {}) } as MarkOp : o))); return; } setColour(c.k); setPicked(true); }} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c.k, borderWidth: 3, borderColor: (sel != null ? ops[sel]?.c === c.k : colour === c.k) ? '#fff' : 'transparent' }} />)}
          <View style={{ width: 10 }} />
          {(Object.keys(MARK_SIZES) as MarkSize[]).filter((x) => !photo || x !== 'xs').map((s) => chip(sz === s, s.toUpperCase(), () => setSz(s), s))}
        </ScrollView>
        {tool === 'key' && keys.length > 0 && (
          <ScrollView horizontal style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 6, paddingHorizontal: 10, paddingBottom: 8 }}>
            {keys.map((x) => chip(keyPick === +x.n, `${x.n}. ${x.label.slice(0, 40)}`, () => setKeyPick(+x.n), `k${x.n}`))}
          </ScrollView>
        )}
        <Text style={{ color: '#cbd2db', fontSize: 12, paddingHorizontal: 10, paddingBottom: 6 }}>
          {sel != null ? 'Drag the mark to move it. Tap anywhere else to let go.' : moving ? 'Drag to move round the drawing. Tap a tool to carry on marking.' : tool === 'key' ? (keyPick != null ? `Tap the drawing to place number ${keyPick}.` : 'All the ticked items are placed.') : tool === 'pen' ? 'Draw with your finger.' : tool === 'arrow' ? 'Drag from the start to the point.' : tool === 'ring' ? 'Drag across what to circle.' : tool === 'erase' ? 'Tap a mark to remove it.' : 'Tap the drawing to place it.'}
        </Text>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} onLayout={(e) => setArea({ w: e.nativeEvent.layout.width - 16, h: e.nativeEvent.layout.height - 16 })}>
          {size && k > 0 ? (
            <ScrollView style={{ alignSelf: 'stretch' }} scrollEnabled={moving} contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ScrollView horizontal scrollEnabled={moving} contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center' }}>
            <View ref={view} collapsable={false} {...responder.panHandlers} style={{ width: size.W * k, height: size.H * k, backgroundColor: '#fff' }}>
              <Image source={{ uri: src }} style={{ position: 'absolute', left: 0, top: 0, width: size.W * k, height: size.H * k }} resizeMode="stretch" />
              <Svg width={size.W * k} height={size.H * k} viewBox={`0 0 ${size.W} ${size.H}`} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
                <MarkOps ops={cur ? [...ops, cur] : ops} />
                {sel != null && ops[sel] && !('pts' in ops[sel]) && (() => { const o = ops[sel] as { x: number; y: number; r?: number; fs?: number; s?: string }; const rr = (o.r ?? (o.fs || 20)) * 1.5; return o.s != null ? <Rect x={o.x - 6} y={o.y - (o.fs || 20) * 0.8} width={(o.s.length * (o.fs || 20) * 0.6) + 12} height={(o.fs || 20) * 1.6} fill="none" stroke="#2F6FD9" strokeWidth={3} strokeDasharray="8 6" /> : <Circle cx={o.x} cy={o.y} r={rr} fill="none" stroke="#2F6FD9" strokeWidth={3} strokeDasharray="8 6" />; })()}
              </Svg>
            </View>
            </ScrollView>
            </ScrollView>
          ) : <Text style={{ color: '#fff' }}>Loading the drawing…</Text>}
        </View>
      </View>
    </Modal>
  );
}
