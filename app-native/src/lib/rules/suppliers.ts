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
