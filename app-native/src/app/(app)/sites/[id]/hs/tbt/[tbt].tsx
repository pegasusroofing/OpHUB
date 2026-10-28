// One toolbox talk: view the document, tap to sign (live talks), who has signed.
// Managers also get Issue for Signing (here or company-wide), Remind, rename,
// replace file, Mark as Completed and Delete. Ported from renderToolboxTalkView (710).
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';

import { SignerList } from '@/components/HsDocList';
import { StorageImage } from '@/components/StorageImage';
import { TbtStatusTag } from '@/components/TbtStatusTag';
import * as DocumentPicker from 'expo-document-picker';

import { chooseAction, confirmAsk, promptText, useToast } from '@/components/toast';
import { Button, Card, Muted } from '@/components/ui';
import { useSites } from '@/data/sites';
import { completeTbt, deleteTbt, issueTbt, issueTbtCompanyWide, remindTbt, renameTbt, replaceTbtFile } from '@/data/tbtManager';
import { isManager } from '@/lib/roles';
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
  const { data: sites } = useSites();
  if (!me) return null;
  const mgr = isManager(me);
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
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['tbt', tbt] }); void qc.invalidateQueries({ queryKey: ['tbts', id] }); };
  const menu = async () => {
    if (!talk) return;
    const k = await chooseAction(talk.title, [
      ...(talk.status !== 'live' && talk.status !== 'completed' ? [{ key: 'issue', label: '✍ Issue for Signing' }] : []),
      ...(talk.status === 'bank' ? [{ key: 'wide', label: '📢 Issue company-wide' }] : []),
      ...(talk.status === 'live' ? [{ key: 'remind', label: '🔔 Ask Outstanding to Sign' }, { key: 'complete', label: '✓ Mark as Completed' }] : []),
      { key: 'rename', label: '✏️ Rename' }, { key: 'replace', label: '🔁 Replace file' }, { key: 'del', label: '🗑 Delete', danger: true },
    ]);
    if (k === 'issue') { setBusy(true); const r = await issueTbt(me, id, talk); setBusy(false); toast(r.msg); refresh(); if (r.id && r.id !== talk.id) router.replace(`/sites/${id}/hs/tbt/${r.id}`); }
    else if (k === 'wide') { if (await confirmAsk(`Issue "${talk.title}" for signing at every live site company-wide?`, 'Issue')) { setBusy(true); toast(await issueTbtCompanyWide(me, talk, sites ?? [])); setBusy(false); refresh(); } }
    else if (k === 'remind') {
      if (!waiting.length) { toast('Everyone has signed this toolbox talk.'); return; }
      if (await confirmAsk(`Send a sign-reminder notification to ${waiting.length} operative${waiting.length === 1 ? '' : 's'} who still need to sign this toolbox talk?`, 'Send')) toast(await remindTbt(id, talk.id, waiting));
    } else if (k === 'complete') { if (await completeTbt(talk.id)) { toast('Marked as completed'); refresh(); } }
    else if (k === 'rename') { const n = (await promptText('Rename toolbox talk', talk.title))?.trim(); if (n && n !== talk.title && await renameTbt(talk.id, n)) { toast('Title updated'); refresh(); } }
    else if (k === 'replace') {
      const p = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
      if (p.canceled || !p.assets[0]) return;
      setBusy(true); const ok = await replaceTbtFile(id, talk.id, { uri: p.assets[0].uri, name: p.assets[0].name || 'talk.pdf' }); setBusy(false);
      toast(ok ? 'File replaced' : 'Could not upload — try again.'); refresh();
    } else if (k === 'del') {
      const n = signed.length;
      if (!(await confirmAsk(n ? `Delete this toolbox talk? ${n} ${n === 1 ? 'person has' : 'people have'} already signed it — their signatures will be deleted too. This cannot be undone.` : 'Delete this toolbox talk and all its signatures? This cannot be undone.', 'Delete'))) return;
      if (await deleteTbt(me, id, talk)) { toast('Toolbox talk deleted'); void qc.invalidateQueries({ queryKey: ['tbts', id] }); router.back(); }
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <Stack.Screen options={{ title: talk?.title || 'Toolbox Talk' }} />
      {isLoading ? <Muted>Loading…</Muted> : !talk ? <Muted>Could not load that toolbox talk — it may no longer be live.</Muted> : (
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <Text style={{ flex: 1, fontSize: 17, fontWeight: '800', color: base.ink }}>{talk.title}</Text>
            <TbtStatusTag status={talk.status} />
            {mgr && <Pressable hitSlop={8} disabled={busy} onPress={() => void menu()}><Text style={{ fontSize: 18, color: base.slate, paddingHorizontal: 4 }}>⋮</Text></Pressable>}
          </View>
          {mgr && talk.status === 'bank' && <Button busy={busy} title="✍ Issue for Signing" onPress={async () => { setBusy(true); const r = await issueTbt(me, id, talk); setBusy(false); toast(r.msg); refresh(); if (r.id && r.id !== talk.id) router.replace(`/sites/${id}/hs/tbt/${r.id}`); }} />}
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
