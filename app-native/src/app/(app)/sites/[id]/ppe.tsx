// PPE for operatives: My Current PPE, Awaiting Your Signature, Request PPE, My Requests.
// Managers get the PM/admin page (PpeManager). Ported from renderPpe (650).
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { PpeManager } from '@/components/PpeManager';
import { useToast } from '@/components/toast';
import { useSite } from '@/data/sites';
import { Button, Card, Empty, Field, Muted, SectionTitle } from '@/components/ui';
import { DateField, todayIso } from '@/components/DateField';
import { nameOf, usePeople } from '@/data/hs';
import { requestPpe, signPpe, useMyPpe } from '@/data/ppe';
import { useAuth } from '@/lib/auth';
import { cap1, currentPpe, PPE_STANDARD_ITEMS } from '@/lib/rules/ppe';
import { isManager } from '@/lib/roles';
import { base, page, space } from '@/theme/theme';

const longDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

export default function Ppe() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useMyPpe();
  const { data: site } = useSite(id);
  const { data: people } = usePeople();
  const [open, setOpen] = useState(false);
  const [item, setItem] = useState('');
  const [custom, setCustom] = useState('');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  if (isManager(me)) return site ? <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled"><Stack.Screen options={{ title: 'PPE' }} /><PpeManager site={site} /></ScrollView> : <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['myPpe'] }); void qc.invalidateQueries({ queryKey: ['hsSummary'] }); };
  const mine = data ? currentPpe(data.issuances, me.id) : [];
  const pending = (data?.issuances ?? []).filter((i) => i.status === 'pending_signature');

  const submit = async () => {
    const name = item === '__other' ? custom.trim() : item;
    if (!name) { toast('Choose or type an item.'); return; }
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) { toast('Date needed should look like 2026-11-03.'); return; }
    setBusy(true);
    const err = await requestPpe(me, id, name, date.trim() || null);
    setBusy(false);
    if (err) { toast(err); return; }
    toast('Request sent'); setOpen(false); setItem(''); setCustom(''); setDate(''); refresh();
  };

  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: 'PPE' }} />
      {isLoading ? <Muted>Loading…</Muted> : (
        <>
          <SectionTitle>My Current PPE</SectionTitle>
          <Card>
            {mine.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {mine.map((x) => <Text key={x} style={{ backgroundColor: base.paper, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, overflow: 'hidden', color: base.ink, fontWeight: '600' }}>{x}</Text>)}
              </View>
            ) : <Empty>Nothing issued yet.</Empty>}
          </Card>

          {pending.length > 0 && <SectionTitle>Awaiting Your Signature</SectionTitle>}
          {pending.map((i) => (
            <Card key={i.id}>
              <Text style={{ fontWeight: '700', color: base.ink }}>{(i.items || []).join(', ')}</Text>
              <Muted>Issued {longDate(i.issued_at)} by {nameOf(people, i.issued_by)}</Muted>
              <Button title="I confirm receipt of this PPE — Sign" onPress={async () => {
                const r = await signPpe(me, i.id);
                toast(r.msg);
                if (r.needSignature) router.push('/signature');
                if (r.ok) refresh();
              }} />
            </Card>
          ))}

          <SectionTitle>Request PPE</SectionTitle>
          {open ? (
            <Card>
              <Muted style={{ fontWeight: '700', marginBottom: 6 }}>Item</Muted>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {[...PPE_STANDARD_ITEMS, '__other'].map((x) => (
                  <Pressable key={x} onPress={() => setItem(x)} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: item === x ? base.ink : base.line, backgroundColor: item === x ? base.ink : base.card }}>
                    <Text style={{ fontWeight: '700', color: item === x ? '#fff' : base.ink }}>{x === '__other' ? 'Other…' : x}</Text>
                  </Pressable>
                ))}
              </View>
              {item === '__other' && <Field label="Item name" value={custom} onChangeText={setCustom} />}
              <DateField label="Date needed (optional)" value={date} onChange={setDate} min={todayIso()} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}><Button busy={busy} title="Submit Request" onPress={submit} /></View>
                <View style={{ flex: 1 }}><Button kind="ghost" title="Cancel" onPress={() => setOpen(false)} /></View>
              </View>
            </Card>
          ) : <Button title="+ Request PPE" onPress={() => setOpen(true)} />}

          {(data?.requests ?? []).length > 0 && <SectionTitle>My Requests</SectionTitle>}
          {(data?.requests ?? []).map((r) => (
            <Card key={r.id} style={{ paddingVertical: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontWeight: '800', color: base.ink }}>{r.item_name}</Text>
                <Text style={{ fontWeight: '700', color: r.status === 'fulfilled' ? base.ok : r.status === 'cancelled' ? base.slate : base.warn }}>{cap1(r.status)}</Text>
              </View>
              <Muted>{r.date_needed ? `Needed by ${longDate(`${r.date_needed}T00:00:00`)}` : 'No date given'}</Muted>
            </Card>
          ))}
        </>
      )}
    </ScrollView>
  );
}
