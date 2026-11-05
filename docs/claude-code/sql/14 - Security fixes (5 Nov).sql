-- ==========================================================================================
-- OpHUB security fixes (written 5 Nov 2026 from the overnight security review).
-- PART A WAS RUN ON 5 Nov 2026 (Andy said go ahead), as migration security_fixes_5nov_part_a. Checked: all
-- three rules in place, Xero token tables closed, and an operative can no longer approve their own plant
-- (tested on Sandbox, rolled back). Part B has NOT been run.
-- How to run: Supabase > SQL Editor > New query, paste this whole file, press Run.
-- Part A runs as one block: if any line fails, nothing changes. Safe to run twice.
-- Part B (at the bottom) is commented out on purpose: each item needs your go-ahead first.
-- Nothing here deletes data or changes how the apps look.
-- ==========================================================================================

begin;

-- ------------------------------------------------------------------------------------------
-- A1. Price files: the "who can open a price file" rule never matched anything.
-- The 25 Oct rule compares the job id with the job's NAME instead of the file's folder
-- (Postgres picked sites.name over the file's name). Result: nobody can read price files
-- directly, so deleting a price file from the app quietly leaves the file behind (one is
-- left over now). The Price tile still opens files through the price-file-access server
-- step, so nothing is broken for users. This adds the rule as it was meant to be.
-- (The old, broken rule is left in place; it does no harm. Part B can remove it.)
-- ------------------------------------------------------------------------------------------
drop policy if exists "select price files storage (fixed 5 Nov)" on storage.objects;
create policy "select price files storage (fixed 5 Nov)" on storage.objects
  for select to authenticated using (
    bucket_id = 'price-files' and exists (
      select 1 from public.sites s
       where s.id::text = (storage.foldername(objects.name))[1]
         and s.org_id = public.my_org_id()
         and ( public.is_pm_or_admin() or public.is_finance()
            or exists (select 1 from public.site_price_access pa where pa.site_id = s.id and pa.user_id = auth.uid())
            or exists (select 1 from public.site_labour_invoice_access la where la.site_id = s.id and la.user_id = auth.uid()))));

-- ------------------------------------------------------------------------------------------
-- A2. Plant sign-off: an operative could sign off their own plant.
-- The plant_checkouts rule lets an operative edit their own row, with no field guard. So
-- with a little know-how they could mark a check-out as approved or a return as accepted,
-- and put a manager's name on it. This guard (same idea as guard_manager_fields) keeps
-- the manager-only fields as they were when a non-manager edits the row directly.
-- Left alone: managers, and the plant_* server steps (plant_accept, plant_return, ...),
-- which run as the database owner. An operative can still ask to return plant
-- (check-in "pending sign-off" with photo and notes), as both apps do today.
-- "security invoker" on purpose, so current_user tells a direct app call apart from a
-- plant_* server step.
-- ------------------------------------------------------------------------------------------
create or replace function public.plant_checkouts_guard() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') or auth.uid() is null
     or public.is_pm() or public.is_superadmin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    -- a new request from an operative always starts unsigned and waiting for a manager
    new.checkout_status := 'pending_signoff';
    new.checkout_signed_by := null; new.checkout_signed_at := null; new.checkout_signature_path := null;
    new.allocated_by := null; new.allocated_at := null;
    new.op_signed_at := null; new.op_signature_path := null;
    new.checkin_status := null; new.checkin_signed_by := null; new.checkin_signed_at := null;
    new.checkin_signature_path := null; new.checkin_op_signed_at := null; new.checkin_op_signature_path := null;
    new.returned_by := null; new.return_to_site_id := null;
    return new;
  end if;
  -- UPDATE by a non-manager: who, what and every signature stay as they were
  new.org_id := old.org_id; new.plant_item_id := old.plant_item_id; new.site_id := old.site_id;
  new.operative_id := old.operative_id; new.checklist_answers := old.checklist_answers;
  new.requested_at := old.requested_at; new.note := old.note;
  new.checkout_status := old.checkout_status;
  new.checkout_signed_by := old.checkout_signed_by; new.checkout_signed_at := old.checkout_signed_at;
  new.checkout_signature_path := old.checkout_signature_path;
  new.allocated_by := old.allocated_by; new.allocated_at := old.allocated_at;
  new.op_signed_at := old.op_signed_at; new.op_signature_path := old.op_signature_path;
  new.checkin_signed_by := old.checkin_signed_by; new.checkin_signed_at := old.checkin_signed_at;
  new.checkin_signature_path := old.checkin_signature_path;
  new.checkin_op_signed_at := old.checkin_op_signed_at; new.checkin_op_signature_path := old.checkin_op_signature_path;
  new.returned_by := old.returned_by; new.return_to_site_id := old.return_to_site_id;
  -- the only status an operative may set is "asking to return it", and only while it is out
  if new.checkin_status is distinct from old.checkin_status then
    if not (new.checkin_status = 'pending_signoff' and old.checkout_status = 'checked_out'
            and coalesce(old.checkin_status, '') in ('', 'declined')) then
      new.checkin_status := old.checkin_status;
      new.checkin_requested_at := old.checkin_requested_at;
      new.checkin_photo_path := old.checkin_photo_path;
      new.checkin_notes := old.checkin_notes;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.plant_checkouts_guard() from public, anon, authenticated;
drop trigger if exists zz_plant_checkouts_guard on public.plant_checkouts;
create trigger zz_plant_checkouts_guard before insert or update on public.plant_checkouts
  for each row execute function public.plant_checkouts_guard();

-- ------------------------------------------------------------------------------------------
-- A3. Messages: a message could name a job or a person from ANOTHER company.
-- The insert rule checks the message's company, but not that its job (site_id) or its
-- one-person recipient (recipient_id) is in that company. The push step then sends to
-- that job's PM / team, or that person, in the other company. Checked live: none of the
-- 450 messages so far break this rule, so nothing the apps do today is affected.
-- "restrictive" = an extra condition on top of the existing rules, not a replacement.
-- ------------------------------------------------------------------------------------------
drop policy if exists "same company job and recipient" on public.messages;
create policy "same company job and recipient" on public.messages as restrictive
  for insert to authenticated with check (
    public.site_in_my_org(site_id)
    and (recipient_id is null
         or exists (select 1 from public.profiles p where p.id = recipient_id and p.org_id = public.my_org_id())));

-- ------------------------------------------------------------------------------------------
-- A4. Two database steps any signed-in person could call directly, with no company check.
--  - link_manual_operative_to(manual, profile, false): skips the "managers only" check, so
--    anyone could join a manual operative's certificates to a login. The app never calls
--    it; it uses link_manual_operative(...) (which still works) and the sign-up trigger.
--  - plant_open_checkout(item): returns a checkout id for any company's plant item. Only
--    used inside plant_allocate and delivery_plant_apply, which keep working.
-- ------------------------------------------------------------------------------------------
revoke execute on function public.link_manual_operative_to(uuid, uuid, boolean) from public, anon, authenticated;
revoke execute on function public.plant_open_checkout(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------------------------------------
-- A5. Tidy-up (same as batch 3 "L1"): trigger steps added since 25 Oct are callable by
-- signed-in people. Triggers keep firing (that permission is only checked when a trigger
-- is created); this just stops them being called on their own.
-- ------------------------------------------------------------------------------------------
revoke execute on function public.checkin_device_guard() from public, anon, authenticated;
revoke execute on function public.delivery_driver_off_check() from public, anon, authenticated;
revoke execute on function public.delivery_plant_apply() from public, anon, authenticated;
revoke execute on function public.delivery_task_grn_on_complete() from public, anon, authenticated;
revoke execute on function public.delivery_task_link_guard() from public, anon, authenticated;
revoke execute on function public.guard_variation_value_insert() from public, anon, authenticated;
revoke execute on function public.profiles_finance_only_guard() from public, anon, authenticated;
revoke execute on function public.report_briefing_lock() from public, anon, authenticated;
revoke execute on function public.yard_in_extras() from public, anon, authenticated;

-- ------------------------------------------------------------------------------------------
-- A6. Xero logins: belt and braces. xero_connections holds each company's Xero access and
-- refresh tokens. Table rules already block every app user (no rule = no rows), but the
-- table permission is still granted. This removes it, so a future rule added by mistake
-- can't expose the tokens. Only the xero server step reads it (with the service key).
-- ------------------------------------------------------------------------------------------
revoke all on table public.xero_connections from anon, authenticated;
revoke all on table public.xero_oauth_states from anon, authenticated;

commit;

-- Check (should show 1 row each):
select 'price files rule' as what, count(*) from pg_policies where policyname = 'select price files storage (fixed 5 Nov)'
union all select 'plant guard', count(*) from pg_trigger where tgname = 'zz_plant_checkouts_guard'
union all select 'messages rule', count(*) from pg_policies where policyname = 'same company job and recipient';

-- UNDO for A2 / A3 if anything stops working (run on its own):
-- drop trigger if exists zz_plant_checkouts_guard on public.plant_checkouts;
-- drop policy if exists "same company job and recipient" on public.messages;


-- ==========================================================================================
-- PART B: needs your go-ahead. Each line is commented out. To run one, remove the "-- "
-- at the start of its line(s) and run just that bit.
-- ==========================================================================================

-- B1. Old copy of the app in the public "webapp" bucket (rtb-app-live_6.html). Anyone can
-- download it and list the bucket. Nothing uses it (batch 3, M9). This makes it private;
-- the file is kept, not deleted.
-- update storage.buckets set public = false where id = 'webapp';
-- drop policy if exists "public read webapp" on storage.objects;

-- B2. Anyone (not signed in) can LIST the org-logos bucket, which shows every company's id.
-- Logos still show in emails and on the login page without this rule (the bucket stays
-- public). Test the login page and one email logo afterwards.
-- drop policy if exists "public read org logos" on storage.objects;

-- B3. The broken price-files rule from A1 (harmless, just clutter). Only after A1 has run.
-- drop policy if exists "select price files storage" on storage.objects;

-- B4. Two open "anyone with the link can join" invites last until 2036. Anyone who gets
-- the link joins that company as an operative or driver and can see its team list,
-- suppliers, plant and company-wide messages. Better: expire them in Admin Centre and
-- make new ones when needed. Or, to cut them to 90 days from today:
-- update public.invites set expires_at = least(expires_at, now() + interval '90 days')
--  where is_reusable and email is null and expires_at > now() + interval '90 days';

-- B5. The private-bucket switch is still sql/4 (after the phone apps are rebuilt).
