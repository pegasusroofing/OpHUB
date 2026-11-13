// RAMS Builder editor (586 renderRamsBuild): Info / RA / SSOW / MS / Issue.
// Every hazard and section is its own item — move, edit, duplicate, remove,
// add from the library or write a new one (and save it back to the library).
// Changes save automatically; issuing makes the two signable documents.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { chooseAction, confirmAsk, promptText, showAlert, useToast } from '@/components/toast';
import { Button, Card, Check, Empty, Muted, SectionTitle } from '@/components/ui';
import { DateBox } from '@/components/DateField';
import { NumberedLines } from '@/components/NumberedLines';
import { askAiCharge, RamsAiPopup } from '@/components/RamsAiBox';
import { aiDraft, aiToLibrary, deleteBuild, issueBuild, loadBuild, previewPdf, saveAsTemplate, saveBuild, saveItemToLibrary, useLibrary } from '@/data/ramsBuilder';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { showPdf } from '@/lib/pdf';
import { hazardFromLib, mergeAiDraft, missingInfo, moveItem, P_LABELS, RAMS_GROUPS, RAMS_PPE, RAMS_REQUIRED, ramsUid, riskBand, rr, S_LABELS, sectionFromLib, type Hazard, type RamsBuild, type RamsDetails, type RSection } from '@/lib/rules/rams';
import { isCompanyAdmin, isFullManager } from '@/lib/roles';
import { base, page, radius, space, live } from '@/theme/theme';

type Tab = 'details' | 'ra' | 'ssow' | 'ms' | 'issue';
const ORDER: Tab[] = ['details', 'ra', 'ssow', 'ms', 'issue'];
const NEXT: Partial<Record<Tab, string>> = { ra: 'Next: Risk Assessment', ssow: 'Next: Safe Systems of Work', ms: 'Next: Method Statements', issue: 'Next: Issue' };
const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 9, color: base.ink, backgroundColor: base.card, marginBottom: 8 };
const Badge = ({ p, s }: { p: unknown; s: unknown }) => { const n = rr(p, s), b = riskBand(n); return <Text style={{ backgroundColor: b.bg, color: b.fg, fontWeight: '600', paddingHorizontal: 7, borderRadius: 6, overflow: 'hidden' }}>{n}</Text>; };
const chipStyle = (on: boolean) => ({ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: on ? live.brand1 : base.line, backgroundColor: on ? live.brand1 : base.card });

export default function RamsBuildScreen() {
  const { id, b: buildId } = useLocalSearchParams<{ id: string; b: string }>();
  const { me, org } = useAuth();
  const { data: site } = useSite(id);
  const { data, isLoading } = useQuery({ queryKey: ['ramsBuild', buildId, !!site], enabled: !!me && !!buildId && !!site, gcTime: 0, queryFn: () => loadBuild(me as never, org as never, site, buildId) });
  if (!me) return null;
  if (!isFullManager(me)) return <Muted style={{ padding: space.l }}>Project Managers and admins only.</Muted>;
  if (isLoading || !site) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  if (!data) return <Muted style={{ padding: space.l }}>RAMS not found.</Muted>;
  return <Editor key={data.id} initial={data} siteId={id} />;
}

function Editor({ initial, siteId }: { initial: RamsBuild; siteId: string }) {
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [b, setB] = useState<RamsBuild>(initial);
  const { tab: startTab } = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(startTab === 'ms' || startTab === 'ra' ? startTab : 'details');
  const [editId, setEditId] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ kind: 'hazard' | 'section'; part: 'general' | 'method' | null } | null>(null);
  const [saveState, setSaveState] = useState(initial.status === 'issued' ? `✓ Issued rev ${initial.revision} · edits need re-issuing` : 'Draft · saves automatically');
  const [busy, setBusy] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const { data: site } = useSite(siteId);
  const latest = useRef(b), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveNow = async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    setSaveState((await saveBuild(latest.current)) ? 'All changes saved' : 'Not saved — check signal');
    void qc.invalidateQueries({ queryKey: ['ramsBuilds', siteId] });
  };
  const change = (fn: (x: RamsBuild) => RamsBuild) => {
    const next = fn(latest.current); latest.current = next; setB(next);
    setSaveState('Saving…');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void saveNow(); }, 700);
  };
  // Leaving the editor saves anything still waiting.
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); void saveBuild(latest.current); } }, []);
  if (!me) return null;
  const setD = (k: keyof RamsDetails, v: unknown) => change((x) => ({ ...x, details: { ...x.details, [k]: v } }));
  // Only saves when there's a change waiting, so just looking round the tabs never rewrites the draft.
  const go = async (t: Tab) => { if (timer.current) await saveNow(); setTab(t); setEditId(null); setPicker(null); };
  const next = (from: Tab) => {
    const nx = ORDER[ORDER.indexOf(from) + 1];
    return nx ? <View style={{ marginTop: 14 }}><Button title={`${NEXT[nx]} ›`} onPress={() => {
      if (from === 'details') { const miss = missingInfo(b.details); if (miss.length) { toast(`Please fill in: ${miss.join(' and ')}`); return; } }
      void go(nx);
    }} /></View> : null;
  };
  const tabs: [Tab, string][] = [['details', missingInfo(b.details).length ? 'Info ⚠' : 'Info'], ['ra', `RA (${b.hazards.length})`], ['ssow', `SSOW (${b.sections.filter((x) => x.part !== 'method').length})`], ['ms', `MS (${b.sections.filter((x) => x.part === 'method').length})`], ['issue', 'Issue']];

  // ----- list tools -----
  const listOf = (kind: 'hazards' | 'sections') => b[kind] as (Hazard | RSection)[];
  const tools = (kind: 'hazards' | 'sections', it: Hazard | RSection, i: number, n: number) => (
    <View style={{ flexDirection: 'row', gap: 14, marginTop: 8, justifyContent: 'flex-end' }}>
      {[['↑', i === 0, () => change((x) => ({ ...x, [kind]: moveItem(listOf(kind) as never[], it.id, -1) || x[kind] }))], ['↓', i === n - 1, () => change((x) => ({ ...x, [kind]: moveItem(listOf(kind) as never[], it.id, 1) || x[kind] }))],
        ['✎', false, () => setEditId(it.id)],
        ['⧉', false, () => { const c = { ...JSON.parse(JSON.stringify(it)), id: ramsUid(), title: `${it.title} (copy)` }; change((x) => { const arr = (x[kind] as (Hazard | RSection)[]).slice(); arr.splice(arr.findIndex((y) => y.id === it.id) + 1, 0, c); return { ...x, [kind]: arr }; }); setEditId(c.id); }],
        ['🗑', false, async () => { if (await confirmAsk(`Remove "${it.title || 'this item'}" from this RAMS?\n\nIt stays in the library.`, 'Remove')) change((x) => ({ ...x, [kind]: (x[kind] as { id: string }[]).filter((y) => y.id !== it.id) })); }],
      ].map(([l, dis, fn]) => <Pressable key={l as string} disabled={dis as boolean} onPress={fn as () => void} hitSlop={6} style={{ opacity: dis ? 0.3 : 1 }}><Text style={{ fontSize: 16 }}>{l as string}</Text></Pressable>)}
    </View>
  );
  const toLibrary = async (kind: 'hazard' | 'section', it: Hazard | RSection) => {
    if (!it.title) { toast('Give it a heading first'); return; }
    const r = await saveItemToLibrary(me, kind, it, (t) => confirmAsk(`"${t}" is already in the library.\n\nReplace the library copy with this version? (Other jobs' RAMS are not changed.)`, 'Replace'));
    if (!r) return;
    if (r === 'Could not save') { toast(r); return; }
    change((x) => kind === 'hazard' ? { ...x, hazards: x.hazards.map((h) => (h.id === it.id ? { ...h, libId: r } : h)) } : { ...x, sections: x.sections.map((s) => (s.id === it.id ? { ...s, libId: r } : s)) });
    void qc.invalidateQueries({ queryKey: ['ramsLib'] });
    toast('✓ Saved to the library', { confirm: true });
  };
  const pick = async (label: string, labels: string[], cur: number, set: (n: number) => void) => {
    const k = await chooseAction(label, [1, 2, 3, 4, 5].map((n) => ({ key: String(n), label: `${n === cur ? '✓ ' : ''}${n} — ${labels[n]}` })));
    if (k) set(Number(k));
  };
  const setH = (hid: string, patch: Partial<Hazard>) => change((x) => ({ ...x, hazards: x.hazards.map((h) => (h.id === hid ? { ...h, ...patch } : h)) }));
  const setS = (sid: string, patch: Partial<RSection>) => change((x) => ({ ...x, sections: x.sections.map((s) => (s.id === sid ? { ...s, ...patch } : s)) }));

  // ----- tabs -----
  const field = (label: string, k: keyof RamsDetails, o: { multiline?: boolean; kb?: 'phone-pad'; ph?: string; date?: boolean } = {}) => {
    const req = RAMS_REQUIRED.some(([r]) => r === k), v = String(b.details[k] ?? ''), bad = req && !v.trim();
    return (
      <View key={k}>
        <Muted style={{ fontWeight: '600' }}>{label}{req ? <Text style={{ color: '#C0392B' }}> *</Text> : null}</Muted>
        {o.date ? <DateBox value={v} onChange={(t) => setD(k, t)} title={label} placeholder={req ? 'Required' : 'Choose a date'} style={[{ marginBottom: 8 }, bad ? { borderColor: '#C0392B' } : null]} /> : <TextInput value={v} onChangeText={(t) => setD(k, t)} multiline={o.multiline} keyboardType={o.kb} placeholder={o.ph || (req ? 'Required' : undefined)} style={[box, o.multiline ? { minHeight: 70 } : null, bad ? { borderColor: '#C0392B' } : null]} />}
      </View>
    );
  };
  const row = (...kids: React.ReactNode[]) => <View style={{ flexDirection: 'row', gap: 8 }}>{kids.map((k, i) => <View key={i} style={{ flex: 1, minWidth: 0 }}>{k}</View>)}</View>;
  const details = () => {
    const d = b.details, groups = RAMS_GROUPS.concat((d.groups || []).filter((g) => !RAMS_GROUPS.includes(g)));
    return (
      <>
        <Card>
          <SectionTitle>Document details</SectionTitle>
          {row(field('Risk Assessment no.', 'raNumber'), field('Method Statement no.', 'msNumber'))}
          {row(field('Date', 'date', { date: true }), field('Review date', 'reviewDate', { date: true }))}
          {field('Author', 'author')}
          {field('Project / contract', 'project')}
          {row(field('Start date', 'startDate', { date: true }), field('Expected duration', 'duration'))}
          {field('Client contact (from the Client Info tab)', 'clientContact')}
          {field('Description of works', 'description')}
          {field('Site address', 'address')}
          {field('Main contractor', 'mainContractor')}
          {field('Risk assessment notes (e.g. site supervisor & phone)', 'notes', { multiline: true })}
          {row(field('Emergency contact', 'emergencyName'), field('Emergency phone', 'emergencyPhone', { kb: 'phone-pad' }))}
        </Card>
        <Card>
          <SectionTitle>Groups affected</SectionTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {groups.map((g) => { const on = d.groups.includes(g); return <Pressable key={g} onPress={() => setD('groups', on ? d.groups.filter((x) => x !== g) : [...d.groups, g])} style={chipStyle(on)}><Text style={{ fontSize: 12, color: on ? live.brand1Text : base.ink }}>{g}</Text></Pressable>; })}
          </View>
          <Pressable onPress={async () => { const v = await promptText('Group affected', ''); if (v && v.trim() && !d.groups.includes(v.trim())) setD('groups', [...d.groups, v.trim()]); }} style={{ marginTop: 8 }}><Text style={{ color: base.blue, fontWeight: '600' }}>+ Add group</Text></Pressable>
        </Card>
        <Card>
          <SectionTitle>Required PPE</SectionTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {RAMS_PPE.map((p) => { const on = b.ppe.includes(p.key); return <Pressable key={p.key} onPress={() => change((x) => ({ ...x, ppe: on ? x.ppe.filter((k) => k !== p.key) : [...x.ppe, p.key] }))} style={chipStyle(on)}><Text style={{ fontSize: 12, color: on ? live.brand1Text : base.ink }}>{p.icon} {p.label}</Text></Pressable>; })}
          </View>
        </Card>
        <Check label="Include the Dynamic Risk Assessment page" value={d.includeDynamic !== false} onChange={(v) => setD('includeDynamic', v)} />
        <Muted style={{ marginTop: 8 }}><Text style={{ color: '#C0392B' }}>*</Text> Required</Muted>
        {next('details')}
      </>
    );
  };
  const hazards = () => (
    <>
      <Muted style={{ marginBottom: 10 }}>Each hazard is its own item. P = probability, S = severity, RR = P × S. Pre-control on the left, residual (after controls) on the right.</Muted>
      {b.hazards.length ? b.hazards.map((h, i) => editId === h.id ? (
        <Card key={h.id} style={{ borderColor: base.ink }}>
          <Muted style={{ fontWeight: '600' }}>Hazard</Muted>
          <TextInput value={h.title} onChangeText={(t) => setH(h.id, { title: t })} style={box} autoFocus={!h.title} />
          <Muted style={{ fontWeight: '600' }}>Harm / who could be hurt and how</Muted>
          <TextInput value={h.harm} onChangeText={(t) => setH(h.id, { harm: t })} style={box} />
          {([['Before controls', 'p', 's'], ['Residual (after controls)', 'rp', 'rs']] as const).map(([l, pk, sk]) => (
            <View key={l} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <Text style={{ width: 150, fontWeight: '600', color: base.ink }}>{l}</Text>
              <Pressable onPress={() => void pick('Probability', P_LABELS, h[pk], (n) => setH(h.id, { [pk]: n }))} style={[box, { marginBottom: 0 }]}><Text style={{ color: base.ink }}>P {h[pk]}</Text></Pressable>
              <Pressable onPress={() => void pick('Severity', S_LABELS, h[sk], (n) => setH(h.id, { [sk]: n }))} style={[box, { marginBottom: 0 }]}><Text style={{ color: base.ink }}>S {h[sk]}</Text></Pressable>
              <Badge p={h[pk]} s={h[sk]} />
            </View>
          ))}
          <Muted style={{ fontWeight: '600' }}>Control Measures</Muted>
          <NumberedLines value={h.controls} onChange={(v) => setH(h.id, { controls: v })} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 2 }}><Button oneLine textSize={13} title="Done" onPress={() => { setEditId(null); void saveNow(); }} /></View>
            <View style={{ flex: 1 }}><Button kind="ghost" oneLine textSize={12} title="Save To Library" onPress={() => void toLibrary('hazard', h)} /></View>
          </View>
        </Card>
      ) : (
        <Card key={h.id}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
            <Text style={{ fontWeight: '600', color: base.slate, width: 20 }}>{i + 1}</Text>
            <View style={{ flex: 1 }}><Text style={{ fontWeight: '600', color: base.ink }}>{h.title || 'Untitled hazard'}</Text>{!!h.harm && <Muted>{h.harm}</Muted>}</View>
            <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}><Badge p={h.p} s={h.s} /><Text>→</Text><Badge p={h.rp} s={h.rs} /></View>
          </View>
          {h.controls.slice(0, 3).map((c, k) => <Muted key={k}>• {c}</Muted>)}
          {h.controls.length > 3 && <Pressable onPress={() => setEditId(h.id)}><Text style={{ color: base.blue }}>+ {h.controls.length - 3} more control{h.controls.length - 3 > 1 ? 's' : ''}</Text></Pressable>}
          {tools('hazards', h, i, b.hazards.length)}
        </Card>
      )) : <Empty>No hazards yet.</Empty>}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
        <View style={{ flex: 1 }}><Button oneLine textSize={13} title="+ Add From Library" onPress={() => setPicker({ kind: 'hazard', part: null })} /></View>
        <View style={{ flex: 1 }}><Button kind="ghost" oneLine textSize={13} title="+ New Hazard" onPress={() => { const h: Hazard = { id: ramsUid(), title: '', harm: '', p: 3, s: 3, rp: 1, rs: 3, controls: [] }; change((x) => ({ ...x, hazards: [...x.hazards, h] })); setEditId(h.id); }} /></View>
      </View>
      {next('ra')}
    </>
  );
  const sections = (part: 'general' | 'method') => {
    const list = b.sections.filter((s) => (s.part === 'method') === (part === 'method')), isM = part === 'method';
    return (
      <>
        <Muted style={{ marginBottom: 10 }}>{isM ? 'The step-by-step method statements — each is its own section. They print after the safe systems of work in the Method Statement document.' : 'Safe systems of work (general precautions) — each is its own section. They print first in the Method Statement document.'}</Muted>
        {list.length ? list.map((s, i) => editId === s.id ? (
          <Card key={s.id} style={{ borderColor: base.ink }}>
            {/* What's being filled in, and no switch between the two kinds: moving a section to the other tab mid-edit broke the
                builder (Andy, 4 Nov 2026). A section stays on the tab it was made on. */}
            <Text style={{ fontSize: 15, fontWeight: '600', color: base.ink, marginBottom: 8 }}>{isM ? 'Method Statement' : 'Safe System Of Work'}</Text>
            <Muted style={{ fontWeight: '600' }}>Heading</Muted>
            <TextInput value={s.title} onChangeText={(t) => setS(s.id, { title: t })} style={box} autoFocus={!s.title} />
            {/* No text box any more, just the numbered points (Andy, 4 Nov 2026). Older sections that already have text keep the
                box so it can still be edited, as it prints. */}
            {!!s.body && <><Muted style={{ fontWeight: '600' }}>Text</Muted><TextInput value={s.body} onChangeText={(t) => setS(s.id, { body: t })} multiline style={[box, { minHeight: 70 }]} /></>}
            <Muted style={{ fontWeight: '600' }}>Steps</Muted>
            <NumberedLines value={s.steps} onChange={(v) => setS(s.id, { steps: v })} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 2 }}><Button oneLine textSize={13} title="Done" onPress={() => { setEditId(null); void saveNow(); }} /></View>
              <View style={{ flex: 1 }}><Button kind="ghost" oneLine textSize={12} title="Save To Library" onPress={() => void toLibrary('section', s)} /></View>
            </View>
          </Card>
        ) : (
          <Card key={s.id}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Text style={{ fontWeight: '600', color: base.slate, width: 20 }}>{i + 1}</Text>
              <View style={{ flex: 1 }}><Text style={{ fontWeight: '600', color: base.ink }}>{s.title || 'Untitled section'}</Text>{!!s.body && <Text numberOfLines={3} style={{ color: base.slate }}>{s.body}</Text>}</View>
            </View>
            {s.steps.slice(0, 3).map((c, k) => <Muted key={k}>{k + 1}. {c}</Muted>)}
            {s.steps.length > 3 && <Pressable onPress={() => setEditId(s.id)}><Text style={{ color: base.blue }}>+ {s.steps.length - 3} more</Text></Pressable>}
            {tools('sections', s, i, list.length)}
          </Card>
        )) : <Empty>None yet.</Empty>}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <View style={{ flex: 1 }}><Button oneLine textSize={13} title="+ Add From Library" onPress={() => setPicker({ kind: 'section', part })} /></View>
          <View style={{ flex: 1 }}><Button kind="ghost" oneLine textSize={13} title={`+ New ${isM ? 'Method Statement' : 'Safe System'}`} onPress={() => { const s: RSection = { id: ramsUid(), part, title: '', body: '', steps: [] }; change((x) => ({ ...x, sections: [...x.sections, s] })); setEditId(s.id); }} /></View>
        </View>
        {next(isM ? 'ms' : 'ssow')}
      </>
    );
  };
  const preview = async (which: 'ra' | 'ms') => {
    if (timer.current) await saveNow();
    toast('Building PDF…');
    try { const out = await previewPdf(latest.current, which, org as never); await showPdf(out.bytes, `${which === 'ra' ? 'Risk Assessment' : 'Method Statement'} - ${b.title}.pdf`.replace(/[\\/:*?"<>|]+/g, '-')); }
    catch (e) { showAlert(`Could not build the PDF: ${(e as Error).message}`); }
  };
  const issue = async () => {
    await saveNow();
    const x = latest.current;
    if (!x.hazards.length && !x.sections.length) { toast('Add some hazards or sections first'); return; }
    if (x.ra_doc_id && !x.hazards.length) { showAlert(x.status === 'issued' ? 'This RAMS already has a Risk Assessment, but it now has no hazards. Add the hazards back on the RA tab before re-issuing — otherwise everyone keeps signing the old Risk Assessment.' : 'This RAMS supersedes a Risk Assessment, but it has no hazards. Add them on the RA tab first — otherwise everyone keeps signing the old Risk Assessment.'); return; }
    if (x.ms_doc_id && !x.sections.length) { showAlert(x.status === 'issued' ? 'This RAMS already has a Method Statement, but it now has no sections. Add them back on the SSOW or MS tab before re-issuing — otherwise everyone keeps signing the old Method Statement.' : 'This RAMS supersedes a Method Statement, but it has no sections. Add them on the SSOW or MS tab first — otherwise everyone keeps signing the old Method Statement.'); return; }
    const miss = missingInfo(x.details);
    if (miss.length) { toast(`Fill in ${miss.join(' and ')} on the Info tab first`); void go('details'); return; }
    const reissue = x.status === 'issued';
    if (!(await confirmAsk(reissue ? `Re-issue "${x.title}" as revision ${x.revision + 1}?\n\nThe current Risk Assessment and Method Statement are marked superseded and everyone on the job is asked to sign the new versions.` : `Issue "${x.title}"?\n\nThis adds a Risk Assessment and a Method Statement to this job's RAMS for operatives to sign.${x.ra_doc_id || x.ms_doc_id ? ' The RAMS it supersedes is marked superseded.' : ''}`, reissue ? 'Re-issue' : 'Issue', 'No', true))) return;
    setBusy(true); toast('Building documents…');
    try {
      const err = await issueBuild(me, org as never, siteId, x);
      if (err) { showAlert(err); return; }
      ['ramsBuilds', 'hsDocs', 'hs'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
      void qc.invalidateQueries();
      toast(reissue ? 'Re-issued — everyone will be asked to sign again' : 'Issued — operatives can now sign');
      router.back();
    } catch (e) { showAlert(`Could not issue: ${(e as Error).message}`); }
    finally { setBusy(false); }
  };
  // ----- AI writer (Andy, 4 Nov 2026) -----
  const aiN = b.hazards.filter((h) => h.ai).length + b.sections.filter((x) => x.ai).length;
  const writeAi = async (tasks: string) => {
    if (!(await askAiCharge())) return;
    setAiBusy(true);
    try {
      const d = await aiDraft(tasks, site, latest.current);
      if (typeof d === 'string') { showAlert(d); return; }
      change((x) => mergeAiDraft(x, d));
      setAiOpen(false);
      toast(`✨ Added ${d.hazards.length} hazards and ${d.sections.length} sections — check them before issuing`);
    } finally { setAiBusy(false); }
  };
  // Each AI draft is a paid call, so writing is for admins; anyone can save what's there to the library.
  const aiCan = isCompanyAdmin(me);
  const aiBanner = () => (!aiCan && !aiN ? null :
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: aiN ? '#E9D8FD' : base.line, backgroundColor: aiN ? '#FAF5FF' : base.card }}>
      <Text style={{ flex: 1, minWidth: 200, fontSize: 13, color: aiN ? '#553C9A' : base.slate }}>{aiN ? `✨ ${aiN} item${aiN === 1 ? '' : 's'} written by AI. Check every line before issuing. Save them to the library to use on other jobs.` : 'Work not in the templates? Describe it and let the AI write it.'}</Text>
      {aiN > 0 && <Button small kind="ghost" title="⭳ Save AI Items To Library" onPress={async () => {
        if (timer.current) await saveNow();
        const r = await aiToLibrary(me, latest.current);
        change(() => r.b); void qc.invalidateQueries({ queryKey: ['ramsLib'] });
        toast(r.n ? `${r.n} saved to the library` : 'Nothing new to save — those headings are already in the library');
      }} />}
      {aiCan && <Button small title="✨ Write With AI" onPress={() => setAiOpen(true)} />}
    </View>
  );
  const issueTab = () => (
    <>
      <Card>
        <SectionTitle>Issue to this job</SectionTitle>
        <Muted style={{ marginBottom: 10 }}>Creates two documents in this job&apos;s RAMS list — Risk Assessment ({b.hazards.length} hazards) and Method Statement ({b.sections.length} sections) — each with a sign-off sheet that operatives sign in the app, exactly like an uploaded RAMS.{b.status === 'issued' ? ' Re-issuing replaces the current versions and everyone is asked to sign again.' : b.ra_doc_id || b.ms_doc_id ? ' It supersedes the RAMS you chose when you created it, and everyone is asked to sign the new one.' : ''}</Muted>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><Button kind="ghost" oneLine textSize={13} title="👁 Preview RA" onPress={() => void preview('ra')} /></View>
          <View style={{ flex: 1 }}><Button kind="ghost" oneLine textSize={13} title="👁 Preview MS" onPress={() => void preview('ms')} /></View>
        </View>
        <View style={{ marginTop: 10 }}><Button busy={busy} title={b.status === 'issued' ? `↻ Re-issue (rev ${b.revision + 1})` : '✓ Issue Risk Assessment & Method Statement'} onPress={() => void issue()} /></View>
      </Card>
      {/* One compact row (Andy, 14 Nov 2026): what it does on the left, a small button on the right. */}
      <Card style={{ paddingVertical: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontWeight: '600', color: base.ink }}>Reuse</Text>
            <Muted style={{ fontSize: 12.5 }}>Save it as a template for future jobs.</Muted>
          </View>
          <View><Button small oneLine kind="ghost" title="📋 Save As Template" onPress={async () => {
            const n = await promptText('Template name', b.title); if (!n || !n.trim()) return;
            const ok = await saveAsTemplate(me, latest.current, n.trim());
            toast(ok ? `✓ Template "${n.trim()}" saved` : 'Could not save the template — try again.', { confirm: true });
            void qc.invalidateQueries({ queryKey: ['ramsLib'] });
          }} /></View>
        </View>
      </Card>
      <Muted style={{ marginBottom: 10 }}>Company address, phone and data protection text come from Admin Centre → RAMS Library → Company Details.</Muted>
      <Button kind="ghost" title="Delete this RAMS draft" onPress={async () => {
        if (!(await confirmAsk(`Delete "${b.title}"?${b.status === 'issued' ? '\n\nThe issued documents stay in the RAMS list — only this editable copy is deleted.' : ''}`, 'Delete'))) return;
        if (timer.current) { clearTimeout(timer.current); timer.current = null; }
        if (await deleteBuild(b.id)) { void qc.invalidateQueries({ queryKey: ['ramsBuilds', siteId] }); router.back(); } else toast('Could not delete — try again.');
      }} />
    </>
  );

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'RAMS Builder' }} />
      <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
        <TextInput value={b.title} onChangeText={(t) => change((x) => ({ ...x, title: t }))} style={[box, { fontSize: 17, fontWeight: '600' }]} />
        <Muted style={{ marginBottom: 8 }}>{saveState}</Muted>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }} contentContainerStyle={{ gap: 6 }}>
          {tabs.map(([k, l]) => <Pressable key={k} onPress={() => void go(k)} style={chipStyle(tab === k)}><Text style={{ fontWeight: '600', fontSize: 13, color: tab === k ? live.brand1Text : base.ink }}>{l}</Text></Pressable>)}
        </ScrollView>
        {aiBanner()}
        {tab === 'details' ? details() : tab === 'ra' ? hazards() : tab === 'ssow' ? sections('general') : tab === 'ms' ? sections('method') : issueTab()}
      </ScrollView>
      {aiOpen && <RamsAiPopup busy={aiBusy} onClose={() => { if (!aiBusy) setAiOpen(false); }} onWrite={(t) => void writeAi(t)} />}
      {picker && <Picker kind={picker.kind} part={picker.part} have={picker.kind === 'hazard' ? b.hazards : b.sections} onClose={() => setPicker(null)} onNew={(title) => {
        // Not in the library: start a new one with what was searched for, on this RAMS only.
        if (picker.kind === 'hazard') { const h: Hazard = { id: ramsUid(), title, harm: '', p: 3, s: 3, rp: 1, rs: 3, controls: [] }; change((x) => ({ ...x, hazards: [...x.hazards, h] })); setEditId(h.id); }
        else { const n: RSection = { id: ramsUid(), part: picker.part || 'method', title, body: '', steps: [] }; change((x) => ({ ...x, sections: [...x.sections, n] })); setEditId(n.id); }
        setPicker(null);
      }} onAdd={(items) => {
        change((x) => picker.kind === 'hazard' ? { ...x, hazards: [...x.hazards, ...items.map(hazardFromLib)] } : { ...x, sections: [...x.sections, ...items.map(sectionFromLib)] });
        setPicker(null); toast(`${items.length} added`);
      }} />}
    </View>
  );
}


/** Library picker (multi-tick, select all, search; items already in this RAMS listed last). */
function Picker({ kind, part, have, onClose, onNew, onAdd }: { kind: 'hazard' | 'section'; part: 'general' | 'method' | null; have: (Hazard | RSection)[]; onClose: () => void; onNew: (title: string) => void; onAdd: (items: import('@/lib/rules/rams').LibItem[]) => void }) {
  const { me } = useAuth();
  const { data: libAll, isLoading } = useLibrary(me?.org_id);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string[]>([]);
  const lib = (libAll || []).filter((i) => i.kind === kind && (!part || (((i.data || {}).part === 'method') ? 'method' : 'general') === part));
  const ids = new Set(have.map((x) => x.libId).filter(Boolean)), titles = new Set(have.map((x) => String(x.title || '').trim().toLowerCase()));
  const used = (i: (typeof lib)[number]) => ids.has(i.id) || titles.has(i.title.trim().toLowerCase());
  const hit = (i: (typeof lib)[number]) => !q.trim() || i.title.toLowerCase().includes(q.trim().toLowerCase());
  const fresh = lib.filter((i) => !used(i) && hit(i)), added = lib.filter((i) => used(i) && hit(i));
  const label = kind === 'hazard' ? 'hazards' : part === 'method' ? 'method statements' : 'safe systems of work';
  const row = (i: (typeof lib)[number]) => (
    <View key={i.id} style={{ opacity: used(i) ? 0.6 : 1 }}>
      <Check label={`${i.title}${kind === 'hazard' ? (i.data?.harm ? ` — ${String(i.data.harm)}` : '') : ''}`} value={sel.includes(i.id)} onChange={(v) => setSel(v ? [...sel, i.id] : sel.filter((x) => x !== i.id))} />
    </View>
  );
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 16 }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: base.card, borderRadius: 14, padding: 14, maxHeight: '85%', maxWidth: 640, width: '100%', alignSelf: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 }}>
            <Text style={{ flex: 1, fontWeight: '600', fontSize: 16, color: base.ink,  }}>Add {label} from the library</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} style={{ paddingLeft: 10 }}><Text style={{ fontSize: 18, color: base.slate, fontWeight: '600' }}>✕</Text></Pressable>
          </View>
          <TextInput value={q} onChangeText={setQ} placeholder="Search…" style={box} />
          {fresh.length > 1 && <Check label={`Select all (${fresh.length})`} value={fresh.every((i) => sel.includes(i.id))} onChange={(v) => setSel(v ? Array.from(new Set([...sel, ...fresh.map((i) => i.id)])) : sel.filter((x) => !fresh.some((i) => i.id === x)))} />}
          <ScrollView style={{ flexGrow: 0 }}>
            {isLoading ? <Muted>Loading…</Muted> : null}
            {fresh.map(row)}
            {added.length > 0 && <Muted style={{ marginTop: 10, fontWeight: '600' }}>Already added to this RAMS ({added.length})</Muted>}
            {added.map(row)}
            {!isLoading && !fresh.length && !added.length && <Empty>{(libAll || []).length ? 'Nothing matches.' : 'The library is empty — load the starter library in Admin Centre › RAMS Library.'}</Empty>}
          </ScrollView>
          <View style={{ marginTop: 8 }}><Button small kind="ghost" title={q.trim() ? `Not listed? Write new: ${q.trim()}` : 'Not listed? Write a new one'} onPress={() => onNew(q.trim())} /></View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <View style={{ flex: 2 }}><Button oneLine textSize={13} title={`Add ${sel.length || ''} Selected`} onPress={() => { const items = lib.filter((i) => sel.includes(i.id)); if (!items.length) return; onAdd(items); }} /></View>
            <View style={{ flex: 1 }}><Button kind="ghost" oneLine textSize={13} title="Cancel" onPress={onClose} /></View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
