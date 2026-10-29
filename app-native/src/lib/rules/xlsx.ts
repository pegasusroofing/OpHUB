// A small Excel (.xlsx) writer for the exports the current app makes with
// SheetJS / ExcelJS: one or more sheets of rows, a bold title, a shaded header
// row, numbers kept as numbers, column widths. No library needed: an .xlsx is a
// zip of a few XML files, stored uncompressed here. Pure, so it can be tested.
export type XCell = string | number | null | undefined | { v: string | number | null | undefined; s?: 'title' | 'head' | 'bold' | 'money' | 'note' };
export type XSheet = { name: string; rows: XCell[][]; widths?: number[] };

const STYLE: Record<string, number> = { title: 1, head: 2, bold: 3, money: 4, note: 5 };
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const colName = (i: number) => { let s = '', n = i + 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
export const sheetName = (s: string, used: Set<string>) => { const b = (s.replace(/[[\]:*?/\\]/g, ' ').trim() || 'Sheet').slice(0, 31); let n = b, i = 2; while (used.has(n.toLowerCase())) n = `${b.slice(0, 28)} ${i++}`; used.add(n.toLowerCase()); return n; };

function sheetXml(sh: XSheet) {
  const cols = sh.widths?.length ? `<cols>${sh.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
  const rows = sh.rows.map((r, ri) => `<row r="${ri + 1}">${r.map((c, ci) => {
    const o = c != null && typeof c === 'object' ? c : { v: c };
    if (o.v == null || o.v === '') return o.s ? `<c r="${colName(ci)}${ri + 1}" s="${STYLE[o.s]}"/>` : '';
    const ref = `${colName(ci)}${ri + 1}`, s = o.s ? ` s="${STYLE[o.s]}"` : '';
    return typeof o.v === 'number' && Number.isFinite(o.v) ? `<c r="${ref}"${s}><v>${o.v}</v></c>` : `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(String(o.v))}</t></is></c>`;
  }).join('')}</row>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${rows}</sheetData></worksheet>`;
}
const STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
  + '<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;£&quot;#,##0.00;-&quot;£&quot;#,##0.00"/></numFmts>'
  + '<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><i/><sz val="9"/><color rgb="FF7A7A7A"/><name val="Calibri"/></font></fonts>'
  + '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE4E9F0"/></patternFill></fill></fills>'
  + '<borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs>'
  + '<cellXfs count="6"><xf/><xf fontId="1" applyFont="1"/><xf fontId="2" fillId="2" applyFont="1" applyFill="1"/><xf fontId="2" applyFont="1"/><xf numFmtId="164" applyNumberFormat="1"/><xf fontId="3" applyFont="1"/></cellXfs></styleSheet>';

export function xlsxFiles(sheets: XSheet[]): [string, string][] {
  const used = new Set<string>();
  const names = sheets.map((s) => sheetName(s.name, used));
  return [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', STYLES],
    ...sheets.map((s, i): [string, string] => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)]),
  ];
}

let CRC: Uint32Array | null = null;
export function crc32(b: Uint8Array) {
  if (!CRC) { CRC = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; } }
  let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
/** A zip with every file stored (no compression) — enough for Excel. */
export function zipStore(files: [string, Uint8Array][]): Uint8Array {
  const enc = new TextEncoder(), parts: Uint8Array[] = [], central: Uint8Array[] = [];
  let off = 0;
  const d = new Date(), time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2), date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  files.forEach(([name, data]) => {
    const nb = enc.encode(name), crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, time, 2], [12, date, 2], [14, crc, 4], [18, data.length, 4], [22, data.length, 4], [26, nb.length, 2], [28, 0, 2]].forEach(([o, v, n]) => (n === 4 ? h.setUint32(o, v, true) : h.setUint16(o, v, true)));
    const c = new DataView(new ArrayBuffer(46));
    [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, time, 2], [14, date, 2], [16, crc, 4], [20, data.length, 4], [24, data.length, 4], [28, nb.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, off, 4]].forEach(([o, v, n]) => (n === 4 ? c.setUint32(o, v, true) : c.setUint16(o, v, true)));
    parts.push(new Uint8Array(h.buffer), nb, data); central.push(new Uint8Array(c.buffer), nb);
    off += 30 + nb.length + data.length;
  });
  const csize = central.reduce((t, x) => t + x.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  [[0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, files.length, 2], [10, files.length, 2], [12, csize, 4], [16, off, 4], [20, 0, 2]].forEach(([o, v, n]) => (n === 4 ? e.setUint32(o, v, true) : e.setUint16(o, v, true)));
  const all = [...parts, ...central, new Uint8Array(e.buffer)], out = new Uint8Array(all.reduce((t, x) => t + x.length, 0));
  let p = 0; all.forEach((x) => { out.set(x, p); p += x.length; });
  return out;
}
export function makeXlsx(sheets: XSheet[]): Uint8Array {
  const enc = new TextEncoder();
  return zipStore(xlsxFiles(sheets.length ? sheets : [{ name: 'Sheet1', rows: [] }]).map(([n, x]) => [n, enc.encode(x)]));
}
/** The usual export layout: company — title, the date, a blank line, the header row, then the rows. */
export function reportSheet(name: string, title: string, head: string[], rows: XCell[][], widths?: number[], sub?: string): XSheet {
  return { name, widths: widths || head.map((h, i) => (i === 0 ? 28 : Math.max(12, Math.min(40, h.length + 4)))), rows: [[{ v: title, s: 'title' }], [{ v: sub || `Exported ${new Date().toLocaleDateString('en-GB')}`, s: 'note' }], [], head.map((h) => ({ v: h, s: 'head' as const })), ...rows] };
}
