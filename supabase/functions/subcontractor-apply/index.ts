import { createClient } from 'npm:@supabase/supabase-js@2';

// Public subcontractor sign-up form (subcontractor.html?org=<id>).
// No login: this function is the only way in. Three actions:
//   org    — company name/logo/colour to brand the form
//   upload — signed upload slots for the documents (insurance etc.)
//   submit — saves the application and emails the company's admins/PMs
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clip = (v: unknown, n = 300) => String(v == null ? '' : v).replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, n);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { autoRefreshToken: false, persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const orgId = String(body?.org || '');
    if (!UUID.test(orgId)) return json({ error: 'This sign-up link is not valid.' }, 400);
    const { data: org } = await admin.from('organizations').select('id, name, logo_path, color_primary').eq('id', orgId).maybeSingle();
    if (!org) return json({ error: 'This sign-up link is not valid.' }, 404);
    const logoUrl = org.logo_path ? `${SUPABASE_URL}/storage/v1/object/public/org-logos/${org.logo_path}` : null;

    if (body.action === 'org') return json({ name: org.name, logo: logoUrl, colour: org.color_primary || null });

    // Simple per-IP rate limit (stops the public form being used to spam
    // uploads or emails).
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('cf-connecting-ip') || 'unknown';
    const hitsSince = async (action: string, mins: number) => {
      const { count } = await admin.from('subcontractor_apply_hits').select('id', { count: 'exact', head: true })
        .eq('ip', ip).eq('action', action).gte('created_at', new Date(Date.now() - mins * 60000).toISOString());
      return count || 0;
    };
    const KEY_RE = /^[a-z0-9-]{8,40}$/i;

    if (body.action === 'upload') {
      const key = String(body.key || '');
      if (!KEY_RE.test(key)) return json({ error: 'Bad request' }, 400);
      if (await hitsSince('upload', 60) >= 20) return json({ error: 'Too many uploads from this connection — please try again in an hour.' }, 429);
      const files = Array.isArray(body.files) ? body.files.slice(0, 20) : [];
      const out = [];
      for (const f of files) {
        const name = clip(f?.name, 120).replace(/[^a-z0-9.\-]+/gi, '_') || 'file';
        const size = Number(f?.size || 0);
        if (size > 25 * 1024 * 1024) return json({ error: `"${f?.name}" is bigger than 25MB.` }, 400);
        // Private bucket with a 25MB cap and PDF/image/Word types only.
        const path = `${orgId}/${key}/${crypto.randomUUID()}-${name}`;
        const { data, error } = await admin.storage.from('subcontractor-apps').createSignedUploadUrl(path);
        if (error || !data) return json({ error: 'Could not prepare the upload — please try again.' }, 500);
        out.push({ path, token: data.token, signedUrl: data.signedUrl });
      }
      await admin.from('subcontractor_apply_hits').insert({ ip, org_id: orgId, action: 'upload', app_key: key, paths: out.map((o) => o.path) });
      return json({ uploads: out });
    }

    if (body.action === 'submit') {
      if (body.website) return json({ ok: true }); // honeypot
      if (await hitsSince('submit', 60) >= 5) return json({ error: 'Too many forms sent from this connection — please try again later.' }, 429);
      const d = body.data || {};
      const company = clip(d.company_name, 160), contact = clip(d.contact_name, 120), email = clip(d.email, 160).toLowerCase();
      if (!company || !contact || !EMAIL.test(email)) return json({ error: 'Please fill in the company name, your name and a valid email.' }, 400);
      if (!clip(body.signed_name, 120) || !body.agree) return json({ error: 'Please tick the declaration and type your name to sign.' }, 400);
      // Only files this function itself issued upload slots for are accepted.
      const key = String(body.key || '');
      let issued = new Set<string>();
      if (KEY_RE.test(key)) {
        const { data: hits } = await admin.from('subcontractor_apply_hits').select('paths').eq('app_key', key).eq('action', 'upload').eq('org_id', orgId);
        issued = new Set((hits || []).flatMap((h: any) => h.paths || []));
      }
      const files = (Array.isArray(body.files) ? body.files : []).filter((f: any) => f && typeof f.path === 'string' && issued.has(f.path))
        .slice(0, 20).map((f: any) => ({ label: clip(f.label, 80), name: clip(f.name, 160), path: f.path, bucket: 'subcontractor-apps' }));
      // Keep the answers as plain text/arrays, clipped.
      const clean: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(d).slice(0, 60)) {
        if (!/^[a-z_]{2,40}$/.test(k)) continue;
        if (Array.isArray(v)) clean[k] = v.slice(0, 60).map((x) => (x && typeof x === 'object') ? Object.fromEntries(Object.entries(x).slice(0, 8).map(([a, b]) => [clip(a, 30), clip(b, 160)])) : clip(x, 160));
        else clean[k] = clip(v, 2000);
      }
      const { data: row, error } = await admin.from('subcontractor_applications').insert({
        org_id: orgId, company_name: company, contact_name: contact, email, phone: clip(d.phone, 40) || null,
        data: clean, files, signed_name: clip(body.signed_name, 120),
      }).select('id').single();
      if (error || !row) return json({ error: 'Could not save your form — please try again.' }, 500);
      await admin.from('subcontractor_apply_hits').insert({ ip, org_id: orgId, action: 'submit', app_key: key });

      // Tell the company's admins and PMs.
      const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
      const FROM_EMAIL = Deno.env.get('INVITES_FROM_EMAIL') || Deno.env.get('ORDERS_FROM_EMAIL') || 'reports@ophub.app';
      if (RESEND_API_KEY) {
        const { data: people } = await admin.from('profiles').select('email, role').eq('org_id', orgId).in('role', ['admin', 'pm']);
        const to = (people || []).map((p: any) => p.email).filter((e: string) => e && EMAIL.test(e)).slice(0, 20);
        if (to.length) {
          const html = ophubEmail({ company: org.name, brand: org.color_primary, logoUrl, kicker: 'Subcontractor sign-up', title: 'New subcontractor application',
            greeting: 'Hi,', intro: `${company} has filled in your subcontractor sign-up form.`,
            bodyHtml: ophubRows([['Company', company], ['Contact', contact], ['Email', email], ['Phone', clip(d.phone, 40)], ['Trades', Array.isArray(d.trades) ? (d.trades as unknown[]).join(', ') : clip(d.trades, 200)], ['Documents', String(files.length)]]),
            button: { label: 'Open in OpHUB', url: 'https://www.operativehub.co.uk/app.html#/subapplications' } });
          await fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: ophubFrom(FROM_EMAIL, org.name), to, subject: `New subcontractor application — ${company}`, html, text: `${company} has filled in your subcontractor sign-up form. Contact: ${contact} (${email}). Open OpHUB › Admin › Subcontractor applications.` }) }).catch(() => {});
        }
        // And a copy to the applicant.
        await fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: ophubFrom(FROM_EMAIL, org.name), to: [email], subject: `Thanks — your application to ${org.name}`,
            html: ophubEmail({ company: org.name, brand: org.color_primary, logoUrl, kicker: 'Subcontractor sign-up', title: 'Application received', greeting: `Hi ${contact},`, intro: `Thanks for filling in the subcontractor form for ${org.name}. They'll be in touch.` }),
            text: `Thanks for filling in the subcontractor form for ${org.name}. They'll be in touch.` }) }).catch(() => {});
      }
      return json({ ok: true, id: row.id });
    }
    return json({ error: 'Bad request' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: 'Something went wrong — please try again.' }, 500);
  }
});
