// A OneDrive folder as it really is: open folders, open files, add files. Used by a job's Documents and a quote's
// Documents. It reads OneDrive each time, and holds folders by id, so there's no copy to go out of date.
import * as DocumentPicker from 'expo-document-picker';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useToast } from '@/components/toast';
import { Button, Empty, Muted } from '@/components/ui';
import { listOneDriveLevel, type OdItem } from '@/data/drawings';
import { deliverFile } from '@/lib/pdf';
import { invokeAsUser } from '@/lib/userFunctions';
import { base, radius } from '@/theme/theme';

const row = { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, padding: 12, marginBottom: 8 } as const;
const fileIcon = (n: string) => (/\.pdf$/i.test(n) ? '📄' : /\.(xlsx?|xlsm|csv)$/i.test(n) ? '📊' : /\.docx?$/i.test(n) ? '📝' : /\.(jpe?g|png|heic)$/i.test(n) ? '🖼' : '📎');

export function OneDriveBrowser({ root }: { root: { id: string; driveId?: string | null; name: string } }) {
  const toast = useToast();
  const [trail, setTrail] = useState<OdItem[]>([]);
  const [level, setLevel] = useState<{ folders: OdItem[]; files: OdItem[]; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const here = trail[trail.length - 1] ?? root;
  const load = useCallback(async () => { setLevel(null); setLevel(await listOneDriveLevel(here)); }, [here.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [load]);
  const open = async (f: OdItem) => {
    setBusy(true);
    const d = await invokeAsUser<{ content_base64?: string }>('onedrive-download-file', { item_id: f.id, drive_id: f.driveId || here.driveId || null, name: f.name });
    setBusy(false);
    if (d.error || !d.data?.content_base64) { toast('Could not open that file.'); return; }
    const bin = atob(d.data.content_base64), bytes = new Uint8Array(bin.length);
    for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
    if (!(await deliverFile(bytes, f.name, /\.pdf$/i.test(f.name) ? 'application/pdf' : 'application/octet-stream', 'public.data'))) toast('Could not save the file.');
  };
  const upload = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: true, copyToCacheDirectory: true });
    if (r.canceled) return;
    setBusy(true);
    let n = 0;
    for (const a of r.assets) {
      const bytes = new Uint8Array(await (await fetch(a.uri)).arrayBuffer());
      let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      const u = await invokeAsUser<{ ok?: boolean }>('onedrive-upload', { filename: a.name, content_base64: btoa(bin), folder_id: here.id, drive_id: here.driveId || undefined });
      if (u.data?.ok) n++;
    }
    setBusy(false);
    toast(n === r.assets.length ? (n === 1 ? 'File added' : `${n} files added`) : `Only ${n} of ${r.assets.length} files went up. Try the others again.`);
    void load();
  };
  return (
    <View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <Pressable onPress={() => setTrail([])}><Text style={{ fontWeight: '700', color: base.blue }}>{root.name}</Text></Pressable>
        {trail.map((t, i) => (
          <Pressable key={t.id} onPress={() => setTrail(trail.slice(0, i + 1))}><Text style={{ fontWeight: '700', color: i === trail.length - 1 ? base.ink : base.blue }}> › {t.name}</Text></Pressable>
        ))}
      </View>
      <View style={{ marginBottom: 10 }}><Button kind="ghost" busy={busy} title="⬆️ Add a file here" onPress={() => void upload()} /></View>
      {!level ? <Muted>Loading from OneDrive…</Muted> : level.error ? <Muted style={{ color: base.warn }}>{level.error}</Muted> : !level.folders.length && !level.files.length ? <Empty>This folder is empty.</Empty> : (
        <>
          {level.folders.map((f) => (
            <Pressable key={f.id} style={row} onPress={() => setTrail([...trail, { ...f, driveId: f.driveId || here.driveId }])}>
              <Text style={{ fontSize: 20 }}>📁</Text><Text style={{ flex: 1, fontWeight: '700', color: base.ink }}>{f.name}</Text><Text style={{ color: base.slate }}>›</Text>
            </Pressable>
          ))}
          {level.files.map((f) => (
            <Pressable key={f.id} style={row} disabled={busy} onPress={() => void open(f)}>
              <Text style={{ fontSize: 20 }}>{fileIcon(f.name)}</Text><Text style={{ flex: 1, color: base.ink }}>{f.name}</Text>
            </Pressable>
          ))}
        </>
      )}
    </View>
  );
}
