// A subcontractor's Daily Briefings log (550 renderSubBriefings): a title and an
// optional PDF. RTB managers and the company's admin log and delete them.
import * as DocumentPicker from 'expo-document-picker';
import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, Text, TextInput } from 'react-native';

import { confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted, SectionTitle } from '@/components/ui';
import { nameOf, openDocLink, usePeople } from '@/data/hs';
import { addSubBriefing, deleteSubBriefing, useSubBriefings, useSubco } from '@/data/subcontractors';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { base, page, radius, space } from '@/theme/theme';

export default function SubBriefings() {
  const { id, co } = useLocalSearchParams<{ id: string; co: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: sub } = useSubco(co, me);
  const { data: list, isLoading } = useSubBriefings(co);
  const { data: people } = usePeople();
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<{ uri: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!me || !sub) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const manage = isManager(me) || sub.isAdmin;
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['subBriefings', co] }); void qc.invalidateQueries({ queryKey: ['subco', co] }); };
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: `${sub.company.name} — Daily Briefings` }} />
      {isLoading ? <Muted>Loading…</Muted> : list?.length ? list.map((b) => (
        <Card key={b.id}>
          <Text style={{ fontWeight: '700', color: base.ink }}>{b.title}</Text>
          <Muted>{nameOf(people, b.submitted_by)} · {new Date(b.submitted_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</Muted>
          {!!b.storage_path && <Pressable onPress={async () => { const u = await openDocLink('rams-docs', b.storage_path as string); if (u) void Linking.openURL(u); }}><Text style={{ color: base.blue }}>View document ↗</Text></Pressable>}
          {manage && <Pressable onPress={async () => { if (await confirmAsk('Delete this briefing?', 'Delete') && await deleteSubBriefing(b.id)) { toast('Deleted'); refresh(); } }}><Text style={{ marginTop: 6 }}>🗑</Text></Pressable>}
        </Card>
      )) : <Empty>No daily briefings logged yet.</Empty>}
      {manage && (
        <Card>
          <SectionTitle>Log a briefing</SectionTitle>
          <TextInput value={title} onChangeText={setTitle} placeholder="e.g. Monday morning briefing" style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, marginBottom: 8 }} />
          <Button kind="ghost" title={file ? `📄 ${file.name}` : 'Choose PDF (optional)'} onPress={async () => { const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true }); if (!r.canceled && r.assets[0]) setFile({ uri: r.assets[0].uri, name: r.assets[0].name || 'briefing.pdf' }); }} />
          <Button busy={busy} title="Log Briefing" onPress={async () => {
            if (!title.trim()) { toast('Add a title.'); return; }
            setBusy(true); const ok = await addSubBriefing(me, id, co, title.trim(), file); setBusy(false);
            if (ok) { toast('Briefing logged'); setTitle(''); setFile(null); refresh(); } else toast('Could not save — try again.');
          }} />
        </Card>
      )}
    </ScrollView>
  );
}
