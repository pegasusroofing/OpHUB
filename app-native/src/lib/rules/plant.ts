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
  // Two-way signing (Andy, 4 Nov 2026).
  site_id?: string | null; allocated_by?: string | null; allocated_at?: string | null; op_signed_at?: string | null; checkout_signed_at?: string | null; return_to_site_id?: string | null; note?: string | null;
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
// The database keeps its old status words: waiting for the operative = pending_signoff with allocated_at; lost = lost_at set.
export function effectiveState(item: Pick<PlantItem, 'current_status'> & { lost_at?: string | null }, latest: Checkout | undefined): string {
  if (item.lost_at) return 'lost';
  // Approved or allocated by a PM: waiting for the operative to sign for it.
  if (latest && latest.checkout_status === 'pending_signoff' && !latest.checkin_status && latest.allocated_at) return 'awaiting_op';
  if (latest && latest.checkout_status === 'pending_signoff' && !latest.checkin_status) return 'pending_checkout_signoff';
  if (item.current_status === 'checked_out' && latest?.checkin_status === 'pending_signoff') return 'pending_checkin_signoff';
  return item.current_status;
}

/** Plain words for each state, for the register and the job's Plant page. */
export const PLANT_STATE: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' | 'none' }> = {
  available: { label: 'Available', tone: 'ok' }, pending_checkout_signoff: { label: 'Requested — PM to approve', tone: 'warn' }, awaiting_op: { label: 'Waiting for signature', tone: 'warn' },
  checked_out: { label: 'Signed out', tone: 'none' }, pending_checkin_signoff: { label: 'Dropped off — to confirm', tone: 'warn' }, out_of_service: { label: 'Out of service', tone: 'bad' }, lost: { label: 'Lost', tone: 'bad' },
};
/** Whole days since it was signed for (null if it isn't out). */
export function daysOut(latest: Checkout | undefined, now = new Date()): number | null {
  if (!latest || latest.checkout_status !== 'checked_out' || latest.checkin_status === 'returned') return null;
  const at = latest.op_signed_at || latest.checkout_signed_at || latest.requested_at;
  return Math.max(0, Math.floor((now.getTime() - new Date(at).getTime()) / 86400000));
}
/** Names for a batch: 'Propane 47kg', 3 from 1 → Propane 47kg #01, #02, #03 (#001 once there are 100 or more). */
export function batchNames(base: string, count: number, from = 1): string[] {
  const n = Math.max(1, Math.min(200, Math.floor(count) || 1)), w = String(from + n - 1).length < 2 ? 2 : String(from + n - 1).length;
  return n === 1 ? [base.trim()] : Array.from({ length: n }, (_, i) => `${base.trim()} #${String(from + i).padStart(w, '0')}`);
}
