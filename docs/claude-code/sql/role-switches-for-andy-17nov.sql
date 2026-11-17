-- FOR ANDY: paste into Supabase › SQL Editor and press Run, when you're happy. Not run yet (17 Nov 2026).
-- Two small changes to functions the current app also uses, from the security review of the role switches. Nothing
-- changes for anyone today: every RTB role keeps Every Job, and other companies have no role list.
--
-- 1. Every Job becomes a proper lock. Today, taking Every Job off a role hides those jobs from the lists, but the jobs'
--    contents (messages, schedule, RAMS, materials...) could still be read by someone who knew how. After this, a
--    manager whose role lacks Every Job can only open the jobs they run, made, or are put on.
create or replace function public.has_site_access(p_site_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select exists (
    select 1 from sites s
    where s.id = p_site_id
      and public.my_org_id() is not null
      and s.org_id = public.my_org_id()
      and not public.is_client()
      and (
        (public.is_pm_or_admin() and (public.role_can('every_job') or public.role_sees_site(s.id, s.responsible_pm_id, s.created_by)))
        or exists (select 1 from site_assignments sa where sa.site_id = p_site_id and sa.user_id = auth.uid())
      )
  );
$function$;

-- 2. The estimators' phone check only judges your own phone, so nobody can use it to find out who is an estimator.
create or replace function public.push_tokens_skip_estimator()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if auth.uid() is not null and new.user_id is distinct from auth.uid() then return new; end if;
  if exists (select 1 from profiles where id = new.user_id and is_estimator) then
    return null;
  end if;
  return new;
end $function$;
