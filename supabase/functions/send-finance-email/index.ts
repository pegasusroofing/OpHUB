import { createClient } from 'npm:@supabase/supabase-js@2';

// OpHUB Finance: emails an invoice / application / certificate / purchase order PDF that the
// app has already built and stored in the private finance-docs bucket.
// Only people with OpHUB Finance switched on (profiles.finance_enabled) can
// use it, and only for files inside their own company's folder.
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
function ophubEmail(o: { company?: string | null; brand?: string | null; logoUrl?: string | null; kicker?: string | null; title: string; greeting?: string | null; intro?: string | null; bodyHtml?: string | null; note?: string | null }): string {
  const company = o.company || 'OpHUB';
  const brand = /^#[0-9a-fA-F]{6}$/.test(String(o.brand || '')) ? String(o.brand) : '#4E8FD1';
  const logo = o.logoUrl || 'https://operativehub.co.uk/assets/ophub-mark.png';
  const p = 'margin:0 0 12px;font-size:15px;line-height:1.5;color:#101114;';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F4F6F9;font-family:'Segoe UI',Roboto,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6F9;padding:32px 16px;"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
      <tr><td style="background:${brand};padding:24px 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="vertical-align:middle;width:46px;"><img src="${ophubEsc(logo)}" alt="${ophubEsc(company)}" width="40" height="40" style="border-radius:8px;background:#fff;object-fit:contain;padding:3px;display:block;"></td>
        <td style="vertical-align:middle;padding-left:14px;"><div style="color:#ffffff;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;opacity:.85;">${ophubEsc(o.kicker || company)}</div><div style="color:#ffffff;font-size:20px;font-weight:800;margin-top:2px;line-height:1.25;">${ophubEsc(o.title)}</div></td>
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
function ophubRows(rows: [string, unknown][]): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:4px 0 12px;">${rows.filter((r) => r[1] != null && String(r[1]) !== '').map((r) => `<tr><td style="padding:6px 14px 6px 0;color:#8A8D93;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;vertical-align:top;white-space:nowrap;">${ophubEsc(r[0])}</td><td style="padding:6px 0;font-size:15px;font-weight:700;color:#101114;">${ophubEsc(r[1])}</td></tr>`).join('')}</table>`;
}
const KIND_LABEL: Record<string, string> = { invoice: 'Invoice', application: 'Application for payment', certificate: 'Payment certificate', credit: 'Credit note', po: 'Purchase order' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    const { data: caller } = await admin.from('profiles').select('org_id, name, email, finance_enabled').eq('id', userData.user.id).maybeSingle();
    if (!caller || !caller.finance_enabled || !caller.org_id) return json({ error: 'OpHUB Finance is not switched on for your account.' }, 403);

    const body = await req.json().catch(() => ({}));
    const kind = String(body.kind || 'invoice');
    const storagePath = String(body.storage_path || '');
    const filename = String(body.filename || 'document.pdf').replace(/[\r\n"]/g, '').slice(0, 120);
    const recipients: string[] = (Array.isArray(body.recipients) ? body.recipients : []).map((r: unknown) => String(r).trim()).filter((r: string) => EMAIL_RE.test(r)).slice(0, 10);
    const cc: string[] = (Array.isArray(body.cc) ? body.cc : []).map((r: unknown) => String(r).trim()).filter((r: string) => EMAIL_RE.test(r)).slice(0, 5);
    if (!KIND_LABEL[kind]) return json({ error: 'Unknown document type' }, 400);
    if (!recipients.length) return json({ error: 'Add at least one email address.' }, 400);
    // The main document can be taken off in the app's send pop-up (26 Oct), as long as something is attached.
    if (storagePath && (!storagePath.startsWith(caller.org_id + '/') || storagePath.includes('..'))) return json({ error: 'Forbidden' }, 403);
    const extraList = (Array.isArray(body.extra_attachments) ? body.extra_attachments : []).slice(0, 6);
    if (!storagePath && !extraList.length) return json({ error: 'Attach at least one file.' }, 400);

    const { data: site } = await admin.from('sites').select('id, org_id, name, job_number').eq('id', body.site_id).maybeSingle();
    if (!site || site.org_id !== caller.org_id) return json({ error: 'Forbidden' }, 403);
    const sentToday = await emailSendsSince(admin, 'send-finance-email', 'sender_id', userData.user.id, 24 * 60);
    if (sentToday != null && sentToday >= 100) return json({ error: 'You’ve reached today’s limit of 100 finance emails — try again tomorrow.' }, 429);

    let buf = new Uint8Array(0);
    let attachment = '';
    if (storagePath) {
      const { data: fileBlob, error: dlErr } = await admin.storage.from('finance-docs').download(storagePath);
      if (dlErr || !fileBlob) return json({ error: 'Could not find the PDF to attach.' }, 404);
      buf = new Uint8Array(await fileBlob.arrayBuffer());
      if (buf.length > 30 * 1024 * 1024) return json({ error: 'The PDF is too large to email.' }, 413);
      let binary = '';
      for (let i = 0; i < buf.length; i += 0x8000) binary += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + 0x8000)));
      attachment = btoa(binary);
    }
    // Extra attachments (e.g. the Schedule of Works report sent with an application as proof of works).
    const extras: { filename: string; content: string }[] = [];
    let totalBytes = buf.length;
    for (const x of extraList) {
      const p = String((x && x.storage_path) || '');
      if (!p.startsWith(caller.org_id + '/') || p.includes('..')) return json({ error: 'Forbidden' }, 403);
      const { data: xb, error: xe } = await admin.storage.from('finance-docs').download(p);
      if (xe || !xb) return json({ error: 'Could not find the extra file to attach.' }, 404);
      const xbuf = new Uint8Array(await xb.arrayBuffer());
      totalBytes += xbuf.length;
      if (totalBytes > 35 * 1024 * 1024) return json({ error: 'The attachments are too large to email together.' }, 413);
      let xbin = '';
      for (let i = 0; i < xbuf.length; i += 0x8000) xbin += String.fromCharCode.apply(null, Array.from(xbuf.subarray(i, i + 0x8000)));
      extras.push({ filename: String((x && x.filename) || 'attachment.pdf').replace(/[\r\n"]/g, '').slice(0, 120), content: btoa(xbin) });
    }

    const { data: org } = await admin.from('organizations').select('name, logo_path, color_primary').eq('id', caller.org_id).maybeSingle();
    const company = org?.name || 'OpHUB';
    const logoUrl = org?.logo_path ? `${SUPABASE_URL}/storage/v1/object/public/org-logos/${org.logo_path}` : null;
    const label = KIND_LABEL[kind];
    const isPo = kind === 'po';
    const ref = String(body.reference || '').slice(0, 60);
    const customSubject = String(body.subject || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 200);
    const subject = customSubject || `${label}${ref ? ' ' + ref : ''} — ${site.name}${site.job_number ? ' (Job ' + site.job_number + ')' : ''}`;
    const rows: [string, unknown][] = isPo
      ? [['Job', site.name + (site.job_number ? ' · ' + site.job_number : '')], ['PO number', ref], ['Order value', String(body.amount || '').slice(0, 30)], ['Delivery', String(body.due || '').slice(0, 40)]]
      : [['Job', site.name + (site.job_number ? ' · ' + site.job_number : '')], ['Reference', ref], ['Your PO', String(body.client_po || '').slice(0, 60)], ['Amount', String(body.amount || '').slice(0, 30)], ['Due', String(body.due || '').slice(0, 30)]];
    const message = String(body.message || '').slice(0, 2000);
    const sender = caller.name || company;
    const intro = isPo ? `Please find attached our purchase order ${ref} for ${site.name}. Please quote the PO number on your delivery note and invoice.` : `Please find attached our ${label.toLowerCase()} for ${site.name}.`;
    const htmlStd = ophubEmail({
      company, brand: org?.color_primary, logoUrl, kicker: site.name, title: label + (ref ? ' ' + ref : ''),
      greeting: 'Hello,', intro,
      bodyHtml: ophubRows(rows) + (message ? `<p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#101114;white-space:pre-wrap;">${ophubEsc(message)}</p>` : '') + `<p style="margin:18px 0 12px;font-size:15px;line-height:1.5;color:#101114;">Kind regards,<br>${ophubEsc(sender)}<br>${ophubEsc(company)}</p>`,
    });
    // The send pop-up (26 Oct) passes the whole message as typed: it's sent as written, inside the branded email.
    const bodyText = String(body.body_text || '').replace(/\r\n/g, '\n').slice(0, 5000).trim();
    const html = bodyText
      ? ophubEmail({ company, brand: org?.color_primary, logoUrl, kicker: site.name, title: label + (ref ? ' ' + ref : ''),
          bodyHtml: `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#101114;white-space:pre-wrap;">${ophubEsc(bodyText)}</p>` })
      : htmlStd;
    const text = bodyText || `Hello,\n\n${intro}\n${rows.filter(r => r[1]).map(r => r[0] + ': ' + r[1]).join('\n')}\n\n${message ? message + '\n\n' : ''}Kind regards,\n${sender}\n${company}`;

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const FROM_EMAIL = Deno.env.get('INVITES_FROM_EMAIL') || Deno.env.get('ORDERS_FROM_EMAIL') || 'reports@ophub.app';
    if (!RESEND_API_KEY) return json({ error: 'Email sending is not set up (missing RESEND_API_KEY).' }, 500);
    const payload: Record<string, unknown> = { from: ophubFrom(FROM_EMAIL, company), to: recipients, subject, text, html, attachments: [...(attachment ? [{ filename, content: attachment }] : []), ...extras] };
    const ccList = cc.filter((c) => !recipients.some((r) => r.toLowerCase() === c.toLowerCase()));
    if (ccList.length) payload.cc = ccList;
    if (caller.email && EMAIL_RE.test(caller.email)) payload.reply_to = caller.email;
    const res = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) {
      console.error('send-finance-email: provider error', res.status, await res.text());
      return json({ error: 'The email service didn’t accept the email — please try again.' }, 502);
    }
    await logEmailSend(admin, { fn: 'send-finance-email', sender_id: userData.user.id, org_id: caller.org_id, to: recipients, cc: ccList, subject });
    return json({ ok: true });
  } catch (e) {
    console.error('send-finance-email failed', e);
    return json({ error: 'Something went wrong sending the email — please try again.' }, 500);
  }
}));
