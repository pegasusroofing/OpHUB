-- OpHUB security batch (25 Oct 2026). Paste all of this into Supabase › SQL Editor › New query, then press Run.
-- Safe to run twice.

-- C1: OneDrive tokens are for the server only
revoke all on public.onedrive_connections from anon, authenticated;
grant select (org_id, account_email, folder_path, expires_at, connected_by, connected_at) on public.onedrive_connections to authenticated;
grant update (folder_path) on public.onedrive_connections to authenticated;
grant delete on public.onedrive_connections to authenticated;

-- H4: price files only for your own company's projects
drop policy if exists "select price files storage" on storage.objects;
create policy "select price files storage" on storage.objects for select to authenticated using (
  bucket_id = 'price-files' and exists (
    select 1 from public.sites s where s.id::text = (storage.foldername(name))[1] and s.org_id = public.my_org_id()
      and ( public.is_pm_or_admin() or public.is_finance()
         or exists (select 1 from public.site_price_access pa where pa.site_id = s.id and pa.user_id = auth.uid())
         or exists (select 1 from public.site_labour_invoice_access la where la.site_id = s.id and la.user_id = auth.uid()))));

-- H5: you can only check yourself in, at the current time; only managers edit check-ins
drop policy if exists "insert site access" on public.checkins;
drop policy if exists "insert own checkin" on public.checkins;
create policy "insert own checkin" on public.checkins for insert to authenticated
  with check (has_site_access(site_id) and user_id = (select auth.uid())
              and ts between now() - interval '15 minutes' and now() + interval '5 minutes');
drop policy if exists "update site access" on public.checkins;
drop policy if exists "pm update checkins" on public.checkins;
create policy "pm update checkins" on public.checkins for update to authenticated
  using ((select is_pm()) and has_site_access(site_id)) with check ((select is_pm()) and has_site_access(site_id));

-- H6: decision / approval fields can only be changed by managers
create or replace function public.guard_manager_fields() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_pm() or public.is_superadmin() then return new; end if;
  if tg_table_name = 'variations' then
    if tg_op = 'INSERT' then
      new.approval_status := 'pending'; new.decided_by := null; new.decided_at := null; new.decline_reason := null;
    else
      new.approval_status := old.approval_status; new.decided_by := old.decided_by; new.decided_at := old.decided_at;
      new.decline_reason := old.decline_reason; new.cost_impact := old.cost_impact; new.created_by := old.created_by; new.site_id := old.site_id;
    end if;
  elsif tg_table_name = 'permits' then
    if tg_op = 'UPDATE' then
      new.org_id := old.org_id; new.site_id := old.site_id; new.subcontractor_company_id := old.subcontractor_company_id;
      new.permit_type := old.permit_type; new.assigned_user_ids := old.assigned_user_ids; new.issued_by := old.issued_by;
      new.issued_at := old.issued_at; new.issuer_signature_path := old.issuer_signature_path; new.work_date := old.work_date;
      if new.status is distinct from old.status then
        if not (auth.uid() = any(coalesce(old.assigned_user_ids, '{}'::uuid[]))
                or (old.subcontractor_company_id is not null and public.is_subcontractor_admin(old.subcontractor_company_id))) then
          new.status := old.status; new.closed_by := old.closed_by; new.closed_at := old.closed_at; new.closed_notes := old.closed_notes;
        else
          new.closed_by := case when new.closed_by is null then null else auth.uid() end;
        end if;
      end if;
    end if;
  elsif tg_table_name in ('rams_docs','coshh_docs') then
    if tg_op = 'UPDATE' then
      new.site_id := old.site_id; new.resign_cycle_start := old.resign_cycle_start;
      if tg_table_name = 'rams_docs' then new.status := old.status; new.superseded_by := old.superseded_by; new.supersedes := old.supersedes; new.sign_layout := old.sign_layout; end if;
    end if;
  elsif tg_table_name = 'materials' then
    if tg_op = 'UPDATE' then
      new.site_id := old.site_id; new.po_id := old.po_id; new.po_number := old.po_number; new.requested_by := old.requested_by;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.guard_manager_fields() from anon, authenticated, public;
drop trigger if exists zz_guard_manager_fields on public.variations;
create trigger zz_guard_manager_fields before insert or update on public.variations for each row execute function public.guard_manager_fields();
drop trigger if exists zz_guard_manager_fields on public.permits;
create trigger zz_guard_manager_fields before update on public.permits for each row execute function public.guard_manager_fields();
drop trigger if exists zz_guard_manager_fields on public.rams_docs;
create trigger zz_guard_manager_fields before update on public.rams_docs for each row execute function public.guard_manager_fields();
drop trigger if exists zz_guard_manager_fields on public.coshh_docs;
create trigger zz_guard_manager_fields before update on public.coshh_docs for each row execute function public.guard_manager_fields();
drop trigger if exists zz_guard_manager_fields on public.materials;
create trigger zz_guard_manager_fields before update on public.materials for each row execute function public.guard_manager_fields();

-- M2: only an admin changes the company name, billing, modules, project numbering or where expenses go
create or replace function public.guard_org_admin_fields() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() or public.is_superadmin() then return new; end if;
  new.name := old.name; new.stripe_customer_id := old.stripe_customer_id; new.has_pm := old.has_pm; new.has_finance := old.has_finance;
  new.expenses_email := old.expenses_email; new.expenses_retention_months := old.expenses_retention_months;
  new.auto_job_numbers := old.auto_job_numbers; new.job_number_prefix := old.job_number_prefix;
  return new;
end $$;
revoke execute on function public.guard_org_admin_fields() from anon, authenticated, public;
drop trigger if exists zz_guard_org_admin_fields on public.organizations;
create trigger zz_guard_org_admin_fields before update on public.organizations for each row execute function public.guard_org_admin_fields();

-- M3 / M10: a manager editing someone else can't change their signature or email, or make them an admin
create or replace function public.protect_profile_by_manager() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_superadmin() then return new; end if;
  if auth.uid() <> old.id then
    new.signature_path := old.signature_path;
    new.email := old.email;
    if not public.is_admin() and new.role = 'admin' and old.role <> 'admin' then new.role := old.role; end if;
  else
    new.email := old.email;
  end if;
  return new;
end $$;
revoke execute on function public.protect_profile_by_manager() from anon, authenticated, public;
drop trigger if exists zz_protect_profile_by_manager on public.profiles;
create trigger zz_protect_profile_by_manager before update on public.profiles for each row execute function public.protect_profile_by_manager();

-- M4: you can only sign as yourself
drop policy if exists "insert site access" on public.rams_signatures;
drop policy if exists "insert own signature" on public.rams_signatures;
create policy "insert own signature" on public.rams_signatures for insert to authenticated
  with check (user_id = (select auth.uid()) and has_site_access((select rd.site_id from public.rams_docs rd where rd.id = rams_signatures.rams_id)));
drop policy if exists "insert site access" on public.coshh_signatures;
drop policy if exists "insert own signature" on public.coshh_signatures;
create policy "insert own signature" on public.coshh_signatures for insert to authenticated
  with check (user_id = (select auth.uid()) and has_site_access((select cd.site_id from public.coshh_docs cd where cd.id = coshh_signatures.coshh_id)));
drop policy if exists "insert site access" on public.site_layout_signatures;
drop policy if exists "insert own signature" on public.site_layout_signatures;
create policy "insert own signature" on public.site_layout_signatures for insert to authenticated
  with check (user_id = (select auth.uid()) and has_site_access((select ld.site_id from public.site_layout_docs ld where ld.id = site_layout_signatures.layout_id)));

-- M5: prices only for managers, finance and people given price access on that job
create or replace function public.can_see_site_prices(p_site uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_pm() or public.is_finance()
      or exists (select 1 from site_price_access pa where pa.site_id = p_site and pa.user_id = auth.uid())
      or exists (select 1 from site_labour_invoice_access la where la.site_id = p_site and la.user_id = auth.uid())
      or exists (select 1 from price_builder_sheets s where s.site_id = p_site and auth.uid() = any(coalesce(s.assigned_user_ids,'{}'::uuid[])))
$$;
grant execute on function public.can_see_site_prices(uuid) to authenticated;
drop policy if exists "select site access" on public.pricing_elements;
create policy "select site access" on public.pricing_elements for select to authenticated using (has_site_access(site_id) and public.can_see_site_prices(site_id));
drop policy if exists "select site access" on public.price_weeks;
create policy "select site access" on public.price_weeks for select to authenticated using (has_site_access(site_id) and public.can_see_site_prices(site_id));

select 'Security batch done' as result;
