// HAVS for managers (660 renderHavs, manager view, + renderHavsCompletedTab):
// This Week — tools on this site (add / remove, or a new tool onto the
// register), each day with every operative's minutes per tool (edit / delete
// until the week is closed) and a minutes box per operative, each person's day
// total and status, Save Minutes, Save & Close for the Week / Reopen, and Move
// to next week. Completed HAVS — every closed week, with Export, Email and Reopen.
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { FinChip } from '@/components/FinNav';
import { chooseAction, confirmAsk, promptText, useToast } from '@/components/toast';
import { Button, Card, Check, Empty, Muted, Toggle } from '@/components/ui';
import {
  addHavsEntryFor, addHavsTool, closeHavsWeek, deleteHavsEntry, editHavsEntry, reopenHavsWeek, setSiteHavsTool, useHavsCompleted, useHavsManagerWeek, type HavsOp, type HavsTool,
} from '@/data/havs';
import { usePeople } from '@/data/hs';
import { useAuth } from '@/lib/auth';
import { useFlushOnLeave } from '@/lib/useFlushOnLeave';
import { buildHavsPdf, emailHavsPdf } from '@/lib/havsPdf';
import { deliverPdf } from '@/lib/pdf';
import { localISODate } from '@/lib/rules/driver';
import { DAY_STATUS_LABEL, dayStatus, HAVS_DAY_LABELS, points, titleCaseWords, weekDates, weekLabel, wholeMinutes } from '@/lib/rules/havs';
import type { Site } from '@/lib/types';
import { base, page, space } from '@/theme/theme';

const PILL = { elv: { bg: '#FBE1DE', fg: base.red }, eav: { bg: base.warnBg, fg: base.warn }, ok: { bg: base.okBg, fg: base.ok } };
const daysFrom = (ws: string) => [0, 1, 2, 3, 4].map((i) => { const d = new Date(`${ws}T00:00:00`); d.setDate(d.getDate() + i); return d; });

export function HavsManager({ site }: { site: Site }) {
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'week' | 'done'>('week');
  const [offset, setOffset] = useState(0);
  const days = weekDates(offset);
  const from = localISODate(days[0]), to = localISODate(days[4]);
  const { data, isLoading } = useHavsManagerWeek(site, from, to, tab === 'week');
  const { data: completed } = useHavsCompleted(site.id, tab === 'done');
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const drafts = useRef<Record<string, string>>({});
  // Typed minutes save when you leave the page or the app goes to the background (660).
  const flushRef = useRef<(() => Promise<unknown>) | null>(null);
  useFlushOnLeave(flushRef);
  const [gen, force] = useState(0); // gen remounts the minutes boxes after a save, so saved ones show empty (660)
  const [busy, setBusy] = useState<string | null>(null);
  const [pick, setPick] = useState<string[] | null>(null); // operatives ticked for Export Selected (660)
  // "+ Add operative" for the odd person not assigned to this job (660 extraUserIds), per day and tool.
  const [extra, setExtra] = useState<Record<string, string[]>>({});
  const { data: everyone } = usePeople();
  if (!me) return null;
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['havs', site.id] }); };
  const tools = data?.tools ?? [];
  const toolById: Record<string, HavsTool> = Object.fromEntries((data?.allTools ?? []).map((t) => [t.id, t]));
  const opById: Record<string, HavsOp> = Object.fromEntries((data?.ops ?? []).map((o) => [o.id, o]));

  // Saves typed minutes (one day or all) — key is day|tool|operative.
  const flush = async (onlyDay?: number): Promise<number> => {
    if (!data) return 0;
    let saved = 0;
    for (const [key, raw] of Object.entries(drafts.current)) {
      const [di, toolId, uid] = key.split('|');
      if (onlyDay !== undefined && Number(di) !== onlyDay) continue;
      const m = wholeMinutes(raw);
      if (!m.ok) { if (!m.empty && m.error) toast(m.error); continue; }
      const tool = toolById[toolId], op = opById[uid] ?? { id: uid, name: data.nameById[uid] || (everyone ?? []).find((p) => p.id === uid)?.name || 'Operative' };
      if (!tool) continue;
      delete drafts.current[key];
      if (await addHavsEntryFor(me, site, op, days[Number(di)], tool, m.minutes, data.allTools)) saved++; else drafts.current[key] = raw;
    }
    force((n) => n + 1);
    return saved;
  };
  // Keep the latest save for useFlushOnLeave (the usual "latest callback in a ref" pattern).
  // eslint-disable-next-line react-hooks/refs
  flushRef.current = () => flush();
  const shift = async (dir: number) => { await flush(); setOffset(offset + dir); };
  const pdf = async (k: 'pdf' | 'email', wsDays: Date[], key: string) => {
    let cc: string | null = null;
    if (k === 'email' && site.client_email && (await confirmAsk(`CC client contact${site.client_contact_name || site.client_name ? ` (${site.client_contact_name || site.client_name})` : ''} on this email?`, 'Yes, CC them', 'No'))) cc = site.client_email;
    setBusy(key);
    try {
      const ops = data?.ops?.length ? data.ops : [];
      const list = ops.length ? ops : (await (async () => { const { supabase } = await import('@/lib/supabase'); const a = (((await supabase.from('site_assignments').select('user_id').eq('site_id', site.id)).data ?? []) as { user_id: string }[]).map((x) => x.user_id); return a.length ? ((((await supabase.from('profiles').select('id,name,role').in('id', a)).data ?? []) as { id: string; name: string; role: string }[]).filter((p) => p.role === 'operative')) : []; })());
      if (!list.length) { toast(k === 'pdf' ? 'No operatives to export.' : 'No operatives to email.'); return; }
      const b = await buildHavsPdf(site, org, wsDays, weekLabel(wsDays), list, 'All Operatives');
      if (k === 'pdf') { if (!(await deliverPdf(b.bytes, b.filename))) toast('Could not save the PDF.'); }
      else toast(await emailHavsPdf(site.id, b.bytes, b.filename, weekLabel(wsDays), cc));
    } catch { toast(k === 'pdf' ? 'Export failed — try again.' : 'Email failed — try again.'); } finally { setBusy(null); }
  };

  return (
    <ScrollView contentContainerStyle={page(900)} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <FinChip on={tab === 'week'} label="This Week" onPress={() => setTab('week')} /><FinChip on={tab === 'done'} label="Completed HAVS" onPress={() => setTab('done')} />
      </View>
      {tab === 'done' ? (completed === undefined ? <Muted>Loading…</Muted> : !completed.length ? <Empty>No weeks saved &amp; closed yet — use &quot;Save &amp; Close for the Week&quot; on This Week once a week&apos;s register is finished.</Empty> : completed.map((r) => {
        const d = daysFrom(r.week_start);
        return (
          <Card key={r.id}>
            <Text style={{ fontWeight: '800', color: base.ink }}>{weekLabel(d)}</Text>
            <Muted style={{ marginBottom: 8 }}>Completed{r.completed_at ? ` ${new Date(r.completed_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}{r.by ? ` by ${r.by}` : ''}</Muted>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}><Button kind="ghost" busy={busy === `${r.id}p`} title="Export" onPress={() => void pdf('pdf', d, `${r.id}p`)} /></View>
              <View style={{ flex: 1 }}><Button kind="ghost" busy={busy === `${r.id}e`} title="Email" onPress={() => void pdf('email', d, `${r.id}e`)} /></View>
              <View style={{ flex: 1 }}><Button kind="ghost" title="Reopen" onPress={async () => { if (await reopenHavsWeek(r.id)) { toast('Week reopened'); refresh(); } else toast('Could not reopen — try again.'); }} /></View>
            </View>
          </Card>
        );
      })) : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <Pressable onPress={() => shift(-1)} style={nav}><Text style={{ fontSize: 20 }}>‹</Text></Pressable>
            <Text style={{ fontWeight: '800', color: base.ink }}>{weekLabel(days)}{data?.locked ? '  🔒' : ''}</Text>
            <Pressable onPress={() => shift(1)} disabled={offset >= 0} style={[nav, offset >= 0 && { opacity: 0.35 }]}><Text style={{ fontSize: 20 }}>›</Text></Pressable>
          </View>
          <Muted style={{ textAlign: 'center', marginBottom: 10 }}>Daily EAV (action value) = 100 points · Daily ELV (limit value) = 400 points</Muted>
          {isLoading || !data ? <Muted>Loading…</Muted> : (
            <>
              <Card>
                <Text style={{ fontWeight: '800', color: base.ink, marginBottom: 6 }}>Tools On This Site ({tools.length})</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {data.allTools.map((t) => { const on = tools.some((x) => x.id === t.id); return (
                    <FinChip key={t.id} on={on} label={`${titleCaseWords(t.name)} · ${t.vibration_magnitude}`} onPress={async () => { if (await setSiteHavsTool(site.id, t.id, !on)) refresh(); else toast('Could not save — try again.'); }} />
                  ); })}
                </View>
                <Muted style={{ marginTop: 6 }}>Tap a tool to add it to, or take it off, this site (m/s²).</Muted>
                <Button kind="ghost" title="+ New tool" onPress={async () => {
                  const name = titleCaseWords(((await promptText('Tool name', '')) || '').trim()); if (!name) return;
                  const mag = parseFloat(((await promptText('Vibration magnitude (m/s²)', '')) || '').replace(',', '.'));
                  if (!isFinite(mag) || mag <= 0) { toast('Enter a magnitude greater than 0.'); return; }
                  if (await addHavsTool(me, site.id, name, mag)) { toast('Tool added to the HAVS register and this site'); refresh(); } else toast('Could not save — try again.');
                }} />
              </Card>
              {!data.ops.length && <Muted style={{ marginBottom: 8 }}>No operatives are assigned to this job yet.</Muted>}
              {tools.length > 0 && days.map((d, di) => {
                const ds = localISODate(d);
                const dayEntries = data.entries.filter((e) => e.entry_date === ds);
                const isOpen = open[di] ?? false;
                const people = [...new Set([...data.ops.map((o) => o.id), ...dayEntries.map((e) => e.user_id)])];
                const worst = people.map((u) => dayStatus(dayEntries.filter((e) => e.user_id === u).reduce((t, e) => t + points(toolById[e.tool_id]?.vibration_magnitude || 0, e.minutes), 0))).reduce<'elv' | 'eav' | 'ok' | null>((w, st) => (st === 'elv' || w === 'elv' ? 'elv' : st === 'eav' || w === 'eav' ? 'eav' : st || w), null);
                return (
                  <View key={ds}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ flex: 1 }}>
                        <Toggle title={`${HAVS_DAY_LABELS[di]}  ${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`} open={isOpen}
                          onPress={async () => { setOpen({ ...open, [di]: !isOpen }); if (isOpen && (await flush(di))) { toast('Entries saved'); refresh(); } }} />
                      </View>
                      {worst && <Text style={{ marginTop: space.l, marginLeft: 6, fontSize: 10.5, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden', backgroundColor: PILL[worst].bg, color: PILL[worst].fg }}>{DAY_STATUS_LABEL[worst]}</Text>}
                    </View>
                    {isOpen && (
                      <Card>
                        {people.map((u) => {
                          const pts = dayEntries.filter((e) => e.user_id === u).reduce((t, e) => t + points(toolById[e.tool_id]?.vibration_magnitude || 0, e.minutes), 0);
                          const st = dayStatus(pts);
                          return <Text key={u} style={{ fontSize: 12, color: st ? PILL[st].fg : base.slate, fontWeight: '700' }}>{data.nameById[u] || 'Operative'} — {pts.toFixed(0)} pts{st ? ` · ${DAY_STATUS_LABEL[st]}` : ''}</Text>;
                        })}
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                          {tools.map((tool) => (
                            <View key={tool.id} style={{ borderWidth: 1, borderColor: base.line, borderRadius: 8, padding: 8, minWidth: 200, flexGrow: 1, flexBasis: 200 }}>
                              <Text style={{ fontWeight: '700', fontSize: 12, color: base.ink }}>{titleCaseWords(tool.name)} <Text style={{ fontWeight: '400', color: base.slate }}>{tool.vibration_magnitude} m/s²</Text></Text>
                              {dayEntries.filter((e) => e.tool_id === tool.id).map((e) => (
                                <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                                  <Text style={{ flex: 1, fontSize: 11, color: base.slate }}>{data.nameById[e.user_id] || 'Operative'} · {e.minutes}m · {points(tool.vibration_magnitude, e.minutes).toFixed(0)}pts</Text>
                                  {!data.locked && <>
                                    <Pressable hitSlop={6} onPress={async () => { const v = await promptText('Minutes', String(e.minutes)); if (v === null) return; const m = wholeMinutes(v); if (!m.ok) { if (m.error) toast(m.error); return; } if (await editHavsEntry(e.id, m.minutes)) { toast('Entry updated'); refresh(); } }}><Text>✎</Text></Pressable>
                                    <Pressable hitSlop={6} onPress={async () => { if (!(await confirmAsk('Remove this HAVS entry?', 'Remove'))) return; if (await deleteHavsEntry(me, site, e)) { toast('Entry removed'); refresh(); } }}><Text>🗑</Text></Pressable>
                                  </>}
                                </View>
                              ))}
                              {data.locked ? <Muted style={{ marginTop: 6 }}>🔒 Week locked</Muted> : [...data.ops.map((o) => ({ id: o.id, name: o.name, added: false })), ...(extra[`${di}|${tool.id}`] || []).map((u) => ({ id: u, name: (everyone ?? []).find((p) => p.id === u)?.name || 'Operative', added: true }))].map((o) => {
                                const key = `${di}|${tool.id}|${o.id}`;
                                return (
                                  <View key={o.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                                    <Text style={{ flex: 1, fontSize: 12, color: base.ink }} numberOfLines={1}>{o.name}</Text>
                                    <TextInput key={`${key}#${gen}`} placeholder="Mins" keyboardType="number-pad" defaultValue={drafts.current[key] ?? ''} onChangeText={(v) => { drafts.current[key] = v; }} style={minsBox} />
                                    {o.added && <Pressable hitSlop={6} onPress={() => { delete drafts.current[key]; setExtra((x) => ({ ...x, [`${di}|${tool.id}`]: (x[`${di}|${tool.id}`] || []).filter((u) => u !== o.id) })); }}><Text style={{ color: base.slate }}>✕</Text></Pressable>}
                                  </View>
                                );
                              })}
                              {!data.locked && (() => {
                                const k = `${di}|${tool.id}`, have = new Set([...data.ops.map((o) => o.id), ...(extra[k] || [])]);
                                const pick = (everyone ?? []).filter((p) => p.role === 'operative' && !have.has(p.id)).sort((a, b) => a.name.localeCompare(b.name));
                                return pick.length ? <Pressable onPress={async () => { const u = await chooseAction('Add an operative not on this job', pick.map((p) => ({ key: p.id, label: p.name }))); if (u) setExtra((x) => ({ ...x, [k]: [...(x[k] || []), u] })); }}><Text style={{ color: base.blue, fontSize: 12, fontWeight: '700', marginTop: 6 }}>+ Add operative</Text></Pressable> : null;
                              })()}
                            </View>
                          ))}
                        </View>
                      </Card>
                    )}
                  </View>
                );
              })}
              {!tools.length && <Text style={{ color: base.red, marginBottom: 12 }}>No HAVS tools on this site yet — tap the tools above to add them.</Text>}
              {tools.length > 0 && !data.locked && (
                <Button kind="ghost" title="Save Minutes" onPress={async () => { const n = await flush(); toast(n ? 'Minutes saved' : 'Nothing new to save — type minutes in the boxes first.'); refresh(); }} />
              )}
              {data.locked ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}><Button kind="ghost" title="Reopen this week" onPress={async () => { if (data.completion && (await reopenHavsWeek(data.completion.id))) { toast('Week reopened'); refresh(); } }} /></View>
                  {offset < 0 && <View style={{ flex: 1 }}><Button title="Move to next week" onPress={() => setOffset(offset + 1)} /></View>}
                </View>
              ) : tools.length > 0 && (
                <Button title="Save & Close for the Week" busy={busy === 'close'} onPress={async () => {
                  if (!(await confirmAsk('Save and close this week? Inputs are locked until a manager reopens it.', 'Save & Close'))) return;
                  setBusy('close'); await flush();
                  const ok = await closeHavsWeek(me, site.id, from); setBusy(null);
                  toast(ok ? 'Week saved & closed — inputs locked' : 'Could not close the week — try again.'); refresh();
                }} />
              )}
              {pick && (
                <Card style={{ marginTop: space.m }}>
                  <Muted style={{ marginBottom: 6 }}>Tick the operatives to include, then export.</Muted>
                  {data.ops.map((o) => <Check key={o.id} label={o.name} value={pick.includes(o.id)} onChange={(v) => setPick(v ? [...pick, o.id] : pick.filter((x) => x !== o.id))} />)}
                  <Button busy={busy === 'sel'} disabled={!pick.length} title={`Export Selected (${pick.length})`} onPress={async () => {
                    const ops = data.ops.filter((o) => pick.includes(o.id)).sort((x, y) => x.name.localeCompare(y.name)); setBusy('sel');
                    try { const b = await buildHavsPdf(site, org, days, weekLabel(days), ops, ops.length === 1 ? ops[0].name : 'Selected Operatives'); if (!(await deliverPdf(b.bytes, b.filename))) toast('Could not save the PDF.'); } catch { toast('Export failed — try again.'); } finally { setBusy(null); }
                  }} />
                </Card>
              )}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: space.m }}>
                <View style={{ flex: 1 }}><Button kind="ghost" busy={busy === 'wp'} title="Export All" onPress={() => void pdf('pdf', days, 'wp')} /></View>
                <View style={{ flex: 1 }}><Button kind="ghost" busy={busy === 'we'} title="Email All" onPress={() => void pdf('email', days, 'we')} /></View>
                <View style={{ flex: 1 }}><Button kind={pick ? 'primary' : 'ghost'} title={pick ? 'Cancel' : 'Choose…'} onPress={() => setPick(pick ? null : [])} /></View>
              </View>
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

const nav = { width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: base.line, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: base.card };
const minsBox = { width: 64, borderWidth: 1, borderColor: base.line, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 4, fontSize: 12, color: base.ink };
