const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// #(onedrive-diagnostic-v2): brand-new function, brand-new function_id, deployed
// fresh (never previously deployed under any other name/version) to rule out the
// possibility that the ORIGINAL onedrive-list-folders function_id itself is stuck
// in some corrupted/broken state on Supabase's platform that survives even a full
// project pause+restore. Identical trivial diagnostic body to the v13 test.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    return new Response(JSON.stringify({ folders: [], diagnostic: 'v2-fresh-function', receivedBody: body }), { headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Connection': 'keep-alive' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
