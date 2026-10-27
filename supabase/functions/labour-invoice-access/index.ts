import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-user-token, cache-control, pragma',
};

// Gate for the Labour Invoices tab: the labour-invoices storage bucket is
// PRIVATE — this is the only door in. Checks real access control (project
// admin, or someone explicitly tick-listed in site_labour_invoice_access)
// before handing back a short-lived signed URL for one specific file.
//
// Body: {site_id, storage_path}
// storage_path must match a row in labour_invoices for that site — this
// stops someone from asking for an arbitrary path in the bucket.
// #(onedrive-authheader-hang) workaround: like every other function found to
// hang with a real user JWT in Authorization, the caller's token now travels
// in X-User-Token instead (falls back to Authorization for any other caller).
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
    const token = req.headers.get('X-User-Token') || (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await callerClient.auth.getUser(token);
    if (userErr || !userData?.user) return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: callerProfile } = await admin.from('profiles').select('role, org_id').eq('id', userData.user.id).maybeSingle();
    if (!callerProfile) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const body = await req.json().catch(() => ({}));
    const { site_id, storage_path } = body;
    if (!site_id || !storage_path) return new Response(JSON.stringify({ error: 'site_id and storage_path are required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: site } = await admin.from('sites').select('id, org_id').eq('id', site_id).maybeSingle();
    if (!site || site.org_id !== callerProfile.org_id) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const isAdmin = callerProfile.role === 'admin' || callerProfile.role === 'superadmin';
    const isPm = isAdmin || callerProfile.role === 'pm';
    let allowed = isPm;
    if (!allowed) {
      const { data: grant } = await admin.from('site_labour_invoice_access').select('user_id').eq('site_id', site_id).eq('user_id', userData.user.id).maybeSingle();
      allowed = !!grant;
    }
    if (!allowed) return new Response(JSON.stringify({ error: 'You don\'t have access to labour invoices for this project.' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: fileRow } = await admin.from('labour_invoices').select('id, storage_path').eq('site_id', site_id).eq('storage_path', storage_path).maybeSingle();
    if (!fileRow) return new Response(JSON.stringify({ error: 'File not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: signed, error: signErr } = await admin.storage.from('labour-invoices').createSignedUrl(storage_path, 300);
    if (signErr) { console.error('labour-invoice-access: sign failed', signErr.message); return new Response(JSON.stringify({ error: 'Could not open that file right now — please try again.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }

    return new Response(JSON.stringify({ ok: true, url: signed.signedUrl }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('labour-invoice-access failed', e);
    return new Response(JSON.stringify({ error: 'Something went wrong — please try again.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}));
