// Report template editor (420 renderTemplateEditor). Name and description;
// where it's used (report, Daily Briefing, Main Contractor or LOLER inspection);
// the traffic-light key; your own answer types; sections of questions — each
// with its answer type, answers to pick from, follow-up questions, and More
// options (must be answered, traffic light, note, photo and when it's required,
// scoring, auto-fill, only show if…); "show unanswered questions"; Save.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { chooseAction, confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Check, Muted, Toggle } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { itemHasTraffic, pfLbl, templateShowsUnanswered, trafficHex, trafficLevels, type TrafficLevel } from '@/lib/rules/reports';
import {
  addFollowUp, applyAnswerSets, AUTOFILL_OPTIONS, cleanAnswerSets, cleanForSave, dependents, FIELD_TYPES, followUpValues, hasFixedOptions, moveItem, newItem, NO_EXTRAS,
  ownValueOptions, removeItem, removeSection, setType, TRAFFIC_COLOURS, trafficDefaultLevels, triggerCandidates, triggerOptions, typeKey, uid, type AnswerSet, type Item, type Section,
} from '@/lib/rules/templates';
import { isManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import { base, radius, space } from '@/theme/theme';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
type Tpl = { id: string; name: string; description: string | null; sections: Section[]; is_daily_briefing: boolean; is_mc_inspection: boolean; is_loler_inspection: boolean };
const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 9, color: base.ink, backgroundColor: base.card };
const small = { width: 34, height: 34, borderRadius: 8, borderWidth: 1, borderColor: base.line, alignItems: 'center' as const, justifyContent: 'center' as const };

export default function TemplateEditor() {
  const { tpl: id } = useLocalSearchParams<{ tpl: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: loaded } = useQuery({ queryKey: ['reportTplEdit', id], enabled: !!id, queryFn: async () => ((await db.from('report_templates').select('*').eq('id', id).maybeSingle()).data as Tpl | null) });
  const { data: orgSets, refetch: refetchSets } = useQuery({ queryKey: ['answerSets', me?.org_id], enabled: !!me, queryFn: async () => (((await db.from('organizations').select('report_answer_sets').eq('id', me?.org_id as string).maybeSingle()).data as { report_answer_sets: AnswerSet[] | null } | null)?.report_answer_sets) ?? [] });
  const [t, setT] = useState<Tpl | null>(null);
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());
  const [usedOpen, setUsedOpen] = useState(false), [trafficOpen, setTrafficOpen] = useState(false);
  const [setsDraft, setSetsDraft] = useState<AnswerSet[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (loaded && !t) setT({ ...loaded, sections: loaded.sections?.length ? JSON.parse(JSON.stringify(loaded.sections)) : [{ id: uid(), title: 'Section 1', items: [] }] });
  }, [loaded, t]);
  if (!me) return null;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  if (!t) return <Muted style={{ padding: space.l }}>{loaded === null ? 'Template not found.' : 'Loading…'}</Muted>;
  const sets = orgSets ?? [];
  const secs = t.sections;
  const setSecs = (s: Section[]) => setT({ ...t, sections: s });
  const setItems = (si: number, items: Item[]) => setSecs(secs.map((s, i) => (i === si ? { ...s, items } : s)));
  const patchItem = (si: number, ii: number, p: Partial<Item>) => setItems(si, secs[si].items.map((x, j) => (j === ii ? { ...x, ...p } : x)));
  const tr = secs[0].traffic || { on: false, levels: [] as TrafficLevel[] };
  const setTraffic = (n: { on?: boolean; levels?: TrafficLevel[] }) => setSecs(secs.map((s, i) => (i === 0 ? { ...s, traffic: { ...tr, ...n } } : s)));
  const levels = trafficLevels(secs);

  const pickType = async (si: number, ii: number) => {
    const it = secs[si].items[ii];
    const k = await chooseAction('Kind of answer', [
      ...FIELD_TYPES.map((f) => ({ key: f.k, label: f.lbl })),
      ...sets.map((a) => ({ key: `set:${a.id}`, label: `${a.name || 'Untitled'} (${(a.options || []).join(' / ')})` })),
      { key: '__manage__', label: '✏️ Add / edit your own answer types…' },
    ]);
    if (!k) return;
    if (k === '__manage__') { setSetsDraft(JSON.parse(JSON.stringify(sets))); return; }
    patchItem(si, ii, setType(it, k, sets));
  };
  const remove = async (si: number, ii: number) => {
    const items = secs[si].items, gone = items[ii];
    const deps = dependents(items, gone.id);
    if (deps.size) {
      const n = deps.size;
      const k = await chooseAction(`"${gone.label || 'This question'}" has ${n} follow-up question${n > 1 ? 's' : ''} that only show${n > 1 ? '' : 's'} depending on its answer.`, [{ key: 'all', label: `Remove ${n > 1 ? 'them' : 'it'} as well`, danger: true }, { key: 'keep', label: `Keep ${n > 1 ? 'them' : 'it'} (${n > 1 ? 'they' : 'it'} will always show)` }]);
      if (!k) return;
      setItems(si, removeItem(items, gone.id, k === 'all'));
    } else setItems(si, removeItem(items, gone.id, false));
  };
  const typeLabel = (it: Item) => { const k = typeKey(it, sets); return k.startsWith('set:') ? sets.find((a) => `set:${a.id}` === k)?.name || 'Your answer type' : FIELD_TYPES.find((f) => f.k === k)?.lbl || k; };

  const itemEditor = (si: number, ii: number, it: Item) => {
    const items = secs[si].items, parent = it.showIf?.qId ? items.find((c) => c.id === it.showIf?.qId) : null;
    const open = openItems.has(it.id), fu = followUpValues(it);
    const usedSet = it.presetId && (it.type === 'choice' || it.type === 'multichoice') && sets.some((a) => a.id === it.presetId);
    const isYnnv = it.type === 'choice' && it.presetId === 'builtin_ynnv';
    const tags = [it.required && 'Required', it.scored && 'Scored', it.showIf && 'Only shows sometimes', it.autofill && 'Auto-filled', !NO_EXTRAS.includes(it.type) && it.allowNote !== false && 'Notes allowed', itemHasTraffic(secs, it) && 'Traffic light'].filter(Boolean);
    const cands = triggerCandidates(items, ii), trig = it.showIf ? cands.find((c) => c.id === it.showIf?.qId) : null;
    const own = ownValueOptions(it);
    return (
      <View key={it.id} style={{ borderWidth: 1.5, borderColor: parent ? base.blue : base.line, borderRadius: 12, padding: 10, marginBottom: 8, marginLeft: parent ? 16 : 0, backgroundColor: base.card }}>
        {!!parent && <Text style={{ fontWeight: '700', color: base.ink, fontSize: 12, marginBottom: 6 }}>↳ Only asked if “{parent.label || 'the question above'}” {it.showIf?.mode === 'notblank' ? 'is answered' : (it.showIf?.values || []).length ? `is ${(it.showIf?.values || []).map((v) => pfLbl(parent, String(v))).join(' or ')}` : 'is… (pick the answer in More options)'}</Text>}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <Text style={{ fontWeight: '800', color: base.slate, minWidth: 18 }}>{ii + 1}.</Text>
          <TextInput value={it.label || ''} onChangeText={(v) => patchItem(si, ii, { label: v })} placeholder={it.type === 'instruction' ? 'Text to show' : it.type === 'textarea' ? 'Heading for the notes box, e.g. Notes' : 'Type the question'} style={[box, { flex: 1 }]} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Pressable onPress={() => void pickType(si, ii)} style={[box, { flex: 1, paddingVertical: 10 }]}><Text style={{ color: base.ink }} numberOfLines={1}>▼ {typeLabel(it)}</Text></Pressable>
          <Pressable disabled={ii === 0} onPress={() => { const r = moveItem(items, ii, -1); if (r === 'blocked') toast('A follow-up question has to stay below the question it depends on.'); else if (r) setItems(si, r); }} style={[small, { opacity: ii === 0 ? 0.35 : 1 }]}><Text>▲</Text></Pressable>
          <Pressable disabled={ii >= items.length - 1} onPress={() => { const r = moveItem(items, ii, 1); if (r === 'blocked') toast('A follow-up question has to stay below the question it depends on.'); else if (r) setItems(si, r); }} style={[small, { opacity: ii >= items.length - 1 ? 0.35 : 1 }]}><Text>▼</Text></Pressable>
          <Pressable onPress={() => void remove(si, ii)} style={small}><Text style={{ color: base.warn }}>✕</Text></Pressable>
        </View>
        {(it.type === 'choice' || it.type === 'multichoice') && !isYnnv && (
          <View style={{ marginTop: 8, padding: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: base.line, borderRadius: 10 }}>
            <Muted style={{ fontWeight: '700', marginBottom: 4 }}>Answers to pick from{it.type === 'multichoice' ? ' (more than one can be ticked)' : ''}{usedSet ? ' — from your answer type' : ''}</Muted>
            {(it.options || []).map((o, oi) => (
              <View key={oi} style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
                <TextInput value={o} onChangeText={(v) => patchItem(si, ii, { options: (it.options || []).map((x, k) => (k === oi ? v : x)) })} placeholder={`Answer ${oi + 1}`} style={[box, { flex: 1 }]} />
                <Pressable onPress={() => patchItem(si, ii, { options: (it.options || []).filter((_, k) => k !== oi) })} style={small}><Text style={{ color: base.warn }}>✕</Text></Pressable>
              </View>
            ))}
            <Pressable onPress={() => patchItem(si, ii, { options: [...(it.options || []), ''] })}><Text style={{ color: base.blue }}>+ Add answer</Text></Pressable>
          </View>
        )}
        {fu.length > 0 && (
          <View style={{ marginTop: 8 }}>
            <Muted style={{ fontWeight: '700', marginBottom: 4 }}>Ask a follow-up question if the answer is…</Muted>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {fu.map((v) => <Pressable key={v} onPress={() => setItems(si, addFollowUp(items, ii, v).items)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: base.line }}><Text style={{ fontSize: 12, color: base.ink }}>+ {pfLbl(it, v)}</Text></Pressable>)}
            </View>
          </View>
        )}
        {it.type !== 'instruction' && (
          <>
            <Pressable onPress={() => setOpenItems((s) => { const n = new Set(s); if (n.has(it.id)) n.delete(it.id); else n.add(it.id); return n; })} style={{ flexDirection: 'row', marginTop: 8 }}>
              <Text style={{ color: base.blue }}>{open ? '▼ Hide options' : '▶ More options'}</Text>
              {!open && !!tags.length && <Muted style={{ flex: 1, textAlign: 'right' }} >{tags.join(' · ')}</Muted>}
            </Pressable>
            {open && (
              <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: base.line }}>
                <Check label="Must be answered" value={!!it.required} onChange={(v) => patchItem(si, ii, { required: v })} />
                {!!levels && !NO_EXTRAS.includes(it.type) && <Check label="Show the traffic light on this question" value={it.traffic !== false} onChange={(v) => patchItem(si, ii, { traffic: v })} />}
                {!NO_EXTRAS.includes(it.type) && <Check label="Allow a note" value={it.allowNote !== false} onChange={(v) => patchItem(si, ii, { allowNote: v })} />}
                {it.type !== 'photo' && it.type !== 'signature' && !it.autofill && (
                  <>
                    <Check label="Let a photo be added to this answer" value={it.allowMedia !== false} onChange={(v) => patchItem(si, ii, { allowMedia: v, ...(v ? {} : { mediaRequiredWhen: [] }) })} />
                    {it.allowMedia !== false && (own ? (
                      <View style={{ marginLeft: 8 }}>
                        <Muted style={{ fontWeight: '700' }}>Require the photo when the answer is…</Muted>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                          {own.map((o) => <Check key={String(o)} label={typeof o === 'boolean' ? (o ? 'Yes' : 'No') : pfLbl(it, String(o))} value={(it.mediaRequiredWhen || []).includes(o)} onChange={(v) => patchItem(si, ii, { mediaRequiredWhen: v ? [...(it.mediaRequiredWhen || []), o] : (it.mediaRequiredWhen || []).filter((x) => x !== o) })} />)}
                        </View>
                      </View>
                    ) : <Check label="Photo required whenever this is answered" value={(it.mediaRequiredWhen || []).includes('__always__')} onChange={(v) => patchItem(si, ii, { mediaRequiredWhen: v ? ['__always__'] : [] })} />)}
                  </>
                )}
                {(it.type === 'passfail' || it.type === 'checkbox') && <Check label={`Count towards score${it.type === 'passfail' ? (it.pfWords ? ' (Pass = 1 point, N/A excluded)' : ' (Yes = 1 point, N/A excluded)') : ' (Yes = 1 point)'}`} value={!!it.scored} onChange={(v) => patchItem(si, ii, { scored: v })} />}
                {(it.type === 'text' || it.type === 'date') && (
                  <Pressable onPress={async () => { const k = await chooseAction('Fill in automatically with', AUTOFILL_OPTIONS.filter((o) => !o.k || o.types.includes(it.type)).map((o) => ({ key: o.k || '__none', label: o.lbl }))); if (k) patchItem(si, ii, { autofill: k === '__none' ? undefined : k }); }} style={[box, { marginTop: 6 }]}>
                    <Text style={{ color: base.ink }}>▼ Fill in automatically with: {AUTOFILL_OPTIONS.find((o) => o.k === (it.autofill || ''))?.lbl || 'None'}</Text>
                  </Pressable>
                )}
                {(cands.length > 0 || !!it.showIf) && (
                  <View style={{ marginTop: 8 }}>
                    <Muted style={{ fontWeight: '700' }}>Only show this question if…</Muted>
                    <Pressable onPress={async () => {
                      const k = await chooseAction('Only show this question if…', [{ key: '__always', label: 'Always show' }, ...cands.map((c) => ({ key: c.id, label: c.label || '(untitled question)' }))]);
                      if (!k) return;
                      if (k === '__always') { patchItem(si, ii, { showIf: undefined }); return; }
                      const c = cands.find((x) => x.id === k);
                      patchItem(si, ii, { showIf: { qId: k, mode: c && hasFixedOptions(c) ? 'equals' : 'notblank', values: [] } });
                    }} style={box}><Text style={{ color: base.ink }}>▼ {trig ? trig.label || '(untitled question)' : 'Always show'}</Text></Pressable>
                    {!!it.showIf && !!trig && (
                      <>
                        <Pressable onPress={async () => {
                          const k = await chooseAction('Condition', [{ key: 'notblank', label: "…isn't left blank (any answer given)" }, ...(hasFixedOptions(trig) ? [{ key: 'equals', label: '…equals a specific answer' }] : [])]);
                          if (k) patchItem(si, ii, { showIf: { ...it.showIf, mode: k, values: k === 'notblank' ? [] : it.showIf?.values || [] } });
                        }} style={[box, { marginTop: 6 }]}><Text style={{ color: base.ink }}>▼ {it.showIf.mode === 'notblank' ? "…isn't left blank" : '…equals a specific answer'}</Text></Pressable>
                        {it.showIf.mode !== 'notblank' && hasFixedOptions(trig) && (
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                            {triggerOptions(trig).map((o) => <Check key={o} label={pfLbl(trig, o)} value={(it.showIf?.values || []).includes(o)} onChange={(v) => patchItem(si, ii, { showIf: { ...it.showIf, values: v ? [...(it.showIf?.values || []), o] : (it.showIf?.values || []).filter((x) => x !== o) } })} />)}
                          </View>
                        )}
                      </>
                    )}
                  </View>
                )}
              </View>
            )}
          </>
        )}
      </View>
    );
  };

  const save = async () => {
    if (!t.name.trim()) { toast('Give the template a name.'); return; }
    setBusy(true);
    const ok = !(await db.from('report_templates').update({ name: t.name.trim(), description: t.description || null, sections: cleanForSave(secs), is_daily_briefing: !!t.is_daily_briefing, is_mc_inspection: !!t.is_mc_inspection, is_loler_inspection: !!t.is_loler_inspection, updated_at: new Date().toISOString() } as never).eq('id', t.id)).error;
    setBusy(false);
    if (!ok) { toast('Could not save — try again.'); return; }
    toast('Template saved');
    void qc.invalidateQueries({ queryKey: ['reportTplAdmin'] }); void qc.invalidateQueries({ queryKey: ['templates'] }); void qc.invalidateQueries({ queryKey: ['reportTplEdit', id] });
    router.back();
  };

  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Edit Template' }} />
      <Muted style={{ fontWeight: '700' }}>Template Name</Muted>
      <TextInput value={t.name} onChangeText={(v) => setT({ ...t, name: v })} style={[box, { marginBottom: 8 }]} />
      <Muted style={{ fontWeight: '700' }}>Description (optional)</Muted>
      <TextInput value={t.description || ''} onChangeText={(v) => setT({ ...t, description: v })} multiline style={[box, { minHeight: 56, marginBottom: 10 }]} />

      <Toggle title={`Where this template is used · ${t.is_daily_briefing ? 'Daily Briefing' : t.is_mc_inspection ? 'Main Contractor inspection' : t.is_loler_inspection ? 'LOLER inspection' : 'Reports'}`} open={usedOpen} onPress={() => setUsedOpen(!usedOpen)} />
      {usedOpen && (
        <Card>
          <Muted style={{ marginBottom: 8 }}>Leave all three unticked for a normal report or survey.</Muted>
          <Check label="Use as a Daily Briefing template (Health & Safety › Daily Briefings)" value={!!t.is_daily_briefing} onChange={(v) => setT({ ...t, is_daily_briefing: v })} />
          <Check label="Use as a Main Contractor Inspection template (Main Contractor › Inspections)" value={!!t.is_mc_inspection} onChange={(v) => setT({ ...t, is_mc_inspection: v })} />
          <Check label="Use as a LOLER Inspection template (Health & Safety › LOLER, can be linked to plant)" value={!!t.is_loler_inspection} onChange={(v) => setT({ ...t, is_loler_inspection: v })} />
        </Card>
      )}

      <Toggle title={`Traffic light system · ${levels ? `On — ${levels.length} colours` : 'Off'}`} open={trafficOpen} onPress={() => setTrafficOpen(!trafficOpen)} />
      {trafficOpen && (
        <Card>
          <Check label="Use a traffic light system on this template" value={!!tr.on} onChange={(v) => setTraffic({ on: v, ...(v && !(tr.levels || []).length ? { levels: trafficDefaultLevels() } : {}) })} />
          <Muted style={{ marginBottom: 8 }}>Each question gets a row of colours to pick its condition. The key is printed on the report. You can switch it off for individual questions in their More options.</Muted>
          {tr.on && (
            <>
              {(tr.levels || []).map((l, li) => (
                <View key={l.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <Pressable onPress={async () => { const k = await chooseAction('Colour', TRAFFIC_COLOURS.map((c) => ({ key: c.k, label: c.lbl }))); if (k) setTraffic({ levels: (tr.levels || []).map((x, j) => (j === li ? { ...x, color: k } : x)) }); }} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: trafficHex(l.color) }} />
                  <TextInput value={l.label || ''} onChangeText={(v) => setTraffic({ levels: (tr.levels || []).map((x, j) => (j === li ? { ...x, label: v } : x)) })} placeholder="What this colour means" style={[box, { flex: 1 }]} />
                  <Pressable onPress={() => setTraffic({ levels: (tr.levels || []).filter((_, j) => j !== li) })} style={small}><Text style={{ color: base.warn }}>✕</Text></Pressable>
                </View>
              ))}
              <Pressable onPress={() => { const used = (tr.levels || []).map((x) => x.color); const next = TRAFFIC_COLOURS.find((c) => !used.includes(c.k)) || TRAFFIC_COLOURS[0]; setTraffic({ levels: [...(tr.levels || []), { id: `tl_${uid()}`, color: next.k, label: '' }] }); }}><Text style={{ color: base.blue }}>+ Add colour</Text></Pressable>
            </>
          )}
        </Card>
      )}

      <Toggle title={`Your answer types · ${sets.length ? `${sets.length} saved` : 'add your own, e.g. Good / Fair / Poor'}`} open={!!setsDraft} onPress={() => setSetsDraft(setsDraft ? null : JSON.parse(JSON.stringify(sets)))} />
      {setsDraft && (
        <Card>
          <Muted style={{ marginBottom: 8 }}>Make your own sets of answers. They appear in the answer-type list on every question, in every template.</Muted>
          {setsDraft.map((a, ai) => (
            <View key={a.id} style={{ borderWidth: 1.5, borderColor: base.line, borderRadius: 12, padding: 10, marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
                <TextInput value={a.name} onChangeText={(v) => setSetsDraft(setsDraft.map((x, j) => (j === ai ? { ...x, name: v } : x)))} placeholder="Name, e.g. Condition" style={[box, { flex: 1 }]} />
                <Pressable onPress={() => setSetsDraft(setsDraft.filter((_, j) => j !== ai))} style={small}><Text style={{ color: base.warn }}>✕</Text></Pressable>
              </View>
              {a.options.map((o, oi) => (
                <View key={oi} style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
                  <TextInput value={o} onChangeText={(v) => setSetsDraft(setsDraft.map((x, j) => (j === ai ? { ...x, options: x.options.map((y, k) => (k === oi ? v : y)) } : x)))} placeholder={`Answer ${oi + 1}`} style={[box, { flex: 1 }]} />
                  <Pressable onPress={() => setSetsDraft(setsDraft.map((x, j) => (j === ai ? { ...x, options: x.options.filter((_, k) => k !== oi) } : x)))} style={small}><Text style={{ color: base.warn }}>✕</Text></Pressable>
                </View>
              ))}
              <Pressable onPress={() => setSetsDraft(setsDraft.map((x, j) => (j === ai ? { ...x, options: [...x.options, ''] } : x)))}><Text style={{ color: base.blue, marginBottom: 6 }}>+ Add answer</Text></Pressable>
              <Check label="More than one answer can be ticked" value={!!a.multi} onChange={(v) => setSetsDraft(setsDraft.map((x, j) => (j === ai ? { ...x, multi: v } : x)))} />
            </View>
          ))}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Button kind="ghost" title="+ New answer type" onPress={() => setSetsDraft([...setsDraft, { id: uid(), name: '', options: ['', ''], multi: false }])} /></View>
            <View style={{ flex: 1 }}><Button title="Save answer types" onPress={async () => {
              const clean = cleanAnswerSets(setsDraft);
              if (!clean) { toast('Each answer type needs at least one answer.'); return; }
              if ((await db.from('organizations').update({ report_answer_sets: clean } as never).eq('id', me.org_id as string)).error) { toast('Could not save — only a Project Manager or Admin can change this.'); return; }
              setT({ ...t, sections: applyAnswerSets(secs, clean) }); setSetsDraft(null); void refetchSets(); toast('Answer types saved');
            }} /></View>
          </View>
        </Card>
      )}

      {secs.map((s, si) => (
        <Card key={s.id}>
          <Muted style={{ fontWeight: '700' }}>Section Title</Muted>
          <TextInput value={s.title} onChangeText={(v) => setSecs(secs.map((x, i) => (i === si ? { ...x, title: v } : x)))} placeholder="Section title" style={[box, { marginBottom: 8 }]} />
          {s.items.length ? s.items.map((it, ii) => itemEditor(si, ii, it)) : <Muted style={{ marginBottom: 6 }}>No questions in this section yet.</Muted>}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Button kind="ghost" title="+ Add Question" onPress={() => setItems(si, [...s.items, newItem()])} /></View>
            <View style={{ flex: 1 }}><Button kind="ghost" title="+ Add Notes Box" onPress={() => setItems(si, [...s.items, newItem('textarea')])} /></View>
          </View>
          {secs.length > 1 && <Button kind="ghost" title="Remove Section" onPress={async () => { if (await confirmAsk('Remove this section and all its questions?', 'Remove')) setSecs(removeSection(secs, si)); }} />}
        </Card>
      ))}
      <Button kind="ghost" title="+ Add Section" onPress={() => setSecs([...secs, { id: uid(), title: `Section ${secs.length + 1}`, items: [] }])} />
      <Card>
        <Check label="Show unanswered questions on the finished report and PDF" value={templateShowsUnanswered(secs)} onChange={(v) => setSecs(secs.map((x, i) => (i === 0 ? { ...x, showUnanswered: v } : x)))} />
      </Card>
      <View style={{ height: 12 }} />
      <Button busy={busy} title="Save Template" onPress={() => void save()} />
    </ScrollView>
  );
}
