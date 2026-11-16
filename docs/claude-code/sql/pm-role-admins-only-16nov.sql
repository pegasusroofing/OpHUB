-- Applied 16 Nov 2026 (Andy, 16 Nov: "Yes item 3 only admin"). Block A of review-15nov-for-andy.sql, with one change:
-- instead of quietly putting the old role back (which let the app say "Role changed" when it hadn't), the save is
-- refused with a plain message, so both apps show why.
-- Only company admins (and the platform superadmin) make someone a Project Manager, or move a Project Manager to
-- another role. Switching a PM between Project Manager and Estimator (both role 'pm') is unchanged.
create or replace function public.protect_profile_by_manager()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null or public.is_superadmin() then return new; end if;
  if auth.uid() <> old.id then
    new.signature_path := old.signature_path;
    new.email := old.email;
    if not public.is_admin() and new.role = 'admin' and old.role <> 'admin' then new.role := old.role; end if;
    if not public.is_admin() and new.role is distinct from old.role and 'pm' in (new.role, old.role) then
      raise exception 'Only a company admin can make someone a Project Manager, or change a Project Manager''s role.'
        using errcode = '42501';
    end if;
  else
    new.email := old.email;
  end if;
  return new;
end $$;
