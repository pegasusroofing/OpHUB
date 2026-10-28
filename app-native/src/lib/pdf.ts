// PDF helpers shared by every export (ports of the current app's pdf* helpers in
// 500-snagging / 030): brand colour, fit-to-width titles, word wrap, fetching
// images (private buckets go through signed links), the file name, and handing
// the finished PDF to the person — share sheet on phones, download on the web.
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import { Platform } from 'react-native';

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
  return String(t ?? '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...').replace(/[^\x20-\x7E\xA0-\xFF\n]/g, '');
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
export async function embedImage(doc: PDFDocument, bytes: Uint8Array | null): Promise<PDFImage | null> {
  if (!bytes) return null;
  try { return await doc.embedPng(bytes); } catch { try { return await doc.embedJpg(bytes); } catch { return null; } }
}
export const storageImage = async (doc: PDFDocument, bucket: string, path: string | null | undefined) => (path ? embedImage(doc, await fetchBytes(publicUrl(bucket, path))) : null);

/** Hands the PDF to the person: share sheet on a phone, a download on the web. */
export async function deliverPdf(bytes: Uint8Array, filename: string): Promise<boolean> {
  try {
    if (Platform.OS === 'web') {
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
      const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return true;
    }
    const f = new File(Paths.cache, filename);
    if (f.exists) f.delete();
    f.create(); f.write(bytes);
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(f.uri, { mimeType: 'application/pdf', dialogTitle: filename, UTI: 'com.adobe.pdf' });
    return true;
  } catch { return false; }
}
