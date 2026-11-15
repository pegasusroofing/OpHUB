-- APPLIED 15 Nov 2026 (migration perf_fk_indexes_15nov). Record only; nothing to run.
-- Speed review, 15 Nov 2026: indexes on the look-up columns Supabase's adviser flagged as having none (company, project,
-- person, purchase order, invoice, quote and the like): 70 indexes, named idx_<table>_<column>. Every Finance / HR / Yard
-- read filters on these, and the row rules check them. Only adds indexes; nothing is changed or removed.
do $$
declare r record;
begin
  for r in
    select cl.relname as tbl, a.attname as col
    from pg_constraint c join pg_class cl on cl.oid = c.conrelid join pg_namespace n on n.oid = cl.relnamespace
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and n.nspname = 'public' and array_length(c.conkey, 1) = 1
      and a.attname in ('org_id', 'site_id', 'user_id', 'po_id', 'purchase_invoice_id', 'invoice_id', 'quote_id', 'line_manager_id', 'worker_id', 'supplier_id', 'material_id', 'from_site_id', 'to_site_id', 'alloc_site_id', 'folder_id')
      and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1])
    group by cl.relname, a.attname
  loop
    execute format('create index if not exists %I on public.%I (%I)', left('idx_' || r.tbl || '_' || r.col, 63), r.tbl, r.col);
  end loop;
end $$;
