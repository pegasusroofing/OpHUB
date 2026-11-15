import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

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

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
function fmtDate(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

// Fired once a day by pg_cron (see migration `site_calendar_reminders_cron`).
// Finds every calendar event whose REMINDER date (day before / day of /
// custom date, chosen when the event was created) is TODAY and that has a
// reminder recipient list attached but hasn't been emailed yet, and sends
// each recipient — plus whoever created the event — a reminder email.
// reminder_sent is then flipped so the same event never emails twice, even
// if this function is re-run. Falls back to event_date for any older event
// created before reminder_date existed.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const CRON_SECRET = Deno.env.get('CRON_SECRET');
    const provided = req.headers.get('x-cron-secret') || '';
    if (!CRON_SECRET || provided !== CRON_SECRET) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
    const { data: dueByReminderDate } = await admin.from('site_calendar_events')
      .select('id, site_id, org_id, title, event_date, reminder_date, is_private, reminder_recipient_ids, created_by')
      .eq('reminder_date', today).eq('reminder_sent', false).not('reminder_recipient_ids', 'eq', '{}');
    const { data: dueByEventDateLegacy } = await admin.from('site_calendar_events')
      .select('id, site_id, org_id, title, event_date, reminder_date, is_private, reminder_recipient_ids, created_by')
      .is('reminder_date', null).eq('event_date', today).eq('reminder_sent', false).not('reminder_recipient_ids', 'eq', '{}');
    const events = [...(dueByReminderDate || []), ...(dueByEventDateLegacy || [])];
    if (!events.length) {
      return new Response(JSON.stringify({ ok: true, sent: 0, reason: 'no events due' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const FROM_EMAIL = Deno.env.get('INVITES_FROM_EMAIL') || Deno.env.get('ORDERS_FROM_EMAIL') || 'reports@ophub.app';
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ ok: true, sent: 0, reason: 'RESEND_API_KEY not set' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let sent = 0, failed = 0;
    for (const ev of events) {
      try {
        const recipientIds = Array.from(new Set([...(ev.reminder_recipient_ids || []), ev.created_by].filter(Boolean)));
        const [{ data: site }, { data: org }, { data: recipients }] = await Promise.all([
          admin.from('sites').select('name').eq('id', ev.site_id).maybeSingle(),
          admin.from('organizations').select('name, logo_path, color_primary').eq('id', ev.org_id).maybeSingle(),
          // Only people in the event's own company (review 15 Nov 2026, section 3 #8); estimators receive no notifications.
          admin.from('profiles').select('id, email, name').in('id', recipientIds).eq('org_id', ev.org_id).eq('is_estimator', false),
        ]);
        const emails = (recipients || []).map((r) => r.email).filter(Boolean);
        if (!emails.length) { await admin.from('site_calendar_events').update({ reminder_sent: true }).eq('id', ev.id); continue; }

        const companyName = org?.name || 'OpHUB';
        const siteName = site?.name || 'Site';
        const brand = org?.color_primary || null;
        const logoUrl = org?.logo_path ? `${SUPABASE_URL}/storage/v1/object/public/org-logos/${org.logo_path}` : null;
        const eventDateLabel = fmtDate(ev.event_date);
        const isDayOf = ev.event_date === today;
        const subject = site?.name ? `Calendar reminder — ${site.name}` : 'Calendar reminder';
        const signoffText = `Kind regards,\n${companyName}`;
        const signoffHtml = `<p style="margin:14px 0 12px;font-size:15px;line-height:1.5;color:#101114;">Kind regards,<br>${ophubEsc(companyName)}</p>`;
        const leadLine = isDayOf ? 'This calendar event is happening today.' : `This calendar event is coming up on ${eventDateLabel}.`;
        const text = `Hi,\n\n${leadLine}\n\nEvent: ${ev.title}\nSite: ${siteName}\nDate: ${eventDateLabel}\n\n${signoffText}\n\nSent via OpHUB.`;
        const html = ophubEmail({
          company: companyName,
          brand,
          logoUrl,
          kicker: site?.name || null,
          title: 'Calendar reminder',
          greeting: 'Hi,',
          intro: leadLine,
          bodyHtml: ophubRows([['Event', ev.title], ['Site', siteName], ['Date', eventDateLabel]]) + signoffHtml,
        });

        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: ophubFrom(FROM_EMAIL, companyName), to: emails, subject, text, html }),
        });
        if (res.ok) sent++; else failed++;
        await admin.from('site_calendar_events').update({ reminder_sent: true }).eq('id', ev.id);
      } catch (_e) { failed++; }
    }

    return new Response(JSON.stringify({ ok: true, sent, failed, events: events.length }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('send-calendar-reminders failed', e);
    return new Response(JSON.stringify({ error: 'Something went wrong.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
