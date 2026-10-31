// The ⋯ on each application and invoice row (9219q finRowMenu): open, export, return to draft,
// view the PDF, record a payment, delete or void, without opening the record first.
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';

import { viewDoc } from '@/components/DocViewer';
import { FinForm } from '@/components/FinForm';
import { chooseAction, confirmAsk, showAlert, useToast } from '@/components/toast';
import { appSowChoice, deleteApplicationAny, exportApplication, setStatus, type AppSow } from '@/data/finApp';
import { finInvoke } from '@/data/finance';
import { addPayment, deleteDraft, storePdf, voidInvoice } from '@/data/finInvoice';
import { openDocLink } from '@/data/hs';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { fdate, invOutstanding, num, today } from '@/lib/rules/finance';

type Row = Record<string, any>;

/** Whether to add the Schedule of Works as proof of works. undefined = they closed the question. */
export async function askAppSow(a: Row, kind: 'xlsx' | 'pdf'): Promise<AppSow | undefined> {
  const ch = await appSowChoice(a).catch(() => ({ has: false, since: null }));
  if (!ch.has) return null;
  const k = await chooseAction(`Include the Schedule of Works report as proof of works?${kind === 'pdf' ? ' It goes at the end of the PDF.' : ' It downloads as a PDF beside the Excel.'}`, [{ key: 'full', label: '📋 Yes — the whole Schedule of Works' }, ...(ch.since ? [{ key: 'since', label: `📷 Yes — photos since the last application (${fdate(ch.since.from)} – ${fdate(ch.since.to)})` }] : []), { key: 'no', label: 'No — just the application' }]);
  if (!k) return undefined;
  return k === 'full' ? { mode: 'full' } : k === 'since' && ch.since ? { mode: 'since', ...ch.since } : null;
}

export function useFinRowMenu(invs: Row[] = []) {
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: sites = [] } = useSites();
  const [pay, setPay] = useState<{ id: string; out: number } | null>(null);
  const refresh = () => ['finSales', 'finBook', 'finOverview'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));

  const viewPdf = async (inv: Row) => {
    if (!me) return;
    const p = inv.pdf_path || (await storePdf(me, org, inv, sites.find((s) => s.id === inv.site_id)));
    const u = p ? await openDocLink('finance-docs', p) : null;
    if (u) viewDoc(u); else toast('Could not build the PDF.');
  };

  const appMenu = async (a: Row, stageKey: string) => {
    if (!me) return;
    const k = await chooseAction(`Application ${a.number}`, [
      { key: 'open', label: 'Open' }, { key: 'xlsx', label: 'Export Excel' }, { key: 'pdf', label: 'Download PDF' },
      ...(stageKey === 'submitted' ? [{ key: 'draft', label: 'Return To Draft' }] : []),
      ...(a.invoice_id ? [{ key: 'inv', label: 'View Invoice' }] : []),
      { key: 'del', label: 'Delete Application' },
    ]);
    if (k === 'open') router.push(`/fin/job/${a.site_id}/application/${a.id}` as never);
    if (k === 'xlsx' || k === 'pdf') {
      const sow = await askAppSow(a, k); if (sow === undefined) return;
      if (!(await exportApplication(me, org, a, k, sow).catch(() => false))) toast(k === 'pdf' ? 'Could not make the PDF — try again.' : 'Could not make the Excel — try again.');
    }
    if (k === 'draft' && (await confirmAsk('Return this application to draft so you can edit it?', 'Return to draft'))) {
      if (await setStatus(a.id, { status: 'draft' })) { toast('Back to draft — you can edit it now'); refresh(); } else toast('Could not save — try again.');
    }
    if (k === 'inv') { const inv = invs.find((i) => i.id === a.invoice_id); if (inv) await viewPdf(inv); else toast('Could not find the invoice.'); }
    if (k === 'del') {
      // The checks come first, so nobody confirms a delete that can't happen.
      if (a.invoice_id) { showAlert('This application has an invoice — void the invoice first, then delete it.'); return; }
      if (!(await confirmAsk(`Delete application No. ${a.number}?${a.cert_net != null ? '\n\nIt has a certificate — that will be deleted too.' : ''}\n\nThis can’t be undone.`, 'Delete'))) return;
      const e = await deleteApplicationAny(a); if (e) { showAlert(e); return; }
      toast('Application deleted'); refresh();
    }
  };

  const invMenu = async (i: Row) => {
    if (!me) return;
    const out = invOutstanding(i as never);
    const k = await chooseAction(`Invoice ${i.number || 'draft'}`, [
      { key: 'open', label: 'Open' },
      ...(i.status !== 'draft' ? [{ key: 'pdf', label: 'View PDF' }] : []),
      ...(out > 0 ? [{ key: 'pay', label: 'Record Payment' }] : []),
      ...(i.status === 'draft' ? [{ key: 'del', label: 'Delete Draft' }] : i.status !== 'void' ? [{ key: 'void', label: 'Void Invoice' }] : []),
    ]);
    if (k === 'open') router.push(`/fin/job/${i.site_id}/invoice/${i.id}` as never);
    if (k === 'pdf') await viewPdf(i);
    if (k === 'pay') setPay({ id: i.id, out });
    if (k === 'del' && (await confirmAsk('Delete this draft invoice? This can’t be undone.', 'Delete'))) {
      if (await deleteDraft(i.id)) { toast('Draft deleted'); refresh(); } else toast('Could not delete.');
    }
    if (k === 'void' && (await confirmAsk(`Void invoice ${i.number || ''}? It stays on record as void, and any application or retention on it can be invoiced again.\n\nThis can’t be undone.`, 'Void invoice'))) {
      if (!(await voidInvoice(i.id))) { toast('Could not void — try again.'); return; }
      toast('Invoice voided'); refresh();
      // Already in Xero: void it there too (907 finXeroVoid) — during the Finance trial that's done by hand.
      if (i.xero_id) { const r = await finInvoke(me, 'xero', { action: 'push_invoice', id: i.id }); toast(r.error ? `Voided here — void it in Xero by hand (${r.error})` : 'Also voided in Xero'); }
    }
  };

  const form = pay && me ? (
    <FinForm title="Record payment" initial={{ amount: String(pay.out), paid_on: today() }} onClose={() => setPay(null)}
      fields={[{ k: 'amount', label: 'Amount received (£)', kind: 'money', half: true }, { k: 'paid_on', label: 'Date received', kind: 'date', half: true }, { k: 'note', label: 'Note (optional)', ph: 'e.g. BACS, remittance ref' }]}
      onSave={async (v) => { const a = num(v.amount); if (a === null || isNaN(a) || a <= 0) return 'Enter the amount received.'; if (!(await addPayment(me, pay.id, a, String(v.paid_on), String(v.note)))) return 'Could not save.'; toast('Payment recorded'); refresh(); return null; }} />
  ) : null;

  return { appMenu, invMenu, form };
}
