import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-user-token, cache-control, pragma',
};

// ---- CORS allow-list (security review L8, 25 Oct 2026) ----
// Only the OpHUB web app (live domain, Vercel production + preview URLs) and
// the phone apps get a CORS grant; every other website's browser is refused.
// Calls with no Origin header (cron, Power Automate, server-to-server) are
// not affected by CORS at all. withCors() sets the header on every response
// the handler returns, so the code below can keep using corsHeaders as before.
const OPHUB_ORIGINS = new Set([
  'https://operativehub.co.uk',
  'https://www.operativehub.co.uk',
  'https://ophub-ten.vercel.app',
  'capacitor://localhost',
  'https://localhost',
  'http://localhost',
]);
function ophubOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  if (OPHUB_ORIGINS.has(origin)) return true;
  if (/^https:\/\/ophub-[a-z0-9-]+-op-hub\.vercel\.app$/.test(origin)) return true; // Vercel preview deployments
  if (/^http:\/\/localhost:\d{2,5}$/.test(origin)) return true; // local dev server
  return false;
}
function withCors(handler: (req: Request) => Response | Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    const res = await handler(req);
    const origin = req.headers.get('Origin');
    const headers = new Headers(res.headers);
    headers.delete('Access-Control-Allow-Origin');
    if (ophubOriginAllowed(origin)) headers.set('Access-Control-Allow-Origin', origin as string);
    headers.append('Vary', 'Origin');
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  };
}
// ---- end CORS allow-list ----

function b64urlDecode(str: string): string {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return atob(str);
}
function getUserIdFromToken(token: string): string | null {
  try {
    const payload = token.split('.')[1];
    const json = JSON.parse(b64urlDecode(payload));
    return json.sub || null;
  } catch (_e) {
    return null;
  }
}
// Matches onedrive-list-folders' getCallerProfile (see #(onedrive-caller-profile-id-fix))
// — scoped to exactly the caller's own row via the JWT's `sub` claim, not
// "whichever profile RLS happens to return first".
async function getCallerProfile(SUPABASE_URL: string, ANON_KEY: string, token: string) {
  const uid = getUserIdFromToken(token);
  if (!uid) return null;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=id,org_id,role&id=eq.${uid}`, {
    headers: { Authorization: `Bearer ${token}`, apikey: ANON_KEY },
  });
  if (!res.ok) return null;
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

// M8 (25 Oct 2026): has_site_access() run as the caller (their own JWT), so
// it is exactly the rule the database uses: site in the caller's company and
// they are assigned to it, or they are a PM / admin.
async function hasSiteAccess(SUPABASE_URL: string, ANON_KEY: string, token: string, siteId: string): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/has_site_access`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_site_id: siteId }),
    });
    if (!res.ok) return false;
    return (await res.json().catch(() => false)) === true;
  } catch (_e) { return false; }
}
// M8: a folder id a non-manager sends is only used if OpHUB itself has it
// linked to one of their company's sites (main / inductions / material
// orders folder) or repair jobs - and the drive id stored with it is used,
// never the caller's.
async function linkedFolder(admin: any, orgId: string, folderId: string): Promise<{ site_id: string; folder_id: string; drive_id: string | null } | null> {
  const cols: [string, string][] = [['onedrive_folder_id', 'onedrive_drive_id'], ['site_inductions_folder_id', 'site_inductions_drive_id'], ['material_orders_folder_id', 'material_orders_drive_id']];
  for (const [fc, dc] of cols) {
    const { data } = await admin.from('sites').select(`id, ${dc}`).eq('org_id', orgId).eq(fc, folderId).limit(1);
    if (data && data[0]) return { site_id: data[0].id, folder_id: folderId, drive_id: data[0][dc] || null };
  }
  const { data: jobs } = await admin.from('repair_jobs').select('site_id, onedrive_drive_id').eq('org_id', orgId).eq('onedrive_folder_id', folderId).limit(1);
  if (jobs && jobs[0] && jobs[0].site_id) return { site_id: jobs[0].site_id, folder_id: folderId, drive_id: jobs[0].onedrive_drive_id || null };
  return null;
}
// M8: file / folder names can't climb out of the target folder. "/" is still
// allowed as a sub-folder separator (the app files repair-job photos as
// "Survey/photo.jpg" etc.), but "..", "." and empty parts are dropped,
// "\" and control characters are replaced, and the depth is capped.
function cleanSegment(s: unknown): string {
  return String(s ?? '').replace(/[\\\u0000-\u001f]+/g, '_').replace(/[:*?"<>|]+/g, '-').replace(/\.{2,}/g, '.').trim().replace(/^\.+$/, '');
}
function cleanRelPath(p: unknown, maxDepth: number): string {
  return String(p ?? '').split('/').map(cleanSegment).filter(Boolean).slice(-maxDepth).join('/');
}

async function refreshIfNeeded(admin: any, conn: any) {
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
  if (!res.ok) throw new Error('Token refresh failed: ' + JSON.stringify(data));
  const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString();
  await admin.from('onedrive_connections').update({ access_token: data.access_token, refresh_token: data.refresh_token || conn.refresh_token, expires_at: expiresAt }).eq('org_id', conn.org_id);
  return data.access_token;
}

// HR folder lock (Andy, 15 Nov 2026): exact copy of app-native/src/lib/rules/hrLock.ts (hrLock.test.ts checks it).
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
  if (r.status === 404) return null; // the HR folder is gone: nothing to lock
  if (!r.ok) throw new HrLockUnknown();
  const it = (await r.json().catch(() => null)) as { name?: string; root?: unknown; parentReference?: { driveId?: string; path?: string } } | null;
  if (!it) throw new HrLockUnknown();
  lock.driveId = it.parentReference?.driveId || lock.driveId;
  const pp = hrNorm(it.parentReference?.path);
  lock.path = it.root ? '' : pp === null ? null : `${pp}/${String(it.name ?? '').toLowerCase()}`;
  return lock;
}
/** A OneDrive item by id, for the checks above: null if it doesn't exist; HrLockUnknown if Microsoft doesn't answer. */
export async function hrItem(msToken: string, driveId: string | null | undefined, itemId: string): Promise<HrItem> {
  const g = 'https://graph.microsoft.com/v1.0';
  const u = driveId ? `${g}/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}` : `${g}/me/drive/items/${encodeURIComponent(itemId)}`;
  let r: Response;
  try { r = await fetch(`${u}?$select=id,name,parentReference,remoteItem,root`, { headers: { Authorization: `Bearer ${msToken}` } }); } catch { throw new HrLockUnknown(); }
  if (r.status === 404) return null;
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

// Microsoft Graph's simple "PUT .../content" upload only accepts files up
// to 4MB — anything bigger goes through Graph's resumable upload session
// instead, which has no such size cap. See
// #(repair-job-survey-pdf-onedrive-size-limit) 2026-10-02.
const LARGE_UPLOAD_THRESHOLD = 3.5 * 1024 * 1024;
// Graph requires each chunk (other than the last) to be a multiple of
// 327,680 bytes (320 KiB).
const CHUNK_SIZE = 327680 * 10; // 3,276,800 bytes (~3.125MB)

async function uploadViaSession(createSessionUrl: string, accessToken: string, bytes: Uint8Array, conflict = 'replace'): Promise<Response> {
  const sessionRes = await fetch(createSessionUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': conflict } }),
  });
  if (!sessionRes.ok) {
    const errText = await sessionRes.text();
    console.error('onedrive-upload: session failed', sessionRes.status, errText);
    return new Response(JSON.stringify({ error: 'OneDrive upload session failed' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  const session = await sessionRes.json();
  const uploadUrl = session.uploadUrl;
  const total = bytes.length;
  let offset = 0;
  let lastRes: globalThis.Response | null = null;
  while (offset < total) {
    const end = Math.min(offset + CHUNK_SIZE, total);
    const chunk = bytes.subarray(offset, end);
    // The upload-session URL is pre-authenticated — Graph rejects chunk
    // requests that also carry an Authorization header.
    lastRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': String(end - offset),
        'Content-Range': `bytes ${offset}-${end - 1}/${total}`,
      },
      body: chunk as unknown as BodyInit,
    });
    if (!lastRes.ok && lastRes.status !== 202) {
      const errText = await lastRes.text();
      console.error('onedrive-upload: chunk failed', lastRes.status, errText);
      return new Response(JSON.stringify({ error: 'OneDrive chunked upload failed' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    offset = end;
  }
  return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(withCors(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    // #(onedrive-authheader-hang): the client sends the user's token in
    // X-User-Token (Authorization carries only the anon key).
    const token = req.headers.get('X-User-Token') || (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

    const callerProfile = await getCallerProfile(SUPABASE_URL, ANON_KEY, token);
    if (!callerProfile?.org_id) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: conn } = await admin.from('onedrive_connections').select('*').eq('org_id', callerProfile.org_id).maybeSingle();
    if (!conn || !conn.access_token) {
      return new Response(JSON.stringify({ error: 'not_connected' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json().catch(() => ({}));
    const { filename, content_base64, storage_path, photo_path, subfolder, site_id, folder_id, drive_id } = body;
    if (!filename || (!content_base64 && !storage_path && !photo_path)) return new Response(JSON.stringify({ error: 'filename and content_base64 (or storage_path / photo_path) are required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    // M8: PMs / admins keep full control (any folder_id / drive_id, replace
    // on a name clash). Everyone else: only folders OpHUB has linked to a
    // site they can access, never overwrite (Graph renames on a clash).
    const isManager = ['pm', 'admin'].includes(String(callerProfile.role || ''));
    const conflict = isManager ? 'replace' : 'rename';
    const safeName = cleanRelPath(filename, isManager ? 8 : 4);
    if (!safeName) return new Response(JSON.stringify({ error: 'filename is not valid' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // #(onedrive-big-file-via-storage) 2026-10-11: big files (a 170-photo
    // report PDF) froze the phone turning them into base64 text. The app now
    // uploads those to Storage first (mc-documents/onedrive-tmp/<org>/...) and
    // passes the path; the file is fetched here and the temp copy removed.
    // #(onedrive-photo-path) 2026-10-13: Schedule of Works photos are
    // already in site-photos (<site_id>/schedule/...). The phone passes that
    // path instead of sending the photo a second time as base64 — halves
    // the data a site phone has to push per photo. Kept (not removed).
    let bytes: Uint8Array;
    if (photo_path) {
      if (typeof photo_path !== 'string' || photo_path.includes('..')) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const photoSiteId = photo_path.split('/')[0];
      const { data: ps } = await admin.from('sites').select('org_id').eq('id', photoSiteId).maybeSingle();
      if (!ps || ps.org_id !== callerProfile.org_id || (!isManager && !(await hasSiteAccess(SUPABASE_URL, ANON_KEY, token, photoSiteId)))) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const { data: blob, error: dlErr } = await admin.storage.from('site-photos').download(photo_path);
      if (dlErr || !blob) return new Response(JSON.stringify({ error: 'Could not read the photo' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      bytes = new Uint8Array(await blob.arrayBuffer());
    } else if (storage_path) {
      const prefix = `onedrive-tmp/${callerProfile.org_id}/`;
      if (typeof storage_path !== 'string' || !storage_path.startsWith(prefix) || storage_path.includes('..')) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const { data: blob, error: dlErr } = await admin.storage.from('mc-documents').download(storage_path);
      if (dlErr || !blob) return new Response(JSON.stringify({ error: 'Could not read the uploaded file' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      bytes = new Uint8Array(await blob.arrayBuffer());
    } else {
      bytes = Uint8Array.from(atob(content_base64), c => c.charCodeAt(0));
    }
    const cleanup = async () => { if (storage_path && !photo_path) { try { await admin.storage.from('mc-documents').remove([storage_path]); } catch (_e) { /* ignore */ } } };

    const accessToken = await refreshIfNeeded(admin, conn);

    // Site linked to an existing OneDrive folder → upload into it by ID;
    // otherwise an auto-created subfolder under the company's root folder.
    // A caller can also pass folder_id/drive_id directly.
    let site: any = { onedrive_folder_id: null, onedrive_drive_id: null };
    let folderResolved = false;
    if (folder_id && isManager) {
      site = { onedrive_folder_id: folder_id, onedrive_drive_id: drive_id || null };
      folderResolved = true;
    } else if (folder_id && typeof folder_id === 'string') {
      const lf = await linkedFolder(admin, callerProfile.org_id, folder_id);
      if (lf && await hasSiteAccess(SUPABASE_URL, ANON_KEY, token, lf.site_id)) {
        site = { onedrive_folder_id: lf.folder_id, onedrive_drive_id: lf.drive_id };
        folderResolved = true;
      }
    }
    if (!folderResolved && site_id) {
      const { data } = await admin.from('sites').select('name, org_id, onedrive_folder_id, onedrive_drive_id').eq('id', site_id).maybeSingle();
      if (data && data.org_id === callerProfile.org_id && (isManager || await hasSiteAccess(SUPABASE_URL, ANON_KEY, token, String(site_id)))) { site = data; folderResolved = true; }
      else if (!isManager) { await cleanup(); return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
    }
    // A non-manager with no site / linked folder (the PDF viewer's "Save to
    // OneDrive" outside a project) can only use the shared Company Exports folder.
    if (!folderResolved && !isManager && folder_id) { await cleanup(); return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
    const safeSub = isManager ? cleanRelPath(subfolder, 4) : (folderResolved ? '' : 'Company Exports');

    const encodePath = (p: string) => String(p).split('/').filter(Boolean).map(encodeURIComponent).join('/');

    let itemBaseUrl: string;
    let pathFolder: string | null = null; // the folder (from the top of the company's own drive) when saving by path
    if (site?.onedrive_folder_id && site?.onedrive_drive_id) {
      const path = encodePath(safeName);
      itemBaseUrl = `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(site.onedrive_drive_id)}/items/${encodeURIComponent(site.onedrive_folder_id)}:/${path}`;
    } else if (site?.onedrive_folder_id) {
      const path = encodePath(safeName);
      itemBaseUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(site.onedrive_folder_id)}:/${path}`;
    } else {
      const folderName = safeSub || cleanSegment(site?.name);
      const folder = (conn.folder_path || 'OpHUB Progress Reports') + (folderName ? '/' + folderName : '');
      pathFolder = folder;
      const path = encodePath(`${folder}/${safeName}`);
      itemBaseUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${path}`;
    }

    // HR folder lock (15 Nov 2026): nothing is saved into the HR folder by anyone HR › HR Access doesn't let in.
    let hrLock: HrLock | null;
    try { hrLock = await hrLockFor(admin, callerProfile.org_id, accessToken, SUPABASE_URL, ANON_KEY, token); }
    catch (e) { if (e instanceof HrLockUnknown) { await cleanup(); return new Response(JSON.stringify({ error: HR_TRY_AGAIN }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); } throw e; }
    if (hrLock) {
      const dir = hrRel(safeName.split('/').slice(0, -1).join('/'));
      let verdict: 'ok' | 'hr' | 'unknown' = 'ok';
      try {
        if (pathFolder === null) {
          const u = site.onedrive_drive_id
            ? `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(site.onedrive_drive_id)}/items/${encodeURIComponent(site.onedrive_folder_id)}`
            : `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(site.onedrive_folder_id)}`;
          const r = await fetch(`${u}?$select=id,name,parentReference,remoteItem,root`, { headers: { Authorization: `Bearer ${accessToken}` } });
          if (!r.ok) verdict = 'unknown';
          else {
            const f = await r.json();
            const pp = f.root ? '' : hrNorm(f.parentReference?.path);
            const full = pp === null ? null : (f.root ? '' : `${pp}/${String(f.name || '').toLowerCase()}`) + dir;
            if (hrInside(hrLock, f) || hrPathInside(hrLock, f.parentReference?.driveId, full)) verdict = 'hr';
          }
        } else {
          const r = await fetch('https://graph.microsoft.com/v1.0/me/drive?$select=id', { headers: { Authorization: `Bearer ${accessToken}` } });
          const myDrive = r.ok ? (await r.json()).id : null;
          if (hrPathInside(hrLock, myDrive, hrRel(pathFolder) + dir)) verdict = 'hr';
        }
      } catch (_e) { verdict = 'unknown'; }
      if (verdict !== 'ok') {
        await cleanup();
        return new Response(JSON.stringify({ error: verdict === 'hr' ? HR_LOCKED : HR_TRY_AGAIN }), { status: verdict === 'hr' ? 403 : 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    if (bytes.length > LARGE_UPLOAD_THRESHOLD) {
      const r = await uploadViaSession(`${itemBaseUrl}:/createUploadSession`, accessToken, bytes, conflict);
      await cleanup();
      return r;
    }

    const uploadRes = await fetch(`${itemBaseUrl}:/content` + (conflict === 'replace' ? '' : '?@microsoft.graph.conflictBehavior=' + conflict), {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/octet-stream' },
      body: bytes as unknown as BodyInit,
    });
    await cleanup();
    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.error('onedrive-upload: upload failed', uploadRes.status, errText);
      return new Response(JSON.stringify({ error: 'OneDrive upload failed' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('onedrive-upload failed', e);
    return new Response(JSON.stringify({ error: 'OneDrive upload failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}));
