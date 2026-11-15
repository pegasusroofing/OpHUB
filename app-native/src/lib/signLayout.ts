// Where a document's own sign-off boxes are (600 ramsLayout*): plain arithmetic on the saved layout, with no PDF
// library, so screens can use it without loading pdf-lib (speed review, 15 Nov 2026). lib/signedPdf.ts re-exports it.
export type Box = { p: number; w: string; t: string; r: number[] };
export type SignLayout = { boxes?: Box[]; tables?: { page: number; rows?: number; step?: number; name?: number[]; sig?: number[]; date?: number[] }[] } | null;

export const boxClientNum = (w: string) => { const m = /^client(\d*)$/.exec(String(w)); return m ? parseInt(m[1], 10) || 1 : 0; };
export const boxOpNum = (w: string) => { const m = /^op(\d+)$/.exec(String(w)); return m ? parseInt(m[1], 10) : 0; };
export function layoutBoxes(layout: SignLayout): Box[] {
  if (!layout) return [];
  if (Array.isArray(layout.boxes)) return layout.boxes.filter((b) => b && b.p && b.w && b.t && Array.isArray(b.r) && b.r.length === 4);
  const out: Box[] = [];
  (Array.isArray(layout.tables) ? layout.tables : []).forEach((t) => {
    if (!t || !t.page) return;
    for (let i = 0; i < (t.rows || 1); i++) {
      if (i > 0 && !t.step) break;
      (['name', 'sig', 'date'] as const).forEach((k) => { const b = t[k]; if (b) out.push({ p: t.page, w: `op${i + 1}`, t: k, r: [b[0], b[1] + i * (t.step || 0), b[2], b[3]] }); });
    }
  });
  return out;
}
export const layoutSlots = (l: SignLayout) => layoutBoxes(l).reduce((m, b) => (/^op\d+$/.test(b.w) ? Math.max(m, parseInt(b.w.slice(2), 10)) : m), 0);
export const layoutHas = (l: SignLayout, who: string) => layoutBoxes(l).some((b) => b.w === who);
export const layoutClients = (l: SignLayout) => layoutBoxes(l).reduce((m, b) => Math.max(m, boxClientNum(b.w)), 0);
