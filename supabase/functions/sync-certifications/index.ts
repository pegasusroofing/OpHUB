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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

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
  if (!res.ok) throw new Error('Token refresh failed: ' + JSON.stringify(data));
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

// Pulls whatever files currently sit in an org's linked "Certifications"
// OneDrive folder into OpHUB (Supabase Storage + certification_files),
// skipping anything already imported. Flat folder only — no sub-folders,
// mirroring the small handful of certificate documents companies actually
// keep there. Two ways in: a daily pg_cron job (x-cron-secret header, no
// body, every org with a folder linked) or an on-demand "Sync Now" from the
// app (normal user JWT + no body, syncs just the caller's org).
// HR folder lock (review 15 Nov 2026, section 3 #5): the company's Certifications folder is chosen in the app, so it
// could be pointed at the HR folder. Its files would then be copied into the certifications store, which PMs can open.
// So the folder (and any shortcut in it) is checked against the HR folder first. hrLock null = no HR folder, or the
// caller is let in by HR › HR Access.
async function syncOneOrg(admin: any, org: any, accessToken: string, hrLock: HrLock | null = null){
  if (hrLock && hrInside(hrLock, await hrItem(accessToken, org.certifications_drive_id || null, org.certifications_folder_id))) return { org_id: org.id, error: HR_LOCKED };
  const graphUrl = org.certifications_drive_id
    ? `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(org.certifications_drive_id)}/items/${encodeURIComponent(org.certifications_folder_id)}/children?$select=id,name,file,size,lastModifiedDateTime,parentReference,remoteItem&$top=200`
    : `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(org.certifications_folder_id)}/children?$select=id,name,file,size,lastModifiedDateTime,parentReference,remoteItem&$top=200`;
  const listRes = await fetch(graphUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!listRes.ok) return { org_id: org.id, error: 'OneDrive list failed: ' + await listRes.text() };
  const listData = await listRes.json();
  const files = (listData.value || []).filter((it: any) => it.file && !it.folder && !hrInside(hrLock, it));
  if (!files.length) return { org_id: org.id, synced: 0 };

  const { data: existing } = await admin.from('certification_files').select('item_id, name').eq('org_id', org.id);
  const alreadyIds = new Set((existing || []).map((r: any) => r.item_id));
  const alreadyNames = new Set((existing || []).map((r: any) => normalizeFileName(r.name)));
  const toImport = files.filter((f: any) => !alreadyIds.has(f.id) && !alreadyNames.has(normalizeFileName(f.name)));
  const dupSkipped = files.length - toImport.length;
  if (!toImport.length) return { org_id: org.id, synced: 0, dupSkipped };

  let synced = 0;
  const importedNamesThisRun = new Set();
  for (const f of toImport) {
    try {
      const norm = normalizeFileName(f.name);
      if (importedNamesThisRun.has(norm)) continue;
      if ((f.size || 0) > 20 * 1024 * 1024) continue;
      const driveIdForItem = f.remoteItem?.parentReference?.driveId || f.parentReference?.driveId || org.certifications_drive_id || null;
      const itemId = f.remoteItem?.id || f.id;
      const contentUrl = driveIdForItem
        ? `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveIdForItem)}/items/${encodeURIComponent(itemId)}/content`
        : `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(itemId)}/content`;
      const fileRes = await fetch(contentUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!fileRes.ok) continue;
      const buf = new Uint8Array(await fileRes.arrayBuffer());
      const safeName = (f.name || 'file').replace(/[^a-zA-Z0-9.\-]+/g, '_');
      const storagePath = `${org.id}/${f.id}-${safeName}`;
      const { error: upErr } = await admin.storage.from('certifications').upload(storagePath, buf, { contentType: 'application/octet-stream', upsert: true });
      if (upErr) continue;
      await admin.from('certification_files').insert({
        org_id: org.id, name: f.name, item_id: f.id, drive_id: driveIdForItem, storage_path: storagePath, size: f.size || null,
      });
      importedNamesThisRun.add(norm);
      synced++;
    } catch (_e) { /* skip this file, keep going */ }
  }
  return { org_id: org.id, synced, dupSkipped };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const CRON_SECRET = Deno.env.get('CRON_SECRET');
    const providedSecret = req.headers.get('x-cron-secret') || '';
    const isCron = !!CRON_SECRET && providedSecret === CRON_SECRET;

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    if (isCron) {
      const { data: orgs } = await admin.from('organizations').select('id, certifications_folder_id, certifications_drive_id').not('certifications_folder_id', 'is', null);
      const results = [];
      for (const org of orgs || []) {
        const { data: conn } = await admin.from('onedrive_connections').select('*').eq('org_id', org.id).maybeSingle();
        if (!conn || !conn.access_token) { results.push({ org_id: org.id, error: 'not_connected' }); continue; }
        try {
          const accessToken = await refreshIfNeeded(admin, conn);
          // The nightly run is nobody: the HR folder lock always applies (the anon key is never let in by HR Access).
          const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
          const result = await syncOneOrg(admin, org, accessToken, await hrLockFor(admin, org.id, accessToken, SUPABASE_URL, ANON, ANON));
          if (result.error) { results.push(result); continue; }
          await admin.from('organizations').update({ certifications_last_synced_at: new Date().toISOString() }).eq('id', org.id);
          results.push(result);
        } catch (e) { results.push({ org_id: org.id, error: e instanceof HrLockUnknown ? 'hr_lock_unknown' : String(e) }); }
      }
      return new Response(JSON.stringify({ ok: true, mode: 'cron', results }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await callerClient.auth.getUser(token);
    if (userErr || !userData?.user) return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: caller } = await admin.from('profiles').select('role, org_id').eq('id', userData.user.id).maybeSingle();
    if (!caller || (caller.role !== 'pm' && caller.role !== 'admin')) {
      return new Response(JSON.stringify({ error: 'Forbidden — project managers and admins only' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: org } = await admin.from('organizations').select('id, certifications_folder_id, certifications_drive_id').eq('id', caller.org_id).maybeSingle();
    if (!org) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (!org.certifications_folder_id) return new Response(JSON.stringify({ error: 'No Certifications folder linked yet.' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: conn } = await admin.from('onedrive_connections').select('*').eq('org_id', caller.org_id).maybeSingle();
    if (!conn || !conn.access_token) return new Response(JSON.stringify({ error: 'OneDrive isn\'t connected for your company yet.' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const accessToken = await refreshIfNeeded(admin, conn);
    let result;
    try { result = await syncOneOrg(admin, org, accessToken, await hrLockFor(admin, caller.org_id, accessToken, SUPABASE_URL, String(ANON_KEY), token)); }
    catch (e) { if (e instanceof HrLockUnknown) return new Response(JSON.stringify({ error: HR_TRY_AGAIN }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); throw e; }
    if (result.error === HR_LOCKED) return new Response(JSON.stringify({ error: HR_LOCKED }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (result.error) return new Response(JSON.stringify({ error: result.error }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    await admin.from('organizations').update({ certifications_last_synced_at: new Date().toISOString() }).eq('id', caller.org_id);
    return new Response(JSON.stringify({ ok: true, mode: 'manual', synced: result.synced, dupSkipped: result.dupSkipped || 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
