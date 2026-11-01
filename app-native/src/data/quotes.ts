// Quote tracker: quotes, their chaser, their OneDrive folder, and turning a won quote into a job.
import { useQuery } from '@tanstack/react-query';

import { listOneDriveLevel, type OdItem } from '@/data/drawings';
import { setupJobPack } from '@/data/jobPack';
import { createSite } from '@/data/siteList';
import { localISODate } from '@/lib/rules/driver';
import { readTenderLog, statusPatch, type ImportRow, type QuoteRow } from '@/lib/rules/quotes';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';
import { invokeAsUser } from '@/lib/userFunctions';
import { readXlsx } from '@/lib/rules/xlsxRead';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
const rpc = supabase.rpc.bind(supabase) as unknown as (n: string, a: object) => Promise<{ data: unknown; error: unknown }>;

export type Quote = QuoteRow & {
  id: string; org_id: string; client_id: string | null; contact_name: string | null; contact_email: string | null; contact_phone: string | null; address: string | null; postcode: string | null;
  profit_pct: number | null; priced_by: string | null; received_date: string | null; returned_at: string | null; notes: string | null; chase_count: number; last_chased_at: string | null;
  folder_id: string | null; folder_drive_id: string | null; folder_name: string | null; filed_at: string | null; site_id: string | null; created_at: string;
};
export type QuoteSettings = { org_id: string; chase_enabled: boolean; chase_first_days: number; chase_every_days: number; chase_max: number; chase_subject: string | null; chase_body: string | null; open_path: string | null; template_path: string | null; archive_path: string | null; won_folder: string | null };
export type ClientHit = { id: string; name: string; email: string | null; phone: string | null };

export const useQuotes = (orgId: string | null | undefined) => useQuery({
  queryKey: ['quotes', orgId], enabled: !!orgId,
  queryFn: async () => {
    const all: Quote[] = [];
    // Past Supabase's 1,000 rows a request: the tracker holds years of quotes.
    for (let from = 0; ; from += 1000) {
      const r = await db.from('quotes').select('*').eq('org_id', orgId as string).order('return_date', { ascending: false, nullsFirst: false }).range(from, from + 999);
      if (r.error) throw r.error;
      all.push(...((r.data as Quote[] | null) ?? []));
      if (((r.data as Quote[] | null) ?? []).length < 1000) return all;
    }
  },
});
export const useQuote = (id: string | undefined) => useQuery({
  queryKey: ['quote', id], enabled: !!id && id !== 'new',
  queryFn: async () => {
    const [q, c] = await Promise.all([db.from('quotes').select('*').eq('id', id as string).maybeSingle(), db.from('quote_chases').select('id,sent_to,automatic,sent_at').eq('quote_id', id as string).order('sent_at', { ascending: false })]);
    return { quote: q.data as Quote | null, chases: (c.data as { id: string; sent_to: string; automatic: boolean; sent_at: string }[] | null) ?? [] };
  },
});
export const useQuoteSettings = (orgId: string | null | undefined) => useQuery({
  queryKey: ['quoteSettings', orgId], enabled: !!orgId,
  queryFn: async () => (await db.from('quote_settings').select('*').eq('org_id', orgId as string).maybeSingle()).data as QuoteSettings | null,
});
export const saveQuoteSettings = async (s: Partial<QuoteSettings> & { org_id: string }) => !(await db.from('quote_settings').upsert({ ...s, updated_at: new Date().toISOString() } as never)).error;

export async function searchClients(q: string): Promise<ClientHit[]> {
  const r = await rpc('quote_client_search', { q });
  return r.error ? [] : (r.data as ClientHit[]);
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
export const sendQuote = (id: string, m: { to: string; subject: string; body: string; files: { id: string; driveId?: string | null; name: string }[] }) => call('send', id, m);
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
export async function submitQuote(me: Profile, q: Quote, f: { value: number; profit: number | null; sent: string }, firstDays: number): Promise<{ error?: string; note: string }> {
  const base = { ...q, return_date: f.sent, returned_at: f.sent };
  const saved = await saveQuote(me, q.id, { ...(statusPatch('returned', base, localISODate(new Date()), firstDays) as Partial<Quote>), value: f.value, profit_pct: f.profit, return_date: f.sent, returned_at: f.sent, priced_by: q.priced_by || me.id, priced_by_name: q.priced_by_name || me.name });
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
  const pack = await setupJobPack(made.id);
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
