// Variations: Live / Closed, approval status, photo, decline reason and Raise a variation
// (photo required). Managers also approve/decline/modify, set the value (PMs/admins),
// add to the Schedule of Works, close and delete. Ported from renderVariations (800).
import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { StorageImage } from '@/components/StorageImage';
import { showAlert, useToast } from '@/components/toast';
import { VariationManagerActions } from '@/components/VariationManagerActions';
import { Button, Card, Empty, Muted, SectionTitle } from '@/components/ui';
import { nameOf, usePeople } from '@/data/hs';
import { useSite } from '@/data/sites';
import { approvalLabel, raiseVariation, useManagerVariations } from '@/data/variations';
import { useAuth } from '@/lib/auth';
import { pickPhotos, type Picked } from '@/lib/photos';
import { money, readMoney, valueOf } from '@/lib/rules/variations';
import { isFinanceUser, isFullManager, isManager } from '@/lib/roles';
import { base, radius, space } from '@/theme/theme';

const d = (t: string | null) => (t ? new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '');

export default function Variations() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: site } = useSite(id);
  const [filter, setFilter] = useState<'live' | 'closed'>('live');
  const mgr = !!me && isManager(me);
  const canPrice = isFullManager(me);
  const { data: list, isLoading } = useManagerVariations(id, filter, mgr && (canPrice || isFinanceUser(me, org)));
  const { data: people } = usePeople();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [photo, setPhoto] = useState<Picked | null>(null);
  const [desc, setDesc] = useState('');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  if (!me || !site) return <Muted style={{ padding: space.l }}>Loading…</Muted>;

  const submit = async () => {
    if (!photo) return;
    const n = canPrice ? readMoney(value) : null;
    if (Number.isNaN(n as number)) { toast('Enter the value as a number, e.g. 850'); return; }
    setBusy(true);
    const err = await raiseVariation(me, site, photo, desc.trim(), n);
    setBusy(false);
    if (err) { toast(err); return; }
    toast('Variation submitted'); setPhoto(null); setDesc(''); setValue('');
    void qc.invalidateQueries({ queryKey: ['variations', id] }); void qc.invalidateQueries({ queryKey: ['snagFolder', id] });
  };

  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Variations' }} />
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        {([['live', 'Live'], ['closed', 'Closed']] as const).map(([k, l]) => (
          <Pressable key={k} onPress={() => setFilter(k)} style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: filter === k ? base.ink : base.line, backgroundColor: filter === k ? base.ink : base.card }}>
            <Text style={{ fontWeight: '700', color: filter === k ? '#fff' : base.ink }}>{l}</Text>
          </Pressable>
        ))}
      </View>
      {isLoading ? <Muted>Loading…</Muted> : list?.length ? list.map((v) => {
        const isOpen = open.has(v.id);
        const col = v.approval_status === 'approved' ? base.ok : v.approval_status === 'declined' ? base.red : base.warn;
        return (
          <View key={v.id}>
            <Pressable onPress={() => { const n = new Set(open); if (isOpen) n.delete(v.id); else n.add(v.id); setOpen(n); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, padding: 12, marginBottom: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: base.ink }}>{v.description}</Text>
                <Muted>{nameOf(people, v.created_by)} · {d(v.created_at)}</Muted>
              </View>
              {valueOf(v.cost_impact) != null && <Text style={{ fontSize: 11, fontWeight: '700', color: base.ink }}>{money(valueOf(v.cost_impact) as number)}</Text>}
              {v.status !== 'closed' && <Text style={{ fontSize: 11, fontWeight: '700', color: col, borderWidth: 1, borderColor: col, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 }}>{approvalLabel(v)}</Text>}
              <Text style={{ color: base.slate }}>{isOpen ? '▼' : '▶'}</Text>
            </Pressable>
            {isOpen && (
              <Card>
                {!!v.photo_path && <StorageImage bucket="site-photos" path={v.photo_path} style={{ width: 120, height: 120, borderRadius: 8 }} />}
                {v.approval_status === 'declined' && !!v.decline_reason && <Text style={{ color: base.red, marginTop: 6 }}>Reason: {v.decline_reason}</Text>}
                {v.status === 'closed' && <Muted style={{ marginTop: 6 }}>Closed{v.closed_at ? ` · ${d(v.closed_at)}` : ''}</Muted>}
                {mgr && <VariationManagerActions v={v} siteId={id} onChanged={() => { void qc.invalidateQueries({ queryKey: ['variations', id] }); void qc.invalidateQueries({ queryKey: ['sow', id] }); }} />}
              </Card>
            )}
          </View>
        );
      }) : <Empty>No {filter} variations.</Empty>}

      {filter !== 'closed' && (
        <Card style={{ marginTop: 14 }}>
          <SectionTitle>Raise a variation</SectionTitle>
          <Muted style={{ fontWeight: '700', marginBottom: 6 }}>Photo evidence</Muted>
          <Pressable onPress={async () => { const p = await pickPhotos('camera', false); if ('error' in p) showAlert(p.error); else if (p[0]) setPhoto(p[0]); }}
            style={{ borderWidth: 1.5, borderStyle: 'dashed', borderColor: base.line, borderRadius: radius.input, minHeight: 90, alignItems: 'center', justifyContent: 'center', marginBottom: 10, overflow: 'hidden' }}>
            {photo ? <Image source={{ uri: photo.uri }} style={{ width: '100%', height: 160 }} resizeMode="cover" /> : <Text style={{ color: base.slate }}>📷 Tap to add a photo</Text>}
          </Pressable>
          <Muted style={{ fontWeight: '700', marginBottom: 6 }}>Description</Muted>
          <TextInput multiline value={desc} onChangeText={setDesc} placeholder="What's changed and why..."
            style={{ minHeight: 70, borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, marginBottom: 6 }} />
          {canPrice && (<>
            <Muted style={{ fontWeight: '700', marginBottom: 6 }}>Value to the client (£, ex VAT) — optional</Muted>
            <TextInput value={value} onChangeText={setValue} keyboardType="decimal-pad" placeholder="e.g. 850"
              style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, marginBottom: 6 }} />
          </>)}
          <Button disabled={!photo} busy={busy} title="Submit Variation" onPress={submit} />
        </Card>
      )}
      <Muted style={{ marginTop: space.m }}>PDF export of variations comes with the PM screens.</Muted>
    </ScrollView>
  );
}
