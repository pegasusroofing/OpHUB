// Signed-document PDFs (500 drawSignatureTablePages, 600 ramsLayout*, 610
// stampRamsSignLayout / buildSignedRamsPdfBytes, 620 COSHH): the original file,
// signatures stamped into its own sign-off boxes when the document has them,
// and a "Signature Record" table at the end for anyone without a box.
import { drawFit, fetchBytes, INK, PDFDocument, rgb, safe, SLATE, StandardFonts, wrap, type PDFImage } from '@/lib/pdf';
import { publicUrl } from '@/lib/privateFiles';

export type Signer = { name: string; plainName: string; dateText: string; when: string; imagePath: string | null; issued?: boolean; label?: string; blank?: boolean; pmImagePath?: string | null; slot?: number };
type Box = { p: number; w: string; t: string; r: number[] };
export type SignLayout = { boxes?: Box[]; tables?: { page: number; rows?: number; step?: number; name?: number[]; sig?: number[]; date?: number[] }[] } | null;

export const boxClientNum = (w: string) => { const m = /^client(\d*)$/.exec(String(w)); return m ? parseInt(m[1], 10) || 1 : 0; };
const boxOpNum = (w: string) => { const m = /^op(\d+)$/.exec(String(w)); return m ? parseInt(m[1], 10) : 0; };
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

async function sigImage(doc: PDFDocument, cache: Map<string, Promise<PDFImage | null>>, path: string | null | undefined) {
  if (!path) return null;
  if (!cache.has(path)) cache.set(path, (async () => { const b = await fetchBytes(publicUrl('signatures', path)); if (!b) return null; try { return await doc.embedPng(b); } catch { try { return await doc.embedJpg(b); } catch { return null; } } })());
  return cache.get(path) as Promise<PDFImage | null>;
}

/** Stamps names, signatures and dates into the document's own boxes; returns how many operatives had no box. */
export async function stampSignLayout(doc: PDFDocument, layout: SignLayout, people: { ops: Signer[]; pm: Signer | null; clients: Record<number, Signer> }): Promise<number> {
  const font = await doc.embedFont(StandardFonts.Helvetica), italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const pages = doc.getPages(), cache = new Map<string, Promise<PDFImage | null>>();
  const personFor = (w: string) => { const cn = boxClientNum(w); return cn ? people.clients[cn] || null : w === 'pm' ? people.pm : people.ops[boxOpNum(w) - 1] || null; };
  for (const b of layoutBoxes(layout)) {
    const s = personFor(b.w); if (!s) continue;
    const page = pages[b.p - 1]; if (!page) continue;
    const { width: W, height: H } = page.getSize();
    const r = { x: b.r[0] * W, y: H - b.r[1] * H - b.r[3] * H, w: b.r[2] * W, h: b.r[3] * H };
    const textIn = (text: string, f: typeof font) => { const size = Math.max(6, Math.min(11, r.h * 0.55)); drawFit(page, text, { x: r.x + 3, y: r.y + (r.h - size) / 2 + 1, size, font: f, color: INK, maxWidth: r.w - 6 }, 5); };
    if (b.t === 'name') textIn(s.plainName, font);
    else if (b.t === 'date') textIn(s.dateText, font);
    else {
      const img = await sigImage(doc, cache, s.imagePath);
      if (img) { const d = img.scale(1), sc = Math.min((r.w * 0.92) / d.width, (r.h * 0.9) / d.height), w = d.width * sc, h = d.height * sc; page.drawImage(img, { x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, width: w, height: h }); }
      else textIn(s.plainName, italic);
    }
  }
  return Math.max(0, people.ops.length - layoutSlots(layout));
}

/** "Signature Record" pages: Name / Signature / Date boxes, issued-by row shaded, optional blank rows and Conducted by. */
export async function drawSignatureTable(doc: PDFDocument, o: { title: string; disclaimer: string; signers: Signer[]; minBlank?: number; conductedBy?: { name: string; signaturePath: string | null } }) {
  const bold = await doc.embedFont(StandardFonts.HelveticaBold), reg = await doc.embedFont(StandardFonts.Helvetica);
  const RED = rgb(0.784, 0.063, 0.18), BOXLINE = rgb(0.62, 0.63, 0.66), HEADBG = rgb(0.95, 0.94, 0.91);
  const PAGE_W = 595.28, PAGE_H = 841.89, MARGIN = 50, TABLE_W = PAGE_W - 2 * MARGIN, COL_NAME = 160, COL_SIG = 205, ROW_H = 46, HEADER_H = 24;
  const cache = new Map<string, Promise<PDFImage | null>>();
  let page = doc.addPage([PAGE_W, PAGE_H]), y = 0;
  const vlines = (top: number, h: number) => {
    [MARGIN, MARGIN + COL_NAME, MARGIN + COL_NAME + COL_SIG, MARGIN + TABLE_W].forEach((x) => page.drawLine({ start: { x, y: top }, end: { x, y: top - h }, thickness: 0.6, color: BOXLINE }));
  };
  const header = () => {
    page.drawRectangle({ x: MARGIN, y: y - HEADER_H, width: TABLE_W, height: HEADER_H, color: HEADBG });
    page.drawText('Name', { x: MARGIN + 10, y: y - HEADER_H + 7, size: 9.5, font: bold, color: INK });
    page.drawText('Signature', { x: MARGIN + COL_NAME + 10, y: y - HEADER_H + 7, size: 9.5, font: bold, color: INK });
    page.drawText('Date', { x: MARGIN + COL_NAME + COL_SIG + 10, y: y - HEADER_H + 7, size: 9.5, font: bold, color: INK });
    page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + TABLE_W, y }, thickness: 0.6, color: BOXLINE });
    page.drawLine({ start: { x: MARGIN, y: y - HEADER_H }, end: { x: MARGIN + TABLE_W, y: y - HEADER_H }, thickness: 1, color: INK });
    vlines(y, HEADER_H);
    y -= HEADER_H;
  };
  const start = (continued: boolean) => {
    if (continued) page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - 60;
    page.drawText(`Signature Record${continued ? ' (continued)' : ''}`, { x: MARGIN, y, size: 18, font: bold, color: RED });
    y -= 8; page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1.5, color: INK }); y -= 24;
    drawFit(page, o.title, { x: MARGIN, y, size: 12, font: bold, color: INK, maxWidth: TABLE_W }); y -= 20;
    if (!continued) { wrap(safe(o.disclaimer), reg, 9.5, TABLE_W).forEach((l) => { page.drawText(l, { x: MARGIN, y, size: 9.5, font: reg, color: SLATE }); y -= 13; }); y -= 12; }
    header();
  };
  start(false);
  const rows = o.signers.slice();
  if (o.minBlank) { const used = rows.filter((r) => !r.blank).length, fit = Math.max(0, Math.floor((y - 110) / ROW_H) - used); for (let i = 0; i < Math.max(o.minBlank, fit); i++) rows.push({ blank: true } as Signer); }
  for (const s of rows) {
    if (y - ROW_H < 70) start(true);
    const top = y;
    if (s.issued) { page.drawRectangle({ x: MARGIN, y: top - ROW_H, width: TABLE_W, height: ROW_H, color: HEADBG }); page.drawLine({ start: { x: MARGIN, y: top }, end: { x: MARGIN + TABLE_W, y: top }, thickness: 1, color: INK }); }
    page.drawLine({ start: { x: MARGIN, y: top - ROW_H }, end: { x: MARGIN + TABLE_W, y: top - ROW_H }, thickness: 0.6, color: BOXLINE });
    vlines(top, ROW_H);
    if (s.blank) { y = top - ROW_H; continue; }
    if (s.issued) {
      page.drawText(s.label || 'ISSUED BY:', { x: MARGIN + 10, y: top - ROW_H / 2 + 5, size: 8, font: bold, color: SLATE });
      drawFit(page, s.name.replace(/^ISSUED BY: /, ''), { x: MARGIN + 10, y: top - ROW_H / 2 - 8, size: 10, font: bold, color: INK, maxWidth: COL_NAME - 16 });
    } else drawFit(page, s.name, { x: MARGIN + 10, y: top - ROW_H / 2 - 4, size: 10, font: reg, color: INK, maxWidth: COL_NAME - 16 });
    const img = await sigImage(doc, cache, s.imagePath);
    if (img) { const d = img.scale(1), sc = Math.min((COL_SIG - 20) / d.width, 30 / d.height), w = d.width * sc, h = d.height * sc; page.drawImage(img, { x: MARGIN + COL_NAME + 10, y: top - ROW_H / 2 - h / 2, width: w, height: h }); }
    drawFit(page, s.when, { x: MARGIN + COL_NAME + COL_SIG + 10, y: top - ROW_H / 2 - 4, size: 9.5, font: reg, color: SLATE, maxWidth: TABLE_W - COL_NAME - COL_SIG - 16 });
    y = top - ROW_H;
  }
  y -= 16;
  if (o.conductedBy) {
    if (y - 40 < 70) start(true);
    page.drawRectangle({ x: MARGIN, y: y - 40, width: TABLE_W, height: 40, color: HEADBG });
    drawFit(page, `Conducted by: ${o.conductedBy.name}`, { x: MARGIN + 10, y: y - 16, size: 10.5, font: bold, color: INK, maxWidth: TABLE_W - 20 });
    const img = await sigImage(doc, cache, o.conductedBy.signaturePath);
    if (img) { const d = img.scale(1), sc = Math.min(120 / d.width, 22 / d.height); page.drawImage(img, { x: MARGIN + 10, y: y - 32, width: d.width * sc, height: d.height * sc }); }
    y -= 54;
  }
  if (y < 60) start(true);
  page.drawText(safe(`Generated ${new Date().toLocaleString('en-GB')} — original document pages are unmodified above.`), { x: MARGIN, y, size: 8.5, font: reg, color: SLATE });
}

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtWhen = (d: string) => new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
/** A signature row (operative, or a manager's "issued by" line). */
export const signerRow = (name: string, signedAt: string, imagePath: string | null, issued = false): Signer => ({
  plainName: name, issued, dateText: fmtDate(signedAt), name: (issued ? 'ISSUED BY: ' : '') + name, when: fmtWhen(signedAt), imagePath, pmImagePath: issued ? imagePath : null,
});
export const clientRow = (slot: number, name: string, signedAt: string, imagePath: string | null): Signer => ({
  slot, plainName: name, issued: false, dateText: fmtDate(signedAt), name: `${name} (Client${slot > 1 ? ` ${slot}` : ''})`, when: fmtWhen(signedAt), imagePath,
});

/** The original PDF + stamped boxes + summary table, as the current app builds it. */
export async function buildSignedDocPdf(src: Uint8Array, o: { title: string; disclaimer: string; layout: SignLayout; signers: Signer[]; clients: Signer[] }) {
  const doc = await PDFDocument.load(src, { ignoreEncryption: true });
  const signers = o.signers.slice().sort((a, b) => (b.issued ? 1 : 0) - (a.issued ? 1 : 0));
  let needSummary = true;
  if (layoutBoxes(o.layout).length) {
    const ops = signers.filter((x) => !x.issued), mgr0 = signers.find((x) => x.issued) || null;
    const mgr = mgr0 ? { ...mgr0, imagePath: mgr0.pmImagePath ?? null } : null;
    const clients: Record<number, Signer> = {}; o.clients.forEach((c) => { clients[c.slot || 1] = c; });
    const unplaced = await stampSignLayout(doc, o.layout, { ops, pm: mgr, clients });
    needSummary = unplaced > 0 || (!!mgr && !layoutHas(o.layout, 'pm')) || o.clients.some((c) => (c.slot || 1) > layoutClients(o.layout));
  }
  if (needSummary) await drawSignatureTable(doc, { title: o.title, disclaimer: o.disclaimer, signers: signers.concat(o.clients) });
  return doc;
}
