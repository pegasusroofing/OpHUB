-- Applied 16 Nov 2026. A company's own list of roles (Andy, 16 Nov: "I think we need to create a selection of roles?
-- Admin, Contracts administrator, Finance controller, Project manager, Quantity surveyor, Document controller, Contracts
-- manager, Operative (as we have now) ... I want that to be a set list that the admin can see, but also add and remove").
-- Only adds: a table, a column on profiles, three functions and three triggers. Nothing existing changes.
--
-- Each role has a name and "uses the app as" (access): one of the app's existing levels. The permissions themselves
-- still come from profiles.role / is_estimator / finance_only, exactly as before, so every row rule is unchanged.
-- profiles.org_role_id says which of the company's roles a person has. Only company admins change it; when someone's
-- app level changes any other way (the current app, an invite, a PM's allowed change), they get the company's default
-- role for that level. Someone with no org_role_id yet is shown as the default role for their level.

create table if not exists public.org_roles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 60),
  access text not null check (access in ('admin', 'pm', 'estimator', 'finance_controller', 'site_manager', 'operative', 'driver', 'client')),
  is_default boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create unique index if not exists org_roles_name_uq on public.org_roles (org_id, lower(btrim(name)));
create unique index if not exists org_roles_default_uq on public.org_roles (org_id, access) where is_default;
alter table public.org_roles enable row level security;
create policy "org roles: company reads" on public.org_roles for select to authenticated using (org_id = (select public.my_org_id()) or (select public.is_superadmin()));
create policy "org roles: admins add" on public.org_roles for insert to authenticated with check (org_id = (select public.my_org_id()) and (select public.is_admin()));
create policy "org roles: admins change" on public.org_roles for update to authenticated using (org_id = (select public.my_org_id()) and (select public.is_admin())) with check (org_id = (select public.my_org_id()) and (select public.is_admin()));
create policy "org roles: admins remove" on public.org_roles for delete to authenticated using (org_id = (select public.my_org_id()) and (select public.is_admin()));

alter table public.profiles add column if not exists org_role_id uuid references public.org_roles(id) on delete set null;
create index if not exists profiles_org_role_idx on public.profiles (org_role_id);

-- The app level a profile has, in the roles' words.
create or replace function public.profile_access(p_role text, p_est boolean, p_fin_only boolean) returns text
language sql immutable set search_path = public as $$
  select case when p_role = 'pm' and coalesce(p_fin_only, false) then 'finance_controller'
              when p_role = 'pm' and coalesce(p_est, false) then 'estimator' else p_role end
$$;

-- The starting list (Andy's, then the app's other levels as they are today, so nobody loses theirs).
create or replace function public.org_roles_seed(p_org uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.org_roles where org_id = p_org) then return; end if;
  insert into public.org_roles (org_id, name, access, is_default, position, created_by)
  select p_org, x.name, x.access, x.def, x.pos, null from (values
    ('Admin', 'admin', true, 1), ('Contracts Administrator', 'pm', false, 2), ('Finance Controller', 'finance_controller', true, 3),
    ('Project Manager', 'pm', true, 4), ('Quantity Surveyor', 'pm', false, 5), ('Document Controller', 'pm', false, 6),
    ('Contracts Manager', 'pm', false, 7), ('Estimator', 'estimator', true, 8), ('Site Manager', 'site_manager', true, 9),
    ('Operative', 'operative', true, 10), ('Delivery Driver', 'driver', true, 11), ('Client', 'client', true, 12)
  ) as x(name, access, def, pos);
end $$;
revoke execute on function public.org_roles_seed(uuid) from public, anon, authenticated;

create or replace function public.org_roles_seed_new_org() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform public.org_roles_seed(new.id); return new; end $$;
drop trigger if exists zz_org_roles_seed on public.organizations;
create trigger zz_org_roles_seed after insert on public.organizations for each row execute function public.org_roles_seed_new_org();

-- Keeps profiles.org_role_id true to the person's app level. Runs after every other profile trigger (name order).
create or replace function public.profiles_org_role_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_access text := public.profile_access(new.role, new.is_estimator, new.finance_only); v_role_access text;
begin
  -- Only company admins (and the platform) choose someone's role; anyone else's change to it is ignored.
  if tg_op = 'UPDATE' and new.org_role_id is distinct from old.org_role_id and auth.uid() is not null
     and not public.is_admin() and not public.is_superadmin() then
    new.org_role_id := old.org_role_id;
  end if;
  if new.org_role_id is not null then
    select r.access into v_role_access from public.org_roles r where r.id = new.org_role_id and r.org_id = new.org_id;
    if v_role_access is distinct from v_access then new.org_role_id := null; end if;
  end if;
  if new.org_role_id is null and new.org_id is not null and (tg_op = 'INSERT'
     or (new.role, new.is_estimator, new.finance_only, new.org_id) is distinct from (old.role, old.is_estimator, old.finance_only, old.org_id)) then
    select r.id into new.org_role_id from public.org_roles r where r.org_id = new.org_id and r.access = v_access and r.is_default limit 1;
  end if;
  return new;
end $$;
drop trigger if exists zzz_profiles_org_role_sync on public.profiles;
create trigger zzz_profiles_org_role_sync before insert or update on public.profiles for each row execute function public.profiles_org_role_sync();

-- A role people have can't be removed or given another app level (move them first). The server (no signed-in user,
-- e.g. deleting a whole company) isn't stopped.
create or replace function public.org_roles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  if tg_op = 'UPDATE' and new.org_id <> old.org_id then raise exception 'A role stays in its own company.'; end if;
  if tg_op = 'DELETE' or new.access <> old.access or (old.is_default and not new.is_default) then
    select count(*) into n from public.profiles p where p.org_id = old.org_id
      and (p.org_role_id = old.id or (p.org_role_id is null and old.is_default and public.profile_access(p.role, p.is_estimator, p.finance_only) = old.access));
    if n > 0 then raise exception 'People have this role. Move them to another role first.' using errcode = 'P0001'; end if;
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists org_roles_guard on public.org_roles;
create trigger org_roles_guard before update or delete on public.org_roles for each row execute function public.org_roles_guard();

-- Every company starts with the list.
select public.org_roles_seed(o.id) from public.organizations o;
