// Training Matrix (320): every operative × certificate category on one grid,
// colour-coded by expiry, with Excel and PDF downloads. Tap a name for their record.
import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useToast } from '@/components/toast';
import { Button, Empty, Muted } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { CERT_CATEGORIES, matrixState } from '@/lib/rules/certs';
import { isManager } from '@/lib/roles';
import { exportTrainingMatrixExcel, exportTrainingMatrixPdf, loadTrainingMatrix, matrixCellText } from '@/lib/trainingMatrix';
import { base, space } from '@/theme/theme';

const BG = { ok: '#E6F4EA', soon: '#FFF3D6', expired: '#FDECEC', none: 'transparent' };
const FG = { ok: '#1E7A3C', soon: '#8A5A00', expired: '#C0392B', none: base.slate };

export default function TrainingMatrix() {
  const { me, org } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['trainingMatrix', me?.org_id], enabled: !!me?.org_id, queryFn: () => loadTrainingMatrix(me?.org_id as string) });
  if (!me) return null;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  const run = async (k: string, fn: () => Promise<boolean>) => { if (!data?.operatives.length) { toast('No operatives to report.'); return; } setBusy(k); const ok = await fn().catch(() => false); setBusy(''); if (!ok) toast('Could not make the file — try again.'); };
  const cell = { width: 110, paddingVertical: 8, paddingHorizontal: 6, borderBottomWidth: 1, borderColor: base.line };
  return (
    <ScrollView contentContainerStyle={{ padding: space.l }}>
      <Stack.Screen options={{ title: 'Training Matrix' }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <Button kind="ghost" title={busy === 'x' ? 'Making…' : '📊 Export Excel'} onPress={() => run('x', () => exportTrainingMatrixExcel(data!, org))} />
        <Button kind="ghost" title={busy === 'p' ? 'Making…' : '📄 Export PDF'} onPress={() => run('p', () => exportTrainingMatrixPdf(data!, org))} />
      </View>
      <Muted style={{ marginBottom: 8 }}>✓ = held. A date = when the soonest one expires. Amber: within 30 days. Red: expired.</Muted>
      {isLoading ? <Muted>Loading…</Muted> : !data?.operatives.length ? <Empty>No operatives yet.</Empty> : (
        <ScrollView horizontal>
          <View style={{ backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: 10 }}>
            <View style={{ flexDirection: 'row', backgroundColor: '#E4E9F0' }}>
              <Text style={[cell, { width: 170, fontWeight: '800', color: base.ink }]}>Operative</Text>
              {CERT_CATEGORIES.map((c) => <Text key={c.key} style={[cell, { fontWeight: '800', color: base.ink, fontSize: 12 }]}>{c.label}</Text>)}
            </View>
            {data.operatives.map((o) => (
              <View key={o.id} style={{ flexDirection: 'row' }}>
                <Pressable onPress={() => router.push(`/pm/operatives/${o.id}` as never)} style={[cell, { width: 170 }]}><Text style={{ fontWeight: '700', color: base.blue }}>{o.name}</Text></Pressable>
                {CERT_CATEGORIES.map((c) => { const e = data.byOp[o.id]?.[c.key], st = matrixState(e); return <Text key={c.key} style={[cell, { backgroundColor: BG[st], color: FG[st], fontWeight: '700', fontSize: 12 }]}>{matrixCellText(e, true).replace(/^Y$/, '✓') || '–'}</Text>; })}
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </ScrollView>
  );
}
