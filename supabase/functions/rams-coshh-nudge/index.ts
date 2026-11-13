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
function resignCycleStart(doc: { resign_cycle_start?: string; uploaded_at: string }) {
  return doc.resign_cycle_start || doc.uploaded_at;
}
// Mirrors filterCurrentCycleSigs on the client (app.html) — every site
// reaching this function is already live, so the resign-cycle filter always
// applies (a closed site never gets here in the first place).
function filterCurrentCycleSigs(sigs: any[], docs: any[], docKeyField: string) {
  const cycleStart: Record<string, Date> = {};
  docs.forEach((d) => { cycleStart[d.id] = new Date(resignCycleStart(d)); });
  return sigs.filter((s) => new Date(s.signed_at) >= (cycleStart[s[docKeyField]] || new Date(0)));
}

// Daily cron. A PM-facing nudge that RAMS/COSHH sign-off is falling behind
// once a site has actually started work (this deliberately does NOT fire
// before that — nobody's expected to have signed anything on a site that
// hasn't started). Two audiences:
//   1. Each responsible PM (or every pm/admin on a site with none set) gets
//      an email listing which of THEIR sites still have RAMS/COSHH
//      outstanding.
//   2. Every company admin gets one combined "H&S policy" digest covering
//      every live, started site across the whole org — the org-wide
//      oversight view a PM's own email doesn't need.
// A company with organizations.morning_emails_off set gets none of it (Andy, 13 Nov 2026: the Sandbox company).
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

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const FROM_EMAIL = Deno.env.get('INVITES_FROM_EMAIL') || Deno.env.get('ORDERS_FROM_EMAIL') || 'reports@ophub.app';
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ ok: true, checked: 0, pmEmailed: 0, adminEmailed: 0, reason: 'RESEND_API_KEY not set' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: allSites } = await admin.from('sites').select('id, org_id, name, status, responsible_pm_id').in('status', ['active', 'live']);
    // Companies that have the morning emails switched off are left out altogether.
    const { data: quiet } = await admin.from('organizations').select('id').eq('morning_emails_off', true);
    const quietIds = new Set((quiet || []).map((o: any) => o.id));
    const sites = (allSites || []).filter((s: any) => !quietIds.has(s.org_id));
    if (!sites || !sites.length) {
      return new Response(JSON.stringify({ ok: true, checked: 0, pmEmailed: 0, adminEmailed: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    type SiteResult = { id: string; name: string; org_id: string; rams: number; coshh: number };
    const results: SiteResult[] = [];

    for (const site of sites) {
      // "SOW started" — at least one Schedule of Works task has moved off
      // 'todo'. Before that, nobody's expected to have signed anything yet.
      const { data: startedTasks } = await admin.from('schedule_tasks').select('id').eq('site_id', site.id).neq('status', 'todo').limit(1);
      if (!startedTasks || !startedTasks.length) continue;

      const { data: assignments } = await admin.from('site_assignments').select('user_id').eq('site_id', site.id);
      const rosterIds = (assignments || []).map((a: any) => a.user_id);
      if (!rosterIds.length) continue;
      const { data: rosterProfiles } = await admin.from('profiles').select('id, role').in('id', rosterIds);
      const allRoster = (rosterProfiles || []).map((p: any) => p.id);
      const operativeRoster = (rosterProfiles || []).filter((p: any) => p.role === 'operative').map((p: any) => p.id);

      const { data: ramsDocs } = await admin.from('rams_docs').select('id, uploaded_at, resign_cycle_start').eq('site_id', site.id).eq('status', 'current');
      const { data: coshhDocs } = await admin.from('coshh_docs').select('id, uploaded_at, resign_cycle_start').eq('site_id', site.id);

      let ramsMissing = 0;
      if (ramsDocs && ramsDocs.length && allRoster.length) {
        const ids = ramsDocs.map((d: any) => d.id);
        const { data: sigsRaw } = await admin.from('rams_signatures').select('rams_id, user_id, signed_at').in('rams_id', ids);
        const sigs = filterCurrentCycleSigs(sigsRaw || [], ramsDocs, 'rams_id');
        const signedByDoc: Record<string, Set<string>> = {};
        sigs.forEach((s: any) => { (signedByDoc[s.rams_id] = signedByDoc[s.rams_id] || new Set()).add(s.user_id); });
        ramsDocs.forEach((d: any) => { ramsMissing += allRoster.filter((uid) => !(signedByDoc[d.id] || new Set()).has(uid)).length; });
      }

      let coshhMissing = 0;
      // #237/#327: PMs/admins structurally can't sign COSHH — only operatives
      // count in that roster, same rule the client applies.
      if (coshhDocs && coshhDocs.length && operativeRoster.length) {
        const ids = coshhDocs.map((d: any) => d.id);
        const { data: sigsRaw } = await admin.from('coshh_signatures').select('coshh_id, user_id, signed_at').in('coshh_id', ids);
        const sigs = filterCurrentCycleSigs(sigsRaw || [], coshhDocs, 'coshh_id');
        const signedByDoc: Record<string, Set<string>> = {};
        sigs.forEach((s: any) => { (signedByDoc[s.coshh_id] = signedByDoc[s.coshh_id] || new Set()).add(s.user_id); });
        coshhDocs.forEach((d: any) => { coshhMissing += operativeRoster.filter((uid) => !(signedByDoc[d.id] || new Set()).has(uid)).length; });
      }

      if (ramsMissing > 0 || coshhMissing > 0) {
        results.push({ id: site.id, name: site.name, org_id: site.org_id, rams: ramsMissing, coshh: coshhMissing });
      }
    }

    if (!results.length) {
      return new Response(JSON.stringify({ ok: true, checked: sites.length, pmEmailed: 0, adminEmailed: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const siteById: Record<string, any> = {}; sites.forEach((s) => { siteById[s.id] = s; });
    const orgIds = [...new Set(sites.map((s) => s.org_id).filter(Boolean))];
    const { data: orgs } = orgIds.length ? await admin.from('organizations').select('id, name, logo_path, color_primary').in('id', orgIds) : { data: [] as any[] };
    const orgById: Record<string, any> = {}; (orgs || []).forEach((o) => { orgById[o.id] = o; });

    // --- PM-facing digests: one email per PM, listing only their own sites ---
    const dueByPm: Record<string, SiteResult[]> = {};
    for (const r of results) {
      const site = siteById[r.id];
      let recipientIds: string[] = [];
      if (site.responsible_pm_id) {
        recipientIds = [site.responsible_pm_id];
      } else {
        const { data: pms } = await admin.from('profiles').select('id').eq('org_id', site.org_id).in('role', ['pm', 'admin']);
        recipientIds = (pms || []).map((p: any) => p.id);
      }
      recipientIds.forEach((rid) => { (dueByPm[rid] = dueByPm[rid] || []).push(r); });
    }

    function siteBits(r: SiteResult) {
      const bits = [];
      if (r.rams) bits.push(`${r.rams} RAMS signature${r.rams === 1 ? '' : 's'} outstanding`);
      if (r.coshh) bits.push(`${r.coshh} COSHH signature${r.coshh === 1 ? '' : 's'} outstanding`);
      return bits;
    }
    function siteRowHtml(r: SiteResult) {
      return `<tr><td style="padding:10px 0;border-bottom:1px solid #EAEAEA;font-size:15px;color:#101114;"><span style="font-weight:700;">${ophubEsc(r.name)}</span><div style="margin-top:2px;font-size:13.5px;color:#8A8D93;">${ophubEsc(siteBits(r).join(' · '))}</div></td></tr>`;
    }
    const digestNote = 'Get these signed off on site as soon as possible. Work has already started.';
    function firstNameOf(name: unknown) {
      return String(name || '').trim().split(/\s+/)[0] || '';
    }
    function digestEmail(org: any, title: string, recipientName: unknown, intro: string, rows: SiteResult[]) {
      const first = firstNameOf(recipientName);
      const greeting = first ? `Hi ${first},` : 'Hi,';
      const html = ophubEmail({
        company: org.name || null,
        brand: org.color_primary || null,
        logoUrl: org.logo_path ? `${SUPABASE_URL}/storage/v1/object/public/org-logos/${org.logo_path}` : null,
        kicker: rows.length === 1 ? rows[0].name : null,
        title,
        greeting,
        intro,
        bodyHtml: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 12px;">${rows.map(siteRowHtml).join('')}</table>`,
        note: digestNote,
      });
      const text = [greeting, '', intro, '', ...rows.map((r) => `- ${r.name}: ${siteBits(r).join(', ')}`), '', digestNote, '', `Sent via OpHUB · ${org.name || 'OpHUB'}`].join('\n');
      return { html, text };
    }

    const pmIds = Object.keys(dueByPm);
    const { data: pmProfiles } = pmIds.length ? await admin.from('profiles').select('id, name, email').in('id', pmIds).eq('is_estimator', false) : { data: [] as any[] }; // estimators receive no notifications
    const pmProfileById: Record<string, any> = {}; (pmProfiles || []).forEach((p) => { pmProfileById[p.id] = p; });

    let pmEmailed = 0;
    for (const pid of pmIds) {
      const profile = pmProfileById[pid];
      if (!profile || !profile.email) continue;
      const rows = dueByPm[pid];
      const org = orgById[rows[0].org_id] || {};
      const companyName = org.name || 'your company';
      const { html, text } = digestEmail(org, 'RAMS and COSHH sign-off outstanding', profile.name,
        `Work has started on ${rows.length} site${rows.length === 1 ? '' : 's'} of yours where RAMS and/or COSHH is not yet fully signed off by the operatives on site.`, rows);
      const subject = rows.length === 1 ? `RAMS/COSHH sign-off outstanding — ${rows[0].name}` : 'RAMS/COSHH sign-off outstanding';
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: ophubFrom(FROM_EMAIL, companyName), to: [profile.email], subject, html, text }),
        });
        if (res.ok) pmEmailed++;
      } catch (_e) { /* keep going */ }
    }

    // --- Admin-facing org-wide "H&S policy" digest — one per org, to every admin in it ---
    const resultsByOrg: Record<string, SiteResult[]> = {};
    results.forEach((r) => { (resultsByOrg[r.org_id] = resultsByOrg[r.org_id] || []).push(r); });

    let adminEmailed = 0;
    for (const orgId of Object.keys(resultsByOrg)) {
      const { data: admins } = await admin.from('profiles').select('id, name, email').eq('org_id', orgId).eq('role', 'admin');
      if (!admins || !admins.length) continue;
      const org = orgById[orgId] || {};
      const companyName = org.name || 'your company';
      const rows = resultsByOrg[orgId];
      const subject = rows.length === 1 ? `H&S policy sign-off outstanding — ${rows[0].name}` : 'H&S policy sign-off outstanding';
      for (const a of admins) {
        if (!a.email) continue;
        const { html, text } = digestEmail(org, 'H&S policy sign-off outstanding', a.name,
          `Company-wide health and safety check: ${rows.length} live site${rows.length === 1 ? '' : 's'} where work has started but RAMS and/or COSHH is not yet fully signed off.`, rows);
        try {
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: ophubFrom(FROM_EMAIL, companyName), to: [a.email], subject, html, text }),
          });
          if (res.ok) adminEmailed++;
        } catch (_e) { /* keep going */ }
      }
    }

    return new Response(JSON.stringify({ ok: true, checked: sites.length, flagged: results.length, pmEmailed, adminEmailed }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
