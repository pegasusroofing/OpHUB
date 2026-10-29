// A job's Messages (operative view). Ported from renderMessages (830).
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';

import { ManagerMessages } from '@/components/ManagerMessages';
import { useToast } from '@/components/toast';
import { Button, Card, Empty, Muted } from '@/components/ui';
import { HowTo } from '@/components/HowTo';
import { nameOf, usePeople } from '@/data/hs';
import { markMessagesRead } from '@/data/inbox';
import { KIND_LABEL, KIND_ROUTE, sendReply, useSiteMessages } from '@/data/siteMessages';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import type { Message } from '@/lib/types';
import { base, space, useTheme } from '@/theme/theme';

const when = (t: string) => new Date(t).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function SiteMessages() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const t = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading, refetch, isRefetching } = useSiteMessages(id);
  const { data: people } = usePeople();
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [shownNew, setShownNew] = useState<Set<string>>(new Set());

  // Listing them marks them read (the "new" marks stay for this visit).
  useEffect(() => {
    if (!me || !data || !data.unread.length) return;
    setShownNew(new Set(data.unread));
    void markMessagesRead(me.id, [...data.top, ...data.replies].map((m) => m.id)).then(() => {
      void qc.invalidateQueries({ queryKey: ['opUnread'] });
      void qc.invalidateQueries({ queryKey: ['myMessages'] });
    });
  }, [me, data, qc]);

  if (!me) return null;
  if (isManager(me)) {
    return (
      <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
        <Stack.Screen options={{ title: 'Messages' }} />
        <HowTo k="messages" />
        <ManagerMessages siteId={id} />
      </ScrollView>
    );
  }

  const row = (m: Message) => {
    const replies = (data?.replies ?? []).filter((r) => r.parent_id === m.id);
    const isNew = shownNew.has(m.id);
    const dest = m.site_id && KIND_ROUTE[m.kind] ? `/sites/${m.site_id}/${KIND_ROUTE[m.kind]}` : null;
    return (
      <Card key={m.id} style={{ paddingVertical: 10, ...(isNew ? { borderLeftWidth: 4, borderLeftColor: t.brand1 } : {}) }}>
        <Pressable disabled={!dest} onPress={() => dest && router.push(dest as never)}>
          <Text style={{ fontSize: 12, color: base.slate, marginBottom: 4 }}>
            {isNew ? '● ' : ''}{nameOf(people, m.sender_id)} · {when(m.created_at)}{!m.site_id ? ' · All sites' : ''}
            {KIND_LABEL[m.kind] ? <Text style={{ color: base.blue }}> · {KIND_LABEL[m.kind]}</Text> : null}
          </Text>
          <Text style={{ fontSize: 13.5, color: base.ink, fontWeight: isNew ? '700' : '400' }}>{m.body}</Text>
        </Pressable>
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
            <TextInput multiline value={draft} onChangeText={setDraft} placeholder="Write a reply..."
              style={{ minHeight: 60, borderWidth: 1, borderColor: base.line, borderRadius: 10, padding: 10, color: base.ink }} />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
              <View style={{ flex: 1 }}><Button title="Send Reply" onPress={async () => {
                if (!draft.trim()) { toast('Write a reply first.'); return; }
                if (await sendReply(me, m, id, draft.trim())) { toast('Reply sent'); setReplyTo(null); setDraft(''); void refetch(); }
                else toast('Could not send — check your signal and try again.');
              }} /></View>
              <View style={{ flex: 1 }}><Button kind="ghost" title="Cancel" onPress={() => { setReplyTo(null); setDraft(''); }} /></View>
            </View>
          </View>
        ) : (
          <Pressable onPress={() => { setReplyTo(m.id); setDraft(''); }} style={{ marginTop: 8 }}><Text style={{ color: base.blue }}>↩ Reply</Text></Pressable>
        ))}
      </Card>
    );
  };

  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { void refetch(); }} />} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Messages' }} />
      {isLoading ? <Muted>Loading…</Muted> : data?.top.length ? data.top.map(row) : <Empty>No messages yet.</Empty>}
    </ScrollView>
  );
}
