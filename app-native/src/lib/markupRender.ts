// Draws a drawing with its marks into a JPEG (498 planRenderOps / plmDrawOp),
// full size (up to 3600px), on the office laptop (web). Phones snapshot the
// editor instead. Also used to re-colour numbers when a condition changes.
import { arrowParts, haloOf, isLight, markCanvas, numFont, type MarkOp } from '@/lib/rules/markup';

const FONT = '-apple-system, Segoe UI, Roboto, Arial, sans-serif';
async function loadImg(src: string): Promise<HTMLImageElement> {
  let url = src, obj: string | null = null;
  if (!/^data:|^blob:/.test(src)) { const r = await fetch(src, { cache: 'no-store' }); if (!r.ok) throw new Error(`drawing ${r.status}`); obj = url = URL.createObjectURL(await r.blob()); }
  try { return await new Promise((ok, bad) => { const im = new window.Image(); im.onload = () => ok(im); im.onerror = () => bad(new Error('img')); im.src = url; }); }
  finally { if (obj) setTimeout(() => URL.revokeObjectURL(obj as string), 4000); }
}
function drawOp(ctx: CanvasRenderingContext2D, o: MarkOp) {
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const halo = haloOf(o.c);
  if (o.t === 'num') {
    ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.fillStyle = o.c; ctx.fill();
    ctx.lineWidth = Math.max(3, o.r * 0.16); ctx.strokeStyle = halo; ctx.stroke();
    const fs = numFont(o); ctx.font = `bold ${fs}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = isLight(o.c) ? '#111' : '#fff'; ctx.fillText(String(o.n), o.x, o.y + fs * 0.04);
  } else if (o.t === 'cross' || o.t === 'tick') {
    const r = o.r;
    const path = () => { ctx.beginPath(); if (o.t === 'cross') { ctx.moveTo(o.x - r * 0.8, o.y - r * 0.8); ctx.lineTo(o.x + r * 0.8, o.y + r * 0.8); ctx.moveTo(o.x + r * 0.8, o.y - r * 0.8); ctx.lineTo(o.x - r * 0.8, o.y + r * 0.8); } else { ctx.moveTo(o.x - r * 0.85, o.y); ctx.lineTo(o.x - r * 0.25, o.y + r * 0.65); ctx.lineTo(o.x + r * 0.9, o.y - r * 0.75); } ctx.stroke(); };
    ctx.lineWidth = r * 0.5; ctx.strokeStyle = halo; path(); ctx.lineWidth = r * 0.3; ctx.strokeStyle = o.c; path();
  } else if (o.t === 'warn') {
    const r = o.r * 1.15;
    ctx.beginPath(); ctx.moveTo(o.x, o.y - r); ctx.lineTo(o.x + r * 0.95, o.y + r * 0.7); ctx.lineTo(o.x - r * 0.95, o.y + r * 0.7); ctx.closePath();
    ctx.fillStyle = o.c; ctx.fill(); ctx.lineWidth = Math.max(3, r * 0.14); ctx.strokeStyle = halo; ctx.stroke();
    ctx.font = `bold ${Math.round(r * 1.05)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = isLight(o.c) ? '#111' : '#fff'; ctx.fillText('!', o.x, o.y + r * 0.18);
  } else if (o.t === 'text') {
    ctx.font = `bold ${o.fs}px ${FONT}`; ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(3, o.fs / 5); ctx.strokeStyle = halo; ctx.strokeText(o.s, o.x, o.y); ctx.fillStyle = o.c; ctx.fillText(o.s, o.x, o.y);
  } else if ('pts' in o) {
    ctx.strokeStyle = o.c; ctx.fillStyle = o.c; ctx.lineWidth = o.w;
    if (o.t === 'pen') { ctx.beginPath(); ctx.moveTo(o.pts[0].x, o.pts[0].y); o.pts.forEach((q) => ctx.lineTo(q.x, q.y)); ctx.stroke(); }
    else if (o.pts[1]) { const a = arrowParts(o.pts[0], o.pts[1], o.w); ctx.stroke(new Path2D(a.shaft)); ctx.fill(new Path2D(a.head)); }
  }
  ctx.restore();
}
/** The drawing with its marks drawn in, as a JPEG data URL (web only; null elsewhere). */
export async function renderMarked(src: string, ops: MarkOp[]): Promise<string | null> {
  if (typeof document === 'undefined') return null;
  const img = await loadImg(src);
  const { W, H } = markCanvas(img.naturalWidth, img.naturalHeight);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d'); if (!ctx) return null;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.drawImage(img, 0, 0, W, H);
  ops.forEach((o) => drawOp(ctx, o));
  const out = cv.toDataURL('image/jpeg', 0.86); cv.width = cv.height = 0;
  return out;
}
