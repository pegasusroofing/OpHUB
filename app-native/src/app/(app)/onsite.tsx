// Who's on site right now, by job. Ported from renderOnSiteNow (185).
import { router } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { Card, Empty, Muted, Title } from '@/components/ui';
import { nameOf, usePeople } from '@/data/hs';
import { useOnSiteNow } from '@/data/pmHome';
import { useSites } from '@/data/sites';
import { fullSiteAddress, timeHM } from '@/lib/rules/checkin';
import { base, space } from '@/theme/theme';

const ROLE: Record<string, string> = { site_manager: 'Site manager', pm: 'PM', admin: 'Admin', subcontractor: 'Subcontractor' };

export default function OnSiteNow() {
  const { data: sites = [] } = useSites();
  const { data: rows = [], refetch, isRefetching } = useOnSiteNow(sites);
  const { data: people } = usePeople();
  const bySite: Record<string, typeof rows> = {};
  rows.forEach((r) => { (bySite[r.site_id] ||= []).push(r); });
  const list = Object.keys(bySite).map((id) => sites.find((s) => s.id === id)).filter((s): s is NonNullable<typeof s> => !!s)
    .sort((a, b) => bySite[b.id].length - bySite[a.id].length || a.name.localeCompare(b.name));
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { void refetch(); }} />}>
      <Title>On site now</Title>
      <Muted style={{ marginBottom: 10 }}>{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</Muted>
      <Card>
        <Text style={{ fontSize: 26, fontWeight: '800', color: base.ink }}>{rows.length}</Text>
        <Muted>on site now across {list.length} job{list.length === 1 ? '' : 's'}</Muted>
      </Card>
      {list.length ? list.map((st) => (
        <Card key={st.id} style={{ padding: 0, overflow: 'hidden' }}>
          <Pressable onPress={() => router.push(`/sites/${st.id}/checkin`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: base.paper }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '800', color: base.ink }}>{st.name}</Text>
              <Muted>{fullSiteAddress(st) || ''}</Muted>
            </View>
            <Text style={{ fontWeight: '700', color: base.ok }}>{bySite[st.id].length} on site</Text>
          </Pressable>
          {bySite[st.id].sort((a, b) => a.ts.localeCompare(b.ts)).map((r) => {
            const p = people?.find((x) => x.id === r.user_id);
            return (
              <View key={r.user_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 9, borderTopWidth: 1, borderTopColor: base.line }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: base.ok }} />
                <Text style={{ flex: 1, fontWeight: '600', color: base.ink }}>{nameOf(people, r.user_id)}{p && ROLE[p.role] ? <Text style={{ fontWeight: '400', color: base.slate }}> · {ROLE[p.role]}</Text> : null}</Text>
                <Muted>in since {timeHM(r.ts)}</Muted>
              </View>
            );
          })}
        </Card>
      )) : <Empty>Nobody is checked in on site right now.</Empty>}
    </ScrollView>
  );
}
