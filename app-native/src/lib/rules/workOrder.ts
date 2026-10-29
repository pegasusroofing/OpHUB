// Reading an "Axis" work order PDF's text (340 parseWorkOrderPdf): the work
// order number, the property address and the repair description, each field
// running on over following lines until the next known label. Pure.
export const WORK_ORDER_STOP_LABELS = ['Work Order:', 'Workstream', 'Client:', 'Case:', 'Supplier:', 'Booking:', 'Issued On:', 'Repair Contact:', 'Tel:', 'Repair Description:', 'Version:', 'Notes:', 'Resident Phone:', 'Property:', 'Resident:', 'Property Flag:', 'Company Registration Number:', 'Property Attributes', 'Work Items'];

function earliestStop(text: string) {
  let best: number | null = null;
  WORK_ORDER_STOP_LABELS.forEach((l) => { const i = text.indexOf(l); if (i > -1 && (best === null || i < best)) best = i; });
  return best;
}
export function workOrderField(rows: string[], label: string): string | null {
  const start = rows.findIndex((r) => r.includes(label));
  if (start === -1) return null;
  const after = rows[start].slice(rows[start].indexOf(label) + label.length);
  const s0 = earliestStop(after);
  const parts = [(s0 === null ? after : after.slice(0, s0)).trim()];
  for (let r = start + 1; r < rows.length && r < start + 6; r++) {
    const st = earliestStop(rows[r]);
    if (st !== null) { const before = rows[r].slice(0, st).trim(); if (before) parts.push(before); break; }
    parts.push(rows[r].trim());
  }
  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() || null;
}
export function parseWorkOrder(rows: string[]): { jobNumber?: string; address?: string; description?: string } {
  const out: { jobNumber?: string; address?: string; description?: string } = {};
  const num = rows.join(' ').replace(/\s+/g, ' ').match(/Work Order:\s*(\S+)/);
  if (num) out.jobNumber = num[1].trim();
  const addr = workOrderField(rows, 'Property:');
  if (addr) out.address = addr.split(/\s+/).map((w) => (/\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())).join(' ');
  const desc = workOrderField(rows, 'Repair Description:');
  if (desc) out.description = desc;
  return out;
}
