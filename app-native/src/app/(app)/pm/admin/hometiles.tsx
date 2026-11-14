// Admin Centre › Company › Home Page, company admins only (Andy, 14 Nov 2026: "make this customisable for the company
// admin in settings as they may not want pm's etc seeing finance tiles (this transfers to phone and laptop)"). Yes / No
// for each kind of person: do they see the money on Home (the Due In figure and the OpHUB Finance tile)? Company
// admins always do, and only people with Finance switched on ever do. Saved on the company, so phone and laptop match.
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { YesNo } from '@/components/OneDriveSettings';
import { useToast } from '@/components/toast';
import { Button, Card, Muted } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { HOME_TILE_ASKS, type HomeTiles } from '@/lib/homeTiles';
import { supabase } from '@/lib/supabase';
import { base, page, space } from '@/theme/theme';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

export default function HomeTilesSettings() {
  const { me, org, refresh } = useAuth();
  const toast = useToast();
  const [v, setV] = useState<HomeTiles>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { setV(org?.home_tiles ?? {}); }, [org?.home_tiles]);
  if (!me) return null;
  if (me.role !== 'admin') return <Muted style={{ padding: space.l }}>Company admins only.</Muted>;
  const save = async () => {
    setBusy(true);
    const next: HomeTiles = Object.fromEntries(HOME_TILE_ASKS.map(({ k }) => [k, v[k] !== false]));
    const r = await db.from('organizations').update({ home_tiles: next } as never).eq('id', me.org_id as string).select('id');
    setBusy(false);
    if (r.error || !(r.data as unknown[] | null)?.length) { toast('Could not save — try again.'); return; }
    await refresh();
    router.back();
  };
  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: 'Home Page' }} />
      <Card>
        <Text style={{ fontSize: 15, fontWeight: '600', color: base.ink, marginBottom: 4 }}>Finance On Home</Text>
        <Muted style={{ marginBottom: 12 }}>The money owed to you (Due In) and the OpHUB Finance tile on the Home page, on phones and laptops. Company admins always see them, and only people with Finance switched on ever do.</Muted>
        {HOME_TILE_ASKS.map(({ k, q }) => (
          <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#EEF0F2' }}>
            <Text style={{ flex: 1, fontSize: 14, fontWeight: '500', color: base.ink }}>{q}</Text>
            <YesNo label={q} value={v[k] !== false} onChange={(x) => setV({ ...v, [k]: x })} />
          </View>
        ))}
        <View style={{ marginTop: 12 }}><Button busy={busy} title="Save" onPress={() => void save()} /></View>
      </Card>
    </ScrollView>
  );
}
