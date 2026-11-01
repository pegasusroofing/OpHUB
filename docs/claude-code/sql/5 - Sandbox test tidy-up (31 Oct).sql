-- Removes what the tests of 31 Oct and 1 Nov added to SANDBOX ROOFING only.
-- Paste into Supabase > SQL Editor and press Run, only once you've finished looking at the test jobs. It is safe to run twice.
-- It removes: the jobs named "ZZ JOB ..." and "ZZ TEST JOB - safe to delete" with everything on them, the records
-- added for the skipped screens, and anything added since 31 Oct to Sandbox's company lists (suppliers, templates and so on).
-- If you added something to those Sandbox lists yourself since 31 Oct, it goes too. Your own job "Andy House" stays. So do the test logins.
-- Every delete names the Sandbox company, so no other company can be touched. If anything goes wrong, the whole file is undone.
-- Not trial-run: delete statements need your go-ahead, so this has not been run yet. Files in storage and the
-- "ZZ JOB ..." folders in OneDrive stay; delete those folders yourself in OneDrive.

begin;

-- These would otherwise stay behind when the jobs go.
delete from price_builder_sheets
 where org_id = '2eb072b7-2704-48c0-8110-62e45e621ded'
   and site_id in (select id from sites where org_id = '2eb072b7-2704-48c0-8110-62e45e621ded' and (name like 'ZZ JOB %' or name = 'ZZ TEST JOB - safe to delete'));
delete from fin_inbox
 where org_id = '2eb072b7-2704-48c0-8110-62e45e621ded' and id::text like 'a0000000-0000-4000-8000-%';
delete from plant_items
 where org_id = '2eb072b7-2704-48c0-8110-62e45e621ded' and created_at >= '2026-10-31';

-- The jobs. Their tasks, photos, snags, variations, RAMS, toolbox talks, COSHH, check-ins, calendar dates, repair jobs,
-- permits, messages and subcontractor records all go with them.
delete from sites
 where org_id = '2eb072b7-2704-48c0-8110-62e45e621ded'
   and (name like 'ZZ JOB %' or name = 'ZZ TEST JOB - safe to delete');

-- Records added for the skipped screens that aren't on a job.
delete from report_submissions where org_id = '2eb072b7-2704-48c0-8110-62e45e621ded' and id::text like 'a0000000-0000-4000-8000-%';
delete from delivery_tasks where org_id = '2eb072b7-2704-48c0-8110-62e45e621ded' and id::text like 'a0000000-0000-4000-8000-%';
delete from subcontractor_applications where org_id = '2eb072b7-2704-48c0-8110-62e45e621ded' and id::text like 'a0000000-0000-4000-8000-%';
delete from fin_labour_rates where org_id = '2eb072b7-2704-48c0-8110-62e45e621ded' and id::text like 'a0000000-0000-4000-8000-%';

-- Company lists.
delete from rams_library_items where org_id = '2eb072b7-2704-48c0-8110-62e45e621ded' and created_at >= '2026-10-31';
delete from report_templates where org_id = '2eb072b7-2704-48c0-8110-62e45e621ded' and created_at >= '2026-10-31';
delete from sign_layout_templates where org_id = '2eb072b7-2704-48c0-8110-62e45e621ded' and created_at >= '2026-10-31';
delete from yard_stock where org_id = '2eb072b7-2704-48c0-8110-62e45e621ded' and created_at >= '2026-10-31';
delete from subcontractor_company_profiles where org_id = '2eb072b7-2704-48c0-8110-62e45e621ded' and created_at >= '2026-10-31';
delete from suppliers where org_id = '2eb072b7-2704-48c0-8110-62e45e621ded' and created_at >= '2026-10-31';
delete from havs_tools where org_id = '2eb072b7-2704-48c0-8110-62e45e621ded' and created_at >= '2026-10-31';
delete from price_rate_items where org_id = '2eb072b7-2704-48c0-8110-62e45e621ded' and created_at >= '2026-10-31';

commit;

-- Added 1 Nov: test quotes on Sandbox (their chaser log goes with them). Other "ZZ ..." library rows from the Finance and
-- admin test are left: they're Sandbox only, and harmless.
delete from quotes where org_id = '2eb072b7-2704-48c0-8110-62e45e621ded' and (client_name like 'ZZ %' or title like 'ZZ %');
