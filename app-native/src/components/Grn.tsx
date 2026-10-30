// Goods received (726): the form an operative fills on a delivery coming to site,
// and the saved GRN shown on the request (who, when, notes, photos).
import { useState } from 'react';
import { Image, Pressable, Text, TextInput, View } from 'react-native';

import { StorageImage } from '@/components/StorageImage';
import { pickCameraOrLibrary } from '@/components/pickSource';
import { showAlert, useToast } from '@/components/toast';
import { Button, Muted } from '@/components/ui';
import { saveGrn } from '@/data/materials';
import { useAuth } from '@/lib/auth';
import type { Picked } from '@/lib/photos';
import type { Mat } from '@/lib/rules/materials';
import { isManager } from '@/lib/roles';
import { base, radius } from '@/theme/theme';

export function GrnForm({ siteId, m, onDone, onCancel }: { siteId: string; m: Mat; onDone: () => void; onCancel: () => void }) {
  const { me } = useAuth();
  const toast = useToast();
  const [ok, setOk] = useState(true);
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<Picked[]>([]);
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  return (
    <View style={{ marginTop: 8 }}>
      <Pressable onPress={() => setOk(!ok)}><Text style={{ color: base.ink, fontWeight: '700' }}>{ok ? '☑' : '☐'} Everything received and correct</Text></Pressable>
      <Muted style={{ marginTop: 8 }}>{ok ? 'Notes (optional)' : "What's wrong? (shortages, damage, wrong items)"}</Muted>
      <TextInput value={notes} onChangeText={setNotes} multiline placeholder={ok ? 'e.g. left by the welfare unit' : 'e.g. 2 packs short, 1 damaged'}
        style={{ minHeight: 60, borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, marginVertical: 6 }} />
      {photos.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
          {photos.map((p, i) => (
            <Pressable key={p.uri} onPress={() => setPhotos(photos.filter((_, j) => j !== i))}>
              <Image source={{ uri: p.uri }} style={{ width: 64, height: 64, borderRadius: 6 }} />
              <Text style={{ position: 'absolute', top: 0, right: 4, color: '#fff', fontWeight: '800' }}>✕</Text>
            </Pressable>
          ))}
        </View>
      )}
      <Button kind="ghost" title="📷 Add photos" onPress={async () => {
        const p = await pickCameraOrLibrary(true);
        if ('error' in p) showAlert(p.error); else setPhotos([...photos, ...p]);
      }} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 2 }}><Button busy={busy} title="✓ Save GRN" onPress={async () => {
          setBusy(true);
          const r = await saveGrn(me, siteId, m, ok, notes, photos, isManager(me));
          setBusy(false);
          if (!r.ok) { if (r.msg.startsWith('Some photos')) showAlert(r.msg); else toast(r.msg); return; }
          toast(r.msg); onDone();
        }} /></View>
        <View style={{ flex: 1 }}><Button kind="ghost" title="Cancel" onPress={onCancel} /></View>
      </View>
    </View>
  );
}

export function GrnDetail({ g }: { g: NonNullable<Mat['grn']> }) {
  return (
    <View style={{ marginTop: 6, padding: 8, borderRadius: 8, backgroundColor: g.ok ? base.okBg : '#FDE2E0' }}>
      <Text style={{ color: g.ok ? base.ok : base.red, fontWeight: '700' }}>
        {g.ok ? '✓ Goods received' : '⚠ Received with a problem'}
        <Text style={{ fontWeight: '400', color: base.slate }}>{g.byName ? ` · ${g.byName}` : ''}{g.at ? ` · ${new Date(g.at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}</Text>
      </Text>
      {!!g.notes && <Text style={{ color: base.ink, marginTop: 4 }}>{g.notes}</Text>}
      {!!g.photos?.length && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
          {g.photos.map((p) => <StorageImage key={p} bucket="site-photos" path={p} style={{ width: 64, height: 64, borderRadius: 6 }} />)}
        </View>
      )}
    </View>
  );
}
