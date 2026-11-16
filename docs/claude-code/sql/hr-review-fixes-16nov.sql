-- Applied 16 Nov 2026, from the security review of the day's changes.
-- 1. Someone HR let see a folder (or a line manager) loses it the moment they stop being staff (made a client, say):
--    hr_lm_sees now checks the viewer is still staff of the company, as hr_is_team does.
-- 2. No two HR documents can point at the same file, so an employee can't open a hidden document by adding their own
--    row with its path (hr_docs had no rows when this was added).
create or replace function public.hr_lm_sees(p_user uuid, p_section text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select p_section not in ('personal', 'other')
    and exists (select 1 from public.profiles me where me.id = auth.uid() and me.org_id = public.my_org_id()
                and me.role not in ('client', 'superadmin') and me.role not like 'subcontractor%')
    and (
    (exists (select 1 from public.hr_records r where r.user_id = p_user and r.line_manager_id = auth.uid() and r.org_id = public.my_org_id())
      and p_section = any(coalesce((select s.hr_lm_sections from public.hr_settings s where s.org_id = public.my_org_id()), array['performance', 'emergency'])))
    or exists (select 1 from public.hr_viewers v where v.user_id = p_user and v.viewer_id = auth.uid() and v.org_id = public.my_org_id()
      and p_section = any(coalesce(v.sections, (select s.hr_lm_sections from public.hr_settings s where s.org_id = public.my_org_id()), array['performance', 'emergency']))));
$$;
create unique index if not exists hr_docs_storage_path_uq on public.hr_docs (storage_path);
