// A subcontractor's Daily Briefings log (550 renderSubBriefings): a title and an
// optional PDF. RTB managers and the company's admin log and delete them.
// The operatives chosen when it's logged sign it (Andy, 20 Nov 2026: "sub contractors for a company need to sign daily
// breifings should they be selected"): Who Must Sign, ticked; each briefing shows who has signed; theirs to tap.
import * as DocumentPicker from 'expo-document-picker';
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Check, Empty, Muted, SectionTitle } from '@/components/ui';
import { RowSigners } from '@/components/HsDocList';
import { viewDoc } from '@/components/DocViewer';
import { nameOf, openDocLink, usePeople } from '@/data/hs';
import { addSubBriefing, deleteSubBriefing, signSubBriefing, useSubBriefings, useSubco, useSubOperatives } from '@/data/subcontractors';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { base, page, radius, space } from '@/theme/theme';

export default function SubBriefings() {
  const { id, co } = useLocalSearchParams<{ id: string; co: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: sub } = useSubco(co, me);
  const { data: list, isLoading } = useSubBriefings(co);
  const { data: people } = usePeople();
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<{ uri: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const { data: ops } = useSubOperatives(id, co);
  const [skip, setSkip] = useState<Record<string, boolean>>({});
  if (!me || !sub) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const manage = isManager(me) || sub.isAdmin;
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['subBriefings', co] }); void qc.invalidateQueries({ queryKey: ['subco', co] }); };
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: `${sub.company.name} — Daily Briefings` }} />
      {isLoading ? <Muted>Loading…</Muted> : list?.length ? list.map((b) => (
        <Card key={b.id}>
          <Text style={{ fontWeight: '600', color: base.ink }}>{b.title}</Text>
          <Muted>{nameOf(people, b.submitted_by)} · {new Date(b.submitted_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</Muted>
          {!!b.storage_path && <Pressable onPress={async () => { const u = await openDocLink('rams-docs', b.storage_path as string); if (u) viewDoc(u); }}><Text style={{ color: base.blue }}>View document ↗</Text></Pressable>}
          {!!b.signers?.length && (() => {
            const signed = b.sigs.map((x) => ({ id: `${b.id}-${x.user_id}`, user_id: x.user_id, signed_at: x.signed_at }));
            const waiting = (b.signers || []).filter((u) => !b.sigs.some((x) => x.user_id === u));
            const mineToSign = waiting.includes(me.id);
            return (
              <>
                {mineToSign && (
                  <Pressable accessibilityRole="button" disabled={busy} onPress={async () => {
                    if (!(me as { signature_path?: string | null }).signature_path) { toast('Adopt your signature first — one tap and it’s used everywhere.'); router.push('/signature'); return; }
                    setBusy(true); const ok = await signSubBriefing(me, b.id); setBusy(false);
                    if (!ok) toast('Could not sign — check your signal and try again.'); refresh();
                  }} style={{ marginTop: 8, borderWidth: 1.5, borderStyle: 'dashed', borderColor: base.line, borderRadius: radius.input, padding: 12, alignItems: 'center' }}>
                    <Text style={{ color: base.ink, fontWeight: '600' }}>✍ Tap To Sign</Text>
                  </Pressable>
                )}
                <RowSigners total={(b.signers || []).length} signed={signed} waiting={waiting} people={people} />
              </>
            );
          })()}
          {manage && <Pressable onPress={async () => { if (await confirmAsk('Delete this briefing?', 'Delete') && await deleteSubBriefing(b.id)) { toast('Deleted'); refresh(); } }}><Text style={{ marginTop: 6 }}>🗑</Text></Pressable>}
        </Card>
      )) : <Empty>No daily briefings logged yet.</Empty>}
      {manage && (
        <Card>
          <SectionTitle>Log a briefing</SectionTitle>
          <TextInput value={title} onChangeText={setTitle} placeholder="e.g. Monday morning briefing" style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, marginBottom: 8 }} />
          {!!ops?.allocated.length && (
            <View style={{ marginBottom: 8 }}>
              <Muted style={{ fontWeight: '600', marginBottom: 2 }}>Who Must Sign</Muted>
              {ops.allocated.map((o) => <Check key={o.user_id} label={nameOf(people, o.user_id)} value={!skip[o.user_id]} onChange={(v) => setSkip({ ...skip, [o.user_id]: !v })} />)}
            </View>
          )}
          <Button kind="ghost" title={file ? `📄 ${file.name}` : 'Choose PDF (optional)'} onPress={async () => { const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true }); if (!r.canceled && r.assets[0]) setFile({ uri: r.assets[0].uri, name: r.assets[0].name || 'briefing.pdf' }); }} />
          <Button busy={busy} title="Log Briefing" onPress={async () => {
            if (!title.trim()) { toast('Add a title.'); return; }
            setBusy(true); const ok = await addSubBriefing(me, id, co, title.trim(), file, (ops?.allocated ?? []).map((o) => o.user_id).filter((u) => !skip[u])); setBusy(false);
            if (ok) { setTitle(''); setFile(null); setSkip({}); refresh(); } else toast('Could not save — try again.');
          }} />
        </Card>
      )}
    </ScrollView>
  );
}
