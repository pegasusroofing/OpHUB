// Construction Phase Plan builder data (Andy, 19 Nov 2026). A job's plans (cpp_plans), started with as much as the
// job already knows: the company, the site, the client, the PM, first aiders (from certificates), the Schedule of
// Works as the outline, the start date, the nearest A&E (OpenStreetMap) and the company's saved wording
// (cpp_defaults). Issuing makes the PDF and files it in the job's Construction Phase Plan folder (mc_documents 'cpp').
import { useQuery } from '@tanstack/react-query';

import { packPdfBytes } from '@/data/jobPack';
import { loadSettings } from '@/data/ramsBuilder';
import { buildCppPdf } from '@/lib/pdfLazy';
import { fullSiteAddress } from '@/lib/rules/checkin';
import { blankCpp, normaliseCpp, outlineFromSow, pickHospital, type CppHospital, type CppPlan, type CppSection } from '@/lib/rules/cpp';
import { supabase } from '@/lib/supabase';
import type { Organization, Profile, Site } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
type Me = Profile & { phone?: string | null };
type Org = (Organization & { rams_settings?: unknown }) | null;
export type CppRow = { id: string; site_id: string; title: string; status: string; version: number; updated_at: string; mc_document_id: string | null; data?: Partial<CppPlan> };

export function useCppPlans(siteId: string | undefined) {
  return useQuery({ queryKey: ['cppPlans', siteId], enabled: !!siteId, queryFn: async () => ((await db.from('cpp_plans').select('id,site_id,title,status,version,updated_at,mc_document_id').eq('site_id', siteId as string).order('updated_at', { ascending: false })).data as CppRow[] | null) ?? [] });
}
export async function loadCpp(id: string): Promise<{ row: CppRow; plan: CppPlan } | null> {
  const row = (await db.from('cpp_plans').select('*').eq('id', id).maybeSingle()).data as CppRow | null;
  return row ? { row, plan: normaliseCpp(row.data) } : null;
}
export async function saveCpp(id: string, plan: CppPlan): Promise<boolean> {
  return !!(await db.from('cpp_plans').update({ data: plan, updated_at: new Date().toISOString() } as never).eq('id', id).select('id')).data?.length;
}
export const deleteCpp = async (id: string) => !!(await db.from('cpp_plans').delete().eq('id', id).select('id')).data?.length;

/** The company's saved wording (sections, advisor, waste licence, site hours, emergency numbers, contacts). */
type Defaults = Partial<Pick<CppPlan, 'advisor' | 'wasteLicence' | 'siteHours' | 'utilities' | 'contacts' | 'hse'>> & { sections?: Omit<CppSection, 'id'>[] };
async function loadDefaults(orgId: string | null | undefined): Promise<Defaults> {
  if (!orgId) return {};
  return (((await db.from('cpp_defaults').select('data').eq('org_id', orgId).maybeSingle()).data as { data: Defaults } | null)?.data) || {};
}
/** Saves this plan's wording as the company's starting point for the next plan. The site, client and company names go
 *  back to {site}, {client} and {company}, so they fill in afresh on the next job. */
export async function saveCppDefaults(orgId: string, p: CppPlan): Promise<boolean> {
  const back = (t: string) => [[p.siteName, '{site}'], [p.client.name, '{client}'], [p.pc.name, '{company}']].reduce((s, [from, to]) => (from.trim().length > 2 ? s.split(from.trim()).join(to) : s), t);
  const data: Defaults = {
    advisor: p.advisor, wasteLicence: p.wasteLicence, siteHours: p.siteHours, hse: p.hse, utilities: p.utilities,
    contacts: p.contacts.map((c) => (/project manager|first aid/i.test(c.role) ? { ...c, name: '', day: '', ooh: '' } : c)),
    sections: p.sections.map(({ num, title, body }) => ({ num, title, body: back(body) })),
  };
  return !(await db.from('cpp_defaults').upsert({ org_id: orgId, data, updated_at: new Date().toISOString() } as never, { onConflict: 'org_id' })).error;
}

/** The company's CPP template (Admin > H&S): the saved wording, or the standard wording if none is saved yet. */
export async function loadCppTemplate(orgId: string | null | undefined): Promise<CppPlan> {
  const d = await loadDefaults(orgId), p = blankCpp(d.sections);
  if (d.advisor) p.advisor = d.advisor;
  if (d.wasteLicence) p.wasteLicence = d.wasteLicence;
  if (d.siteHours) p.siteHours = d.siteHours;
  if (d.hse) p.hse = d.hse;
  if (d.utilities?.length) p.utilities = d.utilities;
  if (d.contacts?.length) p.contacts = d.contacts;
  return p;
}

/** Where to search from: the job's check-in point while the postcode is still the job's; otherwise the postcode typed
 *  in (postcodes.io, as the weather and Sites Map do); otherwise the address typed in (OpenStreetMap's Nominatim). */
export async function pointFor(from: { address: string; postcode: string }, site?: Site | null): Promise<{ lat: number; lon: number } | null> {
  const norm = (x: unknown) => String(x || '').replace(/\s+/g, '').toUpperCase();
  const pc = String(from.postcode || '').trim();
  if (site && typeof site.geofence_lat === 'number' && typeof site.geofence_lon === 'number' && (!pc || norm(pc) === norm(site.postcode))) return { lat: site.geofence_lat, lon: site.geofence_lon };
  try {
    if (pc) {
      let at = (await (await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`)).json())?.result;
      if (!at) at = (await (await fetch(`https://api.postcodes.io/outcodes/${encodeURIComponent(pc.split(/\s+/)[0])}`)).json())?.result;
      if (at && typeof at.latitude === 'number') return { lat: at.latitude, lon: at.longitude };
    }
    const q = String(from.address || '').replace(/\n/g, ', ').trim();
    if (q) {
      const r = (await (await fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=gb&limit=1&q=${encodeURIComponent(q)}`)).json()) as { lat: string; lon: string }[];
      if (r?.[0]) return { lat: Number(r[0].lat), lon: Number(r[0].lon) };
    }
  } catch { /* falls through */ }
  return null;
}
/** The job's address and postcode, to start the A&E search from. */
export const siteFrom = (site: Site) => ({ address: String(fullSiteAddress(site) || site.name || '').trim(), postcode: String(site.postcode || '').trim() });
type OsmEl = { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };
async function fetchT(url: string, init: RequestInit = {}, ms = 15000) {
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...init, signal: ctrl.signal }); } finally { clearTimeout(timer); }
}
/** Hospitals in a box round the point from OpenStreetMap's own search (Nominatim), shaped like Overpass's answer.
 *  km is half the box's width. */
async function nominatimHospitals(at: { lat: number; lon: number }, km: number): Promise<OsmEl[]> {
  const dy = km / 111, dx = km / (111 * Math.cos((at.lat * Math.PI) / 180));
  const u = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=hospital&bounded=1&limit=50&extratags=1&addressdetails=1&viewbox=${(at.lon - dx).toFixed(4)},${(at.lat + dy).toFixed(4)},${(at.lon + dx).toFixed(4)},${(at.lat - dy).toFixed(4)}`;
  const r = await fetchT(u);
  if (!r.ok) throw new Error(`nominatim ${r.status}`);
  const rows = (await r.json()) as { category?: string; type?: string; name?: string; lat: string; lon: string; extratags?: Record<string, string> | null; address?: Record<string, string> }[];
  return (rows || []).filter((x) => x.category === 'amenity' && x.type === 'hospital' && x.name).map((x) => {
    const a = x.address || {};
    return { lat: Number(x.lat), lon: Number(x.lon), tags: { ...(x.extratags || {}), name: x.name as string, 'addr:housenumber': a.house_number || '', 'addr:street': a.road || '', 'addr:city': a.city || a.town || a.village || a.suburb || '', 'addr:postcode': a.postcode || '' } };
  });
}
/** The nearest A&E from OpenStreetMap: hospitals marked emergency=yes, nearest first; any hospital if none is marked.
 *  OpenStreetMap's own search, near the job first (8 km) then wider (25 km); the Overpass service only if that fails
 *  (19 Nov 2026: Overpass turns most requests away - "at capacity" - so it can't be the only way). Gives a reason
 *  when it can't. */
export async function findHospital(from: { address: string; postcode: string }, site?: Site | null): Promise<CppHospital | string> {
  const at = await pointFor(from, site);
  if (!at) return 'Could not find that postcode - check it, or type the hospital in.';
  try {
    const near = await nominatimHospitals(at, 8);
    const els = near.some((e) => e.tags?.emergency === 'yes') ? near : [...near, ...(await nominatimHospitals(at, 25).catch(() => [] as OsmEl[]))];
    const h = pickHospital(at, els);
    if (h) return h;
  } catch { /* try Overpass */ }
  try {
    const q = `[out:json][timeout:20];(nwr["amenity"="hospital"](around:25000,${at.lat},${at.lon}););out center tags 60;`;
    const r = await fetchT('https://overpass-api.de/api/interpreter', { method: 'POST', body: `data=${encodeURIComponent(q)}`, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, 20000);
    if (!r.ok) return 'The hospital search is busy - try again in a minute, or type it in.';
    return pickHospital(at, ((await r.json()) as { elements?: OsmEl[] })?.elements || []) || 'No hospital found within 25 km - type it in.';
  } catch { return 'Could not reach the hospital search - check signal, or type it in.'; }
}

/** A new plan for this job, filled from everything the job already knows. */
export async function createCpp(me: Me, org: Org, site: Site): Promise<string | null> {
  const [defs, st] = await Promise.all([loadDefaults(me.org_id), loadSettings(org as never)]);
  const p = blankCpp(defs.sections);
  if (defs.advisor) p.advisor = defs.advisor;
  if (defs.wasteLicence) p.wasteLicence = defs.wasteLicence;
  if (defs.siteHours) p.siteHours = defs.siteHours;
  if (defs.hse) p.hse = defs.hse;
  if (defs.utilities?.length) p.utilities = defs.utilities;
  if (defs.contacts?.length) p.contacts = defs.contacts;
  // The company and the person writing it.
  p.pc = { name: org?.name || '', address: st.address || '', phone: st.phone || '', email: me.email || '' };
  p.preparedBy = me.name || '';
  p.preparedDate = new Date().toISOString().slice(0, 10);
  // The site and the client.
  p.siteName = site.name || '';
  const full = String(fullSiteAddress(site) || '').trim();
  p.siteAddress = [site.name && !full.toLowerCase().startsWith(String(site.name).toLowerCase()) ? site.name : '', full].filter(Boolean).join('\n');
  p.client = { name: site.client_name || '', contact: site.client_contact_name || '', phone: site.client_phone || '', email: site.client_email || '', address: '' };
  p.startDate = site.start_date || '';
  const ids = (((await db.from('site_assignments').select('user_id').eq('site_id', site.id)).data as { user_id: string }[] | null) ?? []).map((a) => a.user_id);
  const [pmRow, sows, tasks, certs, ramsB] = await Promise.all([
    site.responsible_pm_id ? db.from('profiles').select('name,phone,email').eq('id', site.responsible_pm_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from('schedule_sections').select('id,name,position').eq('site_id', site.id).order('position'),
    db.from('schedule_tasks').select('name,section_id,position').eq('site_id', site.id).order('position'),
    ids.length ? db.from('operative_certifications').select('operative_id,name,category,other_type_description,expiry_date').in('operative_id', ids) : Promise.resolve({ data: [] }),
    db.from('rams_builds').select('details,updated_at').eq('site_id', site.id).order('updated_at', { ascending: false }).limit(1),
  ]);
  const pm = (pmRow.data as { name: string | null; phone: string | null; email: string | null } | null) || { name: me.name, phone: me.phone ?? null, email: me.email };
  p.pm = { name: pm.name || '', phone: pm.phone || '', email: pm.email || '' };
  p.emergencyMobile = pm.phone || me.phone || '';
  p.outline = outlineFromSow((sows.data as { id: string; name: string }[] | null) ?? [], (tasks.data as { name: string; section_id: string | null }[] | null) ?? []);
  const rd = (((ramsB.data as { details: Record<string, string> | null }[] | null) ?? [])[0]?.details) || {};
  if (rd.duration) p.duration = String(rd.duration);
  if (!p.startDate && rd.startDate) p.startDate = String(rd.startDate);
  // First aiders: people on the job with an in-date first aid certificate.
  const today = new Date().toISOString().slice(0, 10);
  const faIds = [...new Set(((certs.data as { operative_id: string; name: string | null; category: string | null; other_type_description: string | null; expiry_date: string | null }[] | null) ?? [])
    .filter((c) => /first\s*aid/i.test(`${c.name} ${c.category} ${c.other_type_description}`) && (!c.expiry_date || c.expiry_date >= today)).map((c) => c.operative_id))];
  const faPeople = faIds.length ? (((await db.from('profiles').select('name,phone').in('id', faIds)).data as { name: string | null; phone: string | null }[] | null) ?? []) : [];
  p.firstAiders = faPeople.map((f) => [f.name, f.phone ? `Tel: ${f.phone}` : ''].filter(Boolean).join(' ')).join('\n');
  p.issues = [{ copy: '1', version: '1', issuedTo: p.client.contact || p.client.name, date: '' }];
  p.contacts = p.contacts.map((c) => (/project manager/i.test(c.role) && !c.name ? { ...c, name: p.pm.name, day: p.pm.phone, ooh: p.emergencyMobile } : /first aid/i.test(c.role) && !c.name && faPeople.length ? { ...c, name: faPeople.map((f) => f.name).join(', '), day: faPeople[0].phone || '', ooh: p.emergencyMobile } : c));
  // The nearest A&E (best effort; there's a button to try again).
  p.hospitalFrom = siteFrom(site);
  const h = await findHospital(p.hospitalFrom, site);
  if (typeof h !== 'string') p.hospital = h;
  const r = await db.from('cpp_plans').insert({ org_id: me.org_id, site_id: site.id, title: `Construction Phase Plan - ${site.name || 'Job'}`, data: p } as never).select('id').single();
  return (r.data as { id: string } | null)?.id ?? null;
}

/** The job's Schedule of Works again, as the outline (after the SOW changes). */
export async function sowOutline(siteId: string): Promise<string> {
  const [s, t] = await Promise.all([db.from('schedule_sections').select('id,name,position').eq('site_id', siteId).order('position'), db.from('schedule_tasks').select('name,section_id,position').eq('site_id', siteId).order('position')]);
  return outlineFromSow((s.data as { id: string; name: string }[] | null) ?? [], (t.data as { name: string; section_id: string | null }[] | null) ?? []);
}

/** A site plan or fire route plan picture, kept with the job's main contractor documents. */
export async function uploadCppImage(siteId: string, uri: string): Promise<string | null> {
  try {
    const rid = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}`;
    const up = await supabase.storage.from('mc-documents').upload(`${siteId}/cpp-images/${rid}.jpg`, await (await fetch(uri)).arrayBuffer(), { contentType: 'image/jpeg' });
    return up.error ? null : up.data.path;
  } catch { return null; }
}

/** The job's current RAMS and COSHH, listed in section 17. */
async function jobDocs(siteId: string): Promise<{ rams: string[]; coshh: string[] }> {
  const [r, c] = await Promise.all([db.from('rams_docs').select('name,status').eq('site_id', siteId), db.from('coshh_docs').select('name').eq('site_id', siteId)]);
  return {
    rams: (((r.data as { name: string; status: string | null }[] | null) ?? []).filter((d) => (d.status || 'current') === 'current').map((d) => d.name)),
    coshh: (((c.data as { name: string }[] | null) ?? []).map((d) => d.name)),
  };
}
export async function previewCpp(org: Org, siteId: string, p: CppPlan) {
  return buildCppPdf(p, org, await jobDocs(siteId));
}
/** Issues the plan: the PDF goes into the job's Construction Phase Plan folder. Issuing again is a revision (Andy, 19 Nov
 *  2026: "allow revisions to be made"): the next version, with what changed in the revision history, and the earlier
 *  PDF stays in the folder, named as superseded. */
export async function issueCpp(me: Me, org: Org, row: CppRow, p: CppPlan, note: string): Promise<{ plan: CppPlan; docId: string } | string> {
  const plan: CppPlan = { ...p, version: row.status === 'issued' ? p.version + 1 : p.version };
  const today = new Date().toISOString().slice(0, 10);
  plan.revisions = [...plan.revisions.filter((r) => r.version !== plan.version), { version: plan.version, date: today, by: me.name || '', note: note.trim() || (plan.version === 1 ? 'First issue' : ''), docId: null, path: null }];
  if (row.status === 'issued') plan.issues = [...plan.issues, { copy: String(plan.issues.length + 1), version: String(plan.version), issuedTo: plan.client.contact || plan.client.name, date: new Date().toISOString().slice(0, 10) }];
  else plan.issues = plan.issues.map((i, k) => (k === 0 && !i.date ? { ...i, date: new Date().toISOString().slice(0, 10) } : i));
  const out = await buildCppPdf(plan, org, await jobDocs(row.site_id));
  const rid = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}`;
  const up = await supabase.storage.from('mc-documents').upload(`${row.site_id}/cpp/${rid}-Construction_Phase_Plan_v${plan.version}.pdf`, out.bytes, { contentType: 'application/pdf' });
  if (up.error) return 'Upload failed - check signal and try again.';
  // Into the job's OneDrive folder when the company has added it (Where Things Save, 19 Nov 2026).
  packPdfBytes(row.site_id, 'cpp_issued', `Construction Phase Plan v${plan.version} - ${plan.siteName || 'Job'}.pdf`, out.bytes);
  const doc = await db.from('mc_documents').insert({ org_id: me.org_id, site_id: row.site_id, category: 'cpp', name: `Construction Phase Plan v${plan.version} - ${plan.siteName || 'Job'}`, storage_path: up.data.path, uploaded_by: me.id } as never).select('id').single();
  const docId = (doc.data as { id: string } | null)?.id;
  if (!docId) return 'Could not file the plan - try again.';
  plan.revisions = plan.revisions.map((r) => (r.version === plan.version ? { ...r, docId, path: up.data.path } : r));
  // The version this replaces stays in the folder, named as superseded.
  // Which PDF was current comes from the database, not the screen, so it's right however the page was opened.
  const prevDoc = row.status === 'issued' ? ((((await db.from('cpp_plans').select('mc_document_id').eq('id', row.id).maybeSingle()).data as { mc_document_id: string | null } | null)?.mc_document_id) ?? row.mc_document_id) : null;
  if (prevDoc) {
    const old = (await db.from('mc_documents').select('name').eq('id', prevDoc).maybeSingle()).data as { name: string } | null;
    if (old && !/superseded/i.test(old.name)) await db.from('mc_documents').update({ name: `${old.name} (Superseded by v${plan.version})` } as never).eq('id', prevDoc);
  }
  const ok = !!(await db.from('cpp_plans').update({ data: plan, version: plan.version, status: 'issued', mc_document_id: docId, updated_at: new Date().toISOString() } as never).eq('id', row.id).select('id')).data?.length;
  return ok ? { plan, docId } : 'The PDF is filed, but the plan could not be updated - try again.';
}
