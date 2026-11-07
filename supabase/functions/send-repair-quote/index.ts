import { createClient } from 'npm:@supabase/supabase-js@2';

// Emails a repair job's quote to the client (Andy, 7 Nov 2026), from Finance › the quote › Save & Send To Client. The
// app has already made the quote PDF and put it in the private finance-docs bucket. When the contract has "Client
// Approves Quotes Online" switched on, the email has an Approve Or Reject Online button (operativehub.co.uk/quote.html,
// answered by repair-quote-decision). Only people with OpHUB Finance switched on, only for their own company's jobs and
// files. Daily limit as send-finance-email. The app holds it back during the Finance trial (not for Sandbox Roofing).
//   { repair_job_id, storage_path, filename, recipients[], cc[], body_text }
const corsHeaders = { 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, cache-control, pragma' };
const OPHUB_ORIGINS = new Set(['https://operativehub.co.uk', 'https://www.operativehub.co.uk', 'https://ophub-ten.vercel.app', 'capacitor://localhost', 'https://localhost', 'http://localhost']);
const originOk = (o: string | null) => !!o && (OPHUB_ORIGINS.has(o) || /^https:\/\/ophub-[a-z0-9-]+-op-hub\.vercel\.app$/.test(o) || /^http:\/\/localhost:\d{2,5}$/.test(o));
const reply = (req: Request, obj: unknown, status = 200) => {
  const h = new Headers({ ...corsHeaders, 'Content-Type': 'application/json', Vary: 'Origin' });
  const o = req.headers.get('Origin');
  if (originOk(o)) h.set('Access-Control-Allow-Origin', o as string);
  return new Response(JSON.stringify(obj), { status, headers: h });
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PAGE = 'https://operativehub.co.uk/quote.html';
const esc = (s: unknown) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const lc = (s: unknown) => String(s || '').trim().toLowerCase();
function fromOf(rawFrom: string | undefined | null, company: string): string {
  const m = /<([^>]+)>/.exec(rawFrom || '');
  const address = (m ? m[1] : rawFrom || 'reports@ophub.app').trim();
  return `"${`${company || 'OpHUB'}`.replace(/"/g, "'")}" <${address}>`;
}
// The same branded layout as the other OpHUB emails.
function emailHtml(o: { company: string; brand?: string | null; logoUrl?: string | null; kicker: string; title: string; bodyHtml: string }): string {
  const brand = /^#[0-9a-fA-F]{6}$/.test(String(o.brand || '')) ? String(o.brand) : '#4E8FD1';
  const logo = o.logoUrl || 'https://operativehub.co.uk/assets/ophub-mark.png';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F4F6F9;font-family:'Segoe UI',Roboto,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6F9;padding:32px 16px;"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
      <tr><td style="background:${brand};padding:24px 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="vertical-align:middle;width:46px;"><img src="${esc(logo)}" alt="${esc(o.company)}" width="40" height="40" style="border-radius:8px;background:#fff;object-fit:contain;padding:3px;display:block;"></td>
        <td style="vertical-align:middle;padding-left:14px;"><div style="color:#ffffff;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;opacity:.85;">${esc(o.kicker)}</div><div style="color:#ffffff;font-size:20px;font-weight:800;margin-top:2px;line-height:1.25;">${esc(o.title)}</div></td>
      </tr></table></td></tr>
      <tr><td style="padding:24px 28px 8px;">${o.bodyHtml}</td></tr>
      <tr><td style="padding:0 28px 14px;"></td></tr>
      <tr><td style="background:#F5F6F8;padding:16px 28px;text-align:center;"><span style="font-size:11px;color:#9A978C;letter-spacing:.05em;">${esc(o.company)}</span></td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}
async function sendsSince(admin: any, userId: string, minutes: number): Promise<number | null> {
  try {
    const since = new Date(Date.now() - minutes * 60000).toISOString();
    const { count, error } = await admin.from('edge_email_log').select('id', { count: 'exact', head: true }).in('fn', ['send-finance-email', 'send-repair-quote']).eq('sender_id', userId).gte('created_at', since);
    return error ? null : count || 0;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return reply(req, { ok: true });
  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return reply(req, { error: 'Not authenticated' }, 401);
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!, ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
    const { data: userData, error: userErr } = await createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } }).auth.getUser(token);
    if (userErr || !userData?.user) return reply(req, { error: 'Not authenticated' }, 401);
    const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: caller } = await admin.from('profiles').select('id, org_id, name, email, finance_enabled').eq('id', userData.user.id).maybeSingle();
    if (!caller || !caller.finance_enabled || !caller.org_id) return reply(req, { error: 'OpHUB Finance is not switched on for your account.' }, 403);

    const body = await req.json().catch(() => ({}));
    const { data: job } = await admin.from('repair_jobs').select('id, org_id, site_id, job_number, address, quote_token').eq('id', String(body.repair_job_id || '')).maybeSingle();
    if (!job || job.org_id !== caller.org_id) return reply(req, { error: 'Forbidden' }, 403);
    const { data: site } = await admin.from('sites').select('id, org_id, name, job_number, repair_online_approval').eq('id', job.site_id).maybeSingle();
    if (!site || site.org_id !== caller.org_id) return reply(req, { error: 'Forbidden' }, 403);

    // The approval link: the job's own random code (made once, kept).
    let link = '';
    if (site.repair_online_approval) {
      let code = job.quote_token as string | null;
      if (!code) { code = crypto.randomUUID(); const { error } = await admin.from('repair_jobs').update({ quote_token: code }).eq('id', job.id); if (error) return reply(req, { error: 'Could not make the approval link — try again.' }, 500); }
      link = `${PAGE}?t=${code}`;
    }
    // { action: 'link' }: just the link, to send yourself (nothing is emailed; allowed during the Finance trial).
    if (body.action === 'link') return link ? reply(req, { ok: true, link }) : reply(req, { error: 'Switch on Client Approves Quotes Online in Project Admin first.' }, 400);

    const recipients: string[] = (Array.isArray(body.recipients) ? body.recipients : []).map((r: unknown) => String(r).trim()).filter((r: string) => EMAIL_RE.test(r)).slice(0, 10);
    const cc: string[] = (Array.isArray(body.cc) ? body.cc : []).map((r: unknown) => String(r).trim()).filter((r: string) => EMAIL_RE.test(r)).slice(0, 5);
    if (!recipients.length) return reply(req, { error: 'Add at least one email address.' }, 400);
    const storagePath = String(body.storage_path || '');
    if (!storagePath.startsWith(caller.org_id + '/') || storagePath.includes('..')) return reply(req, { error: 'Forbidden' }, 403);
    const filename = String(body.filename || 'Quote.pdf').replace(/[\r\n"]/g, '').slice(0, 120);
    const sent = await sendsSince(admin, caller.id, 24 * 60);
    if (sent != null && sent >= 100) return reply(req, { error: 'You’ve reached today’s limit of 100 finance emails — try again tomorrow.' }, 429);

    const { data: fileBlob, error: dlErr } = await admin.storage.from('finance-docs').download(storagePath);
    if (dlErr || !fileBlob) return reply(req, { error: 'Could not find the quote PDF to attach.' }, 404);
    const buf = new Uint8Array(await fileBlob.arrayBuffer());
    if (buf.length > 30 * 1024 * 1024) return reply(req, { error: 'The PDF is too large to email.' }, 413);
    let binary = '';
    for (let i = 0; i < buf.length; i += 0x8000) binary += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + 0x8000)));

    const { data: org } = await admin.from('organizations').select('name, logo_path, color_primary').eq('id', caller.org_id).maybeSingle();
    const company = org?.name || 'OpHUB';
    const logoUrl = org?.logo_path ? `${SUPABASE_URL}/storage/v1/object/public/org-logos/${org.logo_path}` : null;
    const ref = [job.job_number, job.address].filter(Boolean).join(' — ');
    const subject = String(body.subject || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 200) || `Quote${job.job_number ? ` ${job.job_number}` : ''} — ${job.address || site.name}`;
    const bodyText = String(body.body_text || '').replace(/\r\n/g, '\n').slice(0, 5000).trim() || `Hello,\n\nPlease find attached our quote for ${ref || site.name}.`;
    const brand = /^#[0-9a-fA-F]{6}$/.test(String(org?.color_primary || '')) ? String(org?.color_primary) : '#4E8FD1';
    const button = link ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 8px;"><tr><td style="background:${brand};border-radius:10px;"><a href="${esc(link)}" style="display:inline-block;padding:14px 22px;color:#ffffff;font-size:15px;font-weight:800;text-decoration:none;">Approve Or Reject Online</a></td></tr></table><p style="margin:0 0 12px;font-size:12.5px;color:#8A8D93;line-height:1.6;">Or open this link: <a href="${esc(link)}" style="color:#2F6FDE;">${esc(link)}</a></p>` : '';
    const sig = `<p style="margin:18px 0 6px;border-top:1px solid #ECEEF2;padding-top:14px;font-size:14px;line-height:1.6;color:#3A3B3E;">${caller.name ? `<b style="color:#101114;">${esc(caller.name)}</b><br>` : ''}${esc(company)}${caller.email ? `<br><a href="mailto:${esc(caller.email)}" style="color:#2F6FDE;text-decoration:none;">${esc(caller.email)}</a>` : ''}</p>`;
    const html = emailHtml({ company, brand: org?.color_primary, logoUrl, kicker: site.name, title: `Quote${job.job_number ? ` ${job.job_number}` : ''}`, bodyHtml: `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#101114;white-space:pre-wrap;">${esc(bodyText)}</p>${button}${sig}` });
    const text = `${bodyText}${link ? `\n\nApprove or reject the quote online: ${link}` : ''}\n\n--\n${[caller.name, company, caller.email].filter(Boolean).join('\n')}`;

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const FROM_EMAIL = Deno.env.get('INVITES_FROM_EMAIL') || Deno.env.get('ORDERS_FROM_EMAIL') || 'reports@ophub.app';
    if (!RESEND_API_KEY) return reply(req, { error: 'Email sending is not set up.' }, 500);
    const ccList = cc.filter((c) => !recipients.some((r) => r.toLowerCase() === c.toLowerCase()));
    const payload: Record<string, unknown> = { from: fromOf(FROM_EMAIL, company), to: recipients, subject, text, html, attachments: [{ filename, content: btoa(binary) }] };
    if (ccList.length) payload.cc = ccList;
    if (caller.email && EMAIL_RE.test(caller.email)) payload.reply_to = caller.email;
    const res = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) { console.error('send-repair-quote: provider error', res.status, await res.text()); return reply(req, { error: 'The email service didn’t accept the email — please try again.' }, 502); }
    try {
      const to = recipients.map(lc);
      await admin.from('edge_email_log').insert({ fn: 'send-repair-quote', sender_id: caller.id, org_id: caller.org_id, to_email: to[0] || '', cc: [...to.slice(1), ...ccList.map(lc)], subject: subject.slice(0, 300) });
    } catch { /* logged best-effort */ }
    await admin.from('repair_jobs').update({ quote_sent_by: caller.id, quote_sent_to: recipients.join(', ') }).eq('id', job.id);
    return reply(req, { ok: true, link: link || null });
  } catch (e) {
    console.error('send-repair-quote failed', e);
    return reply(req, { error: 'Something went wrong sending the email — please try again.' }, 500);
  }
});
