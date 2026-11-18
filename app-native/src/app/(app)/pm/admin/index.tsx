// Admin Centre (260 renderTeam). Andy, 18 Nov 2026: "Can we make the admin centre more of the feel and layout from
// finance, it feels a bit heavy". As Finance: a row of underlined tabs (People · Libraries · Company), the tab's items
// under it as plain rows in light groups (no icon squares), and a 🔍 across every section you can open. Who you are,
// your signature and the Finance switch are in Settings; Sign Out is in Settings and the menu; the Set-Up Guide is the
// last row under Company.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { reopenGuide } from '@/components/AdminGuide';
import { KeepInView, TabItem } from '@/components/FinNav';
import { ListGroup, PlainRow } from '@/components/ListRows';
import { OphIcon } from '@/components/OphIcon';
import { useToast } from '@/components/toast';
import { Muted } from '@/components/ui';
import { ADMIN_PAGES, searchItems, visibleItems, type AdminItem, type AdminPage } from '@/lib/adminItems';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { base, page as pageStyle, radius, space } from '@/theme/theme';

export default function AdminCentre() {
  const { me, org, refresh } = useAuth();
  const toast = useToast();
  const { page } = useLocalSearchParams<{ page?: AdminPage }>();
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<AdminPage | null>(null);
  if (!me) return null;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  const open = (i: AdminItem) => (i.route ? router.push(i.route as never) : toast(`${i.label} is still in the current app for now.`));
  const items = visibleItems(me, org);
  const tabs = (Object.keys(ADMIN_PAGES) as AdminPage[]).filter((k) => ADMIN_PAGES[k].show(me));
  const tab: AdminPage = picked ?? (page && tabs.includes(page) ? page : tabs[0]);
  const mine = items.filter((i) => i.page === tab);
  const groups = [...new Set(mine.map((i) => i.group))];
  const hits = searchItems(me, org, q);
  const row = (i: AdminItem, n: number, all: AdminItem[], sub?: string) => (
    <PlainRow key={i.key} label={i.label} sub={sub ?? (i.route ? i.sub : `${i.sub} · current app for now`)} onPress={() => open(i)} last={n === all.length - 1} />
  );
  return (
    <ScrollView contentContainerStyle={[pageStyle(720), { paddingTop: 0 }]} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Admin Centre' }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, marginBottom: 12 }}>
        <View style={{ flex: 1, minWidth: 0, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
          <KeepInView on={tab} items={tabs.map((k) => [k, ADMIN_PAGES[k].label] as [string, string])}
            render={(k, l) => <TabItem on={!q.trim() && k === tab} label={l} onPress={() => { setPicked(k as AdminPage); setQ(''); setSearching(false); }} />} />
        </View>
        <Pressable onPress={() => { setSearching(!searching); setQ(''); }} hitSlop={8} accessibilityLabel={searching ? 'Close search' : 'Search'} style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}>
          {searching ? <Text style={{ color: base.ink, fontSize: 15 }}>✕</Text> : <OphIcon name="search" size={18} color={base.ink} />}
        </Pressable>
      </View>
      {searching && (
        <TextInput autoFocus value={q} onChangeText={setQ} placeholder="Search settings, libraries, people…" accessibilityLabel="Search the Admin Centre"
          style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card, marginBottom: 10 }} />
      )}
      {q.trim() ? (
        <>
          <Muted style={{ marginBottom: 10 }}>{hits.length} result{hits.length === 1 ? '' : 's'}</Muted>
          {hits.length ? <ListGroup first>{hits.map((i, n) => row(i, n, hits, `${ADMIN_PAGES[i.page].label}${i.group ? ` › ${i.group}` : ''}`))}</ListGroup> : <Muted>Nothing matches &quot;{q.trim()}&quot;.</Muted>}
        </>
      ) : groups.length ? groups.map((g, k) => {
        const list = mine.filter((i) => i.group === g);
        const guide = tab === 'company' && me.role === 'admin' && k === groups.length - 1;
        return (
          <ListGroup key={g} title={g} first={!k}>
            {list.map((i, n) => row(i, n, guide ? [...list, i] : list))}
            {guide && <PlainRow label="Set-Up Guide" sub="The steps for setting OpHUB up, on Home" last onPress={async () => { await reopenGuide(me); await refresh(); router.push('/home' as never); }} />}
          </ListGroup>
        );
      }) : <Muted>Nothing here for your role.</Muted>}
    </ScrollView>
  );
}
