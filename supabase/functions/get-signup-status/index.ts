// Public endpoint: polled by signup-success.html right after a customer
// finishes paying, before they have any Supabase session. verify_jwt is
// deliberately off -- it only ever returns a status string and an invite id
// scoped to the one checkout session the caller already knows about.
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const url = new URL(req.url);
  const sessionId = url.searchParams.get('session_id');
  if (!sessionId) {
    return new Response(JSON.stringify({ error: 'session_id is required' }), { status: 400, headers: corsHeaders });
  }
  const { data } = await supabase
    .from('checkout_sessions')
    .select('status, invite_id')
    .eq('stripe_checkout_session_id', sessionId)
    .maybeSingle();

  return new Response(JSON.stringify(data || { status: 'pending', invite_id: null }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
