// Main Contractor Inspections (530): reports from templates flagged as MC
// inspections, on the report engine. Managers start and open them; others see
// the list. Templates are built in the Admin Centre.
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useToast } from '@/components/toast';
import { Button, Card, Empty, Muted } from '@/components/ui';
import { nameOf, usePeople } from '@/data/hs';
import { useMcInspections } from '@/data/mc';
import { startReport, type Template } from '@/data/reports';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { REPORT_STATUS_LABEL } from '@/lib/rules/reports';
import { isManager } from '@/lib/roles';
import { base, page, radius, space } from '@/theme/theme';

export default function McInspections() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: site } = useSite(id);
  const { data, isLoading } = useMcInspections(id, me?.org_id);
  const { data: people } = usePeople();
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!me || !site) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const mgr = isManager(me);
  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: 'Inspections' }} />
      {mgr && <Button title={picker ? 'Cancel' : '+ New Inspection'} onPress={() => setPicker(!picker)} />}
      {mgr && picker && (
        <Card>
          <Muted style={{ marginBottom: 8 }}>Pick a template to start a new inspection:</Muted>
          {data?.templates.length ? data.templates.map((t) => (
            <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: base.line }}>
              <View style={{ flex: 1 }}><Text style={{ fontWeight: '700', color: base.ink }}>{t.name}</Text>{!!t.description && <Muted>{t.description}</Muted>}</View>
              <Button busy={busy} title="Start" onPress={async () => {
                setBusy(true); const sid = await startReport(me, site, t as unknown as Template); setBusy(false);
                if (!sid) { toast('Could not start — try again.'); return; }
                toast('Inspection started'); setPicker(false); void qc.invalidateQueries({ queryKey: ['mcInspections', id] });
                router.push(`/sites/${id}/snagging/reports/fill/${sid}` as never);
              }} />
            </View>
          )) : <Empty>No inspection templates yet — an admin can set them up in the Admin Centre.</Empty>}
        </Card>
      )}
      {!mgr && !!data?.subs.length && <Muted style={{ marginBottom: 8 }}>Ask a project manager if you need to see a full inspection report.</Muted>}
      {isLoading ? <Muted>Loading…</Muted> : data?.subs.length ? data.subs.map((s) => (
        <Pressable key={s.id} disabled={!mgr} onPress={() => router.push(`/sites/${id}/snagging/reports/${s.status === 'in_progress' ? 'fill' : 'view'}/${s.id}` as never)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginTop: 8, backgroundColor: base.card }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', color: base.ink }}>{s.template_name}</Text>
            <Muted>{s.status === 'in_progress' ? 'Started' : `Submitted ${s.submitted_at ? new Date(s.submitted_at).toLocaleString('en-GB') : ''}`} · {nameOf(people, s.submitted_by)}</Muted>
          </View>
          <Text style={{ fontWeight: '700', color: s.status === 'in_progress' ? base.warn : base.ok }}>{REPORT_STATUS_LABEL[s.status] || s.status}</Text>
        </Pressable>
      )) : <Empty>No inspections logged yet{data?.templates.length ? '.' : ' — set up a template first.'}</Empty>}
      {mgr && <Muted style={{ marginTop: space.m }}>Subcontractor inspection files are on each subcontractor's page.</Muted>}
    </ScrollView>
  );
}
