// COSHH Library data (589 / 820): products (rams_library_items, kind 'coshh'),
// the assessment folders and files (coshh_library_folders / _files), making
// and updating a product's assessment, and putting COSHH onto a job — either
// issued fresh from products or copied in from the folders.
import { useQuery } from '@tanstack/react-query';

import { log, tellOperatives } from '@/data/hsManager';
import { loadSettings } from '@/data/ramsBuilder';
import { buildCoshhPdf } from '@/lib/coshhPdf';
import { fetchBytes, PDFDocument } from '@/lib/pdf';
import { publicUrl } from '@/lib/privateFiles';
import { pdfPageTexts } from '@/lib/pdfjs';
import { assessName, cleanMaker, coshhBlank, coshhItem, duplicates, titleKey, type CoshhItem } from '@/lib/rules/coshh';
import { applySds, dropRepeats, readSds } from '@/lib/rules/sdsRead';
import { supabase } from '@/lib/supabase';
import type { Organization, Profile, Site } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
type Me = Profile & { signature_path?: string | null };
type Org = Organization | null;
export type Folder = { id: string; name: string; parent_id: string | null; position?: number | null };
export type LibFile = { id: string; name: string; folder_id: string | null; storage_path: string; uploaded_at: string };
type Asset = { uri: string; name: string; mimeType?: string | null };
const rid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}${Math.random().toString(36).slice(2, 8)}`);
const clean = (n: string) => n.replace(/[^a-z0-9.-]+/gi, '_');
const now = () => new Date().toISOString();
const az = (a: { name: string }, b: { name: string }) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base', numeric: true });

// ---------- products ----------
export async function loadProducts(orgId: string | null): Promise<CoshhItem[]> {
  if (!orgId) return [];
  return (((await db.from('rams_library_items').select('*').eq('org_id', orgId).eq('kind', 'coshh').order('title')).data as CoshhItem[] | null) ?? []).map(coshhItem);
}
export const useProducts = (orgId: string | null | undefined) => useQuery({ queryKey: ['coshhProducts', orgId], enabled: !!orgId, queryFn: () => loadProducts(orgId ?? null) });
export async function loadProduct(id: string): Promise<CoshhItem | null> {
  const r = (await db.from('rams_library_items').select('*').eq('id', id).maybeSingle()).data as CoshhItem | null;
  return r ? coshhItem(r) : null;
}
export async function newProduct(me: Me, name: string): Promise<string | null> {
  const r = await db.from('rams_library_items').insert({ org_id: me.org_id, kind: 'coshh', title: name, data: coshhBlank(), sort_order: 0, created_by: me.id } as never).select('id').single();
  return (r.data as { id: string } | null)?.id ?? null;
}
export async function saveProduct(it: CoshhItem): Promise<boolean> {
  const data = { ...it.data }; delete data.needsCheck;
  return !(await db.from('rams_library_items').update({ title: it.title.trim(), data, updated_at: now() } as never).eq('id', it.id)).error;
}
/** Uploads a Safety Data Sheet for a product (attached to the back of its assessments). */
export async function uploadSds(me: Me, a: Asset): Promise<string | null> {
  try {
    const up = await supabase.storage.from('coshh-library').upload(`${me.org_id}/sds/${rid()}-${clean(a.name || 'data-sheet.pdf')}`, await (await fetch(a.uri)).arrayBuffer(), { contentType: 'application/pdf' });
    return up.error ? null : up.data.path;
  } catch { return null; }
}
/** Removes extra copies of the same product (the first is kept) and tidies manufacturer names. */
export async function removeDuplicates(lib: CoshhItem[]): Promise<number> {
  const extra = duplicates(lib); let n = 0;
  for (const it of extra) if (!(await db.from('rams_library_items').delete().eq('id', it.id)).error) n++;
  for (const it of lib.filter((x) => !extra.includes(x))) {
    const m = cleanMaker(it.data.manufacturer);
    if (m !== it.data.manufacturer) await db.from('rams_library_items').update({ data: { ...it.data, manufacturer: m } } as never).eq('id', it.id);
  }
  return n;
}

// ---------- folders and files ----------
export const useAllFolders = (orgId: string | null | undefined) => useQuery({ queryKey: ['coshhFolders', orgId], enabled: !!orgId, queryFn: async () => (((await db.from('coshh_library_folders').select('id,name,parent_id,position').eq('org_id', orgId as string)).data as Folder[] | null) ?? []).sort(az) });
export function useFolderView(orgId: string | null | undefined, folderId: string | null) {
  return useQuery({
    queryKey: ['coshhFolder', orgId, folderId], enabled: !!orgId,
    queryFn: async () => {
      const f = db.from('coshh_library_folders').select('*').eq('org_id', orgId as string), fl = db.from('coshh_library_files').select('*').eq('org_id', orgId as string);
      const [cur, subs, files] = await Promise.all([
        folderId ? db.from('coshh_library_folders').select('*').eq('id', folderId).maybeSingle() : Promise.resolve({ data: null }),
        folderId ? f.eq('parent_id', folderId) : f.is('parent_id', null),
        folderId ? fl.eq('folder_id', folderId) : fl.is('folder_id', null),
      ]);
      return { current: cur.data as Folder | null, subfolders: ((subs.data as Folder[] | null) ?? []).sort(az), files: ((files.data as LibFile[] | null) ?? []).sort(az) };
    },
  });
}
export async function createFolder(me: Me, parentId: string | null, name: string): Promise<string | null> {
  const r = await db.from('coshh_library_folders').insert({ org_id: me.org_id, parent_id: parentId, name, created_by: me.id } as never).select('id').single();
  return (r.data as { id: string } | null)?.id ?? null;
}
export const renameFolder = async (id: string, name: string) => !(await db.from('coshh_library_folders').update({ name } as never).eq('id', id)).error;
export const deleteFolder = async (id: string) => !(await db.from('coshh_library_folders').delete().eq('id', id)).error;
export const renameFile = async (id: string, name: string) => !(await db.from('coshh_library_files').update({ name } as never).eq('id', id)).error;
/** Deletes a library entry; the PDF itself goes only once no folder lists it any more. */
export async function deleteFile(f: { id: string; storage_path: string }): Promise<boolean> {
  if ((await db.from('coshh_library_files').delete().eq('id', f.id)).error) return false;
  try {
    const still = (await db.from('coshh_library_files').select('id').eq('storage_path', f.storage_path).limit(1)).data as unknown[] | null;
    if (!still?.length) await supabase.storage.from('coshh-library').remove([f.storage_path]);
  } catch { /* non-fatal */ }
  return true;
}
export async function uploadFiles(me: Me, folderId: string | null, assets: Asset[], onStep?: (i: number) => void): Promise<number> {
  let n = 0;
  for (let i = 0; i < assets.length; i++) {
    onStep?.(i);
    const a = assets[i];
    try {
      const up = await supabase.storage.from('coshh-library').upload(`${me.org_id}/${folderId || 'root'}/${rid()}-${clean(a.name)}`, await (await fetch(a.uri)).arrayBuffer(), { contentType: a.mimeType || 'application/octet-stream' });
      if (up.error) continue;
      if (!(await db.from('coshh_library_files').insert({ org_id: me.org_id, folder_id: folderId, name: a.name, storage_path: up.data.path, uploaded_by: me.id } as never)).error) n++;
    } catch { /* counted as not uploaded */ }
  }
  return n;
}
export async function moveFiles(ids: string[], dest: string | null): Promise<number> {
  let n = 0; for (const id of ids) if (!(await db.from('coshh_library_files').update({ folder_id: dest } as never).eq('id', id)).error) n++;
  return n;
}
/** Lists the ticked assessments in more folders too (same PDF, an entry in each). */
export async function alsoIn(me: Me, ids: string[], dests: (string | null)[]): Promise<number> {
  const files = ((await db.from('coshh_library_files').select('*').in('id', ids)).data as LibFile[] | null) ?? [];
  const all = ((await db.from('coshh_library_files').select('id,folder_id,storage_path').eq('org_id', me.org_id as string)).data as LibFile[] | null) ?? [];
  let n = 0;
  for (const f of files) for (const d of dests) {
    if (all.some((x) => x.storage_path === f.storage_path && (x.folder_id || null) === (d || null))) continue;
    if (!(await db.from('coshh_library_files').insert({ org_id: me.org_id, folder_id: d, name: f.name, storage_path: f.storage_path, uploaded_by: me.id } as never)).error) n++;
  }
  return n;
}
/** The ticked assessments joined into one PDF (for export or email). */
export async function packPdf(ids: string[]): Promise<{ bytes: Uint8Array; filename: string; label: string; skipped: string[] } | null> {
  const files = (((await db.from('coshh_library_files').select('*').in('id', ids)).data as LibFile[] | null) ?? []).sort(az);
  const out = await PDFDocument.create(), skipped: string[] = [];
  for (const f of files) {
    try { const src = await PDFDocument.load((await fetchBytes(publicUrl('coshh-library', f.storage_path))) as Uint8Array, { ignoreEncryption: true }); (await out.copyPages(src, src.getPageIndices())).forEach((p) => out.addPage(p)); }
    catch { skipped.push(f.name); }
  }
  if (!out.getPageCount()) return null;
  const label = files.length === 1 ? files[0].name.replace(/\.pdf$/i, '') : `COSHH assessments (${files.length})`;
  return { bytes: await out.save(), filename: `${label.replace(/[\\/:*?"<>|]+/g, '-')}.pdf`, label, skipped };
}
/** Every file id under a folder, subfolders included ("Select Folder"). */
export async function folderFileIds(folderId: string): Promise<string[]> {
  const [files, subs] = await Promise.all([db.from('coshh_library_files').select('id').eq('folder_id', folderId), db.from('coshh_library_folders').select('id').eq('parent_id', folderId)]);
  let ids = (((files.data as { id: string }[] | null) ?? []).map((f) => f.id));
  for (const s of ((subs.data as { id: string }[] | null) ?? [])) ids = ids.concat(await folderFileIds(s.id));
  return ids;
}
export const folderPath = (folders: Folder[], id: string | null) => { const out: string[] = []; let f = folders.find((x) => x.id === id), g = 0; while (f && g++ < 10) { out.unshift(f.name); const p = f.parent_id; f = folders.find((x) => x.id === p); } return out.join(' › ') || 'Top level'; };

// ---------- assessments ----------
export type Assessed = { files: LibFile[]; folder: string; at: string; due: boolean };
/** Which assessment file(s) belong to each product, where they're filed, and whether the yearly review is due. */
export async function assessMap(orgId: string | null, lib: CoshhItem[]): Promise<Record<string, Assessed>> {
  if (!orgId) return {};
  const [files, folders] = await Promise.all([db.from('coshh_library_files').select('id,name,folder_id,storage_path,uploaded_at').eq('org_id', orgId), db.from('coshh_library_folders').select('id,name,parent_id').eq('org_id', orgId)]);
  const fs = (files.data as LibFile[] | null) ?? [], fo = (folders.data as Folder[] | null) ?? [];
  const map: Record<string, Assessed> = {};
  lib.forEach((it) => {
    const want = new Set([...(it.data.assessmentFileIds || []), ...(it.data.assessmentFileId ? [it.data.assessmentFileId] : [])]);
    const mine = fs.filter((f) => want.has(f.id) || f.name === assessName(it.title));
    if (mine.length) { const at = it.data.assessedAt || mine[0].uploaded_at; map[it.id] = { files: mine, folder: Array.from(new Set(mine.map((f) => folderPath(fo, f.folder_id)))).join(' + '), at, due: !!at && Date.now() - new Date(at).getTime() > 365 * 86400000 }; }
  });
  return map;
}
export const useAssessMap = (orgId: string | null | undefined, lib: CoshhItem[] | undefined) => useQuery({ queryKey: ['coshhAssess', orgId, (lib || []).map((i) => i.id).join(',')], enabled: !!orgId && !!lib, queryFn: () => assessMap(orgId ?? null, lib || []) });

export async function previewAssessment(it: CoshhItem, org: Org, me: Me) {
  return buildCoshhPdf(it, null, { where: '', note: '' }, org, me, await loadSettings(org as never));
}
/**
 * Builds the product's assessment and files it in one or more folders — or,
 * given its current files, replaces those in place (yearly review / after an
 * edit). Remembers which files belong to the product and when it was assessed.
 */
export async function saveAssessment(me: Me, org: Org, it: CoshhItem, folderIds: (string | null)[], existing?: LibFile[]): Promise<boolean> {
  const bytes = await buildCoshhPdf(it, null, { where: '', note: '' }, org, me, await loadSettings(org as never));
  const fileName = assessName(it.title), olds = existing || [];
  const up = await supabase.storage.from('coshh-library').upload(`${me.org_id}/${(olds[0] ? olds[0].folder_id : folderIds[0]) || 'root'}/${rid()}-${clean(fileName)}`, bytes, { contentType: 'application/pdf' });
  if (up.error) return false;
  const stored = up.data.path, ids: string[] = [];
  if (olds.length) {
    for (const o of olds) if (!(await db.from('coshh_library_files').update({ name: fileName, storage_path: stored, uploaded_by: me.id, uploaded_at: now() } as never).eq('id', o.id)).error) ids.push(o.id);
    if (!ids.length) return false;
    const gone = Array.from(new Set(olds.map((o) => o.storage_path).filter((x) => x && x !== stored)));
    if (gone.length) void supabase.storage.from('coshh-library').remove(gone);
  } else {
    for (const fid of folderIds) {
      const r = await db.from('coshh_library_files').insert({ org_id: me.org_id, folder_id: fid, name: fileName, storage_path: stored, uploaded_by: me.id } as never).select('id').single();
      if (r.data) ids.push((r.data as { id: string }).id);
    }
    if (!ids.length) return false;
  }
  const data = { ...it.data, assessmentFileId: ids[0], assessmentFileIds: ids, assessedAt: now() }; delete data.needsCheck;
  await db.from('rams_library_items').update({ data } as never).eq('id', it.id);
  return true;
}
/** Deletes a product and its assessment (jobs keep the COSHH already added to them). */
export async function deleteProductFull(it: CoshhItem, a: Assessed | undefined): Promise<boolean> {
  if (a) {
    for (const f of a.files) await db.from('coshh_library_files').delete().eq('id', f.id);
    const paths = Array.from(new Set(a.files.map((f) => f.storage_path)));
    if (paths.length) void supabase.storage.from('coshh-library').remove(paths);
  }
  return !(await db.from('rams_library_items').delete().eq('id', it.id)).error;
}

// ---------- onto a job ----------
/** Create COSHH: each ticked product becomes its own assessment in the job's COSHH list, data sheet attached. */
export async function issueToSite(me: Me, org: Org, site: Site, products: CoshhItem[], job: { where: string; note: string }): Promise<number> {
  const st = await loadSettings(org as never);
  let made = 0;
  for (const it of products) {
    try {
      const bytes = await buildCoshhPdf(it, site, job, org, me, st);
      const name = `COSHH — ${it.title}`;
      const up = await supabase.storage.from('coshh-docs').upload(`${site.id}/coshh/${rid()}-COSHH-${clean(it.title).slice(0, 60)}.pdf`, bytes, { contentType: 'application/pdf' });
      if (up.error) continue;
      if (!(await db.from('coshh_docs').insert({ site_id: site.id, name, storage_path: up.data.path, uploaded_by: me.id } as never)).error) { made++; tellOperatives(me, site.id, `New COSHH published and needs signing: "${name}"`); }
    } catch { /* counted as not made */ }
  }
  if (made) log(me, site.id, 'coshh_issued', `Issued ${made} COSHH assessment${made === 1 ? '' : 's'}`);
  return made;
}
/** Add from Library: copies the ticked library PDFs into the job's COSHH (only PDFs can be signed). */
export async function importToSite(me: Me, siteId: string, ids: string[], onStep?: (i: number, n: number) => void): Promise<{ added: string[]; failed: number; notPdf: string[] }> {
  const files = ((await db.from('coshh_library_files').select('*').in('id', ids)).data as LibFile[] | null) ?? [];
  const added: string[] = [], notPdf: string[] = []; let failed = ids.length - files.length;
  for (let i = 0; i < files.length; i++) {
    const f = files[i]; onStep?.(i, files.length);
    try {
      const bytes = await fetchBytes(publicUrl('coshh-library', f.storage_path));
      if (!bytes) { failed++; continue; }
      if (String.fromCharCode(...Array.from(bytes.slice(0, 5))) !== '%PDF-') { notPdf.push(f.name); continue; }
      const up = await supabase.storage.from('coshh-docs').upload(`${siteId}/coshh/${rid()}-${clean(f.name)}`, bytes, { contentType: 'application/pdf' });
      if (up.error) { failed++; continue; }
      if (!(await db.from('coshh_docs').insert({ site_id: siteId, name: f.name, storage_path: up.data.path, uploaded_by: me.id } as never)).error) added.push(f.name); else failed++;
    } catch { failed++; }
  }
  if (added.length) tellOperatives(me, siteId, `New COSHH published and needs signing: "${added.length === 1 ? added[0] : `${added.length} documents (${added.slice(0, 4).join(', ')}${added.length > 4 ? '…' : ''})`}"`);
  return { added, failed, notPdf };
}
/** Save a job's COSHH document up into the library (a copy; the job's stays). */
export async function saveSiteDocToLibrary(me: Me, doc: { name: string; storage_path: string }, folderId: string | null): Promise<boolean> {
  const bytes = await fetchBytes(publicUrl('coshh-docs', doc.storage_path));
  if (!bytes) return false;
  const up = await supabase.storage.from('coshh-library').upload(`${me.org_id}/${folderId || 'root'}/${rid()}-${clean(doc.name)}`, bytes, { contentType: 'application/pdf' });
  if (up.error) return false;
  return !(await db.from('coshh_library_files').insert({ org_id: me.org_id, folder_id: folderId, name: doc.name, storage_path: up.data.path, uploaded_by: me.id } as never)).error;
}
export { titleKey };

/**
 * Several Safety Data Sheets dropped into a folder: each becomes a product (named from what the sheet
 * says, else its file name), with the sheet attached and its codes and sections read off it (office
 * laptop), and — when something was read — its COSHH assessment made straight into the folder.
 * On a phone the sheets can't be read, so the products are made for you to finish and assess.
 */
export async function productsFromSds(me: Me, org: Org, folderId: string | null, assets: Asset[], onStep?: (i: number) => void): Promise<{ made: number; assessed: number; failed: string[]; toFinish: string[] }> {
  const out = { made: 0, assessed: 0, failed: [] as string[], toFinish: [] as string[] };
  for (let i = 0; i < assets.length; i++) {
    const a = assets[i]; onStep?.(i);
    const fileTitle = (a.name || 'Product').replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Product';
    try {
      const path = await uploadSds(me, a);
      if (!path) { out.failed.push(a.name); continue; }
      let title = fileTitle, data = { ...coshhBlank(), sdsPath: path, sdsName: a.name }, n = 0;
      try {
        const pages = await pdfPageTexts(new Uint8Array(await (await fetch(a.uri)).arrayBuffer()));
        if (pages) { const got = applySds(fileTitle, data, readSds(dropRepeats(pages))); title = got.title || fileTitle; data = got.d; n = got.n; }
      } catch { /* attached; filled in by hand */ }
      const r = await db.from('rams_library_items').insert({ org_id: me.org_id, kind: 'coshh', title, data, sort_order: 0, created_by: me.id } as never).select('*').single();
      if (r.error || !r.data) { out.failed.push(a.name); continue; }
      out.made++;
      const it = coshhItem(r.data as CoshhItem);
      if (n && (it.data.h.length || it.data.pictos.length)) { if (await saveAssessment(me, org, it, [folderId])) out.assessed++; else out.toFinish.push(title); }
      else out.toFinish.push(title);
    } catch { out.failed.push(a.name); }
  }
  return out;
}
