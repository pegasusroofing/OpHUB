// Price Sheets for a job (400 renderPriceBuilderSheets): tick-box sheets built
// from the company rate card to issue to a subcontractor. PMs and admins see
// drafts and issued sheets and start new ones; anyone else sees the issued
// sheets they're on (managers see every issued one).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { useToast } from '@/components/toast';
import { AssignChips } from '@/components/AssignChips';
import { Button, Card, Empty, Muted } from '@/components/ui';
import { createSheet, listSheets, siteOperatives } from '@/data/priceSheets';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { money } from '@/lib/rules/price';
import { isFullManager, isManager } from '@/lib/roles';
import { base, page, radius, space } from '@/theme/theme';

export default function PriceSheets() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: site } = useSite(id);
  const { data: sheets = [], isLoading } = useQuery({ queryKey: ['priceSheets', id], queryFn: () => listSheets(id) });
  const { data: ops = [] } = useQuery({ queryKey: ['siteOps', id], queryFn: () => siteOperatives(id) });
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [sel, setSel] = useState<string[]>([]);
  if (!me || !site) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const can = isFullManager(me);
  const shown = sheets.filter((s) => can || (isManager(me) && s.status === 'issued') || (s.status === 'issued' && (s.assigned_user_ids || []).includes(me.id)));
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Price Sheets' }} />
      <Muted style={{ marginBottom: 10 }}>{can ? 'Tick-box price sheets built from the company rate card, ready to issue to a subcontractor.' : 'Price sheets issued for this project.'}</Muted>
      {isLoading ? <Muted>Loading…</Muted> : shown.length ? shown.map((s) => (
        <Pressable key={s.id} onPress={() => router.push(`/sites/${id}/price/sheets/${s.id}` as never)}>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '800', color: base.ink }}>{s.title || 'Price'}</Text>
              <Muted>{[s.subcontractor_name, s.total != null ? money(s.total) : ''].filter(Boolean).join(' · ')}</Muted>
            </View>
            <Text style={{ fontWeight: '700', fontSize: 12, color: s.status === 'issued' ? base.ok : base.slate }}>{s.status === 'issued' ? 'Issued' : 'Draft'}</Text>
          </Card>
        </Pressable>
      )) : <Empty>{can ? 'No sheets yet — create your first one below.' : 'Nothing issued yet.'}</Empty>}
      {can && (adding ? (
        <Card>
          <Muted style={{ fontWeight: '700' }}>Title</Muted>
          <TextInput value={title} onChangeText={setTitle} placeholder="Price" style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 9, color: base.ink, marginBottom: 8 }} />
          <Muted style={{ fontWeight: '700', marginBottom: 4 }}>Assign to</Muted>
          <AssignChips ops={ops} sel={sel} onToggle={(u) => setSel(sel.includes(u) ? sel.filter((x) => x !== u) : [...sel, u])} />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <View style={{ flex: 1 }}><Button title="Create" onPress={async () => {
              const sid = await createSheet(me, id, title.trim() || 'Price', sel, ops.filter((o) => sel.includes(o.id)).map((o) => o.name).join(', '));
              if (!sid) { toast('Could not create the sheet — try again.'); return; }
              setAdding(false); setTitle(''); setSel([]); void qc.invalidateQueries({ queryKey: ['priceSheets', id] });
              router.push(`/sites/${id}/price/sheets/${sid}` as never);
            }} /></View>
            <View style={{ flex: 1 }}><Button kind="ghost" title="Cancel" onPress={() => setAdding(false)} /></View>
          </View>
        </Card>
      ) : <Button title="+ New Sheet" onPress={() => setAdding(true)} />)}
    </ScrollView>
  );
}
