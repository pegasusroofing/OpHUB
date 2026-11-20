-- Record only: applied 20 Nov 2026 (migration sub_pm_company_setup). Additive.
-- Andy, 20 Nov 2026: "the subcontractors need a project manager by default who sets up their company and their view needs to
-- be like our project managers" and "yes snags issued to the subcontract company please (all operatrives for them then see it)".
--
-- 1. Invites can be for a subcontractor company on a job. Whoever joins with one is put on that job and into that company
--    (the "their project manager" kind makes them its project manager). Single-use, like our own invites, so the old web
--    app's one permanent link is never one of these.
-- 2. Their project manager makes the invites for their own operatives, sees everyone in their company and can take an
--    operative off (not another project manager: that stays with our PMs).
-- 3. A snag can be given to a subcontractor company; only our managers can change who it is given to.

alter table public.invites
  add column if not exists subcontractor_company_id uuid references public.subcontractor_companies(id) on delete cascade,
  add column if not exists subcontractor_admin boolean not null default false;

alter table public.snags
  add column if not exists subcontractor_company_id uuid references public.subcontractor_companies(id) on delete set null;
create index if not exists snags_subcontractor_company_idx on public.snags (subcontractor_company_id) where subcontractor_company_id is not null;

-- Anyone in that subcontractor company (on any job).
create or replace function public.is_subcontractor_member(p_company_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from subcontractor_operatives so where so.subcontractor_company_id = p_company_id and so.user_id = auth.uid());
$$;

-- The people in a company can see each other (their project manager needs the list; so do briefings' "Who Must Sign").
drop policy if exists "company members view each other" on public.subcontractor_operatives;
create policy "company members view each other" on public.subcontractor_operatives
  for select to authenticated using (public.is_subcontractor_member(subcontractor_company_id));

-- Put someone into the company an invite is for. Internal: called by the sign-up trigger and sub_invite_claim.
create or replace function public._sub_invite_apply(p_uid uuid, p_invite uuid)
returns text language plpgsql security definer set search_path to 'public' as $$
declare i public.invites; c public.subcontractor_companies;
begin
  select * into i from public.invites where id = p_invite;
  if i.id is null or i.subcontractor_company_id is null then return 'not_sub_invite'; end if;
  select * into c from public.subcontractor_companies where id = i.subcontractor_company_id;
  if c.id is null or c.org_id is distinct from i.org_id then return 'company_gone'; end if;
  if not exists (select 1 from public.profiles where id = p_uid and org_id = i.org_id)
     and not exists (select 1 from public.company_memberships where user_id = p_uid and org_id = i.org_id) then
    return 'wrong_company';
  end if;
  if exists (select 1 from public.subcontractor_operatives where site_id = c.site_id and user_id = p_uid and subcontractor_company_id <> c.id) then
    return 'with_another_subcontractor';
  end if;
  if not exists (select 1 from public.site_assignments where site_id = c.site_id and user_id = p_uid) then
    insert into public.site_assignments (site_id, user_id, assigned_by) values (c.site_id, p_uid, i.created_by);
  end if;
  if exists (select 1 from public.subcontractor_operatives where subcontractor_company_id = c.id and user_id = p_uid) then
    if i.subcontractor_admin then update public.subcontractor_operatives set is_admin = true where subcontractor_company_id = c.id and user_id = p_uid; end if;
  else
    insert into public.subcontractor_operatives (site_id, subcontractor_company_id, user_id, assigned_by, is_admin)
    values (c.site_id, c.id, p_uid, i.created_by, i.subcontractor_admin);
  end if;
  return null;
end $$;
revoke execute on function public._sub_invite_apply(uuid, uuid) from public, anon, authenticated;

-- A new sign-up with one of these invites goes straight into the company. Never stops a sign-up.
create or replace function public.sub_invite_on_profile()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_inv uuid;
begin
  begin
    select nullif(u.raw_user_meta_data->>'invite_id', '')::uuid into v_inv from auth.users u where u.id = new.id;
    if v_inv is not null and new.org_id is not null and exists (select 1 from public.invites where id = v_inv and subcontractor_company_id is not null and org_id = new.org_id) then
      perform public._sub_invite_apply(new.id, v_inv);
    end if;
  exception when others then null;
  end;
  return new;
end $$;
drop trigger if exists zzzzz_sub_invite_on_profile on public.profiles;
create trigger zzzzz_sub_invite_on_profile after insert on public.profiles for each row execute function public.sub_invite_on_profile();

-- Make an invite for a subcontractor company. Our PMs on the job: either kind. Their project manager: operatives only.
create or replace function public.sub_invite_create(p_company uuid, p_admin boolean default false, p_email text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare c public.subcontractor_companies; v_mgr boolean; v_id uuid;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  select * into c from public.subcontractor_companies where id = p_company;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  v_mgr := public.is_pm() and public.my_org_id() = c.org_id and public.has_site_access(c.site_id);
  if not v_mgr and not (public.is_subcontractor_admin(c.id) and public.my_org_id() = c.org_id) then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  if coalesce(p_admin, false) and not v_mgr then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  insert into public.invites (org_id, role, created_by, email, subcontractor_company_id, subcontractor_admin)
  values (c.org_id, 'operative', auth.uid(), nullif(lower(btrim(coalesce(p_email, ''))), ''), c.id, coalesce(p_admin, false))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'invite_id', v_id);
end $$;
revoke execute on function public.sub_invite_create(uuid, boolean, text) from public, anon;
grant execute on function public.sub_invite_create(uuid, boolean, text) to authenticated;

-- Someone who already has a login joins with one (join_company_with_invite): put them into the company too.
-- Only the person the invite was used by.
create or replace function public.sub_invite_claim(p_invite_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare i public.invites; v_err text;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  select * into i from public.invites where id = p_invite_id;
  if i.id is null or i.subcontractor_company_id is null or i.used_by is distinct from auth.uid() then return jsonb_build_object('ok', false, 'error', 'invite_not_valid'); end if;
  v_err := public._sub_invite_apply(auth.uid(), i.id);
  return case when v_err is null then jsonb_build_object('ok', true) else jsonb_build_object('ok', false, 'error', v_err) end;
end $$;
revoke execute on function public.sub_invite_claim(uuid) from public, anon;
grant execute on function public.sub_invite_claim(uuid) to authenticated;

-- The join page says which subcontractor and job the invite is for.
create or replace function public.sub_invite_info(p_invite_id uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object('company', c.name, 'site', s.name, 'admin', i.subcontractor_admin)
  from public.invites i join public.subcontractor_companies c on c.id = i.subcontractor_company_id join public.sites s on s.id = c.site_id
  where i.id = p_invite_id and i.expires_at > now() and (i.is_reusable or i.used_at is null);
$$;
grant execute on function public.sub_invite_info(uuid) to anon, authenticated;

-- Their project manager's invites that haven't been used yet (to show and cancel them).
create or replace function public.sub_invites_open(p_company uuid)
returns table (id uuid, email text, subcontractor_admin boolean, created_at timestamptz, expires_at timestamptz)
language sql stable security definer set search_path to 'public' as $$
  select i.id, i.email, i.subcontractor_admin, i.created_at, i.expires_at from public.invites i
  join public.subcontractor_companies c on c.id = i.subcontractor_company_id
  where i.subcontractor_company_id = p_company and i.used_at is null and i.expires_at > now()
    and ((public.is_pm() and public.my_org_id() = c.org_id and public.has_site_access(c.site_id)) or public.is_subcontractor_admin(c.id))
  order by i.created_at desc;
$$;
revoke execute on function public.sub_invites_open(uuid) from public, anon;
grant execute on function public.sub_invites_open(uuid) to authenticated;

create or replace function public.sub_invite_cancel(p_invite_id uuid)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare i public.invites;
begin
  select * into i from public.invites where id = p_invite_id and used_at is null and subcontractor_company_id is not null;
  if i.id is null then return false; end if;
  if not (public.is_subcontractor_admin(i.subcontractor_company_id) or (public.is_pm() and public.my_org_id() = i.org_id)) then return false; end if;
  delete from public.invites where id = i.id;
  return true;
end $$;
revoke execute on function public.sub_invite_cancel(uuid) from public, anon;
grant execute on function public.sub_invite_cancel(uuid) to authenticated;

-- Their project manager takes one of their operatives off the job (not another project manager, not themselves).
create or replace function public.sub_remove_operative(p_row uuid)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare r public.subcontractor_operatives;
begin
  select * into r from public.subcontractor_operatives where id = p_row;
  if r.id is null or r.is_admin or r.user_id = auth.uid() or not public.is_subcontractor_admin(r.subcontractor_company_id) then return false; end if;
  delete from public.subcontractor_operatives where id = r.id;
  delete from public.site_assignments where site_id = r.site_id and user_id = r.user_id;
  return true;
end $$;
revoke execute on function public.sub_remove_operative(uuid) from public, anon;
grant execute on function public.sub_remove_operative(uuid) to authenticated;

-- Only our managers choose which subcontractor a snag is given to. Anyone else's choice is kept only for their own company.
create or replace function public.guard_snag_company()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null or public.is_pm() then return new; end if;
  if tg_op = 'INSERT' then
    if new.subcontractor_company_id is not null and not public.is_subcontractor_member(new.subcontractor_company_id) then new.subcontractor_company_id := null; end if;
  else
    new.subcontractor_company_id := old.subcontractor_company_id;
  end if;
  return new;
end $$;
drop trigger if exists zz_guard_snag_company on public.snags;
create trigger zz_guard_snag_company before insert or update on public.snags for each row execute function public.guard_snag_company();
