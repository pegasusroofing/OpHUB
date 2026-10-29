// Yard stock for a job (9219m, managers / Finance): what's in the yard (no rates),
// issue to this job, return from it, book stock in. Opened with ?mat=<request> it
// fills that request from the yard instead.
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted, SectionTitle } from '@/components/ui';
import { YardBookIn } from '@/components/YardBookIn';
import { useMaterialRequests, useYard, yardCanEdit, yardMove } from '@/data/materials';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { yardGuess, yardLow, yardNum, yardQty, type YardItem } from '@/lib/rules/materials';
import { isFinanceUser } from '@/lib/roles';
import { base, page, radius, space } from '@/theme/theme';

const qbox = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, paddingHorizontal: 8, paddingVertical: 6, width: 70, textAlign: 'center' as const, color: base.ink, backgroundColor: base.card };

export default function Yard() {
  const { id, mat } = useLocalSearchParams<{ id: string; mat?: string }>();
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: site } = useSite(id);
  const { data: items, refetch } = useYard(me?.org_id);
  const { data: pending } = useMaterialRequests(id, 'pending');
  const [q, setQ] = useState('');
  const [qty, setQty] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<'issue' | 'return'>('issue');
  const [busy, setBusy] = useState<string | null>(null);
  const [pickFor, setPickFor] = useState<string | null>(null);
  const fin = isFinanceUser(me, org);
  if (!me || !site) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  if (!yardCanEdit(me, fin)) return <Muted style={{ padding: space.l }}>Only managers and Finance can use the yard stock.</Muted>;

  const request = mat ? pending?.find((m) => m.id === mat) : undefined;
  const list = items ?? [];
  const shown = q.trim() ? list.filter((s) => [s.item, s.category, s.location].join(' ').toLowerCase().includes(q.trim().toLowerCase())) : list;
  const guess = request ? (pickFor ?? yardGuess(list, request.item)) : null;

  const move = async (s: YardItem, kind: 'issue' | 'return', n: number, materialId?: string) => {
    if (!(n > 0)) { toast(kind === 'issue' ? 'Enter the qty to issue.' : 'Enter the qty to return.'); return; }
    if (kind === 'issue' && n > Number(s.qty || 0) && !(await confirmAsk(`Only ${yardQty(s.qty)} ${s.unit || ''} showing in the yard. Issue ${yardQty(n)} anyway? (The count will go below zero — adjust it after.)`, 'Issue anyway'))) return;
    setBusy(s.id);
    const err = await yardMove(me, { kind, stock: s, qty: n, siteId: id, materialId });
    setBusy(null);
    if (err) { toast(err); return; }
    const after = Number(s.qty || 0) + (kind === 'issue' ? -n : n);
    toast(`${kind === 'issue' ? 'Issued' : 'Returned'} — ${yardQty(after)} ${s.unit || ''} now in the yard${s.min_qty != null && after <= Number(s.min_qty) ? ' (low stock)' : ''}`);
    setQty({ ...qty, [s.id]: '' });
    void refetch(); void qc.invalidateQueries({ queryKey: ['materials', id] });
    if (materialId) router.back();
  };

  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: '📦 Yard stock' }} />
      {request && (
        <Card style={{ borderColor: base.ink, borderWidth: 1.5 }}>
          <SectionTitle>Fill from yard stock</SectionTitle>
          <Muted>For the request: <Text style={{ fontWeight: '700', color: base.ink }}>{request.item}</Text> × {request.qty || '1'}</Muted>
          {(() => {
            const s = list.find((x) => x.id === guess);
            const n0 = yardNum(request.qty);
            return s ? (
              <View style={{ marginTop: 8 }}>
                <Text style={{ color: base.ink }}>{s.item} — {yardQty(s.qty)} {s.unit || ''} in yard{s.location ? ` · ${s.location}` : ''}{yardLow(s) ? ' (low)' : ''}</Text>
                <Muted>Not the right item? Tap Use on another one below.</Muted>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 6 }}>
                  <TextInput value={qty[`req:${s.id}`] ?? (n0 != null ? String(n0) : '')} onChangeText={(t) => setQty({ ...qty, [`req:${s.id}`]: t })} keyboardType="decimal-pad" style={qbox} />
                  <View style={{ flex: 1 }}><Button busy={busy === s.id} title="Issue to job" onPress={() => void move(s, 'issue', yardNum(qty[`req:${s.id}`] ?? (n0 != null ? String(n0) : '')) ?? 0, request.id)} /></View>
                </View>
              </View>
            ) : <Muted style={{ marginTop: 8 }}>Pick the yard item below.</Muted>;
          })()}
        </Card>
      )}

      <Muted style={{ marginBottom: 8 }}>What's in the yard. {request ? 'Tap Use to fill the request with an item.' : `Issue sends it to ${site.name}; Return brings it back from this job.`}</Muted>
      {!request && (
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
          {(['issue', 'return'] as const).map((k) => (
            <Pressable key={k} onPress={() => setMode(k)} style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: mode === k ? base.ink : base.line, backgroundColor: mode === k ? base.ink : base.card }}>
              <Text style={{ fontWeight: '700', color: mode === k ? '#fff' : base.ink }}>{k === 'issue' ? 'Issue to this job' : '↩ Return from this job'}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <TextInput value={q} onChangeText={setQ} placeholder="Search the yard" style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card, marginBottom: 8 }} />
      {shown.length ? shown.map((s) => (
        <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 10, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 6, backgroundColor: base.card }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', color: base.ink }}>{s.item}</Text>
            {!!(s.category || s.location) && <Muted>{[s.category, s.location].filter(Boolean).join(' · ')}</Muted>}
          </View>
          <Text style={{ fontWeight: '700', color: yardLow(s) ? base.red : base.slate }}>{yardQty(s.qty)} {s.unit || ''}{yardLow(s) ? ' · low' : ''}</Text>
          {request ? <Button kind="ghost" title={guess === s.id ? '✓' : 'Use'} onPress={() => setPickFor(s.id)} /> : (
            <>
              <TextInput value={qty[s.id] ?? ''} onChangeText={(t) => setQty({ ...qty, [s.id]: t })} keyboardType="decimal-pad" placeholder="Qty" style={qbox} />
              <Button busy={busy === s.id} title={mode === 'issue' ? 'Issue' : 'Return'} onPress={() => void move(s, mode, yardNum(qty[s.id]) ?? 0)} />
            </>
          )}
        </View>
      )) : <Empty>{list.length ? 'Nothing matches.' : 'Nothing in the yard list yet.'}</Empty>}
      {!request && <View style={{ marginTop: space.m }}><YardBookIn canAddItems /></View>}
    </ScrollView>
  );
}
