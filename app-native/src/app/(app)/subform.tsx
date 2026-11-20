// Subcontractor form, filled in inside the app (867 renderSubForm): company,
// contact, work, insurance (with certificates), accreditations and cards, H&S,
// people working with you, references, then a declaration and typed signature.
// It saves on the phone as you go; required answers left blank show in red.
import { useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { useToast } from '@/components/toast';
import { Button, Card, Muted } from '@/components/ui';
import { FinTabs } from '@/components/FinNav';
import { DateBox } from '@/components/DateField';
import { lastSubAnswers, loadSubDraft, saveSubDraft, sendSubform, uploadSubFile, useSubformNeeded, useSubformTemplate } from '@/data/subform';
import { useAuth } from '@/lib/auth';
import { SUBFORM_SECTIONS, subformMissing, subQShown, type SubDraft, type SubQ } from '@/lib/rules/subform';
import { base, page, radius, space } from '@/theme/theme';

const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card };

export default function SubForm() {
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: need } = useSubformNeeded(me);
  const [d, setD] = useState<SubDraft | null>(null);
  const [miss, setMiss] = useState<Set<string> | null>(null);
  // In tabs (Andy, 20 Nov 2026): one per section, then Declaration.
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  // The company's own form, or the standard one (19 Nov 2026: the form can be edited).
  const { data: tpl } = useSubformTemplate(me?.org_id);
  const sections = tpl?.sections ?? SUBFORM_SECTIONS;
  useEffect(() => { if (me) void loadSubDraft(me).then(setD); }, [me]);
  // Sent back (18 Nov 2026): a fresh form starts from the answers and documents they sent before.
  const lastId = need?.returned != null ? need.lastId ?? null : null;
  useEffect(() => {
    if (!me || !lastId) return;
    void lastSubAnswers(me, lastId).then((a) => {
      if (!a) return;
      setD((cur) => {
        if (!cur || String(cur.data.company_name ?? '').trim()) return cur;
        const keep = Object.fromEntries(Object.entries(cur.data).filter(([, v]) => (Array.isArray(v) ? v.length : String(v ?? '').trim())));
        return { ...cur, data: { ...(a.data || {}), ...keep }, files: Object.keys(cur.files).length ? cur.files : a.files || {} };
      });
    });
  }, [me, lastId]);
  if (!me || !d) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const update = (n: SubDraft) => { setD(n); void saveSubDraft(me, n); };
  const set = (k: string, v: unknown) => update({ ...d, data: { ...d.data, [k]: v } });
  if (me.role === 'operative' && need && !need.needed) return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: 'Subcontractor form' }} />
      <Card><Text style={{ color: base.ink }}>{need.off ? 'You don’t need to fill this in — we already have your details.' : 'Thanks — your form has been sent.'}</Text></Card>
    </ScrollView>
  );
  const question = (q: SubQ) => {
    if (!subQShown(q, d.data)) return null;
    const id = (q.k || q.f) as string, bad = !!miss?.has(id), v = q.k ? d.data[q.k] : undefined;
    let body;
    const opts = q.type === 'yesno' ? (q.first === 'No' ? ['No', 'Yes'] : ['Yes', 'No']) : q.o || [];
    const one = q.type === 'radio' || q.type === 'yesno';
    if (q.type === 'radio' || q.type === 'checks' || q.type === 'yesno') body = (
      <View style={{ gap: 4 }}>{opts.map((o) => {
        const on = one ? v === o : Array.isArray(v) && v.includes(o);
        return (
          <Pressable key={o} onPress={() => set(q.k as string, one ? o : on ? (v as string[]).filter((x) => x !== o) : [...(Array.isArray(v) ? v : []), o])} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
            <Text style={{ fontSize: 17, color: base.ink }}>{one ? (on ? '◉' : '○') : on ? '☑' : '☐'}</Text><Text style={{ color: base.ink, flex: 1 }}>{o}</Text>
          </Pressable>
        );
      })}</View>
    );
    else if (q.type === 'file') {
      const list = d.files[q.f as string] || [];
      body = (
        <View>
          {list.map((f, i) => (
            <View key={`${f.path}${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3 }}>
              <Text style={{ flex: 1, color: base.ink }} numberOfLines={1}>📎 {f.name}</Text>
              <Pressable hitSlop={8} onPress={() => update({ ...d, files: { ...d.files, [q.f as string]: list.filter((_, j) => j !== i) } })}><Text style={{ color: base.red }}>✕</Text></Pressable>
            </View>
          ))}
          {(!list.length || q.multi) && <Button kind="ghost" title={list.length ? '⬆ Add another' : '⬆ Add file'} onPress={async () => {
            const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'], multiple: !!q.multi, copyToCacheDirectory: true });
            if (r.canceled) return;
            const added = [...list];
            for (const a of r.assets) {
              if ((a.size || 0) > 25 * 1024 * 1024) { toast(`"${a.name}" is bigger than 25MB — please attach a smaller copy.`); continue; }
              toast(`Uploading ${a.name}…`);
              const up = await uploadSubFile(me, { uri: a.uri, name: a.name || 'file', mimeType: a.mimeType });
              if (up) added.push(up); else toast(`Could not upload ${a.name} — try again.`);
            }
            update({ ...d, files: { ...d.files, [q.f as string]: q.multi ? added : added.slice(-1) } });
          }} />}
        </View>
      );
    } else if (q.type === 'date') body = <DateBox value={String(v ?? '')} onChange={(t) => set(q.k as string, t)} title="Date" style={{ marginBottom: 8 }} />;
    else body = (
      // The operatives list is typed here, one person a line (the sign-up page has a table).
      <TextInput value={Array.isArray(v) ? (v as { name?: string; trade?: string; card?: string; expiry?: string }[]).map((o) => [o.name, o.trade, o.card, o.expiry].filter(Boolean).join(' — ')).join('\n') : String(v ?? '')} onChangeText={(t) => set(q.k as string, t)}
        placeholder={q.ph || (q.type === 'ops' ? 'Name — trade — CSCS card — expiry, one person a line' : 'Your answer')} multiline={q.type === 'textarea' || q.type === 'ops'}
        keyboardType={q.type === 'email' ? 'email-address' : q.type === 'tel' ? 'phone-pad' : q.type === 'number' ? 'number-pad' : 'default'} autoCapitalize={q.type === 'email' ? 'none' : 'sentences'}
        style={[box, q.type === 'textarea' || q.type === 'ops' ? { minHeight: 70 } : null]} />
    );
    return (
      <View key={id} style={{ marginBottom: 14, ...(bad ? { borderLeftWidth: 3, borderLeftColor: base.red, paddingLeft: 8 } : null) }}>
        <Text style={{ fontWeight: '600', color: base.ink, marginBottom: 4 }}>{q.l}{q.req ? <Text style={{ color: base.red }}> *</Text> : null}</Text>
        {!!q.hint && <Muted style={{ marginBottom: 4 }}>{q.hint}</Muted>}
        {body}
        {bad && <Text style={{ color: base.red, fontSize: 12, marginTop: 3 }}>This question is required</Text>}
      </View>
    );
  };
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Subcontractor form' }} />
      {need?.returned != null && (
        <Card style={{ backgroundColor: base.warnBg, borderColor: base.warn }}>
          <Text style={{ fontWeight: '700', color: base.ink, marginBottom: 4 }}>Sent Back For More Information</Text>
          <Text style={{ color: base.ink }}>{need.returned}</Text>
          <Muted style={{ marginTop: 6 }}>Your answers from last time are below. Update what’s needed and send it again.</Muted>
        </Card>
      )}
      <Card style={{ borderTopWidth: 6, borderTopColor: base.blue }}>
        <Text style={{ fontSize: 20, fontWeight: '600', color: base.ink }}>Subcontractor form</Text>
        <Muted>Please fill this in for {org?.name || 'us'} — your company details, insurance, cards and health &amp; safety. It saves as you go, so you can come back to it.</Muted>
        <Text style={{ color: base.red, marginTop: 4 }}>* Required</Text>
      </Card>
      <FinTabs value={String(step)} onChange={(k) => setStep(Number(k))} items={[...sections.map((s, i) => [String(i), s.t] as [string, string]), [String(sections.length), 'Declaration'] as [string, string]]} />
      {sections.map((s, i) => step !== i ? null : (
        <Card key={s.t}>
          <Text style={{ fontWeight: '600', fontSize: 16, color: base.ink, marginBottom: 2 }}>{i + 1}. {s.t}</Text>
          {!!s.hint && <Muted style={{ marginBottom: 8 }}>{s.hint}</Muted>}
          <View style={{ marginTop: 6 }}>{s.q.map(question)}</View>
          <View style={{ alignItems: 'center' }}><Button title={`Next: ${i + 1 < sections.length ? sections[i + 1].t : 'Declaration'} ›`} onPress={() => setStep(i + 1)} /></View>
        </Card>
      ))}
      {step === sections.length && <Card>
        <Text style={{ fontWeight: '600', fontSize: 16, color: base.ink, marginBottom: 8 }}>Declaration</Text>
        <Pressable onPress={() => update({ ...d, agree: !d.agree })} style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
          <Text style={{ fontSize: 17, color: miss?.has('__agree') ? base.red : base.ink }}>{d.agree ? '☑' : '☐'}</Text>
          <Text style={{ flex: 1, color: miss?.has('__agree') ? base.red : base.ink }}>I confirm the information given is true and complete, the insurances above are in force, and I will tell you straight away if anything changes.</Text>
        </Pressable>
        <Text style={{ fontWeight: '600', color: base.ink, marginBottom: 4 }}>Type your full name to sign<Text style={{ color: base.red }}> *</Text></Text>
        <TextInput value={d.signed} onChangeText={(t) => update({ ...d, signed: t })} style={[box, miss?.has('__signed') ? { borderColor: base.red } : null]} />
        <View style={{ marginTop: 12 }}><Button busy={busy} title={busy ? 'Sending…' : 'Submit'} onPress={async () => {
          const m = subformMissing(d, sections);
          if (m.size) {
            setMiss(m);
            const at = sections.findIndex((x) => x.q.some((q) => m.has((q.k || q.f) as string)));
            if (at >= 0) setStep(at);
            toast('Please answer the questions marked in red.'); return;
          }
          setMiss(null); setBusy(true);
          const ok = await sendSubform(me, d); setBusy(false);
          if (!ok) { toast('Could not send — check signal and try again.'); return; }
          toast('Thanks — your form has been sent'); void qc.invalidateQueries({ queryKey: ['subformNeeded'] }); router.replace('/home' as never);
        }} /></View>
      </Card>}
    </ScrollView>
  );
}
