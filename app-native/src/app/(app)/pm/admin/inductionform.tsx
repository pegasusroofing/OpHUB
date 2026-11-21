// The company's induction form (Admin › H&S, Andy 20 Nov 2026: "the inductions ... need to be a bit more of a
// customisable form that then creates a document for signing by operatives and adding info missing, ie next of kin
// etc"). One tab per section; each question is a tick, Yes / No (with details if Yes), short or longer answer, phone
// number or date, required or not. Saves by itself; every job's induction uses it from the next one signed.
import { useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { FinTabs } from '@/components/FinNav';
import { chooseAction, confirmAsk } from '@/components/toast';
import { Button, Card, FilterRow, Muted } from '@/components/ui';
import { inductionItems, saveInductionForm, useInductionForm } from '@/data/inductions';
import { useAuth } from '@/lib/auth';
import { isFullManager } from '@/lib/roles';
import { IND_TYPE_LABEL, indUid, standardInductionForm, type IndForm, type IndItem, type IndType } from '@/lib/rules/inductionForm';
import { base, page, radius, space } from '@/theme/theme';

const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 9, color: base.ink, backgroundColor: base.card, marginBottom: 6 } as const;

export default function InductionFormScreen() {
  const { me, org } = useAuth();
  const { data, isLoading } = useInductionForm(org);
  if (!me) return null;
  if (!isFullManager(me)) return <><Stack.Screen options={{ title: 'Induction Form' }} /><Muted style={{ padding: space.l }}>Project Managers and admins only.</Muted></>;
  if (isLoading || !data) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  return (
    <ScrollView contentContainerStyle={page(820)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Induction Form' }} />
      <FormEditor initial={data} orgId={me.org_id as string} ticks={inductionItems(org)} />
    </ScrollView>
  );
}

function FormEditor({ initial, orgId, ticks }: { initial: IndForm; orgId: string; ticks: string[] }) {
  const qc = useQueryClient();
  const [f, setF] = useState<IndForm>(initial);
  const [tab, setTab] = useState(initial.sections[0]?.id || '');
  const [state, setState] = useState('Every job’s induction uses this form · saves by itself');
  const latest = useRef(f), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveNow = async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const ok = await saveInductionForm(orgId, latest.current);
    setState(ok ? 'Every job’s induction uses this form · saves by itself' : 'Not saved - check signal');
    void qc.invalidateQueries({ queryKey: ['inductionForm'] });
  };
  const change = (fn: (x: IndForm) => IndForm) => {
    const next = fn(latest.current); latest.current = next; setF(next); setState('Saving…');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void saveNow(); }, 700);
  };
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); void saveInductionForm(orgId, latest.current); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const sec = f.sections.find((s) => s.id === tab) ?? f.sections[0];
  const si = f.sections.indexOf(sec);
  const setSec = (patch: Partial<typeof sec>) => change((x) => ({ sections: x.sections.map((s) => (s.id === sec.id ? { ...s, ...patch } : s)) }));
  const setItem = (id: string, patch: Partial<IndItem>) => setSec({ items: sec.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) });
  const moveItem = (i: number, d: -1 | 1) => { const a = sec.items.slice(), j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; setSec({ items: a }); };
  const nx = f.sections[si + 1];
  return (
    <>
      <Text style={{ fontSize: 19, fontWeight: '600', color: base.ink }}>Induction Form</Text>
      <Muted style={{ marginBottom: 8 }}>{state}</Muted>
      <FinTabs even value={sec?.id || ''} onChange={(k) => { if (timer.current) void saveNow(); setTab(k); }} items={f.sections.map((s) => [s.id, `${s.title} (${s.items.length})`] as [string, string])} />
      <View style={{ height: 10 }} />
      {sec && (
        <Card>
          <Muted style={{ fontWeight: '600', marginBottom: 3 }}>Section Title</Muted>
          <TextInput value={sec.title} onChangeText={(v) => setSec({ title: v })} style={box} accessibilityLabel="Section title" />
          <Muted style={{ fontWeight: '600', marginBottom: 3 }}>Note For The Operative (Optional)</Muted>
          <TextInput value={sec.note || ''} onChangeText={(v) => setSec({ note: v })} style={box} placeholder="e.g. Who we contact in an emergency" placeholderTextColor={base.slateLight} />
          {sec.items.map((it, i) => (
            <View key={it.id} style={{ borderTopWidth: 1, borderTopColor: base.line, paddingTop: 8, marginTop: 6 }}>
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
                <Text style={{ width: 22, paddingTop: 9, fontWeight: '700', color: base.ink, textAlign: 'right' }}>{i + 1}.</Text>
                <TextInput value={it.label} onChangeText={(v) => setItem(it.id, { label: v })} multiline accessibilityLabel={`Question ${i + 1}`} placeholder="Type the question" placeholderTextColor={base.slateLight}
                  style={[box, { flex: 1, minWidth: 0, minHeight: 40, textAlignVertical: 'top' }]} />
                <View style={{ gap: 2, paddingTop: 4 }}>
                  <Pressable accessibilityLabel={`Move question ${i + 1} up`} disabled={i === 0} onPress={() => moveItem(i, -1)} style={{ opacity: i === 0 ? 0.3 : 1 }}><Text style={{ fontSize: 15 }}>↑</Text></Pressable>
                  <Pressable accessibilityLabel={`Move question ${i + 1} down`} disabled={i === sec.items.length - 1} onPress={() => moveItem(i, 1)} style={{ opacity: i === sec.items.length - 1 ? 0.3 : 1 }}><Text style={{ fontSize: 15 }}>↓</Text></Pressable>
                </View>
                <Pressable accessibilityLabel={`Remove question ${i + 1}`} hitSlop={6} style={{ paddingTop: 9 }} onPress={async () => { if (!it.label.trim() || await confirmAsk('Remove this question? Inductions already signed keep their answers.', 'Yes', 'No')) setSec({ items: sec.items.filter((x) => x.id !== it.id) }); }}>
                  <Text style={{ color: base.slate, fontSize: 15 }}>✕</Text>
                </Pressable>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginLeft: 28 }}>
                <Pressable accessibilityRole="button" accessibilityLabel={`Answer type for question ${i + 1}`} onPress={async () => {
                  const k = await chooseAction('Answer Type', (Object.keys(IND_TYPE_LABEL) as IndType[]).map((t) => ({ key: t, label: IND_TYPE_LABEL[t] })));
                  if (k) setItem(it.id, { type: k as IndType });
                }} style={{ borderWidth: 1, borderColor: base.line, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
                  <Text style={{ color: base.ink, fontSize: 13 }}>{IND_TYPE_LABEL[it.type]} ▾</Text>
                </Pressable>
                <Text style={{ color: base.slate, fontSize: 13 }}>Required?</Text>
                <View style={{ width: 110 }}><FilterRow seg options={[['yes', 'Yes'], ['no', 'No']]} value={it.required ? 'yes' : 'no'} onChange={(v) => setItem(it.id, { required: v === 'yes' })} /></View>
                {it.type === 'yesno' && <><Text style={{ color: base.slate, fontSize: 13 }}>Details If Yes?</Text><View style={{ width: 110 }}><FilterRow seg options={[['yes', 'Yes'], ['no', 'No']]} value={it.detailsIfYes ? 'yes' : 'no'} onChange={(v) => setItem(it.id, { detailsIfYes: v === 'yes' })} /></View></>}
              </View>
            </View>
          ))}
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <Button small title="+ Add Question" onPress={() => setSec({ items: [...sec.items, { id: indUid(), label: '', type: 'text', required: true }] })} />
            {f.sections.length > 1 && <Button small kind="ghost" title="Remove Section" onPress={async () => { if (await confirmAsk(`Remove the "${sec.title}" section and its questions?`, 'Yes', 'No')) { change((x) => ({ sections: x.sections.filter((s) => s.id !== sec.id) })); setTab(f.sections[0].id === sec.id ? f.sections[1]?.id : f.sections[0].id); } }} />}
          </View>
        </Card>
      )}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4, marginBottom: 20 }}>
        {nx ? <Button title={`Next: ${nx.title} ›`} onPress={() => { if (timer.current) void saveNow(); setTab(nx.id); }} /> : null}
        <Button kind="ghost" title="+ Add Section" onPress={() => { const s = { id: indUid(), title: 'New Section', items: [{ id: indUid(), label: '', type: 'text' as IndType, required: true }] }; change((x) => ({ sections: [...x.sections, s] })); setTab(s.id); }} />
        <Button kind="ghost" title="Back To Standard Form" onPress={async () => { if (await confirmAsk('Put the form back to the standard one? Your changes are lost (signed inductions keep their answers).', 'Yes', 'No')) { const s = standardInductionForm(ticks); change(() => s); setTab(s.sections[0].id); } }} />
      </View>
    </>
  );
}
