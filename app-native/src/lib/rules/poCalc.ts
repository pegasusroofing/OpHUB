// The sums on a purchase order (Andy, 5 Nov 2026: "make sure it all adds up"). Pure, and tested in poCalc.test.ts.
// Each line: qty × rate less its discount, to the penny. VAT is worked out on each line at that line's own rate
// (reverse charge adds none) and rounded per line, so the VAT by rate always adds up to the VAT total, and
// net + VAT = total. A line, or the whole order, can be split across projects by %; the £ on each project
// always adds up to the net (any penny left over goes to the biggest share).
export type Alloc = { site_id: string; pct: number };
export type PoLine = { qty?: string | number | null; rate?: string | number | null; disc?: string | number | null; vat?: string | null; site_id?: string | null; alloc?: Alloc[] | null };
export type PoVat = { code: string; name: string; rate: number; rc?: boolean };

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const n0 = (v: unknown) => { const x = Number(String(v ?? '').replace(/[£,%\s]/g, '')); return isFinite(x) ? x : 0; };

export const discOf = (l: PoLine) => Math.max(0, Math.min(100, n0(l.disc)));
export const lineNet = (l: PoLine) => r2(n0(l.qty) * n0(l.rate) * (1 - discOf(l) / 100));
export const vatRateOf = (code: string | null | undefined, vats: PoVat[]) => { const v = vats.find((x) => x.code === code); return v && !v.rc ? v.rate : 0; };
export const lineVat = (l: PoLine, vats: PoVat[]) => r2((lineNet(l) * vatRateOf(l.vat, vats)) / 100);

/** Net, VAT, total, and the VAT for each rate used (in the order the rates are listed). */
export function poTotals(lines: PoLine[], vats: PoVat[]) {
  const by: Record<string, { code: string; name: string; net: number; vat: number }> = {};
  let net = 0, vat = 0;
  lines.forEach((l) => {
    const ln = lineNet(l), lv = lineVat(l, vats), code = String(l.vat ?? '');
    net = r2(net + ln); vat = r2(vat + lv);
    const e = (by[code] = by[code] || { code, name: vats.find((x) => x.code === code)?.name || code || 'No VAT', net: 0, vat: 0 });
    e.net = r2(e.net + ln); e.vat = r2(e.vat + lv);
  });
  const order = vats.map((v) => v.code);
  const byVat = Object.values(by).filter((e) => e.net !== 0 || e.vat !== 0).sort((a, b) => order.indexOf(a.code) - order.indexOf(b.code));
  return { net, vat, total: r2(net + vat), byVat };
}

/** What's wrong with a split, if anything: every project chosen, no project twice, adding up to 100%. */
export function splitProblem(a: Alloc[] | null | undefined): string | null {
  if (!a || !a.length) return null;
  if (a.some((x) => !x.site_id)) return 'Choose the project on every row of the split.';
  if (new Set(a.map((x) => x.site_id)).size !== a.length) return 'The same project is on two rows — put them together.';
  const t = r2(a.reduce((s, x) => s + n0(x.pct), 0));
  return Math.abs(t - 100) < 0.01 ? null : `The split adds up to ${t}% — it needs to be 100%.`;
}
/** Even shares that add up to exactly 100. */
export function evenSplit(ids: string[]): Alloc[] {
  const n = ids.length; if (!n) return [];
  const each = Math.floor(10000 / n) / 100;
  return ids.map((id, i) => ({ site_id: id, pct: i === n - 1 ? r2(100 - each * (n - 1)) : each }));
}
/** Where a line's cost goes: its own split, else the whole order's split, else its project. */
export const allocOf = (l: PoLine, orderSplit?: Alloc[] | null): Alloc[] => (l.alloc && l.alloc.length ? l.alloc : orderSplit && orderSplit.length ? orderSplit : l.site_id ? [{ site_id: l.site_id, pct: 100 }] : []);

/** £ on each project, adding up to the net exactly. */
export function siteAmounts(lines: PoLine[], orderSplit?: Alloc[] | null): Record<string, number> {
  const out: Record<string, number> = {};
  lines.forEach((l) => {
    const amt = lineNet(l), a = allocOf(l, orderSplit); if (!a.length || !amt) return;
    let left = amt;
    const parts = a.map((x) => { const v = r2((amt * n0(x.pct)) / 100); left = r2(left - v); return { id: x.site_id, v }; });
    if (left !== 0) { const big = parts.reduce((m, p) => (Math.abs(p.v) > Math.abs(m.v) ? p : m), parts[0]); big.v = r2(big.v + left); }
    parts.forEach((p) => { out[p.id] = r2((out[p.id] || 0) + p.v); });
  });
  return out;
}
/** The order's split by project, as % of the net (adding up to exactly 100), biggest first; null if one project. */
export function orderSplit(lines: PoLine[], split?: Alloc[] | null): { site_id: string; pct: number; amount: number }[] | null {
  const by = siteAmounts(lines, split), ids = Object.keys(by).filter((k) => by[k] !== 0).sort((a, b) => by[b] - by[a]);
  if (ids.length < 2) return null;
  const tot = ids.reduce((t, k) => t + by[k], 0) || 1;
  const out = ids.map((k) => ({ site_id: k, pct: Math.round((by[k] / tot) * 1000000) / 10000, amount: by[k] }));
  const sum = out.reduce((t, x) => t + x.pct, 0); out[0].pct = Math.round((out[0].pct + 100 - sum) * 10000) / 10000;
  return out;
}
/** The project with most of the order on it (the PO is filed there). */
export const mainSite = (lines: PoLine[], split?: Alloc[] | null, fallback = '') => { const by = siteAmounts(lines, split); return Object.keys(by).sort((a, b) => by[b] - by[a])[0] || fallback; };
