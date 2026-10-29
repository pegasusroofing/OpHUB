// Sites map page (125 renderSiteMapPage): Live / Upcoming / Closed switches and
// the list of projects beside the map (tap one to fly to it); projects with no
// postcode are listed underneath. Website only, like the current app.
import { router, Stack } from 'expo-router';
import { useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { SitesMapView, type MapHandle } from '@/components/SitesMap';
import { Muted } from '@/components/ui';
import { usePeople } from '@/data/hs';
import { useSites } from '@/data/sites';
import { MAP_COLOURS, type MapPoint } from '@/lib/sitesMap';
import { base, page, useDesk } from '@/theme/theme';

const LABEL: Record<string, string> = { live: 'Live', upcoming: 'Upcoming', closed: 'Closed' };

export default function SiteMapPage() {
  const desk = useDesk();
  const { data: sites } = useSites();
  const { data: people } = usePeople();
  const [show, setShow] = useState<Record<string, boolean>>({ live: true, upcoming: true, closed: false });
  const [pp, setPp] = useState<{ pts: MapPoint[]; missing: MapPoint[] } | null>(null);
  const map = useRef<MapHandle | null>(null);
  if (Platform.OS !== 'web') return <Muted style={{ padding: 20 }}>The sites map is on the website.</Muted>;
  const vis = (pp?.pts ?? []).filter((p) => show[p.st]).sort((a, b) => a.s.name.localeCompare(b.s.name));
  const miss = (pp?.missing ?? []).filter((p) => show[p.st]);
  const dot = (st: string, dim?: boolean) => <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: MAP_COLOURS[st], opacity: dim ? 0.35 : 1 }} />;
  const side = (
    <View style={[{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#ECEEF2', borderRadius: 16, padding: 12 }, desk ? { width: 280, height: '100%' } : { marginBottom: 12 }]}>
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {(['live', 'upcoming', 'closed'] as const).map((k) => (
          <Pressable key={k} onPress={() => setShow({ ...show, [k]: !show[k] })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: show[k] ? base.ink : '#E2E3E7' }}>
            {dot(k, !show[k])}<Text style={{ fontSize: 12, fontWeight: '700', color: show[k] ? base.ink : '#7A7E87' }}>{LABEL[k]}</Text>
          </Pressable>
        ))}
      </View>
      <ScrollView style={desk ? { flex: 1 } : { maxHeight: 260 }}>
        {!pp ? <Muted>Loading…</Muted> : !vis.length && !miss.length ? <Muted>No sites to show.</Muted> : null}
        {vis.map((p) => (
          <Pressable key={p.s.id} onPress={() => map.current?.focus(p.s.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: 10 }}>
            {dot(p.st)}
            <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '700', color: base.ink }}>{p.s.name}</Text><Text style={{ fontSize: 11, color: base.slate }}>{p.pc}</Text></View>
          </Pressable>
        ))}
        {!!miss.length && <Text style={{ marginTop: 12, marginHorizontal: 8, marginBottom: 4, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', color: '#9A9DA4' }}>No postcode found ({miss.length})</Text>}
        {miss.map((p) => (
          <Pressable key={p.s.id} onPress={() => router.push(`/sites/${p.s.id}` as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: 10, opacity: 0.7 }}>
            {dot(p.st)}
            <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '700', color: base.ink }}>{p.s.name}</Text><Text style={{ fontSize: 11, color: base.slate }}>Add a postcode to show it</Text></View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
  const mapBox = (
    <View style={[{ borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#ECEEF2' }, desk ? { flex: 1 } : {}]}>
      {sites && <SitesMapView sites={sites} show={show} people={people} onPoints={setPp} handle={(h) => { map.current = h; }} height={desk ? '100%' : 420} />}
    </View>
  );
  return (
    <View style={[page(1200), { flex: 1 }]}>
      <Stack.Screen options={{ title: 'Sites map' }} />
      {desk ? <View style={{ flex: 1, flexDirection: 'row', gap: 16, minHeight: 480 }}>{side}{mapBox}</View> : <ScrollView>{side}{mapBox}</ScrollView>}
    </View>
  );
}
