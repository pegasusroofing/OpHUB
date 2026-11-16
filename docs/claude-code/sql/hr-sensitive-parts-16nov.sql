-- Applied 16 Nov 2026 (Andy, 16 Nov: "Re contracts pay rights to work and disciplinary, this should be selectable by
-- the admin as well"). Contracts & Letters, Payslips & Pay, Right To Work & ID, Disciplinary & Grievance and Bonus
-- become parts HR can allow, person by person (HR Access) or for line managers (What Line Managers See). Nobody has them
-- until HR says Yes. Personal details and the Other folder stay HR-only. Seeing is still read-only.
-- The HR tables and functions are the new app's only (built 14-16 Nov); the current app doesn't use them.
-- Policies are only added (Postgres ORs them with the existing ones); four functions are replaced.

-- 1. The rule: only personal details and Other are never shown now.
create or replace function public.hr_lm_sees(p_user uuid, p_section text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select p_section not in ('personal', 'other') and (
    (exists (select 1 from public.hr_records r where r.user_id = p_user and r.line_manager_id = auth.uid() and r.org_id = public.my_org_id())
      and p_section = any(coalesce((select s.hr_lm_sections from public.hr_settings s where s.org_id = public.my_org_id()), array['performance', 'emergency'])))
    or exists (select 1 from public.hr_viewers v where v.user_id = p_user and v.viewer_id = auth.uid() and v.org_id = public.my_org_id()
      and p_section = any(coalesce(v.sections, (select s.hr_lm_sections from public.hr_settings s where s.org_id = public.my_org_id()), array['performance', 'emergency']))));
$$;

create or replace function public.hr_sections_for(p_user uuid)
returns text[] language sql stable security definer set search_path to 'public' as $$
  select coalesce(array_agg(x), '{}') from unnest(array['performance', 'emergency', 'licences', 'health', 'absence', 'history', 'contracts', 'pay', 'rtw', 'conduct', 'bonus']) x
  where public.hr_lm_sees(p_user, x);
$$;

-- 2. Files: someone allowed Disciplinary also sees its documents marked "not shown to them" (that folder's are, by
--    default); in every other folder those stay HR-only.
create or replace function public.hr_can_read_file(p_name text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.hr_docs d where d.storage_path = p_name and d.org_id = public.my_org_id()
    and ((d.user_id = auth.uid() and not d.hidden_from_employee)
      or (public.hr_lm_sees(d.user_id, d.folder) and (not d.hidden_from_employee or d.folder = 'conduct'))));
$$;
create policy "hr docs read: allowed disciplinary" on public.hr_docs for select to authenticated
  using (org_id = (select public.my_org_id()) and hidden_from_employee and folder = 'conduct' and public.hr_lm_sees(user_id, 'conduct'));

-- 3. Pay reviews in Job History for someone allowed Pay; bonuses for someone allowed Bonus.
create policy "hr history read: allowed pay" on public.hr_history for select to authenticated
  using (org_id = (select public.my_org_id()) and kind = 'pay' and public.hr_lm_sees(user_id, 'pay'));
create policy "hr bonuses read: allowed" on public.hr_bonuses for select to authenticated
  using (org_id = (select public.my_org_id()) and public.hr_lm_sees(user_id, 'bonus'));

-- 4. The record's basics: start, probation, leaving date, type and hours for someone allowed Contracts; the right to
--    work check for someone allowed Right To Work.
create or replace function public.hr_basic(p_user uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select case when r.user_id is null then null
    when public.hr_is_team() or p_user = auth.uid() or r.line_manager_id = auth.uid() then
      jsonb_build_object('user_id', r.user_id, 'org_id', r.org_id, 'job_title', r.job_title, 'department', r.department, 'employment_type', r.employment_type,
        'start_date', r.start_date, 'probation_end', r.probation_end, 'end_date', r.end_date, 'line_manager_id', r.line_manager_id)
      || case when public.hr_is_team() or p_user = auth.uid() or public.hr_lm_sees(p_user, 'emergency')
           then jsonb_build_object('emergency_name', r.emergency_name, 'emergency_relationship', r.emergency_relationship, 'emergency_phone', r.emergency_phone) else '{}'::jsonb end
      || case when public.hr_lm_sees(p_user, 'contracts') then jsonb_build_object('contracted_hours', r.contracted_hours) else '{}'::jsonb end
      || case when public.hr_lm_sees(p_user, 'rtw') then jsonb_build_object('rtw_checked_on', r.rtw_checked_on, 'rtw_document', r.rtw_document, 'rtw_expiry', r.rtw_expiry) else '{}'::jsonb end
    when public.hr_is_line_manager(p_user) then
      jsonb_build_object('user_id', r.user_id, 'org_id', r.org_id, 'job_title', r.job_title, 'department', r.department, 'line_manager_id', r.line_manager_id)
      || case when public.hr_lm_sees(p_user, 'emergency')
           then jsonb_build_object('emergency_name', r.emergency_name, 'emergency_relationship', r.emergency_relationship, 'emergency_phone', r.emergency_phone) else '{}'::jsonb end
      || case when public.hr_lm_sees(p_user, 'contracts')
           then jsonb_build_object('employment_type', r.employment_type, 'start_date', r.start_date, 'probation_end', r.probation_end, 'end_date', r.end_date, 'contracted_hours', r.contracted_hours) else '{}'::jsonb end
      || case when public.hr_lm_sees(p_user, 'rtw') then jsonb_build_object('rtw_checked_on', r.rtw_checked_on, 'rtw_document', r.rtw_document, 'rtw_expiry', r.rtw_expiry) else '{}'::jsonb end
    else null end
  from (select 1) x left join public.hr_records r on r.user_id = p_user and r.org_id = public.my_org_id();
$$;

-- 5. Saving a person's access accepts the new parts: hr_set_person_access_each (applied earlier today) with the longer
--    list, the rest unchanged.
do $do$
declare d text;
begin
  d := pg_get_functiondef('public.hr_set_person_access_each'::regproc);
  d := replace(d, $q$where s in ('performance', 'emergency', 'licences', 'health', 'absence', 'history'))$q$,
                  $q$where s in ('performance', 'emergency', 'licences', 'health', 'absence', 'history', 'contracts', 'pay', 'rtw', 'conduct', 'bonus'))$q$);
  if position($q$'bonus'$q$ in d) = 0 then raise exception 'list not found'; end if;
  execute d;
end $do$;
