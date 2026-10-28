// Report/briefing rules, ported from 100-state.js (itemVisible, reportListsItem,
// scoring, pfLbl), 420 (itemAllowsNote) and 700-daily-briefings.js (weeks).
// Pure functions only. Used by Daily Briefings now and the full reports later.

export type ReportItem = {
  id: string; type: string; label: string; scored?: boolean; pfWords?: boolean; autofill?: string;
  allowMedia?: boolean; allowNote?: boolean; showIf?: { qId?: string; mode?: string; values?: unknown[] };
};
export type ReportSection = { id: string; title: string; items?: ReportItem[]; showUnanswered?: boolean };
export type Answers = Record<string, unknown>;

export const REPORT_STATUS_LABEL: Record<string, string> = { in_progress: 'In Progress', completed: 'Completed' };
export const PASSFAIL_LABEL: Record<string, string> = { Pass: 'Yes', Fail: 'No', 'N/A': 'N/A' };
export const pfLbl = (it: ReportItem, v: string) => (it.pfWords ? v : PASSFAIL_LABEL[v] || v);

export function isAnswered(val: unknown): boolean {
  if (val === undefined || val === null) return false;
  if (typeof val === 'string') return val.trim() !== '';
  if (Array.isArray(val)) return val.length > 0;
  return true; // booleans and numbers always count
}

/** "Only show this question if…" (showIf on another question's answer). */
export function itemVisible(it: ReportItem, answers: Answers | null | undefined): boolean {
  if (!it.showIf || !it.showIf.qId) return true;
  const raw = answers ? answers[it.showIf.qId] : undefined;
  if (it.showIf.mode === 'notblank') return isAnswered(raw);
  const values = it.showIf.values || [];
  if (Array.isArray(raw)) return raw.some((v) => values.includes(v));
  const val = typeof raw === 'boolean' ? (raw ? 'Yes' : 'No') : raw;
  return values.includes(val);
}

export function templateShowsUnanswered(sections: ReportSection[] | null | undefined): boolean {
  return !(sections && sections[0] && sections[0].showUnanswered === false);
}
export function reportListsItem(sections: ReportSection[], it: ReportItem, answers: Answers): boolean {
  if (templateShowsUnanswered(sections) || it.type === 'instruction') return true;
  const a = answers || {};
  return isAnswered(a[it.id]) || isAnswered(a[`${it.id}__note`]) || isAnswered(a[`${it.id}__media`]) || isAnswered(a[`${it.id}__tl`]);
}
export function reportListsSection(sections: ReportSection[], sec: ReportSection, answers: Answers): boolean {
  if (templateShowsUnanswered(sections)) return true;
  return (sec.items || []).some((it) => it.type !== 'instruction' && itemVisible(it, answers) && reportListsItem(sections, it, answers));
}

export function itemAllowsMedia(it: ReportItem): boolean {
  if (['photo', 'signature', 'instruction', 'operatives', 'drawing'].includes(it.type)) return false;
  if (it.autofill) return false;
  return it.allowMedia !== false;
}
export function itemAllowsNote(it: ReportItem): boolean {
  if (it.allowNote === false) return false;
  return !['instruction', 'photo', 'signature', 'operatives', 'drawing'].includes(it.type);
}

/** Pass/Fail and checkbox questions marked "count towards score". N/A is left out. */
export function scoreSections(sections: ReportSection[], answers: Answers) {
  const bySection: Record<string, { earned: number; possible: number }> = {};
  let oe = 0, op = 0;
  (sections || []).forEach((s) => {
    let earned = 0, possible = 0;
    (s.items || []).forEach((it) => {
      if (!it.scored || !itemVisible(it, answers)) return;
      const val = answers ? answers[it.id] : undefined;
      if (it.type === 'passfail') { if (val === 'N/A') return; possible += 1; if (val === 'Pass') earned += 1; }
      else if (it.type === 'checkbox') { possible += 1; if (val) earned += 1; }
    });
    if (possible > 0) { bySection[s.id] = { earned, possible }; oe += earned; op += possible; }
  });
  return { overall: { earned: oe, possible: op }, bySection };
}
export function scoreLabel(sc: { earned: number; possible: number } | undefined): string {
  if (!sc || sc.possible === 0) return '';
  return `${sc.earned} / ${sc.possible} (${Math.round((sc.earned / sc.possible) * 100)}%)`;
}

/** Plain-text answer for the simple question types. */
export function answerText(it: ReportItem, val: unknown): string {
  if (it.type === 'checkbox') return val === true ? 'Yes' : val === false ? 'No' : '—';
  if (it.type === 'passfail' && val) return pfLbl(it, String(val));
  if (it.type === 'multichoice') return Array.isArray(val) && val.length ? val.join(', ') : '—';
  if (val != null && val !== '') return String(val);
  return '—';
}

/* ---------- briefing weeks (Monday start) ---------- */
export function mondayOf(d: Date): Date {
  const dt = new Date(d); dt.setHours(0, 0, 0, 0);
  const day = dt.getDay();
  dt.setDate(dt.getDate() + (day === 0 ? -6 : 1 - day));
  return dt;
}
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const weekKeyOf = (d: Date) => iso(mondayOf(d));
export function weekLabelOf(mondayIso: string): string {
  const start = new Date(`${mondayIso}T00:00:00`);
  const end = new Date(start); end.setDate(end.getDate() + 6);
  const f = (dt: Date) => dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  return `Week of ${f(start)} – ${f(end)}`;
}
