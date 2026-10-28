// Operative "Messages & tasks": what's left to sign on my live jobs, and my messages.
// Ported from computeOutstandingRows (190, operative branch), renderMyMessages and
// markMessagesRead (830).
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { cachedQuery, orThrow } from '@/lib/offlineCache';
import { siteStatusKey } from '@/lib/rules/checkin';
import { currentCycleSigs } from '@/lib/rules/hs';
import { supabase } from '@/lib/supabase';
import type { Message, Profile, Site } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

export type OutstandingItem = { label: string; href: string; type: 'rams' | 'coshh' | 'tbt' };
export type OutstandingRow = { site: Site; items: OutstandingItem[] };

type Doc = { id: string; site_id: string; uploaded_at: string | null; resign_cycle_start: string | null };

export function useOutstanding(sites: Site[] | undefined) {
  const { me } = useAuth();
  return useQuery({
    queryKey: ['outstanding', me?.id, (sites ?? []).length],
    enabled: !!me && !!sites,
    queryFn: () => cachedQuery<OutstandingRow[]>(`outstanding:${me?.id}`, async () => {
      const uid = (me as Profile).id;
      const a = await db.from('site_assignments').select('site_id').eq('user_id', uid);
      const mine = new Set(((orThrow(a) as { site_id: string }[]) ?? []).map((x) => x.site_id));
      const live = (sites ?? []).filter((s) => mine.has(s.id) && siteStatusKey(s) === 'live');
      if (!live.length) return [];
      const ids = live.map((s) => s.id);
      const [rams, coshh, tbts] = await Promise.all([
        db.from('rams_docs').select('id,site_id,uploaded_at,resign_cycle_start').eq('status', 'current').in('site_id', ids).is('subcontractor_company_id', null),
        db.from('coshh_docs').select('id,site_id,uploaded_at,resign_cycle_start').in('site_id', ids).is('subcontractor_company_id', null),
        db.from('toolbox_talks').select('id,site_id').eq('status', 'live').in('site_id', ids).is('subcontractor_company_id', null),
      ]);
      const ramsDocs = orThrow(rams) as Doc[], coshhDocs = orThrow(coshh) as Doc[], liveTbts = orThrow(tbts) as { id: string; site_id: string }[];
      const sigs = async (table: string, key: string, docIds: string[]) => docIds.length
        ? orThrow(await db.from(table).select(`${key},user_id,signed_at`).in(key, docIds).eq('user_id', uid)) as Record<string, string>[]
        : [];
      const [rs, cs, ts] = await Promise.all([
        sigs('rams_signatures', 'rams_id', ramsDocs.map((d) => d.id)),
        sigs('coshh_signatures', 'coshh_id', coshhDocs.map((d) => d.id)),
        sigs('toolbox_talk_signatures', 'tbt_id', liveTbts.map((d) => d.id)),
      ]);
      // Every job here is live, so the yearly re-sign cycle always applies.
      const liveSite = { status: 'active' };
      const ramsSigned = new Set(currentCycleSigs(rs as never[], ramsDocs, 'rams_id' as never, liveSite).map((x: Record<string, string>) => x.rams_id));
      const coshhSigned = new Set(currentCycleSigs(cs as never[], coshhDocs, 'coshh_id' as never, liveSite).map((x: Record<string, string>) => x.coshh_id));
      const tbtSigned = new Set(ts.map((x) => x.tbt_id));
      return live.map((s) => {
        const items: OutstandingItem[] = [];
        const r = ramsDocs.filter((d) => d.site_id === s.id && !ramsSigned.has(d.id)).length;
        const c = coshhDocs.filter((d) => d.site_id === s.id && !coshhSigned.has(d.id)).length;
        const t = liveTbts.filter((d) => d.site_id === s.id && !tbtSigned.has(d.id)).length;
        if (r) items.push({ label: `RAMS to sign (${r})`, href: `/sites/${s.id}/hs/rams`, type: 'rams' });
        if (c) items.push({ label: `COSHH to sign (${c})`, href: `/sites/${s.id}/hs/coshh`, type: 'coshh' });
        if (t) items.push({ label: `Toolbox Talk to sign (${t})`, href: `/sites/${s.id}/hs/tbt`, type: 'tbt' });
        return { site: s, items };
      }).filter((r) => r.items.length);
    }),
  });
}

export const outstandingCount = (rows: OutstandingRow[] | undefined) =>
  (rows ?? []).reduce((n, r) => n + r.items.length, 0);

/** Team messages to operatives on my jobs (or company-wide) plus ones sent to me alone, newest first. */
export function useMyMessages(siteIds: string[], enabled = true) {
  const { me } = useAuth();
  return useQuery({
    queryKey: ['myMessages', me?.id, siteIds.join(',')],
    enabled: !!me && enabled,
    queryFn: () => cachedQuery(`myMessages:${me?.id}`, async () => {
      const uid = (me as Profile).id;
      let team = db.from('messages').select('*').eq('audience', 'operatives').is('parent_id', null);
      team = siteIds.length ? team.or(`site_id.in.(${siteIds.join(',')}),site_id.is.null`) : team.is('site_id', null);
      const [t, d] = await Promise.all([
        team.order('created_at', { ascending: false }).limit(100),
        db.from('messages').select('*').eq('audience', 'single').eq('recipient_id', uid).is('parent_id', null).order('created_at', { ascending: false }).limit(50),
      ]);
      const seen = new Set<string>();
      const rows = [...(orThrow(t) as Message[]), ...(orThrow(d) as Message[])]
        .filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)))
        .sort((x, y) => new Date(y.created_at).getTime() - new Date(x.created_at).getTime())
        .slice(0, 150);
      let unread: string[] = [];
      if (rows.length) {
        const reads = await db.from('message_reads').select('message_id').eq('user_id', uid).in('message_id', rows.map((m) => m.id));
        const read = new Set(((reads.data as { message_id: string }[] | null) ?? []).map((r) => r.message_id));
        unread = rows.filter((m) => m.sender_id !== uid && !read.has(m.id)).map((m) => m.id);
      }
      return { rows, unread };
    }),
  });
}

/** Listing messages marks them read (same as today). */
export async function markMessagesRead(userId: string, ids: string[]): Promise<void> {
  if (!ids.length) return;
  try {
    await db.from('message_reads').upsert(ids.map((id) => ({ message_id: id, user_id: userId })) as never, { onConflict: 'message_id,user_id', ignoreDuplicates: true });
  } catch { /* silent, as today */ }
}
