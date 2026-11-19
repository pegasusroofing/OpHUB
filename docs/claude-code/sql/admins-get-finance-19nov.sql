-- Admins get Finance automatically (applied by Claude on 19 Nov 2026 as migration admins_get_finance_19nov).
-- Andy, 19 Nov 2026: "ok its live but no one has access to the finance. when it gets turned on the admins all need to
-- default to have finance showing".
--
-- 1. When a company's Finance is switched on (organizations.has_finance) or put live (organizations.finance_live), every
--    admin of that company gets Finance (profiles.finance_enabled = true, and the same in their saved company-switching
--    state). Nobody loses Finance; finance_hidden is left alone.
-- 2. When someone joins as an admin, or is made an admin, of a company that has Finance, they get Finance too.
--
-- Only adds (two functions, two triggers). Tested on the live database with a test that undid itself:
--   going_live_gives_admins_finance = true, made_admin_gets_finance = true.
-- Also run once on 19 Nov: RTB Construction Group's two admins given Finance
--   (update profiles set finance_enabled = true where org_id = '61b2b0dc-f831-4198-b438-690111e04f92' and role = 'admin').

create or replace function public.org_admins_get_finance() returns trigger language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if (new.has_finance and not coalesce(old.has_finance, false)) or (new.finance_live and not coalesce(old.finance_live, false)) then
    v := public._cm_as_system_begin();
    begin
      update public.profiles set finance_enabled = true
        where org_id = new.id and role = 'admin' and not coalesce(finance_enabled, false);
    exception when others then perform public._cm_as_system_end(v); raise;
    end;
    perform public._cm_as_system_end(v);
    update public.company_memberships set state = coalesce(state, '{}'::jsonb) || '{"finance_enabled": true}'::jsonb
      where org_id = new.id and state->>'role' = 'admin' and coalesce((state->>'finance_enabled')::boolean, false) = false;
  end if;
  return new;
end $$;

create trigger organizations_admins_get_finance
  after update of has_finance, finance_live on public.organizations
  for each row execute function public.org_admins_get_finance();

create or replace function public.new_admin_gets_finance() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'admin' and new.org_id is not null
     and (tg_op = 'INSERT' or (coalesce(old.role, '') <> 'admin' and new.org_id is not distinct from old.org_id))
     and exists (select 1 from public.organizations o where o.id = new.org_id and o.has_finance) then
    new.finance_enabled := true;
  end if;
  return new;
end $$;

create trigger profiles_new_admin_gets_finance
  before insert or update of role on public.profiles
  for each row execute function public.new_admin_gets_finance();

revoke execute on function public.org_admins_get_finance() from public, anon, authenticated;
revoke execute on function public.new_admin_gets_finance() from public, anon, authenticated;
