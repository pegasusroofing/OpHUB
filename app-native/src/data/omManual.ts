// O&M manuals (857): a job can have several (handover_om_manuals, the manual
// itself kept as JSON in `data`). New, open (tidying older ones), save,
// duplicate, delete, and collecting what goes in the back of the PDF.
import { packPdfBytes } from '@/data/jobPack';
import { loadSettings } from '@/data/ramsBuilder';
import { buildOmPdf } from '@/lib/pdfLazy';
import { normaliseCpp, type CppPlan } from '@/lib/rules/cpp';
import { fullSiteAddress } from '@/lib/rules/checkin';
import { localISODate } from '@/lib/rules/driver';
import { boqScope, buildDefaultOm, ensureTeam, nextRevision, normalizeOm, sowScope, syncOmCoshh, syncOmDocs, type BoqWork, type OmData, type OmPhoto } from '@/lib/rules/omManual';
import { supabase } from '@/lib/supabase';
import type { Organization, Profile, Site } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
type Row = Record<string, any>;
const rows = <T = Row>(r: { data: unknown }) => ((r.data as T[] | null) ?? []);

/** The job's Bill of Quantities as a list of works, no money (site_boq_works; PMs can read it without Finance). */
export async function loadBoqWorks(siteId: string): Promise<BoqWork[]> {
  const r = await supabase.rpc('site_boq_works' as never, { p_site: siteId } as never);
  return ((r.data as BoqWork[] | null) ?? []);
}
/** The Scope of Works wording, from the Bill of Quantities or from the Schedule of Works (the O&M's "Fill From" links). */
export async function scopeFrom(siteId: string, from: 'boq' | 'sow', companyId?: string | null): Promise<string> {
  if (from === 'boq') return boqScope(await loadBoqWorks(siteId));
  // A subcontractor's manual: only the tasks assigned to them.
  let tq = db.from('schedule_tasks').select('id,name,status,section_id').eq('site_id', siteId);
  if (companyId) tq = tq.eq('subcontractor_company_id', companyId);
  const [secs, tasks] = await Promise.all([
    db.from('schedule_sections').select('id,name').eq('site_id', siteId).order('position'),
    tq.order('position'),
  ]);
  return sowScope({ schedSections: rows(secs) as never, tasks: rows(tasks) as never });
}

export async function jobPhotos(siteId: string, companyId?: string | null): Promise<(OmPhoto & { thumb: string })[]> {
  let tq = db.from('schedule_tasks').select('id,name').eq('site_id', siteId);
  if (companyId) tq = tq.eq('subcontractor_company_id', companyId);
  const tasks = rows<{ id: string; name: string }>(await tq);
  if (!tasks.length) return [];
  const nm: Record<string, string> = Object.fromEntries(tasks.map((t) => [t.id, t.name]));
  const ph = rows(await db.from('schedule_photos').select('task_id,storage_path,mid_path,thumb_path').in('task_id', tasks.map((t) => t.id)).order('uploaded_at', { ascending: false }).limit(200));
  return ph.map((p) => ({ bucket: 'site-photos', path: p.mid_path || p.storage_path, thumb: p.thumb_path || p.mid_path || p.storage_path, caption: nm[p.task_id] || '' }));
}

/** The job's Construction Phase Plan for the O&M (Andy, 20 Nov 2026): the issued one, else the newest draft. */
export async function jobCpp(siteId: string): Promise<{ plan: CppPlan; version: number; issued: boolean } | null> {
  const r = rows<{ data: Partial<CppPlan> | null; version: number | null; status: string | null }>(await db.from('cpp_plans').select('data,version,status,updated_at').eq('site_id', siteId).order('updated_at', { ascending: false }).limit(20));
  const best = r.find((x) => x.status === 'issued') || r[0];
  return best ? { plan: normaliseCpp(best.data), version: Number(best.version) || 1, issued: best.status === 'issued' } : null;
}

async function buildFromJob(me: Profile, org: Organization | null, site: Site): Promise<OmData> {
  const [secs, tasks, docs, coshh, drawings, photos, st, pmRow, cpp] = await Promise.all([
    db.from('schedule_sections').select('id,name').eq('site_id', site.id).order('position'),
    db.from('schedule_tasks').select('id,name,status,section_id').eq('site_id', site.id).order('position'),
    db.from('handover_docs').select('*').eq('site_id', site.id).order('position').order('created_at'),
    db.from('coshh_docs').select('id,name,storage_path').eq('site_id', site.id).is('subcontractor_company_id', null).order('uploaded_at'),
    db.from('drawing_files').select('id,name,uploaded_at,status').eq('site_id', site.id).order('uploaded_at'),
    jobPhotos(site.id),
    loadSettings(org as never),
    site.responsible_pm_id ? db.from('profiles').select('name,email,phone').eq('id', site.responsible_pm_id).maybeSingle() : Promise.resolve({ data: null }),
    jobCpp(site.id).catch(() => null),
  ]);
  // With Finance, the Bill of Quantities is the record of the work done (Andy, 8 Nov 2026).
  const boq = (org as (Organization & { has_finance?: boolean }) | null)?.has_finance ? await loadBoqWorks(site.id).catch(() => []) : [];
  // The job's responsible PM; else the Construction Phase Plan's project manager; else whoever is building the manual.
  const cppPm = cpp?.plan.pm.name.trim() ? { name: cpp.plan.pm.name, email: cpp.plan.pm.email || null, phone: cpp.plan.pm.phone || null } : null;
  const pm = (pmRow.data as { name: string; email: string | null; phone: string | null } | null) ?? cppPm ?? { name: me.name, email: me.email ?? null, phone: me.phone ?? null };
  return buildDefaultOm({
    site, address: fullSiteAddress(site) || '', company: org?.name || 'Our company', today: localISODate(new Date()),
    settings: st, pm, myEmail: me.email || '',
    schedSections: rows(secs) as never, tasks: rows(tasks) as never, boq, docs: rows(docs) as never, coshh: rows(coshh) as never, drawings: rows(drawings) as never, photos,
    cpp: cpp?.plan ?? null,
  });
}

/**
 * A subcontractor company's own manual (Andy, 20 Nov 2026): their company as the contractor, the main contractor as their
 * client, the Schedule of Works tasks assigned to them as the scope (with their photos), and their COSHH on this job.
 */
async function buildFromCompany(me: Profile, org: Organization | null, site: Site, companyId: string): Promise<OmData> {
  const [co, secs, tasks, coshh, photos] = await Promise.all([
    db.from('subcontractor_companies').select('name').eq('id', companyId).maybeSingle(),
    db.from('schedule_sections').select('id,name').eq('site_id', site.id).order('position'),
    db.from('schedule_tasks').select('id,name,status,section_id').eq('site_id', site.id).eq('subcontractor_company_id', companyId).order('position'),
    db.from('coshh_docs').select('id,name,storage_path').eq('site_id', site.id).eq('subcontractor_company_id', companyId).order('uploaded_at'),
    jobPhotos(site.id, companyId),
  ]);
  const name = (co.data as { name: string } | null)?.name || 'Our company';
  const d = buildDefaultOm({
    site: { name: site.name, client_name: org?.name || site.client_name, job_number: site.job_number }, address: fullSiteAddress(site) || '', company: name, today: localISODate(new Date()),
    settings: { address: '', phone: '' }, pm: { name: me.name, email: me.email ?? null, phone: me.phone ?? null }, myEmail: me.email || '',
    schedSections: rows(secs) as never, tasks: rows(tasks) as never, docs: [], coshh: rows(coshh) as never, drawings: [], photos, cpp: null,
  });
  d.forCompany = companyId;
  d.attach = { datasheets: false, guarantees: false, coshh: true, drawings: false };
  return d;
}

export async function newManual(me: Profile, org: Organization | null, site: Site, name: string, companyId: string | null = null): Promise<string | null> {
  const data = companyId ? await buildFromCompany(me, org, site, companyId) : await buildFromJob(me, org, site); normalizeOm(data);
  const r = await db.from('handover_om_manuals').insert({ site_id: site.id, org_id: site.org_id || me.org_id, name: name.trim() || 'O&M Manual', data, created_by: me.id, updated_by: me.id, subcontractor_company_id: companyId } as never).select('id').single();
  return r.error ? null : (r.data as { id: string }).id;
}
/** Opens a manual; a manual never built yet is built from the job, and older ones are tidied (and saved). */
export async function loadManual(me: Profile, org: Organization | null, site: Site, id: string): Promise<{ name: string; data: OmData } | null> {
  const row = (await db.from('handover_om_manuals').select('*').eq('id', id).eq('site_id', site.id).maybeSingle()).data as Row | null;
  if (!row) return null;
  const co = (row.subcontractor_company_id as string | null) || null;
  let data = row.data?.sections ? (row.data as OmData) : null;
  const isNew = !data;
  if (!data) data = co ? await buildFromCompany(me, org, site, co) : await buildFromJob(me, org, site);
  if (co && data.forCompany !== co) data.forCompany = co;
  // Documents and COSHH added to the job since the manual was started come in now (857 hoSyncDocs / hoSyncCoshh). A
  // subcontractor's manual takes their own COSHH, and none of the main contractor's data sheets or guarantees.
  let cq = db.from('coshh_docs').select('id,name,storage_path').eq('site_id', site.id);
  cq = co ? cq.eq('subcontractor_company_id', co) : cq.is('subcontractor_company_id', null);
  const [docs, coshh] = await Promise.all([
    co ? Promise.resolve({ data: [] }) : db.from('handover_docs').select('id,kind,name,provider,ref,expiry_date,maintenance').eq('site_id', site.id).order('position').order('created_at'),
    cq.order('uploaded_at'),
  ]);
  const tidy = normalizeOm(data);
  // Older manuals get the Project Team (People tab); it's left out of the PDF until someone is named in it.
  const team = !data.sections.some((s) => s.key === 'team'); if (team) ensureTeam(data);
  const synced = syncOmDocs(data, rows(docs) as never);
  const syncedC = syncOmCoshh(data, rows(coshh) as never);
  if (tidy || team || isNew || synced || syncedC) await saveManual(me, id, row.name || 'O&M Manual', data);
  return { name: row.name || 'O&M Manual', data };
}
export async function saveManual(me: Profile, id: string, name: string, data: OmData): Promise<boolean> {
  return !!(await db.from('handover_om_manuals').update({ data, name, updated_at: new Date().toISOString(), updated_by: me.id } as never).eq('id', id).select('id')).data?.length;
}
export async function duplicateManual(me: Profile, id: string): Promise<boolean> {
  const m = (await db.from('handover_om_manuals').select('*').eq('id', id).maybeSingle()).data as Row | null;
  if (!m) return false;
  return !(await db.from('handover_om_manuals').insert({ site_id: m.site_id, org_id: m.org_id, name: `${m.name || 'O&M Manual'} (copy)`, data: m.data, created_by: me.id, updated_by: me.id } as never)).error;
}
export async function deleteManual(id: string): Promise<boolean> {
  return !!(await db.from('handover_om_manuals').delete().eq('id', id).select('id')).data?.length;
}

export type OmAttach = { bucket?: string; path?: string; name: string; gen?: { kind: string; reportId?: string; sections?: string[]; doneOnly?: boolean } };
const coshhName = (n: unknown) => String(n || '').replace(/\.pdf$/i, '').replace(/^COSHH\s*(Assessment)?\s*[—–-]\s*/i, '').replace(/^Data sheet\s*[—–-]\s*/i, '').trim().toLowerCase();
/** What goes in the back of the PDF, in order: appendix, guarantees, drawings, data sheets & COSHH (857 hoCollectAttachments). */
export async function collectAttachments(siteId: string, d: OmData): Promise<OmAttach[]> {
  const co = d.forCompany || null;
  const docs = co ? [] : rows(await db.from('handover_docs').select('id,kind,name,storage_path').eq('site_id', siteId));
  const G: Record<'app' | 'guar' | 'draw' | 'coshh', OmAttach[]> = { app: [], guar: [], draw: [], coshh: [] };
  const seen = new Set<string>(), coshhSeen = new Set<string>();
  const add = (g: keyof typeof G, a: OmAttach) => {
    if (a.path) { const k = `${a.bucket}|${a.path}`; if (seen.has(k)) return; seen.add(k); }
    if (/coshh/i.test(a.name || '') && !/^data sheet/i.test(a.name || '')) { const n = coshhName(a.name); if (n) { if (coshhSeen.has(n)) return; coshhSeen.add(n); } }
    G[g].push(a);
  };
  const groupOf = (s: OmData['sections'][number]) => (s.type === 'materials' ? 'coshh' : /guarantee|warrant/i.test(s.title || '') ? 'guar' : /drawing|specification/i.test(s.title || '') ? 'draw' : 'app') as keyof typeof G;
  (d.appendix || []).forEach((e) => { if (e.kind === 'file') add('app', { bucket: e.bucket, path: e.path, name: e.label }); else G.app.push({ gen: { kind: e.kind, reportId: e.reportId, sections: e.sections, doneOnly: e.doneOnly }, name: e.label }); });
  d.sections.forEach((s) => { const g = groupOf(s); (s.links || []).forEach((ls) => (ls || []).forEach((l) => {
    if (l.docId) { const x = docs.find((y) => y.id === l.docId); if (x?.storage_path) add(x.kind === 'datasheet' ? 'coshh' : x.kind === 'guarantee' ? 'guar' : g, { bucket: 'mc-documents', path: x.storage_path, name: x.name }); }
    else if (l.path) add(g, { bucket: l.bucket, path: l.path, name: l.name || 'Document' });
  })); });
  if (d.attach.guarantees) docs.filter((x) => x.kind === 'guarantee' && x.storage_path).forEach((x) => add('guar', { bucket: 'mc-documents', path: x.storage_path, name: x.name }));
  if (d.attach.drawings) rows(await db.from('drawing_files').select('name,storage_path,status').eq('site_id', siteId)).filter((x) => x.status !== 'superseded' && /\.(pdf|jpe?g|png)$/i.test(x.storage_path || '')).forEach((x) => add('draw', { bucket: 'drawings', path: x.storage_path, name: x.name }));
  if (d.attach.coshh) { let q = db.from('coshh_docs').select('name,storage_path').eq('site_id', siteId); q = co ? q.eq('subcontractor_company_id', co) : q.is('subcontractor_company_id', null); rows(await q).forEach((x) => add('coshh', { bucket: 'coshh-docs', path: x.storage_path, name: x.name })); }
  // The subcontractors' submitted O&M manuals, after the main contractor's own appendix (Andy, 20 Nov 2026).
  if (!co && d.attach.subs !== false) (await subOmFiles(siteId)).forEach((a) => add('app', a));
  if (d.attach.datasheets) docs.filter((x) => x.kind === 'datasheet' && x.storage_path).forEach((x) => add('coshh', { bucket: 'mc-documents', path: x.storage_path, name: x.name }));
  return [...G.app, ...G.guar, ...G.draw, ...G.coshh];
}

/** A file for the back of the manual (857 hoAddAppendix): uploaded from the device, or copied from the job's Schedule of Works
 *  documents (private schedule-docs) into mc-documents, so the manual keeps its own copy. */
export async function appendixFile(me: Profile, site: Site, src: { uri: string; name: string; mimeType?: string | null } | { bucket: string; path: string; name: string }): Promise<{ bucket: string; path: string; name: string } | null> {
  try {
    let body: ArrayBuffer, type: string;
    if ('uri' in src) { body = await (await fetch(src.uri)).arrayBuffer(); type = src.mimeType || 'application/pdf'; }
    else {
      const dl = await supabase.storage.from(src.bucket).download(src.path);
      if (dl.error || !dl.data) return null;
      body = await dl.data.arrayBuffer(); type = dl.data.type || (/\.png$/i.test(src.path) ? 'image/png' : /\.jpe?g$/i.test(src.path) ? 'image/jpeg' : 'application/pdf');
    }
    const rid = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}`;
    const up = await supabase.storage.from('mc-documents').upload(`${site.org_id || me.org_id}/handover/${site.id}/appendix/${rid}-${(src.name || 'file').replace(/[^a-z0-9.-]+/gi, '_')}`, body, { contentType: type });
    return up.error ? null : { bucket: 'mc-documents', path: up.data.path, name: src.name || 'Document' };
  } catch { return null; }
}

/** A file attached to a table row (857 hoRowUpload) — goes in the back of the PDF after that section. */
export async function uploadRowFile(me: Profile, site: Site, a: { uri: string; name: string; mimeType?: string | null }): Promise<{ bucket: string; path: string; name: string } | null> {
  try {
    const rid = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}`;
    const up = await supabase.storage.from('mc-documents').upload(`${site.org_id || me.org_id}/handover/${site.id}/rows/${rid}-${(a.name || 'file').replace(/[^a-z0-9.-]+/gi, '_')}`, await (await fetch(a.uri)).arrayBuffer(), { contentType: a.mimeType || 'application/pdf' });
    return up.error ? null : { bucket: 'mc-documents', path: up.data.path, name: a.name || 'Document' };
  } catch { return null; }
}

/**
 * Issue the manual (Andy, 20 Nov 2026): the next revision number and today's date go on the cover, the PDF is built and
 * kept with the manual (and filed in the job's OneDrive folder when the company has one), and the revision is recorded
 * with what changed. Gives the issued manual, or what went wrong.
 */
export async function issueManual(me: Profile, org: Organization | null, site: Site, manualId: string, name: string, d0: OmData, note: string, nameOf: (id: string | null | undefined) => string, onStatus?: (m: string) => void): Promise<{ d: OmData; notAttached: string[]; bytes: Uint8Array; filename: string } | string> {
  const sub = !!d0.forCompany;
  const d = JSON.parse(JSON.stringify(d0)) as OmData;
  const rev = nextRevision(d), today = localISODate(new Date());
  d.cover = { ...(d.cover || {}), revision: rev, date: today };
  const pcRow = sub ? null : ((await supabase.rpc('site_completion' as never, { p_site: site.id } as never)).data as { pc_date: string | null }[] | null)?.[0];
  d.dates = { ...(d.dates || {}), pc: pcRow?.pc_date || null };
  let out: { bytes: Uint8Array; notAttached: string[] };
  try { out = await buildOmPdf(d, site, org, nameOf, onStatus); } catch { return 'Could not build the PDF — try again.'; }
  const filename = `O&M Manual Rev ${rev} - ${site.name || 'Project'}.pdf`.replace(/[\\/:*?"<>|]+/g, '-');
  const rid = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}`;
  const up = await supabase.storage.from('mc-documents').upload(`${site.org_id || me.org_id}/handover/${site.id}/issued/${rid}-OM_Manual_Rev_${rev}.pdf`, out.bytes, { contentType: 'application/pdf' });
  if (up.error) return 'Upload failed — check your signal and try again.';
  if (!sub) packPdfBytes(site.id, 'om_manual', filename, out.bytes);
  d.revisions = [...(d.revisions || []), { rev, date: today, by: me.name || '', note: note.trim() || (rev === '1' ? 'First issue' : ''), path: up.data.path }];
  if (!(await saveManual(me, manualId, name, d))) return 'The PDF is made, but the manual could not be saved — try again.';
  // A subcontractor's manual is submitted to the main contractor when it's issued.
  if (sub) await db.from('handover_om_manuals').update({ submitted_at: new Date().toISOString() } as never).eq('id', manualId);
  return { d, notAttached: out.notAttached, bytes: out.bytes, filename };
}

/* ---------- Subcontractors' O&M manuals (Andy, 20 Nov 2026) ---------- */
export type SubOm = { id: string; name: string; companyId: string; company: string; submittedAt: string | null; path: string | null; built: boolean; rev: string | null; updatedAt: string | null };
/** The subcontractors' O&M manuals on a job (all of them for a PM; a subcontractor's admin sees only their own). */
export async function loadSubOms(siteId: string, companyId?: string | null): Promise<SubOm[]> {
  let q = db.from('handover_om_manuals').select('id,name,subcontractor_company_id,submitted_at,file_path,data,updated_at,created_at').eq('site_id', siteId);
  q = companyId ? q.eq('subcontractor_company_id', companyId) : q.not('subcontractor_company_id', 'is', null);
  const [m, c] = await Promise.all([q.order('created_at'), db.from('subcontractor_companies').select('id,name').eq('site_id', siteId)]);
  const names: Record<string, string> = Object.fromEntries(rows<{ id: string; name: string }>(c).map((x) => [x.id, x.name]));
  return rows<Row>(m).map((r) => {
    const revs = (r.data?.revisions || []) as { rev: string; path?: string | null }[], last = revs[revs.length - 1];
    return { id: r.id, name: r.name || 'O&M Manual', companyId: r.subcontractor_company_id, company: names[r.subcontractor_company_id] || 'Subcontractor', submittedAt: r.submitted_at || null,
      path: r.file_path || last?.path || null, built: !r.file_path, rev: last?.rev ?? null, updatedAt: r.updated_at || r.created_at || null };
  });
}
/** Their submitted manuals, as files for the back of the main contractor's manual. */
export async function subOmFiles(siteId: string): Promise<OmAttach[]> {
  return (await loadSubOms(siteId)).filter((x) => x.submittedAt && x.path).map((x) => ({ bucket: 'mc-documents', path: x.path as string, name: `${x.company} — ${x.name}` }));
}
/** A subcontractor's own O&M manual uploaded as a PDF: submitted to the main contractor straight away. */
export async function uploadSubOm(me: Profile, site: Site, companyId: string, f: { uri: string; name: string; mimeType?: string | null }): Promise<boolean> {
  try {
    const rid = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}`;
    const up = await supabase.storage.from('mc-documents').upload(`${site.org_id || me.org_id}/handover/${site.id}/subs/${companyId}/${rid}-${(f.name || 'om.pdf').replace(/[^a-z0-9.-]+/gi, '_')}`, await (await fetch(f.uri)).arrayBuffer(), { contentType: f.mimeType || 'application/pdf' });
    if (up.error) return false;
    const now = new Date().toISOString();
    return !(await db.from('handover_om_manuals').insert({ site_id: site.id, org_id: site.org_id || me.org_id, subcontractor_company_id: companyId, name: (f.name || 'O&M Manual').replace(/\.pdf$/i, ''), data: {}, file_path: up.data.path, submitted_at: now, created_by: me.id, updated_by: me.id } as never)).error;
  } catch { return false; }
}
