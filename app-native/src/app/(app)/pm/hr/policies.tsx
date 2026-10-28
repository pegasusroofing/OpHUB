// Company policies & handbook (186 renderHrPolicies): view each document, sign
// every policy at once, read and sign the handbook on its own. Admins upload
// documents, see who has signed and can remove a document (signatures kept).
import * as DocumentPicker from 'expo-document-picker';
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';

import { confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted, SectionTitle } from '@/components/ui';
import { archivePolicy, signPolicies, uploadPolicies, usePolicies, useHr, type Policy } from '@/data/hr';
import { openDocLink } from '@/data/hs';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { base, space } from '@/theme/theme';

export default function Policies() {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = usePolicies(me?.org_id);
  const { data: hr } = useHr(me?.org_id);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  const isAdmin = me.role === 'admin';
  const pols = data?.pols ?? [], sigs = data?.sigs ?? [];
  const people = hr?.people ?? [];
  const signedBy = (id: string) => new Map(sigs.filter((s) => s.policy_id === id).map((s) => [s.user_id, s]));
  const policies = pols.filter((p) => p.kind === 'policy'), handbooks = pols.filter((p) => p.kind === 'handbook');
  const toSign = policies.filter((p) => !signedBy(p.id).has(me.id));
  const fmt = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['hrPolicies'] }); };
  const needSig = async () => {
    if ((me as { signature_path?: string | null }).signature_path) return true;
    if (await confirmAsk("You need to adopt your signature first (once — it's reused everywhere). Do that now?", 'Adopt signature')) router.push('/signature');
    return false;
  };
  const view = async (p: Policy) => { const u = await openDocLink('mc-documents', p.storage_path); if (u) void Linking.openURL(u); else toast('Could not open the file.'); };
  const upload = async (kind: 'policy' | 'handbook') => {
    const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'], multiple: kind === 'policy', copyToCacheDirectory: true });
    if (r.canceled || !r.assets.length) return;
    setBusy(true);
    const n = await uploadPolicies(me, r.assets.map((a) => ({ uri: a.uri, name: a.name || 'document', mimeType: a.mimeType })), kind);
    setBusy(false);
    toast(n ? `${n} uploaded` : 'Upload failed — try again.'); refresh();
  };
  const row = (p: Policy, isHb: boolean) => {
    const sb = signedBy(p.id), mine = sb.get(me.id), open = openId === p.id;
    return (
      <Card key={p.id}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable style={{ flex: 1 }} onPress={() => void view(p)}>
            <Text style={{ fontWeight: '700', color: base.ink }}>{p.title}</Text>
            <Muted>{/\.pdf$/i.test(p.file_name || '') ? 'PDF' : 'Word'} · tap to view</Muted>
          </Pressable>
          {mine ? <Text style={{ color: base.ok, fontWeight: '700', fontSize: 12 }}>Signed {fmt(mine.signed_at)}</Text>
            : isHb ? <View style={{ width: 120 }}><Button title="Read & sign" onPress={async () => {
              if (!(await needSig())) return;
              if (!(await confirmAsk('I confirm I have read and understood the company handbook.', 'Sign'))) return;
              toast((await signPolicies(me, [p.id])) ? 'Handbook signed' : 'Could not sign — try again.'); refresh();
            }} /></View> : <Text style={{ color: base.warn, fontWeight: '700', fontSize: 12 }}>To sign</Text>}
          {isAdmin && <Pressable hitSlop={8} onPress={() => setOpenId(open ? null : p.id)}><Text style={{ color: base.slate }}>{open ? '▲' : '▼'}</Text></Pressable>}
        </View>
        {isAdmin && open && (
          <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: base.line, paddingTop: 8 }}>
            <Muted style={{ marginBottom: 4 }}>{sb.size} of {people.length} signed</Muted>
            {people.map((u) => { const s = sb.get(u.id); return (
              <View key={u.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
                <Text style={{ color: base.ink }}>{u.name}</Text>
                <Text style={{ color: s ? base.ok : base.slate, fontWeight: '700' }}>{s ? `✓ ${fmt(s.signed_at)}` : 'Not yet'}</Text>
              </View>
            ); })}
            <Button kind="ghost" title="Remove document" onPress={async () => {
              if (!(await confirmAsk('Remove this document? Signatures already collected are kept on record.', 'Remove'))) return;
              toast((await archivePolicy(p.id)) ? 'Removed' : 'Could not save — try again.'); refresh();
            }} />
          </View>
        )}
      </Card>
    );
  };
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <Stack.Screen options={{ title: 'Policies & handbook' }} />
      <SectionTitle>Company policies</SectionTitle>
      {isLoading ? <Muted>Loading…</Muted> : (
        <>
          {toSign.length ? <Button title={`✍ Sign all ${toSign.length} polic${toSign.length === 1 ? 'y' : 'ies'}`} onPress={async () => {
            if (!(await needSig())) return;
            if (!(await confirmAsk(`Sign all ${toSign.length} company polic${toSign.length === 1 ? 'y' : 'ies'}? This confirms you have read and understood ${toSign.length === 1 ? 'it' : 'them'}.`, 'Sign all'))) return;
            toast((await signPolicies(me, toSign.map((p) => p.id))) ? 'Signed' : 'Could not sign — try again.'); refresh();
          }} /> : policies.length ? <Text style={{ color: base.ok, fontWeight: '700', marginBottom: 10 }}>✓ You&apos;ve signed every policy.</Text> : null}
          {policies.length ? policies.map((p) => row(p, false)) : <Empty>No policies uploaded yet.</Empty>}
          {isAdmin && <Button kind="ghost" busy={busy} title="+ Upload policies (PDF or Word, several at once)" onPress={() => void upload('policy')} />}
          <SectionTitle>Company handbook</SectionTitle>
          <Muted style={{ marginBottom: 8 }}>Read it, then sign it on its own — it isn&apos;t part of &quot;Sign all&quot;.</Muted>
          {handbooks.length ? handbooks.map((p) => row(p, true)) : <Empty>No handbook uploaded yet.</Empty>}
          {isAdmin && <Button kind="ghost" busy={busy} title="+ Upload handbook (PDF or Word)" onPress={() => void upload('handbook')} />}
          {isAdmin && <Card style={{ marginTop: space.m }}><Muted>Exporting or emailing the signed record as a PDF is still in the current app for now.</Muted></Card>}
        </>
      )}
    </ScrollView>
  );
}
