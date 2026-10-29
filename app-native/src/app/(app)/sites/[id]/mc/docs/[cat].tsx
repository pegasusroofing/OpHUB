// A Main Contractor document folder — Construction Phase Plan, Asbestos Register
// or F10 Notification (530 renderMcDocuments). Everyone views; managers upload,
// rename and delete.
import * as DocumentPicker from 'expo-document-picker';
import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { confirmAsk, promptText, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted, Toggle } from '@/components/ui';
import { nameOf, openDocLink, usePeople } from '@/data/hs';
import { deleteMcDoc, MC_DOC_LABEL, renameMcDoc, uploadMcDoc, useMcDocs } from '@/data/mc';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { base, page, radius, space } from '@/theme/theme';

export default function McDocs() {
  const { id, cat } = useLocalSearchParams<{ id: string; cat: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: docs, isLoading } = useMcDocs(id, cat);
  const { data: people } = usePeople();
  const [open, setOpen] = useState<boolean | null>(null);
  const [name, setName] = useState('');
  const [file, setFile] = useState<{ uri: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  const mgr = isManager(me);
  const label = MC_DOC_LABEL[cat] ?? 'Documents';
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['mcDocs', id, cat] }); void qc.invalidateQueries({ queryKey: ['mcTiles', id] }); };
  const isOpen = open ?? !docs?.length;
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: label }} />
      {isLoading ? <Muted>Loading…</Muted> : docs?.length ? docs.map((d) => (
        <Card key={d.id}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Text style={{ flex: 1, fontSize: 16.5, fontWeight: '800', color: base.ink }}>{d.name}</Text>
            {mgr && <Pressable hitSlop={6} onPress={async () => { const n = (await promptText('Rename document', d.name))?.trim(); if (n && n !== d.name && await renameMcDoc(d.id, n)) { toast('Renamed'); refresh(); } }}><Text>✏️</Text></Pressable>}
            {mgr && <Pressable hitSlop={6} onPress={async () => { if (await confirmAsk('Delete this document?', 'Delete') && await deleteMcDoc(d)) { toast('Deleted'); refresh(); } }}><Text>🗑</Text></Pressable>}
          </View>
          <Muted>Uploaded by {nameOf(people, d.uploaded_by)} · {new Date(d.uploaded_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</Muted>
          <Button title="📄 View Document" onPress={async () => { const u = await openDocLink('mc-documents', d.storage_path); if (u) void Linking.openURL(u); else toast('Could not open the document.'); }} />
        </Card>
      )) : <Empty>No documents uploaded.</Empty>}
      {mgr && (
        <>
          <Toggle title={`Upload ${label}`} open={isOpen} onPress={() => setOpen(!isOpen)} />
          {isOpen && (
            <Card>
              <TextInput value={name} onChangeText={setName} placeholder="Document name" style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, marginBottom: 8 }} />
              <Button kind="ghost" title={file ? `📄 ${file.name}` : 'Choose PDF'} onPress={async () => {
                const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
                if (!r.canceled && r.assets[0]) { setFile({ uri: r.assets[0].uri, name: r.assets[0].name || 'document.pdf' }); if (!name.trim()) setName((r.assets[0].name || '').replace(/\.pdf$/i, '')); }
              }} />
              <Button busy={busy} title="Upload" onPress={async () => {
                if (!name.trim() || !file) { toast('Add a name and choose a PDF.'); return; }
                setBusy(true); const ok = await uploadMcDoc(me, id, cat, name.trim(), file); setBusy(false);
                if (ok) { toast('Uploaded'); setName(''); setFile(null); setOpen(false); refresh(); } else toast('Could not upload — try again.');
              }} />
            </Card>
          )}
        </>
      )}
    </ScrollView>
  );
}
