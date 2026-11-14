-- APPLIED 14 Nov 2026 (migration org_home_tiles). Record only; nothing to run.
-- Which Home finance tiles each role sees (new app, Andy 14 Nov 2026). Null / missing key = shown (as before).
alter table public.organizations add column if not exists home_tiles jsonb;
comment on column public.organizations.home_tiles is 'New app Home: {finance_pm, finance_site_manager, finance_other} booleans; false hides the money tiles from that role. Company admins only.';

-- Only company admins (or superadmin / server) can change it; a PM's update keeps the old value.
create or replace function public.guard_org_home_tiles()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null or public.is_admin() or public.is_superadmin() then return new; end if;
  new.home_tiles := old.home_tiles;
  return new;
end $$;

drop trigger if exists guard_org_home_tiles on public.organizations;
create trigger guard_org_home_tiles before update on public.organizations
  for each row execute function public.guard_org_home_tiles();
