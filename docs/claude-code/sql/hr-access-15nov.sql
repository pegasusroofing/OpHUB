-- APPLIED 15 Nov 2026 (migration hr_access). Record only; nothing to run.
-- Employee Records security (Andy, 15 Nov 2026: "I can't have everyone seeing everyone's contracts etc"):
--  * an HR Team: only these people open everyone's folders (contracts, pay, bonus, disciplinary). Until a company sets one
--    up, its company admins are the HR team (as before). Once set, other admins don't see records, and only the HR team
--    changes who's on it;
--  * line managers see only the parts the HR team allows (performance and emergency contact unless changed; contracts,
--    pay, right to work, bonus and disciplinary never);
--  * HR files can be copied to an OneDrive folder the HR team chooses (hr_settings.hr_onedrive).
-- Only the hr_* objects made on 14 Nov 2026 for the new app are changed; nothing the current app uses.

create table if not exists public.hr_team (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  added_by uuid, added_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
alter table public.hr_team enable row level security;

create or replace function public.hr_is_team()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select case when exists (select 1 from public.hr_team t where t.org_id = public.my_org_id())
    then exists (select 1 from public.hr_team t where t.org_id = public.my_org_id() and t.user_id = auth.uid())
    else coalesce(public.is_admin(), false) end;
$$;

alter table public.hr_settings add column if not exists hr_lm_sections text[];
alter table public.hr_settings add column if not exists hr_onedrive jsonb;
alter table public.hr_docs add column if not exists onedrive_copied_at timestamptz;

-- May the signed-in person, as this employee's line manager, see this part of their folder?
create or replace function public.hr_lm_sees(p_user uuid, p_section text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.hr_is_line_manager(p_user)
    and p_section = any(coalesce((select s.hr_lm_sections from public.hr_settings s where s.org_id = public.my_org_id()), array['performance', 'emergency']))
    and p_section not in ('contracts', 'pay', 'rtw', 'conduct', 'bonus', 'personal', 'other');
$$;

create policy "hr team read" on public.hr_team for select using (org_id = (select public.my_org_id()) and ((select public.hr_is_team()) or (select public.is_admin())));
create policy "hr team add" on public.hr_team for insert with check (org_id = (select public.my_org_id()) and (select public.hr_is_team()));
create policy "hr team remove" on public.hr_team for delete using (org_id = (select public.my_org_id()) and (select public.hr_is_team()));

-- What the signed-in person may do in HR, for the app.
create or replace function public.hr_my_access()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'team', public.hr_is_team(),
    'team_set', exists (select 1 from public.hr_team t where t.org_id = public.my_org_id()),
    'lm_sections', to_jsonb(coalesce((select s.hr_lm_sections from public.hr_settings s where s.org_id = public.my_org_id()), array['performance', 'emergency'])),
    'appraisal_months', coalesce((select s.appraisal_months from public.hr_settings s where s.org_id = public.my_org_id()), 12),
    'onedrive', case when public.hr_is_team() then (select s.hr_onedrive from public.hr_settings s where s.org_id = public.my_org_id()) else null end
  );
$$;

-- The HR team's settings: appraisal cycle, what line managers see, the OneDrive folder. Null = leave as it is.
create or replace function public.hr_save_settings(p_months int default null, p_lm_sections text[] default null, p_onedrive jsonb default null, p_clear_onedrive boolean default false)
returns boolean language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.hr_is_team() then raise exception 'HR team only'; end if;
  insert into public.hr_settings (org_id, appraisal_months, hr_lm_sections, hr_onedrive)
    values (public.my_org_id(), p_months, p_lm_sections, case when p_clear_onedrive then null else p_onedrive end)
  on conflict (org_id) do update set
    appraisal_months = coalesce(p_months, public.hr_settings.appraisal_months),
    hr_lm_sections = coalesce(p_lm_sections, public.hr_settings.hr_lm_sections),
    hr_onedrive = case when p_clear_onedrive then null else coalesce(p_onedrive, public.hr_settings.hr_onedrive) end,
    updated_at = now();
  return true;
end $$;

-- The basics of someone's record for the HR team, the person, or their line manager (employment; emergency contact
-- only where allowed). Line managers can't read hr_records itself.
create or replace function public.hr_basic(p_user uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select case when r.user_id is null then null
    when public.hr_is_team() or p_user = auth.uid() or public.hr_is_line_manager(p_user) then
      jsonb_build_object('user_id', r.user_id, 'org_id', r.org_id, 'job_title', r.job_title, 'department', r.department, 'employment_type', r.employment_type,
        'start_date', r.start_date, 'probation_end', r.probation_end, 'end_date', r.end_date, 'line_manager_id', r.line_manager_id)
      || case when public.hr_is_team() or p_user = auth.uid() or public.hr_lm_sees(p_user, 'emergency')
           then jsonb_build_object('emergency_name', r.emergency_name, 'emergency_relationship', r.emergency_relationship, 'emergency_phone', r.emergency_phone) else '{}'::jsonb end
    else null end
  from (select 1) x left join public.hr_records r on r.user_id = p_user and r.org_id = public.my_org_id();
$$;

-- The people the signed-in person line-manages.
create or replace function public.hr_my_reports()
returns table (user_id uuid, job_title text) language sql stable security definer set search_path to 'public' as $$
  select r.user_id, r.job_title from public.hr_records r where r.org_id = public.my_org_id() and r.line_manager_id = auth.uid();
$$;

-- A file in the hr-docs store the signed-in person may open (their own, not hidden; or one their line manager may see).
create or replace function public.hr_can_read_file(p_name text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.hr_docs d where d.storage_path = p_name and d.org_id = public.my_org_id() and not d.hidden_from_employee
    and (d.user_id = auth.uid() or public.hr_lm_sees(d.user_id, d.folder)));
$$;

-- ---- the rules on each table: the HR team instead of every company admin; line managers by section ----
alter policy "hr records read" on public.hr_records using (org_id = (select public.my_org_id()) and ((select public.hr_is_team()) or user_id = (select auth.uid())));
alter policy "hr records insert" on public.hr_records with check (org_id = (select public.my_org_id()) and ((select public.hr_is_team()) or user_id = (select auth.uid())));
alter policy "hr records update" on public.hr_records using (org_id = (select public.my_org_id()) and ((select public.hr_is_team()) or user_id = (select auth.uid()))) with check (org_id = (select public.my_org_id()) and ((select public.hr_is_team()) or user_id = (select auth.uid())));
create or replace function public.guard_hr_records()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null or public.hr_is_team() or public.is_superadmin() then new.updated_at := now(); return new; end if;
  if tg_op = 'INSERT' then
    new.job_title := null; new.department := null; new.employment_type := null; new.start_date := null; new.probation_end := null;
    new.end_date := null; new.contracted_hours := null; new.line_manager_id := null; new.rtw_checked_on := null; new.rtw_document := null; new.rtw_expiry := null;
  else
    new.job_title := old.job_title; new.department := old.department; new.employment_type := old.employment_type; new.start_date := old.start_date;
    new.probation_end := old.probation_end; new.end_date := old.end_date; new.contracted_hours := old.contracted_hours; new.line_manager_id := old.line_manager_id;
    new.rtw_checked_on := old.rtw_checked_on; new.rtw_document := old.rtw_document; new.rtw_expiry := old.rtw_expiry; new.org_id := old.org_id;
  end if;
  new.updated_at := now(); new.updated_by := auth.uid();
  return new;
end $$;

alter policy "hr docs read" on public.hr_docs using (org_id = (select public.my_org_id()) and ((select public.hr_is_team()) or (not hidden_from_employee and (user_id = (select auth.uid()) or public.hr_lm_sees(user_id, folder)))));
alter policy "hr docs insert" on public.hr_docs with check (org_id = (select public.my_org_id()) and uploaded_by = (select auth.uid()) and ((select public.hr_is_team()) or (user_id = (select auth.uid()) and not hidden_from_employee and folder in ('rtw', 'licences', 'health', 'absence'))));
alter policy "hr docs update" on public.hr_docs using (org_id = (select public.my_org_id()) and (select public.hr_is_team())) with check (org_id = (select public.my_org_id()) and (select public.hr_is_team()));
alter policy "hr docs delete" on public.hr_docs using (org_id = (select public.my_org_id()) and ((select public.hr_is_team()) or (user_id = (select auth.uid()) and uploaded_by = (select auth.uid()))));

alter policy "hr history read" on public.hr_history using (org_id = (select public.my_org_id()) and ((select public.hr_is_team()) or user_id = (select auth.uid()) or public.hr_lm_sees(user_id, 'history')));
alter policy "hr history write" on public.hr_history using (org_id = (select public.my_org_id()) and (select public.hr_is_team())) with check (org_id = (select public.my_org_id()) and (select public.hr_is_team()));

alter policy "hr goals read" on public.hr_goals using (org_id = (select public.my_org_id()) and ((select public.hr_is_team()) or user_id = (select auth.uid()) or public.hr_lm_sees(user_id, 'performance')));
alter policy "hr goals insert" on public.hr_goals with check (org_id = (select public.my_org_id()) and ((select public.hr_is_team()) or user_id = (select auth.uid()) or public.hr_lm_sees(user_id, 'performance')));
alter policy "hr goals update" on public.hr_goals using (org_id = (select public.my_org_id()) and ((select public.hr_is_team()) or user_id = (select auth.uid()) or public.hr_lm_sees(user_id, 'performance')));
alter policy "hr goals delete" on public.hr_goals using (org_id = (select public.my_org_id()) and ((select public.hr_is_team()) or public.hr_lm_sees(user_id, 'performance')));

alter policy "hr feedback read" on public.hr_feedback using (org_id = (select public.my_org_id()) and ((select public.hr_is_team()) or public.hr_lm_sees(user_id, 'performance') or from_id = (select auth.uid()) or (user_id = (select auth.uid()) and not private)));
alter policy "hr feedback insert" on public.hr_feedback with check (org_id = (select public.my_org_id()) and from_id = (select auth.uid()) and user_id <> (select auth.uid()) and ((select public.hr_is_team()) or public.hr_lm_sees(user_id, 'performance') or (kind = 'praise' and not private)));
alter policy "hr feedback delete" on public.hr_feedback using (org_id = (select public.my_org_id()) and ((select public.hr_is_team()) or from_id = (select auth.uid())));

alter policy "hr appraisals read" on public.hr_appraisals using (org_id = (select public.my_org_id()) and ((select public.hr_is_team()) or user_id = (select auth.uid()) or public.hr_lm_sees(user_id, 'performance')));
alter policy "hr appraisals insert" on public.hr_appraisals with check (org_id = (select public.my_org_id()) and ((select public.hr_is_team()) or public.hr_lm_sees(user_id, 'performance')));
alter policy "hr appraisals update" on public.hr_appraisals using (org_id = (select public.my_org_id()) and ((select public.hr_is_team()) or user_id = (select auth.uid()) or public.hr_lm_sees(user_id, 'performance')));
alter policy "hr appraisals delete" on public.hr_appraisals using (org_id = (select public.my_org_id()) and (select public.hr_is_team()));
create or replace function public.guard_hr_appraisals()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null or public.hr_is_team() or public.is_superadmin() or public.hr_lm_sees(old.user_id, 'performance') then return new; end if;
  if old.status = 'done' then raise exception 'This appraisal has been signed off'; end if;
  new.manager_id := old.manager_id; new.due_date := old.due_date; new.review := old.review; new.rating := old.rating;
  new.summary := old.summary; new.completed_at := old.completed_at; new.user_id := old.user_id; new.org_id := old.org_id;
  new.status := case when new.status in ('due', 'self_done') then new.status else old.status end;
  return new;
end $$;

alter policy "hr bonuses read" on public.hr_bonuses using (org_id = (select public.my_org_id()) and ((select public.hr_is_team()) or user_id = (select auth.uid())));
alter policy "hr bonuses write" on public.hr_bonuses using (org_id = (select public.my_org_id()) and (select public.hr_is_team())) with check (org_id = (select public.my_org_id()) and (select public.hr_is_team()));

alter policy "hr docs files read" on storage.objects using (bucket_id = 'hr-docs' and (storage.foldername(name))[1] = (select public.my_org_id())::text and ((select public.hr_is_team()) or public.hr_can_read_file(name)));
alter policy "hr docs files add" on storage.objects with check (bucket_id = 'hr-docs' and (storage.foldername(name))[1] = (select public.my_org_id())::text and ((select public.hr_is_team()) or (storage.foldername(name))[2] = (select auth.uid())::text));
alter policy "hr docs files remove" on storage.objects using (bucket_id = 'hr-docs' and (storage.foldername(name))[1] = (select public.my_org_id())::text and ((select public.hr_is_team()) or (storage.foldername(name))[2] = (select auth.uid())::text));
