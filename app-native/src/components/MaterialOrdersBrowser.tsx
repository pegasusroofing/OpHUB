// One level of Material PO's (770): OneDrive sync card (main folder), sub-folders,
// order files with a delivery date that goes on the job calendar, move to folder,
// reorder, upload, delete. Managers only.
import * as DocumentPicker from 'expo-document-picker';
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, Text, TextInput, View } from 'react-native';

import { chooseAction, confirmAsk, promptText, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted } from '@/components/ui';
import {
  createMOFolder, deleteMOFile, deleteMOFolder, folderPath, moveMOFileTo, moveSibling, renameMOFolder, setDeliveryDate,
  syncMaterialOrders, uploadMOFiles, useMaterialOrders, viewMOFile,
} from '@/data/materialOrders';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { readIsoDate } from '@/lib/rules/materials';
import { isManager } from '@/lib/roles';
import { base, radius } from '@/theme/theme';

const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card, marginBottom: 8 };
const synced = new Set<string>(); // jobs auto-synced this session

export function MaterialOrdersBrowser({ siteId, folderId }: { siteId: string; folderId: string | null }) {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: site } = useSite(siteId);
  const { data, isLoading } = useMaterialOrders(siteId, folderId);
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [moveFor, setMoveFor] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['matOrders', siteId] });
  const s = site as (typeof site & { material_orders_folder_id?: string | null; material_orders_folder_name?: string | null; material_orders_last_synced_at?: string | null }) | undefined;
  const linked = !!s?.material_orders_folder_id;
  const once = useRef(false);

  // Opening the main folder syncs quietly, at most once a day.
  useEffect(() => {
    if (once.current || folderId || !linked || !s || synced.has(siteId)) return;
    once.current = true; synced.add(siteId);
    const last = s.material_orders_last_synced_at ? new Date(s.material_orders_last_synced_at).getTime() : 0;
    if (Date.now() - last > 864e5) void syncMaterialOrders(siteId).then(refresh);
  });

  if (!me) return null;
  if (!isManager(me)) return <Muted>Project managers and admins only.</Muted>;

  return (
    <View>
      <Stack.Screen options={{ title: data?.folder ? data.folder.name : "Material PO's" }} />
      {!folderId && (
        <Card>
          {linked ? (
            <>
              <Text style={{ color: base.ok }}>📁 Synced daily from "{s?.material_orders_folder_name || ''}" into this main folder{syncing ? ' — syncing…' : ''}</Text>
              <Button kind="ghost" busy={syncing} title="🔄 Sync Now" onPress={async () => { setSyncing(true); toast(await syncMaterialOrders(siteId)); setSyncing(false); refresh(); }} />
            </>
          ) : <Muted>Link a OneDrive folder (from the current app for now) and any files placed in it sync here once a day.</Muted>}
        </Card>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <Text style={{ flex: 1, fontWeight: '700', color: base.slate }}>Folder/File Name</Text>
        <Pressable onPress={async () => {
          const k = await chooseAction('What would you like to add?', [{ key: 'folder', label: '📁 Add Folder' }, { key: 'doc', label: '📄 Add Document' }]);
          if (k === 'folder') setNewFolder('');
          else if (k === 'doc') {
            const r = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: true, copyToCacheDirectory: true });
            if (r.canceled || !r.assets.length) return;
            const n = await uploadMOFiles(me, siteId, folderId, r.assets.map((a) => ({ uri: a.uri, name: a.name || 'file', mimeType: a.mimeType, size: a.size })), setBusy);
            setBusy(null); toast(n ? (n === 1 ? 'Document added' : `${n} documents added`) : 'Could not upload — check your signal and try again.'); refresh();
          }
        }} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: base.ink, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 22, lineHeight: 24 }}>+</Text>
        </Pressable>
      </View>
      {!!busy && <Muted>{busy}</Muted>}
      {newFolder !== null && (
        <Card>
          <TextInput value={newFolder} onChangeText={setNewFolder} placeholder="e.g. Week Commencing 12 Aug" style={box} autoFocus />
          <Button title="Create Folder" onPress={async () => {
            if (!newFolder.trim()) { toast('Enter a folder name.'); return; }
            if (await createMOFolder(me, siteId, folderId, newFolder.trim())) { toast('Folder created'); setNewFolder(null); refresh(); } else toast('Could not save — try again.');
          }} />
          <Button kind="ghost" title="Cancel" onPress={() => setNewFolder(null)} />
        </Card>
      )}

      {isLoading ? <Muted>Loading…</Muted> : (data?.folders.length || data?.files.length) ? (
        <>
          {data.folders.map((f, i) => (
            <Pressable key={f.id} onPress={() => router.push(`/sites/${siteId}/materials/pos/${f.id}` as never)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 8, backgroundColor: base.card }}>
              <Text style={{ fontSize: 20 }}>📁</Text>
              <Text style={{ flex: 1, fontWeight: '700', color: base.ink }}>{f.name}</Text>
              <Pressable hitSlop={8} onPress={async () => {
                const k = await chooseAction(f.name, [...(i > 0 ? [{ key: 'up', label: '▲ Move Up' }] : []), ...(i < data.folders.length - 1 ? [{ key: 'down', label: '▼ Move Down' }] : []), { key: 'rename', label: '✏️ Rename' }, { key: 'del', label: '🗑 Delete', danger: true }]);
                if (k === 'up' || k === 'down') { await moveSibling('material_order_folders', data.folders, f.id, k === 'up' ? -1 : 1); refresh(); }
                else if (k === 'rename') { const n = await promptText('Rename folder', f.name); if (n && n.trim() && n.trim() !== f.name && await renameMOFolder(f.id, n.trim())) { toast('Folder renamed'); refresh(); } }
                else if (k === 'del' && await confirmAsk('Delete this folder? Any documents inside will move back to the main Material PO folder — nothing is deleted.', 'Delete')) { if (await deleteMOFolder(me, f)) { toast('Folder deleted'); refresh(); } }
              }}><Text style={{ fontSize: 18, color: base.slate, paddingHorizontal: 4 }}>⋮</Text></Pressable>
            </Pressable>
          ))}
          {data.files.map((f, i) => (
            <Card key={f.id}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ fontSize: 18 }}>📦</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', color: base.ink }} numberOfLines={2}>{f.name}</Text>
                  {!!f.synced_at && <Muted>Synced {new Date(f.synced_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</Muted>}
                </View>
                <Pressable onPress={async () => {
                  const t = await promptText(`Scheduled delivery — ${f.name} (YYYY-MM-DD, blank to clear)`, f.scheduled_delivery_date || '');
                  if (t === null) return;
                  const d = readIsoDate(t);
                  if (d === 'bad') { toast('Enter the date as YYYY-MM-DD.'); return; }
                  if (await setDeliveryDate(me, siteId, f, d)) { toast(d ? 'Delivery date set — added to the Calendar' : 'Delivery date cleared'); refresh(); } else toast('Could not save — try again.');
                }} style={{ alignItems: 'center', padding: 6, borderRadius: 8, borderWidth: f.scheduled_delivery_date ? 1.5 : 0, borderColor: base.warn, backgroundColor: f.scheduled_delivery_date ? base.warnBg : 'transparent' }}>
                  {f.scheduled_delivery_date ? (
                    <>
                      <Text style={{ fontSize: 9, fontWeight: '800', color: base.warn }}>🚚 DELIVERY</Text>
                      <Text style={{ fontWeight: '800', color: base.warn }}>{new Date(`${f.scheduled_delivery_date}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</Text>
                    </>
                  ) : <Text style={{ fontSize: 11, color: base.blue }}>+ Set date</Text>}
                </Pressable>
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center' }}>
                <View style={{ flex: 1 }}><Button title="View document" onPress={async () => {
                  if (!f.storage_path) { toast('Could not open file.'); return; }
                  const u = await viewMOFile(siteId, f.storage_path);
                  if (u) void Linking.openURL(u); else toast('Could not open file.');
                }} /></View>
                <Pressable hitSlop={8} onPress={async () => {
                  const k = await chooseAction(f.name, [
                    ...(i > 0 ? [{ key: 'up', label: '▲ Move Up' }] : []), ...(i < data.files.length - 1 ? [{ key: 'down', label: '▼ Move Down' }] : []),
                    { key: 'move', label: '📁 Move to folder' }, ...(f.calendar_event_id ? [{ key: 'unlink', label: '🔗 Remove delivery link' }] : []), { key: 'del', label: '🗑 Delete', danger: true },
                  ]);
                  if (k === 'up' || k === 'down') { await moveSibling('material_order_files', data.files, f.id, k === 'up' ? -1 : 1); refresh(); }
                  else if (k === 'move') setMoveFor(moveFor === f.id ? null : f.id);
                  else if (k === 'unlink' && await confirmAsk('Remove the delivery date link for this file? The Calendar entry will be deleted.', 'Remove')) { if (await setDeliveryDate(me, siteId, f, null)) { toast('Delivery link removed'); refresh(); } }
                  else if (k === 'del' && await confirmAsk("Delete this document? This can't be undone — if it's still in the linked OneDrive folder it won't be re-synced automatically.", 'Delete')) { if (await deleteMOFile(me, f)) { toast('Document deleted'); refresh(); } }
                }}><Text style={{ fontSize: 18, color: base.slate, paddingHorizontal: 6 }}>⋮</Text></Pressable>
              </View>
              {moveFor === f.id && (
                <View style={{ marginTop: 8 }}>
                  {[{ id: null as string | null, label: '— Main Material PO folder —' }, ...data.all.map((a) => ({ id: a.id as string | null, label: folderPath(data.all, a.id) }))].map((o) => (
                    <Pressable key={o.id ?? 'main'} onPress={async () => { if (await moveMOFileTo(f.id, o.id)) { toast('Moved'); setMoveFor(null); refresh(); } }}>
                      <Text style={{ paddingVertical: 6, color: base.ink, fontWeight: f.folder_id === o.id ? '700' : '400' }}>{f.folder_id === o.id ? '◉' : '○'} {o.label}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </Card>
          ))}
        </>
      ) : <Empty>{folderId ? 'Nothing in this folder yet.' : linked ? 'Nothing synced yet — tap Sync Now, or wait for the daily sync.' : 'No material order files yet.'}</Empty>}
    </View>
  );
}
