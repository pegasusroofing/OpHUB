import { createClient } from 'npm:@supabase/supabase-js@2';

// HR folder lock: an exact copy of app-native/src/lib/rules/hrLock.ts (review 15 Nov 2026, section 3 #5).
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
/** Would moving or copying this item carry the HR folder along (it is the HR folder, inside it, or holds it)? */
export function hrHolds(lock: HrLock | null, it: HrItem): boolean {
  if (!lock || !it) return false;
  if (hrInside(lock, it)) return true;
  if (lock.path === null) return false;
  const src = it.remoteItem?.parentReference ? it.remoteItem : it;
  const pp = hrNorm(src.parentReference?.path);
  if (pp === null) return false;
  const d = src.parentReference?.driveId;
  if (lock.driveId && d && d !== lock.driveId) return false;
  return lock.path.startsWith(`${pp}/${String(src.name ?? it.name ?? '').toLowerCase()}/`);
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
  const g = 'https://graph.microsoft.com/v1.0';
  const u = od.driveId ? `${g}/drives/${encodeURIComponent(od.driveId)}/items/${encodeURIComponent(od.id)}` : `${g}/me/drive/items/${encodeURIComponent(od.id)}`;
  let r: Response;
  try { r = await fetch(`${u}?$select=id,name,parentReference,root`, { headers: { Authorization: `Bearer ${msToken}` } }); } catch { throw new HrLockUnknown(); }
  // Gone (404), or the company sign-in isn't allowed to see it (403): nothing inside it can be reached, so the id
  // check is all that's needed, and the rest of OneDrive keeps working.
  if (r.status === 404 || r.status === 403) return lock;
  if (!r.ok) throw new HrLockUnknown();
  const it = (await r.json().catch(() => null)) as { name?: string; root?: unknown; parentReference?: { driveId?: string; path?: string } } | null;
  if (!it) throw new HrLockUnknown();
  lock.driveId = it.parentReference?.driveId || lock.driveId;
  const pp = hrNorm(it.parentReference?.path);
  lock.path = it.root ? '' : pp === null ? null : `${pp}/${String(it.name ?? '').toLowerCase()}`;
  return lock;
}
/** A OneDrive item by id, for the checks above: null if it doesn't exist or the company sign-in can't see it (so it
 *  can't be reached either); HrLockUnknown if Microsoft doesn't answer. */
export async function hrItem(msToken: string, driveId: string | null | undefined, itemId: string): Promise<HrItem> {
  const g = 'https://graph.microsoft.com/v1.0';
  const u = driveId ? `${g}/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}` : `${g}/me/drive/items/${encodeURIComponent(itemId)}`;
  let r: Response;
  try { r = await fetch(`${u}?$select=id,name,parentReference,remoteItem,root`, { headers: { Authorization: `Bearer ${msToken}` } }); } catch { throw new HrLockUnknown(); }
  if (r.status === 404 || r.status === 403) return null;
  if (!r.ok) throw new HrLockUnknown();
  const it = (await r.json().catch(() => null)) as HrItem;
  if (!it) throw new HrLockUnknown();
  return it;
}
export const HR_LOCKED = 'This is in the HR folder. Only the people HR › HR Access lets in can open it.';
export const HR_TRY_AGAIN = 'OneDrive didn’t answer about the HR folder, so this has been held back. Please try again in a minute.';
/** Microsoft couldn't say where the HR folder (or an item) is: refuse with HR_TRY_AGAIN. */
export class HrLockUnknown extends Error { constructor() { super(HR_TRY_AGAIN); this.name = 'HrLockUnknown'; } }
// ---- end HR folder lock ----

// ---- OpHUB storage path check (16 Nov 2026) ----
// supabase-js puts a storage path into the request address as it is, and
// fetch then reads %2e%2e as "..", a backslash as "/" and drops tabs and new
// lines - so a path with any of these could climb out of its folder (and the
// bucket) with the service key. No stored file has them. Every path from a
// request, a row or a parsed link passes this before it is used with storage.
const UNSAFE_STORAGE_PATH = /[%?#\\\u0000-\u001f\u007f]/;
function storagePathSafe(p: unknown): boolean {
  if (typeof p !== 'string' || !p || UNSAFE_STORAGE_PATH.test(p)) return false;
  return !p.split('/').some((seg) => seg === '' || seg === '.' || seg === '..');
}
// ---- end OpHUB storage path check ----

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, cache-control, pragma',
};

// #(cors-cache-pragma-fix) 2026-09-24: same class of bug as
// notify-site-assignment/notify-todo-assigned — the app's shared sbFetch()
// helper always sends Cache-Control/Pragma headers on every request
// (added to stop the Android WebView serving stale GETs from its HTTP
// cache), including on this function's POSTs. Those two headers weren't in
// this function's Access-Control-Allow-Headers, so the browser's CORS
// preflight (OPTIONS) succeeded but the browser then silently refused to
// send the actual POST at all — it never reached Supabase. That's exactly
// the "sync error" symptom reported from the Operatives page's Sync Now
// button, despite nothing showing up as an actual error server-side.

async function refreshIfNeeded(admin: any, conn: any){
  if (new Date(conn.expires_at).getTime() > Date.now() + 60000) return conn.access_token;
  const AZURE_CLIENT_ID = Deno.env.get('AZURE_CLIENT_ID');
  const AZURE_CLIENT_SECRET = Deno.env.get('AZURE_CLIENT_SECRET');
  const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: AZURE_CLIENT_ID!,
      client_secret: AZURE_CLIENT_SECRET!,
      refresh_token: conn.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok) { console.error('sync-operative-certification: token refresh failed', data); throw new Error('OneDrive sign-in needs reconnecting'); }
  const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString();
  await admin.from('onedrive_connections').update({ access_token: data.access_token, refresh_token: data.refresh_token || conn.refresh_token, expires_at: expiresAt }).eq('org_id', conn.org_id);
  return data.access_token;
}

function normalizeFileName(name: string){
  return String(name || '')
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .toLowerCase()
    .replace(/\s*[\(\[]\s*(copy|\d+)\s*[\)\]]\s*$/i, '')
    .replace(/\s*-\s*copy\s*$/i, '')
    .replace(/\s*v\d+\s*$/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function childrenUrl(driveId: string | null, folderId: string){
  return driveId
    ? `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(folderId)}/children?$select=id,name,file,folder,size,parentReference&$top=200`
    : `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(folderId)}/children?$select=id,name,file,folder,size,parentReference&$top=200`;
}

async function listFilesRecursive(accessToken: string, driveId: string | null, folderId: string, depth: number, hrLock: HrLock | null = null): Promise<any[]> {
  const res = await fetch(childrenUrl(driveId, folderId), { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) { console.error('sync-operative-certification: list failed', res.status, await res.text()); throw new Error('OneDrive list failed'); }
  const data = await res.json();
  // Nothing in (or is) the HR folder is listed for anyone HR › HR Access doesn't let in.
  const items = (data.value || []).filter((it: any) => !hrInside(hrLock, it));
  let files = items.filter((it: any) => it.file);
  if (depth > 0) {
    const folders = items.filter((it: any) => it.folder);
    for (const f of folders) {
      const nested = await listFilesRecursive(accessToken, f.parentReference?.driveId || driveId, f.id, depth - 1, hrLock);
      files = files.concat(nested);
    }
  }
  return files;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await callerClient.auth.getUser(token);
    if (userErr || !userData?.user) return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: caller } = await admin.from('profiles').select('role, org_id').eq('id', userData.user.id).maybeSingle();
    // Project managers/admins can sync (push+pull) any operative's folder from
    // their record. An operative themselves may also trigger the explicit
    // "push selected certificates to OneDrive" action from their own
    // Dashboard/Certifications view, but only for their own certificates —
    // never a pull, and never someone else's operative_id.
    const body = await req.json().catch(() => ({}));
    // 4 Nov 2026: manual_operative_id = an operative added by hand on the Operatives dashboard who hasn't
    // signed up yet. Same push / pull, against manual_operatives and certificates' manual_operative_id.
    const manualId = body.manual_operative_id ? String(body.manual_operative_id) : null;
    const operativeId = manualId ? null : body.operative_id;
    const explicitCertIds: string[] | null = Array.isArray(body.cert_ids) && body.cert_ids.length ? body.cert_ids.map(String) : null;
    const isSelfPush = !!explicitCertIds && !!caller && operativeId === userData.user.id;
    if (!caller || ((manualId || !isSelfPush) && caller.role !== 'pm' && caller.role !== 'admin')) {
      return new Response(JSON.stringify({ error: 'Forbidden — project managers and admins only' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!operativeId && !manualId) return new Response(JSON.stringify({ error: 'operative_id is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: operative } = manualId
      ? await admin.from('manual_operatives').select('id, name, org_id, onedrive_folder_id, onedrive_folder_name, onedrive_drive_id').eq('id', manualId).maybeSingle()
      : await admin.from('profiles').select('id, name, org_id, role, onedrive_folder_id, onedrive_folder_name, onedrive_drive_id').eq('id', operativeId).maybeSingle();
    const ownerCol = manualId ? 'manual_operative_id' : 'operative_id';
    const ownerId = manualId || operativeId;
    if (!operative || operative.org_id !== caller.org_id) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (!operative.onedrive_folder_id) return new Response(JSON.stringify({ error: 'Link a OneDrive folder for this operative first, from their record.' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: conn } = await admin.from('onedrive_connections').select('*').eq('org_id', caller.org_id).maybeSingle();
    if (!conn || !conn.access_token) return new Response(JSON.stringify({ error: "OneDrive isn't connected for your company yet." }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const accessToken = await refreshIfNeeded(admin, conn);
    const folder = { id: operative.onedrive_folder_id, driveId: operative.onedrive_drive_id || null, name: operative.onedrive_folder_name };

    // HR folder lock (review 15 Nov 2026, section 3 #5): an operative's folder is chosen in the app, so it could be the
    // HR folder, a folder inside it, or the folder that holds it. Nothing is pulled from or pushed into the HR folder by
    // anyone HR › HR Access doesn't let in.
    let hrLock: HrLock | null;
    try {
      hrLock = await hrLockFor(admin, caller.org_id, accessToken, SUPABASE_URL, String(ANON_KEY), token);
      if (hrLock && hrInside(hrLock, await hrItem(accessToken, folder.driveId, folder.id))) return new Response(JSON.stringify({ error: HR_LOCKED }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } catch (e) { if (e instanceof HrLockUnknown) return new Response(JSON.stringify({ error: HR_TRY_AGAIN }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); throw e; }

    // ---- PUSH ----
    // #337: pushing to OneDrive is no longer automatic on every sync. A
    // phone-uploaded certificate (source='upload') sits as "not yet pushed"
    // until the user explicitly multi-selects it and fires the "Upload to
    // OneDrive" bulk action, which calls this function with `cert_ids` set —
    // only those rows get pushed. A plain sync call (no cert_ids) does a
    // PULL only and pushes nothing, so newly uploaded phone files stay put
    // until deliberately sent up.
    let pushed = 0;
    if (explicitCertIds) {
      const { data: toPush } = await admin.from('operative_certifications').select('*').in('id', explicitCertIds).eq(ownerCol, ownerId).eq('source', 'upload').is('item_id', null);
      for (const row of toPush || []) {
        try {
          if (!storagePathSafe(row.storage_path)) continue;
          const dlRes = await admin.storage.from('certifications').download(row.storage_path);
          if (dlRes.error || !dlRes.data) continue;
          const buf = new Uint8Array(await dlRes.data.arrayBuffer());
          const uploadUrl = folder.driveId
            ? `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(folder.driveId)}/items/${encodeURIComponent(folder.id)}:/${encodeURIComponent(row.name)}:/content`
            : `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(folder.id)}:/${encodeURIComponent(row.name)}:/content`;
          const putRes = await fetch(uploadUrl, { method: 'PUT', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/octet-stream' }, body: buf });
          if (!putRes.ok) continue;
          const putData = await putRes.json();
          await admin.from('operative_certifications').update({ item_id: putData.id, drive_id: putData.parentReference?.driveId || folder.driveId || null, synced_at: new Date().toISOString(), pushed_to_onedrive_at: new Date().toISOString() }).eq('id', row.id);
          pushed++;
        } catch (_e) { /* skip this file, keep going */ }
      }

      // An explicit push call is push-only — it does not also pull, so the
      // count returned is exactly what the user asked to send up.
      return new Response(JSON.stringify({ ok: true, pushed, pulled: 0, folderName: folder.name }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ---- PULL: OneDrive files not yet in OpHUB (recurse one level so files
    // moved into a subfolder inside the operative's folder still get picked up) ----
    const files = await listFilesRecursive(accessToken, folder.driveId, folder.id, 1, hrLock);
    const { data: existing } = await admin.from('operative_certifications').select('item_id, name').eq(ownerCol, ownerId);
    const alreadyIds = new Set((existing || []).map((r: any) => r.item_id).filter(Boolean));
    const alreadyNames = new Set((existing || []).map((r: any) => normalizeFileName(r.name)));
    const toImport = files.filter((f: any) => !alreadyIds.has(f.id) && !alreadyNames.has(normalizeFileName(f.name)));

    let pulled = 0;
    const importedNamesThisRun = new Set();
    for (const f of toImport) {
      try {
        const norm = normalizeFileName(f.name);
        if (importedNamesThisRun.has(norm)) continue;
        if ((f.size || 0) > 20 * 1024 * 1024) continue;
        const driveIdForItem = f.parentReference?.driveId || folder.driveId || null;
        const contentUrl = driveIdForItem
          ? `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveIdForItem)}/items/${encodeURIComponent(f.id)}/content`
          : `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(f.id)}/content`;
        const fileRes = await fetch(contentUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (!fileRes.ok) continue;
        const buf = new Uint8Array(await fileRes.arrayBuffer());
        const safeName = (f.name || 'file').replace(/[^a-zA-Z0-9.\-]+/g, '_');
        const storagePath = `${operative.org_id}/${manualId ? 'm-' + manualId : operativeId}/${f.id}-${safeName}`;
        const { error: upErr } = await admin.storage.from('certifications').upload(storagePath, buf, { contentType: 'application/octet-stream', upsert: true });
        if (upErr) continue;
        await admin.from('operative_certifications').insert({
          org_id: operative.org_id, operative_id: operativeId, manual_operative_id: manualId, category: 'other', name: f.name,
          item_id: f.id, drive_id: driveIdForItem, storage_path: storagePath, size: f.size || null,
          source: 'onedrive', synced_at: new Date().toISOString(),
        });
        importedNamesThisRun.add(norm);
        pulled++;
      } catch (_e) { /* skip this file, keep going */ }
    }

    await admin.from(manualId ? 'manual_operatives' : 'profiles').update({ onedrive_last_synced_at: new Date().toISOString() }).eq('id', ownerId);

    return new Response(JSON.stringify({ ok: true, pushed, pulled, folderName: folder.name }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('sync-operative-certification failed', e);
    return new Response(JSON.stringify({ error: 'Something went wrong syncing with OneDrive — please try again.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
