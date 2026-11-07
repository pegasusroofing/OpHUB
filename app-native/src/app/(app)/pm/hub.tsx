// The HUB (200 renderHub; Andy 7 Nov 2026, Option 1): everything waiting for you, in tabs along the top —
// Everything, Projects, Finance and Company Chat — each with a red count. Filter by site, due date and whose jobs
// (me / all PMs / a colleague), all drop-downs on one row. Tap a row to go straight to it; each item drops off by itself
// once it's dealt with (a message once it's opened). The Company Chat is the whole company in one chat.
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { CompanyChat } from '@/components/CompanyChat';
import { KeepInView } from '@/components/FinNav';
import { HowTo } from '@/components/HowTo';
import { chooseAction } from '@/components/toast';
import { Empty, Muted } from '@/components/ui';
import { useHubAll, type HubArea, type HubItem } from '@/data/hub';
import { markMessagesRead } from '@/data/inbox';
import { useSites } from '@/data/sites';
import { usePmList } from '@/data/todos';
import { useAuth } from '@/lib/auth';
import { money } from '@/lib/rules/finance';
import { base, page, radius, useTheme } from '@/theme/theme';

type Tab = 'all' | HubArea;
const TABS: [Tab, string][] = [['all', 'Everything'], ['projects', 'Projects'], ['finance', 'Finance'], ['chat', 'Company Chat']];
const AREA: Record<HubArea, string> = { projects: 'Projects', finance: 'Finance', chat: 'Company Chat' };
const DUE = [['all', 'Any Time'], ['overdue', 'Overdue'], ['week', 'Due Within 7 Days'], ['nodate', 'No Due Date']] as const;
const DUE_SHORT: Record<string, string> = { all: 'Any', overdue: 'Overdue', week: '7 Days', nodate: 'None' };
const RED = '#E3262B';

export default function Hub() {
  const { me, org } = useAuth();
  const t = useTheme();
  const qc = useQueryClient();
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  // The tab you tapped; a link with ?tab=… (e.g. from a "tagged you" notification) wins until you tap another.
  const fromLink: Tab = TABS.some(([k]) => k === tabParam) ? (tabParam as Tab) : 'all';
  const [picked, setPicked] = useState<{ link?: string; tab: Tab } | null>(null);
  const tab: Tab = picked && picked.link === tabParam ? picked.tab : fromLink;
  const setTab = (k: Tab) => setPicked({ link: tabParam, tab: k });
  const { data: sites } = useSites();
  const { data: pms } = usePmList();
  const [pm, setPm] = useState('');
  const [site, setSite] = useState('');
  const [due, setDue] = useState<string>('all');
  const [finPick, setFinPick] = useState<string | null>(null); // the Finance tile opened
  const hub = useHubAll(me, org, sites, pm);
  // Coming back from dealing with something: look again, so it has dropped off.
  const first = useRef(true);
  useFocusEffect(useCallback(() => {
    if (first.current) { first.current = false; return; }
    void qc.invalidateQueries({ queryKey: ['hub'] }); void qc.invalidateQueries({ queryKey: ['finOverview'] }); void qc.invalidateQueries({ queryKey: ['companyChatUnread'] });
  }, [qc]));
  if (!me) return null;

  const now = new Date(); const week = new Date(now.getTime() + 7 * 864e5);
  const filtered = hub.items.filter((it) => (!site || it.siteId === site)
    && (due === 'all' || (due === 'overdue' ? !!it.due && it.due < now : due === 'week' ? !!it.due && it.due >= now && it.due <= week : !it.due)));
  const count: Record<Tab, number> = { all: filtered.length, projects: 0, finance: 0, chat: hub.chatUnread };
  filtered.forEach((it) => { if (it.area !== 'chat') count[it.area] += 1; });
  const shown = tab === 'all' ? filtered : filtered.filter((it) => it.area === tab);
  const others = (pms ?? []).filter((p) => p.id !== me.id);
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  const open = async (it: HubItem) => {
    if (it.markRead) { await markMessagesRead(me.id, [it.markRead]); void qc.invalidateQueries({ queryKey: ['hub'] }); }
    if (it.area === 'chat') { setTab('chat'); return; }
    router.push(it.route as never);
  };
  // One line in a list. showType: the small line above saying what it is (left off under a heading that says it).
  const row = (it: HubItem, i: number, showType: boolean) => (
    <Pressable key={it.key} accessibilityRole="button" accessibilityLabel={`${it.typeLbl}: ${it.label}`} onPress={() => void open(it)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderTopWidth: i ? 1 : 0, borderTopColor: '#EEF0F2' }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        {showType && <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '600', color: base.slate }}>{tab === 'all' ? `${AREA[it.area]} · ${it.typeLbl}` : it.typeLbl}</Text>}
        <Text numberOfLines={2} style={{ fontSize: 13.5, fontWeight: '600', color: base.ink, marginTop: showType ? 1 : 0 }}>{it.label}</Text>
        <Text numberOfLines={1} style={{ fontSize: 11.5, color: base.slate, marginTop: 2 }}>{it.siteName}{it.due ? ` · Due ${fmt(it.due)}` : it.at ? ` · ${fmt(it.at)}` : ''}</Text>
      </View>
      {it.amount != null && <Text style={{ fontSize: 13, fontWeight: '600', color: base.ink }}>{money(it.amount)}</Text>}
      <Text style={{ fontSize: 18, color: base.slate }}>›</Text>
    </Pressable>
  );
  const listBox = (items: HubItem[], showType: boolean) => <View style={{ backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: 12, overflow: 'hidden', marginBottom: 10 }}>{items.map((it, i) => row(it, i, showType))}</View>;
  // Groups in the order they first come (the list is soonest-due first). Finance to-dos are a tile each.
  const groups = (items: HubItem[], each?: (it: HubItem) => boolean) => {
    const out: { k: string; l: string; items: HubItem[] }[] = [];
    items.forEach((it) => { const k = each?.(it) ? it.key : it.typeLbl; let g = out.find((x) => x.k === k); if (!g) { g = { k, l: it.typeLbl, items: [] }; out.push(g); } g.items.push(it); });
    return out;
  };
  // Finance: a tile per kind, with how many and what they come to (a Finance to-do already says how many).
  const finTiles = () => {
    const gs = groups(shown, (it) => it.type === 'fin_todo');
    const pickedG = gs.find((g) => g.k === finPick);
    return (
      <>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          {gs.map((g) => {
            const todo = g.items[0].type === 'fin_todo';
            const n = todo ? Number(/\((\d+)\)$/.exec(g.items[0].label)?.[1] || 1) : g.items.length;
            const title = todo ? g.items[0].label.replace(/\s*\(\d+\)$/, '').replace(/\b[a-z]/g, (c) => c.toUpperCase()) : g.l;
            const sum = g.items.reduce((t2, it) => t2 + (it.amount || 0), 0);
            const on = finPick === g.k;
            return (
              <Pressable key={g.k} accessibilityRole="button" accessibilityLabel={`${title}, ${n}`} onPress={() => { if (g.items.length === 1) void open(g.items[0]); else setFinPick(on ? null : g.k); }}
                style={{ flexGrow: 1, flexBasis: '45%', backgroundColor: base.card, borderWidth: on ? 2 : 1, borderColor: on ? base.ink : base.cardLine, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 12, minHeight: 92 }}>
                <Text style={{ fontSize: 22, fontWeight: '700', color: base.ink }}>{n}</Text>
                <Text numberOfLines={2} style={{ fontSize: 12.5, fontWeight: '600', color: base.ink, marginTop: 2 }}>{title}</Text>
                <Text numberOfLines={1} style={{ fontSize: 11.5, color: base.slate, marginTop: 2 }}>{todo ? g.items[0].siteName : sum ? money(sum) : g.items.length === 1 ? g.items[0].siteName : 'Tap to see them'}</Text>
              </Pressable>
            );
          })}
        </View>
        {!!pickedG && listBox(pickedG.items, false)}
      </>
    );
  };
  // Projects: line by line, under a heading for each kind of task.
  const projGroups = () => groups(shown).map((g) => (
    <View key={g.k}>
      <Text style={{ fontSize: 11.5, fontWeight: '700', color: base.slate, letterSpacing: 0.4, marginTop: 4, marginBottom: 6 }}>{g.l.toUpperCase()} ({g.items.length})</Text>
      {listBox(g.items, false)}
    </View>
  ));
  const drop = (label: string, value: string, onPress: () => void) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: base.line, borderRadius: radius.input, backgroundColor: base.card }}>
      <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 12.5, fontWeight: '500', color: base.ink }}>{label}: {value}</Text>
      <Text style={{ fontSize: 10, color: base.slate }}>▼</Text>
    </Pressable>
  );

  const tabs = (
    // Scrolls sideways on a phone, keeping the tab you're on in view.
    <View style={{ borderBottomWidth: 1, borderBottomColor: '#e5e7eb', marginBottom: 10 }}>
    <KeepInView on={tab} items={TABS} render={(k0, l) => {
        const k = k0 as Tab;
        const on = tab === k, n = count[k];
        return (
          <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={`${l}${n ? `, ${n}` : ''}`} onPress={() => setTab(k)}
            style={{ paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 2, borderBottomColor: on ? t.brand1 : 'transparent' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 13, fontWeight: on ? '700' : '600', color: on ? '#111827' : '#6b7280' }}>{l}</Text>
              {/* The counts are red (Andy, 7 Nov 2026). */}
              {n > 0 && <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#fff', backgroundColor: RED, borderRadius: 9, minWidth: 18, textAlign: 'center', paddingHorizontal: 5, paddingVertical: 1, overflow: 'hidden' }}>{n > 99 ? '99+' : n}</Text>}
            </View>
          </Pressable>
        );
      }} />
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'HUB' }} />
      {tab === 'chat' ? (
        <View style={[page(720), { flex: 1, paddingBottom: 10 }]}>
          {tabs}
          <CompanyChat />
        </View>
      ) : (
        <ScrollView contentContainerStyle={page(720)} refreshControl={<RefreshControl refreshing={hub.isRefetching} onRefresh={hub.refetch} />}>
          {tabs}
          <HowTo k="hub" />
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
            {drop('Site', site ? hub.sites.find((s) => s.id === site)?.name ?? 'Site' : 'All', async () => { const k = await chooseAction('Site', [{ key: '', label: 'All Sites' }, ...hub.sites.map((s) => ({ key: s.id, label: s.name }))]); if (k !== null) setSite(k); })}
            {drop('Due', DUE_SHORT[due] ?? 'Any', async () => { const k = await chooseAction('Due', DUE.map(([key, label]) => ({ key, label }))); if (k) setDue(k); })}
            {others.length > 0 && drop('Viewing', pm === '' ? 'Me' : pm === 'all' ? 'All PMs' : others.find((p) => p.id === pm)?.name ?? '', async () => {
              const k = await chooseAction('Viewing', [{ key: '', label: `Me (${me.name})` }, { key: 'all', label: 'All PMs' }, ...others.map((p) => ({ key: p.id, label: p.name }))]);
              if (k !== null) { setPm(k); setSite(''); }
            })}
          </View>
          {/* Finance as tiles; Projects grouped by task; Everything one list (Andy, 7 Nov 2026). */}
          {hub.isLoading ? <Muted>Loading…</Muted> : shown.length ? (
            tab === 'finance' ? finTiles() : tab === 'projects' ? projGroups() : listBox(shown, true)
          ) : <Empty>{tab === 'finance' ? 'Nothing from Finance waiting for you.' : 'Nothing waiting for you here.'}</Empty>}
        </ScrollView>
      )}
    </View>
  );
}
