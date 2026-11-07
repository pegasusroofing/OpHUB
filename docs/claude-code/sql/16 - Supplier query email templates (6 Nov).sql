-- ==========================================================================================
-- OpHUB: let companies save their own wording for "Query With Supplier" emails (Andy, 6 Nov 2026).
-- RUN ON 7 Nov 2026 (Andy asked), as migration supplier_query_templates_7nov.
-- How to run: Supabase > SQL Editor > New query, paste this whole file, press Run.
-- It widens the list of email template types to include 'pi_query' (a query on a supplier's
-- invoice). Nothing is deleted; every existing template stays as it is. Safe to run twice.
-- Until it's run, Query With Supplier still works with OpHUB's standard wording; only saving
-- your own wording in Finance > Settings > Templates needs this.
-- ==========================================================================================

begin;

alter table public.fin_email_templates drop constraint if exists fin_email_templates_kind_check;
alter table public.fin_email_templates add constraint fin_email_templates_kind_check
  check (kind = any (array['application', 'invoice', 'certificate', 'credit', 'po', 'signatures', 'hsdocs', 'pi_query']));

commit;

-- Check (should show the list ending in pi_query):
select pg_get_constraintdef(oid) from pg_constraint where conname = 'fin_email_templates_kind_check';
