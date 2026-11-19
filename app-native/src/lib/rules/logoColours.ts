// Company colours from the logo (Andy, 19 Nov 2026: "choosing the companys colours, i want to be able to click to
// choose and then click on the uploaded logo to choose the two colours"). Pure sums: a pixel as a colour code, and
// the logo's main colours (ignoring white / near-white background and see-through pixels).

export const toHex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();

const dist = (a: number[], b: number[]) => Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);

/** The logo's main colours, most used first: pixels grouped into buckets, white-ish background and see-through pixels
 *  left out, and colours too close to one already chosen skipped. rgba: the pixels, four numbers each. */
export function mainColours(rgba: ArrayLike<number>, n = 6): string[] {
  const counts = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2], a = rgba[i + 3];
    if (a < 128) continue; // see-through
    if (r > 215 && g > 215 && b > 215) continue; // white background, and the pale fringe round lettering
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const c = counts.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    c.n += 1; c.r += r; c.g += g; c.b += b; counts.set(key, c);
  }
  const total = [...counts.values()].reduce((t, c) => t + c.n, 0);
  // Specks (under 1% of the logo's coloured pixels) aren't the logo's colours.
  const ranked = [...counts.values()].filter((c) => c.n >= total * 0.01).sort((x, y) => y.n - x.n).map((c) => [c.r / c.n, c.g / c.n, c.b / c.n]);
  const out: number[][] = [];
  for (const c of ranked) {
    if (out.every((o) => dist(o, c) > 48)) out.push(c);
    if (out.length >= n) break;
  }
  return out.map((c) => toHex(c[0], c[1], c[2]));
}

/** Where a tap on a picture shown "contain" in a box lands on the picture itself (null: in the empty margin). */
export function tapToPixel(tapX: number, tapY: number, boxW: number, boxH: number, imgW: number, imgH: number): { x: number; y: number } | null {
  const s = Math.min(boxW / imgW, boxH / imgH), w = imgW * s, h = imgH * s, ox = (boxW - w) / 2, oy = (boxH - h) / 2;
  const x = (tapX - ox) / s, y = (tapY - oy) / s;
  if (x < 0 || y < 0 || x >= imgW || y >= imgH) return null;
  return { x: Math.floor(x), y: Math.floor(y) };
}

/** A palette to choose from, for companies whose logo doesn't give the colour they want. */
export const PALETTE = ['#C62828', '#E53935', '#E3262B', '#EF6C00', '#F9A825', '#FBC02D', '#2E7D32', '#43A047', '#00897B', '#00838F', '#0277BD', '#1565C0',
  '#4E8FD1', '#283593', '#5E35B1', '#6A1B9A', '#AD1457', '#4E342E', '#795548', '#546E7A', '#37474F', '#212121', '#101114', '#9E9E9E'];
