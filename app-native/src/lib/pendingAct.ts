// A one-off action chosen on a list (Approve, Query Supplier) handed to the invoice screen in memory, never in the link:
// a link someone sends can't approve anything just by being opened (security review, 6 Nov 2026). It lasts a minute.
type Act = 'approve' | 'supplier';
const pending = new Map<string, { what: Act; at: number }>();
export const setPendingAct = (id: string, what: Act) => { pending.set(id, { what, at: Date.now() }); };
/** What was asked for this invoice, if anything (not used up: see clearPendingAct). */
export const peekPendingAct = (id: string | null | undefined): Act | '' => { const p = id ? pending.get(id) : undefined; return p && Date.now() - p.at < 60000 ? p.what : ''; };
export const clearPendingAct = (id: string | null | undefined) => { if (id) pending.delete(id); };
