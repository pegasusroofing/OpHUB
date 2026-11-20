-- SECURITY FIXES FOUND BY THE 20 NOV 2026 REVIEW — NOT APPLIED. They change things the current app relies on, so they
-- need Andy's go-ahead (CLAUDE.md). To apply: Supabase › SQL Editor › paste this whole file › Run. Each part is safe to
-- run again. Nothing is deleted; no data changes except refusing bad links going forward.
--
-- 1. (Medium) The older trigger that turns an issued labour price sheet into a Finance subcontract order
--    (fin_sheet_to_order) trusts price_builder_sheets.fin_subcontract_id, which any PM or site manager can set. Pointed at
--    another job's order, issuing the sheet re-values that order. Proven on the live database (rolled back): a site
--    manager moved another job's order from £14,800 to £77,777. Fix: only ever touch an order on the sheet's own job.
create or replace function public.fin_sheet_to_order()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_fin boolean; v_sc uuid; v_seq int; v_name text;
begin
  if new.status <> 'issued' then return new; end if;
  select coalesce(has_finance,false) into v_fin from organizations where id = new.org_id;
  if not v_fin or new.site_id is null then return new; end if;
  -- Only an order on this sheet's own job, in its own company (security review, 20 Nov 2026).
  select c.id into v_sc from fin_subcontracts c where c.id = new.fin_subcontract_id and c.org_id = new.org_id and c.site_id = new.site_id;
  if v_sc is null then select c.id into v_sc from fin_subcontracts c where c.price_sheet_id = new.id and c.org_id = new.org_id and c.site_id = new.site_id limit 1; end if;
  if v_sc is not null then
    update fin_subcontracts set order_value = new.total, price_sheet_id = new.id where id = v_sc and org_id = new.org_id and site_id = new.site_id;
    return new;
  end if;
  v_name := nullif(trim(coalesce(new.subcontractor_name,'')),'');
  if v_name is null and array_length(new.assigned_user_ids,1) > 0 then
    select string_agg(p.name, ', ' order by p.name) into v_name from profiles p where p.id = any(new.assigned_user_ids);
  end if;
  select coalesce(max(seq),0)+1 into v_seq from fin_subcontracts where site_id = new.site_id;
  insert into fin_subcontracts(org_id, site_id, seq, number, name, description, order_value, price_sheet_id, source, created_by, worker_id, cis_rate, vat_registered, utr, email)
  select new.org_id, new.site_id, v_seq, 'SC-'||lpad(v_seq::text,3,'0'), coalesce(v_name,'Subcontractor'), new.title, new.total, new.id, 'price_sheet', coalesce(new.issued_by,new.created_by),
         r.id, coalesce(r.cis_rate,20), coalesce(r.vat_registered,false), r.utr, r.email
  from (select 1) x left join lateral (
    select lr.* from fin_labour_rates lr where lr.org_id = new.org_id and lr.user_id is null and lower(coalesce(lr.trading_name,lr.name)) = lower(coalesce(v_name,'')) limit 1) r on true;
  return new;
end $function$;

-- 2. (Low) Expenses: the database lets any member add an expense, clients included, against any job id. The app now
--    hides Expenses from clients and needs a job in the company; this makes the database match. Operatives can still
--    send them (the current app's operatives use it).
drop policy if exists "member insert own expenses" on public.expenses;
create policy "member insert own expenses" on public.expenses for insert
  with check ((org_id = (select my_org_id())) and (created_by = (select auth.uid())) and not (select is_client())
              and (site_id is null or site_in_my_org(site_id)));
