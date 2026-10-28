// Schedule of Works. Ported from renderSchedule (480): the "you're checked in at"
// address filter, overall progress, the three tabs, documents, the ungrouped list,
// sections with done counts, and the Site condition close-out.
// Manager tools (add/edit/move/delete, library, upload, visibility, export, email)
// arrive with the PM screens in phase 2.
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { SowTaskRow } from '@/components/SowTaskRow';
import { useToast } from '@/components/toast';
import { Button, Card, Empty, Muted, SectionTitle } from '@/components/ui';
import {
  addLeftoverPhoto, closeOutSiteCondition, documentLink, markViewedOnce, saveFlag, useSchedule, type Flag, type Task,
} from '@/data/sow';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { pickPhotos } from '@/lib/photos';
import { fullSiteAddress } from '@/lib/rules/checkin';
import {
  doneCount, filterTasks, overallPct, sectionVisible, siteConditionSaved, SOW_FILTER_LABEL, SOW_FILTERS, tasksForAddress, type SowFilter,
} from '@/lib/rules/sow';
import { isManager } from '@/lib/roles';
import { onQueueChange, onUploadsSent, pendingUploads, type UploadJob } from '@/lib/uploadQueue';
import { base, radius, space } from '@/theme/theme';

export default function Schedule() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const { data: site } = useSite(id);
  const { data, isLoading, refetch, isRefetching } = useSchedule(site);
  const [filter, setFilter] = useState<SowFilter>('active');
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<UploadJob[]>([]);
  const [pctPrompt, setPctPrompt] = useState<string | null>(null);

  useEffect(() => {
    pendingUploads().then(setPending);
    const a = onQueueChange((jobs) => setPending(jobs.filter((j): j is UploadJob => j.kind === 'upload')));
    const b = onUploadsSent((n) => { toast(`✓ ${n} photo${n === 1 ? '' : 's'} uploaded`); void refetch(); });
    return () => { a(); b(); };
  }, [refetch, toast]);
  useEffect(() => { if (me && site) void markViewedOnce(me); }, [me, site]);
  useFocusEffect(useCallback(() => { void refetch(); }, [refetch]));

  const manager = isManager(me);
  const view = useMemo(() => {
    if (!data) return null;
    const here = data.hereSubId ? data.addresses.find((a) => a.id === data.hereSubId) ?? null : null;
    const allTasks = tasksForAddress(data.tasks, here?.id ?? null, showAll);
    const tasks = filterTasks(allTasks, filter);
    const bySectionAll: Record<string, Task[]> = {};
    const bySection: Record<string, Task[]> = {};
    allTasks.forEach((t) => { if (t.section_id) (bySectionAll[t.section_id] ||= []).push(t); });
    tasks.forEach((t) => { if (t.section_id) (bySection[t.section_id] ||= []).push(t); });
    const photosByTask: Record<string, typeof data.photos> = {};
    data.photos.forEach((p) => { (photosByTask[p.task_id] ||= []).push(p); });
    const flags: Record<string, Flag> = {};
    data.flags.forEach((f) => { flags[f.section_id || '__ungrouped__'] = f; });
    return {
      here, allTasks, tasks, bySectionAll, bySection, photosByTask, flags,
      allUngrouped: allTasks.filter((t) => !t.section_id),
      ungrouped: tasks.filter((t) => !t.section_id),
      sections: data.sections.filter((sec) => sectionVisible(filter, (bySection[sec.id] || []).length, (bySectionAll[sec.id] || []).length, manager)),
      docs: data.docs.filter((d) => manager || d.visibility !== 'managers'),
      addrById: Object.fromEntries(data.addresses.map((a) => [a.id, a])),
    };
  }, [data, filter, showAll, manager]);

  if (!site || !me) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const changed = () => { void refetch(); };
  const row = (t: Task) => (
    <SowTaskRow key={t.id} me={me} site={site} task={t} photos={view?.photosByTask[t.id] ?? []}
      pending={pending.filter((j) => j.waitKey === t.id)} address={t.sub_site_id ? view?.addrById[t.sub_site_id] : null}
      onChanged={changed} percentPrompt={pctPrompt === t.id} setPercentPrompt={(on) => setPctPrompt(on ? t.id : null)} />
  );
  const isOpen = (k: string, dflt = true) => open[k] ?? dflt;
  const toggle = (k: string, dflt = true) => setOpen({ ...open, [k]: !isOpen(k, dflt) });

  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 820, width: '100%', alignSelf: 'center' }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={changed} />}>
      <Stack.Screen options={{ title: 'Schedule of Works' }} />
      <Muted style={{ marginBottom: space.m }}>{[site.name, fullSiteAddress(site)].filter(Boolean).join(' · ')}</Muted>
      {isLoading && !data && <Muted>Loading…</Muted>}
      {view && (
        <>
          {view.here && (
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 }}>
              <Text style={{ flex: 1, fontSize: 13, color: base.ink }}>
                📍 {showAll ? 'Showing all addresses' : `You're checked in at ${view.here.name} — showing its tasks only`}
              </Text>
              <Pressable onPress={() => setShowAll(!showAll)}><Text style={{ color: base.blue, fontWeight: '700' }}>{showAll ? `Just ${view.here.name}` : 'Show all addresses'}</Text></Pressable>
            </Card>
          )}
          {view.allTasks.length > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: base.ink }}>Overall progress</Text>
              <View style={{ flex: 1, height: 8, borderRadius: 5, backgroundColor: base.line, overflow: 'hidden' }}>
                <View style={{ width: `${overallPct(view.allTasks)}%`, height: '100%', backgroundColor: '#2E9E5B' }} />
              </View>
              <Text style={{ fontWeight: '800', color: base.ink }}>{overallPct(view.allTasks)}%</Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
            {SOW_FILTERS.map((k) => (
              <Pressable key={k} onPress={() => setFilter(k)} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: filter === k ? base.ink : base.line, backgroundColor: filter === k ? base.ink : base.card }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: filter === k ? '#fff' : base.ink }}>{SOW_FILTER_LABEL[k]}</Text>
              </Pressable>
            ))}
          </View>

          {view.docs.length > 0 && (
            <Card>
              <SectionTitle>Schedule of Works Document</SectionTitle>
              {view.docs.map((d) => (
                <Pressable key={d.id} onPress={async () => { const u = await documentLink(d); if (u) void Linking.openURL(u); else toast('Could not open the document.'); }} style={{ paddingVertical: 6 }}>
                  <Text style={{ color: base.blue, fontWeight: '600', textDecorationLine: 'underline' }} numberOfLines={1}>📎 {d.name}</Text>
                </Pressable>
              ))}
            </Card>
          )}

          {(manager ? true : filter === 'all' ? view.allUngrouped.length > 0 : view.ungrouped.length > 0) && (
            <Group title="Schedule of Works" count={view.allUngrouped.length ? doneCount(view.allUngrouped) : ''}
              open={isOpen('__ungrouped__', view.ungrouped.length > 0)} onToggle={() => toggle('__ungrouped__', view.ungrouped.length > 0)}>
              {view.ungrouped.length ? view.ungrouped.map(row) : <Empty>No tasks here.</Empty>}
            </Group>
          )}
          {view.sections.map((sec) => (
            <Group key={sec.id} title={`${sec.visibility_mode === 'assigned' ? '🔒 ' : ''}${sec.name}`}
              count={(view.bySectionAll[sec.id] || []).length ? doneCount(view.bySectionAll[sec.id]) : ''}
              open={isOpen(sec.id)} onToggle={() => toggle(sec.id)}>
              {(view.bySection[sec.id] || []).length ? view.bySection[sec.id].map(row) : <Empty>No tasks on this tab.</Empty>}
            </Group>
          ))}
          {!view.allTasks.length && <Empty>No Schedule of Works tasks yet.</Empty>}

          {view.allTasks.length > 0 && (
            <SiteCondition flag={view.flags.__ungrouped__} tasks={view.allTasks} filter={filter}
              onSave={async () => { if (await closeOutSiteCondition(me, site.id)) { toast('Site condition saved'); changed(); } else toast('Could not save — try again.'); }}
              onReopen={async () => { if (await closeOutSiteCondition(me, site.id, true)) { setFilter('active'); changed(); } }}
              onAnswer={async (field, value) => {
                if (!(await saveFlag(me, site, null, 'the ungrouped tasks', field, value))) { toast('Could not save — try again.'); return; }
                toast('Saved');
                if (field === 'leftover_material' && value) {
                  const p = await pickPhotos('camera', false);
                  if (!('error' in p) && p[0]) { if (await addLeftoverPhoto(site, null, p[0])) toast('Photo added'); else toast('Could not upload photo — try again.'); }
                }
                changed();
              }} />
          )}
          <Muted style={{ marginTop: space.m }}>Export PDF and Email Report are coming with the PM screens.</Muted>
        </>
      )}
    </ScrollView>
  );
}

function Group({ title, count, open, onToggle, children }: { title: string; count: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <View style={{ backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.card, marginBottom: space.m, overflow: 'hidden' }}>
      <Pressable onPress={onToggle} style={{ flexDirection: 'row', alignItems: 'center', padding: 14 }}>
        <Text style={{ color: base.slate, marginRight: 8 }}>{open ? '▼' : '▶'}</Text>
        <Text style={{ flex: 1, fontWeight: '800', color: base.ink }} numberOfLines={1}>{title}</Text>
        {!!count && <Text style={{ fontSize: 12, color: base.slate, fontWeight: '700' }}>{count}</Text>}
      </Pressable>
      {open && <View style={{ paddingHorizontal: 12, paddingBottom: 4 }}>{children}</View>}
    </View>
  );
}

function SiteCondition({ flag, tasks, filter, onSave, onReopen, onAnswer }: {
  flag: Flag | undefined; tasks: Task[]; filter: SowFilter;
  onSave: () => void; onReopen: () => void; onAnswer: (field: 'waste_to_clear' | 'leftover_material', v: boolean) => void;
}) {
  if (siteConditionSaved(flag, tasks)) {
    if (filter === 'active') return null;
    const yn = (v: boolean | undefined) => (v ? 'Yes' : 'No');
    return (
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '800', color: base.ink }}>Site condition ✓ closed out</Text>
          <Muted>🗑 Waste to clear: {yn(flag?.waste_to_clear)} · 📦 Leftover material: {yn(flag?.leftover_material)}</Muted>
        </View>
        <Pressable onPress={onReopen}><Text style={{ color: base.blue, fontWeight: '700' }}>Change</Text></Pressable>
      </Card>
    );
  }
  const q = (label: string, on: boolean, field: 'waste_to_clear' | 'leftover_material') => (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 6 }}>
      <Text style={{ flex: 1, color: base.ink, fontWeight: '600' }}>{label}</Text>
      {(['No', 'Yes'] as const).map((lbl) => {
        const val = lbl === 'Yes', active = on === val;
        return (
          <Pressable key={lbl} onPress={() => { if (!active) onAnswer(field, val); }}
            style={{ marginLeft: 6, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: active ? (val ? base.warn : base.ink) : base.line, backgroundColor: active ? (val ? base.warnBg : base.paper) : base.card }}>
            <Text style={{ fontWeight: '700', color: active ? (val ? base.warn : base.ink) : base.slate }}>{lbl}</Text>
          </Pressable>
        );
      })}
    </View>
  );
  return (
    <Card>
      <SectionTitle>Site condition</SectionTitle>
      {q('🗑 Is there waste to clear?', !!flag?.waste_to_clear, 'waste_to_clear')}
      {q('📦 Any leftover material?', !!flag?.leftover_material, 'leftover_material')}
      {flag?.leftover_material && flag.leftover_photo_path && <Muted>📷 Leftover photo added</Muted>}
      <Button title="Save — close out" onPress={onSave} />
    </Card>
  );
}
