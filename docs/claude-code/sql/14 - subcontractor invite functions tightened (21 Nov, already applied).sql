-- Record only: applied 21 Nov 2026 (migration sub_invite_functions_strict). Changes only the functions made the night
-- before in SQL file 11 (nothing the old app uses). From the overnight security review, finding 1: a PM in one company
-- could add a row making themselves "admin" of another company's subcontractor (an older table rule only checks the job
-- on the row), then see that subcontractor's invite links and join the other company. These functions now only count a
-- subcontractor role when the row is on that subcontractor's own job, in the caller's own company, so that route is
-- closed. The older table rules themselves are tightened in security-fixes-21nov-FOR-ANDY.sql (needs Andy's go-ahead).
-- Also: a subcontractor's project manager can make at most 20 invites a day.

create or replace function public.is_sub_admin_strict(p_company uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from subcontractor_operatives so
                 join subcontractor_companies c on c.id = so.subcontractor_company_id and c.site_id = so.site_id
                 where so.subcontractor_company_id = p_company and so.user_id = auth.uid() and so.is_admin and c.org_id = my_org_id());
$$;
create or replace function public.is_subcontractor_member(p_company_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from subcontractor_operatives so
                 join subcontractor_companies c on c.id = so.subcontractor_company_id and c.site_id = so.site_id
                 where so.subcontractor_company_id = p_company_id and so.user_id = auth.uid() and c.org_id = my_org_id());
$$;

create or replace function public.sub_invite_create(p_company uuid, p_admin boolean default false, p_email text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare c public.subcontractor_companies; v_mgr boolean; v_id uuid;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  select * into c from public.subcontractor_companies where id = p_company;
  if c.id is null or c.org_id is distinct from public.my_org_id() then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  v_mgr := public.is_pm() and public.has_site_access(c.site_id);
  if not v_mgr and not public.is_sub_admin_strict(c.id) then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  if coalesce(p_admin, false) and not v_mgr then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  if not v_mgr and (select count(*) from public.invites where subcontractor_company_id = c.id and created_by = auth.uid() and created_at > now() - interval '1 day') >= 20 then
    return jsonb_build_object('ok', false, 'error', 'limit');
  end if;
  insert into public.invites (org_id, role, created_by, email, subcontractor_company_id, subcontractor_admin)
  values (c.org_id, 'operative', auth.uid(), nullif(lower(btrim(coalesce(p_email, ''))), ''), c.id, coalesce(p_admin, false))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'invite_id', v_id);
end $$;

create or replace function public.sub_invites_open(p_company uuid)
returns table (id uuid, email text, subcontractor_admin boolean, created_at timestamptz, expires_at timestamptz)
language sql stable security definer set search_path to 'public' as $$
  select i.id, i.email, i.subcontractor_admin, i.created_at, i.expires_at from public.invites i
  join public.subcontractor_companies c on c.id = i.subcontractor_company_id
  where i.subcontractor_company_id = p_company and i.used_at is null and i.expires_at > now()
    and c.org_id = public.my_org_id() and i.org_id = c.org_id
    and ((public.is_pm() and public.has_site_access(c.site_id)) or public.is_sub_admin_strict(c.id))
  order by i.created_at desc;
$$;

create or replace function public.sub_invite_cancel(p_invite_id uuid)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare i public.invites; c public.subcontractor_companies;
begin
  select * into i from public.invites where id = p_invite_id and used_at is null and subcontractor_company_id is not null;
  if i.id is null or i.org_id is distinct from public.my_org_id() then return false; end if;
  select * into c from public.subcontractor_companies where id = i.subcontractor_company_id;
  if c.id is null or c.org_id is distinct from i.org_id then return false; end if;
  if not (public.is_sub_admin_strict(c.id) or (public.is_pm() and public.has_site_access(c.site_id))) then return false; end if;
  delete from public.invites where id = i.id;
  return true;
end $$;

create or replace function public.sub_remove_operative(p_row uuid)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare r public.subcontractor_operatives;
begin
  select * into r from public.subcontractor_operatives where id = p_row;
  if r.id is null or r.is_admin or r.user_id = auth.uid() or not public.is_sub_admin_strict(r.subcontractor_company_id) then return false; end if;
  if not exists (select 1 from public.subcontractor_companies c where c.id = r.subcontractor_company_id and c.site_id = r.site_id and c.org_id = public.my_org_id()) then return false; end if;
  delete from public.subcontractor_operatives where id = r.id;
  delete from public.site_assignments where site_id = r.site_id and user_id = r.user_id;
  return true;
end $$;

create or replace function public.sub_invite_info(p_invite_id uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object('company', c.name, 'site', s.name, 'admin', i.subcontractor_admin)
  from public.invites i
  join public.subcontractor_companies c on c.id = i.subcontractor_company_id and c.org_id = i.org_id
  join public.sites s on s.id = c.site_id and s.org_id = i.org_id
  where i.id = p_invite_id and i.expires_at > now() and (i.is_reusable or i.used_at is null);
$$;

-- _sub_invite_apply (file 11) only ever uses the invite's own company and job, so it is unchanged.
revoke execute on function public.is_sub_admin_strict(uuid) from public, anon;
grant execute on function public.is_sub_admin_strict(uuid) to authenticated;
