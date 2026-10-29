// OneDrive (300 connect/status, 310 folder picker): the company connection
// (the sign-in tokens never come to the app — onedrive_status says whether
// it works), browsing folders through onedrive-list-folders, linking a
// folder to a project / repair job / operative, and the pinned Quick Links.
import { useQuery } from '@tanstack/react-query';
import { Linking, Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
const rpc = supabase.rpc.bind(supabase) as unknown as (n: string, a: object) => Promise<{ data: unknown; error: unknown }>;
export type OdStatus = { exists: boolean; connected: boolean; needs_reconnect: boolean; reason?: string; account_email?: string; folder_path?: string } | null;
export type OdFolder = { id: string; name: string; driveId?: string | null; virtual?: boolean; isSite?: boolean };
export type OdTarget = 'progress' | 'materials' | 'siteinductions' | 'repairjob' | 'operative' | 'quicklink';
export const SHARED_ROOT = '__SHARED__', SITES_ROOT = '__SITES__';

export async function oneDriveStatus(orgId: string | null): Promise<OdStatus> {
  try { const r = await rpc('onedrive_status', {}); if (!r.error) { const d = r.data as OdStatus; return d && d.exists ? d : null; } } catch { /* fall back */ }
  if (!orgId) return null;
  const row = (await db.from('onedrive_connections').select('org_id,account_email,folder_path,connected_at').eq('org_id', orgId).maybeSingle()).data as Record<string, string> | null;
  return row ? { exists: true, connected: true, needs_reconnect: false, ...row } : null;
}
export const useOneDriveStatus = (orgId: string | null | undefined) => useQuery({ queryKey: ['odStatus', orgId], enabled: !!orgId, queryFn: () => oneDriveStatus(orgId ?? null) });

/** Starts the Microsoft sign-in: same tab on the web, the phone's browser in the app. */
export async function connectOneDrive(): Promise<string | null> {
  const web = Platform.OS === 'web';
  const r = await supabase.functions.invoke('onedrive-oauth-start', { body: { native: !web, origin: web ? window.location.origin : null } });
  const d = r.data as { url?: string; error?: string } | null;
  if (r.error || !d?.url) return d?.error || 'Could not start OneDrive connection.';
  if (web) window.location.href = d.url; else await Linking.openURL(d.url);
  return null;
}
export const disconnectOneDrive = async (orgId: string) => !(await db.from('onedrive_connections').delete().eq('org_id', orgId)).error;

/** One level of folders. At the very top, "Shared with me" and "Company Sites" are offered too. */
export async function listFolders(at: OdFolder | null): Promise<{ folders: OdFolder[]; error?: string }> {
  const body = !at ? { parent_id: null } : at.id === SHARED_ROOT ? { shared: true } : at.id === SITES_ROOT ? { companySites: true } : at.isSite ? { company_site_id: at.id } : at.driveId ? { parent_id: at.id, drive_id: at.driveId } : { parent_id: at.id };
  try {
    const r = await supabase.functions.invoke('onedrive-list-folders', { body });
    const d = r.data as { folders?: OdFolder[]; error?: string } | null;
    if (r.error || d?.error) return { folders: [], error: d?.error || 'Could not load OneDrive folders.' };
    const folders = d?.folders || [];
    return { folders: at ? folders : [{ id: SHARED_ROOT, name: '🔗 Shared with me', virtual: true }, { id: SITES_ROOT, name: '🏢 Company Sites', virtual: true }, ...folders] };
  } catch { return { folders: [], error: 'Could not reach OneDrive.' }; }
}
/** Links the chosen folder to whatever the picker was opened for. */
export async function linkFolder(target: OdTarget, id: string, f: { id: string; name: string; driveId?: string | null }): Promise<boolean> {
  const d = f.driveId || null;
  if (target === 'repairjob') return !(await db.from('repair_jobs').update({ onedrive_folder_id: f.id, onedrive_folder_name: f.name, onedrive_drive_id: d } as never).eq('id', id)).error;
  if (target === 'operative') return !(await db.from('profiles').update({ onedrive_folder_id: f.id, onedrive_folder_name: f.name, onedrive_drive_id: d, onedrive_last_synced_at: null } as never).eq('id', id)).error;
  const patch = target === 'materials' ? { material_orders_folder_id: f.id, material_orders_folder_name: f.name, material_orders_drive_id: d }
    : target === 'siteinductions' ? { site_inductions_folder_id: f.id, site_inductions_folder_name: f.name, site_inductions_drive_id: d }
    : { onedrive_folder_id: f.id, onedrive_folder_name: f.name, onedrive_drive_id: d };
  return !(await db.from('sites').update(patch as never).eq('id', id)).error;
}
export async function unlinkFolder(target: OdTarget, id: string): Promise<boolean> {
  if (target === 'operative') return !(await db.from('profiles').update({ onedrive_folder_id: null, onedrive_folder_name: null, onedrive_drive_id: null } as never).eq('id', id)).error;
  if (target === 'repairjob') return !(await db.from('repair_jobs').update({ onedrive_folder_id: null, onedrive_folder_name: null, onedrive_drive_id: null } as never).eq('id', id)).error;
  const patch = target === 'materials' ? { material_orders_folder_id: null, material_orders_folder_name: null, material_orders_drive_id: null }
    : target === 'siteinductions' ? { site_inductions_folder_id: null, site_inductions_folder_name: null, site_inductions_drive_id: null }
    : { onedrive_folder_id: null, onedrive_folder_name: null, onedrive_drive_id: null };
  return !(await db.from('sites').update(patch as never).eq('id', id)).error;
}
export type QuickLink = { id: string; name: string; driveId: string | null };
export async function loadQuickLinks(orgId: string): Promise<QuickLink[]> {
  return (((await db.from('organizations').select('onedrive_pinned_folders').eq('id', orgId).maybeSingle()).data as { onedrive_pinned_folders: QuickLink[] | null } | null)?.onedrive_pinned_folders) ?? [];
}
export const useQuickLinks = (orgId: string | null | undefined) => useQuery({ queryKey: ['odQuick', orgId], enabled: !!orgId, queryFn: () => loadQuickLinks(orgId as string) });
export async function setQuickLinks(orgId: string, next: QuickLink[]): Promise<boolean> {
  return !(await db.from('organizations').update({ onedrive_pinned_folders: next } as never).eq('id', orgId)).error;
}
export type OdSite = { id: string; name: string; onedrive_folder_id: string | null; onedrive_folder_name: string | null; material_orders_folder_id: string | null; material_orders_folder_name: string | null; site_inductions_folder_id: string | null; site_inductions_folder_name: string | null; onedrive_last_synced_at: string | null };
export const useOdSites = (orgId: string | null | undefined) => useQuery({ queryKey: ['odSites', orgId], enabled: !!orgId, queryFn: async () => ((await db.from('sites').select('id,name,onedrive_folder_id,onedrive_folder_name,material_orders_folder_id,material_orders_folder_name,site_inductions_folder_id,site_inductions_folder_name,onedrive_last_synced_at').eq('org_id', orgId as string).order('name')).data as OdSite[] | null) ?? [] });
