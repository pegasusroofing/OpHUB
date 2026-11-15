// Handing a finished file to the person (share sheet on phones, a download on the web, a copy to OneDrive), emailing
// it, and the small helpers every export shares: the file name, the site label, fetching bytes. None of this needs
// the PDF library, so screens can use it without loading pdf-lib (speed review, 15 Nov 2026: pdf-lib was in the
// code every screen downloads at start-up). lib/pdf.ts re-exports all of it for the PDF builders.
import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { chooseAction, showAlert } from '@/components/toast';
import { currentJobId } from '@/lib/navBack';
import { oneDriveSaver, saveToOneDrive } from '@/lib/oneDriveSave';
import { publicUrl, resolveStorageUrl } from '@/lib/privateFiles';
import { fullSiteAddress } from '@/lib/rules/checkin';

export const DEFAULT_BRAND1 = '#4E8FD1';

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

/** Standard fonts only encode WinAnsi — swap anything else rather than crash. */
export function safe(t: string): string {
  return String(t ?? '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...').replace(/[^\x20-\x7E\xA0-\xFF\n•€™]/g, '');
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

/** Hands the PDF to the person: share sheet on a phone, a download on the web; then offers a copy to OneDrive. */
export const deliverPdf = (bytes: Uint8Array, filename: string) => deliverFile(bytes, filename, 'application/pdf', 'com.adobe.pdf');
/** Opens a PDF on screen to read (Andy, 3 Nov 2026): the viewer on the web, the phone's own viewer / share sheet otherwise. */
export async function showPdf(bytes: Uint8Array, filename: string): Promise<boolean> {
  if (Platform.OS !== 'web') return deliverFile(bytes, filename, 'application/pdf', 'com.adobe.pdf', true);
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  setTimeout(() => URL.revokeObjectURL(url), 15 * 60000); // let go once it's long been read
  const { viewDoc } = await import('@/components/DocViewer');
  viewDoc(url, filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
  return true;
}
/** An Excel file made with lib/rules/xlsx, handed over the same way. */
export const deliverXlsx = (bytes: Uint8Array, filename: string, direct?: boolean) => deliverFile(bytes, filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'org.openxmlformats.spreadsheetml.sheet', direct);
/**
 * Hands a finished file over, asking how when there's a choice: save it, share it (WhatsApp, email and the
 * rest of the phone's share menu, as 060 shareFile) or put it in OneDrive. The file is already made, so the
 * share call runs straight from the press, which phones insist on. direct: no question, just download it
 * (the phone's share menu on a phone).
 */
export async function deliverFile(bytes: Uint8Array, filename: string, mime: string, uti?: string, direct?: boolean): Promise<boolean> {
  try {
    const orgId = direct ? null : oneDriveSaver();
    const webFile = Platform.OS === 'web' ? new globalThis.File([bytes as BlobPart], filename, { type: mime }) : null;
    const canShareWeb = !!webFile && !!globalThis.navigator?.canShare?.({ files: [webFile] });
    const items = [
      ...(Platform.OS === 'web' ? [{ key: 'save', label: mime === 'application/pdf' ? '📄 PDF' : '⬇️ Download' }] : []),
      ...(Platform.OS !== 'web' || (canShareWeb && !direct) ? [{ key: 'share', label: '📤 Share (WhatsApp, email…)' }] : []),
      ...(orgId ? [{ key: 'od', label: '☁️ OneDrive' }] : []),
    ];
    const how = items.length > 1 ? await chooseAction(filename, items) : items[0]?.key;
    if (!how) return true;
    if (how === 'od') {
      const err = await saveToOneDrive(orgId, bytes, filename, currentJobId());
      showAlert(err ? `Could not save to OneDrive — ${err}` : 'Saved to OneDrive.');
      return !err;
    }
    if (webFile && how === 'share') {
      // Files only, no title: a title alongside has made iPhones drop the file for some apps (060 files-share-no-title).
      try { await globalThis.navigator.share({ files: [webFile] }); return true; } catch (e) { return (e as Error)?.name === 'AbortError'; }
    }
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
  const said = (r.data as { error?: string } | null)?.error;
  return r.error || said ? (said || 'Could not send the email — try again.') : null;
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
