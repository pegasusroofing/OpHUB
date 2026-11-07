import { createClient } from 'npm:@supabase/supabase-js@2';
// A repair job's own OneDrive folder (Andy, 7 Nov 2026). Made as soon as the job is added, inside the
// contract's main folder, from the template:
//   <job number>/Survey Photos/
//   <job number>/Completion Photos/
//   (the works order PDF goes in the job folder itself, by onedrive-upload)
// The job is then linked to that folder, so photos, the works order and the reports all land there.
//   { repair_job_id }  anyone with access to the contract. Existing folders are left alone; nothing is
//   overwritten or deleted. A job already linked to a folder just gets any missing photo folders.
// Answers { ok, folder } or { error: 'no_site_folder' | 'not_connected' | ... }.
// Deployed with verify_jwt off like the other OneDrive functions: the user's token comes in X-User-Token.
const corsHeaders = { 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-user-token, cache-control, pragma' };
const OPHUB_ORIGINS = new Set(['https://operativehub.co.uk', 'https://www.operativehub.co.uk', 'https://ophub-ten.vercel.app', 'capacitor://localhost', 'https://localhost', 'http://localhost']);
const originOk = (o: string | null) => !!o && (OPHUB_ORIGINS.has(o) || /^https:\/\/ophub-[a-z0-9-]+-op-hub\.vercel\.app$/.test(o) || /^http:\/\/localhost:\d{2,5}$/.test(o));
const reply = (req: Request, obj: unknown, status = 200) => {
  const h = new Headers({ ...corsHeaders, 'Content-Type': 'application/json', Vary: 'Origin' });
  const o = req.headers.get('Origin');
  if (originOk(o)) h.set('Access-Control-Allow-Origin', o as string);
  return new Response(JSON.stringify(obj), { status, headers: h });
};
const GRAPH = 'https://graph.microsoft.com/v1.0';
const PHOTO_FOLDERS = ['Survey Photos', 'Completion Photos'];
// The same folder name the app uses (repairJobFolder): the job number, else the address.
const seg = (s: unknown) => String(s ?? '').replace(/[\\/:*?"<>|]/g, '-').replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').replace(/^[\s.]+|[\s.]+$/g, '').trim();
const uidOf = (t: string) => { try { const p = t.split('.')[1]; return JSON.parse(atob(p.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(p.length / 4) * 4, '='))).sub || null; } catch { return null; } };

async function tokenFor(admin: any, conn: any) {
  if (new Date(conn.expires_at).getTime() > Date.now() + 60000) return conn.access_token;
  const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: Deno.env.get('AZURE_CLIENT_ID')!, client_secret: Deno.env.get('AZURE_CLIENT_SECRET')!, refresh_token: conn.refresh_token, grant_type: 'refresh_token' }),
  });
  const d = await res.json();
  if (!res.ok) throw new Error('OneDrive sign-in needs reconnecting');
  await admin.from('onedrive_connections').update({ access_token: d.access_token, refresh_token: d.refresh_token || conn.refresh_token, expires_at: new Date(Date.now() + (d.expires_in || 3600) * 1000).toISOString() }).eq('org_id', conn.org_id);
  return d.access_token;
}

// One level at a time, because a level can be a shortcut to another drive (as in onedrive-job-pack).
type Ref = { drive: string | null; id: string };
const at = (r: Ref) => (r.drive ? `${GRAPH}/drives/${encodeURIComponent(r.drive)}/items/${encodeURIComponent(r.id)}` : `${GRAPH}/me/drive/items/${encodeURIComponent(r.id)}`);
const refOf = (i: any): Ref => (i.remoteItem ? { drive: i.remoteItem.parentReference?.driveId ?? null, id: i.remoteItem.id } : { drive: i.parentReference?.driveId ?? null, id: i.id });
/** The folder `name` inside `from`, made if it isn't there. Existing folders are left alone. */
async function child(token: string, from: Ref, name: string): Promise<Ref | null> {
  let r = await fetch(`${at(from)}:/${encodeURIComponent(name)}?select=id,parentReference,remoteItem,folder`, { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 404) {
    r = await fetch(`${at(from)}/children`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }) });
    // Made by someone else a moment ago: read it again.
    if (r.status === 409) r = await fetch(`${at(from)}:/${encodeURIComponent(name)}?select=id,parentReference,remoteItem,folder`, { headers: { Authorization: `Bearer ${token}` } });
  }
  if (!r.ok) { console.error('repair folder: step failed', r.status, name); return null; }
  return refOf(await r.json());
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return reply(req, { ok: true });
  try {
    const token = req.headers.get('X-User-Token') || (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const uid = token ? uidOf(token) : null;
    if (!uid) return reply(req, { error: 'Not authenticated' }, 401);
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!, ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
    // Read as the caller, so a bad token gets nothing back.
    const who = await (await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=id,org_id,role&id=eq.${uid}`, { headers: { Authorization: `Bearer ${token}`, apikey: ANON } })).json().catch(() => []);
    const me = Array.isArray(who) ? who[0] : null;
    if (!me?.org_id) return reply(req, { error: 'Forbidden' }, 403);
    const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { autoRefreshToken: false, persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const { data: job } = await admin.from('repair_jobs').select('id, org_id, site_id, job_number, address, onedrive_folder_id, onedrive_drive_id').eq('id', String(body.repair_job_id || '')).maybeSingle();
    if (!job || job.org_id !== me.org_id) return reply(req, { error: 'Forbidden' }, 403);
    const { data: site } = await admin.from('sites').select('id, org_id, onedrive_folder_id, onedrive_drive_id').eq('id', job.site_id).maybeSingle();
    if (!site || site.org_id !== me.org_id) return reply(req, { error: 'Forbidden' }, 403);
    const isManager = ['pm', 'admin'].includes(String(me.role));
    if (!isManager) {
      const access = await fetch(`${SUPABASE_URL}/rest/v1/rpc/has_site_access`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_site_id: site.id }) });
      if ((await access.json().catch(() => false)) !== true) return reply(req, { error: 'Forbidden' }, 403);
    }
    if (!job.onedrive_folder_id && !site.onedrive_folder_id) return reply(req, { error: 'no_site_folder' });
    const { data: conn } = await admin.from('onedrive_connections').select('*').eq('org_id', me.org_id).maybeSingle();
    if (!conn?.access_token) return reply(req, { error: 'not_connected' });
    const graph = await tokenFor(admin, conn);

    let jobRef: Ref | null;
    let name = '';
    if (job.onedrive_folder_id) jobRef = { drive: job.onedrive_drive_id || null, id: job.onedrive_folder_id };
    else {
      name = seg(String(job.job_number || '').trim() || job.address) || 'Job';
      jobRef = await child(graph, { drive: site.onedrive_drive_id || null, id: site.onedrive_folder_id }, name);
      if (!jobRef) return reply(req, { error: 'Could not make the job folder in OneDrive.' }, 502);
    }
    for (const f of PHOTO_FOLDERS) if (!(await child(graph, jobRef, f))) return reply(req, { error: `Could not make the ${f} folder in OneDrive.` }, 502);
    if (!job.onedrive_folder_id) {
      const { error } = await admin.from('repair_jobs').update({ onedrive_folder_id: jobRef.id, onedrive_drive_id: jobRef.drive }).eq('id', job.id);
      if (error) { console.error('repair folder: link failed', error); return reply(req, { error: 'The folder was made, but the job could not be linked to it.' }, 500); }
    }
    return reply(req, { ok: true, folder: name || null });
  } catch (e) {
    console.error('repair folder failed', e);
    return reply(req, { error: e instanceof Error && /reconnect/.test(e.message) ? 'OneDrive sign-in needs reconnecting' : 'Could not set up the OneDrive folder.' }, 500);
  }
});
