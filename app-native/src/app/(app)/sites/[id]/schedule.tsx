// Schedule of Works. Ported from renderSchedule (480): the "you're checked in at"
// address filter, overall progress, the three tabs, documents, the ungrouped list,
// sections with done counts, and the Site condition close-out.
// Managers also get: + Add task per group (with address on multi-site jobs), a ⋮ menu
// per section (duplicate, rename, delete, who can see it), More (add section, from the
// library, variation work, import tasks from Excel / CSV / PDF, add the office copy of
// the schedule), documents (managers-only, remove), tagging tasks to a subcontractor
// on main-contractor jobs, Select Multiple → delete, and export / email.
import { useQuery } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';

import { FinForm } from '@/components/FinForm';
import { SowTaskRow } from '@/components/SowTaskRow';
import { chooseAction, confirmAsk, promptText, useToast } from '@/components/toast';
import { SowExport } from '@/components/SowExport';
import { Button, Card, Empty, FilterRow, Muted, SectionTitle } from '@/components/ui';
import { heading } from '@/lib/fonts';
import {
  addLeftoverPhoto, closeOutSiteCondition, documentLink, markViewedOnce, saveFlag, useSchedule, type Flag, type Task,
} from '@/data/sow';
import { useSite } from '@/data/sites';
import {
  addSection, addTask, addVariationWork, copyLibraryTemplate, deleteSection, libraryPreview, deleteSowDoc, deleteTasks, duplicateSection, importTasks, libraryTemplates, markSowViewed, renameSection,
  setSowDocVisibility, uploadSowDocs,
} from '@/data/sowManager';
import { useAuth } from '@/lib/auth';
import { pickPhotos } from '@/lib/photos';
import {
  doneCount, filterTasks, overallPct, sectionVisible, siteConditionSaved, SOW_FILTER_LABEL, SOW_FILTERS, tasksForAddress, type SowFilter,
} from '@/lib/rules/sow';
import { pdfLines } from '@/lib/pdfjs';
import { isManager } from '@/lib/roles';
import { columnTasks, pdfTaskLines, sheetColumns } from '@/lib/rules/sowImport';
import { csvRows, readXlsx } from '@/lib/rules/xlsxRead';
import { supabase } from '@/lib/supabase';
import { VisibilityEditor } from '@/components/VisibilityEditor';
import { HowTo } from '@/components/HowTo';
import { viewDoc } from '@/components/DocViewer';
import { openDocLink } from '@/data/hs';
import { onQueueChange, onUploadsSent, pendingJobs, type PatchJob, type UploadJob } from '@/lib/uploadQueue';
import { base, page, radius, space, useTheme } from '@/theme/theme';

export default function Schedule() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const { data: site } = useSite(id);
  const { data, isLoading, refetch, isRefetching } = useSchedule(site);
  const [filter, setFilter] = useState<SowFilter>('active');
  const [showAll, setShowAll] = useState(false);
  const [vis, setVis] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<UploadJob[]>([]);
  // Status changes still waiting for their photos to upload (481 sowPendingForRender) — shown straight away.
  const [waiting, setWaiting] = useState<PatchJob[]>([]);
  const [pctPrompt, setPctPrompt] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<Set<string> | null>(null);
  const [adding, setAdding] = useState<string | null>(null); // group key with the add-task box open
  const [pdfText, setPdfText] = useState<string | null>(null); // tasks read from a PDF, to check before adding
  // Main-contractor jobs: the job's subcontractors, for tagging tasks (460).
  const { data: subCos = [] } = useQuery({ queryKey: ['sowSubCos', site?.id], enabled: !!site?.acting_as_main_contractor, queryFn: async () => (((await supabase.from('subcontractor_companies' as never).select('id,name').eq('site_id', site?.id as string)).data as { id: string; name: string }[] | null) ?? []) });

  useEffect(() => {
    const split = (jobs: Awaited<ReturnType<typeof pendingJobs>>) => {
      setPending(jobs.filter((j): j is UploadJob => j.kind === 'upload'));
      setWaiting(jobs.filter((j): j is PatchJob => j.kind === 'patch' && j.table === 'schedule_tasks'));
    };
    void pendingJobs().then(split);
    const a = onQueueChange(split);
    const b = onUploadsSent((n) => { toast(`✓ ${n} photo${n === 1 ? '' : 's'} uploaded`); void refetch(); });
    return () => { a(); b(); };
  }, [refetch, toast]);
  useEffect(() => { if (me && site) { void markViewedOnce(me); if (isManager(me)) void markSowViewed(me, site.id); } }, [me, site]);
  // Coming back to the page refreshes it (the first visit already loads it).
  const seen = useRef(false);
  useFocusEffect(useCallback(() => { if (seen.current) void refetch(); seen.current = true; }, [refetch]));

  const manager = isManager(me);
  const view = useMemo(() => {
    if (!data) return null;
    const here = data.hereSubId ? data.addresses.find((a) => a.id === data.hereSubId) ?? null : null;
    const patched = waiting.length ? data.tasks.map((t) => { const w = waiting.filter((j) => j.rowId === t.id); return w.length ? ({ ...t, ...Object.assign({}, ...w.map((j) => j.patch)) } as Task) : t; }) : data.tasks;
    const allTasks = tasksForAddress(patched, here?.id ?? null, showAll);
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
  }, [data, filter, showAll, manager, waiting]);

  if (!site || !me) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const changed = () => { void refetch(); };
  const row = (t: Task) => (
    <SowTaskRow key={t.id} me={me} site={site} task={t} subCos={subCos} photos={view?.photosByTask[t.id] ?? []}
      pending={pending.filter((j) => j.waitKey === t.id)} address={t.sub_site_id ? view?.addrById[t.sub_site_id] : null}
      onChanged={changed} percentPrompt={pctPrompt === t.id} setPercentPrompt={(on) => setPctPrompt(on ? t.id : null)}
      addresses={data?.addresses ?? []} selectMode={!!selecting} selected={!!selecting?.has(t.id)}
      onToggleSelect={() => { const n = new Set(selecting ?? []); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); setSelecting(n); }}
      onSelectMode={() => setSelecting(new Set([t.id]))} />
  );
  // No adding tasks on the Complete tab.
  const canAdd = manager && filter !== 'done';
  const addBox = (key: string, sectionId: string | null) => canAdd && (adding === key
    ? <AddTaskBox addresses={site.multi_site ? data?.addresses ?? [] : []} onCancel={() => setAdding(null)}
        onAdd={async (name, subId) => { if (await addTask(site.id, name, sectionId, subId)) { changed(); return true; } toast('Could not save — try again.'); return false; }} />
    : <Button kind="ghost" title="➕ Add task" onPress={() => setAdding(key)} />);
  const sectionMenu = async (sec: { id: string; name: string }) => {
    const k = await chooseAction(sec.name, [{ key: 'dup', label: '⧉ Duplicate section' }, { key: 'ren', label: '✎ Rename' }, { key: 'vis', label: '🔒 Who can see this' }, { key: 'del', label: '🗑 Delete', danger: true }]);
    if (k === 'vis') { setVis(sec.id); setOpen((o) => ({ ...o, [sec.id]: true })); }
    else if (k === 'ren') {
      const n = await promptText('Section name', sec.name);
      if (n === null) return;
      if (!n.trim()) { toast("Section name can't be empty."); return; }
      if (await renameSection(sec.id, n.trim())) { toast('Section renamed'); changed(); }
    } else if (k === 'del') {
      if (!(await confirmAsk('Delete this section? Its tasks move back to the ungrouped list — they are not deleted.', 'Delete'))) return;
      if (await deleteSection(me, site.id, sec.id, sec.name)) { toast('Section deleted'); changed(); }
    } else if (k === 'dup') {
      const n = await promptText('Name the new section', `${sec.name} (Copy)`);
      if (n === null) return;
      if (!n.trim()) { toast("Section name can't be empty."); return; }
      const c = await duplicateSection(me, site.id, sec.id, n.trim());
      if (c === null) toast('Could not create the new section — try again.');
      else { toast(`"${n.trim()}" created with ${c} task${c === 1 ? '' : 's'} — fresh, nothing carried over`); changed(); }
    }
  };
  const more = async () => {
    const k = await chooseAction('Schedule of Works', [{ key: 'sec', label: '📁 Add Section' }, { key: 'lib', label: '📚 From Library' }, { key: 'var', label: '📐 Add Variation Work' },
      { key: 'xls', label: '📊 Import tasks from Excel / CSV' }, { key: 'pdf', label: '📄 Import tasks from a PDF' }, { key: 'doc', label: '📎 Add the Schedule of Works document' }]);
    if (k === 'xls') {
      const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true }); if (r.canceled || !r.assets[0]) return;
      const a = r.assets[0];
      if (/\.xls$/i.test(a.name || '')) { toast('Save it as .xlsx or .csv first — old .xls files can’t be read.'); return; }
      try {
        const bytes = new Uint8Array(await (await fetch(a.uri)).arrayBuffer());
        const c = sheetColumns(/\.csv$/i.test(a.name || '') ? csvRows(new TextDecoder().decode(bytes)) : (await readXlsx(bytes))[0]?.rows ?? []);
        if (!c.data.length) { toast('No data rows found below the header row.'); return; }
        const col = await chooseAction('Which column has the task wording?', c.headers.map((h, i) => ({ key: String(i), label: `${i === c.guess ? '★ ' : ''}${h}${c.data[0]?.[i] != null && String(c.data[0][i]).trim() ? ` — e.g. "${String(c.data[0][i]).slice(0, 40)}"` : ''}` })));
        if (col == null) return;
        const names = columnTasks(c.data, Number(col));
        if (!names.length) { toast('That column is empty for every row.'); return; }
        if (!(await confirmAsk(`Add ${names.length} task${names.length === 1 ? '' : 's'} to the Schedule of Works?`, 'Import'))) return;
        toast((await importTasks(site.id, names)) ? `${names.length} task(s) imported` : 'Could not import — try again.'); changed();
      } catch { toast('Could not read that file — check it’s a valid .xlsx or .csv.'); }
      return;
    }
    if (k === 'pdf') {
      const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true }); if (r.canceled || !r.assets[0]) return;
      toast('Reading PDF…');
      const lines = await pdfLines(new Uint8Array(await (await fetch(r.assets[0].uri)).arrayBuffer()));
      if (lines === null) { setPdfText(''); toast('No readable text found (or not on this device) — type or paste the list yourself.'); return; }
      setPdfText(pdfTaskLines(lines).join('\n')); return;
    }
    if (k === 'doc') {
      const r = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: true, copyToCacheDirectory: true }); if (r.canceled || !r.assets.length) return;
      const n = await uploadSowDocs(me, site.id, r.assets.map((a) => ({ uri: a.uri, name: a.name || 'document', mimeType: a.mimeType, size: a.size })));
      toast(n ? (n === 1 ? 'Document added' : `${n} documents added`) : 'Could not upload — check your signal and try again.'); changed(); return;
    }
    if (k === 'lib') {
      const tpls = await libraryTemplates(me.org_id as string);
      if (!tpls.length) { toast('No library templates yet — build one in Admin Centre › Schedule of Works Library.'); return; }
      const id = await chooseAction('Copy from the library', tpls.map((t) => ({ key: t.id, label: t.name })));
      if (!id) return;
      const preview = await libraryPreview(id);
      if (!(await confirmAsk(`${tpls.find((t) => t.id === id)?.name ?? 'Template'}\n\n${preview}\n\nCopy this into the Schedule of Works for this site? Nothing in the library itself changes, and every copied line can be edited or deleted afterwards.`, 'Copy'))) return;
      const r = await copyLibraryTemplate(me, site.id, id);
      toast(`Copied ${r.secs} section${r.secs === 1 ? '' : 's'} and ${r.tasks} task${r.tasks === 1 ? '' : 's'} into the schedule`); changed(); return;
    }
    if (k === 'sec') {
      const n = await promptText('Add a section', '', { placeholder: 'Section name, e.g. Roof Level 1', ok: 'Add section' });
      if (n?.trim()) { if (await addSection(me, site.id, n.trim())) { toast('Section added'); changed(); } }
    } else if (k === 'var') {
      const n = await promptText('What is the variation work? (e.g. Additional lead flashing to bay window)', '');
      if (n === null) return;
      if (!n.trim()) { toast('Enter what the variation work is.'); return; }
      const name = await addVariationWork(me, site.id, n.trim());
      toast(name ? `Added as "${name}"` : 'Could not add — try again.'); changed();
    }
  };
  const isOpen = (k: string, dflt = true) => open[k] ?? dflt;
  const toggle = (k: string, dflt = true) => setOpen({ ...open, [k]: !isOpen(k, dflt) });

  return (
    <ScrollView contentContainerStyle={page(820)}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={changed} />}>
      <Stack.Screen options={{ title: 'Schedule of Works' }} />
      <HowTo k="schedule" />
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#ECEEF2', borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: base.ink }}>Overall progress</Text>
              <View style={{ flex: 1, height: 10, borderRadius: 6, backgroundColor: base.line, overflow: 'hidden' }}>
                <View style={{ width: `${overallPct(view.allTasks)}%`, height: '100%', backgroundColor: '#2E9E5B' }} />
              </View>
              <Text style={{ fontWeight: '800', color: base.ink }}>{overallPct(view.allTasks)}%</Text>
            </View>
          )}
          <FilterRow seg options={SOW_FILTERS.map((k) => [k, SOW_FILTER_LABEL[k]] as [SowFilter, string])} value={filter} onChange={setFilter} />

          {manager && (
            selecting ? (
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ flex: 1, fontWeight: '700', color: base.ink }}>{selecting.size} selected</Text>
                <Button title="🗑 Delete Selected" disabled={!selecting.size} onPress={async () => {
                  const n = selecting.size;
                  if (!(await confirmAsk(`Delete ${n} task${n === 1 ? '' : 's'}? This also removes their progress photos. This can't be undone.`, 'Delete'))) return;
                  const gone = await deleteTasks(me, site.id, [...selecting]);
                  toast(!gone ? 'Nothing was deleted — you may not have permission to remove these tasks.' : gone === n ? `${gone} task${gone === 1 ? '' : 's'} deleted` : `Only ${gone} of ${n} tasks could be deleted — you may not have permission for the rest.`);
                  setSelecting(null); changed();
                }} />
                <Button kind="ghost" title="Cancel" onPress={() => setSelecting(null)} />
              </Card>
            ) : null
          )}
          {view.docs.length > 0 && (
            <Card>
              <SectionTitle>Schedule of Works Document</SectionTitle>
              {view.docs.map((d) => (
                <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Pressable onPress={async () => { const u = await documentLink(d); if (u) viewDoc(u); else toast('Could not open the document.'); }} style={{ paddingVertical: 6, flex: 1 }}>
                    <Text style={{ color: base.blue, fontWeight: '600', textDecorationLine: 'underline' }} numberOfLines={1}>📎 {d.name}{d.visibility === 'managers' ? '  🔒' : ''}</Text>
                  </Pressable>
                  {manager && <Pressable hitSlop={8} onPress={async () => {
                    const k = await chooseAction(d.name, [{ key: 'vis', label: d.visibility === 'managers' ? '👥 Show to everyone on this site' : '🔒 Managers only' }, { key: 'del', label: '🗑 Remove', danger: true }]);
                    if (k === 'vis') { const mo = d.visibility !== 'managers'; if (await setSowDocVisibility(d.id, mo)) { toast(mo ? 'Now visible to managers only' : 'Now visible to everyone on this site'); changed(); } }
                    else if (k === 'del' && (await confirmAsk(`Remove "${d.name}" from this Schedule of Works?`, 'Remove')) && (await deleteSowDoc(me, site.id, d))) { toast('Document removed'); changed(); }
                  }}><Text style={{ fontSize: 18, color: base.slate }}>⋮</Text></Pressable>}
                </View>
              ))}
            </Card>
          )}

          {(manager ? true : filter === 'all' ? view.allUngrouped.length > 0 : view.ungrouped.length > 0) && (
            <Group title="Schedule of Works" count={view.allUngrouped.length ? doneCount(view.allUngrouped) : ''}
              open={isOpen('__ungrouped__', view.ungrouped.length > 0)} onToggle={() => toggle('__ungrouped__', view.ungrouped.length > 0)}
              onAdd={canAdd ? () => { setAdding(adding === '__ungrouped__' ? null : '__ungrouped__'); setOpen((o) => ({ ...o, __ungrouped__: true })); } : undefined}
              onMore={manager ? more : undefined}>
              {adding === '__ungrouped__' && addBox('__ungrouped__', null)}
              {view.ungrouped.length ? view.ungrouped.map(row) : <Empty>{`No tasks${filter !== 'all' ? ' for this filter' : ''}.`}</Empty>}
            </Group>
          )}
          {view.sections.map((sec) => (
            <Group key={sec.id} title={`${sec.visibility_mode === 'assigned' ? '🔒 ' : ''}${sec.name}`}
              count={(view.bySectionAll[sec.id] || []).length ? doneCount(view.bySectionAll[sec.id]) : ''}
              open={isOpen(sec.id)} onToggle={() => toggle(sec.id)} onMenu={manager ? () => sectionMenu(sec) : undefined}>
              {vis === sec.id && me.org_id && <VisibilityEditor table="schedule_sections" id={sec.id} siteId={site.id} orgId={me.org_id} onClose={(saved) => { setVis(null); if (saved) changed(); }} />}
              {(view.bySection[sec.id] || []).length ? view.bySection[sec.id].map(row) : <Empty>{`No tasks in this section${filter !== 'all' ? ' for this filter' : ''}.`}</Empty>}
              {addBox(sec.id, sec.id)}
            </Group>
          ))}
          {!view.allTasks.length && !manager && <Empty>No tasks yet.</Empty>}

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
          {!!view?.allTasks.length && <View style={{ marginTop: space.m }}><SowExport site={site} tab={filter} /></View>}
        </>
      )}
      {pdfText !== null && (
        <FinForm title="Tasks from the PDF" note="One task per line. Remove anything that isn't a task, then add them." saveLabel="Add these tasks"
          fields={[{ k: 't', label: 'Tasks', kind: 'multiline' }]} initial={{ t: pdfText }} onClose={() => setPdfText(null)}
          onSave={async (v) => {
            const names = String(v.t || '').split('\n').map((x) => x.trim()).filter(Boolean);
            if (!names.length) return 'Nothing to import.';
            if (!(await importTasks(site.id, names))) return 'Could not add them — try again.';
            toast(`${names.length} task${names.length === 1 ? '' : 's'} added`); changed();
          }} />
      )}
    </ScrollView>
  );
}

function AddTaskBox({ addresses, onAdd, onCancel }: { addresses: { id: string; name: string }[]; onAdd: (name: string, subId: string | null) => Promise<boolean>; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [sub, setSub] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const add = async () => { if (!name.trim() || busy) return; setBusy(true); try { if (await onAdd(name.trim(), sub)) setName(''); } finally { setBusy(false); } };
  return (
    <View style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <TextInput value={name} onChangeText={setName} placeholder="New task, e.g. Fit lead flashing" autoFocus onSubmitEditing={() => void add()} placeholderTextColor={base.slateLight}
          style={{ flex: 1, borderWidth: 1, borderColor: base.line, borderRadius: radius.input, paddingHorizontal: 12, paddingVertical: 9, fontSize: 15, color: base.ink, backgroundColor: base.card }} />
        <Pressable accessibilityRole="button" onPress={() => void add()} disabled={busy || !name.trim()} style={{ minWidth: 74, alignItems: 'center', paddingHorizontal: 18, paddingVertical: 9, borderRadius: radius.input, backgroundColor: base.blue, opacity: busy || !name.trim() ? 0.5 : 1 }}>
          <Text style={{ color: '#fff', fontWeight: '800' }}>Add</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onCancel} hitSlop={8} style={{ paddingHorizontal: 6 }}>
          <Text style={{ fontSize: 16, color: base.slate, fontWeight: '700' }}>✕</Text>
        </Pressable>
      </View>
      {addresses.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
          {[{ id: '', name: 'Not on the list' }, ...addresses].map((a) => (
            <Pressable key={a.id} onPress={() => setSub(a.id || null)} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, borderWidth: 1, borderColor: (sub || '') === a.id ? base.ink : base.line, backgroundColor: (sub || '') === a.id ? base.ink : base.card }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: (sub || '') === a.id ? '#fff' : base.ink }}>{a.name}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function Group({ title, count, open, onToggle, onMenu, onAdd, onMore, children }: { title: string; count: string; open: boolean; onToggle: () => void; onMenu?: () => void; onAdd?: () => void; onMore?: () => void; children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ backgroundColor: base.card, borderWidth: 1, borderColor: '#ECEEF2', borderRadius: 18, marginBottom: space.m, overflow: 'hidden' }}>
      <Pressable onPress={onToggle} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14 }}>
        <Text style={{ fontSize: 10, color: base.slate, marginRight: 8 }}>{open ? '▼' : '▶'}</Text>
        <Text style={[heading(800), { flex: 1, fontSize: 15, color: base.ink }]} numberOfLines={1}>{title}</Text>
        {!!count && <Text style={{ fontSize: 11, fontWeight: '700', color: base.slate, backgroundColor: '#F1F2F4', borderRadius: 999, paddingVertical: 3, paddingHorizontal: 9, marginLeft: 6, overflow: 'hidden' }}>{count}</Text>}
        {onAdd && (
          <Pressable onPress={onAdd} hitSlop={6} style={{ marginLeft: 8, borderWidth: 1.5, borderColor: t.brand1, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 10 }}>
            <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 0.4, color: t.brand1 }}>+ ADD TASK</Text>
          </Pressable>
        )}
        {onMore && <Pressable onPress={onMore} hitSlop={8} accessibilityLabel="More" style={{ marginLeft: 6, width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: base.line, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 10, color: base.slate }}>▾</Text></Pressable>}
        {onMenu && <Pressable onPress={onMenu} hitSlop={8} style={{ marginLeft: 10 }}><Text style={{ fontSize: 18, color: base.slate }}>⋮</Text></Pressable>}
      </Pressable>
      {open && <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>{children}</View>}
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
      {flag?.leftover_material && flag.leftover_photo_path && <Pressable onPress={async () => { const u = await openDocLink('site-photos', flag.leftover_photo_path as string); if (u) viewDoc(u); }}><Muted style={{ color: base.blue, fontWeight: '700' }}>📷 Leftover photo added — tap to view</Muted></Pressable>}
      <Button title="Save — close out" onPress={onSave} />
    </Card>
  );
}
