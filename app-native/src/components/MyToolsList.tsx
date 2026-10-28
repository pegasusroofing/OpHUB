// My Tools list (add, change photo, delete). Ported from myToolsBodyHtml (670).
// Used on the My Tools page and on My dashboard.
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';

import { StorageImage } from '@/components/StorageImage';
import { confirmAsk, showAlert, useToast } from '@/components/toast';
import { Button, Card, Empty, Field, Muted, SectionTitle } from '@/components/ui';
import { addTool, deleteTool, setToolPhoto, useMyTools } from '@/data/myTools';
import { useAuth } from '@/lib/auth';
import { pickPhotos, type Picked } from '@/lib/photos';
import { base } from '@/theme/theme';

export function MyToolsList() {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: tools, isLoading } = useMyTools();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [serial, setSerial] = useState('');
  const [photo, setPhoto] = useState<Picked | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  if (!me) return null;
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['myTools'] }); void qc.invalidateQueries({ queryKey: ['onboarding'] }); };
  const take = async () => { const p = await pickPhotos('camera', false); if ('error' in p) { showAlert(p.error); return null; } return p[0] ?? null; };

  return (
    <View>
      <Muted style={{ marginBottom: 14 }}>Your own power tools — name, serial/item number, and a photo. Used to auto-populate PUWER Tool Inspections.</Muted>
      {isLoading ? <Muted>Loading…</Muted> : tools?.length ? tools.map((t) => (
        <Card key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {t.photo_path ? <StorageImage bucket="operative-tools" path={t.photo_path} style={{ width: 48, height: 48, borderRadius: 8 }} />
            : <View style={{ width: 48, height: 48, borderRadius: 8, backgroundColor: base.paper, alignItems: 'center', justifyContent: 'center' }}><Text>🔧</Text></View>}
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', color: base.ink }}>{t.name}</Text>
            {!!t.serial_number && <Muted>Serial: {t.serial_number}</Muted>}
          </View>
          <Pressable onPress={async () => {
            const p = await take(); if (!p) return;
            setBusy(t.id); const ok = await setToolPhoto(me, t.id, p); setBusy(null);
            toast(ok ? 'Photo updated' : 'Photo upload failed'); refresh();
          }}><Text style={{ color: base.slate, textDecorationLine: 'underline' }}>{busy === t.id ? 'Uploading…' : t.photo_path ? 'Change photo' : 'Add photo'}</Text></Pressable>
          <Pressable hitSlop={6} onPress={async () => {
            if (!(await confirmAsk("Delete this tool? This can't be undone.", 'Delete'))) return;
            if (await deleteTool(t)) { toast('Tool deleted'); refresh(); }
          }}><Text>🗑</Text></Pressable>
        </Card>
      )) : <Empty>No tools added yet.</Empty>}
      {adding ? (
        <Card style={{ marginTop: 10 }}>
          <SectionTitle>Add a Tool</SectionTitle>
          <Field label="Tool name" value={name} onChangeText={setName} placeholder="e.g. Impact Driver" />
          <Field label="Serial / item number" value={serial} onChangeText={setSerial} />
          {photo && <Image source={{ uri: photo.uri }} style={{ width: 72, height: 72, borderRadius: 8, marginBottom: 8 }} />}
          <Button kind="ghost" title={photo ? 'Retake photo' : 'Take photo'} onPress={async () => { const p = await take(); if (p) setPhoto(p); }} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Button busy={busy === 'new'} title="Save Tool" onPress={async () => {
              setBusy('new'); const err = await addTool(me, name.trim(), serial.trim(), photo); setBusy(null);
              if (err) { toast(err); return; }
              toast('Tool added'); setAdding(false); setName(''); setSerial(''); setPhoto(null); refresh();
            }} /></View>
            <View style={{ flex: 1 }}><Button kind="ghost" title="Cancel" onPress={() => { setAdding(false); setPhoto(null); }} /></View>
          </View>
        </Card>
      ) : <Button title="+ Add Tool" onPress={() => setAdding(true)} />}
    </View>
  );
}
