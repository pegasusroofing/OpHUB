// The client stage of a variation or a day work, kept in Projects (Andy, 8 Nov 2026): To Issue → Issued To Client →
// Client Approved / Client Rejected. Only client-approved ones go on an application for payment in Finance. Pure.
export type ClientStatus = 'to_issue' | 'issued' | 'approved' | 'rejected';
export type SiteDoc = { bucket: string; path: string; name: string; at?: string };

export const CLIENT_LABEL: Record<ClientStatus, string> = { to_issue: 'To Issue', issued: 'Issued To Client', approved: 'Client Approved', rejected: 'Client Rejected' };
export const clientTone = (s: ClientStatus | null | undefined) => (s === 'approved' ? 'ok' : s === 'rejected' ? 'red' : s === 'issued' ? 'warn' : 'slate');

/** Whether a site variation can go on an application: a client stage of Approved. One from before the client stage (none
 *  set, e.g. approved in the current web app) goes on once approved, as it always has. */
export function variationPayable(v: { approval_status?: string | null; client_status?: string | null }): boolean {
  if (v.approval_status !== 'approved') return false;
  return v.client_status ? v.client_status === 'approved' : true;
}

/** The Finance register status a site variation's client stage stands for (the database trigger does the same). */
export function finStatusFor(v: { approval_status?: string | null; client_status?: string | null; cost_impact?: string | null }): string {
  if (v.approval_status === 'declined' || v.client_status === 'rejected') return 'rejected';
  if (v.client_status === 'approved') return 'agreed';
  if (v.client_status === 'issued') return 'submitted';
  if (!v.client_status) return v.approval_status === 'approved' ? 'agreed' : 'submitted';
  return String(v.cost_impact || '').trim() ? 'priced' : 'instructed';
}

/** Counts for the tiles across the top. */
export function clientCounts(rows: { client_status?: string | null }[]) {
  const n = { to_issue: 0, issued: 0, approved: 0, rejected: 0 };
  rows.forEach((r) => { const k = (r.client_status || 'to_issue') as ClientStatus; if (k in n) n[k] += 1; });
  return n;
}
