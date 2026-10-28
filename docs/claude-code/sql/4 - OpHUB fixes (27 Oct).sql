
-- ==========================================================================================
-- RUN ONLY AFTER THE PHONE APPS HAVE BEEN REBUILT WITH THIS VERSION
-- SEC-H3: private file storage (written 27 Oct 2026, branch fix3d).
-- ==========================================================================================
-- Makes the 9 file buckets private: signatures, incident-photos, site-photos, rams-docs,
-- coshh-docs, coshh-library, mc-documents, drawings, operative-tools. After this a file only
-- opens through a short-lived signed link that the app asks for (signed-in company members
-- only); a copied or forwarded old public link stops working.
-- org-logos stays public (logos are in emails and on the login / signing pages).
-- finance-docs, price-files, certifications, ... are already private and are not touched.
--
-- Run it only when ALL of these are done:
--   1. The website is pushed with the fix3d app.html (it works with public AND private buckets).
--   2. New iPhone and Android builds are made from that same app.html and everyone has updated.
--      A phone still on an old build would show grey stand-ins for photos and signatures.
--   3. These edge functions are updated to read / sign files with the service role instead of
--      building public links (all can go live before the switch; they work with public buckets):
--        client-sign (sign.html document), send-expenses-email, send-price-builder-email,
--        send-site-induction-email, send-subcontractor-inspection-email, and the multi-file
--        `files:[...]` branch of send-document-email. Without them those emails carry links that
--        no longer open and the client signing page can't show the RAMS.
--
-- How to run: Supabase > SQL Editor > New query, paste this block, Run. Safe to run twice.

begin;

-- Signatures of people who have since left the company stay readable on the records that use
-- them. Live today it covers 10 tables; these were missing: company_policy_signatures,
-- site_induction_completions, permits (issuer / closer), plant_checkouts (out / in).
-- (Same rule otherwise; runs with the viewer's own permissions, as before.)
create or replace function public.storage_signature_visible(p_name text) returns boolean
language sql stable security invoker set search_path = public as $$
  select exists (select 1 from rams_signatures where signature_image_path = p_name)
      or exists (select 1 from coshh_signatures where signature_image_path = p_name)
      or exists (select 1 from toolbox_talk_signatures where signature_image_path = p_name)
      or exists (select 1 from hs_policy_signatures where signature_image_path = p_name)
      or exists (select 1 from daily_briefing_signatures where signature_image_path = p_name)
      or exists (select 1 from site_layout_signatures where signature_image_path = p_name)
      or exists (select 1 from permit_signoffs where signature_image_path = p_name)
      or exists (select 1 from ppe_issuances where signature_image_path = p_name)
      or exists (select 1 from incident_reports where signature_image_path = p_name)
      or exists (select 1 from rams_client_signatures where signature_path = p_name)
      or exists (select 1 from company_policy_signatures where signature_image_path = p_name)
      or exists (select 1 from site_induction_completions where signature_image_path = p_name)
      or exists (select 1 from permits where issuer_signature_path = p_name or closer_signature_path = p_name)
      or exists (select 1 from plant_checkouts where checkout_signature_path = p_name or checkin_signature_path = p_name)
$$;

-- The switch.
update storage.buckets set public = false
 where id in ('signatures','incident-photos','site-photos','rams-docs','coshh-docs',
              'coshh-library','mc-documents','drawings','operative-tools');

commit;

-- Check: all 9 should say "private".
select id, case when public then 'PUBLIC' else 'private' end as now from storage.buckets
 where id in ('signatures','incident-photos','site-photos','rams-docs','coshh-docs',
              'coshh-library','mc-documents','drawings','operative-tools') order by id;

-- UNDO (if photos / documents stop showing): run this on its own to make them public again.
-- update storage.buckets set public = true
--  where id in ('signatures','incident-photos','site-photos','rams-docs','coshh-docs',
--               'coshh-library','mc-documents','drawings','operative-tools');
-- ==========================================================================================

-- ============================================================================================
-- Database-side bugs (27 Oct): CORE-M3, CP-NEW-1, PA-19, FX-P1 tidy-up
-- ============================================================================================

-- The new server functions check who is signed in themselves, so these are tidy-ups, not
-- urgent: only signed-in people (not the anonymous public key) can call them at all.
-- onedrive_status() = the true OneDrive state; rams_take_numbers() = next RAMS numbers;
-- fin_inbox_file() = file an emailed invoice in one step.
revoke execute on function public.onedrive_status() from public, anon;
revoke execute on function public.rams_take_numbers() from public, anon;
revoke execute on function public.fin_inbox_file(uuid, jsonb) from public, anon;
grant execute on function public.onedrive_status() to authenticated;
grant execute on function public.rams_take_numbers() to authenticated;
grant execute on function public.fin_inbox_file(uuid, jsonb) to authenticated;
