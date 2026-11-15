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
    if (!token) return new Response(JSON.stringify({error:'Not authenticated'}), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

    // Pass the token explicitly -- getUser() does not reliably pick up a
    // caller's token from a global client header, it needs the JWT directly.
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession:false } });
    const { data: userData, error: userErr } = await callerClient.auth.getUser(token);
    if (userErr || !userData?.user) return new Response(JSON.stringify({error:'Not authenticated'}), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken:false, persistSession:false } });

    const { data: callerProfile } = await admin.from('profiles').select('role').eq('id', userData.user.id).maybeSingle();
    if (!callerProfile || callerProfile.role !== 'superadmin') {
      return new Response(JSON.stringify({error:'Forbidden — superadmin only'}), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json().catch(()=>({}));
    const orgId = (body.org_id||'').trim();
    if (!orgId) return new Response(JSON.stringify({error:'org_id required'}), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: org } = await admin.from('organizations').select('id,name').eq('id', orgId).maybeSingle();
    if (!org) return new Response(JSON.stringify({error:'Company not found'}), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { error: delErr } = await admin.from('organizations').delete().eq('id', orgId);
    if (delErr) { console.error('admin-delete-company: not deleted', delErr); return new Response(JSON.stringify({error: 'Could not delete the company — please try again.'}), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }

    return new Response(JSON.stringify({ ok:true, deleted: org.name }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('admin-delete-company failed', e);
    return new Response(JSON.stringify({error:'Something went wrong — please try again.'}), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
