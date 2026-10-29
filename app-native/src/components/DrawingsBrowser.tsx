// One level of Drawings, Spec's & Programme (810): sub-folders, current files,
// superseded files. Managers get + (Add Folder / Add Document), folder ⋮ (move,
// rename, delete), file rename/delete, Supersedes on upload, and the "add a key
// date to the Calendar?" card after a programme upload (an Excel programme is
// scanned for its dates), "Who can see this" per folder, and — when the job has
// a OneDrive folder linked — Import from OneDrive and a copy of each upload.
import * as DocumentPicker from 'expo-document-picker';
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, usePathname } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { usePageCrumbs } from '@/components/Crumbs';
import { pdfFirstPageImage, viewDoc } from '@/components/DocViewer';
import { HowTo } from '@/components/HowTo';
import { MarkupEditor } from '@/components/MarkupEditor';
import { chooseAction, confirmAsk, promptText, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted, SectionTitle } from '@/components/ui';
import {
  addKeyDate, createFolder, pushDrawingToOneDrive, deleteFile, deleteFolder, drawingsOnlyOk, fileIcon, fileUrl, mimeFromName, moveFolder, renameFile, renameFolder,
  uploadFiles, useDrawings, type DFile,
} from '@/data/drawings';
import { VisibilityEditor } from '@/components/VisibilityEditor';
import { DateBox } from '@/components/DateField';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { programmeDates } from '@/lib/rules/programmeDates';
import { readXlsx } from '@/lib/rules/xlsxRead';
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
  const [keyDate, setKeyDate] = useState<{ name: string; date: string; label: string; fileId: string; cands: { date: string; label: string; on: boolean }[] } | null>(null);
  const [vis, setVis] = useState<string | null>(null);
  const { data: site } = useSite(siteId);
  const linked = !!(site as { onedrive_folder_id?: string | null } | undefined)?.onedrive_folder_id;
  const [markup, setMarkup] = useState<{ src: string; name: string } | null>(null);
  const path = usePathname();
  // Trail: Drawings, Spec's & Programme › parent folders › this folder — each step goes back up.
  const top = `/sites/${siteId}/drawings`;
  usePageCrumbs(path, folderId && data?.folder ? [["Drawings, Spec's & Programme", top], ...(data.parents || []).map((p) => [p.name, `${top}/${p.id}`] as [string, string]), [data.folder.name, null]] : null);
  if (!me) return null;
  const mgr = isManager(me);
  const folder = data?.folder ?? null;
  const drawingsOnly = folder?.name === 'Drawings';
  const isProgramme = folder?.name === 'Programme' || folder?.name === 'Main Contractor Programme';
  const refresh = () => void qc.invalidateQueries({ queryKey: ['drawings', siteId] });

  const view = async (f: DFile) => {
    const u = await fileUrl(f);
    if (!u) { toast('Could not open the file — check your signal.'); return; }
    const canMark = mgr && /.(pdf|jpe?g|png)$/i.test(f.name || f.storage_path);
    viewDoc(u, f.name, canMark ? { onMarkup: (src) => void startMarkup(src, f) } : {});
  };
  // Mark up a drawing: page 1 of a PDF (or the picture) opens in the mark-up tool; the marked-up copy is
  // saved in this folder as a new drawing, so the original stays as it was.
  const startMarkup = async (src: string, f: DFile) => {
    const isPdfFile = /.pdf$/i.test(f.name || f.storage_path);
    const img = isPdfFile ? await pdfFirstPageImage(src) : src;
    if (!img) { toast('Marking up a PDF needs the office laptop — on a phone, mark up a photo or image of the drawing.'); return; }
    setMarkup({ src: img, name: f.name });
  };
  const saveMarkup = async (image: string) => {
    const nm = `${markup?.name.replace(/.[a-z0-9]+$/i, '') || 'Drawing'} (marked up ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}).jpg`;
    setMarkup(null);
    const res = await uploadFiles(me, siteId, folderId, [{ uri: image, name: nm, mimeType: 'image/jpeg' }], null, setBusy);
    setBusy(null);
    if (!res.uploaded) toast('Could not save the marked-up drawing — try again.');
    refresh();
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
      if (linked) for (const a of assets) void pushDrawingToOneDrive(siteId, a.name, a.uri);
      if (isProgramme && res.uploaded === 1 && res.last) {
        let cands: { date: string; label: string; on: boolean }[] = [];
        if (/.xlsx$/i.test(assets[0].name)) { try { cands = programmeDates(await readXlsx(new Uint8Array(await (await fetch(assets[0].uri)).arrayBuffer()), { dates: true })).map((c) => ({ ...c, on: false })); } catch { /* plain date form */ } }
        setKeyDate({ name: res.last.name, date: '', label: `Programme: ${res.last.name}`, fileId: res.last.id, cands });
      }
    } else toast('Could not upload — check your signal and try again.');
    refresh();
  };

  return (
    <View>
      <Stack.Screen options={{ title: folder ? folder.name : "Drawings, Spec's & Programme" }} />
      {!folderId && <HowTo k="drawings" />}
      {mgr && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <Text style={{ flex: 1, fontWeight: '700', color: base.slate }}>Folder/File Name</Text>
          <Pressable onPress={async () => {
            const k = await chooseAction('What would you like to add?', [{ key: 'folder', label: '📁 Add Folder' }, { key: 'upload', label: '📄 Add Document' }, { key: 'od', label: '☁️ Sync from OneDrive' }]);
            if (k === 'folder' || k === 'upload') setMode(k);
            else if (k === 'od') {
              if (linked) router.push(`/sites/${siteId}/drawings/import${folderId ? `?folder=${folderId}` : ''}` as never);
              else if (await confirmAsk('This project isn’t linked to a OneDrive folder yet. Link one now? New uploads then copy to OneDrive, and you can bring files in from it.', 'Link a folder')) router.push({ pathname: '/pm/onedrive-pick', params: { target: 'progress', id: siteId } } as never);
            }
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
              <Pressable onPress={() => setSupersedes(null)}><Text style={{ paddingVertical: 5, color: base.ink }}>{!supersedes ? '◉' : '○'} New document, doesn&apos;t replace anything</Text></Pressable>
              {data.files.map((f) => <Pressable key={f.id} onPress={() => setSupersedes(f.id)}><Text style={{ paddingVertical: 5, color: base.ink }}>{supersedes === f.id ? '◉' : '○'} {f.name}</Text></Pressable>)}
            </View>
          )}
          <Button busy={!!busy} title={busy ?? 'Choose file(s)'} onPress={() => void upload()} />
          <Button kind="ghost" title="Cancel" onPress={() => setMode(null)} />
        </Card>
      )}
      {keyDate && (
        <Card style={{ backgroundColor: base.paper }}>
          <SectionTitle>Add a key date from &quot;{keyDate.name}&quot;?</SectionTitle>
          <Muted>Puts the date straight onto the job Calendar so the team can see it without opening the document.</Muted>
          {keyDate.cands.length ? <View style={{ marginTop: 8 }}>
            <Muted style={{ fontWeight: '700' }}>Dates found in the programme — tick the ones to add:</Muted>
            {keyDate.cands.map((c, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <Pressable onPress={() => setKeyDate({ ...keyDate, cands: keyDate.cands.map((x, j) => (j === i ? { ...x, on: !x.on } : x)) })}><Text style={{ fontSize: 18, color: base.ink }}>{c.on ? '☑' : '☐'}</Text></Pressable>
                <Text style={{ width: 92, color: base.ink, fontWeight: '700' }}>{new Date(`${c.date}T12:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</Text>
                <TextInput value={c.label} onChangeText={(t) => setKeyDate({ ...keyDate, cands: keyDate.cands.map((x, j) => (j === i ? { ...x, label: t } : x)) })} placeholder={`Programme: ${keyDate.name}`} style={[box, { flex: 1, marginBottom: 0 }]} />
              </View>
            ))}
          </View> : <>
          <DateBox value={keyDate.date} onChange={(t) => setKeyDate({ ...keyDate, date: t })} title="Key date" style={{ marginTop: 8, marginBottom: 8 }} />
          <TextInput value={keyDate.label} onChangeText={(t) => setKeyDate({ ...keyDate, label: t })} style={box} />
          </>}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <View style={{ flex: 1 }}><Button title="Add to Calendar" onPress={async () => {
              if (keyDate.cands.length) {
                const on = keyDate.cands.filter((c) => c.on);
                if (!on.length) { toast('Tick at least one date, or use Skip.'); return; }
                let added = 0;
                for (const c of on) if (await addKeyDate(me, siteId, c.date, c.label.trim() || `Programme: ${keyDate.name}`, added ? undefined : keyDate.fileId)) added++;
                toast(added === 1 ? 'Key date added to the Calendar' : added ? `${added} key dates added to the Calendar` : 'Could not save — try again.');
                if (added) setKeyDate(null);
                return;
              }
              const d = readIsoDate(keyDate.date);
              if (!d || d === 'bad') { toast('Choose the date.'); return; }
              if (await addKeyDate(me, siteId, d, keyDate.label.trim() || `Programme: ${keyDate.name}`, keyDate.fileId)) { toast('Added to the Calendar'); setKeyDate(null); } else toast('Could not save — try again.');
            }} /></View>
            <View style={{ flex: 1 }}><Button kind="ghost" title="Skip" onPress={() => setKeyDate(null)} /></View>
          </View>
        </Card>
      )}

      {isLoading ? <Muted>Loading…</Muted> : (data?.folders.length || data?.files.length) ? (
        <>
          {data.folders.map((f, i) => (<View key={f.id}>
            <Pressable onPress={() => router.push(`/sites/${siteId}/drawings/${f.id}` as never)}
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
                    { key: 'rename', label: '✏️ Rename' }, { key: 'vis', label: '🔒 Who can see this' }, { key: 'del', label: '🗑 Delete', danger: true },
                  ]);
                  if (k === 'vis') { setVis(f.id); return; }
                  if (k === 'up' || k === 'down') { if (!(await moveFolder(data.folders, f.id, k === 'up' ? -1 : 1))) toast('Move failed — could not save the new order, try again.'); refresh(); }
                  else if (k === 'rename') { const n = await promptText('Rename folder', f.name); if (n && n.trim() && n.trim() !== f.name && await renameFolder(f.id, n.trim())) { toast('Folder renamed'); refresh(); } }
                  else if (k === 'del' && await confirmAsk("Delete this folder and everything inside it? This can't be undone.", 'Delete')) { if (await deleteFolder(me, f)) { toast('Folder deleted'); refresh(); } }
                }}><Text style={{ fontSize: 18, color: base.slate, paddingHorizontal: 4 }}>⋮</Text></Pressable>
              )}
            </Pressable>
            {vis === f.id && me.org_id && <VisibilityEditor table="drawing_folders" id={f.id} siteId={siteId} orgId={me.org_id} onClose={(saved) => { setVis(null); if (saved) refresh(); }} />}
          </View>))}
          {data.files.map((f) => (
            <Card key={f.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ fontSize: 18 }}>{fileIcon(f)}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: base.ink }}>{f.name}</Text>
                {!!f.supersedes && <Muted>Supersedes &quot;{data.nameById[f.supersedes] || 'an earlier version'}&quot;</Muted>}
              </View>
              <Pressable onPress={() => void view(f)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: base.line, borderRadius: 8 }}><Text style={{ fontWeight: '700', color: base.ink }}>View</Text></Pressable>
              {mgr && <Pressable hitSlop={6} onPress={async () => { const n = await promptText('Rename drawing', f.name); if (n && n.trim() && n.trim() !== f.name && await renameFile(f.id, n.trim())) { toast('Drawing renamed'); refresh(); } }}><Text>✏️</Text></Pressable>}
              {mgr && <Pressable hitSlop={6} onPress={async () => { if (await confirmAsk("Delete this drawing? This can't be undone.", 'Delete') && await deleteFile(me, f)) { toast('Drawing deleted'); refresh(); } }}><Text>🗑</Text></Pressable>}
            </Card>
          ))}
        </>
      ) : <Empty>Nothing here yet.</Empty>}

      {markup && <MarkupEditor src={markup.src} onClose={(out) => { if (out) void saveMarkup(out.image); else setMarkup(null); }} />}
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
    </View>
  );
}
