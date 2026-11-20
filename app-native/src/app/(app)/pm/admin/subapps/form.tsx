// Edit the subcontractor sign-up form (Andy, 19 Nov 2026: "the sub contractor sign up form in settings, needs an edit
// button added as i need to edit the template"). Sections and questions: rename, move, remove, add; each question's
// type, required or not, options, hint and example. Company Name, Your Name, Email and Mobile always stay (the
// application is filed by them). Save puts it on the sign-up link and the in-app form; Back To Standard Form undoes it.
// In tabs (Andy, 20 Nov 2026: "change the 7 items into tab style"): one tab per section, Save and Next at the bottom.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { YesNo } from '@/components/OneDriveSettings';
import { chooseAction, confirmAsk, showAlert } from '@/components/toast';
import { Button, Card, Muted } from '@/components/ui';
import { FinTabs } from '@/components/FinNav';
import { subSignUpLink } from '@/data/admin';
import { loadSubformTemplate, resetSubformTemplate, saveSubformTemplate } from '@/data/subform';
import { useAuth } from '@/lib/auth';
import { newSubKey, SUB_TYPES, subId, subTemplate, type SubQ, type SubQType, type SubSection } from '@/lib/rules/subform';
import { base, page, radius, space } from '@/theme/theme';

const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 9, color: base.ink, backgroundColor: base.card, marginBottom: 8 } as const;
const TYPE_LABEL = Object.fromEntries(SUB_TYPES) as Record<SubQType, string>;

export default function EditSignUpForm() {
  const { me } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ['subformTemplateEdit', me?.org_id], enabled: !!me?.org_id, gcTime: 0, queryFn: () => loadSubformTemplate(me?.org_id) });
  if (!me) return null;
  if (me.role !== 'admin' && me.role !== 'superadmin') return <Muted style={{ padding: space.l }}>Company admins only.</Muted>;
  if (isLoading || !data) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  return <Editor initial={data.sections} custom={data.custom} orgId={me.org_id as string} />;
}

function Editor({ initial, custom, orgId }: { initial: SubSection[]; custom: boolean; orgId: string }) {
  const qc = useQueryClient();
  const [secs, setSecs] = useState<SubSection[]>(() => JSON.parse(JSON.stringify(initial)) as SubSection[]);
  const [edit, setEdit] = useState<string | null>(null);
  const [state, setState] = useState(custom ? 'Your own form' : 'The standard form');
  const [busy, setBusy] = useState('');
  const [tab, setTab] = useState(0);
  const change = (fn: (s: SubSection[]) => SubSection[]) => { setSecs((s) => fn(JSON.parse(JSON.stringify(s)) as SubSection[])); setState('Not saved yet - press Save'); };
  const setQ = (si: number, qi: number, patch: Partial<SubQ>) => change((s) => { s[si].q[qi] = { ...s[si].q[qi], ...patch }; return s; });
  const move = <T,>(arr: T[], i: number, d: -1 | 1) => { const j = i + d; if (j < 0 || j >= arr.length) return arr; [arr[i], arr[j]] = [arr[j], arr[i]]; return arr; };
  const icon = (l: string, on: () => void, dis = false, label = l) => <Pressable key={l} accessibilityLabel={label} disabled={dis} onPress={on} hitSlop={6} style={{ opacity: dis ? 0.3 : 1 }}><Text style={{ fontSize: 16 }}>{l}</Text></Pressable>;

  const question = (q: SubQ, si: number, qi: number) => {
    const id = `${si}:${qi}`, open = edit === id, type = q.type || 'text';
    return (
      <View key={`${subId(q)}-${qi}`} style={{ borderTopWidth: 1, borderTopColor: base.line, paddingVertical: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable style={{ flex: 1 }} onPress={() => setEdit(open ? null : id)}>
            <Text style={{ fontWeight: '600', color: base.ink }}>{q.core ? '🔒 ' : ''}{q.l}{q.req ? <Text style={{ color: base.red }}> *</Text> : null}</Text>
            <Muted>{TYPE_LABEL[type]}{(type === 'radio' || type === 'checks') && q.o?.length ? ` · ${q.o.length} options` : ''}{q.showIf ? ' · only shown on a Yes' : ''}</Muted>
          </Pressable>
          {icon('↑', () => change((s) => { move(s[si].q, qi, -1); return s; }), qi === 0, 'Move up')}
          {icon('↓', () => change((s) => { move(s[si].q, qi, 1); return s; }), qi === secs[si].q.length - 1, 'Move down')}
          {icon('✎', () => setEdit(open ? null : id), false, 'Edit question')}
          {!q.core && icon('🗑', async () => { if (await confirmAsk(`Remove "${q.l}" from the form?`, 'Yes', 'No')) { change((s) => { s[si].q.splice(qi, 1); return s; }); setEdit(null); } }, false, 'Remove question')}
        </View>
        {open && (
          <View style={{ marginTop: 8, paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: base.line }}>
            <Muted style={{ fontWeight: '600' }}>Question</Muted>
            <TextInput value={q.l} onChangeText={(t) => setQ(si, qi, { l: t })} style={box} />
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
              <Pressable disabled={!!q.core} onPress={async () => {
                const k = await chooseAction('Answer Type', SUB_TYPES.map(([v, l]) => ({ key: v, label: `${v === type ? '✓ ' : ''}${l}` })));
                if (!k) return;
                const t = k as SubQType;
                setQ(si, qi, t === 'file' ? { type: t, f: q.f || q.l, k: undefined } : { type: t, k: q.k || newSubKey(), f: undefined, ...(t === 'radio' || t === 'checks' ? { o: q.o?.length ? q.o : ['Option 1', 'Option 2'] } : {}) });
              }} style={{ ...box, marginBottom: 0, opacity: q.core ? 0.5 : 1 }}><Text style={{ color: base.ink }}>{TYPE_LABEL[type]} ▾</Text></Pressable>
              <Text style={{ color: base.ink }}>Required?</Text>
              {q.core ? <Muted>Always</Muted> : <YesNo label="Required" value={!!q.req} onChange={(v) => setQ(si, qi, { req: v ? 1 : undefined })} />}
            </View>
            {(type === 'radio' || type === 'checks') && (
              <>
                <Muted style={{ fontWeight: '600' }}>Options (One Per Line)</Muted>
                <TextInput multiline value={(q.o || []).join('\n')} onChangeText={(t) => setQ(si, qi, { o: t.split('\n') })} style={[box, { minHeight: 90, textAlignVertical: 'top' }]} />
              </>
            )}
            {type === 'file' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Text style={{ color: base.ink }}>More Than One File?</Text>
                <YesNo label="More than one file" value={!!q.multi} onChange={(v) => setQ(si, qi, { multi: v ? 1 : undefined })} />
              </View>
            )}
            <Muted style={{ fontWeight: '600' }}>Help Text Under The Question (Optional)</Muted>
            <TextInput value={q.hint || ''} onChangeText={(t) => setQ(si, qi, { hint: t || undefined })} style={box} />
            {!['radio', 'checks', 'yesno', 'date', 'file', 'ops'].includes(type) && (
              <>
                <Muted style={{ fontWeight: '600' }}>Example In The Box (Optional)</Muted>
                <TextInput value={q.ph || ''} onChangeText={(t) => setQ(si, qi, { ph: t || undefined })} style={box} />
              </>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Text style={{ color: base.ink }}>Half Width On A Laptop?</Text>
              <YesNo label="Half width on a laptop" value={!!q.half} onChange={(v) => setQ(si, qi, { half: v ? 1 : undefined })} />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'center' }}><Button small title="Done" onPress={() => setEdit(null)} /></View>
          </View>
        )}
      </View>
    );
  };

  return (
    <ScrollView contentContainerStyle={page(820)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Edit Sign-Up Form' }} />
      <Text style={{ fontSize: 19, fontWeight: '600', color: base.ink }}>Subcontractor Sign-Up Form</Text>
      <Muted style={{ marginBottom: 4 }}>{state}</Muted>
      <Muted style={{ marginBottom: 10 }}>Changes show on your sign-up link and on the form operatives fill in, once you press Save. Company Name, Your Name, Email and Mobile (🔒) always stay; the declaration and signature are always at the end.</Muted>
      <FinTabs value={String(Math.min(tab, secs.length - 1))} onChange={(k) => setTab(Number(k))} items={secs.map((x, i) => [String(i), `${i + 1}. ${x.t || 'Section'}`] as [string, string])} />
      {secs.map((s, si) => si !== Math.min(tab, secs.length - 1) ? null : (
        <Card key={`sec-${si}`}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ fontWeight: '700', color: base.slate }}>{si + 1}.</Text>
            <TextInput value={s.t} onChangeText={(t) => change((x) => { x[si].t = t; return x; })} accessibilityLabel={`Section ${si + 1} title`} style={[box, { flex: 1, marginBottom: 0, fontWeight: '600' }]} />
            {icon('↑', () => { change((x) => move(x, si, -1)); setTab(Math.max(0, si - 1)); }, si === 0, 'Move section up')}
            {icon('↓', () => { change((x) => move(x, si, 1)); setTab(Math.min(secs.length - 1, si + 1)); }, si === secs.length - 1, 'Move section down')}
            {icon('🗑', async () => {
              if (s.q.some((q) => q.core)) { showAlert('This section has a 🔒 question in it. Move that question to another section first.'); return; }
              if (await confirmAsk(`Remove the section "${s.t}" and its ${s.q.length} question${s.q.length === 1 ? '' : 's'}?`, 'Yes', 'No')) change((x) => { x.splice(si, 1); return x; });
            }, false, 'Remove section')}
          </View>
          <TextInput value={s.hint || ''} onChangeText={(t) => change((x) => { x[si].hint = t || undefined; return x; })} placeholder="Note under the section title (optional)" placeholderTextColor={base.slateLight} style={[box, { marginTop: 6 }]} />
          {s.q.map((q, qi) => question(q, si, qi))}
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            <Button small kind="ghost" title="+ Add Question" onPress={() => { change((x) => { x[si].q.push({ k: newSubKey(), l: 'New Question', type: 'text' }); return x; }); setEdit(`${si}:${s.q.length}`); }} />
          </View>
        </Card>
      ))}
      <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 10 }}>
        <Button small kind="ghost" title="+ Add Section" onPress={() => { change((x) => [...x, { t: 'New Section', q: [{ k: newSubKey(), l: 'New Question', type: 'text' }] }]); setTab(secs.length); }} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <Button busy={busy === 'save'} title="Save" onPress={async () => {
          const clean = subTemplate(secs.map((s) => ({ ...s, q: s.q.map((q) => ({ ...q, ...(q.o ? { o: q.o.map((o) => o.trim()).filter(Boolean) } : {}) })) })));
          const empty = clean.find((s) => !s.t.trim() || s.q.some((q) => !q.l.trim()));
          if (empty) { showAlert('Every section and question needs a name before saving.'); return; }
          const noOpts = clean.flatMap((s) => s.q).find((q) => (q.type === 'radio' || q.type === 'checks') && !(q.o || []).length);
          if (noOpts) { showAlert(`"${noOpts.l}" needs at least one option.`); return; }
          setBusy('save'); const ok = await saveSubformTemplate(orgId, clean); setBusy('');
          if (!ok) { setState('Could not save - try again'); return; }
          setSecs(clean); setState('Saved - your sign-up form now uses this');
          void qc.invalidateQueries({ queryKey: ['subformTemplate'] });
        }} />
        <Button kind="ghost" title="👁 Preview The Form" onPress={() => void Linking.openURL(subSignUpLink(orgId))} />
        {tab < secs.length - 1 && <Button kind="ghost" title={`Next: ${secs[tab + 1]?.t || 'Section'} ›`} onPress={() => setTab(tab + 1)} />}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 24 }}>
        <Button small kind="ghost" busy={busy === 'reset'} title="Back To The Standard Form" onPress={async () => {
          if (!(await confirmAsk('Put the form back to the standard OpHUB questions? Your changes are removed.', 'Yes', 'No'))) return;
          setBusy('reset'); const ok = await resetSubformTemplate(orgId); setBusy('');
          if (!ok) { setState('Could not reset - try again'); return; }
          setSecs(subTemplate(null)); setState('The standard form'); setEdit(null);
          void qc.invalidateQueries({ queryKey: ['subformTemplate'] });
        }} />
      </View>
    </ScrollView>
  );
}
