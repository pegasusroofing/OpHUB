// New job pack: the rules a company keeps in Admin Centre › OneDrive › New job pack. A starting set, taken from RTB's
// "- New Job Pack - Template", is offered the first time, and everything in it can be changed in the app.
export type PackRule = { on: boolean; folder: string };
export type PackConfig = {
  parent_path: string; template_path: string;
  folders: string[];
  files: { folder: string; name: string }[];
  rules: Record<string, PackRule>;
  weekly: { name: string; addDate: boolean; weekStart: number; week1: 'start' | 'first' };
};

const PROG = '5. OpHUB x Photos & Inspections/1. Progress Reports (Safety Culture)';
const WEEK = `${PROG}/{week folder}`;
const HS = '2. Health & Safety';
const MC = `${HS}/4. Main Contractor Docs`;
const IND = `${MC}/2. Induction Forms & Competency Certs`;
export const WEEK_MARK = '{week folder}';

/** What each rule is, in the order the page lists them. */
export const PACK_RULES: { key: string; area: string; when: string; folder: string; on: boolean }[] = [
  { key: 'sow_prestart', area: 'Schedule of Works', when: 'Pre-start photo saved', folder: `${PROG}/1. Pre Start`, on: true },
  { key: 'sow_progress', area: 'Schedule of Works', when: 'Progress or completed photo saved', folder: WEEK, on: true },
  { key: 'sow_export', area: 'Schedule of Works', when: 'Export pressed, then OneDrive', folder: WEEK, on: true },
  { key: 'rams_issued', area: 'RAMS', when: 'RAMS issued', folder: `${HS}/1. RAMS`, on: true },
  { key: 'rams_superseded', area: 'RAMS', when: 'RAMS superseded (the old file stays)', folder: `${HS}/1. RAMS`, on: true },
  { key: 'tbt_issued', area: 'Toolbox talks', when: 'Talk issued on this job', folder: `${HS}/3. Toolbox Talks`, on: true },
  { key: 'coshh_added', area: 'COSHH', when: 'COSHH sheet added to this job', folder: `${HS}/2. COSHH`, on: true },
  { key: 'om_manual', area: 'O&M', when: 'O&M manual exported to OneDrive', folder: '8. Handover/2. Warranties & Inspections', on: true },
  { key: 'induction', area: 'Inductions', when: 'Induction completed', folder: `${IND}/1. Completed Inductions`, on: true },
  { key: 'permit_closed', area: 'Permits', when: 'Permit closed', folder: `${MC}/3. Permits to Work`, on: true },
  { key: 'incident', area: 'Incidents', when: 'Incident submitted', folder: `${MC}/4. Accident  Near Miss Reports`, on: false },
  { key: 'briefing', area: 'Daily briefings', when: 'Briefing completed', folder: WEEK, on: true },
  { key: 'report', area: 'Inspections and reports', when: 'Report completed', folder: WEEK, on: true },
  { key: 'variation_approved', area: 'Variations', when: 'Variation approved (its photo)', folder: '1. Contract & Commercial/3. Variations', on: true },
  { key: 'drawing_out', area: 'Drawings', when: 'File added in the app', folder: '3. Drawings & Technical/1. Project Drawings & Generic Spec', on: true },
  { key: 'drawing_in', area: 'Drawings', when: 'File added in OneDrive comes into the app', folder: '3. Drawings & Technical/1. Project Drawings & Generic Spec', on: true },
  { key: 'material_orders_in', area: 'Material orders', when: 'File added in OneDrive comes into the app', folder: '4. Subcontractors & Suppliers/4. Supplier Material Orders', on: true },
];

const FOLDERS = [
  '1. Contract & Commercial', '1. Contract & Commercial/1. Contract-Order', '1. Contract & Commercial/2. Estimating', '1. Contract & Commercial/3. Variations', '1. Contract & Commercial/4. Applications for Payment & Certificates',
  HS, `${HS}/1. RAMS`, `${HS}/2. COSHH`, `${HS}/3. Toolbox Talks`, MC, `${MC}/1. Construction Phase Plan`, IND, `${IND}/1. Completed Inductions`, `${IND}/2. Competency Certs`, `${IND}/3. Signing In Sheet`, `${MC}/3. Permits to Work`, `${MC}/4. Accident  Near Miss Reports`,
  '3. Drawings & Technical', '3. Drawings & Technical/1. Project Drawings & Generic Spec', '3. Drawings & Technical/2.  Manufacturers Specification', '3. Drawings & Technical/2.  Manufacturers Specification/1. U-Value Condensation Risk Calculations',
  '4. Subcontractors & Suppliers', '4. Subcontractors & Suppliers/1. Subcontractor Quotes & Orders', '4. Subcontractors & Suppliers/1. Subcontractor Quotes & Orders/1. Quotes', '4. Subcontractors & Suppliers/1. Subcontractor Quotes & Orders/2. Orders', '4. Subcontractors & Suppliers/3. Supplier Price Lists', '4. Subcontractors & Suppliers/4. Supplier Material Orders',
  '5. OpHUB x Photos & Inspections', PROG, `${PROG}/1. Pre Start`, '5. OpHUB x Photos & Inspections/2. Additional Photos',
  '6. Programme', '6. Programme/1. Programme', '7. Main Contractor Docs', '8. Handover', '8. Handover/2. Warranties & Inspections', '8. Handover/3. Defects  Snagging', '8. Handover/4. Practical Completion Certificate',
];
const FILES = [
  { folder: '1. Contract & Commercial/4. Applications for Payment & Certificates', name: 'RTB Roofing - Application for Payment.xlsx' },
  { folder: '3. Drawings & Technical', name: 'RTB_Drawing_Submittal_Tracker.xlsx' },
  { folder: '4. Subcontractors & Suppliers/1. Subcontractor Quotes & Orders', name: 'Sub Contractor Price.xlsx' },
  { folder: '6. Programme/1. Programme', name: 'RTB Programme Template.xlsx' },
  { folder: '6. Programme', name: 'RTB_Delivery_Schedule.xlsx' },
  { folder: '', name: 'RTB Handover Checklist.xlsx' },
];
export const startingPack = (): PackConfig => ({
  parent_path: 'RTB Roofing Ltd/Live Projects', template_path: 'RTB Roofing Ltd/Live Projects/- New Job Pack - Template',
  folders: [...FOLDERS], files: FILES.map((f) => ({ ...f })),
  rules: Object.fromEntries(PACK_RULES.map((r) => [r.key, { on: r.on, folder: r.folder }])),
  weekly: { name: '{order}. Week {n}', addDate: false, weekStart: 1, week1: 'start' },
});
/** What a week folder will be called, shown on the page as it's edited. */
export const weekExample = (w: PackConfig['weekly'], n: number) => `${w.name.replace('{order}', String(n + 1)).replace('{n}', String(n))}${w.addDate ? ' (w-c 02 Nov 2026)' : ''}`;
/** A folder path from what's typed: no empty levels, spaces trimmed, and a backslash treated as a level. */
export const cleanFolder = (s: string) => s.replace(/\\/g, '/').split('/').map((x) => x.trim()).filter(Boolean).join('/');
/** Anything that would stop the pack working, in plain words, or null. */
export function packProblem(c: PackConfig): string | null {
  if (!cleanFolder(c.parent_path)) return 'Say where new job folders go.';
  if (c.files.length && !cleanFolder(c.template_path)) return 'Say where the template folder is, as documents are copied from it.';
  if (!/\{n\}/.test(c.weekly.name)) return 'The week folder’s name needs {n} in it, so each week has its own folder.';
  return null;
}
