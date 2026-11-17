-- Applied 17 Nov 2026. Role switches, stage 2 (Andy: "Yes, build stage 2"). Additive only: new policies, a new column,
-- new functions and triggers. Nothing changes for anyone whose role keeps a part, or whose role has no list (perms
-- null), so the current app and every other company are unchanged. role_can() / my_role_perms(): role-switches-17nov.sql.

-- 1. Every Job. A role without it sees only the jobs they run (responsible PM), made, or are put on.
--    Admins, operatives, drivers and clients are unaffected (their roles have no list).
-- The check is in a function: written straight into the policy, site_assignments' own policy (which reads sites) made
-- the database loop (infinite recursion) on every jobs list. That version was live for about a minute at 01:47 and only
-- the test that found it was affected; this one replaced it at once.
create or replace function public.role_sees_site(p_site uuid, p_pm uuid, p_by uuid) returns boolean
language sql stable security definer set search_path = public as $
  select public.role_can('every_job') or p_pm = auth.uid() or p_by = auth.uid()
    or exists (select 1 from public.site_assignments sa where sa.site_id = p_site and sa.user_id = auth.uid());
$;
revoke execute on function public.role_sees_site(uuid, uuid, uuid) from public, anon;
grant execute on function public.role_sees_site(uuid, uuid, uuid) to authenticated;
create policy "role: own jobs unless every job" on public.sites as restrictive for select to authenticated
using ((select public.role_can('every_job')) or public.role_sees_site(id, responsible_pm_id, created_by));

-- 2. Notifications And Emails. profiles.notify_off is true for estimators (as before) and for anyone whose role has a
--    list without Notifications; the server functions that email or notify managers skip them (they skipped
--    estimators). Kept up to date by triggers; nobody can set it by hand.
alter table public.profiles add column if not exists notify_off boolean not null default false;

create or replace function public.profile_notify_off(p_org uuid, p_role text, p_est boolean, p_fin_only boolean, p_role_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(p_est, false) or (p_role not in ('admin', 'superadmin') and coalesce((
    select not ('notify' = any(r.perms)) from public.org_roles r
    where r.org_id = p_org and r.access = public.profile_access(p_role, p_est, p_fin_only)
      and (r.id = p_role_id or r.is_default) and r.perms is not null
    order by (r.id = p_role_id) desc limit 1), false));
$$;
revoke execute on function public.profile_notify_off(uuid, text, boolean, boolean, uuid) from public, anon;

create or replace function public.profiles_notify_off_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.notify_off := public.profile_notify_off(new.org_id, new.role, new.is_estimator, new.finance_only, new.org_role_id);
  return new;
end $$;
-- zzzz: after zzz_profiles_org_role_sync has settled org_role_id.
create trigger zzzz_profiles_notify_off before insert or update on public.profiles
for each row execute function public.profiles_notify_off_sync();

create or replace function public.org_roles_notify_off_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_org uuid := coalesce(new.org_id, old.org_id);
begin
  update public.profiles p set notify_off = public.profile_notify_off(p.org_id, p.role, p.is_estimator, p.finance_only, p.org_role_id)
  where p.org_id = v_org and p.notify_off is distinct from public.profile_notify_off(p.org_id, p.role, p.is_estimator, p.finance_only, p.org_role_id);
  return null;
end $$;
create trigger org_roles_notify_off_sync after insert or update of perms, access, is_default or delete on public.org_roles
for each row execute function public.org_roles_notify_off_sync();

update public.profiles p set notify_off = public.profile_notify_off(p.org_id, p.role, p.is_estimator, p.finance_only, p.org_role_id)
where p.notify_off is distinct from public.profile_notify_off(p.org_id, p.role, p.is_estimator, p.finance_only, p.org_role_id);

-- A phone of someone who gets no notifications isn't registered (as push_tokens_skip_estimator does for estimators).
create or replace function public.push_tokens_skip_quiet() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.profiles p where p.id = new.user_id and p.notify_off) then return null; end if;
  return new;
end $$;
create trigger push_tokens_skip_quiet before insert or update on public.push_tokens
for each row execute function public.push_tokens_skip_quiet();

-- 3. Manage People. A role without it can't change anyone else's account (role, phone, sub form, Finance, removing).
create policy "role: manage people" on public.profiles as restrictive for update to authenticated
using (id = (select auth.uid()) or (select public.role_can('people')));

-- 4. Sign Off H&S. A manager whose role lacks it can't add or change RAMS, COSHH or permits (they can still read them;
--    deleting is left to the screens, so deleting a whole job still works).
create or replace function public.guard_role_hs_signoff() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_pm() or public.role_can('hs_signoff') then return new; end if;
  raise exception 'Your role can view H&S but not sign it off. Ask your admin (Admin › Roles).' using errcode = '42501';
end $$;
create trigger zz_role_hs_signoff before insert or update on public.rams_docs for each row execute function public.guard_role_hs_signoff();
create trigger zz_role_hs_signoff before insert or update on public.coshh_docs for each row execute function public.guard_role_hs_signoff();
create trigger zz_role_hs_signoff before insert or update on public.permits for each row execute function public.guard_role_hs_signoff();

-- Not locked in the database, on purpose: Finance – Edit, Raise Orders and See Prices. Their tables are also written by
-- things those roles are allowed (a PM's variations and orders from Projects reach Finance's tables), so a lock would
-- break allowed work. The screens enforce them.
