// Reports & surveys across all projects (185 renderAllReports): Start a report for
// a project or as a general survey (no project), search, In progress / Completed /
// All, filter by template or surveyor, open any report; tick completed ones to
// export or email them as one PDF. Completed TBTs (all projects) is linked below.
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { chooseAction, promptText, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted } from '@/components/ui';
import { HowTo } from '@/components/HowTo';
import { nameOf, usePeople } from '@/data/hs';
import { usePmReports } from '@/data/pmHome';
import { startGeneralReport, startReport, useTemplates } from '@/data/reports';
import { useSites } from '@/data/sites';
import { OphIcon } from '@/components/OphIcon';
import { useAuth } from '@/lib/auth';
import { heading } from '@/lib/fonts';
import { deliverPdf, emailPdf, PDFDocument } from '@/lib/pdf';
import { buildReportPdf, type PdfSub } from '@/lib/reportPdf';
import { supabase } from '@/lib/supabase';
import { siteStatusKey } from '@/lib/rules/checkin';
import { isManager } from '@/lib/roles';
import { base, page, radius, space, useTheme } from '@/theme/theme';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AllReports() {
  const { me } = useAuth();
  const toast = useToast();
  const t = useTheme();
  const [gen, setGen] = useState(false);
  const { data: rows = [], isLoading, refetch } = usePmReports();
  const { data: sites } = useSites();
  const { data: tpls } = useTemplates(me?.org_id);
  const { data: people } = usePeople();
  const [tab, setTab] = useState<'open' | 'done' | 'all'>('open');
  const [q, setQ] = useState('');
  const [tpl, setTpl] = useState('');
  const [by, setBy] = useState('');
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [xBusy, setXBusy] = useState('');
  if (!me) return null;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  const where = (r: (typeof rows)[number]) => (r.site_id ? (sites ?? []).find((s) => s.id === r.site_id)?.name || 'Project' : r.general_label || 'General survey');
  // General surveys (the card at the bottom): only those not linked to a project.
  const filtered = rows.filter((r) => (!tpl || r.template_name === tpl) && (!by || r.submitted_by === by) && (!gen || !r.site_id));
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
    <Pressable key={k} onPress={() => setTab(k)} style={{ height: 30, paddingHorizontal: 10, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: tab === k ? base.ink : base.line, backgroundColor: tab === k ? base.ink : '#fff' }}>
      <Text style={{ fontSize: 11.5, fontWeight: '700', color: tab === k ? '#fff' : base.ink }}>{l} ({count[k]})</Text>
    </Pressable>
  );
  const merged = async () => {
    const ids = rows.filter((r) => sel.has(r.id)).map((r) => r.id);
    if (!ids.length) { toast('Tick at least one report.'); return null; }
    const full = ((await supabase.from('report_submissions').select('*').in('id', ids)).data ?? []) as unknown as PdfSub[];
    const out = await PDFDocument.create(); let n = 0;
    for (const id of ids) { const r = full.find((x) => x.id === id); if (!r) continue; const site = r.site_id ? (sites ?? []).find((x) => x.id === r.site_id) ?? null : null; const b = await buildReportPdf(r, site, null, (u) => nameOf(people, u)).catch(() => null); if (!b) continue; const d = await PDFDocument.load(b.bytes); (await out.copyPages(d, d.getPageIndices())).forEach((p) => out.addPage(p)); n++; }
    if (!n) { toast('Could not build the PDF.'); return null; }
    return { bytes: await out.save(), filename: `Reports (${n}) - ${new Date().toLocaleDateString('en-GB').replace(/\//g, '-')}.pdf`, n };
  };
  const tplNames = [...new Set(rows.map((r) => r.template_name).filter(Boolean) as string[])].sort();
  const surveyors = [...new Set(rows.map((r) => r.submitted_by).filter(Boolean) as string[])];

  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Reports & surveys' }} />
      <HowTo k="reports" />
      {gen && <Stack.Screen options={{ title: 'General surveys' }} />}
      <Pressable onPress={() => void start()} disabled={busy} accessibilityRole="button"
        style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: t.brand1, borderRadius: 14, paddingVertical: 13 }, (pressed || busy) && { opacity: 0.8 }]}>
        <OphIcon name="plus" size={16} color={t.brand1Text} stroke={2.4} />
        <Text style={[heading(700), { fontSize: 14, color: t.brand1Text }]}>{busy ? 'Starting…' : 'Start a report'}</Text>
      </Pressable>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: base.line, borderRadius: 14, paddingHorizontal: 14, height: 46, marginVertical: 12 }}>
        <OphIcon name="search" size={18} color={base.slate} />
        <TextInput value={q} onChangeText={setQ} placeholder="Search reports, projects, people" placeholderTextColor={base.slateLight} style={{ flex: 1, fontSize: 14, color: base.ink, height: 44 }} />
      </View>
      <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center', marginBottom: 12 }}>
        {chip('open', 'In progress')}{chip('done', 'Completed')}{chip('all', 'All')}
        <View style={{ flex: 1 }} />
        <Pressable onPress={async () => {
          const k = await chooseAction('Filter', [
            { key: 'tpl', label: `Template: ${tpl || 'All templates'}` }, { key: 'by', label: `Surveyor: ${by ? nameOf(people, by) : 'Everyone'}` },
            ...(tpl || by || gen ? [{ key: 'clear', label: 'Clear filters' }] : []),
          ]);
          if (k === 'tpl') { const v = await chooseAction('Template', [{ key: '', label: 'All templates' }, ...tplNames.map((n) => ({ key: n, label: n }))]); if (v !== null) setTpl(v); }
          else if (k === 'by') { const v = await chooseAction('Surveyor', [{ key: '', label: 'Everyone' }, ...surveyors.map((u) => ({ key: u, label: nameOf(people, u) }))]); if (v !== null) setBy(v); }
          else if (k === 'clear') { setTpl(''); setBy(''); setGen(false); }
        }} style={{ height: 30, paddingHorizontal: 10, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: tpl || by ? base.ink : base.line, backgroundColor: '#fff' }}>
          <Text style={{ fontSize: 11.5, fontWeight: '700', color: base.ink }}>{tpl || by ? `Filter (${(tpl ? 1 : 0) + (by ? 1 : 0)})` : 'Filter'} ▾</Text>
        </Pressable>
      </View>
      {shown.length > 0 && <Pressable style={{ marginBottom: 6 }} onPress={() => setSel(sel.size === shown.length ? new Set() : new Set(shown.map((r) => r.id)))}><Text style={{ color: base.blue, fontWeight: '700' }}>{sel.size === shown.length ? 'Clear all' : 'Select all'}</Text></Pressable>}
      {sel.size > 0 && (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ flex: 1, fontWeight: '700', color: base.ink }}>{sel.size} selected</Text>
          <Button kind="ghost" busy={xBusy === 'pdf'} title="Export PDF" onPress={async () => { setXBusy('pdf'); toast('Building PDF…'); const m = await merged().catch(() => null); setXBusy(''); if (m && !(await deliverPdf(m.bytes, m.filename))) toast('Could not save the PDF.'); }} />
          <Button busy={xBusy === 'email'} title="Email" onPress={async () => {
            const to = (await promptText(`Email the ${sel.size} ticked report${sel.size === 1 ? '' : 's'} (one PDF) to:`, ''))?.trim(); if (!to) return;
            if (!EMAIL.test(to)) { toast('Enter a valid email address.'); return; }
            setXBusy('email'); const m = await merged().catch(() => null);
            const err = m ? await emailPdf(m.bytes, m.filename, `report-exports/${me.org_id}`, { general_label: 'Reports', recipient_email: to, cc_email: to !== me.email ? me.email || undefined : undefined, doc_title: `Reports (${m.n})` }) : 'Nothing to send.';
            setXBusy(''); toast(err || `${m?.n} report${m?.n === 1 ? '' : 's'} emailed to ${to}`); if (!err) setSel(new Set());
          }} />
          <Pressable onPress={() => setSel(new Set())}><Text style={{ color: base.slate }}>✕</Text></Pressable>
        </Card>
      )}
      {isLoading ? <Muted>Loading…</Muted> : shown.length ? shown.map((r) => (
        <Pressable key={r.id} onPress={() => open(r)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, borderColor: sel.has(r.id) ? base.blue : base.cardLine, borderRadius: radius.row, marginBottom: 8, backgroundColor: base.card }}>
          {<Pressable hitSlop={8} onPress={() => setSel((x) => { const n = new Set(x); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })}><Text style={{ fontSize: 20 }}>{sel.has(r.id) ? '☑' : '☐'}</Text></Pressable>}
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', color: base.ink }}>{r.template_name || 'Report'}</Text>
            <Muted>{where(r)} · {nameOf(people, r.submitted_by)}{r.status === 'in_progress' || !r.submitted_at ? '' : ` · ${new Date(r.submitted_at).toLocaleDateString('en-GB')}`}</Muted>
          </View>
          <Text style={{ fontWeight: '700', color: r.status === 'in_progress' ? base.warn : base.ok }}>{r.status === 'in_progress' ? 'In progress' : 'Completed'}</Text>
        </Pressable>
      )) : <Empty>No reports here{tpl || by ? ' for these filters' : ''}.</Empty>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
        {([[gen ? 'All reports' : 'General surveys', gen ? 'Every project' : 'Not linked to a project', () => setGen(!gen)], ['Completed TBTs', 'Signed toolbox talks, all projects', () => router.push('/pm/tbts' as never)]] as [string, string, () => void][]).map(([title, sub, go]) => (
          <Pressable key={title} onPress={go} style={{ minWidth: 220, flexBasis: 220, maxWidth: 420, flexGrow: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#ECEEF2', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 }}>
            <Text style={[heading(700), { fontSize: 13.5, color: base.ink }]}>{title}</Text>
            <Text style={{ fontSize: 11.5, color: base.slate, marginTop: 2 }}>{sub}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}
