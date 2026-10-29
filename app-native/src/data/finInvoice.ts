// Sales invoices (901): a new draft with the project's billing details,
// saving, issuing (the database hands out the next number, the PDF is kept
// with it), voiding, payments received, and the PDF. Posting to Xero and
// emailing the invoice are switched off while Finance is on trial.
import { fdb, finInvoke, loadSettings } from '@/data/finance';
import { buildInvoicePdf } from '@/lib/finInvoicePdf';
import { addDays, round2, today } from '@/lib/rules/finance';
import { cleanLines, invTotals, treatmentOf, type InvLine } from '@/lib/rules/finInvoice';
import { supabase } from '@/lib/supabase';
import type { Organization, Profile } from '@/lib/types';

type Row = Record<string, any>;
const rpc = supabase.rpc.bind(supabase) as unknown as (n: string, a: object) => Promise<{ data: unknown; error: { message: string } | null }>;

export async function newInvoice(me: Profile, site: Row): Promise<string | null> {
  const [st, jf, pos] = await Promise.all([
    loadSettings(me.org_id),
    fdb.from('job_finance').select('*').eq('site_id', site.id).maybeSingle(),
    fdb.from('client_pos').select('po_number').eq('site_id', site.id).order('is_primary', { ascending: false }).order('created_at').limit(1),
  ]);
  const j = (jf.data as Row | null) || {};
  const d = today(), due = j.due_days != null ? j.due_days : st.default_due_days;
  const r = await fdb.from('fin_invoices').insert({
    org_id: me.org_id, site_id: site.id, status: 'draft', issue_date: d, due_date: addDays(d, Number(due) || 30),
    client_po: ((pos.data as Row[] | null) || [])[0]?.po_number || null, bill_name: j.billing_name || site.client_name || null, bill_address: j.billing_address || null,
    bill_email: j.billing_email || site.client_email || null, vat_treatment: j.vat_treatment || st.default_vat || 'standard', lines: [{ description: '', amount: null }], created_by: me.id, source: 'manual',
  } as never).select('id').single();
  return (r.data as { id: string } | null)?.id ?? null;
}
export async function loadInvoice(id: string) {
  const [inv, pays] = await Promise.all([fdb.from('fin_invoices').select('*').eq('id', id).maybeSingle(), fdb.from('fin_payments').select('*').eq('invoice_id', id).order('paid_on')]);
  return { inv: inv.data as Row | null, pays: (pays.data as Row[] | null) ?? [] };
}
export function draftRow(d: Row) {
  const lines = cleanLines((d.lines || []) as InvLine[], d.vat_treatment, d.vat_rate);
  const t = invTotals(lines, d.vat_treatment, d.vat_rate);
  return { issue_date: d.issue_date || null, due_date: d.due_date || null, client_po: d.client_po || null, bill_name: d.bill_name || null, bill_address: d.bill_address || null, bill_email: String(d.bill_email || '').trim() || null, vat_treatment: lines.length ? treatmentOf(t) : d.vat_treatment || 'standard', lines, net: t.net, vat: t.vat, rc_vat: t.vatDue, total: t.total, notes: d.notes || null, xero_post: d.xero_post !== false, updated_at: new Date().toISOString() };
}
export async function saveDraft(id: string, d: Row): Promise<string | null> {
  const r = await fdb.from('fin_invoices').update(draftRow(d) as never).eq('id', id).eq('status', 'draft').select('id');
  if (r.error) return 'Could not save — try again.';
  return (r.data as unknown[] | null)?.length ? null : 'This draft no longer exists — it may have been deleted or issued.';
}
export const deleteDraft = async (id: string) => !(await fdb.from('fin_invoices').delete().eq('id', id).eq('status', 'draft')).error;
/** Stores the invoice PDF with it (finance-docs/<org>/<site>/invoices/…). */
export async function storePdf(me: Profile, org: Organization | null, inv: Row, site: Row | undefined): Promise<string | null> {
  const bytes = await buildInvoicePdf(inv, site, await loadSettings(me.org_id), org);
  const up = await supabase.storage.from('finance-docs').upload(`${me.org_id}/${inv.site_id}/invoices/${String(inv.number || inv.id).replace(/[^a-z0-9-]+/gi, '_')}-${Date.now()}.pdf`, bytes, { contentType: 'application/pdf' });
  if (up.error) return null;
  await fdb.from('fin_invoices').update({ pdf_path: up.data.path } as never).eq('id', inv.id);
  return up.data.path;
}
/** Gives a saved draft the next invoice number and marks it issued. */
export async function issue(me: Profile, org: Organization | null, id: string, site: Row | undefined): Promise<{ inv: Row | null; error: string | null; xero: string | null }> {
  const n = await rpc('fin_take_invoice_number', {});
  let number = n.data as unknown; if (Array.isArray(number)) number = number[0];
  if (n.error || !number || typeof number !== 'string') return { inv: null, error: 'Could not get an invoice number — try again. The invoice is still a draft.', xero: null };
  const r = await fdb.from('fin_invoices').update({ number, status: 'issued' } as never).eq('id', id).select('*').single();
  const inv = r.data as Row | null;
  if (!inv) return { inv: null, error: 'Could not issue — try again.', xero: null };
  await storePdf(me, org, inv, site);
  // Posting to Xero — blocked by the Finance trial for RTB.
  const x = inv.xero_post !== false ? await finInvoke(me, 'xero', { action: 'post_invoice', invoice_id: inv.id }) : { error: null };
  return { inv, error: null, xero: x.error };
}
export const voidInvoice = async (id: string) => !(await fdb.from('fin_invoices').update({ status: 'void', updated_at: new Date().toISOString() } as never).eq('id', id)).error;
export async function addPayment(me: Profile, invId: string, amount: number, paidOn: string, note: string): Promise<boolean> {
  return !(await fdb.from('fin_payments').insert({ org_id: me.org_id, invoice_id: invId, amount: round2(amount), paid_on: paidOn || today(), note: note || null, created_by: me.id } as never)).error;
}
export const deletePayment = async (id: string) => !(await fdb.from('fin_payments').delete().eq('id', id)).error;
