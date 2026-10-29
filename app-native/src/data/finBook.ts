// Loads the Finance "book" (911 finLoadBook): every finance record for one
// project (or the whole company), read once and used by the project page,
// the detailed summary, the costs ledger and reports. Plus saving a
// project's finance details and its client POs.
import { useQuery } from '@tanstack/react-query';

import { fdb, loadSettings, selectAll } from '@/data/finance';
import type { Book } from '@/lib/rules/finBook';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

type Row = Record<string, unknown>;
export async function loadBook(orgId: string, siteId: string | null): Promise<Book> {
  const f = (q: ReturnType<ReturnType<typeof fdb.from>['select']>) => (siteId ? q.eq('site_id', siteId) : q.eq('org_id', orgId));
  // Rows split across projects are fetched when another project's row has a share here.
  const fs = (q: ReturnType<ReturnType<typeof fdb.from>['select']>) => (siteId ? q.or(`site_id.eq.${siteId},split_sites.cs.{${siteId}}`) : q.eq('org_id', orgId));
  const [jf, invs, apps, pinvs, pos, cks, manual, hires, extra, budgets, vars, scs, sapps, rates, cpos, items, ops, people] = await Promise.all([
    selectAll<Row>('job_finance', '*', f), selectAll<Row>('fin_invoices', '*', (q) => f(q).neq('status', 'draft')), selectAll<Row>('fin_applications', '*', f),
    selectAll<Row>('purchase_invoices', '*', (q) => fs(q).neq('status', 'rejected')), selectAll<Row>('purchase_orders', '*', fs),
    selectAll<Row>('checkins', 'id,user_id,site_id,sub_site_id,ts,type', (q) => (siteId ? q.eq('site_id', siteId) : q).eq('type', 'in')),
    selectAll<Row>('fin_labour_manual', '*', f), selectAll<Row>('fin_plant_hires', '*', fs), selectAll<Row>('fin_job_costs', '*', fs),
    selectAll<Row>('fin_job_budgets', '*', f), selectAll<Row>('fin_variations', '*', f), selectAll<Row>('fin_subcontracts', '*', f), selectAll<Row>('fin_sub_apps', '*', f),
    selectAll<Row>('fin_labour_rates', '*', (q) => q.eq('org_id', orgId)), selectAll<Row>('client_pos', '*', f),
    selectAll<Row>('fin_contract_items', 'id,site_id,kind,value,cost,sub_job_id,position', f),
    selectAll<Row>('fin_sub_payments', '*', (q) => q.eq('org_id', orgId).is('sub_app_id', null).in('status', ['approved', 'paid'])),
    selectAll<{ id: string; name: string }>('profiles', 'id,name', (q) => q.eq('org_id', orgId)),
  ]);
  const rateMap: Record<string, Row> = {}, names: Record<string, string> = {};
  people.forEach((p) => { names[p.id] = p.name; });
  rates.forEach((r) => { if (r.user_id) rateMap[r.user_id as string] = r; else { rateMap[`w:${r.id}`] = r; names[`w:${r.id}`] = String(r.name || r.trading_name || 'Worker'); } });
  return { siteId, jf, invs: invs as never, apps: apps as never, pinvs, pos, cks, manual, hires, extra, budgets, vars, scs, sapps, rates: rateMap, cpos, items, ops, names };
}
export function useBook(orgId: string | null | undefined, siteId: string | null) {
  return useQuery({
    queryKey: ['finBook', orgId, siteId], enabled: !!orgId,
    queryFn: async () => { const [book, settings] = await Promise.all([loadBook(orgId as string, siteId), loadSettings(orgId as string)]); return { book, settings }; },
  });
}

/** Saves a project's finance details (job_finance, one row per project). */
export async function saveJobFinance(me: Profile, siteId: string, patch: Row): Promise<string | null> {
  const r = await fdb.from('job_finance').upsert({ ...patch, site_id: siteId, org_id: me.org_id, updated_at: new Date().toISOString(), updated_by: me.id, setup_checked_at: new Date().toISOString() } as never, { onConflict: 'site_id' });
  return r.error ? `Save failed — ${r.error.message}` : null;
}
export async function saveJobNumber(siteId: string, jobNo: string): Promise<boolean> {
  return !(await fdb.from('sites').update({ job_number: jobNo } as never).eq('id', siteId)).error;
}
/** Client PO add / edit; only one main PO per project. */
export async function saveClientPo(me: Profile, siteId: string, poId: string | null, row: { po_number: string; po_date: string | null; description: string | null; is_primary: boolean }, file?: { uri: string; name: string; mimeType?: string | null } | null): Promise<string | null> {
  const r0: Row = { ...row };
  if (file) {
    const prev = poId ? ((await fdb.from('client_pos').select('files,file_path,file_name').eq('id', poId).maybeSingle()).data as Row | null) : null;
    const files = (Array.isArray(prev?.files) ? (prev?.files as Row[]) : prev?.file_path ? [{ path: prev.file_path, name: prev.file_name }] : []).slice();
    const rid = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}`;
    const up = await supabase.storage.from('finance-docs').upload(`${me.org_id}/${siteId}/client-po/${rid}-${file.name.replace(/[^a-z0-9.-]+/gi, '_').slice(-80)}`, await (await fetch(file.uri)).arrayBuffer(), { contentType: file.mimeType || 'application/octet-stream' });
    if (up.error) return 'Upload failed — try again.';
    files.push({ path: up.data.path, name: file.name });
    Object.assign(r0, { files, file_path: files[0].path, file_name: files[0].name });
  }
  const res = poId ? await fdb.from('client_pos').update(r0 as never).eq('id', poId).select('id').single() : await fdb.from('client_pos').insert({ ...r0, org_id: me.org_id, site_id: siteId, created_by: me.id } as never).select('id').single();
  const id = (res.data as { id: string } | null)?.id;
  if (!id) return 'Could not save the PO.';
  if (row.is_primary) await fdb.from('client_pos').update({ is_primary: false } as never).eq('site_id', siteId).eq('is_primary', true).neq('id', id);
  return null;
}
export const deleteClientPo = async (id: string) => !(await fdb.from('client_pos').delete().eq('id', id)).error;

/** What's booked to a project in Finance (9219u finDeleteJob), so it isn't deleted with financial records
 *  on it. null = couldn't check (no signal) — then nothing is deleted. */
export async function finBookedOn(orgId: string, siteId: string): Promise<string[] | null> {
  const tabs: [string, string][] = [['fin_invoices', 'invoices'], ['fin_applications', 'applications'], ['purchase_orders', 'purchase orders'], ['purchase_invoices', 'purchase invoices'],
    ['fin_job_costs', 'costs'], ['fin_subcontracts', 'subcontracts'], ['fin_sub_apps', 'subcontract applications'], ['fin_sub_values', 'subcontract values'],
    ['fin_variations', 'variations'], ['fin_dayworks', 'day works'], ['fin_plant_hires', 'plant hire'], ['fin_job_budgets', 'budgets'],
    ['fin_contract_items', 'a bill of quantities'], ['fin_quotes', 'quotes'], ['fin_labour_manual', 'timesheets'],
    ['fin_inbox', 'emailed invoices'], ['yard_moves', 'yard stock moves'], ['wage_pushes', 'wages']];
  const db = fdb as unknown as { from: (t: string) => { select: (c: string) => { eq: (k: string, v: string) => { limit: (n: number) => PromiseLike<{ data: unknown[] | null; error: unknown }> }; contains: (k: string, v: unknown) => { eq: (k: string, v: string) => { limit: (n: number) => PromiseLike<{ data: unknown[] | null; error: unknown }> } } } } };
  const got = await Promise.all([
    ...tabs.map(([t]) => db.from(t).select('id').eq('site_id', siteId).limit(1)),
    db.from('fin_sub_payments').select('id').contains('lines', [{ site_id: siteId }]).eq('org_id', orgId).limit(1),
  ]);
  if (got.some((g) => g.error)) return null;
  return [...tabs.map(([, l]) => l), 'operative invoices'].filter((_, i) => (got[i].data ?? []).length);
}
