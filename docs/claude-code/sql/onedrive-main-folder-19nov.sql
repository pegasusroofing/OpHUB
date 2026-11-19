-- Applied 19 Nov 2026 (additive): a company's admin chooses its own main OneDrive folder.
create or replace function public.onedrive_set_main_folder(p_path text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v text := nullif(btrim(regexp_replace(coalesce(p_path, ''), '\', '/', 'g'), ' /'), '');
begin
  if not public.is_admin() or v is null or length(v) > 400 then return false; end if;
  update public.onedrive_connections set folder_path = v where org_id = public.my_org_id();
  return found;
end $$;
revoke all on function public.onedrive_set_main_folder(text) from public, anon;
grant execute on function public.onedrive_set_main_folder(text) to authenticated;
