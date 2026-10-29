// One Schedule of Works task: name, photos (sent and still waiting), Add photo,
// the three status buttons, the "complete needs a photo" card and the % chooser.
// Ported from taskRowHtml (480). Managers also get a ⋮ menu (edit, link address, move,
// delete, select multiple) and can complete by ticking photos already on the task.
// A task outside any section can be limited to chosen people (Who can see this);
// tasks in a section follow the section. Still to port: subcontractor assigning.
import { useState } from 'react';
import { Image, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { StorageImage, useStorageUrl } from '@/components/StorageImage';
import { chooseAction, confirmAsk, promptText, showAlert, useToast } from '@/components/toast';
import { Button } from '@/components/ui';
import { VisibilityEditor } from '@/components/VisibilityEditor';
import {
  addPhotos, cancelUpload, completeWithPhotos, deletePhoto, moveToProgressAfterPhotos, setPercent, setStatus,
  type Photo, type Task,
} from '@/data/sow';
import { deleteTasks, moveScheduleTask, pmComplete, renameTask, setTaskAddress } from '@/data/sowManager';
import { pickPhotos } from '@/lib/photos';
import { photoStage, snapPct } from '@/lib/rules/sow';
import { isManager } from '@/lib/roles';
import type { Profile, Site, SubAddress } from '@/lib/types';
import type { UploadJob } from '@/lib/uploadQueue';
import { base, radius } from '@/theme/theme';

const STATUS_COLOURS = {
  todo: { bg: '#F1F2F4', fg: base.slate },
  progress: { bg: base.warnBg, fg: base.warn },
  done: { bg: base.okBg, fg: base.ok },
};

export function SowTaskRow({ me, site, task, photos, pending, address, addresses = [], onChanged, percentPrompt, setPercentPrompt, selectMode, selected, onToggleSelect, onSelectMode }: {
  me: Profile; site: Site; task: Task; photos: Photo[]; pending: UploadJob[]; address?: SubAddress | null; addresses?: SubAddress[];
  onChanged: () => void; percentPrompt: boolean; setPercentPrompt: (on: boolean) => void;
  selectMode?: boolean; selected?: boolean; onToggleSelect?: () => void; onSelectMode?: () => void;
}) {
  const toast = useToast();
  const [completing, setCompleting] = useState(false);
  const [choose, setChoose] = useState<null | 'add' | 'complete'>(null);
  const [busy, setBusy] = useState(false);
  const [vis, setVis] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const status = (task.status || 'todo') as keyof typeof STATUS_COLOURS;
  const done = status === 'done';
  const mgr = isManager(me);
  const [pick, setPick] = useState<Set<string> | null>(null);
  const picked = pick ?? new Set(photos.filter((p) => p.stage === 'done').map((p) => p.id));

  const menu = async () => {
    const items = [
      { key: 'edit', label: '✎ Edit' },
      ...(site.multi_site ? [{ key: 'addr', label: '📍 Link Address' }] : []),
      { key: 'up', label: '▲ Move up' }, { key: 'down', label: '▼ Move down' },
      ...(!task.section_id ? [{ key: 'vis', label: '🔒 Who can see this' }] : []),
      { key: 'del', label: '🗑 Delete', danger: true }, { key: 'multi', label: '☑ Select Multiple' },
    ];
    const k = await chooseAction(task.name, items);
    if (k === 'vis') setVis(true);
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
      <Pressable onPress={onToggleSelect} style={[s.task, { flexDirection: 'row', alignItems: 'center', gap: 10, borderLeftColor: STATUS_COLOURS[status].fg }]}>
        <View style={{ width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: base.slateLight, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? base.ink : base.card }}>
          {selected && <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>✓</Text>}
        </View>
        <Text style={[s.name, done && s.nameDone, { flex: 1 }]}>{task.name}{done ? '  ✓' : ''}</Text>
      </Pressable>
    );
  }

  const take = async (source: 'camera' | 'library', mode: 'add' | 'complete') => {
    setChoose(null);
    const picked = await pickPhotos(source);
    if ('error' in picked) { showAlert(picked.error); return; }
    if (!picked.length) return;
    setBusy(true);
    try {
      if (mode === 'complete') {
        setCompleting(false);
        const n = await completeWithPhotos(me, site, task, picked);
        toast(`Task marked complete — ${n} photo${n === 1 ? '' : 's'} uploading`);
      } else {
        let stage = photoStage(task.status);
        let moved = false;
        if (status === 'todo' && await confirmAsk('Has this task started?', 'Yes — move to In Progress', 'No — still To Do')) {
          stage = 'progress'; moved = true;
        }
        const n = await addPhotos(me, site, task, picked, stage);
        if (moved) await moveToProgressAfterPhotos(task);
        if (stage === 'progress') setPercentPrompt(true);
        toast(`${n === 1 ? 'Photo added' : `${n} photos added`}${moved ? ' — moved to In Progress' : ''}`);
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
    if (pct >= 100) { toast('Upload a completed photo to finish this task'); setCompleting(true); return; }
    if (await setPercent(task, pct)) { toast(`Progress set to ${pct}%`); onChanged(); }
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
  const chooser = (mode: 'add' | 'complete') => (
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
      <View style={{ flex: 1 }}><Button kind="ghost" title="📸 Take photo" onPress={() => take('camera', mode)} /></View>
      <View style={{ flex: 1 }}><Button kind="ghost" title="🖼 Choose photos" onPress={() => take('library', mode)} /></View>
    </View>
  );

  return (
    <View style={[s.task, { borderLeftColor: STATUS_COLOURS[status].fg }]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={[s.name, done && s.nameDone]}>
            {!task.section_id && task.visibility_mode === 'assigned' ? '🔒 ' : ''}{task.name}{done ? '  ✓' : ''}
          </Text>
          {done && task.completed_at && (
            <Text style={s.meta}>Completed {new Date(task.completed_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</Text>
          )}
        </View>
        {site.multi_site && (
          <Text style={[s.addrPill, !task.sub_site_id && { color: base.warn, backgroundColor: base.warnBg }]}>{address?.name || 'No address'}</Text>
        )}
        {mgr && <Pressable onPress={menu} hitSlop={8} style={{ paddingHorizontal: 6 }}><Text style={{ fontSize: 18, color: base.slate }}>⋮</Text></Pressable>}
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
          {chooser('complete')}
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
          <Pressable onPress={() => setChoose(choose === 'add' ? null : 'add')} disabled={busy} style={s.addPhoto}>
            <Text style={{ fontWeight: '700', color: base.ink }}>{busy ? 'Preparing photos…' : '📷 Add photo'}</Text>
          </Pressable>
          {choose === 'add' && chooser('add')}
        </>
      )}

      <View style={s.statusRow}>
        {([['todo', 'To Commence'], ['progress', 'In Progress'], ['done', 'Complete']] as const).map(([k, label]) => {
          const active = k === 'done' ? (done || completing) : status === k && !completing;
          return (
            <Pressable key={k} style={[s.statusBtn, active && { backgroundColor: STATUS_COLOURS[k].bg, borderColor: STATUS_COLOURS[k].fg }]}
              onPress={() => (k === 'done' ? (setPercentPrompt(false), setCompleting(true)) : changeStatus(k))}>
              <Text style={[s.statusTxt, active && { color: STATUS_COLOURS[k].fg }]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      {status === 'progress' && !completing && (
        <View style={[s.pct, percentPrompt && { borderColor: base.warn, backgroundColor: base.warnBg }]}>
          {percentPrompt && <Text style={{ fontWeight: '700', color: base.warn, marginBottom: 6 }}>Photo added — how far along is this task now?</Text>}
          <View style={s.pctBar}><View style={{ width: `${pct}%`, height: '100%', backgroundColor: '#16A34A' }} /></View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((v) => (
              <Pressable key={v} onPress={() => pickPct(v)} style={[s.chip, v === pct && { backgroundColor: base.ink, borderColor: base.ink }]}>
                <Text style={{ fontSize: 11.5, fontWeight: '700', color: v === pct ? '#fff' : base.ink }}>{v}%</Text>
              </Pressable>
            ))}
          </View>
          {percentPrompt && (
            <Pressable onPress={() => setPercentPrompt(false)} style={{ marginTop: 6 }}><Text style={{ color: base.slate }}>Skip — leave at {pct}%</Text></Pressable>
          )}
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
        {url ? <Image source={{ uri: url }} style={{ width: '100%', height: '80%' }} resizeMode="contain" /> : <Text style={{ color: '#fff' }}>Loading…</Text>}
        {url && <Text style={{ color: '#fff', marginTop: 12 }} onPress={() => Linking.openURL(url)}>Open full size ↗</Text>}
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  task: { backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderLeftWidth: 4, borderRadius: radius.row, padding: 12, marginBottom: 10 },
  name: { fontSize: 14, fontWeight: '700', color: base.ink },
  nameDone: { color: base.slate },
  meta: { fontSize: 11.5, color: base.slate, marginTop: 2 },
  addrPill: { fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase', color: base.slate, backgroundColor: base.paper, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  thumb: { width: 56, height: 56, borderRadius: 8 },
  del: { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: base.red, alignItems: 'center', justifyContent: 'center' },
  delX: { color: '#fff', fontWeight: '800', fontSize: 13, lineHeight: 15 },
  waiting: { position: 'absolute', bottom: 2, left: 0, right: 0, textAlign: 'center', fontSize: 10, fontWeight: '700', color: base.ink },
  addPhoto: { marginTop: 10, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: base.line, borderStyle: 'dashed', alignItems: 'center' },
  completeCard: { marginTop: 10, padding: 10, borderRadius: 10, backgroundColor: '#FCEFEF', borderWidth: 1, borderColor: '#E8B4B4' },
  statusRow: { flexDirection: 'row', gap: 6, marginTop: 10 },
  statusBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: base.line, alignItems: 'center', backgroundColor: base.card },
  statusTxt: { fontSize: 12, fontWeight: '700', color: base.slate },
  pct: { marginTop: 10, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: base.line },
  pctBar: { height: 8, borderRadius: 5, backgroundColor: base.line, overflow: 'hidden' },
  chip: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 14, borderWidth: 1, borderColor: base.line },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', alignItems: 'center', justifyContent: 'center', padding: 16 },
});
