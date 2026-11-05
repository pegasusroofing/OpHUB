-- ==========================================================================================
-- OpHUB: purchase invoices approve themselves when nothing looks wrong (Andy, 5 Nov 2026:
-- "approving each one will take ages").
-- RUN ON 5 Nov 2026 (Andy asked to try again), as migration pinv_auto_approve_5nov. Checked on Sandbox (rolled back): a Directory supplier's invoice approved itself, an unknown supplier's waited, a flagged one stayed on query.
-- How to run: Supabase > SQL Editor > New query, paste this whole file, press Run.
-- It only ADDS things: a company switch, a marker on each invoice, and a rule that runs when a new
-- purchase invoice is saved. Nothing is deleted, and invoices already in OpHUB are not changed.
-- Safe to run twice.
--
-- The rule: a new purchase invoice is approved straight away when ALL of these are true:
--   * nothing was flagged on it (not over its PO, not a possible duplicate, no delivery problem);
--   * it is filed to a project;
--   * the supplier is already in your Directory (so a made-up invoice from an unknown company
--     emailed to the inbox still waits for a person).
-- Anything else still waits in "Needs Checking". The switch is in Finance > Settings >
-- Purchase invoices; it starts ON (a blank setting counts as on).
-- While Finance is on trial nothing goes to Xero, so approving sends nothing anywhere.
-- ==========================================================================================

begin;

alter table public.fin_settings add column if not exists pi_auto_approve boolean;
alter table public.purchase_invoices add column if not exists auto_approved boolean;

-- A supplier name made comparable: lower case, no Ltd / Limited / PLC / LLP / UK / The, letters and numbers only.
create or replace function public.pinv_supplier_key(x text) returns text
language sql immutable set search_path = public as $$
  select regexp_replace(regexp_replace(lower(coalesce(x, '')), '\m(ltd|limited|plc|llp|uk|the)\M', '', 'g'), '[^a-z0-9]', '', 'g')
$$;

create or replace function public.pinv_auto_approve() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from 'to_approve' or new.site_id is null or coalesce(new.kind, 'invoice') <> 'invoice' then return new; end if;
  if coalesce((select fs.pi_auto_approve from public.fin_settings fs where fs.org_id = new.org_id), true) is not true then return new; end if;
  if not exists (select 1 from public.suppliers s where s.org_id = new.org_id
                  and (s.id = new.supplier_id
                       or (length(public.pinv_supplier_key(s.name)) > 2 and public.pinv_supplier_key(s.name) = public.pinv_supplier_key(new.supplier_name)))) then
    return new;
  end if;
  new.status := 'approved';
  new.approved_at := now();
  new.auto_approved := true;
  return new;
end $$;
revoke execute on function public.pinv_auto_approve() from public, anon, authenticated;

drop trigger if exists zz_pinv_auto_approve on public.purchase_invoices;
create trigger zz_pinv_auto_approve before insert on public.purchase_invoices
  for each row execute function public.pinv_auto_approve();

commit;

-- Check (should show 1 row each):
select 'switch column' as what, count(*) from information_schema.columns where table_name = 'fin_settings' and column_name = 'pi_auto_approve'
union all select 'rule', count(*) from pg_trigger where tgname = 'zz_pinv_auto_approve';

-- UNDO, if you ever want every invoice to wait for approval again (or just switch it off in Finance > Settings):
-- drop trigger if exists zz_pinv_auto_approve on public.purchase_invoices;
