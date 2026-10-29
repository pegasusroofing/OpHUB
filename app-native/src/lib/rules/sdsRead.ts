// Safety Data Sheet reader, no AI (589 coshhReadSds / coshhApplySds). Every SDS
// has the same 16 numbered sections (UK/EU REACH), though layouts differ: the
// text is split at those headings, then each part is tidied up for the COSHH
// form — H / P codes, hazard symbols, signal word, product, maker, use, WEL,
// first aid, fire, spills, storage, controls, disposal and PPE. Pure (the PDF's
// text comes from lib/pdfjs).
import { cleanMaker, codeText, COSHH_DEFAULTS, COSHH_PICTOS, parseCodes, suggestPictos, suggestSignal, type CoshhData } from './coshh.ts';

const SDS_SECTIONS: [number, string][] = [
  [1, 'identification'], [2, 'hazards?\\s*identification'], [3, 'composition'], [4, 'first[\\s-]*aid'], [5, 'fire[\\s-]*fighting'],
  [6, 'accidental\\s*release'], [7, 'handling\\s*and\\s*storage'], [8, 'exposure\\s*controls'], [9, 'physical'],
  [10, 'stability'], [11, 'toxicolog'], [12, 'ecolog'], [13, 'disposal'], [14, 'transport'], [15, 'regulatory'], [16, 'other\\s*information'],
];

/** Lines repeated on most pages are headers / footers — drop them, and "Page x of y". */
export function dropRepeats(pages: string[]): string {
  const count: Record<string, number> = {};
  pages.forEach((p) => { new Set(p.split('\n').map((l) => l.trim()).filter(Boolean)).forEach((l) => { count[l] = (count[l] || 0) + 1; }); });
  const minRep = Math.max(3, Math.ceil(pages.length * 0.6));
  return pages.map((p) => p.split('\n').filter((l) => { const t = l.trim(); return !(count[t] >= minRep) && !/^pag\s*e\s*\d+\s*(of|\/)\s*\d+$/i.test(t) && !/^page\s*\d+\s*(of|\/)\s*\d+$/i.test(t); }).join('\n')).join('\n');
}
export function sdsSplit(text: string): Record<number, string> {
  const pos: Record<number, number> = {};
  let from = 0;
  SDS_SECTIONS.forEach(([n, kw]) => {
    const re = new RegExp(`(?:^|\\n)[ \\t]*(?:section|SECTION|Section)?[ \\t]*${n}[ \\t]*[.:\\-–)]?[ \\t]*(?:[A-Za-z ]{0,15})?${kw}`, 'i');
    const m = re.exec(text.slice(from));
    if (m) { pos[n] = from + m.index; from = pos[n] + 4; }
  });
  const out: Record<number, string> = {};
  const keys = Object.keys(pos).map(Number).sort((a, b) => a - b);
  keys.forEach((n, i) => { out[n] = text.slice(pos[n], i + 1 < keys.length ? pos[keys[i + 1]] : text.length); });
  return out;
}
/** A section made fit for a text box: no heading, wrapped lines joined, "Eye contact:"-style labels on new lines. */
export function sdsTidy(t: string | undefined, max?: number): string {
  if (!t) return '';
  let lines = t.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  lines.shift();
  lines = lines.filter((l) => !/^(SECTION|Section)\s*\d+/.test(l) && !/^\d{1,2}\.\d{1,2}\.?\s*$/.test(l));
  let out = '';
  lines.forEach((l0) => {
    let l = l0.replace(/^\d{1,2}\.\d{1,2}(\.\d)?\.?\s+/, '');
    l = l.replace(/^description of first[\s-]*aid measures\s*:?\s*/i, '');
    l = l.replace(/^(extinguishing media|suitable extinguishing (?:media|equipment)|unsuitable extinguishing (?:media|equipment)|special hazards arising from the substance or mixture|advice for fire[\s-]*fighters|personal precautions[^:]{0,60}|environmental precautions|methods and materials? for containment and cleaning up|methods for cleaning up|precautions for safe handling|conditions for safe storage[^:]{0,60}|waste treatment methods)\s*:?\s*/i, (_m0, x: string) => `${x.charAt(0).toUpperCase()}${x.slice(1).toLowerCase()}: `);
    if (!l) return;
    const startsNew = /^[A-Z][A-Za-z /()\-]{2,45}[:\-–]/.test(l) || /^[•\-–]\s/.test(l) || /[.:]$/.test(out);
    out += out ? (startsNew ? '\n' : ' ') + l : l;
  });
  out = out.replace(/\n{2,}/g, '\n').replace(/[ \t]{2,}/g, ' ').replace(/: \n/g, ':\n').trim();
  if (max && out.length > max) { out = out.slice(0, max); out = `${out.slice(0, Math.max(out.lastIndexOf('. '), max - 80) + 1)} (see data sheet)`; }
  return out;
}
/** One numbered sub-part of a section (e.g. 4.1), kept with a dummy first line for sdsTidy to drop. */
export function sdsSub(sec: string | undefined, n: number, sub: number): string {
  if (!sec) return '';
  const m = new RegExp(`(?:^|\\n)[ \\t]*${n}\\.${sub}\\b`).exec(sec); if (!m) return '';
  const rest = sec.slice(m.index + 1);
  const nx = new RegExp(`\\n[ \\t]*${n}\\.${sub + 1}\\b`).exec(rest);
  return `x\n${nx ? rest.slice(0, nx.index) : rest}`;
}

export type SdsFound = { h: string[]; p: string[]; pictos: string[]; signal: string; manufacturer: string; product: string; use: string; wel: string; firstAid: string; fire: string; spill: string; storage: string; disposal: string; controls: string; ppe: string[] };
export function readSds(text: string): SdsFound {
  const res: SdsFound = { h: [], p: [], pictos: [], signal: '', manufacturer: '', product: '', use: '', wel: '', firstAid: '', fire: '', spill: '', storage: '', disposal: '', controls: '', ppe: [] };
  if (!text.trim()) return res;
  const S = sdsSplit(text);
  const s2 = S[2] || text.slice(0, 8000);
  res.h = parseCodes(s2, 'H').filter((c) => codeText(c));
  res.p = parseCodes(s2, 'P').filter((c) => codeText(c));
  res.pictos = COSHH_PICTOS.map((p) => p.key).filter((k) => new RegExp(k.replace('0', '0?'), 'i').test(s2));
  const sw = /Signal\s*words?\s*[:\-]?\s*(Danger|Warning)/i.exec(s2); if (sw) res.signal = sw[1][0].toUpperCase() + sw[1].slice(1).toLowerCase();
  const s1 = S[1] || text.slice(0, 3000);
  const pick = (re: RegExp) => { const m = re.exec(s1); return m ? m[1].replace(/\s+/g, ' ').trim().replace(/[.,;]$/, '') : ''; };
  res.product = pick(/(?:Product\s*name|Trade\s*name)[ \t]*[:\-]?[ \t]*([^\n]{3,90})/i) || pick(/Product\s*identifier[ \t]*[:\-][ \t]*([^\n]{3,90})/i);
  res.use = pick(/(?:Intended\s*use|Identified\s*uses?|Recommended\s*use|Use\s*of\s*the\s*(?:substance|mixture))[ \t]*[:\-][ \t]*([^\n]{3,90})/i);
  res.manufacturer = pick(/(?:Company\s*name|Supplier|Manufacturer)[ \t]*(?:name)?[ \t]*[:\-][ \t]*([^\n]{3,120})/i) || (() => { const m = /1\.3[^\n]*\n\s*([^\n]{3,120})/.exec(s1); return m ? m[1].replace(/\s+/g, ' ').trim() : ''; })();
  res.manufacturer = cleanMaker(res.manufacturer);
  if (/^(name|address|details|of the)/i.test(res.manufacturer)) res.manufacturer = '';
  res.firstAid = sdsTidy(sdsSub(S[4], 4, 1) || S[4], 900);
  res.fire = sdsTidy(S[5], 600);
  res.spill = sdsTidy((sdsSub(S[6], 6, 2) || '') + (sdsSub(S[6], 6, 3) || '').replace(/^x\n/, '\n') || S[6], 700);
  res.storage = sdsTidy(sdsSub(S[7], 7, 2) || S[7], 600);
  res.controls = sdsTidy(sdsSub(S[7], 7, 1), 700);
  res.disposal = sdsTidy(sdsSub(S[13], 13, 1) || S[13], 500);
  if (S[8]) {
    // UK limits: a "WEL GBR" row in a limits table (substance named above it), or any line giving mg/m³ / ppm.
    const lines8 = S[8].split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const wel: string[] = [];
    lines8.forEach((l, i) => {
      const m = /^WEL\s+(?:GBR|UK|GB)\s+([\d.,-]+)\s+([\d.,-]+)(?:\s+([\d.,-]+)\s+([\d.,-]+))?/i.exec(l);
      if (!m) return;
      let name = '';
      for (let j = i - 1; j >= 0 && j > i - 25; j--) { const c = lines8[j]; if (/^[A-Z0-9][A-Z0-9 ,()\-/]{3,60}$/.test(c) && !/THRESHOLD|TYPE|TWA|STEL|COUNTRY|VALUE|MG\/M|PPM/i.test(c) && !/\b(ESP|FRA|FIN|GBR|ITA|ROU|EU|DEU|NLD|IRL|BEL|AUT|POL|PRT|SWE|DNK|CZE|SVK|HUN|USA)\b/.test(c) && (c.match(/\d+/g) || []).length < 3) { name = c; break; } }
      const v = (a?: string, b?: string) => [a && a !== '-' ? `${a} mg/m³` : '', b && b !== '-' ? `${b} ppm` : ''].filter(Boolean).join(' / ');
      wel.push((name ? `${name.charAt(0)}${name.slice(1).toLowerCase()}: ` : '') + [v(m[1], m[2]) ? `${v(m[1], m[2])} (8hr)` : '', v(m[3], m[4]) ? `${v(m[3], m[4])} (15 min)` : ''].filter(Boolean).join(', '));
    });
    if (!wel.length) lines8.forEach((l) => { if (/(mg\/m|ppm|f\/ml)/i.test(l) && /\d/.test(l) && /[a-z]{3}/i.test(l.replace(/mg\/m|ppm/gi, '')) && l.length > 15 && l.length < 160 && !/^type\b/i.test(l)) wel.push(l); });
    res.wel = wel.slice(0, 6).join('; ');
    const t = S[8].toLowerCase();
    if (/glove|hand protection/.test(t)) res.ppe.push('hand');
    if (/goggle|safety glasses|eye protection|eye\/face/.test(t)) res.ppe.push('eye');
    if (/face shield|face-shield|visor/.test(t)) res.ppe.push('face');
    if (/respirator|respiratory protection|filter type|ffp3|half mask|full face mask/.test(t)) res.ppe.push(/dust|ffp2|p2\b/.test(t) && !/ffp3|filter type a/.test(t) ? 'dust' : 'ffp3');
    if (/overall|coverall|protective clothing|body protection/.test(t)) res.ppe.push('overalls');
    if (/safety boots|safety footwear|protective footwear|boots/.test(t)) res.ppe.push('boots');
    if (/hearing|ear protection|ear defender/.test(t)) res.ppe.push('ear');
  }
  return res;
}

/** Put what was read into the product (only filling text boxes still blank / default). Returns how many things it filled. */
export function applySds(title: string, d: CoshhData, f: SdsFound): { title: string; d: CoshhData; n: number } {
  const o: CoshhData = JSON.parse(JSON.stringify(d)); let n = 0, t = title;
  const dflt = (k: keyof typeof COSHH_DEFAULTS) => !String(o[k] || '').trim() || o[k] === COSHH_DEFAULTS[k];
  const setText = (k: keyof typeof COSHH_DEFAULTS, v: string) => { if (v && dflt(k)) { o[k] = v; n++; } };
  if (f.h.length) { o.h = f.h; n++; }
  if (f.p.length) { o.p = f.p; n++; }
  if (f.pictos.length) { o.pictos = f.pictos; n++; } else if (f.h.length && !o.pictos.length) { o.pictos = suggestPictos(f.h); n++; }
  if (f.signal) { o.signal = f.signal; n++; } else if (f.h.length && !o.signal) o.signal = suggestSignal(f.h);
  if (f.product && (!t || /^new product$/i.test(t))) { t = f.product; n++; }
  if (f.manufacturer && !o.manufacturer) { o.manufacturer = f.manufacturer; n++; }
  if (f.use && !o.use) { o.use = f.use; n++; }
  if (f.wel && !o.wel) { o.wel = f.wel; n++; }
  setText('firstAid', f.firstAid); setText('fire', f.fire); setText('spill', f.spill); setText('storage', f.storage); setText('disposal', f.disposal);
  if (f.controls && !String(o.controls || '').trim()) { o.controls = f.controls; n++; }
  if (f.ppe.length) { f.ppe.forEach((k) => { if (!o.ppe.includes(k)) o.ppe.push(k); }); n++; }
  const add = (r: string) => { if (!o.routes.includes(r)) o.routes.push(r); };
  if (f.h.some((c) => /^H33|^H304/.test(c))) add('inhale');
  if (f.h.some((c) => /^H31[0-7]|^EUH066/.test(c))) add('skin');
  if (f.h.some((c) => /^H31[489]/.test(c))) add('eyes');
  if (f.h.some((c) => /^H30[0-4]/.test(c))) add('swallow');
  return { title: t, d: o, n };
}
