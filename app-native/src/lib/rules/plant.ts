// Plant register rules, ported from 740-plant (company-wide plant / tool pool).

export const PLANT_CHECKLIST = [
  { key: 'q_condition', label: 'Condition', text: 'Is the item free from visible damage, wear or defects?' },
  { key: 'q_guards', label: 'Guards & Safety Devices', text: 'Are all guards, safety devices and emergency stops fitted and working?' },
  { key: 'q_controls', label: 'Controls', text: 'Do all controls operate correctly and are they clearly labelled?' },
  { key: 'q_inspection', label: 'Inspection In Date', text: "Is the item's inspection/PAT test still in date?" },
  { key: 'q_ppe', label: 'PPE', text: 'Has the correct PPE for using this item been identified and is it available?' },
] as const;

export type PlantItem = {
  id: string; name: string; category: string; description: string | null; serial_number: string | null; photo_path: string | null;
  inspection_interval_months: number | null; next_inspection_due: string | null; current_site_id: string | null; current_status: string;
};
export type Checkout = {
  id: string; plant_item_id: string; operative_id: string | null; requested_at: string; checkout_status: string;
  checkin_status: string | null; checkin_photo_path: string | null; checkin_notes: string | null;
};

export const categoryLabel = (c: string) => (c === 'pat' ? 'PAT Tested Appliance' : 'Plant / Equipment');

/** Inspection badge: overdue (red), due within 30 days (amber), else green. */
export function dueBadge(item: Pick<PlantItem, 'next_inspection_due'>, today = new Date()): { label: string; tone: 'none' | 'bad' | 'warn' | 'ok' } {
  if (!item.next_inspection_due) return { label: 'No inspection date set', tone: 'none' };
  const now = new Date(today); now.setHours(0, 0, 0, 0);
  const due = new Date(`${item.next_inspection_due}T00:00:00`);
  const in30 = new Date(now); in30.setDate(in30.getDate() + 30);
  const s = due.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  if (due < now) return { label: `Overdue — was due ${s}`, tone: 'bad' };
  return { label: `Due ${s}`, tone: due <= in30 ? 'warn' : 'ok' };
}

/** The newest check-out row per item. */
export function latestByItem(rows: Checkout[]): Record<string, Checkout> {
  const out: Record<string, Checkout> = {};
  rows.forEach((c) => { const e = out[c.plant_item_id]; if (!e || new Date(c.requested_at) > new Date(e.requested_at)) out[c.plant_item_id] = c; });
  return out;
}

/** What to show: a pending request is shown before a manager's sign-off flips the item itself. */
export function effectiveState(item: Pick<PlantItem, 'current_status'>, latest: Checkout | undefined): string {
  if (latest && latest.checkout_status === 'pending_signoff' && !latest.checkin_status) return 'pending_checkout_signoff';
  if (item.current_status === 'checked_out' && latest?.checkin_status === 'pending_signoff') return 'pending_checkin_signoff';
  return item.current_status;
}
