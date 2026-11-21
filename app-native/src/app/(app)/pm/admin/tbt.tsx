// Admin Centre › H&S › Toolbox Talks (260 tbt, 300 addTbtTemplate / deleteTbtTemplate), admins only. Since 19 Nov 2026
// (Andy: "move the toolbox talks required into the toolbox talks templates and have the tab header as toolbox talks"):
// how often each live project needs a talk, at the top; then the company's talks, copied into every new site's TBT
// Library and offered on every project's. A talk can be uploaded as a PDF, or made here with Create A Toolbox Talk in
// RTB Roofing's layout (Andy, the same evening: "create a tbt which mimics the existing designs in rtb roofing"); one
// made here opens again with ✎ Edit. Andy, 21 Nov 2026: a TBT Library heading, then Create TBT and Upload TBT side by side;
// each asks for the talk's name first, and Upload takes any file (a PDF, a Word document, a picture...).
import * as DocumentPicker from 'expo-document-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { TbtRequiredCard } from '@/app/(app)/pm/admin/tbtrule';
import { viewDoc } from '@/components/DocViewer';
import { TbtBuilder } from '@/components/TbtBuilder';
import { confirmAsk, promptText, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted, SectionTitle } from '@/components/ui';
import { openDocLink } from '@/data/hs';
import { useAuth } from '@/lib/auth';
import { blankTbt, readTbt, type TbtBuild } from '@/lib/rules/tbtBuilder';
import { supabase } from '@/lib/supabase';
import { base, page, space } from '@/theme/theme';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
type Tpl = { id: string; title: string; storage_path: string; created_at: string; builder?: unknown };

export default function TbtTemplates() {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [building, setBuilding] = useState<{ id: string | null; start: TbtBuild; path?: string | null } | null>(null);
  const { data: list = [], isLoading } = useQuery({
    queryKey: ['tbtTemplates', me?.org_id], enabled: !!me,
    queryFn: async () => ((await db.from('tbt_templates').select('*').eq('org_id', me?.org_id as string).order('created_at', { ascending: false })).data as Tpl[] | null) ?? [],
  });
  if (!me) return null;
  if (me.role !== 'admin') return <><Stack.Screen options={{ title: 'Toolbox Talks' }} /><Muted style={{ padding: space.l }}>Company admins only.</Muted></>;
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['tbtTemplates'] }); };
  const askName = async () => { const n = (await promptText('Name Of The Toolbox Talk', '', { placeholder: 'e.g. Alcohol & Drugs', ok: 'Next' }))?.trim(); return n || null; };
  const create = async () => { const name = await askName(); if (name) setBuilding({ id: null, start: { ...blankTbt(), title: name } }); };
  const upload = async () => {
    const name = await askName(); if (!name) return;
    const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (r.canceled || !r.assets[0]) return;
    const file = r.assets[0];
    setBusy(true);
    try {
      const id = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}`;
      const up = await supabase.storage.from('rams-docs').upload(`${me.org_id}/tbt-templates/${id}-${(file.name || 'talk').replace(/[^a-z0-9.-]+/gi, '_')}`, await (await fetch(file.uri)).arrayBuffer(), { contentType: file.mimeType || 'application/octet-stream' });
      if (up.error) { toast('Upload failed — try again.'); return; }
      if ((await db.from('tbt_templates').insert({ org_id: me.org_id, title: name, storage_path: up.data.path, created_by: me.id } as never)).error) { toast('Could not save — try again.'); return; }
      refresh();
    } catch { toast('Upload failed — try again.'); } finally { setBusy(false); }
  };
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
      <SectionTitle>TBT Library</SectionTitle>
      <Muted style={{ marginBottom: 10 }}>Your company&apos;s toolbox talks. Each one is copied into the TBT Library of every new project, so standard talks (e.g. Alcohol &amp; Drugs, Manual Handling) are there without uploading them for each job.</Muted>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
        <Button small title="+ Create TBT" onPress={() => void create()} />
        <Button small kind="ghost" busy={busy} title="⬆ Upload TBT" onPress={() => void upload()} />
      </View>
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
      )) : <Empty>No toolbox talks yet. Create one, or upload one; either way it goes into every new project&apos;s TBT Library.</Empty>}
    </ScrollView>
  );
}
