import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Lists "ghost" logins -- auth.users accounts with NO matching profiles row.
// These are invisible everywhere else: not in any company's member list, not
// in the Unassigned Users list (which only reads the profiles table), and
// they permanently block that email from ever signing up again. They're
// normally left behind by a delete path that only removes the profiles row
// (RLS DELETE) rather than the underlying auth account -- auth.users isn't
// exposed via the normal REST API at all, so listing it needs the
// service-role key via an edge function.
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

    // Walk every auth.users page and every profiles page, then diff by id.
    // Both are typically small (tens to low hundreds of rows) for this app,
    // so a full in-memory diff is simplest and avoids a raw SQL round trip.
    const authUsers: { id: string; email: string | null; created_at: string }[] = [];
    for (let page = 1; page <= 50; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      for (const u of data.users) authUsers.push({ id: u.id, email: u.email ?? null, created_at: u.created_at });
      if (data.users.length < 200) break;
    }

    const profileIds = new Set<string>();
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data: rows, error } = await admin.from('profiles').select('id').range(from, from + pageSize - 1);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      (rows || []).forEach((r: { id: string }) => profileIds.add(r.id));
      if (!rows || rows.length < pageSize) break;
      from += pageSize;
    }

    const orphans = authUsers.filter(u => !profileIds.has(u.id));
    return new Response(JSON.stringify({ orphans }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
