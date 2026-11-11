// Quote tracker: quotes, their chaser, their OneDrive folder, and turning a won quote into a job.
import { useQuery } from '@tanstack/react-query';

import { listOneDriveLevel, type OdItem } from '@/data/drawings';
import { clientWantsFolders, hasJobPack, setupJobPack } from '@/data/jobPack';
import { createSite } from '@/data/siteList';
import { localISODate } from '@/lib/rules/driver';
import { quoteReport, type AutoExport } from '@/lib/rules/quoteReports';
import { readTenderLog, statusPatch, type ImportRow, type QuoteRow } from '@/lib/rules/quotes';
import { makeXlsx } from '@/lib/rules/xlsx';
import { tableSheets } from '@/lib/tableExport';
import type { Organization } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';
import { invokeAsUser } from '@/lib/userFunctions';
import { readXlsx } from '@/lib/rules/xlsxRead';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
const rpc = supabase.rpc.bind(supabase) as unknown as (n: string, a: object) => Promise<{ data: unknown; error: unknown }>;

export type Quote = QuoteRow & {
  id: string; org_id: string; client_id: string | null; contact_name: string | null; contact_email: string | null; contact_phone: string | null; address: string | null; postcode: string | null;
  profit_pct: number | null; guide_markup_pct: number | null; priced_by: string | null; received_date: string | null; returned_at: string | null; notes: string | null; chase_count: number; last_chased_at: string | null;
  folder_id: string | null; folder_drive_id: string | null; folder_name: string | null; filed_at: string | null; site_id: string | null; created_at: string; updated_at?: string | null;
  // The other clients tendering the same job (Andy, 4 Nov 2026).
  others?: QuoteClient[];
};
export type QuoteClient = { id: string; quote_id: string; client_id: string | null; client_name: string; contact_name: string | null; contact_email: string | null; contact_phone: string | null };
export type QuoteSettings = {
  org_id: string; chase_enabled: boolean; chase_first_days: number; chase_every_days: number; chase_max: number; chase_subject: string | null; chase_body: string | null; open_path: string | null; template_path: string | null; archive_path: string | null; won_folder: string | null;
  // Andy, 11 Nov 2026: a folder under Open Tenders for each work status, and one per estimator; the preset CC on Submit
  // Quotation; the auto exports; the tender tracker kept up to date in OneDrive.
  status_folders?: Record<string, string> | null; person_folders?: Record<string, string> | null; cc_email?: string | null; auto_exports?: AutoExport[] | null; tracker_on?: boolean | null; tracker_name?: string | null;
};
export type ClientHit = { id: string; name: string; email: string | null; phone: string | null; markup?: number | null; estimator_name?: string | null; estimator_email?: string | null; estimator_phone?: string | null; quote_chase?: boolean | null };

export const useQuotes = (orgId: string | null | undefined) => useQuery({
  queryKey: ['quotes', orgId], enabled: !!orgId,
  queryFn: async () => {
    const all: Quote[] = [];
    // Past Supabase's 1,000 rows a request: the tracker holds years of quotes.
    for (let from = 0; ; from += 1000) {
      const r = await db.from('quotes').select('*').eq('org_id', orgId as string).order('return_date', { ascending: false, nullsFirst: false }).range(from, from + 999);
      if (r.error) throw r.error;
      all.push(...((r.data as Quote[] | null) ?? []));
      if (((r.data as Quote[] | null) ?? []).length < 1000) break;
    }
    const extra = ((await db.from('quote_clients').select('id,quote_id,client_id,client_name,contact_name,contact_email,contact_phone').eq('org_id', orgId as string).limit(20000)).data as QuoteClient[] | null) ?? [];
    const by: Record<string, QuoteClient[]> = {}; extra.forEach((c) => { (by[c.quote_id] = by[c.quote_id] || []).push(c); });
    return all.map((q) => (by[q.id] ? { ...q, others: by[q.id] } : q));
  },
});
export const useQuote = (id: string | undefined) => useQuery({
  queryKey: ['quote', id], enabled: !!id && id !== 'new',
  queryFn: async () => {
    const [q, c, o] = await Promise.all([db.from('quotes').select('*').eq('id', id as string).maybeSingle(), db.from('quote_chases').select('id,sent_to,automatic,sent_at').eq('quote_id', id as string).order('sent_at', { ascending: false }), db.from('quote_clients').select('id,quote_id,client_id,client_name,contact_name,contact_email,contact_phone').eq('quote_id', id as string).order('created_at')]);
    return { quote: q.data ? { ...(q.data as Quote), others: (o.data as QuoteClient[] | null) ?? [] } : null, chases: (c.data as { id: string; sent_to: string; automatic: boolean; sent_at: string }[] | null) ?? [] };
  },
});
export const useQuoteSettings = (orgId: string | null | undefined) => useQuery({
  queryKey: ['quoteSettings', orgId], enabled: !!orgId,
  queryFn: async () => (await db.from('quote_settings').select('*').eq('org_id', orgId as string).maybeSingle()).data as QuoteSettings | null,
});
export const saveQuoteSettings = async (s: Partial<QuoteSettings> & { org_id: string }) => !(await db.from('quote_settings').upsert({ ...s, updated_at: new Date().toISOString() } as never)).error;

export async function searchClients(q: string): Promise<ClientHit[]> {
  // v3 (11 Nov 2026) adds the client's estimator (Directory › Estimating) and whether new quotes are chased.
  const r = await rpc('quote_client_search_v3', { q });
  return r.error ? [] : (r.data as ClientHit[]);
}
/** Another client tendering the same job (they join the Directory if new). */
export async function addQuoteClient(me: Profile, quoteId: string, c: { name: string; email?: string | null; phone?: string | null; contact?: string | null }): Promise<boolean> {
  const cid = await clientId(c.name, c.email || '', c.phone || '');
  return !(await db.from('quote_clients').insert({ org_id: me.org_id, quote_id: quoteId, client_id: cid, client_name: c.name, contact_name: c.contact || null, contact_email: c.email || null, contact_phone: c.phone || null, created_by: me.id } as never)).error;
}
export const removeQuoteClient = async (id: string) => !(await db.from('quote_clients').delete().eq('id', id)).error;
/** Who to chase at one of the other clients (the chaser emails every client on a returned quote). */
export const setQuoteClientContact = async (id: string, c: { contact_name: string | null; contact_email: string | null }) => !(await db.from('quote_clients').update(c as never).eq('id', id)).error;
/** Every email the chaser will use on a quote, main client first, no repeats. */
export const chaseEmails = (q: Quote) => [...new Set([q.contact_email, ...(q.others ?? []).map((o) => o.contact_email)].map((e) => String(e || '').trim()).filter((e) => /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/.test(e)))];
/** Won from one of the other clients: they become the quote's main client (so the job is made for them) and the old main
 *  client joins the others, so the reports still count the quote for them. Returns the quote as it now stands. */
export async function wonFrom(me: Profile, q: Quote, o: QuoteClient): Promise<Quote | null> {
  const ok = await saveQuote(me, q.id, { client_id: o.client_id, client_name: o.client_name, contact_name: o.contact_name, contact_email: o.contact_email, contact_phone: o.contact_phone });
  if (!ok) return null;
  await db.from('quote_clients').update({ client_id: q.client_id, client_name: q.client_name, contact_name: q.contact_name, contact_email: q.contact_email, contact_phone: q.contact_phone } as never).eq('id', o.id);
  return { ...q, client_id: o.client_id, client_name: o.client_name, contact_name: o.contact_name, contact_email: o.contact_email, contact_phone: o.contact_phone };
}
/** Saves a client's estimating mark-up in the Directory, from a quote. */
export async function setClientMarkup(clientId: string, pct: number | null): Promise<boolean> {
  const r = await rpc('quote_set_client_markup', { p_client: clientId, p_pct: pct });
  return !r.error && r.data === true;
}
/** A new name joins the client Directory, as on a new Finance job. */
export async function clientId(name: string, email: string, phone: string): Promise<string | null> {
  const r = await rpc('quote_add_client', { p_name: name, p_email: email, p_phone: phone });
  return r.error ? null : (r.data as string);
}
export async function saveQuote(me: Profile, id: string | null, patch: Partial<Quote>): Promise<string | null> {
  const row = { ...patch, updated_at: new Date().toISOString() };
  if (id) return (await db.from('quotes').update(row as never).eq('id', id).select('id')).data?.length ? id : null;
  const r = await db.from('quotes').insert({ ...row, org_id: me.org_id, created_by: me.id } as never).select('id').single();
  return r.error ? null : (r.data as { id: string }).id;
}
export const setQuoteStatus = (me: Profile, q: Quote, to: string, firstDays: number) => saveQuote(me, q.id, statusPatch(to, q, localISODate(new Date()), firstDays) as Partial<Quote>);
/** Switching the chaser back on picks up from today if there's no date waiting. */
export function chasePatch(q: Quote, on: boolean, firstDays: number): Partial<Quote> {
  if (!on) return { chase_on: false, next_chase_date: null };
  const d = new Date(); d.setDate(d.getDate() + (q.status === 'returned' && !q.chase_count ? firstDays : 7));
  return { chase_on: true, next_chase_date: q.status === 'returned' ? localISODate(d) : null };
}
const call = (action: string, quoteId: string, more: object = {}) => invokeAsUser<{ ok?: boolean; how?: string; year?: string; skipped?: string }>('quote-tracker', { action, quote_id: quoteId, ...more });
export const makeQuoteFolder = (id: string) => call('folder', id);
export const fileQuoteFolder = (id: string) => call('file', id);
export const chaseNow = (id: string) => call('chase', id);
export const sendQuote = (id: string, m: { to: string; cc?: string[]; subject: string; body: string; files: { id: string; driveId?: string | null; name: string }[] }) => call('send', id, m);
/** A new work status moves the enquiry's folder into that status's folder under Open Tenders (Andy, 11 Nov 2026). */
export const moveToStatusFolder = (id: string, status: string) => call('status', id, { status });

/** The enquiry's folder, its sub-folders and their files, for Submit Quotation's tick list (several folders at once). */
export type FolderFiles = { folder: string; id: string; driveId: string | null; files: OdItem[] };
export async function quoteFolderFiles(folder: { id: string; driveId: string | null }): Promise<{ groups: FolderFiles[]; error?: string }> {
  const top = await listOneDriveLevel(folder);
  if (top.error) return { groups: [], error: top.error };
  const groups: FolderFiles[] = [];
  if (top.files.length) groups.push({ folder: 'This Folder', id: folder.id, driveId: folder.driveId, files: top.files });
  for (const f of top.folders) {
    const lvl = await listOneDriveLevel({ id: f.id, driveId: f.driveId || folder.driveId });
    groups.push({ folder: f.name, id: f.id, driveId: f.driveId || folder.driveId, files: lvl.files });
  }
  return { groups };
}
/** Add Documents: files into one of the enquiry's folders (Tender Documents unless another is chosen). */
export async function uploadToFolder(to: { id: string; driveId: string | null }, files: { uri: string; name: string }[]): Promise<number> {
  let n = 0;
  for (const f of files) {
    const bytes = new Uint8Array(await (await fetch(f.uri)).arrayBuffer());
    const u = await invokeAsUser<{ ok?: boolean }>('onedrive-upload', { filename: f.name, content_base64: b64(bytes), folder_id: to.id, drive_id: to.driveId || undefined });
    if (u.data?.ok) n++;
  }
  return n;
}
/** A new folder inside the enquiry's folder (Add Documents › New Folder). */
export async function makeSubFolder(parent: { id: string; driveId: string | null }, name: string): Promise<boolean> {
  const r = await invokeAsUser<{ ok?: boolean; id?: string }>('quote-tracker', { action: 'subfolder', parent_id: parent.id, drive_id: parent.driveId, name });
  return !!r.data?.ok;
}

/** The tender tracker (Andy, 11 Nov 2026): after a change in the app, an up-to-date spreadsheet of every quote is saved in
 *  the Open Tenders folder in OneDrive. It's its own file, so the old Tender Tracker.xlsm is never written over. */
let trackerTimer: ReturnType<typeof setTimeout> | null = null;
export function syncTracker(orgId: string, org: Organization | null) {
  if (trackerTimer) clearTimeout(trackerTimer);
  trackerTimer = setTimeout(() => { trackerTimer = null; void writeTracker(orgId, org); }, 4000);
}
export async function writeTracker(orgId: string, org: Organization | null): Promise<boolean> {
  try {
    const s = (await db.from('quote_settings').select('tracker_on,tracker_name,open_path').eq('org_id', orgId).maybeSingle()).data as Pick<QuoteSettings, 'tracker_on' | 'tracker_name' | 'open_path'> | null;
    if (!s?.open_path || s.tracker_on === false) return false;
    const root = await estimatingRoot();
    if (!root) return false;
    const all = ((await db.from('quotes').select('*').eq('org_id', orgId).order('return_date', { ascending: false, nullsFirst: false }).limit(5000)).data as Quote[] | null) ?? [];
    const extra = ((await db.from('quote_clients').select('quote_id,client_name').eq('org_id', orgId).limit(20000)).data as { quote_id: string; client_name: string }[] | null) ?? [];
    const rows = all.map((q) => ({ ...q, others: extra.filter((c) => c.quote_id === q.id) }));
    const today = localISODate(new Date());
    const sheets = tableSheets(quoteReport('tracker', rows, today), org, [quoteReport('live', rows, today), quoteReport('quoted', rows, today)]);
    const bytes = makeXlsx(sheets);
    const u = await invokeAsUser<{ ok?: boolean }>('onedrive-upload', { filename: s.tracker_name || 'Tender Tracker - OpHUB.xlsx', content_base64: b64(bytes), folder_id: root.id, drive_id: root.driveId || undefined });
    return !!u.data?.ok;
  } catch { return false; }
}
const b64 = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
/** The tender documents picked with a new enquiry go in its Tender Documents folder (the top of it, if there isn't one). */
export async function uploadTenderDocs(folder: { id: string; driveId: string | null }, files: { uri: string; name: string }[]): Promise<number> {
  const lvl = await listOneDriveLevel(folder);
  const sub = lvl.folders.find((f) => /tender/i.test(f.name));
  let n = 0;
  for (const f of files) {
    const bytes = new Uint8Array(await (await fetch(f.uri)).arrayBuffer());
    const u = await invokeAsUser<{ ok?: boolean }>('onedrive-upload', { filename: f.name, content_base64: b64(bytes), folder_id: sub?.id ?? folder.id, drive_id: sub?.driveId || folder.driveId || undefined });
    if (u.data?.ok) n++;
  }
  return n;
}
/** The Quotation folder's files, for Send & submit: that's where the finished quote is. */
export async function quotationFiles(folder: { id: string; driveId: string | null }): Promise<{ files: OdItem[]; error?: string }> {
  const top = await listOneDriveLevel(folder);
  if (top.error) return { files: [], error: top.error };
  const sub = top.folders.find((f) => /quot/i.test(f.name));
  if (!sub) return { files: top.files };
  const lvl = await listOneDriveLevel({ id: sub.id, driveId: sub.driveId || folder.driveId });
  return { files: lvl.files, error: lvl.error };
}
/** Send & submit: records it as sent with its value and date, then files the folder to that year's Estimating folder. */
export async function submitQuote(me: Profile, q: Quote, f: { value: number; profit: number | null; sent: string; pricedBy?: { id: string; name: string | null } | null; chaseDate?: string | null }, firstDays: number): Promise<{ error?: string; note: string }> {
  const base = { ...q, return_date: f.sent, returned_at: f.sent };
  // Who priced it: the person submitting, unless another was picked (Andy, 11 Nov 2026). The mark-up given here is the
  // quote's profit mark-up from now on.
  const by = f.pricedBy ?? { id: me.id, name: me.name };
  const patch = statusPatch('returned', base, localISODate(new Date()), firstDays) as Partial<Quote>;
  if (f.chaseDate !== undefined && q.chase_on) patch.next_chase_date = f.chaseDate;
  const saved = await saveQuote(me, q.id, { ...patch, value: f.value, profit_pct: f.profit, return_date: f.sent, returned_at: f.sent, priced_by: by.id, priced_by_name: by.name });
  if (!saved) return { error: 'Could not save. Try again.', note: '' };
  if (!q.folder_id) return { note: '' };
  const m = await fileQuoteFolder(q.id);
  return { note: m.error ? `It’s marked as sent, but the folder stayed where it is: ${m.error}` : m.data?.year ? `Folder filed in Estimating ${m.data.year}` : '' };
}

/** Won: makes the job and its folder, moves the enquiry's documents into it, and marks the quote. Returns the new job, or why not. */
export async function convertToJob(me: Profile, q: Quote, autoNumbers: boolean, firstDays: number): Promise<{ siteId: string; note: string } | { error: string }> {
  if (q.site_id) return { siteId: q.site_id, note: 'Already a job' };
  const made = await createSite(me, {
    name: q.title, address: q.address || '', postcode: q.postcode || '', job_number: '', client_name: q.client_name, client_phone: q.contact_phone || '', client_email: q.contact_email || '',
    multi_site: false, repair_contract: false, status: 'upcoming', start_date: localISODate(new Date()),
  }, autoNumbers);
  if ('error' in made) return made;
  const notes: string[] = [];
  // No folder when new jobs are set not to get one, or the client is set to never (Andy, 8 Nov 2026).
  const ps = (await supabase.from('job_pack_settings' as never).select('config').eq('org_id' as never, me.org_id as never).maybeSingle()).data as { config: { create_new?: boolean } | null } | null;
  const want = ps?.config?.create_new !== false && (await clientWantsFolders(q.client_name));
  const pack = want ? await setupJobPack(made.id) : { error: 'No OneDrive folder was made (switched off for new jobs, or for this client)' };
  if ('error' in pack) notes.push(pack.error);
  else if (pack.failed.length) notes.push(`These didn’t go across: ${pack.failed.join(', ')}`);
  if (q.folder_id && !('error' in pack)) {
    const m = await call('won', q.id, { site_id: made.id });
    if (m.error) notes.push(`The documents stayed in Estimating: ${m.error}`);
    else if (m.data?.how === 'copied') notes.push('The documents were copied into the job, and the originals stay in Estimating');
  }
  await saveQuote(me, q.id, { ...(statusPatch('won', q, localISODate(new Date()), firstDays) as Partial<Quote>), site_id: made.id });
  return { siteId: made.id, note: notes.join('. ') };
}

/** Where open enquiries live (Quote settings), so the OneDrive picker can start there. Null if it isn't set. */
export async function estimatingRoot(): Promise<{ id: string; name: string; driveId: string | null } | null> {
  const r = await invokeAsUser<{ ok?: boolean; none?: boolean; id?: string; driveId?: string | null; name?: string }>('quote-tracker', { action: 'estimating_root' });
  return r.data?.id ? { id: r.data.id, name: r.data.name || 'Estimating', driveId: r.data.driveId ?? null } : null;
}
/** A job's estimating folder chosen from OneDrive (Andy, 4 Nov 2026), e.g. for a job made in Finance: the job's own folder is
 *  made first if needed, then the chosen folder moves into its Contract & Commercial › Estimating folder. A quote using that
 *  folder is marked won and linked to the job. */
export async function linkEstimatingFolder(siteId: string, f: { id: string; name: string; driveId?: string | null }): Promise<{ error?: string; note: string }> {
  if (!(await hasJobPack(siteId))) {
    const pack = await setupJobPack(siteId);
    if ('error' in pack) return { error: `The job's OneDrive folder couldn't be made: ${pack.error}`, note: '' };
  }
  const r = await invokeAsUser<{ ok?: boolean; how?: string; quote?: string | null }>('quote-tracker', { action: 'link_folder', site_id: siteId, folder_id: f.id, drive_id: f.driveId || null });
  if (r.error || !r.data?.ok) return { error: r.error || 'Could not move the folder.', note: '' };
  // Linked: the job remembers it, so Project Admin stops offering Link Estimating Folder (Andy, 7 Nov 2026).
  try { await db.from('sites').update({ estimating_linked_at: new Date().toISOString() } as never).eq('id', siteId); } catch { /* the link itself worked */ }
  const bits = [r.data.how === 'copied' ? `"${f.name}" was copied into the job (the original stays in Estimating)` : `"${f.name}" moved into the job's Estimating folder`];
  if (r.data.quote) bits.push(`the quote "${r.data.quote}" is marked won`);
  return { note: bits.join(', and ') };
}
/** Won, for a job that's already in OpHUB (Andy, 4 Nov 2026): the enquiry's folder moves into that job's Estimating folder
 *  (the job's folder is made first if it hasn't one), and the quote is marked won and linked to the job. */
export async function linkToJob(me: Profile, q: Quote, siteId: string, firstDays: number): Promise<{ note: string } | { error: string }> {
  const notes: string[] = [];
  if (q.folder_id) {
    let packOk = await hasJobPack(siteId);
    if (!packOk) {
      const pack = await setupJobPack(siteId);
      if ('error' in pack) notes.push(`The documents stayed in Estimating: ${pack.error}`);
      else packOk = true;
    }
    if (packOk) {
      const m = await call('won', q.id, { site_id: siteId });
      if (m.error) notes.push(`The documents stayed in Estimating: ${m.error}`);
      else if (m.data?.how === 'copied') notes.push('The documents were copied into the job, and the originals stay in Estimating');
    }
  }
  const saved = await saveQuote(me, q.id, { ...(statusPatch('won', q, localISODate(new Date()), firstDays) as Partial<Quote>), site_id: siteId });
  if (!saved) return { error: 'Could not mark it won. Try again.' };
  return { note: notes.join('. ') };
}

/** Loads the Tender Enquiry Log. Run it again and quotes already loaded are left alone. */
export async function importTenderLog(me: Profile, bytes: Uint8Array, people: string[]): Promise<{ added: number; already: number; skipped: number } | { error: string }> {
  const sheets = await readXlsx(bytes, { dates: true });
  const sheet = sheets.find((s) => /tender/i.test(s.name)) ?? sheets[0];
  if (!sheet) return { error: 'That file has no sheets.' };
  const read = readTenderLog(sheet.rows, people);
  if ('error' in read) return read;
  const have = ((await db.from('quotes').select('client_name,title,return_date').eq('org_id', me.org_id as string).limit(20000)).data as { client_name: string; title: string; return_date: string | null }[] | null) ?? [];
  const key = (r: { client_name: string; title: string; return_date: string | null }) => `${r.client_name}|${r.title}|${r.return_date ?? ''}`.toLowerCase();
  const seen = new Set(have.map(key));
  const fresh: ImportRow[] = [];
  for (const r of read.rows) { if (!seen.has(key(r))) { seen.add(key(r)); fresh.push(r); } }
  for (let i = 0; i < fresh.length; i += 200) {
    const r = await db.from('quotes').insert(fresh.slice(i, i + 200).map((x) => ({ ...x, org_id: me.org_id, created_by: me.id, imported: true, chase_on: false })) as never);
    if (r.error) return { error: `Stopped after ${i} quotes: ${(r.error as { message?: string }).message || 'could not save'}` };
  }
  return { added: fresh.length, already: read.rows.length - fresh.length, skipped: read.skipped };
}
