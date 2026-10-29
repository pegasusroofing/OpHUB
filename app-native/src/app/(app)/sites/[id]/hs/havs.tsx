// HAVS for operatives. Ported from renderHavs (660, operative view): week picker
// (no future weeks), the job's tools, Monday–Friday with each day's status pill,
// your logged sessions (edit/delete until the week is closed), minutes boxes and
// Save Minutes. Minutes typed in a day also save when you close that day.
// Export / Email PDF: your own week. Managers get the whole-job screen (HavsManager).
import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { confirmAsk, useToast } from '@/components/toast';
import { HavsManager } from '@/components/HavsManager';
import { Button, Card, Empty, Muted, Toggle } from '@/components/ui';
import { addHavsEntry, deleteHavsEntry, editHavsEntry, useHavsWeek, type HavsTool } from '@/data/havs';
import { useSite } from '@/data/sites';
import { buildHavsPdf, emailHavsPdf } from '@/lib/havsPdf';
import { deliverPdf } from '@/lib/pdf';
import { isManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { localISODate } from '@/lib/rules/driver';
import { DAY_STATUS_LABEL, dayStatus, HAVS_DAY_LABELS, points, titleCaseWords, weekDates, weekLabel, wholeMinutes } from '@/lib/rules/havs';
import { base, space } from '@/theme/theme';

const PILL = { elv: { bg: '#FBE1DE', fg: base.red }, eav: { bg: base.warnBg, fg: base.warn }, ok: { bg: base.okBg, fg: base.ok } };

export default function Havs() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, org } = useAuth();
  const toast = useToast();
  const [pdfBusy, setPdfBusy] = useState<'pdf' | 'email' | null>(null);
  const qc = useQueryClient();
  const { data: site } = useSite(id);
  const [offset, setOffset] = useState(0);
  const days = weekDates(offset);
  const from = localISODate(days[0]), to = localISODate(days[4]);
  const { data, isLoading } = useHavsWeek(site, from, to);
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const drafts = useRef<Record<string, string>>({});
  const [, force] = useState(0);
  const [editing, setEditing] = useState<{ id: string; v: string } | null>(null);
  if (!me || !site) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  if (isManager(me)) return <><Stack.Screen options={{ title: 'HAVS' }} /><HavsManager site={site} /></>;
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['havs', site.id] }); };
  const tools = data?.tools ?? [];
  const toolById: Record<string, HavsTool> = Object.fromEntries(tools.map((t) => [t.id, t]));

  // Saves any typed minutes (for one day, or all days). Bad values stop with the old wording.
  const flush = async (onlyDay?: number): Promise<number> => {
    if (!data) return 0;
    let saved = 0;
    for (const [key, raw] of Object.entries(drafts.current)) {
      const [di, toolId] = key.split('|');
      if (onlyDay !== undefined && Number(di) !== onlyDay) continue;
      const m = wholeMinutes(raw);
      if (!m.ok) { if (!m.empty && m.error) toast(m.error); continue; }
      const tool = toolById[toolId];
      if (!tool) continue;
      if (await addHavsEntry(me, site, days[Number(di)], tool, m.minutes, data.entries, tools)) { delete drafts.current[key]; saved++; }
    }
    force((n) => n + 1);
    return saved;
  };
  const shift = async (dir: number) => { await flush(); setOffset(offset + dir); };

  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 820, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'HAVS' }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <Pressable onPress={() => shift(-1)} style={nav}><Text style={{ fontSize: 20 }}>‹</Text></Pressable>
        <Text style={{ fontWeight: '800', color: base.ink }}>{weekLabel(days)}</Text>
        <Pressable onPress={() => shift(1)} disabled={offset >= 0} style={[nav, offset >= 0 && { opacity: 0.35 }]}><Text style={{ fontSize: 20 }}>›</Text></Pressable>
      </View>
      <Muted style={{ textAlign: 'center', marginBottom: 10 }}>Daily EAV (action value) = 100 points · Daily ELV (limit value) = 400 points</Muted>
      {isLoading || !data ? <Muted>Loading…</Muted> : !data.assigned ? <Empty>You are not assigned to this site.</Empty> : (
        <>
          <Card>
            <Text style={{ fontWeight: '800', color: base.ink, marginBottom: 4 }}>Tools On This Site ({tools.length})</Text>
            <Muted style={{ marginBottom: 6 }}>The HAVS tools set up for this site. Your PM or admin chooses these.</Muted>
            {tools.map((t) => <Text key={t.id} style={{ color: base.ink, fontWeight: '600', paddingVertical: 4 }}>{titleCaseWords(t.name)} <Text style={{ color: base.slate, fontWeight: '400' }}>({t.vibration_magnitude} m/s²)</Text></Text>)}
          </Card>
          {!tools.length && <Text style={{ color: base.red, marginBottom: 12 }}>No HAVS tools have been set up for this site yet — ask your PM or admin.</Text>}
          {tools.length > 0 && days.map((d, di) => {
            const ds = localISODate(d);
            const dayEntries = data.entries.filter((e) => e.entry_date === ds);
            const pts = dayEntries.reduce((s, e) => s + points(toolById[e.tool_id]?.vibration_magnitude || 0, e.minutes), 0);
            const st = dayStatus(pts);
            const isOpen = open[di] ?? true;
            return (
              <View key={ds}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Toggle title={`${HAVS_DAY_LABELS[di]}  ${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`} open={isOpen}
                      onPress={async () => { setOpen({ ...open, [di]: !isOpen }); if (isOpen && (await flush(di))) { toast('Entries saved'); refresh(); } }} />
                  </View>
                  {st && <Text style={{ marginTop: space.l, marginLeft: 6, fontSize: 10.5, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden', backgroundColor: PILL[st].bg, color: PILL[st].fg }}>{DAY_STATUS_LABEL[st]}</Text>}
                </View>
                {isOpen && (
                  <Card>
                    {!data.locked && <Muted style={{ marginBottom: 8 }}>Minutes save when you tap Save Minutes at the bottom, close {HAVS_DAY_LABELS[di]} (tap the day above), or change week.</Muted>}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {tools.map((tool) => {
                        const key = `${di}|${tool.id}`;
                        return (
                          <View key={tool.id} style={{ borderWidth: 1, borderColor: base.line, borderRadius: 8, padding: 8, minWidth: 150, flexGrow: 1, flexBasis: 150 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 6 }}>
                              <Text style={{ fontWeight: '700', fontSize: 12, color: base.ink, flex: 1 }}>{titleCaseWords(tool.name)}</Text>
                              <Text style={{ fontSize: 10, color: base.slate }}>{tool.vibration_magnitude} m/s²</Text>
                            </View>
                            {dayEntries.filter((e) => e.tool_id === tool.id).map((e) => (
                              <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                                {editing?.id === e.id ? (
                                  <>
                                    <TextInput value={editing.v} onChangeText={(v) => setEditing({ id: e.id, v })} keyboardType="number-pad" autoFocus style={minsBox}
                                      onBlur={async () => {
                                        const m = wholeMinutes(editing.v);
                                        if (!m.ok) { if (m.error) toast(m.error); setEditing(null); return; }
                                        if (await editHavsEntry(e.id, m.minutes)) { toast('Entry updated'); refresh(); }
                                        setEditing(null);
                                      }} />
                                    <Text style={{ fontSize: 11, color: base.slate }}>{points(tool.vibration_magnitude, e.minutes).toFixed(0)}pts</Text>
                                  </>
                                ) : (
                                  <Text style={{ flex: 1, fontSize: 11, color: base.slate }}>{me.name} · {e.minutes}m · {points(tool.vibration_magnitude, e.minutes).toFixed(0)}pts</Text>
                                )}
                                {!data.locked && editing?.id !== e.id && (
                                  <>
                                    <Pressable onPress={() => setEditing({ id: e.id, v: String(e.minutes) })} hitSlop={6}><Text>✎</Text></Pressable>
                                    <Pressable hitSlop={6} onPress={async () => {
                                      if (!(await confirmAsk('Remove this HAVS entry?', 'Remove'))) return;
                                      if (await deleteHavsEntry(me, site, e)) { toast('Entry removed'); refresh(); }
                                    }}><Text>🗑</Text></Pressable>
                                  </>
                                )}
                              </View>
                            ))}
                            {data.locked ? <Muted style={{ marginTop: 6 }}>🔒 Week locked</Muted> : (
                              <TextInput placeholder="Mins" keyboardType="number-pad" defaultValue={drafts.current[key] ?? ''}
                                onChangeText={(v) => { drafts.current[key] = v; }} style={[minsBox, { marginTop: 8 }]} />
                            )}
                          </View>
                        );
                      })}
                    </View>
                  </Card>
                )}
              </View>
            );
          })}
          {tools.length > 0 && !data.locked && (
            <Button title="Save Minutes" onPress={async () => {
              const typed = Object.values(drafts.current).some((v) => String(v || '').trim());
              const n = await flush();
              toast(n ? 'Minutes saved' : typed ? 'Nothing saved — check the minutes are whole numbers between 1 and 480.' : 'Nothing new to save — type your minutes in the boxes first.');
              refresh();
            }} />
          )}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: space.m }}>
            {(['pdf', 'email'] as const).map((k) => (
              <View key={k} style={{ flex: 1 }}><Button kind="ghost" busy={pdfBusy === k} title={k === 'pdf' ? (isManager(me) ? 'Export All' : 'Export PDF') : (isManager(me) ? 'Email All' : 'Email PDF')} onPress={async () => {
                let cc: string | null = null;
                if (k === 'email' && site.client_email && (await confirmAsk(`CC client contact${site.client_contact_name || site.client_name ? ` (${site.client_contact_name || site.client_name})` : ''} on this email?`, 'Yes, CC them'))) cc = site.client_email;
                setPdfBusy(k);
                try {
                  let ops = [{ id: me.id, name: me.name }];
                  if (isManager(me)) {
                    const a = (((await supabase.from('site_assignments').select('user_id').eq('site_id', site.id)).data ?? []) as { user_id: string }[]).map((x) => x.user_id);
                    ops = a.length ? ((((await supabase.from('profiles').select('id,name,role').in('id', a)).data ?? []) as { id: string; name: string; role: string }[]).filter((p) => p.role === 'operative').sort((x, y) => x.name.localeCompare(y.name))) : [];
                  }
                  if (!ops.length) { toast(k === 'pdf' ? 'No operatives to export.' : 'No operatives to email.'); return; }
                  const b = await buildHavsPdf(site, org, days, weekLabel(days), ops, isManager(me) ? 'All Operatives' : me.name);
                  if (k === 'pdf') { if (!(await deliverPdf(b.bytes, b.filename))) toast('Could not save the PDF.'); }
                  else toast(await emailHavsPdf(site.id, b.bytes, b.filename, weekLabel(days), cc));
                } catch { toast(k === 'pdf' ? 'Export failed — try again.' : 'Email failed — try again.'); } finally { setPdfBusy(null); }
              }} /></View>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const nav = { width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: base.line, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: base.card };
const minsBox = { width: 64, borderWidth: 1, borderColor: base.line, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 4, fontSize: 12, color: base.ink };
