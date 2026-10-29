// Admin Centre (260 renderTeam): the front page is the current app's hub —
// Users & invites, Libraries, Main Contractor, Company and Integrations by
// project — with a search (🔍) across every section you can open. Each hub
// entry opens its section page (?page=people / libraries / company): that
// section's items in groups, as rows with a tinted line icon.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { ListGroup, ListRow } from '@/components/ListRows';
import { OphIcon } from '@/components/OphIcon';
import { useToast } from '@/components/toast';
import { Muted, TINTS } from '@/components/ui';
import { ADMIN_PAGES, searchItems, visibleItems, type AdminItem, type AdminPage } from '@/lib/adminItems';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { base, page as pageStyle, radius, space } from '@/theme/theme';

// Line icons and tints for each item (260 ADMIN_ICON / ADMIN_TINT).
const ICON: Record<string, string> = { finance: 'pound', subapplications: 'building', branding: 'brush', expensesemail: 'mail', onedrive: 'cloud', reporttemplates: 'reports', signtemplates: 'pen', sowlibrary: 'layers', ratecard: 'pound', suppliers: 'store', maincontractor: 'building', hspolicy: 'book', havstools: 'wrench', ramslibrary: 'shield', coshhbuilder: 'flask', tbt: 'chat', ppelog: 'shield', invites: 'mail', users: 'users', devicelocks: 'phone', checkinlogs: 'pin', drivercheckins: 'truck' };
const TINT: Record<AdminPage, keyof typeof TINTS> = { company: 'grey', libraries: 'green', people: 'blue' };

const Row = ListRow;
const Group = ListGroup;

export default function AdminCentre() {
  const { me, org } = useAuth();
  const toast = useToast();
  const { page } = useLocalSearchParams<{ page?: AdminPage }>();
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  if (!me) return null;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  const open = (i: AdminItem) => (i.route ? router.push(i.route as never) : toast(`${i.label} is still in the current app for now.`));
  const itemRow = (i: AdminItem, n: number, all: AdminItem[], sub?: string) => (
    <Row key={i.key} icon={ICON[i.key] || 'list'} tint={TINT[i.page]} label={i.label} sub={sub ?? (i.route ? i.sub : `${i.sub} · current app for now`)} onPress={() => open(i)} last={n === all.length - 1} />
  );
  const items = visibleItems(me, org);

  // A section page: its items in their groups.
  if (page && ADMIN_PAGES[page]?.show(me)) {
    const mine = items.filter((i) => i.page === page);
    const groups = [...new Set(mine.map((i) => i.group))];
    return (
      <ScrollView contentContainerStyle={pageStyle(720)}>
        <Stack.Screen options={{ title: ADMIN_PAGES[page].label }} />
        {groups.length ? groups.map((g, k) => {
          const list = mine.filter((i) => i.group === g);
          return <Group key={g} title={g} first={!k}>{list.map((i, n) => itemRow(i, n, list))}</Group>;
        }) : <Muted>Nothing here for your role.</Muted>}
      </ScrollView>
    );
  }

  const hits = searchItems(me, org, q);
  const mc = items.find((i) => i.key === 'maincontractor');
  const od = items.find((i) => i.key === 'onedrive');
  const go = (p: AdminPage) => () => router.push(`/pm/admin?page=${p}` as never);
  return (
    <ScrollView contentContainerStyle={pageStyle(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Admin Centre' }} />
      {searching || q ? (
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 10 }}>
          <TextInput autoFocus value={q} onChangeText={setQ} placeholder="Search settings, libraries, people…" style={{ flex: 1, borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card }} />
          <Pressable onPress={() => { setSearching(false); setQ(''); }} hitSlop={8} accessibilityLabel="Close search" style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: base.card, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: base.ink }}>✕</Text></Pressable>
        </View>
      ) : (
        <View style={{ alignItems: 'flex-end', marginTop: -4, marginBottom: 2 }}>
          <Pressable onPress={() => setSearching(true)} hitSlop={8} accessibilityLabel="Search" style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' }}><OphIcon name="search" size={19} color={base.ink} /></Pressable>
        </View>
      )}
      {q.trim() ? (
        <>
          <Muted style={{ marginBottom: 8 }}>{hits.length} result{hits.length === 1 ? '' : 's'}</Muted>
          {hits.length ? <Group first>{hits.map((i, n) => itemRow(i, n, hits, `${ADMIN_PAGES[i.page].label}${i.group ? ` › ${i.group}` : ''}`))}</Group> : <Muted>Nothing matches &quot;{q.trim()}&quot;.</Muted>}
        </>
      ) : (
        <>
          {ADMIN_PAGES.people.show(me) && <Group title="People" first><Row icon="admin" tint="blue" label="Users & invites" sub="Invites, roles, device locks, check-in logs" onPress={go('people')} last /></Group>}
          {(ADMIN_PAGES.libraries.show(me) || mc) && (
            <Group title="Libraries">
              {ADMIN_PAGES.libraries.show(me) && <Row icon="book" tint="green" label="Libraries" sub="Report templates, RAMS, COSHH, SOW, rates, suppliers" onPress={go('libraries')} last={!mc} />}
              {mc && <Row icon="building" tint="green" label="Main Contractor" sub="Subcontractors and inspection templates" onPress={() => open(mc)} last />}
            </Group>
          )}
          {ADMIN_PAGES.company.show(me) && (
            <Group title="Company">
              <Row icon="brush" tint="grey" label="Company" sub="Logo, theme, integrations" onPress={go('company')} last={!od} />
              {od && <Row icon="cloud" tint="grey" label="Integrations by project" sub="What each project can sync, and set it up" onPress={() => open(od)} last />}
            </Group>
          )}
        </>
      )}
    </ScrollView>
  );
}
