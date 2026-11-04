// Quote tracker rules: statuses, the chaser's dates, reports by customer / discipline / who priced it, and reading
// Andy's Tender Tracker.xlsm. No app or database code here, so it can be tested on its own.
export const QUOTE_STATUS = [
  { key: 'pricing', label: 'Pricing' }, { key: 'awaiting', label: 'Awaiting more information' }, { key: 'checking', label: 'Ready for checking' }, { key: 'returned', label: 'Returned' },
  { key: 'negotiating', label: 'Tender stage' }, { key: 'won', label: 'Won' }, { key: 'lost', label: 'Lost' },
  { key: 'no_reply', label: 'No reply' }, { key: 'declined', label: 'Declined' },
] as const;
export type QuoteStatus = (typeof QUOTE_STATUS)[number]['key'];
export const statusLabel = (s: string) => QUOTE_STATUS.find((x) => x.key === s)?.label ?? s;
export const isClosed = (s: string) => ['won', 'lost', 'no_reply', 'declined'].includes(s);
export const DISCIPLINES = ['Flat Roofing', 'Pitched Roofing', 'Mixed', 'Repairs', 'NHF Rates', 'Other'];

export type QuoteRow = {
  client_name: string; title: string; discipline: string | null; value: number | null; status: string; return_date: string | null;
  priced_by_name: string | null; completed_at: string | null; chase_on: boolean; next_chase_date: string | null;
};
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** What changes with the status. The chaser only runs on a returned quote: tender stage and closed quotes switch it off. */
export function statusPatch(to: string, q: { chase_on: boolean; return_date: string | null; returned_at?: string | null }, today: string, firstDays: number): Record<string, unknown> {
  const p: Record<string, unknown> = { status: to, completed_at: isClosed(to) ? today : null };
  if (to === 'returned') {
    const from = q.return_date && q.return_date > today ? q.return_date : (q.returned_at || today);
    p.returned_at = q.returned_at || today;
    p.next_chase_date = q.chase_on ? addDays(from, firstDays) : null;
  } else p.next_chase_date = null;
  if (to === 'negotiating' || isClosed(to)) p.chase_on = false;
  return p;
}

/** One row per client a quote went to (Andy, 4 Nov 2026): the main client, then the others tendering the same job. A won
 *  quote is won for the client it was won from (the main one) and not won for the rest; otherwise they share its outcome. */
export function perClient<T extends QuoteRow & { others?: { client_name: string }[] }>(rows: T[]): T[] {
  const out: T[] = [];
  for (const r of rows) {
    out.push(r);
    for (const o of r.others ?? []) out.push({ ...r, client_name: o.client_name, status: r.status === 'won' ? 'lost' : r.status });
  }
  return out;
}
/** Every client on a quote, main first. */
export const clientNames = (r: { client_name: string; others?: { client_name: string }[] }) => [r.client_name, ...(r.others ?? []).map((o) => o.client_name)];

export type Group = { key: string; count: number; value: number; won: number; lost: number; wonValue: number; rate: number | null };
export type GroupBy = 'client_name' | 'discipline' | 'priced_by_name' | 'year' | 'status';
/** Figures per customer, discipline, person or year. Win rate is won out of won + lost: quotes still live don't count against it. */
export function groupQuotes(rows: QuoteRow[], by: GroupBy): Group[] {
  const m = new Map<string, Group>();
  for (const r of rows) {
    const key = by === 'year' ? (r.completed_at || r.return_date || '').slice(0, 4) || 'No date' : by === 'status' ? statusLabel(r.status) : String(r[by] || '').trim() || 'Not set';
    const g = m.get(key) ?? { key, count: 0, value: 0, won: 0, lost: 0, wonValue: 0, rate: null };
    g.count++; g.value += r.value || 0;
    if (r.status === 'won') { g.won++; g.wonValue += r.value || 0; }
    if (r.status === 'lost' || r.status === 'no_reply' || r.status === 'declined') g.lost++;
    g.rate = g.won + g.lost ? Math.round((g.won / (g.won + g.lost)) * 100) : null;
    m.set(key, g);
  }
  return [...m.values()].sort((a, b) => b.value - a.value || b.count - a.count);
}

const txt = (c: unknown) => String(c ?? '').trim();
const DISC: Record<string, string> = { 'flat roofing': 'Flat Roofing', flat: 'Flat Roofing', 'pitched roofing': 'Pitched Roofing', pitched: 'Pitched Roofing', mixed: 'Mixed', 'flat & pitched': 'Mixed', repairs: 'Repairs', 'nhf rates': 'NHF Rates' };
const iso = (c: unknown) => { const s = txt(c); return /^(20\d\d)-\d\d-\d\d$/.test(s) ? s : null; };
const OUTCOME: Record<string, QuoteStatus> = { lost: 'lost', secured: 'won', negotiating: 'negotiating', 'no reply': 'no_reply' };
export type ImportRow = { client_name: string; title: string; discipline: string | null; value: number | null; profit_pct: number | null; return_date: string | null; returned_at: string | null; status: QuoteStatus; notes: string | null; priced_by_name: string | null; chase_count: number; completed_at: string | null };
/**
 * Rows of the Tender Enquiry Log, dates already turned to yyyy-mm-dd. The chaser stays off for every imported quote, so
 * loading years of old quotes can't email anyone. Who priced it wasn't a column: it's taken from Feedback / Status only
 * when that's just one of the people named.
 */
export function readTenderLog(rows: (string | number)[][], people: string[]): { rows: ImportRow[]; skipped: number } | { error: string } {
  const at = rows.findIndex((r) => txt(r[0]).toLowerCase() === 'client' && txt(r[1]).toLowerCase() === 'address');
  if (at < 0) return { error: "This doesn't look like the Tender Enquiry Log: there's no row headed Client, Address." };
  const out: ImportRow[] = [];
  let skipped = 0;
  const known = new Map(people.map((p) => [p.toLowerCase(), p]));
  for (const r of rows.slice(at + 1)) {
    const client = txt(r[0]), title = txt(r[1]);
    if (!client && !title) continue;
    if (!client || !title || /^returned tenders$/i.test(client)) { skipped++; continue; }
    const outcome = OUTCOME[txt(r[10]).toLowerCase()];
    const returned = /^(true|1|yes)$/i.test(txt(r[6]));
    const status: QuoteStatus = outcome ?? (returned ? 'returned' : 'pricing');
    const ret = iso(r[5]), note = txt(r[11]), val = Number(r[3]), pct = Number(r[4]);
    out.push({
      client_name: client, title, discipline: DISC[txt(r[2]).toLowerCase()] ?? (txt(r[2]) || null), value: txt(r[3]) && isFinite(val) ? val : null,
      profit_pct: txt(r[4]) && isFinite(pct) ? pct : null, return_date: ret, returned_at: returned ? ret : null, status,
      notes: note && !known.has(note.toLowerCase()) ? note : null, priced_by_name: known.get(note.toLowerCase()) ?? null,
      chase_count: /^yes$/i.test(txt(r[9])) ? 1 : 0, completed_at: isClosed(status) ? ret : null,
    });
  }
  return { rows: out, skipped };
}
