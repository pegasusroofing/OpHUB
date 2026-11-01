// Documents (Andy, 1 Nov): a window onto the job's own OneDrive folder for PMs and admins, laid out exactly as it is
// there. Nothing is copied into the app, so it doesn't repeat the other tiles and operatives never see it.
import * as DocumentPicker from 'expo-document-picker';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useToast } from '@/components/toast';
import { Button, Empty, Muted } from '@/components/ui';
import { listOneDriveLevel, type OdItem } from '@/data/drawings';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { deliverFile } from '@/lib/pdf';
import { supabase } from '@/lib/supabase';
import { invokeAsUser } from '@/lib/userFunctions';
import { base, page, radius, space } from '@/theme/theme';

const row = { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, padding: 12, marginBottom: 8 } as const;
const fileIcon = (n: string) => (/\.pdf$/i.test(n) ? '📄' : /\.(xlsx?|csv)$/i.test(n) ? '📊' : /\.(jpe?g|png|heic)$/i.test(n) ? '🖼' : '📎');

export default function Documents() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const { data: site } = useSite(id);
  const toast = useToast();
  const s = site as (typeof site & { onedrive_folder_id?: string | null; onedrive_drive_id?: string | null; onedrive_folder_name?: string | null }) | undefined;
  const [trail, setTrail] = useState<OdItem[]>([]);
  const [level, setLevel] = useState<{ folders: OdItem[]; files: OdItem[]; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const here = trail[trail.length - 1] ?? (s?.onedrive_folder_id ? { id: s.onedrive_folder_id, name: s.onedrive_folder_name || 'Job folder', driveId: s.onedrive_drive_id } : null);
  const load = useCallback(async () => { if (!here) return; setLevel(null); setLevel(await listOneDriveLevel(here)); }, [here?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [load]);
  if (!me || !site) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  if (me.role !== 'pm' && me.role !== 'admin') return <Muted style={{ padding: space.l }}>Project managers and admins only.</Muted>;
  if (!here) return <Muted style={{ padding: space.l }}>This job has no OneDrive folder yet. Set one up or link one in Project Admin.</Muted>;

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
    void supabase.auth.getSession();
    void load();
  };
  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: 'Documents' }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <Pressable onPress={() => setTrail([])}><Text style={{ fontWeight: '700', color: base.blue }}>{s?.onedrive_folder_name || 'Job folder'}</Text></Pressable>
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
    </ScrollView>
  );
}
