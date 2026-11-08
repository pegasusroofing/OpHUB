-- OneDrive set-up (Andy, 8 Nov 2026). Applied as migration "onedrive_setup_8nov". Additive only.
-- 1. A client can be set to never get OneDrive folders for their jobs (Directory › Clients). Jobs already made keep theirs.
-- 2. client_onedrive_folders(name): may a new job for this client get a folder? Anyone making a job can ask (a PM without
--    Finance can't read the Directory), and it only says yes or no.
-- 3. platform_setup_status(org): the super admin's set-up checklist for a company, counts and yes/no only.
alter table public.fin_clients add column if not exists onedrive_folders boolean not null default true;

create or replace function public.client_onedrive_folders(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from fin_clients c
    where c.org_id = my_org_id() and lower(btrim(c.name)) = lower(btrim(coalesce(p_name, ''))) and c.onedrive_folders = false
  );
$$;

create or replace function public.platform_setup_status(p_org uuid)
returns json language plpgsql stable security definer set search_path = public as $$
declare s record;
begin
  if not is_superadmin() then return null; end if;
  select enabled, config into s from job_pack_settings where org_id = p_org;
  return json_build_object(
    'admins', (select count(*) from profiles p where p.org_id = p_org and p.role = 'admin'),
    'onedrive', exists (select 1 from onedrive_connections c where c.org_id = p_org),
    'pack_on', coalesce(s.enabled, false),
    'parent_path', s.config->>'parent_path',
    'template_path', s.config->>'template_path',
    'rules_on', coalesce((select count(*) from jsonb_each(coalesce(s.config->'rules', '{}'::jsonb)) r where (r.value->>'on')::boolean), 0),
    'clients_off', (select count(*) from fin_clients c where c.org_id = p_org and c.onedrive_folders = false),
    'jobs_with_folder', (select count(*) from sites x where x.org_id = p_org and x.job_pack is not null)
  );
end $$;

revoke execute on function public.client_onedrive_folders(text), public.platform_setup_status(uuid) from public, anon;
grant execute on function public.client_onedrive_folders(text), public.platform_setup_status(uuid) to authenticated;
