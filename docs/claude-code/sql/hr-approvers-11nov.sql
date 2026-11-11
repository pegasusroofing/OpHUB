-- FOR ANDY TO RUN (Supabase › SQL Editor), 11 Nov 2026.
-- Lets the people chosen under HR › Holiday Settings › Who Approves Holidays approve and decline time off, as admins can
-- now. It changes the existing hr_leave guard (it only widens who counts as an approver: admins still can), so it waits
-- for your go-ahead. Until it's run, the chosen approvers see the requests but only an admin's approval saves.
-- The new column hr_settings.approvers and the function is_leave_approver() are already in place.

create or replace function public.hr_leave_guard()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not (public.is_admin() or public.is_leave_approver()) then
    if tg_op = 'INSERT' then
      new.decided_by := null; new.decided_at := null;
      if new.bank_holiday then
        if new.start_date = new.end_date and exists (select 1 from hr_bank_holidays b where b.day = new.start_date) then
          new.status := 'approved'; new.type := 'annual'; new.override_limit := false; return new;
        end if;
        new.bank_holiday := false;
      end if;
      if auth.uid() is not null then new.created_by := auth.uid(); end if;
      if new.status is distinct from 'pending' and not (new.status = 'approved' and new.type = 'sick') then new.status := 'pending'; end if;
      new.override_limit := false;
    else
      if new.status is distinct from old.status and new.status <> 'cancelled' then new.status := old.status; end if;
      new.user_id := old.user_id; new.org_id := old.org_id; new.type := old.type;
      new.start_date := old.start_date; new.end_date := old.end_date; new.half := old.half;
      new.start_part := old.start_part; new.end_part := old.end_part; new.days := old.days;
      new.created_by := old.created_by; new.created_at := old.created_at;
      new.bank_holiday := old.bank_holiday;
      new.decided_by := old.decided_by; new.decided_at := old.decided_at; new.override_limit := old.override_limit;
    end if;
  else
    if tg_op = 'INSERT' then
      if new.status in ('approved','rejected') and not coalesce(new.bank_holiday, false) then
        new.decided_by := auth.uid(); new.decided_at := now();
      elsif not coalesce(new.bank_holiday, false) then
        new.decided_by := null; new.decided_at := null;
      end if;
    elsif new.status is distinct from old.status and new.status in ('approved','rejected') then
      new.decided_by := auth.uid(); new.decided_at := now();
    else
      new.decided_by := old.decided_by; new.decided_at := old.decided_at;
    end if;
  end if;
  return new;
end $function$;

-- An approver may update time-off rows in their own company (to approve or decline them).
create policy "leave approvers decide" on public.hr_leave for update to authenticated
  using (public.is_leave_approver() and org_id = public.my_org_id())
  with check (public.is_leave_approver() and org_id = public.my_org_id());
