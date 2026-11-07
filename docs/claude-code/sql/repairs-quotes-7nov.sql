-- Repair quotes (Andy, 7 Nov 2026): a schedule of rates for each repair contract with a set discount, quote lines on
-- each job, and the contract's VAT from its Finance set-up (read through a function, as only Finance can read
-- job_finance). Additions only. Applied on 7 Nov 2026 as migration repairs_quotes_7nov.

-- The schedule of rates: one list per contract.
create table if not exists public.repair_rates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.my_org_id(),
  site_id uuid not null references public.sites(id) on delete cascade,
  code text,
  description text not null check (char_length(btrim(description)) between 1 and 500),
  unit text,
  rate numeric(12,2) not null default 0,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists repair_rates_site on public.repair_rates (site_id, sort);
alter table public.repair_rates enable row level security;
drop policy if exists repair_rates_read on public.repair_rates;
create policy repair_rates_read on public.repair_rates for select to authenticated using (public.has_site_access(site_id));
drop policy if exists repair_rates_write on public.repair_rates;
create policy repair_rates_write on public.repair_rates for all to authenticated
  using (public.is_pm() and public.has_site_access(site_id))
  with check (public.is_pm() and public.has_site_access(site_id) and org_id = public.my_org_id());

-- The contract's set discount off the schedule of rates.
alter table public.sites add column if not exists repair_discount_pct numeric(5,2);

-- Each job's quote: its lines (from the schedule of rates or typed in) and the discount it was priced with.
-- The quote's net total stays in repair_jobs.variation_cost (as before), and variation_issued_at is when it was sent.
alter table public.repair_jobs
  add column if not exists quote_lines jsonb,
  add column if not exists quote_discount_pct numeric(5,2);

-- The contract's VAT treatment (standard / reverse_charge / zero) for anyone on the contract, from its Finance set-up
-- or the company's default. Only the treatment: nothing else from Finance.
create or replace function public.repair_contract_vat(p_site uuid) returns text
language sql stable security definer set search_path = public as $$
  select case when not public.has_site_access(p_site) then null else coalesce(
    (select jf.vat_treatment from job_finance jf where jf.site_id = p_site),
    (select fs.default_vat from fin_settings fs join sites s on s.org_id = fs.org_id where s.id = p_site),
    'standard') end;
$$;
revoke execute on function public.repair_contract_vat(uuid) from public, anon;
grant execute on function public.repair_contract_vat(uuid) to authenticated;
