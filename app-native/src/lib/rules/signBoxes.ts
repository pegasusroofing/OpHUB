// Signature-box editor rules (600): who each box is for and its colour, the
// summary line, copying one operative's boxes to the next row, and lining
// boxes up. Boxes are {p, w, t, r:[x,y,w,h]} — p the 1-based page, r in
// fractions of the page from the top-left. Pure.
export type SBox = { p: number; w: string; t: string; r: number[] };
export const BOX_WHAT = [{ key: 'sig', label: 'Signature' }, { key: 'name', label: 'Name' }, { key: 'date', label: 'Date' }];
export const MAX_OPS = 40;
const OP_COLORS = ['#1F9D62', '#2F6FB3', '#0E8C8C', '#455A64', '#7A8B00', '#1B7FA6', '#2E7D32', '#3F51B5', '#00897B', '#37474F', '#558B2F', '#0277BD'];
const CLIENT_COLORS = ['#D9540B', '#C2185B', '#B0740F', '#D32F2F', '#AD5A00', '#B5179E'];
export const clientNum = (w: string) => { const m = /^client(\d*)$/.exec(String(w)); return m ? parseInt(m[1], 10) || 1 : 0; };
export const opNum = (w: string) => { const m = /^op(\d+)$/.exec(String(w)); return m ? parseInt(m[1], 10) : 0; };
export function whoLabel(w: string, short = false) {
  const cn = clientNum(w);
  if (cn) return `Client ${cn}`;
  if (w === 'pm') return short ? 'PM' : 'Project Manager';
  return `${short ? 'Op ' : 'Operative '}${parseInt(String(w).slice(2), 10) || 1}`;
}
export function whoColor(w: string) {
  const cn = clientNum(w);
  if (cn) return CLIENT_COLORS[(cn - 1) % CLIENT_COLORS.length];
  if (w === 'pm') return '#6B3F86';
  return OP_COLORS[(Math.max(1, opNum(w)) - 1) % OP_COLORS.length];
}
export function summary(boxes: SBox[]) {
  if (!boxes.length) return '';
  const ops = boxes.reduce((m, b) => Math.max(m, opNum(b.w)), 0), cl = boxes.reduce((m, b) => Math.max(m, clientNum(b.w)), 0);
  const bits = [ops ? `${ops} operative${ops === 1 ? '' : 's'}` : '', boxes.some((b) => b.w === 'pm') ? 'project manager' : '', cl ? (cl === 1 ? 'client' : `${cl} clients`) : ''].filter(Boolean);
  return `${boxes.length} box${boxes.length === 1 ? '' : 'es'}${bits.length ? ` · ${bits.join(', ')}` : ''}`;
}
const r4 = (n: number) => Math.round(n * 10000) / 10000;
/**
 * The gap to the next operative's row, from a tap on any of their spaces:
 * measured from whichever of this operative's boxes the tap lines up with
 * (same column → straight down, same row → straight across). Null if the tap
 * was on the same space.
 */
export function repeatOffset(mine: SBox[], tx: number, ty: number): { dx: number; dy: number } | null {
  if (!mine.length) return null;
  let anchor = mine[0], best = Infinity;
  mine.forEach((b) => { const s = Math.min(Math.abs(tx - (b.r[0] + b.r[2] / 2)) / b.r[2], Math.abs(ty - (b.r[1] + b.r[3] / 2)) / b.r[3]); if (s < best) { best = s; anchor = b; } });
  let dx = tx - (anchor.r[0] + anchor.r[2] / 2), dy = ty - (anchor.r[1] + anchor.r[3] / 2);
  if (Math.abs(dx) <= anchor.r[2] * 0.6) dx = 0;
  if (Math.abs(dy) <= anchor.r[3] * 0.6) dy = 0;
  return dx || dy ? { dx: r4(dx), dy: r4(dy) } : null;
}
/** Copies this operative's boxes on the page to the next one, shifted; null if they'd land off the page. */
export function repeatBoxes(boxes: SBox[], who: string, page: number, off: { dx: number; dy: number }): { boxes: SBox[]; next: string } | null {
  const n = opNum(who); if (!n || n >= MAX_OPS) return null;
  const next = `op${n + 1}`;
  const moved = boxes.filter((b) => b.w === who && b.p === page).map((b) => ({ p: b.p, w: next, t: b.t, r: [b.r[0] + off.dx, b.r[1] + off.dy, b.r[2], b.r[3]].map(r4) }));
  if (!moved.length || moved.some((b) => b.r[0] + b.r[2] / 2 < 0 || b.r[1] + b.r[3] / 2 < 0 || b.r[0] + b.r[2] / 2 > 1 || b.r[1] + b.r[3] / 2 > 1)) return null;
  moved.forEach((b) => { b.r[0] = Math.max(0, Math.min(1 - b.r[2], b.r[0])); b.r[1] = Math.max(0, Math.min(1 - b.r[3], b.r[1])); });
  return { boxes: boxes.filter((b) => !(b.w === next && b.p === page)).concat(moved), next };
}
/** Lines the selected boxes up with the first one: 'v' same left edge, 'h' same top edge, 'size' same size. */
export function align(boxes: SBox[], sels: number[], how: 'v' | 'h' | 'size'): SBox[] {
  if (sels.length < 2) return boxes;
  const out = boxes.map((b) => ({ ...b, r: b.r.slice() })), ref = out[sels[0]].r;
  sels.slice(1).forEach((k) => {
    const r = out[k].r;
    if (how === 'v') r[0] = Math.max(0, Math.min(1 - r[2], ref[0]));
    else if (how === 'h') r[1] = Math.max(0, Math.min(1 - r[3], ref[1]));
    else { r[2] = Math.min(ref[2], 1 - r[0]); r[3] = Math.min(ref[3], 1 - r[1]); }
  });
  return out;
}
