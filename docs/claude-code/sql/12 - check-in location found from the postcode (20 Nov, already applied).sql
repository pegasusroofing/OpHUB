-- Record only: applied 20 Nov 2026 (migration site_geofence_suggested). Additive.
-- Andy, 20 Nov 2026: "can we also get the geolocation to auto find it from the postcode. but have it as a notification
-- number in the project to highlight it needs to be confirmed". The new app looks the job's postcode up and keeps the
-- point here until a manager confirms it (then it becomes geofence_lat / geofence_lon). Check-ins, in both apps, only
-- ever use geofence_lat / geofence_lon, so a rough postcode point never blocks anyone.
alter table public.sites
  add column if not exists geofence_suggested_lat double precision,
  add column if not exists geofence_suggested_lon double precision;
