import { createClient } from 'npm:@supabase/supabase-js@2';
import { GoogleAuth } from 'npm:google-auth-library@9';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

// Called every 15 minutes by a pg_cron job (see migration). Fires a real push
// notification, once per weekday at 3pm Europe/London time, reminding any
// operative who is currently checked in (and hasn't checked out) to sign out
// for the day. Guards against double-sending within the same 15-minute-poll
// hour via the notification_runs table, and against DST drift by reading the
// wall-clock hour in Europe/London rather than assuming a fixed UTC offset.
//
// Sent via FCM's HTTP v1 API for BOTH Android and iOS: once the iOS app is
// registered with the same Firebase project (GoogleService-Info.plist added,
// APNs Authentication Key uploaded in the Firebase console), FCM forwards the
// message to APNs on Apple's servers automatically — no separate raw-APNs
// code path is needed here. The android/apns blocks below are just per-
// platform delivery hints layered on top of the same message.
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
      timeZone: 'Europe/London', weekday: 'short', hour: '2-digit', hour12: false,
    }).formatToParts(now).reduce((acc: Record<string, string>, p) => { acc[p.type] = p.value; return acc; }, {});
    const weekday = parts.weekday; // 'Mon'..'Sun'
    const hour = parseInt(parts.hour, 10);
    const isWeekday = !['Sat', 'Sun'].includes(weekday);
    const isThreePm = hour === 15;

    if (!isWeekday || !isThreePm) {
      return new Response(JSON.stringify({ ok: true, skipped: 'outside 3pm weekday window', weekday, hour }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    // Only ever fire once per calendar day (Europe/London date), even though
    // this function gets polled every 15 minutes during the 3pm hour.
    const londonDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(now); // YYYY-MM-DD
    const { error: runErr } = await admin.from('notification_runs').insert({ kind: 'signout_reminder_3pm', run_date: londonDate });
    if (runErr) {
      // Unique-violation means another poll already claimed today's run.
      return new Response(JSON.stringify({ ok: true, skipped: 'already sent today' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const FIREBASE_SERVICE_ACCOUNT_JSON = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON');
    if (!FIREBASE_SERVICE_ACCOUNT_JSON) {
      return new Response(JSON.stringify({ error: 'FIREBASE_SERVICE_ACCOUNT_JSON secret is not set — cannot send push notifications yet.' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON);
    const projectId = serviceAccount.project_id;

    // Find whoever's currently checked in (their most recent checkin is a
    // type='in' with no later 'out') among operatives, then their device tokens.
    const { data: latestCheckins } = await admin
      .from('checkins')
      .select('user_id, type, ts')
      .order('ts', { ascending: false });
    const seen = new Set<string>();
    const stillIn: string[] = [];
    (latestCheckins || []).forEach((c: { user_id: string; type: string }) => {
      if (seen.has(c.user_id)) return;
      seen.add(c.user_id);
      if (c.type === 'in') stillIn.push(c.user_id);
    });

    if (!stillIn.length) {
      return new Response(JSON.stringify({ ok: true, sent: 0, reason: 'nobody currently checked in' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: operatives } = await admin.from('profiles').select('id, role').in('id', stillIn).eq('role', 'operative');
    const operativeIds = (operatives || []).map((p: { id: string }) => p.id);
    if (!operativeIds.length) {
      return new Response(JSON.stringify({ ok: true, sent: 0, reason: 'nobody eligible' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: tokens } = await admin.from('push_tokens').select('token, platform').in('user_id', operativeIds);
    if (!tokens || !tokens.length) {
      return new Response(JSON.stringify({ ok: true, sent: 0, reason: 'no registered devices' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const auth = new GoogleAuth({ credentials: serviceAccount, scopes: ['https://www.googleapis.com/auth/firebase.messaging'] });
    const client = await auth.getClient();
    const accessTokenResp = await client.getAccessToken();
    const accessToken = typeof accessTokenResp === 'string' ? accessTokenResp : accessTokenResp?.token;
    if (!accessToken) throw new Error('Could not obtain Firebase access token');

    let sent = 0; let failed = 0;
    for (const t of tokens) {
      try {
        const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: {
              token: t.token,
              notification: { title: 'OpHUB', body: "Don't forget to sign out for the day!" },
              android: { priority: 'high' },
              // iOS delivery via APNs (bridged through FCM — see the file-level
              // comment). alert/sound/badge live under aps; without this block
              // FCM still auto-fills a basic alert from `notification` above,
              // but this gives us an explicit sound and a background-safe
              // priority so it reliably shows a banner even if the app isn't
              // in the foreground.
              apns: {
                headers: { 'apns-priority': '10' },
                payload: { aps: { alert: { title: 'OpHUB', body: "Don't forget to sign out for the day!" }, sound: 'default' } },
              },
            },
          }),
        });
        if (res.ok) sent++; else failed++;
      } catch (_e) { failed++; }
    }

    return new Response(JSON.stringify({ ok: true, sent, failed }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
