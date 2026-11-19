-- Applied 19 Nov 2026 (additive): a company's own subcontractor sign-up form. Admins edit; its people read; the public
-- sign-up page reads the questions only, by company id, through get_subform_template.
create table if not exists public.subform_templates (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  sections jsonb not null default '[]'::jsonb,
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);
alter table public.subform_templates enable row level security;
create policy "subform template read" on public.subform_templates for select to authenticated using (org_id = (select public.my_org_id()));
create policy "subform template add" on public.subform_templates for insert to authenticated with check ((select public.is_admin()) and org_id = (select public.my_org_id()));
create policy "subform template change" on public.subform_templates for update to authenticated using ((select public.is_admin()) and org_id = (select public.my_org_id())) with check (org_id = (select public.my_org_id()));
create policy "subform template remove" on public.subform_templates for delete to authenticated using ((select public.is_admin()) and org_id = (select public.my_org_id()));
create or replace function public.get_subform_template(p_org uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select sections from public.subform_templates where org_id = p_org;
$$;
revoke all on function public.get_subform_template(uuid) from public;
grant execute on function public.get_subform_template(uuid) to anon, authenticated;
