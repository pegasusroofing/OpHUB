// COSHH Builder rules (589): a product's blank details and standard wording,
// turning typed codes into official wording, the usual symbols / signal word
// for a set of H codes, manufacturer grouping and duplicate names. Pure.
import { COSHH_H, COSHH_P } from './coshhCodes.ts';

export const COSHH_PICTOS = [
  { key: 'GHS01', label: 'Explosive' }, { key: 'GHS02', label: 'Flammable' }, { key: 'GHS03', label: 'Oxidising' },
  { key: 'GHS04', label: 'Gas under pressure' }, { key: 'GHS05', label: 'Corrosive' }, { key: 'GHS06', label: 'Toxic' },
  { key: 'GHS07', label: 'Harmful / irritant' }, { key: 'GHS08', label: 'Serious health hazard' }, { key: 'GHS09', label: 'Environment' },
];
export const COSHH_ROUTES: [string, string][] = [['inhale', 'Breathing in'], ['skin', 'Skin contact'], ['eyes', 'Eyes'], ['swallow', 'Swallowing']];
export const COSHH_DEFAULTS = {
  firstAid: 'Eyes: rinse cautiously with clean water for several minutes, remove contact lenses if easy to do, keep rinsing and get medical advice if irritation persists.\nSkin: wash with plenty of soap and water; remove contaminated clothing.\nBreathed in: move to fresh air and rest; get medical advice if unwell.\nSwallowed: rinse mouth, do not make the person sick, get medical advice and show the container or label.',
  storage: 'Keep in the original container, tightly closed, in a cool, dry, well-ventilated place away from heat and ignition sources, and locked away from the public.',
  spill: 'Stop the leak if safe to do so, contain with sand or absorbent, scoop into a labelled container and stop it entering drains or watercourses.',
  disposal: 'Dispose of contents and containers through a licensed waste carrier in line with the data sheet. Do not pour into drains.',
  fire: 'Use extinguishing media suitable for the surrounding fire (as per the data sheet). Keep containers cool. Do not breathe smoke or fumes.',
};
export type CoshhData = {
  manufacturer: string; use: string; sdsPath: string; sdsName: string; pictos: string[]; signal: string; h: string[]; p: string[]; routes: string[]; ppe: string[];
  wel: string; controls: string; firstAid: string; storage: string; spill: string; disposal: string; fire: string; risk: string;
  needsCheck?: boolean; assessmentFileId?: string; assessmentFileIds?: string[]; assessedAt?: string; importedFrom?: string;
};
export type CoshhItem = { id: string; title: string; data: CoshhData; created_at?: string };
export const coshhBlank = (): CoshhData => ({ manufacturer: '', use: '', sdsPath: '', sdsName: '', pictos: [], signal: '', h: [], p: [], routes: [], ppe: ['hand', 'eye'], wel: '', controls: '', ...COSHH_DEFAULTS, risk: 'Low' });
export const coshhItem = (r: { id: string; title: string; data?: unknown; created_at?: string }): CoshhItem => ({ ...r, data: { ...coshhBlank(), ...((r.data as Partial<CoshhData>) || {}) } });

/** "h 315", "H315 + H319" → ["H315","H319"]; keeps combined P codes together ("P305+P351+P338"). */
export function parseCodes(str: string, kind: 'H' | 'P'): string[] {
  const src = String(str || '').replace(/\s*\+\s*/g, '+');
  const out: string[] = [];
  const add = (c: string) => { if (c && !out.includes(c)) out.push(c); };
  if (kind === 'P') { (src.toUpperCase().match(/P\s?\d{3}(?:\+P\s?\d{3})*/g) || []).forEach((c) => add(c.replace(/\s+/g, ''))); return out; }
  (src.match(/(?:EUH\s?\d{3}A?|H\s?\d{3}(?:i|FD|Fd|Df|fd|F|D|f|d)?)(?![0-9])/gi) || []).forEach((raw) => {
    const c = raw.replace(/\s+/g, '');
    if (/^euh/i.test(c)) { add(c.toUpperCase()); return; }
    const base = `H${c.slice(1, 4)}`, tail = c.slice(4);
    if (!tail) { add(base); return; }
    // keep the official spelling where it exists (H360Fd ≠ H360FD), otherwise the closest one
    if (COSHH_H[base + tail]) { add(base + tail); return; }
    const up = base + tail.toUpperCase(), low = base + tail.toLowerCase();
    if (COSHH_H[up]) add(up); else if (COSHH_H[low]) add(low); else add(base);
  });
  return out;
}
export function codeText(code: string): string {
  if (COSHH_H[code]) return COSHH_H[code];
  if (COSHH_P[code]) return COSHH_P[code];
  if (code.includes('+')) { const parts = code.split('+').map((p) => COSHH_P[p] || COSHH_H[p]); return parts.every(Boolean) ? parts.join(' ') : ''; }
  return COSHH_H[code.slice(0, 4)] || '';
}
/** Pictograms a set of H codes normally carries (a starting point — the data sheet wins). */
export function suggestPictos(h: string[]): string[] {
  const has = (re: RegExp) => h.some((c) => re.test(c));
  const out = new Set<string>();
  if (has(/^H20[0-5]|^H24[01]/)) out.add('GHS01');
  if (has(/^H22[0-8]|^H23[0-2]|^H24[12]|^H25[0-2]|^H26[01]/)) out.add('GHS02');
  if (has(/^H27[0-2]/)) out.add('GHS03');
  if (has(/^H28[01]/)) out.add('GHS04');
  if (has(/^H290|^H314|^H318/)) out.add('GHS05');
  if (has(/^H30[01]|^H31[01]|^H33[01]/)) out.add('GHS06');
  if (has(/^H30[4]|^H334|^H34[01]|^H35|^H36[01]|^H37[0-3]/)) out.add('GHS08');
  if (has(/^H400|^H41[01]/)) out.add('GHS09');
  // the exclamation mark is dropped where a stronger symbol already covers it
  if (has(/^H302|^H312|^H332|^H315|^H317|^H319|^H335|^H336|^H420/) && !out.has('GHS06')) out.add('GHS07');
  return COSHH_PICTOS.map((p) => p.key).filter((k) => out.has(k));
}
export function suggestSignal(h: string[]): string {
  if (!h.length) return '';
  // CLP 'Danger' hazard statements (the rest carry 'Warning').
  const danger = /^(H20[0-3]|H20[5-7]|H220|H222|H224|H225|H230|H231|H232|H240|H241|H250|H251|H260|H270|H271|H300|H301|H304|H310|H311|H314|H318|H330|H331|H334|H340|H350|H360|H370|H372)/;
  return h.some((c) => danger.test(c)) ? 'Danger' : 'Warning';
}
/** Routes of harm implied by the H codes (added to, never removed). */
export function routesFor(h: string[], routes: string[]): string[] {
  const out = routes.slice(), add = (r: string) => { if (!out.includes(r)) out.push(r); };
  if (h.some((c) => /^H33|^H304/.test(c))) add('inhale');
  if (h.some((c) => /^H31[0-7]|^EUH066/.test(c))) add('skin');
  if (h.some((c) => /^H31[489]/.test(c))) add('eyes');
  if (h.some((c) => /^H30[0-4]/.test(c))) add('swallow');
  return out;
}
export const titleKey = (t: string) => String(t || '').toLowerCase().replace(/[–—-]/g, '-').replace(/\s+/g, ' ').trim();
/** "Company designation Bauder Ltd." / "Supplier Bauder Ltd" → "Bauder Ltd" */
export const cleanMaker = (m: string) => String(m || '').replace(/^\s*(company\s*designation|company\s*name|company|supplier(\s*name)?|manufacturer(\s*name)?|name)\s*[:-]?\s*/i, '').replace(/\.\s*$/, '').trim();
/** Manufacturer names come in several spellings — reduce them to one brand for the filter. */
export function brandOf(lib: CoshhItem[]): (i: CoshhItem) => string {
  const norm = (m: string) => String(m || '').toLowerCase().replace(/&/g, ' ').replace(/\b(ltd|limited|plc|gmbh|co|kg|uk|llp|inc|group|the|and)\b/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const keys = Array.from(new Set(lib.map((i) => norm(i.data.manufacturer)).filter(Boolean))), map: Record<string, string> = {};
  keys.forEach((k) => {
    const toks = k.split(' ').filter((t) => t.length >= 4);
    const shorter = keys.filter((o) => o !== k && o.length < k.length && toks.includes(o.split(' ')[0]));
    map[k] = shorter.length ? shorter.sort((a, b) => a.length - b.length)[0] : k;
  });
  return (i) => { const n = norm(i.data.manufacturer); return n ? map[n].replace(/\b\w/g, (c) => c.toUpperCase()) : 'No manufacturer'; };
}
/** Extra copies of the same product name (the first one made is kept). */
export function duplicates(lib: CoshhItem[]): CoshhItem[] {
  const seen: Record<string, boolean> = {}, extra: CoshhItem[] = [];
  lib.slice().sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()).forEach((it) => { const k = titleKey(it.title); if (seen[k]) extra.push(it); else seen[k] = true; });
  return extra;
}
export const assessName = (title: string) => `COSHH Assessment - ${String(title || '').replace(/[\\/:*?"<>|]+/g, '-')}.pdf`;
