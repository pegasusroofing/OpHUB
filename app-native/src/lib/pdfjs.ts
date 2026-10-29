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
