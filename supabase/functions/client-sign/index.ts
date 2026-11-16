// Client signing for RAMS documents - lets someone with NO OpHUB account sign
// a document through a private emailed link.
//
// verify_jwt is off because two of the three actions are used by the client,
// who has no login. Each action checks what it needs itself:
//   request - a signed-in manager asks for a document to be sent to a client.
//             The caller's login token is verified here and they must be a
//             manager in the company that owns the document.
//   info    - the client's page asks what it is being asked to sign. Needs
//             the private token from the emailed link. The document comes
//             back as a 2-hour signed link (16 Nov 2026; was a public link).
//   sign    - the client submits their name and drawn signature. Needs the
//             same token; works once; the time and IP address are recorded.
// Only a SHA-256 hash of the token is stored, so the link cannot be rebuilt
// from the database. Links expire after 30 days.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, cache-control, pragma',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const esc = (s: unknown) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001F]/g, ' ').trim().slice(0, max) : '');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
function newToken() {
  const a = new Uint8Array(32);
  crypto.getRandomValues(a);
  return Array.from(a).map((b) => b.toString(16).padStart(2, '0')).join('');
}
function fromAddress() {
  const raw = Deno.env.get('INVITES_FROM_EMAIL') || Deno.env.get('ORDERS_FROM_EMAIL') || 'reports@ophub.app';
  const m = /<([^>]+)>/.exec(raw);
  return (m ? m[1] : raw).trim();
}
async function sendEmail(payload: Record<string, unknown>) {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) return { ok: false, error: 'Email sending is not configured.' };
  const res = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!res.ok) return { ok: false, error: await res.text() };
  return { ok: true };
}
async function loadByToken(token: string) {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const { data } = await admin.from('rams_client_signatures').select('*').eq('token_hash', await sha256Hex(token)).maybeSingle();
  return data || null;
}
// ---- OpHUB private file storage (16 Nov 2026) ----
// rams-docs is being made private. The client's page gets the document as a
// short-lived signed link made here with the service role (works whether the
// bucket is public or private); the page asks for a fresh one every time it
// opens. Only a file in a folder of the company that sent the request is ever
// signed, and only while the request can still be signed.
const DOC_LINK_SECONDS = 2 * 3600;
const UUID_SEG = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// True only for a path in one of this company's own folders: <company>/...,
// <word>/<company>/..., <job of this company>/... or <person in this
// company>/... Anything else (another company's file, a path with no company
// in it, a path that climbs out of its folder) is refused.
async function pathInCompany(orgId: unknown, path: unknown): Promise<boolean> {
  const p = String(path || '');
  const org = String(orgId || '').toLowerCase();
  if (!p || !org || p.startsWith('/') || p.includes('\\') || /[\u0000-\u001f]/.test(p)) return false;
  const segs = p.split('/');
  if (segs.length < 2 || segs.some((seg) => seg === '' || seg === '.' || seg === '..')) return false;
  const s1 = segs[0].toLowerCase(), s2 = segs[1].toLowerCase();
  if (s1 === org) return true;
  if (!UUID_SEG.test(s1)) return s2 === org;
  try {
    const { data: site, error: sErr } = await admin.from('sites').select('org_id').eq('id', s1).maybeSingle();
    if (sErr) return false;
    if (site) return String(site.org_id).toLowerCase() === org;
    const { data: person, error: pErr } = await admin.from('profiles').select('org_id').eq('id', s1).maybeSingle();
    return !pErr && !!person && String(person.org_id).toLowerCase() === org;
  } catch (_e) { return false; }
}
async function docFileUrl(doc: any, orgId: unknown): Promise<string | null> {
  const path = String(doc?.storage_path || '');
  if (!(await pathInCompany(orgId, path))) return null;
  try {
    const { data, error } = await admin.storage.from('rams-docs').createSignedUrl(path, DOC_LINK_SECONDS);
    if (error || !data?.signedUrl) return null;
    const u = String(data.signedUrl);
    return u.startsWith('http') ? u : `${SUPABASE_URL}/storage/v1${u}`;
  } catch (_e) { return null; }
}
// ---- end OpHUB private file storage ----

async function docContext(row: any) {
  const { data: doc } = await admin.from('rams_docs').select('id, name, storage_path, site_id').eq('id', row.rams_id).maybeSingle();
  const { data: site } = await admin.from('sites').select('id, name').eq('id', row.site_id).maybeSingle();
  const { data: org } = await admin.from('organizations').select('name, logo_path, color_primary').eq('id', row.org_id).maybeSingle();
  return { doc, site, org };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const action = clean(body.action, 20);

    // ---------- a manager asks for a document to be sent to a client ----------
    if (action === 'request') {
      const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
      if (!bearer) return json({ error: 'Not authenticated' }, 401);
      const callerClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
      const { data: userData, error: userErr } = await callerClient.auth.getUser(bearer);
      if (userErr || !userData?.user) return json({ error: 'Not authenticated' }, 401);
      const { data: caller } = await admin.from('profiles').select('id, org_id, name, email, role').eq('id', userData.user.id).maybeSingle();
      if (!caller || !['pm', 'admin', 'site_manager'].includes(caller.role)) return json({ error: 'Only managers can send a document for client signature.' }, 403);

      const rams_id = clean(body.rams_id, 60);
      const client_name = clean(body.client_name, 100);
      const client_email = clean(body.client_email, 254).toLowerCase();
      if (!rams_id || !EMAIL_RE.test(client_email)) return json({ error: 'A document and a valid client email are required.' }, 400);

      const { data: doc } = await admin.from('rams_docs').select('id, name, site_id').eq('id', rams_id).maybeSingle();
      if (!doc) return json({ error: 'Document not found.' }, 404);
      const { data: site } = await admin.from('sites').select('id, name, org_id').eq('id', doc.site_id).maybeSingle();
      if (!site || site.org_id !== caller.org_id) return json({ error: 'Forbidden' }, 403);

      // No more than 10 requests per document per day, so this can't be used to spam an address.
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { count } = await admin.from('rams_client_signatures').select('id', { count: 'exact', head: true }).eq('rams_id', rams_id).gte('requested_at', since);
      if ((count || 0) >= 10) return json({ error: 'This document has been sent too many times today — try again tomorrow.' }, 429);

      const token = newToken();
      const { data: row, error: insErr } = await admin.from('rams_client_signatures').insert({
        rams_id, site_id: site.id, org_id: site.org_id, token_hash: await sha256Hex(token),
        client_name: client_name || null, client_email, requested_by: caller.id,
      }).select('id').single();
      if (insErr) { console.error(insErr); return json({ error: 'Could not create the signing request.' }, 500); }

      const { data: org } = await admin.from('organizations').select('name, logo_path, color_primary').eq('id', site.org_id).maybeSingle();
      const companyName = org?.name || 'OpHUB';
      const appUrl = (Deno.env.get('APP_URL') || 'https://operativehub.co.uk').replace(/\/+$/, '');
      const link = `${appUrl}/sign.html?t=${token}`;
      const logoUrl = org?.logo_path ? `${SUPABASE_URL}/storage/v1/object/public/org-logos/${org.logo_path}` : null;
      const hello = client_name ? `Hi ${client_name},` : 'Hi,';
      const sent = await sendEmail({
        from: ophubFrom(fromAddress(), companyName),
        to: [client_email],
        reply_to: caller.email || undefined,
        subject: `Please sign: ${doc.name} — ${site.name}`,
        text: `${client_name ? 'Hi ' + client_name : 'Hi'},\n\n${caller.name} at ${companyName} has asked you to review and sign "${doc.name}" for ${site.name}.\n\nOpen this link to read and sign it (no account needed):\n${link}\n\nThe link is private to you and expires in 30 days.`,
        html: ophubEmail({
          company: companyName, brand: org?.color_primary, logoUrl,
          kicker: site.name || undefined,
          title: 'Document to sign',
          greeting: hello,
          intro: `${caller.name} at ${companyName} has asked you to review and sign "${doc.name}" for ${site.name}.`,
          bodyHtml: ophubRows([['Document', doc.name], ['Site', site.name], ['Sent by', caller.name]]),
          button: { label: 'Review and sign', url: link },
          note: 'No account or app is needed. The link is private to you and expires in 30 days.',
        }),
      });
      if (!sent.ok) {
        console.error('client sign email failed', sent.error);
        await admin.from('rams_client_signatures').delete().eq('id', row.id);
        return json({ error: 'Could not send the email — please check the address and try again.' }, 502);
      }
      return json({ ok: true, id: row.id });
    }

    // ---------- the client's page ----------
    if (action === 'info' || action === 'sign') {
      const token = clean(body.token, 80);
      const row = await loadByToken(token);
      if (!row) return json({ error: 'This signing link is not valid.' }, 404);
      const { doc, site, org } = await docContext(row);
      if (!doc) return json({ error: 'This document is no longer available.' }, 404);
      const expired = !row.signed_at && new Date(row.expires_at).getTime() < Date.now();
      const info = {
        doc_name: doc.name,
        site_name: site?.name || '',
        company: org?.name || '',
        logo_url: org?.logo_path ? `${SUPABASE_URL}/storage/v1/object/public/org-logos/${org.logo_path}` : null,
        // A fresh signed link, only while the document is still to be signed
        // (the page shows it only then). 16 Nov 2026: was the public address.
        file_url: action === 'info' && !row.signed_at && !expired ? await docFileUrl(doc, row.org_id) : null,
        client_name: row.client_name || '',
        signed_at: row.signed_at,
        signer_name: row.signer_name || '',
        expired,
      };
      if (action === 'info') return json({ ok: true, ...info });

      if (row.signed_at) return json({ error: 'This document has already been signed.', ...info }, 409);
      if (expired) return json({ error: 'This signing link has expired — please ask for a new one.' }, 410);
      const name = clean(body.name, 100);
      const dataUrl = typeof body.signature_png === 'string' ? body.signature_png : '';
      if (!name) return json({ error: 'Please type your full name.' }, 400);
      const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
      if (!m || m[1].length > 600000 || m[1].length < 400) return json({ error: 'Please draw your signature.' }, 400);
      const bytes = Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0));
      // PNG magic number check - only a real PNG is stored.
      const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
      if (!png.every((b, i) => bytes[i] === b)) return json({ error: 'Please draw your signature.' }, 400);

      const path = `client/${row.id}.png`;
      const up = await admin.storage.from('signatures').upload(path, bytes, { contentType: 'image/png', upsert: true });
      if (up.error) { console.error(up.error); return json({ error: 'Could not save your signature — please try again.' }, 500); }
      const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('cf-connecting-ip') || null;
      const signedAt = new Date().toISOString();
      // Only succeeds if it has not been signed in the meantime.
      const { data: updated, error: updErr } = await admin.from('rams_client_signatures')
        .update({ signed_at: signedAt, signer_name: name, signature_path: path, signer_ip: ip, signer_user_agent: clean(req.headers.get('user-agent') || '', 300) })
        .eq('id', row.id).is('signed_at', null).select('id');
      if (updErr || !updated || !updated.length) return json({ error: 'This document has already been signed.' }, 409);

      // Tell whoever asked for it. Best effort.
      try {
        if (row.requested_by) {
          const { data: asker } = await admin.from('profiles').select('name, email').eq('id', row.requested_by).maybeSingle();
          if (asker?.email) {
            const when = new Date(signedAt).toLocaleString('en-GB', { timeZone: 'Europe/London', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            const company = org?.name || 'OpHUB';
            const siteName = site?.name || '';
            const askerFirst = String(asker.name || '').trim().split(/\s+/)[0];
            await sendEmail({
              from: ophubFrom(fromAddress(), company), to: [asker.email],
              subject: siteName ? `Client signed: ${doc.name} — ${siteName}` : `Client signed: ${doc.name}`,
              text: `${askerFirst ? 'Hi ' + askerFirst : 'Hi'},\n\n${name} (${row.client_email}) signed "${doc.name}"${siteName ? ' for ' + siteName : ''} on ${when}.\n\nExport the signed PDF from the RAMS page in OpHUB.`,
              html: ophubEmail({
                company, brand: org?.color_primary,
                logoUrl: org?.logo_path ? `${SUPABASE_URL}/storage/v1/object/public/org-logos/${org.logo_path}` : null,
                kicker: siteName || undefined,
                title: 'Client signed the document',
                greeting: askerFirst ? `Hi ${askerFirst},` : 'Hi,',
                intro: `${name} (${row.client_email}) signed "${doc.name}"${siteName ? ' for ' + siteName : ''} on ${when}.`,
                bodyHtml: ophubRows([['Document', doc.name], ['Site', siteName], ['Signed by', name], ['Email', row.client_email], ['Signed', when]]),
                note: 'Export the signed PDF from the RAMS page in OpHUB.',
              }),
            });
          }
          await admin.from('messages').insert({ org_id: row.org_id, site_id: row.site_id, sender_id: row.requested_by, audience: 'single', recipient_id: row.requested_by, kind: 'client_signed_rams', body: `Client ${name} signed "${doc.name}".`, related_id: row.rams_id });
        }
      } catch (e) { console.error('notify failed', e); }
      return json({ ok: true, signed_at: signedAt });
    }

    return json({ error: 'Unknown action.' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: 'Something went wrong — please try again.' }, 500);
  }
});
