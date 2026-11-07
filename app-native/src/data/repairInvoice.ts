// Invoicing repair jobs from Finance (Andy, 7 Nov 2026): one job, or several done jobs on one invoice. A draft sales
// invoice on the contract with a line per job (works order, address, the repair, the quoted value); the jobs remember
// the invoice, and the invoice the job (one job: its plot / repair job for the figures). Issuing it ticks the jobs
// Invoiced; it's Paid when the invoice is.
import { fdb } from '@/data/finance';
import { newInvoice } from '@/data/finInvoice';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

type Row = Record<string, any>;
const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

export const repairLineText = (j: Row) => `${j.job_number ? `${j.job_number} — ` : ''}${j.address || 'Repair'}${j.repair_description || j.description ? `: ${j.repair_description || j.description}` : ''}`.slice(0, 500);

export async function raiseRepairInvoice(me: Profile, site: Row, jobs: Row[]): Promise<string | null> {
  if (!jobs.length) return null;
  const id = await newInvoice(me, site);
  if (!id) return null;
  const draft = (await fdb.from('fin_invoices').select('lines').eq('id', id).maybeSingle()).data as Row | null;
  const vat = ((draft?.lines as Row[] | null) || [])[0]?.vat; // the client's VAT code, if the Directory has one
  // Each job's line, then any no access visits at the contract's no access charge (Finance › Project Admin).
  const charge = Number(site.repair_no_access_charge || 0);
  const lines = jobs.flatMap((j) => [
    { description: repairLineText(j), amount: j.variation_cost != null ? Number(j.variation_cost) : null, ...(vat ? { vat } : {}) },
    ...(charge > 0 ? (Array.isArray(j.no_access) ? (j.no_access as Row[]) : []).map((v) => ({ description: `${j.job_number ? `${j.job_number} — ` : ''}${j.address || 'Repair'}: no access visit ${new Date(String(v.at)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`.slice(0, 500), amount: charge, ...(vat ? { vat } : {}) })) : []),
  ]);
  await fdb.from('fin_invoices').update({ lines, ...(jobs.length === 1 ? { sub_job_id: jobs[0].id } : {}) } as never).eq('id', id);
  await db.from('repair_jobs').update({ invoice_id: id } as never).in('id', jobs.map((j) => j.id));
  return id;
}

/** After an invoice is issued: its repair jobs are Invoiced (the old app's tick too). */
export async function markRepairsInvoiced(invoiceId: string): Promise<void> {
  try { await db.from('repair_jobs').update({ invoiced: true } as never).eq('invoice_id', invoiceId); } catch { /* the stage still shows from the invoice */ }
}
