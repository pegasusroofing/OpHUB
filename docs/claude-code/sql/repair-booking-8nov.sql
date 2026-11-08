-- Applied as migration "repair_booking_slot_notes_8nov" (Andy, 8 Nov 2026). Additive only.
-- A repair booking (and the repair works booking) has a time slot and notes for the operative.
alter table public.repair_jobs add column if not exists survey_booking_slot text;
alter table public.repair_jobs add column if not exists survey_booking_notes text;
alter table public.repair_jobs add column if not exists works_booking_slot text;
alter table public.repair_jobs add column if not exists works_booking_notes text;
