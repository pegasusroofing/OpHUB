// Material request rules, ported from 720-materials.js, 725 (operative view)
// and 9219zr (PO lock).

export type Mat = {
  id: string; site_id: string; item: string; qty: string | null; status: string;
  requested_by: string | null; created_at: string; required_by_date: string | null;
  required_for_delivery?: string | null; order_note?: string | null; merchant?: string | null;
  supplier_id?: string | null; sent_at?: string | null; email_sent_at?: string | null;
  cancel_reason?: string | null; cancelled_by?: string | null; sub_site_id?: string | null;
  sub_site_label?: string | null; group_id?: string | null; fulfilment?: string | null;
  po_number?: string | null; po_id?: string | null; grn?: { ok?: boolean; at?: string; by?: string; byName?: string; notes?: string; photos?: string[] } | null;
};

/** "today", "yesterday", "3d ago", "2w ago", "4mo ago". */
export function matAgo(ts: string, now = Date.now()): string {
  const d = (now - new Date(ts).getTime()) / 864e5;
  if (!(d >= 0)) return '';
  if (d < 1) return 'today';
  if (d < 2) return 'yesterday';
  if (d < 14) return `${Math.floor(d)}d ago`;
  if (d < 60) return `${Math.floor(d / 7)}w ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

/** Operatives and drivers never see PO numbers in a cancel reason. */
export function cancelReasonText(reason: string | null | undefined, isManager: boolean): string {
  const r = String(reason || '');
  if (isManager) return r;
  return /\bPO\b/.test(r) ? 'the order was cancelled by the office' : r;
}

export const OP_STATUS_LABEL: Record<string, string> = { pending: 'Awaiting action', sent: 'Actioned', closed: 'Closed', cancelled: 'Cancelled' };

/** A sent order goes straight to 'closed' with merchant/sent_at set. */
export const wasOrdered = (m: Mat) => m.status === 'sent' || !!(m.merchant || m.sent_at);

/** Completed tab: items sent together (same send time and supplier) show as one row. */
export function doneEntries(list: Mat[]): { m: Mat; items: Mat[] }[] {
  const out: { m: Mat; items: Mat[] }[] = [];
  const byKey: Record<string, { m: Mat; items: Mat[] }> = {};
  for (const m of list) {
    const key = m.sent_at ? `${m.sent_at}|${m.merchant || m.supplier_id || ''}` : null;
    if (key && byKey[key]) { byKey[key].items.push(m); continue; }
    const e = { m, items: [m] };
    if (key) byKey[key] = e;
    out.push(e);
  }
  return out;
}

/** To action tab: requests grouped into one request show as one card (2+ items). */
export function liveEntries(list: Mat[]): { m: Mat; items: Mat[] }[] {
  const seen = new Set<string>();
  const out: { m: Mat; items: Mat[] }[] = [];
  for (const m of list) {
    if (!m.group_id) { out.push({ m, items: [m] }); continue; }
    if (seen.has(m.group_id)) continue;
    seen.add(m.group_id);
    out.push({ m, items: list.filter((x) => x.group_id === m.group_id) });
  }
  return out;
}

/** Operative "Coming to site": delivery orders, kept until a GRN is done (then for the rest of that day), 2 weeks back at most. */
export function comingToSite(list: Mat[], today: string, twoWeeksAgo: string, isoOf: (d: Date) => string): Mat[] {
  return list.filter((m) => (m.status === 'sent' || m.merchant || m.sent_at) && m.fulfilment !== 'collection'
    && (m.grn ? (m.grn.at ? isoOf(new Date(m.grn.at)) : '') === today : (!m.required_for_delivery || m.required_for_delivery >= twoWeeksAgo))).slice(0, 20);
}

/** True when a request is on a sent PO, so Projects can't change it (Finance does). */
export const onSentPo = (m: Mat) => m.status !== 'cancelled' && !!(m.po_number || m.po_id) && !!(m.sent_at || m.email_sent_at || m.status === 'sent' || m.status === 'closed');

export function poLockText(m: Mat, many: boolean, isManager: boolean): string {
  if (!isManager) return 'This has already been ordered by the office, so it can’t be changed here.';
  return `${many ? 'One or more of these is on PO ' : 'This is on PO '}${m.po_number || '(no number)'}, which has been sent. Changes are made in Finance (it’s linked to Xero).`;
}

/** "Block A — 12 High St, AB1 2CD" */
export function subAddrLabel(a: { name?: string | null; address?: string | null; postcode?: string | null } | null | undefined): string {
  if (!a) return '';
  const addr = [a.address, a.postcode].filter(Boolean).join(', ');
  return (a.name || '') + (addr ? ` — ${addr}` : '');
}

/** Blank → null; a real YYYY-MM-DD → itself; anything else → 'bad'. */
export function readIsoDate(raw: string): string | null | 'bad' {
  const t = raw.trim();
  if (!t) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return 'bad';
  const d = new Date(`${t}T12:00:00`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== t ? 'bad' : t;
}

/** Operative pick-ups grouped by merchant (and branch), so one trip reads as one card. */
export type Pickup = { id: string; item: string; qty: string | null; status: string; supplier_id: string | null; supplier_branch?: { id?: string; name?: string; address?: string; phone?: string } | null; assigned_at?: string | null };
export function groupPickups(list: Pickup[], supName: (id: string) => string | null) {
  const groups: { key: string; name: string; addr: string; phone: string; items: Pickup[] }[] = [];
  for (const m of list) {
    const key = `${m.supplier_id || '_'}|${m.supplier_branch?.id || ''}`;
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = { key, name: (supName(m.supplier_id || '') || (m.supplier_id ? 'Merchant' : 'To collect')) + (m.supplier_branch ? `, ${m.supplier_branch.name || ''}` : ''), addr: m.supplier_branch?.address || '', phone: m.supplier_branch?.phone || '', items: [] };
      groups.push(g);
    }
    g.items.push(m);
  }
  return groups;
}

/** Plant / Expenses inside Materials: PMs/admins always; others by sites.materials_visibility (default site managers only). */
export function canSeeMatTile(vis: { plant?: string[]; expenses?: string[] } | null | undefined, key: 'plant' | 'expenses', role: string | undefined): boolean {
  if (role === 'pm' || role === 'admin' || role === 'superadmin') return true;
  const list = Array.isArray(vis?.[key]) ? (vis?.[key] as string[]) : ['site_manager'];
  return !!role && list.includes(role);
}

/* ---------- sending an order (760 / 726) ---------- */
export type Branch = { id: string; name?: string; address?: string; phone?: string; email?: string };
export type OrderSupplier = { id: string; name: string; email: string | null; branches?: Branch[] | null };
export type SendTo = 'branch' | 'main' | 'pm';
export type Fulfil = {
  mode: 'delivery' | 'collection'; date: string; note: string; branch: Branch | null; sendTo: SendTo;
  ccIds: string[]; ccEmails: string[]; collectorKind: 'driver' | 'op' | 'rtbop' | null; collectorId: string | null; slot: string | null;
};

export const branchLabel = (b: Branch | null | undefined) => (b ? [b.name, b.address].filter(Boolean).join(' — ') : '');
/** The branch's own email when it has one, else the supplier's main order email. */
export const orderEmailFor = (s: OrderSupplier | null, b: Branch | null) => b?.email || s?.email || '';

/** Who the order email goes to. toMe = the "Email to me" choice. */
export function orderRecipient(s: OrderSupplier | null, f: Pick<Fulfil, 'sendTo' | 'branch'>, toMe: boolean, myEmail: string): string {
  if (toMe) return myEmail;
  if (f.sendTo === 'pm') return myEmail;
  if (f.sendTo === 'main') return s?.email || '';
  return orderEmailFor(s, f.branch);
}

/** Typed CCs, plus the supplier's main email when the order goes to a branch's own different email. */
export function orderCcEmails(s: OrderSupplier | null, f: Pick<Fulfil, 'sendTo' | 'branch' | 'ccEmails'>, toMe: boolean): string[] {
  const out = f.ccEmails.slice();
  if (!toMe && f.sendTo !== 'pm' && f.sendTo !== 'main' && s?.email && f.branch?.email && f.branch.email.toLowerCase() !== s.email.toLowerCase()) out.push(s.email);
  return out;
}

/** The "Send order email to" choices for a supplier (and chosen branch). */
export function sendToOptions(s: OrderSupplier, b: Branch | null, myEmail: string): { key: SendTo; label: string }[] {
  const out: { key: SendTo; label: string }[] = [];
  if (b?.email) out.push({ key: 'branch', label: `Branch — ${b.name || 'branch'} (${b.email})` });
  if (s.email) out.push({ key: 'main', label: `Supplier main email (${s.email})` });
  if (!out.length) out.push({ key: 'branch', label: 'No supplier email set — add one in Admin › Suppliers' });
  out.push({ key: 'pm', label: `Don't email the supplier — just email me${myEmail ? ` (${myEmail})` : ''}` });
  return out;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (x: string) => EMAIL_RE.test(x.trim());
/** "a@b.com, c@d.com" → list, or the bad ones. */
export function parseCc(raw: string): { ok: string[]; bad: string[] } {
  const all = raw.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
  return { ok: all.filter(isEmail), bad: all.filter((x) => !isEmail(x)) };
}

/** The supplier sees the branch on the order (it goes out in the note); multi-site deliveries say which address. */
export function orderNote(typed: string, branch: Branch | null, mode: Fulfil['mode'], subLabels: (string | null | undefined)[]): string {
  let note = branch ? `Branch: ${branchLabel(branch)}${branch.phone ? ` (${branch.phone})` : ''}${typed ? ` — ${typed}` : ''}` : typed;
  const labels = [...new Set(subLabels.filter(Boolean))] as string[];
  if (mode === 'delivery' && labels.length === 1) note = `Deliver to: ${labels[0]}${note ? ` — ${note}` : ''}`;
  return note;
}

export const companyOperativeLabel = (orgName: string | null | undefined) => `${String(orgName || '').trim().split(/\s+/)[0] || 'Company'} Operative`;

/** Favourites (max 3) first, then the rest, each alphabetical; filtered by typed text. */
export function sortSuppliers<T extends { name: string; favourite?: boolean | null }>(list: T[], q: string): T[] {
  const t = q.trim().toLowerCase();
  const f = (t ? list.filter((s) => s.name.toLowerCase().includes(t)) : list).slice().sort((a, b) => a.name.localeCompare(b.name));
  return [...f.filter((s) => s.favourite), ...f.filter((s) => !s.favourite)];
}

/* ---------- yard stock (9219m / 9219zq) ---------- */
export type YardItem = { id: string; item: string; unit: string | null; qty: number | string | null; min_qty: number | string | null; location: string | null; category: string | null; active?: boolean | null };
export const yardQty = (n: unknown) => (Math.round(Number(n || 0) * 100) / 100).toLocaleString('en-GB');
export const yardLow = (s: YardItem) => s.min_qty != null && Number(s.qty || 0) <= Number(s.min_qty);
/** "2 rolls" → 2, "1.5" → 1.5; null if no number. */
export function yardNum(t: unknown): number | null {
  const m = String(t == null ? '' : t).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}
/** Best guess of which yard item a request means, from its wording. */
export function yardGuess(items: YardItem[], requestItem: string): string | null {
  const words = requestItem.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  let best: string | null = null; let bestN = 0;
  for (const s of items) { const n = words.filter((w) => s.item.toLowerCase().includes(w)).length; if (n > bestN) { bestN = n; best = s.id; } }
  return best;
}
