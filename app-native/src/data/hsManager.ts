// Manager tools for RAMS and COSHH (580 / 610 / 620): upload a PDF (RAMS can
// supersede an older one and is recorded as issued by the uploader), replace a
// COSHH file (everyone signs again), delete, and "Ask Outstanding to Sign".
import { supabase } from '@/lib/supabase';
import { mustHit } from '@/lib/mustHit';
import type { Profile } from '@/lib/types';

import type { DocKind, HsDoc, HsSig } from './hs';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
const T = {
  rams: { docs: 'rams_docs', sigs: 'rams_signatures', key: 'rams_id', bucket: 'rams-docs', label: 'RAMS' },
  coshh: { docs: 'coshh_docs', sigs: 'coshh_signatures', key: 'coshh_id', bucket: 'coshh-docs', label: 'COSHH' },
  layout: { docs: 'site_layout_docs', sigs: 'site_layout_signatures', key: 'layout_id', bucket: 'mc-documents', label: 'Site Rules & Layout' },
} as const;
export const RAMS_DOC_TYPES = ['Risk Assessment', 'Method Statement', 'RAMS'];

type Asset = { uri: string; name: string };
async function put(kind: DocKind, siteId: string, a: Asset): Promise<string | null> {
  const rid = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}`;
  try {
    const up = await supabase.storage.from(T[kind].bucket).upload(`${siteId}/${kind === 'layout' ? 'site-layout' : kind}/${rid}-${a.name.replace(/[^a-z0-9.\-]+/gi, '_')}`, await (await fetch(a.uri)).arrayBuffer(), { contentType: 'application/pdf' });
    return up.error ? null : up.data.path;
  } catch { return null; }
}
export const tellOperatives = (me: Profile, siteId: string, body: string) => {
  if (me.org_id) void db.from('messages').insert({ org_id: me.org_id, site_id: siteId, sender_id: me.id, audience: 'operatives', kind: 'doc_needs_signing', body } as never).then(undefined, () => undefined);
};
export const log = (me: Profile, siteId: string, action: string, description: string) => {
  if (me.org_id) void db.from('site_activity_log').insert({ site_id: siteId, org_id: me.org_id, actor_id: me.id, action, description } as never).then(undefined, () => undefined);
};

export async function uploadHsDoc(me: Profile & { signature_path?: string | null }, kind: DocKind, siteId: string, f: { name: string; docType: string; supersedesId: string | null; file: Asset; companyId?: string | null; signLayout?: object | null }): Promise<string | null> {
  const path = await put(kind, siteId, f.file);
  if (!path) return 'Could not upload — check your signal and try again.';
  const co = f.companyId ? { subcontractor_company_id: f.companyId } : {};
  const row = kind === 'rams'
    ? { site_id: siteId, name: f.name, storage_path: path, uploaded_by: me.id, doc_type: f.companyId ? 'RAMS' : f.docType, supersedes: f.companyId ? null : f.supersedesId, ...(f.signLayout ? { sign_layout: f.signLayout } : {}), ...co }
    : { site_id: siteId, name: f.name, storage_path: path, uploaded_by: me.id, ...co };
  const r = await db.from(T[kind].docs).insert(row as never).select('id').single();
  const id = (r.data as { id: string } | null)?.id;
  if (r.error || !id) return 'Could not save — try again.';
  if (f.companyId) return null; // a subcontractor's own folder: no issued record or job-wide notice
  if (kind === 'rams') {
    if (f.supersedesId) await db.from('rams_docs').update({ status: 'superseded', superseded_by: id } as never).eq('id', f.supersedesId);
    // Uploading it is issuing it: recorded straight away as issued by the uploader.
    await db.from('rams_signatures').insert({ rams_id: id, user_id: me.id, issued: true, signature_image_path: me.signature_path || null } as never);
  }
  tellOperatives(me, siteId, `New ${kind === 'rams' && f.docType === 'COSHH' ? 'COSHH' : T[kind].label} published and needs signing: "${f.name}"`);
  return null;
}

/** COSHH: replace the file in place; every signature is cleared so it's signed afresh. */
export async function replaceCoshh(me: Profile, siteId: string, doc: HsDoc, file: Asset): Promise<string | null> {
  const path = await put('coshh', siteId, file);
  if (!path) return 'Could not upload — check your signal and try again.';
  const now = new Date().toISOString();
  const r = mustHit(await db.from('coshh_docs').update({ storage_path: path, uploaded_by: me.id, uploaded_at: now, resign_cycle_start: now, last_resign_notified_at: null } as never).eq('id', doc.id).select('id'));
  if (r.error) return 'Could not save — try again.';
  await db.from('coshh_signatures').delete().eq('coshh_id', doc.id);
  if (doc.storage_path && doc.storage_path !== path) void supabase.storage.from('coshh-docs').remove([doc.storage_path]).catch(() => undefined);
  return null;
}

export async function deleteHsDoc(me: Profile, kind: DocKind, siteId: string, doc: HsDoc): Promise<boolean> {
  const r = await db.from(T[kind].docs).delete().eq('id', doc.id);
  if (r.error) return false;
  void supabase.storage.from(T[kind].bucket).remove([doc.storage_path]).catch(() => undefined);
  log(me, siteId, `${kind}_deleted`, `Deleted ${T[kind].label} document "${doc.name || ''}"`);
  return true;
}

/** Operatives on the job still missing a signature on any current document. */
export function outstanding(kind: DocKind, roster: string[], docs: HsDoc[], sigs: HsSig[]): string[] {
  return roster.filter((u) => docs.some((d) => !sigs.some((s) => s[T[kind].key] === d.id && s.user_id === u)));
}
export async function sendSignReminder(kind: DocKind, siteId: string, userIds: string[]): Promise<string> {
  try {
    const r = await supabase.functions.invoke('send-sign-reminder', { body: { site_id: siteId, doc_type: kind, user_ids: userIds } });
    const d = r.data as { sent?: number; error?: string } | null;
    if (r.error || d?.error) return `Could not send reminder — ${d?.error || 'try again.'}`;
    return d?.sent ? `Reminder sent to ${d.sent} device${d.sent === 1 ? '' : 's'}.` : 'No registered devices to notify yet.';
  } catch { return 'Could not send reminder.'; }
}
