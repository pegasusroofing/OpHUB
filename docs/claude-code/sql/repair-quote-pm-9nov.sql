-- PMs quote repair jobs from Projects (Andy, 9 Nov 2026). Applied as migration "repair_quote_pm_9nov". Additive only: new storage
-- policies. Nothing the current app uses is changed.
--
-- 1. A PM (or admin) saves the quote PDF that gets emailed to the client: finance-docs/<org>/<site>/repair-quotes/...
--    (send-repair-quote v2 lets PMs and admins send it, for jobs they can see).
-- 2. Fix for 8 Nov's client PO file policies ("pm reads client po files", "pm uploads client po files"): inside
--    "exists (select 1 from sites s ...)" the bare word name meant the SITE's name, not the file's path, so they never matched
--    and a PM without Finance couldn't upload or open a client PO file. These say objects.name. The old two stay (they match
--    nothing, so they do no harm); dropping them would need Andy's go-ahead.

create policy "pm uploads repair quotes" on storage.objects for insert to authenticated
  with check (bucket_id = 'finance-docs' and (storage.foldername(objects.name))[1] = (select public.my_org_id())::text and (storage.foldername(objects.name))[3] = 'repair-quotes'
    and (select public.is_pm()) and exists (select 1 from public.sites s where s.id::text = (storage.foldername(objects.name))[2] and s.org_id = (select public.my_org_id()) and public.has_site_access(s.id)));

create policy "pm reads client po files by path" on storage.objects for select to authenticated
  using (bucket_id = 'finance-docs' and (storage.foldername(objects.name))[1] = (select public.my_org_id())::text and (storage.foldername(objects.name))[3] = 'client-po'
    and (select public.is_pm()) and exists (select 1 from public.sites s where s.id::text = (storage.foldername(objects.name))[2] and s.org_id = (select public.my_org_id()) and public.has_site_access(s.id)));

create policy "pm uploads client po files by path" on storage.objects for insert to authenticated
  with check (bucket_id = 'finance-docs' and (storage.foldername(objects.name))[1] = (select public.my_org_id())::text and (storage.foldername(objects.name))[3] = 'client-po'
    and (select public.is_pm()) and exists (select 1 from public.sites s where s.id::text = (storage.foldername(objects.name))[2] and s.org_id = (select public.my_org_id()) and public.has_site_access(s.id)));
