// A date range for each Finance figure card, chosen from its ⋯ (9219h finStatCardHtml).
// Remembered on this device per card.
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { askDate } from '@/components/DateField';
import { chooseAction } from '@/components/toast';
import { plainGet, plainSet } from '@/lib/kv';
import { fdate, today } from '@/lib/rules/finance';

type Chosen = { k: string; from?: string; to?: string };
export type StatPeriod = { k: string; from: string | null; to: string | null; label: string };

const PERIODS: [string, string][] = [['month', 'This month'], ['lastmonth', 'Last month'], ['quarter', 'This quarter'], ['year', 'This year'], ['all', 'All time'], ['custom', 'Pick dates…']];
const STORE = 'finStatP';

export function statPeriod(p: Chosen | undefined, def: string, now = today()): StatPeriod {
  const c = p || { k: def };
  const y = Number(now.slice(0, 4)), m = Number(now.slice(5, 7));
  const pad = (n: number) => String(n).padStart(2, '0');
  const last = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  if (c.k === 'month') return { k: c.k, from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(last(y, m))}`, label: 'this month' };
  if (c.k === 'lastmonth') { const yy = m === 1 ? y - 1 : y, mm = m === 1 ? 12 : m - 1; return { k: c.k, from: `${yy}-${pad(mm)}-01`, to: `${yy}-${pad(mm)}-${pad(last(yy, mm))}`, label: 'last month' }; }
  if (c.k === 'quarter') { const qm = Math.floor((m - 1) / 3) * 3 + 1; return { k: c.k, from: `${y}-${pad(qm)}-01`, to: `${y}-${pad(qm + 2)}-${pad(last(y, qm + 2))}`, label: 'this quarter' }; }
  if (c.k === 'year') return { k: c.k, from: `${y}-01-01`, to: `${y}-12-31`, label: 'this year' };
  if (c.k === 'custom' && c.from && c.to) return { k: c.k, from: c.from, to: c.to, label: `${fdate(c.from)} – ${fdate(c.to)}` };
  return { k: 'all', from: null, to: null, label: 'all time' };
}
export function inPeriod(d: string | null | undefined, r: StatPeriod): boolean {
  if (!r.from || !r.to) return true;
  const s = String(d || '').slice(0, 10);
  return !!s && s >= r.from && s <= r.to;
}

export function useStatPeriods() {
  const qc = useQueryClient();
  const { data: chosen = {} } = useQuery({ queryKey: [STORE], queryFn: () => plainGet<Record<string, Chosen>>(STORE, {}) });
  const period = (key: string, def: string) => statPeriod(chosen[key], def);
  const pick = async (key: string, def: string) => {
    const cur = period(key, def);
    const k = await chooseAction('Change dates', PERIODS.map(([key2, label]) => ({ key: key2, label: cur.k === key2 ? `✓ ${label}` : label })));
    if (!k) return;
    let next: Chosen = { k };
    if (k === 'custom') {
      const from = await askDate('From date'); if (!from) return;
      const to = await askDate('To date', { min: from }); if (!to) return;
      next = { k, from, to };
    }
    const all = { ...chosen, [key]: next };
    await plainSet(STORE, all); qc.setQueryData([STORE], all);
  };
  return { period, pick };
}
