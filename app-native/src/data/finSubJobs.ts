// A project's plots / addresses (multi-site) or repair jobs (repair contract), for booking costs to them
// (917 finSubJobsLoad), and the value of each for the Costs-by-plot report (918 finSubValues).
import { useQuery } from '@tanstack/react-query';

import { fdb, selectAll } from '@/data/finance';
import { isItem } from '@/lib/rules/finApp';
import { round2 } from '@/lib/rules/finance';
import type { Profile } from '@/lib/types';

type Row = Record<string, any>;
export type SubJob = { id: string; short: string; label: string; detail: string; value: number | null; status: string; closed: boolean };
type SiteLike = { id: string; multi_site?: boolean | null; repair_contract?: boolean | null } | null | undefined;

export const subKind = (s: SiteLike) => (!s ? '' : s.repair_contract ? 'repair' : s.multi_site ? 'multi' : '');
export const subNoun = (s: SiteLike, plural = false) => (subKind(s) === 'repair' ? (plural ? 'Repair jobs' : 'Repair job') : plural ? 'Plots & addresses' : 'Plot / address');

export async function loadSubJobs(s: SiteLike): Promise<SubJob[]> {
  const k = subKind(s);
  if (!s || !k) return [];
  if (k === 'repair') {
    const rows = await selectAll<Row>('repair_jobs', 'id,job_number,address,description,variation_cost,job_status,closed,created_at', (q) => q.eq('site_id', s.id).order('created_at'));
    return rows.map((r) => ({ id: r.id, short: r.job_number || String(r.address || '').split(',')[0] || 'Repair', label: [r.job_number, r.address].filter(Boolean).join(' — ') || 'Repair job', detail: r.description || '', value: r.variation_cost != null ? Number(r.variation_cost) : null, status: r.job_status || '', closed: !!r.closed }));
  }
  const rows = ((await fdb.from('site_sub_addresses').select('*').eq('site_id', s.id).order('name')).data as Row[] | null) || [];
  return rows.map((a) => ({ id: a.id, short: a.name || 'Address', label: a.name || 'Address', detail: [a.address, a.postcode].filter(Boolean).join(', '), value: null, status: '', closed: !!a.closed }));
}
export const useSubJobs = (s: SiteLike) => useQuery({ queryKey: ['finSubJobs', s?.id, subKind(s)], enabled: !!s && !!subKind(s), queryFn: () => loadSubJobs(s) });

/** Each plot's value: the Bill of Quantities by plot on an application job (headers put on a plot), otherwise
 *  the typed values (fin_sub_values), with a repair job's issued cost as the default. */
export async function subValues(siteId: string, subs: SubJob[], billing: string): Promise<{ values: Record<string, number>; source: 'schedule' | 'manual' }> {
  const out: Record<string, number> = {};
  if (billing === 'application') {
    const items = ((await fdb.from('fin_contract_items').select('id,kind,value,sub_job_id').eq('site_id', siteId).order('position')).data as Row[] | null) || [];
    if (items.some(isItem)) {
      // An item belongs to the plot set on it, or on the header (or sub-header) above it.
      let sec: string | null = null, sub: string | null = null;
      items.forEach((i) => {
        if (i.kind === 'section') { sec = i.sub_job_id || null; sub = null; return; }
        if (i.kind === 'subsection') { sub = i.sub_job_id || null; return; }
        const k = i.sub_job_id || sub || sec || ''; out[k] = round2((out[k] || 0) + Number(i.value || 0));
      });
      return { values: out, source: 'schedule' };
    }
  }
  subs.forEach((a) => { if (a.value != null) out[a.id] = a.value; });
  (((await fdb.from('fin_sub_values').select('sub_job_id,value').eq('site_id', siteId)).data as Row[] | null) || []).forEach((r) => { if (r.value != null) out[r.sub_job_id] = Number(r.value); });
  return { values: out, source: 'manual' };
}
export async function saveSubValue(me: Profile, siteId: string, subId: string, value: number | null): Promise<boolean> {
  return !(await fdb.from('fin_sub_values').upsert({ org_id: me.org_id, site_id: siteId, sub_job_id: subId, value, updated_by: me.id, updated_at: new Date().toISOString() } as never, { onConflict: 'site_id,sub_job_id' })).error;
}
