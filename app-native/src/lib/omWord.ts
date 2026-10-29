// O&M manual as a Word file (857 hoExportWord): the same cover, contractor /
// revision table, sections, tables, maintenance and photos as the PDF, with the
// appendix listed (the documents themselves go in the PDF version). Made
// in the app: a .docx is a zip of a few XML files plus the pictures.
import { collectAttachments } from '@/data/omManual';
import { deliverFile, fetchBytes, fetchScaled, PDFDocument } from '@/lib/pdf';
import { publicUrl } from '@/lib/privateFiles';
import { addrLines, contractorRows, contractorSec, omFmtDate, type OmData } from '@/lib/rules/omManual';
import { zipStore } from '@/lib/rules/xlsx';
import type { Organization, Site } from '@/lib/types';

const X = (t: unknown) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
type RunO = { b?: boolean; color?: string; sz?: number };
const run = (t: unknown, o: RunO = {}) => {
  const pr = (o.b ? '<w:b/>' : '') + (o.color ? `<w:color w:val="${o.color}"/>` : '') + (o.sz ? `<w:sz w:val="${o.sz}"/>` : '');
  return String(t ?? '').split('\n').map((l, i) => `<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ''}${i ? '<w:br/>' : ''}<w:t xml:space="preserve">${X(l)}</w:t></w:r>`).join('');
};
const para = (t: unknown, o: RunO & { style?: string; jc?: string } = {}) => {
  const pp = (o.style ? `<w:pStyle w:val="${o.style}"/>` : '') + (o.jc ? `<w:jc w:val="${o.jc}"/>` : '');
  return `<w:p>${pp ? `<w:pPr>${pp}</w:pPr>` : ''}${run(t, o)}</w:p>`;
};

/** A picture's bytes and size (JPEG or PNG), or null. */
async function picture(bytes: Uint8Array | null): Promise<{ bytes: Uint8Array; w: number; h: number; ext: 'jpg' | 'png' } | null> {
  if (!bytes) return null;
  const doc = await PDFDocument.create();
  try { const im = await doc.embedJpg(bytes); return { bytes, w: im.width, h: im.height, ext: 'jpg' }; } catch { /* try PNG */ }
  try { const im = await doc.embedPng(bytes); return { bytes, w: im.width, h: im.height, ext: 'png' }; } catch { return null; }
}

export async function buildOmWord(d: OmData, site: Site, org: Organization | null): Promise<{ bytes: Uint8Array; filename: string }> {
  const c = d.cover || {};
  const brand = String(org?.color_primary || '#8B1A1A').replace('#', '').toUpperCase();
  const media: { name: string; bytes: Uint8Array }[] = [];
  const img = (im: { bytes: Uint8Array; w: number; h: number; ext: string }, maxWcm: number) => {
    const idx = media.length + 1, name = `image${idx}.${im.ext}`; media.push({ name, bytes: im.bytes });
    let cx = Math.round(maxWcm * 360000), cy = Math.round((cx * im.h) / im.w);
    const maxH = Math.round(9 * 360000 * 1.4); if (cy > maxH) { cy = maxH; cx = Math.round((cy * im.w) / im.h); }
    return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${idx}" name="Picture ${idx}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${idx}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImg${idx}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  };
  const photo = async (bucket: string, path: string, max: number) => picture(await fetchScaled(publicUrl(bucket, path), max, 0.82));
  const brk = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  let body = '';
  // page 1
  if (c.header) body += para(c.header, { b: true, jc: 'center', sz: 24 });
  body += para('');
  if (c.coverPhoto) { const im = await photo(c.coverPhoto.bucket, c.coverPhoto.path, 1800); if (im) body += `<w:p>${img(im, 17)}</w:p>`; }
  body += para('') + para('') + para(c.title || 'O&M MANUAL', { sz: 52 }) + para(c.project || '', { sz: 52 });
  addrLines(c.address).forEach((a) => { body += para(a, { b: true, sz: 30 }); });
  if (c.volume) body += para(c.volume, { b: true, sz: 18 });
  body += brk;
  // page 2
  body += para('') + para('');
  const logo = org?.logo_path ? await picture(await fetchBytes(publicUrl('org-logos', org.logo_path))) : null;
  if (logo) body += `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>${img(logo, 7.5)}</w:p>`;
  body += para('') + para('');
  String(c.subtitle || '').split('\n').forEach((l) => { body += para(l, { jc: 'center', sz: 30, color: '1F3A5A' }); });
  body += para('') + para('');
  {
    const G = [3600, 2800, 1500, 1738];
    const bdr = `<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((b) => `<w:${b} w:val="single" w:sz="4" w:color="000000"/>`).join('')}</w:tblBorders>`;
    const tc = (t: string, w: number, span: number, fill?: string, white?: boolean) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''}${fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : ''}<w:vAlign w:val="center"/></w:tcPr><w:p>${run(t, white ? { color: 'FFFFFF', sz: 18 } : { sz: 20 })}</w:p></w:tc>`;
    const bar = (l: string) => `<w:tr>${tc(l, 9638, 4, '17323A', true)}</w:tr>`;
    const row = (cells: string) => `<w:tr><w:trPr><w:trHeight w:val="440"/></w:trPr>${cells}</w:tr>`;
    body += `<w:tbl><w:tblPr><w:tblW w:w="9638" w:type="dxa"/>${bdr}</w:tblPr><w:tblGrid>${G.map((g) => `<w:gridCol w:w="${g}"/>`).join('')}</w:tblGrid>`
      + bar('Contractor Details')
      + contractorRows(d).map((r) => row(tc(String(r[0] || '').trim().replace(/:?$/, ':'), G[0], 1) + tc(r.slice(1).filter(Boolean).join('  '), G[1] + G[2] + G[3], 3))).join('')
      + bar('Revision Details')
      + row(tc('Revision Number:', G[0], 1) + tc(c.revision || '', G[1], 1) + tc('Date:', G[2], 1) + tc(omFmtDate(c.date), G[3], 1))
      + '</w:tbl>';
  }
  body += brk;
  const skip = contractorSec(d);
  for (const s of d.sections) {
    if (s === skip) continue;
    body += para(s.title || '', { style: 'Heading1' });
    if (s.type === 'text') String(s.body || '').split('\n').forEach((l) => { body += para(l); });
    if (s.type === 'maint') (s.items || []).forEach((it) => { if (it.title) body += para(it.title, { b: true }); String(it.text || '').split('\n').forEach((l) => { body += para(l); }); body += para(''); });
    if (s.type === 'table' || s.type === 'materials') {
      const cols = s.columns || [], hasHead = cols.some((h) => String(h || '').trim()), gw = Math.floor(9638 / Math.max(1, cols.length));
      const cell = (t: string, head: boolean) => `<w:tc><w:tcPr><w:tcW w:w="${gw}" w:type="dxa"/>${head ? '<w:shd w:val="clear" w:color="auto" w:fill="EDEDEF"/>' : ''}</w:tcPr><w:p>${run(t, { b: head })}</w:p></w:tc>`;
      body += `<w:tbl><w:tblPr><w:tblW w:w="9638" w:type="dxa"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((b) => `<w:${b} w:val="single" w:sz="4" w:color="B5B5B9"/>`).join('')}</w:tblBorders></w:tblPr><w:tblGrid>${cols.map(() => `<w:gridCol w:w="${gw}"/>`).join('')}</w:tblGrid>`
        + (hasHead ? `<w:tr>${cols.map((h) => cell(h, true)).join('')}</w:tr>` : '')
        + (s.rows || []).map((r) => `<w:tr>${r.map((v, ci) => cell(v, !hasHead && ci === 0)).join('')}</w:tr>`).join('') + '</w:tbl>' + para('');
    }
    if (s.type === 'photos') for (const p of s.photos || []) { const im = await photo(p.bucket, p.path, 1200); if (im) body += `<w:p>${img(im, 12)}</w:p>`; if (p.caption) body += para(p.caption, { color: '5B6070', sz: 18 }); }
  }
  const names = (await collectAttachments(site.id, d)).map((a) => a.name);
  if (names.length) { body += para('Appendices', { style: 'Heading1' }) + para('The following documents accompany this manual (attached in the PDF version):'); names.forEach((n, i) => { body += para(`${i + 1}.  ${n}`); }); }

  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="21"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="56"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="100"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="${brand}"/><w:sz w:val="30"/></w:rPr></w:style></w:styles>`;
  const types = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>';
  const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${media.map((m, i) => `<Relationship Id="rIdImg${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${m.name}"/>`).join('')}</Relationships>`;
  const enc = new TextEncoder();
  const bytes = zipStore([['[Content_Types].xml', enc.encode(types)], ['_rels/.rels', enc.encode(rels)], ['word/_rels/document.xml.rels', enc.encode(docRels)], ['word/document.xml', enc.encode(docXml)], ['word/styles.xml', enc.encode(styles)], ...media.map((m): [string, Uint8Array] => [`word/media/${m.name}`, m.bytes])]);
  return { bytes, filename: `O&M Manual - ${(site.name || 'Project').replace(/[\\/:*?"<>|]+/g, '-')}.docx` };
}
export const deliverDocx = (bytes: Uint8Array, filename: string) => deliverFile(bytes, filename, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'org.openxmlformats.wordprocessingml.document');
