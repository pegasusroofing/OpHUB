// Book a cost to one works order or plot (Andy, 8 Nov 2026): pick from the project's costs not booked to one yet — purchase
// invoices, orders, plant hire and other costs — and it's booked to this one. A cost split across jobs, or labour from
// sign-ins, is changed on its own page instead.
import { chooseAction, confirmAsk } from '@/components/toast';
import { fdb } from '@/data/finance';
import type { CostLine } from '@/lib/rules/finBook';
import { money } from '@/lib/rules/finance';

const TABLE: Record<string, string> = { pi: 'purchase_invoices', po: 'purchase_orders', ph: 'fin_plant_hires', jc: 'fin_job_costs' };
/** The costs that can be booked from here: not booked to a job or plot yet, and one of the four kinds above. */
export const bookable = (lines: CostLine[]) => lines.filter((l) => !l.sub && l.share >= 0.9999 && !!TABLE[l.key.split(':')[0]]);

/** Asks which cost, then books it. Returns a line to show, or null if nothing changed. */
export async function bookCostTo(lines: CostLine[], subId: string, subName: string): Promise<string | null> {
  const list = bookable(lines).sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 40);
  if (!list.length) return 'Every cost on this project is already booked to a job or plot.';
  const k = await chooseAction(`Book To ${subName}`, list.map((l) => ({ key: l.key, label: `${l.desc}${l.who ? ` · ${l.who}` : ''} · ${money(l.net)}${l.cat === 'committed' ? ' (Ordered)' : ''}` })));
  const l = list.find((x) => x.key === k); if (!l) return null;
  if (!(await confirmAsk(`Book "${l.desc}" (${money(l.net)}) to ${subName}?`, 'Book It'))) return null;
  const [kind, rowId] = l.key.split(':');
  const r = await fdb.from(TABLE[kind]).update({ sub_job_id: subId } as never).eq('id', rowId).is('split', null).select('id');
  return (r.data as unknown[] | null)?.length ? null : 'That cost is split across jobs, so it’s changed on its own page.';
}
