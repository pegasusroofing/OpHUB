import { createClient } from 'npm:@supabase/supabase-js@2';
import { GoogleAuth } from 'npm:google-auth-library@9';

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, cache-control, pragma',
};

// ---- CORS allow-list (security review L8, 25 Oct 2026) ----
// Only the OpHUB web app (live domain, Vercel production + preview URLs) and
// the phone apps get a CORS grant; every other website's browser is refused.
// Calls with no Origin header (cron, Power Automate, server-to-server) are
// not affected by CORS at all. withCors() sets the header on every response
// the handler returns, so the code below can keep using corsHeaders as before.
const OPHUB_ORIGINS = new Set([
  'https://operativehub.co.uk',
  'https://www.operativehub.co.uk',
  'https://ophub-ten.vercel.app',
  'capacitor://localhost',
  'https://localhost',
  'http://localhost',
]);
function ophubOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  if (OPHUB_ORIGINS.has(origin)) return true;
  if (/^https:\/\/ophub-[a-z0-9-]+-op-hub\.vercel\.app$/.test(origin)) return true; // Vercel preview deployments
  if (/^http:\/\/localhost:\d{2,5}$/.test(origin)) return true; // local dev server
  return false;
}
function withCors(handler: (req: Request) => Response | Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    const res = await handler(req);
    const origin = req.headers.get('Origin');
    const headers = new Headers(res.headers);
    headers.delete('Access-Control-Allow-Origin');
    if (ophubOriginAllowed(origin)) headers.set('Access-Control-Allow-Origin', origin as string);
    headers.append('Vary', 'Origin');
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  };
}
// ---- end CORS allow-list ----

Deno.serve(withCors(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await callerClient.auth.getUser(token);
    if (userErr || !userData?.user) return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data: caller } = await admin.from('profiles').select('role, org_id, name').eq('id', userData.user.id).maybeSingle();
    if (!caller || (caller.role !== 'pm' && caller.role !== 'admin')) {
      return new Response(JSON.stringify({ error: 'Forbidden — project managers and admins only' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json().catch(() => ({}));
    const { site_id, doc_type, user_ids, tbt_id } = body;
    if (!site_id || !['rams', 'coshh', 'tbt'].includes(doc_type) || !Array.isArray(user_ids) || !user_ids.length) {
      return new Response(JSON.stringify({ error: 'site_id, doc_type (rams|coshh|tbt) and at least one user_id are required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (doc_type === 'tbt' && !tbt_id) {
      return new Response(JSON.stringify({ error: 'tbt_id is required when doc_type is tbt' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: site } = await admin.from('sites').select('id, name, org_id').eq('id', site_id).maybeSingle();
    if (!site || site.org_id !== caller.org_id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let docIds = [];
    let sigTable = '';
    let fkCol = '';
    let label = '';
    let kind = '';
    if (doc_type === 'tbt') {
      const { data: talk } = await admin.from('toolbox_talks').select('id, site_id, title').eq('id', tbt_id).maybeSingle();
      if (!talk || talk.site_id !== site_id) {
        return new Response(JSON.stringify({ error: 'Toolbox talk not found for this site' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      docIds = [talk.id];
      sigTable = 'toolbox_talk_signatures';
      fkCol = 'tbt_id';
      label = 'Toolbox Talk';
      kind = 'tbt_reminder';
    } else {
      const table = doc_type === 'rams' ? 'rams_docs' : 'coshh_docs';
      sigTable = doc_type === 'rams' ? 'rams_signatures' : 'coshh_signatures';
      fkCol = doc_type === 'rams' ? 'rams_id' : 'coshh_id';
      let docsQuery = admin.from(table).select('id').eq('site_id', site_id);
      if (doc_type === 'rams') docsQuery = docsQuery.eq('status', 'current');
      const { data: docs } = await docsQuery;
      docIds = (docs || []).map((d) => d.id);
      label = doc_type === 'rams' ? 'RAMS' : 'COSHH';
      kind = doc_type === 'rams' ? 'rams_reminder' : 'coshh_reminder';
    }
    if (!docIds.length) {
      return new Response(JSON.stringify({ ok: true, sent: 0, reason: 'no documents' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: assigned } = await admin.from('site_assignments').select('user_id').eq('site_id', site_id);
    const roster = new Set((assigned || []).map((a) => a.user_id));

    const { data: sigs } = await admin.from(sigTable).select('user_id, ' + fkCol).in(fkCol, docIds);
    const signedByDoc = {};
    (sigs || []).forEach((s) => {
      const k = s[fkCol];
      (signedByDoc[k] = signedByDoc[k] || new Set()).add(s.user_id);
    });

    const requested = new Set(user_ids);
    const recipientIds = [...roster].filter((uid) => requested.has(uid) && docIds.some((did) => !(signedByDoc[did] && signedByDoc[did].has(uid))));

    if (!recipientIds.length) {
      return new Response(JSON.stringify({ ok: true, sent: 0, reason: 'nobody outstanding' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: tokens } = await admin.from('push_tokens').select('token').in('user_id', recipientIds);
    if (!tokens || !tokens.length) {
      return new Response(JSON.stringify({ ok: true, sent: 0, reason: 'no registered devices' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const FIREBASE_SERVICE_ACCOUNT_JSON = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON');
    if (!FIREBASE_SERVICE_ACCOUNT_JSON) {
      return new Response(JSON.stringify({ ok: true, sent: 0, reason: 'FIREBASE_SERVICE_ACCOUNT_JSON not set' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON);
    const projectId = serviceAccount.project_id;

    const auth = new GoogleAuth({ credentials: serviceAccount, scopes: ['https://www.googleapis.com/auth/firebase.messaging'] });
    const client = await auth.getClient();
    const accessTokenResp = await client.getAccessToken();
    const accessToken = typeof accessTokenResp === 'string' ? accessTokenResp : accessTokenResp?.token;
    if (!accessToken) throw new Error('Could not obtain Firebase access token');

    const title = `${label} sign-off needed`;
    const bodyText = `${caller.name} is asking you to sign the outstanding ${label}${doc_type === 'tbt' ? '' : ' document' + (docIds.length === 1 ? '' : 's')} for ${site.name}.`;

    let sent = 0; let failed = 0;
    for (const t of tokens) {
      try {
        const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: {
              token: t.token,
              notification: { title, body: bodyText },
              data: { kind, site_id: String(site_id) },
              android: { priority: 'high' },
              apns: {
                headers: { 'apns-priority': '10' },
                payload: { aps: { alert: { title, body: bodyText }, sound: 'default' } },
              },
            },
          }),
        });
        if (res.ok) sent++; else failed++;
      } catch (_e) { failed++; }
    }

    return new Response(JSON.stringify({ ok: true, sent, failed, recipients: recipientIds.length }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('send-sign-reminder failed', e);
    return new Response(JSON.stringify({ error: 'Something went wrong — please try again.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}));
