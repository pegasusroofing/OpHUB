// Drawing mark-up (498 planMarkup): the marks, in the same shape the current
// app saves them (<id>__ops), in pixels of the drawing scaled to at most
// 3600 on its long side — so a drawing marked in either app re-opens in the
// other. Pure: sizes, numbering, hit-testing, colours following the condition.
export type Pt = { x: number; y: number };
export type MarkOp =
  | { t: 'num'; n: number; c: string; r: number; x: number; y: number; key?: boolean; auto?: boolean }
  | { t: 'cross' | 'tick' | 'warn'; c: string; r: number; x: number; y: number }
  | { t: 'text'; c: string; fs: number; s: string; x: number; y: number }
  | { t: 'pen' | 'arrow' | 'ring'; c: string; w: number; pts: Pt[] };
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
export const MARK_SIZES = { xs: 0.45, s: 0.7, m: 1, l: 1.45 } as const;
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
    const d = 'pts' in o ? Math.min(...o.pts.map((q) => Math.hypot(q.x - p.x, q.y - p.y))) : Math.hypot(o.x - p.x, o.y - p.y);
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
export const numFont = (o: { n: number; r: number }) => { const s = String(o.n); return Math.round(o.r * (s.length > 2 ? 0.85 : s.length > 1 ? 1.05 : 1.2)); };
