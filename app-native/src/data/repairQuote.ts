// Repair quotes (Andy, 7 Nov 2026): each contract's schedule of rates and set discount, the contract's VAT (from its
// Finance set-up, read through repair_contract_vat so the office and the client can see it), and saving / sending a
// job's quote. The quote's net total stays in repair_jobs.variation_cost, as the old app reads it.
import { useQuery } from '@tanstack/react-query';

import { patchRepairJob } from '@/data/repairs';
import { quoteTotals, type QuoteLine, type Rate } from '@/lib/rules/repairQuote';
import { supabase } from '@/lib/supabase';

type Row = Record<string, any>;
const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from>; rpc: (n: string, a: object) => Promise<{ data: unknown; error: unknown }> };

export function useRepairRates(siteId: string | undefined) {
  return useQuery({ queryKey: ['repairRates', siteId], enabled: !!siteId, queryFn: async () => ((await db.from('repair_rates').select('id,code,description,unit,rate,sort').eq('site_id', siteId as string).order('sort').order('code')).data as Rate[] | null) ?? [] });
}
/** The contract's set discount off the schedule of rates (%), and its VAT treatment. */
export function useContractQuoteSettings(siteId: string | undefined) {
  return useQuery({
    queryKey: ['repairQuoteSettings', siteId], enabled: !!siteId,
    queryFn: async () => {
      const [s, v] = await Promise.all([db.from('sites').select('repair_discount_pct').eq('id', siteId as string).maybeSingle(), db.rpc('repair_contract_vat', { p_site: siteId })]);
      return { discount: Number((s.data as Row | null)?.repair_discount_pct || 0), vat: (typeof v.data === 'string' ? v.data : null) as string | null };
    },
  });
}
export async function setContractDiscount(siteId: string, pct: number | null): Promise<boolean> {
  return !!(await db.from('sites').update({ repair_discount_pct: pct } as never).eq('id', siteId).select('id')).data?.length;
}
export async function saveRate(siteId: string, r: { id?: string; code: string | null; description: string; unit: string | null; rate: number }): Promise<boolean> {
  const row = { code: r.code || null, description: r.description.trim(), unit: r.unit || null, rate: Math.round(Number(r.rate || 0) * 100) / 100 };
  if (r.id) return !!(await db.from('repair_rates').update(row as never).eq('id', r.id).select('id')).data?.length;
  return !(await db.from('repair_rates').insert({ ...row, site_id: siteId } as never)).error;
}
export async function deleteRate(id: string): Promise<boolean> {
  return !!(await db.from('repair_rates').delete().eq('id', id).select('id')).data?.length;
}
/** Adds rates in bulk (from a spreadsheet), after the ones already there. */
export async function importRates(siteId: string, rows: { code: string | null; description: string; unit: string | null; rate: number }[], start: number): Promise<number> {
  let n = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200).map((r, k) => ({ site_id: siteId, code: r.code, description: r.description.slice(0, 500), unit: r.unit, rate: r.rate, sort: start + i + k }));
    if (!(await db.from('repair_rates').insert(chunk as never)).error) n += chunk.length;
  }
  return n;
}

/** Saves the quote on the job; send: also marks it sent to the client (it's then Awaiting Approval). */
export async function saveRepairQuote(job: Row, lines: QuoteLine[], discountPct: number, vat: string | null, send: boolean): Promise<boolean> {
  const t = quoteTotals(lines, discountPct, vat);
  const summary = lines.map((l) => `${l.code ? `${l.code} ` : ''}${l.description} × ${l.qty}`).join('\n');
  const patch: Row = { quote_lines: lines, quote_discount_pct: discountPct || null, variation_cost: t.net, priced_schedule_of_works: summary || null };
  if (send) {
    patch.variation_issued_at = new Date().toISOString();
    patch.completed_in_visit = job.completed_in_visit ?? false;
    if (!job.survey_required || job.survey_required === 'N') patch.survey_required = 'NA';
    patch.job_status = 'Surveyed - Variation Issued';
  }
  return patchRepairJob(job.id, patch);
}
