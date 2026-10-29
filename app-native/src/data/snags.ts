// Snags. Ported from 500-snagging.js (operative side: list and close with a photo;
// managers also add snags). PDF export/email come with the PM screens.
import { useQuery } from '@tanstack/react-query';

import { cachedQuery, orThrow } from '@/lib/offlineCache';
import { compressOne, type Picked } from '@/lib/photos';
import { supabase } from '@/lib/supabase';
import type { Profile, Site } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

export type Snag = {
  id: string; site_id: string; title: string; location: string | null; status: string;
  photo_path: string | null; photo_paths: string[] | null; pdf_path: string | null;
  closed_photo_path: string | null; closed_by: string | null; closed_at: string | null; created_at: string | null;
};
export const snagPhotos = (s: Snag) => (s.photo_paths?.length ? s.photo_paths : s.photo_path ? [s.photo_path] : []);

export function useSnags(siteId: string | undefined, status: 'open' | 'closed') {
  return useQuery({
    queryKey: ['snags', siteId, status],
    enabled: !!siteId,
    queryFn: () => cachedQuery(`snags:${siteId}:${status}`, async () =>
      orThrow(await db.from('snags').select('*').eq('site_id', siteId as string).eq('status', status).order('created_at', { ascending: false })) as Snag[]),
  });
}

export function useSnagFolderCounts(siteId: string | undefined) {
  return useQuery({
    queryKey: ['snagFolder', siteId],
    enabled: !!siteId,
    queryFn: () => cachedQuery(`snagFolder:${siteId}`, async () => {
      const [s, v] = await Promise.all([
        db.from('snags').select('id').eq('site_id', siteId as string).eq('status', 'open'),
        db.from('variations').select('id').eq('site_id', siteId as string).eq('status', 'live'),
      ]);
      return { openSnags: (orThrow(s) as unknown[]).length, liveVariations: (orThrow(v) as unknown[]).length };
    }),
  });
}

const rid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}${Math.random().toString(16).slice(2)}`);
async function upload(path: string, p: Picked): Promise<string | null> {
  const uri = await compressOne(p);
  const up = await supabase.storage.from('site-photos').upload(path, await (await fetch(uri)).arrayBuffer(), { contentType: 'image/jpeg' });
  return up.error ? null : up.data.path;
}

/** Close with a "fixed" photo; tells the managers and logs it on the job's history. */
export async function closeSnag(me: Profile, site: Site, snag: Snag, p: Picked): Promise<string> {
  const path = await upload(`${site.id}/snags/${snag.id}-closed-${rid()}.jpg`, p);
  if (!path) return 'Could not upload the photo — check your signal and try again.';
  const r = await db.from('snags').update({ status: 'closed', closed_photo_path: path, closed_by: me.id, closed_at: new Date().toISOString() } as never).eq('id', snag.id);
  if (r.error) return 'Could not save — try again.';
  if (me.org_id) {
    void db.from('messages').insert({ org_id: me.org_id, site_id: site.id, sender_id: me.id, audience: 'managers', kind: 'snag_closed', body: `${me.name} closed a snag: "${snag.title || 'Untitled'}"` } as never);
    void db.from('site_activity_log').insert({ site_id: site.id, org_id: me.org_id, actor_id: me.id, action: 'snag_closed', description: `Closed snag "${snag.title || 'Untitled'}"` } as never);
  }
  return 'Snag closed';
}

/** Managers: add a snag with photos; the operatives on the job are told. */
export async function addSnag(me: Profile, site: Site, title: string, location: string, picked: Picked[]): Promise<string> {
  const paths: string[] = []; let failed = 0;
  for (const p of picked) { const path = await upload(`${site.id}/snags/${rid()}.jpg`, p); if (path) paths.push(path); else failed++; }
  const r = await db.from('snags').insert({ site_id: site.id, title, location, photo_path: paths[0] || null, photo_paths: paths.length ? paths : null, status: 'open', created_by: me.id } as never);
  if (r.error) return 'Could not save — try again.';
  if (failed) return `Snag added, but ${failed} photo${failed > 1 ? 's' : ''} failed to upload — check your connection.`;
  if (me.org_id) void db.from('messages').insert({ org_id: me.org_id, site_id: site.id, sender_id: me.id, audience: 'operatives', kind: 'snag_raised', body: `New snag raised: "${title}"` } as never);
  return 'Snag added';
}

/* ---------- Snagging Report PDF (500 exportSnaggingPDF / emailSnaggingPDF) ---------- */
export async function snagsForPdf(siteId: string, scope: 'live' | 'closed' | 'all'): Promise<Snag[]> {
  let q = db.from('snags').select('*').eq('site_id', siteId);
  q = scope === 'live' ? q.eq('status', 'open') : scope === 'closed' ? q.eq('status', 'closed') : q.in('status', ['open', 'closed']);
  return ((await q.order('created_at')).data as Snag[] | null) ?? [];
}
/** Sends the report to the person's own inbox (send-snags-email), optionally CC'ing the client. */
export async function emailSnagPdf(siteId: string, siteName: string, bytes: Uint8Array, filename: string, scopeLabel: string, clientCc: string | null): Promise<string> {
  const id = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}`;
  const up = await supabase.storage.from('mc-documents').upload(`${siteId}/snagging-exports/${id}-${filename.replace(/[^a-z0-9.-]+/gi, '_')}`, bytes, { contentType: 'application/pdf' });
  if (up.error) return 'Could not upload the PDF — try again.';
  const r = await supabase.functions.invoke('send-snags-email', { body: { filename, storage_path: up.data.path, storage_bucket: 'mc-documents', site_name: siteName, scope_label: scopeLabel, client_cc_email: clientCc } });
  const d = r.data as { to?: string; error?: string } | null;
  return r.error || d?.error ? `Email failed — ${d?.error || 'try again'}` : `Snagging report emailed to ${d?.to || 'you'}`;
}

/** A marked-up copy of a snag photo takes the old photo's place (500 snagMarkupSaved). */
export async function replaceSnagPhoto(site: Site, snag: Snag, oldPath: string, uri: string): Promise<boolean> {
  const up = await supabase.storage.from('site-photos').upload(`${site.id}/snags/${rid()}.jpg`, await (await fetch(uri)).arrayBuffer(), { contentType: 'image/jpeg' });
  if (up.error) return false;
  const cur = ((await db.from('snags').select('photo_path,photo_paths').eq('id', snag.id).limit(1)).data as Snag[] | null)?.[0] ?? snag;
  const paths = [...snagPhotos(cur)]; const i = paths.indexOf(oldPath);
  if (i >= 0) paths[i] = up.data.path; else paths.push(up.data.path);
  return !(await db.from('snags').update({ photo_paths: paths, photo_path: paths[0] || null } as never).eq('id', snag.id)).error;
}
