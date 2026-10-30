// One Schedule of Works task: name, photos (sent and still waiting), Add pre-start photos / Add photos,
// the three status buttons, the "complete needs a photo" card and the progress slider.
// After completion photos are picked it asks "Mark this task as complete?" (Yes / No).
// Ported from taskRowHtml (480). Managers also get a ⋮ menu (edit, link address, move,
// delete, select multiple) and can complete by ticking photos already on the task.
// A task outside any section can be limited to chosen people (Who can see this);
// tasks in a section follow the section. On main-contractor jobs a task can be tagged
// to one of the job's subcontractors (shown as a label to everyone).
import { useState } from 'react';
import { Image, Linking, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { StorageImage, useStorageUrl } from '@/components/StorageImage';
import { chooseAction, confirmAsk, promptText, showAlert, useToast } from '@/components/toast';
import { Slider } from '@/components/Slider';
import { Button } from '@/components/ui';
import { VisibilityEditor } from '@/components/VisibilityEditor';
import {
  addPhotos, cancelUpload, completeWithPhotos, deletePhoto, moveToProgressAfterPhotos, setPercent, setStatus,
  type Photo, type Task,
} from '@/data/sow';
import { deleteTasks, moveScheduleTask, pmComplete, renameTask, setTaskAddress, setTaskSubcontractor } from '@/data/sowManager';
import { pickPhotos } from '@/lib/photos';
import { photoStage, snapPct } from '@/lib/rules/sow';
import { isManager } from '@/lib/roles';
import type { Profile, Site, SubAddress } from '@/lib/types';
import type { UploadJob } from '@/lib/uploadQueue';
import { base } from '@/theme/theme';


export function SowTaskRow({ updateOnly, me, site, task, subCos = [], photos, pending, address, addresses = [], onChanged, percentPrompt, setPercentPrompt, selectMode, selected, onToggleSelect, onSelectMode }: {
  updateOnly?: boolean; me: Profile; site: Site; task: Task; subCos?: { id: string; name: string }[]; photos: Photo[]; pending: UploadJob[]; address?: SubAddress | null; addresses?: SubAddress[];
  onChanged: () => void; percentPrompt: boolean; setPercentPrompt: (on: boolean) => void;
  selectMode?: boolean; selected?: boolean; onToggleSelect?: () => void; onSelectMode?: () => void;
}) {
  const toast = useToast();
  const [completing, setCompleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [vis, setVis] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const status = (task.status || 'todo') as 'todo' | 'progress' | 'done';
  const done = status === 'done';
  const mgr = isManager(me);
  const subCo = task.subcontractor_company_id ? subCos.find((x) => x.id === task.subcontractor_company_id) ?? null : null;
  const [pick, setPick] = useState<Set<string> | null>(null);
  const picked = pick ?? new Set(photos.filter((p) => p.stage === 'done').map((p) => p.id));

  const menu = async () => {
    const items = [
      { key: 'edit', label: '✎ Edit' },
      ...(site.multi_site ? [{ key: 'addr', label: '📍 Link Address' }] : []),
      { key: 'up', label: '▲ Move up' }, { key: 'down', label: '▼ Move down' },
      ...(!task.section_id ? [{ key: 'vis', label: '🔒 Who can see this' }] : []),
      ...(subCos.length ? [{ key: 'sub', label: '🏗 Assign to subcontractor' }] : []),
      { key: 'del', label: '🗑 Delete', danger: true }, { key: 'multi', label: '☑ Select Multiple' },
    ];
    const k = await chooseAction(task.name, items);
    if (k === 'vis') setVis(true);
    else if (k === 'sub') {
      const c = await chooseAction('Assign to subcontractor', [{ key: '-', label: `${subCo ? '' : '✓ '}Our own team / no subcontractor` }, ...subCos.map((x) => ({ key: x.id, label: `${subCo?.id === x.id ? '✓ ' : ''}${x.name}` }))]);
      if (!c) return;
      if (await setTaskSubcontractor(task.id, c === '-' ? null : c)) { toast(c === '-' ? 'Unassigned from subcontractor' : 'Assigned to subcontractor'); onChanged(); }
    }
    else if (k === 'edit') {
      const n = await promptText('Task name', task.name);
      if (n === null) return;
      if (!n.trim()) { toast("Task name can't be empty."); return; }
      if (await renameTask(task.id, n.trim())) { toast('Task updated'); onChanged(); }
    } else if (k === 'addr') {
      const a = await chooseAction('Link this task to an address', [{ key: '', label: 'Not on the list' }, ...addresses.map((x) => ({ key: x.id, label: x.name }))]);
      if (a === null) return;
      if (await setTaskAddress(task.id, a || null)) { toast(a ? 'Address linked' : 'Address unlinked'); onChanged(); }
    } else if (k === 'up' || k === 'down') {
      const err = await moveScheduleTask(site.id, task.id, k === 'up' ? -1 : 1);
      if (err) toast(err);
      onChanged();
    } else if (k === 'del') {
      if (!(await confirmAsk("Delete this task? This also removes its progress photos. This can't be undone.", 'Delete'))) return;
      if (await deleteTasks(me, site.id, [task.id], task.name)) { toast('Task deleted'); onChanged(); }
    } else if (k === 'multi') onSelectMode?.();
  };
  const completeNow = async () => {
    const ids = [...picked];
    if (!ids.length && !(await confirmAsk('Mark this task complete without any completed photos?', 'Complete'))) return;
    setBusy(true);
    const ok = await pmComplete(site.id, me, task.id, ids);
    setBusy(false);
    if (!ok) { toast('Could not mark complete — check your connection and try again.'); return; }
    setCompleting(false); setPick(null);
    toast(`Task marked complete${ids.length ? ` — ${ids.length} photo${ids.length === 1 ? '' : 's'} moved to Completed` : ''}`);
    onChanged();
  };

  if (selectMode) {
    return (
      <Pressable onPress={onToggleSelect} style={[s.task, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
        <View style={[s.accent, { backgroundColor: { todo: '#C9CDD4', progress: base.warn, done: base.ok }[status] }]} />
        <View style={{ width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: base.slateLight, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? base.ink : base.card }}>
          {selected && <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>✓</Text>}
        </View>
        <Text style={[s.name, done && s.nameDone, { flex: 1 }]}>{task.name}{done ? '  ✓' : ''}</Text>
      </Pressable>
    );
  }

  const take = async (source: 'camera' | 'library', mode: 'add' | 'complete') => {
    const picked = await pickPhotos(source);
    if ('error' in picked) { showAlert(picked.error); return; }
    if (!picked.length) return;
    setBusy(true);
    try {
      if (mode === 'complete') {
        setCompleting(false);
        if (await confirmAsk('Mark this task as complete?')) await completeWithPhotos(me, site, task, picked);
        else {
          await addPhotos(me, site, task, picked, 'progress');
          if (status === 'todo') await moveToProgressAfterPhotos(task);
        }
      } else {
        // To Commence: pre-start photos. In progress / complete: progress photos.
        await addPhotos(me, site, task, picked, photoStage(task.status));
        // 480: a progress photo asks for the new % complete (skippable).
        if (task.status === 'progress') setPercentPrompt(true);
      }
    } catch {
      toast('One photo could not be read — please try that one again.');
    } finally {
      setBusy(false);
      onChanged();
    }
  };

  const changeStatus = async (next: 'todo' | 'progress') => {
    setCompleting(false); setPercentPrompt(false);
    if (await setStatus(task, next)) onChanged(); else toast('Could not save — check your signal and try again.');
  };

  const pickPct = async (v: number) => {
    const pct = snapPct(v);
    setPercentPrompt(false);
    if (pct >= 100) { setCompleting(true); return; }
    if (await setPercent(task, pct)) onChanged(); else toast('Could not save the progress — check your signal and try again.');
  };

  const removePhoto = async (p: Photo) => {
    if (!await confirmAsk("Delete this photo? This can't be undone.", 'Delete')) return;
    if (await deletePhoto(p)) { toast('Photo deleted'); onChanged(); }
  };
  const removePending = async (j: UploadJob) => {
    if (!await confirmAsk("Remove this photo? It hasn't finished uploading.", 'Remove')) return;
    const r = await cancelUpload(j.id);
    toast(r.revertedComplete ? "Photo removed — the task wasn't marked complete, add a photo to finish it" : 'Photo removed');
    onChanged();
  };

  const pct = task.percent_complete || 0;
  // On the laptop it goes straight to choosing files; on a phone: camera or the photo library.
  const addPhotosNow = async (mode: 'add' | 'complete') => {
    if (Platform.OS === 'web') { void take('library', mode); return; }
    const k = await chooseAction(mode === 'complete' ? 'Completed photos' : status === 'todo' ? 'Pre-start photos' : 'Add photos', [{ key: 'camera', label: '📸 Take a photo' }, { key: 'library', label: '🖼 Choose from your photos' }]);
    if (k === 'camera' || k === 'library') void take(k, mode);
  };

  return (
    <View style={s.task}>
      <View style={[s.accent, { backgroundColor: { todo: '#C9CDD4', progress: base.warn, done: base.ok }[status] }]} />
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={[s.name, done && s.nameDone]}>
            {!task.section_id && task.visibility_mode === 'assigned' ? '🔒 ' : ''}{task.name}{done ? '  ✓' : ''}
          </Text>
          {!!subCo && <Text style={{ alignSelf: 'flex-start', fontSize: 10.5, fontWeight: '700', color: base.ink, backgroundColor: '#E7E9EE', borderWidth: 1, borderColor: base.line, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 1, marginTop: 3, overflow: 'hidden' }}>{subCo.name.toUpperCase()}</Text>}
          {done && task.completed_at && (
            <Text style={s.meta}>Completed {new Date(task.completed_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</Text>
          )}
        </View>
        {site.multi_site && (
          <Text style={[s.addrPill, !task.sub_site_id && { color: base.warn, backgroundColor: base.warnBg }]}>{address?.name || 'No address'}</Text>
        )}
        {mgr && !updateOnly && <Pressable onPress={menu} hitSlop={8} style={{ paddingHorizontal: 6 }}><Text style={{ fontSize: 18, color: base.slate }}>⋮</Text></Pressable>}
      </View>

      {(photos.length > 0 || pending.length > 0) && (
        <View style={s.photos}>
          {photos.map((p) => (
            <Pressable key={p.id} onPress={() => setViewing(p.storage_path)}>
              <StorageImage bucket="site-photos" path={p.thumb_path || p.mid_path || p.storage_path} style={s.thumb} />
              {!done && (isManager(me) || p.uploaded_by === me.id) && (
                <Pressable onPress={() => removePhoto(p)} style={s.del} hitSlop={8}><Text style={s.delX}>×</Text></Pressable>
              )}
            </Pressable>
          ))}
          {pending.map((j) => (
            <View key={j.id}>
              <Image source={{ uri: j.files[j.files.length - 1].localUri }} style={[s.thumb, { opacity: 0.55 }]} />
              <Text style={s.waiting}>{j.tries ? 'waiting' : '…'}</Text>
              <Pressable onPress={() => removePending(j)} style={s.del} hitSlop={8}><Text style={s.delX}>×</Text></Pressable>
            </View>
          ))}
        </View>
      )}

      {completing ? (
        <View style={s.completeCard}>
          <Text style={{ color: '#7A1F1F', marginBottom: 4 }}>Upload at least one completed photo to mark this task complete.</Text>
          <View style={{ marginTop: 6 }}><Button kind="ghost" busy={busy} title="📷 Add completed photos" onPress={() => void addPhotosNow('complete')} /></View>
          {mgr && (
            <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderStyle: 'dashed', borderTopColor: '#E8B4B4' }}>
              <Text style={{ color: '#7A1F1F', fontWeight: '700', marginBottom: 6 }}>PM: or tick photos already uploaded to use as Completed photos</Text>
              {photos.length ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {photos.map((p) => {
                    const on = picked.has(p.id);
                    return (
                      <Pressable key={p.id} onPress={() => { const n = new Set(picked); if (on) n.delete(p.id); else n.add(p.id); setPick(n); }}
                        style={{ borderWidth: 2, borderColor: on ? base.ok : 'transparent', borderRadius: 10 }}>
                        <StorageImage bucket="site-photos" path={p.thumb_path || p.mid_path || p.storage_path} style={{ width: 56, height: 56, borderRadius: 8 }} />
                        {on && <Text style={{ position: 'absolute', top: 2, right: 4, color: base.ok, fontWeight: '800' }}>✓</Text>}
                      </Pressable>
                    );
                  })}
                </View>
              ) : <Text style={{ color: base.slate, marginBottom: 8 }}>No photos on this task yet.</Text>}
              <Button busy={busy} title={picked.size ? `✓ Mark complete with ${picked.size} photo${picked.size === 1 ? '' : 's'}` : '✓ Mark complete (no photos)'} onPress={completeNow} />
            </View>
          )}
          <Pressable onPress={() => setCompleting(false)} style={{ marginTop: 8 }}><Text style={{ color: base.slate, textAlign: 'center' }}>‹ Back to In Progress</Text></Pressable>
        </View>
      ) : (
        <>
          <Pressable onPress={() => void addPhotosNow('add')} disabled={busy} style={s.addPhoto}>
            <Text style={{ fontWeight: '700', color: base.ink }}>{busy ? 'Preparing photos…' : status === 'todo' ? '📷 Add pre-start photos' : '📷 Add photos'}</Text>
          </Pressable>
        </>
      )}

      <View style={s.statusRow}>
        {([['todo', 'To Commence'], ['progress', 'In Progress'], ['done', 'Complete']] as const).map(([k, label]) => {
          const active = k === 'done' ? (done || completing) : status === k && !completing;
          return (
            <Pressable key={k} style={[s.statusBtn, active && (k === 'todo' ? s.statusTodo : { backgroundColor: k === 'done' ? base.ok : base.warn })]}
              onPress={() => (k === 'done' ? (setPercentPrompt(false), setCompleting(true)) : changeStatus(k))}>
              <Text style={[s.statusTxt, active && { color: k === 'todo' ? base.ink : '#fff' }]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      {status === 'progress' && !completing && (
        <View style={[s.pct, percentPrompt && { borderColor: base.warn, backgroundColor: base.warnBg }]}>
          {percentPrompt && <Text style={{ fontWeight: '700', color: base.warn, marginBottom: 6 }}>Photo added — how far along is this task now?</Text>}
          <Slider value={pct} onDone={(v) => void pickPct(v)} />
          {percentPrompt && <Pressable onPress={() => setPercentPrompt(false)} style={{ marginTop: 6 }}><Text style={{ color: base.slate, fontWeight: '700' }}>Skip — leave at {pct}%</Text></Pressable>}
        </View>
      )}

      {vis && me.org_id && <VisibilityEditor table="schedule_tasks" id={task.id} siteId={site.id} orgId={me.org_id} onClose={(saved) => { setVis(false); if (saved) onChanged(); }} />}
      <PhotoViewer path={viewing} onClose={() => setViewing(null)} />
    </View>
  );
}

function PhotoViewer({ path, onClose }: { path: string | null; onClose: () => void }) {
  const url = useStorageUrl('site-photos', path);
  return (
    <Modal visible={!!path} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.viewer} onPress={onClose}>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} style={{ position: 'absolute', top: 40, right: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,.15)', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 20, fontWeight: '800' }}>✕</Text></Pressable>
        {url ? <Image source={{ uri: url }} style={{ width: '100%', height: '80%' }} resizeMode="contain" /> : <Text style={{ color: '#fff' }}>Loading…</Text>}
        {url && <Text style={{ color: '#fff', marginTop: 12 }} onPress={() => Linking.openURL(url)}>Open full size ↗</Text>}
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  task: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ECEEF2', borderRadius: 14, paddingVertical: 12, paddingRight: 12, paddingLeft: 14, marginBottom: 8 },
  accent: { position: 'absolute', left: 0, top: 10, bottom: 10, width: 4, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  name: { fontSize: 17, fontWeight: '700', color: base.ink },
  nameDone: { color: base.slate },
  meta: { fontSize: 11.5, color: base.slate, marginTop: 2 },
  addrPill: { fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase', color: base.slate, backgroundColor: base.paper, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  thumb: { width: 56, height: 56, borderRadius: 8 },
  del: { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: base.red, alignItems: 'center', justifyContent: 'center' },
  delX: { color: '#fff', fontWeight: '800', fontSize: 13, lineHeight: 15 },
  waiting: { position: 'absolute', bottom: 2, left: 0, right: 0, textAlign: 'center', fontSize: 10, fontWeight: '700', color: base.ink },
  addPhoto: { marginTop: 8, paddingVertical: 6, paddingHorizontal: 11, borderRadius: 999, borderWidth: 1, borderColor: '#DADCE0', alignSelf: 'flex-start', backgroundColor: '#fff' },
  completeCard: { marginTop: 10, padding: 10, borderRadius: 10, backgroundColor: '#FCEFEF', borderWidth: 1, borderColor: '#E8B4B4' },
  statusRow: { flexDirection: 'row', gap: 3, marginTop: 8, backgroundColor: '#F1F2F4', borderRadius: 11, padding: 3 },
  statusBtn: { flex: 1, paddingVertical: 7, paddingHorizontal: 4, borderRadius: 8, alignItems: 'center' },
  statusTodo: { backgroundColor: '#fff', shadowColor: '#14161C', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  statusTxt: { fontSize: 11, fontWeight: '700', color: base.slate },
  pct: { marginTop: 10, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: base.line },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', alignItems: 'center', justifyContent: 'center', padding: 16 },
});
