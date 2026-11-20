-- Record only: applied 20 Nov 2026 (migrations sub_om_submit_guard_and_notify, sub_om_notify_as_message). Additive.
-- Andy, 20 Nov 2026: "dont allow it to be submitted until the subbie SOW is fully complete" and "an email to pm and
-- notification in hub". Proved with a self-undoing test: submitting is refused while a task given to the company isn't
-- done (a draft saves); once done it submits and one managers message is added; a plain save adds nothing.
-- messages.kind only allows a fixed list, so the alert is kind 'message' (changing the list would need Andy's go-ahead):
-- send-message-push emails and alerts the job's responsible PM and the admins ("New message — <job>"), and the HUB lists
-- it, labelled from its words, until it's opened.

create or replace function public.guard_sub_om_submit()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.subcontractor_company_id is not null and new.submitted_at is not null
     and (tg_op = 'INSERT' or old.submitted_at is null)
     and auth.uid() is not null and not public.is_pm()
     and exists (select 1 from schedule_tasks t
                 where t.site_id = new.site_id and t.subcontractor_company_id = new.subcontractor_company_id
                   and coalesce(t.status, '') not in ('done', 'completed', 'complete')) then
    raise exception 'Your Schedule of Works isn''t complete yet, so your O&M can''t be submitted.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger zz_guard_sub_om_submit before insert or update on public.handover_om_manuals
  for each row execute function public.guard_sub_om_submit();

create or replace function public.notify_sub_om_submitted()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare co text; rev text;
begin
  if new.subcontractor_company_id is not null and new.submitted_at is not null
     and (tg_op = 'INSERT' or old.submitted_at is distinct from new.submitted_at) then
    select name into co from subcontractor_companies where id = new.subcontractor_company_id;
    rev := new.data -> 'revisions' -> -1 ->> 'rev';
    insert into messages (org_id, site_id, sender_id, audience, kind, body, related_id)
    values (new.org_id, new.site_id, auth.uid(), 'managers', 'message',
      coalesce(co, 'A subcontractor') || ' submitted their O&M manual "' || new.name || '"' || coalesce(' (Revision ' || rev || ')', '')
        || '. It goes in the back of your O&M manual: Handover › O&M Manuals.', new.id);
  end if;
  return new;
end $$;
create trigger zz_notify_sub_om_submitted after insert or update of submitted_at on public.handover_om_manuals
  for each row execute function public.notify_sub_om_submitted();
