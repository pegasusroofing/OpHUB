-- Repair contracts rebuild (Andy, 7 Nov 2026; plan in docs/claude-code/REPAIRS-PLAN.md).
-- Additions only: new columns on repair_jobs and checkins, a new notes table. Nothing existing is changed or removed;
-- the old job_status stays as it is (the app works out the new stage from the job's fields).
-- Applied on 7 Nov 2026 as migration repairs_rebuild_7nov.

alter table public.repair_jobs
  add column if not exists tenant_name text,
  add column if not exists tenant_phone text,
  add column if not exists tenant_no text,
  add column if not exists priority text,
  add column if not exists fault_description text,
  add column if not exists repair_description text,
  add column if not exists completed_in_visit boolean,
  add column if not exists works_booking_date date,
  add column if not exists works_booking_assigned_to uuid,
  add column if not exists works_booking_event_id uuid,
  add column if not exists on_hold boolean not null default false,
  add column if not exists on_hold_reason text,
  add column if not exists other_trades text,
  add column if not exists other_trades_date date,
  add column if not exists invoice_id uuid,
  add column if not exists geofence_lat double precision,
  add column if not exists geofence_lon double precision,
  add column if not exists geofence_radius_m integer;

-- Which repair job a check-in was for (the contract stays the site).
alter table public.checkins add column if not exists repair_job_id uuid;
create index if not exists checkins_repair_job on public.checkins (repair_job_id) where repair_job_id is not null;

-- Notes on a job: everyone with access to the contract (the client too) can read and add them; no edits or deletes.
create table if not exists public.repair_job_notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.my_org_id(),
  repair_job_id uuid not null references public.repair_jobs(id) on delete cascade,
  author_id uuid not null default auth.uid(),
  author_name text,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists repair_job_notes_job on public.repair_job_notes (repair_job_id, created_at);
alter table public.repair_job_notes enable row level security;
drop policy if exists repair_job_notes_read on public.repair_job_notes;
create policy repair_job_notes_read on public.repair_job_notes for select to authenticated
  using (exists (select 1 from public.repair_jobs rj where rj.id = repair_job_id and public.has_site_access(rj.site_id)));
drop policy if exists repair_job_notes_add on public.repair_job_notes;
create policy repair_job_notes_add on public.repair_job_notes for insert to authenticated
  with check (author_id = auth.uid() and exists (select 1 from public.repair_jobs rj where rj.id = repair_job_id and public.has_site_access(rj.site_id)));

create or replace function public.repair_job_notes_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then new.author_id := auth.uid(); end if;
  select p.name into new.author_name from profiles p where p.id = new.author_id;
  select rj.org_id into new.org_id from repair_jobs rj where rj.id = new.repair_job_id;
  new.created_at := now();
  return new;
end $$;
drop trigger if exists repair_job_notes_before on public.repair_job_notes;
create trigger repair_job_notes_before before insert on public.repair_job_notes for each row execute function public.repair_job_notes_before();
revoke execute on function public.repair_job_notes_before() from public, anon, authenticated;
