-- Applied 19 Nov 2026 (additive): app-wide settings browsers may read - the Esri satellite map key for the CPP map
-- snapshot (a browser key, limited to the app's addresses on Esri's side). Set the key with:
--   insert into public.app_settings (key, value) values ('esri_basemap_key', '<key>')
--   on conflict (key) do update set value = excluded.value, updated_at = now();
create table if not exists public.app_settings (key text primary key, value text not null, updated_at timestamptz not null default now());
alter table public.app_settings enable row level security;
create policy "app settings read" on public.app_settings for select to authenticated using (key in ('esri_basemap_key'));
