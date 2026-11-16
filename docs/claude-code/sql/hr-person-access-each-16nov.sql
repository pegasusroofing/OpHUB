-- Applied 16 Nov 2026 (as live after hr-sensitive-parts-16nov.sql). HR Who Can See What, person by person with each
-- person's own parts (Andy, 16 Nov: "the admin selects pm, then selects what folders they can see for that pm. And then
-- repeat"; "contracts pay rights to work and disciplinary, this should be selectable by the admin as well").
-- p_grants is [{"user_id": .., "sections": [..]}]. HR team only; viewer and people must be staff of the caller's company;
-- parts outside the list (personal, other) are dropped; a person with no part is refused; logged to hr_access_log.
-- Also in this file: the org_roles guard as changed after the bug review (a level's main role can't be removed or moved).
CREATE OR REPLACE FUNCTION public.hr_set_person_access_each(p_viewer uuid, p_everyone boolean, p_grants jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_org uuid := public.my_org_id(); v_name text; v_names text; v_n int; v_admins_default boolean;
begin
  if auth.uid() is null or v_org is null or not public.hr_is_team() then raise exception 'HR team only'; end if;
  select p.name into v_name from public.profiles p where p.id = p_viewer and p.org_id = v_org and p.role not in ('client', 'superadmin') and p.role not like 'subcontractor%';
  if v_name is null then raise exception 'Not in this company'; end if;
  create temp table if not exists _hr_g (user_id uuid primary key, secs text[]) on commit drop;
  delete from _hr_g;
  if not coalesce(p_everyone, false) and jsonb_typeof(coalesce(p_grants, '[]'::jsonb)) = 'array' then
    insert into _hr_g (user_id, secs)
    select p.id, (select coalesce(array_agg(distinct s), '{}') from jsonb_array_elements_text(coalesce(g->'sections', '[]'::jsonb)) s
                  where s in ('performance', 'emergency', 'licences', 'health', 'absence', 'history', 'contracts', 'pay', 'rtw', 'conduct', 'bonus'))
    from jsonb_array_elements(p_grants) g join public.profiles p on p.id = (g->>'user_id')::uuid
    where p.org_id = v_org and p.id <> p_viewer and p.role not in ('client', 'superadmin') and p.role not like 'subcontractor%'
    on conflict (user_id) do nothing;
    if exists (select 1 from _hr_g where cardinality(secs) = 0) then raise exception 'Choose at least one part'; end if;
  end if;
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
  delete from public.hr_viewers v where v.org_id = v_org and v.viewer_id = p_viewer and not exists (select 1 from _hr_g g where g.user_id = v.user_id);
  insert into public.hr_viewers (org_id, viewer_id, user_id, added_by, sections) select v_org, p_viewer, g.user_id, auth.uid(), g.secs from _hr_g g
  on conflict (viewer_id, user_id) do update set sections = excluded.sections;
  select string_agg(p.name || ' (' || array_to_string(g.secs, ', ') || ')', '; ' order by p.name) into v_names from _hr_g g join public.profiles p on p.id = g.user_id;
  insert into public.hr_access_log (org_id, by_id, what) values (v_org, auth.uid(),
    v_name || ': ' || case when coalesce(p_everyone, false) then 'sees everyone''s folders.' when v_names is null then 'their own folder only.'
      else 'sees the folders of ' || v_names || '.' end);
  return true;
end $function$;
revoke execute on function public.hr_set_person_access_each(uuid, boolean, jsonb) from public, anon;
grant execute on function public.hr_set_person_access_each(uuid, boolean, jsonb) to authenticated;

create or replace function public.org_roles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  if tg_op = 'UPDATE' and new.org_id <> old.org_id then raise exception 'A role stays in its own company.'; end if;
  if old.is_default and (tg_op = 'DELETE' or new.access <> old.access or not new.is_default) then
    raise exception 'This is the main role for its level. You can rename it.' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' or new.access <> old.access then
    select count(*) into n from public.profiles p where p.org_id = old.org_id
      and (p.org_role_id = old.id or (p.org_role_id is null and old.is_default and public.profile_access(p.role, p.is_estimator, p.finance_only) = old.access));
    if n > 0 then raise exception 'People have this role. Move them to another role first.' using errcode = 'P0001'; end if;
  end if;
  return coalesce(new, old);
end $$;
