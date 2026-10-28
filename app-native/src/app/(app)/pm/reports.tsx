// Reports & surveys across all projects (185 renderAllReports): Start a report for
// a project or as a general survey (no project), search, In progress / Completed /
// All, filter by template or surveyor, open any report.
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { chooseAction, promptText, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted } from '@/components/ui';
import { nameOf, usePeople } from '@/data/hs';
import { usePmReports } from '@/data/pmHome';
import { startGeneralReport, startReport, useTemplates } from '@/data/reports';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { siteStatusKey } from '@/lib/rules/checkin';
import { isManager } from '@/lib/roles';
import { base, radius, space } from '@/theme/theme';

export default function AllReports() {
  const { me } = useAuth();
  const toast = useToast();
  const { data: rows = [], isLoading, refetch } = usePmReports();
  const { data: sites } = useSites();
  const { data: tpls } = useTemplates(me?.org_id);
  const { data: people } = usePeople();
  const [tab, setTab] = useState<'open' | 'done' | 'all'>('open');
  const [q, setQ] = useState('');
  const [tpl, setTpl] = useState('');
  const [by, setBy] = useState('');
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  const where = (r: (typeof rows)[number]) => (r.site_id ? (sites ?? []).find((s) => s.id === r.site_id)?.name || 'Project' : r.general_label || 'General survey');
  const filtered = rows.filter((r) => (!tpl || r.template_name === tpl) && (!by || r.submitted_by === by));
  const count = { open: filtered.filter((r) => r.status === 'in_progress').length, done: filtered.filter((r) => r.status !== 'in_progress').length, all: filtered.length };
  const shown = filtered.filter((r) => tab === 'all' || (tab === 'open') === (r.status === 'in_progress'))
    .filter((r) => !q.trim() || [r.template_name, where(r), nameOf(people, r.submitted_by), r.general_label].join(' ').toLowerCase().includes(q.trim().toLowerCase()));
  const startable = (tpls ?? []).filter((t) => !t.is_daily_briefing && !t.is_mc_inspection && !t.is_loler_inspection);
  const open = (r: (typeof rows)[number]) => {
    const mode = r.status === 'in_progress' ? 'fill' : 'view';
    router.push((r.site_id ? `/sites/${r.site_id}/snagging/reports/${mode}/${r.id}` : `/pm/survey/${r.id}?mode=${mode}`) as never);
  };
  const start = async () => {
    const live = (sites ?? []).filter((s) => siteStatusKey(s) !== 'closed').sort((a, b) => a.name.localeCompare(b.name));
    const where2 = await chooseAction('Which project is it for?', [{ key: 'general', label: 'General survey — not linked to a project' }, ...live.map((s) => ({ key: s.id, label: s.name }))]);
    if (!where2) return;
    if (!startable.length) { toast('No report templates yet — an admin can add one from the Admin Centre.'); return; }
    const tid = await chooseAction('Pick a template', startable.map((t) => ({ key: t.id, label: t.name })));
    const t = startable.find((x) => x.id === tid);
    if (!t) return;
    setBusy(true);
    let sid: string | null;
    if (where2 === 'general') {
      const label = await promptText('Job name / address for this survey (so you can find it later):', '');
      if (label === null) { setBusy(false); return; }
      sid = await startGeneralReport(me, t, label.trim() || null);
    } else {
      const site = (sites ?? []).find((s) => s.id === where2);
      sid = site ? await startReport(me, site, t) : null;
    }
    setBusy(false);
    if (!sid) { toast('Could not start — check your signal and try again.'); return; }
    toast('Inspection started'); void refetch();
    router.push((where2 === 'general' ? `/pm/survey/${sid}?mode=fill` : `/sites/${where2}/snagging/reports/fill/${sid}`) as never);
  };
  const chip = (k: 'open' | 'done' | 'all', l: string) => (
    <Pressable key={k} onPress={() => setTab(k)} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: tab === k ? base.ink : base.line, backgroundColor: tab === k ? base.ink : base.card }}>
      <Text style={{ fontWeight: '700', color: tab === k ? '#fff' : base.ink }}>{l} ({count[k]})</Text>
    </Pressable>
  );
  const tplNames = [...new Set(rows.map((r) => r.template_name).filter(Boolean) as string[])].sort();
  const surveyors = [...new Set(rows.map((r) => r.submitted_by).filter(Boolean) as string[])];

  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Reports & surveys' }} />
      <Button busy={busy} title="+ Start a report" onPress={() => void start()} />
      <TextInput value={q} onChangeText={setQ} placeholder="Search reports, projects, people" style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card, marginVertical: 10 }} />
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {chip('open', 'In progress')}{chip('done', 'Completed')}{chip('all', 'All')}
        <Pressable onPress={async () => { const k = await chooseAction('Template', [{ key: '', label: 'All templates' }, ...tplNames.map((n) => ({ key: n, label: n }))]); if (k !== null) setTpl(k); }} style={{ paddingHorizontal: 12, paddingVertical: 7 }}><Text style={{ color: base.blue }}>{tpl || 'Template ▾'}</Text></Pressable>
        <Pressable onPress={async () => { const k = await chooseAction('Surveyor', [{ key: '', label: 'Everyone' }, ...surveyors.map((u) => ({ key: u, label: nameOf(people, u) }))]); if (k !== null) setBy(k); }} style={{ paddingHorizontal: 12, paddingVertical: 7 }}><Text style={{ color: base.blue }}>{by ? nameOf(people, by) : 'Surveyor ▾'}</Text></Pressable>
      </View>
      {isLoading ? <Muted>Loading…</Muted> : shown.length ? shown.map((r) => (
        <Pressable key={r.id} onPress={() => open(r)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 8, backgroundColor: base.card }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', color: base.ink }}>{r.template_name || 'Report'}</Text>
            <Muted>{where(r)} · {nameOf(people, r.submitted_by)}{r.status === 'in_progress' || !r.submitted_at ? '' : ` · ${new Date(r.submitted_at).toLocaleDateString('en-GB')}`}</Muted>
          </View>
          <Text style={{ fontWeight: '700', color: r.status === 'in_progress' ? base.warn : base.ok }}>{r.status === 'in_progress' ? 'In progress' : 'Completed'}</Text>
        </Pressable>
      )) : <Empty>No reports here{tpl || by ? ' for these filters' : ''}.</Empty>}
      <Card style={{ marginTop: space.m }}>
        <Muted>Exporting or emailing several reports as PDFs, and the completed-TBTs page, are still in the current app for now.</Muted>
      </Card>
    </ScrollView>
  );
}
