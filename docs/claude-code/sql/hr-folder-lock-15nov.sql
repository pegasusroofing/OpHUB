-- APPLIED 15 Nov 2026 (migration hr_folder_lock). Record only; nothing to run.
-- HR folder in OneDrive (Andy, 15 Nov 2026: "I want to have hr linked to a specific folder in the OneDrive where access
-- is managed, but also I need it to be clear in the app who could have access to it pm / admin / otherwise which is all
-- set at the start by the admin and then there onwards"):
--  * Who can open HR is set once by a company admin: All Company Admins Yes / No, All Project Managers Yes / No, and
--    named people (any role). From then on only those people open everyone's HR folders, in OpHUB and in the HR folder
--    in OneDrive (the OneDrive functions ask hr_is_team() as the caller), and only they change it.
--  * Every change is written to hr_access_log (who, when, what), shown on HR › HR Access.
--  * The HR folder can't be one OpHUB already uses for something else (a project, operative, repair job, quote or Quick
--    Link), so no one outside HR already holds a way in.
-- Only the new app's hr_* objects change; nothing the current app uses.

alter table public.hr_secure_settings add column if not exists team_admins boolean;
alter table public.hr_secure_settings add column if not exists team_pms boolean;
alter table public.hr_secure_settings add column if not exists set_up_at timestamptz;
alter table public.hr_secure_settings add column if not exists set_up_by uuid;

create table if not exists public.hr_access_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  at timestamptz not null default now(),
  by_id uuid references public.profiles(id) on delete set null,
  what text not null
);
alter table public.hr_access_log enable row level security;
create index if not exists hr_access_log_org on public.hr_access_log (org_id, at desc);

-- Who's on the HR team. Not set up yet (and no named team from before): every company admin, as before.
-- Set up: the named people, plus all company admins / all project managers if chosen.
create or replace function public.hr_is_team()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select case
    when not exists (select 1 from public.hr_secure_settings x where x.org_id = public.my_org_id() and x.set_up_at is not null)
     and not exists (select 1 from public.hr_team t where t.org_id = public.my_org_id())
      then coalesce(public.is_admin(), false)
    else exists (select 1 from public.hr_team t where t.org_id = public.my_org_id() and t.user_id = auth.uid())
      or (coalesce((select x.team_admins from public.hr_secure_settings x where x.org_id = public.my_org_id()), false) and coalesce(public.is_admin(), false))
      or (coalesce((select x.team_pms from public.hr_secure_settings x where x.org_id = public.my_org_id()), false)
          and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'pm'))
  end;
$$;

create policy "hr access log read" on public.hr_access_log for select
  using (org_id = (select public.my_org_id()) and ((select public.hr_is_team()) or (select public.is_admin())));

-- Who can open HR right now, for the app: anyone in the company may see the names (so staff know who sees their
-- folder); the change log only the HR team and company admins.
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
  )
  select case when auth.uid() is null or (select id from o) is null then null else jsonb_build_object(
    'set_up', (select v from set_up),
    'team_admins', (select v from adm),
    'team_pms', (select v from pms),
    'named', coalesce((select jsonb_agg(user_id) from named), '[]'::jsonb),
    'people', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'role', role, 'why', to_jsonb(why)) order by name) from ppl where cardinality(why) > 0), '[]'::jsonb),
    'set_up_at', (select set_up_at from s),
    'set_up_by', (select p.name from public.profiles p where p.id = (select set_up_by from s)),
    'log', case when public.hr_is_team() or public.is_admin() then coalesce((select jsonb_agg(jsonb_build_object('at', l.at, 'by', p.name, 'what', l.what) order by l.at desc)
        from (select * from public.hr_access_log l, o where l.org_id = o.id order by l.at desc limit 20) l left join public.profiles p on p.id = l.by_id), '[]'::jsonb) else '[]'::jsonb end
  ) end;
$$;

-- Set who can open HR (the first time, a company admin; after that, the HR team). At least one person must be left.
create or replace function public.hr_save_team(p_admins boolean, p_pms boolean, p_people uuid[])
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_org uuid := public.my_org_id(); v_people uuid[]; v_n int; v_names text;
begin
  if auth.uid() is null or v_org is null or not public.hr_is_team() then raise exception 'HR team only'; end if;
  select coalesce(array_agg(p.id), '{}') into v_people from public.profiles p
    where p.org_id = v_org and p.id = any(coalesce(p_people, '{}')) and p.role not in ('client', 'superadmin') and p.role not like 'subcontractor%';
  select count(*) into v_n from public.profiles p where p.org_id = v_org
    and (p.id = any(v_people) or (coalesce(p_admins, false) and p.role = 'admin') or (coalesce(p_pms, false) and p.role = 'pm'));
  if v_n = 0 then raise exception 'Choose at least one person'; end if;
  insert into public.hr_secure_settings (org_id, team_admins, team_pms, set_up_at, set_up_by)
    values (v_org, coalesce(p_admins, false), coalesce(p_pms, false), now(), auth.uid())
  on conflict (org_id) do update set team_admins = excluded.team_admins, team_pms = excluded.team_pms,
    set_up_at = coalesce(public.hr_secure_settings.set_up_at, now()), set_up_by = coalesce(public.hr_secure_settings.set_up_by, auth.uid()), updated_at = now();
  delete from public.hr_team t where t.org_id = v_org and not (t.user_id = any(v_people));
  insert into public.hr_team (org_id, user_id, added_by) select v_org, u, auth.uid() from unnest(v_people) u on conflict do nothing;
  select string_agg(p.name, ', ' order by p.name) into v_names from public.profiles p where p.id = any(v_people);
  insert into public.hr_access_log (org_id, by_id, what) values (v_org, auth.uid(),
    'All Company Admins: ' || case when coalesce(p_admins, false) then 'Yes' else 'No' end
    || '. All Project Managers: ' || case when coalesce(p_pms, false) then 'Yes' else 'No' end
    || '. Named: ' || coalesce(v_names, 'no one') || '.');
  return public.hr_who_has_access();
end $$;

create or replace function public.hr_my_access()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'team', public.hr_is_team(),
    'team_set', exists (select 1 from public.hr_team t where t.org_id = public.my_org_id())
      or exists (select 1 from public.hr_secure_settings x where x.org_id = public.my_org_id() and x.set_up_at is not null),
    'lm_sections', to_jsonb(coalesce((select s.hr_lm_sections from public.hr_settings s where s.org_id = public.my_org_id()), array['performance', 'emergency'])),
    'appraisal_months', coalesce((select s.appraisal_months from public.hr_settings s where s.org_id = public.my_org_id()), 12),
    'onedrive', case when public.hr_is_team() then (select x.onedrive from public.hr_secure_settings x where x.org_id = public.my_org_id()) else null end
  );
$$;

-- The HR team's settings. The HR folder can't be one OpHUB already uses elsewhere; changes to it are logged.
create or replace function public.hr_save_settings(p_months int default null, p_lm_sections text[] default null, p_onedrive jsonb default null, p_clear_onedrive boolean default false)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare v_org uuid := public.my_org_id(); v_id text := nullif(p_onedrive->>'id', ''); v_old jsonb;
begin
  if not public.hr_is_team() then raise exception 'HR team only'; end if;
  if p_months is not null or p_lm_sections is not null then
    insert into public.hr_settings (org_id, appraisal_months, hr_lm_sections) values (v_org, p_months, p_lm_sections)
    on conflict (org_id) do update set
      appraisal_months = coalesce(p_months, public.hr_settings.appraisal_months),
      hr_lm_sections = coalesce(p_lm_sections, public.hr_settings.hr_lm_sections), updated_at = now();
  end if;
  if p_onedrive is not null or p_clear_onedrive then
    select x.onedrive into v_old from public.hr_secure_settings x where x.org_id = v_org;
    if v_id is not null and v_id is distinct from (v_old->>'id') and (
         exists (select 1 from public.sites s where s.org_id = v_org and v_id in (s.onedrive_folder_id, s.site_inductions_folder_id, s.material_orders_folder_id))
      or exists (select 1 from public.profiles p where p.org_id = v_org and p.onedrive_folder_id = v_id)
      or exists (select 1 from public.manual_operatives m where m.org_id = v_org and m.onedrive_folder_id = v_id)
      or exists (select 1 from public.repair_jobs r where r.org_id = v_org and r.onedrive_folder_id = v_id)
      or exists (select 1 from public.quotes q where q.org_id = v_org and q.folder_id = v_id)
      or exists (select 1 from public.organizations o, jsonb_array_elements(case when jsonb_typeof(o.onedrive_pinned_folders) = 'array' then o.onedrive_pinned_folders else '[]'::jsonb end) e
                 where o.id = v_org and e->>'id' = v_id)) then
      raise exception 'linked_elsewhere';
    end if;
    insert into public.hr_secure_settings (org_id, onedrive) values (v_org, case when p_clear_onedrive then null else p_onedrive end)
    on conflict (org_id) do update set onedrive = case when p_clear_onedrive then null else p_onedrive end, updated_at = now();
    insert into public.hr_access_log (org_id, by_id, what) values (v_org, auth.uid(),
      case when p_clear_onedrive then 'HR folder in OneDrive removed: OpHUB no longer hides it.'
           when v_id is distinct from (v_old->>'id') then 'HR folder in OneDrive set to "' || coalesce(p_onedrive->>'name', 'a folder') || '".'
           when (p_onedrive->>'on') = 'false' then 'Copying HR documents to OneDrive stopped.'
           else 'Copying HR documents to OneDrive started.' end);
  end if;
  return true;
end $$;
