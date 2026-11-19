import { createClient } from 'npm:@supabase/supabase-js@2';

// Company switching (19 Nov 2026, after the security review): before an address becomes someone's "email for this
// company", a 6-digit code is emailed to it and they type it into My Account (confirm_company_email). The code is made
// and checked in the database (cm_new_email_code, service role only); this only emails it. Daily limit per person,
// and every send is logged in edge_email_log like the other senders.

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, cache-control, pragma',
};

// ---- CORS allow-list (as the other server functions) ----
const OPHUB_ORIGINS = new Set([
  'https://operativehub.co.uk',
  'https://www.operativehub.co.uk',
  'https://ophub-ten.vercel.app',
  'https://app.operativehub.co.uk',
  'https://ophub-beta.vercel.app',
  'capacitor://localhost',
  'https://localhost',
  'http://localhost',
]);
function ophubOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  if (OPHUB_ORIGINS.has(origin)) return true;
  if (/^https:\/\/ophub-[a-z0-9-]+-op-hub\.vercel\.app$/.test(origin)) return true;
  if (/^http:\/\/localhost:\d{2,5}$/.test(origin)) return true;
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

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const lc = (s: unknown) => String(s || '').trim().toLowerCase();
const esc = (s: unknown) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

Deno.serve(withCors(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'Not authenticated' }, 401);
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const caller = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY'), { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await caller.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: 'Not authenticated' }, 401);
    const uid = userData.user.id;
    const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { autoRefreshToken: false, persistSession: false } });

    const body = await req.json().catch(() => ({}));
    const orgId = typeof body.org_id === 'string' ? body.org_id : '';
    const email = lc(body.email);
    if (!orgId || !email) return json({ error: 'org_id and email are required' }, 400);

    // 10 codes a day per person.
    const since = new Date(Date.now() - 24 * 60 * 60000).toISOString();
    const { count } = await admin.from('edge_email_log').select('id', { count: 'exact', head: true }).eq('fn', 'send-company-email-code').eq('sender_id', uid).gte('created_at', since);
    if ((count || 0) >= 10) return json({ error: 'limit' }, 429);

    const { data: made, error: mErr } = await admin.rpc('cm_new_email_code', { p_user: uid, p_org: orgId, p_email: email });
    if (mErr) { console.error('send-company-email-code: code', mErr); return json({ error: 'failed' }, 500); }
    if (!made?.ok || !made.code) return json({ error: made?.error || 'failed' });

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) return json({ error: 'not_configured' });
    const rawFrom = Deno.env.get('INVITES_FROM_EMAIL') || Deno.env.get('ORDERS_FROM_EMAIL') || 'invites@ophub.app';
    const addr = ((/<([^>]+)>/.exec(rawFrom) || [])[1] || rawFrom).trim();
    const company = String(made.company || 'your company');
    const code = String(made.code);
    const subject = `Your OpHUB code: ${code}`;
    const text = `Your code is ${code}\n\nType it into OpHUB (My Account > My Companies) to use this address as your email for ${company}. Replies to what you send from ${company} will come here.\n\nThe code works for 15 minutes. If you didn't ask for this, you can ignore this email.\n\nOpHUB - operativehub.co.uk`;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#EEF2F7;font-family:'Segoe UI',Roboto,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF2F7;padding:32px 14px;"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;overflow:hidden;">
      <tr><td style="height:6px;background:#4E8FD1;font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td style="padding:26px 30px 8px;">
        <div style="font-size:20px;font-weight:800;color:#101114;">Your OpHUB code</div>
        <p style="margin:12px 0 0;font-size:15px;line-height:1.5;color:#101114;">Type this code into OpHUB (My Account &rsaquo; My Companies) to use this address as your email for <strong>${esc(company)}</strong>. Replies to what you send from ${esc(company)} will come here.</p>
      </td></tr>
      <tr><td align="center" style="padding:16px 30px;"><div style="display:inline-block;font-size:30px;font-weight:800;letter-spacing:.3em;color:#101114;background:#F4F6F9;border:1px solid #E4E8EE;border-radius:10px;padding:12px 20px;">${esc(code)}</div></td></tr>
      <tr><td style="padding:4px 30px 24px;"><p style="margin:0;font-size:13px;line-height:1.6;color:#5B6270;">The code works for 15 minutes. If you didn't ask for this, you can ignore this email.</p></td></tr>
      <tr><td align="center" style="background:#F6F8FB;padding:14px 28px;border-top:1px solid #E4E8EE;"><span style="font-size:12px;color:#5B6270;">OpHUB &middot; operativehub.co.uk</span></td></tr>
    </table>
  </td></tr></table>
</body></html>`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `"OpHUB" <${addr}>`, to: [email], subject, text, html }),
    });
    if (!res.ok) { console.error('send-company-email-code: provider error', res.status, await res.text()); return json({ error: 'not_sent' }, 502); }
    const { error: logErr } = await admin.from('edge_email_log').insert({ fn: 'send-company-email-code', sender_id: uid, org_id: orgId, to_email: email, cc: [], subject: 'Your OpHUB code' });
    if (logErr) console.warn('edge_email_log: not logged -', logErr.message);
    return json({ ok: true });
  } catch (e) {
    console.error('send-company-email-code failed', e);
    return json({ error: 'failed' }, 500);
  }
}));
