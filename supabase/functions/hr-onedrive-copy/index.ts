// hr-onedrive-copy (new app, Andy 15 Nov 2026): copies HR documents (hr_docs, files in the private hr-docs store) into
// the OneDrive folder the HR team chose (hr_secure_settings.onedrive), a folder per person:
//   <HR folder>/<Person Name>/<Contracts & Letters>/<file>
// Body: { doc_ids: [...] } (just added; the caller must be able to read each one themselves, so the database's own
// rules decide) or { all: true } (everything not copied yet; HR team only). Nothing is sent if no folder is chosen or
// copying is switched off. verify_jwt false like onedrive-upload: the user's token comes in X-User-Token and is checked
// by making the reads with it.
// SWITCHED OFF (15 Nov 2026 review): every OneDrive folder OpHUB uses goes through the one company Microsoft sign-in, and
// PMs and admins can browse that through OpHUB (folder pickers, project Documents, operative sync), so an HR folder there
// wouldn't be private. It stays off until HR has its own Microsoft sign-in that the company one can't open (Andy to
// decide). The folder is read from hr_secure_settings (HR team only) when it's switched back on.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SWITCHED_OFF = true;

const corsHeaders = { 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-user-token, cache-control, pragma' };
const OPHUB_ORIGINS = new Set(['https://operativehub.co.uk', 'https://www.operativehub.co.uk', 'https://ophub-ten.vercel.app', 'https://ophub-beta.vercel.app', 'capacitor://localhost', 'https://localhost', 'http://localhost']);
function originAllowed(o: string | null) {
  if (!o) return false;
  return OPHUB_ORIGINS.has(o) || /^https:\/\/ophub-[a-z0-9-]+-op-hub\.vercel\.app$/.test(o) || /^http:\/\/localhost:\d{2,5}$/.test(o);
}
function withCors(handler: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    const res = await handler(req);
    const headers = new Headers(res.headers);
    const o = req.headers.get('Origin');
    if (originAllowed(o)) headers.set('Access-Control-Allow-Origin', o as string);
    headers.append('Vary', 'Origin');
    return new Response(res.body, { status: res.status, headers });
  };
}
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const FOLDERS: Record<string, string> = {
  contracts: 'Contracts & Letters', pay: 'Payslips & Tax', rtw: 'Right To Work & ID', licences: 'Licences & Cards',
  health: 'Health & Safety', absence: 'Absence & Fit Notes', conduct: 'Disciplinary & Grievance', other: 'Other',
};
const clean = (s: unknown) => String(s ?? '').replace(/[\\\u0000-\u001f/]+/g, '_').replace(/[:*?"<>|]+/g, '-').replace(/\.{2,}/g, '.').trim().replace(/^\.+$/, '') || 'File';
const enc = (p: string) => p.split('/').map(encodeURIComponent).join('/');

async function refreshIfNeeded(admin: any, conn: any) {
  if (new Date(conn.expires_at).getTime() > Date.now() + 60000) return conn.access_token;
  const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: Deno.env.get('AZURE_CLIENT_ID')!, client_secret: Deno.env.get('AZURE_CLIENT_SECRET')!, refresh_token: conn.refresh_token, grant_type: 'refresh_token' }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error('Token refresh failed');
  await admin.from('onedrive_connections').update({ access_token: data.access_token, refresh_token: data.refresh_token || conn.refresh_token, expires_at: new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString() }).eq('org_id', conn.org_id);
  return data.access_token;
}

const CHUNK = 327680 * 10;
async function put(base: string, token: string, bytes: Uint8Array): Promise<boolean> {
  if (bytes.length <= 3.5 * 1024 * 1024) {
    const r = await fetch(`${base}:/content?@microsoft.graph.conflictBehavior=rename`, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' }, body: bytes as unknown as BodyInit });
    return r.ok;
  }
  const s = await fetch(`${base}:/createUploadSession`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'rename' } }) });
  if (!s.ok) return false;
  const url = (await s.json()).uploadUrl;
  for (let off = 0; off < bytes.length; off += CHUNK) {
    const end = Math.min(off + CHUNK, bytes.length);
    const r = await fetch(url, { method: 'PUT', headers: { 'Content-Length': String(end - off), 'Content-Range': `bytes ${off}-${end - 1}/${bytes.length}` }, body: bytes.subarray(off, end) as unknown as BodyInit });
    if (!r.ok && r.status !== 202) return false;
  }
  return true;
}

Deno.serve(withCors(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (SWITCHED_OFF) return json({ ok: true, copied: 0, skipped: 'switched_off' });
  try {
    const token = req.headers.get('X-User-Token') || (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'Not authenticated' }, 401);
    const URL_ = Deno.env.get('SUPABASE_URL')!, ANON = Deno.env.get('SUPABASE_ANON_KEY')!, SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    // Reads made as the caller: the database's rules decide what they may copy.
    const asUser = createClient(URL_, ANON, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { autoRefreshToken: false, persistSession: false } });
    const access = (await asUser.rpc('hr_my_access')).data as { team?: boolean } | null;
    if (!access) return json({ error: 'Forbidden' }, 403);
    const { data: who } = await asUser.auth.getUser(token);
    const uid = who?.user?.id;
    if (!uid) return json({ error: 'Not authenticated' }, 401);
    const admin = createClient(URL_, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: me } = await admin.from('profiles').select('org_id').eq('id', uid).maybeSingle();
    const orgId = me?.org_id;
    if (!orgId) return json({ error: 'Forbidden' }, 403);

    const body = await req.json().catch(() => ({}));
    const { data: st } = await admin.from('hr_secure_settings').select('onedrive').eq('org_id', orgId).maybeSingle();
    const od = st?.onedrive as { id?: string; driveId?: string | null; on?: boolean } | null;
    if (!od?.id || od.on === false) return json({ ok: true, copied: 0, skipped: 'no_folder' });

    let ids: string[] = [];
    if (body.all) {
      if (!access.team) return json({ error: 'HR team only' }, 403);
      const { data } = await admin.from('hr_docs').select('id').eq('org_id', orgId).is('onedrive_copied_at', null).limit(500);
      ids = (data ?? []).map((d: { id: string }) => d.id);
    } else if (Array.isArray(body.doc_ids)) {
      // Only documents the caller can read themselves.
      const { data } = await asUser.from('hr_docs').select('id').in('id', body.doc_ids.slice(0, 50).map(String));
      ids = (data ?? []).map((d: { id: string }) => d.id);
    }
    if (!ids.length) return json({ ok: true, copied: 0 });

    const { data: conn } = await admin.from('onedrive_connections').select('*').eq('org_id', orgId).maybeSingle();
    if (!conn?.access_token) return json({ ok: true, copied: 0, skipped: 'not_connected' });
    const msToken = await refreshIfNeeded(admin, conn);
    const { data: docs } = await admin.from('hr_docs').select('id,org_id,user_id,folder,title,file_name,storage_path').in('id', ids).eq('org_id', orgId);
    // Only files in that person's own folder of the store.
    const own = (d: { org_id: string; user_id: string; storage_path: string }) => d.storage_path.startsWith(`${d.org_id}/${d.user_id}/`);
    const people = new Map<string, string>();
    let copied = 0;
    for (const d of (docs ?? []).filter(own)) {
      if (!people.has(d.user_id)) { const { data: p } = await admin.from('profiles').select('name').eq('id', d.user_id).maybeSingle(); people.set(d.user_id, clean(p?.name || 'Unknown')); }
      const { data: blob } = await admin.storage.from('hr-docs').download(d.storage_path);
      if (!blob) continue;
      const ext = (String(d.file_name || d.storage_path).match(/\.[a-z0-9]{1,6}$/i) || [''])[0];
      const name = clean(d.title) + (ext && !clean(d.title).toLowerCase().endsWith(ext.toLowerCase()) ? ext : '');
      const rel = enc(`${people.get(d.user_id)}/${FOLDERS[d.folder] || 'Other'}/${name}`);
      const base = od.driveId
        ? `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(od.driveId)}/items/${encodeURIComponent(od.id)}:/${rel}`
        : `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(od.id)}:/${rel}`;
      if (await put(base, msToken, new Uint8Array(await blob.arrayBuffer()))) {
        copied++;
        await admin.from('hr_docs').update({ onedrive_copied_at: new Date().toISOString() }).eq('id', d.id);
      }
    }
    return json({ ok: true, copied });
  } catch (e) {
    console.error('hr-onedrive-copy failed', e);
    return json({ error: 'Could not copy to OneDrive' }, 500);
  }
}));
