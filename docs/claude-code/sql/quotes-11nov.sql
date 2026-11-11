-- Applied 11 Nov 2026 as migration quotes_11nov_settings (additive only). Kept here for the record.
-- Andy, 11 Nov 2026: quote status folders, the preset CC on Submit Quotation, auto exports and the tender tracker in OneDrive.
alter table public.quote_settings add column if not exists status_folders jsonb not null default '{"awaiting":"- Awaiting More Information","checking":"- Ready For Checking"}'::jsonb;
alter table public.quote_settings add column if not exists person_folders jsonb not null default '{}'::jsonb;
alter table public.quote_settings add column if not exists cc_email text;
alter table public.quote_settings add column if not exists auto_exports jsonb not null default '[]'::jsonb;
alter table public.quote_settings add column if not exists tracker_on boolean not null default true;
alter table public.quote_settings add column if not exists tracker_name text not null default 'Tender Tracker - OpHUB.xlsx';
alter table public.quote_settings add column if not exists auto_exports_sent jsonb not null default '{}'::jsonb;
-- RTB's estimating folders, as they are in OneDrive today (the chaser stays off).
insert into public.quote_settings (org_id, chase_enabled, chase_first_days, chase_every_days, chase_max, open_path, template_path, archive_path, won_folder, person_folders)
select o.id, false, 30, 14, 3, 'RTB Roofing Ltd/Estimating/Open Tenders', 'RTB Roofing Ltd/Estimating/Open Tenders/1. New Enquiry - Template', 'RTB Roofing Ltd/Estimating/- Estimating {year}', '1. Contract & Commercial/2. Estimating', '{}'::jsonb
from public.organizations o where o.name = 'RTB Roofing'
on conflict (org_id) do nothing;
