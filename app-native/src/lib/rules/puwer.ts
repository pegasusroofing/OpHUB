// PUWER weekly tool inspection rules, ported from 680-puwer-tool-inspection.js.

export const PUWER_QUESTIONS = [
  { key: 'q_suitability', label: 'Suitability', text: 'Is the tool or machine right for the specific job you are using it for?' },
  { key: 'q_guarding', label: 'Guarding', text: 'Are all safety guards, interlocks, and protective devices present, secure, and working properly?' },
  { key: 'q_controls', label: 'Controls', text: 'Do the start, stop, and speed controls function correctly, and are emergency stop buttons easy to reach?' },
  { key: 'q_maintenance', label: 'Maintenance & Condition', text: 'Is there any sign of damage, excessive wear, corrosion, leaks, or electrical faults?' },
  { key: 'q_markings', label: 'Markings & Warnings', text: 'Are all safety signs, operational instructions, and warning labels clear and easy to read?' },
] as const;
export type PuwerKey = (typeof PUWER_QUESTIONS)[number]['key'];
export type PuwerTool = { dbId: string | null; toolId: string | null; name: string; serial_number: string | null; photo_path: string | null } & Record<PuwerKey, boolean>;

export const UNTICK_WARNING = 'This tool cannot be used until brought in line with PUWER regulations.';

/** A tool is acceptable only with every box ticked. */
export const toolPasses = (t: Record<PuwerKey, boolean>) => PUWER_QUESTIONS.every((q) => !!t[q.key]);

/**
 * Tools on the form: those already on this week's inspection (in their saved order),
 * then any of the person's registered tools not on it yet. New rows start unticked when
 * you fill your own (you must confirm each check) and ticked when a manager fills it.
 */
export function buildPuwerTools(
  saved: (Omit<PuwerTool, 'dbId' | 'toolId'> & { id: string; tool_id: string | null })[],
  owned: { id: string; name: string; serial_number: string | null; photo_path: string | null }[],
  defaultTicked: boolean,
): PuwerTool[] {
  const out: PuwerTool[] = saved.map((t) => ({
    dbId: t.id, toolId: t.tool_id, name: t.name, serial_number: t.serial_number, photo_path: t.photo_path,
    q_suitability: !!t.q_suitability, q_guarding: !!t.q_guarding, q_controls: !!t.q_controls, q_maintenance: !!t.q_maintenance, q_markings: !!t.q_markings,
  }));
  const have = new Set(saved.map((t) => t.tool_id).filter(Boolean));
  owned.forEach((o) => {
    if (have.has(o.id)) return;
    out.push({ dbId: null, toolId: o.id, name: o.name, serial_number: o.serial_number, photo_path: o.photo_path,
      q_suitability: defaultTicked, q_guarding: defaultTicked, q_controls: defaultTicked, q_maintenance: defaultTicked, q_markings: defaultTicked });
  });
  return out;
}
