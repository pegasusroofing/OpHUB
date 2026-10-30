// PDF helpers shared by every export (ports of the current app's pdf* helpers in
// 500-snagging / 030): brand colour, fit-to-width titles, word wrap, fetching
// images (private buckets go through signed links), the file name, and handing
// the finished PDF to the person — share sheet on phones, download on the web.
import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as Sharing from 'expo-sharing';
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import { Platform } from 'react-native';

import { offerOneDrive } from '@/lib/oneDriveSave';
import { publicUrl, resolveStorageUrl } from '@/lib/privateFiles';
import { fullSiteAddress } from '@/lib/rules/checkin';

export { PDFDocument, rgb, StandardFonts };
export type { PDFFont, PDFImage, PDFPage };

export const DEFAULT_BRAND1 = '#4E8FD1';
export function hexToRgb(hex: string | null | undefined) {
  const h = (hex || '').replace('#', '');
  if (h.length !== 6) return rgb(0.306, 0.561, 0.82);
  return rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255);
}
export const INK = rgb(0.06, 0.06, 0.07);
export const SLATE = rgb(0.36, 0.37, 0.41);
export const WHITE = rgb(1, 1, 1);
export const OK = rgb(0.2, 0.55, 0.35);

/** "Name, address" unless the address already starts with the name. */
export function siteLabel(site: { name?: string | null; address?: string | null; postcode?: string | null } | null | undefined): string {
  if (!site) return '';
  const name = (site.name || '').trim();
  const addr = fullSiteAddress(site as never) || '';
  if (!addr) return name;
  if (!name) return addr;
  const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '');
  return norm(addr).indexOf(norm(name)) === 0 ? addr : `${name}, ${addr}`;
}

/** "Job - Label - 28-10-26.pdf" */
export function exportFilename(siteName: string | null | undefined, label: string, ext = 'pdf'): string {
  const d = new Date();
  const stamp = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getFullYear()).slice(-2)}`;
  return `${[siteName, label, stamp].filter(Boolean).join(' - ').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim()}.${ext}`;
}

/** One line that must stay on the page: shrink, then shorten with "…". */
export function drawFit(page: PDFPage, text: string, o: { x: number; y: number; size: number; font: PDFFont; color?: ReturnType<typeof rgb>; opacity?: number; maxWidth?: number }, minSize = 8) {
  let t = String(text ?? '');
  const maxW = o.maxWidth ?? page.getWidth() - o.x - 30;
  let size = o.size; const floor = Math.min(size, minSize);
  while (size > floor && o.font.widthOfTextAtSize(t, size) > maxW) size -= 0.5;
  if (o.font.widthOfTextAtSize(t, size) > maxW) {
    while (t.length > 4 && o.font.widthOfTextAtSize(`${t}…`, size) > maxW) t = t.slice(0, -1);
    t = `${t.replace(/[\s,]+$/, '')}…`;
  }
  page.drawText(safe(t), { x: o.x, y: o.y, size, font: o.font, color: o.color, opacity: o.opacity });
}

/** Standard fonts only encode WinAnsi — swap anything else rather than crash. */
export function safe(t: string): string {
  return String(t ?? '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...').replace(/[^\x20-\x7E\xA0-\xFF\n•€™]/g, '');
}

export function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = safe(text).split(/\s+/).filter(Boolean);
  const lines: string[] = []; let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) > maxWidth && cur) { lines.push(cur); cur = w; } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

export async function fetchBytes(url: string | null | undefined): Promise<Uint8Array | null> {
  if (!url) return null;
  try {
    const u = (await resolveStorageUrl(url)) || url;
    const r = await fetch(u);
    return r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
  } catch { return null; }
}
/** A photo shrunk to fit maxSide px (JPEG) so big reports stay small; falls back to the original. */
export async function fetchScaled(url: string | null | undefined, maxSide: number, q: number): Promise<Uint8Array | null> {
  if (!url) return null;
  if (url.startsWith('data:')) { try { return Uint8Array.from(atob(url.split(',')[1]), (c) => c.charCodeAt(0)); } catch { return null; } }
  try {
    const u = (await resolveStorageUrl(url)) || url;
    let img = await ImageManipulator.manipulate(u).renderAsync();
    const sc = Math.min(1, maxSide / Math.max(img.width, img.height));
    if (sc < 1) img = await ImageManipulator.manipulate(u).resize({ width: Math.max(1, Math.round(img.width * sc)) }).renderAsync();
    const out = await img.saveAsync({ compress: q, format: SaveFormat.JPEG, base64: true });
    if (out.base64) return Uint8Array.from(atob(out.base64), (c) => c.charCodeAt(0));
  } catch { /* fall back below */ }
  return fetchBytes(url);
}
export async function embedImage(doc: PDFDocument, bytes: Uint8Array | null): Promise<PDFImage | null> {
  if (!bytes) return null;
  try { return await doc.embedPng(bytes); } catch { try { return await doc.embedJpg(bytes); } catch { return null; } }
}
export const storageImage = async (doc: PDFDocument, bucket: string, path: string | null | undefined) => (path ? embedImage(doc, await fetchBytes(publicUrl(bucket, path))) : null);

/** Hands the PDF to the person: share sheet on a phone, a download on the web; then offers a copy to OneDrive. */
export const deliverPdf = async (bytes: Uint8Array, filename: string) => {
  const ok = await deliverFile(bytes, filename, 'application/pdf', 'com.adobe.pdf');
  if (ok) offerOneDrive({ bytes, filename });
  return ok;
};
/** An Excel file made with lib/rules/xlsx, handed over the same way. */
export const deliverXlsx = (bytes: Uint8Array, filename: string) => deliverFile(bytes, filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'org.openxmlformats.spreadsheetml.sheet');
export async function deliverFile(bytes: Uint8Array, filename: string, mime: string, uti?: string): Promise<boolean> {
  try {
    if (Platform.OS === 'web') {
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
      const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return true;
    }
    const f = new File(Paths.cache, filename);
    if (f.exists) f.delete();
    f.create(); f.write(bytes);
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(f.uri, { mimeType: mime, dialogTitle: filename, UTI: uti });
    return true;
  } catch { return false; }
}

/** Uploads a finished PDF and emails a link to it (send-document-email), as the current app does. */
export async function emailPdf(bytes: Uint8Array, filename: string, folder: string, body: { site_id?: string | null; general_label?: string; recipient_email: string; cc_email?: string; client_cc_email?: string | null; doc_title: string }, contentType = 'application/pdf'): Promise<string | null> {
  if (bytes.length > 49 * 1024 * 1024) return `This PDF is ${Math.round(bytes.length / 1048576)}MB — too big to email (50MB max). Use Export PDF to save it instead.`;
  const id = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}`;
  const path = `${folder}/${id}-${filename.replace(/[^a-z0-9.-]+/gi, '_')}`;
  const { supabase } = await import('@/lib/supabase');
  const up = await supabase.storage.from('mc-documents').upload(path, bytes, { contentType });
  if (up.error) return 'Could not upload the PDF — try again.';
  const r = await supabase.functions.invoke('send-document-email', { body: { ...body, file_url: publicUrl('mc-documents', up.data.path), storage_bucket: 'mc-documents', storage_path: up.data.path } });
  return r.error ? 'Could not send the email — try again.' : null;
}

/** Several PDFs in one email, each its own attachment (700 emailPdfsSeparately): uploaded first, then
 *  send-document-email gets the list (it falls back to links if they're too big to attach). */
export async function emailPdfsSeparately(parts: { bytes: Uint8Array; name: string }[], folder: string, body: { site_id?: string | null; general_label?: string; recipient_email: string; cc_email?: string; client_cc_email?: string | null; doc_title: string }): Promise<string | null> {
  const { supabase } = await import('@/lib/supabase');
  const used = new Set<string>(), files: { url: string; name: string; path: string }[] = [];
  for (const p of parts) {
    const base = String(p.name || 'Document').replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 100) || 'Document';
    let nm = base, k = 2; while (used.has(nm.toLowerCase())) nm = `${base} (${k++})`;
    used.add(nm.toLowerCase());
    const id = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${k}`;
    const up = await supabase.storage.from('mc-documents').upload(`${folder}/${id}-${nm.replace(/[^a-z0-9.-]+/gi, '_')}.pdf`, p.bytes, { contentType: 'application/pdf' });
    if (up.error) return 'Could not upload the PDFs — try again.';
    files.push({ url: publicUrl('mc-documents', up.data.path), name: `${nm}.pdf`, path: up.data.path });
  }
  const r = await supabase.functions.invoke('send-document-email', { body: { ...body, files } });
  const d = r.data as { error?: string } | null;
  return r.error || d?.error ? 'Could not send the email — try again.' : null;
}

/** "Media summary" pages: every photo, four to a page, numbered (500 appendMediaSummaryPages). */
export async function appendMediaSummary(doc: PDFDocument, refs: { bucket?: string; path: string; caption?: string }[], o: { maxDim?: number; quality?: number } = {}) {
  if (!refs.length) return;
  const bold = await doc.embedFont(StandardFonts.HelveticaBold), reg = await doc.embedFont(StandardFonts.Helvetica);
  const HEADBAR = rgb(0.925, 0.91, 0.87), PAGE_W = 595.28, PAGE_H = 841.89, MARGIN = 42, CONTENT_W = PAGE_W - 2 * MARGIN;
  const gutter = 14, capH = 16, headingH = 40, cellW = (CONTENT_W - gutter) / 2, cellH = (PAGE_H - 2 * MARGIN - headingH - gutter - capH * 2) / 2;
  let num = 0;
  for (let i = 0; i < refs.length; i += 4) {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    let y = PAGE_H - MARGIN;
    if (i === 0) { page.drawRectangle({ x: MARGIN, y: y - 26, width: CONTENT_W, height: 26, color: HEADBAR }); page.drawText('Media summary', { x: MARGIN + 10, y: y - 18, size: 11.5, font: bold, color: INK }); y -= 36; } else y -= headingH;
    const group = refs.slice(i, i + 4);
    for (let r = 0; r < 2; r++) {
      const row = group.slice(r * 2, r * 2 + 2); if (!row.length) break;
      const rowTop = y - r * (cellH + capH + gutter);
      for (let c = 0; c < row.length; c++) {
        num++;
        const ref = row[c], cx = MARGIN + c * (cellW + gutter);
        const b = await fetchScaled(publicUrl(ref.bucket || 'site-photos', ref.path), o.maxDim || 1500, o.quality ?? 0.8);
        const img = await embedImage(doc, b);
        if (img) { const d = img.scale(1), sc = Math.min(cellW / d.width, cellH / d.height, 1) * 0.8, w = d.width * sc, h = d.height * sc; page.drawImage(img, { x: cx + (cellW - w) / 2, y: rowTop - cellH + (cellH - h) / 2, width: w, height: h }); }
        else { page.drawRectangle({ x: cx, y: rowTop - cellH, width: cellW, height: cellH, color: HEADBAR }); page.drawText(`Photo ${num} - could not be loaded`, { x: cx + 8, y: rowTop - cellH / 2, size: 9, font: reg, color: SLATE }); }
        page.drawText(safe(`Photo ${num}${ref.caption ? `  ·  ${ref.caption}` : ''}`).slice(0, 90), { x: cx, y: rowTop - cellH - 13, size: 8.5, font: reg, color: SLATE });
      }
    }
  }
}
