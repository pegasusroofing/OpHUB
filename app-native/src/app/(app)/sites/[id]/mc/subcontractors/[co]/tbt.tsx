// A subcontractor's Toolbox Talks (550 renderSubTbt): issued straight in as live.
import * as DocumentPicker from 'expo-document-picker';
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { TbtStatusTag } from '@/components/TbtStatusTag';
import { useToast } from '@/components/toast';
import { Button, Card, Empty, Muted, SectionTitle } from '@/components/ui';
import { addSubTbt, useSubco, useSubTbts } from '@/data/subcontractors';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { base, radius, space } from '@/theme/theme';

export default function SubTbt() {
  const { id, co } = useLocalSearchParams<{ id: string; co: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: sub } = useSubco(co, me);
  const { data: talks, isLoading } = useSubTbts(co);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<{ uri: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!me || !sub) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const manage = isManager(me) || sub.isAdmin;
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: `${sub.company.name} — Toolbox Talks` }} />
      {isLoading ? <Muted>Loading…</Muted> : talks?.length ? talks.map((t) => (
        <Pressable key={t.id} onPress={() => router.push(`/sites/${id}/hs/tbt/${t.id}`)}>
          <Card style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '800', color: base.ink }}>{t.title}</Text>
              <Muted>{new Date(t.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</Muted>
            </View>
            <TbtStatusTag status={t.status} />
          </Card>
        </Pressable>
      )) : <Empty>No toolbox talks yet.</Empty>}
      {manage && (
        <Card>
          <SectionTitle>Issue a toolbox talk</SectionTitle>
          <TextInput value={title} onChangeText={setTitle} placeholder="Title, e.g. Working at Height" style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, marginBottom: 8 }} />
          <Button kind="ghost" title={file ? `📄 ${file.name}` : 'Choose PDF'} onPress={async () => { const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true }); if (!r.canceled && r.assets[0]) setFile({ uri: r.assets[0].uri, name: r.assets[0].name || 'talk.pdf' }); }} />
          <Button busy={busy} title="Issue" onPress={async () => {
            if (!title.trim() || !file) { toast('Add a title and choose a PDF.'); return; }
            setBusy(true); const ok = await addSubTbt(me, id, co, title.trim(), file); setBusy(false);
            if (ok) { toast('Toolbox Talk issued'); setTitle(''); setFile(null); void qc.invalidateQueries({ queryKey: ['subTbts', co] }); void qc.invalidateQueries({ queryKey: ['subco', co] }); } else toast('Could not upload — try again.');
          }} />
        </Card>
      )}
    </ScrollView>
  );
}
