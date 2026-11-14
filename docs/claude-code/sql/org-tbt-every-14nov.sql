-- APPLIED 14 Nov 2026 (migration org_tbt_every). Record only; nothing to run.
-- How often each live project needs a Toolbox Talk (new app, Andy 14 Nov 2026: "set up the rules for tbt required
-- monthly in the admin, some companies may have it more infrequent"). Null = every month, as before.
alter table public.organizations add column if not exists tbt_every text;
alter table public.organizations add constraint organizations_tbt_every_check
  check (tbt_every is null or tbt_every in ('week','2weeks','month','2months','3months','6months','off'));
comment on column public.organizations.tbt_every is 'New app: how often a Toolbox Talk is needed on each live project: week, 2weeks, month (null = month), 2months, 3months, 6months or off. Company admins only.';

-- Only company admins (or superadmin / server) can change it; anyone else's update keeps the old value.
create or replace function public.guard_org_tbt_every()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null or public.is_admin() or public.is_superadmin() then return new; end if;
  new.tbt_every := old.tbt_every;
  return new;
end $$;

create trigger guard_org_tbt_every before update on public.organizations
  for each row execute function public.guard_org_tbt_every();
