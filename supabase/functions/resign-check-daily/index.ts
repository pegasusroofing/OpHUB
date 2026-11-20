import { createClient } from 'npm:@supabase/supabase-js@2';
import { GoogleAuth } from 'npm:google-auth-library@9';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

function ok(obj: Record<string, unknown>) {
  return new Response(JSON.stringify({ ok: true, ...obj }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// Called daily by a pg_cron job (see migration). RAMS and COSHH documents on
// LIVE (active) sites must be re-signed by everyone every 12 months. This
// job finds any current document whose resign cycle has gone overdue on an
// active site, advances its resign_cycle_start by 12 months (which is what
// makes the client treat every existing signature on it as stale again — see
// filterCurrentCycleSigs in app.html), and pushes one notification per site
// to that org's PMs/admins. Closed sites are never queried here at all, so a
// finished job never generates a re-sign requirement or notification.
//
// The H&S Policy document (org-wide, not per-site) works the same way but on
// its own explicit expiry_date rather than a fixed +12-months-from-upload:
// whoever uploads it picks the expiry (the app defaults that to 12 months
// out, but a manager can shorten/lengthen it). When expiry_date arrives,
// this job advances resign_cycle_start to that expiry date (so every
// existing signature — even ones from people who signed the day before —
// becomes stale and the app's compulsory sign-in gate reopens for everyone),
// pushes the expiry_date forward another 12 months, and notifies that org's
// PMs/admins that an updated policy is required.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const CRON_SECRET = Deno.env.get('CRON_SECRET');
    const provided = req.headers.get('x-cron-secret') || '';
    if (!CRON_SECRET || provided !== CRON_SECRET) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    // Only ever run once per UTC calendar day, even though pg_cron may call
    // this more than once around the scheduled time.
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
    const { error: runErr } = await admin.from('notification_runs').insert({ kind: 'resign_check_daily', run_date: today });
    if (runErr) return ok({ skipped: 'already run today' });

    const { data: activeSites } = await admin.from('sites').select('id, name, org_id').eq('status', 'active');
    const siteIds = (activeSites || []).map((s) => s.id);
    const siteById: Record<string, { id: string; name: string; org_id: string }> = {};
    (activeSites || []).forEach((s) => { siteById[s.id] = s; });

    const nowIso = new Date().toISOString();
    const overdueBySite: Record<string, { rams: string[]; coshh: string[] }> = {};

    async function processDocs(table: 'rams_docs' | 'coshh_docs', label: 'rams' | 'coshh') {
      if (!siteIds.length) return;
      let q = admin.from(table).select('id, site_id, name, uploaded_at, resign_cycle_start').in('site_id', siteIds).is('signing_closed_at', null); // closed for signing = never re-signed (20 Nov 2026)
      if (table === 'rams_docs') q = q.eq('status', 'current');
      const { data: docs } = await q;
      for (const d of (docs || [])) {
        const start = new Date(d.resign_cycle_start || d.uploaded_at);
        const due = new Date(start);
        due.setFullYear(due.getFullYear() + 1);
        if (due.getTime() <= Date.now()) {
          await admin.from(table).update({ resign_cycle_start: due.toISOString(), last_resign_notified_at: nowIso }).eq('id', d.id);
          if (!overdueBySite[d.site_id]) overdueBySite[d.site_id] = { rams: [], coshh: [] };
          overdueBySite[d.site_id][label].push(d.name);
        }
      }
    }
    await processDocs('rams_docs', 'rams');
    await processDocs('coshh_docs', 'coshh');

    // ---- H&S Policy expiry (org-wide) ----
    const overdueOrgIds: string[] = [];
    const overduePolicyNames: Record<string, string> = {};
    {
      const { data: policies } = await admin.from('hs_policy_docs').select('id, org_id, name, expiry_date').eq('status', 'current').not('expiry_date', 'is', null);
      for (const p of (policies || [])) {
        const expiry = new Date(p.expiry_date + 'T00:00:00Z');
        if (expiry.getTime() <= Date.now()) {
          const nextExpiry = new Date(expiry);
          nextExpiry.setFullYear(nextExpiry.getFullYear() + 1);
          await admin.from('hs_policy_docs').update({
            resign_cycle_start: expiry.toISOString(),
            expiry_date: nextExpiry.toISOString().slice(0, 10),
            last_expiry_notified_at: nowIso,
          }).eq('id', p.id);
          overdueOrgIds.push(p.org_id);
          overduePolicyNames[p.org_id] = p.name;
        }
      }
    }

    const overdueSiteIds = Object.keys(overdueBySite);
    if (!overdueSiteIds.length && !overdueOrgIds.length) return ok({ overdueSites: 0, overduePolicies: 0 });

    const orgIds = [...new Set([...overdueSiteIds.map((id) => siteById[id].org_id), ...overdueOrgIds])];
    const { data: recipients } = await admin.from('profiles').select('id, org_id').in('org_id', orgIds).in('role', ['pm', 'admin']);
    const recipientsByOrg: Record<string, string[]> = {};
    (recipients || []).forEach((r) => { (recipientsByOrg[r.org_id] = recipientsByOrg[r.org_id] || []).push(r.id); });

    const FIREBASE_SERVICE_ACCOUNT_JSON = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON');
    if (!FIREBASE_SERVICE_ACCOUNT_JSON) return ok({ overdueSites: overdueSiteIds.length, overduePolicies: overdueOrgIds.length, sent: 0, reason: 'FIREBASE_SERVICE_ACCOUNT_JSON not set' });
    const serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON);
    const projectId = serviceAccount.project_id;

    const auth = new GoogleAuth({ credentials: serviceAccount, scopes: ['https://www.googleapis.com/auth/firebase.messaging'] });
    const client = await auth.getClient();
    const accessTokenResp = await client.getAccessToken();
    const accessToken = typeof accessTokenResp === 'string' ? accessTokenResp : accessTokenResp?.token;
    if (!accessToken) throw new Error('Could not obtain Firebase access token');

    async function pushToOrgManagers(orgId: string, title: string, bodyText: string, dataKind: string) {
      const orgRecipients = recipientsByOrg[orgId] || [];
      if (!orgRecipients.length) return { sent: 0, failed: 0 };
      const { data: tokens } = await admin.from('push_tokens').select('token').in('user_id', orgRecipients);
      let sent = 0; let failed = 0;
      for (const t of (tokens || [])) {
        try {
          const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: {
                token: t.token,
                notification: { title, body: bodyText },
                data: { kind: dataKind, org_id: orgId },
                android: { priority: 'high' },
                apns: {
                  headers: { 'apns-priority': '10' },
                  payload: { aps: { alert: { title, body: bodyText }, sound: 'default' } },
                },
              },
            }),
          });
          if (res.ok) sent++; else failed++;
        } catch (_e) { failed++; }
      }
      return { sent, failed };
    }

    let sent = 0; let failed = 0;
    for (const siteId of overdueSiteIds) {
      const site = siteById[siteId];
      const bucket = overdueBySite[siteId];
      const total = bucket.rams.length + bucket.coshh.length;
      const parts: string[] = [];
      if (bucket.rams.length) parts.push(`${bucket.rams.length} RAMS`);
      if (bucket.coshh.length) parts.push(`${bucket.coshh.length} COSHH`);
      const title = 'Annual re-sign required';
      const bodyText = `${parts.join(' and ')} document${total === 1 ? '' : 's'} at ${site.name} ${total === 1 ? 'is' : 'are'} due for a fresh 12-month sign-off.`;
      const r = await pushToOrgManagers(site.org_id, title, bodyText, 'resign_reminder');
      sent += r.sent; failed += r.failed;
    }
    for (const orgId of overdueOrgIds) {
      const title = 'Updated H&S Policy required';
      const bodyText = `"${overduePolicyNames[orgId]}" has reached its annual review date — everyone needs to sign the policy again.`;
      const r = await pushToOrgManagers(orgId, title, bodyText, 'hs_policy_expiry');
      sent += r.sent; failed += r.failed;
    }

    return ok({ overdueSites: overdueSiteIds.length, overduePolicies: overdueOrgIds.length, sent, failed });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
