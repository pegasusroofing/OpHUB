-- Applied 19 Nov 2026 (additive): the Construction Phase Plan builder's tables (new app, beta link only for now).
-- cpp_plans: a job's plans (data = the plan as built). cpp_defaults: a company's saved wording for new plans.
create table if not exists public.cpp_plans (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.my_org_id() references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  title text not null default 'Construction Phase Plan',
  data jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  status text not null default 'draft',
  mc_document_id uuid references public.mc_documents(id) on delete set null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cpp_plans_site_idx on public.cpp_plans(site_id);
alter table public.cpp_plans enable row level security;
create policy "cpp plans read" on public.cpp_plans for select to authenticated using (public.has_site_access(site_id));
create policy "cpp plans add" on public.cpp_plans for insert to authenticated with check ((select public.is_pm()) and public.has_site_access(site_id) and org_id = (select public.my_org_id()));
create policy "cpp plans change" on public.cpp_plans for update to authenticated using ((select public.is_pm()) and public.has_site_access(site_id)) with check ((select public.is_pm()) and public.has_site_access(site_id) and org_id = (select public.my_org_id()));
create policy "cpp plans remove" on public.cpp_plans for delete to authenticated using ((select public.is_pm()) and public.has_site_access(site_id));
create table if not exists public.cpp_defaults (
  org_id uuid primary key default public.my_org_id() references public.organizations(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);
alter table public.cpp_defaults enable row level security;
create policy "cpp defaults read" on public.cpp_defaults for select to authenticated using (org_id = (select public.my_org_id()));
create policy "cpp defaults add" on public.cpp_defaults for insert to authenticated with check ((select public.is_pm()) and org_id = (select public.my_org_id()));
create policy "cpp defaults change" on public.cpp_defaults for update to authenticated using ((select public.is_pm()) and org_id = (select public.my_org_id())) with check (org_id = (select public.my_org_id()));
