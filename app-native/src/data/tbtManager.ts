// Toolbox talks, manager side (710): upload into Bank TBT, sync the bank from the
// Admin Centre library, issue for signing (a live copy; only one live talk per job;
// the issuer signs it there and then), issue company-wide, rename, replace the
// file, mark completed, delete, and remind whoever hasn't signed.
import { siteStatusKey } from '@/lib/rules/checkin';
import { supabase } from '@/lib/supabase';
import type { Profile, Site } from '@/lib/types';

import type { Tbt } from './hs';
import { mustHit } from '@/lib/mustHit';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
type Me = Profile & { signature_path?: string | null };

const tellOperatives = (me: Profile, siteId: string, title: string) => {
  if (me.org_id) void db.from('messages').insert({ org_id: me.org_id, site_id: siteId, sender_id: me.id, audience: 'operatives', kind: 'doc_needs_signing', body: `New TBT published and needs signing: "${title}"` } as never).then(undefined, () => undefined);
};

export async function uploadTbt(me: Profile, siteId: string, title: string, file: { uri: string; name: string }): Promise<string | null> {
  const rid = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}`;
  try {
    const up = await supabase.storage.from('rams-docs').upload(`${siteId}/tbt/${rid}-${file.name.replace(/[^a-z0-9.\-]+/gi, '_')}`, await (await fetch(file.uri)).arrayBuffer(), { contentType: 'application/pdf' });
    if (up.error) return 'Could not upload — check your signal and try again.';
    const r = await db.from('toolbox_talks').insert({ site_id: siteId, org_id: me.org_id, title, storage_path: up.data.path, status: 'bank', created_by: me.id } as never);
    return r.error ? 'Could not save — try again.' : null;
  } catch { return 'Could not upload — check your signal and try again.'; }
}

export async function replaceTbtFile(siteId: string, tbtId: string, file: { uri: string; name: string }): Promise<boolean> {
  const rid = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}`;
  try {
    const up = await supabase.storage.from('rams-docs').upload(`${siteId}/tbt/${rid}-${file.name.replace(/[^a-z0-9.\-]+/gi, '_')}`, await (await fetch(file.uri)).arrayBuffer(), { contentType: 'application/pdf' });
    if (up.error) return false;
    return !!(await db.from('toolbox_talks').update({ storage_path: up.data.path } as never).eq('id', tbtId).select('id')).data?.length;
  } catch { return false; }
}

export async function syncTbtBank(me: Profile, siteId: string): Promise<string> {
  const [t, e] = await Promise.all([db.from('tbt_templates').select('title,storage_path').eq('org_id', me.org_id as string), db.from('toolbox_talks').select('title,storage_path').eq('site_id', siteId)]);
  const have = new Set(((e.data as { title: string; storage_path: string }[] | null) ?? []).map((x) => `${x.title}|${x.storage_path}`));
  const missing = ((t.data as { title: string; storage_path: string }[] | null) ?? []).filter((x) => !have.has(`${x.title}|${x.storage_path}`));
  if (!missing.length) return 'Bank TBT is already up to date with the library.';
  const r = await db.from('toolbox_talks').insert(missing.map((x) => ({ site_id: siteId, org_id: me.org_id, title: x.title, storage_path: x.storage_path, status: 'bank', created_by: me.id })) as never);
  return r.error ? 'Could not sync — try again.' : `${missing.length} template${missing.length === 1 ? '' : 's'} added to Bank TBT`;
}

async function autoSignIssuer(me: Me, tbtId: string) {
  if (!me.signature_path) return false;
  const have = ((await db.from('toolbox_talk_signatures').select('user_id').eq('tbt_id', tbtId).eq('user_id', me.id)).data ?? []).length;
  if (have) return true;
  return !(await db.from('toolbox_talk_signatures').insert({ tbt_id: tbtId, user_id: me.id, signature_image_path: me.signature_path } as never)).error;
}
async function closeOtherLive(siteId: string) {
  const o = ((await db.from('toolbox_talks').select('id').eq('site_id', siteId).eq('status', 'live').is('subcontractor_company_id', null)).data as { id: string }[] | null) ?? [];
  for (const x of o) await db.from('toolbox_talks').update({ status: 'completed' } as never).eq('id', x.id);
}

/** Issue for signing. A Bank talk makes a new live copy (the bank one stays for reuse). Returns the live talk's id and the message. */
export async function issueTbt(me: Me, siteId: string, talk: Tbt): Promise<{ id: string | null; msg: string }> {
  await closeOtherLive(siteId);
  let liveId = talk.id;
  if (talk.status === 'bank') {
    const r = await db.from('toolbox_talks').insert({ site_id: siteId, org_id: me.org_id, title: talk.title, storage_path: talk.storage_path, status: 'live', created_by: me.id } as never).select('id').single();
    const id = (r.data as { id: string } | null)?.id;
    if (!id) return { id: null, msg: 'Could not issue — try again.' };
    liveId = id;
  } else if (!(await db.from('toolbox_talks').update({ status: 'live' } as never).eq('id', talk.id).select('id')).data?.length) return { id: null, msg: 'Could not issue — try again.' };
  const signed = await autoSignIssuer(me, liveId);
  tellOperatives(me, siteId, talk.title);
  return { id: liveId, msg: `Issued for signing${signed ? ' and signed by you' : ''}${talk.status === 'bank' ? ' — original kept in Bank TBT for reuse' : ''}${!me.signature_path ? '. Adopt your signature to have it signed automatically next time.' : ''}` };
}

/** Each live job gets its own live copy. */
export async function issueTbtCompanyWide(me: Me, talk: Tbt, sites: Site[]): Promise<string> {
  let n = 0;
  for (const s of sites.filter((x) => siteStatusKey(x) === 'live')) {
    try {
      await closeOtherLive(s.id);
      const r = await db.from('toolbox_talks').insert({ site_id: s.id, org_id: me.org_id, title: talk.title, storage_path: talk.storage_path, status: 'live', created_by: me.id } as never).select('id').single();
      const id = (r.data as { id: string } | null)?.id;
      if (id) { n++; tellOperatives(me, s.id, talk.title); await autoSignIssuer(me, id); }
    } catch { /* keep going */ }
  }
  return `Issued for signing at ${n} live site${n === 1 ? '' : 's'} — original kept in Bank TBT`;
}

export const renameTbt = async (id: string, title: string) => !!(await db.from('toolbox_talks').update({ title } as never).eq('id', id).select('id')).data?.length;
export const completeTbt = async (id: string) => !!(await db.from('toolbox_talks').update({ status: 'completed' } as never).eq('id', id).select('id')).data?.length;

/** The same file can be shared by bank, live and other jobs' copies — only remove it when nothing uses it. */
export async function deleteTbt(me: Profile, siteId: string, talk: Tbt): Promise<boolean> {
  const r = mustHit(await db.from('toolbox_talks').delete().eq('id', talk.id).select('id'));
  if (r.error) return false;
  if (me.org_id) void db.from('site_activity_log').insert({ site_id: siteId, org_id: me.org_id, actor_id: me.id, action: 'toolbox_talk_deleted', description: `Deleted toolbox talk "${talk.title || ''}"` } as never).then(undefined, () => undefined);
  try {
    const [a, b] = await Promise.all([db.from('toolbox_talks').select('id').eq('storage_path', talk.storage_path).limit(1), db.from('tbt_templates').select('id').eq('storage_path', talk.storage_path).limit(1)]);
    if (!(a.data ?? []).length && !(b.data ?? []).length) void supabase.storage.from('rams-docs').remove([talk.storage_path]);
  } catch { /* leaving the file behind is harmless */ }
  return true;
}

export async function remindTbt(siteId: string, tbtId: string, userIds: string[]): Promise<string> {
  try {
    const r = await supabase.functions.invoke('send-sign-reminder', { body: { site_id: siteId, doc_type: 'tbt', tbt_id: tbtId, user_ids: userIds } });
    const d = r.data as { sent?: number; error?: string } | null;
    if (r.error || d?.error) return `Could not send reminder — ${d?.error || 'try again.'}`;
    return d?.sent ? `Reminder sent to ${d.sent} device${d.sent === 1 ? '' : 's'}.` : 'No registered devices to notify yet.';
  } catch { return 'Could not send reminder.'; }
}

/** The monthly TBT warning for a live job (710). */
export function tbtDue(site: Site, talks: Tbt[], now = new Date()): string | null {
  if (siteStatusKey(site) !== 'live') return null;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const issued = talks.some((t) => (t.status === 'live' || t.status === 'completed') && new Date(t.created_at) >= monthStart);
  const ever = talks.some((t) => t.status === 'completed');
  if (issued && ever) return null;
  if (!ever) return '⚠ No Toolbox Talk has ever been completed at this site';
  return now.getDate() > 7 ? '⚠ Toolbox Talk overdue' : '⚠ Toolbox Talk due this month';
}
