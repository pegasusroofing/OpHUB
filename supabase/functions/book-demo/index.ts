// Public endpoint for the website's "Book a demo" form. verify_jwt is off on
// purpose: visitors have no account. Protected instead by validation, a
// hidden honeypot field, and rate limits (per visitor and overall). Every
// enquiry is saved in demo_requests first, then emailed to the sales inbox,
// so nothing is lost if the email provider has a problem.
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const SALES_INBOX = 'sales@operativehub.co.uk';
const LIMIT_PER_IP_PER_HOUR = 5;
const LIMIT_OVERALL_PER_10_MIN = 30;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const esc = (s: unknown) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max) : '');

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

async function countSince(minutes: number, ip?: string) {
  const since = new Date(Date.now() - minutes * 60000).toISOString();
  let q = supabase.from('demo_requests').select('id', { count: 'exact', head: true }).gte('created_at', since);
  if (ip) q = q.eq('ip', ip);
  const { count, error } = await q;
  if (error) throw error;
  return count || 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    // Honeypot: a real visitor never sees or fills this field. Pretend it worked.
    if (clean(body.website, 200)) return json({ ok: true });

    const name = clean(body.name, 100);
    const company = clean(body.company, 120);
    const email = clean(body.email, 254).toLowerCase();
    const phone = clean(body.phone, 40);
    const team_size = clean(body.team_size, 40);
    const message = clean(body.message, 2000);
    if (!name || !email) return json({ error: 'Please enter your name and email.' }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Enter a valid email address.' }, 400);

    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('cf-connecting-ip') || 'unknown';
    try {
      const [byIp, overall] = await Promise.all([countSince(60, ip), countSince(10)]);
      if (byIp >= LIMIT_PER_IP_PER_HOUR || overall >= LIMIT_OVERALL_PER_10_MIN) {
        return json({ error: 'Too many requests — please try again later, or email sales@operativehub.co.uk.' }, 429);
      }
    } catch (e) {
      console.error('rate limit check failed', e);
      return json({ error: 'The form is temporarily unavailable — please email sales@operativehub.co.uk.' }, 503);
    }

    const { data: row, error: insErr } = await supabase.from('demo_requests').insert({ ip, name, company: company || null, email, phone: phone || null, team_size: team_size || null, message: message || null }).select('id').single();
    if (insErr) {
      console.error('insert failed', insErr);
      return json({ error: 'Could not send your request — please email sales@operativehub.co.uk.' }, 500);
    }

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const rawFrom = Deno.env.get('INVITES_FROM_EMAIL') || Deno.env.get('ORDERS_FROM_EMAIL') || 'reports@ophub.app';
    const m = /<([^>]+)>/.exec(rawFrom);
    const fromAddress = (m ? m[1] : rawFrom).trim();
    if (!RESEND_API_KEY) {
      console.error('RESEND_API_KEY missing - enquiry saved but not emailed', row?.id);
      return json({ ok: true });
    }

    const html = ophubEmail({
      company: 'OpHUB',
      title: 'New demo request',
      greeting: 'Hi,',
      intro: 'Someone has asked for a demo using the Book a demo form on the OpHUB website.',
      bodyHtml: ophubRows([['Name', name], ['Company', company], ['Email', email], ['Phone', phone], ['Team size', team_size]])
        + (message ? `<p style="margin:14px 0 6px;color:#8A8D93;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;">Message</p><div style="background:#F5F4EF;border-radius:10px;padding:12px 14px;font-size:15px;line-height:1.5;color:#101114;white-space:pre-wrap;">${ophubEsc(message)}</div>` : ''),
      note: `Reply to this email to answer ${name} directly.`,
    });
    const text = `New demo request\n\nName: ${name}\nCompany: ${company || '-'}\nEmail: ${email}\nPhone: ${phone || '-'}\nTeam size: ${team_size || '-'}\n\nMessage:\n${message || '-'}\n`;

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: ophubFrom(rawFrom, 'OpHUB'),
        to: [SALES_INBOX],
        reply_to: email,
        subject: `Demo request — ${(company || name).replace(/[\r\n]+/g, ' ')}`,
        html, text,
      }),
    });
    if (emailRes.ok) {
      await supabase.from('demo_requests').update({ emailed: true }).eq('id', row.id);
    } else {
      // Saved in the table either way, so the enquiry is not lost.
      console.error('email failed', await emailRes.text());
    }
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: 'Something went wrong — please email sales@operativehub.co.uk.' }, 500);
  }
});
