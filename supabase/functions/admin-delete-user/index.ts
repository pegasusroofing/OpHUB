import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, cache-control, pragma',
};

// Deletes a user COMPLETELY -- the auth.users account itself, not just their
// profiles row. profiles.id has ON DELETE CASCADE back to auth.users(id),
// so deleting the auth account also removes their profile in the same step
// when one exists.
//
// Also handles "ghost" accounts on purpose: an auth.users row with NO
// matching profiles row (e.g. left behind by an older delete path that only
// removed the profiles row via RLS). Those are surfaced by the Super Admin
// panel's Orphaned Logins list and need to be deletable too, even though
// there's no profile to look up a display name from.
//
// This needs the service-role key (auth.admin.deleteUser is not reachable
// from the browser), so it has to go through an edge function -- a plain
// `DELETE .../rest/v1/profiles` from the client only ever removes the
// profile row and leaves an orphaned, still-logins-work auth account behind.
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

    const { data: callerProfile } = await admin.from('profiles').select('role').eq('id', userData.user.id).maybeSingle();
    if (!callerProfile || callerProfile.role !== 'superadmin') {
      return new Response(JSON.stringify({ error: 'Forbidden — superadmin only' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json().catch(() => ({}));
    const userId = (body.user_id || '').trim();
    if (!userId) return new Response(JSON.stringify({ error: 'user_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    if (userId === userData.user.id) {
      return new Response(JSON.stringify({ error: "You can't delete your own account this way." }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: target } = await admin.from('profiles').select('id, name, email').eq('id', userId).maybeSingle();

    // No profile row -- this may still be a real ghost auth.users account
    // (orphaned by the old delete path). Confirm the auth user actually
    // exists before reporting success, but don't 404 just because there's
    // no profile to look a name up from.
    let label = target ? (target.name || target.email) : null;
    if (!target) {
      const { data: authUser, error: getErr } = await admin.auth.admin.getUserById(userId);
      if (getErr || !authUser?.user) return new Response(JSON.stringify({ error: 'User not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      label = authUser.user.email;
    }

    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) { console.error('admin-delete-user: not deleted', delErr); return new Response(JSON.stringify({ error: 'Could not delete that login — please try again.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }

    return new Response(JSON.stringify({ ok: true, deleted: label }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('admin-delete-user failed', e);
    return new Response(JSON.stringify({ error: 'Something went wrong — please try again.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
