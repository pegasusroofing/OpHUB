// Book Time Off. Ported from 9219zz-driver-time-off.js: one day or a range, optional
// note; booked days listed with remove. The database also refuses deliveries on a
// driver's day off (delivery_driver_off_check).
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useToast } from '@/components/toast';
import { Button, Card, Empty, Field, Muted, SectionTitle } from '@/components/ui';
import { DateField, todayIso } from '@/components/DateField';
import { bookTimeOff, removeTimeOff, useTimeOff } from '@/data/driver';
import { useAuth } from '@/lib/auth';
import { dtoDays, dtoProblem, dtoRange, localISODate } from '@/lib/rules/driver';
import { base, page, space } from '@/theme/theme';

export default function TimeOff() {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const today = localISODate(new Date());
  const { data: mine = [], isLoading } = useTimeOff();
  const [mode, setMode] = useState<'single' | 'range'>('single');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState<string | null>(null);
  if (!me) return null;

  const save = async () => {
    const end = mode === 'range' ? to : from;
    const p = dtoProblem(from.trim(), end.trim(), today);
    if (p) { toast(p); return; }
    setBusy(true);
    toast(await bookTimeOff(me, from.trim(), end.trim(), note.trim()));
    setBusy(false); setNote('');
    void qc.invalidateQueries({ queryKey: ['timeOff'] });
  };

  return (
    <ScrollView contentContainerStyle={page(520)}>
      <Card>
        <Text style={{ fontSize: 18, fontWeight: '800', color: base.ink }}>🌴 Book Time Off</Text>
        <Muted style={{ marginBottom: 12 }}>Deliveries can’t be booked for you on these days.</Muted>
        <View style={{ flexDirection: 'row', backgroundColor: '#EEF0F3', borderRadius: 10, padding: 3, gap: 3, marginBottom: 12 }}>
          {([['single', 'One day'], ['range', 'Several days']] as const).map(([k, l]) => (
            <Pressable key={k} onPress={() => setMode(k)} style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', backgroundColor: mode === k ? '#fff' : 'transparent' }}>
              <Text style={{ fontWeight: '700', color: mode === k ? base.ink : base.slate }}>{l}</Text>
            </Pressable>
          ))}
        </View>
        <DateField label={mode === 'range' ? 'From' : 'Date'} value={from} onChange={setFrom} min={todayIso()} />
        {mode === 'range' && <DateField label="To" value={to} onChange={setTo} min={from || todayIso()} />}
        <Field label="Note (optional)" value={note} onChangeText={setNote} maxLength={200} placeholder="e.g. Holiday, appointment" />
        <Button title={busy ? 'Saving…' : 'Book Time Off'} busy={busy} onPress={save} />
      </Card>
      <SectionTitle>Your Booked Days Off</SectionTitle>
      {isLoading ? <Muted>Loading…</Muted> : mine.length ? mine.map((t) => (
        <Card key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', color: base.ink }}>{dtoRange(t)}</Text>
            <Muted>{dtoDays(t.start_date, t.end_date)} day{dtoDays(t.start_date, t.end_date) === 1 ? '' : 's'}{t.note ? ` · ${t.note}` : ''}</Muted>
          </View>
          <Pressable onPress={async () => {
            if (sure !== t.id) { setSure(t.id); return; }
            if (await removeTimeOff(t.id)) { toast('Removed'); setSure(null); void qc.invalidateQueries({ queryKey: ['timeOff'] }); }
          }}>
            <Text style={{ color: base.red, fontWeight: '700' }}>{sure === t.id ? 'Tap again to remove' : 'Remove'}</Text>
          </Pressable>
        </Card>
      )) : <Empty>No days off booked.</Empty>}
    </ScrollView>
  );
}
