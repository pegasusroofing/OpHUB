import { createClient } from 'npm:@supabase/supabase-js@2';

// Weekly driver hours summary, emailed to each company's admin(s).
// Fired by cron every Friday at 13:00 AND 14:00 UTC; it only sends when it
// is 2pm in London, so it lands at 2pm UK time in summer and winter.
// Covers the 7 days ending today (Saturday to Friday). For each driver and
// each day: first check-in, last check-out, time on duty, breaks taken and
// hours worked (on duty minus breaks), with a weekly total.
// verify_jwt is off; the cron secret header is checked instead (same as the
// other scheduled functions). Body options, for testing with the secret:
//   { "force": true }   - ignore the 2pm check
//   { "dry_run": true } - work everything out and return it, send nothing
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const TZ = 'Europe/London';

function londonParts(d: Date) {
  const p: Record<string, string> = {};
  new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' }).formatToParts(d).forEach((x) => { p[x.type] = x.value; });
  return { key: `${p.year}-${p.month}-${p.day}`, hour: parseInt(p.hour, 10) % 24, time: `${String(parseInt(p.hour, 10) % 24).padStart(2, '0')}:${p.minute}`, weekday: p.weekday };
}
const hm = (mins: number) => `${Math.floor(mins / 60)}h ${String(Math.round(mins) % 60).padStart(2, '0')}m`;
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const CRON_SECRET = Deno.env.get('CRON_SECRET');
    if (!CRON_SECRET || (req.headers.get('x-cron-secret') || '') !== CRON_SECRET) return json({ error: 'Forbidden' }, 403);
    const body = await req.json().catch(() => ({}));
    const force = body?.force === true, dryRun = body?.dry_run === true;

    const now = new Date();
    const nowL = londonParts(now);
    if (!force && !dryRun && !(nowL.weekday === 'Fri' && nowL.hour === 14)) return json({ ok: true, skipped: 'not Friday 2pm in London', london: nowL });

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { autoRefreshToken: false, persistSession: false } });

    // The 7 London days ending today, oldest first.
    const days: { key: string; label: string }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      const key = londonParts(d).key;
      if (!days.some((x) => x.key === key)) days.push({ key, label: new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', day: '2-digit', month: 'short' }).format(d) });
    }
    const since = new Date(now.getTime() - 8 * 86400000).toISOString();

    const { data: drivers } = await admin.from('profiles').select('id, org_id, name').eq('role', 'driver');
    if (!drivers || !drivers.length) return json({ ok: true, orgs: 0, emailed: 0 });
    const orgIds = [...new Set(drivers.map((d) => d.org_id).filter(Boolean))];

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const FROM_EMAIL = Deno.env.get('INVITES_FROM_EMAIL') || Deno.env.get('ORDERS_FROM_EMAIL') || 'reports@ophub.app';
    let emailed = 0;
    const preview: any[] = [];

    for (const orgId of orgIds) {
      const orgDrivers = drivers.filter((d) => d.org_id === orgId).sort((a, b) => String(a.name).localeCompare(String(b.name)));
      const [{ data: checks }, { data: breaks }, { data: org }, { data: admins }] = await Promise.all([
        admin.from('driver_checkins').select('user_id, type, ts').eq('org_id', orgId).gte('ts', since).order('ts', { ascending: true }).limit(5000),
        admin.from('driver_breaks').select('user_id, started_at, ended_at').eq('org_id', orgId).gte('started_at', since).order('started_at', { ascending: true }).limit(5000),
        admin.from('organizations').select('name, logo_path, color_primary').eq('id', orgId).maybeSingle(),
        admin.from('profiles').select('id, name, email').eq('org_id', orgId).eq('role', 'admin'),
      ]);

      const report = orgDrivers.map((drv) => {
        const mine = (checks || []).filter((c) => c.user_id === drv.id);
        const myBreaks = (breaks || []).filter((b) => b.user_id === drv.id);
        // Shifts: each check-in paired with the next check-out. A shift belongs to the day it started.
        const shifts: { start: Date; end: Date | null }[] = [];
        let open: Date | null = null;
        mine.forEach((c) => {
          if (c.type === 'in') { if (open) shifts.push({ start: open, end: null }); open = new Date(c.ts); }
          else if (c.type === 'out' && open) { shifts.push({ start: open, end: new Date(c.ts) }); open = null; }
        });
        if (open) shifts.push({ start: open, end: null });

        let weekDuty = 0, weekBreak = 0, daysWorked = 0;
        const rows = days.map((day) => {
          const dayShifts = shifts.filter((s) => londonParts(s.start).key === day.key);
          if (!dayShifts.length) return { ...day, first: '', last: '', duty: 0, brk: 0, worked: 0, note: '' };
          let duty = 0, note = '';
          dayShifts.forEach((s) => {
            if (s.end) duty += Math.max(0, (s.end.getTime() - s.start.getTime()) / 60000);
            else if (day.key === nowL.key) { duty += Math.max(0, (now.getTime() - s.start.getTime()) / 60000); note = 'Still on duty when this was sent'; }
            else note = 'No check-out recorded';
          });
          let brk = 0;
          myBreaks.filter((b) => londonParts(new Date(b.started_at)).key === day.key).forEach((b) => {
            const st = new Date(b.started_at).getTime();
            // A break left open is counted up to the end of that shift (or now, if still on duty today).
            const sh = dayShifts.find((s) => st >= s.start.getTime() && (!s.end || st <= s.end.getTime()));
            const en = b.ended_at ? new Date(b.ended_at).getTime() : (sh && sh.end ? sh.end.getTime() : (day.key === nowL.key ? now.getTime() : st));
            brk += Math.max(0, (en - st) / 60000);
          });
          duty = Math.round(duty); brk = Math.min(duty, Math.round(brk));
          const lastEnd = dayShifts.map((s) => s.end).filter(Boolean).pop() as Date | undefined;
          weekDuty += duty; weekBreak += brk; daysWorked++;
          return { ...day, first: londonParts(dayShifts[0].start).time, last: lastEnd ? londonParts(lastEnd).time : '', duty, brk, worked: duty - brk, note };
        });
        return { name: drv.name, rows, weekDuty, weekBreak, weekWorked: weekDuty - weekBreak, daysWorked };
      });

      const companyName = org?.name || 'your company';
      const brand = org?.color_primary || '#4E8FD1';
      const logoUrl = org?.logo_path ? `${SUPABASE_URL}/storage/v1/object/public/org-logos/${org.logo_path}` : null;
      const range = `${days[0].label} – ${days[days.length - 1].label}`;
      preview.push({ org: companyName, range, admins: (admins || []).length, drivers: report });
      if (dryRun) continue;
      if (!RESEND_API_KEY || !admins || !admins.length) continue;

      const th = 'padding:8px 6px;font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#8A8D93;text-align:left;border-bottom:2px solid #EAEAEA;';
      const td = 'padding:8px 6px;font-size:13.5px;color:#101114;border-bottom:1px solid #EFEFEF;';
      const driversHtml = report.map((r) => `
        <p style="margin:22px 0 6px;font-size:16px;font-weight:800;color:#101114;">${ophubEsc(r.name)} <span style="font-weight:400;color:#8A8D93;font-size:13px;">&middot; ${r.daysWorked} day${r.daysWorked === 1 ? '' : 's'}</span></p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <tr><th style="${th}">Day</th><th style="${th}">In</th><th style="${th}">Out</th><th style="${th}">Breaks</th><th style="${th}text-align:right;">Worked</th></tr>
          ${r.rows.map((d) => d.first ? `<tr><td style="${td}">${ophubEsc(d.label)}${d.note ? `<div style="font-size:11.5px;color:#B0740F;">${ophubEsc(d.note)}</div>` : ''}</td><td style="${td}">${d.first}</td><td style="${td}">${d.last || '&mdash;'}</td><td style="${td}">${d.brk ? hm(d.brk) : '&mdash;'}</td><td style="${td}text-align:right;font-weight:700;">${hm(d.worked)}</td></tr>` : `<tr><td style="${td}color:#8A8D93;">${ophubEsc(d.label)}</td><td style="${td}color:#8A8D93;" colspan="4">Not checked in</td></tr>`).join('')}
          <tr><td style="padding:10px 6px;font-size:13.5px;font-weight:800;color:#101114;" colspan="3">Week total</td><td style="padding:10px 6px;font-size:13.5px;color:#101114;">${r.weekBreak ? hm(r.weekBreak) : '&mdash;'}</td><td style="padding:10px 6px;font-size:15px;font-weight:800;text-align:right;color:${brand};">${hm(r.weekWorked)}</td></tr>
        </table>`).join('');
      const text = `Driver hours — ${range}\n\n` + report.map((r) => `${r.name}: ${hm(r.weekWorked)} worked over ${r.daysWorked} day(s)` + (r.weekBreak ? ` (breaks ${hm(r.weekBreak)})` : '') + '\n' + r.rows.filter((d) => d.first).map((d) => `  ${d.label}: ${d.first}-${d.last || '?'}  breaks ${d.brk ? hm(d.brk) : '0'}  worked ${hm(d.worked)}${d.note ? '  (' + d.note + ')' : ''}`).join('\n')).join('\n\n');

      for (const person of admins) {
        if (!person.email) continue;
        const firstName = String(person.name || '').trim().split(/\s+/)[0];
        const html = ophubEmail({
          company: companyName, brand, logoUrl,
          title: 'Driver hours this week',
          greeting: firstName ? `Hi ${firstName},` : 'Hi,',
          intro: `Here are the driver hours for ${range}. Worked time is time checked in, less any breaks logged.`,
          bodyHtml: driversHtml,
          note: "Sent automatically every Friday at 2pm, so Friday's figures only run up to then. The full log is in OpHUB under Admin Centre › Driver Check-In Log.",
        });
        try {
          const res = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: ophubFrom(FROM_EMAIL, companyName), to: [person.email], subject: `Driver hours — ${range}`, text, html }) });
          if (res.ok) emailed++; else console.error('email failed', await res.text());
        } catch (e) { console.error(e); }
      }
    }
    return json(dryRun ? { ok: true, dry_run: true, london: nowL, preview } : { ok: true, orgs: orgIds.length, emailed });
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});
