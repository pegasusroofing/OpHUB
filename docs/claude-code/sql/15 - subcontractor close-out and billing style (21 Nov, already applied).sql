-- Record only: applied 21 Nov 2026 (migration subcontractor_closeout). Additive: a new table and one new column.
-- Andy, 20 Nov 2026: "ok i like the close out, our pm/site manager sign off / retention release might not always be
-- relevant so all it to be an invoice only style job or application style for the subcontractor / no once the job is
-- closed their access is closed".
-- One close-out per subcontractor company on a job: how they're paid (invoice only, or applications with retention),
-- the retention figures and release dates, the final account tick, and our PM / site manager's sign-off with the
-- certificate. Their project manager can see it; only our managers change or sign it.
create table if not exists public.subcontractor_closeouts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  subcontractor_company_id uuid not null unique references public.subcontractor_companies(id) on delete cascade,
  billing_type text check (billing_type in ('invoice', 'application')),
  fin_subcontract_id uuid references public.fin_subcontracts(id) on delete set null,
  order_value numeric,
  retention_pct numeric,
  pc_date date,
  defects_end date,
  final_account_agreed boolean not null default false,
  override_reason text,
  signed_by uuid references public.profiles(id) on delete set null,
  signed_at timestamptz,
  signature_path text,
  certificate_path text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.subcontractor_closeouts enable row level security;
create policy "closeouts read" on public.subcontractor_closeouts for select to authenticated
  using (((select public.is_pm()) and org_id = (select public.my_org_id()) and public.has_site_access(site_id)) or public.is_sub_admin_strict(subcontractor_company_id));
create policy "closeouts add" on public.subcontractor_closeouts for insert to authenticated
  with check ((select public.is_pm()) and org_id = (select public.my_org_id()) and public.has_site_access(site_id)
    and exists (select 1 from public.subcontractor_companies c where c.id = subcontractor_closeouts.subcontractor_company_id and c.site_id = subcontractor_closeouts.site_id and c.org_id = subcontractor_closeouts.org_id));
create policy "closeouts change" on public.subcontractor_closeouts for update to authenticated
  using ((select public.is_pm()) and org_id = (select public.my_org_id()) and public.has_site_access(site_id))
  with check ((select public.is_pm()) and org_id = (select public.my_org_id()) and public.has_site_access(site_id));

-- The person who signs is whoever is signed in; a signature can't be put in someone else's name.
create or replace function public.guard_closeout_sign()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null then return new; end if;
  if new.signed_at is distinct from old.signed_at or new.signed_by is distinct from old.signed_by then
    if new.signed_at is null then new.signed_by := null; else new.signed_by := auth.uid(); new.signed_at := now(); end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger guard_closeout_sign before update on public.subcontractor_closeouts for each row execute function public.guard_closeout_sign();

-- Finance's subcontract can say which subcontractor company on the job it is (the close-out reads its order value and
-- retention %). Nothing else changes in Finance.
alter table public.fin_subcontracts add column if not exists subcontractor_company_id uuid references public.subcontractor_companies(id) on delete set null;
