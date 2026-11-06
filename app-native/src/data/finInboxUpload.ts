// Invoice files into the Finance inbox (Andy, 7 Nov 2026: one Add Invoices page): each file becomes its own invoice in
// Received, to be read and allocated. Over 20 MB is skipped. Gives back what was added and what was skipped.
import { fdb } from '@/data/finance';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

export type UpFile = { uri: string; name: string; mimeType?: string | null; size?: number | null };
export type Added = { id: string; file_name: string };

export async function uploadToInbox(me: Profile, files: UpFile[], siteId?: string | null): Promise<{ added: Added[]; skipped: string[] }> {
  const added: Added[] = [], skipped: string[] = [];
  for (const f of files) {
    if ((f.size || 0) > 20 * 1024 * 1024) { skipped.push(`${f.name} (over 20 MB)`); continue; }
    const rid = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}`;
    let bytes: ArrayBuffer;
    try { bytes = await (await fetch(f.uri)).arrayBuffer(); } catch { skipped.push(`${f.name} (couldn’t be read)`); continue; }
    const up = await supabase.storage.from('finance-docs').upload(`${me.org_id}/inbox/${rid}-${(f.name || 'invoice').replace(/[^a-z0-9.-]+/gi, '_').slice(-80)}`, bytes, { contentType: f.mimeType || 'application/octet-stream' });
    if (up.error) { skipped.push(`${f.name} (upload failed)`); continue; }
    const ins = await fdb.from('fin_inbox').insert({ org_id: me.org_id, source: 'upload', status: 'new', received_at: new Date().toISOString(), file_path: up.data.path, file_name: f.name, content_type: f.mimeType || null, created_by: me.id, ...(siteId ? { site_id: siteId } : {}) } as never).select('id,file_name').single();
    if (ins.error || !ins.data) { skipped.push(`${f.name} (not saved)`); continue; }
    added.push(ins.data as Added);
  }
  return { added, skipped };
}
