// Variation value rules, ported from 800-variations.js (map L22 / P06): a site
// variation's value (cost_impact, text) is typed by a PM/admin and copied to Finance.

/** What's typed in a value box: null = left empty, NaN = not a number, else pounds to 2dp. */
export function readMoney(raw: string | null | undefined): number | null {
  const t = String(raw ?? '').replace(/[£,\s]/g, '');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

/** The stored value as a number, or null. */
export function valueOf(costImpact: string | null | undefined): number | null {
  if (costImpact == null || String(costImpact).trim() === '') return null;
  const n = Number(String(costImpact).replace(/[£,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function money(n: number): string {
  return `${n < 0 ? '−' : ''}£${Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * When the site value changes, Finance's copy follows only where Finance hasn't
 * typed its own figure: "quoted" if blank or still the old site value; "agreed_value"
 * likewise but only once the variation is agreed. Returns the patch, or null.
 */
export function financeValuePatch(
  f: { status: string | null; quoted: number | null; agreed_value: number | null },
  oldVal: number | null, newVal: number | null,
): Record<string, number> | null {
  if (newVal == null) return null;
  const same = (x: number | null) => x != null && oldVal != null && Math.abs(Number(x) - Number(oldVal)) < 0.005;
  const patch: Record<string, number> = {};
  if (f.quoted == null || same(f.quoted)) patch.quoted = newVal;
  if (f.status === 'agreed' && (f.agreed_value == null || same(f.agreed_value))) patch.agreed_value = newVal;
  (Object.keys(patch) as ('quoted' | 'agreed_value')[]).forEach((k) => { if (f[k] != null && Math.abs(Number(f[k]) - newVal) < 0.005) delete patch[k]; });
  return Object.keys(patch).length ? patch : null;
}
