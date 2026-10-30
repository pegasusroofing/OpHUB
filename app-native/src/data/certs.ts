// My certificates (operative's own). Ported from 320-per-operative-certifications.js.
// Managers use the same calls for anyone's record (Operatives dashboard).
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { cachedQuery, orThrow } from '@/lib/offlineCache';
import { certPath, type Cert } from '@/lib/rules/certs';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

/** An operative's certificates — your own, or (managers) anyone's. */
/** `manual`: the id is a person not on the app (certification_manual_people), not an operative. */
export function useMyCerts(userId?: string, manual = false) {
  const { me } = useAuth();
  const who = userId || me?.id;
  return useQuery({
    queryKey: ['myCerts', who],
    enabled: !!who,
    queryFn: () => cachedQuery(`myCerts:${who}`, async () =>
      orThrow(await db.from('operative_certifications').select('id,category,name,storage_path,expiry_date,other_type_description').eq(manual ? 'manual_person_id' : 'operative_id', who as string).order('created_at', { ascending: false })) as Cert[]),
  });
}

export async function uploadCert(me: Profile, f: { uri: string; name: string; mimeType?: string | null; size?: number | null }, category: string, otherDesc: string, expiry: string | null, operativeId: string = me.id, manual = false): Promise<string | null> {
  const rid = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}`;
  const path = manual ? `${me.org_id}/manual/${operativeId}/${rid}-${f.name.replace(/[^a-z0-9.-]+/gi, '_')}` : certPath(me.org_id as string, operativeId, rid, f.name);
  const up = await supabase.storage.from('certifications').upload(path, await (await fetch(f.uri)).arrayBuffer(), { contentType: f.mimeType || 'application/octet-stream' });
  if (up.error) return 'Upload failed — check your signal and try again.';
  const r = await db.from('operative_certifications').insert({
    org_id: me.org_id, ...(manual ? { manual_person_id: operativeId } : { operative_id: operativeId }), category, other_type_description: category === 'other' ? otherDesc || null : null,
    expiry_date: expiry, name: f.name, storage_path: up.data.path, size: f.size ?? null, source: 'upload', uploaded_by: me.id,
  } as never);
  return r.error ? 'Could not save — try again.' : null;
}

/* ---------- office side (320): rename, expiry, delete ---------- */
/** A certificate moved to another type; "Other" keeps a description of what it is (320 changeOperativeCertCategory). */
export async function setCertCategory(id: string, category: string, otherDesc: string | null): Promise<boolean> {
  return !!(await db.from('operative_certifications').update({ category, other_type_description: category === 'other' ? otherDesc : null } as never).eq('id', id).select('id')).data?.length;
}
export async function renameCert(id: string, name: string): Promise<boolean> {
  return !!(await db.from('operative_certifications').update({ name } as never).eq('id', id).select('id')).data?.length;
}
export async function setCertExpiry(id: string, expiry: string | null): Promise<boolean> {
  return !!(await db.from('operative_certifications').update({ expiry_date: expiry } as never).eq('id', id).select('id')).data?.length;
}
export async function deleteCert(c: Cert): Promise<boolean> {
  if (!(await db.from('operative_certifications').delete().eq('id', c.id).select('id')).data?.length) return false;
  if (c.storage_path) { try { await supabase.storage.from('certifications').remove([c.storage_path]); } catch { /* non-fatal */ } }
  return true;
}

export type OpRow = { id: string; name: string; phone: string | null; sites: number; certs: number };
/** Every operative with how many sites and certificates they have (320 renderOperativesList). */
export function useOperativeList(orgId: string | null | undefined) {
  return useQuery({
    queryKey: ['operativeList', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const [p, a, c] = await Promise.all([
        db.from('profiles').select('id,name,phone').eq('role', 'operative'),
        db.from('site_assignments').select('site_id,user_id'),
        db.from('operative_certifications').select('operative_id').eq('org_id', orgId as string),
      ]);
      const sites: Record<string, Set<string>> = {};
      ((a.data as { site_id: string; user_id: string }[] | null) ?? []).forEach((r) => { (sites[r.user_id] ||= new Set()).add(r.site_id); });
      const certs: Record<string, number> = {};
      ((c.data as { operative_id: string }[] | null) ?? []).forEach((r) => { certs[r.operative_id] = (certs[r.operative_id] || 0) + 1; });
      return (((p.data as { id: string; name: string; phone: string | null }[] | null) ?? []).map((o) => ({ ...o, sites: sites[o.id]?.size || 0, certs: certs[o.id] || 0 })) as OpRow[])
        .sort((x, y) => (x.name || '').localeCompare(y.name || ''));
    },
  });
}
export async function saveOperativeField(id: string, patch: { name?: string; phone?: string | null }): Promise<boolean> {
  return !!(await db.from('profiles').update(patch as never).eq('id', id).select('id')).data?.length;
}

/* ---------- other people on a job, not on the app (320 addManualCertPerson) ---------- */
export type ManualPerson = { id: string; name: string; certs: number };
export function useManualPeople(siteId: string | undefined) {
  return useQuery({
    queryKey: ['manualPeople', siteId], enabled: !!siteId,
    queryFn: async () => {
      const people = ((await db.from('certification_manual_people').select('id,name').eq('site_id', siteId as string).order('created_at')).data as { id: string; name: string }[] | null) ?? [];
      const c = people.length ? ((await db.from('operative_certifications').select('manual_person_id').in('manual_person_id', people.map((p) => p.id))).data as { manual_person_id: string }[] | null) ?? [] : [];
      return people.map((p) => ({ ...p, certs: c.filter((x) => x.manual_person_id === p.id).length })) as ManualPerson[];
    },
  });
}
export async function addManualPerson(me: Profile, siteId: string, name: string): Promise<boolean> {
  return !(await db.from('certification_manual_people').insert({ org_id: me.org_id, site_id: siteId, name, created_by: me.id } as never)).error;
}
/** Removes them and their certificates (asked first — it can't be undone). */
export async function removeManualPerson(id: string): Promise<boolean> {
  const certs = ((await db.from('operative_certifications').select('storage_path').eq('manual_person_id', id)).data as { storage_path: string | null }[] | null) ?? [];
  if (!(await db.from('certification_manual_people').delete().eq('id', id).select('id')).data?.length) return false;
  const paths = certs.map((c) => c.storage_path).filter(Boolean) as string[];
  if (paths.length) void supabase.storage.from('certifications').remove(paths).catch(() => undefined);
  return true;
}
