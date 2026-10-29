// O&M manual rules (857): the maintenance texts per roof system, working out which
// systems a job has from its scope / data sheets / COSHH, the cover wording, the
// manual built from the job, and tidying older saved manuals. Pure.
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
export type OmAppendix = { kind: 'file' | 'sow-app' | 'report'; label: string; bucket?: string; path?: string; reportId?: string };
export type OmCover = { title?: string; project?: string; address?: string; header?: string; volume?: string; subtitle?: string; revision?: string; date?: string; coverPhoto?: { bucket: string; path: string } | null };
export type OmData = { cover: OmCover; attach: Record<string, boolean>; appendix: OmAppendix[]; sections: OmSection[] };

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
  docs: { id: string; kind: string; name: string; provider: string | null; ref: string | null; expiry_date: string | null; maintenance: string | null }[];
  coshh: { name: string; storage_path: string | null }[]; drawings: { name: string; uploaded_at: string | null; status: string | null }[]; photos: OmPhoto[];
};
/** A new manual built from what's on the job (857 hoBuildDefault). */
export function buildDefaultOm(j: OmJob): OmData {
  const { site, company } = j;
  const done = j.tasks.filter((t) => t.status === 'done' || t.status === 'completed' || t.status === 'complete');
  const useTasks = done.length ? done : j.tasks;
  const bySec: Record<string, typeof useTasks> = {};
  useTasks.forEach((t) => { (bySec[t.section_id || ''] = bySec[t.section_id || ''] || []).push(t); });
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  let scope = '';
  j.schedSections.forEach((sec) => { const ts = bySec[sec.id]; if (!ts?.length) return; scope += `The following works were carried out to ${sec.name}:\n${ts.map((t, i) => `${letters[i % 26]}.  ${t.name}`).join('\n')}\n\n`; });
  if (bySec['']) scope += (scope ? 'Other works:\n' : '') + bySec[''].map((t, i) => `${letters[i % 26]}.  ${t.name}`).join('\n');
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
