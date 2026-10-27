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

// Emails a site's live (not-yet-closed) To Do List as a themed HTML email
// (same look as the material order emails) to whichever project managers
// the caller picked — a from-scratch redesign of what used to be a PDF
// attachment sent only to the caller's own inbox.
//
// Optional client_cc_email: the "CC client contact" tick box on the picker
// passes the site's client_email here when checked; merged into cc
// alongside the requester's own cc, deduped against the To list.
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
    const { site_id, recipient_ids, todo_ids, client_cc_email } = body;
    if (!site_id || !Array.isArray(recipient_ids) || !recipient_ids.length) {
      return new Response(JSON.stringify({ error: 'site_id and at least one recipient_id are required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    // #296: when todo_ids is given (the multi-select "Email N" action on
    // either the Live or Closed list), scope the email to exactly those
    // to-dos instead of always the whole live list.
    const scopedToIds = Array.isArray(todo_ids) && todo_ids.length ? todo_ids.filter((v: unknown) => typeof v === 'string').slice(0, 500) : null;

    const { data: site } = await admin.from('sites').select('id, name, org_id').eq('id', site_id).maybeSingle();
    if (!site || site.org_id !== caller.org_id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Only ever send to project managers/admins in the caller's own org —
    // recipient_ids from the client is just a pick-list, never trusted as-is.
    const { data: recipientProfiles } = await admin.from('profiles').select('id, name, email')
      .eq('org_id', caller.org_id).in('role', ['pm', 'admin']).in('id', recipient_ids.filter((v: unknown) => typeof v === 'string').slice(0, 50)).eq('is_estimator', false); // estimators receive no notifications
    const recipients = (recipientProfiles || []).filter((p) => p.email);
    if (!recipients.length) {
      return new Response(JSON.stringify({ error: 'None of the selected recipients have a usable email address.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const sentToday = await emailSendsSince(admin, 'send-todo-email', 'sender_id', userData.user.id, 24 * 60);
    if (sentToday != null && sentToday >= 60) return new Response(JSON.stringify({ error: 'You’ve reached today’s limit of 60 emails — try again tomorrow.' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    let todosQuery = admin.from('todos').select('id, text, date_required_by, assigned_to, done')
      .eq('site_id', site_id).order('created_at', { ascending: true });
    todosQuery = scopedToIds ? todosQuery.in('id', scopedToIds) : todosQuery.eq('done', false);
    const { data: todos } = await todosQuery;
    const liveTodos = todos || [];

    const assigneeIds = [...new Set(liveTodos.map((t) => t.assigned_to).filter(Boolean))];
    let assigneeNames = {};
    if (assigneeIds.length) {
      const { data: assignees } = await admin.from('profiles').select('id, name').in('id', assigneeIds);
      (assignees || []).forEach((a) => { assigneeNames[a.id] = a.name; });
    }

    const { data: org } = await admin.from('organizations').select('name, logo_path, color_primary').eq('id', caller.org_id).maybeSingle();

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const FROM_EMAIL = Deno.env.get('INVITES_FROM_EMAIL') || Deno.env.get('ORDERS_FROM_EMAIL') || 'reports@ophub.app';
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: 'Email sending is not configured yet (missing RESEND_API_KEY secret).' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const requesterEmail = userData.user.email;
    const companyName = org?.name || 'a company';
    const brand = org?.color_primary || null;
    const logoUrl = org?.logo_path ? `${SUPABASE_URL}/storage/v1/object/public/org-logos/${org.logo_path}` : null;
    const sentOn = new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London' });
    const emailTitle = scopedToIds ? 'Selected to-dos' : 'To do list';
    const subject = `${emailTitle} — ${site.name}`;

    const fmtDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

    const itemCount = `${liveTodos.length} item${liveTodos.length===1?'':'s'}`;
    const intro = `Here ${scopedToIds ? (liveTodos.length===1 ? 'is the selected to-do' : 'are the selected to-dos') : 'is the live to-do list'} for ${site.name} (${itemCount}).`;
    const note = `Sent by ${caller.name} at ${companyName} on ${sentOn}. Reply to this email to reach ${caller.name} directly, not OpHUB.`;

    const text = `Hi,\n\n${intro}\n\n` +
      (liveTodos.length
        ? liveTodos.map((t) => `- ${t.done ? '[Done] ' : ''}${t.text}${t.assigned_to ? ` (assigned to ${assigneeNames[t.assigned_to] || 'Unknown'})` : ''}${t.date_required_by ? ` — required by ${fmtDate(t.date_required_by)}` : ''}`).join('\n')
        : 'No to-dos to show.') +
      `\n\n${note}\n\nSent via OpHUB · ${companyName}`;

    const todoRowsHtml = liveTodos.length
      ? liveTodos.map((t) => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #EAEAEA;font-size:15px;line-height:1.4;color:#101114;vertical-align:top;">
            <span style="font-weight:700;${t.done ? 'text-decoration:line-through;color:#8A8D93;' : ''}">${t.done ? '&#10003; ' : ''}${ophubEsc(t.text)}</span>
            ${t.date_required_by ? `<div style="margin-top:2px;font-size:12px;color:#8A8D93;">Required by ${ophubEsc(fmtDate(t.date_required_by))}</div>` : ''}
          </td>
          <td style="padding:10px 0 10px 12px;border-bottom:1px solid #EAEAEA;font-size:13.5px;color:#101114;vertical-align:top;text-align:right;white-space:nowrap;">${t.assigned_to ? ophubEsc(assigneeNames[t.assigned_to] || 'Unknown') : '—'}</td>
        </tr>`).join('')
      : `<tr><td colspan="2" style="padding:16px 0;font-size:15px;color:#8A8D93;">No to-dos to show.</td></tr>`;

    const bodyHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 6px;">
              <tr>
                <td style="font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#8A8D93;padding-bottom:6px;">To do</td>
                <td style="font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#8A8D93;padding-bottom:6px;text-align:right;">Assigned to</td>
              </tr>
              ${todoRowsHtml}
            </table>`;

    const html = ophubEmail({
      company: companyName,
      brand,
      logoUrl,
      kicker: site.name,
      title: emailTitle,
      greeting: 'Hi,',
      intro,
      bodyHtml,
      note,
    });

    const emailPayload: any = {
      from: ophubFrom(FROM_EMAIL, companyName),
      to: recipients.map((r) => r.email),
      subject, text, html,
    };
    if (requesterEmail) {
      emailPayload.reply_to = [requesterEmail];
      if (!recipients.some((r) => (r.email || '').toLowerCase() === requesterEmail.toLowerCase())) {
        emailPayload.cc = [requesterEmail];
      }
    }
    // The "CC client contact" tick box only ever copies in this project's own
    // client email (M7) - any other address is dropped.
    const clientCc = client_cc_email ? await clientCcAllowed(admin, caller.org_id, site.id, client_cc_email) : null;
    if (clientCc && !recipients.some((r) => lc(r.email) === lc(clientCc))) {
      emailPayload.cc = Array.isArray(emailPayload.cc) ? emailPayload.cc : [];
      if (!emailPayload.cc.some((e: string) => lc(e) === lc(clientCc))) emailPayload.cc.push(clientCc);
    }

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(emailPayload),
    });
    if (!emailRes.ok) {
      const errText = await emailRes.text();
      console.error('send-todo-email: provider error', emailRes.status, errText);
      return new Response(JSON.stringify({ error: 'The email service didn’t accept the email — please try again.' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    await logEmailSend(admin, { fn: 'send-todo-email', sender_id: userData.user.id, org_id: caller.org_id, to: emailPayload.to, cc: emailPayload.cc || [], subject });

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('send-todo-email failed', e);
    return new Response(JSON.stringify({ error: 'Something went wrong — please try again.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}));
