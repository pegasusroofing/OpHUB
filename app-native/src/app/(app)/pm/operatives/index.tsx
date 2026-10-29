// Operatives (320 renderOperativesList): every operative with their site and
// certificate counts; search; tap one for their full record. Opened from a job's
// H&S › Operatives tile with ?site= it lists just the people on that job. Training
// Matrix Excel / PDF at the top, Operative Tools (everyone's tools) underneath.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { CertsPanel } from '@/components/CertsPanel';
import { MyToolsList } from '@/components/MyToolsList';
import { confirmAsk, useToast } from '@/components/toast';
import { Button, Empty, Muted, SectionTitle, Toggle } from '@/components/ui';
import { addManualPerson, removeManualPerson, useManualPeople, useOperativeList } from '@/data/certs';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { exportTrainingMatrixExcel, exportTrainingMatrixPdf, loadTrainingMatrix } from '@/lib/trainingMatrix';
import { isManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import { base, page, radius, space } from '@/theme/theme';

export default function Operatives() {
  const { site } = useLocalSearchParams<{ site?: string }>();
  const { me, org } = useAuth();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');
  const [toolsOpen, setToolsOpen] = useState(false);
  const [openFor, setOpenFor] = useState<Set<string>>(new Set());
  const [newName, setNewName] = useState('');
  const qc = useQueryClient();
  const { data: manual = [] } = useManualPeople(site);
  const { data: toolCount } = useQuery({
    queryKey: ['opToolCounts', me?.org_id], enabled: toolsOpen && !!me?.org_id,
    queryFn: async () => {
      const n: Record<string, number> = {};
      (((await supabase.from('operative_tools').select('user_id').eq('org_id', me?.org_id as string)).data ?? []) as { user_id: string }[]).forEach((t) => { n[t.user_id] = (n[t.user_id] || 0) + 1; });
      return n;
    },
  });
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
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: siteName ? `Operatives · ${siteName}` : 'Operatives' }} />
      <TextInput value={q} onChangeText={setQ} placeholder="Search operatives…" style={{ borderWidth: 1.5, borderColor: base.line, borderRadius: radius.input, padding: 12, color: base.ink, backgroundColor: base.card, marginBottom: 14 }} />
      {!site && (
        <View style={{ gap: 10, marginBottom: 14 }}>
          <Button kind="ghost" busy={busy === 'x'} title="📊 Export Training Matrix (Excel)" onPress={() => void matrix('x')} />
          <Button kind="ghost" busy={busy === 'p'} title="📄 Export Training Matrix (PDF)" onPress={() => void matrix('p')} />
          <Pressable onPress={() => router.push('/pm/operatives/matrix' as never)} style={{ alignSelf: 'center' }}><Text style={{ fontSize: 12, color: base.blue }}>View the matrix on screen ›</Text></Pressable>
        </View>
      )}
      {isLoading ? <Muted>Loading…</Muted> : shown.length ? shown.map((o) => (
        <Pressable key={o.id} onPress={() => router.push(`/pm/operatives/${o.id}` as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 8, backgroundColor: base.card }}>
          <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: base.blueBg, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontWeight: '800', color: base.blue }}>{(o.name || '?').split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', color: base.ink }}>{o.name}</Text>
            <Muted>{o.sites} site{o.sites === 1 ? '' : 's'} · {o.certs} certificate{o.certs === 1 ? '' : 's'}{o.phone ? ` · 📞 ${o.phone}` : ''}</Muted>
          </View>
          <Text style={{ color: base.slate, fontSize: 18 }}>›</Text>
        </Pressable>
      )) : <Empty>{site ? 'No operatives assigned to this job yet.' : 'No operatives found.'}</Empty>}
      {!!site && (
        <>
          <SectionTitle>Other People ({manual.length})</SectionTitle>
          <Muted style={{ marginBottom: 8 }}>For someone with certificates to track who isn&apos;t a registered operative — a subcontractor, for example. No account or login is created for them.</Muted>
          {manual.map((p) => (
            <View key={p.id}>
              <Pressable disabled={!isManager(me)} onPress={() => setOpenFor((x) => { const n = new Set(x); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 8, backgroundColor: base.card }}>
                <View style={{ flex: 1 }}><Text style={{ fontWeight: '700', color: base.ink }}>{p.name}</Text><Muted>{p.certs} certificate{p.certs === 1 ? '' : 's'}</Muted></View>
                {isManager(me) && <Pressable hitSlop={8} onPress={async () => { if (!(await confirmAsk("Remove this person? Their certificates will be deleted too — this can't be undone.", 'Remove'))) return; toast((await removeManualPerson(p.id)) ? 'Removed' : 'Could not remove — try again.'); void qc.invalidateQueries({ queryKey: ['manualPeople', site] }); }}><Text>🗑</Text></Pressable>}
              </Pressable>
              {openFor.has(p.id) && isManager(me) && <View style={{ backgroundColor: base.card, borderRadius: 14, borderWidth: 1, borderColor: base.cardLine, padding: 12, marginBottom: 10 }}><CertsPanel userId={p.id} manual /></View>}
            </View>
          ))}
          {isManager(me) && (
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
              <TextInput value={newName} onChangeText={setNewName} placeholder="Name" style={{ flex: 1, borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card }} />
              <Button title="+ Add person" onPress={async () => { if (!newName.trim()) { toast('Enter a name.'); return; } if (await addManualPerson(me, site, newName.trim())) { toast('Added — you can now upload certificates for them.'); setNewName(''); void qc.invalidateQueries({ queryKey: ['manualPeople', site] }); } else toast('Could not save — try again.'); }} />
            </View>
          )}
        </>
      )}
      {!site && (
        <>
          <Toggle title="Operative Tools" open={toolsOpen} onPress={() => setToolsOpen(!toolsOpen)} />
          {toolsOpen && (ops.length ? ops.map((o) => {
            const on = openFor.has(o.id);
            return (
              <View key={o.id}>
                <Pressable onPress={() => setOpenFor((x) => { const n = new Set(x); if (n.has(o.id)) n.delete(o.id); else n.add(o.id); return n; })} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4 }}>
                  <Text style={{ color: base.slate, marginRight: 8 }}>{on ? '▼' : '▶'}</Text>
                  <Text style={{ fontWeight: '700', color: base.ink }}>{o.name} ({toolCount?.[o.id] ?? 0})</Text>
                </Pressable>
                {on && <View style={{ backgroundColor: base.card, borderRadius: 14, borderWidth: 1, borderColor: base.cardLine, padding: 12, marginBottom: 10 }}><MyToolsList userId={o.id} name={o.name} /></View>}
              </View>
            );
          }) : <Empty>No operatives yet.</Empty>)}
        </>
      )}
    </ScrollView>
  );
}
