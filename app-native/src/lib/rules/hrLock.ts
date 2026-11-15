// HR folder lock (Andy, 15 Nov 2026: "I want to have hr linked to a specific folder in the OneDrive where access is
// managed, but also I need it to be clear in the app who could have access to it"). OpHUB reaches OneDrive through the
// one company Microsoft sign-in, which can see the HR folder. So the OneDrive server functions lock it: the HR folder
// HR › HR Access links to (hr_secure_settings.onedrive), and everything inside it, is left out of folder lists and
// can't be listed, opened or saved into by anyone HR Access doesn't let in (hr_is_team(), asked as the caller).
// onedrive-list-folders, onedrive-download-file and onedrive-upload carry an exact copy of the block
// below (Deno can't import from the app); hrLock.test.ts checks every copy matches this one.
// ---- HR folder lock ----
export type HrLock = { id: string; driveId: string | null; path: string | null };
type HrRef = { driveId?: string; path?: string } | undefined;
type HrItem = { id?: string; name?: string; parentReference?: HrRef; remoteItem?: { id?: string; name?: string; parentReference?: HrRef } } | null | undefined;
type HrDb = { from: (t: string) => { select: (c: string) => { eq: (k: string, v: string) => { maybeSingle: () => PromiseLike<{ data: unknown }> } } } };
/** A Graph parentReference.path ("/drives/x/root:/A/B") as "/a/b" ("" for the top of the drive); null if it isn't one. */
export function hrNorm(p: unknown): string | null {
  const s = String(p ?? '');
  const i = s.indexOf('root:');
  if (i < 0) return null;
  let r = s.slice(i + 5);
  try { r = decodeURIComponent(r); } catch { /* keep it as it is */ }
  return r.replace(/\/+$/, '').toLowerCase();
}
/** A folder path relative to the top of a drive ("A/B/") the way hrNorm gives them ("/a/b"). */
export function hrRel(p: string): string {
  const parts = String(p ?? '').split('/').filter(Boolean);
  return parts.length ? ('/' + parts.join('/')).toLowerCase() : '';
}
/** Is this folder (its drive and path, as hrNorm gives it) the HR folder or inside it? */
export function hrPathInside(lock: HrLock | null, driveId: string | null | undefined, path: string | null): boolean {
  if (!lock || lock.path === null || path === null) return false;
  if (lock.driveId && driveId && driveId !== lock.driveId) return false;
  return lock.path === '' || path === lock.path || path.startsWith(lock.path + '/');
}
/** Is this Graph item the HR folder or inside it? */
export function hrInside(lock: HrLock | null, it: HrItem): boolean {
  if (!lock || !it) return false;
  if (it.id === lock.id || it.remoteItem?.id === lock.id) return true;
  const src = it.remoteItem?.parentReference ? it.remoteItem : it;
  const pp = hrNorm(src.parentReference?.path);
  return pp !== null && hrPathInside(lock, src.parentReference?.driveId, `${pp}/${String(src.name ?? it.name ?? '').toLowerCase()}`);
}
/** One folder's contents from Graph: is that folder the HR folder or inside it? */
export function hrListingInside(lock: HrLock | null, parentId: string | null | undefined, children: HrItem[]): boolean {
  if (!lock) return false;
  if (parentId && parentId === lock.id) return true;
  return children.some((c) => hrPathInside(lock, c?.parentReference?.driveId, hrNorm(c?.parentReference?.path)));
}
/** The company's HR folder lock for this caller: null when there's no HR folder or HR Access lets them in. */
export async function hrLockFor(db: HrDb, orgId: string, msToken: string, supabaseUrl: string, anonKey: string, userToken: string): Promise<HrLock | null> {
  const { data } = await db.from('hr_secure_settings').select('onedrive').eq('org_id', orgId).maybeSingle();
  const od = (data as { onedrive?: { id?: string; driveId?: string | null } | null } | null)?.onedrive;
  if (!od?.id) return null;
  // Asked as the caller, so it's the database's own rule.
  try {
    const r = await fetch(`${supabaseUrl}/rest/v1/rpc/hr_is_team`, { method: 'POST', headers: { Authorization: `Bearer ${userToken}`, apikey: anonKey, 'Content-Type': 'application/json' }, body: '{}' });
    if (r.ok && (await r.json().catch(() => false)) === true) return null;
  } catch { /* not let in */ }
  const lock: HrLock = { id: od.id, driveId: od.driveId || null, path: null };
  try {
    const g = 'https://graph.microsoft.com/v1.0';
    const u = od.driveId ? `${g}/drives/${encodeURIComponent(od.driveId)}/items/${encodeURIComponent(od.id)}` : `${g}/me/drive/items/${encodeURIComponent(od.id)}`;
    const r = await fetch(`${u}?$select=id,name,parentReference,root`, { headers: { Authorization: `Bearer ${msToken}` } });
    if (r.ok) {
      const it = (await r.json()) as { name?: string; root?: unknown; parentReference?: { driveId?: string; path?: string } };
      lock.driveId = it.parentReference?.driveId || lock.driveId;
      const pp = hrNorm(it.parentReference?.path);
      lock.path = it.root ? '' : pp === null ? null : `${pp}/${String(it.name ?? '').toLowerCase()}`;
    }
  } catch { /* the id check still applies */ }
  return lock;
}
export const HR_LOCKED = 'This is in the HR folder. Only the people HR › HR Access lets in can open it.';
// ---- end HR folder lock ----
