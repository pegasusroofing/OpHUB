// My signature: drawn once, then used whenever you sign RAMS, COSHH or a toolbox talk.
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { SignaturePad, type SignaturePadHandle } from '@/components/SignaturePad';
import { StorageImage } from '@/components/StorageImage';
import { useToast } from '@/components/toast';
import { Button, Card, Muted, Screen, SectionTitle, Title } from '@/components/ui';
import { saveSignature } from '@/data/hs';
import { useAuth } from '@/lib/auth';

export default function Signature() {
  const { me, refresh } = useAuth();
  const toast = useToast();
  const pad = useRef<SignaturePadHandle>(null);
  const [busy, setBusy] = useState(false);
  if (!me) return null;

  const save = async () => {
    if (!pad.current || pad.current.isEmpty()) { toast('Draw your signature first.'); return; }
    setBusy(true);
    const png = await pad.current.toPng();
    const path = png ? await saveSignature(me, png) : null;
    setBusy(false);
    if (!path) { toast('Could not save — check your signal and try again.'); return; }
    await refresh();
    toast('Signature saved');
    if (router.canGoBack()) router.back();
  };

  return (
    <Screen>
      <Title>My Signature</Title>
      <Card>
        <SectionTitle>Your signature</SectionTitle>
        {me.signature_path ? (
          <>
            <Muted style={{ marginBottom: 8 }}>Currently adopted:</Muted>
            <View style={{ backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#E6E8EC', borderRadius: 8, padding: 10, marginBottom: 14 }}>
              <StorageImage bucket="signatures" path={me.signature_path} style={{ height: 50, width: '100%', resizeMode: 'contain' }} />
            </View>
          </>
        ) : (
          <Muted style={{ marginBottom: 10 }}>Draw your signature below — it'll be used automatically whenever you sign a RAMS document or Toolbox Talk.</Muted>
        )}
        <Muted style={{ marginBottom: 6, fontWeight: '700' }}>{me.signature_path ? 'Draw a new signature to replace it' : 'Draw here'}</Muted>
        <SignaturePad ref={pad} />
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <View style={{ flex: 1 }}><Button kind="ghost" title="Clear" onPress={() => pad.current?.clear()} /></View>
          <View style={{ flex: 1 }}><Button title="Save Signature" busy={busy} onPress={save} /></View>
        </View>
      </Card>
    </Screen>
  );
}
