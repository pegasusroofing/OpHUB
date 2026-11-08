// Handover (857): the job's data sheets and guarantees (upload, edit details,
// attach a certificate, delete) and its list of O&M manuals (rename).
import { useQuery } from '@tanstack/react-query';

import { hoKindOf, hoSameName, hoSkipFolder, type HoKind } from '@/lib/rules/handoverFind';
import { supabase } from '@/lib/supabase';
import type { Profile, Site } from '@/lib/types';
import { invokeAsUser } from '@/lib/userFunctions';

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
/* ---------- practical completion (Andy, 8 Nov 2026) ---------- */
/** Practical completion and the defects period: set in Projects, used by Finance for the retention release dates. */
export const useCompletion = (siteId: string | undefined) => useQuery({
  queryKey: ['siteCompletion', siteId], enabled: !!siteId,
  queryFn: async () => (((await supabase.rpc('site_completion' as never, { p_site: siteId } as never)).data as { pc_date: string | null; defects_months: number | null }[] | null) ?? [])[0] ?? { pc_date: null, defects_months: null },
});
export async function setCompletion(siteId: string, pcDate: string | null, defectsMonths: number | null): Promise<boolean> {
  const r = await supabase.rpc('set_site_completion' as never, { p_site: siteId, p_pc_date: pcDate, p_defects_months: defectsMonths } as never);
  return !r.error && r.data === true;
}

/* ---------- the job's OneDrive folder (Andy, 8 Nov 2026) ---------- */
export type HoFound = { id: string; name: string; driveId: string | null; where: string; kind: HoKind; size: number };
type OdLevel = { folders?: { id: string; name: string; driveId?: string | null }[]; files?: { id: string; name: string; driveId?: string | null; size?: number }[]; error?: string };
/** Guarantees and data sheets in the job's OneDrive folder and the folders under it (4 deep, photo folders skipped), leaving
 *  out ones already in the handover. null + reason when the job has no folder or OneDrive can't be read. */
export async function findInOneDrive(site: Site, have: string[]): Promise<{ found: HoFound[] } | { error: string }> {
  const s = site as Site & { onedrive_folder_id?: string | null; onedrive_drive_id?: string | null; onedrive_folder_name?: string | null };
  if (!s.onedrive_folder_id) return { error: 'This job has no OneDrive folder linked yet.' };
  const found: HoFound[] = [];
  let level: { id: string; driveId: string | null; path: string }[] = [{ id: s.onedrive_folder_id, driveId: s.onedrive_drive_id || null, path: s.onedrive_folder_name || 'Job folder' }];
  let opened = 0, firstError = '';
  for (let depth = 0; depth < 4 && level.length && opened < 80; depth++) {
    const next: typeof level = [];
    for (let i = 0; i < level.length && opened < 80; i += 5) {
      const batch = level.slice(i, i + 5); opened += batch.length;
      const res = await Promise.all(batch.map((f) => invokeAsUser<OdLevel>('onedrive-list-folders', { includeFiles: true, parent_id: f.id, ...(f.driveId ? { drive_id: f.driveId } : {}) })));
      res.forEach((r, j) => {
        const at = batch[j];
        if (r.error || r.data?.error) { if (!firstError) firstError = r.data?.error || r.error || 'Could not read OneDrive.'; return; }
        (r.data?.files || []).forEach((f) => {
          const kind = hoKindOf(f.name, at.path);
          if (kind && !have.some((h) => hoSameName(h, f.name)) && !found.some((x) => x.id === f.id)) found.push({ id: f.id, name: f.name, driveId: f.driveId || at.driveId, where: at.path, kind, size: f.size || 0 });
        });
        (r.data?.folders || []).filter((f) => !hoSkipFolder(f.name)).forEach((f) => next.push({ id: f.id, driveId: f.driveId || at.driveId, path: `${at.path}/${f.name}` }));
      });
    }
    level = next;
  }
  if (!found.length && firstError && opened <= 1) return { error: firstError };
  return { found };
}
/** Copies the ticked OneDrive files into the handover, as data sheets or guarantees. */
export async function importHoFromOneDrive(me: Profile, site: Site, files: HoFound[], onStep?: (i: number) => void): Promise<{ added: number; failed: number }> {
  let added = 0, failed = 0;
  for (let i = 0; i < files.length; i++) {
    const f = files[i]; onStep?.(i + 1);
    try {
      const d = await invokeAsUser<{ content_base64?: string; error?: string }>('onedrive-download-file', { item_id: f.id, drive_id: f.driveId || null, name: f.name });
      if (d.error || !d.data?.content_base64) { failed++; continue; }
      const bin = atob(d.data.content_base64), bytes = new Uint8Array(bin.length);
      for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
      const path = `${site.org_id || me.org_id}/handover/${site.id}/${rid()}-${f.name.replace(/[^a-z0-9.-]+/gi, '_')}`;
      const up = await supabase.storage.from('mc-documents').upload(path, bytes, { contentType: /\.png$/i.test(f.name) ? 'image/png' : /\.jpe?g$/i.test(f.name) ? 'image/jpeg' : 'application/pdf' });
      if (up.error) { failed++; continue; }
      const g = (f.name.match(PROVIDERS) || [])[1] || '';
      const r = await db.from('handover_docs').insert({ org_id: site.org_id || me.org_id, site_id: site.id, kind: f.kind, name: f.name, storage_path: up.data.path, provider: g ? g.charAt(0).toUpperCase() + g.slice(1).toLowerCase() : null, uploaded_by: me.id } as never);
      if (r.error) failed++; else added++;
    } catch { failed++; }
  }
  return { added, failed };
}
export async function addBlankGuarantee(me: Profile, site: Site): Promise<boolean> {
  return !(await db.from('handover_docs').insert({ org_id: site.org_id || me.org_id, site_id: site.id, kind: 'guarantee', name: 'Roofing system guarantee', uploaded_by: me.id } as never)).error;
}
export async function attachToDoc(me: Profile, site: Site, id: string, f: { uri: string; name: string; mimeType?: string | null }): Promise<boolean> {
  const stored = await store(site, me, f).catch(() => null);
  return !!stored && !!(await db.from('handover_docs').update({ storage_path: stored } as never).eq('id', id).select('id')).data?.length;
}
export async function setHoField(id: string, key: 'name' | 'provider' | 'ref' | 'expiry_date' | 'maintenance', val: string): Promise<boolean> {
  return !!(await db.from('handover_docs').update({ [key]: val === '' ? null : val } as never).eq('id', id).select('id')).data?.length;
}
export async function deleteHoDoc(d: HoDoc): Promise<boolean> {
  if (!(await db.from('handover_docs').delete().eq('id', d.id).select('id')).data?.length) return false;
  if (d.storage_path) { try { await supabase.storage.from('mc-documents').remove([d.storage_path]); } catch { /* non-fatal */ } }
  return true;
}
export async function renameManual(me: Profile, id: string, name: string): Promise<boolean> {
  return !!(await db.from('handover_om_manuals').update({ name, updated_by: me.id } as never).eq('id', id).select('id')).data?.length;
}
