// A job's Messages for managers. Ported from renderMessages (830, manager view):
// Send a message (this site's operatives or the whole company), From Team / Sent to
// Operatives tabs with unread counts, replies, read receipts on sent messages,
// tick-to-delete and delete. Listing marks everything read.
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted, SectionTitle } from '@/components/ui';
import { nameOf, usePeople } from '@/data/hs';
import { markMessagesRead } from '@/data/inbox';
import { deleteMessages, KIND_LABEL, msgDest, sendBroadcast, sendReply, useManagerMessages } from '@/data/siteMessages';
import { useAuth } from '@/lib/auth';
import type { Message } from '@/lib/types';
import { base, radius, useTheme } from '@/theme/theme';

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
  const [whole, setWhole] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [reply, setReply] = useState('');
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
            {ticked && <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>✓</Text>}
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
        {replies.length > 0 && (
          <View style={{ marginTop: 8, marginLeft: 14, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: base.line }}>
            {replies.map((r) => (
              <View key={r.id} style={{ marginBottom: 6 }}>
                <Text style={{ fontSize: 11.5, color: base.slate }}>{nameOf(people, r.sender_id)} · {when(r.created_at)}</Text>
                <Text style={{ fontSize: 13, color: base.ink }}>{r.body}</Text>
              </View>
            ))}
          </View>
        )}
        {m.audience !== 'single' && (replyTo === m.id ? (
          <View style={{ marginTop: 8 }}>
            <TextInput multiline value={reply} onChangeText={setReply} placeholder="Write a reply..." style={box} />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
              <View style={{ flex: 1 }}><Button title="Send Reply" onPress={async () => {
                if (!reply.trim()) { toast('Write a reply first.'); return; }
                if (await sendReply(me, m, siteId, reply.trim())) { toast('Reply sent'); setReplyTo(null); setReply(''); void refetch(); }
              }} /></View>
              <View style={{ flex: 1 }}><Button kind="ghost" title="Cancel" onPress={() => { setReplyTo(null); setReply(''); }} /></View>
            </View>
          </View>
        ) : <Pressable onPress={() => { setReplyTo(m.id); setReply(''); }} style={{ marginTop: 8 }}><Text style={{ color: base.blue }}>↩ Reply</Text></Pressable>)}
      </Card>
    );
  };

  return (
    <View>
      <Card>
        <SectionTitle>Send a message</SectionTitle>
        <TextInput multiline value={draft} onChangeText={setDraft} placeholder="Message to operatives..." style={box} />
        <Muted style={{ fontWeight: '700', marginTop: 8, marginBottom: 6 }}>Send to</Muted>
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
          {([[false, "This site's operatives"], [true, 'All operatives (whole company)']] as const).map(([v, l]) => (
            <Pressable key={l} onPress={() => setWhole(v)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: whole === v ? base.ink : base.line, backgroundColor: whole === v ? base.ink : base.card }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: whole === v ? '#fff' : base.ink }}>{l}</Text>
            </Pressable>
          ))}
        </View>
        <Button title="Send" onPress={async () => {
          if (!draft.trim()) { toast('Write a message first.'); return; }
          if (await sendBroadcast(me, siteId, draft.trim(), whole)) { setDraft(''); toast(whole ? 'Sent to all operatives' : "Sent to this site's operatives"); void qc.invalidateQueries({ queryKey: ['mgrMessages', siteId] }); }
          else toast('Could not send — check your signal and try again.');
        }} />
      </Card>
      {sel.size > 0 && (
        <Button title={`Delete ${sel.size} Selected`} onPress={async () => {
          if (!(await confirmAsk(`Delete ${sel.size} message${sel.size === 1 ? '' : 's'}? This can't be undone.`, 'Delete'))) return;
          if (await deleteMessages(me, siteId, [...sel])) { toast('Messages deleted'); setSel(new Set()); void refetch(); }
        }} />
      )}
      <View style={{ flexDirection: 'row', gap: 8, marginVertical: 12 }}>
        {([['fromTeam', `From Team${data && unreadIn(data.fromTeam) ? ` (${unreadIn(data.fromTeam)})` : ''}`], ['sent', `Sent to Operatives${data && unreadIn(data.sent) ? ` (${unreadIn(data.sent)})` : ''}`]] as const).map(([k, l]) => (
          <Pressable key={k} onPress={() => setTab(k)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: tab === k ? base.ink : base.line, backgroundColor: tab === k ? base.ink : base.card }}>
            <Text style={{ fontWeight: '700', color: tab === k ? '#fff' : base.ink }}>{l}</Text>
          </Pressable>
        ))}
      </View>
      {isLoading ? <Muted>Loading…</Muted> : tab === 'fromTeam'
        ? (data?.fromTeam.length ? data.fromTeam.map(row) : <Empty>Nothing from the crew yet.</Empty>)
        : (data?.sent.length ? data.sent.map(row) : <Empty>No messages sent yet.</Empty>)}
    </View>
  );
}

const box = { minHeight: 60, borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card };
