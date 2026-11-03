-- 10 - Email templates for H&S signatures (3 Nov 2026)
-- Lets Settings › Templates save a wording for the two new H&S emails (outstanding signatures, signed RAMS / COSHH)
-- (RAMS / COSHH › Email beside Ask Outstanding To Sign).
-- Until this is run, that email still works with OpHUB's standard wording; only saving your own wording for it fails.
-- Only the new app's email templates table is touched (made on 3 Nov); the current app doesn't use it.
-- Paste into Supabase › SQL Editor and press Run.

alter table public.fin_email_templates drop constraint if exists fin_email_templates_kind_check;
alter table public.fin_email_templates add constraint fin_email_templates_kind_check
  check (kind = any (array['application', 'invoice', 'certificate', 'credit', 'po', 'signatures', 'hsdocs']));
