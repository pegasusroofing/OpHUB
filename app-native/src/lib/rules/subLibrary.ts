// A subcontractor company in the Company Library (Andy, 20 Nov 2026: "Approving a sign-up doesn't set anything up ... fix
// this"; "No insurance check"). Approving their sign-up files their documents in the library under the right heading with
// the expiry dates they gave; adding them to a job warns when their insurance is missing or out of date. Pure.

export type LibDoc = { category: string; expiry_date: string | null };

/** The library heading for a document from the sign-up form, from its label or file name. */
export function libCategory(label: string): string {
  const t = String(label || '').toLowerCase();
  if (/public\s*liab|\bpl\b/.test(t)) return 'public_liability_insurance';
  if (/employer|\bel\b/.test(t)) return 'employers_liability_insurance';
  if (/cscs|card|ticket|operative/.test(t)) return 'operative_certificate';
  if (/rams|method statement|risk assess/.test(t)) return 'rams_template';
  if (/accredit|chas|constructionline|smas|safecontractor|iso|certif/.test(t)) return 'accreditation';
  return 'other';
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/** An expiry date as typed on the form (2027-03-12, 12/03/2027, 12 March 2027, Mar 2027) as YYYY-MM-DD, or null. */
export function parseExpiry(v: unknown): string | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  const ok = (y: number, m: number, d: number) => (y > 1990 && y < 2200 && m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(m)}-${pad(d)}` : null);
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return ok(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) return ok(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  m = s.toLowerCase().match(/^(?:(\d{1,2})(?:st|nd|rd|th)?\s+)?([a-z]{3})[a-z]*\.?,?\s+(\d{4})$/);
  if (m && MONTHS.includes(m[2])) return ok(+m[3], MONTHS.indexOf(m[2]) + 1, m[1] ? +m[1] : 28);
  return null;
}

const nice = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
/**
 * Their insurance from the library: public liability and employer's liability, the latest certificate of each. ok when
 * both are on file and in date; warn says what's wrong; label is the one line shown on their row.
 */
export function insuranceStatus(docs: LibDoc[], today: string): { ok: boolean; warn: string | null; label: string } {
  const latest = (cat: string) => {
    const ds = docs.filter((d) => d.category === cat);
    if (!ds.length) return { have: false, expiry: null as string | null };
    const dated = ds.map((d) => d.expiry_date).filter(Boolean).sort() as string[];
    return { have: true, expiry: dated.length ? dated[dated.length - 1] : null };
  };
  const pl = latest('public_liability_insurance'), el = latest('employers_liability_insurance');
  const problems: string[] = [];
  const look = (x: { have: boolean; expiry: string | null }, name: string) => {
    if (!x.have) problems.push(`no ${name} insurance on file`);
    else if (x.expiry && x.expiry < today) problems.push(`${name} insurance expired ${nice(x.expiry)}`);
  };
  look(pl, 'public liability'); look(el, "employer's liability");
  if (problems.length) {
    const w = problems.join('; ');
    return { ok: false, warn: w.charAt(0).toUpperCase() + w.slice(1), label: `⚠ ${w.charAt(0).toUpperCase() + w.slice(1)}` };
  }
  const ends = [pl.expiry, el.expiry].filter(Boolean).sort() as string[];
  return { ok: true, warn: null, label: ends.length ? `✓ Insurance valid to ${nice(ends[0])}` : '✓ Insurance on file' };
}
