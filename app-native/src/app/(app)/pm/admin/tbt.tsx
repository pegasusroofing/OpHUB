// Admin Centre › H&S › Toolbox Talks (260 tbt, 300 addTbtTemplate / deleteTbtTemplate), admins only. Since 19 Nov 2026
// (Andy: "move the toolbox talks required into the toolbox talks templates and have the tab header as toolbox talks"):
// how often each live project needs a talk, at the top; then the company's talks, copied into every new site's TBT
// Library and offered on every project's. A talk can be uploaded as a PDF, or made here with Create A Toolbox Talk in
// RTB Roofing's layout (Andy, the same evening: "create a tbt which mimics the existing designs in rtb roofing"); one
// made here opens again with ✎ Edit.
import * as DocumentPicker from 'expo-document-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { TbtRequiredCard } from '@/app/(app)/pm/admin/tbtrule';
import { viewDoc } from '@/components/DocViewer';
import { TbtBuilder } from '@/components/TbtBuilder';
import { confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted, SectionTitle } from '@/components/ui';
import { openDocLink } from '@/data/hs';
import { useAuth } from '@/lib/auth';
import { blankTbt, readTbt, type TbtBuild } from '@/lib/rules/tbtBuilder';
import { supabase } from '@/lib/supabase';
import { base, page, radius, space } from '@/theme/theme';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
type Tpl = { id: string; title: string; storage_path: string; created_at: string; builder?: unknown };

export default function TbtTemplates() {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [building, setBuilding] = useState<{ id: string | null; start: TbtBuild; path?: string | null } | null>(null);
  const { data: list = [], isLoading } = useQuery({
    queryKey: ['tbtTemplates', me?.org_id], enabled: !!me,
    queryFn: async () => ((await db.from('tbt_templates').select('*').eq('org_id', me?.org_id as string).order('created_at', { ascending: false })).data as Tpl[] | null) ?? [],
  });
  if (!me) return null;
  if (me.role !== 'admin') return <Muted style={{ padding: space.l }}>Company admins only.</Muted>;
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['tbtTemplates'] }); };
  if (building) {
    return (
      <ScrollView contentContainerStyle={page(760)} keyboardShouldPersistTaps="handled">
        <Stack.Screen options={{ title: 'Toolbox Talks' }} />
        <SectionTitle>{building.id ? 'Edit Toolbox Talk' : 'Create A Toolbox Talk'}</SectionTitle>
        <TbtBuilder start={building.start} id={building.id} path={building.path} onClose={() => setBuilding(null)} />
      </ScrollView>
    );
  }
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Toolbox Talks' }} />
      <TbtRequiredCard />
      <SectionTitle>Toolbox Talk Templates</SectionTitle>
      <Muted style={{ marginBottom: 10 }}>Templates here are automatically copied into TBT Library on every new site you create, so standard talks (e.g. Alcohol &amp; Drugs, Manual Handling) are already there without re-uploading per job.</Muted>
      <View style={{ alignItems: 'center', marginBottom: 12 }}><Button title="+ Create A Toolbox Talk" onPress={() => setBuilding({ id: null, start: blankTbt() })} /></View>
      {isLoading ? <Muted>Loading…</Muted> : list.length ? list.map((t) => (
        <Card key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ fontSize: 20 }}>🗣</Text>
          <Pressable style={{ flex: 1 }} onPress={async () => { const u = await openDocLink('rams-docs', t.storage_path); if (u) viewDoc(u); else toast('Could not open the file.'); }}>
            <Text style={{ fontWeight: '600', color: base.ink }}>{t.title}</Text>
            <Muted>{t.builder ? 'Made here' : 'Added'} {new Date(t.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</Muted>
          </Pressable>
          {!!t.builder && <Button small kind="ghost" title="✎ Edit" onPress={() => setBuilding({ id: t.id, start: readTbt(t.builder), path: t.storage_path })} />}
          <Pressable hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove ${t.title}`} onPress={async () => {
            if (!(await confirmAsk('Remove this template? Sites already created keep their copy — this only affects sites created from now on.', 'Yes', 'No'))) return;
            if (!(await db.from('tbt_templates').delete().eq('id', t.id).select('id')).data?.length) toast('Could not remove — try again.');
            refresh();
          }}><Text>🗑</Text></Pressable>
        </Card>
      )) : <Empty>No templates yet — create one, or upload a PDF below; either way it&apos;s pre-loaded into every future site&apos;s TBT Library.</Empty>}
      <Card>
        <Text style={{ fontWeight: '600', color: base.ink, marginBottom: 8 }}>Upload A PDF Instead</Text>
        <TextInput value={title} onChangeText={setTitle} placeholder="Title, e.g. Alcohol & Drugs" style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, marginBottom: 8 }} />
        {/* One centred row (UI check, 20 Nov 2026). */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
        <Button small kind="ghost" title={file ? `📎 ${file.name}` : 'Choose PDF'} onPress={async () => { const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true }); if (!r.canceled && r.assets[0]) setFile(r.assets[0]); }} />
        <Button small busy={busy} title="Add To Bank" onPress={async () => {
          if (!title.trim() || !file) { toast('Add a title and choose a PDF.'); return; }
          setBusy(true);
          try {
            const id = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}`;
            const up = await supabase.storage.from('rams-docs').upload(`${me.org_id}/tbt-templates/${id}-${(file.name || 'talk.pdf').replace(/[^a-z0-9.-]+/gi, '_')}`, await (await fetch(file.uri)).arrayBuffer(), { contentType: 'application/pdf' });
            if (up.error) { toast('Upload failed — try again.'); return; }
            if ((await db.from('tbt_templates').insert({ org_id: me.org_id, title: title.trim(), storage_path: up.data.path, created_by: me.id } as never)).error) { toast('Could not save — try again.'); return; }
            setTitle(''); setFile(null); refresh();
          } finally { setBusy(false); }
        }} />
        </View>
      </Card>
    </ScrollView>
  );
}
