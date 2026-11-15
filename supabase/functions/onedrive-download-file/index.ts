import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-user-token, cache-control, pragma',
};

async function fetchT(url: string, opts: RequestInit, ms = 10000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } catch (e) {
    if ((e as any)?.name === 'AbortError') throw new Error(`Request to ${url} timed out after ${ms}ms`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return atob(str);
}
function getUserIdFromToken(token) {
  try {
    const payload = token.split('.')[1];
    const json = JSON.parse(b64urlDecode(payload));
    return json.sub || null;
  } catch (_e) {
    return null;
  }
}

async function getCallerProfile(SUPABASE_URL, ANON_KEY, token) {
  const uid = getUserIdFromToken(token);
  if (!uid) return null;
  const res = await fetchT(`${SUPABASE_URL}/rest/v1/profiles?select=id,role,org_id&id=eq.${uid}`, {
    headers: { Authorization: `Bearer ${token}`, apikey: ANON_KEY },
  }, 8000);
  if (!res.ok) return null;
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function refreshIfNeeded(admin, conn) {
  if (new Date(conn.expires_at).getTime() > Date.now() + 60000) return conn.access_token;
  const AZURE_CLIENT_ID = Deno.env.get('AZURE_CLIENT_ID');
  const AZURE_CLIENT_SECRET = Deno.env.get('AZURE_CLIENT_SECRET');
  const res = await fetchT('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: AZURE_CLIENT_ID,
      client_secret: AZURE_CLIENT_SECRET,
      refresh_token: conn.refresh_token,
      grant_type: 'refresh_token',
    }),
  }, 10000);
  const data = await res.json();
  if (!res.ok) throw new Error('Token refresh failed: ' + JSON.stringify(data));
  const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString();
  await admin.from('onedrive_connections').update({ access_token: data.access_token, refresh_token: data.refresh_token || conn.refresh_token, expires_at: expiresAt }).eq('org_id', conn.org_id);
  return data.access_token;
}

// HR folder lock (Andy, 15 Nov 2026): exact copy of app-native/src/lib/rules/hrLock.ts (hrLock.test.ts checks it).
// A file in the HR folder can't be fetched by anyone HR › HR Access doesn't let in.
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

Deno.serve(withCors(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const token = req.headers.get('X-User-Token') || (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

    const callerProfile = await getCallerProfile(SUPABASE_URL, ANON_KEY, token);
    if (!callerProfile || (callerProfile.role !== 'pm' && callerProfile.role !== 'admin')) {
      return new Response(JSON.stringify({ error: 'Forbidden — project managers and admins only' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: conn } = await admin.from('onedrive_connections').select('*').eq('org_id', callerProfile.org_id).maybeSingle();
    if (!conn || !conn.access_token) {
      return new Response(JSON.stringify({ error: 'not_connected' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json().catch(() => ({}));
    const { item_id, drive_id, name } = body;
    if (!item_id) return new Response(JSON.stringify({ error: 'item_id is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const accessToken = await refreshIfNeeded(admin, conn);
    const hrLock = await hrLockFor(admin, callerProfile.org_id, accessToken, String(SUPABASE_URL), String(ANON_KEY), token);
    if (hrLock) {
      const metaUrl = (drive_id
        ? `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(drive_id)}/items/${encodeURIComponent(item_id)}`
        : `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(item_id)}`) + '?$select=id,name,parentReference,remoteItem';
      const meta = await fetchT(metaUrl, { headers: { Authorization: `Bearer ${accessToken}` } }, 10000);
      if (!meta.ok) return new Response(JSON.stringify({ error: 'OneDrive download failed (' + meta.status + ') — please try again.' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      if (hrInside(hrLock, await meta.json())) return new Response(JSON.stringify({ error: HR_LOCKED }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const graphUrl = drive_id
      ? `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(drive_id)}/items/${encodeURIComponent(item_id)}/content`
      : `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(item_id)}/content`;

    const fileRes = await fetchT(graphUrl, { headers: { Authorization: `Bearer ${accessToken}` } }, 15000);
    if (!fileRes.ok) {
      const errText = await fileRes.text();
      console.error('onedrive-download-file: Graph error', fileRes.status, errText.slice(0, 500));
      return new Response(JSON.stringify({ error: 'OneDrive download failed (' + fileRes.status + ') — please try again.' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const buf = new Uint8Array(await fileRes.arrayBuffer());
    if (buf.byteLength > 15 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: 'File is too large to import (over 15MB).' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < buf.length; i += chunk) binary += String.fromCharCode(...buf.subarray(i, i + chunk));
    const content_base64 = btoa(binary);

    return new Response(JSON.stringify({ ok: true, name: name || 'file', content_base64, size: buf.byteLength }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('onedrive-download-file failed', e);
    // The OneDrive sign-in has lapsed (refresh token refused): say so, without Microsoft's raw reply.
    const msg = String((e as any)?.message || e).startsWith('Token refresh failed')
      ? 'OneDrive needs reconnecting — connect it again from Manage Team.'
      : 'Something went wrong — please try again.';
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}));
