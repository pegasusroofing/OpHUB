// One stage's repair jobs (340 renderRepairJobsListPage): search, sort, tap a
// job to open it. Managers can select several and approve, mark completed or
// close them together, and export the stage in route order (from the yard) or,
// for Approved & Ready, oldest approval first.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { chooseAction, confirmAsk, useToast } from '@/components/toast';
import { Button, Empty, Muted } from '@/components/ui';
import { patchRepairJob, patchRepairJobs, useRepairHiddenTiles, useRepairJobs } from '@/data/repairs';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { exportRepairRoute, exportRepairsByApproved, lastRepairRoute, REPAIR_ROUTE_CATEGORIES, viewLastRepairRoute } from '@/lib/repairExports';
import { approveStatus, matchesRepairSearch, REPAIR_CATEGORIES, REPAIR_SORT_LABELS, sortRepairs, type RepairSort } from '@/lib/rules/repairs';
import { isManager } from '@/lib/roles';
import { base, radius, space } from '@/theme/theme';

export default function RepairList() {
  const { id, cat } = useLocalSearchParams<{ id: string; cat: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: jobs = [], isLoading } = useRepairJobs(id);
  const { data: hidden = [] } = useRepairHiddenTiles(me?.org_id);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<RepairSort>('date_desc');
  const [selecting, setSelecting] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  if (!me) return null;
  const mgr = isManager(me);
  const key = REPAIR_CATEGORIES[cat] ? cat : 'open';
  if (!mgr && hidden.includes(key)) return <Muted style={{ padding: space.l }}>You don&apos;t have access to that list.</Muted>;
  const def = REPAIR_CATEGORIES[key];
  const list = sortRepairs(jobs.filter(def.match).filter((j) => matchesRepairSearch(j, q)), sort);
  const sorts = (Object.keys(REPAIR_SORT_LABELS) as RepairSort[]).filter((k) => k !== 'approved_asc' || key === 'approved');
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['repairJobs', id] }); setSel(new Set()); setSelecting(false); };
  const chosen = jobs.filter((j) => sel.has(j.id));
  const bulk = async (what: 'approve' | 'complete' | 'close') => {
    if (!chosen.length) { toast('Select some jobs first.'); return; }
    const label = { approve: 'Approve', complete: 'Mark completed', close: 'Close (subject to invoice)' }[what];
    if (!(await confirmAsk(`${label} ${chosen.length} job${chosen.length === 1 ? '' : 's'}?`, label))) return;
    const now = new Date().toISOString();
    let ok = true;
    if (what === 'approve') {
      for (const j of chosen) ok = (await patchRepairJob(j.id, { quote_approved: true, approved_by: me.id, self_authorized: false, job_status: approveStatus(j), ...(j.quote_approved_at ? {} : { quote_approved_at: now }) })) && ok;
    } else if (what === 'complete') {
      for (const j of chosen) ok = (await patchRepairJob(j.id, { works_completed: true, works_completed_date: now, ...(j.closed ? {} : { job_status: 'Awaiting Sign-off' }) })) && ok;
    } else {
      ok = await patchRepairJobs(chosen.map((j) => j.id), { closed: true, closed_by: me.id, closed_at: now, job_status: 'Closed' });
    }
    toast(ok ? 'Done' : 'Some could not be saved — try again.'); refresh();
  };
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: def.label }} />
      <TextInput value={q} onChangeText={setQ} placeholder="Search address, description or job number" style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card, marginBottom: 8 }} />
      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 10, alignItems: 'center' }}>
        <Pressable onPress={async () => { const k = await chooseAction('Sort by', sorts.map((s) => ({ key: s, label: REPAIR_SORT_LABELS[s] }))); if (k) setSort(k as RepairSort); }}><Text style={{ color: base.blue }}>⇅ {REPAIR_SORT_LABELS[sort]}</Text></Pressable>
        <View style={{ flex: 1 }} />
        {mgr && <Pressable onPress={() => { setSelecting(!selecting); setSel(new Set()); }}><Text style={{ color: base.blue, fontWeight: '700' }}>{selecting ? 'Cancel' : 'Select'}</Text></Pressable>}
      </View>
      {selecting && (
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
          <View style={{ flex: 1 }}><Button title="Approve" onPress={() => void bulk('approve')} /></View>
          <View style={{ flex: 1 }}><Button kind="ghost" title="Completed" onPress={() => void bulk('complete')} /></View>
          <View style={{ flex: 1 }}><Button kind="ghost" title="Close" onPress={() => void bulk('close')} /></View>
        </View>
      )}
      {mgr && (REPAIR_ROUTE_CATEGORIES.includes(key) || key === 'approved') && <RouteExports siteId={id} cat={key} jobs={jobs} />}
      <Muted style={{ marginBottom: 6 }}>{list.length} job{list.length === 1 ? '' : 's'}</Muted>
      {isLoading ? <Muted>Loading…</Muted> : list.length ? list.map((j) => (
        <Pressable key={j.id} onPress={() => (selecting ? setSel((s) => { const n = new Set(s); if (n.has(j.id)) n.delete(j.id); else n.add(j.id); return n; }) : router.push(`/sites/${id}/repairs/job/${j.id}` as never))}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, borderColor: sel.has(j.id) ? base.ink : base.cardLine, borderRadius: radius.row, marginBottom: 8, backgroundColor: base.card }}>
          {selecting && <Text style={{ fontSize: 18 }}>{sel.has(j.id) ? '☑' : '☐'}</Text>}
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', color: base.ink }}>{j.job_number ? `${j.job_number} · ` : ''}{j.address || 'No address'}</Text>
            {!!j.description && <Text style={{ color: base.slate, fontSize: 13 }} numberOfLines={2}>{j.description}</Text>}
            <Muted style={{ fontSize: 11 }}>{j.job_status || 'To Survey'}{j.closed ? (j.invoiced ? ' · Invoiced' : ' · Subject to invoice') : ''}</Muted>
          </View>
          {!selecting && <Text style={{ color: base.slate, fontSize: 18 }}>›</Text>}
        </Pressable>
      )) : <Empty>No jobs here.</Empty>}
    </ScrollView>
  );
}

function RouteExports({ siteId, cat, jobs }: { siteId: string; cat: string; jobs: Parameters<typeof exportRepairsByApproved>[1] }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { data: site } = useSite(siteId);
  const [busy, setBusy] = useState('');
  const route = REPAIR_ROUTE_CATEGORIES.includes(cat);
  const { data: last } = useQuery({ queryKey: ['repairRoute', siteId, cat], enabled: route, queryFn: () => lastRepairRoute(siteId, cat) });
  const name = site?.name || '';
  const run = async (k: string, fn: () => Promise<string>) => { setBusy(k); const msg = await fn().catch(() => 'Could not export — check your connection and try again.'); setBusy(''); toast(msg); void qc.invalidateQueries({ queryKey: ['repairRoute', siteId, cat] }); };
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
      {route && last && <Button kind="ghost" title={busy === 'v' ? 'Opening…' : '👁️ View last route'} onPress={() => run('v', () => viewLastRepairRoute(name, cat, last))} />}
      {route && <Button kind="ghost" title={busy === 'r' ? 'Working out the route…' : last ? '🔄 Update route' : '🗺️ Export route order'} onPress={() => run('r', () => exportRepairRoute(siteId, name, cat))} />}
      {cat === 'approved' && <Button kind="ghost" title={busy === 'a' ? 'Making…' : '📋 Export by oldest approved'} onPress={() => run('a', () => exportRepairsByApproved(name, jobs))} />}
      {route && last ? <Muted style={{ alignSelf: 'center' }}>Last route: {new Date(last.generated_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</Muted> : null}
    </View>
  );
}
