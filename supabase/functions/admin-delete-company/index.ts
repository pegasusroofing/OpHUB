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

    const { data: callerProfile } = await admin.from('profiles').select('role, org_id').eq('id', userData.user.id).maybeSingle();
    if (!callerProfile || callerProfile.role !== 'superadmin') {
      return new Response(JSON.stringify({error:'Forbidden — superadmin only'}), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json().catch(()=>({}));
    const orgId = (body.org_id||'').trim();
    if (!orgId) return new Response(JSON.stringify({error:'org_id required'}), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: org } = await admin.from('organizations').select('id,name').eq('id', orgId).maybeSingle();
    if (!org) return new Response(JSON.stringify({error:'Company not found'}), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // Never the company the platform owner's own account belongs to (19 Nov 2026).
    if (callerProfile.org_id && callerProfile.org_id === orgId) return new Response(JSON.stringify({ error: 'This is the company your own account belongs to, so it can\'t be deleted here.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    let { error: delErr } = await admin.from('organizations').delete().eq('id', orgId);
    // A company with Finance records, permits or yard stock (Andy, 19 Nov 2026: "i need to be able to delete companies"):
    // these tables don't go with the company by themselves, so clear this company's rows (a few passes, as some point at
    // each other) and try again. Everything else goes with the company as before.
    if (delErr && (delErr as { code?: string }).code === '23503') {
      const KEEPERS = ['fin_quote_items', 'fin_quotes', 'fin_sub_values', 'fin_sub_apps', 'fin_subcontracts', 'fin_variations', 'fin_dayworks', 'site_dayworks', 'fin_job_costs', 'fin_job_budgets', 'fin_statements',
        'fin_shop_prices', 'fin_shop_items', 'fin_price_book', 'fin_supplier_info', 'fin_suppliers', 'fin_clients', 'fin_cost_codes', 'permits', 'subcontractor_inspections', 'wage_pushes', 'xero_connections', 'yard_moves', 'yard_stock_rates', 'yard_stock'];
      for (let pass = 0; pass < 4; pass++) for (const t of KEEPERS) { const r = await admin.from(t).delete().eq('org_id', orgId); if (r.error && pass === 3) console.warn('admin-delete-company: left in', t, r.error.message); }
      ({ error: delErr } = await admin.from('organizations').delete().eq('id', orgId));
    }
    if (delErr) { console.error('admin-delete-company: not deleted', delErr); return new Response(JSON.stringify({error: 'Could not delete the company — please try again.'}), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }

    return new Response(JSON.stringify({ ok:true, deleted: org.name }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('admin-delete-company failed', e);
    return new Response(JSON.stringify({error:'Something went wrong — please try again.'}), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
