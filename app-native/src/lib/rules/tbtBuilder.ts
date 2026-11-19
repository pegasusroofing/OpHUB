// Toolbox Talk builder (Andy, 19 Nov 2026: "create a tbt which mimics the existing designs in rtb roofing please. add it
// so we can have a template to create"). A talk in RTB Roofing's layout: the company's name, address and logo at the
// top, "{Title} - TOOLBOX TALK" in a black bar, Prepare / Reason / Why / Outline, numbered sections each ending with a
// question, "Do you have any questions for me?", Questions for you, a closing line in capitals, then the Sign Off
// Sheet. Saved as a company Toolbox Talk template (tbt_templates, with what it was made from in `builder`).

export type TbtSection = { heading: string; points: string; question: string };
export type TbtBuild = {
  title: string; prepare: string; reason: string; why: string; outline: string;
  sections: TbtSection[]; questions: string; remember: string;
};

export const blankSection = (): TbtSection => ({ heading: '', points: '', question: '' });
/** A new talk: the boxes RTB Roofing's talks have, empty, with one section to start. */
export const blankTbt = (): TbtBuild => ({
  title: '', prepare: 'Has the company had any incidents in the last 12 months?', reason: '', why: '', outline: '',
  sections: [blankSection()], questions: '', remember: '',
});

/** The lines of a box typed one per line, without blanks or typed-in numbers / bullets. */
export function lines(t: string | null | undefined): string[] {
  return String(t || '').split('\n').map((l) => l.replace(/^\s*(?:\d+[.)]|[-•*]|Q[.:]?)\s+/, '').trim()).filter(Boolean);
}

/** A saved talk (or anything else) made safe to open in the builder. */
export function readTbt(x: unknown): TbtBuild {
  const o = (x && typeof x === 'object' ? x : {}) as Partial<TbtBuild>;
  const s = (v: unknown) => (typeof v === 'string' ? v : '');
  const secs = Array.isArray(o.sections) ? o.sections.map((q) => ({ heading: s(q?.heading), points: s(q?.points), question: s(q?.question) })) : [];
  return { title: s(o.title), prepare: s(o.prepare), reason: s(o.reason), why: s(o.why), outline: s(o.outline), sections: secs.length ? secs : [blankSection()], questions: s(o.questions), remember: s(o.remember) };
}

/** What still needs filling in before it can be saved, or null when it's ready. */
export function tbtProblem(b: TbtBuild): string | null {
  if (!b.title.trim()) return 'Give the talk a title.';
  if (!b.sections.some((x) => x.heading.trim() && lines(x.points).length)) return 'Add at least one section with a heading and some points.';
  return null;
}

/** The talk's PDF name, e.g. "Working at Height - TBT.pdf" (as RTB Roofing's are named). */
export const tbtFileName = (title: string) => `${title.trim().replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80) || 'Toolbox Talk'} - TBT.pdf`;
