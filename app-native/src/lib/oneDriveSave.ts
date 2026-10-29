// Saving an exported PDF into OneDrive (060 oneDriveUploadBytes / syncPdfViewerDoc): a PDF made inside a
// project goes to that project's folder, a company-wide one to "Company Exports". Small files go in the
// request; bigger ones are put in storage first and the server picks them up (turning a large PDF into
// text on a phone froze it).
import { supabase } from '@/lib/supabase';
import { invokeAsUser } from '@/lib/userFunctions';

const b64 = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
/** null when saved; otherwise what went wrong, in plain words. */
export async function saveToOneDrive(orgId: string | null | undefined, bytes: Uint8Array, filename: string, siteId: string | null): Promise<string | null> {
  try {
    const payload: Record<string, unknown> = { filename, ...(siteId ? { site_id: siteId } : { subfolder: 'Company Exports' }) };
    if (bytes.length > 3 * 1024 * 1024 && orgId) {
      const rid = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}`;
      const up = await supabase.storage.from('mc-documents').upload(`onedrive-tmp/${orgId}/${rid}-${filename.replace(/[^a-z0-9.-]+/gi, '_')}`, bytes, { contentType: 'application/pdf' });
      if (up.error) return 'could not upload the file';
      payload.storage_path = up.data.path;
    } else payload.content_base64 = b64(bytes);
    const r = await invokeAsUser<{ ok?: boolean }>('onedrive-upload', payload);
    if (!r.error) return null;
    return r.error === 'not_connected' ? 'OneDrive isn’t connected yet — connect it in Settings first.' : r.error;
  } catch (e) { return (e as Error)?.message || 'check your connection and try again'; }
}

// The last PDF handed over, so the "Save to OneDrive" bar can offer it (deliverPdf calls offerOneDrive).
type Offer = { bytes: Uint8Array; filename: string };
const listeners = new Set<(o: Offer) => void>();
export function offerOneDrive(o: Offer) { listeners.forEach((l) => l(o)); }
export function onOneDriveOffer(l: (o: Offer) => void) { listeners.add(l); return () => { listeners.delete(l); }; }
