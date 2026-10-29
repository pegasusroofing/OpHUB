// LOLER Inspections (750): thorough examination of lifting equipment, on the report
// engine. Managers start one for a Plant register item (its make/model, description
// and serial are filled in) or a one-off typed name; completing it moves that plant
// item's last / next inspection dates on. Shown to whoever the job's tile setting allows.
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { useToast } from '@/components/toast';
import { Button, Card, Empty, Muted } from '@/components/ui';
import { nameOf, usePeople } from '@/data/hs';
import { startLoler, useLoler, usePlantItems, type PlantItem } from '@/data/reports';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { REPORT_STATUS_LABEL } from '@/lib/rules/reports';
import { isManager } from '@/lib/roles';
import { base, page, radius, space } from '@/theme/theme';

export default function Loler() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: site } = useSite(id);
  const { data, isLoading } = useLoler(id, me?.org_id);
  const [picker, setPicker] = useState<null | 'start' | 'plant'>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const { data: plant } = usePlantItems(me?.org_id, picker === 'plant');
  const { data: people } = usePeople();
  if (!me || !site) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const mgr = isManager(me);
  const t = data?.template ?? null;

  const start = async (item: PlantItem | null, manual: string | null) => {
    if (!t) return;
    setBusy(true); const sid = await startLoler(me, site, t, item, manual); setBusy(false);
    if (!sid) { toast('Could not start — check your signal and try again.'); return; }
    toast('LOLER inspection started'); setPicker(null); setName('');
    void qc.invalidateQueries({ queryKey: ['loler', id] });
    router.push(`/sites/${id}/hs/loler/fill/${sid}` as never);
  };

  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'LOLER Inspections' }} />
      {mgr && <Button title={picker ? 'Cancel' : '+ New LOLER Inspection'} onPress={() => setPicker(picker ? null : 'start')} />}
      {mgr && picker && (
        <Card>
          {!t ? <Empty>No LOLER Inspection template yet — ask an Admin to set one up via Report Templates.</Empty> : picker === 'start' ? (
            <>
              <Muted style={{ marginBottom: 8 }}>Pick the plant item this inspection is for:</Muted>
              <Button kind="ghost" title="Choose From Plant Register" onPress={() => setPicker('plant')} />
              <TextInput value={name} onChangeText={setName} placeholder="Or type a one-off item name" style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, marginVertical: 8 }} />
              <Button busy={busy} title="Start Inspection With This Name" onPress={() => { if (!name.trim()) { toast('Type an item name first, or choose from the Plant Register.'); return; } void start(null, name.trim()); }} />
            </>
          ) : (
            <>
              <Muted style={{ marginBottom: 8 }}>Select an item:</Muted>
              {(plant ?? []).map((p) => (
                <Pressable key={p.id} disabled={busy} onPress={() => void start(p, null)} style={{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: base.line }}>
                  <Text style={{ fontWeight: '700', color: base.ink }}>{p.name}</Text>
                  {!!p.serial_number && <Muted>{p.serial_number}</Muted>}
                </Pressable>
              ))}
              {plant && !plant.length && <Empty>No items in the plant register yet.</Empty>}
              <Button kind="ghost" title="Back" onPress={() => setPicker('start')} />
            </>
          )}
        </Card>
      )}
      {isLoading ? <Muted>Loading…</Muted> : data?.subs.length ? data.subs.map((s) => (
        <Pressable key={s.id} onPress={() => router.push(`/sites/${id}/hs/loler/${mgr && s.status === 'in_progress' ? 'fill' : 'view'}/${s.id}` as never)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginTop: 8, backgroundColor: base.card }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', color: base.ink }}>{String(s.answers?.loler_make_model || s.template_name)}</Text>
            <Muted>{s.status === 'in_progress' ? 'Started' : `Submitted ${s.submitted_at ? new Date(s.submitted_at).toLocaleString('en-GB') : ''}`} · {nameOf(people, s.submitted_by)}</Muted>
          </View>
          <Text style={{ fontSize: 11.5, fontWeight: '700', color: s.status === 'in_progress' ? base.warn : base.ok }}>{REPORT_STATUS_LABEL[s.status] || s.status}</Text>
        </Pressable>
      )) : <Empty>No LOLER inspections logged yet{t ? '.' : ' — set up a template first.'}</Empty>}
    </ScrollView>
  );
}
