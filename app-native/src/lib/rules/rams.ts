// RAMS Builder rules (585 / 586 / 588): PPE, groups at risk, likelihood and
// severity wording, risk colour bands, company details defaults, and turning
// library items into a job's own copies. Pure.

export const RAMS_PPE = [
  { key: 'dust', label: 'Dust Mask', icon: '😷' }, { key: 'ear', label: 'Ear Protection', icon: '🎧' }, { key: 'eye', label: 'Eye Protection', icon: '🥽' },
  { key: 'ffp3', label: 'FFP3 Mask', icon: '😷' }, { key: 'firstaid', label: 'First Aid Kit', icon: '⛑️' }, { key: 'hand', label: 'Hand Protection', icon: '🧤' },
  { key: 'hat', label: 'Hard Hat', icon: '⛑️' }, { key: 'hivis', label: 'Hi Visibility Vest', icon: '🦺' }, { key: 'boots', label: 'Safety Footwear', icon: '🥾' },
  { key: 'harness', label: 'Harness', icon: '🪢' }, { key: 'face', label: 'Face Shield', icon: '🛡️' }, { key: 'overalls', label: 'Overalls', icon: '👷' },
];
export const RAMS_DEFAULT_PPE = ['hat', 'boots', 'hivis', 'hand', 'eye'];
export const RAMS_GROUPS = ['Client Staff', 'Employees', 'Members of Public', 'Sub Contractors', 'Tenants', 'Visitors', 'Other Trades'];
export const P_LABELS = ['', 'Highly Unlikely', 'Unlikely', 'Possible', 'Probable', 'Certain'];
export const S_LABELS = ['', 'Trivial', 'Minor injury', 'Over 3 Day injury', 'Major injury or condition', 'Incapacity or Death'];

/** Colour bands match the RTB RAMS: 15+ red, 10–14 orange, 8–9 yellow, below green. */
export function riskBand(rr: number) {
  const n = Number(rr) || 0;
  if (n >= 15) return { bg: '#E0301E', fg: '#fff', label: 'Urgent' };
  if (n >= 10) return { bg: '#F39237', fg: '#fff', label: 'High' };
  if (n >= 8) return { bg: '#F4E04D', fg: '#1A1D21', label: 'Medium' };
  if (n >= 3) return { bg: '#9BD27A', fg: '#1A1D21', label: 'Low' };
  return { bg: '#CFE8C0', fg: '#1A1D21', label: 'Very low' };
}
export const rr = (p: unknown, s: unknown) => (Number(p) || 0) * (Number(s) || 0);

export type RamsSettings = { address: string; phone: string; dataProtection: string; nextRa: number; nextMs: number };
export function ramsSettings(raw: Partial<RamsSettings> | null | undefined, orgName: string | null | undefined): RamsSettings {
  const s = raw || {};
  return {
    address: s.address ?? '', phone: s.phone ?? '',
    dataProtection: s.dataProtection || `The information and data provided herein applies only to the contract for which it was written, it shall not be duplicated, disclosed or disseminated by the recipient in whole or in part for any purpose whatsoever without the prior written permission from ${orgName || 'the company'}.\n\nIt is the duty of all employees to observe the following Risk Assessment framed to provide a code of good practice and conduct with the object of preventing accidents. At all times employees must work in a safe manner both to prevent personal injury to themselves or to other personnel.`,
    nextRa: Number(s.nextRa) || 1, nextMs: Number(s.nextMs) || 1,
  };
}

export type LibItem = { id: string; kind: 'hazard' | 'section' | 'template'; title: string; sort_order: number | null; data: Record<string, unknown> | null };
export type Hazard = { id: string; libId?: string; title: string; harm: string; p: number; s: number; rp: number; rs: number; controls: string[] };
export type RSection = { id: string; libId?: string; part: 'general' | 'method'; title: string; body: string; steps: string[] };
export const ramsUid = () => `x${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;

export function hazardFromLib(it: LibItem): Hazard {
  const d = (it.data || {}) as Partial<Hazard>;
  return { id: ramsUid(), libId: it.id, title: it.title, harm: d.harm || '', p: d.p || 1, s: d.s || 1, rp: d.rp || 1, rs: d.rs || 1, controls: (d.controls || []).slice() };
}
export function sectionFromLib(it: LibItem): RSection {
  const d = (it.data || {}) as Partial<RSection>;
  return { id: ramsUid(), libId: it.id, part: d.part === 'method' ? 'method' : 'general', title: it.title, body: d.body || '', steps: (d.steps || []).slice() };
}
/** One per line, blanks dropped. */
export const lines = (t: string) => t.split('\n').map((x) => x.trim()).filter(Boolean);
/** Templates list items by title: a rename is carried into every template using it. */
export function renameInTemplate(data: Record<string, unknown>, key: 'hazards' | 'sections', from: string, to: string): Record<string, unknown> | null {
  const list = (data[key] as unknown[]) || [];
  if (!list.some((x) => x === from)) return null;
  return { ...data, [key]: list.map((x) => (x === from ? to : x)) };
}
/** New library order after moving one item (sections stay inside their own group). */
export function moveLib(items: LibItem[], id: string, dir: -1 | 1): LibItem[] | null {
  const i = items.findIndex((x) => x.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= items.length) return null;
  const part = (x: LibItem) => ((x.data || {}).part === 'method');
  if (items[i].kind === 'section' && part(items[i]) !== part(items[j])) return null;
  const out = items.slice(); [out[i], out[j]] = [out[j], out[i]];
  return out;
}

// ---------- A job's RAMS (586) ----------
export type RamsDetails = {
  raNumber: string; msNumber: string; date: string; reviewDate: string; author: string; project: string; startDate: string; duration: string;
  clientContact: string; description: string; address: string; notes: string; mainContractor: string; groups: string[];
  emergencyName: string; emergencyPhone: string; includeDynamic: boolean;
};
export type RamsBuild = {
  id: string; site_id: string; title: string; status: string | null; revision: number; details: RamsDetails; hazards: Hazard[]; sections: RSection[]; ppe: string[];
  ra_doc_id: string | null; ms_doc_id: string | null; updated_at?: string;
};
type SiteLike = { name?: string | null; client_contact_name?: string | null; client_name?: string | null; client_phone?: string | null; client_email?: string | null } | null | undefined;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** Client contact as entered on the job's Client Info tab. */
export function siteClientContact(site: SiteLike): string {
  if (!site) return '';
  const who = [site.client_contact_name, site.client_name && site.client_name !== site.client_contact_name ? `(${site.client_name})` : ''].filter(Boolean).join(' ');
  return [who, site.client_phone, site.client_email].filter(Boolean).join(' · ');
}
export function defaultDetails(site: SiteLike, address: string, author: string, st: RamsSettings, now = new Date()): RamsDetails {
  const review = new Date(now); review.setFullYear(review.getFullYear() + 1);
  return {
    raNumber: String(st.nextRa).padStart(10, '0'), msNumber: String(st.nextMs), date: iso(now), reviewDate: iso(review), author,
    project: site?.name || '', startDate: '', duration: '', clientContact: siteClientContact(site), description: '', address, notes: '', mainContractor: '', groups: [],
    emergencyName: author, emergencyPhone: '', includeDynamic: false,
  };
}
export const RAMS_REQUIRED: [keyof RamsDetails, string][] = [['clientContact', 'Client contact'], ['description', 'Description of works'], ['startDate', 'Start date']];
export const missingInfo = (d: Partial<RamsDetails>) => RAMS_REQUIRED.filter(([k]) => !String(d[k] || '').trim()).map(([, l]) => l);
function asList<T>(v: unknown): T[] { return Array.isArray(v) ? (v as T[]) : []; }
/** A saved row made safe to edit: lists are lists, details filled from the defaults. */
export function normaliseBuild(raw: Record<string, unknown>, defaults: RamsDetails, contact: string): RamsBuild {
  const details = { ...defaults, ...((raw.details as Partial<RamsDetails>) || {}) };
  if (!details.clientContact) details.clientContact = contact;
  if (!Array.isArray(details.groups)) details.groups = [];
  return { ...(raw as unknown as RamsBuild), revision: Number(raw.revision) || 0, details, hazards: asList<Hazard>(raw.hazards), sections: asList<RSection>(raw.sections), ppe: asList<string>(raw.ppe) };
}
/**
 * Starts a RAMS from any number of templates and other jobs' RAMS. An item in
 * more than one is only added once; templates name library items by title
 * (exact first, then ignoring case and spaces) and anything missing is reported.
 */
export function combineStart(lib: LibItem[], tplIds: string[], copies: { hazards?: unknown; sections?: unknown; ppe?: unknown; details?: Partial<RamsDetails> | null }[], details: RamsDetails) {
  const hazards: Hazard[] = [], sections: RSection[] = [], ppe = RAMS_DEFAULT_PPE.slice(), missing: string[] = [];
  const key = (x: { title?: string }) => String(x.title || '').trim().toLowerCase();
  const addH = (h: Hazard | null) => { if (h && !hazards.some((x) => key(x) === key(h))) hazards.push(h); };
  const addS = (x: RSection | null) => { if (x && !sections.some((y) => key(y) === key(x) && y.part === x.part)) sections.push(x); };
  const addGroups = (gs: unknown) => asList<string>(gs).forEach((g) => { if (!details.groups.includes(g)) details.groups.push(g); });
  const addPpe = (p: unknown) => asList<string>(p).forEach((k) => { if (!ppe.includes(k)) ppe.push(k); });
  const norm = (t: unknown) => String(t || '').trim().toLowerCase();
  const byTitle = (kind: string, t: string) => lib.find((i) => i.kind === kind && i.title === t) || lib.find((i) => i.kind === kind && norm(i.title) === norm(t));
  tplIds.forEach((id) => {
    const tpl = lib.find((i) => i.id === id); if (!tpl) return;
    const d = tpl.data || {};
    asList<unknown>(d.hazards).forEach((h) => {
      if (typeof h === 'string') { const f = byTitle('hazard', h); if (!f) missing.push(h); addH(f ? hazardFromLib(f) : null); }
      else addH({ ...(h as Hazard), id: ramsUid(), controls: asList<string>((h as Hazard).controls).slice() });
    });
    asList<unknown>(d.sections).forEach((x) => {
      if (typeof x === 'string') { const f = byTitle('section', x); if (!f) missing.push(x); addS(f ? sectionFromLib(f) : null); }
      else addS({ ...(x as RSection), id: ramsUid(), steps: asList<string>((x as RSection).steps).slice() });
    });
    addPpe(d.ppe); addGroups(d.groups);
  });
  copies.forEach((src, i) => {
    asList<Hazard>(src.hazards).forEach((h) => addH({ ...h, id: ramsUid(), controls: asList<string>(h.controls).slice() }));
    asList<RSection>(src.sections).forEach((x) => addS({ ...x, id: ramsUid(), steps: asList<string>(x.steps).slice() }));
    addPpe(src.ppe);
    const sd = src.details || {};
    addGroups(sd.groups);
    if (i === 0 && !tplIds.length) Object.assign(details, { description: sd.description || '', duration: sd.duration || '', includeDynamic: sd.includeDynamic !== false });
  });
  // General precautions first, then method statements, keeping their order.
  return { hazards, sections: sections.filter((x) => x.part !== 'method').concat(sections.filter((x) => x.part === 'method')), ppe, details, missing };
}
/** Moves an item in a job's list; sections move within their own part. */
export function moveItem<T extends { id: string; part?: string }>(arr: T[], id: string, dir: -1 | 1): T[] | null {
  const idx = arr.findIndex((x) => x.id === id); if (idx < 0) return null;
  let j = idx + dir;
  if (arr[idx].part !== undefined) while (j >= 0 && j < arr.length && arr[j].part !== arr[idx].part) j += dir;
  if (j < 0 || j >= arr.length) return null;
  const out = arr.slice(); [out[idx], out[j]] = [out[j], out[idx]];
  return out;
}
