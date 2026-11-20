// A subcontractor's O&M manuals on a main contractor job (Andy, 20 Nov 2026: "We need it so that subcontractors submit or
// can do their o&ms too, and then that would add into our o&ms when we are main contractor as appendix's"). Their admin
// uploads their own O&M (a PDF, submitted straight away) or builds one here in the same O&M builder and submits it from its
// Issue tab. Submitted ones go in the back of the main contractor's O&M manual (its Appendix tab). Managers see them too.
import * as DocumentPicker from 'expo-document-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { viewDoc } from '@/components/DocViewer';
import { chooseAction, confirmAsk, promptText, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted } from '@/components/ui';
import { openDocLink } from '@/data/hs';
import { deleteManual, loadSubOms, newManual, uploadSubOm } from '@/data/omManual';
import { useSite } from '@/data/sites';
import { useSubco } from '@/data/subcontractors';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import { base, page, space } from '@/theme/theme';

const when = (t: string | null) => (t ? new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

export default function SubcoOm() {
  const { id, co } = useLocalSearchParams<{ id: string; co: string }>();
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: site } = useSite(id);
  const { data: subco, isLoading } = useSubco(co, me);
  const { data: list } = useQuery({ queryKey: ['subOms', id, co], enabled: !!id && !!co, queryFn: () => loadSubOms(id, co) });
  const [busy, setBusy] = useState('');
  if (!me || !site || isLoading) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  if (!subco) return <Muted style={{ padding: space.l }}>Subcontractor not found.</Muted>;
  const canEdit = isManager(me) || subco.isAdmin;
  if (!canEdit) return <Muted style={{ padding: space.l }}>Only your company’s admin and the main contractor’s managers can see the O&amp;M manuals.</Muted>;
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['subOms', id] }); void qc.invalidateQueries({ queryKey: ['subco', co] }); void qc.invalidateQueries({ queryKey: ['handover', id] }); };
  const mc = org?.name || 'the main contractor';

  const upload = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    if (r.canceled || !r.assets[0]) return;
    setBusy('up');
    const ok = await uploadSubOm(me, site, co, { uri: r.assets[0].uri, name: r.assets[0].name || 'O&M Manual.pdf', mimeType: r.assets[0].mimeType });
    setBusy('');
    if (!ok) { toast('Could not upload — check your signal and try again.'); return; }
    refresh();
  };
  const build = async () => {
    setBusy('new');
    const mid = await newManual(me, org, site, `${subco.company.name} O&M Manual`, co);
    setBusy('');
    if (!mid) { toast('Could not start the manual — try again.'); return; }
    refresh(); router.push(`/sites/${id}/mc/subcontractors/${co}/om/${mid}` as never);
  };
  const view = async (path: string | null) => {
    const u = path ? await openDocLink('mc-documents', path) : null;
    if (u) viewDoc(u); else toast('Could not open the PDF.');
  };

  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: `${subco.company.name} — O&M` }} />
      <Card>
        <Muted>Your O&amp;M manual for the works you carried out on this job. Upload your own, or build one here (it starts with the Schedule of Works tasks given to you and your COSHH). Once it’s submitted it goes in the back of {mc}’s O&amp;M manual.</Muted>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 10 }}>
          <Button busy={busy === 'up'} title="⬆️ Upload Our O&M (PDF)" onPress={() => void upload()} />
          <Button kind="ghost" busy={busy === 'new'} title="+ Build One Here" onPress={() => void build()} />
        </View>
      </Card>
      {list?.length ? list.map((m) => (
        <Card key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }} accessibilityRole="button"
            onPress={() => { if (m.built) router.push(`/sites/${id}/mc/subcontractors/${co}/om/${m.id}` as never); else void view(m.path); }}>
            <Text style={{ fontSize: 24 }}>📘</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '600', color: base.ink }}>{m.name}</Text>
              <Muted>{m.submittedAt ? `Submitted ${when(m.submittedAt)}${m.rev ? ` · Revision ${m.rev}` : ''}` : 'Not Submitted Yet'}{m.built ? ' · Built Here' : ' · Uploaded PDF'}</Muted>
            </View>
          </Pressable>
          <Pressable hitSlop={8} accessibilityLabel={`${m.name} options`} onPress={async () => {
            const k = await chooseAction(m.name, [
              ...(m.path ? [{ key: 'view', label: '📄 View The PDF' }] : []),
              ...(m.built ? [{ key: 'open', label: '✎ Open The Builder' }] : []),
              { key: 'ren', label: '✎ Rename' },
              { key: 'del', label: '🗑 Delete', danger: true },
            ]);
            if (k === 'view') void view(m.path);
            if (k === 'open') router.push(`/sites/${id}/mc/subcontractors/${co}/om/${m.id}` as never);
            if (k === 'ren') {
              const n = (await promptText('Rename This O&M Manual', m.name))?.trim(); if (!n) return;
              if ((await supabase.from('handover_om_manuals').update({ name: n } as never).eq('id', m.id).select('id')).data?.length) refresh(); else toast('Could not save — try again.');
            }
            if (k === 'del' && (await confirmAsk(`Delete "${m.name}"? ${m.submittedAt ? `It comes out of ${mc}’s O&M manual too. ` : ''}This can’t be undone.`, 'Yes', 'No'))) {
              if (await deleteManual(m.id)) refresh(); else toast('Could not delete — try again.');
            }
          }}><Text style={{ fontSize: 18, color: base.slate, paddingHorizontal: 4 }}>⋮</Text></Pressable>
        </Card>
      )) : <Empty>No O&amp;M manuals yet.</Empty>}
    </ScrollView>
  );
}
