// Admin Centre (260 renderTeam): People, Libraries and Company, grouped like the
// current app, with a search across every section you can open. Sections not
// yet in the new app say so.
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { useToast } from '@/components/toast';
import { Muted, SectionTitle } from '@/components/ui';
import { ADMIN_PAGES, searchItems, visibleItems, type AdminItem, type AdminPage } from '@/lib/adminItems';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { base, radius, space } from '@/theme/theme';

export default function AdminCentre() {
  const { me, org } = useAuth();
  const toast = useToast();
  const [q, setQ] = useState('');
  if (!me) return null;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  const open = (i: AdminItem) => (i.route ? router.push(i.route as never) : toast(`${i.label} is still in the current app for now.`));
  const row = (i: AdminItem) => (
    <Pressable key={i.key} onPress={() => open(i)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderBottomWidth: 1, borderBottomColor: base.line }}>
      <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: base.paper, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 18 }}>{i.icon}</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: '700', color: base.ink }}>{i.label}</Text>
        <Muted>{i.route ? i.sub : `${i.sub} · current app for now`}</Muted>
      </View>
      <Text style={{ color: base.slate, fontSize: 18 }}>›</Text>
    </Pressable>
  );
  const hits = searchItems(me, org, q);
  const items = visibleItems(me, org);
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Admin Centre' }} />
      <TextInput value={q} onChangeText={setQ} placeholder="Search settings, libraries, people…" style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card, marginBottom: 12 }} />
      {q.trim() ? (hits.length ? <View style={{ backgroundColor: base.card, borderRadius: 16, borderWidth: 1, borderColor: base.cardLine }}>{hits.map(row)}</View> : <Muted>Nothing matches "{q.trim()}".</Muted>) : (
        (Object.keys(ADMIN_PAGES) as AdminPage[]).filter((p) => ADMIN_PAGES[p].show(me)).map((p) => {
          const mine = items.filter((i) => i.page === p);
          if (!mine.length) return null;
          const groups = [...new Set(mine.map((i) => i.group))];
          return (
            <View key={p}>
              <SectionTitle>{ADMIN_PAGES[p].icon} {ADMIN_PAGES[p].label}</SectionTitle>
              {groups.map((g) => (
                <View key={g} style={{ marginBottom: 10 }}>
                  <Muted style={{ fontWeight: '700', marginBottom: 4 }}>{g}</Muted>
                  <View style={{ backgroundColor: base.card, borderRadius: 16, borderWidth: 1, borderColor: base.cardLine, overflow: 'hidden' }}>{mine.filter((i) => i.group === g).map(row)}</View>
                </View>
              ))}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}
