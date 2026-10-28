-- OpHUB materials & Finance PO links (25 Oct 2026). Paste all of this into Supabase › SQL Editor › New query, then press Run.
-- Safe to run twice.
alter table public.delivery_tasks add column if not exists po_id uuid;
alter table public.delivery_tasks add column if not exists material_ids uuid[];
alter table public.purchase_invoices add column if not exists query_thread jsonb not null default '[]'::jsonb;

-- new message types: delivery problem, invoice query, invoice query reply
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check check (kind = any (array['message','material_request','snag_closed','snag_raised','variation','todo_assigned','price_overbooked','additional_works_requested','schedule_flag','material_pickup','delivery_complete','delivery_assigned','vehicle_checklist_fail','doc_needs_signing','operative_checked_in','permit_issued','permit_closed','price_sheet_issued','havs_eav_exceeded','havs_elv_exceeded','grn_problem','pi_query','pi_query_reply']));

-- 1. Items on a sent PO can only be cancelled / changed in Finance (it talks to Xero)
create or replace function public.materials_po_lock() returns trigger
language plpgsql security definer set search_path = public as $$
declare po record;
begin
  if auth.uid() is null or public.is_finance() or public.is_superadmin() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if old.po_id is null then return case when tg_op = 'DELETE' then old else new end; end if;
  select id, number, sent_at, status into po from purchase_orders where id = old.po_id;
  if po.id is null or po.status = 'cancelled' then return case when tg_op = 'DELETE' then old else new end; end if;
  if tg_op = 'DELETE' then
    raise exception 'This item is on PO %, which has been sent. Change or cancel it in Finance.', coalesce(po.number,'') using errcode = 'P0001';
  end if;
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    raise exception 'This item is on PO %, which has been sent. Change or cancel it in Finance.', coalesce(po.number,'') using errcode = 'P0001';
  end if;
  new.item := old.item; new.qty := old.qty; new.supplier_id := old.supplier_id; new.supplier_branch := old.supplier_branch;
  return new;
end $$;
revoke execute on function public.materials_po_lock() from anon, authenticated, public;
drop trigger if exists zz_materials_po_lock on public.materials;
create trigger zz_materials_po_lock before update or delete on public.materials for each row execute function public.materials_po_lock();

-- 3. Office (Finance) orders for a project: managers only, no prices
create or replace function public.site_office_orders(p_site uuid)
returns table(id uuid, number text, supplier_name text, required_by date, fulfilment text, status text, sent_at timestamptz, source text, items jsonb, received jsonb)
language sql stable security definer set search_path = public as $$
  select po.id, po.number, po.supplier_name, po.required_by, po.fulfilment, po.status, po.sent_at, po.source,
    coalesce((select jsonb_agg(jsonb_build_object('item', coalesce(it->>'item', it->>'description'), 'qty', it->>'qty', 'unit', it->>'unit', 'material_id', it->>'material_id')) from jsonb_array_elements(coalesce(po.items,'[]'::jsonb)) it), '[]'::jsonb),
    coalesce((select jsonb_object_agg(m.id::text, m.grn) from materials m where m.po_id = po.id and m.grn is not null), '{}'::jsonb)
  from purchase_orders po join sites s on s.id = po.site_id
  where po.site_id = p_site and s.org_id = my_org_id() and is_pm() and has_site_access(p_site) and coalesce(po.status,'') <> 'cancelled'
  order by po.created_at desc
$$;
-- 3. Delivery dates for the calendar: everyone on the job, no PO numbers or prices
create or replace function public.site_delivery_dates(p_site uuid, p_from date, p_to date)
returns table(po_id uuid, required_by date, supplier_name text, fulfilment text)
language sql stable security definer set search_path = public as $$
  select po.id, po.required_by, po.supplier_name, po.fulfilment
  from purchase_orders po join sites s on s.id = po.site_id
  where po.site_id = p_site and s.org_id = my_org_id() and has_site_access(p_site)
    and po.required_by between p_from and p_to and coalesce(po.status,'') not in ('cancelled')
$$;

-- 2. A delivery with a problem: flag the PO's supplier invoices and tell Finance
create or replace function public.fin_flag_grn_problem(p_material_id uuid, p_note text)
returns int language plpgsql security definer set search_path = public as $$
declare m record; po record; n int := 0; f record; v_name text;
begin
  select * into m from materials where id = p_material_id;
  if m.id is null or not has_site_access(m.site_id) then raise exception 'Not found'; end if;
  select name into v_name from profiles where id = auth.uid();
  if m.po_id is not null then
    select id, number, org_id into po from purchase_orders where id = m.po_id;
    update purchase_invoices set status = 'query',
      query_note = trim(both ' ;' from coalesce(query_note,'') || '; Delivery problem reported on site by ' || coalesce(v_name,'site') || ': ' || coalesce(nullif(trim(p_note),''),'see the goods received note'))
      where po_id = m.po_id and status in ('to_approve');
    get diagnostics n = row_count;
  end if;
  for f in select p.id from profiles p join sites s on s.org_id = p.org_id where s.id = m.site_id and p.finance_enabled loop
    insert into messages(org_id, site_id, sender_id, audience, kind, body, recipient_id, related_id)
    select s.org_id, m.site_id, auth.uid(), 'single', 'grn_problem',
      'Delivery problem: ' || coalesce(m.item,'item') || coalesce(' (PO ' || po.number || ')','') || ' — ' || coalesce(nullif(trim(p_note),''),'see the goods received note') ||
      case when n > 0 then ' · ' || n || ' supplier invoice' || case when n = 1 then '' else 's' end || ' put on query' else '' end,
      f.id, m.id
    from sites s where s.id = m.site_id;
  end loop;
  return n;
end $$;

-- 6. PM answers a query on a supplier invoice (they may not have Finance)
create or replace function public.fin_pi_query_reply(p_pi uuid, p_text text)
returns void language plpgsql security definer set search_path = public as $$
declare pi record; v_name text; f record;
begin
  select * into pi from purchase_invoices where id = p_pi;
  if pi.id is null or pi.org_id <> my_org_id() or not (is_pm() and has_site_access(pi.site_id)) then raise exception 'Not found'; end if;
  if coalesce(trim(p_text),'') = '' then raise exception 'Type a reply'; end if;
  select name into v_name from profiles where id = auth.uid();
  update purchase_invoices set query_thread = coalesce(query_thread,'[]'::jsonb) || jsonb_build_array(jsonb_build_object('by', auth.uid(), 'name', v_name, 'at', now(), 'text', left(p_text, 2000)))
    where id = p_pi;
  for f in select id from profiles where org_id = pi.org_id and finance_enabled and id <> auth.uid() loop
    insert into messages(org_id, site_id, sender_id, audience, kind, body, recipient_id, related_id)
    values (pi.org_id, pi.site_id, auth.uid(), 'single', 'pi_query_reply', coalesce(v_name,'The PM') || ' replied about ' || coalesce(pi.supplier_name,'a supplier') || ' invoice ' || coalesce(pi.invoice_no,'') || ': ' || left(p_text, 500), f.id, pi.id);
  end loop;
end $$;
-- the invoice and its query thread, for the PM
create or replace function public.fin_pi_query_view(p_pi uuid)
returns table(id uuid, site_id uuid, supplier_name text, invoice_no text, invoice_date date, net numeric, status text, query_note text, query_thread jsonb)
language sql stable security definer set search_path = public as $$
  select pi.id, pi.site_id, pi.supplier_name, pi.invoice_no, pi.invoice_date, pi.net, pi.status, pi.query_note, pi.query_thread
  from purchase_invoices pi where pi.id = p_pi and pi.org_id = my_org_id() and (is_finance() or (is_pm() and has_site_access(pi.site_id)))
$$;
revoke execute on function public.site_office_orders(uuid), public.site_delivery_dates(uuid,date,date), public.fin_flag_grn_problem(uuid,text), public.fin_pi_query_reply(uuid,text), public.fin_pi_query_view(uuid) from anon, public;
grant execute on function public.site_office_orders(uuid), public.site_delivery_dates(uuid,date,date), public.fin_flag_grn_problem(uuid,text), public.fin_pi_query_reply(uuid,text), public.fin_pi_query_view(uuid) to authenticated;

select 'Materials batch done' as result;
