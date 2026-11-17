-- Applied 17 Nov 2026. What each role can do (Andy, 16-17 Nov: the roles board, "everyone should start with the same
-- as the project managers ... then I will build from there"; "I also want this board built into the app").
-- Additive only: a new column on org_roles, two new functions, and RTB's starting choices in the new column.
-- perms null = the role can do everything its level allows (as before this existed); otherwise only the listed parts.
-- Company admins are never limited. Nothing in the database refuses anything yet: the app reads my_role_perms();
-- the database locks come later, for roles nobody had before, so the current app is unchanged.
alter table public.org_roles add column if not exists perms text[];
alter table public.org_roles add constraint org_roles_perms_known check (perms is null or perms <@ array[
  'every_job', 'create_projects', 'prices', 'fin_view', 'fin_edit', 'quotes', 'sow', 'snags', 'hs_signoff', 'orders',
  'docs', 'team', 'people', 'reports', 'notify']::text[]);

-- The signed-in person's parts: their chosen role (if it still matches their level), else their level's main role.
create or replace function public.my_role_perms() returns text[]
language sql stable security definer set search_path = public as $$
  select case when p.role in ('admin', 'superadmin') then null else (
    select r.perms from public.org_roles r
    where r.org_id = p.org_id and r.access = public.profile_access(p.role, p.is_estimator, p.finance_only)
      and (r.id = p.org_role_id or r.is_default)
    order by (r.id = p.org_role_id) desc limit 1) end
  from public.profiles p where p.id = auth.uid();
$$;
revoke execute on function public.my_role_perms() from public, anon;
grant execute on function public.my_role_perms() to authenticated;

create or replace function public.role_can(p_part text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(p_part = any(public.my_role_perms()), public.my_role_perms() is null);
$$;
revoke execute on function public.role_can(text) from public, anon;
grant execute on function public.role_can(text) to authenticated;

-- RTB's choices from the board (Andy, 17 Nov 2026).
update public.org_roles set perms = array['every_job', 'create_projects', 'prices', 'fin_view', 'quotes', 'sow', 'snags',
  'hs_signoff', 'orders', 'docs', 'team', 'people', 'reports', 'notify']
where org_id = 'e56d69c8-94e1-4c50-bcb3-5a565c476674' and name in ('Project Manager', 'Contracts Manager', 'Quantity Surveyor', 'Contracts Administrator');
update public.org_roles set perms = array['every_job', 'create_projects', 'fin_view', 'quotes', 'sow', 'snags', 'orders', 'docs', 'team', 'reports']
where org_id = 'e56d69c8-94e1-4c50-bcb3-5a565c476674' and name = 'Document Controller';
update public.org_roles set perms = array['every_job', 'create_projects', 'prices', 'fin_view', 'fin_edit', 'quotes', 'orders', 'docs', 'team', 'reports']
where org_id = 'e56d69c8-94e1-4c50-bcb3-5a565c476674' and name = 'Finance Controller';
update public.org_roles set perms = array['every_job', 'create_projects', 'sow', 'snags', 'hs_signoff', 'orders', 'docs', 'team', 'reports', 'notify']
where org_id = 'e56d69c8-94e1-4c50-bcb3-5a565c476674' and name = 'Site Manager';
update public.org_roles set perms = array['every_job', 'create_projects', 'prices', 'fin_view', 'quotes', 'sow', 'snags', 'orders', 'docs', 'team', 'reports']
where org_id = 'e56d69c8-94e1-4c50-bcb3-5a565c476674' and name = 'Estimator';
