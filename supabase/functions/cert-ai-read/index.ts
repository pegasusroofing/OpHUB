import { createClient } from 'npm:@supabase/supabase-js@2';

// OpHUB — reads the expiry date off a training certificate or card (Andy, 18 Nov 2026: "the certificates they upload need
// to automatically go into the operatives folder ... the date if it doesn't read it needs to flag to the document
// controller or whoever approves the sign up form to add").
//   POST { cert_id }  → { ok, expiry_date | null, flagged }
// Called by the app straight after a certificate is uploaded without an expiry date. Reads the file with Claude (a
// small, cheap model; CERT_MODEL to change it). A date found is saved on the certificate. None found: the person who
// checks sign-ups (organizations.signup_checker; else the company admins) gets a to-do to add it.
// Who may call: the operative the certificate belongs to, or a manager of the same company. Files only from the
// company's own certificates. 100 reads a day per company, each logged in ai_usage_log (as finance-ai-read).
// Needs the Supabase secret ANTHROPIC_API_KEY (already set for finance-ai-read and rams-ai-draft).
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, cache-control, pragma' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';
const MODEL = Deno.env.get('CERT_MODEL') || 'claude-haiku-5-5';
const DAILY = 100;
const MANAGERS = ['admin', 'pm', 'site_manager', 'superadmin'];

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

const SCHEMA = {
  type: 'object',
  properties: {
    expiry_date: { type: 'string', description: 'The date the certificate or card expires or must be renewed by, as YYYY-MM-DD. Leave out if none is shown.' },
    course: { type: 'string', description: 'The course, card or qualification name as shown (e.g. Asbestos Awareness, CSCS Labourer, SSSTS).' },
    holder: { type: 'string', description: 'The name of the person it was issued to, if shown.' },
  },
  required: [],
};
const realDate = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(`${s}T00:00:00Z`).getTime()) ? s : null;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: u } = await admin.auth.getUser(token);
    if (!u?.user) return json({ error: 'Please sign in again' }, 401);
    const { data: me } = await admin.from('profiles').select('id, org_id, role').eq('id', u.user.id).maybeSingle();
    if (!me?.org_id) return json({ error: 'Forbidden' }, 403);
    const body = await req.json().catch(() => ({}));
    const certId = String(body.cert_id || '');
    if (!/^[0-9a-f-]{36}$/i.test(certId)) return json({ error: 'cert_id is required' }, 400);
    const { data: cert } = await admin.from('operative_certifications').select('id, org_id, operative_id, manual_operative_id, category, name, other_type_description, storage_path, expiry_date').eq('id', certId).maybeSingle();
    if (!cert || cert.org_id !== me.org_id) return json({ error: 'Forbidden' }, 403);
    const mine = cert.operative_id && cert.operative_id === me.id;
    if (!mine && !MANAGERS.includes(me.role)) return json({ error: 'Forbidden' }, 403);
    if (cert.expiry_date) return json({ ok: true, expiry_date: cert.expiry_date, flagged: false });

    // Who it belongs to, and what it is, for the to-do.
    let who = 'An operative';
    if (cert.operative_id) who = ((await admin.from('profiles').select('name').eq('id', cert.operative_id).maybeSingle()).data?.name) || who;
    else if (cert.manual_operative_id) who = ((await admin.from('manual_operatives').select('name').eq('id', cert.manual_operative_id).maybeSingle()).data?.name) || who;
    const what = cert.other_type_description || String(cert.category || 'certificate').replace(/_/g, ' ');
    const flag = async (why: string) => {
      const { data: org } = await admin.from('organizations').select('signup_checker').eq('id', me.org_id).maybeSingle();
      let to: string[] = org?.signup_checker ? [org.signup_checker] : [];
      if (!to.length) to = (((await admin.from('profiles').select('id').eq('org_id', me.org_id).eq('role', 'admin')).data) || []).map((p: { id: string }) => p.id);
      const text = `Add the expiry date to ${who}'s ${what} certificate (${cert.name || 'uploaded file'}) — ${why}.`;
      for (const id of to) await admin.from('todos').insert({ org_id: me.org_id, site_id: null, text, done: false, created_by: me.id, assigned_to: id }).then(undefined, () => undefined);
      return to.length > 0;
    };

    if (!API_KEY) return json({ ok: true, expiry_date: null, flagged: await flag("the date couldn't be read automatically") });
    const path = String(cert.storage_path || '');
    if (!path.startsWith(me.org_id + '/') || !storagePathSafe(path)) return json({ ok: true, expiry_date: null, flagged: await flag("the file couldn't be opened") });
    const { data: blob, error } = await admin.storage.from('certifications').download(path);
    if (error || !blob) return json({ ok: true, expiry_date: null, flagged: await flag("the file couldn't be opened") });
    const buf = new Uint8Array(await blob.arrayBuffer());
    const type = (blob.type || '').toLowerCase() || (/\.pdf$/i.test(path) ? 'application/pdf' : 'image/jpeg');
    if (buf.length > 15 * 1024 * 1024 || !(type.includes('pdf') || /image\/(jpeg|png|gif|webp)/.test(type))) return json({ ok: true, expiry_date: null, flagged: await flag('it isn’t a PDF or photo that can be read') });
    let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + 0x8000)));
    const b64 = btoa(bin);
    const content: unknown[] = [type.includes('pdf')
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } }
      : { type: 'image', source: { type: 'base64', media_type: type, data: b64 } },
      { type: 'text', text: 'This is a UK construction worker\'s training certificate or card (e.g. CSCS, SSSTS, asbestos awareness, PASMA, IPAF, first aid). Record its expiry or renewal date with the record_certificate tool. Only give a date that is printed on it as an expiry, valid-until or renew-by date — never work one out from the issue date.' }];

    // Logged first, then counted (this read included), so reads sent all at once can't get past the cap.
    const { data: use } = await admin.from('ai_usage_log').insert({ org_id: me.org_id, user_id: me.id, fn: 'cert-ai-read', ok: false, note: what }).select('id').single();
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count: usedToday } = await admin.from('ai_usage_log').select('id', { count: 'exact', head: true }).eq('org_id', me.org_id).eq('fn', 'cert-ai-read').gte('created_at', since);
    if ((usedToday || 0) > DAILY) return json({ ok: true, expiry_date: null, flagged: await flag('the daily limit for reading certificates was reached') });

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 400, tools: [{ name: 'record_certificate', description: 'Record the certificate details', input_schema: SCHEMA }], tool_choice: { type: 'tool', name: 'record_certificate' }, messages: [{ role: 'user', content }] }),
    });
    const j = await res.json().catch(() => ({}));
    const tool = res.ok ? (j.content || []).find((c: { type: string }) => c.type === 'tool_use') : null;
    if (tool && use?.id) await admin.from('ai_usage_log').update({ ok: true }).eq('id', use.id).then(undefined, () => undefined);
    const expiry = realDate(tool?.input?.expiry_date);
    if (!expiry) return json({ ok: true, expiry_date: null, flagged: await flag("the date couldn't be read from it") });
    await admin.from('operative_certifications').update({ expiry_date: expiry }).eq('id', cert.id).is('expiry_date', null);
    return json({ ok: true, expiry_date: expiry, flagged: false });
  } catch (e) {
    console.error('cert-ai-read failed', e);
    return json({ error: 'Something went wrong reading the certificate.' }, 500);
  }
});
