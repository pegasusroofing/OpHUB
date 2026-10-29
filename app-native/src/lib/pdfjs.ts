// pdf.js, loaded from cdnjs on the web (office laptop) only — for drawing a
// PDF page (signature boxes) and reading a PDF's own text (work orders).
// Phones don't load it.
type TextItem = { str: string; transform: number[] };
type PdfPage = {
  getViewport: (o: { scale: number }) => { width: number; height: number };
  render: (o: object) => { promise: Promise<void> };
  getTextContent: () => Promise<{ items: TextItem[] }>;
};
export type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPage> };
export type PdfJs = { getDocument: (o: { data: Uint8Array }) => { promise: Promise<PdfDoc> }; GlobalWorkerOptions: { workerSrc: string } };

const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
let pdfjsLoad: Promise<PdfJs | null> | null = null;
export function loadPdfJs(): Promise<PdfJs | null> {
  const w = globalThis as unknown as { pdfjsLib?: PdfJs };
  if (w.pdfjsLib) return Promise.resolve(w.pdfjsLib);
  if (typeof document === 'undefined') return Promise.resolve(null);
  if (!pdfjsLoad) pdfjsLoad = new Promise((res) => {
    const s = document.createElement('script'); s.src = `${PDFJS}pdf.min.js`;
    s.onload = () => { if (w.pdfjsLib) w.pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS}pdf.worker.min.js`; res(w.pdfjsLib ?? null); };
    s.onerror = () => { pdfjsLoad = null; res(null); };
    document.head.appendChild(s);
  });
  return pdfjsLoad;
}

/** Each page's text in reading order (top to bottom, left to right), lines split where the row changes — for data sheets. */
export async function pdfPageTexts(bytes: Uint8Array, maxPages = 25): Promise<string[] | null> {
  const lib = await loadPdfJs(); if (!lib) return null;
  try {
    const pdf = await lib.getDocument({ data: bytes }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= Math.min(pdf.numPages, maxPages); i++) {
      const items = (await (await pdf.getPage(i)).getTextContent()).items.filter((t) => t.str && t.transform).map((t) => ({ s: t.str, x: t.transform[4], y: t.transform[5] }));
      items.sort((a, b) => (Math.abs(b.y - a.y) > 3 ? b.y - a.y : a.x - b.x));
      let out = '', lastY: number | null = null;
      items.forEach((t) => { if (lastY !== null && Math.abs(t.y - lastY) > 3) out += '\n'; else if (out && !/[ \n]$/.test(out)) out += ' '; out += t.s; lastY = t.y; });
      pages.push(out);
    }
    return pages;
  } catch { return null; }
}

/** A PDF's text, one line per row on the page (top to bottom), or null when it can't be read (a scan has no text). */
export async function pdfLines(bytes: Uint8Array): Promise<string[] | null> {
  const lib = await loadPdfJs(); if (!lib) return null;
  try {
    const pdf = await lib.getDocument({ data: bytes }).promise;
    const lines: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const { items } = await (await pdf.getPage(i)).getTextContent();
      const byY: Record<number, string[]> = {};
      items.forEach((it) => { const y = Math.round(it.transform[5]); (byY[y] = byY[y] || []).push(it.str); });
      Object.keys(byY).map(Number).sort((a, b) => b - a).forEach((y) => { const t = byY[y].join(' ').replace(/\s+/g, ' ').trim(); if (t) lines.push(t); });
    }
    return lines.length ? lines : null;
  } catch { return null; }
}

/** A PDF drawing's pages as JPEG data URLs, 3600px on the long side — the first 10 only (each is a big image in memory). */
export async function pdfPageImages(bytes: Uint8Array, maxPages = 10): Promise<{ images: string[]; total: number } | null> {
  const lib = await loadPdfJs(); if (!lib) return null;
  try {
    const pdf = await lib.getDocument({ data: bytes }).promise;
    const images: string[] = [];
    for (let i = 1; i <= Math.min(pdf.numPages, maxPages); i++) {
      const page = await pdf.getPage(i);
      const v1 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: 3600 / Math.max(v1.width, v1.height) });
      const cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
      const ctx = cv.getContext('2d'); if (!ctx) break;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      images.push(cv.toDataURL('image/jpeg', 0.88)); cv.width = cv.height = 0;
    }
    return { images, total: pdf.numPages };
  } catch { return null; }
}
