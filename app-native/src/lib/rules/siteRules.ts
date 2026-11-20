// Site Rules & Layout sheet builder (Andy, 20 Nov 2026: "the site rules and layouts need to be a customisable (template
// style) sheet, where we can add in numbered items and it creates a pdf with the site rules etc. allow upload still but
// needs to be a bit like the rams build"). Pure rules only: the sheet's shape, the standard rules and what's missing.
import { CPP_SITE_HOURS, CPP_TEMPLATE } from './cpp';

export type SiteRulesInfo = {
  siteHours: string; assembly: string; firstAid: string; firstAiders: string; welfare: string; ppe: string;
  smoking: string; parking: string; emergencyName: string; emergencyPhone: string;
};
export type SiteRulesRevision = { version: number; date: string; by: string; note: string; docId?: string | null; path?: string | null };
export type SiteRulesMarks = { base: string | null; ops: unknown[] };
export type SiteRulesDoc = {
  title: string; siteName: string; siteAddress: string; intro: string; info: SiteRulesInfo; rules: string[];
  layout: string | null; layoutMarks: SiteRulesMarks; revisions: SiteRulesRevision[];
};

/** The 21 standard rules: the numbered lines of the CPP's site rules (section 2.1). */
export const DEFAULT_SITE_RULES: string[] = (CPP_TEMPLATE.find((s) => s.num === '2')?.body || '')
  .split('\n').map((l) => l.trim()).filter((l) => /^\d+\.\s+/.test(l)).map((l) => l.replace(/^\d+\.\s+/, ''));
export const SITE_RULES_INTRO = 'These rules apply to everyone on this site: our own people, subcontractors and visitors. They are shown at induction and displayed in the site office and welfare. Anyone who disregards them will be asked to leave site.';
export const SITE_RULES_INFO_LABELS: [keyof SiteRulesInfo, string, string][] = [
  ['siteHours', 'Site Hours', 'e.g. 8.00am - 5.00pm Monday - Friday'],
  ['assembly', 'Fire Assembly Point', 'e.g. Front car park, by the gate'],
  ['firstAid', 'First Aid Box', 'e.g. Site office'],
  ['firstAiders', 'First Aiders', 'Names'],
  ['welfare', 'Welfare (Toilets, Canteen, Drying Room)', 'Where they are'],
  ['ppe', 'PPE Required At All Times', 'e.g. Hard hat, safety boots, hi-vis, gloves'],
  ['smoking', 'Smoking Area', 'e.g. Designated area by the skip only'],
  ['parking', 'Parking And Deliveries', 'Where to park, how deliveries come in'],
  ['emergencyName', 'Site Contact', 'Name'],
  ['emergencyPhone', 'Site Contact Phone', 'Number'],
];

const blankInfo = (): SiteRulesInfo => ({ siteHours: CPP_SITE_HOURS.replace(/^The hours on site will be\s*/i, '').replace(/\.\s*Weekend.*$/i, '').trim(), assembly: '', firstAid: '', firstAiders: '', welfare: '', ppe: 'Hard hat, safety boots, hi-vis, gloves and eye protection as the task needs', smoking: '', parking: '', emergencyName: '', emergencyPhone: '' });
export function blankSiteRules(): SiteRulesDoc {
  return { title: 'Site Rules', siteName: '', siteAddress: '', intro: SITE_RULES_INTRO, info: blankInfo(), rules: [...DEFAULT_SITE_RULES], layout: null, layoutMarks: { base: null, ops: [] }, revisions: [] };
}
/** A saved sheet (or an older shape of one) with every field present. */
export function normaliseSiteRules(raw: Partial<SiteRulesDoc> | null | undefined): SiteRulesDoc {
  const b = blankSiteRules(), r = raw || {};
  return {
    ...b, ...r,
    info: { ...b.info, ...(r.info || {}) },
    rules: Array.isArray(r.rules) ? r.rules.map((x) => String(x ?? '')) : b.rules,
    layoutMarks: { ...b.layoutMarks, ...(r.layoutMarks || {}) },
    revisions: Array.isArray(r.revisions) ? r.revisions : [],
  };
}
/** What still needs filling in before the sheet is issued. */
export function siteRulesMissing(d: SiteRulesDoc): string[] {
  const m: string[] = [];
  if (!d.rules.some((x) => x.trim())) m.push('At least one rule');
  if (!d.siteName.trim()) m.push('Site name');
  if (!d.info.assembly.trim()) m.push('Fire assembly point');
  if (!d.info.emergencyPhone.trim()) m.push('Site contact phone');
  return m;
}
/** The company template keeps the wording, not one job's details. */
export function templateOf(d: SiteRulesDoc): SiteRulesDoc {
  return { ...d, siteName: '', siteAddress: '', layout: null, layoutMarks: { base: null, ops: [] }, revisions: [], info: { ...d.info, firstAiders: '', emergencyName: '', emergencyPhone: '', assembly: '', parking: '' } };
}
