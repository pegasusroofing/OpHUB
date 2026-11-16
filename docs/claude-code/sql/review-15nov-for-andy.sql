-- Block A: APPLIED 16 Nov 2026 on Andy's yes, as a refusal with a message (see pm-role-admins-only-16nov.sql).
-- Blocks B and C: NOT RUN. For Andy to decide, then paste into Supabase › SQL Editor. From the review of 15 Nov 2026
-- (docs/claude-code/REVIEW-2026-11-15.md). Each block stands on its own; run only the ones you want.

-- ---------------------------------------------------------------------------------------------------------------------
-- A. Only company admins make someone a Project Manager, or take a Project Manager's role away.
--    Today any project manager can promote an operative to project manager (which opens every project, prices and the
--    team lists to them) and can demote another project manager. Making someone an admin is already admins-only.
--    This changes what the CURRENT app lets project managers do in Manage Team, so it's your call.
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.protect_profile_by_manager()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null or public.is_superadmin() then return new; end if;
  if auth.uid() <> old.id then
    new.signature_path := old.signature_path;
    new.email := old.email;
    if not public.is_admin() and new.role = 'admin' and old.role <> 'admin' then new.role := old.role; end if;
    -- new: a project manager's role is given and taken away by company admins only
    if not public.is_admin() and new.role is distinct from old.role and 'pm' in (new.role, old.role) then new.role := old.role; end if;
  else
    new.email := old.email;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- B. Tidy-up: three tables each carry the same index twice (Supabase's adviser). Removing the spare copies makes saves
--    a touch quicker. Nothing reads differently.
-- ---------------------------------------------------------------------------------------------------------------------
-- Run this first to see the pairs, then drop one of each pair by name:
--   select tablename, indexname, indexdef from pg_indexes where schemaname = 'public' and tablename in ('messages', 'schedule_photos', 'schedule_tasks') order by tablename, indexdef;
-- e.g.  drop index if exists public.messages_org_idx;   -- identical to messages_org_created_idx

-- ---------------------------------------------------------------------------------------------------------------------
-- C. Not SQL: two switches in the Supabase dashboard (Authentication › Sign In / Providers › Email, and › Attack Protection).
--    1. "Leaked password protection": refuses passwords known from data breaches. Recommended: on.
--    2. Minimum password length: check it's at least 10.
-- ---------------------------------------------------------------------------------------------------------------------
