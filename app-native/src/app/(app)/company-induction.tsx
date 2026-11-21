// A subcontractor company's operative's company induction (Andy, 21 Nov 2026: "the subcontractor company operatives
// don't need to do a big sub contractor sign up form. Have it as a company induction that request very similar
// information (no financial) this then translates to the company induction, and the site induction pulls all this
// through"). Filled in once, from Getting Started: their details, next of kin, their work and cards, and anything first
// aiders should know. Saves by itself; Finish at the end. Every site induction is filled in from it.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { DateBox } from '@/components/DateField';
import { FinTabs } from '@/components/FinNav';
import { useToast } from '@/components/toast';
import { Button, Card, Muted } from '@/components/ui';
import { saveCompanyInduction, useMyCompanyInduction } from '@/data/inductions';
import { useAuth } from '@/lib/auth';
import { COMPANY_INDUCTION, inductionMissing, type IndAnswers, type IndItem } from '@/lib/rules/inductionForm';
import { supabase } from '@/lib/supabase';
import { base, live, page, radius, space } from '@/theme/theme';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card, marginBottom: 8 } as const;

export default function CompanyInduction() {
  const { me } = useAuth();
  const { data: saved, isFetched } = useMyCompanyInduction(me?.id);
  // Their company's name, for Employer / Company.
  const { data: employer = '', isFetched: empFetched } = useQuery({ queryKey: ['myEmployer', me?.id], enabled: !!me,
    queryFn: async () => {
      const r = ((await db.from('subcontractor_operatives').select('subcontractor_company_id').eq('user_id', me?.id as string).limit(1)).data as { subcontractor_company_id: string }[] | null) ?? [];
      if (!r[0]) return '';
      return (((await db.from('subcontractor_companies').select('name').eq('id', r[0].subcontractor_company_id).maybeSingle()).data as { name: string } | null)?.name) || '';
    } });
  if (!me) return null;
  if (!isFetched || !empFetched) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const start: IndAnswers = { you_name: me.name || '', you_phone: (me as { phone?: string | null }).phone || '', about_employer: employer, ...(saved?.data || {}) };
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Company Induction' }} />
      <Form start={start} done={!!saved?.completed_at} />
    </ScrollView>
  );
}

function Form({ start, done }: { start: IndAnswers; done: boolean }) {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [a, setA] = useState<IndAnswers>(start);
  const [tab, setTab] = useState(COMPANY_INDUCTION.sections[0].id);
  const [state, setState] = useState(done ? 'Finished · change anything and it saves by itself' : 'Saves by itself');
  const [busy, setBusy] = useState(false);
  const latest = useRef(a), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); if (me) void saveCompanyInduction(me, latest.current, false); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!me) return null;
  const set = (k: string, v: string | boolean) => {
    const next = { ...latest.current, [k]: v }; latest.current = next; setA(next); setState('Saving…');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; void saveCompanyInduction(me, latest.current, false).then((ok) => setState(ok ? (done ? 'Finished · saved' : 'Saved') : 'Not saved - check signal')); }, 700);
  };
  const secs = COMPANY_INDUCTION.sections;
  const sec = secs.find((s) => s.id === tab) ?? secs[0];
  const nx = secs[secs.indexOf(sec) + 1];
  const missing = inductionMissing(COMPANY_INDUCTION, a);
  const item = (it: IndItem) => {
    const v = a[it.id];
    const lab = <Text style={{ color: base.ink, marginBottom: 6, fontWeight: '600' }}>{it.label}{it.required ? ' *' : ''}</Text>;
    if (it.type === 'yesno') return (
      <Card key={it.id}>
        {lab}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['yes', 'no'] as const).map((o) => (
            <Pressable key={o} accessibilityRole="button" accessibilityLabel={`${it.label}: ${o === 'yes' ? 'Yes' : 'No'}`} onPress={() => set(it.id, o)}
              style={{ flex: 1, alignItems: 'center', padding: 9, borderRadius: 8, borderWidth: 1, borderColor: v === o ? live.brand1 : base.line, backgroundColor: v === o ? live.brand1 : base.card }}>
              <Text style={{ fontWeight: '500', color: v === o ? live.brand1Text : base.ink }}>{o === 'yes' ? 'Yes' : 'No'}</Text>
            </Pressable>
          ))}
        </View>
        {v === 'yes' && it.detailsIfYes && <TextInput value={String(a[`${it.id}__details`] || '')} onChangeText={(t) => set(`${it.id}__details`, t)} multiline accessibilityLabel={`Details: ${it.label}`} placeholder="Please give details *" placeholderTextColor={base.slateLight} style={[box, { marginTop: 8, minHeight: 56 }]} />}
      </Card>
    );
    if (it.type === 'date') return <View key={it.id}>{lab}<DateBox value={String(v || '')} onChange={(d) => set(it.id, d)} title={it.label} style={{ marginBottom: 10 }} /></View>;
    return (
      <View key={it.id}>
        {lab}
        <TextInput value={String(v || '')} onChangeText={(t) => set(it.id, t)} accessibilityLabel={it.label} multiline={it.type === 'long'} keyboardType={it.type === 'phone' ? 'phone-pad' : undefined}
          style={[box, it.type === 'long' ? { minHeight: 64, textAlignVertical: 'top' } : null]} />
      </View>
    );
  };
  const finish = async () => {
    if (missing.length) { setTab(missing[0].section); toast(`Still to answer: ${missing[0].label}`); return; }
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    setBusy(true); const ok = await saveCompanyInduction(me, latest.current, true); setBusy(false);
    if (!ok) { toast('Could not save — check signal and try again.'); return; }
    void qc.invalidateQueries({ queryKey: ['companyInduction'] }); void qc.invalidateQueries({ queryKey: ['onboarding'] });
    router.back();
  };
  return (
    <>
      <Text style={{ fontSize: 19, fontWeight: '600', color: base.ink }}>Company Induction</Text>
      <Muted style={{ marginBottom: 4 }}>Filled in once. Every site induction you do is filled in from it, so you only check it and sign.</Muted>
      <Muted style={{ marginBottom: 8, fontSize: 12 }}>{state}</Muted>
      <FinTabs even value={sec.id} onChange={(k) => setTab(k)} items={secs.map((s) => [s.id, missing.some((m) => m.section === s.id) ? `${s.title} ⚠` : s.title] as [string, string])} />
      <View style={{ height: 10 }} />
      {sec.note ? <Muted style={{ marginBottom: 8 }}>{sec.note}</Muted> : null}
      {sec.items.map(item)}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 6, marginBottom: 20 }}>
        {nx ? <Button title={`Next: ${nx.title} ›`} onPress={() => setTab(nx.id)} /> : <Button busy={busy} title="Finish" onPress={() => void finish()} />}
      </View>
    </>
  );
}
