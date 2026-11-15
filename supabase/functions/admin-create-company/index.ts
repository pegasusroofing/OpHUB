import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, cache-control, pragma',
};

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
      return new Response(JSON.stringify({ error: 'Forbidden — super admin only' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json().catch(() => ({}));
    const companyName = (body.company_name || '').trim();
    const email = (body.email || '').trim() || null;
    if (!companyName) {
      return new Response(JSON.stringify({ error: 'company_name is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: org, error: orgErr } = await admin.from('organizations').insert({ name: companyName }).select().single();
    if (orgErr) { console.error('admin-create-company: company not saved', orgErr); return new Response(JSON.stringify({ error: 'Could not create the company — please try again.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }

    // Founding invite is always 'admin' — whoever redeems it becomes that
    // company's top-level admin, same as a normal Stripe-paid signup.
    const { data: invite, error: inviteErr } = await admin.from('invites').insert({
      org_id: org.id, role: 'admin', email, created_by: userData.user.id,
    }).select().single();
    if (inviteErr) { console.error('admin-create-company: invite not saved', inviteErr); return new Response(JSON.stringify({ error: 'The company was created but its invite could not be made — please try again from the company list.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }

    return new Response(JSON.stringify({ ok: true, org, invite_id: invite.id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('admin-create-company failed', e);
    return new Response(JSON.stringify({ error: 'Something went wrong — please try again.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
