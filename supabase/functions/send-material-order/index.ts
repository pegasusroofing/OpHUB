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

    const { data: callerProfile } = await admin.from('profiles').select('role, org_id, name').eq('id', userData.user.id).maybeSingle();
    if (!callerProfile || (callerProfile.role !== 'pm' && callerProfile.role !== 'admin')) {
      return new Response(JSON.stringify({ error: 'Forbidden — project managers and admins only' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json().catch(() => ({}));
    const { material_id, supplier_email, supplier_name, item, qty, site_id, required_for_delivery } = body;
    // 'collection' = we pick the order up ourselves on that date, rather
    // than the supplier delivering it. Anything else is a normal delivery.
    const isCollection = body.fulfilment === 'collection';
    const collectorName = isCollection && body.collector_name ? String(body.collector_name) : '';
    // Optional free-text note from whoever sent the order (which branch,
    // what each item is for, and so on).
    const note = body.note ? String(body.note).trim().slice(0, 500) : '';

    const items = Array.isArray(body.items) && body.items.length ? body.items : (item ? [{ item, qty }] : []);
    if (!supplier_email || !items.length || items.some((it) => !it || !it.item)) {
      return new Response(JSON.stringify({ error: 'supplier_email and at least one item are required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!required_for_delivery) {
      return new Response(JSON.stringify({ error: 'required_for_delivery is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: site } = await admin.from('sites').select('id, name, address, postcode, org_id, job_number').eq('id', site_id).maybeSingle();
    if (!site || site.org_id !== callerProfile.org_id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const sentToday = await emailSendsSince(admin, 'send-material-order', 'sender_id', userData.user.id, 24 * 60);
    if (sentToday != null && sentToday >= 150) return new Response(JSON.stringify({ error: 'You’ve reached today’s limit of 150 emails — try again tomorrow.' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const fullAddress = [site.address, site.postcode].map((v) => (v || '').trim()).filter(Boolean).join(', ') || 'Not set';

    // OpHUB Finance: the purchase order raised for this order (same company
    // and job only). Its number goes in the subject and the email so the
    // supplier quotes it on their invoice.
    let poNumber = '';
    if (body.po_id && typeof body.po_id === 'string') {
      const { data: po } = await admin.from('purchase_orders').select('number, org_id, site_id').eq('id', body.po_id).maybeSingle();
      if (po && po.org_id === callerProfile.org_id && po.site_id === site.id) poNumber = po.number;
    }

    // Our account number with this supplier (Admin › Suppliers). Looked up
    // here, never sent from the app, and only for a supplier in the sender's
    // own company. Shown to the supplier on the email only.
    let accountNo = '';
    if (body.supplier_id && typeof body.supplier_id === 'string') {
      const { data: sup } = await admin.from('suppliers').select('org_id, account_number').eq('id', body.supplier_id).maybeSingle();
      if (sup && sup.org_id === callerProfile.org_id && sup.account_number) accountNo = String(sup.account_number).trim().slice(0, 60);
    }

    const { data: org } = await admin.from('organizations').select('name, logo_path, color_primary').eq('id', callerProfile.org_id).maybeSingle();

    // People in the sender's own company to copy in (ticked in the app).
    // Only user ids are accepted, and each is checked against the sender's
    // company here, so this can never be used to copy in an outside address.
    //
    // fix3c (27 Oct 2026): operatives never see purchase order numbers (or our
    // account number with the supplier). Anyone ticked who isn't a PM / admin
    // / site manager is no longer CC'd on the supplier's email - they get a
    // separate copy of the order with the PO number, account number and job
    // number left out. There are no prices in this email.
    const ccUserIds = Array.isArray(body.cc_user_ids) ? body.cc_user_ids.filter((v: unknown) => typeof v === 'string').slice(0, 30) : [];
    const extraCc: string[] = [];
    const teamCopy: string[] = [];
    if (ccUserIds.length) {
      const { data: ccRows } = await admin.from('profiles').select('email, org_id, role').in('id', ccUserIds);
      for (const r of (ccRows || [])) {
        if (r.org_id !== callerProfile.org_id || !r.email) continue;
        (isManagerRole(r.role) ? extraCc : teamCopy).push(String(r.email).trim());
      }
    }

    // Extra addresses to copy in, typed in the app or the supplier's main
    // order email when the order goes to one of its branches. Checked as
    // email addresses and capped.
    const emailRe = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
    let typedCc: string[] = Array.isArray(body.cc_emails) ? body.cc_emails.map((v) => String(v || '').trim()).filter((v) => v && v.length <= 254 && emailRe.test(v)).slice(0, 10) : [];

    // A typed-in address that belongs to someone in the company who isn't a
    // manager goes to the team copy too, and if the order itself is addressed
    // to such a person, the PO and account numbers are left off it as well.
    const { data: nonManagers } = await admin.from('profiles').select('email').eq('org_id', callerProfile.org_id).not('role', 'in', '(pm,admin,site_manager)');
    const nonManagerEmails = new Set((nonManagers || []).map((p: any) => lc(p.email)).filter(Boolean));
    for (const a of typedCc) if (nonManagerEmails.has(lc(a))) teamCopy.push(a);
    typedCc = typedCc.filter((a) => !nonManagerEmails.has(lc(a)));
    const mainShowsRefs = !nonManagerEmails.has(lc(supplier_email));

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const FROM_EMAIL = Deno.env.get('ORDERS_FROM_EMAIL') || 'orders@ophub.app';
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: 'Email sending is not configured yet (missing RESEND_API_KEY secret) — the order was routed but not emailed.' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const requesterEmail = userData.user.email;
    const companyName = org?.name || 'a company';
    const brand = org?.color_primary || null;
    const logoUrl = org?.logo_path ? `${SUPABASE_URL}/storage/v1/object/public/org-logos/${org.logo_path}` : null;
    const orderedOn = new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London' });
    const requiredForDeliveryLabel = new Date(required_for_delivery + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
    const multi = items.length > 1;
    const whenPhrase = isCollection ? `to be collected ${requiredForDeliveryLabel}` : `required by ${requiredForDeliveryLabel}`;
    // poNumber / accountNo are blank for the team copy (forTeam), so the PO
    // box, the account box and the PO / account / job number rows drop out.
    const buildEmail = (poNumber: string, accountNo: string, forTeam: boolean) => {
      // The item count is deliberately left out of the subject and the banner —
      // the items are listed in the email itself.
      const subject = `${forTeam ? 'Copy: ' : ''}${poNumber ? `PO ${poNumber} — ` : ''}Material order — ${site.name} (${companyName}${accountNo ? `, a/c ${accountNo}` : ''}) — ${whenPhrase}`;
      const dateBoxLabel = isCollection ? 'To be collected on' : 'Required for delivery';
      const addressLabel = isCollection ? 'Site address' : 'Delivery address';

      const itemsTextList = items.map((it) => `- ${it.item} (qty ${it.qty || '1'})`).join('\n');
      const text = `${forTeam ? `This is a copy of the material order sent to ${supplier_name || 'the supplier'}, for your information.\n\n` : ''}A material order has been placed via OpHUB on behalf of ${companyName}.\n\n${accountNo ? `OUR ACCOUNT NUMBER: ${accountNo}\n` : ''}${poNumber ? `PURCHASE ORDER: ${poNumber} — please quote this on your invoice.\n` : ''}Supplier: ${supplier_name || ''}\nSite: ${site.name}\n${addressLabel}: ${fullAddress}\nCompany: ${companyName}\n${multi ? `Items:\n${itemsTextList}` : `Item: ${items[0].item}\nQuantity: ${items[0].qty || '1'}`}\n${dateBoxLabel.toUpperCase()}: ${requiredForDeliveryLabel}${isCollection ? `\nTHIS ORDER WILL BE COLLECTED — please do not deliver.${collectorName ? `\nCollected by: ${collectorName}` : ''}` : ''}${note ? `\nNOTE: ${note}` : ''}\nRequested/sent by: ${callerProfile.name}\nOrdered on: ${orderedOn}${forTeam ? '' : `\n\nPlease confirm and action this order as soon as you can — you can reply directly to this email and it will reach ${callerProfile.name} at ${companyName}.`}`;

      const accountHtmlBlock = accountNo ? `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 10px;">
            <tr>
              <td style="background:#F4F5F7;border:1.5px solid #D9DCE2;border-radius:8px;padding:12px 16px;">
                <div style="font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#3A3B3E;">Our account number</div>
                <div style="font-size:19px;font-weight:800;color:#101114;margin-top:2px;">${ophubEsc(accountNo)}</div>
              </td>
            </tr>
          </table>` : '';

      const poHtmlBlock = poNumber ? `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 10px;">
            <tr>
              <td style="background:#EEF3FA;border:1.5px solid #B9CCE6;border-radius:8px;padding:12px 16px;">
                <div style="font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#1F3A5F;">Our purchase order number</div>
                <div style="font-size:19px;font-weight:800;color:#1F3A5F;margin-top:2px;">${ophubEsc(poNumber)}</div>
                <div style="font-size:13px;color:#3A3B3E;margin-top:4px;">Please quote this on your invoice.</div>
              </td>
            </tr>
          </table>` : '';

      const dateHtmlBlock = `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 18px;">
            <tr>
              <td style="background:#FCEFEF;border:1.5px solid #E8B4B4;border-radius:8px;padding:12px 16px;">
                <div style="font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#A33636;">${ophubEsc(dateBoxLabel)}</div>
                <div style="font-size:17px;font-weight:800;color:#7A1F1F;margin-top:2px;">${ophubEsc(requiredForDeliveryLabel)}</div>
              </td>
            </tr>
          </table>`;

      const noteHtmlBlock = note ? `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:18px;">
            <tr>
              <td style="background:#FFF8E1;border:1.5px solid #E6CF8A;border-radius:8px;padding:12px 16px;">
                <div style="font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#8A6D1A;">Note</div>
                <div style="font-size:15px;color:#101114;margin-top:3px;line-height:1.5;white-space:pre-wrap;">${ophubEsc(note)}</div>
              </td>
            </tr>
          </table>` : '';

      const itemsHtmlBlock = multi
        ? `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:18px;">
            <tr>
              <td style="font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#8A8D93;padding-bottom:6px;">Items</td>
            </tr>
            ${items.map((it) => `
            <tr>
              <td style="padding:9px 0;border-bottom:1px solid #EAEAEA;font-size:15px;color:#101114;">
                <span style="font-weight:700;">${ophubEsc(it.item)}</span>
                <span style="color:#8A8D93;"> — qty ${ophubEsc(String(it.qty || '1'))}</span>
              </td>
            </tr>`).join('')}
          </table>`
        : ophubRows([['Item', items[0].item], ['Quantity', String(items[0].qty || '1')]]);

      const detailsHtmlBlock = ophubRows([
        ['Account no.', accountNo],
        ['PO number', poNumber],
        ['Site', site.name],
        ['Job no.', poNumber ? site.job_number : ''],
        [addressLabel, fullAddress],
        ['Collected by', collectorName],
        ['Company', companyName],
        ['Requested by', callerProfile.name],
        ['Ordered on', orderedOn],
      ]);

      const html = ophubEmail({
        company: companyName,
        brand,
        logoUrl,
        kicker: site.name,
        title: (isCollection ? 'Material order — collection' : 'Material order') + (poNumber ? ` · PO ${poNumber}` : ''),
        greeting: !forTeam && supplier_name ? `Hi ${supplier_name},` : 'Hi,',
        intro: forTeam ? `This is a copy of the material order sent to ${supplier_name || 'the supplier'} for the site below, for your information.` : `${multi ? 'A new combined material order has been placed for the site below.' : 'A new material order has been placed for the site below.'} ${isCollection ? 'This order will be collected — please have it ready and do not deliver.' : 'Please confirm and action it as soon as you can.'}`,
        bodyHtml: `${accountHtmlBlock}${poHtmlBlock}${dateHtmlBlock}${noteHtmlBlock}${itemsHtmlBlock}${detailsHtmlBlock}`,
        note: forTeam ? `Sent by ${callerProfile.name} at ${companyName}. Reply to this email to reach ${callerProfile.name}.` : `You can reply to this email — it will reach ${callerProfile.name} at ${companyName} directly, not OpHUB.`,
      });
      return { subject, text, html };
    };
    const main = buildEmail(mainShowsRefs ? poNumber : '', mainShowsRefs ? accountNo : '', false);

    const emailPayload: any = { from: ophubFrom(FROM_EMAIL, companyName), to: [supplier_email], subject: main.subject, text: main.text, html: main.html };
    if (requesterEmail) emailPayload.reply_to = [requesterEmail];
    // Copy in the sender and anyone ticked — never the address the email is
    // already going to, and no address twice.
    const toLower = lc(supplier_email);
    const seen = new Set([toLower]);
    const ccList: string[] = [];
    for (const addr of [requesterEmail, ...extraCc, ...typedCc]) {
      if (!addr) continue;
      const key = String(addr).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      ccList.push(addr);
    }
    if (ccList.length) emailPayload.cc = ccList;
    const teamList: string[] = [];
    for (const addr of teamCopy) {
      const key = lc(addr);
      if (!addr || seen.has(key)) continue;
      seen.add(key);
      teamList.push(addr);
    }

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(emailPayload),
    });
    if (!emailRes.ok) {
      const errText = await emailRes.text();
      console.error('send-material-order: provider error', emailRes.status, errText);
      return new Response(JSON.stringify({ error: 'The email service didn’t accept the email — please try again.' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    await logEmailSend(admin, { fn: 'send-material-order', sender_id: userData.user.id, org_id: callerProfile.org_id, to: [supplier_email], cc: ccList, subject: main.subject });

    // The team copy (no PO / account / job number). Never fails the order:
    // the supplier's email has already gone.
    let teamSent = 0;
    if (teamList.length) {
      try {
        const team = buildEmail('', '', true);
        const teamPayload: any = { from: ophubFrom(FROM_EMAIL, companyName), to: teamList, subject: team.subject, text: team.text, html: team.html };
        if (requesterEmail) teamPayload.reply_to = [requesterEmail];
        const teamRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(teamPayload),
        });
        if (teamRes.ok) {
          teamSent = teamList.length;
          await logEmailSend(admin, { fn: 'send-material-order', sender_id: userData.user.id, org_id: callerProfile.org_id, to: teamList, subject: team.subject });
        } else console.error('send-material-order: team copy refused', teamRes.status, await teamRes.text());
      } catch (e) { console.error('send-material-order: team copy failed', e); }
    }

    return new Response(JSON.stringify({ ok: true, copied: ccList.length + teamSent }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('send-material-order failed', e);
    return new Response(JSON.stringify({ error: 'Something went wrong — please try again.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}));
