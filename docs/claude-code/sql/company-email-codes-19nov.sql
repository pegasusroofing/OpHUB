-- Company switching, second part (19 Nov 2026, after the security review of company-switching-19nov.sql).
-- Applied as migration `company_email_codes`. Only adds a table and replaces functions added earlier the same day.
--
-- 1. An "email for this company" is only saved once its owner types the code emailed to it (server function
--    send-company-email-code asks cm_new_email_code for the code and emails it; confirm_company_email checks it).
--    Going back to the sign-in email needs no code. Before this any address could be set, and three older parts of
--    the system trust profiles.email: hand-added operative linking (zz_manual_operative_autolink), the "you may email
--    yourself" rule in the senders (recipientsAllowed), and sign-up (profiles.email is unique).
-- 2. Removing someone from one company (Remove Access, or Remove when they have another company) clears their links
--    to that company's sites, as deleting their login used to (those rows cascade on a deleted login; Responsible PM
--    is set to nobody).
-- 3. _cm_state_of gets a fixed search_path (Supabase adviser).

create table if not exists public.company_email_codes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  code_hash text not null,
  attempts int not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (user_id, org_id)
);
alter table public.company_email_codes enable row level security;
-- No policies: only the functions below read or write it.

-- Why an email can't become someone's email for a company (null = it can): bad shape, not in that company, or
-- someone else's (their profile, their login, their company email, or a hand-added operative not linked to them).
create or replace function public._cm_email_problem(p_uid uuid, p_org uuid, p_email text) returns text
language plpgsql stable security definer set search_path = public as $$
declare me public.profiles;
begin
  if p_uid is null then return 'not_signed_in'; end if;
  if p_email is null or length(p_email) > 254 or p_email !~ '^[a-z0-9._%+''-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$' then return 'bad_email'; end if;
  select * into me from public.profiles where id = p_uid;
  if me.id is null or me.role = 'superadmin' then return 'not_allowed'; end if;
  if me.org_id is distinct from p_org and not exists(select 1 from public.company_memberships where user_id = p_uid and org_id = p_org) then return 'not_a_member'; end if;
  if exists(select 1 from public.profiles where lower(email) = p_email and id <> p_uid)
    or exists(select 1 from auth.users where lower(email) = p_email and id <> p_uid)
    or exists(select 1 from public.company_memberships where lower(work_email) = p_email and user_id <> p_uid)
    or exists(select 1 from public.manual_operatives where lower(email) = p_email and linked_profile_id is distinct from p_uid) then
    return 'email_in_use';
  end if;
  return null;
end $$;

-- Saves a checked email as my email for a company; my profile follows when it's the company I'm in now.
create or replace function public._cm_set_work_email(p_uid uuid, p_org uuid, p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare v jsonb; v_cur uuid;
begin
  select org_id into v_cur from public.profiles where id = p_uid;
  if v_cur = p_org then
    perform public._cm_save_current(p_uid);
    update public.company_memberships set work_email = p_email where user_id = p_uid and org_id = p_org;
    v := public._cm_as_system_begin();
    begin
      update public.profiles set email = p_email where id = p_uid;
    exception when others then perform public._cm_as_system_end(v); raise;
    end;
    perform public._cm_as_system_end(v);
  else
    update public.company_memberships set work_email = p_email where user_id = p_uid and org_id = p_org;
  end if;
end $$;

-- Going back to my sign-in email needs no code. Any other address: send-company-email-code, then confirm_company_email.
create or replace function public.set_company_email(p_org_id uuid, p_email text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_email text := lower(btrim(coalesce(p_email, ''))); v_login text; me public.profiles;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  select lower(email) into v_login from auth.users where id = v_uid;
  if v_login is null or v_email <> v_login then return jsonb_build_object('ok', false, 'error', 'needs_code'); end if;
  select * into me from public.profiles where id = v_uid;
  if me.id is null or me.role = 'superadmin' then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  if me.org_id is distinct from p_org_id and not exists(select 1 from public.company_memberships where user_id = v_uid and org_id = p_org_id) then
    return jsonb_build_object('ok', false, 'error', 'not_a_member');
  end if;
  perform public._cm_set_work_email(v_uid, p_org_id, v_email);
  return jsonb_build_object('ok', true);
end $$;

-- Service role only (send-company-email-code): a new 6-digit code for this email, kept only as a hash, for 15 minutes.
-- One code per person per company; a new one replaces the old, at most one every 45 seconds.
create or replace function public.cm_new_email_code(p_user uuid, p_org uuid, p_email text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_email text := lower(btrim(coalesce(p_email, ''))); v_err text; v_code text; v_last timestamptz;
begin
  v_err := public._cm_email_problem(p_user, p_org, v_email);
  if v_err is not null then return jsonb_build_object('ok', false, 'error', v_err); end if;
  select created_at into v_last from public.company_email_codes where user_id = p_user and org_id = p_org;
  if v_last > now() - interval '45 seconds' then return jsonb_build_object('ok', false, 'error', 'wait'); end if;
  v_code := lpad((abs(('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint) % 1000000)::text, 6, '0');
  insert into public.company_email_codes (user_id, org_id, email, code_hash, attempts, expires_at, created_at)
  values (p_user, p_org, v_email, encode(sha256(convert_to(p_user::text || ':' || p_org::text || ':' || v_email || ':' || v_code, 'UTF8')), 'hex'), 0, now() + interval '15 minutes', now())
  on conflict (user_id, org_id) do update set email = excluded.email, code_hash = excluded.code_hash, attempts = 0, expires_at = excluded.expires_at, created_at = excluded.created_at;
  return jsonb_build_object('ok', true, 'code', v_code, 'company', (select name from public.organizations where id = p_org));
end $$;

-- I type the code from the email and the address becomes my email for that company. Five tries within 15 minutes.
create or replace function public.confirm_company_email(p_org_id uuid, p_email text, p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_email text := lower(btrim(coalesce(p_email, ''))); r public.company_email_codes; v_err text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  select * into r from public.company_email_codes where user_id = v_uid and org_id = p_org_id for update;
  if r.user_id is null or r.email <> v_email then return jsonb_build_object('ok', false, 'error', 'code_wrong'); end if;
  if r.expires_at < now() or r.attempts >= 5 then
    delete from public.company_email_codes where user_id = v_uid and org_id = p_org_id;
    return jsonb_build_object('ok', false, 'error', 'code_expired');
  end if;
  if r.code_hash <> encode(sha256(convert_to(v_uid::text || ':' || p_org_id::text || ':' || v_email || ':' || btrim(coalesce(p_code, '')), 'UTF8')), 'hex') then
    update public.company_email_codes set attempts = attempts + 1 where user_id = v_uid and org_id = p_org_id;
    return jsonb_build_object('ok', false, 'error', 'code_wrong');
  end if;
  delete from public.company_email_codes where user_id = v_uid and org_id = p_org_id;
  v_err := public._cm_email_problem(v_uid, p_org_id, v_email);
  if v_err is not null then return jsonb_build_object('ok', false, 'error', v_err); end if;
  perform public._cm_set_work_email(v_uid, p_org_id, v_email);
  return jsonb_build_object('ok', true);
end $$;

-- Someone taken out of one company loses their links to that company's sites, as deleting their login used to.
create or replace function public._cm_clear_company_links(p_user uuid, p_org uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.site_assignments where user_id = p_user and site_id in (select id from public.sites where org_id = p_org);
  delete from public.site_price_access where user_id = p_user and site_id in (select id from public.sites where org_id = p_org);
  delete from public.site_labour_invoice_access where user_id = p_user and site_id in (select id from public.sites where org_id = p_org);
  delete from public.subcontractor_operatives where user_id = p_user and site_id in (select id from public.sites where org_id = p_org);
  update public.sites set responsible_pm_id = null where org_id = p_org and responsible_pm_id = p_user;
  delete from public.company_email_codes where user_id = p_user and org_id = p_org;
end $$;

create or replace function public.remove_company_access(p_user_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_org uuid := public.my_org_id(); v_cur uuid;
begin
  if not public.is_admin() or v_org is null then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  select org_id into v_cur from public.profiles where id = p_user_id;
  if v_cur = v_org then return jsonb_build_object('ok', false, 'error', 'in_this_company_now'); end if;
  delete from public.company_memberships where user_id = p_user_id and org_id = v_org;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_a_member'); end if;
  perform public._cm_clear_company_links(p_user_id, v_org);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.detach_from_company(p_user_id uuid, p_org_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare m public.company_memberships;
begin
  select * into m from public.company_memberships where user_id = p_user_id and org_id <> p_org_id order by last_used_at desc nulls last, created_at desc limit 1;
  if m.id is null then return false; end if;
  delete from public.company_memberships where user_id = p_user_id and org_id = p_org_id;
  perform public._cm_apply(p_user_id, m.org_id, m.state, m.work_email);
  update public.company_memberships set last_used_at = now() where id = m.id;
  perform public._cm_clear_company_links(p_user_id, p_org_id);
  return true;
end $$;

alter function public._cm_state_of(public.profiles) set search_path = public;

revoke all on function public._cm_email_problem(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public._cm_set_work_email(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public._cm_clear_company_links(uuid, uuid) from public, anon, authenticated;
revoke all on function public.cm_new_email_code(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.cm_new_email_code(uuid, uuid, text) to service_role;
revoke all on function public.confirm_company_email(uuid, text, text) from public, anon;
grant execute on function public.confirm_company_email(uuid, text, text) to authenticated;
