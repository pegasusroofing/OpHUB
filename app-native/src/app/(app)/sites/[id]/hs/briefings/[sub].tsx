// One Daily Briefing, read-only, with signing. Ported from renderReportView (430,
// fromBriefing). Shows the same questions the old view shows (conditional questions
// and "hide unanswered" respected) and the score. Still to port with the full
// reports work: traffic-light colours and the drawing key.
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, Text, View, Pressable } from 'react-native';

import { StorageImage, UrlImage } from '@/components/StorageImage';
import { useToast } from '@/components/toast';
import { Card, Muted, SectionTitle } from '@/components/ui';
import { signBriefing, useBriefing } from '@/data/briefings';
import { nameOf, usePeople } from '@/data/hs';
import { useAuth } from '@/lib/auth';
import {
  answerText, itemAllowsMedia, itemAllowsNote, itemVisible, reportListsItem, reportListsSection, scoreLabel, scoreSections, type ReportItem,
} from '@/lib/rules/reports';
import { base, radius, space } from '@/theme/theme';

export default function BriefingView() {
  const { sub: subId } = useLocalSearchParams<{ id: string; sub: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useBriefing(subId);
  const { data: people } = usePeople();
  if (!me) return null;
  const sub = data?.sub;
  if (isLoading || !sub) return <Muted style={{ padding: space.l }}>{isLoading ? 'Loading…' : 'Briefing not found.'}</Muted>;
  const answers = sub.answers || {};
  const sc = scoreSections(sub.sections, answers);
  const mine = data?.sigs.find((s) => s.user_id === me.id);

  const item = (it: ReportItem) => {
    const val = answers[it.id];
    if (it.type === 'instruction') return <Text key={it.id} style={{ fontWeight: '800', color: base.ink, marginBottom: 8 }}>{it.label}</Text>;
    const media = itemAllowsMedia(it) && Array.isArray(answers[`${it.id}__media`]) ? (answers[`${it.id}__media`] as string[]) : [];
    const note = itemAllowsNote(it) ? answers[`${it.id}__note`] : null;
    if (it.type === 'photo' || it.type === 'drawing') {
      const arr = Array.isArray(val) ? (val as string[]) : val ? [String(val)] : [];
      if (!arr.length) return null;
      return (
        <View key={it.id} style={{ marginBottom: 10 }}>
          <Muted>{it.label}</Muted>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
            {arr.map((u) => <UrlImage key={u} url={u} style={it.type === 'drawing' ? { width: '100%', aspectRatio: 1.4, borderRadius: 8 } : { width: 140, height: 140, borderRadius: 8 }} />)}
          </View>
        </View>
      );
    }
    if (it.type === 'signature') {
      return val ? <View key={it.id} style={{ marginBottom: 10 }}><Muted>{it.label}</Muted><StorageImage bucket="signatures" path={String(val)} style={{ height: 44, width: 160, resizeMode: 'contain' }} /></View> : null;
    }
    if (it.type === 'operatives') {
      const list = Array.isArray(val) ? (val as { included?: boolean; name: string; role?: string }[]).filter((r) => r.included) : [];
      return (
        <View key={it.id} style={{ marginBottom: 10 }}>
          <Muted>{it.label}</Muted>
          {list.length ? list.map((r) => <Text key={r.name} style={{ fontWeight: '700', color: base.ink }}>{r.name}{r.role ? <Text style={{ fontWeight: '400', color: base.slate }}> · {r.role}</Text> : null}</Text>) : <Text>—</Text>}
        </View>
      );
    }
    return (
      <View key={it.id} style={{ marginBottom: 10 }}>
        <Muted>{it.label}</Muted>
        <Text style={{ fontWeight: '700', fontSize: 13.5, color: base.ink }}>{answerText(it, val)}</Text>
        {!!note && <Text style={{ color: base.slate, marginTop: 2 }}>Note: {String(note)}</Text>}
        {media.length > 0 && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>{media.map((u) => <UrlImage key={u} url={u} style={{ width: 90, height: 90, borderRadius: 8 }} />)}</View>}
      </View>
    );
  };

  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <Stack.Screen options={{ title: sub.template_name || 'Daily Briefing' }} />
      <SectionTitle>{sub.template_name}</SectionTitle>
      <Muted>Completed {new Date(sub.submitted_at).toLocaleString('en-GB')} by {nameOf(people, sub.submitted_by)}</Muted>
      {sc.overall.possible > 0 && <Text style={{ textAlign: 'right', fontWeight: '800', color: base.ink }}>Score: {scoreLabel(sc.overall)}</Text>}
      {(sub.sections || []).filter((s) => reportListsSection(sub.sections, s, answers)).map((s) => (
        <Card key={s.id}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <SectionTitle>{s.title}</SectionTitle>
            {sc.bySection[s.id] && <Text style={{ fontWeight: '700', fontSize: 12, color: base.slate, marginTop: space.l }}>{scoreLabel(sc.bySection[s.id])}</Text>}
          </View>
          {(s.items || []).filter((it) => itemVisible(it, answers) && reportListsItem(sub.sections, it, answers)).map(item)}
        </Card>
      ))}
      <Card>
        <SectionTitle>Signing</SectionTitle>
        <Muted style={{ marginBottom: 10 }}>{sub.issued_at ? `Issued for signing ${new Date(sub.issued_at).toLocaleString('en-GB')} — every operative in the app can sign it.` : 'Not issued for signing yet.'}</Muted>
        {sub.issued_at && !mine && (
          <Pressable onPress={async () => {
            const r = await signBriefing(me, sub.id);
            toast(r.msg);
            if (r.needSignature) router.push('/signature');
            if (r.ok) { void qc.invalidateQueries({ queryKey: ['briefing', subId] }); void qc.invalidateQueries({ queryKey: ['briefings'] }); }
          }} style={{ borderWidth: 1.5, borderStyle: 'dashed', borderColor: base.line, borderRadius: radius.input, padding: 14, marginBottom: 10 }}>
            <Text style={{ fontWeight: '700', color: base.ink }}>✍ Tap to sign</Text>
          </Pressable>
        )}
        {(data?.sigs ?? []).map((s) => (
          <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Text style={{ color: base.ok }}>✓</Text><Text style={{ color: base.ink }}>{nameOf(people, s.user_id)}</Text>
            {!!s.signature_image_path && <StorageImage bucket="signatures" path={s.signature_image_path} style={{ height: 20, width: 80, resizeMode: 'contain' }} />}
            <Muted>{new Date(s.signed_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</Muted>
          </View>
        ))}
      </Card>
      <Muted>Export PDF comes with the PM screens.</Muted>
    </ScrollView>
  );
}
