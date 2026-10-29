// Reading an Excel (.xlsx) file's sheets as rows of cells — for statements and
// Bill of Quantities imports (the current app uses SheetJS). An .xlsx is a zip
// of XML; entries are unzipped with the browser's own DecompressionStream
// (office laptop; also in Node for the tests). Numbers stay numbers.
export type Cell = string | number;

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const DS = (globalThis as unknown as { DecompressionStream?: new (f: string) => TransformStream<Uint8Array, Uint8Array> }).DecompressionStream;
  if (!DS) throw new Error('This device can’t open Excel files — use the office laptop.');
  const out = new Response(new Blob([data as BlobPart]).stream().pipeThrough(new DS('deflate-raw')));
  return new Uint8Array(await out.arrayBuffer());
}
/** Every file in a zip, by name. */
export async function unzip(z: Uint8Array): Promise<Record<string, Uint8Array>> {
  const dv = new DataView(z.buffer, z.byteOffset, z.byteLength);
  let e = z.length - 22;
  while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('Not a zip file');
  const count = dv.getUint16(e + 10, true);
  let p = dv.getUint32(e + 16, true);
  const dec = new TextDecoder(), out: Record<string, Uint8Array> = {};
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = dec.decode(z.subarray(p + 46, p + 46 + nlen));
    const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
    const raw = z.subarray(start, start + csize);
    out[name] = method === 0 ? raw : await inflateRaw(raw);
    p += 46 + nlen + xlen + clen;
  }
  return out;
}
const unesc = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_m, n: string) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&');
const colIndex = (ref: string) => { const l = (ref.match(/^[A-Z]+/) || ['A'])[0]; let n = 0; for (const ch of l) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
const texts = (xml: string) => Array.from(xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)).map((m) => unesc(m[1])).join('');

/** An Excel date serial (days since 30 Dec 1899) as YYYY-MM-DD. */
export const serialDate = (n: number) => new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000).toISOString().slice(0, 10);
/** Which cell styles (s="N") show a date: built-in date formats, or a custom one with d / m / y outside quotes. */
export function dateStyleIds(stylesXml: string): Set<number> {
  const custom: Record<number, string> = {};
  for (const m of stylesXml.matchAll(/<numFmt\b[^>]*>/g)) { const id = Number((m[0].match(/numFmtId="(\d+)"/) || [])[1]), code = unesc((m[0].match(/formatCode="([^"]*)"/) || [])[1] || ''); custom[id] = code; }
  const isDate = (id: number) => (id >= 14 && id <= 22) || (id >= 45 && id <= 47) || (custom[id] != null && /[dmy]/i.test(custom[id].replace(/"[^"]*"|\[[^\]]*\]/g, '')));
  const out = new Set<number>(), xfs = (stylesXml.match(/<cellXfs\b[\s\S]*?<\/cellXfs>/) || [''])[0];
  Array.from(xfs.matchAll(/<xf\b[^>]*>/g)).forEach((m, i) => { if (isDate(Number((m[0].match(/numFmtId="(\d+)"/) || [])[1] || 0))) out.add(i); });
  return out;
}
/** A sheet's XML into rows (gaps filled with ''). With dateStyles, date cells come back as YYYY-MM-DD. */
export function sheetRows(xml: string, shared: string[], dateStyles?: Set<number>): Cell[][] {
  const rows: Cell[][] = [];
  for (const rm of xml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const row: Cell[] = [];
    for (const cm of (rm[1] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1], inner = cm[2] || '';
      const ref = (attrs.match(/\br="([A-Z]+\d+)"/) || [])[1], t = (attrs.match(/\bt="([^"]+)"/) || [])[1], st = Number((attrs.match(/\bs="(\d+)"/) || [])[1] ?? -1);
      const ci = ref ? colIndex(ref) : row.length;
      const v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      let val: Cell = '';
      if (t === 's') val = shared[Number(v)] ?? '';
      else if (t === 'inlineStr') val = texts(inner);
      else if (t === 'str' || t === 'e') val = unesc(v ?? '');
      else if (t === 'b') val = v === '1' ? 'TRUE' : 'FALSE';
      else if (v != null && v !== '' && dateStyles?.has(st) && !Number.isNaN(Number(v))) val = serialDate(Number(v));
      else if (v != null && v !== '') val = Number.isNaN(Number(v)) ? unesc(v) : Number(v);
      while (row.length < ci) row.push('');
      row[ci] = val;
    }
    rows.push(row);
  }
  return rows;
}
/** The workbook's sheets in order, each as rows. */
/** opts.dates: date cells as YYYY-MM-DD instead of Excel serial numbers. */
export async function readXlsx(bytes: Uint8Array, opts?: { dates?: boolean }): Promise<{ name: string; rows: Cell[][] }[]> {
  const f = await unzip(bytes), dec = new TextDecoder();
  const s = (n: string) => (f[n] ? dec.decode(f[n]) : '');
  const shared = Array.from(s('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)).map((m) => texts(m[1]));
  const rels: Record<string, string> = {};
  for (const m of s('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)) { const id = (m[0].match(/Id="([^"]+)"/) || [])[1], tg = (m[0].match(/Target="([^"]+)"/) || [])[1]; if (id && tg) rels[id] = tg.replace(/^\/?xl\//, '').replace(/^\//, ''); }
  const out: { name: string; rows: Cell[][] }[] = [], ds = opts?.dates ? dateStyleIds(s('xl/styles.xml')) : undefined;
  for (const m of s('xl/workbook.xml').matchAll(/<sheet\b[^>]*>/g)) {
    const name = unesc((m[0].match(/name="([^"]*)"/) || [])[1] || 'Sheet'), rid = (m[0].match(/r:id="([^"]+)"/) || [])[1];
    const path = `xl/${rid && rels[rid] ? rels[rid] : `worksheets/sheet${out.length + 1}.xml`}`;
    out.push({ name, rows: sheetRows(s(path), shared, ds) });
  }
  return out;
}
/** CSV text into rows (quoted fields, doubled quotes). */
export function csvRows(text: string): Cell[][] {
  const rows: Cell[][] = []; let row: Cell[] = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { row.push(cur); cur = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; } else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
