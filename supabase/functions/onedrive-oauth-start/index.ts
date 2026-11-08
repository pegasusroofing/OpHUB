const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-user-token, cache-control, pragma',
};

async function fetchT(url: string, opts: RequestInit, ms = 10000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } catch (e) {
    if ((e as any)?.name === 'AbortError') throw new Error(`Request to ${url} timed out after ${ms}ms`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function b64urlDecode(str: string): string {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return atob(str);
}
function getUserIdFromToken(token: string): string | null {
  try {
    const payload = token.split('.')[1];
    const json = JSON.parse(b64urlDecode(payload));
    return json.sub || null;
  } catch (_e) {
    return null;
  }
}

async function getCallerProfile(SUPABASE_URL: string, ANON_KEY: string, token: string) {
  const uid = getUserIdFromToken(token);
  if (!uid) return null;
  const res = await fetchT(`${SUPABASE_URL}/rest/v1/profiles?select=id,role,org_id&id=eq.${uid}`, {
    headers: { Authorization: `Bearer ${token}`, apikey: ANON_KEY },
  }, 8000);
  if (!res.ok) return null;
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

// #(onedrive-oauth-state-signing): the `state` param round-trips through
// Microsoft's servers and back to onedrive-oauth-callback, which used to
// trust org_id straight out of it with no integrity check -- anyone could
// forge a state with someone else's org_id and get their own OneDrive
// tokens upserted into that org's connection row. Sign the payload with
// AZURE_CLIENT_SECRET (already a protected, server-only secret specific to
// this OAuth app) so the callback can verify it hasn't been tampered with.
async function hmacSign(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sigBuf)));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const token = req.headers.get('X-User-Token') || (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

    const callerProfile = await getCallerProfile(SUPABASE_URL, ANON_KEY, token);
    if (!callerProfile || callerProfile.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Forbidden - company admins only' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const AZURE_CLIENT_ID = Deno.env.get('AZURE_CLIENT_ID');
    const AZURE_CLIENT_SECRET = Deno.env.get('AZURE_CLIENT_SECRET');
    if (!AZURE_CLIENT_ID || !AZURE_CLIENT_SECRET) {
      return new Response(JSON.stringify({ error: 'OneDrive isn\'t configured yet on the OpHUB platform (missing AZURE_CLIENT_ID/AZURE_CLIENT_SECRET secret) - contact support.' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json().catch(() => ({}));
    const native = !!body.native;
    const origin = typeof body.origin === 'string' ? body.origin.slice(0, 200) : null;
    // 8 Nov 2026: the new app says which page to come back to (e.g. /pm/admin/onedrive); the current web app sends none
    // and goes back to /app.html as before. A plain path only.
    const ret = typeof body.ret === 'string' && /^\/[A-Za-z0-9/_.-]{0,120}$/.test(body.ret) ? body.ret : null;

    const redirectUri = `${SUPABASE_URL}/functions/v1/onedrive-oauth-callback`;
    const statePayload = JSON.stringify({ org_id: callerProfile.org_id, native, origin, ...(ret ? { ret } : {}) });
    const stateSig = await hmacSign(AZURE_CLIENT_SECRET, statePayload);
    const state = btoa(JSON.stringify({ p: statePayload, s: stateSig }));
    const authUrl = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
    authUrl.searchParams.set('client_id', AZURE_CLIENT_ID);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_mode', 'query');
    authUrl.searchParams.set('scope', 'offline_access Files.ReadWrite.All Sites.ReadWrite.All User.Read');
    authUrl.searchParams.set('state', state);
    // #(onedrive-force-account-picker): 2026-09-13 -- without this, Microsoft
    // silently signs the connecting admin straight into whatever Microsoft
    // account already has an active browser session (SSO), with no chance to
    // pick a different one. That's fine for a one-person test but breaks for a
    // new company where the person clicking Connect needs to choose (or log
    // into) THEIR organisation's Microsoft/OneDrive account specifically.
    // 'select_account' forces Microsoft's account-chooser screen every time.
    authUrl.searchParams.set('prompt', 'select_account');

    return new Response(JSON.stringify({ url: authUrl.toString() }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
