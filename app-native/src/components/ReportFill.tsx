// Filling in a report, briefing or LOLER inspection (430 renderReportFill +
// renderReportFillItem). Every question type: instruction, text, long text, number,
// date, Yes/No, Pass/Fail/N-A, choice (buttons or list, with "add an answer"),
// multi-choice, photos, drawing (photos of the drawing for now), operatives on site
// and signature; plus traffic-light colour, note and photo under each answer.
// Photos upload in the background and answers save as you go.
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, Text, TextInput, View } from 'react-native';

import { StorageImage, UrlImage } from '@/components/StorageImage';
import { TrafficKey } from '@/components/ReportAnswers';
import { chooseAction, promptText, showAlert, useToast } from '@/components/toast';
import { Button, Card, Muted, SectionTitle } from '@/components/ui';
import { completeReport, defaultOperatives, pendingPhotos, saveAnswers, uploadPhotos, type Sub } from '@/data/reports';
import { useAuth } from '@/lib/auth';
import { compressOne, pickPhotos } from '@/lib/photos';
import {
  completeProblem, itemAllowsMedia, itemAllowsNote, itemHasTraffic, itemOptions, itemVisible, mediaRequiredFor, scoreLabel, scoreSections,
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
  const sections = sub.sections || [];

  // Operatives-on-site questions start as everyone assigned to the job.
  useEffect(() => {
    const items = sections.flatMap((s) => s.items || []).filter((it) => it.type === 'operatives' && live.current[it.id] === undefined);
    if (!items.length) return;
    void defaultOperatives(siteId).then((list) => setAnswers((a) => { const n = { ...a }; items.forEach((it) => { if (n[it.id] === undefined) n[it.id] = list; }); return n; }));
  }, [sections, siteId]);

  if (!me) return null;
  const set = (k: string, v: unknown) => setAnswers((a) => ({ ...a, [k]: v }));
  const sc = scoreSections(sections, answers);
  const levels = trafficLevels(sections);

  // Quiet background save after photos are added, so nothing taken is lost.
  const background = async () => {
    if (editingCompleted || saving.current) return;
    saving.current = true;
    try { await uploadPhotos(siteId, live.current); await saveAnswers(sub.id, live.current); setAnswers({ ...live.current }); } catch { /* the on-screen copy is kept */ }
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
      case 'photo': case 'drawing':
        return (<>{label}{photos(it.id, it.type === 'drawing' ? 140 : 90)}<Button kind="ghost" title={it.type === 'drawing' ? '📐 Add drawing (photo)' : '📷 Add photo'} onPress={() => void addPhotos(it.id)} />{it.type === 'drawing' && <Muted style={{ marginBottom: 8 }}>Marking up the drawing and the numbered key are still in the current app.</Muted>}</>);
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
        if (!path) return (<>{label}<Pressable onPress={() => router.push('/signature')}><Text style={{ color: base.warn, marginBottom: 10 }}>You haven't adopted a signature yet — tap to set it up.</Text></Pressable></>);
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
    setBusy('save');
    const up = await upload();
    setProgress('Saving…');
    const ok = await saveAnswers(sub.id, live.current);
    setBusy(null); setProgress('');
    if (ok && !up.failed) { toast('Progress saved'); void qc.invalidateQueries({ queryKey: ['reports'] }); onDone(sub.id, false); return; }
    if (ok) showAlert(`Saved, but ${up.failed} photo${up.failed === 1 ? '' : 's'} could not be uploaded. Everything else is safe. Stay on this page and tap Save & Exit again when your signal is better — only the missing photo${up.failed === 1 ? '' : 's'} will be sent.`);
    else toast('Could not save — check your connection and try again. Nothing has been lost from this screen.');
  };
  const complete = async () => {
    const p = completeProblem(sections, answers, !!(me as { signature_path?: string | null }).signature_path);
    if (p) { toast(p); return; }
    setBusy('complete');
    const up = await upload();
    if (up.failed) {
      const kept = await saveAnswers(sub.id, live.current);
      setBusy(null); setProgress('');
      showAlert(`${up.failed} of ${up.total} photo${up.total === 1 ? '' : 's'} could not be uploaded, so it isn't completed yet. ${kept ? `The other ${up.total - up.failed} and all your answers are saved.` : 'Nothing has been lost from this screen.'} Stay on this page and tap Complete again when your signal is better.`);
      return;
    }
    setProgress('Completing…');
    const ok = await completeReport(me, sub, live.current, sections, editingCompleted, false);
    setBusy(null); setProgress('');
    if (!ok) { toast('Could not submit — check your connection and try again.'); return; }
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
          {(s.items || []).filter((it) => itemVisible(it, answers)).map((it) => <View key={it.id}>{field(it)}</View>)}
        </Card>
      ))}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}><Button kind="ghost" busy={busy === 'save'} disabled={!!busy} title="Save & Exit" onPress={() => void saveExit()} /></View>
        <View style={{ flex: 1 }}><Button busy={busy === 'complete'} disabled={!!busy} title={isBriefing ? 'Complete Briefing' : 'Complete Inspection'} onPress={() => void complete()} /></View>
      </View>
      {!!progress && <Text style={{ textAlign: 'center', fontWeight: '700', color: base.ink, marginTop: 10 }}>{progress}</Text>}
      <Muted style={{ marginTop: 12 }}>Still in the current app for now: filling in with no signal (offline parking), "+ Add another item" on a section, and drawing mark-up.</Muted>
    </View>
  );
}
