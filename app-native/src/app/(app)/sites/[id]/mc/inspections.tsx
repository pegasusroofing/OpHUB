// Main Contractor Inspections (530): reports from templates flagged as MC
// inspections, on the report engine. Managers start and open them; others see
// the list. Templates can be managed from here (or the Admin Centre); managers
// also see each subcontractor's own inspection files, one drop-down per company.
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { viewDoc } from '@/components/DocViewer';
import { confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted, SectionTitle, Toggle } from '@/components/ui';
import { nameOf, openDocLink, usePeople } from '@/data/hs';
import { useMcInspections, useSubInspectionsByCompany } from '@/data/mc';
import { quickTemplate, startReport, type Template } from '@/data/reports';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { REPORT_STATUS_LABEL } from '@/lib/rules/reports';
import { isFullManager, isManager } from '@/lib/roles';
import { base, page, radius, space } from '@/theme/theme';

export default function McInspections() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: site } = useSite(id);
  const { data, isLoading } = useMcInspections(id, me?.org_id);
  const { data: people } = usePeople();
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [manage, setManage] = useState(false);
  const [subOpen, setSubOpen] = useState<Record<string, boolean>>({});
  const { data: subCos } = useSubInspectionsByCompany(id, !!me && isManager(me));
  if (!me || !site) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const mgr = isManager(me);
  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: 'Inspections' }} />
      {mgr && <View style={{ marginBottom: 8 }}><Button kind="ghost" title={manage ? 'Close templates' : 'Manage Templates'} onPress={() => setManage(!manage)} /></View>}
      {mgr && manage && (
        <Card>
          <Muted style={{ marginBottom: 8 }}>Main Contractor Inspection templates — separate from the general Report Templates. Editing a template never changes inspections already started from it.</Muted>
          {data?.templates.length ? data.templates.map((t) => (
            <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: base.line }}>
              <View style={{ flex: 1 }}><Text style={{ fontWeight: '700', color: base.ink }}>{t.name}</Text>{!!t.description && <Muted>{t.description}</Muted>}</View>
              <Button small kind="ghost" title="Edit" onPress={() => router.push(`/pm/admin/templates/${t.id}` as never)} />
              <Button small kind="ghost" title="Delete" onPress={async () => {
                if (!(await confirmAsk(`Delete template "${t.name}"? Inspections already done from it are kept.`, 'Delete'))) return;
                if ((await supabase.from('report_templates').delete().eq('id', t.id)).error) toast('Could not delete — try again.');
                void qc.invalidateQueries({ queryKey: ['mcInspections', id] });
              }} />
            </View>
          )) : <Empty>No Main Contractor Inspection templates yet.</Empty>}
          <Button small title="+ New Template" onPress={async () => { const tid = await quickTemplate(me, 'mc'); if (tid) router.push(`/pm/admin/templates/${tid}` as never); else toast('Could not create it — try again.'); }} />
        </Card>
      )}
      {mgr && <Button title={picker ? 'Cancel' : '+ New Inspection'} onPress={() => setPicker(!picker)} />}
      {mgr && picker && (
        <Card>
          <Muted style={{ marginBottom: 8 }}>Pick a template to start a new inspection:</Muted>
          {data?.templates.length ? data.templates.map((t) => (
            <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: base.line }}>
              <View style={{ flex: 1 }}><Text style={{ fontWeight: '700', color: base.ink }}>{t.name}</Text>{!!t.description && <Muted>{t.description}</Muted>}</View>
              <Button busy={busy} title="Start" onPress={async () => {
                setBusy(true); const sid = await startReport(me, site, t as unknown as Template); setBusy(false);
                if (!sid) { toast('Could not start — try again.'); return; }
                toast('Inspection started'); setPicker(false); void qc.invalidateQueries({ queryKey: ['mcInspections', id] });
                router.push(`/sites/${id}/snagging/reports/fill/${sid}` as never);
              }} />
            </View>
          )) : <View><Empty>No inspection templates yet.</Empty>{isFullManager(me) && <Button small title="+ Create an inspection template" onPress={async () => { const tid = await quickTemplate(me, 'mc'); if (tid) router.push(`/pm/admin/templates/${tid}` as never); }} />}</View>}
        </Card>
      )}
      {!mgr && !!data?.subs.length && <Muted style={{ marginBottom: 8 }}>Ask a project manager if you need to see a full inspection report.</Muted>}
      {isLoading ? <Muted>Loading…</Muted> : data?.subs.length ? data.subs.map((s) => (
        <Pressable key={s.id} disabled={!mgr} onPress={() => router.push(`/sites/${id}/snagging/reports/${s.status === 'in_progress' ? 'fill' : 'view'}/${s.id}` as never)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginTop: 8, backgroundColor: base.card }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', color: base.ink }}>{s.template_name}</Text>
            <Muted>{s.status === 'in_progress' ? 'Started' : `Submitted ${s.submitted_at ? new Date(s.submitted_at).toLocaleString('en-GB') : ''}`} · {nameOf(people, s.submitted_by)}</Muted>
          </View>
          <Text style={{ fontWeight: '700', color: s.status === 'in_progress' ? base.warn : base.ok }}>{REPORT_STATUS_LABEL[s.status] || s.status}</Text>
        </Pressable>
      )) : <Empty>No inspections logged yet{data?.templates.length ? '.' : ' — set up a template first.'}</Empty>}
      {mgr && !!subCos?.length && (
        <View style={{ marginTop: space.l }}>
          <SectionTitle>Subcontractor Inspections</SectionTitle>
          {subCos.map((c) => (
            <View key={c.id} style={{ marginBottom: 8 }}>
              <Toggle title={`${c.name} (${c.files.length} file${c.files.length === 1 ? '' : 's'})`} open={!!subOpen[c.id]} onPress={() => setSubOpen({ ...subOpen, [c.id]: !subOpen[c.id] })} />
              {subOpen[c.id] && c.files.map((f) => (
                <Pressable key={f.id} onPress={async () => { const u = await openDocLink('mc-documents', f.storage_path); if (u) viewDoc(u, f.file_name); else toast('Could not open the file.'); }}
                  style={{ padding: 10, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginTop: 6, backgroundColor: base.card }}>
                  <Text style={{ fontWeight: '700', color: base.ink }}>{f.file_name}</Text>
                  <Muted>{f.folder_id && c.folderName[f.folder_id] ? `📁 ${c.folderName[f.folder_id]} · ` : ''}{nameOf(people, f.uploaded_by)} · {new Date(f.uploaded_at).toLocaleDateString('en-GB')}</Muted>
                </Pressable>
              ))}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
