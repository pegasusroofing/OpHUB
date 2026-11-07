-- ==========================================================================================
-- OpHUB: security tightening from the overnight review (6–7 Nov 2026).
-- RUN ON 7 Nov 2026 (Andy: "can you do the sql please"), all six sections, as migrations sec17a / sec17b / sec17cde.
-- Checked on Sandbox (rolled back): an emailed invoice stays waiting, a typed-in one still approves itself, the approver is
-- stamped as the person signed in, a calendar event edits normally but can't be moved to another company.
-- How to run: Supabase > SQL Editor > New query, paste ONE section (A to F) at a time, press Run.
-- Each section stands alone; run the ones you agree with. Nothing here deletes any data.
-- Sections that change an existing rule are marked "CHANGES A RULE" (they need your OK by CLAUDE.md).
-- After each one, try the thing it mentions in the app (Sandbox is fine) to be sure nothing else broke.
-- ==========================================================================================


-- ------------------------------------------------------------------------------------------
-- A. Emailed invoices don't approve themselves  (CHANGES A RULE — your call)
-- Today the "approves itself" rule (5 Nov) approves any new invoice with a job whose supplier NAME
-- matches one in your Directory. For an emailed invoice that name is read off the PDF, so a fake
-- invoice headed "Jewson Ltd" quoting a live site's postcode could approve itself with nobody looking.
-- After this, it only approves invoices a Finance person keys in by hand; emailed ones (and ones a PM
-- books to a job) always wait in Needs Checking for a person. The new app already asks a person on
-- every invoice it saves, so this mainly affects the old app and the inbox reader.
-- ------------------------------------------------------------------------------------------
begin;
create or replace function public.pinv_auto_approve() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from 'to_approve' or new.site_id is null or coalesce(new.kind, 'invoice') <> 'invoice' then return new; end if;
  -- Never for emailed invoices (stored under <org>/inbox/), the server's inbox reader (no signed-in person) or a PM's booking.
  if auth.uid() is null or not public.is_finance() or coalesce(new.file_path, '') like '%/inbox/%' then return new; end if;
  if coalesce((select fs.pi_auto_approve from public.fin_settings fs where fs.org_id = new.org_id), true) is not true then return new; end if;
  if not exists (select 1 from public.suppliers s where s.org_id = new.org_id
                  and (s.id = new.supplier_id
                       or (length(public.pinv_supplier_key(s.name)) > 2 and public.pinv_supplier_key(s.name) = public.pinv_supplier_key(new.supplier_name)))) then
    return new;
  end if;
  new.status := 'approved'; new.approved_at := now(); new.auto_approved := true;
  return new;
end $$;
revoke execute on function public.pinv_auto_approve() from public, anon, authenticated;
commit;


-- ------------------------------------------------------------------------------------------
-- B. Raising a PO can only cancel that job's own old PO  (CHANGES A RULE — a fix)
-- fin_raise_po cancels the old open PO of the materials being re-ordered. That step didn't check the
-- materials were on the same job, so a crafted request could cancel another company's open PO (it
-- would need that company's hidden ids). Also a supplier id from another company is ignored.
-- Everything else in the function is exactly as it is now.
-- ------------------------------------------------------------------------------------------
begin;
CREATE OR REPLACE FUNCTION public.fin_raise_po(p_site uuid, p_material_ids uuid[], p_supplier_id uuid, p_supplier_name text, p_branch text, p_required date, p_fulfilment text, p_note text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare me record; s record; on_ boolean; n integer; num text; v_po uuid; its jsonb; v_val numeric; v_est boolean; v_all boolean; v_sup text; v_sub uuid; v_subs int; v_nosub boolean;
begin
  select id, org_id, role, name, (finance_enabled and not coalesce(finance_hidden,false)) as finance_enabled into me from profiles where id = auth.uid();
  if me.id is null or me.role not in ('pm','admin') then return null; end if;
  select id, org_id, job_number into s from sites where id = p_site;
  if s.id is null or s.org_id <> me.org_id then return null; end if;
  -- (7 Nov 2026) a supplier id from another company is ignored
  if p_supplier_id is not null and not exists (select 1 from suppliers sp where sp.id = p_supplier_id and sp.org_id = me.org_id) then p_supplier_id := null; end if;
  select coalesce(fs.po_enabled, false) into on_ from fin_settings fs where fs.org_id = me.org_id;
  if not coalesce(on_, false) then return null; end if; -- trial: POs only when the company has switched purchase orders on
  v_sup := lower(btrim(coalesce((select sp.name from suppliers sp where sp.id = p_supplier_id), p_supplier_name, '')));
  with m as (
    select m.id, m.item, m.qty, m.created_at, fin_qty_num(m.qty) as q, coalesce(m.sub_site_id, m.repair_job_id) as sub, m.sub_site_label as sub_label,
      (select sp.rate from fin_shop_prices sp where sp.item_id = m.shop_item_id) as shop_rate,
      (select pb.rate from fin_price_book pb where pb.org_id = me.org_id and pb.supplier_key = v_sup and pb.item_key = fin_item_key(m.item) limit 1) as book_rate
    from materials m where m.id = any(p_material_ids) and m.site_id = p_site
  ), p as (
    select *, coalesce(shop_rate, book_rate) as rate, case when shop_rate is not null then 'list' when book_rate is not null then 'book' end as rate_src from m
  )
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('material_id', id, 'item', item, 'qty', qty, 'rate', rate, 'rate_source', rate_src,
           'amount', case when rate is not null and q is not null then round(rate*q, 2) end, 'sub_job_id', sub, 'sub_label', sub_label)) order by created_at), '[]'::jsonb),
         sum(case when rate is not null and q is not null then round(rate*q, 2) end),
         bool_or(rate_src = 'book'),
         bool_and(rate is not null and q is not null),
         count(distinct sub), bool_or(sub is null), (array_agg(sub) filter (where sub is not null))[1]
    into its, v_val, v_est, v_all, v_subs, v_nosub, v_sub from p;
  if jsonb_array_length(its) = 0 then return null; end if;
  perform pg_advisory_xact_lock(hashtext('po:' || p_site::text));
  -- (7 Nov 2026) only this job's materials, and only this company's POs
  update purchase_orders po set status = 'cancelled'
    where po.id in (select m.po_id from materials m where m.id = any(p_material_ids) and m.site_id = p_site and m.po_id is not null)
      and po.org_id = me.org_id
      and po.status = 'open'
      and not exists (select 1 from materials m2 where m2.po_id = po.id and not (m2.id = any(p_material_ids)));
  select coalesce(max(po.seq), 0) + 1 into n from purchase_orders po where po.site_id = p_site;
  num := coalesce(nullif(btrim(s.job_number), ''), 'JOB') || '-PO-' || lpad(n::text, 3, '0');
  while exists(select 1 from purchase_orders po where po.org_id = me.org_id and po.number = num) loop
    n := n + 1; num := coalesce(nullif(btrim(s.job_number), ''), 'JOB') || '-PO-' || lpad(n::text, 3, '0');
  end loop;
  insert into purchase_orders(org_id, site_id, number, seq, supplier_id, supplier_name, supplier_branch, items, material_ids, required_by, fulfilment, note, ordered_by, ordered_by_name, value, value_estimated, sub_job_id)
    values (me.org_id, p_site, num, n, p_supplier_id, p_supplier_name, p_branch, its,
            (select array_agg(m.id) from materials m where m.id = any(p_material_ids) and m.site_id = p_site),
            p_required, p_fulfilment, left(p_note, 500), me.id, me.name,
            case when v_val is not null and v_val > 0 then v_val end, coalesce(v_est, false) or not coalesce(v_all, false),
            case when v_subs = 1 and not coalesce(v_nosub, true) then v_sub end)
    returning id into v_po;
  update materials m set po_id = v_po, po_number = num where m.id = any(p_material_ids) and m.site_id = p_site;
  return json_build_object('id', v_po, 'number', num);
end $function$;
commit;


-- ------------------------------------------------------------------------------------------
-- C. Nobody can fake a "system" notice  (adds a rule)
-- Today anyone on staff could post a message dressed up as an "Invoice query", "Invoice query reply"
-- or "Delivery problem" (which then emails / pushes managers). These are made by the app's own server
-- steps, which this doesn't affect. After this, only Finance can send an "Invoice query" message.
-- Try after: Query To PM on an invoice (Finance), a PM replying, a delivery marked with a problem.
-- ------------------------------------------------------------------------------------------
begin;
drop policy if exists "notice kinds" on public.messages;
create policy "notice kinds" on public.messages as restrictive for insert to authenticated
  with check (coalesce(kind, '') not in ('pi_query_reply', 'grn_problem') and (coalesce(kind, '') <> 'pi_query' or public.is_finance()));
commit;


-- ------------------------------------------------------------------------------------------
-- D. Rows stay in your own company  (adds rules)
-- A PO's file record could be saved with another company's id on it, and a driver moving a delivery
-- event could move it onto any job. These stop that. Try after: Raise PO (files the PDF), a driver
-- moving a delivery.
-- ------------------------------------------------------------------------------------------
begin;
drop policy if exists "org is mine" on public.material_order_files;
create policy "org is mine" on public.material_order_files as restrictive for all to authenticated
  using (true) with check (org_id is null or org_id = public.my_org_id());
drop policy if exists "event stays in my company" on public.site_calendar_events;
create policy "event stays in my company" on public.site_calendar_events as restrictive for update to authenticated
  with check (public.site_in_my_org(site_id));
commit;


-- ------------------------------------------------------------------------------------------
-- E. "Approved by" is always the person who approved it  (adds a trigger)
-- The app fills in who approved an invoice; this makes the database fill it in instead, so it can't
-- be set to someone else.
-- ------------------------------------------------------------------------------------------
begin;
create or replace function public.pinv_stamp_approver() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') and auth.uid() is not null then
    new.approved_by := auth.uid();
    new.approved_at := coalesce(new.approved_at, now());
  end if;
  return new;
end $$;
revoke execute on function public.pinv_stamp_approver() from public, anon, authenticated;
drop trigger if exists zz_pinv_stamp_approver on public.purchase_invoices;
create trigger zz_pinv_stamp_approver before insert or update of status on public.purchase_invoices
  for each row execute function public.pinv_stamp_approver();
commit;


-- ------------------------------------------------------------------------------------------
-- F. Three look-ups need you to be signed in  (REVOKE — your call)
-- site_responsible_pm, site_id_of_permit and site_id_of_tbt answer even when nobody is signed in
-- (given an id). After this they need a sign-in. Try after: the login page, the join (invite) page,
-- and a permit / toolbox talk link.
-- ------------------------------------------------------------------------------------------
begin;
revoke execute on function public.site_responsible_pm(uuid), public.site_id_of_permit(uuid), public.site_id_of_tbt(uuid) from anon;
commit;


-- Checks (each should show 1 row once its section is run):
select 'A auto-approve skips emailed' as what, count(*) from pg_proc where proname = 'pinv_auto_approve' and pg_get_functiondef(oid) like '%/inbox/%'
union all select 'B PO cancel scoped', count(*) from pg_proc where proname = 'fin_raise_po' and pg_get_functiondef(oid) like '%po.org_id = me.org_id%'
union all select 'C notice kinds', count(*) from pg_policies where tablename = 'messages' and policyname = 'notice kinds'
union all select 'D org is mine', count(*) from pg_policies where tablename = 'material_order_files' and policyname = 'org is mine'
union all select 'E approver stamp', count(*) from pg_trigger where tgname = 'zz_pinv_stamp_approver';
