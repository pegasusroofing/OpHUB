// A finished report's answers, read-only (430 renderReportView / renderReportViewItem):
// score, condition key, each listed section and question with its traffic-light
// colour, note and photos. Used by Reports, Daily Briefings and LOLER.
import { Text, View } from 'react-native';

import { StorageImage, UrlImage } from '@/components/StorageImage';
import { Card, Muted, SectionTitle } from '@/components/ui';
import {
  answerText, itemAllowsMedia, itemAllowsNote, itemTrafficLevel, itemVisible, reportListsItem, reportListsSection, scoreLabel, scoreSections,
  trafficHex, trafficLevels, type Answers, type ReportItem, type ReportSection,
} from '@/lib/rules/reports';
import { base } from '@/theme/theme';

export function TrafficKey({ sections }: { sections: ReportSection[] }) {
  const lv = trafficLevels(sections);
  if (!lv) return null;
  return (
    <Card>
      <SectionTitle>Condition key</SectionTitle>
      {lv.map((l) => (
        <View key={l.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 3 }}>
          <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: trafficHex(l.color) }} />
          <Text style={{ color: base.ink }}>{l.label}</Text>
        </View>
      ))}
    </Card>
  );
}

export function ReportAnswers({ sections, answers, nameOf }: { sections: ReportSection[]; answers: Answers; nameOf: (id: string | null | undefined) => string }) {
  const sc = scoreSections(sections, answers);
  const history = Array.isArray(answers._editHistory) ? (answers._editHistory as { by: string; byName?: string; at: string }[]) : [];

  const item = (it: ReportItem) => {
    const val = answers[it.id];
    if (it.type === 'instruction') return <Text key={it.id} style={{ fontWeight: '800', color: base.ink, marginBottom: 8 }}>{it.label}</Text>;
    const media = itemAllowsMedia(it) && Array.isArray(answers[`${it.id}__media`]) ? (answers[`${it.id}__media`] as string[]) : [];
    const note = itemAllowsNote(it) ? answers[`${it.id}__note`] : null;
    const tl = itemTrafficLevel(sections, it, answers);
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
        {!!tl && <Text style={{ alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: trafficHex(tl.color), color: '#fff', fontSize: 11.5, fontWeight: '700', overflow: 'hidden' }}>{tl.label}</Text>}
        {!!note && <Text style={{ color: base.slate, marginTop: 2 }}>Note: {String(note)}</Text>}
        {media.length > 0 && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>{media.map((u) => <UrlImage key={u} url={u} style={{ width: 90, height: 90, borderRadius: 8 }} />)}</View>}
      </View>
    );
  };

  return (
    <View>
      {history.map((e, i) => <Muted key={i}>Edited {new Date(e.at).toLocaleString('en-GB')} by {e.byName || nameOf(e.by)}</Muted>)}
      {sc.overall.possible > 0 && <Text style={{ textAlign: 'right', fontWeight: '800', color: base.ink }}>Score: {scoreLabel(sc.overall)}</Text>}
      <TrafficKey sections={sections} />
      {(sections || []).filter((s) => reportListsSection(sections, s, answers)).map((s) => (
        <Card key={s.id}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <SectionTitle>{s.title}</SectionTitle>
            {sc.bySection[s.id] && <Text style={{ fontWeight: '700', fontSize: 12, color: base.slate, marginTop: 16 }}>{scoreLabel(sc.bySection[s.id])}</Text>}
          </View>
          {(s.items || []).filter((it) => itemVisible(it, answers) && reportListsItem(sections, it, answers)).map(item)}
        </Card>
      ))}
    </View>
  );
}
