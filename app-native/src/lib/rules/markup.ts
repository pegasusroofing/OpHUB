// Drawing mark-up (498 planMarkup): the marks, in the same shape the current
// app saves them (<id>__ops), in pixels of the drawing scaled to at most
// 3600 on its long side — so a drawing marked in either app re-opens in the
// other. Pure: sizes, numbering, hit-testing, colours following the condition.
export type Pt = { x: number; y: number };
export type MarkOp =
  | { t: 'num'; n: number; c: string; r: number; x: number; y: number; key?: boolean; auto?: boolean }
  | { t: 'cross' | 'tick' | 'warn'; c: string; r: number; x: number; y: number }
  | { t: 'text'; c: string; fs: number; s: string; x: number; y: number }
  // 'hatch' (CPP plans only, 19 Nov 2026): an area drawn round, filled with diagonal hatching. A straight line is a
  // two-point 'pen', so drawings with lines still open in the current app.
  | { t: 'pen' | 'arrow' | 'ring' | 'hatch'; c: string; w: number; pts: Pt[] };
export type MarkKey = { n: number; label: string; color: string | null };

export const MARK_MAX = 3600;
export const MARK_COLOURS = [
  { k: '#D32F2F', n: 'Red' }, { k: '#EF7D00', n: 'Orange' }, { k: '#E0B400', n: 'Yellow' }, { k: '#1F9D52', n: 'Green' },
  { k: '#2F6FD9', n: 'Blue' }, { k: '#7B3FB5', n: 'Purple' }, { k: '#111111', n: 'Black' },
];
/** Photo mark-up (499) colours: white and yellow show up on dark photos. */
export const PHOTO_COLOURS = [
  { k: '#e53935', n: 'Red' }, { k: '#ffd400', n: 'Yellow' }, { k: '#ff8f00', n: 'Orange' }, { k: '#1e88e5', n: 'Blue' },
  { k: '#43a047', n: 'Green' }, { k: '#ffffff', n: 'White' }, { k: '#111111', n: 'Black' },
];
/** A circle drawn by dragging across it: centre and radii from the two corners. */
export function ringBox(a: Pt, b: Pt) { return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, rx: Math.abs(b.x - a.x) / 2, ry: Math.abs(b.y - a.y) / 2 }; }
// XL and XXL (Andy, 19 Nov 2026: "make lines bigger (the biggest currently isnt big enough").
export const MARK_SIZES = { xs: 0.45, s: 0.7, m: 1, l: 1.45, xl: 2.3, xxl: 3.6 } as const;
export type MarkSize = keyof typeof MARK_SIZES;

/** The drawing's working size: its own, scaled down to MARK_MAX on the long side. */
export function markCanvas(nw: number, nh: number) { const sc = Math.min(1, MARK_MAX / Math.max(nw, nh, 1)); return { W: Math.round(nw * sc), H: Math.round(nh * sc) }; }
export const markRadius = (W: number, H: number, size: MarkSize) => Math.max(9, Math.round((Math.max(W, H) / 95) * MARK_SIZES[size]));
export const isLight = (c: string) => ['#ffd400', '#ffffff', '#e0b400'].includes(String(c).toLowerCase());
export const haloOf = (c: string) => (isLight(c) ? 'rgba(0,0,0,.85)' : '#ffffff');

/** The next free number: after both the key numbers and anything placed. */
export function nextFree(ops: MarkOp[], keys: MarkKey[]): number {
  let n = ops.reduce((m, o) => (o.t === 'num' ? Math.max(m, +o.n || 0) : m), 0);
  keys.forEach((k) => { n = Math.max(n, +k.n || 0); });
  return n + 1;
}
/** The mark nearest a point, within reach of it, or -1 (for the eraser). */
export function nearestOp(ops: MarkOp[], p: Pt, r: number): number {
  let best = -1, bd = Infinity;
  ops.forEach((o, i) => {
    const d = o.t === 'hatch' && insideShape(o.pts, p) ? 0 : 'pts' in o ? Math.min(...o.pts.map((q) => Math.hypot(q.x - p.x, q.y - p.y))) : Math.hypot(o.x - p.x, o.y - p.y);
    const reach = ('r' in o ? o.r : 'fs' in o ? o.fs : 'w' in o ? o.w * 4 : r) * 1.6;
    if (d < reach && d < bd) { bd = d; best = i; }
  });
  return best;
}
/** Numbers placed for a report item follow that item's condition colour (unless picked by hand). True if any changed. */
export function refreshKeyColours(ops: MarkOp[], keys: MarkKey[]): boolean {
  const col: Record<number, string> = {}; keys.forEach((k) => { if (k.color) col[+k.n] = k.color; });
  let changed = false;
  ops.forEach((o) => { if (o.t === 'num' && o.key && o.auto !== false && col[+o.n] && o.c !== col[+o.n]) { o.c = col[+o.n]; changed = true; } });
  return changed;
}
/** Shapes for a mark, shared by the on-screen SVG and the saved image. */
export function crossPath(o: { x: number; y: number; r: number }) { const r = o.r * 0.8; return `M${o.x - r} ${o.y - r}L${o.x + r} ${o.y + r}M${o.x + r} ${o.y - r}L${o.x - r} ${o.y + r}`; }
export function tickPath(o: { x: number; y: number; r: number }) { const r = o.r; return `M${o.x - r * 0.85} ${o.y}L${o.x - r * 0.25} ${o.y + r * 0.65}L${o.x + r * 0.9} ${o.y - r * 0.75}`; }
export function warnPath(o: { x: number; y: number; r: number }) { const r = o.r * 1.15; return `M${o.x} ${o.y - r}L${o.x + r * 0.95} ${o.y + r * 0.7}L${o.x - r * 0.95} ${o.y + r * 0.7}Z`; }
export function penPath(pts: Pt[]) { return pts.map((q, i) => `${i ? 'L' : 'M'}${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join(''); }
export function arrowParts(a: Pt, b: Pt, w: number) {
  const ang = Math.atan2(b.y - a.y, b.x - a.x), hl = w * 4.5;
  return {
    shaft: `M${a.x} ${a.y}L${b.x - Math.cos(ang) * hl * 0.6} ${b.y - Math.sin(ang) * hl * 0.6}`,
    head: `M${b.x} ${b.y}L${b.x - hl * Math.cos(ang - 0.45)} ${b.y - hl * Math.sin(ang - 0.45)}L${b.x - hl * Math.cos(ang + 0.45)} ${b.y - hl * Math.sin(ang + 0.45)}Z`,
  };
}
/** The distance from p to the segment a-b. */
function segDist(p: Pt, a: Pt, b: Pt) {
  const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l)) : 0;
  return Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y);
}
/** A hand-drawn line made into straight lines (Andy, 19 Nov 2026: "the option to default the drawn lines to straight
 *  lines"): only the corners further than tol from a straight run are kept (Ramer-Douglas-Peucker). */
export function straighten(pts: Pt[], tol: number): Pt[] {
  if (pts.length < 3) return pts.slice();
  const keep = pts.map((_, i) => i === 0 || i === pts.length - 1);
  const todo: [number, number][] = [[0, pts.length - 1]];
  while (todo.length) {
    const [a, b] = todo.pop() as [number, number];
    let far = -1, fd = tol;
    for (let i = a + 1; i < b; i++) { const d = segDist(pts[i], pts[a], pts[b]); if (d > fd) { fd = d; far = i; } }
    if (far > 0) { keep[far] = true; todo.push([a, far], [far, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
/** An area drawn round, as its outline: straightened if asked, the end dropped when it comes back to the start.
 *  null when it isn't an area (fewer than 3 corners, or too thin to see). */
export function hatchShape(pts: Pt[], tol: number, straight: boolean): Pt[] | null {
  let q = straight ? straighten(pts, tol) : pts.slice();
  if (q.length > 3 && Math.hypot(q[q.length - 1].x - q[0].x, q[q.length - 1].y - q[0].y) < tol * 2.5) q = q.slice(0, -1);
  if (q.length < 3) return null;
  let a2 = 0;
  q.forEach((p, i) => { const n = q[(i + 1) % q.length]; a2 += p.x * n.y - n.x * p.y; });
  return Math.abs(a2) / 2 > tol * tol * 4 ? q : null;
}
/** The gap between hatching lines, and their thickness, for an outline w thick. */
export const hatchGap = (w: number) => Math.max(10, w * 3.5);
export const hatchWidth = (w: number) => Math.max(2, w * 0.55);
/** Diagonal hatching inside an area (45°, like a drawing's hatch), as straight pieces, so the screen and the saved
 *  picture draw it the same way. Even-odd: a shape that crosses itself is hatched where a drawing would be. */
export function hatchLines(poly: Pt[], gap: number): [Pt, Pt][] {
  if (poly.length < 3 || !(gap > 0)) return [];
  const c = Math.SQRT1_2, s = Math.SQRT1_2;
  const r = poly.map((p) => ({ x: p.x * c + p.y * s, y: -p.x * s + p.y * c }));
  const ys = r.map((p) => p.y), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const out: [Pt, Pt][] = [];
  for (let y = y0 + gap / 2, n = 0; y < y1 && n < 3000; y += gap, n++) {
    const xs: number[] = [];
    r.forEach((a, i) => { const b = r[(i + 1) % r.length]; if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) xs.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y)); });
    xs.sort((m, k) => m - k);
    for (let i = 0; i + 1 < xs.length; i += 2) out.push([{ x: xs[i] * c - y * s, y: xs[i] * s + y * c }, { x: xs[i + 1] * c - y * s, y: xs[i + 1] * s + y * c }]);
  }
  return out;
}
/** The hatching as one SVG / Path2D path. */
export const hatchPath = (poly: Pt[], w: number) => hatchLines(poly, hatchGap(w)).map(([a, b]) => `M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}`).join('');
/** Is p inside the area (even-odd)? */
export function insideShape(poly: Pt[], p: Pt): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
export const numFont = (o: { n: number; r: number }) => { const s = String(o.n); return Math.round(o.r * (s.length > 2 ? 0.85 : s.length > 1 ? 1.05 : 1.2)); };

/** The number / symbol / text under a point, or -1 (498 plmHit). Pen lines, arrows and circles aren't picked up. */
export function hitMark(ops: MarkOp[], p: Pt, minReach: number): number {
  let best = -1, bd = Infinity;
  ops.forEach((o, i) => {
    if ('pts' in o) return;
    let d: number, reach: number;
    if (o.t === 'text') {
      const w = (o.s || '').length * o.fs * 0.6;
      const inside = p.x >= o.x - o.fs * 0.3 && p.x <= o.x + w + o.fs * 0.3 && Math.abs(p.y - o.y) <= o.fs * 0.8;
      d = inside ? 0 : Infinity; reach = 1;
    } else { d = Math.hypot(o.x - p.x, o.y - p.y); reach = Math.max(o.r * 1.25, minReach); }
    if (d < reach && d < bd) { bd = d; best = i; }
  });
  return best;
}
/** A mark made bigger / smaller (498 plmScaleSel), kept within sensible limits for a drawing W wide. */
/** The pen line, arrow or circle nearest a point (within reach), or -1 — for the Select tool. */
export function hitStroke(ops: MarkOp[], p: Pt, reach: number): number {
  const seg = (a: Pt, b: Pt) => {
    const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy;
    const t = l ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l)) : 0;
    return Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y);
  };
  let best = -1, bd = Infinity;
  ops.forEach((o, i) => {
    if (!('pts' in o) || !o.pts.length) return;
    let d = o.pts.length === 1 ? Math.hypot(o.pts[0].x - p.x, o.pts[0].y - p.y) : Infinity;
    for (let j = 1; j < o.pts.length; j++) d = Math.min(d, seg(o.pts[j - 1], o.pts[j]));
    if (o.t === 'ring' && o.pts.length > 1) {
      // A circle fills the box between its first and last points; pressing on or inside it counts.
      const b = ringBox(o.pts[0], o.pts[o.pts.length - 1]);
      if (Math.abs(p.x - b.cx) <= b.rx + reach && Math.abs(p.y - b.cy) <= b.ry + reach) d = 0;
    }
    // A hatched area: its closing edge, and pressing inside it, count.
    if (o.t === 'hatch' && o.pts.length > 2) { d = Math.min(d, seg(o.pts[o.pts.length - 1], o.pts[0])); if (insideShape(o.pts, p)) d = 0; }
    if (d <= Math.max(reach, o.w) && d < bd) { bd = d; best = i; }
  });
  return best;
}
/** A mark moved by (dx, dy). */
export function shiftMark(o: MarkOp, dx: number, dy: number): MarkOp {
  if ('pts' in o) return { ...o, pts: o.pts.map((q) => ({ x: q.x + dx, y: q.y + dy })) };
  return { ...o, x: o.x + dx, y: o.y + dy };
}
export function scaleMark(o: MarkOp, f: number, W: number): MarkOp {
  if (o.t === 'text') return { ...o, fs: Math.max(8, Math.min(W / 4, o.fs * f)) };
  if ('r' in o) return { ...o, r: Math.max(6, Math.min(W / 6, o.r * f)) };
  return { ...o, w: Math.max(2, Math.min(W / 40, o.w * f)) };
}
