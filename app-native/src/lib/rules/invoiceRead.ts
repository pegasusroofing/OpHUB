// A purchase invoice the reader has been through: which job each line is for, whether its sums add up, what it should
// have cost, and whether it can be filed by itself or needs someone to look. Pure, so it can be tested on its own.
export type RSite = { id: string; job_number?: string | null; name?: string | null; address?: string | null; postcode?: string | null; status?: string | null };
export type RPo = { id: string; number?: string | null; site_id?: string | null };
export type RLine = { code?: string; description?: string; qty?: number; unit?: string; unit_price?: number; amount?: number; kind?: string; site_reference?: string; site_id?: string | null; how?: string; cost_code?: string };
export type Read = { doc_type?: string; supplier?: string; doc_number?: string; doc_date?: string; due_date?: string; po_number?: string; site_reference?: string; net?: number; vat?: number; total?: number; lines?: RLine[] };
export type Quote = { id: string; site_id?: string | null; supplier_name?: string | null; quote_no?: string | null; quote_date?: string | null; created_at?: string | null };
export type QuoteItem = { quote_id: string; code?: string | null; description?: string | null; rate?: number | string | null; active?: boolean | null };
export type PriceCheck = { state: 'ok' | 'over' | 'under' | 'none'; rate?: number; charged?: number; from?: string; date?: string };

const words = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9.]+/g, ' ').trim();
const pcNorm = (s: unknown) => String(s ?? '').replace(/\s+/g, '').toUpperCase();
const round2 = (n: number) => Math.round(n * 100) / 100;
const firstLine = (s: RSite) => String(s.address ?? '').split(/,|\n/)[0].trim().toLowerCase();
const POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/gi;

/** The job some text points to: PO number first, then job number, postcode, then address or name. Two possible jobs is no answer. */
export function matchJob(text: string, sites: RSite[], pos: RPo[]): { site_id: string; po_id?: string; how: string } | { why: string } {
  const flat = String(text ?? '').replace(/\s+/g, ' '), low = flat.toLowerCase(), live = sites.filter((s) => s.status !== 'closed');
  if (!flat.trim()) return { why: 'No PO, job number or site address on it' };
  const po = pos.filter((p) => p.number && p.site_id && low.includes(String(p.number).toLowerCase()));
  if (po.length === 1) return { site_id: po[0].site_id as string, po_id: po[0].id, how: `PO ${po[0].number}` };
  const whole = (needle: string) => new RegExp(`(^|[^a-z0-9])${needle.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`).test(low);
  const byNo = live.filter((s) => s.job_number && String(s.job_number).length >= 3 && whole(String(s.job_number)));
  if (byNo.length === 1) return { site_id: byNo[0].id, how: `job number ${byNo[0].job_number}` };
  const codes = new Set(Array.from(flat.matchAll(POSTCODE)).map((m) => pcNorm(m[1] + m[2])));
  const byPc = live.filter((s) => s.postcode && codes.has(pcNorm(s.postcode)));
  if (byPc.length === 1) return { site_id: byPc[0].id, how: `postcode ${byPc[0].postcode}` };
  const byAddr = live.filter((s) => (firstLine(s).length > 6 && low.includes(firstLine(s))) || (String(s.name ?? '').length > 6 && low.includes(String(s.name).toLowerCase())));
  if (byAddr.length === 1) return { site_id: byAddr[0].id, how: 'site address' };
  const many = [...new Set([...byNo, ...byPc, ...byAddr])];
  if (many.length > 1) return { why: `Could be ${many.slice(0, 3).map((s) => s.job_number || s.name).join(' or ')}` };
  return { why: 'No PO, job number or site address on it' };
}

/** Each line gets the job its own reference points to, or the job the invoice as a whole points to. */
export function codeLines(r: Read, sites: RSite[], pos: RPo[]): { lines: RLine[]; headerSite: string | null; poId: string | null; why: string | null } {
  const head = matchJob([r.po_number, r.site_reference].filter(Boolean).join(' '), sites, pos);
  const lines = (r.lines ?? []).map((l) => {
    const own = l.site_reference ? matchJob(l.site_reference, sites, pos) : null;
    if (own && 'site_id' in own) return { ...l, site_id: own.site_id, how: own.how };
    return { ...l, site_id: 'site_id' in head ? head.site_id : null, how: 'site_id' in head ? head.how : undefined };
  });
  return { lines, headerSite: 'site_id' in head ? head.site_id : null, poId: 'site_id' in head ? head.po_id ?? null : null, why: 'why' in head ? head.why : null };
}

export const lineValue = (l: RLine) => (l.amount != null ? Number(l.amount) : round2(Number(l.qty ?? 0) * Number(l.unit_price ?? 0)));
const unitOf = (l: RLine) => (l.unit_price != null ? Number(l.unit_price) : l.qty ? Number(l.amount ?? 0) / Number(l.qty) : null);
const sameSupplier = (a: unknown, b: unknown) => { const x = words(a).replace(/\b(ltd|limited|plc|uk|the)\b/g, '').trim(), y = words(b).replace(/\b(ltd|limited|plc|uk|the)\b/g, '').trim(); return !!x && !!y && (x === y || x.includes(y) || y.includes(x)); };
const overlap = (a: string, b: string) => { const A = new Set(a.split(' ').filter((w) => w.length > 1)), B = new Set(b.split(' ').filter((w) => w.length > 1)); if (!A.size || !B.size) return 0; let n = 0; A.forEach((w) => { if (B.has(w)) n++; }); return n / Math.max(A.size, B.size); };

/**
 * What the line should have cost: this supplier's project quote for that job or a yearly price list, whichever is dated
 * most recently, matched on product code and otherwise on description. A small difference (0.5%) is rounding.
 */
export function priceCheck(l: RLine, supplier: string | undefined, quotes: Quote[], items: QuoteItem[]): PriceCheck {
  const charged = unitOf(l);
  if ((l.kind && l.kind !== 'item') || charged == null) return { state: 'none' };
  const usable = quotes.filter((q) => sameSupplier(q.supplier_name, supplier) && (!q.site_id || q.site_id === l.site_id));
  const code = words(l.code), desc = words(l.description);
  const hits = usable.flatMap((q) => items.filter((i) => i.quote_id === q.id && i.active !== false && i.rate != null && Number(i.rate) > 0 && ((code && words(i.code) === code) || words(i.description) === desc || overlap(words(i.description), desc) >= 0.8)).map((i) => ({ q, i })));
  if (!hits.length) return { state: 'none', charged };
  const dated = (q: Quote) => q.quote_date || (q.created_at ?? '').slice(0, 10);
  const best = hits.sort((a, b) => dated(b.q).localeCompare(dated(a.q)))[0];
  const rate = Number(best.i.rate), diff = charged - rate;
  return { state: Math.abs(diff) <= rate * 0.005 ? 'ok' : diff > 0 ? 'over' : 'under', rate, charged: round2(charged), from: `${best.q.site_id ? 'project quote' : 'price list'}${best.q.quote_no ? ` ${best.q.quote_no}` : ''}`, date: dated(best.q) };
}

/** Whether it's fit to file by itself, and why not. Flags are filed with it, as a query, for someone to approve. */
export function decide(r: Read, lines: RLine[], checks: PriceCheck[]): { canFile: boolean; why: string | null; flags: string[]; mainSite: string | null } {
  const money = (n: number) => `£${n.toFixed(2)}`;
  const flags = lines.flatMap((l, i) => { const c = checks[i]; return c?.state === 'over' ? [`${l.description || `Line ${i + 1}`}: ${money(c.charged as number)} a unit, ${c.from} says ${money(c.rate as number)}`] : []; });
  const by: Record<string, number> = {};
  lines.forEach((l) => { if (l.site_id) by[l.site_id] = (by[l.site_id] ?? 0) + Math.max(0, lineValue(l)); });
  const mainSite = Object.entries(by).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const out = (why: string | null) => ({ canFile: !why, why, flags, mainSite });
  if (r.doc_type && !['invoice', 'credit_note'].includes(r.doc_type)) return out('It doesn’t look like an invoice');
  if (r.doc_type === 'credit_note') return out('It’s a credit note: check it before it’s filed');
  if (!String(r.supplier ?? '').trim()) return out('Couldn’t tell the supplier');
  if (r.net == null || r.total == null) return out('Couldn’t read the amounts');
  if (Math.abs(Number(r.net) + Number(r.vat ?? 0) - Number(r.total)) >= 0.05) return out(`Net and VAT don’t add up to the total of ${money(Number(r.total))}`);
  if (!lines.length) return out('No lines could be read');
  const sum = round2(lines.reduce((t, l) => t + lineValue(l), 0));
  if (Math.abs(sum - Number(r.net)) >= 0.5) return out(`The lines add up to ${money(sum)}, but the net is ${money(Number(r.net))}`);
  const lost = lines.filter((l) => !l.site_id);
  if (lost.length) return out(lost.length === lines.length ? 'Couldn’t tell which job it’s for' : `Couldn’t tell the job for ${lost.length} line${lost.length === 1 ? '' : 's'}`);
  return out(null);
}
