// Bringing workers in from Xero (old 9216-finance-xero-workers.js). Subcontractors come from a Xero contact group (or
// suppliers with CIS on); PAYE staff from Xero Payroll with a day rate. Each is matched to someone already in OpHUB —
// same Xero record, then same name / email (workers, then app users) — otherwise added as a new worker. Nothing removed.
type Row = Record<string, any>;

export type XeroPerson = {
  kind: 'sub' | 'paye'; name?: string; email?: string;
  xero_contact_id?: string; xero_employee_id?: string;
  vat_registered?: boolean; cis_rate?: number | null; day_rate?: number | null; rate_note?: string;
};
export type XeroMatch = { key: string; row: Row; how: 'linked' | 'name' | 'user' };

const norm = (s: unknown) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** rates: fin_labour_rates keyed by user id, or `w:<id>` for a worker without an app login. */
export function xeroWorkerMatch(p: XeroPerson, rates: Record<string, Row>, profiles: { id: string; name?: string | null; email?: string | null }[]): XeroMatch | null {
  const all = Object.keys(rates).map((key) => ({ key, row: rates[key] }));
  const idHit = all.find((x) => (p.xero_contact_id && x.row.xero_contact_id === p.xero_contact_id) || (p.xero_employee_id && x.row.xero_employee_id === p.xero_employee_id));
  if (idHit) return { ...idHit, how: 'linked' };
  const nm = norm(p.name), em = String(p.email || '').toLowerCase();
  const wHit = all.find((x) => x.key.startsWith('w:') && ((nm && (norm(x.row.name) === nm || norm(x.row.trading_name) === nm)) || (em && String(x.row.email || '').toLowerCase() === em)));
  if (wHit) return { ...wHit, how: 'name' };
  const prof = profiles.find((u) => (nm && norm(u.name) === nm) || (em && String(u.email || '').toLowerCase() === em));
  if (prof) return { key: prof.id, row: rates[prof.id] || {}, how: 'user' };
  return null;
}

/** What's written for one ticked person: pay type, CIS (only 0 / 20 / 30), VAT, the Xero link and the day rate when Xero has one. */
export function xeroWorkerPatch(p: XeroPerson, now: string): Row {
  const row: Row = { pay_type: p.kind === 'paye' ? 'paye' : 'subcontractor', updated_at: now };
  if (p.kind === 'sub') {
    if ([0, 20, 30].includes(Number(p.cis_rate)) && p.cis_rate != null) row.cis_rate = Number(p.cis_rate);
    row.vat_registered = !!p.vat_registered; row.xero_contact_id = p.xero_contact_id;
  } else { row.cis_rate = 0; row.xero_employee_id = p.xero_employee_id; }
  if (p.day_rate != null && !isNaN(Number(p.day_rate))) { row.day_rate = Math.round(Number(p.day_rate) * 100) / 100; row.rate_note = p.rate_note ? `Xero: ${p.rate_note}` : 'From Xero'; }
  return row;
}
