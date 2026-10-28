// PPE rules, ported from 650-ppe-issuance-requests-log.js.

export const PPE_STANDARD_ITEMS = ['Gloves', 'Hi-Vis Vest', 'Dust Mask', 'Hard Hat', 'Safety Boots'];

export type Issuance = { id: string; user_id: string; items: string[] | null; status: string; issued_at: string };

/** What someone currently holds: every item from their signed issuances, A–Z, once each. */
export function currentPpe(issuances: Issuance[], userId: string): string[] {
  const seen = new Set<string>();
  issuances.filter((i) => i.user_id === userId && i.status === 'signed').forEach((i) => (i.items || []).forEach((it) => seen.add(it)));
  return [...seen].sort();
}

export const cap1 = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
