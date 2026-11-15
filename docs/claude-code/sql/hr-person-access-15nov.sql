-- APPLIED 15 Nov 2026 (migration hr_person_access). Record only; nothing to run.
-- HR Access, one person at a time (Andy, 15 Nov 2026: "Can we have it as grouped by role, the click and a pop up to have
-- who can see / What can they see, similar to now but more compact"):
--  * what someone sees of the folders they're allowed is set for them (hr_viewers.sections), not only company-wide
--    (empty = the company's What Others See, as before). Contracts, pay, right to work, bonus and disciplinary never.
--  * hr_set_person_access saves one person in one go: sees everyone's folders (named on the HR team) Yes / No, whose
--    folders they see, and which parts. Logged.
-- Only the new app's hr_* objects change; nothing the current app uses.

alter table public.hr_viewers add column if not exists sections text[];

-- May the signed-in person see this part of this person's folder (not as HR)? Line manager: the company's parts.
-- Allowed by HR: their own parts if set, else the company's. Never contracts, pay, right to work, bonus, disciplinary.
create or replace function public.hr_lm_sees(p_user uuid, p_section text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select p_section not in ('contracts', 'pay', 'rtw', 'conduct', 'bonus', 'personal', 'other') and (
    (exists (select 1 from public.hr_records r where r.user_id = p_user and r.line_manager_id = auth.uid() and r.org_id = public.my_org_id())
      and p_section = any(coalesce((select s.hr_lm_sections from public.hr_settings s where s.org_id = public.my_org_id()), array['performance', 'emergency'])))
    or exists (select 1 from public.hr_viewers v where v.user_id = p_user and v.viewer_id = auth.uid() and v.org_id = public.my_org_id()
      and p_section = any(coalesce(nullif(v.sections, '{}'::text[]), (select s.hr_lm_sections from public.hr_settings s where s.org_id = public.my_org_id()), array['performance', 'emergency']))));
$$;

-- One person's HR access in one go (the people who see everyone's folders only).
create or replace function public.hr_set_person_access(p_viewer uuid, p_everyone boolean, p_people uuid[], p_sections text[])
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare v_org uuid := public.my_org_id(); v_people uuid[]; v_name text; v_names text; v_secs text[]; v_n int;
begin
  if auth.uid() is null or v_org is null or not public.hr_is_team() then raise exception 'HR team only'; end if;
  select p.name into v_name from public.profiles p where p.id = p_viewer and p.org_id = v_org and p.role not in ('client', 'superadmin') and p.role not like 'subcontractor%';
  if v_name is null then raise exception 'Not in this company'; end if;
  -- First change: set up, keeping every company admin in (as it was before set-up).
  insert into public.hr_secure_settings (org_id, team_admins, set_up_at, set_up_by) values (v_org, true, now(), auth.uid())
  on conflict (org_id) do update set team_admins = coalesce(public.hr_secure_settings.team_admins, true),
    set_up_at = coalesce(public.hr_secure_settings.set_up_at, now()), set_up_by = coalesce(public.hr_secure_settings.set_up_by, auth.uid());
  if p_everyone then
    insert into public.hr_team (org_id, user_id, added_by) values (v_org, p_viewer, auth.uid()) on conflict do nothing;
  else
    delete from public.hr_team t where t.org_id = v_org and t.user_id = p_viewer;
    select count(*) into v_n from public.profiles p, public.hr_secure_settings x where p.org_id = v_org and x.org_id = v_org
      and (p.id in (select t.user_id from public.hr_team t where t.org_id = v_org) or (coalesce(x.team_admins, false) and p.role = 'admin') or (coalesce(x.team_pms, false) and p.role = 'pm'));
    if v_n = 0 then raise exception 'Choose at least one person'; end if;
  end if;
  select coalesce(array_agg(p.id), '{}') into v_people from public.profiles p
    where p.org_id = v_org and p.id = any(coalesce(p_people, '{}')) and p.id <> p_viewer and p.role not in ('client', 'superadmin') and p.role not like 'subcontractor%';
  select coalesce(array_agg(x), '{}') into v_secs from unnest(coalesce(p_sections, '{}')) x
    where x in ('performance', 'emergency', 'licences', 'health', 'absence', 'history');
  delete from public.hr_viewers v where v.org_id = v_org and v.viewer_id = p_viewer and not (v.user_id = any(v_people));
  insert into public.hr_viewers (org_id, viewer_id, user_id, added_by, sections) select v_org, p_viewer, u, auth.uid(), v_secs from unnest(v_people) u
  on conflict (viewer_id, user_id) do update set sections = excluded.sections;
  select string_agg(p.name, ', ' order by p.name) into v_names from public.profiles p where p.id = any(v_people);
  insert into public.hr_access_log (org_id, by_id, what) values (v_org, auth.uid(),
    v_name || ': ' || case when p_everyone then 'sees everyone''s folders.' when v_names is null then 'their own folder only.'
      else 'sees the folders of ' || v_names || ' (' || coalesce(nullif(array_to_string(v_secs, ', '), ''), 'the usual parts') || ').' end);
  return true;
end $$;

-- hr_who_has_access: the pairings now carry their parts.
create or replace function public.hr_who_has_access()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  with o as (select public.my_org_id() as id),
  s as (select x.* from public.hr_secure_settings x, o where x.org_id = o.id),
  named as (select t.user_id from public.hr_team t, o where t.org_id = o.id),
  set_up as (select exists (select 1 from s where s.set_up_at is not null) or exists (select 1 from named) as v),
  adm as (select case when (select v from set_up) then coalesce((select team_admins from s), false) else true end as v),
  pms as (select coalesce((select team_pms from s), false) as v),
  ppl as (
    select p.id, p.name, p.role,
      array_remove(array[
        case when p.id in (select user_id from named) then 'named' end,
        case when p.role = 'admin' and (select v from adm) then 'admin' end,
        case when p.role = 'pm' and (select v from pms) then 'pm' end], null) as why
    from public.profiles p, o where p.org_id = o.id and p.role not in ('client', 'superadmin') and p.role not like 'subcontractor%'
  ),
  boss as (select public.hr_is_team() or public.is_admin() as v)
  select case when auth.uid() is null or (select id from o) is null then null else jsonb_build_object(
    'set_up', (select v from set_up),
    'team_admins', (select v from adm),
    'team_pms', (select v from pms),
    'named', coalesce((select jsonb_agg(user_id) from named), '[]'::jsonb),
    'people', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'role', role, 'why', to_jsonb(why)) order by name) from ppl where cardinality(why) > 0), '[]'::jsonb),
    'set_up_at', (select set_up_at from s),
    'set_up_by', (select p.name from public.profiles p where p.id = (select set_up_by from s)),
    'sees_mine', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) order by p.name) from public.profiles p
        where p.id in (select v.viewer_id from public.hr_viewers v, o where v.org_id = o.id and v.user_id = auth.uid()
                       union select r.line_manager_id from public.hr_records r, o where r.org_id = o.id and r.user_id = auth.uid())), '[]'::jsonb),
    'grants', case when (select v from boss) then coalesce((select jsonb_agg(jsonb_build_object('viewer_id', v.viewer_id, 'user_id', v.user_id, 'sections', to_jsonb(v.sections))) from public.hr_viewers v, o where v.org_id = o.id), '[]'::jsonb) else '[]'::jsonb end,
    'log', case when (select v from boss) then coalesce((select jsonb_agg(jsonb_build_object('at', l.at, 'by', p.name, 'what', l.what) order by l.at desc)
        from (select * from public.hr_access_log l, o where l.org_id = o.id order by l.at desc limit 20) l left join public.profiles p on p.id = l.by_id), '[]'::jsonb) else '[]'::jsonb end
  ) end;
$$;

-- The parts of this person's folder the signed-in person may see as a line manager or someone HR allowed (for the app;
-- the same rule as every hr_* table, hr_lm_sees). Applied as hr_sections_for.
create or replace function public.hr_sections_for(p_user uuid)
returns text[] language sql stable security definer set search_path to 'public' as $$
  select coalesce(array_agg(x), '{}') from unnest(array['performance', 'emergency', 'licences', 'health', 'absence', 'history']) x where public.hr_lm_sees(p_user, x);
$$;
