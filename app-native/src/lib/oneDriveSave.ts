// Saving an exported PDF into OneDrive (060 oneDriveUploadBytes / syncPdfViewerDoc): a PDF made inside a
// project goes to that project's folder, a company-wide one to "Company Exports". Small files go in the
// request; bigger ones are put in storage first and the server picks them up (turning a large PDF into
// text on a phone froze it).
import { packPut } from '@/data/jobPack';
import { supabase } from '@/lib/supabase';
import { invokeAsUser } from '@/lib/userFunctions';

export const b64 = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
/** null when saved; otherwise what went wrong, in plain words. */
export async function saveToOneDrive(orgId: string | null | undefined, bytes: Uint8Array, filename: string, siteId: string | null): Promise<string | null> {
  try {
    if (siteId) { const rule = /Schedule of Works/i.test(filename) ? 'sow_export' : /O&M/i.test(filename) ? 'om_manual' : /Daily Briefing/i.test(filename) ? 'briefing' : null; if (rule && (await packPut(siteId, rule, filename, { bytes }))) return null; }
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

// Who may save an export to OneDrive: managers only. Set when the signed-in shell opens.
let saver: string | null = null;
export const setOneDriveSaver = (orgId: string | null) => { saver = orgId; };
export const oneDriveSaver = () => saver;
