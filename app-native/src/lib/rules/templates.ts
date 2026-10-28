// Report template builder rules (420 / 100-state): question types, follow-up
// questions, moving and removing questions, answer types, and tidying before
// saving. Pure functions on plain template objects.
import type { ReportItem, ReportSection } from './reports';

export const FIELD_TYPES = [
  { k: 'text', lbl: 'Short Text' }, { k: 'textarea', lbl: 'Notes Box (long text)' }, { k: 'number', lbl: 'Number' },
  { k: 'passfail', lbl: 'Yes / No / N-A' }, { k: 'passfailwords', lbl: 'Pass / Fail / N-A' }, { k: 'ynnv', lbl: 'Yes / No / N-A / Not Visible' },
  { k: 'choice', lbl: 'Multiple Choice (pick one)' }, { k: 'multichoice', lbl: 'Multiple Choice (tick many)' }, { k: 'checkbox', lbl: 'Yes / No' },
  { k: 'photo', lbl: 'Photo(s)' }, { k: 'drawing', lbl: 'Drawing / plan mark-up (PDF or photo)' }, { k: 'operatives', lbl: 'Operatives On Site' },
  { k: 'date', lbl: 'Date' }, { k: 'signature', lbl: 'Signature' }, { k: 'instruction', lbl: 'Instruction Text (no answer)' },
];
export const AUTOFILL_OPTIONS = [
  { k: '', lbl: 'None', types: ['text', 'date'] }, { k: 'site_address', lbl: 'Site Address (from the site)', types: ['text'] },
  { k: 'today_date', lbl: "Today's Date", types: ['date'] }, { k: 'inspector_name', lbl: 'Inspector / Filler Name', types: ['text'] },
];
export const TRAFFIC_COLOURS = [
  { k: 'red', lbl: 'Red' }, { k: 'orange', lbl: 'Orange' }, { k: 'yellow', lbl: 'Yellow' }, { k: 'purple', lbl: 'Purple' }, { k: 'blue', lbl: 'Blue' }, { k: 'green', lbl: 'Green' },
  { k: 'grey', lbl: 'Grey' }, { k: 'pink', lbl: 'Pink' }, { k: 'teal', lbl: 'Teal' }, { k: 'brown', lbl: 'Brown' }, { k: 'black', lbl: 'Black' },
];
export const trafficDefaultLevels = () => [
  { id: 'tl_green', color: 'green', label: 'OK' }, { id: 'tl_yellow', color: 'yellow', label: 'Repair' },
  { id: 'tl_orange', color: 'orange', label: 'Replacement should be planned' }, { id: 'tl_red', color: 'red', label: 'Immediate replacement' },
];
export const YNNV_OPTIONS = ['Yes', 'No', 'N/A', 'Not Visible'];
export const NO_EXTRAS = ['instruction', 'photo', 'signature', 'operatives', 'drawing'];

export type AnswerSet = { id: string; name: string; options: string[]; multi?: boolean };
export type Item = ReportItem & { presetId?: string; mediaRequiredWhen?: unknown[] };
export type Section = Omit<ReportSection, 'items'> & { items: Item[] };

export const uid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);
export const newItem = (type = 'text'): Item => ({ id: uid(), type, label: type === 'textarea' ? 'Notes' : '', required: false, options: [], scored: false, showIf: undefined, allowMedia: true, mediaRequiredWhen: [] });

/** What the type picker shows as selected for a question. */
export function typeKey(it: Item, sets: AnswerSet[]): string {
  if (it.presetId === 'builtin_ynnv' && it.type === 'choice') return 'ynnv';
  if (it.presetId && (it.type === 'choice' || it.type === 'multichoice') && sets.some((s) => s.id === it.presetId)) return `set:${it.presetId}`;
  if (it.type === 'passfail' && it.pfWords) return 'passfailwords';
  return it.type;
}
/** Applies a picked type ("set:<id>", "ynnv", "passfailwords" or a plain type). */
export function setType(it: Item, v: string, sets: AnswerSet[]): Item {
  const n: Item = { ...it };
  if (v.startsWith('set:')) {
    const a = sets.find((s) => s.id === v.slice(4));
    if (a) { n.type = a.multi ? 'multichoice' : 'choice'; n.options = a.options.slice(); n.presetId = a.id; delete n.asButtons; }
  } else if (v === 'ynnv') { n.type = 'choice'; n.options = YNNV_OPTIONS.slice(); n.presetId = 'builtin_ynnv'; n.asButtons = true; }
  else if (v === 'passfailwords') { n.type = 'passfail'; n.pfWords = true; delete n.presetId; delete n.asButtons; }
  else { n.type = v; delete n.presetId; delete n.asButtons; delete n.pfWords; }
  return n;
}

/** Answers a follow-up can hang off, as the show-if rule stores them. */
export function followUpValues(it: Item): string[] {
  if (it.type === 'checkbox') return ['Yes', 'No'];
  if (it.type === 'passfail') return ['Pass', 'Fail', 'N/A'];
  if (it.type === 'choice' || it.type === 'multichoice') return (it.options || []).map((o) => String(o || '').trim()).filter(Boolean);
  return [];
}
/** Drops a follow-up straight after the question (after its existing follow-ups). */
export function addFollowUp(items: Item[], ii: number, value: string): { items: Item[]; id: string } {
  const parent = items[ii];
  let at = ii + 1;
  while (at < items.length && items[at].showIf?.qId === parent.id) at++;
  const nu: Item = { ...newItem('text'), showIf: { qId: parent.id, mode: 'equals', values: [value] } };
  const out = items.slice(); out.splice(at, 0, nu);
  return { items: out, id: nu.id };
}
/** Moves a question; a follow-up can't go above the question it depends on. */
export function moveItem(items: Item[], ii: number, dir: -1 | 1): Item[] | 'blocked' | null {
  const t = ii + dir;
  if (t < 0 || t >= items.length) return null;
  const a = items[ii], b = items[t];
  const upper = dir < 0 ? b : a, lower = dir < 0 ? a : b;
  if (lower.showIf?.qId === upper.id) return 'blocked';
  const out = items.slice(); const [m] = out.splice(ii, 1); out.splice(t, 0, m);
  return out;
}
/** Every follow-up depending on this question, however deep. */
export function dependents(items: Item[], id: string): Set<string> {
  const deps = new Set<string>(); let grew = true;
  while (grew) { grew = false; items.forEach((x) => { const q = x.showIf?.qId; if (q && !deps.has(x.id) && (q === id || deps.has(q))) { deps.add(x.id); grew = true; } }); }
  return deps;
}
export function removeItem(items: Item[], id: string, withFollowUps: boolean): Item[] {
  const deps = dependents(items, id);
  return items.filter((x) => x.id !== id && (!withFollowUps || !deps.has(x.id))).map((x) => (!withFollowUps && x.showIf?.qId === id ? { ...x, showIf: undefined } : x));
}
/** Earlier answerable questions in the same section, for "Only show this if…". */
export const triggerCandidates = (items: Item[], ii: number) => items.slice(0, ii).filter((c) => c.type !== 'instruction');
export const hasFixedOptions = (it: Item) => it.type === 'passfail' || it.type === 'choice' || it.type === 'checkbox';
export function triggerOptions(it: Item): string[] {
  if (it.type === 'passfail') return ['Pass', 'Fail', 'N/A'];
  if (it.type === 'checkbox') return ['Yes', 'No'];
  if (it.type === 'choice') return it.options || [];
  return [];
}
/** The answers a "photo required when…" rule can pick (true / false for Yes / No). */
export function ownValueOptions(it: Item): unknown[] | null {
  if (it.type === 'passfail') return ['Pass', 'Fail', 'N/A'];
  if (it.type === 'checkbox') return [true, false];
  if (it.type === 'choice' || it.type === 'multichoice') return it.options || [];
  return null;
}

/** Removing section 1 hands its traffic-light key and "show unanswered" to the new first section. */
export function removeSection(secs: Section[], si: number): Section[] {
  const out = secs.slice(); const [gone] = out.splice(si, 1);
  if (si === 0 && gone && out[0]) {
    out[0] = { ...out[0] };
    if (gone.traffic) out[0].traffic = gone.traffic;
    if (gone.showUnanswered === false) out[0].showUnanswered = false;
  }
  return out;
}

/** Trims answers and key labels; drops empty ones. */
export function cleanForSave(secs: Section[]): Section[] {
  return secs.map((s, i) => ({
    ...s,
    ...(i === 0 && s.traffic && Array.isArray(s.traffic.levels) ? { traffic: { ...s.traffic, levels: s.traffic.levels.map((l) => ({ ...l, label: String(l.label || '').trim() })).filter((l) => l.label) } } : {}),
    items: (s.items || []).map((it) => (Array.isArray(it.options) ? { ...it, options: it.options.map((o) => String(o || '').trim()).filter(Boolean) } : it)),
  }));
}
/** Answer types: trimmed, named from their answers when unnamed; null if one has no answers. */
export function cleanAnswerSets(sets: AnswerSet[]): AnswerSet[] | null {
  const out = sets.map((a) => ({ id: a.id, name: String(a.name || '').trim(), multi: !!a.multi, options: (a.options || []).map((o) => String(o || '').trim()).filter(Boolean) }));
  if (out.some((a) => !a.options.length)) return null;
  return out.map((a) => ({ ...a, name: a.name || a.options.join(' / ') }));
}
/** Questions built from an answer type pick up its new answers. */
export const applyAnswerSets = (secs: Section[], sets: AnswerSet[]): Section[] => secs.map((s) => ({
  ...s, items: s.items.map((it) => { const a = it.presetId ? sets.find((x) => x.id === it.presetId) : null; return a ? { ...it, options: a.options.slice(), type: a.multi ? 'multichoice' : 'choice' } : it; }),
}));
