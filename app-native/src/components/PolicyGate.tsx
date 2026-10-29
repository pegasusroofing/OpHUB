// Compulsory H&S Policy sign-off. Ported from renderHsPolicyGate (640): nobody can use
// the app with the current policy unsigned (the signature page stays reachable).
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, Text } from 'react-native';

import { useToast } from '@/components/toast';
import { Button, Card, Muted, Screen, Title } from '@/components/ui';
import { viewDoc } from '@/components/DocViewer';
import { openDocLink } from '@/data/hs';
import { signHsPolicy, type PolicyDoc } from '@/data/hsPolicy';
import { useAuth } from '@/lib/auth';
import { base } from '@/theme/theme';

const longDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

export function PolicyGate({ doc }: { doc: PolicyDoc }) {
  const { me, signOut } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  if (!me) return null;
  return (
    <Screen center>
      <Title>Health & Safety Policy</Title>
      <Muted style={{ marginBottom: 16 }}>Before you can use OpHUB, please read and sign the current company H&S Policy. This is a one-off for the year and travels with you to every site.</Muted>
      <Card>
        <Text style={{ fontWeight: '800', fontSize: 14, color: base.ink }}>{doc.name}</Text>
        <Muted>Uploaded {longDate(doc.uploaded_at)}{doc.expiry_date ? ` · Expires ${longDate(`${doc.expiry_date}T00:00:00`)}` : ''}</Muted>
        <Pressable onPress={async () => { const u = await openDocLink('rams-docs', doc.storage_path); if (u) viewDoc(u); else toast('Could not open the document.'); }}>
          <Text style={{ color: base.blue, marginTop: 6 }}>View document ↗</Text>
        </Pressable>
        {me.signature_path ? (
          <Button title="I have read and understood this policy — Sign" onPress={async () => {
            const r = await signHsPolicy(me, doc.id);
            toast(r.msg);
            if (r.ok) await qc.invalidateQueries({ queryKey: ['hsPolicy'] });
          }} />
        ) : (
          <>
            <Text style={{ color: base.warn, marginTop: 12 }}>You haven't adopted a signature yet.</Text>
            <Button title="Adopt Your Signature" onPress={() => router.push('/signature')} />
          </>
        )}
      </Card>
      <Pressable onPress={signOut} style={{ alignSelf: 'center', marginTop: 12 }}>
        <Text style={{ color: base.slate }}>Signed in as {me.name} · <Text style={{ textDecorationLine: 'underline' }}>Sign out</Text></Text>
      </Pressable>
    </Screen>
  );
}
