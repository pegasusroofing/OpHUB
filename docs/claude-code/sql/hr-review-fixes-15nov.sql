-- APPLIED 15 Nov 2026 (migration hr_review_fixes). Record only; nothing to run.
-- Fixes from the review of 15 Nov's HR work (docs/claude-code/REVIEW-2026-11-15.md). Only the new app's hr_* objects.
--  1. "Sees" is read-only. Someone HR allows to see a folder could also add and delete goals, write private notes and
--     start / sign off appraisals (the write rules reused the read rule). Now only HR and the person's real line manager
--     (set on their Employment) change those; private notes are read by HR, the line manager and the writer only.
--  2. Every part switched off meant "the company's usual parts", not nothing. Now an empty list is nothing, and saving
--     people with no part is refused.
--  3. The first save for one person switched "company admins see everyone's" on, even where a named HR team had been
--     chosen without them. It now stays as it was.
--  4. If the last person who sees everyone's left the company or became a client, nobody could get back in (and a
--     client kept access). Named people must still be staff; with nobody left, company admins can get back in.
--  5. Someone allowed to see a folder also got probation and leaving dates. Now job title, department and line manager.
--  6. The first versions' direct routes (writing hr_team rows; hr_set_viewer_access) skipped the "at least one person"
--     check and the change log. They are closed; everything goes through hr_save_team / hr_set_person_access.

-- 4. Who sees everyone's folders.
create or replace function public.hr_is_team()
returns boolean language sql stable security definer set search_path to 'public' as $$
  with o as (select public.my_org_id() as id),
  x as (select s.team_admins, s.team_pms, s.set_up_at from public.hr_secure_settings s, o where s.org_id = o.id),
  staff as (select p.id, p.role from public.profiles p, o where p.org_id = o.id and p.role not in ('client', 'superadmin') and p.role not like 'subcontractor%'),
  named as (select t.user_id from public.hr_team t, o where t.org_id = o.id and t.user_id in (select id from staff))
  select case
    when not exists (select 1 from x where set_up_at is not null) and not exists (select 1 from public.hr_team t, o where t.org_id = o.id)
      then coalesce(public.is_admin(), false)
    else exists (select 1 from named where user_id = auth.uid())
      or (coalesce((select team_admins from x), false) and coalesce(public.is_admin(), false))
      or (coalesce((select team_pms from x), false) and exists (select 1 from staff where id = auth.uid() and role = 'pm'))
      -- nobody left who qualifies (the last one left, or changed role): company admins can get back in
      or (coalesce(public.is_admin(), false) and not exists (select 1 from named)
          and not (coalesce((select team_pms from x), false) and exists (select 1 from staff where role = 'pm')))
  end;
$$;

-- 2. The parts someone sees: an empty list is nothing; not set = the company's parts.
create or replace function public.hr_lm_sees(p_user uuid, p_section text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select p_section not in ('contracts', 'pay', 'rtw', 'conduct', 'bonus', 'personal', 'other') and (
    (exists (select 1 from public.hr_records r where r.user_id = p_user and r.line_manager_id = auth.uid() and r.org_id = public.my_org_id())
      and p_section = any(coalesce((select s.hr_lm_sections from public.hr_settings s where s.org_id = public.my_org_id()), array['performance', 'emergency'])))
    or exists (select 1 from public.hr_viewers v where v.user_id = p_user and v.viewer_id = auth.uid() and v.org_id = public.my_org_id()
      and p_section = any(coalesce(v.sections, (select s.hr_lm_sections from public.hr_settings s where s.org_id = public.my_org_id()), array['performance', 'emergency']))));
$$;

-- 1. Who may change someone's performance side besides HR: their real line manager, where line managers see performance.
create or replace function public.hr_lm_writes(p_user uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.hr_records r where r.user_id = p_user and r.line_manager_id = auth.uid() and r.org_id = public.my_org_id())
    and 'performance' = any(coalesce((select s.hr_lm_sections from public.hr_settings s where s.org_id = public.my_org_id()), array['performance', 'emergency']));
$$;

alter policy "hr goals insert" on public.hr_goals with check (org_id = (select public.my_org_id()) and ((select public.hr_is_team()) or user_id = (select auth.uid()) or public.hr_lm_writes(user_id)));
alter policy "hr goals update" on public.hr_goals using (org_id = (select public.my_org_id()) and ((select public.hr_is_team()) or user_id = (select auth.uid()) or public.hr_lm_writes(user_id)))
  with check (org_id = (select public.my_org_id()) and ((select public.hr_is_team()) or user_id = (select auth.uid()) or public.hr_lm_writes(user_id)));
alter policy "hr goals delete" on public.hr_goals using (org_id = (select public.my_org_id()) and ((select public.hr_is_team()) or public.hr_lm_writes(user_id)));
alter policy "hr feedback insert" on public.hr_feedback with check (org_id = (select public.my_org_id()) and from_id = (select auth.uid()) and user_id <> (select auth.uid())
  and ((select public.hr_is_team()) or public.hr_lm_writes(user_id) or (kind = 'praise' and not private)));
alter policy "hr feedback read" on public.hr_feedback using (org_id = (select public.my_org_id()) and ((select public.hr_is_team()) or from_id = (select auth.uid())
  or (user_id = (select auth.uid()) and not private) or (public.hr_lm_sees(user_id, 'performance') and (not private or public.hr_lm_writes(user_id)))));
alter policy "hr appraisals insert" on public.hr_appraisals with check (org_id = (select public.my_org_id()) and ((select public.hr_is_team()) or public.hr_lm_writes(user_id)));
alter policy "hr appraisals update" on public.hr_appraisals using (org_id = (select public.my_org_id()) and ((select public.hr_is_team()) or user_id = (select auth.uid()) or public.hr_lm_writes(user_id)))
  with check (org_id = (select public.my_org_id()) and ((select public.hr_is_team()) or user_id = (select auth.uid()) or public.hr_lm_writes(user_id)));
create or replace function public.guard_hr_appraisals()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null then return new; end if;
  new.user_id := old.user_id; new.org_id := old.org_id; new.created_by := old.created_by;
  if public.hr_is_team() or public.is_superadmin() or public.hr_lm_writes(old.user_id) then return new; end if;
  if old.status = 'done' then raise exception 'This appraisal has been signed off'; end if;
  new.manager_id := old.manager_id; new.due_date := old.due_date; new.review := old.review; new.rating := old.rating;
  new.summary := old.summary; new.completed_at := old.completed_at;
  new.status := case when new.status in ('due', 'self_done') then new.status else old.status end;
  return new;
end $$;

-- 5. The basics of someone's record: HR, the person and their line manager as before; someone HR allowed gets job title,
--    department and line manager only (and the emergency contact if that part is theirs).
create or replace function public.hr_basic(p_user uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select case when r.user_id is null then null
    when public.hr_is_team() or p_user = auth.uid() or r.line_manager_id = auth.uid() then
      jsonb_build_object('user_id', r.user_id, 'org_id', r.org_id, 'job_title', r.job_title, 'department', r.department, 'employment_type', r.employment_type,
        'start_date', r.start_date, 'probation_end', r.probation_end, 'end_date', r.end_date, 'line_manager_id', r.line_manager_id)
      || case when public.hr_is_team() or p_user = auth.uid() or public.hr_lm_sees(p_user, 'emergency')
           then jsonb_build_object('emergency_name', r.emergency_name, 'emergency_relationship', r.emergency_relationship, 'emergency_phone', r.emergency_phone) else '{}'::jsonb end
    when public.hr_is_line_manager(p_user) then
      jsonb_build_object('user_id', r.user_id, 'org_id', r.org_id, 'job_title', r.job_title, 'department', r.department, 'line_manager_id', r.line_manager_id)
      || case when public.hr_lm_sees(p_user, 'emergency')
           then jsonb_build_object('emergency_name', r.emergency_name, 'emergency_relationship', r.emergency_relationship, 'emergency_phone', r.emergency_phone) else '{}'::jsonb end
    else null end
  from (select 1) x left join public.hr_records r on r.user_id = p_user and r.org_id = public.my_org_id();
$$;

-- 2, 3. One person's HR access in one go.
create or replace function public.hr_set_person_access(p_viewer uuid, p_everyone boolean, p_people uuid[], p_sections text[])
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare v_org uuid := public.my_org_id(); v_people uuid[]; v_name text; v_names text; v_secs text[]; v_n int; v_admins_default boolean;
begin
  if auth.uid() is null or v_org is null or not public.hr_is_team() then raise exception 'HR team only'; end if;
  select p.name into v_name from public.profiles p where p.id = p_viewer and p.org_id = v_org and p.role not in ('client', 'superadmin') and p.role not like 'subcontractor%';
  if v_name is null then raise exception 'Not in this company'; end if;
  select coalesce(array_agg(p.id), '{}') into v_people from public.profiles p
    where p.org_id = v_org and p.id = any(coalesce(p_people, '{}')) and p.id <> p_viewer and p.role not in ('client', 'superadmin') and p.role not like 'subcontractor%';
  select coalesce(array_agg(x), '{}') into v_secs from unnest(coalesce(p_sections, '{}')) x
    where x in ('performance', 'emergency', 'licences', 'health', 'absence', 'history');
  if not coalesce(p_everyone, false) and cardinality(v_people) > 0 and cardinality(v_secs) = 0 then raise exception 'Choose at least one part'; end if;
  -- First change: set up as it stands now. Company admins stay in unless a named HR team was already chosen without them.
  v_admins_default := not exists (select 1 from public.hr_team t where t.org_id = v_org);
  insert into public.hr_secure_settings (org_id, team_admins, set_up_at, set_up_by) values (v_org, v_admins_default, now(), auth.uid())
  on conflict (org_id) do update set team_admins = coalesce(public.hr_secure_settings.team_admins, v_admins_default),
    set_up_at = coalesce(public.hr_secure_settings.set_up_at, now()), set_up_by = coalesce(public.hr_secure_settings.set_up_by, auth.uid());
  if coalesce(p_everyone, false) then
    insert into public.hr_team (org_id, user_id, added_by) values (v_org, p_viewer, auth.uid()) on conflict do nothing;
  else
    delete from public.hr_team t where t.org_id = v_org and t.user_id = p_viewer;
    select count(*) into v_n from public.profiles p, public.hr_secure_settings x where p.org_id = v_org and x.org_id = v_org
      and p.role not in ('client', 'superadmin') and p.role not like 'subcontractor%'
      and (p.id in (select t.user_id from public.hr_team t where t.org_id = v_org) or (coalesce(x.team_admins, false) and p.role = 'admin') or (coalesce(x.team_pms, false) and p.role = 'pm'));
    if v_n = 0 then raise exception 'Choose at least one person'; end if;
  end if;
  delete from public.hr_viewers v where v.org_id = v_org and v.viewer_id = p_viewer and not (v.user_id = any(v_people));
  insert into public.hr_viewers (org_id, viewer_id, user_id, added_by, sections) select v_org, p_viewer, u, auth.uid(), v_secs from unnest(v_people) u
  on conflict (viewer_id, user_id) do update set sections = excluded.sections;
  select string_agg(p.name, ', ' order by p.name) into v_names from public.profiles p where p.id = any(v_people);
  insert into public.hr_access_log (org_id, by_id, what) values (v_org, auth.uid(),
    v_name || ': ' || case when coalesce(p_everyone, false) then 'sees everyone''s folders.' when v_names is null then 'their own folder only.'
      else 'sees the folders of ' || v_names || ' (' || array_to_string(v_secs, ', ') || ').' end);
  return true;
end $$;

-- 6. The first versions' direct routes are closed.
alter policy "hr team add" on public.hr_team with check (false);
alter policy "hr team remove" on public.hr_team using (false);
create or replace function public.hr_set_viewer_access(p_viewer uuid, p_people uuid[])
returns boolean language plpgsql security definer set search_path to 'public' as $$
begin
  raise exception 'Replaced by hr_set_person_access';
end $$;
