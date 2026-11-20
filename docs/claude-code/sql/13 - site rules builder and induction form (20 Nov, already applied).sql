-- Record only: applied 20 Nov 2026 (migration site_rules_and_induction_form). Additive: two new tables.
-- Andy, 20 Nov 2026: "the site rules and layouts need to be a customisable (template style) sheet, where we can add in
-- numbered items and it creates a pdf with the site rules etc. allow upload still but needs to be a bit like the rams build.
-- so does the inductions, these need to be a bit more of a customisable form that then creates a document for signing by
-- operatives and adding info missing, ie next of kin etc".

-- A job's Site Rules sheet as it's built (site_id set), or the company's starting template (site_id null, one per company).
-- Issuing makes a PDF that goes into site_layout_docs, where it's signed exactly as an uploaded one.
create table if not exists public.site_rules_builds (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid references public.sites(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  status text not null default 'draft' check (status in ('draft', 'issued')),
  layout_doc_id uuid references public.site_layout_docs(id) on delete set null,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists site_rules_builds_one_template on public.site_rules_builds (org_id) where site_id is null;
create index if not exists site_rules_builds_site on public.site_rules_builds (site_id);
alter table public.site_rules_builds enable row level security;
create policy "site rules builds read" on public.site_rules_builds for select to authenticated
  using ((select public.is_pm()) and org_id = (select public.my_org_id()) and (site_id is null or public.has_site_access(site_id)));
create policy "site rules builds add" on public.site_rules_builds for insert to authenticated
  with check ((select public.is_pm()) and org_id = (select public.my_org_id()) and (site_id is null or public.has_site_access(site_id)));
create policy "site rules builds change" on public.site_rules_builds for update to authenticated
  using ((select public.is_pm()) and org_id = (select public.my_org_id()) and (site_id is null or public.has_site_access(site_id)))
  with check ((select public.is_pm()) and org_id = (select public.my_org_id()) and (site_id is null or public.has_site_access(site_id)));
create policy "site rules builds remove" on public.site_rules_builds for delete to authenticated
  using ((select public.is_pm()) and org_id = (select public.my_org_id()) and (site_id is null or public.has_site_access(site_id)));

-- The company's induction form: sections of questions (ticks, yes / no, text, phone, date). Everyone in the company reads
-- it (operatives fill it in); managers change it.
create table if not exists public.induction_templates (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_by uuid default auth.uid() references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.induction_templates enable row level security;
create policy "induction form read" on public.induction_templates for select to authenticated
  using (org_id = (select public.my_org_id()));
create policy "induction form add" on public.induction_templates for insert to authenticated
  with check ((select public.is_pm()) and org_id = (select public.my_org_id()));
create policy "induction form change" on public.induction_templates for update to authenticated
  using ((select public.is_pm()) and org_id = (select public.my_org_id()))
  with check ((select public.is_pm()) and org_id = (select public.my_org_id()));
