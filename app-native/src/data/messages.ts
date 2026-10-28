// Unread message count for an operative's home. Ported from opUnreadCount and
// myUnreadDirectMessages (185-pm-home.js, 830-messages.js):
//  - team messages to operatives on my sites (or company-wide), top-level only, not sent by me;
//  - plus messages sent to me alone in the last 180 days.
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

async function unreadOf(userId: string, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const r = await supabase.from('message_reads').select('message_id').eq('user_id', userId).in('message_id', ids);
  return new Set((r.data ?? []).map((x) => x.message_id));
}

export function useOpUnreadCount(siteIds: string[]) {
  const { me } = useAuth();
  return useQuery({
    queryKey: ['opUnread', me?.id, siteIds.join(',')],
    enabled: !!me,
    staleTime: 30000,
    queryFn: async () => {
      const uid = (me as { id: string }).id;
      let team = supabase.from('messages').select('id,sender_id').eq('audience', 'operatives').is('parent_id', null);
      team = siteIds.length ? team.or(`site_id.in.(${siteIds.join(',')}),site_id.is.null`) : team.is('site_id', null);
      const since = new Date(Date.now() - 180 * 864e5).toISOString();
      const [t, d] = await Promise.all([
        team.order('created_at', { ascending: false }).limit(100),
        supabase.from('messages').select('id,sender_id').eq('audience', 'single').eq('recipient_id', uid).neq('sender_id', uid)
          .is('parent_id', null).gte('created_at', since).order('created_at', { ascending: false }).limit(50),
      ]);
      const teamRows = (t.data ?? []).filter((m) => m.sender_id !== uid);
      const directRows = d.data ?? [];
      const read = await unreadOf(uid, [...teamRows, ...directRows].map((m) => m.id));
      return teamRows.filter((m) => !read.has(m.id)).length + directRows.filter((m) => !read.has(m.id)).length;
    },
  });
}
