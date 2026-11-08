// Projects does everything a PM needs; Finance is only the money (Andy, 8 Nov 2026), part 2. A manager on the job keeps,
// in Projects and without Finance: the client's PO (number, date, files — a client PO has no value), hired plant on and off
// hire (Finance adds the rate), subcontract orders (who and the scope; Finance adds the value), and the job's supplier POs
// without prices (change the delivery date or note, take lines off, cancel). The money stays in Finance. Database:
// docs/claude-code/sql/projects-orders-8nov.sql.
import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

const rpc = supabase.rpc.bind(supabase) as unknown as (n: string, a?: object) => Promise<{ data: unknown; error: { message?: string } | null }>;
const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
/** The database's own words when it refuses (they're written for people), else a plain line. */
const why = (e: { message?: string } | null, fallback: string) => (e?.message && !/^(new row|permission|JWT|violates|duplicate)/i.test(e.message) && e.message.length < 200 ? e.message : fallback);

/* ---------- the client's PO ---------- */
export type ClientPo = { id: string; po_number: string; po_date: string | null; description: string | null; is_primary: boolean; files: { path: string; name: string }[]; file_path?: string | null; file_name?: string | null; created_at: string };
export const poFiles = (p: ClientPo) => (Array.isArray(p.files) && p.files.length ? p.files : p.file_path ? [{ path: p.file_path, name: p.file_name || 'PO' }] : []);
export const useSiteClientPos = (siteId: string | undefined) => useQuery({
  queryKey: ['siteClientPos', siteId], enabled: !!siteId,
  queryFn: async () => (((await db.from('client_pos').select('id,po_number,po_date,description,is_primary,files,file_path,file_name,created_at').eq('site_id', siteId as string).order('is_primary', { ascending: false }).order('created_at')).data as ClientPo[] | null) ?? []),
});

/* ---------- hired plant ---------- */
export type PlantHire = { id: string; item: string; supplier_name: string | null; hire_ref: string | null; on_hire: string; off_hire: string | null; notes: string | null; created_at: string; costed: boolean };
export const usePlantHires = (siteId: string | undefined, enabled = true) => useQuery({
  queryKey: ['sitePlantHires', siteId], enabled: !!siteId && enabled,
  queryFn: async () => (((await rpc('site_plant_hires', { p_site: siteId })).data as PlantHire[] | null) ?? []),
});
export async function savePlantHire(siteId: string, id: string | null, v: { item: string; supplier: string; ref: string; on: string; off: string; notes: string }): Promise<string | null> {
  const r = await rpc('site_save_plant_hire', { p_site: siteId, p_id: id, p_item: v.item, p_supplier: v.supplier, p_ref: v.ref, p_on: v.on || null, p_off: v.off || null, p_notes: v.notes });
  return r.error ? why(r.error, 'Could not save — try again.') : null;
}
export async function deletePlantHire(id: string): Promise<string | null> {
  const r = await rpc('site_delete_plant_hire', { p_id: id });
  return r.error ? why(r.error, 'Could not remove — try again.') : r.data === true ? null : 'Could not remove — try again.';
}

/* ---------- subcontract orders ---------- */
export type SubOrder = { id: string; number: string; name: string; email: string | null; description: string | null; status: string; notes: string | null; created_at: string; worker_id: string | null; valued: boolean; source: string | null };
export const useSubOrders = (siteId: string | undefined) => useQuery({
  queryKey: ['siteSubOrders', siteId], enabled: !!siteId,
  queryFn: async () => (((await rpc('site_subcontracts', { p_site: siteId })).data as SubOrder[] | null) ?? []),
});
/** The company's subcontractors from Finance's labour list: names and emails only. */
export const useSubPeople = (enabled: boolean) => useQuery({
  queryKey: ['siteSubPeople'], enabled, staleTime: 300000,
  queryFn: async () => (((await rpc('site_sub_people')).data as { id: string; name: string; email: string | null }[] | null) ?? []),
});
export async function saveSubOrder(siteId: string, id: string | null, v: { name: string; email: string; description: string; notes: string; status?: string; worker?: string | null }): Promise<string | null> {
  const r = await rpc('site_save_subcontract', { p_site: siteId, p_id: id, p_name: v.name, p_email: v.email, p_description: v.description, p_notes: v.notes, p_status: v.status || null, p_worker: v.worker || null });
  return r.error ? why(r.error, 'Could not save — try again.') : null;
}
export async function deleteSubOrder(id: string): Promise<string | null> {
  const r = await rpc('site_delete_subcontract', { p_id: id });
  return r.error ? why(r.error, 'Could not remove — try again.') : r.data === true ? null : 'Could not remove — try again.';
}

/* ---------- supplier POs, no prices ---------- */
export type SitePoLine = { item: string | null; qty: string | null; unit?: string | null; material_id?: string | null; sub_label?: string | null };
export type SitePo = { id: string; number: string; supplier_name: string | null; supplier_branch: string | null; required_by: string | null; fulfilment: string | null; status: string; sent_at: string | null; source: string | null; note: string | null; ordered_by_name: string | null; created_at: string; items: SitePoLine[]; received: Record<string, unknown>; invoiced: boolean };
export const useSitePos = (siteId: string | undefined) => useQuery({
  queryKey: ['sitePos', siteId], enabled: !!siteId,
  queryFn: async () => (((await rpc('site_purchase_orders', { p_site: siteId })).data as SitePo[] | null) ?? []),
});
/** Can it be changed here? Open, and nothing invoiced against it (then it's Finance's). */
export const poChangeable = (p: SitePo) => p.status === 'open' && !p.invoiced;
export const PO_STATUS: Record<string, string> = { open: 'Open', invoiced: 'Invoiced', cancelled: 'Cancelled', closed: 'Closed' };
export async function cancelSitePo(id: string): Promise<{ error?: string; cancelled?: number }> {
  const r = await rpc('site_po_cancel', { p_po: id });
  return r.error ? { error: why(r.error, 'Could not cancel — try again.') } : { cancelled: Number(r.data || 0) };
}
export async function amendSitePo(id: string, change: { drop?: number[]; required?: string | null; note?: string | null }): Promise<{ error?: string; removed?: number; cancelled?: number }> {
  const r = await rpc('site_po_amend', { p_po: id, p_drop: change.drop?.length ? change.drop : null, p_required: change.required || null, p_note: change.note ?? null });
  if (r.error) return { error: why(r.error, 'Could not save — try again.') };
  const d = r.data as { removed?: number; cancelled?: number } | null;
  return { removed: d?.removed ?? 0, cancelled: d?.cancelled ?? 0 };
}
