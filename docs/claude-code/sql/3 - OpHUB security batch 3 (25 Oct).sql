-- OpHUB security batch 3 (25 Oct 2026). Paste all of this into Supabase › SQL Editor › New query, then press Run.
-- Safe to run twice. If any line fails, nothing in this file is changed (it all runs as one transaction).
-- Needs batches 1 and 2 to have been run first (they have).
begin;

-- ============================================================================================
-- Storage helpers (used by H3 and M6 below)
-- ============================================================================================

-- M6: who may ADD a file at this path. Your company's folder, your own folder, a named shared
-- folder that has your company in it (company-policies/<company>/, exports/<company>/ ...), or a
-- project of your company (clients: only the projects they are given). The old shared folders
-- general/, exports/ and report-pdfs/ (no company in the path) still accept NEW files, because the
-- phone apps already installed write there until they are rebuilt; deleting or changing a file
-- there is now limited to the person who uploaded it (storage_can_change below).
create or replace function public.storage_path_mine(p_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare s1 text; s2 text; org uuid; uid uuid;
        u constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  uid := auth.uid(); if uid is null then return false; end if;
  org := my_org_id(); if org is null then return false; end if;
  s1 := (storage.foldername(p_name))[1]; s2 := (storage.foldername(p_name))[2];
  if s1 = org::text or s1 = uid::text then return true; end if;
  if s2 = org::text and s1 !~ u then return true; end if;
  if s1 ~ u and exists (select 1 from sites s where s.id = s1::uuid and s.org_id = org) then
    return not is_client() or has_client_view_access(s1::uuid);
  end if;
  if s1 = 'company-library' and s2 ~ u and has_master_company_access(s2::uuid) then return true; end if;
  if s1 in ('general','exports','report-pdfs') then return true; end if;
  return false;
end $$;

-- H3: who may LIST / OPEN (signed link) / overwrite-check a file. Everything in your own company:
-- the company folder, its projects (clients: only theirs), colleagues' signature folders, named
-- shared folders with your company in the path, the subcontractor company library, and any older
-- file (shared folders, deleted projects or people) that was uploaded by someone in your company.
create or replace function public.storage_path_readable(p_name text, p_owner text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare s1 text; s2 text; org uuid; uid uuid;
        u constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  uid := auth.uid(); if uid is null then return false; end if;
  org := my_org_id(); if org is null then return false; end if;
  if p_owner = uid::text then return true; end if;
  s1 := (storage.foldername(p_name))[1]; s2 := (storage.foldername(p_name))[2];
  if s1 = org::text or s1 = uid::text then return true; end if;
  if s2 = org::text and s1 !~ u then return true; end if;
  if s1 ~ u then
    if exists (select 1 from sites s where s.id = s1::uuid and s.org_id = org) then
      return not is_client() or has_client_view_access(s1::uuid);
    end if;
    if exists (select 1 from profiles p where p.id = s1::uuid and p.org_id = org) then return true; end if;
  end if;
  if s1 = 'company-library' and s2 ~ u and has_master_company_access(s2::uuid) then return true; end if;
  if is_client() then return false; end if;
  if p_owner ~ u and exists (select 1 from profiles p where p.id = p_owner::uuid and p.org_id = org) then return true; end if;
  return false;
end $$;

-- H3: a signature image is also readable when you can see a signature record that uses it
-- (keeps the signatures of people who have since left, on old RAMS/COSHH/TBT records, and
-- client signatures from the emailed signing link). Runs with your own permissions on purpose.
create or replace function public.storage_signature_visible(p_name text) returns boolean
language sql stable security invoker set search_path = public as $$
  select exists (select 1 from rams_signatures where signature_image_path = p_name)
      or exists (select 1 from coshh_signatures where signature_image_path = p_name)
      or exists (select 1 from toolbox_talk_signatures where signature_image_path = p_name)
      or exists (select 1 from hs_policy_signatures where signature_image_path = p_name)
      or exists (select 1 from daily_briefing_signatures where signature_image_path = p_name)
      or exists (select 1 from site_layout_signatures where signature_image_path = p_name)
      or exists (select 1 from permit_signoffs where signature_image_path = p_name)
      or exists (select 1 from ppe_issuances where signature_image_path = p_name)
      or exists (select 1 from incident_reports where signature_image_path = p_name)
      or exists (select 1 from rams_client_signatures where signature_path = p_name)
$$;

-- M6: who may DELETE or OVERWRITE a file: the person who uploaded it; anyone for files in their own
-- folder inside the company; a subcontractor admin for their company library; otherwise managers,
-- for files in their own company. Old shared folders with no company in the path: uploader only.
create or replace function public.storage_can_change(p_name text, p_owner text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare s1 text; s2 text; org uuid; uid uuid;
        u constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  uid := auth.uid(); if uid is null then return false; end if;
  if p_owner = uid::text then return true; end if;
  org := my_org_id(); if org is null then return false; end if;
  s1 := (storage.foldername(p_name))[1]; s2 := (storage.foldername(p_name))[2];
  if s1 in ('general','exports','report-pdfs') and s2 is distinct from org::text then return false; end if;
  if s1 = org::text and s2 = uid::text then return true; end if;
  if s1 = 'company-library' and s2 ~ u and has_master_company_access(s2::uuid) and is_subcontractor_admin_of_master(s2::uuid) then return true; end if;
  return is_pm() and storage_path_mine(p_name);
end $$;

-- ============================================================================================
-- H3: listing / opening files is limited to your own company (buckets stay public for now)
-- ============================================================================================
drop policy if exists "signed-in read signatures" on storage.objects;
drop policy if exists "org read signatures" on storage.objects;
create policy "org read signatures" on storage.objects for select to authenticated
  using (bucket_id = 'signatures' and (public.storage_path_readable(name, owner_id) or public.storage_signature_visible(name)));

drop policy if exists "signed-in read incident-photos" on storage.objects;
drop policy if exists "org read incident-photos" on storage.objects;
create policy "org read incident-photos" on storage.objects for select to authenticated
  using (bucket_id = 'incident-photos' and public.storage_path_readable(name, owner_id));

drop policy if exists "signed-in read site-photos" on storage.objects;
drop policy if exists "org read site-photos" on storage.objects;
create policy "org read site-photos" on storage.objects for select to authenticated
  using (bucket_id = 'site-photos' and public.storage_path_readable(name, owner_id));

drop policy if exists "signed-in read rams-docs" on storage.objects;
drop policy if exists "org read rams-docs" on storage.objects;
create policy "org read rams-docs" on storage.objects for select to authenticated
  using (bucket_id = 'rams-docs' and public.storage_path_readable(name, owner_id));

drop policy if exists "signed-in read coshh-docs" on storage.objects;
drop policy if exists "org read coshh-docs" on storage.objects;
create policy "org read coshh-docs" on storage.objects for select to authenticated
  using (bucket_id = 'coshh-docs' and public.storage_path_readable(name, owner_id));

drop policy if exists "signed-in read coshh-library" on storage.objects;
drop policy if exists "org read coshh-library" on storage.objects;
create policy "org read coshh-library" on storage.objects for select to authenticated
  using (bucket_id = 'coshh-library' and public.storage_path_readable(name, owner_id));

drop policy if exists "signed-in read mc-documents" on storage.objects;
drop policy if exists "org read mc-documents" on storage.objects;
create policy "org read mc-documents" on storage.objects for select to authenticated
  using (bucket_id = 'mc-documents' and public.storage_path_readable(name, owner_id));

drop policy if exists "signed-in read drawings" on storage.objects;
drop policy if exists "org read drawings" on storage.objects;
create policy "org read drawings" on storage.objects for select to authenticated
  using (bucket_id = 'drawings' and public.storage_path_readable(name, owner_id));

drop policy if exists "signed-in read operative-tools" on storage.objects;
drop policy if exists "org read operative-tools" on storage.objects;
create policy "org read operative-tools" on storage.objects for select to authenticated
  using (bucket_id = 'operative-tools' and public.storage_path_readable(name, owner_id));

-- ============================================================================================
-- M6: deleting / overwriting files needs the uploader or a manager of the same company
-- ============================================================================================
drop policy if exists "authenticated delete mc-documents" on storage.objects;
create policy "authenticated delete mc-documents" on storage.objects for delete to authenticated
  using (bucket_id = 'mc-documents' and public.storage_can_change(name, owner_id));

drop policy if exists "authenticated delete operative-tools" on storage.objects;
create policy "authenticated delete operative-tools" on storage.objects for delete to authenticated
  using (bucket_id = 'operative-tools' and public.storage_can_change(name, owner_id));

drop policy if exists "authenticated update operative-tools" on storage.objects;
create policy "authenticated update operative-tools" on storage.objects for update to authenticated
  using (bucket_id = 'operative-tools' and public.storage_can_change(name, owner_id))
  with check (bucket_id = 'operative-tools' and public.storage_path_mine(name));

-- your signature image can only be replaced by you, in your own folder
drop policy if exists "authenticated update own signature" on storage.objects;
create policy "authenticated update own signature" on storage.objects for update to authenticated
  using (bucket_id = 'signatures' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'signatures' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ============================================================================================
-- M9: the old "webapp" bucket can no longer be written by anyone signed in (nothing in the app uses it)
-- ============================================================================================
drop policy if exists "pm upload webapp" on storage.objects;
drop policy if exists "pm update webapp" on storage.objects;

-- ============================================================================================
-- M11: yard stock cost edits stay inside your company, and only Finance can change the money
-- ============================================================================================
create or replace function public.yard_cost_edit(p_cost uuid, p_qty numeric, p_net numeric, p_site uuid, p_date date, p_desc text)
returns void language plpgsql security definer set search_path = public as $$
declare c record; m record; oldq numeric; delta numeric; v_fin boolean := is_finance();
begin
  select * into c from fin_job_costs where id = p_cost and org_id = my_org_id();
  if not found then raise exception 'Cost not found'; end if;
  if not (v_fin or exists (select 1 from profiles where id = auth.uid() and role in ('pm','admin'))) then raise exception 'Not allowed'; end if;
  if p_site is not null and not exists (select 1 from sites s where s.id = p_site and s.org_id = c.org_id) then raise exception 'Job not found'; end if;
  if not v_fin and p_net is not null and p_net is distinct from c.net then raise exception 'Only Finance users can change the cost'; end if;
  select * into m from yard_moves where job_cost_id = p_cost and org_id = c.org_id limit 1;
  if found and p_qty is not null and p_qty > 0 and p_qty <> abs(m.qty) then
    oldq := abs(m.qty);
    delta := case when m.kind = 'return' then p_qty - oldq else oldq - p_qty end;
    update yard_stock set qty = coalesce(qty,0) + delta, updated_at = now() where id = m.stock_id and org_id = c.org_id;
    update yard_moves set qty = case when m.qty < 0 then -p_qty else p_qty end where id = m.id;
  end if;
  if found and p_site is not null and p_site <> m.site_id then update yard_moves set site_id = p_site where id = m.id; end if;
  update fin_job_costs set net = case when v_fin then coalesce(p_net, net) else net end, site_id = coalesce(p_site, site_id),
         cost_date = coalesce(p_date, cost_date), description = coalesce(nullif(trim(p_desc),''), description)
   where id = p_cost;
end $$;
revoke execute on function public.yard_cost_edit(uuid,numeric,numeric,uuid,date,text) from anon, public;
grant execute on function public.yard_cost_edit(uuid,numeric,numeric,uuid,date,text) to authenticated;

-- ============================================================================================
-- L4: an old-style "fp_" phone id that belongs to someone else no longer lets you straight in.
-- Each person gets their own lock for that id instead, which then goes through the normal
-- "same phone / new phone needs approving" checks (real phones use "dv_" ids and are unaffected).
-- ============================================================================================
create or replace function public.check_device_lock_v2(p_device_id text, p_hw_id text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org_id uuid; v_user_id uuid; v_name text; v_role text;
  v_existing record;
  v_has_hw_phone boolean; v_same_hw_mine boolean;
begin
  select org_id, id, name, role into v_org_id, v_user_id, v_name, v_role from profiles where id = auth.uid();
  if v_user_id is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  if v_role in ('pm','admin','superadmin') then return jsonb_build_object('ok', true, 'exempt', true); end if;
  if p_device_id is null or length(p_device_id) = 0 then return jsonb_build_object('ok', false, 'error', 'request_failed'); end if;
  if p_hw_id is not null and length(p_hw_id) = 0 then p_hw_id := null; end if;

  select * into v_existing from device_locks where device_id = p_device_id;

  -- 2026-10-12: old-style phone ids ("fp_...") were worked out from the phone model, so two
  -- people with the same model got the SAME id. 2026-10-25 (security batch 3, L4): instead of
  -- letting anyone in on someone else's "fp_" id, that person gets their own lock for it.
  if found and v_existing.user_id <> v_user_id and p_device_id like 'fp\_%' then
    p_device_id := left(p_device_id, 200) || '~' || v_user_id::text;
    select * into v_existing from device_locks where device_id = p_device_id;
  end if;

  if v_existing is null then
    select exists(select 1 from device_locks where user_id = v_user_id and status = 'approved' and hw_id is not null) into v_has_hw_phone;
    select exists(select 1 from device_locks where user_id = v_user_id and status = 'approved' and (hw_id is null or (p_hw_id is not null and hw_id = p_hw_id))) into v_same_hw_mine;
    if v_has_hw_phone and not v_same_hw_mine and p_hw_id is not null then
      insert into device_locks (device_id, org_id, user_id, user_name, status, requested_at, hw_id)
      values (p_device_id, v_org_id, v_user_id, v_name, 'pending', now(), p_hw_id);
      return jsonb_build_object('ok', false, 'error', 'pending_approval');
    end if;
    insert into device_locks (device_id, org_id, user_id, user_name, status, hw_id, last_seen_at)
    values (p_device_id, v_org_id, v_user_id, v_name, 'approved', p_hw_id, now());
    return jsonb_build_object('ok', true, 'locked_to_me', true);
  end if;

  if v_existing.user_id = v_user_id then
    if v_existing.status = 'pending' then
      return jsonb_build_object('ok', false, 'error', 'pending_approval');
    end if;
    update device_locks set last_seen_at = now(), user_name = v_name, hw_id = coalesce(p_hw_id, hw_id) where device_id = p_device_id;
    return jsonb_build_object('ok', true, 'locked_to_me', true);
  end if;

  return jsonb_build_object('ok', false, 'error', 'device_locked', 'locked_to_name', v_existing.user_name);
end $$;

-- ============================================================================================
-- L6: delete rules no longer have the "project no longer exists" escape hatch, which had no company
-- check. Every one of these tables is linked to projects with ON DELETE CASCADE, so those rows go
-- automatically when a project is deleted (none exist today).
-- ============================================================================================
alter policy "pm or requester delete" on public.additional_works_requests
  using (((select is_pm()) and has_site_access(site_id)) or (requested_by = (select auth.uid()) and status = 'pending'));
alter policy "pm delete" on public.checkins using ((select is_pm()) and has_site_access(site_id));
alter policy "pm delete" on public.coshh_docs using ((select is_pm()) and has_site_access(site_id));
alter policy "pm delete drawing files" on public.drawing_files using ((select is_pm()) and has_site_access(site_id));
alter policy "pm delete drawing folders" on public.drawing_folders using ((select is_pm()) and has_site_access(site_id));
alter policy "havs delete" on public.havs_entries
  using ((user_id = (select auth.uid()) and has_site_access(site_id)) or ((select is_pm()) and has_site_access(site_id)));
alter policy "pm delete" on public.labour_invoices using ((select is_pm()) and has_site_access(site_id));
alter policy "pm delete material order files" on public.material_order_files using ((select is_pm()) and has_site_access(site_id));
alter policy "pm delete material order folders" on public.material_order_folders using ((select is_pm()) and has_site_access(site_id));
alter policy "pm delete" on public.material_required_items using ((select is_pm()) and has_site_access(site_id));
alter policy "pm delete" on public.materials using ((select is_pm()) and has_site_access(site_id));
alter policy "pm delete" on public.price_files using ((select is_pm()) and has_site_access(site_id));
alter policy "pm delete" on public.price_weeks using ((select is_pm()) and has_site_access(site_id));
alter policy "pm delete" on public.pricing_elements using ((select is_pm()) and has_site_access(site_id));
alter policy "pm delete" on public.rams_docs using ((select is_pm()) and has_site_access(site_id));
alter policy "pm delete" on public.schedule_section_flags using ((select is_pm()) and has_site_access(site_id));
alter policy "pm delete" on public.schedule_sections
  using ((select is_pm()) and has_site_access(site_id) and schedule_visibility_ok(visibility_mode, assigned_pm_ids, assigned_operative_ids));
alter policy "pm delete" on public.schedule_tasks
  using ((select is_pm()) and has_site_access(site_id) and case
    when section_id is null then schedule_visibility_ok(visibility_mode, assigned_pm_ids, assigned_operative_ids)
    else exists (select 1 from public.schedule_sections sec where sec.id = schedule_tasks.section_id
                   and schedule_visibility_ok(sec.visibility_mode, sec.assigned_pm_ids, sec.assigned_operative_ids)) end);
alter policy "pm manage assignments" on public.site_assignments
  using ((select is_pm()) and exists (select 1 from public.sites s where s.id = site_assignments.site_id and s.org_id = (select my_org_id())));
alter policy "site havs tools delete" on public.site_havs_tools using (has_site_access(site_id));
alter policy "pm manage labour invoice access" on public.site_labour_invoice_access
  using ((select is_pm()) and exists (select 1 from public.sites s where s.id = site_labour_invoice_access.site_id and s.org_id = (select my_org_id())));
alter policy "pm delete" on public.site_layout_docs using ((select is_pm()) and has_site_access(site_id));
alter policy "pm manage price access" on public.site_price_access
  using ((select is_pm()) and exists (select 1 from public.sites s where s.id = site_price_access.site_id and s.org_id = (select my_org_id())));
alter policy "pm delete" on public.site_sub_addresses using ((select is_pm()) and has_site_access(site_id));
alter policy "pm delete" on public.snags using ((select is_pm()) and has_site_access(site_id));
alter policy "pm delete" on public.todos
  using ((select is_pm()) and (has_site_access(site_id) or (site_id is null and org_id = (select my_org_id()))));
alter policy "pm delete toolbox talks" on public.toolbox_talks using ((select is_pm()) and has_site_access(site_id));
alter policy "pm delete" on public.variations using ((select is_pm()) and has_site_access(site_id));
-- (messages "pm delete visible messages" keeps its branch: it already checks the company first.)

-- ============================================================================================
-- M1: client logins (customers) can't read company-wide lists they never use in the app.
-- Left as they are on purpose, because the client screens need them: profiles (names on
-- signatures), hs_policy_docs (H&S policy in RAMS), operative_tools (Operative Dashboard / PUWER),
-- tbt_templates.
-- ============================================================================================
alter policy "org can read submissions" on public.report_submissions
  using (org_id = (select my_org_id()) and (not (select is_client()) or has_client_view_access(site_id)));
alter policy "org can read briefing signatures" on public.daily_briefing_signatures
  using (not (select is_client()) and exists (select 1 from public.report_submissions rs
         where rs.id = daily_briefing_signatures.submission_id and rs.org_id = (select my_org_id())));
alter policy "plant_items_select" on public.plant_items using (org_id = (select my_org_id()) and not (select is_client()));
alter policy "plant_checkouts_select" on public.plant_checkouts using (org_id = (select my_org_id()) and not (select is_client()));
alter policy "select own org" on public.suppliers using (org_id = (select my_org_id()) and not (select is_client()));
alter policy "org select tools" on public.havs_tools using (org_id = (select my_org_id()) and not (select is_client()));
alter policy "org read rams library" on public.rams_library_items using (org_id = (select my_org_id()) and not (select is_client()));
alter policy "select coshh library files" on public.coshh_library_files using (org_id = (select my_org_id()) and not (select is_client()));
alter policy "select coshh library folders" on public.coshh_library_folders using (org_id = (select my_org_id()) and not (select is_client()));
alter policy "org can read templates" on public.report_templates using (org_id = (select my_org_id()) and not (select is_client()));
alter policy "org members read sign layouts" on public.sign_layout_templates using (org_id = (select my_org_id()) and not (select is_client()));
alter policy "select own org" on public.sow_library_sections
  using (not (select is_client()) and exists (select 1 from public.sow_library_templates t where t.id = sow_library_sections.template_id and t.org_id = (select my_org_id())));
alter policy "select own org" on public.sow_library_tasks
  using (not (select is_client()) and exists (select 1 from public.sow_library_templates t where t.id = sow_library_tasks.template_id and t.org_id = (select my_org_id())));
alter policy "org read yard_stock" on public.yard_stock using (org_id = (select my_org_id()) and not (select is_client()));
alter policy "org read yard_moves" on public.yard_moves using (org_id = (select my_org_id()) and not (select is_client()));
alter policy "select own org device locks" on public.device_locks using (org_id = (select my_org_id()) and not (select is_client()));
alter policy "select own org" on public.onedrive_connections using (org_id = (select my_org_id()) and not (select is_client()));

-- ============================================================================================
-- N2: Finance rows can only point at a project of your own company (or no project)
-- ============================================================================================
create or replace function public.site_in_my_org(p_site uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_site is null or exists (select 1 from sites s where s.id = p_site and s.org_id = my_org_id())
$$;
alter policy "fin_dayworks_finance" on public.fin_dayworks with check (org_id = my_org_id() and is_finance() and site_in_my_org(site_id));
alter policy "finance all fin_inbox" on public.fin_inbox with check (org_id = (select my_org_id()) and (select is_finance()) and site_in_my_org(site_id));
alter policy "fin_job_budgets_finance" on public.fin_job_budgets with check (org_id = my_org_id() and is_finance() and site_in_my_org(site_id));
alter policy "fin_job_costs_finance" on public.fin_job_costs with check (org_id = my_org_id() and is_finance() and site_in_my_org(site_id));
alter policy "fin_quote_items_finance" on public.fin_quote_items with check (org_id = my_org_id() and is_finance() and site_in_my_org(site_id));
alter policy "fin_quotes_finance" on public.fin_quotes with check (org_id = my_org_id() and is_finance() and site_in_my_org(site_id));
alter policy "fin_shop_items_update" on public.fin_shop_items with check (org_id = my_org_id() and is_finance() and site_in_my_org(site_id));
alter policy "fin_shop_items_write" on public.fin_shop_items with check (org_id = my_org_id() and is_finance() and site_in_my_org(site_id));
alter policy "fin_sub_apps_finance" on public.fin_sub_apps with check (org_id = my_org_id() and is_finance() and site_in_my_org(site_id));
alter policy "fin_sub_values_finance" on public.fin_sub_values with check (org_id = my_org_id() and is_finance() and site_in_my_org(site_id));
alter policy "fin_subcontracts_finance" on public.fin_subcontracts with check (org_id = my_org_id() and is_finance() and site_in_my_org(site_id));
alter policy "fin_variations_finance" on public.fin_variations with check (org_id = my_org_id() and is_finance() and site_in_my_org(site_id));
alter policy "finance update purchase_orders" on public.purchase_orders with check (org_id = (select my_org_id()) and (select is_finance()) and site_in_my_org(site_id));
alter policy "wage pushes pm decide" on public.wage_pushes with check (org_id = (select my_org_id()) and site_in_my_org(site_id));
alter policy "managers add yard_moves" on public.yard_moves
  with check (org_id = (select my_org_id()) and ((select is_pm_or_admin()) or (select is_finance())) and site_in_my_org(site_id));
alter policy "pm manage price sheets" on public.price_builder_sheets
  with check ((select is_pm()) and org_id = (select my_org_id()) and site_in_my_org(site_id));

-- ============================================================================================
-- L1: database functions can't be called by logged-out visitors (except the invite page's
-- get_invite_info), trigger functions can't be called directly at all, and new functions
-- start the same way. L2: the old device check (v1) is switched off; the app uses v2.
-- ============================================================================================
revoke execute on all functions in schema public from anon, public;
grant execute on function public.get_invite_info(uuid) to anon;
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prorettype = 'trigger'::regtype loop
    execute format('revoke execute on function %s from anon, authenticated, public', f.sig);
  end loop;
end $$;
revoke execute on function public.check_and_lock_device(text) from anon, authenticated, public;
grant execute on function public.storage_path_mine(text), public.storage_path_readable(text,text), public.storage_signature_visible(text),
  public.storage_can_change(text,text), public.site_in_my_org(uuid), public.check_device_lock_v2(text,text) to authenticated;
-- The yes/no checks used inside the table rules stay callable by logged-out visitors: they
-- just answer "no" for them, so a logged-out or expired request still gets an empty list
-- rather than an error.
grant execute on function public.can_see_costs(), public.can_see_site_prices(uuid), public.has_client_view_access(uuid),
  public.has_master_company_access(uuid), public.has_site_access(uuid), public.is_admin(), public.is_client(), public.is_driver(),
  public.is_finance(), public.is_pm_or_admin(), public.is_pm(), public.is_subcontractor_admin_of_master(uuid),
  public.is_subcontractor_admin(uuid), public.is_superadmin(), public.my_org_id(), public.pb_item_sheet_id(uuid),
  public.pb_sheet_in_my_org(uuid), public.pb_sheet_viewable(uuid), public.schedule_visibility_ok(text,uuid[],uuid[]),
  public.site_id_of_permit(uuid), public.site_id_of_tbt(uuid), public.site_responsible_pm(uuid), public.storage_path_mine(text),
  public.todo_general_mine(uuid,uuid), public.user_has_signed_tbt(uuid),
  public.storage_path_readable(text,text), public.storage_signature_visible(text), public.storage_can_change(text,text),
  public.site_in_my_org(uuid) to anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon;
alter default privileges for role postgres revoke execute on functions from public;

commit;

select 'Security batch 3 done' as result;
