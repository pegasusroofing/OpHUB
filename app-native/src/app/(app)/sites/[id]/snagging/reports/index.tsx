// A job's Reports (430 renderSiteReports): inspections list (daily briefings live
// under H&S), "+ New Report" from a template, filter by template, tick to delete.
// Managers only. Templates are built in the Admin Centre. Tick several to export
// them as one PDF (430 exportSelectedReports).
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { chooseAction, confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted } from '@/components/ui';
import { nameOf, usePeople } from '@/data/hs';
import { deleteReports, startReport, useSiteReports, useTemplates } from '@/data/reports';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { deliverPdf, exportFilename, PDFDocument } from '@/lib/pdf';
import { buildReportPdf, type PdfSub } from '@/lib/reportPdf';
import { supabase } from '@/lib/supabase';
import { REPORT_STATUS_LABEL } from '@/lib/rules/reports';
import { isManager } from '@/lib/roles';
import { base, radius, space } from '@/theme/theme';

export default function Reports() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: site } = useSite(id);
  const { data: subs, isLoading, refetch, isRefetching } = useSiteReports(id, me?.org_id);
  const { data: tpls } = useTemplates(me?.org_id);
  const { data: people } = usePeople();
  const [picker, setPicker] = useState(false);
  const [filter, setFilter] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  if (!me || !site) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  const startable = (tpls ?? []).filter((t) => !t.is_daily_briefing && !t.is_mc_inspection && !t.is_loler_inspection);
  const names = [...new Set((subs ?? []).map((s) => s.template_name))].sort();
  const list = (subs ?? []).filter((s) => !filter || s.template_name === filter);

  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { void refetch(); }} />}>
      <Stack.Screen options={{ title: 'Reports' }} />
      <Button title={picker ? 'Cancel' : '+ New Report'} onPress={() => setPicker(!picker)} />
      {picker && (
        <Card>
          <Muted style={{ marginBottom: 8 }}>Pick a template to start a new inspection:</Muted>
          {startable.length ? startable.map((t) => (
            <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: base.line }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: base.ink }}>{t.name}</Text>
                {!!t.description && <Muted>{t.description}</Muted>}
              </View>
              <Button busy={busy} title="Start" onPress={async () => {
                setBusy(true); const sid = await startReport(me, site, t); setBusy(false);
                if (!sid) { toast('Could not start — check your signal and try again.'); return; }
                toast('Inspection started'); setPicker(false); void qc.invalidateQueries({ queryKey: ['reports', id] });
                router.push(`/sites/${id}/snagging/reports/fill/${sid}` as never);
              }} />
            </View>
          )) : <Empty>No report templates yet — an admin can add one from the Admin Centre.</Empty>}
        </Card>
      )}
      {(names.length > 1 || !!filter) && (
        <Pressable onPress={async () => { const k = await chooseAction('Filter by template', [{ key: '', label: 'All templates' }, ...names.map((n) => ({ key: n, label: n }))]); if (k !== null) setFilter(k); }} style={{ marginVertical: 8 }}>
          <Text style={{ fontWeight: '700', color: base.ink }}>▼ {filter || 'All templates'}</Text>
        </Pressable>
      )}
      {sel.size > 0 && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><Button kind="ghost" busy={busy} title={`Delete ${sel.size} Selected`} onPress={async () => {
            if (!(await confirmAsk(`Delete ${sel.size} report${sel.size > 1 ? 's' : ''}? This cannot be undone.`, 'Delete'))) return;
            setBusy(true); const n = await deleteReports(me, id, [...sel]); setBusy(false);
            toast(n ? `${n} report${n > 1 ? 's' : ''} deleted` : 'Delete failed'); setSel(new Set()); void refetch();
          }} /></View>
          <View style={{ flex: 1 }}><Button kind="ghost" busy={busy} title={`PDF of ${sel.size}`} onPress={async () => {
            setBusy(true);
            try {
              const ids = list.filter((x) => sel.has(x.id) && x.status !== 'in_progress').map((x) => x.id);
              if (!ids.length) { toast('Only submitted reports can be exported.'); return; }
              const rows = ((await supabase.from('report_submissions').select('*').in('id', ids)).data ?? []) as unknown as PdfSub[];
              const out = await PDFDocument.create(); let fails = 0;
              for (const id2 of ids) { const r = rows.find((x) => x.id === id2); if (!r) continue; toast(`Building ${r.template_name}…`); const b = await buildReportPdf(r, site, org, (u) => nameOf(people, u)).catch(() => null); if (!b) { fails++; continue; } const d = await PDFDocument.load(b.bytes); (await out.copyPages(d, d.getPageIndices())).forEach((p) => out.addPage(p)); }
              if (!out.getPageCount()) { toast('Could not build the PDF.'); return; }
              if (!(await deliverPdf(await out.save(), exportFilename(site.name, `Reports (${ids.length})`, 'pdf')))) toast('Could not save the PDF.'); else { if (fails) toast(`${fails} report${fails > 1 ? 's' : ''} could not be included.`); setSel(new Set()); }
            } finally { setBusy(false); }
          }} /></View>
          <View style={{ flex: 1 }}><Button kind="ghost" title="Clear" onPress={() => setSel(new Set())} /></View>
        </View>
      )}
      {isLoading ? <Muted>Loading…</Muted> : list.length ? list.map((s) => (
        <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginTop: 8, backgroundColor: base.card }}>
          <Pressable hitSlop={8} onPress={() => { const n = new Set(sel); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); setSel(n); }}><Text style={{ fontSize: 18 }}>{sel.has(s.id) ? '☑' : '☐'}</Text></Pressable>
          <Pressable style={{ flex: 1 }} onPress={() => router.push(`/sites/${id}/snagging/reports/${s.status === 'in_progress' ? 'fill' : 'view'}/${s.id}` as never)}>
            <Text style={{ fontWeight: '700', color: base.ink }}>{s.template_name}</Text>
            <Muted>{s.status === 'in_progress' ? 'Started' : `Submitted ${s.submitted_at ? new Date(s.submitted_at).toLocaleString('en-GB') : ''}`} · {nameOf(people, s.submitted_by)}</Muted>
          </Pressable>
          <Text style={{ fontSize: 11.5, fontWeight: '700', color: s.status === 'in_progress' ? base.warn : base.ok }}>{REPORT_STATUS_LABEL[s.status] || s.status}</Text>
        </View>
      )) : <Empty>No inspections started yet{filter ? ' for this template.' : '.'}</Empty>}
      <Muted style={{ marginTop: space.m }}>Tick reports to export them as one PDF. Open a report to export or email it on its own.</Muted>
    </ScrollView>
  );
}
