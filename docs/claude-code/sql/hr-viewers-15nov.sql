-- APPLIED 15 Nov 2026 (migration hr_viewers). Record only; nothing to run.
-- Who can see whose HR folder, person by person (Andy, 15 Nov 2026: "each pm etc has hr to book holiday, has the
-- folders we created, but only they can see their folder, and then the admin sets who else can see it ... I can also
-- allow pm 1 to see estimator 1 and pm 3 (as that's their team, but I don't want to group by team just individual).
-- Other pms shouldn't be able to see others folders but have access to their own, the holiday and company policies"):
--  * hr_viewers: one row per "this person may see that person's folder", set by the people who open HR (company admins
--    unless HR Access says otherwise). No one else sees anyone's folder.
--  * Someone allowed sees what a line manager does: the parts HR Access › What Others See switches on (performance and
--    emergency contact unless changed); contracts, pay, right to work, bonus and disciplinary never.
--  * Every change is logged in hr_access_log.
-- Only the new app's hr_* objects change; nothing the current app uses.

create table if not exists public.hr_viewers (
  org_id uuid not null references public.organizations(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  added_by uuid, added_at timestamptz not null default now(),
  primary key (viewer_id, user_id),
  check (viewer_id <> user_id)
);
alter table public.hr_viewers enable row level security;
create index if not exists hr_viewers_user on public.hr_viewers (user_id);
-- Read: the people who open HR, and the two people a row is about. Written only through hr_set_viewer_access.
create policy "hr viewers read" on public.hr_viewers for select
  using (org_id = (select public.my_org_id()) and ((select public.hr_is_team()) or viewer_id = (select auth.uid()) or user_id = (select auth.uid())));

-- "May the signed-in person see this person's folder as someone other than HR?": their line manager, or allowed by HR.
-- (hr_lm_sees, hr_basic and every hr_* table rule go through this, so the parts allowed follow automatically.)
create or replace function public.hr_is_line_manager(p_user uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.hr_records r where r.user_id = p_user and r.line_manager_id = auth.uid() and r.org_id = public.my_org_id())
      or exists (select 1 from public.hr_viewers v where v.user_id = p_user and v.viewer_id = auth.uid() and v.org_id = public.my_org_id());
$$;

-- The people whose folders the signed-in person may see besides their own (line-managed or allowed).
create or replace function public.hr_my_reports()
returns table (user_id uuid, job_title text) language sql stable security definer set search_path to 'public' as $$
  select u.user_id, r.job_title from (
    select r0.user_id from public.hr_records r0 where r0.org_id = public.my_org_id() and r0.line_manager_id = auth.uid()
    union
    select v.user_id from public.hr_viewers v where v.org_id = public.my_org_id() and v.viewer_id = auth.uid()
  ) u left join public.hr_records r on r.user_id = u.user_id and r.org_id = public.my_org_id();
$$;

-- Set whose folders one person may see (replaces their list). The people who open HR only.
create or replace function public.hr_set_viewer_access(p_viewer uuid, p_people uuid[])
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare v_org uuid := public.my_org_id(); v_people uuid[]; v_name text; v_names text;
begin
  if auth.uid() is null or v_org is null or not public.hr_is_team() then raise exception 'HR team only'; end if;
  select p.name into v_name from public.profiles p where p.id = p_viewer and p.org_id = v_org and p.role not in ('client', 'superadmin') and p.role not like 'subcontractor%';
  if v_name is null then raise exception 'Not in this company'; end if;
  select coalesce(array_agg(p.id), '{}') into v_people from public.profiles p
    where p.org_id = v_org and p.id = any(coalesce(p_people, '{}')) and p.id <> p_viewer and p.role not in ('client', 'superadmin') and p.role not like 'subcontractor%';
  delete from public.hr_viewers v where v.org_id = v_org and v.viewer_id = p_viewer and not (v.user_id = any(v_people));
  insert into public.hr_viewers (org_id, viewer_id, user_id, added_by) select v_org, p_viewer, u, auth.uid() from unnest(v_people) u on conflict do nothing;
  select string_agg(p.name, ', ' order by p.name) into v_names from public.profiles p where p.id = any(v_people);
  insert into public.hr_access_log (org_id, by_id, what) values (v_org, auth.uid(),
    v_name || case when v_names is null then ': their own folder only.' else ' can see the folders of ' || v_names || '.' end);
  return true;
end $$;

-- Who can open HR, now with who may see whose folder: everyone sees the names of who opens HR, and who can see their
-- own folder; the HR team and company admins see every pairing and the change log.
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
    'grants', case when (select v from boss) then coalesce((select jsonb_agg(jsonb_build_object('viewer_id', v.viewer_id, 'user_id', v.user_id)) from public.hr_viewers v, o where v.org_id = o.id), '[]'::jsonb) else '[]'::jsonb end,
    'log', case when (select v from boss) then coalesce((select jsonb_agg(jsonb_build_object('at', l.at, 'by', p.name, 'what', l.what) order by l.at desc)
        from (select * from public.hr_access_log l, o where l.org_id = o.id order by l.at desc limit 20) l left join public.profiles p on p.id = l.by_id), '[]'::jsonb) else '[]'::jsonb end
  ) end;
$$;
