-- Record only: applied 20 Nov 2026 (migration subcontractor_om_manuals). Additive.
-- Subcontractors' O&M manuals (Andy, 20 Nov 2026: "We need it so that subcontractors submit or can do their o&ms too, and
-- then that would add into our o&ms when we are main contractor as appendix's"). A subcontractor's admin on a job uploads
-- or builds their company's O&M manual; once submitted it goes in the back of the main contractor's O&M.
-- Proved with a self-undoing test (20 Nov): the sub admin adds, sees and edits only their own company's manuals; can't add
-- to another company or as the main contractor, can't turn theirs into an MC manual, can't touch the MC's; an ordinary
-- operative of the same company sees and adds nothing; a PM sees them all.
alter table public.handover_om_manuals
  add column if not exists subcontractor_company_id uuid references public.subcontractor_companies(id) on delete cascade,
  add column if not exists file_path text,
  add column if not exists submitted_at timestamptz;
create index if not exists handover_om_manuals_subco_idx on public.handover_om_manuals(subcontractor_company_id);

create or replace function public.is_sub_admin_of(p_site uuid, p_company uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from subcontractor_operatives so
    join subcontractor_companies sc on sc.id = so.subcontractor_company_id
    where so.site_id = p_site and sc.site_id = p_site and so.subcontractor_company_id = p_company
      and so.user_id = auth.uid() and so.is_admin
  );
$$;
revoke execute on function public.is_sub_admin_of(uuid, uuid) from public, anon;
grant execute on function public.is_sub_admin_of(uuid, uuid) to authenticated;

create policy "sub admin read own om" on public.handover_om_manuals for select to authenticated
  using (subcontractor_company_id is not null and org_id = (select my_org_id()) and public.is_sub_admin_of(site_id, subcontractor_company_id));
create policy "sub admin insert own om" on public.handover_om_manuals for insert to authenticated
  with check (subcontractor_company_id is not null and org_id = (select my_org_id()) and public.is_sub_admin_of(site_id, subcontractor_company_id));
create policy "sub admin update own om" on public.handover_om_manuals for update to authenticated
  using (subcontractor_company_id is not null and org_id = (select my_org_id()) and public.is_sub_admin_of(site_id, subcontractor_company_id))
  with check (subcontractor_company_id is not null and org_id = (select my_org_id()) and public.is_sub_admin_of(site_id, subcontractor_company_id));
create policy "sub admin delete own om" on public.handover_om_manuals for delete to authenticated
  using (subcontractor_company_id is not null and org_id = (select my_org_id()) and public.is_sub_admin_of(site_id, subcontractor_company_id));
