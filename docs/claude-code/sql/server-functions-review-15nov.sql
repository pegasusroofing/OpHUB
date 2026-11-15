-- Review 15 Nov 2026, section 3 (server functions). Additions only.
-- Already applied to the live database (migration "server_functions_review_15nov"). Kept here as the record.
-- Nothing in this file needs pasting into Supabase.

-- #1 Health and safety emails: the office copy is per company, not one fixed address.
--    send-report-email, send-coshh-email, send-havs-email, send-puwer-email and send-incident-email now copy in
--    the caller's own company's report_cc_email (if it has one) instead of one fixed address for every company.
alter table public.organizations add column if not exists report_cc_email text;
comment on column public.organizations.report_cc_email is
  'Address copied in on health and safety emails this company sends (reports, COSHH, HAVS, PUWER, incidents...). Null = no office copy. Review 15 Nov 2026, section 3 #1.';
-- RTB keeps the address the functions used until today.
update public.organizations set report_cc_email = 'andy.cramp@rtbroofinglimited.com'
 where id = 'e56d69c8-94e1-4c50-bcb3-5a565c476674' and report_cc_email is null;

-- Only company admins set it (like expenses_email). PMs can save their company's branding, so a separate trigger
-- keeps the address as it was for them (migration "guard_org_report_cc_15nov"); guard_org_admin_fields is unchanged.
create or replace function public.guard_org_report_cc()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null or public.is_admin() or public.is_superadmin() then return new; end if;
  new.report_cc_email := old.report_cc_email;
  return new;
end $$;
revoke all on function public.guard_org_report_cc() from public, anon, authenticated;
drop trigger if exists guard_org_report_cc on public.organizations;
create trigger guard_org_report_cc before update on public.organizations
  for each row execute function public.guard_org_report_cc();
-- Proven 15 Nov 2026 on the live database (Sandbox users, all undone): a PM's save leaves it unchanged, an operative
-- can't update the row, an admin sets their own company's but can't see or change another company's, and
-- onedrive_oauth_states is refused to signed-in users and to people not signed in.

-- #2 Connecting OneDrive: a single-use sign-in state (like xero_oauth_states), under 15 minutes old, deleted on use.
--    onedrive-oauth-start saves one row per Connect click; onedrive-oauth-callback uses it once and deletes it.
create table if not exists public.onedrive_oauth_states (
  state text primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null,
  native boolean not null default false,
  origin text,
  ret text,
  created_at timestamptz not null default now()
);
alter table public.onedrive_oauth_states enable row level security;
revoke all on public.onedrive_oauth_states from anon, authenticated;
comment on table public.onedrive_oauth_states is
  'One row per Connect OneDrive click; the callback uses it once and deletes it. Server functions only. Review 15 Nov 2026, section 3 #2.';

-- #3 subcontractor-apply: the subcontractor-apps bucket already had a real 25 MB file limit and a list of allowed
--    file types (checked 15 Nov 2026), so no change was needed there.
-- #6 finance-ai-read: the daily cap uses the existing ai_usage_log table (as rams-ai-draft does). No change.
