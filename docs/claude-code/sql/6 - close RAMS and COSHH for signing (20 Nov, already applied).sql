-- Record only: applied 20 Nov 2026 (migration rams_coshh_signing_closed). Additive.
alter table public.rams_docs add column if not exists signing_closed_at timestamptz, add column if not exists signing_closed_by uuid;
alter table public.coshh_docs add column if not exists signing_closed_at timestamptz, add column if not exists signing_closed_by uuid;
-- Only managers (is_pm / superadmin) can set or clear it; anyone else's change is ignored.
create or replace function public.guard_signing_closed()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null or public.is_pm() or public.is_superadmin() then
    if new.signing_closed_at is distinct from (case when tg_op='UPDATE' then old.signing_closed_at else null end) then
      new.signing_closed_by := case when new.signing_closed_at is null then null else coalesce(auth.uid(), new.signing_closed_by) end;
    end if;
    return new;
  end if;
  if tg_op = 'INSERT' then new.signing_closed_at := null; new.signing_closed_by := null;
  else new.signing_closed_at := old.signing_closed_at; new.signing_closed_by := old.signing_closed_by; end if;
  return new;
end $$;
create trigger zz_guard_signing_closed before insert or update on public.rams_docs for each row execute function public.guard_signing_closed();
create trigger zz_guard_signing_closed before insert or update on public.coshh_docs for each row execute function public.guard_signing_closed();
