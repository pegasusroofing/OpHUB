import { createClient } from 'npm:@supabase/supabase-js@2';

// Daily tidy-up of expense receipts. Each company keeps receipts for
// organizations.expenses_retention_months (3, 6, 9 or 12 - default 3); any
// expense entry older than that is removed from the app along with its
// uploaded receipt files. Emails already sent to the office are untouched.
// verify_jwt is off; the cron secret header is checked instead (same as the
// other scheduled functions). Body option, for testing with the secret:
//   { "dry_run": true } - count what would go, delete nothing
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const ALLOWED = [3, 6, 9, 12];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const CRON_SECRET = Deno.env.get('CRON_SECRET');
    if (!CRON_SECRET || (req.headers.get('x-cron-secret') || '') !== CRON_SECRET) return json({ error: 'Forbidden' }, 403);
    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dry_run === true;

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: orgs } = await admin.from('organizations').select('id, expenses_retention_months');
    let rowsGone = 0, filesGone = 0;
    const perOrg: any[] = [];

    for (const org of orgs || []) {
      const months = ALLOWED.includes(Number(org.expenses_retention_months)) ? Number(org.expenses_retention_months) : 3;
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - months);
      let orgRows = 0, orgFiles = 0;
      // Work through in pages so a big backlog can't time the run out.
      for (let page = 0; page < 20; page++) {
        const { data: rows } = await admin.from('expenses').select('id, file_paths').eq('org_id', org.id).lt('created_at', cutoff.toISOString()).order('created_at', { ascending: true }).range(dryRun ? page * 200 : 0, (dryRun ? page * 200 : 0) + 199);
        if (!rows || !rows.length) break;
        // Only this company's own expense uploads are ever removed.
        const paths = rows.flatMap((r) => Array.isArray(r.file_paths) ? r.file_paths : []).map((p) => String(p || '')).filter((p) => p.startsWith(`expenses/${org.id}/`) && !p.includes('..'));
        orgRows += rows.length; orgFiles += paths.length;
        if (!dryRun) {
          for (let i = 0; i < paths.length; i += 100) {
            const { error } = await admin.storage.from('site-photos').remove(paths.slice(i, i + 100));
            if (error) console.error('file remove failed', error.message);
          }
          const { error: delErr } = await admin.from('expenses').delete().in('id', rows.map((r) => r.id));
          if (delErr) { console.error('row delete failed', delErr.message); break; }
        }
        if (rows.length < 200) break;
      }
      rowsGone += orgRows; filesGone += orgFiles;
      if (orgRows) perOrg.push({ org: org.id, months, entries: orgRows, files: orgFiles });
    }
    return json({ ok: true, dry_run: dryRun, entries: rowsGone, files: filesGone, perOrg });
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});
