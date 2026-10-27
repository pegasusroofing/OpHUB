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
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
  });
}

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

// #(onedrive-caller-profile-id-fix): 2026-09-13 — getCallerProfile previously
// queried ALL profiles this user's RLS policy makes visible (every profile in
// their org) and just grabbed rows[0] — Postgres's arbitrary first row, not
// necessarily the caller's own profile. Now the caller's own user id is read
// from their JWT (the `sub` claim) and the query is scoped to exactly that row.
async function getCallerProfile(SUPABASE_URL: string, ANON_KEY: string, token: string) {
  const uid = getUserIdFromToken(token);
  if (!uid) return null;
  const res = await fetchT(`${SUPABASE_URL}/rest/v1/profiles?select=id,role,org_id&id=eq.${uid}`, {
    headers: { Authorization: `Bearer ${token}`, apikey: ANON_KEY },
  }, 8000);
  if (!res.ok) return null;
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function refreshIfNeeded(admin: any, conn: any) {
  if (new Date(conn.expires_at).getTime() > Date.now() + 60000) return conn.access_token;
  const AZURE_CLIENT_ID = Deno.env.get('AZURE_CLIENT_ID');
  const AZURE_CLIENT_SECRET = Deno.env.get('AZURE_CLIENT_SECRET');
  const res = await fetchT('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: AZURE_CLIENT_ID!,
      client_secret: AZURE_CLIENT_SECRET!,
      refresh_token: conn.refresh_token,
      grant_type: 'refresh_token',
    }),
  }, 10000);
  const data = await res.json();
  if (!res.ok) throw new Error('Token refresh failed: ' + JSON.stringify(data));
  const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString();
  await withTimeout(
    admin.from('onedrive_connections').update({ access_token: data.access_token, refresh_token: data.refresh_token || conn.refresh_token, expires_at: expiresAt }).eq('org_id', conn.org_id),
    8000, 'Saving refreshed token'
  );
  return data.access_token;
}

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

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

    const callerProfile = await getCallerProfile(SUPABASE_URL, ANON_KEY, token);
    if (!callerProfile || (callerProfile.role !== 'pm' && callerProfile.role !== 'admin')) {
      return new Response(JSON.stringify({ error: 'Forbidden — project managers and admins only' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: conn } = await withTimeout(
      admin.from('onedrive_connections').select('*').eq('org_id', callerProfile.org_id).maybeSingle(),
      8000, 'Looking up your OneDrive connection'
    );
    if (!conn || !conn.access_token) {
      return new Response(JSON.stringify({ error: 'OneDrive isn\'t connected for your company yet — connect it first from Manage Team.' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await withTimeout(req.json().catch(() => ({})), 8000, 'Reading your request');
    const parentId: string | null = body.parent_id || null;
    const driveId: string | null = body.drive_id || null;
    const shared: boolean = !!body.shared;
    const companySites: boolean = !!body.companySites;
    const companySiteId: string | null = body.company_site_id || null;
    const includeFiles: boolean = !!body.includeFiles;

    const accessToken = await refreshIfNeeded(admin, conn);

    if (companySites) {
      const graphRes = await fetchT('https://graph.microsoft.com/v1.0/sites?search=*&$select=id,displayName,webUrl&$top=50', { headers: { Authorization: `Bearer ${accessToken}` } }, 12000);
      if (!graphRes.ok) {
        const errText = await graphRes.text();
        console.error('onedrive-list-folders: Graph error', graphRes.status, errText.slice(0, 500));
        return new Response(JSON.stringify({ error: 'OneDrive request failed (' + graphRes.status + ') — please try again.' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const data = await graphRes.json();
      const folders = (data.value || [])
        .filter((s: any) => s.id && s.displayName)
        .map((s: any) => ({ id: s.id, name: s.displayName, isSite: true }));
      return new Response(JSON.stringify({ folders }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (companySiteId) {
      const drivesRes = await fetchT(`https://graph.microsoft.com/v1.0/sites/${encodeURIComponent(companySiteId)}/drives?$select=id,name`, { headers: { Authorization: `Bearer ${accessToken}` } }, 12000);
      if (!drivesRes.ok) {
        const errText = await drivesRes.text();
        console.error('onedrive-list-folders: Graph error', drivesRes.status, errText.slice(0, 500));
        return new Response(JSON.stringify({ error: 'OneDrive request failed (' + drivesRes.status + ') — please try again.' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const drivesData = await drivesRes.json();
      const drives = drivesData.value || [];
      const folders = (await Promise.all(drives.map(async (d: any) => {
        try {
          const rootRes = await fetchT(`https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(d.id)}/root?$select=id`, { headers: { Authorization: `Bearer ${accessToken}` } }, 12000);
          if (!rootRes.ok) return null;
          const root = await rootRes.json();
          return { id: root.id, name: d.name, driveId: d.id };
        } catch (_e) { return null; }
      }))).filter(Boolean);
      return new Response(JSON.stringify({ folders }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (shared) {
      const graphRes = await fetchT('https://graph.microsoft.com/v1.0/me/drive/sharedWithMe', { headers: { Authorization: `Bearer ${accessToken}` } }, 12000);
      if (!graphRes.ok) {
        const errText = await graphRes.text();
        console.error('onedrive-list-folders: Graph error', graphRes.status, errText.slice(0, 500));
        return new Response(JSON.stringify({ error: 'OneDrive request failed (' + graphRes.status + ') — please try again.' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const data = await graphRes.json();
      const folders = (data.value || [])
        .filter((it: any) => it.folder || it.remoteItem?.folder)
        .map((it: any) => {
          const remote = it.remoteItem || it;
          return { id: remote.id, name: it.name || remote.name, driveId: remote.parentReference?.driveId || null };
        })
        .filter((f: any) => f.id && f.driveId);
      return new Response(JSON.stringify({ folders }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let graphUrl: string;
    if (driveId) {
      graphUrl = `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(parentId!)}/children?$select=id,name,folder,file,size,lastModifiedDateTime,parentReference,remoteItem&$top=200`;
    } else if (parentId) {
      graphUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(parentId)}/children?$select=id,name,folder,file,size,lastModifiedDateTime,parentReference,remoteItem&$top=200`;
    } else {
      graphUrl = `https://graph.microsoft.com/v1.0/me/drive/root/children?$select=id,name,folder,file,size,lastModifiedDateTime,parentReference,remoteItem&$top=200`;
    }

    const graphRes = await fetchT(graphUrl, { headers: { Authorization: `Bearer ${accessToken}` } }, 12000);
    if (!graphRes.ok) {
      const errText = await graphRes.text();
      console.error('onedrive-list-folders: Graph error', graphRes.status, errText.slice(0, 500));
      return new Response(JSON.stringify({ error: 'OneDrive request failed (' + graphRes.status + ') — please try again.' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const data = await graphRes.json();
    const folders = (data.value || [])
      .filter((it: any) => it.folder || it.remoteItem?.folder)
      .map((it: any) => it.remoteItem
        ? { id: it.remoteItem.id, name: it.name, driveId: it.remoteItem.parentReference?.driveId || null }
        : { id: it.id, name: it.name, driveId: it.parentReference?.driveId || driveId || null }
      );
    const files = includeFiles
      ? (data.value || [])
        .filter((it: any) => it.file && !it.folder)
        .map((it: any) => ({ id: it.id, name: it.name, size: it.size || 0, lastModifiedDateTime: it.lastModifiedDateTime || null, driveId: it.parentReference?.driveId || driveId || null }))
      : [];

    return new Response(JSON.stringify({ folders, files }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('onedrive-list-folders failed', e);
    // The OneDrive sign-in has lapsed (refresh token refused): say so, without Microsoft's raw reply.
    const msg = String((e as any)?.message || e).startsWith('Token refresh failed')
      ? 'OneDrive needs reconnecting — connect it again from Manage Team.'
      : 'Something went wrong — please try again.';
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}));
