-- Record only: applied 20 Nov 2026 (migration sub_rams_approval). Additive.
-- Andy, 20 Nov 2026: "ensure rams once issued to they go to the pm/site manager for approval, they then have a tick to sign or
-- a reject & comment (this enables the pm/site manager to add text and highlight areas in the rams. coshh and tbt dont need to
-- be approved". Proved with a self-undoing test: a subcontractor's upload is awaiting approval (their own "approved" is
-- ignored) and the managers are told; they can't approve their own; a manager sends it back with a comment and a marked-up
-- copy and the uploader is told; a manager approves; a manager's own upload needs no approval.
alter table public.rams_docs
  add column if not exists approval_status text check (approval_status in ('pending', 'approved', 'rejected')),
  add column if not exists approval_note text,
  add column if not exists approval_by uuid references public.profiles(id) on delete set null,
  add column if not exists approval_at timestamptz,
  add column if not exists approval_markup_path text;

create or replace function public.guard_rams_approval()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' then
    if new.subcontractor_company_id is not null and auth.uid() is not null and not public.is_pm() then
      new.approval_status := 'pending'; new.approval_note := null; new.approval_by := null; new.approval_at := null; new.approval_markup_path := null;
    elsif not (auth.uid() is null or public.is_pm()) then
      new.approval_status := null; new.approval_note := null; new.approval_by := null; new.approval_at := null; new.approval_markup_path := null;
    end if;
    return new;
  end if;
  if auth.uid() is null or public.is_pm() then
    if new.approval_status is distinct from old.approval_status then
      new.approval_by := case when new.approval_status in ('approved', 'rejected') then coalesce(auth.uid(), new.approval_by) else null end;
      new.approval_at := case when new.approval_status in ('approved', 'rejected') then now() else null end;
    end if;
    return new;
  end if;
  new.approval_status := old.approval_status; new.approval_note := old.approval_note; new.approval_by := old.approval_by;
  new.approval_at := old.approval_at; new.approval_markup_path := old.approval_markup_path;
  return new;
end $$;
create trigger zz_guard_rams_approval before insert or update on public.rams_docs
  for each row execute function public.guard_rams_approval();

create or replace function public.notify_rams_approval()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare co text; who uuid; site_org uuid;
begin
  if new.subcontractor_company_id is null then return new; end if;
  select name into co from subcontractor_companies where id = new.subcontractor_company_id;
  select org_id into site_org from sites where id = new.site_id;
  if tg_op = 'INSERT' and new.approval_status = 'pending' then
    insert into messages (org_id, site_id, sender_id, audience, kind, body, related_id)
    values (site_org, new.site_id, auth.uid(), 'managers', 'message',
      coalesce(co, 'A subcontractor') || ' uploaded RAMS "' || new.name || '" for your approval. Approve it, or send it back with your comments: Main Contractor › Subcontractors › ' || coalesce(co, 'their company') || ' › RAMS.', new.id);
  elsif tg_op = 'UPDATE' and new.approval_status is distinct from old.approval_status and new.approval_status in ('approved', 'rejected') then
    who := new.uploaded_by;
    if who is not null then
      insert into messages (org_id, site_id, sender_id, audience, recipient_id, kind, body, related_id)
      values (site_org, new.site_id, auth.uid(), 'single', who, 'message',
        case when new.approval_status = 'approved' then 'Your RAMS "' || new.name || '" was approved. Your operatives can now sign it.'
             else 'Your RAMS "' || new.name || '" was sent back: ' || coalesce(new.approval_note, '') || ' Revise it and upload it again (RAMS › ⋮ › Revise RAMS).' end,
        new.id);
    end if;
  end if;
  return new;
end $$;
create trigger zz_notify_rams_approval after insert or update of approval_status on public.rams_docs
  for each row execute function public.notify_rams_approval();
