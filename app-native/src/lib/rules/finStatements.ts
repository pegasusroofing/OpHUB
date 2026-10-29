// Supplier statement reconciliation (9219l): matching each statement line to
// a purchase invoice — by invoice / credit-note number first, then a unique
// same-amount line within 10 days — keeping matches made by hand. Pure.
import { round2 } from './finance.ts';

export type SLine = { id: string; date?: string | null; ref?: string | null; type: string; amount: number; match?: string | null; how?: string | null; ignore?: boolean };
export type Cand = { id: string; kind: 'pi' | 'inbox'; site_id?: string; invoice_no: string; date: string | null; total: number; status: string };
export const STMT_TYPES: Record<string, string> = { invoice: 'Invoice', credit: 'Credit note', payment: 'Payment', other: 'Other' };
export const refKey = (s: unknown) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^(INVOICE|INV|CRN|CN|CR|SI)(?=\d)/, '').replace(/^0+/, '');
export const supKey = (s: unknown) => String(s || '').trim().toLowerCase().replace(/\b(ltd|limited|plc|llp|uk|the)\b/g, '').replace(/[^a-z0-9]/g, '');
/** Does a supplier name belong to this statement's supplier? */
export function sameSupplier(a: unknown, b: unknown) { const x = supKey(a), y = supKey(b); return !!x && !!y && (x === y || (y.length > 3 && x.includes(y)) || (x.length > 3 && y.includes(x))); }
export function autoMatch(lines: SLine[], cands: Cand[]): SLine[] {
  const out = lines.map((l) => ({ ...l }));
  const used = new Set(out.filter((l) => l.how === 'manual' && l.match && !l.ignore).map((l) => l.match as string));
  const days = (a: string, b: string) => Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 864e5);
  const sign = (n: number) => (Number(n) < 0 ? -1 : 1);
  const todo = out.filter((l) => !(l.how === 'manual' || l.ignore || l.type === 'payment'));
  todo.forEach((l) => { l.match = null; l.how = null; });
  todo.forEach((l) => {
    const rk = refKey(l.ref); if (rk.length < 3) return;
    const c = cands.find((x) => { if (used.has(x.id)) return false; const ck = refKey(x.invoice_no); if (!ck || sign(x.total) !== sign(l.amount)) return false; return ck === rk || (rk.length >= 5 && ck.length >= 4 && (ck.endsWith(rk) || rk.endsWith(ck))); });
    if (c) { l.match = c.id; l.how = 'auto'; used.add(c.id); }
  });
  todo.forEach((l) => {
    if (l.match) return;
    const same = cands.filter((x) => !used.has(x.id) && sign(x.total) === sign(l.amount) && Math.abs(Math.abs(x.total) - Math.abs(l.amount)) < 0.01 && (!l.date || !x.date || days(l.date, x.date) <= 10) && !(refKey(l.ref).length >= 3 && refKey(x.invoice_no).length >= 3));
    if (same.length === 1) { l.match = same[0].id; l.how = 'amount'; used.add(same[0].id); }
  });
  return out;
}
export function lineState(l: SLine, cands: Cand[]): { k: 'ignored' | 'payment' | 'missing' | 'diff' | 'ok'; label: string; diff?: number } {
  if (l.ignore) return { k: 'ignored', label: 'Ignored' };
  if (l.type === 'payment') return { k: 'payment', label: 'Payment' };
  const c = l.match ? cands.find((x) => x.id === l.match) : null;
  if (!c) return { k: 'missing', label: 'Not in OpHUB' };
  const diff = round2(Math.abs(l.amount) - Math.abs(c.total));
  if (Math.abs(diff) >= 0.01) return { k: 'diff', label: `£ differs ${diff}`, diff };
  return { k: 'ok', label: `Matched${l.how === 'manual' ? ' (by hand)' : l.how === 'amount' ? ' on amount — check' : ''}` };
}
