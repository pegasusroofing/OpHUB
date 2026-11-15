import { createClient } from 'npm:@supabase/supabase-js@2';
import { GoogleAuth } from 'npm:google-auth-library@9';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

function ok(obj: Record<string, unknown>) {
  return new Response(JSON.stringify({ ok: true, ...obj }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// #notif-review-2026-09: previously a total gap — "Personal certification/
// qualification about to expire" had nobody told at all. Daily cron. Any
// operative_certifications row tied to a real operative (operative_id set —
// a manual_person_id row has no app user to push to, so those are skipped)
// whose expiry_date falls within the next 30 days gets exactly ONE push,
// ever, to that operative — expiry_notified_at is stamped the moment it
// fires so it's never repeated daily for the same document.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const CRON_SECRET = Deno.env.get('CRON_SECRET');
    const provided = req.headers.get('x-cron-secret') || '';
    if (!CRON_SECRET || provided !== CRON_SECRET) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    const today = new Date();
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(today);
    const cutoff = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000));

    const { data: due } = await admin.from('operative_certifications')
      .select('id, operative_id, name, category, expiry_date')
      .not('operative_id', 'is', null)
      .not('expiry_date', 'is', null)
      .is('expiry_notified_at', null)
      .gte('expiry_date', todayStr)
      .lte('expiry_date', cutoff);

    if (!due || !due.length) return ok({ due: 0, sent: 0 });

    const FIREBASE_SERVICE_ACCOUNT_JSON = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON');
    if (!FIREBASE_SERVICE_ACCOUNT_JSON) return ok({ due: due.length, sent: 0, reason: 'FIREBASE_SERVICE_ACCOUNT_JSON not set' });
    const serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON);
    const projectId = serviceAccount.project_id;
    const auth = new GoogleAuth({ credentials: serviceAccount, scopes: ['https://www.googleapis.com/auth/firebase.messaging'] });
    const client = await auth.getClient();
    const accessTokenResp = await client.getAccessToken();
    const accessToken = typeof accessTokenResp === 'string' ? accessTokenResp : accessTokenResp?.token;
    if (!accessToken) throw new Error('Could not obtain Firebase access token');

    let sent = 0; let failed = 0;
    for (const c of due) {
      const { data: tokens } = await admin.from('push_tokens').select('token').eq('user_id', c.operative_id);
      const fmtDate = new Date(c.expiry_date + 'T00:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
      const title = 'Certification expiring soon';
      const bodyText = `${c.name || c.category || 'Your certification'} expires ${fmtDate} — renew it before then.`;
      let anySent = false;
      for (const t of (tokens || [])) {
        try {
          const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: {
                token: t.token,
                notification: { title, body: bodyText },
                data: { kind: 'cert_expiring', cert_id: c.id },
                android: { priority: 'high' },
                apns: { headers: { 'apns-priority': '10' }, payload: { aps: { alert: { title, body: bodyText }, sound: 'default' } } },
              },
            }),
          });
          if (res.ok) { sent++; anySent = true; } else failed++;
        } catch (_e) { failed++; }
      }
      // Stamp as notified even with zero registered devices — otherwise this
      // row would be re-queried (and, once they DO register a device, could
      // fire retroactively) every day until the cert itself expires.
      await admin.from('operative_certifications').update({ expiry_notified_at: new Date().toISOString() }).eq('id', c.id);
      void anySent;
    }

    return ok({ due: due.length, sent, failed });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
