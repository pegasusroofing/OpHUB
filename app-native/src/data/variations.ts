// Variations: see live/closed ones, raise one with a photo, and the manager decision
// workflow (approve/decline/modify, value, add to SoW, close, delete). Ported from
// 800-variations.js. Operatives and site managers never see or type money: the value
// column (cost_impact) isn't even downloaded for them, as today. PDFs come later.
import { useQuery } from '@tanstack/react-query';

import { cachedQuery, orThrow } from '@/lib/offlineCache';
import { compressOne, type Picked } from '@/lib/photos';
import { financeValuePatch, money, valueOf } from '@/lib/rules/variations';
import { supabase } from '@/lib/supabase';
import type { Profile, Site } from '@/lib/types';

import { addVariationWork } from './sowManager';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

const COLS_NO_VALUE = 'id,site_id,photo_path,description,created_by,created_at,status,approval_status,decided_by,decided_at,decline_reason,closed_at,schedule_section_id';

export type Variation = {
  id: string; site_id: string; photo_path: string | null; description: string; created_by: string | null; created_at: string;
  status: string; approval_status: string | null; decline_reason: string | null; closed_at: string | null;
};

export const approvalLabel = (v: Variation) => (v.approval_status === 'approved' ? 'Approved' : v.approval_status === 'declined' ? 'Declined' : 'Awaiting decision');

export function useVariations(siteId: string | undefined, status: 'live' | 'closed') {
  return useQuery({
    queryKey: ['variations', siteId, status],
    enabled: !!siteId,
    queryFn: () => cachedQuery(`variations:${siteId}:${status}`, async () =>
      orThrow(await db.from('variations').select(COLS_NO_VALUE).eq('site_id', siteId as string).eq('status', status).order('created_at', { ascending: false })) as Variation[]),
  });
}

export async function raiseVariation(me: Profile, site: Site, photo: Picked, desc: string, value: number | null = null): Promise<string | null> {
  const uri = await compressOne(photo);
  const rid = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}`;
  const up = await supabase.storage.from('site-photos').upload(`${site.id}/variations/${rid}.jpg`, await (await fetch(uri)).arrayBuffer(), { contentType: 'image/jpeg' });
  if (up.error) return 'Could not upload the photo — check your signal and try again.';
  const r = await db.from('variations').insert({ site_id: site.id, photo_path: up.data.path, description: desc || '—', created_by: me.id, status: 'live', approval_status: 'pending', ...(value != null ? { cost_impact: value.toFixed(2) } : {}) } as never);
  if (r.error) return 'Could not save — try again.';
  if (me.org_id) void db.from('messages').insert({ org_id: me.org_id, site_id: site.id, sender_id: me.id, audience: 'managers', kind: 'variation', body: `${me.name} raised a variation: ${desc || '(no description)'}` } as never).then(undefined, () => undefined);
  return null;
}

/* ---------- manager side (800) ---------- */
// PMs/admins (and finance users) download the value too; everyone else doesn't.
export function useManagerVariations(siteId: string | undefined, status: 'live' | 'closed', withValue: boolean) {
  return useQuery({
    queryKey: ['variations', siteId, status, withValue],
    enabled: !!siteId,
    queryFn: () => cachedQuery(`variations:${siteId}:${status}:${withValue}`, async () =>
      orThrow(await db.from('variations').select(withValue ? '*' : COLS_NO_VALUE).eq('site_id', siteId as string).eq('status', status).order('created_at', { ascending: false })) as (Variation & { cost_impact?: string | null; schedule_section_id?: string | null })[]),
  });
}

function log(me: Profile, siteId: string, action: string, description: string) {
  if (me.org_id) void db.from('site_activity_log').insert({ site_id: siteId, org_id: me.org_id, actor_id: me.id, action, description } as never).then(undefined, () => undefined);
}
function tellManagers(me: Profile, siteId: string, body: string) {
  if (me.org_id) void db.from('messages').insert({ org_id: me.org_id, site_id: siteId, sender_id: me.id, audience: 'managers', kind: 'variation', body } as never).then(undefined, () => undefined);
}

/** Copies a changed site value to Finance's register where Finance hasn't typed its own (finance users only, as today). */
async function syncToFinance(varId: string, oldVal: number | null, newVal: number | null, financeUser: boolean) {
  if (newVal == null || !financeUser) return;
  try {
    const rows = await db.from('fin_variations').select('id,status,quoted,agreed_value').eq('variation_id', varId);
    for (const f of (rows.data as { id: string; status: string; quoted: number | null; agreed_value: number | null }[] | null) ?? []) {
      const patch = financeValuePatch(f, oldVal, newVal);
      if (patch) await db.from('fin_variations').update(patch as never).eq('id', f.id);
    }
  } catch { /* the site value is saved either way */ }
}

/** value: undefined = no value box shown; null = cleared; number = new value. */
async function valuePatch(id: string, value: number | null | undefined) {
  if (value === undefined) return { patch: {}, oldVal: null as number | null };
  const cur = await db.from('variations').select('cost_impact').eq('id', id);
  const oldVal = valueOf(((cur.data as { cost_impact: string | null }[] | null) ?? [])[0]?.cost_impact);
  if (value === oldVal) return { patch: {}, oldVal };
  return { patch: { cost_impact: value == null ? null : value.toFixed(2) }, oldVal };
}

export async function decideVariation(me: Profile, siteId: string, v: Variation, opts: { approve: boolean; reason?: string; description?: string; value?: number | null; financeUser: boolean }): Promise<boolean> {
  const vp = opts.approve ? await valuePatch(v.id, opts.value) : { patch: {}, oldVal: null };
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = opts.approve
    ? { approval_status: 'approved', decided_by: me.id, decided_at: now, decline_reason: null, ...vp.patch, ...(opts.description ? { description: opts.description } : {}) }
    : { approval_status: 'declined', decided_by: me.id, decided_at: now, decline_reason: opts.reason };
  const r = await db.from('variations').update(patch as never).eq('id', v.id);
  if (r.error) return false;
  if ('cost_impact' in vp.patch) await syncToFinance(v.id, vp.oldVal, opts.value ?? null, opts.financeUser);
  if (opts.approve && !opts.description) tellManagers(me, siteId, `${me.name} approved a variation: ${v.description || ''}`);
  return true;
}

export async function saveVariationValue(v: Variation, value: number | null, financeUser: boolean): Promise<string> {
  const vp = await valuePatch(v.id, value);
  if (!('cost_impact' in vp.patch)) return 'Value saved';
  const r = await db.from('variations').update(vp.patch as never).eq('id', v.id).select('cost_impact');
  if (r.error) return 'Could not save — try again.';
  const saved = ((r.data as { cost_impact: string | null }[] | null) ?? [])[0]?.cost_impact ?? null;
  if (String(saved || '') !== String((vp.patch as { cost_impact: string | null }).cost_impact || '')) return 'Only a project manager or admin can set the value.';
  await syncToFinance(v.id, vp.oldVal, value, financeUser);
  return value == null ? 'Value cleared' : `Value saved — ${money(value)}`;
}

/** Approved variation → a new "Variation N" section in the Schedule of Works, linked back. */
export async function addVariationToSchedule(me: Profile, siteId: string, v: Variation & { schedule_section_id?: string | null }): Promise<string> {
  if (v.approval_status !== 'approved') return 'This variation needs PM approval before it can be added to the schedule.';
  if (v.schedule_section_id) return 'Already added to the schedule.';
  const name = await addVariationWork(me, siteId, v.description || 'Variation work');
  if (!name) return 'Could not add to the schedule — try again.';
  const s = await db.from('schedule_sections').select('id').eq('site_id', siteId).eq('name', name).order('created_at', { ascending: false }).limit(1);
  const secId = ((s.data as { id: string }[] | null) ?? [])[0]?.id;
  if (secId) await db.from('variations').update({ schedule_section_id: secId } as never).eq('id', v.id);
  return `Added to Schedule of Works as "${name}"`;
}

export async function closeVariation(me: Profile, siteId: string, v: Variation): Promise<boolean> {
  const r = await db.from('variations').update({ status: 'closed', closed_at: new Date().toISOString() } as never).eq('id', v.id);
  if (r.error) return false;
  log(me, siteId, 'variation_closed', `Closed variation "${v.description || ''}"`);
  return true;
}

export async function deleteVariation(me: Profile, siteId: string, v: Variation): Promise<boolean> {
  const r = await db.from('variations').delete().eq('id', v.id);
  if (r.error) return false;
  log(me, siteId, 'variation_deleted', `Deleted variation "${v.description || ''}"`);
  return true;
}
