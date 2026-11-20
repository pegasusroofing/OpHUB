-- A labour price sheet issued in Projects raises its subcontract order in Finance, or updates the one already linked to
-- it (applied by Claude on 20 Nov 2026 as migration price_sheet_subcontract_20nov; adds only).
-- Andy, 20 Nov 2026: "11 when done in projects should raise in finance as a subcontractor order please so let's not
-- duplicate what we upload but make sure they sync up".
-- One order per sheet (fin_subcontracts.price_sheet_id): issuing again, or changing an issued sheet, updates its value,
-- name and description; a sheet made from a Finance order updates that order. Tested on the live database with a test
-- that undid itself: an RTB Roofing sheet raised one order (calling twice kept one), and an already-linked sheet updated
-- its order without adding another.
create or replace function public.site_sheet_subcontract(p_sheet uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare sh record; v uuid; n integer;
begin
  select s.id, s.site_id, s.org_id, s.title, s.subcontractor_name, s.total, s.status into sh from price_builder_sheets s where s.id = p_sheet;
  if sh.id is null then raise exception 'That price sheet wasn''t found.' using errcode = 'P0001'; end if;
  if not (is_pm() and site_in_my_org(sh.site_id) and has_site_access(sh.site_id)) then raise exception 'Only a manager on this job can do this.' using errcode = '42501'; end if;
  if sh.status is distinct from 'issued' then return null; end if;
  select c.id into v from fin_subcontracts c where c.price_sheet_id = sh.id and c.org_id = sh.org_id order by c.created_at limit 1;
  if v is not null then
    update fin_subcontracts c set order_value = round(coalesce(sh.total, 0)::numeric, 2),
      name = coalesce(nullif(left(btrim(coalesce(sh.subcontractor_name, '')), 200), ''), c.name),
      description = coalesce(nullif(left(btrim(coalesce(sh.title, '')), 4000), ''), c.description)
    where c.id = v;
    return v;
  end if;
  perform pg_advisory_xact_lock(hashtext('sc:' || sh.site_id::text));
  select coalesce(max(c.seq), 0) + 1 into n from fin_subcontracts c where c.site_id = sh.site_id;
  insert into fin_subcontracts(org_id, site_id, seq, number, name, description, order_value, status, cis_rate, vat_registered, created_by, source, price_sheet_id)
  values (sh.org_id, sh.site_id, n, 'SC-' || lpad(n::text, 3, '0'),
          coalesce(nullif(left(btrim(coalesce(sh.subcontractor_name, '')), 200), ''), left(coalesce(sh.title, 'Price sheet'), 200)),
          nullif(left(btrim(coalesce(sh.title, '')), 4000), ''), round(coalesce(sh.total, 0)::numeric, 2), 'active', 20, false, auth.uid(), 'price_sheet', sh.id)
  returning id into v;
  return v;
end $$;
revoke all on function public.site_sheet_subcontract(uuid) from public, anon;
grant execute on function public.site_sheet_subcontract(uuid) to authenticated;

-- Later the same night, after the security and bug reviews (migrations price_sheet_subcontract_same_job_20nov and
-- price_sheet_subcontract_keep_finance_name_20nov): the function only ever touches an order on the sheet's own job in its
-- own company, only for a company with Finance, looks again under the lock (the older trigger fin_sheet_to_order may have
-- just made it), and leaves the name and description of an order Finance raised alone. The live definition is the
-- source of truth: select pg_get_functiondef('public.site_sheet_subcontract'::regproc);
