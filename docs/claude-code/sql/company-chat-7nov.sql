-- Company Chat (Andy, 7 Nov 2026): one chat for the whole company, in the HUB (managers) and Messages (everyone else).
-- Additions only: two new tables, their rules, and triggers on the new table. Nothing existing is changed.
-- Applied on 7 Nov 2026 as migration company_chat_7nov.
--
-- Who's in it: everyone in the company except clients (and any subcontractor logins).
-- @tags: the database checks each tagged person is in the same company, then sends them a one-person message
-- ("X tagged you in Company Chat: …"). One-person messages only push to that phone; they are never emailed.

create or replace function public.company_chat_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles p where p.id = auth.uid() and p.org_id is not null
                 and coalesce(p.role, '') <> 'client' and coalesce(p.role, '') not like 'subcontractor%');
$$;
revoke execute on function public.company_chat_member() from public, anon;
grant execute on function public.company_chat_member() to authenticated;

create table if not exists public.company_chat (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.my_org_id() references public.organizations(id) on delete cascade,
  sender_id uuid not null default auth.uid(),
  sender_name text,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  mentions uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists company_chat_org_time on public.company_chat (org_id, created_at desc);
alter table public.company_chat enable row level security;
drop policy if exists company_chat_read on public.company_chat;
create policy company_chat_read on public.company_chat for select to authenticated
  using (org_id = public.my_org_id() and public.company_chat_member());
drop policy if exists company_chat_write on public.company_chat;
create policy company_chat_write on public.company_chat for insert to authenticated
  with check (org_id = public.my_org_id() and sender_id = auth.uid() and public.company_chat_member());
-- No update or delete: what's said stays.

-- When each person last opened the chat (for the red count).
create table if not exists public.company_chat_reads (
  user_id uuid primary key default auth.uid(),
  org_id uuid not null default public.my_org_id(),
  last_read_at timestamptz not null default now()
);
alter table public.company_chat_reads enable row level security;
drop policy if exists company_chat_reads_mine_sel on public.company_chat_reads;
create policy company_chat_reads_mine_sel on public.company_chat_reads for select to authenticated using (user_id = auth.uid());
drop policy if exists company_chat_reads_mine_ins on public.company_chat_reads;
create policy company_chat_reads_mine_ins on public.company_chat_reads for insert to authenticated with check (user_id = auth.uid() and org_id = public.my_org_id());
drop policy if exists company_chat_reads_mine_upd on public.company_chat_reads;
create policy company_chat_reads_mine_upd on public.company_chat_reads for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and org_id = public.my_org_id());

-- Before saving: the sender's name, the time, and only tags of people in the same company (not the sender, not clients).
create or replace function public.company_chat_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then new.sender_id := auth.uid(); end if;
  select p.name into new.sender_name from profiles p where p.id = new.sender_id;
  new.mentions := coalesce((select array_agg(distinct p.id) from profiles p
                            where p.id = any (coalesce(new.mentions, '{}')) and p.org_id = new.org_id and p.id <> new.sender_id
                              and coalesce(p.role, '') <> 'client'), '{}');
  new.created_at := now();
  return new;
end $$;
drop trigger if exists company_chat_before on public.company_chat;
create trigger company_chat_before before insert on public.company_chat for each row execute function public.company_chat_before();

-- After saving: a one-person message to each person tagged (that's what sends their phone a notification).
create or replace function public.company_chat_mentions() returns trigger
language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  foreach u in array new.mentions loop
    insert into messages (org_id, site_id, sender_id, audience, kind, body, recipient_id)
    values (new.org_id, null, new.sender_id, 'single', 'message',
            coalesce(new.sender_name, 'Someone') || ' tagged you in Company Chat: ' || left(new.body, 300), u);
  end loop;
  return null;
end $$;
drop trigger if exists zz_company_chat_mentions on public.company_chat;
create trigger zz_company_chat_mentions after insert on public.company_chat for each row execute function public.company_chat_mentions();

revoke execute on function public.company_chat_before() from public, anon, authenticated;
revoke execute on function public.company_chat_mentions() from public, anon, authenticated;
