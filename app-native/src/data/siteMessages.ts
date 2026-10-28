// A job's Messages page, operative side: team messages for this job (and company-wide),
// plus ones sent to me alone, with their reply threads; opening marks them read; reply
// goes to the managers. Ported from renderMessages (830). The manager side (send to
// operatives, From Team / Sent tabs, read receipts, delete) comes with the PM screens.
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { cachedQuery, orThrow } from '@/lib/offlineCache';
import { supabase } from '@/lib/supabase';
import type { Message, Profile } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

export const KIND_LABEL: Record<string, string> = {
  material_request: 'Material request', snag_closed: 'Snag closed', variation: 'Variation raised', todo_assigned: 'To Do assigned',
  price_overbooked: 'Price overbooked', additional_works_requested: 'Variation to price requested', schedule_flag: 'Waste/leftover flag',
  material_pickup: 'Material pickup assigned', delivery_assigned: 'Delivery assigned', delivery_complete: 'Delivery done',
  price_sheet_issued: 'Price sheet issued', grn_problem: 'Delivery problem', pi_query: 'Invoice query', pi_query_reply: 'Invoice query reply',
};
// Tapping a message goes to the matching page (only the ones built so far are linked).
export const KIND_ROUTE: Record<string, string> = { snag_closed: 'snagging/list', schedule_flag: 'schedule' };

export function useSiteMessages(siteId: string | undefined) {
  const { me } = useAuth();
  return useQuery({
    queryKey: ['siteMessages', siteId, me?.id],
    enabled: !!siteId && !!me,
    queryFn: () => cachedQuery(`siteMessages:${siteId}:${me?.id}`, async () => {
      const uid = (me as Profile).id;
      const [t, d] = await Promise.all([
        db.from('messages').select('*').eq('audience', 'operatives').is('parent_id', null).or(`site_id.eq.${siteId},site_id.is.null`).order('created_at', { ascending: false }).limit(50),
        db.from('messages').select('*').eq('audience', 'single').eq('recipient_id', uid).is('parent_id', null).eq('site_id', siteId as string).order('created_at', { ascending: false }).limit(50),
      ]);
      const seen = new Set<string>();
      const top = [...(orThrow(t) as Message[]), ...(orThrow(d) as Message[])]
        .filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)))
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      let replies: Message[] = [];
      let unread: string[] = [];
      if (top.length) {
        replies = orThrow(await db.from('messages').select('*').in('parent_id', top.map((m) => m.id)).order('created_at', { ascending: true })) as Message[];
        const all = [...top, ...replies];
        const reads = await db.from('message_reads').select('message_id').eq('user_id', uid).in('message_id', all.map((m) => m.id));
        const read = new Set(((reads.data as { message_id: string }[] | null) ?? []).map((r) => r.message_id));
        unread = all.filter((m) => m.sender_id !== uid && !read.has(m.id)).map((m) => m.id);
      }
      return { top, replies, unread };
    }),
  });
}

/** A reply to a team message goes to the managers (and to operatives if a manager replies). */
export async function sendReply(me: Profile, parent: Message, siteId: string, body: string): Promise<boolean> {
  const audience = parent.audience === 'operatives' ? 'managers' : 'operatives';
  const r = await db.from('messages').insert({ org_id: me.org_id, site_id: parent.site_id || siteId, sender_id: me.id, audience, kind: 'message', body, parent_id: parent.id } as never);
  return !r.error;
}

/* ---------- manager side ---------- */
export type Receipts = { read: { id: string; at: string }[]; unread: string[] };

/** Managers: Sent to Operatives (job + company-wide) and From Team (to managers + to me), with replies and read receipts. */
export function useManagerMessages(siteId: string | undefined) {
  const { me } = useAuth();
  return useQuery({
    queryKey: ['mgrMessages', siteId, me?.id],
    enabled: !!siteId && !!me,
    queryFn: async () => {
      const uid = (me as Profile).id;
      const [b, t, d, assigned, ops] = await Promise.all([
        db.from('messages').select('*').eq('audience', 'operatives').is('parent_id', null).or(`site_id.eq.${siteId},site_id.is.null`).order('created_at', { ascending: false }).limit(50),
        db.from('messages').select('*').eq('audience', 'managers').is('parent_id', null).eq('site_id', siteId as string).order('created_at', { ascending: false }).limit(50),
        db.from('messages').select('*').eq('audience', 'single').eq('recipient_id', uid).is('parent_id', null).eq('site_id', siteId as string).order('created_at', { ascending: false }).limit(50),
        db.from('site_assignments').select('user_id').eq('site_id', siteId as string),
        db.from('profiles').select('id').eq('role', 'operative'),
      ]);
      const sent = orThrow(b) as Message[];
      const seen = new Set<string>();
      const fromTeam = [...(orThrow(t) as Message[]), ...(orThrow(d) as Message[])]
        .filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true))).sort((x, y) => y.created_at.localeCompare(x.created_at));
      const top = [...sent, ...fromTeam];
      let replies: Message[] = [], unread: string[] = [];
      const receipts: Record<string, Receipts> = {};
      if (top.length) {
        replies = (orThrow(await db.from('messages').select('*').in('parent_id', top.map((m) => m.id)).order('created_at', { ascending: true })) as Message[]);
        const all = [...top, ...replies];
        const [mine, allReads] = await Promise.all([
          db.from('message_reads').select('message_id').eq('user_id', uid).in('message_id', all.map((m) => m.id)),
          sent.length ? db.from('message_reads').select('message_id,user_id,read_at').in('message_id', sent.map((m) => m.id)) : Promise.resolve({ data: [], error: null }),
        ]);
        const read = new Set(((mine.data as { message_id: string }[] | null) ?? []).map((r) => r.message_id));
        unread = all.filter((m) => m.sender_id !== uid && !read.has(m.id)).map((m) => m.id);
        const opIds = ((ops.data as { id: string }[] | null) ?? []).map((x) => x.id);
        const opSet = new Set(opIds);
        const siteOps = ((assigned.data as { user_id: string }[] | null) ?? []).map((x) => x.user_id).filter((id) => opSet.has(id));
        const byMsg: Record<string, { message_id: string; user_id: string; read_at: string }[]> = {};
        ((allReads.data as { message_id: string; user_id: string; read_at: string }[] | null) ?? []).forEach((r) => { (byMsg[r.message_id] ||= []).push(r); });
        sent.forEach((m) => {
          const roster = m.site_id ? siteOps : opIds;
          const rs = byMsg[m.id] ?? [];
          const readBy = new Set(rs.map((r) => r.user_id));
          receipts[m.id] = { read: rs.map((r) => ({ id: r.user_id, at: r.read_at })).sort((a, z) => a.at.localeCompare(z.at)), unread: roster.filter((id) => !readBy.has(id)) };
        });
      }
      return { sent, fromTeam, replies, unread, receipts };
    },
  });
}

/** Send to this job's operatives, or all operatives in the company. */
export async function sendBroadcast(me: Profile, siteId: string, body: string, wholeCompany: boolean): Promise<boolean> {
  return !(await db.from('messages').insert({ org_id: me.org_id, site_id: wholeCompany ? null : siteId, sender_id: me.id, audience: 'operatives', kind: 'message', body } as never)).error;
}

export async function deleteMessages(me: Profile, siteId: string, ids: string[], body?: string): Promise<boolean> {
  const r = await db.from('messages').delete().in('id', ids);
  if (r.error) return false;
  if (me.org_id) {
    const description = ids.length === 1 && body != null ? `Deleted message "${body.slice(0, 80)}"` : `Deleted ${ids.length} message${ids.length > 1 ? 's' : ''}`;
    void db.from('site_activity_log').insert({ site_id: siteId, org_id: me.org_id, actor_id: me.id, action: ids.length === 1 ? 'message_deleted' : 'messages_deleted', description } as never);
  }
  return true;
}
