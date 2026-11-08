import { createClient } from 'npm:@supabase/supabase-js@2';

// #(onedrive-callback-texthtml-mystery): 2026-09-13 -- Supabase's own edge
// logs proved this endpoint kept serving Content-Type: text/plain to the
// real browser no matter how the Response was built -- so this redirects
// straight back into the app instead of rendering a page on this domain.
// 8 Nov 2026: the last-resort page did still show as code (Andy, connecting from the laptop's network address, which
// wasn't on the list). Now it always redirects: to the page the new app asked for (state.ret), else the current web
// app, else operativehub.co.uk. Addresses on the office network (192.168.x.x, 10.x.x.x, 172.16-31.x.x) are allowed.

function redirectResponse(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: location, 'Cache-Control': 'no-store, must-revalidate' },
  });
}

function htmlResponse(html: string, status = 200): Response {
  return new Response(new Blob([html], { type: 'text/html; charset=utf-8' }), {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store, must-revalidate',
      'Pragma': 'no-cache',
    },
  });
}

// #(onedrive-oauth-state-signing): mirrors onedrive-oauth-start's hmacSign.
// The state param round-trips through Microsoft and back here, so it must
// not be trusted unless its signature (over the exact payload string, keyed
// by the server-only AZURE_CLIENT_SECRET) verifies -- otherwise anyone could
// forge a state with someone else's org_id and get their own OneDrive
// tokens upserted into that org's connection row.
async function hmacSign(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sigBuf)));
}
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

// The page now uses the hosted OpHUB mark (same image every OpHUB email
// uses) instead of an inline base64 copy.
const OPHUB_LOGO_INLINE = 'https://operativehub.co.uk/assets/ophub-mark.png';
const HOME = 'https://operativehub.co.uk';

// L9 (25 Oct 2026): every value put into the page is HTML-escaped - the
// body can carry Microsoft's `error` query parameter, which anyone can set.
function escHtml(s: unknown): string {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
// Only send people back to the OpHUB web app itself (the origin comes from
// the signed state, but is checked anyway).
function allowedReturnOrigin(o: unknown): boolean {
  const s = String(o || '');
  return ['https://operativehub.co.uk', 'https://www.operativehub.co.uk', 'https://ophub-ten.vercel.app', 'https://localhost', 'http://localhost'].includes(s)
    || /^https:\/\/ophub-[a-z0-9-]+-op-hub\.vercel\.app$/.test(s) || /^http:\/\/localhost:\d{2,5}$/.test(s)
    // the office network: the laptop's dev server opened from another device (8 Nov 2026)
    || /^http:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d{2,5})?$/.test(s);
}
// The new app's page to come back to: a plain path only.
const okRet = (r: unknown) => typeof r === 'string' && /^\/[A-Za-z0-9/_.-]{0,120}$/.test(r);

function fallbackHtmlPage(opts: any) {
  const kind = opts.kind;
  const title = escHtml(opts.title);
  const body = escHtml(opts.body);
  const ok = kind === 'success';
  const accent = ok ? '#3FB27F' : '#E0A030';
  const iconBg = ok ? 'rgba(63,178,127,0.14)' : 'rgba(224,160,48,0.14)';
  const icon = ok
    ? '<svg width="34" height="34" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="' + accent + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    : '<svg width="30" height="30" viewBox="0 0 24 24" fill="none"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="' + accent + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
  <style>
    *{box-sizing:border-box;}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;background:radial-gradient(circle at 50% 0%,#1b1d22 0%,#0d0e11 60%);color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;}
    .card{max-width:380px;width:100%;text-align:center;background:#17181C;border:1px solid #26272C;border-radius:20px;padding:34px 28px 28px;box-shadow:0 20px 60px rgba(0,0,0,0.45);}
    .logo{width:44px;height:44px;border-radius:11px;margin:0 auto 16px;display:block;object-fit:cover;}
    .iconwrap{width:60px;height:60px;border-radius:50%;background:${iconBg};display:flex;align-items:center;justify-content:center;margin:0 auto 18px;}
    h1{font-size:20px;margin:0 0 10px;letter-spacing:-0.01em;font-weight:700;}
    p{color:#a9abb3;font-size:13.5px;line-height:1.55;margin:0 0 24px;}
    .fallback{display:block;width:100%;padding:12px;border-radius:10px;border:1px solid #2c2d33;background:transparent;color:#c7c9d1;font-weight:700;font-size:12.5px;text-transform:uppercase;letter-spacing:.03em;cursor:pointer;margin-top:14px;text-decoration:none;text-align:center;}
  </style></head>
  <body>
    <div class="card">
      <img class="logo" src="${OPHUB_LOGO_INLINE}" alt="OpHUB">
      <div class="iconwrap">${icon}</div>
      <h1>${title}</h1>
      <p>${body}</p>
      <a class="fallback" href="${HOME}/app.html">Return to OpHUB</a>
    </div>
  </body></html>`;
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const stateRaw = url.searchParams.get('state');
    const error = url.searchParams.get('error_description');

    const adminConsent = url.searchParams.get('admin_consent');
    const consentTenant = url.searchParams.get('tenant');
    const adminConsentError = url.searchParams.get('error');
    if (adminConsent === 'True' && consentTenant) {
      return htmlResponse(fallbackHtmlPage({ kind: 'success', title: 'Permissions Granted', body: 'Admin consent was granted successfully for your organisation. Go back to OpHUB, disconnect OneDrive if it was already connected, then Connect OneDrive again so it picks up the new permission.' }));
    }
    if (adminConsentError) {
      return htmlResponse(fallbackHtmlPage({ kind: 'error', title: 'Admin consent failed', body: 'Microsoft reported: ' + String(adminConsentError).slice(0, 200) + '. Make sure you approved the consent screen while signed in as a Global Admin of the organisation.' }));
    }

    let orgId, native = false, origin = null, ret: string | null = null;
    if (stateRaw) {
      try {
        const outer = JSON.parse(atob(stateRaw));
        const AZURE_CLIENT_SECRET = Deno.env.get('AZURE_CLIENT_SECRET');
        if (outer && typeof outer.p === 'string' && typeof outer.s === 'string' && AZURE_CLIENT_SECRET) {
          const expectedSig = await hmacSign(AZURE_CLIENT_SECRET, outer.p);
          if (timingSafeEqual(expectedSig, outer.s)) {
            const parsed = JSON.parse(outer.p);
            orgId = parsed.org_id;
            native = !!parsed.native;
            origin = typeof parsed.origin === 'string' && allowedReturnOrigin(parsed.origin) ? parsed.origin : null;
            ret = okRet(parsed.ret) ? parsed.ret : null;
          }
          // signature mismatch: orgId stays undefined -> falls through to the
          // 'invalid_state' error below, same as an unparseable state today.
        }
      } catch (e) { /* handled below */ }
    }
    const deepLink = (kind: string, msg: string) => native ? `ophub://onedrive-callback?status=${kind}&msg=${encodeURIComponent(msg)}` : null;
    // #(onedrive-callback-app-html-path): 2026-09-13 -- the client only ever
    // sent the bare origin (e.g. https://www.operativehub.co.uk), but the
    // actual app lives at /app.html on that domain -- the root path is a
    // separate marketing site. Redirecting to `${origin}/#/team` therefore
    // landed on the marketing homepage, which has no idea what #/team means.
    // Hardcoding /app.html here (a server-only fix, no client rebuild needed)
    // sends the user back into the real app instead.
    // 8 Nov 2026: the new app sends `ret` (its own page, e.g. /pm/admin/onedrive) and comes back there.
    const returnUrl = (kind: string, msg: string) => (!native && origin)
      ? (ret ? `${origin}${ret}?onedrive=${kind}&msg=${encodeURIComponent(msg)}` : `${origin}/app.html#/team?onedrive=${kind}&msg=${encodeURIComponent(msg)}`)
      : null;
    const sendBack = (kind: string, msg: string) => {
      const rt = returnUrl(kind, msg);
      if (rt) return redirectResponse(rt);
      const dl = deepLink(kind, msg);
      if (dl) return redirectResponse(dl);
      // No address to go back to: the live web app, rather than a page that this domain shows as code.
      return redirectResponse(`${HOME}/app.html#/team?onedrive=${kind}&msg=${encodeURIComponent(msg)}`);
    };

    if (error) return sendBack('error', error);
    if (!code || !stateRaw || !orgId) return sendBack('error', 'invalid_state');

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const AZURE_CLIENT_ID = Deno.env.get('AZURE_CLIENT_ID')!;
    const AZURE_CLIENT_SECRET = Deno.env.get('AZURE_CLIENT_SECRET')!;
    const redirectUri = `${SUPABASE_URL}/functions/v1/onedrive-oauth-callback`;

    const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: AZURE_CLIENT_ID,
        client_secret: AZURE_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) return sendBack('error', 'token_exchange_failed');

    let accountEmail = null;
    try {
      const meRes = await fetch('https://graph.microsoft.com/v1.0/me', { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
      if (meRes.ok) { const me = await meRes.json(); accountEmail = me.mail || me.userPrincipalName || null; }
    } catch (_e) { /* non-fatal */ }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const expiresAt = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString();
    await admin.from('onedrive_connections').upsert({
      org_id: orgId,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: expiresAt,
      account_email: accountEmail,
      connected_at: new Date().toISOString(),
    });

    return sendBack('success', accountEmail || '');
  } catch (e) {
    console.error('onedrive-oauth-callback failed', e);
    return redirectResponse(`${HOME}/app.html#/team?onedrive=error&msg=${encodeURIComponent('Something unexpected went wrong. Please try Connect OneDrive again.')}`);
  }
});
