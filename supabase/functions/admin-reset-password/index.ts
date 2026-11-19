import { createClient } from 'npm:@supabase/supabase-js@2';

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

// L8: cryptographically random (was Math.random()). Same 56-character
// alphabet (no 0/O/1/l/I look-alikes) and still 12 characters. Rejection
// sampling keeps every character equally likely.
function randomPassword(){
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const limit = 256 - (256 % chars.length);
  let out = '';
  while (out.length < 12) {
    const buf = new Uint8Array(32);
    crypto.getRandomValues(buf);
    for (const b of buf) { if (b < limit && out.length < 12) out += chars[b % chars.length]; }
  }
  return out;
}

Deno.serve(withCors(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return new Response(JSON.stringify({error:'Not authenticated'}), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Pass the token explicitly -- getUser() does not reliably pick up a
    // caller's token from a global client header, it needs the JWT directly.
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession:false } });
    const { data: userData, error: userErr } = await callerClient.auth.getUser(token);
    if (userErr || !userData?.user) return new Response(JSON.stringify({error:'Not authenticated'}), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken:false, persistSession:false } });

    // Confirm caller is a superadmin (service-role query bypasses RLS, source of truth).
    const { data: callerProfile } = await admin.from('profiles').select('role').eq('id', userData.user.id).maybeSingle();
    if (!callerProfile || callerProfile.role !== 'superadmin') {
      return new Response(JSON.stringify({error:'Forbidden — superadmin only'}), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json().catch(()=>({}));
    const targetEmail = (body.target_email||'').trim().toLowerCase();
    if (!targetEmail) return new Response(JSON.stringify({error:'target_email required'}), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const customPassword = typeof body.new_password === 'string' ? body.new_password.trim() : '';
    if (customPassword && customPassword.length < 8) {
      return new Response(JSON.stringify({error:'Custom password must be at least 8 characters'}), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // By their login email (company switching, 19 Nov 2026: a profile's email can be the email for the company they're
    // in), then by a profile email as before.
    const { data: login } = await admin.rpc('login_user_by_email', { p_email: targetEmail });
    const loginRow = Array.isArray(login) && login[0] ? login[0] as { id: string; email: string } : null;
    let targetProfile = loginRow ? (await admin.from('profiles').select('id,email').eq('id', loginRow.id).maybeSingle()).data : null;
    if (!targetProfile) targetProfile = (await admin.from('profiles').select('id,email').ilike('email', targetEmail).maybeSingle()).data;
    if (!targetProfile) return new Response(JSON.stringify({error:'No user found with that email'}), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const newPassword = customPassword || randomPassword();
    const { error: updErr } = await admin.auth.admin.updateUserById(targetProfile.id, { password: newPassword });
    // updErr.message is Supabase Auth's own short reason (e.g. a weak-password
    // rule) - shown to the superadmin on purpose, so it is kept.
    if (updErr) { console.error('admin-reset-password: update failed', updErr); return new Response(JSON.stringify({error: updErr.message}), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }

    return new Response(JSON.stringify({ ok:true, email: loginRow?.email || targetProfile.email, new_password: newPassword, was_custom: !!customPassword }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('admin-reset-password failed', e);
    return new Response(JSON.stringify({error:'Something went wrong — please try again.'}), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}));
