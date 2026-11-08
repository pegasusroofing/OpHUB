-- Projects does everything a PM needs; Finance is only the money (Andy, 8 Nov 2026), part 2.
-- Applied as migration "projects_orders_8nov". Additive only: new policies and new functions. Nothing the current app uses is changed.
--
-- 1. Client PO: a PM on the job reads and keeps the client's PO number, date and files (a client PO has no value; the contract
--    value stays in Finance). Files go where Finance keeps them (finance-docs/<org>/<site>/client-po/...), so both apps open them.
-- 2. Hired plant: a PM puts plant on hire and off hire. Finance adds the rate; Projects never sees it.
-- 3. Subcontract orders: a PM raises one (who and the scope) and marks it complete. Finance adds the value, CIS and retention.
-- 4. Supplier POs: a PM sees the job's POs without prices, changes the delivery date and note, takes lines off, or cancels it.
--    Not once it has invoices against it (then it's Finance's).

-- ---------- 1. client POs ----------
create policy "pm client_pos on their jobs" on public.client_pos for all to authenticated
  using (org_id = (select public.my_org_id()) and (select public.is_pm()) and public.has_site_access(site_id))
  with check (org_id = (select public.my_org_id()) and (select public.is_pm()) and public.has_site_access(site_id) and public.site_in_my_org(site_id));

create policy "pm reads client po files" on storage.objects for select to authenticated
  using (bucket_id = 'finance-docs' and (storage.foldername(name))[1] = (select public.my_org_id())::text and (storage.foldername(name))[3] = 'client-po'
    and (select public.is_pm()) and exists (select 1 from public.sites s where s.id::text = (storage.foldername(name))[2] and s.org_id = (select public.my_org_id()) and public.has_site_access(s.id)));

create policy "pm uploads client po files" on storage.objects for insert to authenticated
  with check (bucket_id = 'finance-docs' and (storage.foldername(name))[1] = (select public.my_org_id())::text and (storage.foldername(name))[3] = 'client-po'
    and (select public.is_pm()) and exists (select 1 from public.sites s where s.id::text = (storage.foldername(name))[2] and s.org_id = (select public.my_org_id()) and public.has_site_access(s.id)));

-- ---------- 2. hired plant ----------
create or replace function public.site_plant_hires(p_site uuid)
returns table(id uuid, item text, supplier_name text, hire_ref text, on_hire date, off_hire date, notes text, created_at timestamptz, costed boolean)
language sql stable security definer set search_path = public as $$
  select h.id, h.item, h.supplier_name, h.hire_ref, h.on_hire, h.off_hire, h.notes, h.created_at, (coalesce(h.rate, 0) <> 0 or h.po_id is not null)
  from fin_plant_hires h
  where h.site_id = p_site and h.org_id = my_org_id() and is_pm() and has_site_access(p_site)
  order by (h.off_hire is null) desc, h.on_hire desc, h.created_at desc;
$$;

create or replace function public.site_save_plant_hire(p_site uuid, p_id uuid, p_item text, p_supplier text, p_ref text, p_on date, p_off date, p_notes text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if not (is_pm() and site_in_my_org(p_site) and has_site_access(p_site)) then raise exception 'Only a manager on this job can do this.' using errcode = '42501'; end if;
  if coalesce(btrim(p_item), '') = '' then raise exception 'Say what''s on hire.' using errcode = 'P0001'; end if;
  if p_on is null then raise exception 'Enter the on-hire date.' using errcode = 'P0001'; end if;
  if p_off is not null and p_off < p_on then raise exception 'Off-hire can''t be before on-hire.' using errcode = 'P0001'; end if;
  if p_id is null then
    insert into fin_plant_hires(org_id, site_id, item, supplier_name, hire_ref, on_hire, off_hire, notes, created_by, rate, rate_period, cost_from)
    values (my_org_id(), p_site, left(btrim(p_item), 200), nullif(left(btrim(coalesce(p_supplier, '')), 200), ''), nullif(left(btrim(coalesce(p_ref, '')), 100), ''),
            p_on, p_off, nullif(left(btrim(coalesce(p_notes, '')), 1000), ''), auth.uid(), 0, 'week', 'rate')
    returning fin_plant_hires.id into v;
  else
    update fin_plant_hires h set item = left(btrim(p_item), 200), supplier_name = nullif(left(btrim(coalesce(p_supplier, '')), 200), ''),
      hire_ref = nullif(left(btrim(coalesce(p_ref, '')), 100), ''), on_hire = p_on, off_hire = p_off, notes = nullif(left(btrim(coalesce(p_notes, '')), 1000), '')
    where h.id = p_id and h.site_id = p_site and h.org_id = my_org_id()
    returning h.id into v;
    if v is null then raise exception 'That hire wasn''t found.' using errcode = 'P0001'; end if;
  end if;
  return v;
end $$;

-- Only one Finance hasn't costed yet (no rate, no PO).
create or replace function public.site_delete_plant_hire(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare h record;
begin
  select * into h from fin_plant_hires where id = p_id and org_id = my_org_id();
  if h.id is null or not (is_pm() and has_site_access(h.site_id)) then return false; end if;
  if coalesce(h.rate, 0) <> 0 or h.po_id is not null then raise exception 'Finance has costed this hire, so it can only be removed in Finance.' using errcode = 'P0001'; end if;
  delete from fin_plant_hires where id = p_id;
  return true;
end $$;

-- ---------- 3. subcontract orders ----------
create or replace function public.site_subcontracts(p_site uuid)
returns table(id uuid, number text, name text, email text, description text, status text, notes text, created_at timestamptz, worker_id uuid, valued boolean, source text)
language sql stable security definer set search_path = public as $$
  select c.id, c.number, c.name, c.email, c.description, c.status, c.notes, c.created_at, c.worker_id,
    (c.order_value is not null or exists (select 1 from fin_sub_apps a where a.subcontract_id = c.id)), c.source
  from fin_subcontracts c
  where c.site_id = p_site and c.org_id = my_org_id() and is_pm() and has_site_access(p_site)
  order by c.seq desc;
$$;

-- The company's subcontractors from Finance's labour list: names and emails only, never rates or bank details.
create or replace function public.site_sub_people()
returns table(id uuid, name text, email text)
language sql stable security definer set search_path = public as $$
  select w.id, coalesce(nullif(btrim(w.trading_name), ''), w.name), w.email
  from fin_labour_rates w
  where w.org_id = my_org_id() and is_pm() and w.user_id is null and coalesce(w.active, true)
  order by 2;
$$;

create or replace function public.site_save_subcontract(p_site uuid, p_id uuid, p_name text, p_email text, p_description text, p_notes text, p_status text, p_worker uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid; n integer; w record;
begin
  if not (is_pm() and site_in_my_org(p_site) and has_site_access(p_site)) then raise exception 'Only a manager on this job can do this.' using errcode = '42501'; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'Enter the subcontractor''s name.' using errcode = 'P0001'; end if;
  if p_status is not null and p_status not in ('active', 'complete') then p_status := null; end if;
  if p_id is null then
    if p_worker is not null then select * into w from fin_labour_rates where id = p_worker and org_id = my_org_id() and user_id is null; end if;
    perform pg_advisory_xact_lock(hashtext('sc:' || p_site::text));
    select coalesce(max(c.seq), 0) + 1 into n from fin_subcontracts c where c.site_id = p_site;
    insert into fin_subcontracts(org_id, site_id, seq, number, name, email, description, notes, status, worker_id, utr, cis_rate, vat_registered, created_by, source)
    values (my_org_id(), p_site, n, 'SC-' || lpad(n::text, 3, '0'), left(btrim(p_name), 200), nullif(left(btrim(coalesce(p_email, '')), 200), ''),
            nullif(left(btrim(coalesce(p_description, '')), 4000), ''), nullif(left(btrim(coalesce(p_notes, '')), 2000), ''), coalesce(p_status, 'active'),
            w.id, w.utr, coalesce(w.cis_rate, 20), coalesce(w.vat_registered, false), auth.uid(), 'projects')
    returning fin_subcontracts.id into v;
  else
    update fin_subcontracts c set name = left(btrim(p_name), 200), email = nullif(left(btrim(coalesce(p_email, '')), 200), ''),
      description = nullif(left(btrim(coalesce(p_description, '')), 4000), ''), notes = nullif(left(btrim(coalesce(p_notes, '')), 2000), ''),
      status = coalesce(p_status, c.status)
    where c.id = p_id and c.site_id = p_site and c.org_id = my_org_id()
    returning c.id into v;
    if v is null then raise exception 'That order wasn''t found.' using errcode = 'P0001'; end if;
  end if;
  return v;
end $$;

-- Only one Finance hasn't valued yet (no order value, no applications).
create or replace function public.site_delete_subcontract(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select * into c from fin_subcontracts where id = p_id and org_id = my_org_id();
  if c.id is null or not (is_pm() and has_site_access(c.site_id)) then return false; end if;
  if c.order_value is not null or exists (select 1 from fin_sub_apps a where a.subcontract_id = c.id) then
    raise exception 'Finance has valued this order, so it can only be removed in Finance.' using errcode = 'P0001'; end if;
  delete from fin_subcontracts where id = p_id;
  return true;
end $$;

-- ---------- 4. supplier POs, no prices ----------
create or replace function public.site_purchase_orders(p_site uuid)
returns table(id uuid, number text, supplier_name text, supplier_branch text, required_by date, fulfilment text, status text, sent_at timestamptz, source text,
              note text, ordered_by_name text, created_at timestamptz, items jsonb, received jsonb, invoiced boolean)
language sql stable security definer set search_path = public as $$
  select po.id, po.number, po.supplier_name, po.supplier_branch, po.required_by, po.fulfilment, po.status, po.sent_at, po.source, po.note, po.ordered_by_name, po.created_at,
    coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('item', coalesce(it->>'item', it->>'description'), 'qty', it->>'qty', 'unit', it->>'unit',
      'material_id', it->>'material_id', 'sub_label', it->>'sub_label')) order by o) from jsonb_array_elements(coalesce(po.items, '[]'::jsonb)) with ordinality t(it, o)), '[]'::jsonb),
    coalesce((select jsonb_object_agg(m.id::text, m.grn) from materials m where m.po_id = po.id and m.grn is not null), '{}'::jsonb),
    exists (select 1 from purchase_invoices pi where pi.po_id = po.id)
  from purchase_orders po join sites s on s.id = po.site_id
  where po.site_id = p_site and s.org_id = my_org_id() and po.org_id = my_org_id() and is_pm() and has_site_access(p_site)
  order by po.created_at desc;
$$;

-- Cancel an open PO with no invoices. Its requests are cancelled too, and what each was is kept on the PO line, as Finance does,
-- so reopening it in Finance puts them back.
create or replace function public.site_po_cancel(p_po uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare po record; n integer;
begin
  select * into po from purchase_orders where id = p_po and org_id = my_org_id() for update;
  if po.id is null or not (is_pm() and has_site_access(po.site_id)) then raise exception 'Only a manager on this job can do this.' using errcode = '42501'; end if;
  if po.status <> 'open' then raise exception 'Only an open PO can be cancelled.' using errcode = 'P0001'; end if;
  if exists (select 1 from purchase_invoices pi where pi.po_id = po.id) then raise exception 'This PO has invoices against it, so it can only be changed in Finance.' using errcode = 'P0001'; end if;
  update purchase_orders p set status = 'cancelled', items = coalesce((
      select jsonb_agg(case when m.id is not null then l || jsonb_build_object('was_status', m.status) else l end order by o)
      from jsonb_array_elements(coalesce(p.items, '[]'::jsonb)) with ordinality t(l, o)
      left join materials m on m.id::text = l->>'material_id' and m.status in ('pending', 'sent', 'closed')), '[]'::jsonb)
    where p.id = po.id;
  update materials m set status = 'cancelled', cancel_reason = 'Cancelled on PO ' || coalesce(po.number, '') || ' in Projects', cancelled_by = auth.uid()
    where m.id = any(coalesce(po.material_ids, '{}')) and m.status <> 'cancelled';
  get diagnostics n = row_count;
  return n;
end $$;

-- Change an open PO with no invoices: the delivery date, the note, and lines taken off (0-based). Value / VAT follow, as in Finance;
-- requests on lines taken off are cancelled (unlinked from the PO first, as the PO lock only lets Finance cancel a line on a live PO).
create or replace function public.site_po_amend(p_po uuid, p_drop integer[], p_required date, p_note text)
returns json language plpgsql security definer set search_path = public as $$
declare po record; keep jsonb; gone jsonb; gone_mats uuid[]; gone_amt numeric; gone_vat numeric; ratio numeric; v_val numeric; v_vat numeric; n integer := 0; bad text;
begin
  select * into po from purchase_orders where id = p_po and org_id = my_org_id() for update;
  if po.id is null or not (is_pm() and has_site_access(po.site_id)) then raise exception 'Only a manager on this job can do this.' using errcode = '42501'; end if;
  if po.status <> 'open' then raise exception 'Only an open PO can be changed.' using errcode = 'P0001'; end if;
  if exists (select 1 from purchase_invoices pi where pi.po_id = po.id) then raise exception 'This PO has invoices against it, so it can only be changed in Finance.' using errcode = 'P0001'; end if;
  if coalesce(array_length(p_drop, 1), 0) > 0 then
    select coalesce(jsonb_agg(l order by o) filter (where not ((o - 1)::int = any(p_drop))), '[]'::jsonb),
           coalesce(jsonb_agg(l order by o) filter (where (o - 1)::int = any(p_drop)), '[]'::jsonb)
      into keep, gone from jsonb_array_elements(coalesce(po.items, '[]'::jsonb)) with ordinality t(l, o);
    if jsonb_array_length(gone) = 0 then raise exception 'Those lines weren''t found — refresh and try again.' using errcode = 'P0001'; end if;
    if jsonb_array_length(keep) = 0 then raise exception 'To take every line off, cancel the PO instead.' using errcode = 'P0001'; end if;
    select array_agg(m.id), min(case when m.grn is not null then m.item end) into gone_mats, bad
      from materials m where m.id::text in (select g->>'material_id' from jsonb_array_elements(gone) g where g->>'material_id' is not null);
    if bad is not null then raise exception '"%" has been received, so it can''t be taken off.', bad using errcode = 'P0001'; end if;
    select coalesce(sum(nullif(g->>'amount', '')::numeric), 0) into gone_amt from jsonb_array_elements(gone) g;
    v_val := po.value; v_vat := po.vat;
    if po.value is not null then
      v_val := round(greatest(0, po.value - gone_amt), 2);
      if po.vat is not null then
        ratio := case when po.value <> 0 then po.vat / po.value else 0 end;
        select coalesce(sum(case when g->>'vat' is not null then nullif(g->>'vat', '')::numeric else coalesce(nullif(g->>'amount', '')::numeric, 0) * ratio end), 0) into gone_vat from jsonb_array_elements(gone) g;
        v_vat := round(greatest(0, po.vat - gone_vat), 2);
      end if;
    end if;
    update purchase_orders p set items = keep, material_ids = array(select x from unnest(coalesce(p.material_ids, '{}')) x where not (x = any(coalesce(gone_mats, '{}')))),
      value = v_val, vat = v_vat, total = case when v_val is not null and v_vat is not null then round(v_val + v_vat, 2) else p.total end
      where p.id = po.id;
    if gone_mats is not null then
      update materials m set po_id = null, po_number = null where m.id = any(gone_mats) and m.po_id = po.id;
      update materials m set status = 'cancelled', cancel_reason = 'Taken off PO ' || coalesce(po.number, '') || ' in Projects', cancelled_by = auth.uid()
        where m.id = any(gone_mats) and m.status <> 'cancelled';
      get diagnostics n = row_count;
    end if;
  end if;
  if p_required is not null then
    update purchase_orders p set required_by = p_required where p.id = po.id;
    update materials m set required_for_delivery = p_required where m.po_id = po.id and m.status <> 'cancelled';
  end if;
  if p_note is not null then update purchase_orders p set note = nullif(left(btrim(p_note), 1000), '') where p.id = po.id; end if;
  return json_build_object('removed', coalesce(jsonb_array_length(gone), 0), 'cancelled', n);
end $$;

revoke execute on function public.site_plant_hires(uuid), public.site_save_plant_hire(uuid, uuid, text, text, text, date, date, text), public.site_delete_plant_hire(uuid),
  public.site_subcontracts(uuid), public.site_sub_people(), public.site_save_subcontract(uuid, uuid, text, text, text, text, text, uuid), public.site_delete_subcontract(uuid),
  public.site_purchase_orders(uuid), public.site_po_cancel(uuid), public.site_po_amend(uuid, integer[], date, text) from public, anon;
grant execute on function public.site_plant_hires(uuid), public.site_save_plant_hire(uuid, uuid, text, text, text, date, date, text), public.site_delete_plant_hire(uuid),
  public.site_subcontracts(uuid), public.site_sub_people(), public.site_save_subcontract(uuid, uuid, text, text, text, text, text, uuid), public.site_delete_subcontract(uuid),
  public.site_purchase_orders(uuid), public.site_po_cancel(uuid), public.site_po_amend(uuid, integer[], date, text) to authenticated;

-- Fix, same day (migration "site_save_subcontract_fix_8nov"): a new order for someone not on the labour list (no p_worker)
-- failed ("record w is not assigned yet"). The worker's details now go into plain variables.
create or replace function public.site_save_subcontract(p_site uuid, p_id uuid, p_name text, p_email text, p_description text, p_notes text, p_status text, p_worker uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid; n integer; w_id uuid; w_utr text; w_cis integer; w_vat boolean;
begin
  if not (is_pm() and site_in_my_org(p_site) and has_site_access(p_site)) then raise exception 'Only a manager on this job can do this.' using errcode = '42501'; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'Enter the subcontractor''s name.' using errcode = 'P0001'; end if;
  if p_status is not null and p_status not in ('active', 'complete') then p_status := null; end if;
  if p_id is null then
    if p_worker is not null then
      select w.id, w.utr, w.cis_rate, w.vat_registered into w_id, w_utr, w_cis, w_vat from fin_labour_rates w where w.id = p_worker and w.org_id = my_org_id() and w.user_id is null;
    end if;
    perform pg_advisory_xact_lock(hashtext('sc:' || p_site::text));
    select coalesce(max(c.seq), 0) + 1 into n from fin_subcontracts c where c.site_id = p_site;
    insert into fin_subcontracts(org_id, site_id, seq, number, name, email, description, notes, status, worker_id, utr, cis_rate, vat_registered, created_by, source)
    values (my_org_id(), p_site, n, 'SC-' || lpad(n::text, 3, '0'), left(btrim(p_name), 200), nullif(left(btrim(coalesce(p_email, '')), 200), ''),
            nullif(left(btrim(coalesce(p_description, '')), 4000), ''), nullif(left(btrim(coalesce(p_notes, '')), 2000), ''), coalesce(p_status, 'active'),
            w_id, w_utr, coalesce(w_cis, 20), coalesce(w_vat, false), auth.uid(), 'projects')
    returning fin_subcontracts.id into v;
  else
    update fin_subcontracts c set name = left(btrim(p_name), 200), email = nullif(left(btrim(coalesce(p_email, '')), 200), ''),
      description = nullif(left(btrim(coalesce(p_description, '')), 4000), ''), notes = nullif(left(btrim(coalesce(p_notes, '')), 2000), ''),
      status = coalesce(p_status, c.status)
    where c.id = p_id and c.site_id = p_site and c.org_id = my_org_id()
    returning c.id into v;
    if v is null then raise exception 'That order wasn''t found.' using errcode = 'P0001'; end if;
  end if;
  return v;
end $$;
-- Checked on Sandbox in a transaction that was rolled back: a PM without Finance saves and reads a client PO, puts plant on and
-- off hire (can't read fin_plant_hires itself), raises orders with and without a labour-list link, sees POs without prices,
-- takes a line off (its request cancelled), cancels a PO (its requests cancelled); an operative sees none of it and can't save.
