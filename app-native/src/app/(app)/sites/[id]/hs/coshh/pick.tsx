// Add from COSHH Library (820 renderCoshhLibraryPick): browse the library's
// folders, tick documents (or a whole folder), and copy them into this job's
// COSHH as normal signable documents. Only PDFs can be signed.
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { showAlert, useToast } from '@/components/toast';
import { Button, Check, Empty, Muted } from '@/components/ui';
import { folderFileIds, importToSite, useFolderView } from '@/data/coshhLib';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { base, page, radius, space } from '@/theme/theme';

export default function CoshhPick() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [folderId, setFolderId] = useState<string | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [busy, setBusy] = useState('');
  const { data, isLoading } = useFolderView(me?.org_id, folderId);
  if (!me) return null;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  const cur = data?.current ?? null;
  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: 'Add from Library' }} />
      <Text style={{ fontWeight: '800', color: base.ink, marginBottom: 8 }}>{cur ? cur.name : 'Element of Works'}</Text>
      {cur && <View style={{ marginBottom: 10 }}><Button kind="ghost" title="‹ Up one level" onPress={() => setFolderId(cur.parent_id)} /></View>}
      {!!data?.subfolders.length && <Muted style={{ marginBottom: 8 }}>Tap a folder to open it, or &quot;Select Folder&quot; to select every document inside it (including subfolders) at once.</Muted>}
      {isLoading ? <Muted>Loading…</Muted> : (
        <>
          {data?.subfolders.map((f) => (
            <Pressable key={f.id} onPress={() => setFolderId(f.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 11, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 6, backgroundColor: base.card }}>
              <Text style={{ flex: 1, fontWeight: '700', color: base.ink }}>📁 {f.name}</Text>
              <Pressable onPress={async () => { const ids = await folderFileIds(f.id); if (!ids.length) { toast(`No documents found in "${f.name}".`); return; } setSel((s) => Array.from(new Set([...s, ...ids]))); toast(`${ids.length} document${ids.length === 1 ? '' : 's'} selected from "${f.name}"`); }} style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, paddingHorizontal: 8, paddingVertical: 4 }}><Text style={{ fontSize: 11, fontWeight: '700', color: base.ink }}>Select Folder</Text></Pressable>
            </Pressable>
          ))}
          {data?.files.map((f) => <Check key={f.id} label={`📄 ${f.name}`} value={sel.includes(f.id)} onChange={(v) => setSel(v ? [...sel, f.id] : sel.filter((x) => x !== f.id))} />)}
          {!data?.subfolders.length && !data?.files.length && <Empty>Nothing here.</Empty>}
        </>
      )}
      {sel.length > 0 && (
        <View style={{ marginTop: 14 }}>
          <Button busy={!!busy} title={busy || `Add ${sel.length} Selected`} onPress={async () => {
            setBusy('Adding… please wait');
            try {
              const r = await importToSite(me, id, sel, (i, n) => setBusy(`Adding ${i + 1} of ${n}… please wait`));
              const notPdf = r.notPdf.length ? ` Not added (only PDFs can be signed): ${r.notPdf.slice(0, 6).join(', ')}${r.notPdf.length > 6 ? ` and ${r.notPdf.length - 6} more` : ''}.` : '';
              if (!r.added.length) { if (r.notPdf.length && !r.failed) showAlert(`Nothing was added.${notPdf}`); else toast('Nothing was added — check your connection and try again.'); return; }
              void qc.invalidateQueries({ queryKey: ['hsDocs', 'coshh', id] }); void qc.invalidateQueries({ queryKey: ['hsSummary', id] });
              showAlert(`✓ Upload complete — ${r.added.length} document${r.added.length === 1 ? '' : 's'} added to this site's COSHH${r.added.length <= 6 ? `: ${r.added.join(', ')}` : ''}.${r.failed ? ` ${r.failed} could not be added — try those again.` : ''}${notPdf}`);
              router.back();
            } finally { setBusy(''); }
          }} />
          {!!busy && <Muted style={{ textAlign: 'center', marginTop: 8 }}>Copying documents — this can take a minute. Please don&apos;t leave this page.</Muted>}
        </View>
      )}
    </ScrollView>
  );
}
