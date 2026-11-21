// The subcontractor sign-up form: the questions the public sign-up page (/subcontractor) and the in-app form (/subform)
// both show, and the "what's still missing" check. Pure.
// A company can edit its own copy (Andy, 19 Nov 2026: "the sub contractor sign up form in settings, needs an edit
// button added as i need to edit the template"): saved in subform_templates; this is the standard form until then.
// The four core questions (company name, your name, email, mobile) always stay - the application is filed by them.
export type SubQType = 'text' | 'textarea' | 'radio' | 'checks' | 'date' | 'email' | 'tel' | 'number' | 'yesno' | 'file' | 'ops';
export type SubQ = {
  k?: string; f?: string; l: string; type?: SubQType; req?: 1; o?: string[]; hint?: string; ph?: string; multi?: 1; showIf?: [string, string];
  /** Shown beside the next half question on a laptop. */ half?: 1;
  /** A core question: can be renamed, never removed or changed. */ core?: 1;
  /** Yes / No asked No-first. */ first?: 'No';
};
export type SubSection = { t: string; hint?: string; q: SubQ[] };

export const SUB_TRADES = ['Flat roofing — felt', 'Single ply / EPDM', 'Liquid roofing', 'Pitched roofing — tiling / slating', 'Leadwork', 'Roof carpentry', 'Cladding', 'Fascias, soffits & gutters', 'Green roofs', 'Scaffolding', 'Labour only', 'Other'];
export const SUB_ACCREDS = ['CHAS', 'SMAS Worksafe', 'Constructionline', 'SafeContractor', 'Acclaim', 'NFRC', 'CompetentRoofer', 'ISO 9001', 'ISO 14001', 'ISO 45001'];

/** The standard form (as the public sign-up page had it, 18 Nov 2026). */
export const SUBFORM_SECTIONS: SubSection[] = [
  { t: 'Your Company', q: [
    { k: 'company_name', l: 'Company Name', req: 1, core: 1 },
    { k: 'trading_name', l: 'Trading Name (If Different)', half: 1 },
    { k: 'company_type', l: 'Business Type', type: 'radio', req: 1, half: 1, o: ['Limited company', 'Sole trader', 'Partnership', 'LLP'] },
    { k: 'company_number', l: 'Company Number', half: 1 },
    { k: 'vat_number', l: 'VAT Number', half: 1 },
    { k: 'utr', l: 'UTR', half: 1 },
    { k: 'cis_status', l: 'CIS Status', type: 'radio', req: 1, half: 1, o: ['Gross payment', '20% deduction', '30% deduction (not registered)'] },
    { k: 'address', l: 'Business Address', type: 'textarea', req: 1 },
    { k: 'postcode', l: 'Postcode', req: 1, half: 1 },
    { k: 'website_url', l: 'Website', half: 1 },
  ] },
  { t: 'Main Contact', q: [
    { k: 'contact_name', l: 'Your Name', req: 1, core: 1, half: 1 },
    { k: 'contact_role', l: 'Position', half: 1 },
    { k: 'email', l: 'Email', type: 'email', req: 1, core: 1, half: 1 },
    { k: 'phone', l: 'Mobile', type: 'tel', req: 1, core: 1, half: 1 },
    { k: 'office_phone', l: 'Office Phone', type: 'tel' },
  ] },
  // Next of kin (Andy, 21 Nov 2026): filled in for them at every site induction.
  { t: 'Next Of Kin', hint: 'Who we contact in an emergency. It fills in your site inductions for you.', q: [
    { k: 'kin_name', l: 'Next Of Kin Name', half: 1 },
    { k: 'kin_relationship', l: 'Relationship To You', half: 1 },
    { k: 'kin_phone', l: 'Their Phone Number', type: 'tel', half: 1 },
    { k: 'kin_address', l: 'Their Address', type: 'textarea' },
  ] },
  { t: 'Your Work', q: [
    { k: 'trades', l: 'Trades', type: 'checks', req: 1, hint: 'Tick all that apply', o: SUB_TRADES },
    { k: 'other_trade', l: 'Other Trade' },
    { k: 'areas', l: 'Areas You Cover', ph: 'e.g. London & Home Counties', half: 1 },
    { k: 'team_size', l: 'Operatives Available', type: 'number', half: 1 },
    { k: 'own_access', l: 'Do You Have Your Own Access Equipment?', type: 'yesno' },
    { k: 'plant', l: 'Plant / Equipment You Supply' },
  ] },
  { t: 'Insurance', hint: 'Upload your current certificates.', q: [
    { k: 'pl_cover', l: 'Public Liability Cover', type: 'radio', req: 1, half: 1, o: ['£1 million', '£2 million', '£5 million', '£10 million', 'Other'] },
    { k: 'pl_expiry', l: 'Public Liability Expiry', type: 'date', req: 1, half: 1 },
    { k: 'el_cover', l: 'Employers Liability Cover', type: 'radio', half: 1, o: ['£5 million', '£10 million', 'Not applicable (no employees)', 'Other'] },
    { k: 'el_expiry', l: 'Employers Liability Expiry', type: 'date', half: 1 },
    { k: 'pi_cover', l: 'Professional Indemnity', ph: 'If held', half: 1 },
    { k: 'car_cover', l: 'Contract Works Cover', ph: 'If held', half: 1 },
    { f: 'Public liability certificate', l: 'Public Liability Certificate', type: 'file', req: 1 },
    { f: 'Employers liability certificate', l: 'Employers Liability Certificate', type: 'file' },
  ] },
  { t: 'Accreditations', q: [
    { k: 'accreditations', l: 'Which Do You Hold?', type: 'checks', hint: 'Tick all that apply', o: SUB_ACCREDS },
    { k: 'other_accreditation', l: 'Other Accreditation' },
    { f: 'Accreditation certificate', l: 'Accreditation Certificates', type: 'file', multi: 1 },
  ] },
  { t: 'Health & Safety', q: [
    { k: 'hs_policy', l: 'Do You Have A Written Health & Safety Policy?', type: 'yesno', req: 1 },
    { f: 'H&S policy', l: 'H&S Policy Document', type: 'file' },
    { k: 'rams_ability', l: 'Can You Produce Your Own RAMS?', type: 'yesno', req: 1 },
    { k: 'competent_person', l: 'Who Is Your Competent Person For Health & Safety?', ph: 'Name and company' },
    { k: 'riddor', l: 'Any RIDDOR-Reportable Incidents In The Last 3 Years?', type: 'yesno', req: 1, first: 'No' },
    { k: 'riddor_detail', l: 'If Yes, Give Details', type: 'textarea', showIf: ['riddor', 'Yes'] },
    { k: 'enforcement', l: 'Any HSE Improvement / Prohibition Notices In The Last 3 Years?', type: 'yesno', req: 1, first: 'No' },
    { k: 'enforcement_detail', l: 'If Yes, Give Details', type: 'textarea', showIf: ['enforcement', 'Yes'] },
  ] },
  { t: 'Your Operatives', hint: 'Everyone who may work on our sites.', q: [
    { k: 'operatives', l: 'Operatives', type: 'ops' },
    { f: 'CSCS / skills card', l: 'CSCS / Skills Cards', type: 'file', multi: 1 },
  ] },
  { t: 'References', hint: 'Two recent clients or main contractors.', q: [
    { k: 'ref1', l: 'Reference 1', ph: 'Company, contact name, phone or email' },
    { k: 'ref2', l: 'Reference 2', ph: 'Company, contact name, phone or email' },
  ] },
  { t: 'Anything Else', q: [{ k: 'notes', l: 'Anything Else We Should Know?', type: 'textarea' }] },
];

export const SUB_TYPES: [SubQType, string][] = [['text', 'Short Answer'], ['textarea', 'Long Answer'], ['radio', 'Choose One'], ['checks', 'Tick Any'], ['yesno', 'Yes / No'], ['date', 'Date'],
  ['number', 'Number'], ['email', 'Email'], ['tel', 'Phone'], ['file', 'Upload Files'], ['ops', 'Operatives List']];
const CORE_KEYS = ['company_name', 'contact_name', 'email', 'phone'];
const TYPES = new Set(SUB_TYPES.map(([k]) => k));
export const subId = (q: SubQ) => (q.type === 'file' ? q.f : q.k) as string;
export const newSubKey = () => `q_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** A saved form made safe to show: known types, every question with a key, options where needed, no repeated keys, and
 *  the four core questions put back if missing (in Main Contact). Nothing saved: the standard form. */
export function subTemplate(raw: unknown): SubSection[] {
  if (!Array.isArray(raw) || !raw.length) return SUBFORM_SECTIONS;
  const seen = new Set<string>();
  const out: SubSection[] = (raw as SubSection[]).filter((s) => s && typeof s.t === 'string').map((s) => ({
    t: s.t.slice(0, 120), ...(s.hint ? { hint: String(s.hint).slice(0, 300) } : {}),
    q: (Array.isArray(s.q) ? s.q : []).filter((q) => q && typeof q.l === 'string' && (!q.type || TYPES.has(q.type))).map((q) => {
      const type = q.type || 'text';
      const c: SubQ = { ...q, l: q.l.slice(0, 200), type };
      if (type === 'file') { c.f = String(q.f || q.l).slice(0, 80); delete c.k; } else c.k = String(q.k || newSubKey()).slice(0, 60);
      if (type === 'radio' || type === 'checks') c.o = (q.o || []).map(String).filter((x) => x.trim()).slice(0, 40);
      if (CORE_KEYS.includes(c.k || '')) { c.core = 1; c.req = 1; }
      return c;
    }).filter((q) => { const id = subId(q); if (seen.has(id)) return false; seen.add(id); return true; }),
  }));
  const missing = SUBFORM_SECTIONS.flatMap((s) => s.q).filter((q) => q.core && !seen.has(subId(q)));
  if (missing.length) {
    const home = out.find((s) => /contact/i.test(s.t)) || out[0];
    if (home) home.q = [...missing, ...home.q]; else out.push({ t: 'Main Contact', q: missing });
  }
  return out;
}

export type SubDraft = { data: Record<string, unknown>; files: Record<string, { name: string; path: string }[]>; agree: boolean; signed: string };
export const subQShown = (q: SubQ, data: Record<string, unknown>) => !q.showIf || data[q.showIf[0]] === q.showIf[1];

/** Keys of required answers still missing (file labels for files; __agree / __signed for the declaration). */
export function subformMissing(d: SubDraft, sections: SubSection[] = SUBFORM_SECTIONS): Set<string> {
  const miss = new Set<string>();
  sections.forEach((s) => s.q.forEach((q) => {
    if (!q.req || !subQShown(q, d.data)) return;
    if (q.type === 'file') { if (!(d.files[q.f as string] || []).length) miss.add(q.f as string); return; }
    const v = d.data[q.k as string];
    if (Array.isArray(v) ? !v.length : !String(v ?? '').trim()) miss.add(q.k as string);
  }));
  if (d.data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(d.data.email))) miss.add('email');
  if (!d.agree) miss.add('__agree');
  if (!String(d.signed || '').trim()) miss.add('__signed');
  return miss;
}
