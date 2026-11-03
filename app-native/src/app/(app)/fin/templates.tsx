// Finance › Settings › Templates (Andy, 3 Nov 2026): the wording of the emails Finance sends, by kind. Each kind has
// one default, picked first in the send pop-up; the rest are in its drop-down. A template can leave the company logo
// off or add more logos (e.g. accreditations) under the signature.
import * as DocumentPicker from 'expo-document-picker';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';

import { FinForm } from '@/components/FinForm';
import { FinPage, FinRow, finSettingsGo } from '@/components/FinNav';
import { useToast } from '@/components/toast';
import { Button, Card, Muted, SectionTitle } from '@/components/ui';
import { deleteTemplate, saveTemplate, TPL_FIELDS, TPL_KINDS, TPL_STANDARD, uploadTemplateLogo, useTemplates, type Tpl, type TplKind } from '@/data/finTemplates';
import { useAuth } from '@/lib/auth';
import { base } from '@/theme/theme';

export default function FinTemplates() {
  const { me } = useAuth();
  const { data: list = [] } = useTemplates(me?.org_id);
  const [edit, setEdit] = useState<Partial<Tpl> | null>(null);
  if (!me) return null;
  const startNew = (kind: TplKind) => setEdit({ kind, name: '', subject: TPL_STANDARD[kind].subject, body: TPL_STANDARD[kind].body, is_default: !list.some((t) => t.kind === kind && t.is_default), show_logo: true, logos: [] });
  return (
    <FinPage title="Templates" section="settings" sub="templates" onSub={(k) => { if (k !== 'templates') finSettingsGo(k); }}>
      <Muted style={{ marginBottom: 10 }}>The wording of the emails Finance sends. The default for each kind is picked first when you send; you can still choose another or change the words before sending. Fill-ins: {TPL_FIELDS}</Muted>
      <View style={{ alignSelf: 'flex-start', marginBottom: 8 }}><Button title="+ New Template" onPress={() => startNew('application')} /></View>
      {TPL_KINDS.map(([k, l]) => {
        const mine = list.filter((t) => t.kind === k);
        return (
          <View key={k}>
            <SectionTitle>{l}</SectionTitle>
            {mine.length ? mine.map((t) => <FinRow compact key={t.id} title={t.name} sub={t.subject || ''} right={t.is_default ? 'Default' : ''} tone={base.blue} onPress={() => setEdit(t)} />)
              : <Card><Muted>Using the standard wording.</Muted><Pressable onPress={() => startNew(k)}><Text style={{ color: base.blue, fontWeight: '500', marginTop: 6 }}>+ Make your own</Text></Pressable></Card>}
          </View>
        );
      })}
      {edit && <TemplateForm t={edit} onClose={() => setEdit(null)} />}
    </FinPage>
  );
}

function TemplateForm({ t, onClose }: { t: Partial<Tpl>; onClose: () => void }) {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [logos, setLogos] = useState<string[]>(t.logos || []);
  const [adding, setAdding] = useState(false);
  if (!me?.org_id) return null;
  const orgId = me.org_id;
  const refresh = () => void qc.invalidateQueries({ queryKey: ['finTpl'] });
  return (
    <FinForm title={t.id ? 'Edit Template' : 'New Template'} onClose={onClose}
      note={`Fill-ins: ${TPL_FIELDS}. Your name, company details and logo go under the message.`}
      initial={{ name: t.name, kind: t.kind, subject: t.subject, body: t.body, is_default: t.is_default, show_logo: t.show_logo !== false }}
      fields={[
        { k: 'name', label: 'Name', ph: 'e.g. Standard application', half: true },
        { k: 'kind', label: 'For', kind: 'choice', options: TPL_KINDS, half: true },
        { k: 'subject', label: 'Subject' },
        { k: 'body', label: 'Message', kind: 'multiline' },
        { k: 'is_default', label: 'Default for this kind', kind: 'check' },
        { k: 'show_logo', label: 'Show the company logo', kind: 'check' },
      ]}
      extra={(
        <View style={{ marginTop: 8 }}>
          <Muted style={{ fontWeight: '500', marginBottom: 6 }}>More logos under the signature (e.g. accreditations)</Muted>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {logos.map((u) => (
              <View key={u} style={{ borderWidth: 1, borderColor: base.cardLine, borderRadius: 8, padding: 4, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Image source={{ uri: u }} style={{ width: 64, height: 36 }} resizeMode="contain" />
                <Pressable accessibilityRole="button" accessibilityLabel="Remove logo" hitSlop={8} onPress={() => setLogos(logos.filter((x) => x !== u))}><Text style={{ color: base.slate }}>✕</Text></Pressable>
              </View>
            ))}
            {logos.length < 6 && <Button small kind="ghost" busy={adding} title="+ Add Logo" onPress={async () => {
              const r = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true }); if (r.canceled || !r.assets[0]) return;
              setAdding(true); const u = await uploadTemplateLogo(orgId, r.assets[0]); setAdding(false);
              if (u) setLogos([...logos, u]); else toast('Could not add that picture — try again.');
            }} />}
          </View>
        </View>
      )}
      onSave={async (v) => {
        const e = await saveTemplate(orgId, { id: t.id, kind: (v.kind || 'application') as TplKind, name: String(v.name || ''), subject: String(v.subject || ''), body: String(v.body || ''), is_default: !!v.is_default, show_logo: !!v.show_logo, logos });
        if (e) return e; toast('Template saved'); refresh(); return null;
      }}
      onDelete={t.id ? async () => { if (!(await deleteTemplate(t.id as string))) return 'Could not remove — try again.'; toast('Template removed'); refresh(); onClose(); return null; } : undefined} />
  );
}
