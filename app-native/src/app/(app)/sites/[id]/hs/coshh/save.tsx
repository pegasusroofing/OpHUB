// Save to COSHH Library (820 renderCoshhSaveToLibrary): choose a folder and
// copy one of this job's COSHH documents up into the library. The job's own
// document is untouched — it's a copy, not a move.
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useToast } from '@/components/toast';
import { Button, Empty, Muted } from '@/components/ui';
import { saveSiteDocToLibrary, useFolderView } from '@/data/coshhLib';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { base, radius, space } from '@/theme/theme';

export default function CoshhSave() {
  const { name, path } = useLocalSearchParams<{ id: string; name: string; path: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [folderId, setFolderId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { data, isLoading } = useFolderView(me?.org_id, folderId);
  if (!me) return null;
  if (!isManager(me) || !path) return <Muted style={{ padding: space.l }}>Nothing to save.</Muted>;
  const cur = data?.current ?? null;
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <Stack.Screen options={{ title: 'Save to COSHH Library' }} />
      <Muted style={{ marginBottom: 10 }}>Choose where to save &quot;{name}&quot; in the Admin Centre COSHH Library.</Muted>
      <Text style={{ fontWeight: '800', color: base.ink, marginBottom: 8 }}>{cur ? cur.name : 'Element of Works'}</Text>
      {cur && <View style={{ marginBottom: 10 }}><Button kind="ghost" title="‹ Up one level" onPress={() => setFolderId(cur.parent_id)} /></View>}
      {isLoading ? <Muted>Loading…</Muted> : data?.subfolders.length ? data.subfolders.map((f) => (
        <Pressable key={f.id} onPress={() => setFolderId(f.id)} style={{ padding: 11, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 6, backgroundColor: base.card }}>
          <Text style={{ fontWeight: '700', color: base.ink }}>📁 {f.name}</Text>
        </Pressable>
      )) : <Empty>No subfolders here.</Empty>}
      <View style={{ marginTop: 14 }}><Button busy={busy} title={`Save to ${cur ? `"${cur.name}"` : 'the top level'}`} onPress={async () => {
        setBusy(true);
        try {
          if (!(await saveSiteDocToLibrary(me, { name: name || 'COSHH.pdf', storage_path: path }, folderId))) { toast('Could not save — check signal and try again.'); return; }
          void qc.invalidateQueries({ queryKey: ['coshhFolder'] });
          toast('Saved to Admin Centre COSHH Library'); router.back();
        } finally { setBusy(false); }
      }} /></View>
    </ScrollView>
  );
}
