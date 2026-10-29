// Filling in a report, briefing or LOLER inspection (430 renderReportFill +
// renderReportFillItem). Every question type: instruction, text, long text, number,
// date, Yes/No, Pass/Fail/N-A, choice (buttons or list, with "add an answer"),
// multi-choice, photos, drawing (a photo or PDF, marked up with numbered pins —
// any question ticked "📍 Add to drawing" gets a number to place), operatives on
// site and signature; plus traffic-light colour, note and photo under each
// answer, and "+ Add another item" on a section. Photos upload in the
// background and answers save as you go.
import { useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, Platform, Pressable, Text, TextInput, View } from 'react-native';

import { MarkupEditor } from '@/components/MarkupEditor';
import { StorageImage, UrlImage } from '@/components/StorageImage';
import { TrafficKey } from '@/components/ReportAnswers';
import { chooseAction, confirmAsk, promptText, showAlert, useToast } from '@/components/toast';
import { renderMarked } from '@/lib/markupRender';
import { park, parkedFor, unpark } from '@/lib/reportOffline';
import { pdfPageImages } from '@/lib/pdfjs';
import { refreshKeyColours, type MarkOp } from '@/lib/rules/markup';
import { Button, Card, Muted, SectionTitle } from '@/components/ui';
import { completeReport, defaultOperatives, pendingPhotos, saveAnswers, uploadPhotos, type Sub } from '@/data/reports';
import { useAuth } from '@/lib/auth';
import { compressOne, pickPhotos } from '@/lib/photos';
import {
  addItemCopy, canAddItem, completeProblem, itemAllowsMedia, reportDrawingKeys, itemAllowsNote, itemHasTraffic, itemOptions, itemVisible, mediaRequiredFor, scoreLabel, scoreSections,
  trafficHex, trafficLevels, type Answers, type ReportItem,
} from '@/lib/rules/reports';
import { base, radius } from '@/theme/theme';

const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card, marginBottom: 8 };
type Op = { id: string; userId: string | null; name: string; role: string; included: boolean };

export function ReportFill({ sub, siteId, editingCompleted, isBriefing, onDone }: { sub: Sub; siteId: string; editingCompleted: boolean; isBriefing: boolean; onDone: (subId: string, completed: boolean) => void }) {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [answers, setAnswers] = useState<Answers>(() => ({ ...(sub.answers || {}) }));
  const [notesOpen, setNotesOpen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<null | 'save' | 'complete'>(null);
  const [progress, setProgress] = useState('');
  const live = useRef(answers); live.current = answers;
  const saving = useRef(false);
  const closing = useRef(false); // set once Save & Exit / Complete starts: the kept copy stops updating
  const [sections, setSections] = useState(() => sub.sections || []);
  const [extra, setExtra] = useState(false);
  const [mark, setMark] = useState<{ id: string; i: number } | null>(null);
  const secLive = useRef(sections);
  useEffect(() => { secLive.current = sections; }, [sections]);
  const hasDrawing = sections.some((s) => (s.items || []).some((it) => it.type === 'drawing'));

  // Operatives-on-site questions start as everyone assigned to the job.
  useEffect(() => {
    const items = sections.flatMap((s) => s.items || []).filter((it) => it.type === 'operatives' && live.current[it.id] === undefined);
    if (!items.length) return;
    // A general survey (no project) has no assigned team: start empty.
    void (siteId.startsWith('general') ? Promise.resolve([]) : defaultOperatives(siteId)).then((list) => setAnswers((a) => { const n = { ...a }; items.forEach((it) => { if (n[it.id] === undefined) n[it.id] = list; }); return n; }));
  }, [sections, siteId]);

  // The copy kept on this phone wins over the server's (it may be waiting to send).
  const meId = me?.id;
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    if (!meId) return;
    void parkedFor(meId, sub.id).then((p) => {
      if (p) { live.current = p.answers; setAnswers(p.answers); setSections(p.sections); setExtra(p.extra); toast(p.action === 'keep' ? 'Restored the copy kept on this phone.' : 'This report is waiting to send — showing the copy on this phone.'); }
      setRestored(true);
    });
  }, [meId, sub.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Keep a copy on this phone a few seconds after each change (keeping any "waiting to send").
  useEffect(() => {
    if (!meId || !restored) return;
    const t = setTimeout(() => { if (closing.current) return; void parkedFor(meId, sub.id).then((p) => { if (!closing.current) void park(meId, { sub, siteId, answers, sections, extra, editingCompleted, action: p?.action ?? 'keep', at: new Date().toISOString() }); }); }, 3000);
    return () => clearTimeout(t);
  }, [answers, sections, extra, restored]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!me) return null;
  const set = (k: string, v: unknown) => setAnswers((a) => ({ ...a, [k]: v }));
  const sc = scoreSections(sections, answers);
  const levels = trafficLevels(sections);

  // Quiet background save after photos are added, so nothing taken is lost.
  const background = async () => {
    if (editingCompleted || saving.current) return;
    saving.current = true;
    try { await uploadPhotos(siteId, live.current); await saveAnswers(sub.id, live.current, extra ? secLive.current : undefined); setAnswers({ ...live.current }); } catch { /* the on-screen copy is kept */ }
    saving.current = false;
  };
  const addPhotos = async (key: string) => {
    const k = await chooseAction('Add photo', [{ key: 'camera', label: '📷 Take a photo' }, { key: 'library', label: '🖼 Choose from library' }]);
    if (!k) return;
    const p = await pickPhotos(k as 'camera' | 'library', true);
    if ('error' in p) { showAlert(p.error); return; }
    const uris: string[] = [];
    for (const x of p) { try { uris.push(await compressOne(x)); } catch { /* skipped */ } }
    if (uris.length < p.length) toast(uris.length ? `${p.length - uris.length} photo(s) could not be processed — the rest were added.` : 'Could not process that photo.');
    const cur = Array.isArray(live.current[key]) ? (live.current[key] as string[]) : [];
    live.current = { ...live.current, [key]: [...cur, ...uris] };
    setAnswers(live.current);
    void background();
  };
  const photos = (key: string, size = 90) => {
    const arr = Array.isArray(answers[key]) ? (answers[key] as string[]) : [];
    return arr.length ? (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        {arr.map((u, i) => (
          <Pressable key={`${u}${i}`} onPress={() => set(key, arr.filter((_, j) => j !== i))}>
            {/^https?:/.test(u) ? <UrlImage url={u} style={{ width: size, height: size, borderRadius: 8 }} /> : <Image source={{ uri: u }} style={{ width: size, height: size, borderRadius: 8 }} />}
            <Text style={{ position: 'absolute', top: 2, right: 6, color: '#fff', fontWeight: '800', textShadowColor: '#000', textShadowRadius: 3 }}>✕</Text>
          </Pressable>
        ))}
      </View>
    ) : null;
  };
  // ---- Drawing / plan mark-up (430): <id> the marked image, <id>__orig the clean upload, <id>__ops the marks — kept in step.
  const arrOf = (k: string) => (Array.isArray(live.current[k]) ? [...(live.current[k] as unknown[])] : []);
  const addDrawings = (id: string, imgs: string[]) => {
    if (!imgs.length) return;
    live.current = { ...live.current, [id]: [...arrOf(id), ...imgs], [`${id}__orig`]: [...arrOf(`${id}__orig`), ...imgs], [`${id}__ops`]: [...arrOf(`${id}__ops`), ...imgs.map(() => [])] };
    setAnswers(live.current); toast(imgs.length === 1 ? 'Drawing added — tap Mark up' : `${imgs.length} drawings added — tap Mark up`); void background();
  };
  const uploadDrawing = async (id: string) => {
    const k = await chooseAction('Add a drawing', [{ key: 'file', label: '📄 PDF or image file' }, { key: 'camera', label: '📷 Take a photo' }, { key: 'library', label: '🖼 Choose from library' }]);
    if (!k) return;
    if (k !== 'file') {
      const p = await pickPhotos(k as 'camera' | 'library', true); if ('error' in p) { showAlert(p.error); return; }
      const uris: string[] = []; for (const x of p) { try { uris.push(await compressOne(x)); } catch { /* skipped */ } }
      addDrawings(id, uris); return;
    }
    const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], multiple: true, copyToCacheDirectory: true }); if (r.canceled) return;
    const out: string[] = [], cut: string[] = [];
    for (const a of r.assets) {
      if (/pdf$/i.test(a.mimeType || '') || /\.pdf$/i.test(a.name || '')) {
        if (Platform.OS !== 'web') { showAlert('PDF drawings are turned into pages on the office laptop — on a phone, take a photo of the drawing instead.'); continue; }
        toast(`Loading ${a.name || 'drawing'}…`);
        const res = await pdfPageImages(new Uint8Array(await (await fetch(a.uri)).arrayBuffer()));
        if (!res) { toast(`Could not read ${a.name || 'that file'}.`); continue; }
        out.push(...res.images); if (res.total > res.images.length) cut.push(`"${a.name || 'PDF'}" has ${res.total} pages — only the first ${res.images.length} were added`);
      } else out.push(a.uri);
    }
    addDrawings(id, out);
    if (cut.length) showAlert(`${cut.join('. ')}. To add the rest, save those pages as a separate PDF and add that too.`);
  };
  const removeDrawing = (id: string, i: number) => {
    const drop = (k: string) => arrOf(k).filter((_, j) => j !== i);
    live.current = { ...live.current, [id]: drop(id), [`${id}__orig`]: drop(`${id}__orig`), [`${id}__ops`]: drop(`${id}__ops`) };
    setAnswers(live.current);
  };
  const keysFor = () => reportDrawingKeys(secLive.current, live.current).map((x) => ({ n: x.n, label: x.label + (x.answer ? `: ${x.answer}` : ''), color: x.color }));
  // Numbers placed for an item follow its condition colour: redrawn before saving (office laptop).
  const refreshDrawingColours = async () => {
    if (Platform.OS !== 'web' || !hasDrawing) return;
    const keys = keysFor();
    for (const s of secLive.current) for (const it of s.items || []) {
      if (it.type !== 'drawing') continue;
      const ops = arrOf(`${it.id}__ops`) as MarkOp[][], orig = arrOf(`${it.id}__orig`) as string[], imgs = arrOf(it.id) as string[];
      let changed = false;
      for (let i = 0; i < ops.length; i++) {
        if (!ops[i] || !orig[i]) continue;
        const copy = JSON.parse(JSON.stringify(ops[i])) as MarkOp[];
        if (!refreshKeyColours(copy, keys)) continue;
        try { const img = await renderMarked(orig[i], copy); if (img) { imgs[i] = img; ops[i] = copy; changed = true; } } catch { /* keep as is */ }
      }
      if (changed) live.current = { ...live.current, [it.id]: imgs, [`${it.id}__ops`]: ops };
    }
    setAnswers({ ...live.current });
  };
  const markAt = (k: string) => (mark && Array.isArray(answers[k]) ? (answers[k] as unknown[])[mark.i] : undefined);
  const markSrc = mark ? ((markAt(`${mark.id}__orig`) as string) || (markAt(mark.id) as string) || null) : null;
  const markOps = mark ? ((markAt(`${mark.id}__ops`) as MarkOp[]) || []) : [];
  const markDone = (out: { image: string; ops: MarkOp[] } | null) => {
    const m = mark; setMark(null); if (!out || !m) return;
    const imgs = arrOf(m.id), o = arrOf(`${m.id}__ops`), og = arrOf(`${m.id}__orig`);
    if (!og[m.i]) og[m.i] = imgs[m.i];
    imgs[m.i] = out.image; o[m.i] = out.ops;
    live.current = { ...live.current, [m.id]: imgs, [`${m.id}__ops`]: o, [`${m.id}__orig`]: og }; setAnswers(live.current); void background();
  };
  const NO_TICK = ['drawing', 'instruction', 'signature', 'operatives', 'photo', 'date'];
  const drawingTick = (it: ReportItem) => {
    if (!hasDrawing || NO_TICK.includes(it.type)) return null;
    const n = answers[`${it.id}__dnum`] as number | undefined;
    return (
      <Pressable onPress={() => {
        const a = { ...live.current };
        if (n) delete a[`${it.id}__dnum`]; else { let max = 0; Object.keys(a).forEach((key) => { if (/__dnum$/.test(key)) max = Math.max(max, Number(a[key]) || 0); }); a[`${it.id}__dnum`] = max + 1; }
        live.current = a; setAnswers(a);
      }} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <Text style={{ fontSize: 16, color: base.ink }}>{n ? '☑' : '☐'}</Text><Text style={{ color: base.ink, fontWeight: '600' }}>📍 Add to drawing</Text>
        {!!n && <View style={{ minWidth: 22, height: 22, borderRadius: 11, backgroundColor: base.ink, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}><Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{n}</Text></View>}
      </Pressable>
    );
  };
  const choices = (it: ReportItem, opts: string[], cur: unknown, onPick: (v: string) => void) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
      {opts.map((o) => {
        const on = Array.isArray(cur) ? cur.includes(o) : cur === o;
        return (
          <Pressable key={o} onPress={() => onPick(o)} style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: on ? base.ink : base.line, backgroundColor: on ? base.ink : base.card, flexGrow: it.type === 'passfail' || it.type === 'checkbox' ? 1 : 0, alignItems: 'center' }}>
            <Text style={{ fontWeight: '700', color: on ? '#fff' : base.ink }}>{o}</Text>
          </Pressable>
        );
      })}
    </View>
  );
  const extras = (it: ReportItem) => {
    const canNote = itemAllowsNote(it), canMedia = itemAllowsMedia(it);
    const tl = itemHasTraffic(sections, it) && levels;
    const note = String(answers[`${it.id}__note`] ?? '');
    const noteOpen = canNote && (!!note || notesOpen.has(it.id));
    const req = canMedia && mediaRequiredFor(it, answers);
    const mArr = Array.isArray(answers[`${it.id}__media`]) ? (answers[`${it.id}__media`] as string[]) : [];
    if (!canNote && !canMedia && !tl) return null;
    return (
      <View style={{ marginBottom: 12 }}>
        {tl && (
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
            {tl.map((l) => {
              const on = answers[`${it.id}__tl`] === l.id;
              return <Pressable key={l.id} onPress={() => set(`${it.id}__tl`, on ? '' : l.id)} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: trafficHex(l.color), borderWidth: on ? 3 : 0, borderColor: base.ink, opacity: on || !answers[`${it.id}__tl`] ? 1 : 0.35 }} />;
            })}
          </View>
        )}
        {noteOpen && <TextInput value={note} onChangeText={(t) => set(`${it.id}__note`, t)} multiline placeholder="Add a note…" style={[box, { minHeight: 54 }]} />}
        {canMedia && photos(`${it.id}__media`, 70)}
        {req && <Text style={{ color: base.warn, fontWeight: '700', marginBottom: 6 }}>A photo is required for this answer *</Text>}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {canNote && !noteOpen && <View style={{ flex: 1 }}><Button kind="ghost" title="📝 Add note" onPress={() => setNotesOpen(new Set(notesOpen).add(it.id))} /></View>}
          {canMedia && <View style={{ flex: 1 }}><Button kind="ghost" title={`📷 Add photo${req && !mArr.length ? ' *' : ''}`} onPress={() => void addPhotos(`${it.id}__media`)} /></View>}
        </View>
      </View>
    );
  };

  const field = (it: ReportItem) => {
    const val = answers[it.id];
    const label = <Text style={{ fontWeight: '700', color: base.ink, marginBottom: 6 }}>{it.label}{it.required ? ' *' : ''}{it.autofill ? <Text style={{ fontWeight: '400', color: base.slate, fontSize: 11 }}> (auto-filled — edit if needed)</Text> : null}</Text>;
    switch (it.type) {
      case 'instruction': return <Text style={{ fontWeight: '800', color: base.ink, marginBottom: 10 }}>{it.label}</Text>;
      case 'text': case 'number': case 'date': case 'textarea':
        return (<>{label}<TextInput value={val == null ? '' : String(val)} onChangeText={(t) => set(it.id, t)} multiline={it.type === 'textarea'} keyboardType={it.type === 'number' ? 'decimal-pad' : 'default'} autoCapitalize={it.type === 'date' ? 'none' : 'sentences'} placeholder={it.type === 'date' ? 'YYYY-MM-DD' : ''} style={[box, it.type === 'textarea' ? { minHeight: 70 } : {}]} />{extras(it)}</>);
      case 'checkbox':
        return (<>{label}{choices(it, ['Yes', 'No'], val === true ? 'Yes' : val === false ? 'No' : null, (o) => set(it.id, o === 'Yes'))}{extras(it)}</>);
      case 'passfail': {
        const words: Record<string, string> = it.pfWords ? { Pass: 'Pass', Fail: 'Fail', 'N/A': 'N/A' } : { Pass: 'Yes', Fail: 'No', 'N/A': 'N/A' };
        const back = Object.fromEntries(Object.entries(words).map(([k, v]) => [v, k]));
        return (<>{label}{choices(it, Object.values(words), val ? words[String(val)] : null, (o) => set(it.id, back[o]))}{extras(it)}</>);
      }
      case 'choice': {
        const opts = itemOptions(it, answers); if (val && !opts.includes(String(val))) opts.push(String(val));
        return (<>{label}{it.asButtons || opts.length <= 6 ? choices(it, opts, val, (o) => set(it.id, val === o ? '' : o)) : (
          <Pressable onPress={async () => { const k = await chooseAction(it.label, opts.map((o) => ({ key: o, label: `${val === o ? '✓ ' : ''}${o}` }))); if (k) set(it.id, k); }} style={[box, { paddingVertical: 12 }]}>
            <Text style={{ color: val ? base.ink : base.slate }}>▼ {val ? String(val) : 'Select…'}</Text>
          </Pressable>
        )}
          <Pressable onPress={async () => { const t = (await promptText('Type the answer to add:', ''))?.trim(); if (!t) return; const ex = Array.isArray(answers[`${it.id}__opts`]) ? (answers[`${it.id}__opts`] as string[]) : []; setAnswers((a) => ({ ...a, [`${it.id}__opts`]: ex.includes(t) ? ex : [...ex, t], [it.id]: t })); }}>
            <Text style={{ color: base.blue, marginBottom: 8 }}>+ Add another answer</Text>
          </Pressable>{extras(it)}</>);
      }
      case 'multichoice': {
        const arr = Array.isArray(val) ? (val as string[]) : [];
        const opts = itemOptions(it, answers); arr.forEach((v) => { if (!opts.includes(v)) opts.push(v); });
        return (<>{label}{choices(it, opts, arr, (o) => set(it.id, arr.includes(o) ? arr.filter((x) => x !== o) : [...arr, o]))}
          <Pressable onPress={async () => { const t = (await promptText('Type the answer to add:', ''))?.trim(); if (!t) return; const ex = Array.isArray(answers[`${it.id}__opts`]) ? (answers[`${it.id}__opts`] as string[]) : []; setAnswers((a) => ({ ...a, [`${it.id}__opts`]: ex.includes(t) ? ex : [...ex, t], [it.id]: arr.includes(t) ? arr : [...arr, t] })); }}>
            <Text style={{ color: base.blue, marginBottom: 8 }}>+ Add another answer</Text>
          </Pressable>{extras(it)}</>);
      }
      case 'photo':
        return (<>{label}{photos(it.id, 90)}<Button kind="ghost" title="📷 Add photo" onPress={() => void addPhotos(it.id)} /></>);
      case 'drawing': {
        const arr = Array.isArray(val) ? (val as string[]) : [];
        const nKeys = reportDrawingKeys(sections, answers).length;
        const pic = { width: '100%' as const, aspectRatio: 1.414, borderRadius: 8, resizeMode: 'contain' as const, backgroundColor: '#fff' };
        return (<>{label}
          {arr.map((u, i) => (
            <View key={`${i}${u.slice(-24)}`} style={{ marginBottom: 10 }}>
              {/^https?:/.test(u) ? <UrlImage url={u} style={pic} /> : <Image source={{ uri: u }} style={pic} />}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                <View style={{ flex: 2 }}><Button title={`✏️ Mark up${arr.length > 1 ? ` drawing ${i + 1}` : ''}`} onPress={() => setMark({ id: it.id, i })} /></View>
                <View style={{ flex: 1 }}><Button kind="ghost" title="🗑 Remove" onPress={() => removeDrawing(it.id, i)} /></View>
              </View>
            </View>
          ))}
          <Button kind="ghost" title="📄 Upload drawing (PDF or photo)" onPress={() => void uploadDrawing(it.id)} />
          <Muted style={{ marginBottom: 8 }}>Tick 📍 Add to drawing on any question to give it a number, then tap Mark up to place the numbers.{nKeys ? ` ${nKeys} item${nKeys === 1 ? '' : 's'} ticked so far.` : ''}</Muted>
        </>);
      }
      case 'operatives': {
        const list = Array.isArray(val) ? (val as Op[]) : [];
        const upd = (i: number, patch: Partial<Op>) => set(it.id, list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
        return (
          <View style={{ marginBottom: 10 }}>
            {label}
            {list.length ? list.map((r, i) => (
              <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: base.line }}>
                <Pressable onPress={() => upd(i, { included: !r.included })}><Text style={{ fontSize: 18 }}>{r.included ? '☑' : '☐'}</Text></Pressable>
                <Text style={{ flex: 1, fontWeight: '700', color: base.ink }}>{r.name}</Text>
                <TextInput value={r.role} onChangeText={(t) => upd(i, { role: t })} placeholder="Role on site" style={[box, { flex: 1, marginBottom: 0, paddingVertical: 6 }]} />
                {!r.userId && <Pressable onPress={() => set(it.id, list.filter((_, j) => j !== i))}><Text style={{ color: base.red }}>✕</Text></Pressable>}
              </View>
            )) : <Muted>No operatives assigned to this site yet.</Muted>}
            <Button kind="ghost" title="+ Add Operative" onPress={async () => { const n = (await promptText('Name', ''))?.trim(); if (n) set(it.id, [...list, { id: `${Date.now()}`, userId: null, name: n, role: '', included: true }]); }} />
          </View>
        );
      }
      case 'signature': {
        const path = (me as { signature_path?: string | null }).signature_path;
        if (!path) return (<>{label}<Pressable onPress={() => router.push('/signature')}><Text style={{ color: base.warn, marginBottom: 10 }}>You haven&apos;t adopted a signature yet — tap to set it up.</Text></Pressable></>);
        return (
          <>{label}
            <Pressable disabled={!!val} onPress={() => set(it.id, path)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderStyle: val ? 'solid' : 'dashed', borderColor: val ? base.ok : base.line, borderRadius: radius.input, padding: 10, marginBottom: 10 }}>
              <StorageImage bucket="signatures" path={path} style={{ height: 34, width: 140, resizeMode: 'contain' }} />
              <Text style={{ color: base.ink }}>{val ? 'Signed — attached on submit' : 'Tap to sign'}</Text>
            </Pressable>
          </>
        );
      }
      default: return null;
    }
  };

  const upload = async () => {
    setProgress(pendingPhotos(live.current) ? 'Uploading photos… Keep this page open.' : '');
    const up = await uploadPhotos(siteId, live.current, (d, t, f) => setProgress(`Uploading photos… ${d} of ${t}${f ? ` (${f} failed so far)` : ''}. Keep this page open.`));
    setAnswers({ ...live.current });
    return up;
  };
  const saveExit = async () => {
    closing.current = true;
    setBusy('save');
    await refreshDrawingColours();
    const up = await upload();
    setProgress('Saving…');
    const ok = await saveAnswers(sub.id, live.current, extra ? sections : undefined);
    setBusy(null); setProgress('');
    if (ok && !up.failed) { await unpark(me.id, sub.id); toast('Progress saved'); void qc.invalidateQueries({ queryKey: ['reports'] }); onDone(sub.id, false); return; }
    // No signal: park it on the phone; it sends itself when there's signal.
    await parkNow('save');
    showAlert(ok ? `Saved, but ${up.failed} photo${up.failed === 1 ? '' : 's'} couldn't be sent yet. They are kept on this phone and will send by themselves when there's signal — keep the app installed and open it now and then.` : 'No signal — your report is kept on this phone and will send by itself when there\'s signal. You can carry on.');
    onDone(sub.id, false);
  };
  const parkNow = (action: 'keep' | 'save' | 'complete') => park(me.id, { sub, siteId, answers: live.current, sections, extra, editingCompleted, action, at: new Date().toISOString() });
  const complete = async () => {
    const p = completeProblem(sections, answers, !!(me as { signature_path?: string | null }).signature_path);
    if (p) { toast(p); return; }
    closing.current = true;
    setBusy('complete');
    await refreshDrawingColours();
    const up = await upload();
    // No signal (photos or the completion can't be sent): it's complete as far as you're concerned — park it and send it later.
    const parkComplete = async () => {
      await saveAnswers(sub.id, live.current, extra ? sections : undefined).catch(() => false);
      await parkNow('complete'); setBusy(null); setProgress('');
      showAlert('No signal — it is completed on this phone and will send by itself when there\'s signal. Keep the app installed and open it now and then until it has gone.');
      onDone(sub.id, false);
    };
    if (up.failed) { await parkComplete(); return; }
    setProgress('Completing…');
    const ok = await completeReport(me, sub, live.current, sections, editingCompleted, extra);
    setBusy(null); setProgress('');
    if (!ok) { await parkComplete(); return; }
    await unpark(me.id, sub.id);
    toast(isBriefing ? 'Briefing completed' : editingCompleted ? 'Report updated' : 'Report submitted');
    void qc.invalidateQueries({ queryKey: ['reports'] }); void qc.invalidateQueries({ queryKey: ['reportSub', sub.id] }); void qc.invalidateQueries({ queryKey: ['briefings'] });
    onDone(sub.id, true);
  };

  return (
    <View>
      <SectionTitle>{sub.template_name}</SectionTitle>
      <TrafficKey sections={sections} />
      {sc.overall.possible > 0 && <Text style={{ textAlign: 'right', fontWeight: '800', color: base.ink }}>Score: {scoreLabel(sc.overall)}</Text>}
      {sections.map((s) => (
        <Card key={s.id}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <SectionTitle>{s.title}</SectionTitle>
            {sc.bySection[s.id] && <Text style={{ fontWeight: '700', fontSize: 12, color: base.slate, marginTop: 16 }}>{scoreLabel(sc.bySection[s.id])}</Text>}
          </View>
          {(s.items || []).filter((it) => itemVisible(it, answers)).map((it) => (
            <View key={it.id}>
              {it.addedOnSite && <Pressable onPress={async () => { const a = answers[it.id], m = answers[`${it.id}__media`]; if (((a !== undefined && a !== null && a !== '' && !(Array.isArray(a) && !a.length)) || (Array.isArray(m) && m.length)) && !(await confirmAsk(`Remove "${it.label}" and what you have entered for it?`, 'Remove'))) return; setSections((x) => x.map((y) => (y.id === s.id ? { ...y, items: (y.items || []).filter((z) => z.id !== it.id) } : y))); setExtra(true); }} style={{ alignSelf: 'flex-end' }}><Text style={{ color: base.red, fontSize: 12 }}>✕ Remove this item</Text></Pressable>}
              {field(it)}{drawingTick(it)}
            </View>
          ))}
          {canAddItem(s) && <Button kind="ghost" title="+ Add another item" onPress={() => { setSections((x) => addItemCopy(x, s.id, `id_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`)); setExtra(true); }} />}
        </Card>
      ))}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}><Button kind="ghost" busy={busy === 'save'} disabled={!!busy} title="Save & Exit" onPress={() => void saveExit()} /></View>
        <View style={{ flex: 1 }}><Button busy={busy === 'complete'} disabled={!!busy} title={isBriefing ? 'Complete Briefing' : 'Complete Inspection'} onPress={() => void complete()} /></View>
      </View>
      {!!progress && <Text style={{ textAlign: 'center', fontWeight: '700', color: base.ink, marginTop: 10 }}>{progress}</Text>}
      {mark && markSrc && <MarkupEditor src={markSrc} ops={markOps} keys={reportDrawingKeys(sections, answers).map((x) => ({ n: x.n, label: x.label + (x.answer ? `: ${x.answer}` : ''), color: x.color }))} onClose={markDone} />}
      <Muted style={{ marginTop: 12 }}>A copy is kept on this phone as you go. With no signal, Save &amp; Exit and Complete keep it here and it sends by itself later.</Muted>
    </View>
  );
}
