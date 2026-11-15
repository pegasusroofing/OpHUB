-- APPLIED 14 Nov 2026 (migration hr_employee_records). Record only; nothing to run.
-- HR › Employee Records (new app, Andy 14 Nov 2026): everyone has their own folder; company admins see everyone's.
-- Personal details (the person keeps them up to date themselves), employment, right to work, documents with expiry
-- dates (contracts, payslips, ID, licences…), job history, goals, feedback, appraisals and bonuses. A line manager
-- (set by the admin) sees and writes the performance side for their people, nothing else. All new; nothing existing
-- is changed.

-- One record per person.
create table if not exists public.hr_records (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  -- Personal (the person can change these)
  date_of_birth date, home_address text, postcode text, personal_phone text, personal_email text,
  emergency_name text, emergency_relationship text, emergency_phone text,
  -- Employment (company admin only)
  job_title text, department text, employment_type text, start_date date, probation_end date, end_date date,
  contracted_hours text, line_manager_id uuid references public.profiles(id) on delete set null,
  -- Right to work (company admin only)
  rtw_checked_on date, rtw_document text, rtw_expiry date,
  updated_at timestamptz not null default now(), updated_by uuid
);
-- Is the signed-in person this employee's line manager?
create or replace function public.hr_is_line_manager(p_user uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.hr_records r where r.user_id = p_user and r.line_manager_id = auth.uid() and r.org_id = public.my_org_id());
$$;

alter table public.hr_records enable row level security;
create policy "hr records read" on public.hr_records for select using (org_id = (select public.my_org_id()) and ((select public.is_admin()) or user_id = (select auth.uid()) or public.hr_is_line_manager(user_id)));
create policy "hr records insert" on public.hr_records for insert with check (org_id = (select public.my_org_id()) and ((select public.is_admin()) or user_id = (select auth.uid())));
create policy "hr records update" on public.hr_records for update using (org_id = (select public.my_org_id()) and ((select public.is_admin()) or user_id = (select auth.uid()))) with check (org_id = (select public.my_org_id()) and ((select public.is_admin()) or user_id = (select auth.uid())));

-- Someone who isn't a company admin can only change their own personal details.
create or replace function public.guard_hr_records()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null or public.is_admin() or public.is_superadmin() then new.updated_at := now(); return new; end if;
  if tg_op = 'INSERT' then
    new.job_title := null; new.department := null; new.employment_type := null; new.start_date := null; new.probation_end := null;
    new.end_date := null; new.contracted_hours := null; new.line_manager_id := null; new.rtw_checked_on := null; new.rtw_document := null; new.rtw_expiry := null;
  else
    new.job_title := old.job_title; new.department := old.department; new.employment_type := old.employment_type; new.start_date := old.start_date;
    new.probation_end := old.probation_end; new.end_date := old.end_date; new.contracted_hours := old.contracted_hours; new.line_manager_id := old.line_manager_id;
    new.rtw_checked_on := old.rtw_checked_on; new.rtw_document := old.rtw_document; new.rtw_expiry := old.rtw_expiry; new.org_id := old.org_id;
  end if;
  new.updated_at := now(); new.updated_by := auth.uid();
  return new;
end $$;
create trigger guard_hr_records before insert or update on public.hr_records for each row execute function public.guard_hr_records();

-- Documents in each person's folder (files in the private hr-docs store, <org>/<person>/<file>).
create table if not exists public.hr_docs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  folder text not null, item_key text, title text not null, file_name text, storage_path text not null,
  doc_date date, expiry_date date, hidden_from_employee boolean not null default false,
  uploaded_by uuid, created_at timestamptz not null default now()
);
create index if not exists hr_docs_user on public.hr_docs (user_id);
alter table public.hr_docs enable row level security;
create policy "hr docs read" on public.hr_docs for select using (org_id = (select public.my_org_id()) and ((select public.is_admin()) or (user_id = (select auth.uid()) and not hidden_from_employee)));
-- The person can add their own ID, licences, cards and health papers; everything else is the company admin.
create policy "hr docs insert" on public.hr_docs for insert with check (org_id = (select public.my_org_id()) and uploaded_by = (select auth.uid()) and ((select public.is_admin()) or (user_id = (select auth.uid()) and not hidden_from_employee and folder in ('rtw', 'licences', 'health', 'absence'))));
create policy "hr docs update" on public.hr_docs for update using (org_id = (select public.my_org_id()) and (select public.is_admin())) with check (org_id = (select public.my_org_id()) and (select public.is_admin()));
create policy "hr docs delete" on public.hr_docs for delete using (org_id = (select public.my_org_id()) and ((select public.is_admin()) or (user_id = (select auth.uid()) and uploaded_by = (select auth.uid()))));

-- Job history: started, role changes, pay reviews, training, leaving.
create table if not exists public.hr_history (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  on_date date not null, kind text not null default 'note', title text not null, detail text,
  created_by uuid, created_at timestamptz not null default now()
);
alter table public.hr_history enable row level security;
create policy "hr history read" on public.hr_history for select using (org_id = (select public.my_org_id()) and ((select public.is_admin()) or user_id = (select auth.uid()) or public.hr_is_line_manager(user_id)));
create policy "hr history write" on public.hr_history for all using (org_id = (select public.my_org_id()) and (select public.is_admin())) with check (org_id = (select public.my_org_id()) and (select public.is_admin()));

-- Goals: set by the admin or line manager, or proposed by the person; everyone involved updates progress.
create table if not exists public.hr_goals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null, detail text, due_date date, status text not null default 'not_started', progress int not null default 0,
  set_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.hr_goals enable row level security;
create policy "hr goals read" on public.hr_goals for select using (org_id = (select public.my_org_id()) and ((select public.is_admin()) or user_id = (select auth.uid()) or public.hr_is_line_manager(user_id)));
create policy "hr goals insert" on public.hr_goals for insert with check (org_id = (select public.my_org_id()) and ((select public.is_admin()) or user_id = (select auth.uid()) or public.hr_is_line_manager(user_id)));
create policy "hr goals update" on public.hr_goals for update using (org_id = (select public.my_org_id()) and ((select public.is_admin()) or user_id = (select auth.uid()) or public.hr_is_line_manager(user_id))) with check (org_id = (select public.my_org_id()));
create policy "hr goals delete" on public.hr_goals for delete using (org_id = (select public.my_org_id()) and ((select public.is_admin()) or public.hr_is_line_manager(user_id)));

-- Feedback: praise from anyone in the company; things to work on and private notes from the admin or line manager.
create table if not exists public.hr_feedback (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  from_id uuid not null, kind text not null default 'praise', body text not null, private boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.hr_feedback enable row level security;
create policy "hr feedback read" on public.hr_feedback for select using (org_id = (select public.my_org_id()) and ((select public.is_admin()) or public.hr_is_line_manager(user_id) or from_id = (select auth.uid()) or (user_id = (select auth.uid()) and not private)));
create policy "hr feedback insert" on public.hr_feedback for insert with check (org_id = (select public.my_org_id()) and from_id = (select auth.uid()) and user_id <> (select auth.uid()) and ((select public.is_admin()) or public.hr_is_line_manager(user_id) or (kind = 'praise' and not private)));
create policy "hr feedback delete" on public.hr_feedback for delete using (org_id = (select public.my_org_id()) and ((select public.is_admin()) or from_id = (select auth.uid())));

-- Appraisals: the person fills in their side, then the admin or line manager reviews and signs it off.
create table if not exists public.hr_appraisals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  manager_id uuid, due_date date not null, status text not null default 'due',
  self_answers jsonb, review jsonb, rating int, summary text, completed_at timestamptz,
  created_by uuid, created_at timestamptz not null default now()
);
alter table public.hr_appraisals enable row level security;
create policy "hr appraisals read" on public.hr_appraisals for select using (org_id = (select public.my_org_id()) and ((select public.is_admin()) or user_id = (select auth.uid()) or public.hr_is_line_manager(user_id)));
create policy "hr appraisals insert" on public.hr_appraisals for insert with check (org_id = (select public.my_org_id()) and ((select public.is_admin()) or public.hr_is_line_manager(user_id)));
create policy "hr appraisals update" on public.hr_appraisals for update using (org_id = (select public.my_org_id()) and ((select public.is_admin()) or user_id = (select auth.uid()) or public.hr_is_line_manager(user_id))) with check (org_id = (select public.my_org_id()));
create policy "hr appraisals delete" on public.hr_appraisals for delete using (org_id = (select public.my_org_id()) and (select public.is_admin()));
-- The person only fills in their own side, and only before it's signed off.
create or replace function public.guard_hr_appraisals()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null or public.is_admin() or public.is_superadmin() or public.hr_is_line_manager(old.user_id) then return new; end if;
  if old.status = 'done' then raise exception 'This appraisal has been signed off'; end if;
  new.manager_id := old.manager_id; new.due_date := old.due_date; new.review := old.review; new.rating := old.rating;
  new.summary := old.summary; new.completed_at := old.completed_at; new.user_id := old.user_id; new.org_id := old.org_id;
  new.status := case when new.status in ('due', 'self_done') then new.status else old.status end;
  return new;
end $$;
create trigger guard_hr_appraisals before update on public.hr_appraisals for each row execute function public.guard_hr_appraisals();

-- Bonuses: the company admin sets them; the person sees their own.
create table if not exists public.hr_bonuses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  period text not null, basis text not null default 'discretionary', target text, amount numeric(10,2),
  status text not null default 'proposed', notes text, paid_on date,
  created_by uuid, created_at timestamptz not null default now()
);
alter table public.hr_bonuses enable row level security;
create policy "hr bonuses read" on public.hr_bonuses for select using (org_id = (select public.my_org_id()) and ((select public.is_admin()) or user_id = (select auth.uid())));
create policy "hr bonuses write" on public.hr_bonuses for all using (org_id = (select public.my_org_id()) and (select public.is_admin())) with check (org_id = (select public.my_org_id()) and (select public.is_admin()));

-- How often appraisals come round (months); 12 if not set.
alter table public.hr_settings add column if not exists appraisal_months int;

-- The private file store: <org>/<person>/<file>. The company admin reads and writes all of their company's; the person
-- reads their own and adds their own.
insert into storage.buckets (id, name, public) values ('hr-docs', 'hr-docs', false) on conflict (id) do nothing;
create policy "hr docs files read" on storage.objects for select using (bucket_id = 'hr-docs' and (storage.foldername(name))[1] = (select public.my_org_id())::text and ((select public.is_admin()) or (storage.foldername(name))[2] = (select auth.uid())::text));
create policy "hr docs files add" on storage.objects for insert with check (bucket_id = 'hr-docs' and (storage.foldername(name))[1] = (select public.my_org_id())::text and ((select public.is_admin()) or (storage.foldername(name))[2] = (select auth.uid())::text));
create policy "hr docs files remove" on storage.objects for delete using (bucket_id = 'hr-docs' and (storage.foldername(name))[1] = (select public.my_org_id())::text and ((select public.is_admin()) or (storage.foldername(name))[2] = (select auth.uid())::text));
