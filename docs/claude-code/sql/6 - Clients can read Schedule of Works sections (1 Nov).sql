-- DONE 1 Nov 2026: applied at Andy's request. Do not paste again.
-- Paste into Supabase > SQL Editor when you're happy. Only adds; it changes nothing that's there.
-- Why: a client can read a job's Schedule of Works tasks, but not the sections they sit in. The new app now shows
-- those tasks in one plain list so clients don't lose them. With this in, they appear under their proper section names.
create policy "client view select" on public.schedule_sections
  for select using (public.has_client_view_access(site_id));
