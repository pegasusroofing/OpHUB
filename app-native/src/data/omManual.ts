// O&M manuals (857): a job can have several (handover_om_manuals, the manual
// itself kept as JSON in `data`). New, open (tidying older ones), save,
// duplicate, delete, and collecting what goes in the back of the PDF.
import { loadSettings } from '@/data/ramsBuilder';
import { fullSiteAddress } from '@/lib/rules/checkin';
import { localISODate } from '@/lib/rules/driver';
import { buildDefaultOm, normalizeOm, type OmData, type OmPhoto } from '@/lib/rules/omManual';
import { supabase } from '@/lib/supabase';
import type { Organization, Profile, Site } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
type Row = Record<string, any>;
const rows = <T = Row>(r: { data: unknown }) => ((r.data as T[] | null) ?? []);

export async function jobPhotos(siteId: string): Promise<(OmPhoto & { thumb: string })[]> {
  const tasks = rows<{ id: string; name: string }>(await db.from('schedule_tasks').select('id,name').eq('site_id', siteId));
  if (!tasks.length) return [];
  const nm: Record<string, string> = Object.fromEntries(tasks.map((t) => [t.id, t.name]));
  const ph = rows(await db.from('schedule_photos').select('task_id,storage_path,mid_path,thumb_path').in('task_id', tasks.map((t) => t.id)).order('uploaded_at', { ascending: false }).limit(200));
  return ph.map((p) => ({ bucket: 'site-photos', path: p.mid_path || p.storage_path, thumb: p.thumb_path || p.mid_path || p.storage_path, caption: nm[p.task_id] || '' }));
}

async function buildFromJob(me: Profile, org: Organization | null, site: Site): Promise<OmData> {
  const [secs, tasks, docs, coshh, drawings, photos, st, pmRow] = await Promise.all([
    db.from('schedule_sections').select('id,name').eq('site_id', site.id).order('position'),
    db.from('schedule_tasks').select('id,name,status,section_id').eq('site_id', site.id).order('position'),
    db.from('handover_docs').select('*').eq('site_id', site.id).order('position').order('created_at'),
    db.from('coshh_docs').select('id,name,storage_path').eq('site_id', site.id).order('uploaded_at'),
    db.from('drawing_files').select('id,name,uploaded_at,status').eq('site_id', site.id).order('uploaded_at'),
    jobPhotos(site.id),
    loadSettings(org as never),
    site.responsible_pm_id ? db.from('profiles').select('name,email,phone').eq('id', site.responsible_pm_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const pm = (pmRow.data as { name: string; email: string | null; phone: string | null } | null) ?? { name: me.name, email: me.email ?? null, phone: me.phone ?? null };
  return buildDefaultOm({
    site, address: fullSiteAddress(site) || '', company: org?.name || 'Our company', today: localISODate(new Date()),
    settings: st, pm, myEmail: me.email || '',
    schedSections: rows(secs) as never, tasks: rows(tasks) as never, docs: rows(docs) as never, coshh: rows(coshh) as never, drawings: rows(drawings) as never, photos,
  });
}

export async function newManual(me: Profile, org: Organization | null, site: Site, name: string): Promise<string | null> {
  const data = await buildFromJob(me, org, site); normalizeOm(data);
  const r = await db.from('handover_om_manuals').insert({ site_id: site.id, org_id: site.org_id || me.org_id, name: name.trim() || 'O&M Manual', data, created_by: me.id, updated_by: me.id } as never).select('id').single();
  return r.error ? null : (r.data as { id: string }).id;
}
/** Opens a manual; a manual never built yet is built from the job, and older ones are tidied (and saved). */
export async function loadManual(me: Profile, org: Organization | null, site: Site, id: string): Promise<{ name: string; data: OmData } | null> {
  const row = (await db.from('handover_om_manuals').select('*').eq('id', id).eq('site_id', site.id).maybeSingle()).data as Row | null;
  if (!row) return null;
  let data = row.data?.sections ? (row.data as OmData) : null;
  const isNew = !data;
  if (!data) data = await buildFromJob(me, org, site);
  if (normalizeOm(data) || isNew) await saveManual(me, id, row.name || 'O&M Manual', data);
  return { name: row.name || 'O&M Manual', data };
}
export async function saveManual(me: Profile, id: string, name: string, data: OmData): Promise<boolean> {
  return !(await db.from('handover_om_manuals').update({ data, name, updated_at: new Date().toISOString(), updated_by: me.id } as never).eq('id', id)).error;
}
export async function duplicateManual(me: Profile, id: string): Promise<boolean> {
  const m = (await db.from('handover_om_manuals').select('*').eq('id', id).maybeSingle()).data as Row | null;
  if (!m) return false;
  return !(await db.from('handover_om_manuals').insert({ site_id: m.site_id, org_id: m.org_id, name: `${m.name || 'O&M Manual'} (copy)`, data: m.data, created_by: me.id, updated_by: me.id } as never)).error;
}
export async function deleteManual(id: string): Promise<boolean> {
  return !(await db.from('handover_om_manuals').delete().eq('id', id)).error;
}

export type OmAttach = { bucket?: string; path?: string; name: string; gen?: { kind: string; reportId?: string } };
const coshhName = (n: unknown) => String(n || '').replace(/\.pdf$/i, '').replace(/^COSHH\s*(Assessment)?\s*[—–-]\s*/i, '').replace(/^Data sheet\s*[—–-]\s*/i, '').trim().toLowerCase();
/** What goes in the back of the PDF, in order: appendix, guarantees, drawings, data sheets & COSHH (857 hoCollectAttachments). */
export async function collectAttachments(siteId: string, d: OmData): Promise<OmAttach[]> {
  const docs = rows(await db.from('handover_docs').select('id,kind,name,storage_path').eq('site_id', siteId));
  const G: Record<'app' | 'guar' | 'draw' | 'coshh', OmAttach[]> = { app: [], guar: [], draw: [], coshh: [] };
  const seen = new Set<string>(), coshhSeen = new Set<string>();
  const add = (g: keyof typeof G, a: OmAttach) => {
    if (a.path) { const k = `${a.bucket}|${a.path}`; if (seen.has(k)) return; seen.add(k); }
    if (/coshh/i.test(a.name || '') && !/^data sheet/i.test(a.name || '')) { const n = coshhName(a.name); if (n) { if (coshhSeen.has(n)) return; coshhSeen.add(n); } }
    G[g].push(a);
  };
  const groupOf = (s: OmData['sections'][number]) => (s.type === 'materials' ? 'coshh' : /guarantee|warrant/i.test(s.title || '') ? 'guar' : /drawing|specification/i.test(s.title || '') ? 'draw' : 'app') as keyof typeof G;
  (d.appendix || []).forEach((e) => { if (e.kind === 'file') add('app', { bucket: e.bucket, path: e.path, name: e.label }); else G.app.push({ gen: { kind: e.kind, reportId: e.reportId }, name: e.label }); });
  d.sections.forEach((s) => { const g = groupOf(s); (s.links || []).forEach((ls) => (ls || []).forEach((l) => {
    if (l.docId) { const x = docs.find((y) => y.id === l.docId); if (x?.storage_path) add(x.kind === 'datasheet' ? 'coshh' : x.kind === 'guarantee' ? 'guar' : g, { bucket: 'mc-documents', path: x.storage_path, name: x.name }); }
    else if (l.path) add(g, { bucket: l.bucket, path: l.path, name: l.name || 'Document' });
  })); });
  if (d.attach.guarantees) docs.filter((x) => x.kind === 'guarantee' && x.storage_path).forEach((x) => add('guar', { bucket: 'mc-documents', path: x.storage_path, name: x.name }));
  if (d.attach.drawings) rows(await db.from('drawing_files').select('name,storage_path,status').eq('site_id', siteId)).filter((x) => x.status !== 'superseded' && /\.(pdf|jpe?g|png)$/i.test(x.storage_path || '')).forEach((x) => add('draw', { bucket: 'drawings', path: x.storage_path, name: x.name }));
  if (d.attach.coshh) rows(await db.from('coshh_docs').select('name,storage_path').eq('site_id', siteId).is('subcontractor_company_id', null)).forEach((x) => add('coshh', { bucket: 'coshh-docs', path: x.storage_path, name: x.name }));
  if (d.attach.datasheets) docs.filter((x) => x.kind === 'datasheet' && x.storage_path).forEach((x) => add('coshh', { bucket: 'mc-documents', path: x.storage_path, name: x.name }));
  return [...G.app, ...G.guar, ...G.draw, ...G.coshh];
}
