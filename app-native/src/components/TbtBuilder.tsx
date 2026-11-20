// Create A Toolbox Talk (Andy, 19 Nov 2026: "create a tbt which mimics the existing designs in rtb roofing please. add
// it so we can have a template to create"). The boxes of RTB Roofing's talks: Title, Prepare, Reason, Why, Outline,
// sections (heading, points one per line, a question), Questions for you and the closing line. Preview shows the PDF
// in that layout with the company's own name, address and logo; Save puts it in the company's Toolbox Talk templates,
// so it's in every project's TBT Library, and keeps the wording so it can be edited again.
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useCompanyContact } from '@/components/EmailSignature';
import { Button, Card, Field, Muted } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { showPdf } from '@/lib/fileOut';
import { buildTbtPdf } from '@/lib/pdfLazy';
import { blankSection, tbtFileName, tbtProblem, type TbtBuild, type TbtSection } from '@/lib/rules/tbtBuilder';
import { supabase } from '@/lib/supabase';
import { base } from '@/theme/theme';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
const tall = { minHeight: 96, textAlignVertical: 'top' as const, paddingTop: 10 };

export function TbtBuilder({ start, id, path, onClose }: { start: TbtBuild; id: string | null; path?: string | null; onClose: () => void }) {
  const { me, org } = useAuth();
  const qc = useQueryClient();
  const { data: contact } = useCompanyContact(org?.id);
  const [b, setB] = useState<TbtBuild>(start);
  const [busy, setBusy] = useState<'' | 'view' | 'save'>('');
  const [err, setErr] = useState('');
  if (!me?.org_id || !org) return null;
  const orgId = me.org_id;
  const set = (k: keyof TbtBuild) => (v: string) => { setB((o) => ({ ...o, [k]: v })); setErr(''); };
  const setSec = (i: number, k: keyof TbtSection) => (v: string) => { setB((o) => ({ ...o, sections: o.sections.map((s, j) => (j === i ? { ...s, [k]: v } : s)) })); setErr(''); };
  const make = () => buildTbtPdf(b, org, { address: String(contact?.address || ''), phone: String(contact?.phone || '') });
  const preview = async () => {
    setBusy('view'); setErr('');
    try { if (!(await showPdf(await make(), tbtFileName(b.title)))) setErr('Could not show the PDF — try again.'); } catch { setErr('Could not make the PDF — try again.'); } finally { setBusy(''); }
  };
  const save = async () => {
    const p = tbtProblem(b); if (p) { setErr(p); return; }
    setBusy('save'); setErr('');
    try {
      const bytes = await make();
      // Edited: the same file is replaced, so every project's TBT Library keeps one copy, now up to date (bug review, 20 Nov
      // 2026: a new file each time made the library sync add a second). A new file only if that can't be done.
      const fid = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}`;
      const fresh = `${orgId}/tbt-templates/${fid}-${tbtFileName(b.title).replace(/[^a-z0-9.-]+/gi, '_')}`;
      let up = id && path ? await supabase.storage.from('rams-docs').upload(path, bytes, { contentType: 'application/pdf', upsert: true }) : null;
      if (!up || up.error) up = await supabase.storage.from('rams-docs').upload(fresh, bytes, { contentType: 'application/pdf' });
      if (up.error) { setErr('Could not save the PDF — try again.'); return; }
      const row = { title: b.title.trim(), storage_path: up.data.path, builder: b };
      const r = id ? await db.from('tbt_templates').update(row as never).eq('id', id).select('id')
        : await db.from('tbt_templates').insert({ ...row, org_id: orgId, created_by: me.id } as never).select('id');
      if (r.error || !(r.data as unknown[] | null)?.length) { setErr('Could not save — only a company admin can.'); return; }
      await qc.invalidateQueries({ queryKey: ['tbtTemplates'] });
      onClose();
    } catch { setErr('Could not make the PDF — try again.'); } finally { setBusy(''); }
  };
  return (
    <View>
      <Muted style={{ marginBottom: 10 }}>Laid out like RTB Roofing&apos;s toolbox talks, with {org.name}&apos;s name, address and logo at the top and a sign-off sheet at the end. Saved talks go into every project&apos;s TBT Library.</Muted>
      <Card>
        <Field label="Title" value={b.title} onChangeText={set('title')} placeholder="e.g. Safe Working At Height" />
        <Field label="Prepare" value={b.prepare} onChangeText={set('prepare')} placeholder="e.g. Has the company had any incidents in the last 12 months?" />
        <Field label="Reason" value={b.reason} onChangeText={set('reason')} multiline style={tall} placeholder="Why this talk matters, e.g. a fact about injuries" />
        <Field label="Why" value={b.why} onChangeText={set('why')} multiline style={tall} placeholder="What could happen if it goes wrong" />
        <Field label="Outline" value={b.outline} onChangeText={set('outline')} multiline style={tall} placeholder="This talk will cover: …" />
      </Card>
      {b.sections.map((s, i) => (
        <Card key={i}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
            <Text style={{ flex: 1, fontWeight: '600', color: base.ink }}>Section {i + 1}</Text>
            {b.sections.length > 1 && <Pressable accessibilityRole="button" accessibilityLabel={`Remove section ${i + 1}`} hitSlop={8} onPress={() => setB((o) => ({ ...o, sections: o.sections.filter((_, j) => j !== i) }))}><Text style={{ color: base.slate, fontSize: 16 }}>✕</Text></Pressable>}
          </View>
          <Field label="Heading" value={s.heading} onChangeText={setSec(i, 'heading')} placeholder="e.g. Before Working At Height" />
          <Field label="Points (One Per Line, Numbered For You)" value={s.points} onChangeText={setSec(i, 'points')} multiline style={{ ...tall, minHeight: 140 }} placeholder={'e.g. Check the access is safe\nIdentify fragile materials'} />
          <Field label="Question" value={s.question} onChangeText={setSec(i, 'question')} placeholder="e.g. What should be identified before work starts?" />
        </Card>
      ))}
      <View style={{ alignItems: 'center', marginBottom: 12 }}><Button small kind="ghost" title="+ Add Section" onPress={() => setB((o) => ({ ...o, sections: [...o.sections, blankSection()] }))} /></View>
      <Card>
        <Field label="Questions For You (One Per Line)" value={b.questions} onChangeText={set('questions')} multiline style={tall} placeholder={'e.g. When must crawling boards be used?'} />
        <Field label="Closing Line" value={b.remember} onChangeText={set('remember')} placeholder="e.g. Remember there is no safe height to fall from" />
      </Card>
      {err ? <Text style={{ color: '#C0392B', fontWeight: '500', textAlign: 'center', marginBottom: 8 }}>{err}</Text> : null}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 20 }}>
        <View style={{ flex: 1, maxWidth: 170 }}><Button small kind="ghost" busy={busy === 'view'} title="👁 Preview" onPress={() => void preview()} /></View>
        <View style={{ flex: 1, maxWidth: 200 }}><Button small busy={busy === 'save'} title={id ? 'Save Changes' : 'Save Template'} onPress={() => void save()} /></View>
        <View style={{ flex: 1, maxWidth: 140 }}><Button small kind="ghost" title="Cancel" onPress={onClose} /></View>
      </View>
    </View>
  );
}
