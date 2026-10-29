// OneDrive Sync on an operative's page (320): link their own OneDrive folder,
// Sync Now pulls in anything new from it, and "Upload to OneDrive" pushes the
// certificates uploaded from a phone that aren't there yet. Both go through
// the sync-operative-certification function.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Muted } from '@/components/ui';
import { unlinkFolder, useOneDriveStatus } from '@/data/onedrive';
import { supabase } from '@/lib/supabase';
import { base } from '@/theme/theme';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
type Row = Record<string, any>;

export function OperativeOneDrive({ orgId, opId }: { orgId: string; opId: string }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<'' | 'sync' | 'push'>('');
  const { data: st } = useOneDriveStatus(orgId);
  const { data } = useQuery({ queryKey: ['opOneDrive', opId], queryFn: async () => {
    const [p, c] = await Promise.all([
      db.from('profiles').select('onedrive_folder_id,onedrive_folder_name,onedrive_last_synced_at').eq('id', opId).maybeSingle(),
      db.from('operative_certifications').select('id,source,pushed_to_onedrive_at').eq('operative_id', opId),
    ]);
    return { p: (p.data as Row | null) ?? {}, pushable: (((c.data as Row[] | null) ?? []).filter((x) => x.source === 'upload' && !x.pushed_to_onedrive_at)).map((x) => x.id as string) };
  } });
  if (!st) return null;
  const call = async (kind: 'sync' | 'push') => {
    setBusy(kind);
    try {
      const r = await supabase.functions.invoke('sync-operative-certification', { body: kind === 'sync' ? { operative_id: opId } : { operative_id: opId, cert_ids: data?.pushable ?? [] } });
      const d = (r.data ?? {}) as { error?: string; pulled?: number; pushed?: number };
      if (r.error || d.error) toast(`${kind === 'sync' ? 'Sync' : 'Upload to OneDrive'} failed — ${d.error || 'try again'}`);
      else toast(kind === 'sync' ? `Synced — ${d.pulled || 0} pulled in from OneDrive.` : d.pushed ? `Uploaded ${d.pushed} to OneDrive.` : 'Nothing to upload — already on OneDrive.');
    } catch { toast('Could not reach the server.'); } finally { setBusy(''); }
    void qc.invalidateQueries({ queryKey: ['opOneDrive', opId] }); void qc.invalidateQueries({ queryKey: ['myCerts'] });
  };
  const p = data?.p ?? {};
  const pick = () => router.push(`/pm/onedrive-pick?target=operative&id=${opId}` as never);
  return (
    <Card>
      {p.onedrive_folder_id ? <>
        <Muted style={{ color: base.ok, fontWeight: '700' }}>📁 Linked to “{p.onedrive_folder_name || 'folder'}”</Muted>
        <Muted style={{ marginBottom: 8 }}>{p.onedrive_last_synced_at ? `Last synced ${new Date(p.onedrive_last_synced_at).toLocaleString('en-GB')}` : 'Not synced yet'}. Sync Now pulls in anything new added to their folder.</Muted>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <View style={{ flex: 1, minWidth: 140 }}><Button busy={busy === 'sync'} title="🔄 Sync Now" onPress={() => void call('sync')} /></View>
          <View style={{ flex: 1, minWidth: 140 }}><Button kind="ghost" busy={busy === 'push'} disabled={!data?.pushable.length} title={`☁️ Upload to OneDrive (${data?.pushable.length ?? 0})`} onPress={() => void call('push')} /></View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
          <View style={{ flex: 1 }}><Button kind="ghost" title="Change folder" onPress={pick} /></View>
          <View style={{ flex: 1 }}><Button kind="ghost" title="Unlink" onPress={async () => { if (!(await confirmAsk('Unlink this operative’s OneDrive folder? Their certificates stay here.', 'Unlink'))) return; toast((await unlinkFolder('operative', opId)) ? 'Unlinked' : 'Could not unlink — try again.'); void qc.invalidateQueries({ queryKey: ['opOneDrive', opId] }); }} /></View>
        </View>
      </> : <>
        <Muted style={{ marginBottom: 8 }}>Link this operative&apos;s own OneDrive folder to sync their certificates — anything added to it is pulled in here on Sync Now, and a certificate uploaded here can be sent up to it.</Muted>
        <Button title="Link OneDrive Folder" onPress={pick} />
      </>}
    </Card>
  );
}
