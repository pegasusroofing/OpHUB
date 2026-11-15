import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, cache-control, pragma',
};

// Company-admin version of admin-delete-user: lets a company Admin fully
// remove someone from their OWN org -- the auth.users account itself, not
// just their profiles row. profiles.id has ON DELETE CASCADE back to
// auth.users(id), so deleting the auth account also removes the profile in
// the same step.
//
// This exists because the old client-side "Remove" button did a plain
// `DELETE .../rest/v1/profiles`, which only ever removes the profile row via
// RLS and leaves the auth.users account behind -- invisible in both the app
// and the Super Admin panel, and permanently blocking that email from ever
// signing up again (Supabase Auth refuses signup for an email that's still
// attached to an existing, if orphaned, account). auth.admin.deleteUser is
// not reachable from the browser, so this has to go through an edge
// function with the service-role key.
Deno.serve(async (req) => {
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

    const { data: callerProfile } = await admin.from('profiles').select('role, org_id').eq('id', userData.user.id).maybeSingle();
    if (!callerProfile || callerProfile.role !== 'admin' || !callerProfile.org_id) {
      return new Response(JSON.stringify({ error: 'Forbidden — company admin only' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json().catch(() => ({}));
    const userId = (body.user_id || '').trim();
    if (!userId) return new Response(JSON.stringify({ error: 'user_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    if (userId === userData.user.id) {
      return new Response(JSON.stringify({ error: "You can't remove your own account this way." }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: target } = await admin.from('profiles').select('id, name, email, org_id').eq('id', userId).maybeSingle();
    if (!target) return new Response(JSON.stringify({ error: 'User not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // Same-org guard: a company admin may only remove people in their own
    // company, never reach across orgs.
    if (target.org_id !== callerProfile.org_id) {
      return new Response(JSON.stringify({ error: "Forbidden — that person isn't in your company" }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) return new Response(JSON.stringify({ error: delErr.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    return new Response(JSON.stringify({ ok: true, deleted: target.name || target.email }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
