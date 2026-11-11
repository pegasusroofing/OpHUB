// A tender's documents (Andy, 11 Nov 2026: "all our work gets done in the OneDrive but I want it to be on here now"). The
// enquiry's OneDrive folder as it really is: each folder (1. Tender Documents, 2. Estimating, 3. Quotation) with its files
// as links that open them. + Add Documents puts files in Tender Documents unless another folder (or a new one) is chosen.
// Read from OneDrive each time, so work done in OneDrive shows here.
import * as DocumentPicker from 'expo-document-picker';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { chooseAction, promptText, useToast } from '@/components/toast';
import { Button, Muted } from '@/components/ui';
import type { OdItem } from '@/data/drawings';
import { makeSubFolder, quoteFolderFiles, uploadToFolder, type FolderFiles } from '@/data/quotes';
import { deliverFile } from '@/lib/pdf';
import { invokeAsUser } from '@/lib/userFunctions';
import { base } from '@/theme/theme';

export const fileIcon = (n: string) => (/\.pdf$/i.test(n) ? '📄' : /\.(xlsx?|xlsm|csv)$/i.test(n) ? '📊' : /\.docx?$/i.test(n) ? '📝' : /\.(jpe?g|png|heic)$/i.test(n) ? '🖼' : '📎');

export async function openOdFile(f: OdItem, driveId: string | null): Promise<boolean> {
  const d = await invokeAsUser<{ content_base64?: string }>('onedrive-download-file', { item_id: f.id, drive_id: f.driveId || driveId || null, name: f.name });
  if (d.error || !d.data?.content_base64) return false;
  const bin = atob(d.data.content_base64), bytes = new Uint8Array(bin.length);
  for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
  return deliverFile(bytes, f.name, /\.pdf$/i.test(f.name) ? 'application/pdf' : 'application/octet-stream', 'public.data');
}

/** The folders and their files. Every folder starts open; tap a folder's name to fold it away. */
export function useQuoteFiles(folder: { id: string; driveId: string | null } | null) {
  const [groups, setGroups] = useState<FolderFiles[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!folder) return;
    setGroups(null);
    const r = await quoteFolderFiles(folder);
    setGroups(r.groups); setError(r.error || '');
  }, [folder?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [load]);
  return { groups, error, reload: load };
}

export function QuoteDocs({ folder, name }: { folder: { id: string; driveId: string | null }; name: string }) {
  const toast = useToast();
  const { groups, error, reload } = useQuoteFiles(folder);
  const [shut, setShut] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState('');
  const add = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: true, copyToCacheDirectory: true });
    if (r.canceled || !r.assets.length) return;
    const subs = (groups || []).filter((g) => g.folder !== 'This Folder');
    const tender = subs.find((g) => /tender/i.test(g.folder));
    const opts = [...(tender ? [tender] : []), ...subs.filter((g) => g !== tender)];
    const k = await chooseAction(`Put ${r.assets.length === 1 ? 'It' : `These ${r.assets.length}`} In`, [...opts.map((g) => ({ key: g.id, label: `📁 ${g.folder}${g === tender ? ' (Usual)' : ''}` })), { key: '_top', label: `📁 ${name} (The Main Folder)` }, { key: '_new', label: '+ New Folder' }]);
    if (!k) return;
    let to: { id: string; driveId: string | null } | null = k === '_top' ? folder : opts.find((g) => g.id === k) ?? null;
    if (k === '_new') {
      const n = (await promptText('New folder name', ''))?.trim(); if (!n) return;
      setBusy('Making the folder…');
      if (!(await makeSubFolder(folder, n))) { setBusy(''); toast('Could not make the folder. Try again.'); return; }
      const fresh = await quoteFolderFiles(folder);
      const made = fresh.groups.find((g) => g.folder.toLowerCase() === n.toLowerCase());
      to = made ? { id: made.id, driveId: made.driveId } : null;
    }
    if (!to) { setBusy(''); toast('Could not find that folder.'); return; }
    setBusy('Adding…');
    const n = await uploadToFolder(to, r.assets.map((a) => ({ uri: a.uri, name: a.name || 'file' })));
    setBusy('');
    if (n !== r.assets.length) toast(`Only ${n} of ${r.assets.length} went up. Try the others again.`);
    void reload();
  };
  const file = (f: OdItem, driveId: string | null) => (
    <Pressable key={f.id} accessibilityRole="link" accessibilityLabel={`Open ${f.name}`} disabled={!!busy} onPress={async () => { setBusy('Opening…'); const ok = await openOdFile(f, driveId); setBusy(''); if (!ok) toast('Could not open that file.'); }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, paddingLeft: 22 }}>
      <Text>{fileIcon(f.name)}</Text><Text numberOfLines={1} style={{ flex: 1, fontSize: 13.5, color: base.blue }}>{f.name}</Text>
    </Pressable>
  );
  return (
    <View>
      {!groups ? <Muted>Loading from OneDrive…</Muted> : error ? <Muted style={{ color: base.warn }}>{error}</Muted> : (
        groups.map((g) => (
          <View key={g.id} style={{ borderTopWidth: 1, borderTopColor: '#EEF0F2' }}>
            {g.folder !== 'This Folder' && (
              <Pressable accessibilityRole="button" accessibilityLabel={g.folder} onPress={() => setShut({ ...shut, [g.id]: !shut[g.id] })} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}>
                <Text style={{ width: 12, color: base.slate, fontSize: 11 }}>{shut[g.id] ? '▸' : '▾'}</Text>
                <Text style={{ flex: 1, fontWeight: '600', color: base.ink, fontSize: 13.5 }}>📁 {g.folder}</Text>
                <Text style={{ color: base.slate, fontSize: 12 }}>{g.files.length}</Text>
              </Pressable>
            )}
            {!shut[g.id] && (g.files.length ? g.files.map((f) => file(f, g.driveId)) : <Muted style={{ paddingLeft: 22, paddingBottom: 6, fontSize: 12.5 }}>Empty</Muted>)}
          </View>
        ))
      )}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 8 }}>
        <Button small busy={!!busy} title={busy || '+ Add Documents'} onPress={() => void add()} />
        <Button small kind="ghost" title="↻ Refresh" onPress={() => void reload()} />
      </View>
    </View>
  );
}
