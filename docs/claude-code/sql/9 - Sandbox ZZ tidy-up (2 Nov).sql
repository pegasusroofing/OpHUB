-- RUN ON 8 Nov 2026 (Andy: "can you do all the sql that are outstanding"). Checked after: the 7 jobs, 4 ZZ RAMS drafts and the
-- Money due test setting are gone; ZZ JOB Fin A, Fin B, Fin C, Pack Test and Regular stay. Do not paste again.
-- Removes the ZZ test jobs nothing uses any more, from SANDBOX ROOFING only. Use this instead of file 5.
-- Paste into Supabase > SQL Editor and press Run. It is safe to run twice. If anything goes wrong, the whole file is undone.
--
-- Goes, with everything on them: ZZ TEST JOB, ZZ JOB Repair, Multi, Main Contractor, Quote Won, Quote Won B and Flow C.
-- Also goes: the test "ZZ RAMS ..." drafts, and the auto-run test setting on Money due.
-- Stays, because the tests still use them: ZZ JOB Fin A, Fin B, Fin C, Regular and Pack Test.
-- Every delete names the Sandbox company, so no other company can be touched.
-- Not trial-run: delete statements need your go-ahead, so this has not been run yet.

begin;

delete from price_builder_sheets
 where org_id = '2eb072b7-2704-48c0-8110-62e45e621ded'
   and site_id in (select id from sites where org_id = '2eb072b7-2704-48c0-8110-62e45e621ded'
     and name in ('ZZ TEST JOB - safe to delete', 'ZZ JOB Repair', 'ZZ JOB Multi', 'ZZ JOB Main Contractor', 'ZZ JOB Quote Won', 'ZZ JOB Quote Won B', 'ZZ JOB Flow C'));

-- Finance records on these jobs would otherwise stop the jobs being removed.
do $$
declare t text;
begin
  foreach t in array array['fin_quote_items', 'fin_quotes', 'fin_sub_apps', 'fin_subcontracts', 'fin_dayworks', 'fin_variations', 'fin_job_budgets', 'fin_job_costs', 'fin_shop_items'] loop
    execute format($q$delete from public.%I where site_id in (select id from public.sites where org_id = '2eb072b7-2704-48c0-8110-62e45e621ded'
      and name in ('ZZ TEST JOB - safe to delete', 'ZZ JOB Repair', 'ZZ JOB Multi', 'ZZ JOB Main Contractor', 'ZZ JOB Quote Won', 'ZZ JOB Quote Won B', 'ZZ JOB Flow C'))$q$, t);
  end loop;
end $$;

delete from sites
 where org_id = '2eb072b7-2704-48c0-8110-62e45e621ded'
   and name in ('ZZ TEST JOB - safe to delete', 'ZZ JOB Repair', 'ZZ JOB Multi', 'ZZ JOB Main Contractor', 'ZZ JOB Quote Won', 'ZZ JOB Quote Won B', 'ZZ JOB Flow C');

delete from rams_builds
 where site_id in (select id from sites where org_id = '2eb072b7-2704-48c0-8110-62e45e621ded')
   and title like 'ZZ RAMS %' and status is distinct from 'issued';

delete from fin_report_schedules where org_id = '2eb072b7-2704-48c0-8110-62e45e621ded' and report_id = 'moneydue';

commit;
