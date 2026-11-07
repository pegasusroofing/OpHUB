// Repair quotes (Andy, 7 Nov 2026): each contract's schedule of rates (NHF or the client's own, by category and heading)
// and set discount, the contract's VAT (from its Finance set-up, read through repair_contract_vat so the office and the
// client can see it), and saving a job's quote with where it stands (not sent, awaiting approval, approved, rejected).
// The quote's net total stays in repair_jobs.variation_cost, as the old app reads it.
import { useQuery } from '@tanstack/react-query';

import { patchRepairJob } from '@/data/repairs';
import { quoteTotals, type QuoteLine, type Rate } from '@/lib/rules/repairQuote';
import { supabase } from '@/lib/supabase';

type Row = Record<string, any>;
const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from>; rpc: (n: string, a: object) => Promise<{ data: unknown; error: unknown }> };

export function useRepairRates(siteId: string | undefined) {
  return useQuery({ queryKey: ['repairRates', siteId], enabled: !!siteId, queryFn: async () => ((await db.from('repair_rates').select('id,code,description,unit,rate,sort,category,section,title,source').eq('site_id', siteId as string).order('sort').order('code')).data as Rate[] | null) ?? [] });
}
/** The contract's set discount off the schedule of rates (%), its VAT treatment, and whether it uses contract rates. */
export function useContractQuoteSettings(siteId: string | undefined) {
  return useQuery({
    queryKey: ['repairQuoteSettings', siteId], enabled: !!siteId,
    queryFn: async () => {
      const [s, v] = await Promise.all([db.from('sites').select('repair_discount_pct,repair_uses_rates,repair_rates_name').eq('id', siteId as string).maybeSingle(), db.rpc('repair_contract_vat', { p_site: siteId })]);
      const row = (s.data as Row | null) || {};
      return { discount: Number(row.repair_discount_pct || 0), vat: (typeof v.data === 'string' ? v.data : null) as string | null, usesRates: row.repair_uses_rates as boolean | null | undefined, ratesName: (row.repair_rates_name as string | null) || null };
    },
  });
}
export async function setContractDiscount(siteId: string, pct: number | null): Promise<boolean> {
  return !!(await db.from('sites').update({ repair_discount_pct: pct } as never).eq('id', siteId).select('id')).data?.length;
}
/** Finance set-up's "Contract Rates?" (Yes: a schedule of rates with a discount off it). */
export async function setContractRates(siteId: string, p: { uses?: boolean; pct?: number | null; name?: string | null }): Promise<boolean> {
  const patch: Row = {};
  if (p.uses !== undefined) patch.repair_uses_rates = p.uses;
  if (p.pct !== undefined) patch.repair_discount_pct = p.pct;
  if (p.name !== undefined) patch.repair_rates_name = p.name;
  return !!(await db.from('sites').update(patch as never).eq('id', siteId).select('id')).data?.length;
}
export async function saveRate(siteId: string, r: { id?: string; code: string | null; description: string; unit: string | null; rate: number }): Promise<boolean> {
  const row = { code: r.code || null, description: r.description.trim(), unit: r.unit || null, rate: Math.round(Number(r.rate || 0) * 100) / 100 };
  if (r.id) return !!(await db.from('repair_rates').update(row as never).eq('id', r.id).select('id')).data?.length;
  return !(await db.from('repair_rates').insert({ ...row, site_id: siteId } as never)).error;
}
export async function deleteRate(id: string): Promise<boolean> {
  return !!(await db.from('repair_rates').delete().eq('id', id).select('id')).data?.length;
}
type NewRate = { code: string | null; description: string; unit: string | null; rate: number; category?: string | null; section?: string | null; title?: string | null };
const rateKey = (r: { code?: string | null; title?: string | null; description: string; unit?: string | null; rate: number }) => `${r.code || ''}|${(r.title || r.description).slice(0, 80).toLowerCase()}|${r.unit || ''}|${Number(r.rate).toFixed(2)}`;
/** Adds rates in bulk (from a spreadsheet), after the ones already there; ones already on the contract are skipped.
 *  Returns how many were added and how many were already there. */
export async function importRates(siteId: string, rows: NewRate[], existing: Rate[], source?: string | null): Promise<{ added: number; skipped: number; failed: number }> {
  const have = new Set(existing.map(rateKey));
  const fresh = rows.filter((r) => { const k = rateKey(r); if (have.has(k)) return false; have.add(k); return true; });
  let added = 0, failed = 0;
  const start = existing.length;
  for (let i = 0; i < fresh.length; i += 200) {
    const chunk = fresh.slice(i, i + 200).map((r, k) => ({ site_id: siteId, code: r.code, description: r.description.slice(0, 500), unit: r.unit, rate: r.rate, category: r.category ?? null, section: r.section ?? null, title: r.title ?? null, source: source ?? null, sort: start + i + k }));
    if (!(await db.from('repair_rates').insert(chunk as never)).error) added += chunk.length; else failed += chunk.length;
  }
  return { added, skipped: rows.length - fresh.length, failed };
}

/** Where a quote stands when it's saved (Andy, 7 Nov 2026). */
export type QuoteStatus = 'draft' | 'awaiting' | 'approved' | 'rejected';
export const QUOTE_STATUS: [QuoteStatus, string][] = [['draft', 'Not Sent Yet'], ['awaiting', 'Awaiting Approval'], ['approved', 'Client Approved'], ['rejected', 'Client Rejected']];
export const quoteStatusOf = (job: Row): QuoteStatus => (job.quote_approved === true ? 'approved' : job.quote_approved === false ? 'rejected' : job.variation_issued_at ? 'awaiting' : 'draft');
/** Saves the quote on the job with where it stands. Sent to the client = Awaiting Approval. The old app's job_status
 *  is written alongside, as everywhere else. */
export async function saveRepairQuote(job: Row, lines: QuoteLine[], discountPct: number, vat: string | null, status: QuoteStatus, by?: string): Promise<boolean> {
  const t = quoteTotals(lines, discountPct, vat);
  const summary = lines.map((l) => `${l.code ? `${l.code} ` : ''}${l.description} × ${l.qty}`).join('\n');
  const patch: Row = { quote_lines: lines, quote_discount_pct: discountPct || null, variation_cost: t.net, priced_schedule_of_works: summary || null };
  const now = new Date().toISOString();
  if (status !== 'draft') {
    patch.variation_issued_at = status === 'awaiting' ? now : job.variation_issued_at || now;
    patch.completed_in_visit = job.completed_in_visit ?? false;
    if (!job.survey_required || job.survey_required === 'N') patch.survey_required = 'NA';
  }
  if (status === 'awaiting') { patch.quote_approved = null; patch.job_status = 'Surveyed - Variation Issued'; }
  if (status === 'approved') { patch.quote_approved = true; patch.quote_approved_at = job.quote_approved === true && job.quote_approved_at ? job.quote_approved_at : now; patch.approved_by = by || null; patch.self_authorized = false; if (job.quote_approved !== true) patch.job_status = 'Approved - To Do'; }
  if (status === 'rejected') { patch.quote_approved = false; patch.job_status = 'Rejected'; }
  return patchRepairJob(job.id, patch);
}
