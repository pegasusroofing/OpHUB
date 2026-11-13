// Yard stock for a job (9219m, managers / Finance): what's in the yard (no rates). Since 13 Nov 2026 (Andy): no Return
// From Job switch; each item shows how many are in stock, then a qty with Book Out (to this job) and Book In (back into the
// yard) side by side; items on purchase orders that aren't in the yard list yet are pulled through underneath to book in;
// Stock Take and Not On The List (a material not in the stock list) are the same size on one row. Opened with
// ?mat=<request> it fills that request from the yard instead.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';

import { FinForm } from '@/components/FinForm';
import { MatTabs } from '@/components/MatTabs';
import { YardLeftovers } from '@/components/YardLeftovers';
import { supabase } from '@/lib/supabase';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { confirmAsk, promptText, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted, SectionTitle } from '@/components/ui';
import { useMaterialRequests, useYard, yardBookIn, yardCanEdit, yardMove } from '@/data/materials';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { yardGuess, yardLow, yardNum, yardQty, type YardItem } from '@/lib/rules/materials';
import { isFinanceUser, isManager } from '@/lib/roles';
import { base, page, radius, space, live } from '@/theme/theme';

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
  const [busy, setBusy] = useState<string | null>(null);
  const [pickFor, setPickFor] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const fin = isFinanceUser(me, org);
  // Purchase order lines, to pull through the ones not in the yard list yet.
  const { data: pos = [], refetch: refetchPos } = useQuery({
    queryKey: ['yardPoLines', me?.org_id], enabled: !!me?.org_id && !mat,
    queryFn: async () => ((await (supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> }).from('purchase_orders').select('id,number,supplier_name,items,status')
      .eq('org_id', me?.org_id as string).neq('status', 'cancelled').order('created_at', { ascending: false }).limit(200)).data as { id: string; number: string | null; supplier_name: string | null; items: unknown; status: string | null }[] | null) ?? [],
  });
  if (!me || !site) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  if (!yardCanEdit(me, fin)) return <Muted style={{ padding: space.l }}>Only managers and Finance can use the yard stock.</Muted>;

  const request = mat ? pending?.find((m) => m.id === mat) : undefined;
  const list = items ?? [];
  const shown = q.trim() ? list.filter((s) => [s.item, s.category, s.location].join(' ').toLowerCase().includes(q.trim().toLowerCase())) : list;
  const guess = request ? (pickFor ?? yardGuess(list, request.item)) : null;
  // Each item named on a purchase order that isn't in the yard list (by name), newest order first, once.
  const inYard = new Set(list.map((x) => x.item.trim().toLowerCase()));
  const poLines: { key: string; po: (typeof pos)[number]; name: string; qty: number | null; unit: string | null }[] = [];
  pos.forEach((po) => (Array.isArray(po.items) ? (po.items as { item?: string; description?: string; qty?: unknown; unit?: string }[]) : []).forEach((it, i) => {
    const name = String(it.item || it.description || '').trim(); const k = name.toLowerCase();
    if (!name || inYard.has(k) || poLines.some((x) => x.name.toLowerCase() === k)) return;
    poLines.push({ key: `${po.id}:${i}`, po, name, qty: yardNum(it.qty), unit: it.unit || null });
  }));
  const poShown = q.trim() ? poLines.filter((x) => `${x.name} ${x.po.number || ''} ${x.po.supplier_name || ''}`.toLowerCase().includes(q.trim().toLowerCase())) : poLines;
  // Book a purchase order's item into the yard: it joins the stock list with that qty, linked to the order.
  const bookInPo = async (x: (typeof poLines)[number]) => {
    const n = yardNum(qty[x.key] || (x.qty != null ? String(x.qty) : '')) ?? 0;
    if (!(n > 0)) { toast('Enter the qty to book in.'); return; }
    setBusy(x.key);
    const ydb = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
    const r = await ydb.from('yard_stock').insert({ org_id: me.org_id, created_by: me.id, qty: 0, item: x.name, unit: x.unit } as never).select('*').single();
    const err = r.error || !r.data ? 'Could not add it to the yard list — try again.' : await yardBookIn(me, { stock: r.data as YardItem, qty: n, supplier: x.po.supplier_name || '', ref: x.po.number || '', note: '', photo: null, poId: x.po.id });
    setBusy(null);
    if (err) { toast(err); return; }
    setQty({ ...qty, [x.key]: '' }); void refetch(); void refetchPos();
  };
  // Qty, Book Out and Book In: the same size, on one row.
  const act = (label: string, onPress: () => void, solid: boolean, key: string) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={busy === key} onPress={onPress}
      style={({ pressed }) => ({ flex: 1, height: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: solid ? base.ink : base.line, backgroundColor: solid ? base.ink : pressed ? '#F1F2F4' : base.card, opacity: busy === key ? 0.6 : 1 })}>
      <Text style={{ fontSize: 13.5, fontWeight: '700', color: solid ? '#fff' : base.ink }}>{busy === key ? '…' : label}</Text>
    </Pressable>
  );
  const qtyBox = (key: string, ph = 'Qty') => <TextInput accessibilityLabel={`Qty: ${key}`} value={qty[key] ?? ''} onChangeText={(t) => setQty({ ...qty, [key]: t })} keyboardType="decimal-pad" placeholder={ph} placeholderTextColor={base.slateLight} style={{ flex: 1, height: 38, borderWidth: 1, borderColor: base.line, borderRadius: 9, textAlign: 'center', color: base.ink, backgroundColor: base.card, fontSize: 15 }} />;

  const move = async (s: YardItem, kind: 'issue' | 'return', n: number, materialId?: string) => {
    if (!(n > 0)) { toast(kind === 'issue' ? 'Enter the qty to book out.' : 'Enter the qty to book in.'); return; }
    if (kind === 'issue' && n > Number(s.qty || 0) && !(await confirmAsk(`Only ${yardQty(s.qty)} ${s.unit || ''} showing in the yard. Book out ${yardQty(n)} anyway? (The count will go below zero — adjust it after.)`, 'Yes', 'No'))) return;
    setBusy(s.id);
    const note = '';
    const err = await yardMove(me, { kind, stock: s, qty: n, siteId: id, materialId, note: note || null });
    setBusy(null);
    if (err) { toast(err); return; }
    const after = Number(s.qty || 0) + (kind === 'issue' ? -n : n);
    toast(`${kind === 'issue' ? 'Booked out' : 'Booked in'} — ${yardQty(after)} ${s.unit || ''} now in the yard${s.min_qty != null && after <= Number(s.min_qty) ? ' (low stock)' : ''}`);
    setQty({ ...qty, [s.id]: '' });
    void refetch(); void qc.invalidateQueries({ queryKey: ['materials', id] });
    if (materialId) router.back();
  };

  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: '📦 Yard stock' }} />
      {!request && isManager(me) && <MatTabs siteId={id} on="yard" yard />}
      {request && (
        <Card style={{ borderColor: base.ink, borderWidth: 1.5 }}>
          <SectionTitle>Fill from yard stock</SectionTitle>
          <Muted>For the request: <Text style={{ fontWeight: '600', color: base.ink }}>{request.item}</Text> × {request.qty || '1'}</Muted>
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

      <Muted style={{ marginBottom: 8 }}>What&apos;s in the yard. {request ? 'Tap Use to fill the request with an item.' : `Book Out sends it to ${site.name}; Book In puts it back in the yard.`}</Muted>
      {!request && <YardLeftovers siteId={id} />}
      {!request && <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>{act('Stock Take', () => router.push('/yardcount' as never), false, '_take')}{act('Not On The List', () => setAdding(true), false, '_new')}</View>}
      {adding && (
        <FinForm title="Not On The List" saveLabel="Add To The Yard List" onClose={() => setAdding(false)} initial={{}}
          fields={[
            { k: 'item', label: 'Item *', ph: 'e.g. Code 4 lead 300mm' },
            { k: 'unit', label: 'Unit', ph: 'e.g. roll, m, box, each', half: true },
            { k: 'location', label: 'Location in the yard', ph: 'e.g. Rack B', half: true },
            { k: 'min_qty', label: 'Low stock at', kind: 'number', half: true },
            { k: 'qty', label: 'Qty in the yard now', kind: 'number', ph: '0', half: true },
          ]}
          onSave={async (v) => {
            const item = String(v.item || '').trim(); if (!item) return 'Enter the item.';
            const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
            const r = await db.from('yard_stock').insert({ org_id: me.org_id, created_by: me.id, qty: 0, item, unit: String(v.unit || '').trim() || null, location: String(v.location || '').trim() || null, min_qty: String(v.min_qty || '').trim() ? yardNum(v.min_qty) : null, updated_at: new Date().toISOString() } as never).select('id').single();
            if (r.error || !r.data) return 'Could not save — try again.';
            const q0 = yardNum(v.qty);
            if (q0) await db.from('yard_moves').insert({ org_id: me.org_id, stock_id: (r.data as { id: string }).id, kind: 'in', qty: Math.abs(q0), note: 'Opening stock', created_by: me.id } as never);
            toast('Added to yard stock'); setAdding(false); void refetch(); return null;
          }} />
      )}
      <TextInput value={q} onChangeText={setQ} placeholder="Search the yard" style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card, marginBottom: 8 }} />
      {shown.length ? shown.map((s) => (
        <View key={s.id} style={{ paddingVertical: 9, paddingHorizontal: 10, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 6, backgroundColor: base.card }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontWeight: '600', color: base.ink }}>{s.item}</Text>
              {!!(s.category || s.location) && <Muted>{[s.category, s.location].filter(Boolean).join(' · ')}</Muted>}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontWeight: '700', color: yardLow(s) ? base.red : base.ink }}>{yardQty(s.qty)} {s.unit || ''}</Text>
              <Text style={{ fontSize: 11, color: yardLow(s) ? base.red : base.slate }}>{yardLow(s) ? 'In Stock · Low' : 'In Stock'}</Text>
            </View>
            {request && <Button kind="ghost" title={guess === s.id ? '✓' : 'Use'} onPress={() => setPickFor(s.id)} />}
          </View>
          {!request && (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              {qtyBox(s.id)}
              {act('Book Out', () => void move(s, 'issue', yardNum(qty[s.id]) ?? 0), true, s.id)}
              {act('Book In', () => void move(s, 'return', yardNum(qty[s.id]) ?? 0), false, s.id)}
            </View>
          )}
        </View>
      )) : <Empty>{list.length ? 'Nothing matches.' : 'Nothing in the yard list yet.'}</Empty>}
      {!request && poShown.length > 0 && (
        <>
          <SectionTitle>On Purchase Orders, Not In The Yard Yet</SectionTitle>
          {poShown.map((x) => (
            <View key={x.key} style={{ paddingVertical: 9, paddingHorizontal: 10, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 6, backgroundColor: base.card }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontWeight: '600', color: base.ink }}>{x.name}</Text>
                  <Muted>{[x.po.number, x.po.supplier_name].filter(Boolean).join(' · ')}</Muted>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontWeight: '700', color: base.ink }}>0 {x.unit || ''}</Text>
                  <Text style={{ fontSize: 11, color: base.slate }}>{x.qty != null ? `In Stock · ${yardQty(x.qty)} On PO` : 'In Stock'}</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                {qtyBox(x.key, x.qty != null ? yardQty(x.qty) : 'Qty')}
                {act('Book In', () => void bookInPo(x), true, x.key)}
              </View>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}
