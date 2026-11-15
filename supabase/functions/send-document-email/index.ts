import { createClient } from 'npm:@supabase/supabase-js@2';
import { encodeBase64 } from 'jsr:@std/encoding@1/base64';

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

// Generic "email a document PDF" function (reports, signed RAMS / COSHH /
// toolbox talks, briefings). The PDF is already uploaded to storage by the
// app; this now ATTACHES it to the email as a real PDF, the same way
// send-price-builder-email does for priced sheets, instead of only sending
// a link. The link stays in the email as a fallback when the PDF is too big
// to attach or could not be fetched - the email always goes out either way.
//
// Optional cc_email ("CC me a copy") and client_cc_email ("CC client
// contact") are merged into one cc list, deduped against the recipient.
//
// A report that is not linked to a project (a survey for a potential job)
// sends general_label instead of site_id - that label is used wherever the
// site name would have been.
//
// Optional file_ext 'docx' (O&M manual as a Word file, 13 Oct 2026): the
// attachment is named .docx and the email says "Word document" instead of PDF.
Deno.serve(withCors(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (obj: any, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'Not authenticated' }, 401);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await callerClient.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: 'Not authenticated' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: caller } = await admin.from('profiles').select('id, org_id, name, role, email').eq('id', userData.user.id).maybeSingle();
    if (!caller || !caller.org_id) return json({ error: 'Forbidden' }, 403);

    const body = await req.json().catch(() => ({}));
    const { site_id, general_label, recipient_email, doc_title, cc_email, client_cc_email, file_ext } = body || {};
    // #(email-separate-pdfs) 2026-10-16: optional `files: [{url, name}]` sends
    // several PDFs as separate attachments on ONE email (COSHH / TBT / daily
    // briefings "separate PDFs"). Same own-storage-only rule as file_url.
    const multi: { url: string; name: string }[] = Array.isArray(body?.files)
      ? body.files.filter((f: any) => f && typeof f.url === 'string').slice(0, 40).map((f: any) => ({ url: String(f.url), name: String(f.name || 'Document').replace(/[^a-z0-9.\- ()&]+/gi, '_').slice(0, 110) }))
      : [];
    // M7: a storage path (storage_path / file_path, with storage_bucket) is
    // preferred - the file is then read and signed here with the service
    // role, so it keeps working once the bucket is private. Only the
    // mc-documents bucket is accepted (the only one the app sends).
    const rawPath = typeof body?.storage_path === 'string' ? body.storage_path : (typeof body?.file_path === 'string' ? body.file_path : '');
    const storageBucket = String(body?.storage_bucket || 'mc-documents');
    let file_url = body?.file_url || (multi[0] && multi[0].url);
    let storagePath = '';
    if (rawPath && !multi.length) {
      if (storageBucket !== 'mc-documents' || !(await storagePathAllowed(admin, caller.org_id, rawPath))) return json({ error: 'That file can’t be emailed from your account.' }, 403);
      storagePath = rawPath;
      const { data: signed, error: signErr } = await admin.storage.from(storageBucket).createSignedUrl(storagePath, 7 * 24 * 3600);
      if (signErr || !signed?.signedUrl) { console.error('sign failed', signErr); return json({ error: 'Could not find the file to send — try again.' }, 404); }
      file_url = signed.signedUrl.startsWith('http') ? signed.signedUrl : `${SUPABASE_URL}/storage/v1${signed.signedUrl}`;
    }
    if ((!site_id && !general_label) || !recipient_email || !file_url) {
      return json({ error: 'site_id, recipient_email and file_url are required' }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(recipient_email))) {
      return json({ error: 'recipient_email is not a valid email address' }, 400);
    }
    // M7: every link in the email must point at this project's own Storage,
    // and at a folder of the sender's own company.
    for (const u of (multi.length ? multi.map((f) => f.url) : (storagePath ? [] : [file_url]))) {
      if (!ownStorageUrl(u, SUPABASE_URL)) return json({ error: 'That file link isn’t from OpHUB — upload the file and try again.' }, 400);
      const sp = publicStoragePath(u, SUPABASE_URL);
      if (sp && !(await storagePathAllowed(admin, caller.org_id, sp.path))) return json({ error: 'That file can’t be emailed from your account.' }, 403);
    }
    // M7: managers can email anyone; everyone else only themselves or a
    // manager in their own company (the TBT "everyone has signed" email).
    if (!(await recipientsAllowed(admin, caller, userData.user.email, [recipient_email, cc_email]))) {
      return json({ error: 'Only project managers and admins can email documents outside the company.' }, 403);
    }
    const sentToday = await emailSendsSince(admin, 'send-document-email', 'sender_id', caller.id, 24 * 60);
    if (sentToday != null && sentToday >= 60) return json({ error: 'You’ve reached today’s limit of 60 document emails — try again tomorrow.' }, 429);
    const isWord = String(file_ext || '').toLowerCase() === 'docx';
    const ext = isWord ? 'docx' : 'pdf';
    const kind = isWord ? 'Word document' : 'PDF';

    let site: any = null;
    if (site_id) {
      const { data: siteRow } = await admin.from('sites').select('id, name, org_id').eq('id', site_id).maybeSingle();
      if (!siteRow || siteRow.org_id !== caller.org_id) return json({ error: 'Forbidden' }, 403);
      site = siteRow;
    } else {
      // Not linked to a project: managers only, labelled with what they typed.
      if (!['pm', 'admin', 'site_manager'].includes(String(caller.role))) return json({ error: 'Forbidden' }, 403);
      site = { name: String(general_label).replace(/[\r\n]+/g, ' ').slice(0, 120) };
    }

    const { data: org } = await admin.from('organizations').select('name, logo_path, color_primary').eq('id', caller.org_id).maybeSingle();
    const companyName = org?.name || 'OpHUB';
    const logoUrl = org?.logo_path ? `${SUPABASE_URL}/storage/v1/object/public/org-logos/${org.logo_path}` : null;

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const FROM_EMAIL = Deno.env.get('INVITES_FROM_EMAIL') || Deno.env.get('ORDERS_FROM_EMAIL') || 'reports@ophub.app';
    if (!RESEND_API_KEY) {
      return json({ error: 'Email sending is not configured yet (missing RESEND_API_KEY secret).' }, 200);
    }

    const title = String(doc_title || 'Document');
    const subject = `${title} — ${site.name}`;

    // Attach the file for real. Only files in this project's own storage are
    // fetched (never an arbitrary address), and only up to 12MB - above
    // that the email goes with the link button instead.
    const ATTACHMENT_LIMIT_BYTES = 12 * 1024 * 1024;
    let attachmentBase64: string | null = null;
    const attachmentFilename = `${title.replace(/[^a-z0-9.\- ]+/gi, '_')} - ${String(site.name).replace(/[^a-z0-9.\- ]+/gi, '_')}.${ext}`;
    try {
      const ownStorage = String(file_url).startsWith(`${SUPABASE_URL}/storage/v1/object/public/`);
      if (storagePath && !multi.length) {
        // Read with the service role (works for a private bucket too).
        const { data: blob } = await admin.storage.from(storageBucket).download(storagePath);
        if (blob && blob.size > 0 && blob.size <= ATTACHMENT_LIMIT_BYTES) attachmentBase64 = encodeBase64(new Uint8Array(await blob.arrayBuffer()));
      } else if (ownStorage && !multi.length) {
        const fileRes = await fetch(String(file_url));
        const len = Number(fileRes.headers.get('content-length') || 0);
        if (fileRes.ok && (!len || len <= ATTACHMENT_LIMIT_BYTES)) {
          const buf = new Uint8Array(await fileRes.arrayBuffer());
          if (buf.byteLength > 0 && buf.byteLength <= ATTACHMENT_LIMIT_BYTES) attachmentBase64 = encodeBase64(buf);
        } else {
          try { await fileRes.body?.cancel(); } catch (_e) { /* ignore */ }
        }
      }
    } catch (_e) {
      // Could not fetch the file - the email still sends with the link.
    }

    // Both versions of the email (file attached / link button) use the standard layout.
    const buildHtml = (withAttachment: boolean) => ophubEmail({
      company: companyName,
      brand: org?.color_primary,
      logoUrl,
      kicker: site.name,
      title: 'Document shared with you',
      greeting: 'Hi,',
      intro: withAttachment
        ? `${caller.name} shared "${title}" for ${site.name}. The ${kind} is attached.`
        : `${caller.name} shared "${title}" for ${site.name}. Use the button below to open the ${kind}.`,
      bodyHtml: ophubRows([['Document', title], ['For', site.name], ['Shared by', caller.name]]),
      button: withAttachment ? null : { label: 'View the ' + kind, url: String(file_url) },
    });
    const text = `Hi,\n\n${caller.name} shared "${title}" for ${site.name}${attachmentBase64 ? ' (attached)' : ':\n\n' + file_url}.\n\nSent via OpHUB.`;
    let html = buildHtml(!!attachmentBase64);
    let multiAttachments: { filename: string; content: string }[] | null = null;
    if (multi.length) {
      // All or nothing: attach every file if they fit together (Resend's cap
      // is ~40MB per email including encoding), else list them as links.
      const TOTAL_LIMIT = 26 * 1024 * 1024;
      let total = 0; const got: { filename: string; content: string }[] = [];
      for (const f of multi) {
        if (!f.url.startsWith(`${SUPABASE_URL}/storage/v1/object/public/`)) { got.length = 0; break; }
        try {
          const r = await fetch(f.url);
          if (!r.ok) { got.length = 0; break; }
          const buf = new Uint8Array(await r.arrayBuffer());
          total += buf.byteLength;
          if (total > TOTAL_LIMIT) { got.length = 0; break; }
          const nm = /\.(pdf|docx)$/i.test(f.name) ? f.name : f.name + '.' + ext;
          got.push({ filename: nm, content: encodeBase64(buf) });
        } catch (_e) { got.length = 0; break; }
      }
      const linksHtml = '<p style="margin:14px 0 6px;font-weight:700;">Files (' + multi.length + ')</p>' + multi.map((f) => `<p style="margin:4px 0;"><a href="${ophubEsc(f.url)}">${ophubEsc(f.name)}</a></p>`).join('');
      const listText = multi.map((f) => `- ${f.name}: ${f.url}`).join('\n');
      const rows = ophubRows([['Document', title], ['For', site.name], ['Files', String(multi.length)], ['Shared by', caller.name]]);
      if (got.length === multi.length) {
        multiAttachments = got;
        html = ophubEmail({ company: companyName, brand: org?.color_primary, logoUrl, kicker: site.name, title: 'Documents shared with you', greeting: 'Hi,',
          intro: `${caller.name} shared ${multi.length} documents for ${site.name}. They're attached as separate files.`,
          bodyHtml: rows + '<p style="margin:14px 0 6px;font-weight:700;">Attached</p>' + multi.map((f) => `<p style="margin:2px 0;">${ophubEsc(f.name)}</p>`).join('') });
        (body as any).__text = `Hi,\n\n${caller.name} shared ${multi.length} documents for ${site.name} (attached as separate files).\n\nSent via OpHUB.`;
      } else {
        html = ophubEmail({ company: companyName, brand: org?.color_primary, logoUrl, kicker: site.name, title: 'Documents shared with you', greeting: 'Hi,',
          intro: `${caller.name} shared ${multi.length} documents for ${site.name}. They were too big to attach together, so each one is linked below.`,
          bodyHtml: rows + linksHtml });
        (body as any).__text = `Hi,\n\n${caller.name} shared ${multi.length} documents for ${site.name}:\n\n${listText}\n\nSent via OpHUB.`;
      }
      attachmentBase64 = null;
    }

    const emailPayload: any = { from: ophubFrom(FROM_EMAIL, companyName), to: [recipient_email], subject, text: (body as any).__text || text, html };
    const ccList: string[] = [];
    if (cc_email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(cc_email)) && String(cc_email).toLowerCase() !== String(recipient_email).toLowerCase()) {
      ccList.push(cc_email);
    }
    // "CC client contact" is only ever the project's own client email.
    const clientCc = client_cc_email ? await clientCcAllowed(admin, caller.org_id, site_id || null, client_cc_email) : null;
    if (clientCc && String(clientCc).toLowerCase() !== String(recipient_email).toLowerCase() && !ccList.some((e) => e.toLowerCase() === String(clientCc).toLowerCase())) {
      ccList.push(clientCc);
    }
    if (ccList.length) emailPayload.cc = ccList;
    if (attachmentBase64) emailPayload.attachments = [{ filename: attachmentFilename, content: attachmentBase64 }];
    if (multiAttachments) emailPayload.attachments = multiAttachments;

    let emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(emailPayload),
    });
    // If the provider refuses it with the attachment, send again with the link instead.
    let attached = !!attachmentBase64 || !!multiAttachments;
    if (!emailRes.ok && multiAttachments) {
      attached = false;
      delete emailPayload.attachments;
      emailPayload.html = ophubEmail({ company: companyName, brand: org?.color_primary, logoUrl, kicker: site.name, title: 'Documents shared with you', greeting: 'Hi,',
        intro: `${caller.name} shared ${multi.length} documents for ${site.name}. Each one is linked below.`,
        bodyHtml: ophubRows([['Document', title], ['For', site.name], ['Shared by', caller.name]]) + multi.map((f) => `<p style="margin:4px 0;"><a href="${ophubEsc(f.url)}">${ophubEsc(f.name)}</a></p>`).join('') });
      emailPayload.text = `Hi,\n\n${caller.name} shared ${multi.length} documents for ${site.name}:\n\n` + multi.map((f) => `- ${f.name}: ${f.url}`).join('\n') + '\n\nSent via OpHUB.';
      emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(emailPayload),
      });
    } else if (!emailRes.ok && attachmentBase64) {
      attached = false;
      delete emailPayload.attachments;
      emailPayload.text = `Hi,\n\n${caller.name} shared "${title}" for ${site.name}:\n\n${file_url}\n\nSent via OpHUB.`;
      emailPayload.html = buildHtml(false);
      emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(emailPayload),
      });
    }
    if (!emailRes.ok) {
      const errText = await emailRes.text();
      console.error('send-document-email: provider error', emailRes.status, errText);
      return json({ error: 'The email service didn’t accept the email — please try again.' }, 502);
    }

    await logEmailSend(admin, { fn: 'send-document-email', sender_id: caller.id, org_id: caller.org_id, to: [recipient_email], cc: emailPayload.cc || [], subject });
    return json({ ok: true, attached });
  } catch (e) {
    console.error('send-document-email failed', e);
    return json({ error: 'Something went wrong sending the email — please try again.' }, 500);
  }
}));
