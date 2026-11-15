import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

// Called every 15 minutes by a pg_cron job (see migration), same pattern as
// send-signout-reminder. Once per day, in the 23:45–23:59 Europe/London
// window, force-checks-out every operative/PM/admin who is still checked in
// to any site — so nobody has to remember to sign out at the end of the day,
// and everyone starts the next day needing a fresh check-in. DST-safe: cron
// fires on fixed UTC clock ticks (:00/:15/:30/:45), and since London's UTC
// offset is always a whole number of hours, those ticks land on the same
// :45 minute mark in London time whether it's GMT or BST — only the hour
// shifts, which is why we read the wall-clock hour from Europe/London
// instead of assuming a fixed UTC hour.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const CRON_SECRET = Deno.env.get('CRON_SECRET');
    const provided = req.headers.get('x-cron-secret') || '';
    if (!CRON_SECRET || provided !== CRON_SECRET) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(now).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
    const hour = parseInt(parts.hour, 10);
    const minute = parseInt(parts.minute, 10);
    const isLateNightWindow = hour === 23 && minute >= 45;

    if (!isLateNightWindow) {
      return new Response(JSON.stringify({ ok: true, skipped: 'outside 23:45-23:59 Europe/London window', hour, minute }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    // Only ever run once per calendar day (Europe/London date), even though
    // this function gets polled every 15 minutes during the 23:00 hour.
    const londonDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(now); // YYYY-MM-DD
    const { error: runErr } = await admin.from('notification_runs').insert({ kind: 'auto_checkout_2359', run_date: londonDate });
    if (runErr) {
      return new Response(JSON.stringify({ ok: true, skipped: 'already run today' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Latest checkin per (site_id, user_id): checkins ordered newest-first,
    // first row seen for a given site+user pair is their current status.
    const { data: allCheckins, error: selErr } = await admin
      .from('checkins')
      .select('site_id, user_id, type, ts')
      .order('ts', { ascending: false })
      .limit(5000);
    if (selErr) throw selErr;

    const seen = new Set();
    const stillIn = [];
    (allCheckins || []).forEach((c) => {
      const key = c.site_id + '|' + c.user_id;
      if (seen.has(key)) return;
      seen.add(key);
      if (c.type === 'in') stillIn.push({ site_id: c.site_id, user_id: c.user_id });
    });

    if (!stillIn.length) {
      return new Response(JSON.stringify({ ok: true, checkedOut: 0, reason: 'nobody currently checked in' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const outRows = stillIn.map((c) => ({ site_id: c.site_id, user_id: c.user_id, type: 'out', ts: now.toISOString() }));
    const { error: insErr } = await admin.from('checkins').insert(outRows);
    if (insErr) throw insErr;

    return new Response(JSON.stringify({ ok: true, checkedOut: outRows.length }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
