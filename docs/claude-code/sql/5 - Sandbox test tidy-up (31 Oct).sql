-- Removes what the 31 Oct button test added to SANDBOX ROOFING only.
-- Paste into Supabase > SQL Editor and press Run. It is safe to run twice.
-- It removes the job "ZZ TEST JOB - safe to delete" with everything on it, and the 12 company-list rows the test added.
-- Each delete names the Sandbox company as well as the row, so no other company can be touched.
-- If anything goes wrong, the whole file is undone.

begin;

-- This one would otherwise stay behind when the job goes.
delete from price_builder_sheets
 where site_id = 'f4bda52b-7428-4652-926a-7da5ad5ef4d1'
   and org_id = '2eb072b7-2704-48c0-8110-62e45e621ded';

-- The job. Its tasks, snags, to-dos, calendar entry, repair job, RAMS draft, O&M manual, drawing folder,
-- handover document, HAVS tool link and waste flag all go with it.
delete from sites
 where id = 'f4bda52b-7428-4652-926a-7da5ad5ef4d1'
   and org_id = '2eb072b7-2704-48c0-8110-62e45e621ded'
   and name = 'ZZ TEST JOB - safe to delete';

-- Company lists.
delete from rams_library_items where org_id = '2eb072b7-2704-48c0-8110-62e45e621ded' and id in (
  '3c42ebee-8aee-4499-bd3c-bf45878726bd', 'b7cd0763-2a0a-49e0-9f28-2e0c8d3a4577',
  '1c5d5b9d-a296-446e-9480-2f56ef129235', 'abaf7c3f-b877-4fc6-aad8-27c99a6b5e2b');
delete from report_templates where org_id = '2eb072b7-2704-48c0-8110-62e45e621ded' and id in (
  '4c2a8ae5-f440-46f4-9964-fe111fa4e0a3', '3e84cc77-37c2-42f7-ae39-096905920957',
  'f37dfd22-f1be-44c2-801e-adbb369b54d1');
delete from yard_stock where org_id = '2eb072b7-2704-48c0-8110-62e45e621ded' and id = '010949c5-5b22-4272-b115-b103179b2f4a';
delete from subcontractor_company_profiles where org_id = '2eb072b7-2704-48c0-8110-62e45e621ded' and id = 'f4f0ab4e-f557-411d-a3cd-6fa7365bfcd2';
delete from suppliers where org_id = '2eb072b7-2704-48c0-8110-62e45e621ded' and id = 'ea85b608-9dd3-4261-b131-09772ff078a8';
delete from havs_tools where org_id = '2eb072b7-2704-48c0-8110-62e45e621ded' and id = '02a9b91b-b25e-4daa-823d-ea8a5b072263';
delete from price_rate_items where org_id = '2eb072b7-2704-48c0-8110-62e45e621ded' and id = '655a295e-6891-4b55-b016-3c908cc91da4';

commit;
