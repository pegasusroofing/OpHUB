// Admin Centre › Toolbox Talk Templates (260 tbt, 300 addTbtTemplate /
// deleteTbtTemplate), admins only: talks copied into every new site's Bank TBT.
import * as DocumentPicker from 'expo-document-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted } from '@/components/ui';
import { openDocLink } from '@/data/hs';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { base, radius, space } from '@/theme/theme';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
type Tpl = { id: string; title: string; storage_path: string; created_at: string };

export default function TbtTemplates() {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const { data: list = [], isLoading } = useQuery({
    queryKey: ['tbtTemplates', me?.org_id], enabled: !!me,
    queryFn: async () => ((await db.from('tbt_templates').select('*').eq('org_id', me?.org_id as string).order('created_at', { ascending: false })).data as Tpl[] | null) ?? [],
  });
  if (!me) return null;
  if (me.role !== 'admin') return <Muted style={{ padding: space.l }}>Company admins only.</Muted>;
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['tbtTemplates'] }); };
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Toolbox Talk Templates' }} />
      <Muted style={{ marginBottom: 10 }}>Templates here are automatically copied into Bank TBT on every new site you create, so standard talks (e.g. Alcohol &amp; Drugs, Manual Handling) are already there without re-uploading per job.</Muted>
      {isLoading ? <Muted>Loading…</Muted> : list.length ? list.map((t) => (
        <Card key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ fontSize: 20 }}>🗣</Text>
          <Pressable style={{ flex: 1 }} onPress={async () => { const u = await openDocLink('rams-docs', t.storage_path); if (u) void Linking.openURL(u); else toast('Could not open the file.'); }}>
            <Text style={{ fontWeight: '700', color: base.ink }}>{t.title}</Text>
            <Muted>Added {new Date(t.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</Muted>
          </Pressable>
          <Pressable hitSlop={8} onPress={async () => {
            if (!(await confirmAsk('Remove this template? Sites already created keep their copy — this only affects sites created from now on.', 'Remove'))) return;
            toast((await db.from('tbt_templates').delete().eq('id', t.id)).error ? 'Could not remove — try again.' : 'Template removed'); refresh();
          }}><Text>🗑</Text></Pressable>
        </Card>
      )) : <Empty>No templates yet — anything you upload here will be pre-loaded into every future site&apos;s Bank TBT.</Empty>}
      <Card>
        <TextInput value={title} onChangeText={setTitle} placeholder="Title, e.g. Alcohol & Drugs" style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, marginBottom: 8 }} />
        <Button kind="ghost" title={file ? `📎 ${file.name}` : 'Choose PDF'} onPress={async () => { const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true }); if (!r.canceled && r.assets[0]) setFile(r.assets[0]); }} />
        <View style={{ marginTop: 4 }}><Button busy={busy} title="Add to Bank" onPress={async () => {
          if (!title.trim() || !file) { toast('Add a title and choose a PDF.'); return; }
          setBusy(true);
          try {
            const id = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}`;
            const up = await supabase.storage.from('rams-docs').upload(`${me.org_id}/tbt-templates/${id}-${(file.name || 'talk.pdf').replace(/[^a-z0-9.-]+/gi, '_')}`, await (await fetch(file.uri)).arrayBuffer(), { contentType: 'application/pdf' });
            if (up.error) { toast('Upload failed — try again.'); return; }
            if ((await db.from('tbt_templates').insert({ org_id: me.org_id, title: title.trim(), storage_path: up.data.path, created_by: me.id } as never)).error) { toast('Could not save — try again.'); return; }
            toast('Added to the Toolbox Talk Bank'); setTitle(''); setFile(null); refresh();
          } finally { setBusy(false); }
        }} /></View>
      </Card>
    </ScrollView>
  );
}
