import { createClient } from 'npm:@supabase/supabase-js@2';
import { GoogleAuth } from 'npm:google-auth-library@9';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

// Fired by a DB trigger (see migration `trigger_push_on_message_insert`) right
// after a new row lands in public.messages. Works out who should be told
// about it (the other side of the conversation — managers get pinged about
// operative activity and vice versa) and sends each of their devices a real
// push notification carrying a `data` payload the app uses to deep-link
// straight to the right site/tab when the notification is tapped.
//
// audience='single' is the one exception to "the other side of the
// conversation": it targets exactly one person via recipient_id, used for
// things like a delivery driver's site contact being told a delivery was
// completed — not a broadcast to a role at all.
//
// #notif-review-2026-09: audience='managers' used to notify every pm/admin/
// superadmin in the org. Per the notifications review, this is narrowed to
// the site's own Responsible PM (falling back to every PM in the org when
// the site has none set, or when the message isn't tied to a site at all)
// PLUS every Admin in the org, unconditionally — Admins always want the
// org-wide oversight view; PMs only need to hear about their own sites.
// 'superadmin' is dropped from this set entirely (platform-level role, not
// an org member who should be pinged about site activity).
//
// 2026-10-03: the deep-link id (e.g. a delivery_tasks.id) travels in
// messages.related_id and is sent to the app as task_id. It used to be put
// in parent_id, which is a foreign key to another message, so those inserts
// failed and never got here. parent_id is deliberately NOT used as a
// fallback: on an ordinary reply it holds the parent MESSAGE id, and sending
// that as task_id made the app open a delivery that doesn't exist. A
// targeted (audience='single') plain 'message' that carries a related_id is
// a delivery update (pushed to the next day, high priority changed), so it
// gets a delivery title rather than the generic "New message".
//
// 2026-10-07: a message for the managers (audience='managers' — e.g. "Colin
// has requested materials") is now ALSO emailed to the same Project Managers
// / Admins it is pushed to, so it is seen even with the phone app closed.
// Estimators are left out (they receive no notifications), and the routine
// "operative checked in" notice is not emailed (far too frequent).
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
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NO_EMAIL_KINDS = ['operative_checked_in'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const CRON_SECRET = Deno.env.get('CRON_SECRET');
    const provided = req.headers.get('x-cron-secret') || '';
    if (!CRON_SECRET || provided !== CRON_SECRET) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const message = await req.json();
    const { id: messageId, org_id: orgId, site_id: siteId, sender_id: senderId, audience, kind, body: msgBody, recipient_id: recipientId, related_id: relatedId } = message;
    if (!orgId || !audience) {
      return new Response(JSON.stringify({ ok: true, skipped: 'incomplete message row' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    // messages with audience='managers' are things operatives raised (material
    // requests, variations, snag closures, questions) — notify PMs/admins.
    // messages with audience='operatives' are announcements a manager posted —
    // notify the operatives on that site (or every operative if it's a
    // company-wide broadcast with no site_id).
    // messages with audience='single' go to exactly one person (recipient_id)
    // — no role-based resolution at all.
    let recipientIds: string[] = [];
    if (audience === 'single') {
      if (recipientId) recipientIds = [recipientId];
    } else if (audience === 'managers') {
      const { data: admins } = await admin.from('profiles').select('id').eq('org_id', orgId).eq('role', 'admin');
      const recipientSet = new Set<string>((admins || []).map((p: { id: string }) => p.id));

      let responsiblePmId: string | null = null;
      if (siteId) {
        const { data: site } = await admin.from('sites').select('responsible_pm_id').eq('id', siteId).maybeSingle();
        responsiblePmId = site?.responsible_pm_id || null;
      }
      if (responsiblePmId) {
        recipientSet.add(responsiblePmId);
      } else {
        // No responsible PM set for this site (or the message isn't tied to a
        // site, e.g. the vehicle-checklist failure notice) — fall back to
        // every PM in the org, same rule used by the other PM-facing
        // notification functions (resign-check, TBT reminder, RAMS/COSHH nudge).
        const { data: pms } = await admin.from('profiles').select('id').eq('org_id', orgId).eq('role', 'pm');
        (pms || []).forEach((p: { id: string }) => recipientSet.add(p.id));
      }
      recipientIds = [...recipientSet];
    } else {
      if (siteId) {
        const { data: assigned } = await admin.from('site_assignments').select('user_id').eq('site_id', siteId);
        recipientIds = (assigned || []).map((a: { user_id: string }) => a.user_id);
      }
      if (!recipientIds.length) {
        const { data: operatives } = await admin.from('profiles').select('id').eq('org_id', orgId).eq('role', 'operative');
        recipientIds = (operatives || []).map((p: { id: string }) => p.id);
      }
    }
    recipientIds = recipientIds.filter((id) => id && id !== senderId);
    if (!recipientIds.length) {
      return new Response(JSON.stringify({ ok: true, sent: 0, reason: 'no recipients' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const titles: Record<string, string> = {
      material_request: 'Material requested',
      variation: 'Variation raised',
      snag_closed: 'Snag closed',
      message: 'New message',
      schedule_flag: 'Site flag raised',
      delivery_complete: 'Delivery completed',
      permit_issued: 'Permit issued',
      permit_closed: 'Permit closed',
      havs_elv_exceeded: 'HAVS limit exceeded',
      havs_eav_exceeded: 'HAVS action value exceeded',
      vehicle_checklist_fail: 'Vehicle checklist — failed item',
      additional_works_requested: 'Variation requested',
      snag_raised: 'New snag raised',
      operative_checked_in: 'Operative checked in',
      doc_needs_signing: 'New document to sign',
      price_sheet_issued: 'Price sheet issued to you',
      delivery_assigned: 'Delivery/collection assigned to you',
    };
    const taskId = relatedId || '';
    const isDeliveryUpdate = audience === 'single' && kind === 'message' && !!relatedId;
    const title = isDeliveryUpdate ? 'Delivery schedule update' : (titles[kind] || 'OpHUB');
    const preview = (msgBody || '').toString().slice(0, 140);

    // ---- Email the managers too (never blocks or fails the push below) ----
    let emailed = 0;
    if (audience === 'managers' && !NO_EMAIL_KINDS.includes(String(kind || ''))) {
      try {
        const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
        if (RESEND_API_KEY) {
          const [{ data: people }, { data: org }, { data: siteRow }, { data: sender }] = await Promise.all([
            admin.from('profiles').select('id, name, email').in('id', recipientIds).eq('org_id', orgId).in('role', ['pm', 'admin']).eq('is_estimator', false), // estimators receive no notifications
            admin.from('organizations').select('name, logo_path, color_primary').eq('id', orgId).maybeSingle(),
            siteId ? admin.from('sites').select('name').eq('id', siteId).maybeSingle() : Promise.resolve({ data: null }),
            senderId ? admin.from('profiles').select('name').eq('id', senderId).maybeSingle() : Promise.resolve({ data: null }),
          ]);
          const toList = (people || []).map((p: { email: string | null }) => String(p.email || '').trim()).filter((e: string) => EMAIL_RE.test(e));
          if (toList.length) {
            const companyName = org?.name || 'OpHUB';
            const siteName = siteRow?.name ? String(siteRow.name) : '';
            const fromHeader = ophubFrom(Deno.env.get('INVITES_FROM_EMAIL') || Deno.env.get('ORDERS_FROM_EMAIL') || 'reports@ophub.app', companyName);
            const fullBody = (msgBody || '').toString().slice(0, 2000);
            const senderName = sender?.name ? String(sender.name) : '';
            const firstNameByEmail = new Map<string, string>();
            (people || []).forEach((p: { name: string | null; email: string | null }) => {
              const first = String(p.name || '').trim().split(/\s+/)[0] || '';
              if (first) firstNameByEmail.set(String(p.email || '').trim(), first);
            });
            const intro = senderName ? `${senderName} sent this from the app.` : 'This came in from the app.';
            const noteLine = 'You are getting this because you are a Project Manager or Admin for this job.';
            const bodyHtml = ophubRows([['Job', siteName || 'Not linked to a job'], ['From', senderName]])
              + `<div style="border:1px solid #E3E7EE;border-radius:10px;padding:14px 16px;margin:0 0 12px;font-size:15px;line-height:1.5;color:#101114;white-space:pre-wrap;">${ophubEsc(fullBody)}</div>`;
            const subject = `${title}${siteName ? ' — ' + siteName : ''}`.slice(0, 200);
            // One email each, so nobody sees the others' addresses.
            for (const to of toList) {
              const greeting = firstNameByEmail.get(to) ? `Hi ${firstNameByEmail.get(to)},` : 'Hi,';
              const html = ophubEmail({
                company: companyName,
                brand: org?.color_primary,
                logoUrl: org?.logo_path ? `${SUPABASE_URL}/storage/v1/object/public/org-logos/${org.logo_path}` : null,
                kicker: siteName || undefined,
                title,
                greeting,
                intro,
                bodyHtml,
                button: { label: 'Open OpHUB', url: 'https://operativehub.co.uk/app.html' },
                note: noteLine,
              });
              const text = `${greeting}\n\n${title}${siteName ? ' — ' + siteName : ''}${senderName ? ' (from ' + senderName + ')' : ''}\n\n${fullBody}\n\nOpen OpHUB: https://operativehub.co.uk/app.html\n\n${noteLine}`;
              const res = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ from: fromHeader, to: [to], subject, html, text }),
              });
              if (res.ok) emailed++; else console.error('manager email failed', await res.text());
            }
          }
        }
      } catch (e) { console.error('manager email step failed', e); }
    }

    const { data: tokens } = await admin.from('push_tokens').select('token').in('user_id', recipientIds);
    if (!tokens || !tokens.length) {
      return new Response(JSON.stringify({ ok: true, sent: 0, emailed, reason: 'no registered devices' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const FIREBASE_SERVICE_ACCOUNT_JSON = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON');
    if (!FIREBASE_SERVICE_ACCOUNT_JSON) {
      return new Response(JSON.stringify({ ok: true, sent: 0, emailed, reason: 'FIREBASE_SERVICE_ACCOUNT_JSON not set' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON);
    const projectId = serviceAccount.project_id;

    const auth = new GoogleAuth({ credentials: serviceAccount, scopes: ['https://www.googleapis.com/auth/firebase.messaging'] });
    const client = await auth.getClient();
    const accessTokenResp = await client.getAccessToken();
    const accessToken = typeof accessTokenResp === 'string' ? accessTokenResp : accessTokenResp?.token;
    if (!accessToken) throw new Error('Could not obtain Firebase access token');

    let sent = 0; let failed = 0;
    for (const t of tokens) {
      try {
        const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: {
              token: t.token,
              notification: { title, body: preview },
              // related_id is the message's own related_id under its own name
              // (fix3c, 27 Oct 2026). task_id is the same value, kept for
              // older app builds that only read task_id.
              data: { kind: String(kind || ''), site_id: String(siteId || ''), message_id: String(messageId || ''), related_id: String(relatedId || ''), task_id: String(taskId) },
              android: { priority: 'high' },
              apns: {
                headers: { 'apns-priority': '10' },
                payload: { aps: { alert: { title, body: preview }, sound: 'default' } },
              },
            },
          }),
        });
        if (res.ok) sent++; else failed++;
      } catch (_e) { failed++; }
    }

    return new Response(JSON.stringify({ ok: true, sent, failed, emailed }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('send-message-push failed', e);
    return new Response(JSON.stringify({ error: 'Something went wrong — please try again.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
