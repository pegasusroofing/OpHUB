// Operative "Messages & tasks": what's left to sign on my live jobs, and my messages.
// Ported from computeOutstandingRows (190, operative branch), renderMyMessages and
// markMessagesRead (830).
import { useQuery, type QueryClient } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { cachedQuery, orThrow } from '@/lib/offlineCache';
import { siteStatusKey } from '@/lib/rules/checkin';
import { currentCycleSigs } from '@/lib/rules/hs';
import { supabase } from '@/lib/supabase';
import type { Message, Profile, Site } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

/** One document to sign (Andy, 18 Nov 2026: "give some context in the to do ... what rams need signing, if superseded rams
 *  been issued"): its name, and why (new, a new version of one already signed, or the yearly re-sign). */
export type OutstandingItem = { label: string; href: string; type: 'rams' | 'coshh' | 'tbt'; sub?: string };
export type OutstandingRow = { site: Site; items: OutstandingItem[] };

type Doc = { id: string; site_id: string; uploaded_at: string | null; resign_cycle_start: string | null; name?: string | null; supersedes?: string | null };

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
        db.from('rams_docs').select('id,site_id,uploaded_at,resign_cycle_start,name,supersedes').eq('status', 'current').in('site_id', ids).is('subcontractor_company_id', null),
        db.from('coshh_docs').select('id,site_id,uploaded_at,resign_cycle_start,name').in('site_id', ids).is('subcontractor_company_id', null),
        db.from('toolbox_talks').select('id,site_id,title').eq('status', 'live').in('site_id', ids).is('subcontractor_company_id', null),
      ]);
      const ramsDocs = orThrow(rams) as Doc[], coshhDocs = orThrow(coshh) as Doc[], liveTbts = orThrow(tbts) as { id: string; site_id: string; title?: string | null }[];
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
      // The RAMS a new version replaces, by name.
      const oldIds = [...new Set(ramsDocs.map((d) => d.supersedes).filter(Boolean) as string[])];
      const old = oldIds.length ? (orThrow(await db.from('rams_docs').select('id,name').in('id', oldIds)) as { id: string; name: string }[]) : [];
      const oldName = (id: string) => old.find((x) => x.id === id)?.name || 'an earlier version';
      // Signed before, but not in this year's cycle: the yearly re-sign.
      const everR = new Set((rs as Record<string, string>[]).map((x) => x.rams_id)), everC = new Set((cs as Record<string, string>[]).map((x) => x.coshh_id));
      const why = (d: Doc, ever: Set<string>) => (d.supersedes ? `New version — replaces "${oldName(d.supersedes)}"` : ever.has(d.id) ? 'Yearly re-sign due' : 'New — not signed yet');
      return live.map((s) => {
        const items: OutstandingItem[] = [];
        ramsDocs.filter((d) => d.site_id === s.id && !ramsSigned.has(d.id)).forEach((d) => items.push({ label: `Sign RAMS: ${d.name || 'RAMS document'}`, sub: why(d, everR), href: `/sites/${s.id}/hs/rams`, type: 'rams' }));
        coshhDocs.filter((d) => d.site_id === s.id && !coshhSigned.has(d.id)).forEach((d) => items.push({ label: `Sign COSHH: ${d.name || 'COSHH document'}`, sub: why(d, everC), href: `/sites/${s.id}/hs/coshh`, type: 'coshh' }));
        liveTbts.filter((d) => d.site_id === s.id && !tbtSigned.has(d.id)).forEach((d) => items.push({ label: `Sign Toolbox Talk: ${d.title || 'Toolbox Talk'}`, sub: 'New — not signed yet', href: `/sites/${s.id}/hs/tbt/${d.id}`, type: 'tbt' }));
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
      // "New RAMS … needs signing" notices aren't listed: what to sign is in To Do, by name (Andy, 18 Nov 2026: "I don't
      // need messages to the operatives as there is now for new rams"). The phone alert they send still comes.
      const rows = [...(orThrow(t) as Message[]), ...(orThrow(d) as Message[])]
        .filter((m) => (m as { kind?: string }).kind !== 'doc_needs_signing')
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

/** After any signature (RAMS, COSHH, Toolbox Talk, H&S Policy): the lists of what's still to sign (To Sign / Do, the HUB,
 *  Getting Started, the job's sign prompt, the H&S tiles) are read again, so a signed document drops off straight away
 *  (Andy, 18 Nov 2026: "I've signed coshh but asking me to sign still as if outstanding"). */
export function refreshToSign(qc: QueryClient) {
  ['outstanding', 'hub', 'onboarding', 'hsSummary'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
}
