import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, cache-control, pragma',
};

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

// ---- OpHUB email send guard (security review M7, 25 Oct 2026) ----
// Same block in every send-* function that takes a caller-chosen recipient
// or link. See /home/claude/edge/REPORT.md.
const MANAGER_ROLES = ['pm', 'admin', 'site_manager'];
const isManagerRole = (role: unknown) => MANAGER_ROLES.includes(String(role || ''));
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const lc = (s: unknown) => String(s || '').trim().toLowerCase();
// Managers may email anyone. Everyone else may only email themselves or a
// PM / admin / site manager in their own company (e.g. the TBT "everyone
// has signed" email an operative's phone sends to the PM).
async function recipientsAllowed(admin: any, caller: any, authEmail: string | null | undefined, addrs: unknown[]): Promise<boolean> {
  if (isManagerRole(caller?.role)) return true;
  const want = addrs.map(lc).filter(Boolean);
  if (!want.length) return true;
  const own = new Set([lc(authEmail), lc(caller?.email)].filter(Boolean));
  const others = want.filter((a) => !own.has(a));
  if (!others.length) return true;
  const { data, error } = await admin.from('profiles').select('email').eq('org_id', caller.org_id).in('role', MANAGER_ROLES);
  if (error) { console.error('recipientsAllowed lookup failed', error); return false; }
  const mgr = new Set((data || []).map((p: any) => lc(p.email)).filter(Boolean));
  return others.every((a) => mgr.has(a));
}
// A link or file we fetch must be in this project's own Storage
// (`${SUPABASE_URL}/storage/v1/object/...`) - never an outside address.
function ownStorageUrl(url: unknown, supabaseUrl: string | undefined): boolean {
  try {
    const u = new URL(String(url));
    const base = new URL(String(supabaseUrl));
    return u.protocol === 'https:' && u.origin === base.origin && !u.username && !u.password
      && u.pathname.startsWith('/storage/v1/object/') && !/\.\.|%2e%2e/i.test(u.pathname);
  } catch (_e) { return false; }
}
// bucket + path out of a public Storage URL (null for any other shape).
function publicStoragePath(url: unknown, supabaseUrl: string | undefined): { bucket: string; path: string } | null {
  if (!ownStorageUrl(url, supabaseUrl)) return null;
  const m = /^\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/.exec(new URL(String(url)).pathname);
  if (!m) return null;
  try { return { bucket: decodeURIComponent(m[1]), path: m[2].split('/').map(decodeURIComponent).join('/') }; } catch (_e) { return null; }
}
const UUID_SEG = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// A Storage path is refused if it climbs out of its folder, or if one of its
// first two folders is a company / project / report of ANOTHER company.
// Every path the app writes passes: <site>/..., <org>/..., general/...,
// exports/..., company-policies/<org>/..., tbt-exports/<org>/...,
// coshh-exports/<org>/..., report-pdfs/<submission>/...
async function storagePathAllowed(admin: any, orgId: string, path: unknown): Promise<boolean> {
  const p = String(path || '');
  if (!p || p.startsWith('/') || p.includes('\\') || p.split('/').some((seg) => seg === '..' || seg === '.')) return false;
  const segs = p.split('/');
  const ids = segs.slice(0, 2).filter((seg) => UUID_SEG.test(seg));
  if (!ids.length) return true;
  try {
    const [o, s] = await Promise.all([
      admin.from('organizations').select('id').in('id', ids),
      admin.from('sites').select('id, org_id').in('id', ids),
    ]);
    if (o.error || s.error) return false;
    if ((o.data || []).some((r: any) => r.id !== orgId)) return false;
    if ((s.data || []).some((r: any) => r.org_id !== orgId)) return false;
    if (segs[0] === 'report-pdfs' && UUID_SEG.test(segs[1] || '')) {
      const { data: rs, error: rErr } = await admin.from('report_submissions').select('org_id').eq('id', segs[1]).maybeSingle();
      if (rErr || (rs && rs.org_id !== orgId)) return false;
    }
    return true;
  } catch (_e) { return false; }
}
// The "CC client contact" tick box only ever sends a project's own client
// email. Anything else is dropped.
async function clientCcAllowed(admin: any, orgId: string, siteId: unknown, email: unknown): Promise<string | null> {
  const e = lc(email);
  if (!e || !EMAIL_OK.test(e)) return null;
  let q = admin.from('sites').select('client_email').eq('org_id', orgId).ilike('client_email', e.replace(/[\\%_]/g, (c) => '\\' + c)).limit(1);
  if (siteId) q = q.eq('id', siteId);
  const { data, error } = await q;
  if (error || !data || !data.length) return null;
  return String(email).trim();
}
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
// base64 of "%PDF-" - attachments sent as base64 must really be PDFs.
const looksLikePdfBase64 = (b64: unknown) => typeof b64 === 'string' && b64.replace(/\s+/g, '').startsWith('JVBERi0');
const safeFilename = (name: unknown, ext = 'pdf') => {
  const base = String(name || 'document').replace(/[\r\n"\\/:*?<>|]+/g, '_').replace(/\.\.+/g, '.').trim().slice(0, 120) || 'document';
  return new RegExp('\\.' + ext + '$', 'i').test(base) ? base : base + '.' + ext;
};
// ---- end OpHUB email send guard ----

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

function fmtDate(d){
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Europe/London' });
}

// Emails one or more completed report PDFs to the PM/admin who is currently
// logged in, always CC'ing a fixed company address so office/management get
// a copy automatically.
//
// Two call shapes are supported:
//   1) Legacy single report: { submission_id, filename, content_base64 }
//   2) Bulk: { attachments: [{ submission_id, filename, content_base64 }, ...] }
//      — sends ONE email with every report attached individually.
//
// Optional client_cc_email (either shape): the "CC client contact" tick box
// passes the site's client_email here when checked; merged alongside the
// fixed REPORT_CC_EMAIL cc, deduped against the To and against each other.
Deno.serve(withCors(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await callerClient.auth.getUser(token);
    if (userErr || !userData?.user) return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data: caller } = await admin.from('profiles').select('role, org_id, name, email').eq('id', userData.user.id).maybeSingle();
    if (!caller || (caller.role !== 'pm' && caller.role !== 'admin')) {
      return new Response(JSON.stringify({ error: 'Forbidden — project managers and admins only' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json().catch(() => ({}));
    const bulkInput = Array.isArray(body.attachments) ? body.attachments : null;
    const items = bulkInput || (body.submission_id && body.filename && body.content_base64
      ? [{ submission_id: body.submission_id, filename: body.filename, content_base64: body.content_base64 }]
      : []);
    const client_cc_email = body.client_cc_email;
    if (!items.length) {
      return new Response(JSON.stringify({ error: 'submission_id/filename/content_base64 (or an attachments array) are required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Every attachment must really be a PDF (M7: nothing else is mailed out
    // with the company's name on it).
    if (items.length > 20 || items.some((i: any) => !i || !i.filename || !looksLikePdfBase64(i.content_base64))) {
      return new Response(JSON.stringify({ error: 'Only PDF files can be attached (20 at most).' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    // Report PDFs name the submission they belong to, and each is checked
    // against the caller's company. The PPE records email (H&S › PPE) sends
    // plain PDFs with no submission: those go to the caller only - no office
    // copy, no client copy.
    const plainPdfs = items.every((i: any) => !i.submission_id);
    if (!plainPdfs && items.some((i: any) => !i.submission_id)) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const sentToday = await emailSendsSince(admin, 'send-report-email', 'sender_id', userData.user.id, 24 * 60);
    if (sentToday != null && sentToday >= 60) return new Response(JSON.stringify({ error: 'You’ve reached today’s limit of 60 emails — try again tomorrow.' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const subIds = plainPdfs ? [] : items.map((i: any) => String(i.submission_id));
    const { data: subs } = subIds.length ? await admin.from('report_submissions').select('id, org_id, template_id, template_name, site_id, submitted_at, created_at').in('id', subIds) : { data: [] as any[] };
    const subsById = Object.fromEntries((subs || []).map((s) => [s.id, s]));
    for (const id of subIds) {
      const s = subsById[id];
      if (!s || s.org_id !== caller.org_id) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // Daily Briefings are the one Reports-system submission type that lives
    // under Health & Safety — everything else (Snagging etc.) keeps the
    // ordinary sender. Only prefix "Daily Briefing" when every item in this
    // email is a briefing.
    const templateIds = Array.from(new Set((subs || []).map((s) => s.template_id).filter(Boolean)));
    const { data: templates } = templateIds.length
      ? await admin.from('report_templates').select('id, is_daily_briefing').in('id', templateIds)
      : { data: [] };
    const briefingByTemplate = Object.fromEntries((templates || []).map((t) => [t.id, !!t.is_daily_briefing]));
    const isHsSend = items.length > 0 && items.every((i) => briefingByTemplate[subsById[i.submission_id]?.template_id]);

    const siteIds = Array.from(new Set((subs || []).map((s) => s.site_id)));
    const { data: sitesRows } = siteIds.length ? await admin.from('sites').select('id, name').in('id', siteIds) : { data: [] as any[] };
    const siteById = Object.fromEntries((sitesRows || []).map((s) => [s.id, s]));
    const { data: org } = await admin.from('organizations').select('name, logo_path, color_primary').eq('id', caller.org_id).maybeSingle();
    const companyName = org?.name || 'the company';
    const pmName = caller.name || 'Project Manager';
    const logoUrl = org?.logo_path ? `${SUPABASE_URL}/storage/v1/object/public/org-logos/${org.logo_path}` : null;

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const FROM_EMAIL = Deno.env.get('INVITES_FROM_EMAIL') || Deno.env.get('ORDERS_FROM_EMAIL') || 'reports@ophub.app';
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: 'Email sending is not configured yet (missing RESEND_API_KEY secret).' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    // Fixed CC address so office/management always get a copy of every
    // submitted report — configurable via secret, defaults to Andy's address
    // per RTB Roofing's request.
    const ccEmail = Deno.env.get('REPORT_CC_EMAIL') || 'andy.cramp@rtbroofinglimited.com';
    const toEmail = caller.email;

    const signoffText = `Sent by ${pmName}, ${companyName}`;
    const firstName = String(caller.name || '').trim().split(/\s+/)[0];
    const greeting = firstName ? `Hi ${firstName},` : 'Hi,';

    let subject, text, html;
    if (plainPdfs) {
      const names = items.map((i: any) => safeFilename(i.filename, 'pdf'));
      subject = items.length === 1 ? names[0].replace(/\.pdf$/i, '') : `${items.length} records attached`;
      const intro = items.length === 1 ? 'The record you asked for is attached.' : `${items.length} records you asked for are attached, each as its own PDF.`;
      text = `${greeting}\n\n${intro}\n${names.map((n: string) => '- ' + n).join('\n')}\n\n${signoffText}\n\nSent via OpHUB.`;
      html = ophubEmail({
        company: companyName,
        brand: org?.color_primary,
        logoUrl,
        title: items.length === 1 ? 'Record attached' : 'Records attached',
        greeting,
        intro,
        bodyHtml: `<ul style="margin:0 0 12px;padding-left:20px;">${names.map((n: string) => `<li style="margin:0 0 6px;font-size:15px;line-height:1.5;color:#101114;">${ophubEsc(n)}</li>`).join('')}</ul>${ophubRows([['Sent by', pmName]])}`,
      });
    } else if (items.length === 1) {
      const sub = subsById[items[0].submission_id];
      const siteName = siteById[sub.site_id]?.name || 'the site';
      const knownSiteName = siteById[sub.site_id]?.name || null;
      const submittedOn = fmtDate(sub.submitted_at || sub.created_at || Date.now());
      const kind = isHsSend ? 'daily briefing' : 'report';
      const what = isHsSend ? `Daily briefing ${submittedOn}` : `${sub.template_name}`;
      subject = knownSiteName ? `${what} — ${knownSiteName}` : what;
      const intro = `The completed "${sub.template_name}" ${kind} for ${siteName}, submitted on ${submittedOn}, is attached.`;
      const note = 'The full details, including any photos and signatures, are in the attached PDF.';
      text = `${greeting}\n\n${intro}\n\n${note}\n\n${signoffText}\n\nSent via OpHUB.`;
      html = ophubEmail({
        company: companyName,
        brand: org?.color_primary,
        logoUrl,
        kicker: knownSiteName || undefined,
        title: isHsSend ? 'Daily briefing attached' : 'Report attached',
        greeting,
        intro,
        bodyHtml: ophubRows([['Report', sub.template_name], ['Site', knownSiteName], ['Submitted', submittedOn], ['Sent by', pmName]]),
        note,
      });
    } else {
      const listHtml = items.map((i) => {
        const sub = subsById[i.submission_id];
        const siteName = siteById[sub.site_id]?.name || 'the site';
        const submittedOn = fmtDate(sub.submitted_at || sub.created_at || Date.now());
        return `<li style="margin:0 0 6px;font-size:15px;line-height:1.5;color:#101114;">${ophubEsc(sub.template_name)} — ${ophubEsc(siteName)} <span style="color:#8A8D93;">(${ophubEsc(submittedOn)})</span></li>`;
      }).join('');
      const listText = items.map((i) => {
        const sub = subsById[i.submission_id];
        const siteName = siteById[sub.site_id]?.name || 'the site';
        const submittedOn = fmtDate(sub.submitted_at || sub.created_at || Date.now());
        return `- ${sub.template_name} — ${siteName} (${submittedOn})`;
      }).join('\n');
      subject = isHsSend ? `${items.length} daily briefings ${fmtDate(Date.now())}` : `${items.length} site reports`;
      const intro = `${items.length} completed reports are attached, each as its own PDF.`;
      text = `${greeting}\n\n${intro}\n${listText}\n\n${signoffText}\n\nSent via OpHUB.`;
      html = ophubEmail({
        company: companyName,
        brand: org?.color_primary,
        logoUrl,
        title: isHsSend ? 'Daily briefings attached' : 'Reports attached',
        greeting,
        intro,
        bodyHtml: `<ul style="margin:0 0 12px;padding-left:20px;">${listHtml}</ul>${ophubRows([['Sent by', pmName]])}`,
      });
    }

    const emailPayload: any = {
      from: ophubFrom(FROM_EMAIL, companyName),
      to: [toEmail],
      subject, text, html,
      attachments: items.map((i: any) => ({ filename: safeFilename(i.filename, 'pdf'), content: i.content_base64 })),
    };
    const ccList: string[] = [];
    if (!plainPdfs && ccEmail && ccEmail.toLowerCase() !== String(toEmail).toLowerCase()) ccList.push(ccEmail);
    // The "CC client contact" tick box only ever copies in the client email of
    // a project these reports belong to (M7) - any other address is dropped.
    let clientCc: string | null = null;
    if (!plainPdfs && client_cc_email) {
      for (const sid of siteIds) { clientCc = await clientCcAllowed(admin, caller.org_id, sid, client_cc_email); if (clientCc) break; }
    }
    if (clientCc && lc(clientCc) !== lc(toEmail) && !ccList.some((e) => lc(e) === lc(clientCc))) {
      ccList.push(clientCc);
    }
    if (ccList.length) emailPayload.cc = ccList;

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(emailPayload),
    });
    if (!emailRes.ok) {
      const errText = await emailRes.text();
      console.error('send-report-email: provider error', emailRes.status, errText);
      return new Response(JSON.stringify({ error: 'The email service didn’t accept the email — please try again.' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    await logEmailSend(admin, { fn: 'send-report-email', sender_id: userData.user.id, org_id: caller.org_id, to: [toEmail], cc: ccList, subject });

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('send-report-email failed', e);
    return new Response(JSON.stringify({ error: 'Something went wrong — please try again.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}));
