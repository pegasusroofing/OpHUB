-- Applied 7 Nov 2026 (migration repairs_rates_trades_7nov). Additive only; kept here for the record.
-- Schedule of rates (NHF etc.): the sheet it came from, the heading it sits under, its short title, and which schedule.
alter table public.repair_rates add column if not exists category text;
alter table public.repair_rates add column if not exists section text;
alter table public.repair_rates add column if not exists title text;
alter table public.repair_rates add column if not exists source text;
-- The contract's answer to "Contract Rates?" in Finance set-up, and the name of the schedule uploaded.
alter table public.sites add column if not exists repair_uses_rates boolean;
alter table public.sites add column if not exists repair_rates_name text;
-- Other trades on a repair job (scaffold, electrician...): [{id, trade, date, done, done_at}].
alter table public.repair_jobs add column if not exists trades jsonb;
-- A photo of another trade's completed works: which trade (an id in repair_jobs.trades).
alter table public.repair_job_photos add column if not exists trade_id text;

-- Applied 7 Nov 2026 (migration repair_jobs_paid_7nov): which repair jobs' invoices are paid, ids only.
create or replace function public.repair_jobs_paid(p_site uuid)
returns setof uuid
language sql stable security definer
set search_path = public
as $$
  select r.id from public.repair_jobs r
  join public.fin_invoices i on i.id = r.invoice_id
  where r.site_id = p_site and i.status = 'paid' and public.has_site_access(p_site);
$$;
revoke all on function public.repair_jobs_paid(uuid) from public, anon;
grant execute on function public.repair_jobs_paid(uuid) to authenticated;
