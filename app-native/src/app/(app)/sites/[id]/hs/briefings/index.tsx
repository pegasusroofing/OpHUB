// Daily Briefings list, grouped by week (current week open). Tap to read;
// "Tap to sign" shows on completed briefings that are issued and you haven't signed.
// Managers: "+ New Briefing" from the company's Daily Briefing template, and an
// unfinished one opens to carry on filling it in; admins can delete unfinished ones.
// Ported from renderDailyBriefings (700). PDF export/email are still to come.
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { confirmAsk, useToast } from '@/components/toast';
import { Button, Empty, Muted, Row, Toggle } from '@/components/ui';
import { briefingTemplate, deleteBriefing, signBriefing, useBriefings, type Submission } from '@/data/briefings';
import { nameOf, usePeople } from '@/data/hs';
import { startReport } from '@/data/reports';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { REPORT_STATUS_LABEL, weekKeyOf, weekLabelOf } from '@/lib/rules/reports';
import { isManager } from '@/lib/roles';
import { base, radius, space } from '@/theme/theme';

export default function Briefings() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: site } = useSite(id);
  const { data, isLoading } = useBriefings(id);
  const { data: people } = usePeople();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  const mgr = isManager(me);
  const current = weekKeyOf(new Date());
  const weeks: Record<string, Submission[]> = {};
  (data?.subs ?? []).forEach((s) => { (weeks[weekKeyOf(new Date(s.submitted_at))] ||= []).push(s); });
  const keys = Object.keys(weeks).sort((a, b) => b.localeCompare(a));
  const refresh = () => void qc.invalidateQueries({ queryKey: ['briefings', id] });

  const sign = async (s: Submission) => {
    const r = await signBriefing(me, s.id);
    toast(r.msg);
    if (r.needSignature) router.push('/signature');
    if (r.ok) refresh();
  };

  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <Stack.Screen options={{ title: 'Daily Briefings' }} />
      {mgr && site && (
        <>
          <Button busy={busy} disabled={data?.hasTemplate === false} title="+ New Briefing" onPress={async () => {
            setBusy(true);
            const t = me.org_id ? await briefingTemplate(me.org_id) : null;
            const sid = t ? await startReport(me, site, t) : null;
            setBusy(false);
            if (!t) { toast('No Daily Briefing template set up yet — an admin can flag one in Admin Centre › Report Templates.'); return; }
            if (!sid) { toast('Could not start — check your signal and try again.'); return; }
            toast('Briefing started'); refresh();
            router.push(`/sites/${id}/hs/briefings/fill/${sid}` as never);
          }} />
          {data?.hasTemplate === false && <Muted style={{ marginBottom: 10 }}>No Daily Briefing template set up yet — an admin can flag one in Admin Centre › Report Templates.</Muted>}
        </>
      )}
      {isLoading ? <Muted>Loading…</Muted> : keys.length ? keys.map((k) => {
        const isOpen = open[k] ?? k === current;
        return (
          <View key={k}>
            <Toggle title={`${weekLabelOf(k)}${k === current ? ' (current)' : ''} (${weeks[k].length})`} open={isOpen} onPress={() => setOpen({ ...open, [k]: !isOpen })} />
            {isOpen && weeks[k].map((s) => {
              const sigs = (data?.sigs ?? []).filter((x) => x.submission_id === s.id);
              const mine = sigs.find((x) => x.user_id === me.id);
              const needsMe = !!s.issued_at && s.status === 'completed' && !mine;
              const go = s.status === 'completed' ? () => router.push(`/sites/${id}/hs/briefings/${s.id}`)
                : mgr ? () => router.push(`/sites/${id}/hs/briefings/fill/${s.id}` as never) : undefined;
              return (
                <View key={s.id} style={{ marginTop: 8 }}>
                  <Row title={`${s.template_name} · ${REPORT_STATUS_LABEL[s.status] || s.status}`}
                    sub={`${s.status === 'in_progress' ? 'Started' : 'Completed'} ${new Date(s.submitted_at).toLocaleString('en-GB')} · ${nameOf(people, s.submitted_by)}\n${s.issued_at ? `Issued for signing · ${sigs.length} signed` : 'Not issued for signing'}`}
                    onPress={go}
                    extra={s.status === 'in_progress' && me.role === 'admin' ? (
                      <Pressable hitSlop={8} onPress={async () => {
                        if (!(await confirmAsk('Delete this unfinished briefing? This cannot be undone.', 'Delete'))) return;
                        if (await deleteBriefing(s.id)) { toast('Briefing deleted'); refresh(); } else toast('Could not delete — try again.');
                      }}><Text style={{ color: base.red }}>🗑</Text></Pressable>
                    ) : undefined} />
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
