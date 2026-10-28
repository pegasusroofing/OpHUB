// Toolbox talks for a job (710). Operatives see every talk (live ones to sign).
// Managers get Bank / Live / Completed tabs (Live first when there is one), the
// monthly "due" warning, signed counts and who's still to sign, upload into the
// bank and sync the bank from the Admin Centre library.
import * as DocumentPicker from 'expo-document-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { TbtStatusTag } from '@/components/TbtStatusTag';
import { useToast } from '@/components/toast';
import { Button, Card, Empty, Muted, SectionTitle } from '@/components/ui';
import { nameOf, usePeople, useTbts } from '@/data/hs';
import { useSite } from '@/data/sites';
import { syncTbtBank, tbtDue, uploadTbt } from '@/data/tbtManager';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import { base, radius, space } from '@/theme/theme';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

export default function Tbts() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: site } = useSite(id);
  const { data: talks, isLoading } = useTbts(site);
  const { data: people } = usePeople();
  const mgr = !!me && isManager(me);
  const [tab, setTab] = useState<'bank' | 'live' | 'completed' | null>(null);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<{ uri: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // Managers: signed counts and who's still to sign on live talks.
  const { data: roster } = useQuery({
    queryKey: ['tbtRoster', id, (talks ?? []).map((t) => t.id).join(',')],
    enabled: mgr && !!talks?.length,
    queryFn: async () => {
      const ids = (talks ?? []).map((t) => t.id);
      const [s, a] = await Promise.all([db.from('toolbox_talk_signatures').select('tbt_id,user_id').in('tbt_id', ids), db.from('site_assignments').select('user_id').eq('site_id', id)]);
      return { sigs: (s.data as { tbt_id: string; user_id: string }[] | null) ?? [], assigned: ((a.data as { user_id: string }[] | null) ?? []).map((x) => x.user_id) };
    },
  });
  if (!me) return null;
  const opIds = new Set((people ?? []).filter((p) => p.role === 'operative').map((p) => p.id));
  const hasLive = (talks ?? []).some((t) => t.status === 'live');
  const cur = tab ?? (hasLive ? 'live' : 'bank');
  const shown = mgr ? (talks ?? []).filter((t) => t.status === cur) : talks ?? [];
  const due = mgr && site && talks ? tbtDue(site, talks) : null;
  const refresh = () => void qc.invalidateQueries({ queryKey: ['tbts', id] });

  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Toolbox Talks' }} />
      {!!due && (
        <Card style={{ borderColor: base.warn, borderWidth: 1.5 }}>
          <Text style={{ fontWeight: '700', color: base.warn }}>{due}</Text>
          <Muted>A Toolbox Talk must be issued and signed off every month. Issue one from Bank TBT below.</Muted>
        </Card>
      )}
      {mgr && (
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          {(['bank', 'live', 'completed'] as const).map((k) => (
            <Pressable key={k} onPress={() => setTab(k)} style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: cur === k ? base.ink : base.line, backgroundColor: cur === k ? base.ink : base.card }}>
              <Text style={{ fontWeight: '700', color: cur === k ? '#fff' : base.ink }}>{k === 'bank' ? 'Bank TBT' : k === 'live' ? 'Live TBT' : 'Completed TBT'}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {isLoading || !site ? <Muted>Loading…</Muted> : shown.length ? shown.map((t) => {
        const signed = (roster?.sigs ?? []).filter((s) => s.tbt_id === t.id && opIds.has(s.user_id));
        const waiting = t.status === 'live' ? (roster?.assigned ?? []).filter((u) => opIds.has(u) && !signed.some((s) => s.user_id === u)) : [];
        return (
          <Pressable key={t.id} onPress={() => router.push(`/sites/${site.id}/hs/tbt/${t.id}`)}>
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '800', color: base.ink }}>{t.title}</Text>
                  <Muted>{new Date(t.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</Muted>
                </View>
                <TbtStatusTag status={t.status} />
              </View>
              {mgr && <Muted style={{ marginTop: 6 }}>{signed.length} signed</Muted>}
              {mgr && t.status === 'live' && roster && (waiting.length
                ? <Text style={{ color: base.warn, fontSize: 12.5 }}>Still to sign: {waiting.map((u) => nameOf(people, u)).join(', ')}</Text>
                : <Text style={{ color: base.ok, fontSize: 12.5 }}>✓ Everyone has signed</Text>)}
            </Card>
          </Pressable>
        );
      }) : <Empty>No {mgr ? `${cur === 'bank' ? 'bank' : cur} ` : ''}toolbox talks{mgr ? '' : ' yet'}.</Empty>}

      {mgr && cur === 'bank' && (
        <>
          <Button kind="ghost" busy={busy} title="🔄 Sync Bank TBT from Admin Centre Library" onPress={async () => { setBusy(true); toast(await syncTbtBank(me, id)); setBusy(false); refresh(); }} />
          <Card>
            <SectionTitle>Upload a toolbox talk</SectionTitle>
            <TextInput value={title} onChangeText={setTitle} placeholder="Title, e.g. Week 24 — Manual Handling" style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, marginBottom: 8 }} />
            <Button kind="ghost" title={file ? `📄 ${file.name}` : 'Choose PDF'} onPress={async () => {
              const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
              if (!r.canceled && r.assets[0]) setFile({ uri: r.assets[0].uri, name: r.assets[0].name || 'talk.pdf' });
            }} />
            <Button busy={busy} title="Upload" onPress={async () => {
              if (!title.trim() || !file) { toast('Add a title and choose a PDF.'); return; }
              setBusy(true); const err = await uploadTbt(me, id, title.trim(), file); setBusy(false);
              if (err) { toast(err); return; }
              toast('Toolbox talk uploaded to Bank TBT'); setTitle(''); setFile(null); setTab('bank'); refresh();
            }} />
            <Muted>New uploads go into Bank TBT — operatives can't see them until you tap "Issue for Signing".</Muted>
          </Card>
        </>
      )}
      {mgr && <Muted style={{ marginTop: space.m }}>Subcontractor toolbox talks, signed-TBT PDFs and emailing completed talks are still in the current app for now.</Muted>}
    </ScrollView>
  );
}
