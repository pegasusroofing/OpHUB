import { createClient } from 'npm:@supabase/supabase-js@2';
import { GoogleAuth } from 'npm:google-auth-library@9';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

// Daily cron — a single consolidated PUSH per PM/admin covering the items on
// their Notifications tab that are genuinely push-shaped (quick to glance
// at, no compliance paperwork attached): open snagging, unread messages, and
// to-dos allocated to them. TBT and RAMS/COSHH are deliberately left out —
// those go by EMAIL instead (see tbt-monthly-reminder and
// rams-coshh-nudge), since they're compliance-relevant and shouldn't be
// something a push notification lets someone swipe away and forget.
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

    const FIREBASE_SERVICE_ACCOUNT_JSON = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON');
    if (!FIREBASE_SERVICE_ACCOUNT_JSON) {
      return new Response(JSON.stringify({ ok: true, notified: 0, reason: 'FIREBASE_SERVICE_ACCOUNT_JSON not set' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON);
    const projectId = serviceAccount.project_id;
    const auth = new GoogleAuth({ credentials: serviceAccount, scopes: ['https://www.googleapis.com/auth/firebase.messaging'] });
    const client = await auth.getClient();
    const accessTokenResp = await client.getAccessToken();
    const accessToken = typeof accessTokenResp === 'string' ? accessTokenResp : accessTokenResp?.token;
    if (!accessToken) throw new Error('Could not obtain Firebase access token');

    const { data: sites } = await admin.from('sites').select('id, org_id, name, responsible_pm_id').in('status', ['active', 'live']);
    if (!sites || !sites.length) {
      return new Response(JSON.stringify({ ok: true, notified: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const siteIds = sites.map((s) => s.id);
    const siteById: Record<string, any> = {}; sites.forEach((s) => { siteById[s.id] = s; });

    const { data: assignments } = await admin.from('site_assignments').select('site_id, user_id').in('site_id', siteIds);
    const { data: openSnags } = await admin.from('snags').select('site_id').eq('status', 'open').in('site_id', siteIds);
    const { data: openTodos } = await admin.from('todos').select('site_id, assigned_to').eq('done', false).in('site_id', siteIds);
    const orgIds = [...new Set(sites.map((s) => s.org_id).filter(Boolean))];
    const { data: allPmProfiles } = orgIds.length ? await admin.from('profiles').select('id, org_id, role').in('role', ['pm', 'admin']).in('org_id', orgIds) : { data: [] as any[] };

    // Which sites is each PM "on" — same union rule the client's
    // computeNotificationRows uses: responsible_pm_id OR a site_assignments row.
    const pmSiteIds: Record<string, Set<string>> = {};
    (allPmProfiles || []).forEach((p: any) => { pmSiteIds[p.id] = new Set(); });
    sites.forEach((s) => { if (s.responsible_pm_id && pmSiteIds[s.responsible_pm_id]) pmSiteIds[s.responsible_pm_id].add(s.id); });
    (assignments || []).forEach((a: any) => { if (pmSiteIds[a.user_id]) pmSiteIds[a.user_id].add(a.site_id); });

    const snagsBySite: Record<string, number> = {};
    (openSnags || []).forEach((s: any) => { snagsBySite[s.site_id] = (snagsBySite[s.site_id] || 0) + 1; });
    const myTodosByPmSite: Record<string, number> = {}; // `${pmId}:${siteId}` -> count
    (openTodos || []).forEach((t: any) => { if (t.assigned_to) { const k = t.assigned_to + ':' + t.site_id; myTodosByPmSite[k] = (myTodosByPmSite[k] || 0) + 1; } });

    // Unread messages, per PM per site — mirrors unreadCountForSiteForUser on
    // the client. Company-wide messages (site_id null) count on every site a
    // PM is on, same as there.
    const { data: managerMsgs } = await admin.from('messages').select('id, site_id, sender_id').eq('audience', 'managers');
    const msgsBySite: Record<string, { id: string; sender_id: string }[]> = {};
    const companyWideMsgs: { id: string; sender_id: string }[] = [];
    (managerMsgs || []).forEach((m: any) => {
      if (m.site_id) { (msgsBySite[m.site_id] = msgsBySite[m.site_id] || []).push(m); }
      else companyWideMsgs.push(m);
    });
    const allMsgIds = (managerMsgs || []).map((m: any) => m.id);
    const { data: allReads } = allMsgIds.length ? await admin.from('message_reads').select('message_id, user_id').in('message_id', allMsgIds) : { data: [] as any[] };
    const readsByUser: Record<string, Set<string>> = {};
    (allReads || []).forEach((r: any) => { (readsByUser[r.user_id] = readsByUser[r.user_id] || new Set()).add(r.message_id); });

    let notified = 0;
    for (const pmId of Object.keys(pmSiteIds)) {
      const mySites = [...pmSiteIds[pmId]];
      if (!mySites.length) continue;
      let snagsTotal = 0, todosTotal = 0, unreadTotal = 0;
      for (const siteId of mySites) {
        snagsTotal += snagsBySite[siteId] || 0;
        todosTotal += myTodosByPmSite[pmId + ':' + siteId] || 0;
        const readSet = readsByUser[pmId] || new Set();
        const siteMsgs = (msgsBySite[siteId] || []).concat(companyWideMsgs);
        unreadTotal += siteMsgs.filter((m) => m.sender_id !== pmId && !readSet.has(m.id)).length;
      }
      if (!snagsTotal && !todosTotal && !unreadTotal) continue;

      const { data: tokens } = await admin.from('push_tokens').select('token').eq('user_id', pmId);
      if (!tokens || !tokens.length) continue;

      const bits: string[] = [];
      if (unreadTotal) bits.push(`${unreadTotal} message${unreadTotal === 1 ? '' : 's'}`);
      if (todosTotal) bits.push(`${todosTotal} task${todosTotal === 1 ? '' : 's'} allocated to you`);
      if (snagsTotal) bits.push(`${snagsTotal} open snag${snagsTotal === 1 ? '' : 's'}`);
      const title = 'You have notifications waiting';
      const body = bits.join(' · ') + ' — open Notifications to see them.';

      for (const t of tokens) {
        try {
          const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: {
                token: (t as any).token,
                notification: { title, body },
                data: { kind: 'pm_notifications_digest' },
                android: { priority: 'high' },
                apns: { headers: { 'apns-priority': '10' }, payload: { aps: { alert: { title, body }, sound: 'default' } } },
              },
            }),
          });
          if (res.ok) notified++;
        } catch (_e) { /* skip this device, keep going */ }
      }
    }

    return new Response(JSON.stringify({ ok: true, checked: Object.keys(pmSiteIds).length, notified }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
