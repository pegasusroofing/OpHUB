// Sales invoices (901): a new draft with the project's billing details,
// saving, issuing (the database hands out the next number, the PDF is kept
// with it), voiding, payments received, and the PDF. Posting to Xero and
// emailing the invoice are switched off while Finance is on trial.
import { fdb, finInvoke, loadSettings, xeroAutoOk } from '@/data/finance';
import { buildInvoicePdf } from '@/lib/finInvoicePdf';
import { daysOr, addDays, fdate, FIN_TRIAL_MSG, finBlocked, money, round2, today } from '@/lib/rules/finance';
import { cleanLines, invTotals, treatmentOf, type InvLine, INV_VAT } from '@/lib/rules/finInvoice';
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
  // The client's VAT code from the Directory goes on the first line (9219n), e.g. reverse charge.
  const billName = String(j.billing_name || site.client_name || '').trim();
  const cl = billName ? ((await fdb.from('fin_clients').select('name,sales_vat').eq('org_id', me.org_id as string)).data as Row[] | null)?.find((c) => String(c.name || '').trim().toLowerCase() === billName.toLowerCase()) : null;
  const code = ({ '20': '20', '5': '5', rc20: 'rc20', rc5: 'rc5', '0': '0', ex: 'ex', none: 'ex' } as Record<string, string>)[String(cl?.sales_vat || '')];
  const firstLine = code && INV_VAT[code] ? { description: '', amount: null, vat: code } : { description: '', amount: null };
  const d = today(), due = j.due_days != null ? j.due_days : st.default_due_days;
  const r = await fdb.from('fin_invoices').insert({
    org_id: me.org_id, site_id: site.id, status: 'draft', issue_date: d, due_date: addDays(d, daysOr(due, 30)),
    client_po: ((pos.data as Row[] | null) || [])[0]?.po_number || null, bill_name: j.billing_name || site.client_name || null, bill_address: j.billing_address || null,
    bill_email: j.billing_email || site.client_email || null, vat_treatment: j.vat_treatment || st.default_vat || 'standard', lines: [firstLine], created_by: me.id, source: 'manual',
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
/** Changes the lines of an issued invoice, here only: nothing is re-posted to Xero. The stored PDF is dropped so the next one shows the change. */
export async function saveIssuedLines(id: string, d: Row): Promise<string | null> {
  const x = draftRow(d);
  const r = await fdb.from('fin_invoices').update({ lines: x.lines, net: x.net, vat: x.vat, rc_vat: x.rc_vat, total: x.total, vat_treatment: x.vat_treatment, pdf_path: null } as never).eq('id', id).neq('status', 'draft').neq('status', 'void').select('id');
  if (r.error) return 'Could not save — try again.';
  return (r.data as unknown[] | null)?.length ? null : 'This invoice can’t be changed any more.';
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
  const x = (await xeroAutoOk(me.org_id, 'fin_invoices', inv.id)) ? await finInvoke(me, 'xero', { action: 'push_invoice', id: inv.id }) : { error: null };
  return { inv, error: null, xero: x.error };
}
/** Emails an issued invoice's PDF (Andy, 3 Nov 2026) with the wording from the send pop-up, through send-finance-email;
 *  notes who it went to. During the Finance trial only the Sandbox company sends. Gives the problem, or null when sent. */
export async function emailInvoice(me: Profile, org: Organization | null, inv: Row, site: Row | undefined, to: string[], cc: string[], words: { subject: string; body: string; logos: string[]; hideLogo: boolean }): Promise<string | null> {
  if (finBlocked('send-finance-email', undefined, me.org_id)) return FIN_TRIAL_MSG;
  const pdf = inv.pdf_path || (await storePdf(me, org, inv, site));
  if (!pdf) return 'Could not make the PDF — try again.';
  const r = await finInvoke(me, 'send-finance-email', { kind: 'invoice', site_id: inv.site_id, storage_path: pdf, filename: `${String(inv.number || 'Invoice').replace(/[^a-z0-9-]+/gi, '_')}.pdf`, recipients: to, cc, reference: inv.number || '', client_po: inv.client_po || '', amount: money(inv.total), due: inv.due_date ? fdate(inv.due_date) : '', subject: words.subject, body_text: words.body, logos: words.logos, hide_logo: words.hideLogo });
  if (r.error) return r.error;
  await fdb.from('fin_invoices').update({ sent_at: new Date().toISOString(), sent_to: to.join(', ') } as never).eq('id', inv.id);
  return null;
}
export const voidInvoice = async (id: string) => !!(await fdb.from('fin_invoices').update({ status: 'void', updated_at: new Date().toISOString() } as never).eq('id', id).select('id')).data?.length;
export async function addPayment(me: Profile, invId: string, amount: number, paidOn: string, note: string): Promise<boolean> {
  return !(await fdb.from('fin_payments').insert({ org_id: me.org_id, invoice_id: invId, amount: round2(amount), paid_on: paidOn || today(), note: note || null, created_by: me.id } as never)).error;
}
export const deletePayment = async (id: string) => !!(await fdb.from('fin_payments').delete().eq('id', id).select('id')).data?.length;
