// PUWER weekly tool inspection for operatives: your registered tools, the five checks
// per tool (unticked until you confirm each), a warning when you untick one, an
// Acceptable / Can't be used line per tool, comments, Save. Locked once saved (as today).
// Managers get the weekly roster (PuwerRoster) and can fill one in for any
// operative (?user=…), edit it after saving and delete it. Ported from 680.
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { showAlert, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted, SectionTitle } from '@/components/ui';
import { PuwerPdfButtons } from '@/components/PuwerPdfButtons';
import { PuwerRoster } from '@/components/PuwerRoster';
import { confirmAsk } from '@/components/toast';
import { nameOf, usePeople } from '@/data/hs';
import { deletePuwer, savePuwer, usePuwer } from '@/data/puwer';
import { useAuth } from '@/lib/auth';
import { localISODate } from '@/lib/rules/driver';
import { weekDates, weekLabel } from '@/lib/rules/havs';
import { PUWER_QUESTIONS, toolPasses, UNTICK_WARNING, type PuwerKey, type PuwerTool } from '@/lib/rules/puwer';
import { isManager } from '@/lib/roles';
import { base, page, radius, space } from '@/theme/theme';

export default function Puwer() {
  const { id, user } = useLocalSearchParams<{ id: string; user?: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: people } = usePeople();
  const [offset, setOffset] = useState(0);
  const days = weekDates(offset);
  const ws = localISODate(days[0]);
  const { data, isLoading } = usePuwer(id, ws, user);
  const [tools, setTools] = useState<PuwerTool[]>([]);
  const [comments, setComments] = useState('');
  const [retry, setRetry] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) { setTools(data.tools); setComments(data.comments); setRetry(false); } }, [data]);
  if (!me) return null;
  const mgr = isManager(me);
  if (mgr && !user) return <PuwerRoster siteId={id} offset={offset} setOffset={setOffset} />;
  const who = user ?? me.id;
  const whoName = who === me.id ? me.name : nameOf(people, who);
  const locked = !mgr && !!data?.inspectionId && !retry;

  const toggle = (i: number, k: PuwerKey) => {
    const next = tools.map((t, j) => (j === i ? { ...t, [k]: !t[k] } : t));
    setTools(next);
    if (!next[i][k]) showAlert(UNTICK_WARNING);
  };
  const save = async () => {
    setBusy(true);
    const r = await savePuwer(me, id, ws, data?.inspectionId ?? null, tools, comments.trim(), who);
    setBusy(false);
    if (r.error) { toast(r.error); return; }
    setRetry(r.failed > 0);
    toast(r.failed ? `${r.failed} tool${r.failed > 1 ? 's' : ''} did NOT save — check your signal and press Save Inspection again.` : 'Inspection saved');
    if (!r.failed) { void qc.invalidateQueries({ queryKey: ['puwer', id] }); void qc.invalidateQueries({ queryKey: ['puwerRoster', id] }); }
  };

  return (
    <ScrollView contentContainerStyle={page(820)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'PUWER Tool Inspection' }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
        <Pressable onPress={() => setOffset(offset - 1)} style={nav}><Text style={{ fontSize: 20 }}>‹</Text></Pressable>
        <Text style={{ flex: 1, textAlign: 'center', fontWeight: '700', color: base.ink }}>{weekLabel(days)}</Text>
        <Pressable disabled={offset >= 0} onPress={() => setOffset(offset + 1)} style={[nav, offset >= 0 && { opacity: 0.35 }]}><Text style={{ fontSize: 20 }}>›</Text></Pressable>
      </View>
      {data?.weekDone && <Card style={{ backgroundColor: base.okBg }}><Text style={{ color: base.ok, fontWeight: '700' }}>✓ Week marked complete</Text></Card>}
      {isLoading || !data ? <Muted>Loading…</Muted> : (
        <>
          <Card>
            <SectionTitle>{whoName}'s Registered Tools</SectionTitle>
            {tools.length ? <Muted>{tools.length} tool{tools.length === 1 ? '' : 's'} pulled through from My Tools: {tools.map((t) => t.name).join(', ')}</Muted> : null}
          </Card>
          {!tools.length ? (
            <Empty>{who === me.id ? 'You have' : `${whoName} has`} not logged any tools yet. <Text style={{ color: base.blue, fontWeight: '700' }} onPress={() => router.push(`/sites/${id}/hs/mytools`)}>Add one in My Tools</Text></Empty>
          ) : tools.map((t, i) => (
            <Card key={t.toolId || t.dbId || i}>
              <Text style={{ fontWeight: '800', color: base.ink, marginBottom: 6 }}>{t.name}{t.serial_number ? <Text style={{ fontWeight: '400', color: base.slate }}>  · {t.serial_number}</Text> : null}</Text>
              {PUWER_QUESTIONS.map((q) => (
                <Pressable key={q.key} disabled={locked} onPress={() => toggle(i, q.key)} style={{ flexDirection: 'row', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: base.line }}>
                  <View style={{ width: 22, height: 22, borderRadius: 5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', borderColor: t[q.key] ? base.ok : base.slateLight, backgroundColor: t[q.key] ? base.okBg : base.card, opacity: locked ? 0.6 : 1 }}>
                    {t[q.key] && <Text style={{ color: base.ok, fontWeight: '800' }}>✓</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '600', color: base.ink }}>{q.label}</Text>
                    <Text style={{ fontSize: 11, color: base.slate }}>{q.text}</Text>
                  </View>
                </Pressable>
              ))}
              <Text style={{ marginTop: 6, fontWeight: '700', color: toolPasses(t) ? base.ok : base.warn }}>{toolPasses(t) ? '✓ Acceptable' : "✗ Can't be used until brought in line with PUWER"}</Text>
            </Card>
          ))}
          {(!locked || !!comments) && <SectionTitle>Any Other Comments</SectionTitle>}
          {!locked ? (
            <TextInput multiline value={comments} onChangeText={setComments} placeholder="Optional"
              style={{ minHeight: 70, borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, backgroundColor: base.card, color: base.ink }} />
          ) : !!comments && <Card><Text style={{ color: base.ink }}>{comments}</Text></Card>}
          {!locked && tools.length > 0 && <Button busy={busy} title="Save Inspection" onPress={save} />}
          {locked && <Muted style={{ marginTop: 10 }}>Saved for this week.</Muted>}
          {mgr && !!data?.inspectionId && <Button kind="ghost" title="Delete Inspection" onPress={async () => {
            if (!(await confirmAsk('Delete this PUWER inspection? This cannot be undone.', 'Delete'))) return;
            if (await deletePuwer(me, id, data.inspectionId as string, whoName)) { toast('Inspection deleted'); void qc.invalidateQueries({ queryKey: ['puwer', id] }); void qc.invalidateQueries({ queryKey: ['puwerRoster', id] }); }
          }} />}
          {!!data?.inspectionId && <PuwerPdfButtons siteId={id} weekStart={ws} one={{ id: who, name: whoName }} />}
        </>
      )}
    </ScrollView>
  );
}

const nav = { width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: base.line, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: base.card };
