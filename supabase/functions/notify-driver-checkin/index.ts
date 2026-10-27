import { createClient } from 'npm:@supabase/supabase-js@2';
import { GoogleAuth } from 'npm:google-auth-library@9';

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, cache-control, pragma',
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

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

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] ));
}

// Tells the office when a delivery driver checks in or out — by push AND
// email. Called by the driver's own app straight after the check-in/out has
// been saved.
//   check IN  -> every Project Manager (role 'pm') AND the company admin(s)
//                (role 'admin') in the driver's company
//   check OUT -> the company admin(s) (role 'admin') only
// Nothing in the request body is trusted: who the driver is comes from their
// login, and the time/place come from their latest saved check-in row. A
// row older than 10 minutes is ignored, so this can't be replayed to send
// repeat notifications about an old check-in. Both channels are best-effort.
Deno.serve(withCors(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'Not authenticated' }, 401);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await callerClient.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: 'Not authenticated' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: driver } = await admin.from('profiles').select('id, org_id, name, role').eq('id', userData.user.id).maybeSingle();
    if (!driver || !driver.org_id || driver.role !== 'driver') return json({ error: 'Forbidden' }, 403);

    const { data: lastRows } = await admin.from('driver_checkins').select('id, type, ts, lat, lon, accuracy_m').eq('user_id', driver.id).order('ts', { ascending: false }).limit(1);
    const last = lastRows && lastRows[0];
    if (!last) return json({ ok: true, notified: 0, reason: 'no check-in found' });
    if (Date.now() - new Date(last.ts).getTime() > 10 * 60 * 1000) return json({ ok: true, notified: 0, reason: 'latest check-in is not recent' });

    // fix3c: one notification per check-in. Before, the driver's app (or anyone
    // with the driver's sign-in) could call this again and again within the
    // 10 minutes and email every PM and admin each time. A row in
    // edge_email_log written after this check-in means it has already gone;
    // plus a daily cap per driver. (Skipped, never blocking, if the log table
    // isn't there.)
    // (Both times are the database's own clock: ts defaults to now().)
    const { count: alreadyLogged, error: logErr } = await admin.from('edge_email_log').select('id', { count: 'exact', head: true }).eq('fn', 'notify-driver-checkin').eq('sender_id', driver.id).gte('created_at', new Date(last.ts).toISOString());
    if (logErr) console.warn('edge_email_log: check skipped -', logErr.message || logErr.code || logErr);
    else if ((alreadyLogged || 0) > 0) return json({ ok: true, notified: 0, reason: 'already notified for this check-in' });
    const sentToday = await emailSendsSince(admin, 'notify-driver-checkin', 'sender_id', driver.id, 24 * 60);
    if (sentToday != null && sentToday >= 12) return json({ ok: true, notified: 0, reason: 'daily limit reached' });

    const isIn = last.type === 'in';
    const recipientRoles = isIn ? ['pm', 'admin'] : ['admin'];
    const { data: recipients } = await admin.from('profiles').select('id, name, email').eq('org_id', driver.org_id).in('role', recipientRoles).neq('id', driver.id).eq('is_estimator', false); // estimators receive no notifications
    if (!recipients || !recipients.length) return json({ ok: true, notified: 0 });
    // Logged before anything is sent, so a second call straight after is turned away.
    await logEmailSend(admin, { fn: 'notify-driver-checkin', sender_id: driver.id, org_id: driver.org_id, to: recipients.map((r: any) => r.email).filter(Boolean), subject: `Driver ${last.type === 'in' ? 'checked in' : 'checked out'} - check-in ${last.id}` });

    const { data: org } = await admin.from('organizations').select('name, logo_path, color_primary').eq('id', driver.org_id).maybeSingle();
    const companyName = org?.name || 'your company';
    const brand = (org?.color_primary) || '#4E8FD1';
    const logoUrl = org?.logo_path ? `${SUPABASE_URL}/storage/v1/object/public/org-logos/${org.logo_path}` : 'https://operativehub.co.uk/assets/ophub-mark.png';

    const when = new Date(last.ts).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    const hasLocation = typeof last.lat === 'number' && typeof last.lon === 'number';
    const mapUrl = hasLocation ? `https://www.google.com/maps?q=${last.lat},${last.lon}` : '';
    const action = isIn ? 'checked in' : 'checked out';
    const title = isIn ? 'Driver checked in' : 'Driver checked out';
    const pushBody = `${driver.name} ${action} at ${when}.`;

    let firebaseCreds = null;
    try {
      const FIREBASE_SERVICE_ACCOUNT_JSON = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON');
      if (FIREBASE_SERVICE_ACCOUNT_JSON) {
        const serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON);
        const auth = new GoogleAuth({ credentials: serviceAccount, scopes: ['https://www.googleapis.com/auth/firebase.messaging'] });
        const client = await auth.getClient();
        const accessTokenResp = await client.getAccessToken();
        const accessToken = typeof accessTokenResp === 'string' ? accessTokenResp : accessTokenResp?.token;
        if (accessToken) firebaseCreds = { projectId: serviceAccount.project_id, accessToken };
      }
    } catch (_e) { /* push disabled for this run */ }

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const FROM_EMAIL = Deno.env.get('ORDERS_FROM_EMAIL') || 'notifications@ophub.app';

    let pushSent = 0, pushFailed = 0, emailsSent = 0;
    for (const person of recipients) {
      // --- Push ---
      if (firebaseCreds) {
        try {
          const { data: tokens } = await admin.from('push_tokens').select('token').eq('user_id', person.id);
          for (const t of (tokens || [])) {
            try {
              const res = await fetch(`https://fcm.googleapis.com/v1/projects/${firebaseCreds.projectId}/messages:send`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${firebaseCreds.accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  message: {
                    token: t.token,
                    notification: { title, body: pushBody },
                    data: { kind: isIn ? 'driver_checked_in' : 'driver_checked_out', user_id: String(driver.id) },
                    android: { priority: 'high' },
                    apns: { headers: { 'apns-priority': '10' }, payload: { aps: { alert: { title, body: pushBody }, sound: 'default' } } },
                  },
                }),
              });
              if (res.ok) pushSent++; else pushFailed++;
            } catch (_e) { pushFailed++; }
          }
        } catch (_e) { /* skip push for this person */ }
      }

      // --- Email ---
      if (RESEND_API_KEY && person.email) {
        try {
          const subject = `${title} — ${driver.name}, ${when}`;
          const firstName = String(person.name || '').trim().split(/\s+/)[0];
          const greeting = firstName ? `Hi ${firstName},` : 'Hi,';
          const intro = `${driver.name} ${action} at ${when}.`;
          const logNote = 'The full log is in OpHUB under Admin Centre > Driver Check-In Log.';
          const text = `${greeting}\n\n${intro}${mapUrl ? `\n\nLocation: ${mapUrl}${last.accuracy_m ? ` (accurate to about ${last.accuracy_m}m)` : ''}` : ''}\n\n${logNote}`;
          const html = ophubEmail({
            company: org?.name,
            brand,
            logoUrl,
            title,
            greeting,
            intro,
            bodyHtml: ophubRows([
              ['Delivery driver', driver.name],
              ['Status', isIn ? 'Checked in' : 'Checked out'],
              ['Time', when],
              ['Location accuracy', mapUrl && last.accuracy_m ? `About ${last.accuracy_m}m` : ''],
            ]),
            button: mapUrl ? { label: 'View location on map', url: mapUrl } : null,
            note: logNote,
          });
          const emailRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: ophubFrom(FROM_EMAIL, org?.name || ''), to: [person.email], subject, text, html }),
          });
          if (emailRes.ok) emailsSent++;
        } catch (_e) { /* skip email for this person */ }
      }
    }

    return json({ ok: true, type: last.type, notified: recipients.length, push: { sent: pushSent, failed: pushFailed }, email: { sent: emailsSent } });
  } catch (e) {
    console.error(e);
    return json({ error: 'Something went wrong' }, 500);
  }
}));
