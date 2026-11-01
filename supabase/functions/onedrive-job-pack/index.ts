import { createClient } from 'npm:@supabase/supabase-js@2';

// New job pack (1 Nov 2026). Only runs for a company with job_pack_settings.enabled = true.
//   { action: 'setup', site_id }  PM / admin: makes the job's folder from the company's rules, copies the
//     working documents chosen from the template (never overwriting), and links the job to it.
//   { action: 'put', site_id, rule, filename, photo_path | file: {bucket, path} | content_base64 }  anyone
//     with access to the job: puts a file in the folder that rule names. A rule's folder can hold
//     {week folder}: the week's folder is worked out here, and OneDrive makes it when the first file arrives,
//     so there are no empty weeks. Files are never overwritten: OneDrive renames on a clash.
// The app's rules come from Andy's Excel, "New Job Pack - what goes where".
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
const BUCKETS = ['site-photos', 'mc-documents', 'rams-docs', 'coshh-docs'];
const CHUNK = 327680 * 10;
const seg = (s: unknown) => String(s ?? '').replace(/[\\\u0000-\u001f]+/g, '_').replace(/[:*?"<>|/]+/g, '-').replace(/\.{2,}/g, '.').replace(/^[\s.]+|[\s.]+$/g, '');
const cleanPath = (p: unknown) => String(p ?? '').split('/').map(seg).filter(Boolean).join('/');
const enc = (p: string) => p.split('/').filter(Boolean).map(encodeURIComponent).join('/');
const uidOf = (t: string) => { try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(t.split('.')[1].length / 4) * 4, '='))).sub || null; } catch { return null; } };

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

/** Monday (or the company's chosen day) of the week a date is in. */
function weekStart(d: Date, day: number) { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() - day + 7) % 7)); return x; }
function weekFolder(weekly: any, week1: Date, now: Date) {
  const start = weekStart(now, Number(weekly?.weekStart ?? 1));
  const n = Math.max(1, Math.floor((start.getTime() - week1.getTime()) / (7 * 864e5)) + 1);
  const name = String(weekly?.name || '{order}. Week {n}').replace('{order}', String(n + 1)).replace('{n}', String(n));
  return weekly?.addDate ? `${name} (w-c ${start.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })})` : name;
}

async function putFile(token: string, base: string, bytes: Uint8Array): Promise<boolean> {
  if (bytes.length <= 3.5 * 1024 * 1024) {
    return (await fetch(`${base}:/content?@microsoft.graph.conflictBehavior=rename`, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' }, body: bytes as unknown as BodyInit })).ok;
  }
  const s = await fetch(`${base}:/createUploadSession`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'rename' } }) });
  if (!s.ok) return false;
  const { uploadUrl } = await s.json();
  for (let at = 0; at < bytes.length; at += CHUNK) {
    const end = Math.min(at + CHUNK, bytes.length);
    const r = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Length': String(end - at), 'Content-Range': `bytes ${at}-${end - 1}/${bytes.length}` }, body: bytes.subarray(at, end) as unknown as BodyInit });
    if (!r.ok && r.status !== 202) return false;
  }
  return true;
}

// Folders are walked one level at a time because a level can be a shortcut to another drive or library
// (RTB's "RTB Roofing Ltd" is one), which a plain path can't see through.
type Ref = { drive: string | null; id: string };
const ROOT: Ref = { drive: null, id: 'root' };
const at = (r: Ref) => (r.drive ? `${GRAPH}/drives/${encodeURIComponent(r.drive)}/items/${encodeURIComponent(r.id)}` : `${GRAPH}/me/drive/root`);
const refOf = (i: any): Ref => (i.remoteItem ? { drive: i.remoteItem.parentReference?.driveId, id: i.remoteItem.id } : { drive: i.parentReference?.driveId, id: i.id });
/** Follows a path; makes the levels that aren't there if asked. Existing folders are left alone. */
async function walk(token: string, from: Ref, path: string, make: boolean): Promise<Ref | null> {
  let cur = from;
  for (const p of path.split('/').filter(Boolean)) {
    let r = await fetch(`${at(cur)}:/${encodeURIComponent(p)}?select=id,parentReference,remoteItem`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.status === 404 && make) {
      r = await fetch(`${at(cur)}/children`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: p, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }) });
    }
    if (!r.ok) { console.error('job pack: folder step failed', r.status, p); return null; }
    cur = refOf(await r.json());
  }
  return cur;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return reply(req, { ok: true });
  try {
    const token = req.headers.get('X-User-Token') || (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const uid = token ? uidOf(token) : null;
    if (!uid) return reply(req, { error: 'Not authenticated' }, 401);
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!, ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
    const who = await (await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=id,org_id,role&id=eq.${uid}`, { headers: { Authorization: `Bearer ${token}`, apikey: ANON } })).json().catch(() => []);
    const me = Array.isArray(who) ? who[0] : null;
    if (!me?.org_id) return reply(req, { error: 'Forbidden' }, 403);
    const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { autoRefreshToken: false, persistSession: false } });

    const body = await req.json().catch(() => ({}));
    const { data: site } = await admin.from('sites').select('id, org_id, name, start_date, job_pack, onedrive_folder_id').eq('id', String(body.site_id || '')).maybeSingle();
    if (!site || site.org_id !== me.org_id) return reply(req, { error: 'Forbidden' }, 403);
    const access = await fetch(`${SUPABASE_URL}/rest/v1/rpc/has_site_access`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_site_id: site.id }) });
    const isManager = ['pm', 'admin'].includes(String(me.role));
    if (!isManager && (await access.json().catch(() => false)) !== true) return reply(req, { error: 'Forbidden' }, 403);

    const { data: settings } = await admin.from('job_pack_settings').select('enabled, config').eq('org_id', me.org_id).maybeSingle();
    if (!settings?.enabled || !settings.config) return reply(req, { error: 'not_enabled' });
    const config = settings.config as any;
    const { data: conn } = await admin.from('onedrive_connections').select('*').eq('org_id', me.org_id).maybeSingle();
    if (!conn?.access_token) return reply(req, { error: 'not_connected' });
    const graph = await tokenFor(admin, conn);

    if (body.action === 'setup') {
      if (!isManager) return reply(req, { error: 'Project managers and admins only.' }, 403);
      // Run again on a job that has one, it only fills in what's missing. Nothing is overwritten.
      if (!site.job_pack && site.onedrive_folder_id) return reply(req, { error: 'This job is already linked to a OneDrive folder. Unlink it first.' });
      const parent = cleanPath(config.parent_path), template = cleanPath(config.template_path), name = seg(site.name);
      if (!parent || !name) return reply(req, { error: 'The job pack has no folder set for new jobs.' });
      const rootRef = await walk(graph, ROOT, `${parent}/${name}`, true);
      if (!rootRef) return reply(req, { error: 'Could not make the job folder in OneDrive.' }, 502);
      const templateRef = (config.files || []).length ? await walk(graph, ROOT, template, false) : null;
      const failed: string[] = [];
      let made = 0, copied = 0;
      // Parents first, so the order in the Excel doesn't matter.
      for (const f of [...new Set((config.folders || []).map(cleanPath).filter(Boolean) as string[])].sort()) { if (await walk(graph, rootRef, f, true)) made++; else failed.push(f); }
      for (const f of (config.files || [])) {
        const folder = cleanPath(f.folder), file = seg(f.name);
        if (!file) continue;
        const target = await walk(graph, rootRef, folder, true);
        const source = templateRef ? await walk(graph, templateRef, `${folder}/${file}`, false) : null;
        if (!target?.drive || !source) { failed.push(file); continue; }
        if ((await fetch(`${at(target)}:/${encodeURIComponent(file)}?select=id`, { headers: { Authorization: `Bearer ${graph}` } })).ok) continue;
        const r = await fetch(`${at(source)}/copy`, { method: 'POST', headers: { Authorization: `Bearer ${graph}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ parentReference: { driveId: target.drive, id: target.id }, name: file }) });
        if (r.ok || r.status === 202) copied++; else { console.error('job pack: copy failed', r.status, file); failed.push(file); }
      }
      const ruleFolder = async (k: string) => { const r = config.rules?.[k]; return r?.on && r.folder && !String(r.folder).includes('{') ? walk(graph, rootRef, cleanPath(r.folder), true) : null; };
      const [mo, ind, dwg] = await Promise.all([ruleFolder('material_orders_in'), ruleFolder('induction'), ruleFolder('drawing_in')]);
      const week1 = site.job_pack?.week1 ?? (site.start_date && config.weekly?.week1 !== 'first' ? weekStart(new Date(`${site.start_date}T12:00:00Z`), Number(config.weekly?.weekStart ?? 1)).toISOString().slice(0, 10) : null);
      const pack = { at: site.job_pack?.at ?? new Date().toISOString(), path: `${parent}/${name}`, root_id: rootRef.id, drive_id: rootRef.drive, drawings_folder_id: dwg?.id ?? null, week1 };
      const { error: saveErr } = await admin.from('sites').update({
        job_pack: pack, onedrive_folder_id: rootRef.id, onedrive_folder_name: name, onedrive_drive_id: rootRef.drive,
        ...(mo ? { material_orders_folder_id: mo.id, material_orders_folder_name: 'Supplier Material Orders', material_orders_drive_id: mo.drive } : {}),
        ...(ind ? { site_inductions_folder_id: ind.id, site_inductions_folder_name: 'Completed Inductions', site_inductions_drive_id: ind.drive } : {}),
      }).eq('id', site.id);
      if (saveErr) { console.error('job pack: save failed', saveErr); return reply(req, { error: 'The folder was made, but the job could not be linked to it.' }, 500); }
      return reply(req, { ok: true, path: pack.path, made, copied, failed });
    }

    if (body.action === 'put') {
      if (!site.job_pack) return reply(req, { error: 'no_pack' });
      const rule = config.rules?.[String(body.rule || '')];
      if (!rule) return reply(req, { error: 'That rule is not in the job pack.' }, 400);
      if (!rule.on) return reply(req, { ok: true, skipped: 'rule is off' });
      let bytes: Uint8Array;
      const file = body.photo_path ? { bucket: 'site-photos', path: body.photo_path } : body.file;
      if (file) {
        if (!BUCKETS.includes(String(file.bucket)) || typeof file.path !== 'string' || !file.path.startsWith(`${site.id}/`) || file.path.includes('..')) return reply(req, { error: 'Forbidden' }, 403);
        const { data: blob, error } = await admin.storage.from(file.bucket).download(file.path);
        if (error || !blob) return reply(req, { error: 'Could not read the file.' }, 400);
        bytes = new Uint8Array(await blob.arrayBuffer());
      } else if (typeof body.content_base64 === 'string') bytes = Uint8Array.from(atob(body.content_base64), (c) => c.charCodeAt(0));
      else return reply(req, { error: 'No file was sent.' }, 400);

      const now = new Date();
      let folder = String(rule.folder || '');
      if (folder.includes('{week folder}')) {
        let week1Iso = site.job_pack.week1 as string | null;
        if (!week1Iso) {
          // Week 1 is the week of the first file after pre-start, for a job with no start date.
          week1Iso = weekStart(now, Number(config.weekly?.weekStart ?? 1)).toISOString().slice(0, 10);
          await admin.from('sites').update({ job_pack: { ...site.job_pack, week1: week1Iso } }).eq('id', site.id);
        }
        folder = folder.replace('{week folder}', weekFolder(config.weekly, new Date(`${week1Iso}T00:00:00Z`), now));
      }
      const name = seg(body.filename);
      if (!name) return reply(req, { error: 'filename is not valid' }, 400);
      const base = `${GRAPH}/drives/${encodeURIComponent(site.job_pack.drive_id)}/items/${encodeURIComponent(site.job_pack.root_id)}:/${enc(`${cleanPath(folder)}/${name}`)}`;
      if (!(await putFile(graph, base, bytes))) return reply(req, { error: 'OneDrive upload failed' }, 502);
      return reply(req, { ok: true, folder });
    }
    return reply(req, { error: 'Unknown action' }, 400);
  } catch (e) {
    console.error('onedrive-job-pack failed', e);
    return reply(req, { error: 'Something went wrong with the job pack.' }, 500);
  }
});
