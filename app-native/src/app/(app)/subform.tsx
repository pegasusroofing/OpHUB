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
import { loadSubDraft, saveSubDraft, sendSubform, uploadSubFile, useSubformNeeded } from '@/data/subform';
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
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (me) void loadSubDraft(me).then(setD); }, [me]);
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
    if (q.type === 'radio' || q.type === 'checks') body = (
      <View style={{ gap: 4 }}>{(q.o || []).map((o) => {
        const on = q.type === 'radio' ? v === o : Array.isArray(v) && v.includes(o);
        return (
          <Pressable key={o} onPress={() => set(q.k as string, q.type === 'radio' ? o : on ? (v as string[]).filter((x) => x !== o) : [...(Array.isArray(v) ? v : []), o])} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
            <Text style={{ fontSize: 17, color: base.ink }}>{q.type === 'radio' ? (on ? '◉' : '○') : on ? '☑' : '☐'}</Text><Text style={{ color: base.ink, flex: 1 }}>{o}</Text>
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
    } else body = (
      <TextInput value={String(v ?? '')} onChangeText={(t) => set(q.k as string, t)} placeholder={q.ph || (q.type === 'date' ? 'YYYY-MM-DD' : 'Your answer')} multiline={q.type === 'textarea'}
        keyboardType={q.type === 'email' ? 'email-address' : q.type === 'tel' ? 'phone-pad' : 'default'} autoCapitalize={q.type === 'email' ? 'none' : 'sentences'}
        style={[box, q.type === 'textarea' ? { minHeight: 70 } : null]} />
    );
    return (
      <View key={id} style={{ marginBottom: 14, ...(bad ? { borderLeftWidth: 3, borderLeftColor: base.red, paddingLeft: 8 } : null) }}>
        <Text style={{ fontWeight: '700', color: base.ink, marginBottom: 4 }}>{q.l}{q.req ? <Text style={{ color: base.red }}> *</Text> : null}</Text>
        {!!q.hint && <Muted style={{ marginBottom: 4 }}>{q.hint}</Muted>}
        {body}
        {bad && <Text style={{ color: base.red, fontSize: 12, marginTop: 3 }}>This question is required</Text>}
      </View>
    );
  };
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Subcontractor form' }} />
      <Card style={{ borderTopWidth: 6, borderTopColor: base.blue }}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: base.ink }}>Subcontractor form</Text>
        <Muted>Please fill this in for {org?.name || 'us'} — your company details, insurance, cards and health &amp; safety. It saves as you go, so you can come back to it.</Muted>
        <Text style={{ color: base.red, marginTop: 4 }}>* Required</Text>
      </Card>
      {SUBFORM_SECTIONS.map((s, i) => (
        <Card key={s.t}>
          <Text style={{ fontWeight: '800', fontSize: 16, color: base.ink, marginBottom: 2 }}>{i + 1}. {s.t}</Text>
          {!!s.hint && <Muted style={{ marginBottom: 8 }}>{s.hint}</Muted>}
          <View style={{ marginTop: 6 }}>{s.q.map(question)}</View>
        </Card>
      ))}
      <Card>
        <Text style={{ fontWeight: '800', fontSize: 16, color: base.ink, marginBottom: 8 }}>Declaration</Text>
        <Pressable onPress={() => update({ ...d, agree: !d.agree })} style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
          <Text style={{ fontSize: 17, color: miss?.has('__agree') ? base.red : base.ink }}>{d.agree ? '☑' : '☐'}</Text>
          <Text style={{ flex: 1, color: miss?.has('__agree') ? base.red : base.ink }}>I confirm the information given is true and complete, the insurances above are in force, and I will tell you straight away if anything changes.</Text>
        </Pressable>
        <Text style={{ fontWeight: '700', color: base.ink, marginBottom: 4 }}>Type your full name to sign<Text style={{ color: base.red }}> *</Text></Text>
        <TextInput value={d.signed} onChangeText={(t) => update({ ...d, signed: t })} style={[box, miss?.has('__signed') ? { borderColor: base.red } : null]} />
        <View style={{ marginTop: 12 }}><Button busy={busy} title={busy ? 'Sending…' : 'Submit'} onPress={async () => {
          const m = subformMissing(d);
          if (m.size) { setMiss(m); toast('Please answer the questions marked in red.'); return; }
          setMiss(null); setBusy(true);
          const ok = await sendSubform(me, d); setBusy(false);
          if (!ok) { toast('Could not send — check signal and try again.'); return; }
          toast('Thanks — your form has been sent'); void qc.invalidateQueries({ queryKey: ['subformNeeded'] }); router.replace('/home' as never);
        }} /></View>
      </Card>
    </ScrollView>
  );
}
