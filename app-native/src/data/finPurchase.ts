// Purchase invoices and orders (904): adding one by hand (duplicate check,
// over-the-PO and nothing-received flags), approving / querying / rejecting,
// paid dates, and a PO's value and status. Posting bills to Xero is off
// during the Finance trial.
import { fdb, finInvoke, xeroAutoOk } from '@/data/finance';
import { money, round2, today } from '@/lib/rules/finance';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

type Row = Record<string, any>;
export async function loadPinv(id: string) {
  const i = (await fdb.from('purchase_invoices').select('*').eq('id', id).maybeSingle()).data as Row | null;
  const po = i?.po_id ? ((await fdb.from('purchase_orders').select('*').eq('id', i.po_id).maybeSingle()).data as Row | null) : null;
  return { i, po };
}
export async function duplicateOf(supplier: string, no: string): Promise<Row | null> {
  if (!no) return null;
  const d = ((await fdb.from('purchase_invoices').select('id,supplier_name,site_id,invoice_date').eq('invoice_no', no)).data as Row[] | null) ?? [];
  return d.find((x) => String(x.supplier_name || '').trim().toLowerCase() === supplier.trim().toLowerCase()) || null;
}
export async function addPinv(me: Profile, siteId: string, v: Row, file?: { uri: string; name: string; mimeType?: string | null } | null): Promise<{ id?: string; flags: string[]; error?: string }> {
  const flags: string[] = [];
  let po: Row | null = null;
  if (v.po_id) {
    po = (await fdb.from('purchase_orders').select('*').eq('id', v.po_id).maybeSingle()).data as Row | null;
    if (po) {
      const others = ((await fdb.from('purchase_invoices').select('net').eq('po_id', v.po_id).neq('status', 'rejected')).data as Row[] | null) ?? [];
      const sofar = others.reduce((t, i) => t + Number(i.net || 0), 0) + v.net;
      if (po.value != null && sofar > Number(po.value) + 0.005) flags.push(`${money(sofar - Number(po.value))} over the PO value of ${money(po.value)}`);
      const mats = (po.material_ids || []).length ? ((await fdb.from('materials').select('grn').in('id', po.material_ids)).data as Row[] | null) ?? [] : [];
      if (mats.length && !mats.some((m) => m.grn)) flags.push('nothing on this PO has been marked received yet');
      if (mats.some((m) => m.grn && m.grn.ok === false)) flags.push('a delivery on this PO was marked with a problem');
    }
  }
  const row: Row = {
    org_id: me.org_id, site_id: siteId, po_id: v.po_id || null, no_po: !v.po_id, kind: v.receipt ? 'receipt' : 'invoice', supplier_id: po?.supplier_id || null, supplier_name: v.supplier,
    invoice_no: v.invoice_no || null, invoice_date: v.invoice_date || today(), net: round2(v.net), vat: round2(v.vat || 0), total: v.total != null ? round2(v.total) : round2(v.net + (v.vat || 0)),
    due_date: v.due_date || null, description: v.description || null, cost_code: v.cost_code || 'materials', status: flags.length ? 'query' : 'to_approve', query_note: flags.length ? flags.join('; ') : null, created_by: me.id,
  };
  if (file) {
    const rid = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}`;
    const up = await supabase.storage.from('finance-docs').upload(`${me.org_id}/${siteId}/purchase/${rid}-${file.name.replace(/[^a-z0-9.-]+/gi, '_').slice(-80)}`, await (await fetch(file.uri)).arrayBuffer(), { contentType: file.mimeType || 'application/octet-stream' });
    if (!up.error) { row.file_path = up.data.path; row.file_name = file.name; }
  }
  const r = await fdb.from('purchase_invoices').insert(row as never).select('id').single();
  return r.error ? { flags, error: 'Could not save — try again.' } : { id: (r.data as Row).id, flags };
}
export async function setPinvStatus(me: Profile, id: string, status: string, note?: string): Promise<{ ok: boolean; xero: string | null }> {
  const patch: Row = { status };
  if (status === 'approved') { patch.approved_by = me.id; patch.approved_at = new Date().toISOString(); }
  if (status === 'query') patch.query_note = note || 'Query';
  const r = await fdb.from('purchase_invoices').update(patch as never).eq('id', id).select('po_id').single();
  if (r.error) return { ok: false, xero: null };
  const x = status === 'approved' && (await xeroAutoOk(me.org_id, 'purchase_invoices', id)) ? await finInvoke(me, 'xero', { action: 'post_bill', purchase_invoice_id: id }) : { error: null };
  return { ok: true, xero: x.error };
}
export const setPinvPaid = async (id: string, date: string | null) => !(await fdb.from('purchase_invoices').update({ paid_on: date } as never).eq('id', id)).error;
export const isInXero = async (table: string, id: string) => !!(((await fdb.from(table).select('xero_id').eq('id', id).maybeSingle()).data as Row | null)?.xero_id);

export async function loadPo(id: string) {
  const po = (await fdb.from('purchase_orders').select('*').eq('id', id).maybeSingle()).data as Row | null;
  if (!po) return null;
  const [pinvs, mats] = await Promise.all([
    fdb.from('purchase_invoices').select('*').eq('po_id', id).order('invoice_date'),
    (po.material_ids || []).length ? fdb.from('materials').select('id,item,qty,grn,status,cancel_reason').in('id', po.material_ids) : Promise.resolve({ data: [] }),
  ]);
  return { po, pinvs: (pinvs.data as Row[] | null) ?? [], mats: (mats.data as Row[] | null) ?? [] };
}
export async function savePoValue(po: Row, v: number | null): Promise<boolean> {
  const patch: Row = { value: v === null ? null : round2(v) };
  if (po.vat != null) { const ratio = po.value ? Number(po.vat) / Number(po.value) : 0.2; patch.vat = v === null ? null : round2(v * ratio); patch.total = v === null ? null : round2(v + patch.vat); }
  return !(await fdb.from('purchase_orders').update(patch as never).eq('id', po.id)).error;
}
export const setPoStatus = async (id: string, status: string) => !(await fdb.from('purchase_orders').update({ status } as never).eq('id', id)).error;

/* ---------- a PO's site requests (9219zr): cancel, reopen, remove lines ---------- */
type PoRow = { id: string; number?: string | null; status?: string; items?: Record<string, any>[] | null; material_ids?: string[] | null; value?: number | null; vat?: number | null };
const REQ_STATUSES = ['pending', 'sent', 'closed'];
const cancelReason = (n: string | null | undefined) => `Cancelled on PO ${n || ''} in Finance`;
async function cancelRequests(me: Profile, ids: string[], poNumber: string | null | undefined): Promise<number> {
  const clean = [...new Set(ids.filter(Boolean))]; if (!clean.length) return 0;
  const r = await fdb.from('materials').update({ status: 'cancelled', cancel_reason: cancelReason(poNumber), cancelled_by: me.id } as never).in('id', clean).neq('status', 'cancelled').select('id');
  return ((r.data as unknown[] | null) ?? []).length;
}
/** Cancel or reopen a PO. Cancelling also cancels its site requests (their status is kept on the PO lines);
 *  reopening puts back the ones that cancel did. Returns how many requests changed, or null if not saved. */
export async function setPoStatusWithRequests(me: Profile, id: string, status: 'cancelled' | 'open'): Promise<number | null> {
  const po = (await fdb.from('purchase_orders').select('id,number,status,items,material_ids').eq('id', id).maybeSingle()).data as PoRow | null;
  if (!po) return null;
  const ids = [...new Set((po.material_ids ?? []).filter(Boolean))];
  if (status === 'cancelled') {
    const was: Record<string, string> = {};
    if (ids.length) (((await fdb.from('materials').select('id,status').in('id', ids).neq('status', 'cancelled')).data as { id: string; status: string }[] | null) ?? []).forEach((m) => { if (REQ_STATUSES.includes(m.status)) was[m.id] = m.status; });
    const items = (po.items ?? []).map((l) => (l?.material_id && was[l.material_id] ? { ...l, was_status: was[l.material_id] } : l));
    if ((await fdb.from('purchase_orders').update({ status, items } as never).eq('id', id)).error) return null;
    return cancelRequests(me, ids, po.number);
  }
  if ((await fdb.from('purchase_orders').update({ status } as never).eq('id', id)).error) return null;
  if (!ids.length) return 0;
  const mine = (((await fdb.from('materials').select('id,cancel_reason').in('id', ids).eq('status', 'cancelled')).data as { id: string; cancel_reason: string | null }[] | null) ?? []).filter((m) => m.cancel_reason === cancelReason(po.number));
  const was: Record<string, string> = {}; (po.items ?? []).forEach((l) => { if (l?.material_id && REQ_STATUSES.includes(l.was_status)) was[l.material_id] = l.was_status; });
  let n = 0;
  for (const st of [...new Set(mine.map((m) => was[m.id] || 'sent'))]) {
    const r = await fdb.from('materials').update({ status: st, cancel_reason: null, cancelled_by: null } as never).in('id', mine.filter((m) => (was[m.id] || 'sent') === st).map((m) => m.id)).eq('status', 'cancelled').select('id');
    n += ((r.data as unknown[] | null) ?? []).length;
  }
  if (n && (po.items ?? []).some((l) => l?.was_status)) await fdb.from('purchase_orders').update({ items: (po.items ?? []).map((l) => { if (!l?.was_status) return l; const c = { ...l }; delete c.was_status; return c; }) } as never).eq('id', id);
  return n;
}
/** Take lines off an open PO: the value / VAT follow, and requests on removed lines are cancelled. */
export async function removePoLines(me: Profile, id: string, idx: number[]): Promise<{ error?: string; removed?: number; cancelled?: number }> {
  const po = (await fdb.from('purchase_orders').select('*').eq('id', id).maybeSingle()).data as PoRow | null;
  if (!po) return { error: 'Couldn’t load the PO — check your signal and try again.' };
  const items = po.items ?? [], drop = new Set(idx);
  if (drop.size >= items.length) return { error: 'To take every line off, cancel the PO instead.' };
  const keep = items.filter((_, i) => !drop.has(i)), gone = items.filter((_, i) => drop.has(i));
  const goneMats = gone.map((x) => x.material_id).filter(Boolean) as string[];
  const patch: Record<string, unknown> = { items: keep, material_ids: (po.material_ids ?? []).filter((m) => !goneMats.includes(m)) };
  const r2 = (n: number) => Math.round(n * 100) / 100;
  if (po.value != null) {
    const goneAmt = gone.reduce((t, x) => t + (x.amount != null ? Number(x.amount) || 0 : 0), 0);
    patch.value = r2(Math.max(0, Number(po.value) - goneAmt));
    if (po.vat != null) {
      const ratio = Number(po.value) ? Number(po.vat) / Number(po.value) : 0;
      const goneVat = gone.reduce((t, x) => t + (x.vat != null ? Number(x.vat) || 0 : x.amount != null ? (Number(x.amount) || 0) * ratio : 0), 0);
      patch.vat = r2(Math.max(0, Number(po.vat) - goneVat)); patch.total = r2((patch.value as number) + (patch.vat as number));
    }
  }
  if ((await fdb.from('purchase_orders').update(patch as never).eq('id', id)).error) return { error: 'Could not save — try again.' };
  return { removed: gone.length, cancelled: await cancelRequests(me, goneMats, po.number) };
}
