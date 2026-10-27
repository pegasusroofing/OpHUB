import { createClient } from 'npm:@supabase/supabase-js@2';
import { GoogleAuth } from 'npm:google-auth-library@9';

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

// Notifies ONE operative — by push AND email — that a PM/admin has just
// assigned them to a site. Called from both assignment entry points in the
// app (the Settings & Admin "Assign Operatives" list, and the first-visit
// "Assign Operatives" modal on a newly-live site). Both channels are
// best-effort: a missing FIREBASE_SERVICE_ACCOUNT_JSON or RESEND_API_KEY
// secret, no registered devices, or no email on file just means that one
// channel is skipped — the assignment itself has already been saved by the
// caller before this function is even invoked.
//
// #(cors-cache-pragma-fix) 2026-09-24: the app's shared sbFetch() helper
// always sends Cache-Control/Pragma headers on every request (added to stop
// the Android WebView serving stale GETs from its HTTP cache — see app.html)
// including on POSTs to this function. Those two headers weren't in this
// function's Access-Control-Allow-Headers, so the browser's CORS preflight
// (OPTIONS) succeeded but the browser then silently refused to send the
// actual POST at all — it never reached Supabase, so nothing showed up in
// this function's own logs beyond the OPTIONS. That's why site-assignment
// pushes/emails were never actually going out despite no visible error.
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
    const { data: caller } = await admin.from('profiles').select('role, org_id, name').eq('id', userData.user.id).maybeSingle();
    if (!caller || (caller.role !== 'pm' && caller.role !== 'admin')) {
      return new Response(JSON.stringify({ error: 'Forbidden — project managers and admins only' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json().catch(() => ({}));
    const { site_id, user_id } = body;
    if (!site_id || !user_id) {
      return new Response(JSON.stringify({ error: 'site_id and user_id are required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: site } = await admin.from('sites').select('id, name, address, postcode, org_id').eq('id', site_id).maybeSingle();
    if (!site || site.org_id !== caller.org_id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const { data: target } = await admin.from('profiles').select('id, org_id, name, email, is_estimator').eq('id', user_id).maybeSingle();
    if (!target || target.org_id !== caller.org_id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    // Estimators receive no automatic notifications (push or email).
    if (target.is_estimator) {
      return new Response(JSON.stringify({ ok: true, skipped: 'estimator' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const fullAddress = [site.address, site.postcode].map((v) => (v || '').trim()).filter(Boolean).join(', ') || 'Not set';
    let pushSent = 0, pushFailed = 0, pushSkipped = null;
    let emailSent = false, emailSkipped = null;

    // --- Push (FCM), same shape as notify-material-pickup / send-message-push ---
    try {
      const { data: tokens } = await admin.from('push_tokens').select('token').eq('user_id', user_id);
      if (!tokens || !tokens.length) {
        pushSkipped = 'no registered devices';
      } else {
        const FIREBASE_SERVICE_ACCOUNT_JSON = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON');
        if (!FIREBASE_SERVICE_ACCOUNT_JSON) {
          pushSkipped = 'FIREBASE_SERVICE_ACCOUNT_JSON not set';
        } else {
          const serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON);
          const projectId = serviceAccount.project_id;
          const auth = new GoogleAuth({ credentials: serviceAccount, scopes: ['https://www.googleapis.com/auth/firebase.messaging'] });
          const client = await auth.getClient();
          const accessTokenResp = await client.getAccessToken();
          const accessToken = typeof accessTokenResp === 'string' ? accessTokenResp : accessTokenResp?.token;
          if (!accessToken) throw new Error('Could not obtain Firebase access token');

          const title = 'Added to a site';
          const msgBody = `${caller.name} assigned you to ${site.name}.`;
          for (const t of tokens) {
            try {
              const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  message: {
                    token: t.token,
                    notification: { title, body: msgBody },
                    data: { kind: 'site_assignment', site_id: String(site_id) },
                    android: { priority: 'high' },
                    apns: { headers: { 'apns-priority': '10' }, payload: { aps: { alert: { title, body: msgBody }, sound: 'default' } } },
                  },
                }),
              });
              if (res.ok) pushSent++; else pushFailed++;
            } catch (_e) { pushFailed++; }
          }
        }
      }
    } catch (_e) { pushSkipped = 'push failed'; }

    // --- Email (Resend), same shape as send-invite-email / send-material-order ---
    try {
      if (!target.email) {
        emailSkipped = 'no email on file';
      } else {
        const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
        const FROM_EMAIL = Deno.env.get('ORDERS_FROM_EMAIL') || 'notifications@ophub.app';
        // fix3c: a daily limit per sender, and every send is logged (edge_email_log).
        const sentToday = RESEND_API_KEY ? await emailSendsSince(admin, 'notify-site-assignment', 'sender_id', userData.user.id, 24 * 60) : null;
        if (!RESEND_API_KEY) {
          emailSkipped = 'RESEND_API_KEY not set';
        } else if (sentToday != null && sentToday >= 200) {
          emailSkipped = 'daily email limit reached';
        } else {
          const { data: org } = await admin.from('organizations').select('name, logo_path, color_primary').eq('id', caller.org_id).maybeSingle();
          const companyName = org?.name || 'your company';
          const brand = org?.color_primary || null;
          const logoUrl = org?.logo_path ? `${SUPABASE_URL}/storage/v1/object/public/org-logos/${org.logo_path}` : null;
          const firstName = String(target.name || '').trim().split(/\s+/)[0];
          const greeting = firstName ? `Hi ${firstName},` : 'Hi,';
          const intro = `${caller.name} has added you to the site below. Open OpHUB to check in, view the schedule of work, and see anything waiting for your signature.`;
          const note = `You can reply to this email and it will reach ${caller.name} at ${companyName}, not OpHUB.`;
          const subject = `Added to a site — ${site.name}`;
          const text = `${greeting}\n\n${caller.name} has added you to ${site.name} on OpHUB.\n\nSite address: ${fullAddress}\n\nOpen the app to check in, view the schedule of work, and see any RAMS, COSHH or toolbox talks waiting for your signature.\n\n${note}`;
          const html = ophubEmail({
            company: org?.name,
            brand,
            logoUrl,
            kicker: site.name,
            title: 'Added to a site',
            greeting,
            intro,
            bodyHtml: ophubRows([['Site', site.name], ['Address', fullAddress]]),
            note,
          });

          const emailPayload = { from: ophubFrom(FROM_EMAIL, org?.name || ''), to: [target.email], subject, text, html, reply_to: [userData.user.email].filter(Boolean) };
          const emailRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(emailPayload),
          });
          emailSent = emailRes.ok;
          if (!emailRes.ok) { console.error('notify-site-assignment: provider error', emailRes.status, await emailRes.text()); emailSkipped = 'email provider error'; }
          else await logEmailSend(admin, { fn: 'notify-site-assignment', sender_id: userData.user.id, org_id: caller.org_id, to: [target.email], subject });
        }
      }
    } catch (_e) { emailSkipped = 'email failed'; }

    return new Response(JSON.stringify({ ok: true, push: { sent: pushSent, failed: pushFailed, skipped: pushSkipped }, email: { sent: emailSent, skipped: emailSkipped } }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('notify-site-assignment failed', e);
    return new Response(JSON.stringify({ error: 'Something went wrong — please try again.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}));
