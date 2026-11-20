// O&M manual rules (857): the maintenance texts per roof system, working out which
// systems a job has from its scope / data sheets / COSHH, the cover wording, the
// manual built from the job, and tidying older saved manuals. Pure.
// The builder in tabs (Andy, 20 Nov 2026: "refresh the o&m completion process ... take into account the construction phase
// plan etc and what it can pull through from there"): which tab each section sits on, what comes over from the job's
// Construction Phase Plan, the checklist before issuing, and the revision numbers.
import type { CppPlan } from './cpp';
export const HO_MAINT: Record<string, { label: string; text: string }> = {
  general: {label:'General', text:
`• Roof access is for competent persons only, using safe access (fixed ladders, edge protection or a harness system) — never stand on rooflights or other fragile surfaces.
• Inspect the roof after severe weather (storms, heavy snow, high winds) as well as on the routine visits below.
• Keep a record of every inspection and any work done, and keep this manual with the building's health and safety file.
• Do not fix through, cut into or add anything to the roof covering (aerials, plant, signs, solar) without first speaking to the roofing contractor or manufacturer — it can affect the guarantee.
• Do not store materials or equipment on the roof. Protect the roof surface when other trades work on it.`},
  felt: {label:'Flat roof – bituminous (felt / torch-on)', text:
`Every 3 months (and after autumn leaf fall):
• Clear outlets, gutters, leaf guards and sumps; remove leaves, silt, moss and any vegetation.
Every 6 months:
• Walk-over visual inspection of the membrane for splits, blisters, ponding, punctures or loss of mineral surfacing.
• Check laps, upstands, kerbs, penetrations and edge trims for lifting or damage.
Every year:
• Inspect flashings, termination bars, mastic and sealant joints; re-seal where needed.
• Check outlets are firmly fixed and the outlet seals are sound.
Repairs:
• Use compatible materials from the system manufacturer only. Hot works (torch-on) must only be carried out by trained operatives under a hot works permit.`},
  liquid: {label:'Flat roof – liquid applied (PU / PMMA)', text:
`Every 3 months (and after autumn leaf fall):
• Clear outlets, gutters and leaf guards; remove debris and vegetation.
Every 6 months:
• Visual inspection for damage, cracking, blistering or delamination, especially at details, upstands and penetrations.
• Check the top coat for wear or UV breakdown.
Every year:
• Inspect terminations and detail work; arrange recoating of worn areas with the manufacturer's compatible top coat.
Cleaning and repairs:
• Clean with low-pressure water and a mild detergent only — no solvents and no pressure washer close to the surface.
• Repairs must follow the manufacturer's repair procedure (surface preparation, primer and resin) and be carried out by a trained installer.`},
  singleply: {label:'Flat roof – single ply membrane', text:
`Every 3 months (and after autumn leaf fall):
• Clear outlets, gutters and leaf guards; remove debris and vegetation.
Every 6 months:
• Visual inspection of seams and laps, membrane surface, mechanical fixings and ballast (if any) for displacement.
Every year:
• Check perimeter details, clamping bars, upstands and sealants.
Care and repairs:
• Avoid sharp objects and heavy point loads; wear soft-soled footwear.
• Repairs must be hot-air welded with the manufacturer's matching membrane by a trained installer.`},
  pitched: {label:'Pitched roof – slates / tiles', text:
`Twice a year (spring and autumn):
• Clear gutters, hoppers and downpipes.
Every year:
• Inspect from safe access (or from the ground with binoculars) for slipped, cracked or missing slates/tiles, and check ridges, hips, verges and valleys.
• Check flashings, leadwork, fascias, soffits and that ventilation openings are not blocked.
Repairs:
• Replace slipped slates using tingles or slate hooks and matching slates/tiles. Do not walk directly on slates or tiles — use roof ladders or crawling boards.`},
  lead: {label:'Leadwork', text:
`Every year:
• Inspect lead flashings, soakers, clips, wedges and joints for cracking, splitting, lifting or fatigue.
• Check the lead is still dressed tight to the surface and fixings are secure.
Notes:
• New lead was treated with patination oil; no further treatment is normally needed.
• Rainwater run-off from moss/lichen-covered roofs can corrode lead — keep surfaces above clear.
• Report any sign of lead theft straight away.`},
  rooflight: {label:'Rooflights', text:
`Every year:
• Clean the glazing with a mild detergent and soft cloth (no abrasive cleaners or solvents).
• Check seals, gaskets and fixings; check any opening vents and actuators operate correctly.
• Rooflights are fragile — never stand, sit or lean on them.`},
  rainwater: {label:'Gutters, downpipes, fascias and soffits', text:
`Twice a year:
• Clear gutters and downpipes and check joints for leaks.
Every year:
• Wipe uPVC fascias, soffits and gutters with warm water and a mild detergent.
• Check brackets and fixings are secure.`},
};
export function detectSystems(text: unknown): string[] {
  const t = String(text||'').toLowerCase();
  const out = ['general'];
  if(/felt|torch|bitumen|bituminous|cap ?sheet|underlay|elastoflex|icopal|langley|bauder (k|super|tec)|sbs/.test(t)) out.push('felt');
  if(/liquid|pmma|resin|liqui|decothane|sikalastic|alsan|triflex|proteus|p1 |polyroof|rapid ?roof|wethan|catalyst/.test(t)) out.push('liquid');
  if(/single ?ply|pvc|tpo|epdm|flagon|bauderpvc|sarnafil|elastocol|flexocol/.test(t)) out.push('singleply');
  if(/slate|tile|pitched|ridge|batten/.test(t)) out.push('pitched');
  if(/lead/.test(t)) out.push('lead');
  if(/rooflight|roof light|ridgelight|skylight|dome/.test(t)) out.push('rooflight');
  if(/gutter|downpipe|fascia|soffit|upvc/.test(t)) out.push('rainwater');
  return out;
}

// First two pages follow the company's own O&M template: page 1 = heading, wide
// photo, title / project / address / volume line; page 2 = logo, CDM wording,
// Contractor Details + Revision Details.
export const HO_COVER_HEADER = 'CONTRACTOR INFORMATION FOR HEALTH AND SAFETY FILE';
export const HO_COVER_VOLUME = 'Volume Book 1 O&M Manuals documentation';
export const HO_COVER_SUB = 'Construction (Design and Management)\nRegulations 2015\n\nOperation and maintenance manuals and\nAs Built Information';

export type OmLink = { docId?: string; bucket?: string; path?: string; name?: string };
export type OmPhoto = { bucket: string; path: string; caption?: string };
export type OmMaintItem = { id: string; key: string | null; title: string; text: string };
export type OmSection = {
  id: string; type: 'text' | 'table' | 'materials' | 'maint' | 'photos'; title: string; key?: string;
  body?: string; columns?: string[]; rows?: string[][]; links?: OmLink[][]; items?: OmMaintItem[]; photos?: OmPhoto[];
};
// sow-app: the Schedule of Works photo report, for the sections ticked (none = all), completed works only if doneOnly.
// boq: the Bill of Quantities as a list of works, no prices (Andy, 8 Nov 2026).
export type OmAppendix = { kind: 'file' | 'sow-app' | 'report' | 'boq'; label: string; bucket?: string; path?: string; reportId?: string; sections?: string[]; doneOnly?: boolean };
/** A Bill of Quantities line without money (the site_boq_works function). */
export type BoqWork = { id: string; position: number | null; kind: string | null; ref: string | null; section: string | null; description: string | null; qty: number | null; unit: string | null };
export const boqHasWorks = (b: BoqWork[] | null | undefined) => !!b?.some((r) => (!r.kind || r.kind === 'item') && String(r.description || '').trim());
const qtyTxt = (q: number | null, u: string | null) => (q != null && Number(q) ? ` (${Number(q).toLocaleString('en-GB', { maximumFractionDigits: 2 })}${u ? ` ${u}` : ''})` : '');
/** The Scope of Works Completed from the Bill of Quantities (Andy, 8 Nov 2026: with Finance, the BoQ is the record of the work
 *  done) — under each heading, its items with their quantities. Never prices. */
export function boqScope(items: BoqWork[]): string {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  let out = '', head: string | null = null, top: string | null = null, rowHead: string | null = null, list: string[] = [];
  const flush = () => {
    if (!list.length) return;
    out += `${head ? `The following works were carried out to ${head}:` : out ? 'Other works:' : 'The following works were carried out:'}\n${list.map((t, i) => `${letters[i % 26]}.  ${t}`).join('\n')}\n\n`;
    list = [];
  };
  items.slice().sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0)).forEach((r) => {
    const d = String(r.description || '').trim();
    if (r.kind === 'section') { top = d || null; rowHead = top; return; }
    if (r.kind === 'subsection') { rowHead = top && d ? `${top} — ${d}` : d || top; return; }
    if (r.kind && r.kind !== 'item') return;
    if (!d) return;
    const h = rowHead ?? (String(r.section || '').trim() || null);
    if (h !== head) { flush(); head = h; }
    list.push(d + qtyTxt(r.qty, r.unit));
  });
  flush();
  return out.trim();
}
export type OmCover = { title?: string; project?: string; address?: string; header?: string; volume?: string; subtitle?: string; revision?: string; date?: string; coverPhoto?: { bucket: string; path: string } | null };
/** One issued revision: its number, date, who issued it, what changed, and the PDF filed then. */
export type OmRevision = { rev: string; date: string; by: string; note: string; path?: string | null };
export type OmData = { cover: OmCover; attach: Record<string, boolean>; appendix: OmAppendix[]; sections: OmSection[]; synced?: Record<string, 1>; syncInit?: 1; syncedCoshh?: Record<string, 1>;
  /** Start on site (from the Construction Phase Plan, or typed in). Practical completion is the job's own (Handover). */
  dates?: { start?: string | null; pc?: string | null };
  revisions?: OmRevision[];
  /** A subcontractor company's own manual (Andy, 20 Nov 2026): submitted to the main contractor, it goes in the back of theirs. */
  forCompany?: string | null };

export const omUid = () => `s${Math.random().toString(36).slice(2, 9)}`;
export const omFmtDate = (d: string | null | undefined) => (d ? new Date(d.length === 10 ? `${d}T00:00:00` : d).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
export function addrLines(a: unknown): string[] {
  const parts = String(a || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (parts.length >= 2 && /\d/.test(parts[parts.length - 1])) return [parts.slice(0, -1).join(', '), parts[parts.length - 1]];
  return parts.length ? [parts.join(', ')] : [];
}
export const contractorSec = (d: OmData) => d.sections.find((s) => s.type === 'table' && /contractor details/i.test(s.title || ''));
export function contractorRows(d: OmData): string[][] {
  const s = contractorSec(d);
  return s ? (s.rows || []).filter((r) => !/^(revision|date)\b/i.test(String(r[0] || '').trim()) && r.slice(1).some((v) => String(v || '').trim())) : [];
}
export const scopeEmpty = (d: OmData) => { const s = d.sections.find((x) => x.key === 'scope'); return !s || !String(s.body || '').trim() || /^describe the works carried out\.?$/i.test(String(s.body || '').trim()); };

/** Older saved manuals: fill in anything newer manuals have. Returns true if it changed anything. */
export function normalizeOm(d: OmData): boolean {
  let ch = false;
  if (!Array.isArray(d.appendix)) { d.appendix = []; ch = true; }
  if (!d.attach) { d.attach = {}; ch = true; }
  ['datasheets', 'guarantees', 'coshh'].forEach((k) => { if (d.attach[k] == null) { d.attach[k] = true; ch = true; } });
  // The main contractor's manual takes the subcontractors' submitted O&M manuals in the back (20 Nov 2026).
  if (!d.forCompany && d.attach.subs == null) { d.attach.subs = true; ch = true; }
  d.cover = d.cover || {};
  if (d.cover.header == null) { d.cover.header = HO_COVER_HEADER; ch = true; }
  if (d.cover.volume == null) { d.cover.volume = HO_COVER_VOLUME; ch = true; }
  if (!d.cover.subtitle || /^Operation and Maintenance Manual and As Built Information — Construction/.test(d.cover.subtitle)) { d.cover.subtitle = HO_COVER_SUB; ch = true; }
  d.sections.forEach((s) => {
    if (s.type === 'table' && /materials?\s+log/i.test(s.title || '')) { s.type = 'materials'; ch = true; }
    if (s.type === 'table' || s.type === 'materials') {
      s.rows = s.rows || []; s.columns = s.columns || [];
      if (!Array.isArray(s.links)) { s.links = []; ch = true; }
      while (s.links.length < s.rows.length) { s.links.push([]); ch = true; }
      if (s.links.length > s.rows.length) { s.links.length = s.rows.length; ch = true; }
    }
    if (s.type === 'text' && !s.key && /scope of works/i.test(s.title || '')) { s.key = 'scope'; ch = true; }
  });
  const mt = d.sections.find((s) => s.type === 'text' && /maintenance/i.test(s.title || ''));
  if (mt && !d.sections.some((s) => s.type === 'maint')) {
    const items: OmMaintItem[] = [];
    String(mt.body || '').split(/\n\s*\n/).forEach((b) => {
      if (!b.trim()) return;
      const lines = b.split('\n'), first = lines[0].trim();
      const k = Object.keys(HO_MAINT).find((x) => HO_MAINT[x].label === first);
      items.push(k ? { id: omUid(), key: k, title: first, text: lines.slice(1).join('\n') } : { id: omUid(), key: null, title: 'Maintenance', text: b.trim() });
    });
    mt.type = 'maint'; mt.items = items; delete mt.body; ch = true;
  }
  if (!d.sections.some((s) => s.key === 'scope')) { d.sections.splice(Math.min(2, d.sections.length), 0, { id: omUid(), key: 'scope', type: 'text', title: 'Scope of Works Completed', body: '' }); ch = true; }
  return ch;
}

export type OmJob = {
  site: { name?: string | null; client_name?: string | null; job_number?: string | null }; address: string; company: string; today: string;
  settings: { address?: string | null; phone?: string | null }; pm: { name?: string | null; email?: string | null; phone?: string | null } | null; myEmail: string;
  schedSections: { id: string; name: string }[]; tasks: { id: string; name: string; status: string | null; section_id: string | null }[];
  boq?: BoqWork[];
  docs: { id: string; kind: string; name: string; provider: string | null; ref: string | null; expiry_date: string | null; maintenance: string | null }[];
  coshh: { name: string; storage_path: string | null }[]; drawings: { name: string; uploaded_at: string | null; status: string | null }[]; photos: OmPhoto[];
  /** The job's Construction Phase Plan (issued one first), if it has one. */
  cpp?: OmCpp | null;
};
/** The Scope of Works from the Schedule of Works: completed tasks (else all), under their sections. */
export function sowScope(j: Pick<OmJob, 'schedSections' | 'tasks'>): string {
  const done = j.tasks.filter((t) => t.status === 'done' || t.status === 'completed' || t.status === 'complete');
  const useTasks = done.length ? done : j.tasks;
  const bySec: Record<string, typeof useTasks> = {};
  useTasks.forEach((t) => { (bySec[t.section_id || ''] = bySec[t.section_id || ''] || []).push(t); });
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  let scope = '';
  j.schedSections.forEach((sec) => { const ts = bySec[sec.id]; if (!ts?.length) return; scope += `The following works were carried out to ${sec.name}:\n${ts.map((t, i) => `${letters[i % 26]}.  ${t.name}`).join('\n')}\n\n`; });
  if (bySec['']) scope += (scope ? 'Other works:\n' : '') + bySec[''].map((t, i) => `${letters[i % 26]}.  ${t.name}`).join('\n');
  return scope.trim();
}
/** A new manual built from what's on the job (857 hoBuildDefault). */
export function buildDefaultOm(j: OmJob): OmData {
  const d = buildDefaultOm0(j);
  ensureTeam(d);
  if (j.cpp) {
    omFromCpp(d, j.cpp);
    const sc = d.sections.find((s) => s.key === 'scope');
    if (sc && !String(sc.body || '').trim() && j.cpp.outline.trim()) sc.body = j.cpp.outline.trim();
  }
  return d;
}
function buildDefaultOm0(j: OmJob): OmData {
  const { site, company } = j;
  let scope = sowScope(j);
  // A company with Finance and a Bill of Quantities on the job: the scope comes from the BoQ instead (Andy, 8 Nov 2026).
  if (boqHasWorks(j.boq)) scope = boqScope(j.boq as BoqWork[]);
  const sheets = j.docs.filter((d) => d.kind === 'datasheet'), guars = j.docs.filter((d) => d.kind === 'guarantee');
  const matRows: string[][] = [], matLinks: OmLink[][] = []; let n = 1;
  sheets.forEach((d) => { matRows.push([String(n++), '', d.name.replace(/\.pdf$/i, ''), d.provider || '']); matLinks.push([{ docId: d.id, name: d.name }]); });
  j.coshh.forEach((c) => {
    const nm = c.name.replace(/^COSHH\s*[—-]\s*/i, '').replace(/^COSHH Assessment\s*-\s*/i, '').replace(/\.pdf$/i, '');
    const lk = c.storage_path ? { bucket: 'coshh-docs', path: c.storage_path, name: c.name } : null;
    const at = matRows.findIndex((r) => r[2].toLowerCase() === nm.toLowerCase());
    if (at >= 0) { if (lk) matLinks[at].push(lk); } else { matRows.push([String(n++), 'COSHH', nm, '']); matLinks.push(lk ? [lk] : []); }
  });
  const systems = detectSystems([scope, sheets.map((d) => `${d.name} ${d.provider || ''}`).join(' '), j.coshh.map((c) => c.name).join(' ')].join(' '));
  const pm = j.pm, addr = j.address, today = j.today;
  return {
    cover: { title: 'O&M MANUAL', project: site.name || '', address: addr, header: HO_COVER_HEADER, volume: HO_COVER_VOLUME, subtitle: HO_COVER_SUB, revision: '1', date: today, coverPhoto: j.photos[0] ? { bucket: j.photos[0].bucket, path: j.photos[0].path } : null },
    attach: { datasheets: true, guarantees: true, coshh: true, drawings: false },
    appendix: [],
    sections: [
      { id: omUid(), type: 'table', title: 'Contractor Details', columns: ['', ''], rows: [['Name', company], ['Address', String(j.settings.address || '').replace(/\n/g, ', ')], ['Telephone', j.settings.phone || ''], ['Email', pm?.email || j.myEmail || ''], ['Client', site.client_name || ''], ['Job number', site.job_number || ''], ['Revision', '1'], ['Date', omFmtDate(today)]] },
      { id: omUid(), type: 'text', title: '1. Introduction', body: `This document confirms the formal handover of the completed roofing works at ${site.name || 'the site'}${addr ? `, ${addr}` : ''} — on behalf of ${company}${site.client_name ? ` to ${site.client_name}` : ''}.\n\nThis document records the scope of works carried out, materials and systems installed, guarantee and maintenance provisions, health and safety information, and the parties' formal sign-off.` },
      { id: omUid(), key: 'scope', type: 'text', title: '2. Scope of Works Completed', body: scope.trim() },
      { id: omUid(), type: 'materials', title: '3. Materials Log – Data & COSHH', columns: ['Log No.', 'Element', 'Product', 'Manufacturer'], rows: matRows.length ? matRows : [['1', '', '', '']], links: matRows.length ? matLinks : [[]] },
      { id: omUid(), type: 'table', title: '4. Guarantees & Warranties', columns: ['Manufacturer / Item', 'Ref', 'Expiry', 'Maintenance'], rows: guars.length ? guars.map((g) => [g.provider ? `${g.provider} – ${g.name.replace(/\.pdf$/i, '')}` : g.name.replace(/\.pdf$/i, ''), g.ref || '', g.expiry_date ? omFmtDate(g.expiry_date) : '', g.maintenance || '']) : [['', '', '', '']], links: guars.length ? guars.map((g) => [{ docId: g.id, name: g.name }]) : [[]] },
      { id: omUid(), type: 'maint', title: '5. Maintenance Procedures', items: systems.map((k) => ({ id: omUid(), key: k, title: HO_MAINT[k].label, text: HO_MAINT[k].text })) },
      { id: omUid(), type: 'table', title: '6. Specifications & Drawings', columns: ['File Name', 'Ref', 'Date', 'Provider'], rows: j.drawings.filter((d) => d.status !== 'superseded').map((d) => [d.name.replace(/\.[a-z0-9]+$/i, ''), '', omFmtDate(d.uploaded_at ? d.uploaded_at.slice(0, 10) : ''), '']).concat([['O&M Documentation', `O&M ${site.name || ''}`, omFmtDate(today), company]]) },
      { id: omUid(), type: 'text', title: '7. Health & Safety Information', body: 'Residual risks for anyone working on or maintaining the roof:\n• Working at height — use safe access and edge protection or a harness system; roof access by competent persons only.\n• Fragile surfaces — rooflights and any fragile sheeting must not be walked on.\n• Hot works — any torch-on repairs need a hot works permit and fire watch.\n• Hazardous substances — products used for maintenance must be used in line with their COSHH assessments (see the Materials Log and attached COSHH).\n• Overhead services and plant — isolate before working nearby.\n\nRAMS and COSHH assessments for this project are held on the project in the OpHUB app.' },
      { id: omUid(), type: 'photos', title: '8. Photographs', photos: j.photos.slice(0, 8).map((p) => ({ bucket: p.bucket, path: p.path, caption: p.caption })) },
      { id: omUid(), type: 'table', title: '9. Handover & Sign-off', columns: ['', 'Contractor', 'Client / Main Contractor'], rows: [['Name', pm?.name || '', ''], ['Position', '', ''], ['Signature', '', ''], ['Date', '', '']] },
      { id: omUid(), type: 'table', title: 'Contacts', columns: ['', company], rows: [['Contact name', pm?.name || ''], ['Position', ''], ['Telephone', pm?.phone || j.settings.phone || ''], ['Email', pm?.email || '']] },
    ],
  };
}

const filled = (r: string[], skipFirst: boolean) => r.some((v, i) => (skipFirst ? i > 0 : true) && v);
const blankRow = (rows: string[][], skipFirst: boolean) => rows.findIndex((r) => r.every((v, i) => !v || (skipFirst && i === 0)));
type HoDocLite = { id: string; kind: string | null; name: string; provider?: string | null; ref?: string | null; expiry_date?: string | null; maintenance?: string | null };
/**
 * Data sheets and guarantees uploaded to the job's Handover after the manual was started go into the
 * Materials Log / Guarantees table, linked so they're attached in the back (857 hoSyncDocs). The first
 * time, what's there already is just noted. A row the user deletes stays deleted.
 */
export function syncOmDocs(d: OmData, docs: HoDocLite[]): boolean {
  d.synced = d.synced || {};
  if (!d.syncInit) { docs.forEach((x) => { (d.synced as Record<string, 1>)[x.id] = 1; }); d.syncInit = 1; return true; }
  let changed = false;
  docs.forEach((x) => {
    if ((d.synced as Record<string, 1>)[x.id]) return;
    const isSheet = x.kind === 'datasheet';
    const t = isSheet ? d.sections.find((q) => q.type === 'materials') : d.sections.find((q) => q.type === 'table' && /guarantee|warrant/i.test(q.title || ''));
    (d.synced as Record<string, 1>)[x.id] = 1; changed = true;
    if (!t || !t.columns) return;
    t.rows = t.rows || []; t.links = t.links || [];
    const nm = String(x.name || '').replace(/\.pdf$/i, '');
    const row = t.columns.map(() => '');
    if (isSheet) { row[0] = String(t.rows.filter((r) => filled(r, true)).length + 1); if (row.length > 2) row[2] = nm; if (row.length > 3) row[3] = x.provider || ''; }
    else { row[0] = x.provider ? `${x.provider} – ${nm}` : nm; if (row.length > 1) row[1] = x.ref || ''; if (row.length > 2) row[2] = x.expiry_date ? omFmtDate(x.expiry_date) : ''; if (row.length > 3) row[3] = x.maintenance || ''; }
    const at = blankRow(t.rows, isSheet);
    if (at >= 0) { t.rows[at] = row; t.links[at] = [{ docId: x.id, name: x.name }]; } else { t.rows.push(row); t.links[t.rows.length - 1] = [{ docId: x.id, name: x.name }]; }
  });
  return changed;
}
const coshhKey = (n: unknown) => String(n || '').replace(/\.pdf$/i, '').replace(/^COSHH\s*(Assessment)?\s*[—–-]\s*/i, '').replace(/^Data sheet\s*[—–-]\s*/i, '').trim().toLowerCase();
/**
 * COSHH assessments on the job go into the Materials Log, each linked so it's attached straight after
 * the product (857 hoSyncCoshh) — including ones added after the manual was started. Matched to a
 * row already there by product name so nothing is listed twice.
 */
export function syncOmCoshh(d: OmData, coshh: { id: string; name: string; storage_path: string | null }[]): boolean {
  d.syncedCoshh = d.syncedCoshh || {};
  const t = d.sections.find((q) => q.type === 'materials');
  if (!t || !t.columns) return false;
  t.rows = t.rows || []; t.links = t.links || [];
  let changed = false;
  coshh.forEach((c) => {
    if (!c.storage_path || (d.syncedCoshh as Record<string, 1>)[c.id]) return;
    (d.syncedCoshh as Record<string, 1>)[c.id] = 1; changed = true;
    const links = t.links as OmLink[][], rows = t.rows as string[][];
    const lk: OmLink = { bucket: 'coshh-docs', path: c.storage_path, name: c.name };
    if (links.some((ls) => (ls || []).some((l) => l.path === c.storage_path))) return;
    const nm = coshhKey(c.name);
    let at = nm ? rows.findIndex((r) => coshhKey(r[2]) === nm) : -1;
    if (at < 0) at = links.findIndex((ls) => (ls || []).some((l) => coshhKey(l.name) === nm));
    if (at >= 0) { const ls = (links[at] = links[at] || []); if (!ls.some((l) => /coshh/i.test(l.name || '') && !/^data sheet/i.test(l.name || ''))) ls.push(lk); return; }
    const row = (t.columns as string[]).map(() => '');
    row[0] = String(rows.filter((r) => filled(r, true)).length + 1);
    if (row.length > 1) row[1] = 'COSHH';
    if (row.length > 2) row[2] = String(c.name || '').replace(/\.pdf$/i, '').replace(/^COSHH\s*(Assessment)?\s*[—–-]\s*/i, '');
    const b = blankRow(rows, true);
    if (b >= 0) { rows[b] = row; links[b] = [lk]; } else { rows.push(row); links[rows.length - 1] = [lk]; }
  });
  return changed;
}
/** Products picked from the COSHH Library go into the Materials Log with their data sheet and assessment linked (857 hoPickDatasheets). */
export function addOmProducts(d: OmData, secId: string, picked: { title: string; manufacturer: string; sdsPath: string | null; assessPath: string | null }[]): number {
  const t = d.sections.find((q) => q.id === secId); if (!t || !t.columns) return 0;
  t.rows = t.rows || []; t.links = t.links || [];
  const have = new Set(t.rows.map((r) => String(r[2] || '').trim().toLowerCase()));
  let n = 0;
  picked.forEach((it) => {
    if (have.has(it.title.trim().toLowerCase())) return;
    const rows = t.rows as string[][], links = t.links as OmLink[][];
    const r = (t.columns as string[]).map(() => ''); r[0] = String(rows.filter((x) => filled(x, true)).length + 1); if (r.length > 2) r[2] = it.title; if (r.length > 3) r[3] = it.manufacturer || '';
    const ls: OmLink[] = [];
    if (it.sdsPath) ls.push({ bucket: 'coshh-library', path: it.sdsPath, name: `Data sheet – ${it.title}` });
    if (it.assessPath) ls.push({ bucket: 'coshh-library', path: it.assessPath, name: `COSHH – ${it.title}` });
    const b = blankRow(rows, true);
    if (b >= 0) { rows[b] = r; links[b] = ls; } else { rows.push(r); links.push(ls); }
    have.add(it.title.trim().toLowerCase()); n++;
  });
  return n;
}

/* ---------- The builder in tabs, and the Construction Phase Plan (Andy, 20 Nov 2026) ---------- */
export type OmTab = 'details' | 'people' | 'works' | 'back' | 'issue';
export const OM_TABS: OmTab[] = ['details', 'people', 'works', 'back', 'issue'];
export const OM_TAB_LABEL: Record<OmTab, string> = { details: 'Details', people: 'People', works: 'Works', back: 'Appendix', issue: 'Issue' };
const isContacts = (s: OmSection) => s.type === 'table' && /^\s*contacts?\s*$/i.test(s.title || '');
const isSignOff = (s: OmSection) => s.type === 'table' && /sign-?\s?off/i.test(s.title || '');
/** Which tab a section is edited on: who's who on People, the introduction on Details, the sign-off on Issue, the rest on Works. */
export function omTab(s: OmSection): OmTab {
  if (s.key === 'team' || isContacts(s) || (s.type === 'table' && /contractor details/i.test(s.title || ''))) return 'people';
  if (s.type === 'text' && /introduction/i.test(s.title || '')) return 'details';
  if (isSignOff(s)) return 'issue';
  return 'works';
}

/** The project team for the Health and Safety File: who the client, designers and contractor were. Rows without a name are
 *  left out of the PDF. */
export const OM_TEAM_ROLES = ['Client', 'Client’s Agent', 'Principal Designer', 'Architect', 'Principal Contractor', 'Project Manager'];
export const teamSec = (d: OmData) => d.sections.find((s) => s.key === 'team');
export const blankTeam = (): OmSection => ({ id: omUid(), key: 'team', type: 'table', title: 'Project Team', columns: ['Role', 'Name', 'Telephone', 'Email'], rows: OM_TEAM_ROLES.map((r) => [r, '', '', '']), links: OM_TEAM_ROLES.map(() => []) });
/** Adds the Project Team to a manual that hasn't one (older manuals), before Contacts or at the end. */
export function ensureTeam(d: OmData): OmSection {
  const have = teamSec(d); if (have) return have;
  const t = blankTeam(), at = d.sections.findIndex(isContacts);
  if (at >= 0) d.sections.splice(at, 0, t); else d.sections.push(t);
  return t;
}

/** What the O&M uses from a Construction Phase Plan. */
export type OmCpp = Pick<CppPlan, 'pc' | 'client' | 'clientAgent' | 'principalDesigner' | 'architect' | 'pm' | 'startDate' | 'outline' | 'siteAddress' | 'contacts'>;
const oneLine = (a: unknown) => String(a || '').split('\n').map((x) => x.trim()).filter(Boolean).join(', ');
/**
 * Fills the manual's empty boxes from the job's Construction Phase Plan: Contractor Details, the Project Team (client,
 * client's agent, principal designer, architect, principal contractor, project manager), Contacts, the sign-off names,
 * the start date and the cover address. Never overwrites what's typed. Returns how many boxes it filled.
 */
export function omFromCpp(d: OmData, p: OmCpp): number {
  let n = 0;
  const put = (row: string[] | undefined, i: number, v: unknown) => { const x = String(v ?? '').trim(); if (row && x && !String(row[i] ?? '').trim()) { row[i] = x; n++; } };
  const find = (sec: OmSection | undefined, re: RegExp) => (sec?.rows || []).find((r) => re.test(String(r[0] || '').trim()));
  const phoneOf = (re: RegExp) => { const c = (p.contacts || []).find((x) => re.test(x.role || '')); return c ? c.day || c.ooh || '' : ''; };
  const cs = contractorSec(d);
  put(find(cs, /^name/i), 1, p.pc.name); put(find(cs, /^address/i), 1, oneLine(p.pc.address)); put(find(cs, /^(tele|phone)/i), 1, p.pc.phone);
  put(find(cs, /^email/i), 1, p.pm.email || p.pc.email); put(find(cs, /^client/i), 1, p.client.name);
  const team = ensureTeam(d);
  const clientName = p.client.contact.trim() && p.client.name.trim() ? `${p.client.name.trim()} (${p.client.contact.trim()})` : p.client.name || p.client.contact;
  const who: [RegExp, string, string, string, string][] = [
    [/^client$/i, 'Client', clientName, p.client.phone, p.client.email],
    [/agent/i, 'Client’s Agent', p.clientAgent, '', ''],
    [/principal designer/i, 'Principal Designer', p.principalDesigner, phoneOf(/principal designer/i), ''],
    [/architect/i, 'Architect', p.architect, phoneOf(/architect/i), ''],
    [/principal contractor/i, 'Principal Contractor', p.pc.name, p.pc.phone, p.pc.email],
    [/project manager/i, 'Project Manager', p.pm.name, p.pm.phone, p.pm.email],
  ];
  const rows = (team.rows = team.rows || []), links = (team.links = team.links || []);
  who.forEach(([re, role, name, phone, email]) => {
    if (!String(name || '').trim()) return;
    let r = find(team, re);
    if (!r) { r = [role, '', '', '']; rows.push(r); links.push([]); }
    put(r, 1, name); put(r, 2, phone); put(r, 3, email);
  });
  const ct = d.sections.find(isContacts);
  if (p.pm.name.trim()) { const nm = find(ct, /contact name/i); const had = !!String(nm?.[1] || '').trim(); put(nm, 1, p.pm.name); if (!had && nm) put(find(ct, /^position/i), 1, 'Project Manager'); }
  put(find(ct, /^(tele|phone)/i), 1, p.pm.phone); put(find(ct, /^email/i), 1, p.pm.email);
  const so = d.sections.find(isSignOff);
  put(find(so, /^name/i), 1, p.pm.name); put(find(so, /^name/i), 2, p.client.contact);
  if (p.pm.name.trim()) put(find(so, /^position/i), 1, 'Project Manager');
  d.dates = d.dates || {};
  if (!d.dates.start && p.startDate) { d.dates.start = p.startDate; n++; }
  d.cover = d.cover || {};
  if (!String(d.cover.address || '').trim() && oneLine(p.siteAddress)) { d.cover.address = oneLine(p.siteAddress); n++; }
  return n;
}

/** What's left before issuing. Only the Scope of Works is a must; the rest are reminders. */
export type OmCheck = { key: string; label: string; ok: boolean; tab: OmTab; must?: boolean };
export function omChecklist(d: OmData, o: { pcDate: string | null | undefined }): OmCheck[] {
  const team = teamSec(d);
  const named = (re: RegExp) => !!team?.rows?.some((r) => re.test(String(r[0] || '')) && String(r[1] || '').trim());
  const clientRow = (contractorSec(d)?.rows || []).find((r) => /^client/i.test(String(r[0] || '')));
  const mat = d.sections.find((s) => s.type === 'materials');
  const guar = d.sections.find((s) => s.type === 'table' && /guarantee|warrant/i.test(s.title || ''));
  const soName = (d.sections.find(isSignOff)?.rows || []).find((r) => /^name/i.test(String(r[0] || '')));
  return [
    { key: 'scope', label: 'Scope Of Works Filled In', ok: !scopeEmpty(d), tab: 'works', must: true },
    { key: 'pc', label: 'Practical Completion Date Set', ok: !!o.pcDate, tab: 'details' },
    { key: 'client', label: 'Client Named', ok: named(/^client$/i) || !!String(clientRow?.[1] || '').trim(), tab: 'people' },
    { key: 'pd', label: 'Principal Designer Named (If There Is One)', ok: named(/principal designer/i), tab: 'people' },
    { key: 'mat', label: 'Products In The Materials Log', ok: (mat?.rows || []).some((r) => String(r[2] || '').trim()), tab: 'works' },
    { key: 'guar', label: 'Guarantees Listed', ok: (guar?.rows || []).some((r) => String(r[0] || '').trim()), tab: 'works' },
    { key: 'sign', label: 'Sign-Off Names Filled In', ok: !!String(soName?.[1] || '').trim(), tab: 'issue' },
  ];
}

/** The sections as printed: the Project Team without its unnamed roles (and left out if nobody's named). */
export function printSections(d: OmData): OmSection[] {
  return d.sections.flatMap((s) => {
    if (s.key !== 'team') return [s];
    const keep = (s.rows || []).map((r, i) => ({ r, l: (s.links || [])[i] || [] })).filter((x) => String(x.r[1] || '').trim());
    return keep.length ? [{ ...s, rows: keep.map((x) => x.r), links: keep.map((x) => x.l) }] : [];
  });
}

/** Page 2's Project Dates: start on site and practical completion, whichever are known. */
export const projectDates = (d: OmData): string[][] => [['Start On Site', d.dates?.start], ['Practical Completion', d.dates?.pc]].filter((r) => r[1]).map((r) => [r[0] as string, omFmtDate(r[1])]);

/** The next revision number: 1 for the first issue, then one up from the last issued. */
export function nextRevision(d: OmData): string {
  const last = (d.revisions || []).slice(-1)[0];
  if (!last) return '1';
  const n = Number(last.rev);
  return Number.isFinite(n) ? String(n + 1) : String((d.revisions || []).length + 1);
}

/** A subcontractor's manual starts trade-neutral (Andy, 20 Nov 2026: a painter's O&M isn't a roofer's): the introduction
 *  says "works", maintenance is one blank procedure for them to write, and the H&S wording asks for their residual risks. */
export function tradeNeutral(d: OmData): void {
  d.sections.forEach((s) => {
    if (s.type === 'text' && /introduction/i.test(s.title || '')) s.body = String(s.body || '').replace(/completed roofing works/g, 'completed works');
    if (s.type === 'maint') s.items = [{ id: omUid(), key: null, title: 'Maintenance', text: '' }];
    if (s.type === 'text' && /health & safety information/i.test(s.title || '')) s.body = 'Residual risks for anyone maintaining these works, and how to control them (for example working at height, isolating services, hazardous substances):\n• \n\nProducts used must be handled in line with their COSHH assessments (see the Materials Log and the attached COSHH).';
  });
}
