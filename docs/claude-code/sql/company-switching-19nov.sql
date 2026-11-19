-- Company switching on one login (Andy, 19 Nov 2026: "i want one login email and switch ... anyone can have two logins
-- ... make it secure, so no one can cross contaminate or get into one through the other"). Additive only.
--
-- How it works: a login still has ONE profile, and everything (row rules, server functions, both apps) follows
-- profiles.org_id and profiles.role, as now. A person who belongs to more than one company has a company_memberships row
-- per company holding their per-company settings (role, finance switches, OneDrive folder ...) and their email for that
-- company. switch_company() checks the membership, saves where they are now into its row, and puts the chosen company's
-- settings onto the profile. Nobody can add themselves to a company: a membership is only made by redeeming that
-- company's own invite (join_company_with_invite). Roles are per company. A company's admin can take its access away.
-- The existing guards on profiles (people can't change their own company / role / email) are not changed: these
-- functions blank auth.uid() only for their own already-checked update, then put it back.

create table if not exists public.company_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  work_email text,
  state jsonb not null default '{}'::jsonb,
  added_by uuid,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  unique (user_id, org_id)
);
create index if not exists company_memberships_org_idx on public.company_memberships(org_id);
alter table public.company_memberships enable row level security;
-- Read: your own rows, or (an admin) the rows for your own company. No direct writes: only the functions below.
create policy "memberships read" on public.company_memberships for select to authenticated
  using (user_id = auth.uid() or ((select public.is_admin()) and org_id = (select public.my_org_id())));

-- Run one checked update as the system, so the "can't change your own company / role / email" guards don't undo it.
-- Internal: not callable by anyone signed in.
create or replace function public._cm_as_system_begin() returns jsonb language plpgsql set search_path = public as $$
declare v jsonb := jsonb_build_object('claims', current_setting('request.jwt.claims', true), 'sub', current_setting('request.jwt.claim.sub', true));
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  return v;
end $$;
create or replace function public._cm_as_system_end(v jsonb) returns void language plpgsql set search_path = public as $$
begin
  perform set_config('request.jwt.claims', coalesce(v->>'claims', ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(v->>'sub', ''), true);
end $$;
revoke all on function public._cm_as_system_begin() from public, anon, authenticated;
revoke all on function public._cm_as_system_end(jsonb) from public, anon, authenticated;

-- The per-company settings on a profile, as stored in a membership.
create or replace function public._cm_state_of(p public.profiles) returns jsonb language sql immutable as $$
  select jsonb_build_object('role', p.role, 'is_estimator', p.is_estimator, 'finance_enabled', p.finance_enabled, 'see_costs', p.see_costs,
    'finance_hidden', p.finance_hidden, 'finance_prev_role', p.finance_prev_role, 'finance_only', p.finance_only, 'org_role_id', p.org_role_id,
    'onedrive_folder_id', p.onedrive_folder_id, 'onedrive_folder_name', p.onedrive_folder_name, 'onedrive_drive_id', p.onedrive_drive_id,
    'onedrive_last_synced_at', p.onedrive_last_synced_at, 'subform_required', p.subform_required, 'fin_home_tiles', to_jsonb(p.fin_home_tiles));
$$;
revoke all on function public._cm_state_of(public.profiles) from public, anon, authenticated;

-- Puts a company's saved settings onto a profile (internal; callers have already checked everything).
create or replace function public._cm_apply(p_user uuid, p_org uuid, p_state jsonb, p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare s jsonb := coalesce(p_state, '{}'::jsonb); v_login text; v_email text; v jsonb;
begin
  select email into v_login from auth.users where id = p_user;
  v_email := coalesce(nullif(btrim(p_email), ''), v_login);
  -- The email for that company, unless another account already uses it (emails are unique): then the login email;
  -- if even that is taken, the email stays as it is (so a switch never fails on it).
  if v_email is null or exists(select 1 from public.profiles where lower(email) = lower(v_email) and id <> p_user) then v_email := v_login; end if;
  if v_email is null or exists(select 1 from public.profiles where lower(email) = lower(v_email) and id <> p_user) then v_email := null; end if;
  v := public._cm_as_system_begin();
  begin
    update public.profiles set
      org_id = p_org,
      role = case when coalesce(s->>'role', '') in ('', 'superadmin') then 'operative' else s->>'role' end, -- never the platform owner
      is_estimator = coalesce((s->>'is_estimator')::boolean, false),
      finance_enabled = coalesce((s->>'finance_enabled')::boolean, false),
      see_costs = coalesce((s->>'see_costs')::boolean, false),
      finance_hidden = coalesce((s->>'finance_hidden')::boolean, false),
      finance_prev_role = s->>'finance_prev_role',
      finance_only = coalesce((s->>'finance_only')::boolean, false),
      org_role_id = nullif(s->>'org_role_id', '')::uuid,
      onedrive_folder_id = s->>'onedrive_folder_id',
      onedrive_folder_name = s->>'onedrive_folder_name',
      onedrive_drive_id = s->>'onedrive_drive_id',
      onedrive_last_synced_at = nullif(s->>'onedrive_last_synced_at', '')::timestamptz,
      subform_required = coalesce((s->>'subform_required')::boolean, true),
      fin_home_tiles = case when jsonb_typeof(s->'fin_home_tiles') = 'array' then array(select jsonb_array_elements_text(s->'fin_home_tiles')) else null end,
      email = coalesce(v_email, email)
    where id = p_user;
  exception when others then
    perform public._cm_as_system_end(v);
    raise;
  end;
  perform public._cm_as_system_end(v);
end $$;
revoke all on function public._cm_apply(uuid, uuid, jsonb, text) from public, anon, authenticated;

-- Saves where someone is now into their membership row for that company (internal).
create or replace function public._cm_save_current(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me public.profiles;
begin
  select * into me from public.profiles where id = p_user;
  if me.id is null or me.org_id is null then return; end if;
  insert into public.company_memberships (user_id, org_id, work_email, state, last_used_at)
  values (me.id, me.org_id, nullif(btrim(me.email), ''), public._cm_state_of(me), now())
  on conflict (user_id, org_id) do update set state = excluded.state, work_email = excluded.work_email, last_used_at = now();
end $$;
revoke all on function public._cm_save_current(uuid) from public, anon, authenticated;

-- The companies I belong to: the one I'm in now first, then the others.
create or replace function public.my_companies()
returns table (org_id uuid, name text, logo_path text, role text, work_email text, is_current boolean)
language sql stable security definer set search_path = public as $$
  with me as (select * from public.profiles where id = auth.uid() and role <> 'superadmin'),
  ids as (select m.org_id from public.company_memberships m join me on m.user_id = me.id union select me.org_id from me where me.org_id is not null)
  select o.id, o.name, o.logo_path,
    case when o.id = me.org_id then me.role else (select m.state->>'role' from public.company_memberships m where m.user_id = me.id and m.org_id = o.id) end,
    case when o.id = me.org_id then me.email else coalesce((select m.work_email from public.company_memberships m where m.user_id = me.id and m.org_id = o.id), (select email from auth.users where id = me.id)) end,
    o.id = me.org_id
  from ids join public.organizations o on o.id = ids.org_id cross join me
  order by (o.id = me.org_id) desc, o.name;
$$;

-- Switch to another company I belong to.
create or replace function public.switch_company(p_org_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); me public.profiles; m public.company_memberships;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  select * into me from public.profiles where id = v_uid for update;
  if me.id is null then return jsonb_build_object('ok', false, 'error', 'no_profile'); end if;
  if me.role = 'superadmin' then return jsonb_build_object('ok', false, 'error', 'superadmin_uses_open_company'); end if;
  if p_org_id is null then return jsonb_build_object('ok', false, 'error', 'no_company'); end if;
  if me.org_id = p_org_id then return jsonb_build_object('ok', true, 'already', true); end if;
  select * into m from public.company_memberships where user_id = v_uid and org_id = p_org_id;
  if m.id is null then return jsonb_build_object('ok', false, 'error', 'not_a_member'); end if;
  perform public._cm_save_current(v_uid);
  perform public._cm_apply(v_uid, p_org_id, m.state, m.work_email);
  update public.company_memberships set last_used_at = now() where id = m.id;
  return jsonb_build_object('ok', true);
end $$;

-- Add a company to my login with that company's own invite (I'm already signed in). Checked like a sign-up:
-- unexpired, not used (unless reusable), and if the invite was for an email, it must be my login email.
create or replace function public.join_company_with_invite(p_invite_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); me public.profiles; i public.invites; v_login text; v_fin boolean; v_name text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  select * into me from public.profiles where id = v_uid;
  if me.id is null then return jsonb_build_object('ok', false, 'error', 'no_profile'); end if;
  if me.role = 'superadmin' then return jsonb_build_object('ok', false, 'error', 'superadmin_uses_open_company'); end if;
  select email into v_login from auth.users where id = v_uid;
  select * into i from public.invites where id = p_invite_id for update;
  if i.id is null or i.expires_at <= now() or not (i.is_reusable or i.used_at is null) or coalesce(i.role, '') in ('', 'superadmin') then return jsonb_build_object('ok', false, 'error', 'invite_not_valid'); end if;
  if i.email is not null and btrim(i.email) <> '' and lower(btrim(i.email)) <> lower(v_login) then return jsonb_build_object('ok', false, 'error', 'invite_for_another_email'); end if;
  select name into v_name from public.organizations where id = i.org_id;
  if v_name is null then return jsonb_build_object('ok', false, 'error', 'invite_not_valid'); end if;
  if me.org_id = i.org_id or exists(select 1 from public.company_memberships where user_id = v_uid and org_id = i.org_id) then
    return jsonb_build_object('ok', false, 'error', 'already_member', 'company', v_name);
  end if;
  -- An admin of a company with Finance gets Finance there, as when a company is set up.
  v_fin := i.role = 'admin' and exists(select 1 from public.organizations o where o.id = i.org_id and (o.has_finance or o.has_pm = false));
  if me.org_id is null then
    -- No company yet: this one becomes the company they're in.
    insert into public.company_memberships (user_id, org_id, work_email, state, added_by, last_used_at)
    values (v_uid, i.org_id, v_login, jsonb_build_object('role', i.role, 'is_estimator', i.role = 'pm' and coalesce(i.is_estimator, false), 'finance_enabled', v_fin), i.created_by, now());
    perform public._cm_apply(v_uid, i.org_id, jsonb_build_object('role', i.role, 'is_estimator', i.role = 'pm' and coalesce(i.is_estimator, false), 'finance_enabled', v_fin), v_login);
  else
    perform public._cm_save_current(v_uid); -- their current company joins the list too
    insert into public.company_memberships (user_id, org_id, work_email, state, added_by)
    values (v_uid, i.org_id, v_login, jsonb_build_object('role', i.role, 'is_estimator', i.role = 'pm' and coalesce(i.is_estimator, false), 'finance_enabled', v_fin), i.created_by);
  end if;
  update public.invites set use_count = coalesce(use_count, 0) + 1,
    used_at = case when is_reusable then used_at else now() end, used_by = case when is_reusable then used_by else v_uid end
  where id = i.id;
  return jsonb_build_object('ok', true, 'org_id', i.org_id, 'company', v_name);
end $$;

-- The email to use for one of my companies (replies to emails I send from it go there). Not one another account uses.
create or replace function public.set_company_email(p_org_id uuid, p_email text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); me public.profiles; v_email text := lower(btrim(coalesce(p_email, ''))); v jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or length(v_email) > 254 then return jsonb_build_object('ok', false, 'error', 'bad_email'); end if;
  select * into me from public.profiles where id = v_uid;
  if me.id is null or me.role = 'superadmin' then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  -- Not an email another person uses: on their profile, as their login, or as one of their company emails.
  if exists(select 1 from public.profiles where lower(email) = v_email and id <> v_uid)
    or exists(select 1 from auth.users where lower(email) = v_email and id <> v_uid)
    or exists(select 1 from public.company_memberships where lower(work_email) = v_email and user_id <> v_uid) then
    return jsonb_build_object('ok', false, 'error', 'email_in_use');
  end if;
  if me.org_id = p_org_id then
    perform public._cm_save_current(v_uid);
    update public.company_memberships set work_email = v_email where user_id = v_uid and org_id = p_org_id;
    v := public._cm_as_system_begin();
    begin
      update public.profiles set email = v_email where id = v_uid;
    exception when others then perform public._cm_as_system_end(v); raise;
    end;
    perform public._cm_as_system_end(v);
    return jsonb_build_object('ok', true);
  end if;
  update public.company_memberships set work_email = v_email where user_id = v_uid and org_id = p_org_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_a_member'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- An admin's view: people who also have access to this company but are in another of their companies right now.
create or replace function public.company_access_elsewhere()
returns table (user_id uuid, name text, work_email text, role text, last_used_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.user_id, p.name, m.work_email, m.state->>'role', m.last_used_at
  from public.company_memberships m join public.profiles p on p.id = m.user_id
  where public.is_admin() and m.org_id = public.my_org_id() and p.org_id is distinct from m.org_id
  order by p.name;
$$;

-- An admin takes away someone's access to this company (someone not in it right now; for someone in it now, Remove
-- from the team, which keeps their other companies).
create or replace function public.remove_company_access(p_user_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_org uuid := public.my_org_id(); v_cur uuid;
begin
  if not public.is_admin() or v_org is null then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  select org_id into v_cur from public.profiles where id = p_user_id;
  if v_cur = v_org then return jsonb_build_object('ok', false, 'error', 'in_this_company_now'); end if;
  delete from public.company_memberships where user_id = p_user_id and org_id = v_org;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_a_member'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- Removing someone from a company (the remove-team-member server function, service role only): if they belong to
-- another company, only this company's access goes and they're moved to the other company they used most recently;
-- returns false when this was their only company (then the function deletes the login, as before).
create or replace function public.detach_from_company(p_user_id uuid, p_org_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare m public.company_memberships;
begin
  select * into m from public.company_memberships where user_id = p_user_id and org_id <> p_org_id order by last_used_at desc nulls last, created_at desc limit 1;
  if m.id is null then return false; end if;
  delete from public.company_memberships where user_id = p_user_id and org_id = p_org_id;
  perform public._cm_apply(p_user_id, m.org_id, m.state, m.work_email);
  update public.company_memberships set last_used_at = now() where id = m.id;
  return true;
end $$;

-- Deleting a company deletes the profiles of the people in it (profiles.org_id cascades). Anyone who also belongs to
-- another company is moved there first, so deleting one company never deletes their login.
create or replace function public.cm_move_members_out() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select p.id from public.profiles p where p.org_id = old.id loop
    perform public.detach_from_company(r.id, old.id);
  end loop;
  return old;
end $$;
revoke all on function public.cm_move_members_out() from public, anon, authenticated;
drop trigger if exists cm_move_members_out on public.organizations;
create trigger cm_move_members_out before delete on public.organizations for each row execute function public.cm_move_members_out();

-- The login email for a person (password resets look people up by it, as their profile email can be a company email).
create or replace function public.login_user_by_email(p_email text) returns table (id uuid, email text)
language sql stable security definer set search_path = public as $$
  select u.id, u.email::text from auth.users u where lower(u.email) = lower(btrim(p_email)) limit 1;
$$;

revoke all on function public.my_companies() from public, anon;
revoke all on function public.switch_company(uuid) from public, anon;
revoke all on function public.join_company_with_invite(uuid) from public, anon;
revoke all on function public.set_company_email(uuid, text) from public, anon;
revoke all on function public.company_access_elsewhere() from public, anon;
revoke all on function public.remove_company_access(uuid) from public, anon;
revoke all on function public.detach_from_company(uuid, uuid) from public, anon, authenticated;
revoke all on function public.login_user_by_email(text) from public, anon, authenticated;
grant execute on function public.my_companies() to authenticated;
grant execute on function public.switch_company(uuid) to authenticated;
grant execute on function public.join_company_with_invite(uuid) to authenticated;
grant execute on function public.set_company_email(uuid, text) to authenticated;
grant execute on function public.company_access_elsewhere() to authenticated;
grant execute on function public.remove_company_access(uuid) to authenticated;
grant execute on function public.detach_from_company(uuid, uuid) to service_role;
grant execute on function public.login_user_by_email(text) to service_role;
