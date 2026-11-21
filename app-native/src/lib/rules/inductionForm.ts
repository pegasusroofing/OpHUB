// The company's site induction form (Andy, 20 Nov 2026: "the inductions ... need to be a bit more of a customisable form
// that then creates a document for signing by operatives and adding info missing, ie next of kin etc"). Pure rules: the
// form's shape, the standard form, what's still missing, and what carries over from an operative's last induction.

export type IndType = 'tick' | 'yesno' | 'text' | 'phone' | 'date' | 'long';
export type IndItem = { id: string; label: string; type: IndType; required: boolean; detailsIfYes?: boolean };
export type IndSection = { id: string; title: string; note?: string; items: IndItem[] };
export type IndForm = { sections: IndSection[] };
/** An item's answer: true for a tick, 'yes' / 'no', or the text typed. A Yes's details go under `${id}__details`. */
export type IndAnswers = Record<string, string | boolean>;

export const IND_TYPE_LABEL: Record<IndType, string> = { tick: 'Tick To Confirm', yesno: 'Yes / No', text: 'Short Answer', long: 'Longer Answer', phone: 'Phone Number', date: 'Date' };
export const indUid = () => `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const STANDARD_TICKS = [
  "I have been shown this site's emergency procedures, including the fire exits, evacuation routes and the assembly point.",
  'I know the location of the first aid box and who the appointed first aiders are on this site.',
  'I understand I must wear the correct PPE for my task at all times on this site.',
  'I have been shown the site welfare facilities (toilets, drying room, canteen/rest area).',
  "I understand this site's permit-to-work requirements (e.g. hot works, confined spaces, working at height) and will not start such work without the correct permit in place.",
  'I have been made aware of the specific hazards on this site (traffic routes, excavations, overhead services, asbestos register where applicable).',
  'I understand how to report an accident, incident or near miss on this site.',
  'I agree to follow all site rules at all times, including signing in/out and wearing my ID badge.',
];
export const STANDARD_HEALTH = [
  ['Physical Fitness', 'Do you have any condition affecting your balance, mobility, or ability to lift loads?'],
  ['Working at Height', 'Do you suffer from vertigo, severe dizziness, or epilepsy?'],
  ['Sensory / Alertness', 'Do you have uncorrected visual or hearing impairments that impact site safety?'],
  ['Respiratory Health', 'Do you suffer from severe asthma or respiratory conditions aggravated by dust/fumes?'],
  ['Medication / Safety', 'Are you taking medication that causes drowsiness or restricts operating machinery?'],
  ['Emergency Info', 'Do you have any severe allergies (e.g., penicillin, latex, bee stings) or medical conditions (e.g., diabetes) that first aiders should be aware of?'],
];

/** The standard form: the company's tick list (kept item_0… so older answers still line up), next of kin, about you, and
 *  the health questionnaire (health_0…). */
export function standardInductionForm(ticks: string[] = STANDARD_TICKS): IndForm {
  return {
    sections: [
      { id: 'site', title: 'Site Induction', note: 'Read and confirm each item.', items: ticks.map((label, i) => ({ id: `item_${i}`, label, type: 'tick', required: true })) },
      { id: 'kin', title: 'Next Of Kin', note: 'Who we contact in an emergency.', items: [
        { id: 'kin_name', label: 'Name', type: 'text', required: true },
        { id: 'kin_relationship', label: 'Relationship To You', type: 'text', required: false },
        { id: 'kin_phone', label: 'Phone Number', type: 'phone', required: true },
        { id: 'kin_address', label: 'Address', type: 'long', required: false },
      ] },
      { id: 'about', title: 'About You', items: [
        { id: 'about_employer', label: 'Employer / Company', type: 'text', required: false },
        { id: 'about_trade', label: 'Trade', type: 'text', required: false },
        { id: 'about_cscs', label: 'CSCS Card Number', type: 'text', required: false },
        { id: 'about_cscs_expiry', label: 'CSCS Card Expiry', type: 'date', required: false },
        { id: 'about_firstaid', label: 'Do you hold an in-date first aid certificate?', type: 'yesno', required: false },
      ] },
      { id: 'health', title: 'Health Questionnaire', note: 'Any Yes needs a few details so we can keep you safe on site.', items: STANDARD_HEALTH.map(([cat, q], i) => ({ id: `health_${i}`, label: `${cat}: ${q}`, type: 'yesno', required: true, detailsIfYes: true })) },
    ],
  };
}

const TYPES: IndType[] = ['tick', 'yesno', 'text', 'phone', 'date', 'long'];
/** A saved form (or anything odd) with every field present; empty sections and items dropped. */
export function normaliseInductionForm(raw: Partial<IndForm> | null | undefined, ticks?: string[]): IndForm {
  const secs = Array.isArray(raw?.sections) ? raw.sections : null;
  if (!secs?.length) return standardInductionForm(ticks?.length ? ticks : STANDARD_TICKS);
  return {
    sections: secs.map((s, si) => ({
      id: String(s?.id || `s${si}`), title: String(s?.title || 'Section'), note: s?.note ? String(s.note) : undefined,
      items: (Array.isArray(s?.items) ? s.items : []).map((it, ii) => ({
        id: String(it?.id || `${s?.id || si}_${ii}`), label: String(it?.label || ''), type: TYPES.includes(it?.type as IndType) ? (it.type as IndType) : 'text',
        required: it?.required !== false, detailsIfYes: !!it?.detailsIfYes,
      })).filter((it) => it.label.trim()),
    })).filter((s) => s.items.length),
  };
}

const answered = (it: IndItem, a: IndAnswers) => {
  const v = a[it.id];
  if (it.type === 'tick') return v === true;
  if (it.type === 'yesno') return (v === 'yes' || v === 'no') && (v !== 'yes' || !it.detailsIfYes || !!String(a[`${it.id}__details`] || '').trim());
  return !!String(v ?? '').trim();
};
/** Required answers still to give, with the section they're on (so the form can open that tab). */
export function inductionMissing(form: IndForm, a: IndAnswers): { section: string; label: string }[] {
  const out: { section: string; label: string }[] = [];
  form.sections.forEach((s) => s.items.forEach((it) => {
    if (it.type === 'yesno' && a[it.id] === 'yes' && it.detailsIfYes && !String(a[`${it.id}__details`] || '').trim()) out.push({ section: s.id, label: `Details for: ${it.label}` });
    else if (it.required && !answered(it, a)) out.push({ section: s.id, label: it.label });
  }));
  return out;
}
/** Their emergency contact, for the induction record: the next of kin name and number. */
export function emergencyOf(a: IndAnswers): { name: string; number: string } {
  return { name: String(a.kin_name || '').trim(), number: String(a.kin_phone || '').trim() };
}
/** What carries over from their last induction (Andy: "adding info missing"): next of kin and about-you answers, not the
 *  ticks or health answers, which they give fresh on every site. */
export function carryOver(form: IndForm, prev: IndAnswers | null | undefined, legacy?: { name?: string | null; number?: string | null }): IndAnswers {
  const a: IndAnswers = {};
  form.sections.forEach((s) => s.items.forEach((it) => {
    if (it.type === 'tick' || it.type === 'yesno') return;
    const v = prev?.[it.id];
    if (typeof v === 'string' && v.trim()) a[it.id] = v;
  }));
  if (!a.kin_name && legacy?.name) a.kin_name = legacy.name;
  if (!a.kin_phone && legacy?.number) a.kin_phone = legacy.number;
  return a;
}
/** Their own line on the sign-up form's operatives list: a list of { name, trade, card, expiry } (the sign-up page), or
 *  lines of "Name — trade — CSCS card — expiry" (the in-app form). Theirs by name, or the only one listed. */
function ownCard(ops: unknown, name: string): { trade: string; card: string; expiry: string } {
  const none = { trade: '', card: '', expiry: '' };
  const rows: { name: string; trade: string; card: string; expiry: string }[] = Array.isArray(ops)
    ? ops.map((o) => { const x = (o || {}) as Record<string, unknown>; return { name: String(x.name || ''), trade: String(x.trade || ''), card: String(x.card || ''), expiry: String(x.expiry || '') }; })
    : typeof ops === 'string' ? ops.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [n = '', t = '', c = '', e = ''] = l.split(/\s*[—–|]\s*|\s+-\s+/); return { name: n, trade: t, card: c, expiry: e }; }) : [];
  const me = name.trim().toLowerCase();
  const r = rows.find((x) => me && x.name.trim().toLowerCase() === me) || (rows.length === 1 ? rows[0] : null);
  if (!r) return none;
  const e = r.expiry.trim(), uk = e.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  const expiry = /^\d{4}-\d{2}-\d{2}$/.test(e) ? e : uk ? `${uk[3]}-${uk[2].padStart(2, '0')}-${uk[1].padStart(2, '0')}` : '';
  return { trade: r.trade.trim(), card: r.card.trim(), expiry };
}
/** What their sign-up form already says (Andy, 21 Nov 2026: "The about you in the induction form should auto pull from
 *  the operatives sign up, even next of kin"): next of kin, employer, trade and CSCS card. Only items the company's form
 *  has, and only answers that are there. */
export function fromSignUp(form: IndForm, d: Record<string, unknown> | null | undefined, name: string | null | undefined): IndAnswers {
  if (!d) return {};
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const own = ownCard(d.operatives, String(name || ''));
  const trades = Array.isArray(d.trades) ? (d.trades as unknown[]).map((t) => String(t)).filter((t) => t && t !== 'Other') : [];
  if (str(d.other_trade)) trades.push(str(d.other_trade));
  const v: Record<string, string> = {
    kin_name: str(d.kin_name), kin_relationship: str(d.kin_relationship), kin_phone: str(d.kin_phone), kin_address: str(d.kin_address),
    about_employer: str(d.trading_name) || str(d.company_name), about_trade: own.trade || trades.join(', '), about_cscs: own.card, about_cscs_expiry: own.expiry,
  };
  const ids = new Set(form.sections.flatMap((s) => s.items.filter((it) => it.type !== 'tick' && it.type !== 'yesno').map((it) => it.id)));
  const a: IndAnswers = {};
  Object.entries(v).forEach(([k, x]) => { if (x && ids.has(k)) a[k] = x; });
  return a;
}
/** How an answer reads on the PDF. */
export function answerText(it: IndItem, a: IndAnswers): string {
  const v = a[it.id];
  if (it.type === 'tick') return v === true ? 'Confirmed' : 'Not confirmed';
  if (it.type === 'yesno') return v === 'yes' ? `Yes${a[`${it.id}__details`] ? ` - ${String(a[`${it.id}__details`])}` : ''}` : v === 'no' ? 'No' : '-';
  if (it.type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''))) return new Date(`${v}T00:00:00`).toLocaleDateString('en-GB');
  return String(v ?? '').trim() || '-';
}
