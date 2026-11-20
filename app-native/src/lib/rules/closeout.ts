// Subcontractor close-out (Andy, 20 Nov 2026: "ok i like the close out, our pm/site manager sign off / retention release
// might not always be relevant so all it to be an invoice only style job or application style for the subcontractor").
// Pure rules: the checks, and the retention sums for an applications-style subcontract.

export type CloseoutFacts = {
  tasks: number; tasksDone: number;
  omSubmitted: string | null; // when their latest O&M was submitted
  ramsApproved: number; ramsWaiting: number;
  permitsOpen: number; snagsOpen: number;
  finalAgreed: boolean;
};
export type CloseoutCheck = { key: string; label: string; ok: boolean; sub: string };

export function closeoutChecks(f: CloseoutFacts): CloseoutCheck[] {
  const day = (s: string | null) => (s ? new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
  return [
    { key: 'sow', label: 'Schedule Of Works Complete', ok: f.tasks === 0 || f.tasksDone >= f.tasks, sub: f.tasks ? `${f.tasksDone} of ${f.tasks} tasks given to them` : 'No tasks given to them' },
    { key: 'om', label: 'O&M Manual Submitted', ok: !!f.omSubmitted, sub: f.omSubmitted ? `Submitted ${day(f.omSubmitted)}` : 'Not submitted yet' },
    { key: 'rams', label: 'RAMS Approved', ok: f.ramsWaiting === 0 && f.ramsApproved > 0, sub: f.ramsApproved || f.ramsWaiting ? `${f.ramsApproved} approved${f.ramsWaiting ? ` · ${f.ramsWaiting} waiting or sent back` : ''}` : 'No RAMS uploaded' },
    { key: 'permits', label: 'No Open Permits', ok: f.permitsOpen === 0, sub: f.permitsOpen ? `${f.permitsOpen} still open` : 'All closed' },
    { key: 'snags', label: 'Their Snags Closed', ok: f.snagsOpen === 0, sub: f.snagsOpen ? `${f.snagsOpen} still open` : 'None open' },
    { key: 'final', label: 'Final Account Agreed', ok: f.finalAgreed, sub: f.finalAgreed ? 'Agreed' : 'Not yet' },
  ];
}

/** Retention held on an applications-style subcontract: half back at practical completion, half at the end of defects. */
export function retentionSplit(orderValue: number | null | undefined, pct: number | null | undefined): { held: number; half: number } | null {
  const v = Number(orderValue), p = Number(pct);
  if (!(v > 0) || !(p > 0)) return null;
  const held = Math.round(v * p) / 100;
  return { held, half: Math.round(held * 50) / 100 };
}
/** The end of defects: twelve months after practical completion, unless set. */
export function defectsEndFrom(pc: string | null | undefined): string {
  if (!pc || !/^\d{4}-\d{2}-\d{2}$/.test(pc)) return '';
  const d = new Date(`${pc}T00:00:00`); d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}
export const money = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
