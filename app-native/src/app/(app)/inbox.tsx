// Operative "Messages & tasks": two tabs, "To sign / do" and "Messages".
// Ported from renderOpInbox (185), renderOutstandingTasks (190, operative view)
// and renderMyMessages (830). Opening the Messages tab marks them read.
import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { Card, Empty, Muted, Row, SectionTitle, Title } from '@/components/ui';
import { nameOf, usePeople } from '@/data/hs';
import { markMessagesRead, outstandingCount, useMyMessages, useOutstanding } from '@/data/inbox';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { base, space, useTheme } from '@/theme/theme';

type Tab = 'todo' | 'msgs';
const TYPES = [{ k: 'all', l: 'All' }, { k: 'rams', l: 'RAMS' }, { k: 'coshh', l: 'COSHH' }, { k: 'tbt', l: 'TBT' }] as const;

export default function Inbox() {
  const { tab: tabParam } = useLocalSearchParams<{ tab?: Tab }>();
  const { me } = useAuth();
  const t = useTheme();
  const qc = useQueryClient();
  const { data: sites } = useSites();
  const siteIds = (sites ?? []).map((s) => s.id);
  const out = useOutstanding(sites);
  const msgs = useMyMessages(siteIds);
  const { data: people } = usePeople();
  const todoN = outstandingCount(out.data);
  const [tab, setTab] = useState<Tab | null>(tabParam ?? null);
  const [type, setType] = useState<(typeof TYPES)[number]['k']>('all');
  const current: Tab = tab ?? (todoN > 0 ? 'todo' : 'msgs');
  const [shownUnread, setShownUnread] = useState<Set<string>>(new Set());

  // Opening Messages marks everything listed as read; the "new" dots stay for this visit.
  useEffect(() => {
    if (current !== 'msgs' || !me || !msgs.data) return;
    if (msgs.data.unread.length) {
      setShownUnread(new Set(msgs.data.unread));
      void markMessagesRead(me.id, msgs.data.rows.map((m) => m.id)).then(() => {
        void qc.invalidateQueries({ queryKey: ['opUnread'] });
      });
    }
  }, [current, me, msgs.data, qc]);

  const siteName = (id: string | null) => (id ? sites?.find((s) => s.id === id)?.name || 'a site' : 'All sites');
  const rows = (out.data ?? []).map((r) => ({ ...r, items: type === 'all' ? r.items : r.items.filter((i) => i.type === type) })).filter((r) => r.items.length);
  const unreadN = msgs.data?.unread.length ?? 0;

  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }}
      refreshControl={<RefreshControl refreshing={out.isRefetching || msgs.isRefetching} onRefresh={() => { void out.refetch(); void msgs.refetch(); }} />}>
      <Title>Messages & tasks</Title>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        {([['todo', `To sign / do${todoN ? ` (${todoN})` : ''}`], ['msgs', `Messages${unreadN && current !== 'msgs' ? ` (${unreadN} new)` : ''}`]] as const).map(([k, label]) => (
          <Pressable key={k} onPress={() => setTab(k)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: current === k ? base.ink : base.line, backgroundColor: current === k ? base.ink : base.card }}>
            <Text style={{ fontWeight: '700', color: current === k ? '#fff' : base.ink }}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {current === 'todo' ? (
        <>
          <Muted style={{ marginBottom: 10 }}>Outstanding items on your sites — tap one to go straight to it.</Muted>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
            {TYPES.map((c) => (
              <Pressable key={c.k} onPress={() => setType(c.k)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: type === c.k ? t.brand1 : base.line, backgroundColor: type === c.k ? t.brand1 : base.card }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: type === c.k ? t.brand1Text : base.ink }}>{c.l}</Text>
              </Pressable>
            ))}
          </View>
          {out.isLoading ? <Muted>Loading…</Muted> : rows.length ? rows.map((r) => (
            <View key={r.site.id}>
              <SectionTitle>{r.site.name}</SectionTitle>
              {r.items.map((it) => <Row key={it.href} title={`! ${it.label}`} onPress={() => router.push(it.href as never)} />)}
            </View>
          )) : <Empty>Nothing outstanding — nice work.</Empty>}
        </>
      ) : (
        <>
          <Muted style={{ marginBottom: 10 }}>Messages and notifications from your team across all your assigned sites, most recent first.</Muted>
          {msgs.isLoading ? <Muted>Loading…</Muted> : msgs.data?.rows.length ? msgs.data.rows.map((m) => {
            const isNew = shownUnread.has(m.id);
            return (
              <Card key={m.id} style={{ paddingVertical: 10, ...(isNew ? { borderLeftWidth: 4, borderLeftColor: t.brand1 } : {}) }}>
                <Text style={{ fontSize: 12, color: base.slate, marginBottom: 4 }}>
                  {isNew ? '● ' : ''}{nameOf(people, m.sender_id)} · {siteName(m.site_id)} · {new Date(m.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </Text>
                <Text style={{ fontSize: 13.5, color: base.ink, fontWeight: isNew ? '700' : '400' }}>{m.body}</Text>
              </Card>
            );
          }) : <Empty>No messages yet.</Empty>}
        </>
      )}
    </ScrollView>
  );
}
