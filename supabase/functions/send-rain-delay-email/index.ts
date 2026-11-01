import { createClient } from 'npm:@supabase/supabase-js@2';

// OpHUB — a manager emails a client that a day is lost to the weather.
//   POST { site_id, to, subject, message }
// Managers only, on their own company's jobs. The job's PM is always copied in (the sender if the job has no PM).
const cors = { 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, cache-control, pragma', 'Content-Type': 'application/json' };
const allowed = (o: string | null) => !!o && (['https://operativehub.co.uk', 'https://www.operativehub.co.uk', 'https://ophub-ten.vercel.app', 'capacitor://localhost', 'https://localhost', 'http://localhost'].includes(o)
  || /^https:\/\/ophub-[a-z0-9-]+-op-hub\.vercel\.app$/.test(o) || /^http:\/\/localhost:\d{2,5}$/.test(o) || /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}:\d{2,5}$/.test(o));
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FN = 'send-rain-delay-email';
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  const headers: Record<string, string> = { ...cors, ...(allowed(origin) ? { 'Access-Control-Allow-Origin': origin as string } : {}), Vary: 'Origin' };
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers });
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'Please sign in again' }, 401);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: u } = await admin.auth.getUser(token);
    if (!u?.user) return json({ error: 'Please sign in again' }, 401);
    const { data: me } = await admin.from('profiles').select('id, org_id, name, email, role').eq('id', u.user.id).maybeSingle();
    if (!me || !['pm', 'admin', 'site_manager'].includes(me.role)) return json({ error: 'Managers only' }, 403);
    const b = await req.json().catch(() => ({}));
    const to = String(b.to || '').trim(), subject = String(b.subject || '').trim().slice(0, 200), message = String(b.message || '').trim().slice(0, 6000);
    if (!EMAIL_OK.test(to)) return json({ error: 'Enter a valid email address' }, 400);
    if (!subject || !message) return json({ error: 'Subject and message are needed' }, 400);
    const { data: site } = await admin.from('sites').select('id, org_id, responsible_pm_id').eq('id', b.site_id).maybeSingle();
    if (!site || site.org_id !== me.org_id) return json({ error: 'Forbidden' }, 403);
    const since = new Date(Date.now() - 864e5).toISOString();
    const { count } = await admin.from('edge_email_log').select('id', { count: 'exact', head: true }).eq('fn', FN).eq('sender_id', me.id).gte('created_at', since);
    if ((count || 0) >= 30) return json({ error: 'You’ve reached today’s limit of 30 of these. Try again tomorrow.' }, 429);
    const KEY = Deno.env.get('RESEND_API_KEY');
    if (!KEY) return json({ error: 'Email sending isn’t set up' });
    const { data: pm } = site.responsible_pm_id ? await admin.from('profiles').select('email').eq('id', site.responsible_pm_id).maybeSingle() : { data: null };
    const { data: org } = await admin.from('organizations').select('name').eq('id', me.org_id).maybeSingle();
    const cc = Array.from(new Set([pm?.email || me.email].filter((x) => x && EMAIL_OK.test(x) && String(x).toLowerCase() !== to.toLowerCase())));
    const raw = Deno.env.get('INVITES_FROM_EMAIL') || Deno.env.get('ORDERS_FROM_EMAIL') || 'reports@ophub.app';
    const address = (/<([^>]+)>/.exec(raw)?.[1] || raw).trim();
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `"${String(org?.name || 'OpHUB').replace(/"/g, "'")} - OpHUB" <${address}>`, to: [to], ...(cc.length ? { cc } : {}), ...(me.email ? { reply_to: me.email } : {}), subject, text: message, html: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;white-space:pre-wrap">${esc(message)}</div>` }),
    });
    if (!res.ok) return json({ error: 'Not sent. Try again.' }, 502);
    await admin.from('edge_email_log').insert({ fn: FN, sender_id: me.id, org_id: me.org_id, to_email: to, cc, subject });
    return json({ ok: true, cc });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
