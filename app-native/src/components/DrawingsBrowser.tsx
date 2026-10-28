// One level of Drawings, Spec's & Programme (810): sub-folders, current files,
// superseded files. Managers get + (Add Folder / Add Document), folder ⋮ (move,
// rename, delete), file rename/delete, Supersedes on upload, and the "add a key
// date to the Calendar?" card after a programme upload.
import * as DocumentPicker from 'expo-document-picker';
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, Text, TextInput, View } from 'react-native';

import { chooseAction, confirmAsk, promptText, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted, SectionTitle } from '@/components/ui';
import {
  addKeyDate, createFolder, deleteFile, deleteFolder, drawingsOnlyOk, fileIcon, fileUrl, mimeFromName, moveFolder, renameFile, renameFolder,
  uploadFiles, useDrawings, type DFile,
} from '@/data/drawings';
import { useAuth } from '@/lib/auth';
import { readIsoDate } from '@/lib/rules/materials';
import { isManager } from '@/lib/roles';
import { base, radius, space } from '@/theme/theme';

const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card, marginBottom: 8 };

export function DrawingsBrowser({ siteId, folderId }: { siteId: string; folderId: string | null }) {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useDrawings(siteId, folderId);
  const [mode, setMode] = useState<null | 'folder' | 'upload'>(null);
  const [newName, setNewName] = useState('');
  const [supersedes, setSupersedes] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showOld, setShowOld] = useState(false);
  const [keyDate, setKeyDate] = useState<{ name: string; date: string; label: string } | null>(null);
  if (!me) return null;
  const mgr = isManager(me);
  const folder = data?.folder ?? null;
  const drawingsOnly = folder?.name === 'Drawings';
  const isProgramme = folder?.name === 'Programme' || folder?.name === 'Main Contractor Programme';
  const refresh = () => void qc.invalidateQueries({ queryKey: ['drawings', siteId] });

  const view = async (f: DFile) => {
    const u = await fileUrl(f);
    if (u) void Linking.openURL(u); else toast('Could not open the file — check your signal.');
  };
  const upload = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: drawingsOnly ? ['application/pdf', 'image/jpeg', 'image/png'] : '*/*', multiple: true, copyToCacheDirectory: true });
    if (r.canceled || !r.assets.length) return;
    let assets = r.assets.map((a) => ({ uri: a.uri, name: a.name || 'file', mimeType: a.mimeType || mimeFromName(a.name || '') }));
    const skipped = drawingsOnly ? assets.filter((a) => !drawingsOnlyOk(a.mimeType)).length : 0;
    if (drawingsOnly) assets = assets.filter((a) => drawingsOnlyOk(a.mimeType));
    if (!assets.length) { toast("The Drawings folder takes PDF, JPEG or PNG — put other files in Specification or another folder."); return; }
    const sup = assets.length === 1 ? supersedes : null;
    if (supersedes && assets.length > 1) toast('Supersedes only applies when uploading a single file — uploaded as new documents instead.');
    const res = await uploadFiles(me, siteId, folderId, assets, sup, setBusy);
    setBusy(null);
    if (res.uploaded) {
      toast(res.uploaded === 1 ? 'File uploaded' : `${res.uploaded} files uploaded${skipped ? `, ${skipped} skipped (wrong file type)` : ''}`);
      setMode(null); setSupersedes(null);
      if (isProgramme && res.uploaded === 1 && res.last) setKeyDate({ name: res.last.name, date: '', label: `Programme: ${res.last.name}` });
    } else toast('Could not upload — check your signal and try again.');
    refresh();
  };

  return (
    <View>
      <Stack.Screen options={{ title: folder ? folder.name : "Drawings, Spec's & Programme" }} />
      {mgr && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <Text style={{ flex: 1, fontWeight: '700', color: base.slate }}>Folder/File Name</Text>
          <Pressable onPress={async () => {
            const k = await chooseAction('What would you like to add?', [{ key: 'folder', label: '📁 Add Folder' }, { key: 'upload', label: '📄 Add Document' }]);
            if (k === 'folder' || k === 'upload') setMode(k);
          }} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: base.ink, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 22, lineHeight: 24 }}>+</Text>
          </Pressable>
        </View>
      )}
      {mgr && mode === 'folder' && (
        <Card>
          <TextInput value={newName} onChangeText={setNewName} placeholder="e.g. Roof Plans" style={box} autoFocus />
          <Button title="Create Folder" onPress={async () => {
            if (!newName.trim()) { toast('Enter a folder name.'); return; }
            if (await createFolder(me, siteId, folderId, newName.trim())) { toast('Folder created'); setNewName(''); setMode(null); refresh(); } else toast('Could not save — try again.');
          }} />
          <Button kind="ghost" title="Cancel" onPress={() => setMode(null)} />
        </Card>
      )}
      {mgr && mode === 'upload' && (
        <Card>
          <SectionTitle>{drawingsOnly ? 'Upload drawing (PDF, JPEG or PNG)' : 'Upload files (any type — PDF, Word, Excel, photos…)'}</SectionTitle>
          <Muted>Uploads into {folder ? `"${folder.name}"` : 'the top level'}. You can pick more than one file — each is saved separately.</Muted>
          {!!data?.files.length && (
            <View style={{ marginTop: 8 }}>
              <Muted style={{ fontWeight: '700' }}>Supersedes (optional, single file only)</Muted>
              <Pressable onPress={() => setSupersedes(null)}><Text style={{ paddingVertical: 5, color: base.ink }}>{!supersedes ? '◉' : '○'} New document, doesn't replace anything</Text></Pressable>
              {data.files.map((f) => <Pressable key={f.id} onPress={() => setSupersedes(f.id)}><Text style={{ paddingVertical: 5, color: base.ink }}>{supersedes === f.id ? '◉' : '○'} {f.name}</Text></Pressable>)}
            </View>
          )}
          <Button busy={!!busy} title={busy ?? 'Choose file(s)'} onPress={() => void upload()} />
          <Button kind="ghost" title="Cancel" onPress={() => setMode(null)} />
        </Card>
      )}
      {keyDate && (
        <Card style={{ backgroundColor: base.paper }}>
          <SectionTitle>Add a key date from "{keyDate.name}"?</SectionTitle>
          <Muted>Puts the date straight onto the job Calendar so the team can see it without opening the document.</Muted>
          <TextInput value={keyDate.date} onChangeText={(t) => setKeyDate({ ...keyDate, date: t })} placeholder="Date (YYYY-MM-DD)" autoCapitalize="none" style={[box, { marginTop: 8 }]} />
          <TextInput value={keyDate.label} onChangeText={(t) => setKeyDate({ ...keyDate, label: t })} style={box} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Button title="Add to Calendar" onPress={async () => {
              const d = readIsoDate(keyDate.date);
              if (!d || d === 'bad') { toast('Enter the date as YYYY-MM-DD.'); return; }
              if (await addKeyDate(me, siteId, d, keyDate.label.trim() || `Programme: ${keyDate.name}`)) { toast('Added to the Calendar'); setKeyDate(null); } else toast('Could not save — try again.');
            }} /></View>
            <View style={{ flex: 1 }}><Button kind="ghost" title="Skip" onPress={() => setKeyDate(null)} /></View>
          </View>
        </Card>
      )}

      {isLoading ? <Muted>Loading…</Muted> : (data?.folders.length || data?.files.length) ? (
        <>
          {data.folders.map((f, i) => (
            <Pressable key={f.id} onPress={() => router.push(`/sites/${siteId}/drawings/${f.id}` as never)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 8, backgroundColor: base.card }}>
              <Text style={{ fontSize: 20 }}>{f.name === 'Specification' ? '📄' : '📁'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: base.ink }}>{f.visibility_mode === 'assigned' ? '🔒 ' : ''}{f.name}</Text>
                <Muted>Folder</Muted>
              </View>
              {mgr && (
                <Pressable hitSlop={8} onPress={async () => {
                  const k = await chooseAction(f.name, [
                    ...(i > 0 ? [{ key: 'up', label: '▲ Move Up' }] : []), ...(i < data.folders.length - 1 ? [{ key: 'down', label: '▼ Move Down' }] : []),
                    { key: 'rename', label: '✏️ Rename' }, { key: 'del', label: '🗑 Delete', danger: true },
                  ]);
                  if (k === 'up' || k === 'down') { if (!(await moveFolder(data.folders, f.id, k === 'up' ? -1 : 1))) toast('Move failed — could not save the new order, try again.'); refresh(); }
                  else if (k === 'rename') { const n = await promptText('Rename folder', f.name); if (n && n.trim() && n.trim() !== f.name && await renameFolder(f.id, n.trim())) { toast('Folder renamed'); refresh(); } }
                  else if (k === 'del' && await confirmAsk("Delete this folder and everything inside it? This can't be undone.", 'Delete')) { if (await deleteFolder(me, f)) { toast('Folder deleted'); refresh(); } }
                }}><Text style={{ fontSize: 18, color: base.slate, paddingHorizontal: 4 }}>⋮</Text></Pressable>
              )}
            </Pressable>
          ))}
          {data.files.map((f) => (
            <Card key={f.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ fontSize: 18 }}>{fileIcon(f)}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: base.ink }}>{f.name}</Text>
                {!!f.supersedes && <Muted>Supersedes "{data.nameById[f.supersedes] || 'an earlier version'}"</Muted>}
              </View>
              <Pressable onPress={() => void view(f)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: base.line, borderRadius: 8 }}><Text style={{ fontWeight: '700', color: base.ink }}>View</Text></Pressable>
              {mgr && <Pressable hitSlop={6} onPress={async () => { const n = await promptText('Rename drawing', f.name); if (n && n.trim() && n.trim() !== f.name && await renameFile(f.id, n.trim())) { toast('Drawing renamed'); refresh(); } }}><Text>✏️</Text></Pressable>}
              {mgr && <Pressable hitSlop={6} onPress={async () => { if (await confirmAsk("Delete this drawing? This can't be undone.", 'Delete') && await deleteFile(me, f)) { toast('Drawing deleted'); refresh(); } }}><Text>🗑</Text></Pressable>}
            </Card>
          ))}
        </>
      ) : <Empty>Nothing here yet.</Empty>}

      {!!data?.superseded.length && (
        <>
          <Pressable onPress={() => setShowOld(!showOld)} style={{ marginTop: space.m }}><Text style={{ fontWeight: '700', color: base.ink }}>{showOld ? '▼' : '▶'} Superseded Documents ({data.superseded.length})</Text></Pressable>
          {showOld && (
            <Card>
              {data.superseded.map((f) => (
                <View key={f.id} style={{ flexDirection: 'row', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: base.line }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '700', color: base.ink }}>{f.name}</Text>
                    <Muted>Uploaded {new Date(f.uploaded_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} · superseded{f.superseded_by ? ` by "${data.nameById[f.superseded_by] || 'a newer version'}"` : ''}</Muted>
                    <Pressable onPress={() => void view(f)}><Text style={{ color: base.blue }}>View document ↗</Text></Pressable>
                  </View>
                  {mgr && <Pressable onPress={async () => { if (await confirmAsk("Delete this drawing? This can't be undone.", 'Delete') && await deleteFile(me, f)) { toast('Drawing deleted'); refresh(); } }}><Text>🗑</Text></Pressable>}
                </View>
              ))}
            </Card>
          )}
        </>
      )}
      {mgr && <Muted style={{ marginTop: space.m }}>Still in the current app for now: who-can-see-this-folder settings, OneDrive import and copying uploads to OneDrive, reading key dates out of an Excel programme, and drawing mark-up.</Muted>}
    </View>
  );
}
