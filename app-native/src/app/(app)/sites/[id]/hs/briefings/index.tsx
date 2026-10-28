// Daily Briefings list, grouped by week (current week open). Tap to read;
// "Tap to sign" shows on completed briefings that are issued and you haven't signed.
// Ported from renderDailyBriefings (700). Starting/filling/issuing briefings and
// PDF export/email come with the PM screens.
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useToast } from '@/components/toast';
import { Empty, Muted, Row, Toggle } from '@/components/ui';
import { signBriefing, useBriefings, type Submission } from '@/data/briefings';
import { nameOf, usePeople } from '@/data/hs';
import { useAuth } from '@/lib/auth';
import { REPORT_STATUS_LABEL, weekKeyOf, weekLabelOf } from '@/lib/rules/reports';
import { base, radius, space } from '@/theme/theme';

export default function Briefings() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useBriefings(id);
  const { data: people } = usePeople();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  if (!me) return null;
  const current = weekKeyOf(new Date());
  const weeks: Record<string, Submission[]> = {};
  (data?.subs ?? []).forEach((s) => { (weeks[weekKeyOf(new Date(s.submitted_at))] ||= []).push(s); });
  const keys = Object.keys(weeks).sort((a, b) => b.localeCompare(a));

  const sign = async (s: Submission) => {
    const r = await signBriefing(me, s.id);
    toast(r.msg);
    if (r.needSignature) router.push('/signature');
    if (r.ok) void qc.invalidateQueries({ queryKey: ['briefings', id] });
  };

  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <Stack.Screen options={{ title: 'Daily Briefings' }} />
      {isLoading ? <Muted>Loading…</Muted> : keys.length ? keys.map((k) => {
        const isOpen = open[k] ?? k === current;
        return (
          <View key={k}>
            <Toggle title={`${weekLabelOf(k)}${k === current ? ' (current)' : ''} (${weeks[k].length})`} open={isOpen} onPress={() => setOpen({ ...open, [k]: !isOpen })} />
            {isOpen && weeks[k].map((s) => {
              const sigs = (data?.sigs ?? []).filter((x) => x.submission_id === s.id);
              const mine = sigs.find((x) => x.user_id === me.id);
              const needsMe = !!s.issued_at && s.status === 'completed' && !mine;
              return (
                <View key={s.id} style={{ marginTop: 8 }}>
                  <Row title={`${s.template_name} · ${REPORT_STATUS_LABEL[s.status] || s.status}`}
                    sub={`${s.status === 'in_progress' ? 'Started' : 'Completed'} ${new Date(s.submitted_at).toLocaleString('en-GB')} · ${nameOf(people, s.submitted_by)}\n${s.issued_at ? `Issued for signing · ${sigs.length} signed` : 'Not issued for signing'}`}
                    onPress={s.status === 'completed' ? () => router.push(`/sites/${id}/hs/briefings/${s.id}`) : undefined} />
                  {needsMe && (
                    <Pressable onPress={() => sign(s)} style={{ marginTop: -4, marginBottom: 8, borderWidth: 1.5, borderStyle: 'dashed', borderColor: base.line, borderRadius: radius.input, padding: 12, backgroundColor: base.card }}>
                      <Text style={{ fontWeight: '700', color: base.ink }}>✍ Tap to sign — {s.template_name}</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        );
      }) : <Empty>No Daily Briefings yet{data?.hasTemplate === false ? ' — set up a Daily Briefing template first.' : '.'}</Empty>}
    </ScrollView>
  );
}
