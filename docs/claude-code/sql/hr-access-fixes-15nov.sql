-- APPLIED 15 Nov 2026 (migration hr_access_fixes). Record only; nothing to run.
-- Employee Records: fixes from the review of 15 Nov 2026. Only the new app's hr_* objects change, plus one new trigger on
-- hr_settings that guards only the new app's columns (the current app's holiday settings there are untouched).

-- 1. Only the HR team changes the HR columns on hr_settings (company admins could write them directly before).
create or replace function public.guard_hr_settings_hr()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null or public.hr_is_team() or public.is_superadmin() then return new; end if;
  if tg_op = 'INSERT' then
    new.appraisal_months := null; new.hr_lm_sections := null; new.hr_onedrive := null;
  else
    new.appraisal_months := old.appraisal_months; new.hr_lm_sections := old.hr_lm_sections; new.hr_onedrive := old.hr_onedrive;
  end if;
  return new;
end $$;
create trigger guard_hr_settings_hr before insert or update on public.hr_settings for each row execute function public.guard_hr_settings_hr();

-- 2. The HR OneDrive folder moves to a table only the HR team can read (hr_settings is read by every PM).
create table if not exists public.hr_secure_settings (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  onedrive jsonb, updated_at timestamptz not null default now()
);
alter table public.hr_secure_settings enable row level security;
create policy "hr secure read" on public.hr_secure_settings for select using (org_id = (select public.my_org_id()) and (select public.hr_is_team()));
create policy "hr secure write" on public.hr_secure_settings for all using (org_id = (select public.my_org_id()) and (select public.hr_is_team())) with check (org_id = (select public.my_org_id()) and (select public.hr_is_team()));

create or replace function public.hr_my_access()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'team', public.hr_is_team(),
    'team_set', exists (select 1 from public.hr_team t where t.org_id = public.my_org_id()),
    'lm_sections', to_jsonb(coalesce((select s.hr_lm_sections from public.hr_settings s where s.org_id = public.my_org_id()), array['performance', 'emergency'])),
    'appraisal_months', coalesce((select s.appraisal_months from public.hr_settings s where s.org_id = public.my_org_id()), 12),
    'onedrive', case when public.hr_is_team() then (select x.onedrive from public.hr_secure_settings x where x.org_id = public.my_org_id()) else null end
  );
$$;
create or replace function public.hr_save_settings(p_months int default null, p_lm_sections text[] default null, p_onedrive jsonb default null, p_clear_onedrive boolean default false)
returns boolean language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.hr_is_team() then raise exception 'HR team only'; end if;
  if p_months is not null or p_lm_sections is not null then
    insert into public.hr_settings (org_id, appraisal_months, hr_lm_sections) values (public.my_org_id(), p_months, p_lm_sections)
    on conflict (org_id) do update set
      appraisal_months = coalesce(p_months, public.hr_settings.appraisal_months),
      hr_lm_sections = coalesce(p_lm_sections, public.hr_settings.hr_lm_sections), updated_at = now();
  end if;
  if p_onedrive is not null or p_clear_onedrive then
    insert into public.hr_secure_settings (org_id, onedrive) values (public.my_org_id(), case when p_clear_onedrive then null else p_onedrive end)
    on conflict (org_id) do update set onedrive = case when p_clear_onedrive then null else p_onedrive end, updated_at = now();
  end if;
  return true;
end $$;

-- 3. A document's file must sit in that person's own folder of the store (<org>/<person>/…).
alter policy "hr docs insert" on public.hr_docs with check (org_id = (select public.my_org_id()) and uploaded_by = (select auth.uid())
  and storage_path like (org_id::text || '/' || user_id::text || '/%')
  and ((select public.hr_is_team()) or (user_id = (select auth.uid()) and not hidden_from_employee and folder in ('rtw', 'licences', 'health', 'absence'))));

-- 4. Someone not on the HR team can only remove files they put there themselves (not HR's copy of their contract).
alter policy "hr docs files remove" on storage.objects using (bucket_id = 'hr-docs' and (storage.foldername(name))[1] = (select public.my_org_id())::text
  and ((select public.hr_is_team()) or ((storage.foldername(name))[2] = (select auth.uid())::text and owner_id = (select auth.uid())::text)));

-- 5. A line manager with Job History on doesn't see pay reviews.
alter policy "hr history read" on public.hr_history using (org_id = (select public.my_org_id()) and ((select public.hr_is_team()) or user_id = (select auth.uid()) or (kind <> 'pay' and public.hr_lm_sees(user_id, 'history'))));

-- 6. Goals and appraisals can't be moved onto someone else or another company.
alter policy "hr goals update" on public.hr_goals using (org_id = (select public.my_org_id()) and ((select public.hr_is_team()) or user_id = (select auth.uid()) or public.hr_lm_sees(user_id, 'performance')))
  with check (org_id = (select public.my_org_id()) and ((select public.hr_is_team()) or user_id = (select auth.uid()) or public.hr_lm_sees(user_id, 'performance')));
alter policy "hr appraisals update" on public.hr_appraisals using (org_id = (select public.my_org_id()) and ((select public.hr_is_team()) or user_id = (select auth.uid()) or public.hr_lm_sees(user_id, 'performance')))
  with check (org_id = (select public.my_org_id()) and ((select public.hr_is_team()) or user_id = (select auth.uid()) or public.hr_lm_sees(user_id, 'performance')));
create or replace function public.guard_hr_goals()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null then return new; end if;
  new.user_id := old.user_id; new.org_id := old.org_id; new.set_by := old.set_by; new.created_at := old.created_at;
  return new;
end $$;
create trigger guard_hr_goals before update on public.hr_goals for each row execute function public.guard_hr_goals();
create or replace function public.guard_hr_appraisals()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null then return new; end if;
  new.user_id := old.user_id; new.org_id := old.org_id; new.created_by := old.created_by;
  if public.hr_is_team() or public.is_superadmin() or public.hr_lm_sees(old.user_id, 'performance') then return new; end if;
  if old.status = 'done' then raise exception 'This appraisal has been signed off'; end if;
  new.manager_id := old.manager_id; new.due_date := old.due_date; new.review := old.review; new.rating := old.rating;
  new.summary := old.summary; new.completed_at := old.completed_at;
  new.status := case when new.status in ('due', 'self_done') then new.status else old.status end;
  return new;
end $$;
