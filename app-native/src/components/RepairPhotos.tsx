// A repair job's photos of one kind (survey = attending, completion), with Add Photos (camera or library) and, for
// managers, remove (kept as "deleted photos" to restore). Taken from the old repair job page (340); each change
// rebuilds that kind's report in OneDrive.
import { Linking, Pressable, Text, View } from 'react-native';
import { useState } from 'react';

import { StorageImage, useStorageUrl } from '@/components/StorageImage';
import { chooseAction, confirmAsk, showAlert, useToast } from '@/components/toast';
import { Button, Muted } from '@/components/ui';
import { addRepairPhotos, hideRepairPhoto, type RepairPhoto } from '@/data/repairs';
import { useAuth } from '@/lib/auth';
import { pickPhotos } from '@/lib/photos';
import { isManager } from '@/lib/roles';

function Photo({ p, onRemove }: { p: RepairPhoto; onRemove?: () => void }) {
  const big = useStorageUrl('site-photos', p.hires_path || p.storage_path);
  return (
    <Pressable onPress={() => { if (big) void Linking.openURL(big); }} style={{ position: 'relative' }}>
      <StorageImage bucket="site-photos" path={p.storage_path} style={{ width: 76, height: 76, borderRadius: 8 }} />
      {!!onRemove && <Pressable hitSlop={6} onPress={onRemove} style={{ position: 'absolute', top: 2, right: 2, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,.6)', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 11 }}>✕</Text></Pressable>}
    </Pressable>
  );
}

/** cats: the categories shown (the first is where new ones go). canAdd: false for a client. trade: another trade's
 *  completed-works photos (the id of the trade on the job); without it, those are left out. */
export function RepairPhotos({ jobId, photos, cats, onChanged, canAdd = true, addLabel = '📷 Add Photos', trade }: { jobId: string; photos: RepairPhoto[]; cats: string[]; onChanged: () => void; canAdd?: boolean; addLabel?: string; trade?: string }) {
  const { me } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  const mgr = isManager(me);
  const mine = (p: RepairPhoto) => cats.includes(p.category) && (trade ? p.trade_id === trade : !p.trade_id);
  const live = photos.filter((p) => !p.deleted_at && mine(p)), gone = mgr ? photos.filter((p) => p.deleted_at && mine(p)) : [];
  return (
    <View>
      {live.length > 0 ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>{live.map((p) => <Photo key={p.id} p={p} onRemove={mgr ? async () => {
        if (!(await confirmAsk('Remove this photo? It stays saved on the job under "Deleted photos" so you can restore it.', 'Remove'))) return;
        toast((await hideRepairPhoto(me, p.id)) ? 'Photo removed' : 'Could not remove — try again.'); onChanged();
      } : undefined} />)}</View> : !canAdd ? <Muted>No photos.</Muted> : null}
      {canAdd && <View style={{ alignSelf: 'flex-start' }}><Button small kind="ghost" busy={busy} title={addLabel} onPress={async () => {
        const src = await chooseAction('Add Photos', [{ key: 'camera', label: 'Take A Photo' }, { key: 'library', label: 'Choose From Library' }]);
        if (!src) return;
        const picked = await pickPhotos(src as 'camera' | 'library', true);
        if ('error' in picked) { showAlert(picked.error); return; }
        if (!picked.length) return;
        setBusy(true); const failed = await addRepairPhotos(me, jobId, cats[0], picked, trade); setBusy(false);
        if (failed) toast(`${failed} photo${failed === 1 ? '' : 's'} failed to upload — try again.`);
        onChanged();
      }} /></View>}
      {gone.length > 0 && <Pressable onPress={async () => {
        const k = await chooseAction('Deleted photos — tap one to restore', gone.map((p, i) => ({ key: p.id, label: `Photo ${i + 1}` })));
        if (k) { toast((await hideRepairPhoto(me, k, true)) ? 'Photo restored' : 'Could not restore — try again.'); onChanged(); }
      }}><Muted style={{ textDecorationLine: 'underline', marginTop: 4 }}>Deleted photos ({gone.length})</Muted></Pressable>}
    </View>
  );
}
