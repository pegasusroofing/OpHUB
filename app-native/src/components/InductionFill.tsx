// Filling in a site induction from the company's own form (Andy, 20 Nov 2026): one tab per section, then Sign. What
// doesn't change between jobs (next of kin, employer, CSCS) is filled in from their last induction, so they only add
// what's missing. Signing signs the site rules and layout too. A missing answer takes them to its tab.
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { DateBox } from '@/components/DateField';
import { FinTabs } from '@/components/FinNav';
import { StorageImage } from '@/components/StorageImage';
import { useToast } from '@/components/toast';
import { Button, Card, Muted, SectionTitle } from '@/components/ui';
import { submitInductionForm, useMyLastInduction, type SiteRule } from '@/data/inductions';
import { useAuth } from '@/lib/auth';
import { carryOver, inductionMissing, type IndAnswers, type IndForm, type IndItem } from '@/lib/rules/inductionForm';
import type { Site } from '@/lib/types';
import { base, live, radius } from '@/theme/theme';

const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card, marginBottom: 8 } as const;

export function InductionFill({ site, form, rules, onView, onDone }: { site: Site; form: IndForm; rules: SiteRule[]; onView: (path: string) => void; onDone: () => void }) {
  const { me, org } = useAuth();
  const toast = useToast();
  const { data: last, isFetched } = useMyLastInduction(me?.id);
  // What they type, over what carries over from last time.
  const [own, setOwn] = useState<IndAnswers>({});
  const [rulesRead, setRulesRead] = useState(false);
  const [tab, setTab] = useState(form.sections[0]?.id || 'sign');
  const [busy, setBusy] = useState<string | null>(null);
  if (!me) return null;
  if (!isFetched) return <Muted>Loading…</Muted>;
  const a: IndAnswers = { ...carryOver(form, last?.answers, last ? { name: last.name, number: last.number } : undefined), ...own };
  const set = (k: string, v: string | boolean) => setOwn((x) => ({ ...x, [k]: v }));
  const tabs: [string, string][] = [...form.sections.map((s) => [s.id, s.title] as [string, string]), ['sign', 'Sign']];
  const missing = inductionMissing(form, a);
  const idx = tabs.findIndex(([k]) => k === tab);
  const nx = tabs[idx + 1];
  const sig = (me as { signature_path?: string | null }).signature_path;
  const carried = !!last && form.sections.some((s) => s.items.some((it) => it.type !== 'tick' && it.type !== 'yesno' && a[it.id] && last.answers?.[it.id] === a[it.id]));

  const item = (it: IndItem) => {
    const v = a[it.id];
    const lab = <Text style={{ color: base.ink, marginBottom: 6, fontWeight: it.type === 'tick' ? '400' : '600' }}>{it.label}{it.required && it.type !== 'tick' ? ' *' : ''}</Text>;
    if (it.type === 'tick') return (
      <Pressable key={it.id} accessibilityRole="checkbox" accessibilityState={{ checked: v === true }} onPress={() => set(it.id, v !== true)}
        style={{ flexDirection: 'row', gap: 8, padding: 12, borderWidth: 1, borderColor: v === true ? base.ok : base.line, backgroundColor: v === true ? base.okBg : base.card, borderRadius: radius.row, marginBottom: 8 }}>
        <Text style={{ fontSize: 18 }}>{v === true ? '☑' : '☐'}</Text>
        <Text style={{ flex: 1, color: base.ink }}>{it.label}</Text>
      </Pressable>
    );
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
        {v === 'yes' && it.detailsIfYes && <TextInput value={String(a[`${it.id}__details`] || '')} onChangeText={(t) => set(`${it.id}__details`, t)} multiline placeholder="Please give details *" placeholderTextColor={base.slateLight} style={[box, { marginTop: 8, minHeight: 56 }]} />}
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

  const sec = form.sections.find((s) => s.id === tab);
  const submit = async () => {
    if (missing.length) { setTab(missing[0].section); toast(`Still to answer: ${missing[0].label}`); return; }
    if (rules.length && !rulesRead) { toast('Read the site rules and layout, then tick to say you have.'); return; }
    setBusy('Saving…');
    const err = await submitInductionForm(me, org, site, form, a, setBusy, rules);
    setBusy(null);
    if (err) { toast(err); return; }
    onDone();
  };
  return (
    <>
      <Muted style={{ marginBottom: 8 }}>Site induction for {site.name}. Answer each tab, then sign.{carried ? ' Your next of kin and details are filled in from your last induction: check them.' : ''}</Muted>
      <FinTabs even value={tab} onChange={setTab} items={tabs.map(([k, l]) => [k, missing.some((m) => m.section === k) ? `${l} ⚠` : l] as [string, string])} />
      <View style={{ height: 10 }} />
      {sec ? (
        <>
          {!!sec.note && <Muted style={{ marginBottom: 8 }}>{sec.note}</Muted>}
          {sec.items.map(item)}
        </>
      ) : (
        <>
          {rules.length > 0 && (
            <Card>
              <SectionTitle>Site Rules & Layout *</SectionTitle>
              <Muted style={{ marginBottom: 6 }}>Read each one. Signing this induction signs these too.</Muted>
              {rules.map((r) => (
                <Pressable key={r.id} accessibilityRole="button" onPress={() => onView(r.storage_path)} style={{ paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ flex: 1, color: base.ink }}>📄 {r.name}</Text>
                  <Text style={{ color: base.blue, fontWeight: '600' }}>View</Text>
                </Pressable>
              ))}
              <Pressable onPress={() => setRulesRead(!rulesRead)} style={{ flexDirection: 'row', gap: 8, padding: 12, marginTop: 6, borderWidth: 1, borderColor: rulesRead ? base.ok : base.line, backgroundColor: rulesRead ? base.okBg : base.card, borderRadius: radius.row }}>
                <Text style={{ fontSize: 18 }}>{rulesRead ? '☑' : '☐'}</Text>
                <Text style={{ flex: 1, color: base.ink }}>I have read and understood the site rules and layout</Text>
              </Pressable>
            </Card>
          )}
          <Card>
            <SectionTitle>Sign To Confirm</SectionTitle>
            {missing.length ? <Muted style={{ color: base.warn, marginBottom: 8 }}>Still to answer: {missing.slice(0, 3).map((m) => m.label).join('; ')}{missing.length > 3 ? ` and ${missing.length - 3} more` : ''}.</Muted> : null}
            {sig ? (
              <Pressable disabled={!!busy} onPress={() => void submit()} accessibilityRole="button" accessibilityLabel="Sign and complete induction"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: base.line, borderRadius: radius.input, padding: 12, opacity: missing.length ? 0.6 : 1 }}>
                <StorageImage bucket="signatures" path={sig} style={{ height: 32, width: 140, resizeMode: 'contain' }} />
                <Text style={{ flex: 1, color: base.ink }}>{busy ?? (missing.length ? 'Answer every question first' : 'Tap to sign & complete induction')}</Text>
              </Pressable>
            ) : (
              <>
                <Muted style={{ color: base.warn, marginBottom: 8 }}>Adopt your signature first — one tap and it&apos;s used everywhere.</Muted>
                <Button title="Adopt Your Signature" onPress={() => router.push('/signature')} />
              </>
            )}
          </Card>
        </>
      )}
      {nx && <View style={{ alignItems: 'center', marginTop: 6, marginBottom: 20 }}><Button title={`Next: ${nx[1]} ›`} onPress={() => setTab(nx[0])} /></View>}
    </>
  );
}
