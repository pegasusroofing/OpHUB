// The subcontractor form operatives fill in inside the app (867): the same
// questions as the public sign-up form. Pure: the questions and the
// "what's still missing" check.
export type SubQ = { k?: string; f?: string; l: string; type?: 'text' | 'textarea' | 'radio' | 'checks' | 'date' | 'email' | 'tel' | 'file'; req?: 1; o?: string[]; hint?: string; ph?: string; multi?: 1; showIf?: [string, string] };
export const SUBFORM_SECTIONS: { t: string; hint?: string; q: SubQ[] }[] = [
  { t: 'Your company', q: [
    { k: 'company_name', l: 'Company name', req: 1 },
    { k: 'trading_name', l: 'Trading name (if different)' },
    { k: 'company_type', l: 'Business type', type: 'radio', req: 1, o: ['Limited company', 'Sole trader', 'Partnership', 'LLP'] },
    { k: 'company_number', l: 'Company number' },
    { k: 'vat_number', l: 'VAT number' },
    { k: 'utr', l: 'UTR' },
    { k: 'cis_status', l: 'CIS status', type: 'radio', req: 1, o: ['Gross payment', '20% deduction', '30% deduction (not registered)'] },
    { k: 'address', l: 'Business / home address', type: 'textarea', req: 1 },
    { k: 'postcode', l: 'Postcode', req: 1 },
  ] },
  { t: 'Contact', q: [
    { k: 'contact_name', l: 'Your name', req: 1 },
    { k: 'email', l: 'Email', type: 'email', req: 1 },
    { k: 'phone', l: 'Mobile', type: 'tel', req: 1 },
  ] },
  { t: 'Your work', q: [
    { k: 'trades', l: 'Trades', type: 'checks', req: 1, hint: 'Tick all that apply', o: ['Flat roofing — felt', 'Single ply / EPDM', 'Liquid roofing', 'Pitched roofing — tiling / slating', 'Leadwork', 'Roof carpentry', 'Cladding', 'Fascias, soffits & gutters', 'Green roofs', 'Scaffolding', 'Labour only', 'Other'] },
    { k: 'other_trade', l: 'Other trade' },
    { k: 'areas', l: 'Areas you cover', ph: 'e.g. London & Home Counties' },
    { k: 'own_access', l: 'Do you have your own access equipment?', type: 'radio', o: ['Yes', 'No'] },
    { k: 'plant', l: 'Plant / equipment you supply' },
  ] },
  { t: 'Insurance', hint: 'Upload your current certificates.', q: [
    { k: 'pl_cover', l: 'Public liability cover', type: 'radio', req: 1, o: ['£1 million', '£2 million', '£5 million', '£10 million', 'Other'] },
    { k: 'pl_expiry', l: 'Public liability expiry', type: 'date', req: 1 },
    { k: 'el_cover', l: 'Employers liability cover', type: 'radio', o: ['£5 million', '£10 million', 'Not applicable (no employees)', 'Other'] },
    { k: 'el_expiry', l: 'Employers liability expiry', type: 'date' },
    { f: 'Public liability certificate', l: 'Public liability certificate', type: 'file', req: 1 },
    { f: 'Employers liability certificate', l: 'Employers liability certificate', type: 'file' },
  ] },
  { t: 'Accreditations & cards', q: [
    { k: 'accreditations', l: 'Which do you hold?', type: 'checks', o: ['CHAS', 'SMAS Worksafe', 'Constructionline', 'SafeContractor', 'Acclaim', 'NFRC', 'CompetentRoofer', 'ISO 9001', 'ISO 14001', 'ISO 45001'] },
    { k: 'other_accreditation', l: 'Other accreditation' },
    { f: 'Accreditation certificate', l: 'Accreditation certificates', type: 'file', multi: 1 },
    { f: 'CSCS / skills card', l: 'CSCS / skills cards', hint: 'Photos or scans of each card', type: 'file', multi: 1 },
  ] },
  { t: 'Health & safety', q: [
    { k: 'hs_policy', l: 'Do you have a written health & safety policy?', type: 'radio', req: 1, o: ['Yes', 'No'] },
    { f: 'H&S policy', l: 'H&S policy document', type: 'file' },
    { k: 'rams_ability', l: 'Can you produce your own RAMS?', type: 'radio', req: 1, o: ['Yes', 'No'] },
    { k: 'riddor', l: 'Any RIDDOR-reportable incidents in the last 3 years?', type: 'radio', req: 1, o: ['No', 'Yes'] },
    { k: 'riddor_detail', l: 'If yes, give details', type: 'textarea', showIf: ['riddor', 'Yes'] },
    { k: 'enforcement', l: 'Any HSE improvement / prohibition notices in the last 3 years?', type: 'radio', req: 1, o: ['No', 'Yes'] },
    { k: 'enforcement_detail', l: 'If yes, give details', type: 'textarea', showIf: ['enforcement', 'Yes'] },
  ] },
  { t: 'Anyone working with you', hint: 'Anyone else who may come on our sites with you — name, trade, CSCS card and expiry.', q: [
    { k: 'operatives', l: 'Names and cards', type: 'textarea', ph: 'e.g. Dan Jones — labourer — CSCS green, exp 03/2027' },
  ] },
  { t: 'References', q: [
    { k: 'ref1', l: 'Reference 1', ph: 'Company, contact name, phone or email' },
    { k: 'ref2', l: 'Reference 2', ph: 'Company, contact name, phone or email' },
  ] },
  { t: 'Anything else', q: [{ k: 'notes', l: 'Anything else we should know?', type: 'textarea' }] },
];
export type SubDraft = { data: Record<string, unknown>; files: Record<string, { name: string; path: string }[]>; agree: boolean; signed: string };
export const subQShown = (q: SubQ, data: Record<string, unknown>) => !q.showIf || data[q.showIf[0]] === q.showIf[1];

/** Keys of required answers still missing (file labels for files; __agree / __signed for the declaration). */
export function subformMissing(d: SubDraft): Set<string> {
  const miss = new Set<string>();
  SUBFORM_SECTIONS.forEach((s) => s.q.forEach((q) => {
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
