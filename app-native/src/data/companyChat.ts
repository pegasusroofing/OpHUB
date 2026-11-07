// Company Chat (Andy, 7 Nov 2026): one chat for the whole company (everyone but clients), in the HUB for managers and
// in Inbox for everyone else. Tag someone with @ and the database sends them a one-person message ("X tagged you in
// Company Chat: …"), which pushes to their phone (never emailed). The red count is what's come in since you last opened it.
import { useQuery } from '@tanstack/react-query';

import { markMessagesRead } from '@/data/inbox';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

export type ChatMsg = { id: string; sender_id: string; sender_name: string | null; body: string; mentions: string[] | null; created_at: string };
/** The wording of the message a tag sends (company_chat_mentions in the database): how the app knows one. */
export const TAG_WORDS = ' tagged you in Company Chat: ';
export const isChatTag = (body?: string | null) => String(body || '').includes(TAG_WORDS);

export function useCompanyChat(me: Profile | null, open: boolean) {
  return useQuery({
    queryKey: ['companyChat', me?.org_id], enabled: !!me?.org_id,
    // While the chat is open it checks for new messages every few seconds.
    refetchInterval: open ? 5000 : false,
    queryFn: async () => {
      const r = await db.from('company_chat').select('id,sender_id,sender_name,body,mentions,created_at').eq('org_id', me!.org_id as string).order('created_at', { ascending: false }).limit(300);
      return ((r.data as ChatMsg[] | null) ?? []).slice().sort((x, y) => (x.created_at < y.created_at ? 1 : x.created_at > y.created_at ? -1 : 0)); // newest first
    },
  });
}

/** Messages from other people since you last opened the chat (up to 99). Never opened: the last 30 days. */
export function useChatUnread(me: Profile | null) {
  return useQuery({
    queryKey: ['companyChatUnread', me?.id], enabled: !!me?.org_id && me?.role !== 'client', refetchInterval: 60000,
    queryFn: async () => {
      const seen = (await db.from('company_chat_reads').select('last_read_at').eq('user_id', me!.id).maybeSingle()).data as { last_read_at: string } | null;
      const since = seen?.last_read_at || new Date(Date.now() - 30 * 864e5).toISOString();
      const r = await db.from('company_chat').select('id').eq('org_id', me!.org_id as string).neq('sender_id', me!.id).gt('created_at', since).limit(99);
      return ((r.data as unknown[] | null) ?? []).length;
    },
  });
}

/** Opening the chat: the count goes to nothing, and any "tagged you" messages count as read. */
export async function markChatRead(me: Profile): Promise<void> {
  try {
    await db.from('company_chat_reads').upsert({ user_id: me.id, org_id: me.org_id, last_read_at: new Date().toISOString() } as never, { onConflict: 'user_id' });
    const since = new Date(Date.now() - 180 * 864e5).toISOString();
    const tags = ((await db.from('messages').select('id,body').eq('audience', 'single').eq('recipient_id', me.id).gte('created_at', since).ilike('body', '%tagged you in Company Chat%').limit(200)).data as { id: string; body: string }[] | null) ?? [];
    await markMessagesRead(me.id, tags.filter((m) => isChatTag(m.body)).map((m) => m.id));
  } catch { /* the count just stays until next time */ }
}

/** Sends a message. Only tags still in the text are kept. Returns why not, or null. */
export async function sendChat(me: Profile, body: string, tagged: { id: string; name: string }[]): Promise<string | null> {
  const text = body.trim();
  if (!text) return 'Type a message first.';
  const mentions = [...new Set(tagged.filter((p) => text.includes(`@${p.name}`)).map((p) => p.id))];
  const r = await db.from('company_chat').insert({ org_id: me.org_id, sender_id: me.id, body: text.slice(0, 4000), mentions } as never);
  return r.error ? 'Not sent. Check your signal and try again.' : null;
}
