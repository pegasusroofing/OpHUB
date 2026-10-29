// H&S signing rules, ported from 580-rams.js, 620-coshh, 630 (H&S folder),
// 710-toolbox-talks.js and 629-tile-visibility.js. Pure functions only.
import { siteStatusKey } from './checkin.ts';

export type CycleDoc = { id: string; resign_cycle_start: string | null; uploaded_at: string | null };
export type Sig = { user_id: string | null; signed_at: string | null; issued?: boolean | null };

/** Re-sign cycle starts at resign_cycle_start, or the upload date. */
export function resignCycleStart(doc: CycleDoc): string | null {
  return doc.resign_cycle_start || doc.uploaded_at;
}

/** "Re-sign due 28 Oct 2027": a year after the cycle start. Only on live jobs. */
export function resignDue(doc: CycleDoc, site: { status: string | null } | null): Date | null {
  if (!site || siteStatusKey(site) !== 'live') return null;
  const start = resignCycleStart(doc);
  if (!start) return null;
  const due = new Date(start);
  due.setFullYear(due.getFullYear() + 1);
  return due;
}

/**
 * On a live job, signatures from before the document's current cycle don't count
 * (the yearly re-sign). On a closed job old signatures stay valid forever.
 */
export function currentCycleSigs<S extends Sig>(sigs: S[], docs: CycleDoc[], key: keyof S, site: { status: string | null } | null): S[] {
  if (!site || siteStatusKey(site) !== 'live') return sigs;
  const start: Record<string, number> = {};
  docs.forEach((d) => { start[d.id] = new Date(resignCycleStart(d) || 0).getTime(); });
  return sigs.filter((s) => new Date(s.signed_at || 0).getTime() >= (start[String(s[key])] || 0));
}

/** Documents I haven't signed (in the current cycle). */
export function unsignedByMe<D extends { id: string }, S extends Sig>(docs: D[], mySigs: S[], key: keyof S): D[] {
  const signed = new Set(mySigs.map((s) => String(s[key])));
  return docs.filter((d) => !signed.has(d.id));
}

/** Who on the job's operative roster has / hasn't signed a document. Issued-by lines don't count as signing. */
export function signers<S extends Sig>(roster: string[], sigs: S[]): { signed: S[]; waiting: string[] } {
  const opSigs = sigs.filter((s) => !s.issued).sort((a, b) => new Date(a.signed_at || 0).getTime() - new Date(b.signed_at || 0).getTime());
  const done = new Set(opSigs.map((s) => s.user_id));
  return { signed: opSigs, waiting: roster.filter((id) => !done.has(id)) };
}

/** "3 of 5 operatives signed" / "✓ All 5 operatives on this job have signed". */
export function signedHeadline(total: number, waiting: number): string {
  if (!total) return '';
  if (!waiting) return `✓ All ${total} operative${total === 1 ? '' : 's'} on this job ${total === 1 ? 'has' : 'have'} signed`;
  return `${total - waiting} of ${total} operative${total === 1 ? '' : 's'} signed`;
}

/** A toolbox talk closes itself once every operative assigned to the job has signed. */
export function tbtAllSigned(operativeRoster: string[], signedIds: string[]): boolean {
  if (!operativeRoster.length) return false;
  const s = new Set(signedIds);
  return operativeRoster.every((id) => s.has(id));
}

export const TBT_STATUS_LABEL: Record<string, string> = { bank: 'BANK', live: 'LIVE', completed: 'COMPLETED' };

/* ---------- per-job tile visibility (sites.tile_visibility) ---------- */
export const TILE_VIS_ALL = ['site_manager', 'operative', 'driver'];
const CLIENT_HS = ['hs_rams', 'hs_coshh', 'hs_tbt', 'hs_havspuwer', 'hs_operatives'];
export function canSeeTile(site: { tile_visibility?: Record<string, string[]> | null } | null, key: string, role: string, def: string[] = TILE_VIS_ALL): boolean {
  // Clients see RAMS, COSHH, Toolbox Talks, completed tool inspections and the job's operatives (630 isClient branch).
  if (role === 'client') return !key.startsWith('hs_') || CLIENT_HS.includes(key);
  if (['pm', 'admin', 'superadmin'].includes(role)) return true;
  const v = site?.tile_visibility?.[key];
  return (Array.isArray(v) ? v : def).includes(role);
}

/* ---------- company H&S Policy (640) ---------- */
/** A policy signature counts if it's on or after the policy's current cycle start. */
export function policySigValid(doc: CycleDoc | null, sig: { signed_at: string | null } | null | undefined): boolean {
  if (!doc || !sig || !sig.signed_at) return false;
  return new Date(sig.signed_at).getTime() >= new Date(resignCycleStart(doc) || 0).getTime();
}
/** The gate: everyone except the platform admin (and Finance-only companies) must have signed the current policy. */
export function policyGatePending(role: string, financeOnly: boolean, doc: CycleDoc | null, mySigsOldestFirst: { signed_at: string | null }[]): boolean {
  if (role === 'superadmin' || financeOnly || !doc) return false;
  return !policySigValid(doc, mySigsOldestFirst[mySigsOldestFirst.length - 1]);
}
