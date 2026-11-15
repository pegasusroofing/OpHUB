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

// Fired daily by cron. Every live site is required to issue one Toolbox Talk
// (Bank TBT -> Issue for Signing, or the company-wide issue button) each
// calendar month; from the 7th it's treated as overdue/compulsory. A site
// that already has a COMPLETED TBT with created_at in the current month is
// left alone. A merely 'live' (still unsigned) talk does NOT satisfy this on
// its own unless the site has, at some point, actually completed at least
// one TBT — otherwise a talk could sit live and unsigned indefinitely while
// the monthly reminder wrongly stayed silent.
//
// v3: this used to push a phone notification via FCM. Per the site's own
// explicit request, the monthly TBT reminder is now an EMAIL to the
// responsible PM (or every pm/admin in the org if no one's set as the
// site's owner) instead of a push — a push is easy to swipe away, whereas
// this is a compliance-relevant nudge that should land in an inbox.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const CRON_SECRET = Deno.env.get('CRON_SECRET');
    const provided = req.headers.get('x-cron-secret') || '';
    if (!CRON_SECRET || provided !== CRON_SECRET) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    const now = new Date();
    const [ldY, ldM, ldD] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(now).split('-').map(Number);
    const monthStart = new Date(Date.UTC(ldY, ldM - 1, 1)).toISOString();
    const dayOfMonth = ldD;
    const isOverdue = dayOfMonth > 7;

    const { data: sites } = await admin.from('sites').select('id, org_id, name, status, responsible_pm_id').in('status', ['active', 'live']);
    if (!sites || !sites.length) {
      return new Response(JSON.stringify({ ok: true, checked: 0, emailed: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const FROM_EMAIL = Deno.env.get('INVITES_FROM_EMAIL') || Deno.env.get('ORDERS_FROM_EMAIL') || 'reports@ophub.app';
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ ok: true, checked: sites.length, emailed: 0, reason: 'RESEND_API_KEY not set' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const orgIds = [...new Set(sites.map((s) => s.org_id).filter(Boolean))];
    const { data: orgs } = orgIds.length ? await admin.from('organizations').select('id, name, logo_path, color_primary').in('id', orgIds) : { data: [] as any[] };
    const orgById: Record<string, any> = {};
    (orgs || []).forEach((o) => { orgById[o.id] = o; });

    // Due sites, grouped by whoever the notification should go to (a single
    // PM might have several sites due this month — one email per PM, not
    // one per site) and by org (for the from-name/logo).
    type DueSite = { id: string; name: string; org_id: string; everCompleted: boolean };
    const dueByRecipient: Record<string, { orgId: string; sites: DueSite[] }> = {};
    let checked = 0;

    for (const site of sites) {
      checked++;
      const { data: completedEver } = await admin.from('toolbox_talks').select('id').eq('site_id', site.id).eq('status', 'completed').limit(1);
      const everCompleted = !!(completedEver && completedEver.length);
      if (everCompleted) {
        const { data: talks } = await admin.from('toolbox_talks').select('id').eq('site_id', site.id).eq('status', 'completed').gte('created_at', monthStart).limit(1);
        if (talks && talks.length) continue; // this month's TBT already completed at this site
      }

      let recipientIds: string[] = [];
      if (site.responsible_pm_id) {
        recipientIds = [site.responsible_pm_id];
      } else {
        const { data: pms } = await admin.from('profiles').select('id').eq('org_id', site.org_id).in('role', ['pm', 'admin']);
        recipientIds = (pms || []).map((p: { id: string }) => p.id);
      }
      if (!recipientIds.length) continue;

      for (const rid of recipientIds) {
        if (!dueByRecipient[rid]) dueByRecipient[rid] = { orgId: site.org_id, sites: [] };
        dueByRecipient[rid].sites.push({ id: site.id, name: site.name, org_id: site.org_id, everCompleted });
      }
    }

    const recipientIds = Object.keys(dueByRecipient);
    if (!recipientIds.length) {
      return new Response(JSON.stringify({ ok: true, checked, emailed: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const { data: profiles } = await admin.from('profiles').select('id, name, email').in('id', recipientIds).eq('is_estimator', false); // estimators receive no notifications
    const profileById: Record<string, any> = {};
    (profiles || []).forEach((p) => { profileById[p.id] = p; });

    let emailed = 0;
    for (const rid of recipientIds) {
      const profile = profileById[rid];
      if (!profile || !profile.email) continue;
      const { orgId, sites: dueSites } = dueByRecipient[rid];
      const org = orgById[orgId] || {};
      const companyName = org.name || 'your company';
      const brand = org.color_primary || null;
      const logoUrl = org.logo_path ? `${SUPABASE_URL}/storage/v1/object/public/org-logos/${org.logo_path}` : null;
      const what = isOverdue ? 'Toolbox talk overdue' : 'Toolbox talk due this month';
      const oneSiteName = dueSites.length === 1 && dueSites[0].name ? String(dueSites[0].name) : '';
      const subject = oneSiteName ? `${what} — ${oneSiteName}` : what;
      const firstName = String(profile.name || '').trim().split(/\s+/)[0];
      const greeting = firstName ? `Hi ${firstName},` : 'Hi,';
      const intro = `${dueSites.length} site${dueSites.length===1?'':'s'} still need${dueSites.length===1?'s':''} this month's toolbox talk issued and signed off — compulsory by the 7th of the month.`;
      const noteLine = 'Issue one from Bank TBT on each site listed above and get it signed off by every operative on site.';

      const rowsHtml = dueSites.map((s) => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #EAEAEA;font-size:15px;color:#101114;">
            <span style="font-weight:700;">${ophubEsc(s.name)}</span>
            <div style="margin-top:2px;font-size:13.5px;color:#8A8D93;">${!s.everCompleted ? 'No toolbox talk has ever been completed here' : isOverdue ? 'Overdue — compulsory by the 7th' : 'Not yet issued this month'}</div>
          </td>
        </tr>`).join('');

      const text = `${greeting}\n\n${intro}\n\n` +
        dueSites.map((s) => `- ${s.name}: ${!s.everCompleted ? 'no toolbox talk ever completed' : isOverdue ? 'overdue' : 'due this month'}`).join('\n') +
        `\n\n${noteLine}\n\nSent via OpHUB - ${org.name || 'OpHUB'}`;

      const html = ophubEmail({
        company: org.name || null,
        brand,
        logoUrl,
        kicker: oneSiteName || null,
        title: what,
        greeting,
        intro,
        bodyHtml: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 12px;">${rowsHtml}</table>`,
        note: noteLine,
      });

      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: ophubFrom(FROM_EMAIL, companyName), to: [profile.email], subject, text, html }),
        });
        if (res.ok) emailed++;
      } catch (_e) { /* skip this recipient, keep going */ }
    }

    return new Response(JSON.stringify({ ok: true, checked, emailed }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
