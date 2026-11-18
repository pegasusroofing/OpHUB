-- Material costs by role (Andy, 18 Nov 2026: "cross reference the admin/settings ... we have recently set the roles up").
--
-- What it does: lets the new "See Material Costs" part on Admin › Roles actually show supplier prices to the people in
-- that role. The database only shows prices to people with Finance switched on or ticked one by one; this adds "or their
-- role has See Material Costs". Nobody loses anything: it only adds a way in.
--
-- Why it's a file for you: the current web app reads the same prices through this check, so it's a change to something
-- the current app relies on (people whose role gets See Material Costs would see costs there too, which is what you want).
--
-- How: Supabase › SQL Editor › New query, paste all of this, Run. Safe to run twice.

create or replace function public.can_see_costs()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select exists(select 1 from profiles where id = auth.uid() and (finance_enabled or see_costs))
      or coalesce('mat_costs' = any(public.my_role_perms_extra()), false);
$$;

-- Check: run as yourself, should return true.
select public.can_see_costs() as i_can_see_costs;
