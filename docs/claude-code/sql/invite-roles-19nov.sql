-- Invite as a Project Manager, Quantity Surveyor or any of the company's roles (Andy, 19 Nov 2026: "i cant invite as a
-- project manager or qs"). Additions only: a column, a policy, two functions and two triggers.
-- Applied by Claude on 19 Nov 2026 at Andy's go-ahead ("add the sql yourself please"), migration invite_roles_19nov.
-- Checked with a self-undoing test: an admin's Quantity Surveyor invite keeps its role and the person joins with it; a
-- role at another level is dropped; an admin can't invite into another company; a PM can't make a PM invite. Safe to run twice.

-- Which of the company's roles the invite is for (e.g. Quantity Surveyor). The invite's role stays the level.
alter table public.invites add column if not exists org_role_id uuid references public.org_roles(id) on delete set null;

-- Company admins may make Project Manager-level invites for their own company (PMs still make operative, driver and
-- client ones only; the restrictive "role: manage people (invite)" policy still applies on top).
drop policy if exists "admin create pm invites" on public.invites;
create policy "admin create pm invites" on public.invites for insert to authenticated
  with check ((select public.is_admin()) and org_id = (select public.my_org_id()) and role = 'pm');

-- The role on an invite must be one of that company's roles, at the invite's level; otherwise it's dropped.
create or replace function public.invite_check_org_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.org_role_id is not null and not exists (
    select 1 from public.org_roles r
    where r.id = new.org_role_id and r.org_id = new.org_id
      and r.access = public.profile_access(new.role, coalesce(new.is_estimator, false), false)) then
    new.org_role_id := null;
  end if;
  return new;
end $$;
drop trigger if exists invites_check_org_role on public.invites;
create trigger invites_check_org_role before insert or update of org_role_id on public.invites
  for each row execute function public.invite_check_org_role();

-- When the invite is used, the person gets that role: a new login (handle_new_user marks used_by), or an existing login
-- joining another company (join_company_with_invite): kept with that company, and given now if it's their current one.
create or replace function public.invite_apply_org_role() returns trigger
language plpgsql security definer set search_path = public as $$
declare v jsonb; r public.org_roles;
begin
  if new.org_role_id is null or new.used_by is null or new.used_by is not distinct from old.used_by then return new; end if;
  select * into r from public.org_roles where id = new.org_role_id and org_id = new.org_id;
  if r.id is null then return new; end if;
  update public.company_memberships set state = coalesce(state, '{}'::jsonb) || jsonb_build_object('org_role_id', r.id)
    where user_id = new.used_by and org_id = new.org_id;
  if exists (select 1 from public.profiles where id = new.used_by and org_id = new.org_id) then
    v := public._cm_as_system_begin();
    begin
      update public.profiles set org_role_id = r.id where id = new.used_by and org_id = new.org_id;
    exception when others then
      perform public._cm_as_system_end(v);
      raise;
    end;
    perform public._cm_as_system_end(v);
  end if;
  return new;
end $$;
drop trigger if exists invites_apply_org_role on public.invites;
create trigger invites_apply_org_role after update of used_by on public.invites
  for each row execute function public.invite_apply_org_role();

revoke execute on function public.invite_check_org_role() from public, anon, authenticated;
revoke execute on function public.invite_apply_org_role() from public, anon, authenticated;
