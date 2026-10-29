// Managing the project list (180 renderSites / addSite / setSiteStatus /
// deleteSite / confirmSetResponsiblePm): create a project (with its drawing
// folders and the company's toolbox talks in its Bank TBT), change status,
// set the responsible PM, and delete (a PM can only delete an empty project —
// otherwise it's closed instead; admins can delete for good).
import { localISODate } from '@/lib/rules/driver';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
const rpc = supabase.rpc.bind(supabase) as unknown as (n: string, a: object) => Promise<{ data: unknown; error: unknown }>;
const uuid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16); }));

export type NewSite = { name: string; address: string; postcode: string; job_number: string; client_name: string; client_phone: string; client_email: string; multi_site: boolean; repair_contract: boolean; status: 'active' | 'upcoming'; start_date: string };

/** Creates the project; returns its id, or an error message. */
export async function createSite(me: Profile, d: NewSite, autoNumbers: boolean): Promise<{ id: string } | { error: string }> {
  const id = uuid();
  // Plain insert (asking for the row back can be refused by the sites policy).
  const r = await db.from('sites').insert({
    id, name: d.name, address: d.address || null, postcode: d.postcode || null, job_number: autoNumbers ? null : d.job_number || null, status: d.status,
    start_date: d.status === 'upcoming' ? d.start_date || null : null, multi_site: d.multi_site, repair_contract: d.repair_contract,
    client_name: d.client_name || null, client_phone: d.client_phone || null, client_email: d.client_email || null, org_id: me.org_id, created_by: me.id,
  } as never);
  if (r.error) return { error: `Save failed — ${r.error.message}` };
  // Every new project gets Drawings / Specification / Programme folders and the company TBTs in its bank.
  try {
    await db.from('drawing_folders').insert([
      { site_id: id, parent_id: null, name: 'Drawings', position: 0, created_by: me.id },
      { site_id: id, parent_id: null, name: 'Specification', position: 1, created_by: me.id },
      { site_id: id, parent_id: null, name: 'Programme', position: 2, created_by: me.id },
    ] as never);
  } catch { /* best effort, as today */ }
  try {
    const t = ((await db.from('tbt_templates').select('title,storage_path').eq('org_id', me.org_id as string)).data as { title: string; storage_path: string }[] | null) ?? [];
    if (t.length) await db.from('toolbox_talks').insert(t.map((x) => ({ site_id: id, org_id: me.org_id, title: x.title, storage_path: x.storage_path, status: 'bank', created_by: me.id })) as never);
  } catch { /* best effort */ }
  return { id };
}

/** Active / Upcoming / Closed. Closing stamps who and when, and clears future repeats of key dates. */
export async function setSiteStatus(me: Profile, siteId: string, status: 'active' | 'upcoming' | 'closed'): Promise<boolean> {
  const patch = status === 'closed' ? { status, closed_at: new Date().toISOString(), closed_by: me.id } : { status, closed_at: null, closed_by: null };
  if ((await db.from('sites').update(patch as never).eq('id', siteId)).error) return false;
  if (status === 'closed') { try { await db.from('site_calendar_events').delete().eq('site_id', siteId).not('recurrence_group_id', 'is', null).gt('event_date', localISODate(new Date())); } catch { /* non-fatal */ } }
  return true;
}

export async function setResponsiblePm(siteId: string, pmId: string): Promise<boolean> {
  const ok = !(await db.from('sites').update({ responsible_pm_id: pmId } as never).eq('id', siteId)).error;
  // The PM is told (push + email), best-effort, as when someone is added to a site.
  if (ok) void supabase.functions.invoke('notify-site-assignment', { body: { site_id: siteId, user_id: pmId } }).catch(() => undefined);
  return ok;
}

/** True when nothing has been entered into the project yet (checked under your own access). */
export async function siteIsEmpty(siteId: string): Promise<boolean> {
  try { const r = await rpc('site_is_empty', { p_site_id: siteId }); return !r.error && !!r.data; } catch { return false; }
}
export async function deleteSite(siteId: string): Promise<boolean> {
  return !(await db.from('sites').delete().eq('id', siteId)).error;
}
