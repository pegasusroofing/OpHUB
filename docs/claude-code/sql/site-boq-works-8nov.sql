-- Applied 8 Nov 2026 (migration site_boq_works_8nov). Additive: a new function only.
-- The Bill of Quantities as a list of works, with no money (Andy, 8 Nov 2026: Projects does everything a PM needs,
-- Finance is only the money). Managers with access to the job can read the descriptions and quantities, e.g. for the
-- O&M manual's Scope of Works. Rates, values and costs stay Finance-only.
create or replace function public.site_boq_works(p_site uuid)
returns table(id uuid, "position" integer, kind text, ref text, section text, description text, qty numeric, unit text)
language sql stable security definer set search_path to 'public' as $$
  select c.id, c.position, c.kind, c.ref, c.section, c.description, c.qty, c.unit
  from public.fin_contract_items c
  where c.site_id = p_site
    and c.org_id = public.my_org_id()
    and public.has_site_access(p_site)
    and (public.is_pm() or public.is_finance())
  order by c.position;
$$;
grant execute on function public.site_boq_works(uuid) to authenticated;
