// Admin Centre (260 renderTeam). Andy, 18 Nov 2026, three goes in one day:
// - "Can we make the admin centre more of the feel and layout from finance, it feels a bit heavy";
// - "keep tab style but add into the main admin tabs for finance settings, then a project settings etc":
//   People · Projects · Finance · H&S · Company (lib/adminItems);
// - "can we make the admin centre more tab style please and sub tabs": each tab's pages are a second row of tabs,
//   and the page chosen opens straight under them (components/AdminTabs, drawn by the top bar).
// So this address opens a page: the tab asked for (?page=), else the last tab and page used, else the first. With
// ?search=1 (the 🔍 by the sub tabs) it finds any page you can open.
import { Redirect, router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, TextInput } from 'react-native';

import { adminStart } from '@/components/AdminTabs';
import { ListGroup, PlainRow } from '@/components/ListRows';
import { Muted } from '@/components/ui';
import { ADMIN_PAGES, searchItems } from '@/lib/adminItems';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { base, page as pageStyle, radius, space } from '@/theme/theme';

export default function AdminCentre() {
  const { me, org } = useAuth();
  const { page, search } = useLocalSearchParams<{ page?: string; search?: string }>();
  const [q, setQ] = useState('');
  if (!me) return null;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  if (!search) {
    const to = adminStart(me, org, typeof page === 'string' ? page : undefined);
    return to ? <Redirect href={to as never} /> : <Muted style={{ padding: space.l }}>Nothing here for your role.</Muted>;
  }
  const hits = searchItems(me, org, q);
  return (
    <ScrollView contentContainerStyle={pageStyle(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Admin Centre' }} />
      <TextInput autoFocus value={q} onChangeText={setQ} placeholder="Search settings, libraries, people…" accessibilityLabel="Search the Admin Centre"
        style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card, marginBottom: 10 }} />
      {q.trim() ? (
        <>
          <Muted style={{ marginBottom: 10 }}>{hits.length} result{hits.length === 1 ? '' : 's'}</Muted>
          {hits.length
            ? <ListGroup first>{hits.map((i, n) => <PlainRow key={i.key} label={i.label} sub={`${ADMIN_PAGES[i.page].label}${i.group ? ` › ${i.group}` : ''}`} onPress={() => { if (i.route) router.replace(i.route as never); }} last={n === hits.length - 1} />)}</ListGroup>
            : <Muted>Nothing matches &quot;{q.trim()}&quot;.</Muted>}
        </>
      ) : <Muted>Type a word, such as VAT, Roles or RAMS.</Muted>}
    </ScrollView>
  );
}
