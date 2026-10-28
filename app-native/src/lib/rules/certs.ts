// Operative certificate rules, ported from 320-per-operative-certifications.js.

export const CERT_CATEGORIES = [
  { key: 'cscs_card', label: 'CSCS Card' }, { key: 'manual_handling', label: 'Manual Handling' },
  { key: 'working_at_height', label: 'Working at Height' }, { key: 'asbestos_awareness', label: 'Asbestos Awareness' },
  { key: 'smsts', label: 'SMSTS' }, { key: 'sssts', label: 'SSSTS' },
  { key: 'manufacturer_installer_card', label: 'Manufacturer Installer Card' }, { key: 'other', label: 'Other' },
];
/** Drop-downs list A–Z with "Other" last. */
export const CERT_CATEGORIES_AZ = [
  ...CERT_CATEGORIES.filter((c) => c.key !== 'other').sort((a, b) => a.label.localeCompare(b.label)),
  ...CERT_CATEGORIES.filter((c) => c.key === 'other'),
];
export const certCategoryLabel = (key: string) => CERT_CATEGORIES.find((c) => c.key === key)?.label || 'Other';
export const CERT_STANDARD_REQUIRED = ['working_at_height', 'asbestos_awareness', 'manual_handling', 'cscs_card'];

export type Cert = { id: string; category: string; name: string | null; storage_path: string; expiry_date: string | null; other_type_description: string | null };

/** Totals for the four summary boxes: certificates, expiring in 30 days, expired, missing standard types. */
export function certStats(certs: Pick<Cert, 'category' | 'expiry_date'>[], now: Date = new Date()) {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const in30 = new Date(today); in30.setDate(in30.getDate() + 30);
  let expired = 0, expiringSoon = 0;
  certs.forEach((c) => {
    if (!c.expiry_date) return;
    const d = new Date(`${c.expiry_date}T00:00:00`);
    if (d < today) expired++; else if (d <= in30) expiringSoon++;
  });
  const got = new Set(certs.map((c) => c.category));
  const missingKeys = CERT_STANDARD_REQUIRED.filter((k) => !got.has(k));
  return { total: certs.length, expired, expiringSoon, missing: missingKeys.length, missingKeys };
}

/** Name to show: the saved name, else the file name without the leading id. */
export function certDisplayName(c: Pick<Cert, 'name' | 'storage_path'>): string {
  if (c.name && c.name.trim()) return c.name;
  const base = (c.storage_path || '').split('/').pop() || '';
  const cleaned = base.replace(/^[0-9a-fA-F-]{36}-/, '');
  try { return decodeURIComponent(cleaned) || base || 'Certificate'; } catch { return cleaned || base || 'Certificate'; }
}

/** Storage path: <org>/<operative>/<id>-<safe file name>. */
export const certPath = (orgId: string, operativeId: string, id: string, fileName: string) =>
  `${orgId}/${operativeId}/${id}-${fileName.replace(/[^a-z0-9.-]+/gi, '_')}`;
