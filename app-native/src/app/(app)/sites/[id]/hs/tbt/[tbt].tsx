// One toolbox talk: view the document, tap to sign (live talks), who has signed.
// Ported from renderToolboxTalkView (710), operative view.
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';

import { SignerList } from '@/components/HsDocList';
import { StorageImage } from '@/components/StorageImage';
import { TbtStatusTag } from '@/components/TbtStatusTag';
import { useToast } from '@/components/toast';
import { Card, Muted } from '@/components/ui';
import { openDocLink, signTbt, usePeople, useTbt } from '@/data/hs';
import { useAuth } from '@/lib/auth';
import { signedHeadline, signers } from '@/lib/rules/hs';
import { base, radius, space } from '@/theme/theme';

export default function TbtView() {
  const { id, tbt } = useLocalSearchParams<{ id: string; tbt: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useTbt(tbt, id);
  const { data: people } = usePeople();
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  const talk = data?.talk;
  const mine = data?.sigs.find((s) => s.user_id === me.id);
  const live = talk?.status === 'live';
  const opIds = new Set((people ?? []).filter((p) => p.role === 'operative').map((p) => p.id));
  const { signed, waiting } = signers(data?.roster ?? [], (data?.sigs ?? []).filter((s) => opIds.has(s.user_id || '')));

  const sign = async () => {
    if (!talk || busy) return;
    setBusy(true);
    const r = await signTbt(me, talk);
    setBusy(false);
    toast(r.msg);
    if (!r.ok && r.needSignature) { router.push('/signature'); return; }
    await qc.invalidateQueries({ queryKey: ['tbt', tbt] });
    void qc.invalidateQueries({ queryKey: ['tbts', id] });
  };

  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <Stack.Screen options={{ title: talk?.title || 'Toolbox Talk' }} />
      {isLoading ? <Muted>Loading…</Muted> : !talk ? <Muted>Could not load that toolbox talk — it may no longer be live.</Muted> : (
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <Text style={{ flex: 1, fontSize: 17, fontWeight: '800', color: base.ink }}>{talk.title}</Text>
            <TbtStatusTag status={talk.status} />
          </View>
          <Pressable onPress={async () => { const u = await openDocLink('rams-docs', talk.storage_path); if (u) void Linking.openURL(u); else toast('Could not open the document.'); }}>
            <Text style={{ color: base.blue, marginTop: 6 }}>View document ↗</Text>
          </Pressable>
          <Pressable disabled={!!mine || !live || busy} onPress={sign}
            style={{ marginTop: 14, borderWidth: 1.5, borderStyle: mine ? 'solid' : 'dashed', borderColor: mine ? base.ok : base.line, backgroundColor: mine ? base.okBg : base.card, borderRadius: radius.input, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            {mine ? (
              <>
                {mine.signature_image_path
                  ? <StorageImage bucket="signatures" path={mine.signature_image_path} style={{ height: 34, width: 140, resizeMode: 'contain' }} />
                  : <Text style={{ fontWeight: '700' }}>{me.name}</Text>}
                <Text style={{ color: base.ok, fontWeight: '700' }}>Signed {mine.signed_at ? new Date(mine.signed_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : ''}</Text>
              </>
            ) : <Text style={{ fontWeight: '700', color: live ? base.ink : base.slate }}>{live ? (busy ? 'Signing…' : '✍ Tap to sign') : 'This talk is not live for signing'}</Text>}
          </Pressable>
          <SignerList headline={signedHeadline(data?.roster.length ?? 0, waiting.length)} signed={signed} waiting={waiting} people={people} />
        </Card>
      )}
    </ScrollView>
  );
}
