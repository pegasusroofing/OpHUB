// One Daily Briefing, read-only, with signing. Ported from renderReportView (430,
// fromBriefing): the same questions the old view shows, score and traffic-light
// colours. Managers can Issue for Signing, and Edit Briefing until the first signature.
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ReportAnswers } from '@/components/ReportAnswers';
import { ReportPdfActions } from '@/components/ReportPdfActions';
import { StorageImage } from '@/components/StorageImage';
import { confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Muted, SectionTitle } from '@/components/ui';
import { issueBriefing, signBriefing, useBriefing } from '@/data/briefings';
import { nameOf, usePeople } from '@/data/hs';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { base, page, radius, space } from '@/theme/theme';

export default function BriefingView() {
  const { id, sub: subId } = useLocalSearchParams<{ id: string; sub: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useBriefing(subId);
  const { data: people } = usePeople();
  if (!me) return null;
  const sub = data?.sub;
  if (isLoading || !sub) return <Muted style={{ padding: space.l }}>{isLoading ? 'Loading…' : 'Briefing not found.'}</Muted>;
  const sigs = data?.sigs ?? [];
  const mine = sigs.find((s) => s.user_id === me.id);
  const mgr = isManager(me);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['briefing', subId] }); void qc.invalidateQueries({ queryKey: ['briefings'] }); };

  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: sub.template_name || 'Daily Briefing' }} />
      {/* No 'Completed … / Edited …' lines above the sections (Andy, 4 Nov 2026). */}
      <SectionTitle>{sub.template_name}</SectionTitle>
      {!sub.submitted_at && <Muted>Not completed yet · started by {nameOf(people, sub.submitted_by)}</Muted>}
      <ReportAnswers hideHistory sections={sub.sections || []} answers={sub.answers || {}} nameOf={(u) => nameOf(people, u)} />
      <Card>
        <SectionTitle>Signing</SectionTitle>
        <Muted style={{ marginBottom: 10 }}>{sub.issued_at ? `Issued for signing ${new Date(sub.issued_at).toLocaleString('en-GB')} — every operative in the app can sign it. Signing is optional, so this can be exported at any time.` : 'Not issued for signing yet. Issuing signs it for you, then the operatives tap to sign.'}</Muted>
        {mgr && !sub.issued_at && sub.status === 'completed' && (
          <Button title="Issue For Signing" onPress={async () => {
            if (!(await confirmAsk('Issue this briefing for signing? It is signed for you now, then every operative in the app can tap to sign it. Signing is optional; it can still be exported at any time.', 'Issue', 'No', true))) return;
            const r = await issueBriefing(me, sub.id);
            if (r.needSignature) { toast("Adopt your signature first — one tap and it's used everywhere."); router.push('/signature'); return; }
            if (r.ok) { toast('✓ Issued and signed by you', { confirm: true }); refresh(); } else toast('Could not save — try again.');
          }} />
        )}
        {sub.issued_at && !mine && (
          <Pressable onPress={async () => {
            const r = await signBriefing(me, sub.id);
            toast(r.msg);
            if (r.needSignature) router.push('/signature');
            if (r.ok) refresh();
          }} style={{ borderWidth: 1.5, borderStyle: 'dashed', borderColor: base.line, borderRadius: radius.input, padding: 14, marginBottom: 10 }}>
            <Text style={{ fontWeight: '700', color: base.ink }}>✍ Tap to sign</Text>
          </Pressable>
        )}
        {sigs.map((s) => (
          <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Text style={{ color: base.ok }}>✓</Text><Text style={{ color: base.ink }}>{nameOf(people, s.user_id)}</Text>
            {!!s.signature_image_path && <StorageImage bucket="signatures" path={s.signature_image_path} style={{ height: 20, width: 80, resizeMode: 'contain' }} />}
            <Muted>{new Date(s.signed_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</Muted>
          </View>
        ))}
      </Card>
      {mgr && !sigs.length && <Button kind="ghost" title="Edit Briefing" onPress={() => router.push(`/sites/${id}/hs/briefings/fill/${sub.id}` as never)} />}
      {mgr && <ReportPdfActions sub={sub as never} fromBriefing />}
    </ScrollView>
  );
}
