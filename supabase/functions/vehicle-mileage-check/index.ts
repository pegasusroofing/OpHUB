import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, cache-control, pragma',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// ---- OpHUB standard email layout (identical in every function — do not edit per function) ----
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
function ophubRows(rows: [string, unknown][]): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:4px 0 12px;">${rows.filter((r) => r[1] != null && String(r[1]) !== '').map((r) => `<tr><td style="padding:6px 14px 6px 0;color:#8A8D93;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;vertical-align:top;white-space:nowrap;">${ophubEsc(r[0])}</td><td style="padding:6px 0;font-size:15px;font-weight:700;color:#101114;">${ophubEsc(r[1])}</td></tr>`).join('')}</table>`;
}
// ---- end OpHUB standard email layout ----

const SERVICE_INTERVAL = 10000;

// #(vehicle-mileage-check) Called by the driver's app right after a weekly
// vehicle checklist is submitted. Reads the driver's latest submitted
// checklist (nothing in the request is trusted), keeps a running mileage per
// vehicle registration, and once a vehicle has done 10,000 miles since its
// last health check emails every PM and admin in the company, once per
// 10,000-mile cycle. A manager marks the health check done in the app, which
// resets the starting mileage.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'Not authenticated' }, 401);
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await callerClient.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: 'Not authenticated' }, 401);
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: driver } = await admin.from('profiles').select('id, org_id, name, role').eq('id', userData.user.id).maybeSingle();
    if (!driver || !driver.org_id) return json({ error: 'Forbidden' }, 403);

    const { data: rows } = await admin.from('vehicle_checklists').select('id, vehicle_reg, mileage, submitted_at').eq('driver_id', driver.id).eq('status', 'submitted').order('submitted_at', { ascending: false }).limit(1);
    const last = rows && rows[0];
    if (!last || !last.vehicle_reg || last.mileage == null) return json({ ok: true, reason: 'no mileage' });
    if (Date.now() - new Date(last.submitted_at).getTime() > 30 * 60 * 1000) return json({ ok: true, reason: 'not recent' });
    const reg = String(last.vehicle_reg).toUpperCase().replace(/\s+/g, '');
    const miles = Number(last.mileage);
    if (!reg || !Number.isFinite(miles) || miles < 0) return json({ ok: true, reason: 'bad data' });

    const { data: st } = await admin.from('vehicle_service_status').select('*').eq('org_id', driver.org_id).eq('vehicle_reg', reg).maybeSingle();
    if (!st) {
      await admin.from('vehicle_service_status').insert({ org_id: driver.org_id, vehicle_reg: reg, baseline_miles: miles, last_miles: miles, updated_at: new Date().toISOString() });
      return json({ ok: true, started: true });
    }
    const baseline = st.baseline_miles == null ? miles : st.baseline_miles;
    const since = miles - baseline;
    const due = since >= SERVICE_INTERVAL && (st.last_reminder_miles == null || st.last_reminder_miles < baseline + SERVICE_INTERVAL);
    await admin.from('vehicle_service_status').update({ last_miles: miles, baseline_miles: baseline, updated_at: new Date().toISOString(), ...(due ? { last_reminder_miles: miles } : {}) }).eq('org_id', driver.org_id).eq('vehicle_reg', reg);
    if (!due) return json({ ok: true, since });

    const { data: recipients } = await admin.from('profiles').select('id, name, email').eq('org_id', driver.org_id).in('role', ['pm', 'admin']).eq('notify_off', false);
    const { data: org } = await admin.from('organizations').select('name, logo_path, color_primary').eq('id', driver.org_id).maybeSingle();
    const logoUrl = org?.logo_path ? `${SUPABASE_URL}/storage/v1/object/public/org-logos/${org.logo_path}` : null;
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const FROM_EMAIL = Deno.env.get('ORDERS_FROM_EMAIL') || 'notifications@ophub.app';
    let sent = 0;
    const fmt = (n: number) => n.toLocaleString('en-GB');
    for (const person of (recipients || [])) {
      if (!RESEND_API_KEY || !person.email) continue;
      try {
        const firstName = String(person.name || '').trim().split(/\s+/)[0];
        const title = 'Vehicle health check required';
        const intro = `${last.vehicle_reg} has done ${fmt(since)} miles since its last health check, so a vehicle health check is now due.`;
        const note = 'Once the health check is done, mark it as done in OpHUB under Deliveries › Vehicle health checks to restart the 10,000-mile count.';
        const html = ophubEmail({ company: org?.name, brand: org?.color_primary, logoUrl, title, greeting: firstName ? `Hi ${firstName},` : 'Hi,', intro,
          bodyHtml: ophubRows([['Vehicle', last.vehicle_reg], ['Mileage now', fmt(miles)], ['Since last health check', fmt(since) + ' miles'], ['Reported by', driver.name]]), note });
        const text = `${firstName ? 'Hi ' + firstName + ',' : 'Hi,'}\n\n${intro}\n\nMileage now: ${fmt(miles)}\nReported by: ${driver.name}\n\n${note}`;
        const res = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: ophubFrom(FROM_EMAIL, org?.name || ''), to: [person.email], subject: `${title} — ${last.vehicle_reg} (${fmt(since)} miles)`, text, html }) });
        if (res.ok) sent++;
      } catch (_e) { /* best effort */ }
    }
    return json({ ok: true, due: true, emailed: sent });
  } catch (e) {
    console.error(e);
    return json({ error: 'Something went wrong' }, 500);
  }
});
