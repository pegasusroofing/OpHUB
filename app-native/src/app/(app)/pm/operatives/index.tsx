// Operatives (320 renderOperativesList): every operative with their site and
// certificate counts; search; tap one for their full record. Opened from a job's
// H&S › Operatives tile with ?site= it lists just the people on that job. 14 Nov 2026 (Andy): the Training Matrix
// Excel / PDF are a footer row, half each; no Operative Tools list here (each operative's tools are on their page).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { CertsPanel } from '@/components/CertsPanel';
import { DashTabs } from '@/components/DashTabs';
import { ManualOpsList } from '@/components/ManualOpsList';
import { confirmAsk, useToast } from '@/components/toast';
import { stickyFoot } from '@/components/FinFilterBar';
import { Button, Empty, Muted, SectionTitle } from '@/components/ui';
import { addManualPerson, removeManualPerson, useManualPeople, useOperativeList } from '@/data/certs';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { exportTrainingMatrixExcel, exportTrainingMatrixPdf } from '@/lib/pdfLazy';
import { loadTrainingMatrix } from '@/lib/trainingMatrixData';
import { isManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import { base, page, radius, space, useDesk } from '@/theme/theme';

export default function Operatives() {
  const { site } = useLocalSearchParams<{ site?: string }>();
  const { me, org } = useAuth();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');
  const [openFor, setOpenFor] = useState<Set<string>>(new Set());
  const [newName, setNewName] = useState('');
  const qc = useQueryClient();
  const { data: manual = [] } = useManualPeople(site);
  const desk = useDesk();
  const matrix = async (k: 'x' | 'p') => {
    if (!me?.org_id) return;
    setBusy(k);
    try { const m = await loadTrainingMatrix(me.org_id); await (k === 'x' ? exportTrainingMatrixExcel(m, org) : exportTrainingMatrixPdf(m, org)); }
    catch { toast('Could not make the Training Matrix — try again.'); }
    setBusy('');
  };
  const { data: ops = [], isLoading } = useOperativeList(me?.org_id);
  const { data: sites = [] } = useSites();
  const { data: onSite } = useQuery({
    queryKey: ['siteOpsList', site], enabled: !!site,
    queryFn: async () => new Set((((await supabase.from('site_assignments').select('user_id').eq('site_id', site as string)).data ?? []) as { user_id: string }[]).map((r) => r.user_id)),
  });
  if (!me) return null;
  // A client sees the job's operatives (630/670 client view); everything else is managers only.
  if (!isManager(me) && !(me.role === 'client' && site)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  const siteName = site ? sites.find((s) => s.id === site)?.name : null;
  const shown = ops.filter((o) => (!site || onSite?.has(o.id)) && (!q.trim() || (o.name || '').toLowerCase().includes(q.trim().toLowerCase())));
  return (
    <View style={{ flex: 1 }}>
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: siteName ? `Operatives · ${siteName}` : 'Dashboards' }} />
      {!site && <DashTabs on="operatives" />}
      <TextInput value={q} onChangeText={setQ} placeholder="Search operatives…" style={{ borderWidth: 1.5, borderColor: base.line, borderRadius: radius.input, padding: 12, color: base.ink, backgroundColor: base.card, marginBottom: 10 }} />
      {!site && <Pressable onPress={() => router.push('/pm/operatives/matrix' as never)} style={{ alignSelf: 'center', marginBottom: 10 }}><Text style={{ fontSize: 12.5, color: base.blue }}>View The Training Matrix On Screen ›</Text></Pressable>}
      {/* 9219zzg (4 Nov 2026): + Add Operative, and the ones not signed up yet. */}
      {!site && isManager(me) && <ManualOpsList q={q} />}
      {isLoading ? <Muted>Loading…</Muted> : shown.length ? shown.map((o) => (
        <Pressable key={o.id} onPress={() => router.push(`/pm/operatives/${o.id}` as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 10, backgroundColor: base.card }}>
          <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: base.blueBg, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontWeight: '600', color: base.blue }}>{(o.name || '?').split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '600', color: base.ink }}>{o.name}</Text>
            <Muted>{o.sites} site{o.sites === 1 ? '' : 's'} · {o.certs} certificate{o.certs === 1 ? '' : 's'}{o.phone ? ` · 📞 ${o.phone}` : ''}</Muted>
          </View>
          <Text style={{ color: base.slate, fontSize: 18 }}>›</Text>
        </Pressable>
      )) : <Empty>{site ? 'No operatives assigned to this job yet.' : 'No operatives found.'}</Empty>}
      {!!site && (
        <>
          <SectionTitle>Other People ({manual.length})</SectionTitle>
          <Muted style={{ marginBottom: 10 }}>For someone with certificates to track who isn&apos;t a registered operative — a subcontractor, for example. No account or login is created for them.</Muted>
          {manual.map((p) => (
            <View key={p.id}>
              <Pressable disabled={!isManager(me)} onPress={() => setOpenFor((x) => { const n = new Set(x); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 10, backgroundColor: base.card }}>
                <View style={{ flex: 1 }}><Text style={{ fontWeight: '600', color: base.ink }}>{p.name}</Text><Muted>{p.certs} certificate{p.certs === 1 ? '' : 's'}</Muted></View>
                {isManager(me) && <Pressable hitSlop={8} onPress={async () => { if (!(await confirmAsk("Remove this person? Their certificates will be deleted too — this can't be undone.", 'Remove'))) return; toast((await removeManualPerson(p.id)) ? 'Removed' : 'Could not remove — try again.'); void qc.invalidateQueries({ queryKey: ['manualPeople', site] }); }}><Text>🗑</Text></Pressable>}
              </Pressable>
              {openFor.has(p.id) && isManager(me) && <View style={{ backgroundColor: base.card, borderRadius: 14, borderWidth: 1, borderColor: base.cardLine, padding: 12, marginBottom: 10 }}><CertsPanel userId={p.id} manual /></View>}
            </View>
          ))}
          {isManager(me) && (
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
              <TextInput value={newName} onChangeText={setNewName} placeholder="Name" style={{ flex: 1, borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card }} />
              <Button title="+ Add Person" onPress={async () => { if (!newName.trim()) { toast('Enter a name.'); return; } if (await addManualPerson(me, site, newName.trim())) { toast('Added — you can now upload certificates for them.'); setNewName(''); void qc.invalidateQueries({ queryKey: ['manualPeople', site] }); } else toast('Could not save — try again.'); }} />
            </View>
          )}
        </>
      )}
    </ScrollView>
    {/* The Training Matrix exports: a footer row, half each (Andy, 14 Nov 2026). */}
    {!site && (
      <View accessibilityLabel="Export footer" style={[{ flexDirection: 'row', gap: 10, backgroundColor: base.card, borderTopWidth: 1, borderTopColor: base.line, paddingHorizontal: desk ? 40 : 16, paddingVertical: 10 }, stickyFoot]}>
        <View style={{ flex: 1, flexBasis: 0 }}><Button kind="ghost" busy={busy === 'x'} title="Export Training Matrix (Excel)" onPress={() => void matrix('x')} /></View>
        <View style={{ flex: 1, flexBasis: 0 }}><Button kind="ghost" busy={busy === 'p'} title="Export Training Matrix (PDF)" onPress={() => void matrix('p')} /></View>
      </View>
    )}
    </View>
  );
}
