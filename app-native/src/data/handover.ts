// Handover (857): the job's data sheets and guarantees (upload, edit details,
// attach a certificate, delete) and its list of O&M manuals (rename).
import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type { Profile, Site } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

export type HoDoc = { id: string; kind: 'datasheet' | 'guarantee'; name: string; storage_path: string | null; provider: string | null; ref: string | null; expiry_date: string | null; maintenance: string | null };
export type HoManual = { id: string; name: string | null; created_at: string; updated_at: string | null; updated_by: string | null };

export function useHandover(siteId: string | undefined) {
  return useQuery({
    queryKey: ['handover', siteId],
    enabled: !!siteId,
    queryFn: async () => {
      const [d, m] = await Promise.all([
        db.from('handover_docs').select('*').eq('site_id', siteId as string).order('position').order('created_at'),
        db.from('handover_om_manuals').select('id,name,created_at,updated_at,updated_by').eq('site_id', siteId as string).order('created_at'),
      ]);
      return { docs: (d.data as HoDoc[] | null) ?? [], manuals: (m.data as HoManual[] | null) ?? [] };
    },
  });
}

const rid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}${Math.random().toString(16).slice(2)}`);
const PROVIDERS = /^(bauder|langley|icopal|sika|soprema|triflex|kemper|westwood|proteus|garland|kingspan|rockwool|knauf|marley|redland|sandtoft|ibstock|ubbink|klober|alm|sig|cembrit|tapco|glidevale)/i;

async function store(site: Site, me: Profile, f: { uri: string; name: string; mimeType?: string | null }): Promise<string | null> {
  const path = `${site.org_id || me.org_id}/handover/${site.id}/${rid()}-${f.name.replace(/[^a-z0-9.-]+/gi, '_')}`;
  const up = await supabase.storage.from('mc-documents').upload(path, await (await fetch(f.uri)).arrayBuffer(), { contentType: f.mimeType || 'application/pdf' });
  return up.error ? null : up.data.path;
}

export async function uploadHoDocs(me: Profile, site: Site, files: { uri: string; name: string; mimeType?: string | null }[], kind: HoDoc['kind'], onProgress?: (i: number) => void): Promise<number> {
  let made = 0;
  for (let i = 0; i < files.length; i++) {
    onProgress?.(i + 1);
    const f = files[i];
    const stored = await store(site, me, f).catch(() => null);
    if (!stored) continue;
    const g = (f.name.match(PROVIDERS) || [])[1] || '';
    const r = await db.from('handover_docs').insert({ org_id: site.org_id || me.org_id, site_id: site.id, kind, name: f.name, storage_path: stored, provider: g ? g.charAt(0).toUpperCase() + g.slice(1).toLowerCase() : null, uploaded_by: me.id } as never);
    if (!r.error) made++;
  }
  return made;
}
export async function addBlankGuarantee(me: Profile, site: Site): Promise<boolean> {
  return !(await db.from('handover_docs').insert({ org_id: site.org_id || me.org_id, site_id: site.id, kind: 'guarantee', name: 'Roofing system guarantee', uploaded_by: me.id } as never)).error;
}
export async function attachToDoc(me: Profile, site: Site, id: string, f: { uri: string; name: string; mimeType?: string | null }): Promise<boolean> {
  const stored = await store(site, me, f).catch(() => null);
  return !!stored && !(await db.from('handover_docs').update({ storage_path: stored } as never).eq('id', id)).error;
}
export async function setHoField(id: string, key: 'name' | 'provider' | 'ref' | 'expiry_date' | 'maintenance', val: string): Promise<boolean> {
  return !(await db.from('handover_docs').update({ [key]: val === '' ? null : val } as never).eq('id', id)).error;
}
export async function deleteHoDoc(d: HoDoc): Promise<boolean> {
  if ((await db.from('handover_docs').delete().eq('id', d.id)).error) return false;
  if (d.storage_path) { try { await supabase.storage.from('mc-documents').remove([d.storage_path]); } catch { /* non-fatal */ } }
  return true;
}
export async function renameManual(me: Profile, id: string, name: string): Promise<boolean> {
  return !(await db.from('handover_om_manuals').update({ name, updated_by: me.id } as never).eq('id', id)).error;
}
