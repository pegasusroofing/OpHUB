import { createClient } from 'npm:@supabase/supabase-js@2';

// OpHUB Projects (3 Nov 2026): emails a Health & Safety PDF the app has just built (e.g. who is still to sign
// the RAMS) with the same send pop-up as Finance: To, CC me, subject and message. Project managers and admins
// only, for a job in their own company; the PDF comes in the request (base64) and must really be a PDF.
const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, cache-control, pragma',
};

// ---- CORS allow-list (security review L8, 25 Oct 2026) ----
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

async function emailSendsSince(admin: any, fn: string, field: 'sender_id' | 'to_email', value: string, minutes: number): Promise<number | null> {
  try {
    const since = new Date(Date.now() - minutes * 60000).toISOString();
    const { count, error } = await admin.from('edge_email_log').select('id', { count: 'exact', head: true }).eq('fn', fn).eq(field, value).gte('created_at', since);
    if (error) { console.warn('edge_email_log: limit skipped -', error.message || error.code || error); return null; }
    return count || 0;
  } catch (e) { console.warn('edge_email_log: limit skipped -', e); return null; }
}
const lc = (s: unknown) => String(s || '').trim().toLowerCase();
async function logEmailSend(admin: any, row: { fn: string; sender_id?: string | null; org_id?: string | null; to: string[]; cc?: string[]; subject: string }) {
  const to = row.to.map(lc).filter(Boolean);
  console.log('email sent', JSON.stringify({ fn: row.fn, sender: row.sender_id || null, org: row.org_id || null, to, cc: (row.cc || []).map(lc), subject: row.subject }));
  try {
    const { error } = await admin.from('edge_email_log').insert({ fn: row.fn, sender_id: row.sender_id || null, org_id: row.org_id || null, to_email: to[0] || '', cc: [...to.slice(1), ...(row.cc || []).map(lc)], subject: String(row.subject || '').slice(0, 300) });
    if (error) console.warn('edge_email_log: not logged -', error.message || error.code || error);
  } catch (e) { console.warn('edge_email_log: not logged -', e); }
}
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

function ophubEsc(s: unknown): string { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function ophubFrom(rawFrom: string | undefined | null, company: string): string {
  const m = /<([^>]+)>/.exec(rawFrom || '');
  const address = (m ? m[1] : rawFrom || 'reports@ophub.app').trim();
  return `"${`${company || 'OpHUB'}`.replace(/"/g, "'")}" <${address}>`;
}
function ophubEmail(o: { company?: string | null; brand?: string | null; logoUrl?: string | null; noLogo?: boolean; kicker?: string | null; title: string; greeting?: string | null; intro?: string | null; bodyHtml?: string | null; note?: string | null }): string {
  const company = o.company || 'OpHUB';
  const brand = /^#[0-9a-fA-F]{6}$/.test(String(o.brand || '')) ? String(o.brand) : '#4E8FD1';
  const logo = o.logoUrl || 'https://operativehub.co.uk/assets/ophub-mark.png';
  const p = 'margin:0 0 12px;font-size:15px;line-height:1.5;color:#101114;';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F4F6F9;font-family:'Segoe UI',Roboto,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6F9;padding:32px 16px;"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
      <tr><td style="background:${brand};padding:24px 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        ${o.noLogo ? '' : `<td style="vertical-align:middle;width:46px;"><img src="${ophubEsc(logo)}" alt="${ophubEsc(company)}" width="40" height="40" style="border-radius:8px;background:#fff;object-fit:contain;padding:3px;display:block;"></td>`}
        <td style="vertical-align:middle;padding-left:${o.noLogo ? 0 : 14}px;"><div style="color:#ffffff;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;opacity:.85;">${ophubEsc(o.kicker || company)}</div><div style="color:#ffffff;font-size:20px;font-weight:800;margin-top:2px;line-height:1.25;">${ophubEsc(o.title)}</div></td>
      </tr></table></td></tr>
      <tr><td style="padding:24px 28px 8px;">
        ${o.greeting ? `<p style="${p}">${ophubEsc(o.greeting)}</p>` : ''}
        ${o.intro ? `<p style="${p}color:#3A3B3E;">${ophubEsc(o.intro)}</p>` : ''}
        ${o.bodyHtml || ''}
      </td></tr>
      ${o.note ? `<tr><td style="padding:10px 28px 18px;"><p style="margin:0;font-size:12.5px;color:#8A8D93;line-height:1.6;">${ophubEsc(o.note)}</p></td></tr>` : `<tr><td style="padding:0 28px 14px;"></td></tr>`}
      <tr><td style="background:#F5F6F8;padding:16px 28px;text-align:center;"><span style="font-size:11px;color:#9A978C;letter-spacing:.05em;">${ophubEsc(company)}</span></td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}
const KIND_LABEL: Record<string, string> = { signatures: 'Outstanding signatures', rams: 'RAMS', coshh: 'COSHH' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const looksLikePdfBase64 = (b64: unknown) => typeof b64 === 'string' && b64.replace(/\s+/g, '').startsWith('JVBERi0');

Deno.serve(withCors(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'Not authenticated' }, 401);
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const { data: userData, error: userErr } = await createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } }).auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: 'Not authenticated' }, 401);
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: caller } = await admin.from('profiles').select('org_id, name, email, role').eq('id', userData.user.id).maybeSingle();
    if (!caller || !caller.org_id || (caller.role !== 'pm' && caller.role !== 'admin')) return json({ error: 'Project managers and admins only.' }, 403);

    const body = await req.json().catch(() => ({}));
    const kind = String(body.kind || '');
    if (!KIND_LABEL[kind]) return json({ error: 'Unknown document type' }, 400);
    const recipients: string[] = (Array.isArray(body.recipients) ? body.recipients : []).map((r: unknown) => String(r).trim()).filter((r: string) => EMAIL_RE.test(r)).slice(0, 10);
    const cc: string[] = (Array.isArray(body.cc) ? body.cc : []).map((r: unknown) => String(r).trim()).filter((r: string) => EMAIL_RE.test(r)).slice(0, 5);
    if (!recipients.length) return json({ error: 'Add at least one email address.' }, 400);
    const content = String(body.content_base64 || '').replace(/\s+/g, '');
    if (!looksLikePdfBase64(content)) return json({ error: 'Only a PDF can be attached.' }, 400);
    if (content.length > 14 * 1024 * 1024) return json({ error: 'The PDF is too large to email.' }, 413);
    const filename = (String(body.filename || 'document.pdf').replace(/[\r\n"\\/:*?<>|]+/g, '_').slice(0, 120) || 'document.pdf').replace(/(\.pdf)?$/i, '.pdf');

    const { data: site } = await admin.from('sites').select('id, org_id, name, job_number').eq('id', body.site_id).maybeSingle();
    if (!site || site.org_id !== caller.org_id) return json({ error: 'Forbidden' }, 403);
    const sentToday = await emailSendsSince(admin, 'send-hs-email', 'sender_id', userData.user.id, 24 * 60);
    if (sentToday != null && sentToday >= 60) return json({ error: 'You’ve reached today’s limit of 60 emails — try again tomorrow.' }, 429);

    const { data: org } = await admin.from('organizations').select('name, logo_path, color_primary').eq('id', caller.org_id).maybeSingle();
    const company = org?.name || 'OpHUB';
    const logoUrl = org?.logo_path ? `${SUPABASE_URL}/storage/v1/object/public/org-logos/${org.logo_path}` : null;
    const hideLogo = body.hide_logo === true;
    const logoPrefix = `${SUPABASE_URL}/storage/v1/object/public/org-logos/${caller.org_id}/`;
    const extraLogos = (Array.isArray(body.logos) ? body.logos : []).map((u: unknown) => String(u)).filter((u: string) => u.startsWith(logoPrefix) && !u.includes('..') && !/["'<>\s]/.test(u)).slice(0, 6);
    const logosHtml = extraLogos.length ? `<div style="margin:14px 0 4px;">${extraLogos.map((u: string) => `<img src="${ophubEsc(u)}" alt="" height="44" style="height:44px;width:auto;max-width:150px;margin:0 12px 8px 0;display:inline-block;border:0;">`).join('')}</div>` : '';
    const label = KIND_LABEL[kind];
    const subject = String(body.subject || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 200) || `${label} — ${site.name}${site.job_number ? ' (Job ' + site.job_number + ')' : ''}`;
    const bodyText = String(body.body_text || '').replace(/\r\n/g, '\n').slice(0, 5000).trim() || `Hello,\n\nPlease find attached the ${label.toLowerCase()} for ${site.name}.\n\nKind regards,`;
    const sigHtml = `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 6px;border-top:1px solid #ECEEF2;padding-top:14px;width:100%;"><tr><td style="padding-top:14px;">`
      + (caller.name ? `<div style="font-size:15px;font-weight:700;color:#101114;">${ophubEsc(caller.name)}</div>` : '')
      + `<div style="font-size:13.5px;color:#3A3B3E;line-height:1.6;">${ophubEsc(company)}</div>`
      + (caller.email ? `<div style="font-size:13.5px;line-height:1.6;"><a href="mailto:${ophubEsc(caller.email)}" style="color:#2F6FDE;text-decoration:none;">${ophubEsc(caller.email)}</a></div>` : '')
      + (logoUrl && !hideLogo ? `<div style="margin-top:12px;"><img src="${ophubEsc(logoUrl)}" alt="${ophubEsc(company)}" height="52" style="height:52px;width:auto;max-width:200px;display:block;border:0;"></div>` : '')
      + `</td></tr></table>`;
    const html = ophubEmail({ company, brand: org?.color_primary, logoUrl, noLogo: hideLogo, kicker: site.name, title: label,
      bodyHtml: `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#101114;white-space:pre-wrap;">${ophubEsc(bodyText)}</p>` + sigHtml + logosHtml });
    const text = bodyText + '\n\n--\n' + [caller.name || '', company, caller.email || ''].filter(Boolean).join('\n');

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const FROM_EMAIL = Deno.env.get('INVITES_FROM_EMAIL') || Deno.env.get('ORDERS_FROM_EMAIL') || 'reports@ophub.app';
    if (!RESEND_API_KEY) return json({ error: 'Email sending is not set up (missing RESEND_API_KEY).' }, 500);
    const payload: Record<string, unknown> = { from: ophubFrom(FROM_EMAIL, company), to: recipients, subject, text, html, attachments: [{ filename, content }] };
    const ccList = cc.filter((c) => !recipients.some((r) => r.toLowerCase() === c.toLowerCase()));
    if (ccList.length) payload.cc = ccList;
    if (caller.email && EMAIL_RE.test(caller.email)) payload.reply_to = caller.email;
    const res = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) {
      console.error('send-hs-email: provider error', res.status, await res.text());
      return json({ error: 'The email service didn’t accept the email — please try again.' }, 502);
    }
    await logEmailSend(admin, { fn: 'send-hs-email', sender_id: userData.user.id, org_id: caller.org_id, to: recipients, cc: ccList, subject });
    return json({ ok: true });
  } catch (e) {
    console.error('send-hs-email failed', e);
    return json({ error: 'Something went wrong sending the email — please try again.' }, 500);
  }
}));
