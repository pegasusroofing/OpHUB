-- Record only: applied 20 Nov 2026 (migrations company_library_from_signup, sub_briefing_signatures). Additive.

-- 1. Approving a subcontractor's sign-up sets the company up in the Company Library (Andy, 20 Nov 2026): which sign-up it came
--    from, when it was approved, and the person who signed it up (their login), who becomes the company's admin on a job.
alter table public.subcontractor_company_profiles
  add column if not exists application_id uuid references public.subcontractor_applications(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists contact_user_id uuid references public.profiles(id) on delete set null;

-- 2. Subcontractors' daily briefings signed by the operatives chosen (Andy, 20 Nov 2026: "sub contractors for a company need to
--    sign daily breifings should they be selected"). Proved with a self-undoing test: the chosen operative signs; nobody signs
--    for someone else; a colleague who wasn't chosen can't sign but can see it; another company's operative sees nothing.
alter table public.subcontractor_briefings add column if not exists signers uuid[];
create table if not exists public.subcontractor_briefing_signatures (
  id uuid primary key default gen_random_uuid(),
  briefing_id uuid not null references public.subcontractor_briefings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  signature_image_path text,
  signed_at timestamptz not null default now(),
  unique (briefing_id, user_id)
);
create index if not exists subcontractor_briefing_signatures_briefing_idx on public.subcontractor_briefing_signatures(briefing_id);
alter table public.subcontractor_briefing_signatures enable row level security;
create policy "read with the briefing" on public.subcontractor_briefing_signatures for select to authenticated
  using (exists (select 1 from public.subcontractor_briefings b where b.id = briefing_id));
create policy "sign own when chosen" on public.subcontractor_briefing_signatures for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.subcontractor_briefings b where b.id = briefing_id and (select auth.uid()) = any (b.signers)));
create policy "pm delete" on public.subcontractor_briefing_signatures for delete to authenticated
  using ((select public.is_pm()) and exists (select 1 from public.subcontractor_briefings b where b.id = briefing_id and public.has_site_access(b.site_id)));
