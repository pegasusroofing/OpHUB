// Supplier name clash check (730 findSupplierConflict): the same company under
// a slightly different spelling is blocked; a similar name gets a warning. Pure.

export const normSupplier = (name: string | null | undefined) => String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

export function levenshtein(a: string, b: string): number {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j - 1], prev[j], cur[j - 1]);
    prev = cur;
  }
  return prev[b.length];
}

export function supplierConflict<S extends { id: string; name: string }>(name: string, suppliers: S[], excludeId?: string): { blocked: S | null; warn: S | null } {
  const norm = normSupplier(name);
  if (!norm) return { blocked: null, warn: null };
  let warn: S | null = null;
  for (const s of suppliers) {
    if (excludeId && s.id === excludeId) continue;
    const sn = normSupplier(s.name);
    if (!sn) continue;
    if (sn === norm) return { blocked: s, warn: null };
    const dist = levenshtein(norm, sn);
    if (Math.min(norm.length, sn.length) >= 5 && dist <= 1) return { blocked: s, warn: null };
    if (!warn && (1 - dist / (Math.max(norm.length, sn.length) || 1) >= 0.6 || norm.includes(sn) || sn.includes(norm))) warn = s;
  }
  return { blocked: null, warn };
}

/** Suppliers from a spreadsheet (730 importSuppliersExcel): Name / Email columns from a header row,
 *  else column A = name and B = email. Rows clashing with a supplier on file (or earlier in the same
 *  file) are skipped — blocked ones counted, similar ones listed. */
export function supplierImportRows<S extends { id: string; name: string }>(rows: unknown[][], existing: S[]): { found: { name: string; email: string }[]; dupes: number; similar: string[] } {
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const header = (rows[0] || []).map((c) => String(c ?? '').trim().toLowerCase());
  const ni = header.findIndex((h) => h.includes('name')), ei = header.findIndex((h) => h.includes('email'));
  const hasHead = ni > -1 || ei > -1;
  const nameCol = ni > -1 ? ni : 0, emailCol = ei > -1 ? ei : 1;
  const seen: { id: string; name: string }[] = [...existing];
  const found: { name: string; email: string }[] = [], similar: string[] = [];
  let dupes = 0;
  for (let i = hasHead ? 1 : 0; i < rows.length; i++) {
    const r = rows[i]; if (!r) continue;
    const name = String(r[nameCol] ?? '').trim(), email = String(r[emailCol] ?? '').trim();
    if (!name || !EMAIL.test(email)) continue;
    const c = supplierConflict(name, seen);
    if (c.blocked) { dupes++; continue; }
    if (c.warn) { similar.push(`${name} (like "${c.warn.name}")`); continue; }
    found.push({ name, email });
    seen.push({ id: `new${i}`, name });
  }
  return { found, dupes, similar };
}
