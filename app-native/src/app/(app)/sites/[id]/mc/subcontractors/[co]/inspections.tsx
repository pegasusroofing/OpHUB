// A subcontractor's Inspections (560): any allocated operative uploads files —
// kept exactly as chosen, never compressed — and the PM is emailed each time.
// Folders (RTB managers / the company admin); managers delete files.
import * as DocumentPicker from 'expo-document-picker';
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { confirmAsk, promptText, useToast } from '@/components/toast';
import { Button, Empty, Muted } from '@/components/ui';
import { viewDoc } from '@/components/DocViewer';
import { nameOf, openDocLink, usePeople } from '@/data/hs';
import { addSubInspection, addSubInspFolder, deleteSubInspection, renameSubInspFolder, useSubco, useSubInspections } from '@/data/subcontractors';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { base, page, radius, space } from '@/theme/theme';

export default function SubInspections() {
  const { id, co, folder } = useLocalSearchParams<{ id: string; co: string; folder?: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: sub } = useSubco(co, me);
  const { data, isLoading } = useSubInspections(co, folder ?? null);
  const { data: people } = usePeople();
  const [busy, setBusy] = useState(false);
  if (!me || !sub) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const mgr = isManager(me);
  const folders = mgr || sub.isAdmin;
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['subInsp', co] }); void qc.invalidateQueries({ queryKey: ['subco', co] }); };
  const row = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, padding: 12, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 8, backgroundColor: base.card };
  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: 'Inspections' }} />
      <Muted style={{ marginBottom: 12 }}>Upload inspection files here — kept full resolution, never compressed — and the site's PM is emailed automatically each time.</Muted>
      {!folder && (data?.folders ?? []).map((f) => (
        <Pressable key={f.id} onPress={() => router.push(`/sites/${id}/mc/subcontractors/${co}/inspections?folder=${f.id}` as never)} style={row}>
          <Text style={{ fontSize: 18 }}>📁</Text>
          <Text style={{ flex: 1, fontWeight: '700', color: base.ink }}>{f.name}</Text>
          {folders && <Pressable hitSlop={6} onPress={async () => { const n = (await promptText('Rename folder', f.name))?.trim(); if (n && n !== f.name && await renameSubInspFolder(f.id, n)) { toast('Renamed'); refresh(); } }}><Text>✏️</Text></Pressable>}
        </Pressable>
      ))}
      {!folder && folders && <Button kind="ghost" title="📁 New Folder" onPress={async () => { const n = (await promptText('Folder name', ''))?.trim(); if (n && await addSubInspFolder(me, id, co, n)) { toast('Folder created'); refresh(); } }} />}
      <Button busy={busy} title="📎 Upload a file (photo, PDF, etc.)" onPress={async () => {
        const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
        if (r.canceled || !r.assets[0]) return;
        setBusy(true); const ok = await addSubInspection(me, id, sub.company, folder ?? null, { uri: r.assets[0].uri, name: r.assets[0].name || 'file', mimeType: r.assets[0].mimeType }); setBusy(false);
        toast(ok ? 'Uploaded' : 'Upload failed.'); refresh();
      }} />
      {isLoading ? <Muted>Loading…</Muted> : data?.files.length ? data.files.map((f) => (
        <View key={f.id} style={row}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', color: base.ink }}>{f.file_name}</Text>
            <Muted>{nameOf(people, f.uploaded_by)} · {new Date(f.uploaded_at).toLocaleString('en-GB')}</Muted>
          </View>
          <Button kind="ghost" title="View" onPress={async () => { const u = await openDocLink('mc-documents', f.storage_path); if (u) viewDoc(u); else toast('Could not open the file.'); }} />
          {mgr && <Pressable hitSlop={6} onPress={async () => { if (await confirmAsk('Delete this inspection file?', 'Delete') && await deleteSubInspection(f.id, f.storage_path)) { toast('Deleted'); refresh(); } }}><Text>🗑</Text></Pressable>}
        </View>
      )) : <Empty>No inspection files {folder ? 'in this folder' : 'uploaded'} yet.</Empty>}
    </ScrollView>
  );
}
