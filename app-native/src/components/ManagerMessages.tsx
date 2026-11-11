// A job's Messages for managers. Ported from renderMessages (830, manager view):
// Send a message (this site's operatives or the whole company), From Team / Sent to
// Operatives tabs with unread counts, replies, read receipts on sent messages,
// tick-to-delete and delete. Listing marks everything read.
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { chooseAction, confirmAsk, useToast } from '@/components/toast';
import { MentionBox, mentionedIn } from '@/components/MentionBox';
import { TodoPop } from '@/components/TodoPop';
import { SelectBox } from '@/components/SelectBox';
import { Button, Card, Empty, Muted, SectionTitle } from '@/components/ui';
import { nameOf, usePeople } from '@/data/hs';
import { markMessagesRead } from '@/data/inbox';
import { deleteMessages, KIND_LABEL, msgDest, sendBroadcast, sendMentions, sendReply, useManagerMessages, type SendTo } from '@/data/siteMessages';
import { useAuth } from '@/lib/auth';
import type { Message } from '@/lib/types';
import { base, radius, useTheme } from '@/theme/theme';

const SEND_TO: [SendTo, string][] = [['site', 'Site Operatives'], ['all', 'All Operatives'], ['managers', 'All Managers Only']];
const SENT: Record<SendTo, string> = { site: "Sent to this site's operatives", all: 'Sent to all operatives', managers: 'Sent to the managers' };
const when = (t: string) => new Date(t).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export function ManagerMessages({ siteId }: { siteId: string }) {
  const { me } = useAuth();
  const th = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useManagerMessages(siteId);
  const { data: people } = usePeople();
  const [tab, setTab] = useState<'fromTeam' | 'sent'>('fromTeam');
  const [draft, setDraft] = useState('');
  const [sendTo, setSendTo] = useState<SendTo>('site');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [todoFrom, setTodoFrom] = useState<Message | null>(null);
  const [reply, setReply] = useState('');
  const [threads, setThreads] = useState<Set<string>>(new Set());
  const [receiptsFor, setReceiptsFor] = useState<string | null>(null);
  const [shownNew, setShownNew] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!me || !data) return;
    const all = [...data.sent, ...data.fromTeam, ...data.replies].map((m) => m.id);
    if (data.unread.length) setShownNew(new Set(data.unread));
    if (all.length) void markMessagesRead(me.id, all);
  }, [me, data]);
  if (!me) return null;
  const isNew = (m: Message) => shownNew.has(m.id) || (data?.replies ?? []).some((r) => r.parent_id === m.id && shownNew.has(r.id));
  const unreadIn = (list: Message[]) => list.filter(isNew).length;

  const row = (m: Message) => {
    const replies = (data?.replies ?? []).filter((r) => r.parent_id === m.id);
    const dest = msgDest(m, me);
    const rc = data?.receipts[m.id];
    const fresh = shownNew.has(m.id);
    const ticked = sel.has(m.id);
    return (
      <Card key={m.id} style={{ paddingVertical: 10, ...(fresh ? { borderLeftWidth: 4, borderLeftColor: th.brand1 } : {}) }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable onPress={() => { const n = new Set(sel); if (ticked) n.delete(m.id); else n.add(m.id); setSel(n); }}
            style={{ width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: base.slateLight, alignItems: 'center', justifyContent: 'center', backgroundColor: ticked ? base.ink : base.card }}>
            {ticked && <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>✓</Text>}
          </Pressable>
          <Pressable style={{ flex: 1 }} disabled={!dest} onPress={() => dest && router.push(dest as never)}>
            <Text style={{ fontSize: 12, color: base.slate, marginBottom: 4 }}>
              {fresh ? '● ' : ''}{nameOf(people, m.sender_id)} · {when(m.created_at)}{!m.site_id ? ' · All sites' : ''}
              {KIND_LABEL[m.kind] ? <Text style={{ color: base.blue }}> · {KIND_LABEL[m.kind]}</Text> : null}
            </Text>
            <Text style={{ fontSize: 13.5, color: base.ink, fontWeight: fresh ? '700' : '400' }}>{m.body}</Text>
          </Pressable>
          <Pressable hitSlop={6} onPress={async () => {
            if (!(await confirmAsk("Delete this message? This can't be undone.", 'Delete'))) return;
            if (await deleteMessages(me, siteId, [m.id], m.body)) { toast('Message deleted'); void refetch(); }
          }}><Text>🗑</Text></Pressable>
        </View>
        {m.audience === 'operatives' && rc && (
          <>
            <Pressable onPress={() => setReceiptsFor(receiptsFor === m.id ? null : m.id)} style={{ marginTop: 8 }}>
              <Text style={{ color: base.blue }}>👁 {rc.read.length} viewed{rc.unread.length ? `, ${rc.unread.length} not yet` : ''} {receiptsFor === m.id ? '▼' : '▶'}</Text>
            </Pressable>
            {receiptsFor === m.id && (
              <View style={{ marginTop: 6, marginLeft: 14, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: base.line }}>
                {rc.read.map((r) => <Text key={r.id} style={{ fontSize: 11.5, color: base.ok }}>✓ {nameOf(people, r.id)} — {when(r.at)}</Text>)}
                {rc.unread.map((id) => <Text key={id} style={{ fontSize: 11.5, color: base.slate }}>○ {nameOf(people, id)} — not yet viewed</Text>)}
                {!rc.read.length && !rc.unread.length && <Muted>No operatives in this audience yet.</Muted>}
              </View>
            )}
          </>
        )}
        {replies.length > 0 && <Pressable onPress={() => { const n = new Set(threads); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); setThreads(n); }} style={{ marginTop: 8 }}><Text style={{ color: base.blue, fontWeight: '600' }}>💬 {replies.length} repl{replies.length === 1 ? 'y' : 'ies'} {threads.has(m.id) ? '▼' : '▶'}</Text></Pressable>}
        {replies.length > 0 && threads.has(m.id) && (
          <View style={{ marginTop: 8, marginLeft: 14, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: base.line }}>
            {replies.map((r) => (
              <View key={r.id} style={{ marginBottom: 6 }}>
                <Text style={{ fontSize: 11.5, color: base.slate }}>{nameOf(people, r.sender_id)} · {when(r.created_at)}</Text>
                <Text style={{ fontSize: 13, color: base.ink }}>{r.body}</Text>
              </View>
            ))}
          </View>
        )}
        {/* A message to you alone has no Reply here, but can still be made a to-do (Andy, 11 Nov 2026). */}
        {m.audience !== 'single' && replyTo === m.id ? (
          <View style={{ marginTop: 8 }}>
            <MentionBox value={reply} onChangeText={setReply} people={people ?? []} placeholder="Write a reply... type @ to mention someone" style={box} />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
              <View style={{ flex: 1 }}><Button title="Send Reply" onPress={async () => {
                if (!reply.trim()) { toast('Write a reply first.'); return; }
                if (await sendReply(me, m, siteId, reply.trim())) { void sendMentions(me, siteId, reply.trim(), mentionedIn(reply, people ?? [])); toast('Reply sent'); setReplyTo(null); setReply(''); setThreads(new Set([...threads, m.id])); void refetch(); }
              }} /></View>
              <View style={{ flex: 1 }}><Button kind="ghost" title="Cancel" onPress={() => { setReplyTo(null); setReply(''); }} /></View>
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 18, marginTop: 8 }}>
            {m.audience !== 'single' && <Pressable onPress={() => { setReplyTo(m.id); setReply(''); }}><Text style={{ color: base.blue }}>↩ Reply</Text></Pressable>}
            <Pressable accessibilityRole="button" accessibilityLabel="Make It A To Do" onPress={() => setTodoFrom(m)}><Text style={{ color: base.blue }}>☐ Make It A To Do</Text></Pressable>
          </View>
        )}
      </Card>
    );
  };

  return (
    <View>
      <Card>
        <SectionTitle>Send a message</SectionTitle>
        <MentionBox value={draft} onChangeText={setDraft} people={people ?? []} placeholder={sendTo === 'managers' ? 'Message to the managers... type @ to mention someone' : 'Message to operatives... type @ to mention someone'} style={[box, { marginBottom: 8 }]} />
        {/* Send takes three quarters; who it goes to is a drop-down in the last quarter (Andy, 4 Nov 2026). */}
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <View style={{ flex: 3 }}><Button title="Send" onPress={async () => {
            if (!draft.trim()) { toast('Write a message first.'); return; }
            if (await sendBroadcast(me, siteId, draft.trim(), sendTo)) { void sendMentions(me, siteId, draft.trim(), mentionedIn(draft, people ?? [])); setDraft(''); toast(SENT[sendTo]); void qc.invalidateQueries({ queryKey: ['mgrMessages', siteId] }); }
            else toast('Could not send — check your signal and try again.');
          }} /></View>
          <SelectBox<SendTo> style={{ flex: 1, marginBottom: 0 }} title="Send To" textSize={13} short={{ site: 'Site', all: 'All Ops', managers: 'Managers' }} value={sendTo} onChange={setSendTo} options={SEND_TO} />
        </View>
      </Card>
      {sel.size > 0 && (
        <Button title={`Delete ${sel.size} Selected`} onPress={async () => {
          if (!(await confirmAsk(`Delete ${sel.size} message${sel.size === 1 ? '' : 's'}? This can't be undone.`, 'Delete'))) return;
          if (await deleteMessages(me, siteId, [...sel])) { toast('Messages deleted'); setSel(new Set()); void refetch(); }
        }} />
      )}
      <View style={{ flexDirection: 'row', marginVertical: 12 }}>
        <Pressable onPress={async () => {
          const k = await chooseAction('Show', [{ key: 'fromTeam', label: `From Team${data && unreadIn(data.fromTeam) ? ` (${unreadIn(data.fromTeam)})` : ''}` }, { key: 'sent', label: `Sent to Operatives${data && unreadIn(data.sent) ? ` (${unreadIn(data.sent)})` : ''}` }]);
          if (k) setTab(k as typeof tab);
        }} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: base.line, backgroundColor: base.card }}>
          <Text style={{ fontWeight: '600', color: base.ink }}>{tab === 'fromTeam' ? 'From Team' : 'Sent to Operatives'}{data && unreadIn(tab === 'fromTeam' ? data.fromTeam : data.sent) ? ` (${unreadIn(tab === 'fromTeam' ? data.fromTeam : data.sent)})` : ''} ▼</Text>
        </Pressable>
      </View>
      {isLoading ? <Muted>Loading…</Muted> : tab === 'fromTeam'
        ? (data?.fromTeam.length ? data.fromTeam.map(row) : <Empty>Nothing from the crew yet.</Empty>)
        : (data?.sent.length ? data.sent.map(row) : <Empty>No messages sent yet.</Empty>)}
      {todoFrom && <TodoPop start={todoFrom.body} siteId={siteId} messageId={todoFrom.id} onClose={() => setTodoFrom(null)} />}
    </View>
  );
}

const box = { minHeight: 60, borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card };
