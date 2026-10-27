import { createClient } from 'npm:@supabase/supabase-js@2';
import { encodeBase64 } from 'jsr:@std/encoding@1/base64';

// Emails expense receipts to the company's preset expenses address
// (organizations.expenses_email) - ONE EMAIL PER RECEIPT, so the office gets
// one clearly labelled email per photo/file (job, who, receipt n of N) with
// that single file attached, ready to save straight into accounts.
// The caller sends only { batch_id, cc_me } - or { batch_id, expense_id,
// resend:true } to send one already-emailed entry again. Everything else -
// who they are, which receipts are in the batch, where it goes - is read
// here from the database:
//   - the caller must be signed in and the batch must be THEIR OWN (a
//     PM/admin may also RESEND an entry belonging to someone in their company),
//   - the address is the company's saved one, never one from the request,
//   - cc_me can only ever copy in the caller's own account email,
//   - an entry is only emailed again when a resend is asked for.
// A file too large to attach (over 15MB) is sent as a link in its own email.
const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, cache-control, pragma',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const esc = (s: unknown) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f-]{36}$/i;
const ATTACH_LIMIT = 15 * 1024 * 1024;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

// ---- OpHUB email send log (security review M7, 25 Oct 2026) ----
const lc = (s: unknown) => String(s || '').trim().toLowerCase();
// Per-user (or per-address) send log + daily limit in public.edge_email_log
// (see NEEDS-SQL.md). If the table isn't there yet the limit is skipped and
// the send is only written to the function log - it never blocks a send.
async function emailSendsSince(admin: any, fn: string, field: 'sender_id' | 'to_email', value: string, minutes: number): Promise<number | null> {
  try {
    const since = new Date(Date.now() - minutes * 60000).toISOString();
    const { count, error } = await admin.from('edge_email_log').select('id', { count: 'exact', head: true }).eq('fn', fn).eq(field, value).gte('created_at', since);
    if (error) { console.warn('edge_email_log: limit skipped -', error.message || error.code || error); return null; }
    return count || 0;
  } catch (e) { console.warn('edge_email_log: limit skipped -', e); return null; }
}
async function logEmailSend(admin: any, row: { fn: string; sender_id?: string | null; org_id?: string | null; to: string[]; cc?: string[]; subject: string }) {
  const to = row.to.map(lc).filter(Boolean);
  console.log('email sent', JSON.stringify({ fn: row.fn, sender: row.sender_id || null, org: row.org_id || null, to, cc: (row.cc || []).map(lc), subject: row.subject }));
  try {
    // One row per email sent: the first To address, every other To / Cc address in `cc`.
    const { error } = await admin.from('edge_email_log').insert({ fn: row.fn, sender_id: row.sender_id || null, org_id: row.org_id || null, to_email: to[0] || '', cc: [...to.slice(1), ...(row.cc || []).map(lc)], subject: String(row.subject || '').slice(0, 300) });
    if (error) console.warn('edge_email_log: not logged -', error.message || error.code || error);
  } catch (e) { console.warn('edge_email_log: not logged -', e); }
}
// ---- end OpHUB email send log ----

// ---- OpHUB standard email layout (identical in every function — do not edit per function) ----
// One look for every email OpHUB sends: a header band in the company's
// colour with its logo, a short heading, the content, an optional button,
// and the same footer. `bodyHtml` is trusted HTML built by the caller (escape
// any user text with ophubEsc first); every other field is escaped here.
function ophubEsc(s: unknown): string { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function ophubFrom(rawFrom: string | undefined | null, company: string): string {
  const m = /<([^>]+)>/.exec(rawFrom || '');
  const address = (m ? m[1] : rawFrom || 'reports@ophub.app').trim();
  return `"${`${company || 'OpHUB'} - OpHUB`.replace(/"/g, "'")}" <${address}>`;
}
function ophubEmail(o: { company?: string | null; brand?: string | null; logoUrl?: string | null; kicker?: string | null; title: string; greeting?: string | null; intro?: string | null; bodyHtml?: string | null; button?: { label: string; url: string } | null; note?: string | null }): string {
  const company = o.company || 'OpHUB';
  const brand = /^#[0-9a-fA-F]{6}$/.test(String(o.brand || '')) ? String(o.brand) : '#4E8FD1';
  const logo = o.logoUrl || 'https://operativehub.co.uk/assets/ophub-mark.png';
  const p = 'margin:0 0 12px;font-size:15px;line-height:1.5;color:#101114;';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#EFEDE6;font-family:'Segoe UI',Roboto,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EFEDE6;padding:32px 16px;"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
      <tr><td style="background:${brand};padding:24px 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="vertical-align:middle;width:46px;"><img src="${ophubEsc(logo)}" alt="${ophubEsc(company)}" width="40" height="40" style="border-radius:8px;background:#fff;object-fit:contain;padding:3px;display:block;"></td>
        <td style="vertical-align:middle;padding-left:14px;"><div style="color:#ffffff;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;opacity:.85;">${ophubEsc(o.kicker || ('OpHUB · ' + company))}</div><div style="color:#ffffff;font-size:20px;font-weight:800;margin-top:2px;line-height:1.25;">${ophubEsc(o.title)}</div></td>
      </tr></table></td></tr>
      <tr><td style="padding:24px 28px 8px;">
        ${o.greeting ? `<p style="${p}">${ophubEsc(o.greeting)}</p>` : ''}
        ${o.intro ? `<p style="${p}color:#3A3B3E;">${ophubEsc(o.intro)}</p>` : ''}
        ${o.bodyHtml || ''}
        ${o.button && o.button.url ? `<p style="margin:18px 0 6px;"><a href="${ophubEsc(o.button.url)}" style="background:#1A1D21;color:#ffffff;padding:11px 18px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:700;font-size:14px;">${ophubEsc(o.button.label)}</a></p>` : ''}
      </td></tr>
      ${o.note ? `<tr><td style="padding:10px 28px 18px;"><p style="margin:0;font-size:12.5px;color:#8A8D93;line-height:1.6;">${ophubEsc(o.note)}</p></td></tr>` : `<tr><td style="padding:0 28px 14px;"></td></tr>`}
      <tr><td style="background:#F5F4EF;padding:16px 28px;text-align:center;"><span style="font-size:11px;color:#9A978C;letter-spacing:.05em;">Sent via OpHUB &middot; ${ophubEsc(company)}</span></td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}
// A labelled detail table for use inside bodyHtml: ophubRows([['Job', 'Cleveland School'], ['Due', '12 Oct']]).
function ophubRows(rows: [string, unknown][]): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:4px 0 12px;">${rows.filter((r) => r[1] != null && String(r[1]) !== '').map((r) => `<tr><td style="padding:6px 14px 6px 0;color:#8A8D93;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;vertical-align:top;white-space:nowrap;">${ophubEsc(r[0])}</td><td style="padding:6px 0;font-size:15px;font-weight:700;color:#101114;">${ophubEsc(r[1])}</td></tr>`).join('')}</table>`;
}
// ---- end OpHUB standard email layout ----

Deno.serve(withCors(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'Not authenticated' }, 401);
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const callerClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await callerClient.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: 'Not authenticated' }, 401);
    const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: caller } = await admin.from('profiles').select('id, org_id, name, email, role').eq('id', userData.user.id).maybeSingle();
    if (!caller?.org_id) return json({ error: 'Forbidden' }, 403);

    const body = await req.json().catch(() => ({}));
    const batchId = typeof body.batch_id === 'string' ? body.batch_id : '';
    const ccMe = body.cc_me === true;
    const resend = body.resend === true;
    const expenseId = typeof body.expense_id === 'string' && UUID_RE.test(body.expense_id) ? body.expense_id : '';
    if (!UUID_RE.test(batchId)) return json({ error: 'batch_id is required' }, 400);
    if (resend && !expenseId) return json({ error: 'expense_id is required to resend' }, 400);
    const isOffice = ['pm', 'admin'].includes(String(caller.role));

    let q = admin.from('expenses').select('*').eq('batch_id', batchId).eq('org_id', caller.org_id).order('created_at', { ascending: true });
    // Only your own entries - except a PM/admin resending one for their company.
    if (!(resend && isOffice)) q = q.eq('created_by', caller.id);
    const { data: allRows } = await q;
    if (!allRows || !allRows.length) return json({ error: 'Nothing to send.' }, 404);
    const rows = resend ? allRows.filter((r) => r.id === expenseId) : allRows.filter((r) => !r.emailed_at);
    if (!rows.length) return resend ? json({ error: 'Nothing to send.' }, 404) : json({ ok: true, already_sent: true });

    const { data: org } = await admin.from('organizations').select('name, logo_path, color_primary, expenses_email').eq('id', caller.org_id).maybeSingle();
    const to = String(org?.expenses_email || '').trim();
    if (!EMAIL_RE.test(to)) return json({ error: 'No expenses email address has been set up yet — ask a manager to add one in Settings.' }, 400);

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) return json({ error: 'Email sending is not configured.' }, 500);
    const rawFrom = Deno.env.get('INVITES_FROM_EMAIL') || Deno.env.get('ORDERS_FROM_EMAIL') || 'reports@ophub.app';
    const fm = /<([^>]+)>/.exec(rawFrom);
    const fromAddress = (fm ? fm[1] : rawFrom).trim();
    const companyName = org?.name || 'OpHUB';

    const siteIds = [...new Set(rows.map((r) => r.site_id).filter(Boolean))];
    const { data: sites } = siteIds.length ? await admin.from('sites').select('id, name, org_id').in('id', siteIds) : { data: [] as any[] };
    const siteName: Record<string, string> = {};
    (sites || []).forEach((s) => { if (s.org_id === caller.org_id) siteName[s.id] = s.name; });
    const catLabel = (c: string) => (c === 'fuel' ? 'Fuel' : c === 'other' ? 'Other' : 'Materials');
    const jobLabel = (r: any) => (r.site_id ? (siteName[r.site_id] || 'Unknown job') : (r.category === 'fuel' ? ('Fuel' + (r.manual_label ? ' - ' + r.manual_label : '')) : (r.manual_label || 'Not on the app')));

    // The person the receipt is FROM is whoever uploaded it (on a resend by
    // the office that may not be the caller).
    const ownerIds = [...new Set(rows.map((r) => r.created_by).filter(Boolean))];
    const { data: owners } = await admin.from('profiles').select('id, name, email, org_id').in('id', ownerIds);
    const ownerOf: Record<string, any> = {};
    (owners || []).forEach((o) => { if (o.org_id === caller.org_id) ownerOf[o.id] = o; });

    const callerEmail = caller.email && EMAIL_RE.test(caller.email) ? String(caller.email) : '';
    // "CC me a copy": only ever the caller's own account address.
    const cc = ccMe && callerEmail && callerEmail.toLowerCase() !== to.toLowerCase() ? callerEmail : '';
    const logoUrl = org?.logo_path ? `${SUPABASE_URL}/storage/v1/object/public/org-logos/${org.logo_path}` : null;
    const prefix = `${SUPABASE_URL}/storage/v1/object/public/site-photos/`;

    // Every receipt being sent, in order, numbered 1..N.
    const items: { row: any; path: string }[] = [];
    for (const r of rows) {
      const paths: string[] = Array.isArray(r.file_paths) ? r.file_paths : [];
      for (const p of paths) {
        const path = String(p || '');
        // Only this company's own expense uploads are ever fetched.
        if (!path.startsWith(`expenses/${caller.org_id}/`) || path.includes('..')) continue;
        items.push({ row: r, path });
      }
    }
    const total = items.length;
    if (!total) return json({ error: 'Nothing to send.' }, 404);
    // fix3c: a daily limit per sender (one email goes per receipt), logged in edge_email_log.
    const sentToday = await emailSendsSince(admin, 'send-expenses-email', 'sender_id', caller.id, 24 * 60);
    if (sentToday != null && sentToday + total > 300) return json({ error: 'You’ve reached today’s limit of 300 receipt emails — try again tomorrow. Your receipts are saved.' }, 429);

    const sendOne = async (payload: any) => fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

    const failedRowIds = new Set<string>();
    let sent = 0, attachedCount = 0;
    for (let i = 0; i < items.length; i++) {
      const { row: r, path } = items[i];
      const n = i + 1;
      const job = jobLabel(r);
      const owner = ownerOf[r.created_by] || caller;
      const ownerName = String(owner.name || caller.name || '');
      const ownerEmail = owner.email && EMAIL_RE.test(owner.email) ? String(owner.email) : callerEmail;
      const url = prefix + path.split('/').map(encodeURIComponent).join('/');
      const ext = (/\.([a-z0-9]{2,5})$/i.exec(path) || [, 'jpg'])[1];
      const filename = `${job} - receipt ${n} of ${total}`.replace(/[^a-z0-9 .\-]+/gi, '_').slice(0, 80) + `.${ext}`;
      let content: string | null = null;
      try {
        const res = await fetch(url);
        const len = Number(res.headers.get('content-length') || 0);
        if (res.ok && (!len || len <= ATTACH_LIMIT)) {
          const buf = new Uint8Array(await res.arrayBuffer());
          if (buf.byteLength > 0 && buf.byteLength <= ATTACH_LIMIT) content = encodeBase64(buf);
        } else { try { await res.body?.cancel(); } catch (_e) { /* ignore */ } }
      } catch (_e) { /* falls back to a link */ }

      const when = new Date(r.created_at).toLocaleString('en-GB', { timeZone: 'Europe/London', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      const line = (k: string, v: string) => `<tr><td style="padding:6px 14px 6px 0;color:#8A8D93;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;vertical-align:top;white-space:nowrap;">${k}</td><td style="padding:6px 0;font-size:15px;font-weight:700;color:#101114;">${v}</td></tr>`;
      const mkHtml = (withAttachment: boolean) => ophubEmail({
        company: companyName,
        brand: org?.color_primary,
        logoUrl,
        kicker: job,
        title: `Expense receipt ${n} of ${total}${resend ? ' (sent again)' : ''}`,
        greeting: 'Hi,',
        intro: withAttachment ? 'The receipt is attached to this email.' : 'The receipt was too large to attach — use the button below.',
        bodyHtml: `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:4px 0 12px;">
          ${line('Job', ophubEsc(job))}
          ${line('Type', ophubEsc(catLabel(r.category)))}
          ${r.note ? line('Note', `<span style="font-weight:400;white-space:pre-wrap;">${ophubEsc(r.note)}</span>`) : ''}
          ${line('From', ophubEsc(ownerName))}
          ${line('Sent', ophubEsc(when))}
          ${line('File', ophubEsc(filename))}
        </table>`,
        button: withAttachment ? null : { label: 'Open the receipt', url },
        note: `One email is sent per receipt; reply to this email to answer ${ownerName} directly.`,
      });
      const mkText = (withAttachment: boolean) => `Expense receipt ${n} of ${total}${resend ? ' (sent again)' : ''}\n\nJob: ${job}\nType: ${catLabel(r.category)}${r.note ? '\nNote: ' + r.note : ''}\nFrom: ${ownerName}\nSent: ${when}\nFile: ${filename}${withAttachment ? ' (attached)' : '\n' + url}`;

      const payload: any = {
        from: ophubFrom(rawFrom, companyName),
        to: [to],
        subject: `Expense — ${job} — ${ownerName} — receipt ${n} of ${total}${resend ? ' (resent)' : ''}`.slice(0, 200),
        html: mkHtml(!!content), text: mkText(!!content),
      };
      if (ownerEmail) payload.reply_to = ownerEmail;
      if (cc) payload.cc = [cc];
      if (content) payload.attachments = [{ filename, content }];

      let ok = false;
      for (let attempt = 0; attempt < 3 && !ok; attempt++) {
        let res = await sendOne(payload);
        if (res.status === 429) { try { await res.body?.cancel(); } catch (_e) { /* ignore */ } await sleep(1200); continue; }
        if (!res.ok && payload.attachments) {
          // The provider refused it with the attachment: send it with a link instead.
          console.error('send with attachment failed', await res.text());
          delete payload.attachments; payload.html = mkHtml(false); payload.text = mkText(false);
          res = await sendOne(payload);
        }
        if (res.ok) { ok = true; try { await res.body?.cancel(); } catch (_e) { /* ignore */ } }
        else { console.error('expenses email failed', await res.text()); break; }
      }
      if (ok) { sent++; if (payload.attachments) attachedCount++; await logEmailSend(admin, { fn: 'send-expenses-email', sender_id: caller.id, org_id: caller.org_id, to: [to], cc: cc ? [cc] : [], subject: payload.subject }); } else failedRowIds.add(r.id);
      // Stay under the email provider's per-second limit.
      if (i < items.length - 1) await sleep(600);
    }

    const okRowIds = rows.map((r) => r.id).filter((id) => !failedRowIds.has(id));
    if (okRowIds.length) await admin.from('expenses').update({ emailed_at: new Date().toISOString(), emailed_to: to }).in('id', okRowIds).eq('org_id', caller.org_id);
    if (!sent) return json({ error: 'The emails could not be sent — your receipts are saved; try again.' }, 502);
    if (sent < total) return json({ error: `${sent} of ${total} receipts were emailed. The rest are saved — try again to send them.`, sent, files: total }, 502);
    return json({ ok: true, to, cc: cc || null, files: total, emails: sent, attached: attachedCount, resent: resend });
  } catch (e) {
    console.error(e);
    return json({ error: 'Something went wrong — please try again.' }, 500);
  }
}));
