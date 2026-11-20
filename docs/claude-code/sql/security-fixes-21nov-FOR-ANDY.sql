-- OpHUB security fixes from the overnight review, 21 Nov 2026. NOT APPLIED: these change existing rules, so they need
-- Andy's go-ahead. To run: Supabase › SQL Editor › paste all of this › Run. Safe to run twice. No data is changed.
-- Checked before writing: every existing row already passes these rules (0 subcontractor companies, operatives or toolbox
-- talks out of line with their job's company; 0 certificate files outside a company folder).
-- Already done without needing a go-ahead (SQL file 14): the subcontractor invite functions made on 20 Nov only count a
-- subcontractor role on that subcontractor's own job in your own company, and their PM's invites are capped at 20 a day.
-- Full report: OpHUB Progress Reports\Overnight Review 21 Nov 2026\1 - Security and company separation.md

-- A. A subcontractor's people row must be on that subcontractor's own job, in your own company (finding 1). Stops a PM in
--    one company making themselves "admin" of another company's subcontractor.
drop policy if exists "pm insert" on public.subcontractor_operatives;
create policy "pm insert" on public.subcontractor_operatives for insert
  with check ((select public.is_pm()) and public.has_site_access(site_id)
    and exists (select 1 from public.subcontractor_companies c
                 where c.id = subcontractor_operatives.subcontractor_company_id
                   and c.site_id = subcontractor_operatives.site_id
                   and c.org_id = (select public.my_org_id())));
drop policy if exists "pm update" on public.subcontractor_operatives;
create policy "pm update" on public.subcontractor_operatives for update
  using ((select public.is_pm()) and public.has_site_access(site_id))
  with check ((select public.is_pm()) and public.has_site_access(site_id)
    and exists (select 1 from public.subcontractor_companies c
                 where c.id = subcontractor_operatives.subcontractor_company_id
                   and c.site_id = subcontractor_operatives.site_id
                   and c.org_id = (select public.my_org_id())));
drop policy if exists "pm insert" on public.subcontractor_companies;
create policy "pm insert" on public.subcontractor_companies for insert
  with check ((select public.is_pm()) and public.has_site_access(site_id) and org_id = (select public.my_org_id()));
drop policy if exists "pm update" on public.subcontractor_companies;
create policy "pm update" on public.subcontractor_companies for update
  using ((select public.is_pm()) and public.has_site_access(site_id))
  with check ((select public.is_pm()) and public.has_site_access(site_id) and org_id = (select public.my_org_id()));

create or replace function public.is_subcontractor_admin(p_company_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from subcontractor_operatives so
                 join subcontractor_companies c on c.id = so.subcontractor_company_id and c.site_id = so.site_id
                 where so.subcontractor_company_id = p_company_id and so.user_id = auth.uid() and so.is_admin);
$$;
create or replace function public.is_subcontractor_admin_of_master(p_master_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from subcontractor_operatives so
                 join subcontractor_companies sc on sc.id = so.subcontractor_company_id and sc.site_id = so.site_id
                 where sc.master_company_id = p_master_id and so.user_id = auth.uid() and so.is_admin);
$$;

-- B. Toolbox talks only on your own company's jobs; a subcontractor's admin only on that subcontractor's own job
--    (finding 4). The new app sends the company id with a subcontractor's talk since 21 Nov; the old app didn't (its
--    subcontractor talks failed to save anyway, because the company id is required).
drop policy if exists "pm insert toolbox talks" on public.toolbox_talks;
create policy "pm insert toolbox talks" on public.toolbox_talks for insert
  with check (org_id = (select public.my_org_id()) and public.site_in_my_org(site_id) and (
    ((select public.is_pm()) and public.has_site_access(site_id))
    or (subcontractor_company_id is not null and exists (
          select 1 from public.subcontractor_operatives so
          join public.subcontractor_companies c on c.id = so.subcontractor_company_id and c.site_id = so.site_id
          where so.subcontractor_company_id = toolbox_talks.subcontractor_company_id
            and so.site_id = toolbox_talks.site_id
            and so.user_id = (select auth.uid()) and so.is_admin))));
drop policy if exists "pm update toolbox talks" on public.toolbox_talks;
create policy "pm update toolbox talks" on public.toolbox_talks for update
  using ((select public.is_pm()) and public.has_site_access(site_id))
  with check ((select public.is_pm()) and public.has_site_access(site_id) and org_id = (select public.my_org_id()));

-- C. Subcontractor people stay out of Company Chat (finding 5). Note: one of your own operatives whom a PM has put into
--    a subcontractor company would also leave Company Chat while they're in it.
create or replace function public.company_chat_member()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from profiles p where p.id = auth.uid() and p.org_id is not null
                 and coalesce(p.role, '') <> 'client' and coalesce(p.role, '') not like 'subcontractor%'
                 and not exists (select 1 from subcontractor_operatives so join sites s on s.id = so.site_id
                                 where so.user_id = p.id and s.org_id = p.org_id));
$$;

-- D. Files can't be dropped into another company's folders (finding 9). Checked 21 Nov: every upload path in both apps
--    under general/, exports/ and report-pdfs/ puts the company id second, so they keep working. The one exception: the old
--    app's exports for a login with no company (the platform owner) would no longer save under exports/.
drop policy if exists "operative upload own certifications" on storage.objects;
create policy "operative upload own certifications" on storage.objects for insert
  with check (bucket_id = 'certifications' and (storage.foldername(name))[2] = (auth.uid())::text
              and (storage.foldername(name))[1] = (public.my_org_id())::text);

create or replace function public.storage_path_mine(p_name text)
returns boolean language plpgsql stable security definer set search_path to 'public' as $function$
declare s1 text; s2 text; org uuid; uid uuid;
        u constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  uid := auth.uid(); if uid is null then return false; end if;
  org := my_org_id(); if org is null then return false; end if;
  s1 := (storage.foldername(p_name))[1]; s2 := (storage.foldername(p_name))[2];
  if s1 = org::text or s1 = uid::text then return true; end if;
  if s2 = org::text and s1 !~ u then return true; end if;   -- general/<org>/, exports/<org>/, report-pdfs/<org>/ …
  if s1 ~ u and exists (select 1 from sites s where s.id = s1::uuid and s.org_id = org) then
    return not is_client() or has_client_view_access(s1::uuid);
  end if;
  if s1 = 'company-library' and s2 ~ u and has_master_company_access(s2::uuid) then return true; end if;
  return false;   -- was: any general/, exports/ or report-pdfs/ path, whichever company it named
end $function$;
