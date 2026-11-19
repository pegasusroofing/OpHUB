-- Finance trial or live per company (Andy, 19 Nov 2026: "i want to make construction live. tell me how as super admin
-- i can do that"). Applied by Claude on 19 Nov 2026 (migration finance_live_19nov). Additions only.
-- Checked with a self-undoing test: a company admin can't change it; the platform's super admin can.
alter table public.organizations add column if not exists finance_live boolean not null default false;

create or replace function public.guard_finance_live() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.finance_live is distinct from old.finance_live and auth.uid() is not null and not public.is_superadmin() then
    new.finance_live := old.finance_live;
  end if;
  return new;
end $$;
drop trigger if exists organizations_guard_finance_live on public.organizations;
create trigger organizations_guard_finance_live before update of finance_live on public.organizations
  for each row execute function public.guard_finance_live();
revoke execute on function public.guard_finance_live() from public, anon, authenticated;
