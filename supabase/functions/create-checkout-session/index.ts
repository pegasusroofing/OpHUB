// Public endpoint: a visitor on the pricing page calls this with no Supabase
// session at all (they don't have an account yet). verify_jwt is deliberately
// off -- this function is meant to be reachable by anyone, same as a normal
// "subscribe" button on a marketing site would be.
import Stripe from 'npm:stripe';
import { createClient } from 'npm:@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'), { apiVersion: '2024-06-20' });
const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
const APP_URL = Deno.env.get('APP_URL'); // e.g. https://app.rtbroofing.co.uk -- must be set once the pages are hosted somewhere public

// Maps the plan a customer picks on the pricing page to Stripe Prices via
// lookup_key, rather than hardcoding Price IDs. This means the actual
// amount/currency can be changed any time in the Stripe Dashboard without
// redeploying this function -- just keep the lookup_keys the same.
// Each tier has two prices: the recurring monthly subscription, and a
// one-off setup fee charged alongside the first payment only.
// 'finance' = OpHUB Finance on its own (no project-management side). Until
// its two prices exist in Stripe it answers "not available".
const TIER_LOOKUP_KEYS = {
  starter: { monthly: 'rtb_starter_monthly', setup: 'rtb_starter_setup' },
  growth: { monthly: 'rtb_growth_monthly', setup: 'rtb_growth_setup' },
  enterprise: { monthly: 'rtb_enterprise_monthly', setup: 'rtb_enterprise_setup' },
  finance: { monthly: 'rtb_finance_monthly', setup: 'rtb_finance_setup' },
};

// Because anyone can call this, it is limited: per visitor (IP address),
// per email address, and overall. Each attempt is logged in
// checkout_attempts and counted before anything is sent to Stripe.
const LIMIT_PER_IP_PER_HOUR = 6;
const LIMIT_PER_EMAIL_PER_HOUR = 4;
const LIMIT_OVERALL_PER_10_MIN = 40;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

async function countSince(minutes, column, value) {
  const since = new Date(Date.now() - minutes * 60000).toISOString();
  let q = supabase.from('checkout_attempts').select('id', { count: 'exact', head: true }).gte('created_at', since);
  if (column) q = q.eq(column, value);
  const { count, error } = await q;
  if (error) throw error;
  return count || 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const tier = typeof body.tier === 'string' ? body.tier : '';
    const company_name = typeof body.company_name === 'string' ? body.company_name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const lookupKeys = Object.prototype.hasOwnProperty.call(TIER_LOOKUP_KEYS, tier) ? TIER_LOOKUP_KEYS[tier] : null;
    if (!lookupKeys) return json({ error: 'Unknown plan.' }, 400);
    if (!company_name || !email) return json({ error: 'Company name and email are required.' }, 400);
    if (company_name.length > 120) return json({ error: 'Company name is too long.' }, 400);
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Enter a valid email address.' }, 400);

    // ---- Rate limit (fails closed: if the count can't be read, nothing is sent to Stripe) ----
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('cf-connecting-ip') || 'unknown';
    try {
      const [byIp, byEmail, overall] = await Promise.all([
        countSince(60, 'ip', ip),
        countSince(60, 'email', email),
        countSince(10, null, null),
      ]);
      if (byIp >= LIMIT_PER_IP_PER_HOUR || byEmail >= LIMIT_PER_EMAIL_PER_HOUR || overall >= LIMIT_OVERALL_PER_10_MIN) {
        return json({ error: 'Too many attempts — please wait a little while and try again.' }, 429);
      }
      await supabase.from('checkout_attempts').insert({ ip, email });
    } catch (e) {
      console.error('rate limit check failed', e);
      return json({ error: 'Sign-up is temporarily unavailable — please try again shortly.' }, 503);
    }

    const prices = await stripe.prices.list({ lookup_keys: [lookupKeys.monthly, lookupKeys.setup], active: true, limit: 10 });
    const monthlyPrice = prices.data.find(p => p.lookup_key === lookupKeys.monthly);
    const setupPrice = prices.data.find(p => p.lookup_key === lookupKeys.setup);
    if (!monthlyPrice || !setupPrice) {
      // Detail goes to the function log only, not to whoever is calling.
      console.error(`Stripe price missing for tier "${tier}": monthly=${!!monthlyPrice} setup=${!!setupPrice} (lookup keys ${lookupKeys.monthly}, ${lookupKeys.setup})`);
      return json({ error: 'This plan is not available right now — please contact us.' }, 500);
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        { price: monthlyPrice.id, quantity: 1 },
        { price: setupPrice.id, quantity: 1 },
      ],
      customer_email: email,
      metadata: { company_name, tier },
      subscription_data: { metadata: { company_name, tier } },
      success_url: `${APP_URL}/signup-success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/pricing.html`,
    });

    // Row exists immediately so signup-success.html always finds *something*
    // to poll, even in the brief window before the webhook has fired.
    await supabase.from('checkout_sessions').insert({
      stripe_checkout_session_id: session.id,
      status: 'pending',
    });

    return json({ url: session.url });
  } catch (e) {
    console.error(e);
    return json({ error: 'Something went wrong starting the checkout — please try again.' }, 500);
  }
});
