// A finished report's answers, read-only (430 renderReportView / renderReportViewItem):
// score, condition key, each listed section and question with its traffic-light
// colour, note and photos. Used by Reports, Daily Briefings and LOLER.
import type React from 'react';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { Popup } from '@/components/Popup';

import { StorageImage, UrlImage } from '@/components/StorageImage';
import { Button, Card, Muted, SectionTitle } from '@/components/ui';
import { TRAFFIC_COLOURS } from '@/lib/rules/templates';
import {
  answerText, itemAllowsMedia, itemAllowsNote, itemTrafficLevel, itemVisible, reportListsItem, reportListsSection, scoreLabel, scoreSections,
  trafficHex, trafficLevels, type Answers, type ReportItem, type ReportSection,
} from '@/lib/rules/reports';
import { base } from '@/theme/theme';

// The question, as the old app's p.stub: small, grey, italic.
const Q = ({ children }: { children: React.ReactNode }) => <Text style={{ fontSize: 11.5, fontStyle: 'italic', color: base.slate, marginBottom: 2 }}>{children}</Text>;

// While filling a report (430 trafficKeyHtml canAdd): + Add Condition, and ✕ on the ones added on site.
export function TrafficKey({ sections, onAdd, onRemove }: { sections: ReportSection[]; onAdd?: () => void; onRemove?: (id: string) => void }) {
  const lv = trafficLevels(sections);
  if (!lv) return null;
  return (
    <Card>
      <SectionTitle>Condition key</SectionTitle>
      {lv.map((l) => (
        <View key={l.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 3 }}>
          <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: trafficHex(l.color) }} />
          <Text style={{ color: base.ink, flex: 1 }}>{l.label}</Text>
          {!!onRemove && l.addedOnSite && <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${l.label}`} hitSlop={8} onPress={() => onRemove(l.id)}><Text style={{ color: base.slate, fontWeight: '600' }}>✕</Text></Pressable>}
        </View>
      ))}
      {!!onAdd && <View style={{ alignItems: 'center', marginTop: 6 }}><Button small kind="ghost" title="+ Add Condition" onPress={onAdd} /></View>}
    </Card>
  );
}

/** New condition: what it means and a colour (the first one not used yet is picked). */
export function NewConditionPopup({ used, onAdd, onClose }: { used: string[]; onAdd: (label: string, color: string) => void; onClose: () => void }) {
  const [label, setLabel] = useState('');
  const [pick, setPick] = useState((TRAFFIC_COLOURS.find((c) => !used.includes(c.k)) || TRAFFIC_COLOURS[0]).k);
  const [err, setErr] = useState('');
  return (
    <Popup title="New Condition" onClose={onClose}
      footer={<View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}><Button title="Add" onPress={() => { if (!label.trim()) { setErr('Type what this condition means.'); return; } onAdd(label.trim(), pick); }} /><Button kind="ghost" title="Cancel" onPress={onClose} /></View>}>
      <Muted>What It Means</Muted>
      <TextInput value={label} onChangeText={(t) => { setLabel(t); setErr(''); }} autoFocus placeholder="e.g. Monitor / Re-inspect in 12 months" placeholderTextColor="#9AA1AB" accessibilityLabel="What it means"
        style={{ borderWidth: 1, borderColor: '#D5D9DF', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, fontSize: 15, color: base.ink, backgroundColor: '#fff', marginBottom: 12 }} />
      <Muted>Colour</Muted>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
        {TRAFFIC_COLOURS.map((c) => (
          <Pressable key={c.k} accessibilityRole="radio" accessibilityLabel={c.lbl} aria-checked={pick === c.k} onPress={() => setPick(c.k)}
            style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: trafficHex(c.k), borderWidth: 3, borderColor: pick === c.k ? base.ink : 'transparent' }} />
        ))}
      </View>
      {!!err && <Text style={{ color: '#C0392B', marginTop: 8 }}>{err}</Text>}
    </Popup>
  );
}

// hideHistory: the 'Edited … by …' lines are left off (daily briefings, Andy 4 Nov 2026).
export function ReportAnswers({ sections, answers, nameOf, hideHistory }: { sections: ReportSection[]; answers: Answers; nameOf: (id: string | null | undefined) => string; hideHistory?: boolean }) {
  const sc = scoreSections(sections, answers);
  const history = Array.isArray(answers._editHistory) ? (answers._editHistory as { by: string; byName?: string; at: string }[]) : [];

  const item = (it: ReportItem) => {
    const val = answers[it.id];
    if (it.type === 'instruction') return <Text key={it.id} style={{ fontWeight: '600', color: base.ink, marginBottom: 8 }}>{it.label}</Text>;
    const media = itemAllowsMedia(it) && Array.isArray(answers[`${it.id}__media`]) ? (answers[`${it.id}__media`] as string[]) : [];
    const note = itemAllowsNote(it) ? answers[`${it.id}__note`] : null;
    const tl = itemTrafficLevel(sections, it, answers);
    if (it.type === 'photo' || it.type === 'drawing') {
      const arr = Array.isArray(val) ? (val as string[]) : val ? [String(val)] : [];
      if (!arr.length) return null;
      return (
        <View key={it.id} style={{ marginBottom: 10 }}>
          <Q>{it.label}</Q>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
            {arr.map((u) => <UrlImage key={u} url={u} style={it.type === 'drawing' ? { width: '100%', aspectRatio: 1.4, borderRadius: 8 } : { width: 140, height: 140, borderRadius: 8 }} />)}
          </View>
        </View>
      );
    }
    if (it.type === 'signature') {
      return val ? <View key={it.id} style={{ marginBottom: 10 }}><Q>{it.label}</Q><View style={{ alignSelf: 'flex-start', backgroundColor: '#fff', borderWidth: 1, borderColor: base.line, borderRadius: 6, padding: 4 }}><StorageImage bucket="signatures" path={String(val)} style={{ height: 44, width: 160, resizeMode: 'contain' }} /></View></View> : null;
    }
    if (it.type === 'operatives') {
      const list = Array.isArray(val) ? (val as { included?: boolean; name: string; role?: string }[]).filter((r) => r.included) : [];
      return (
        <View key={it.id} style={{ marginBottom: 10 }}>
          <Q>{it.label}</Q>
          {list.length ? list.map((r) => <Text key={r.name} style={{ fontWeight: '600', color: base.ink }}>{r.name}{r.role ? <Text style={{ fontWeight: '400', color: base.slate }}> — {r.role}</Text> : null}</Text>) : <Text>—</Text>}
        </View>
      );
    }
    return (
      <View key={it.id} style={{ marginBottom: 10 }}>
        <Q>{it.label}</Q>
        <Text style={{ fontWeight: '600', fontSize: 13.5, color: base.ink }}>{answerText(it, val)}</Text>
        {!!tl && <Text style={{ alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: trafficHex(tl.color), color: '#fff', fontSize: 11.5, fontWeight: '600', overflow: 'hidden' }}>{tl.label}</Text>}
        {!!note && <Text style={{ color: base.slate, marginTop: 2 }}>Note: {String(note)}</Text>}
        {media.length > 0 && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>{media.map((u) => <UrlImage key={u} url={u} style={{ width: 90, height: 90, borderRadius: 8 }} />)}</View>}
      </View>
    );
  };

  return (
    <View>
      {!hideHistory && history.map((e, i) => <Muted key={i}>Edited {new Date(e.at).toLocaleString('en-GB')} by {e.byName || nameOf(e.by)}</Muted>)}
      {sc.overall.possible > 0 && <Text style={{ textAlign: 'right', fontWeight: '600', fontStyle: 'italic', fontSize: 12, color: base.ink, marginBottom: 6 }}>Score: {scoreLabel(sc.overall)}</Text>}
      <TrafficKey sections={sections} />
      {(sections || []).filter((s) => reportListsSection(sections, s, answers)).map((s) => (
        <Card key={s.id}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <SectionTitle>{s.title}</SectionTitle>
            {sc.bySection[s.id] && <Text style={{ fontWeight: '600', fontSize: 12, color: base.slate }}>{scoreLabel(sc.bySection[s.id])}</Text>}
          </View>
          {(s.items || []).filter((it) => itemVisible(it, answers) && reportListsItem(sections, it, answers)).map(item)}
        </Card>
      ))}
    </View>
  );
}
