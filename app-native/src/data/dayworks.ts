// Day works recorded in Projects (Andy, 8 Nov 2026: a PM never needs to go into Finance; Finance is only the money).
// site_dayworks: the date, what was done, the sheet ref, labour / plant / materials, the signed sheet, and the client stage
// (To Issue → Issued To Client → Client Approved / Rejected). A database trigger keeps Finance's day works register in step;
// Finance adds the value. Managers only.
import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type { Profile, Site } from '@/lib/types';
import type { ClientStatus, SiteDoc } from '@/lib/rules/clientStage';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

export type SiteDaywork = {
  id: string; site_id: string; work_date: string; title: string; description: string | null; ref: string | null;
  labour: string | null; plant: string | null; materials: string | null; docs: SiteDoc[]; client_status: ClientStatus; client_at: string | null;
  created_by: string | null; created_at: string;
};

export const useSiteDayworks = (siteId: string | undefined) => useQuery({
  queryKey: ['siteDayworks', siteId], enabled: !!siteId,
  queryFn: async () => ((await db.from('site_dayworks').select('*').eq('site_id', siteId as string).order('work_date', { ascending: false }).order('created_at', { ascending: false })).data as SiteDaywork[] | null) ?? [],
});

export type DayworkFields = { work_date: string; title: string; description: string; ref: string; labour: string; plant: string; materials: string };
export async function saveDaywork(me: Profile, site: Site, id: string | null, f: DayworkFields): Promise<string | null> {
  const row = { work_date: f.work_date, title: f.title.trim(), description: f.description.trim() || null, ref: f.ref.trim() || null, labour: f.labour.trim() || null, plant: f.plant.trim() || null, materials: f.materials.trim() || null, updated_at: new Date().toISOString() };
  const r = id ? await db.from('site_dayworks').update(row as never).eq('id', id).select('id')
    : await db.from('site_dayworks').insert({ ...row, org_id: site.org_id || me.org_id, site_id: site.id, created_by: me.id } as never).select('id');
  return r.error || !(r.data as unknown[] | null)?.length ? 'Could not save — try again.' : null;
}
export async function setDayworkClient(id: string, status: ClientStatus): Promise<boolean> {
  return !!(await db.from('site_dayworks').update({ client_status: status, client_at: status === 'to_issue' ? null : new Date().toISOString(), updated_at: new Date().toISOString() } as never).eq('id', id).select('id')).data?.length;
}
export async function setDayworkDocs(id: string, docs: SiteDoc[]): Promise<boolean> {
  return !!(await db.from('site_dayworks').update({ docs, updated_at: new Date().toISOString() } as never).eq('id', id).select('id')).data?.length;
}
export const deleteDaywork = async (id: string) => !!(await db.from('site_dayworks').delete().eq('id', id).select('id')).data?.length;

/** A signed sheet, instruction or quote: kept with the job (mc-documents/<site>/…), readable in Projects. */
export async function uploadSiteDoc(site: Site, folder: 'dayworks' | 'variation-docs', a: { uri: string; name: string; mimeType?: string | null }): Promise<SiteDoc | null> {
  try {
    const rid = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}${Math.random().toString(16).slice(2)}`;
    const up = await supabase.storage.from('mc-documents').upload(`${site.id}/${folder}/${rid}-${(a.name || 'file').replace(/[^a-z0-9.-]+/gi, '_')}`, await (await fetch(a.uri)).arrayBuffer(), { contentType: a.mimeType || 'application/pdf' });
    return up.error ? null : { bucket: 'mc-documents', path: up.data.path, name: a.name || 'Document', at: new Date().toISOString() };
  } catch { return null; }
}
