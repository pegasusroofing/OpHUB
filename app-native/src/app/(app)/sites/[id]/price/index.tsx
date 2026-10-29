// Price tile (390 renderPriceTile): one tile per Pricing Element with price,
// booked in and balance (red when over-booked); colour groups get a combined
// card (managers group tiles from each tile's ⋮); closed ones fold away.
// Multi-address jobs pick an address first.
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { chooseAction, promptText, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted } from '@/components/ui';
import { addElement, GROUP_COLOURS, newGroupFor, setElementGroup, updateGroup, usePriceTile } from '@/data/price';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { money, type PriceElement } from '@/lib/rules/price';
import { base, page, radius, space } from '@/theme/theme';

export default function PriceTile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: site } = useSite(id);
  const { data, isLoading } = usePriceTile(me, site);
  const [sub, setSub] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  if (!me || !site) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  if (isLoading || !data) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const multi = !!site.multi_site;
  const subId = multi ? (sub && data.subs.some((a) => a.id === sub) ? sub : data.subs[0]?.id ?? null) : null;
  const here = data.elements.filter((el) => (multi ? el.sub_site_id === subId : !el.sub_site_id));
  const open = here.filter((el) => !el.closed), closed = here.filter((el) => el.closed);
  const groups = data.groups.filter((g) => (multi ? g.sub_site_id === subId : !g.sub_site_id) && data.groupFigs[g.id]);
  const tile = (el: PriceElement) => {
    const f = data.figs[el.id];
    if (el.closed && !data.mgr && !el.closed_show_price_to_operatives) return (
      <View key={el.id} style={{ padding: 12, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 8, backgroundColor: base.card, opacity: 0.55 }}>
        <Text style={{ fontWeight: '700', color: base.ink }}>🔒 {el.name}</Text><Muted>Closed</Muted>
      </View>
    );
    const g = el.group_id ? data.groups.find((x) => x.id === el.group_id) : null;
    // Manager ⋮: put the tile in a colour group, or rename / recolour / leave its group.
    const groupMenu = async () => {
      const here = data.groups.filter((x) => (multi ? x.sub_site_id === subId : !x.sub_site_id));
      const k = await chooseAction(el.name, g
        ? [{ key: 'ren', label: '✎ Rename group' }, { key: 'col', label: '🎨 Change colour' }, { key: 'out', label: 'Remove from group', danger: true }]
        : [...here.map((x) => ({ key: `in:${x.id}`, label: `Add to "${x.name}"` })), { key: 'new', label: '+ New group…' }]);
      if (!k) return;
      let ok = true, msg = '';
      if (k === 'new') { const n = (await promptText('Name this group of tiles', ''))?.trim(); if (!n) return; ok = await newGroupFor(me, site.id, subId, el.id, n, here.length); msg = 'Group created'; }
      else if (k.startsWith('in:')) { ok = await setElementGroup(el.id, k.slice(3)); msg = 'Added to group'; }
      else if (k === 'out') { ok = await setElementGroup(el.id, null); msg = 'Removed from group'; }
      else if (k === 'ren' && g) { const n = (await promptText('Rename group', g.name))?.trim(); if (!n) return; ok = await updateGroup(g.id, { name: n }); msg = 'Group renamed'; }
      else if (k === 'col' && g) { const c = await chooseAction('Colour for this group', GROUP_COLOURS.map((x) => ({ key: x.hex, label: `${g.color === x.hex ? '✓ ' : ''}${x.name}` }))); if (!c) return; ok = await updateGroup(g.id, { color: c }); msg = 'Colour changed'; }
      toast(ok ? msg : 'Could not save — try again.'); void qc.invalidateQueries({ queryKey: ['priceTile', site.id] });
    };
    return (
      <Pressable key={el.id} onPress={() => router.push(`/sites/${site.id}/price/${el.id}` as never)} onLongPress={data.mgr && !el.closed ? () => void groupMenu() : undefined}
        style={{ padding: 12, borderWidth: f.balance < 0 ? 2 : g ? 2 : 1, borderColor: f.balance < 0 ? base.warn : g ? g.color : base.cardLine, borderRadius: radius.row, marginBottom: 8, backgroundColor: base.card, opacity: el.closed ? 0.7 : 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ flex: 1, fontWeight: '800', color: base.ink }}>🧾 {el.name}{el.closed ? '  · CLOSED' : ''}</Text>
          {data.mgr && !el.closed && <Pressable hitSlop={10} accessibilityLabel="Group this tile" onPress={() => void groupMenu()}><Text style={{ fontSize: 18, color: base.slate, paddingHorizontal: 4 }}>⋮</Text></Pressable>}
        </View>
        <Muted>{money(f.priceTotal)} · {money(f.bookedIn)} booked</Muted>
        <Text style={{ fontWeight: '700', color: f.balance < 0 ? base.warn : base.ink }}>Bal: {money(f.balance)}{f.balance < 0 ? '  ⚠ over-booked' : ''}</Text>
      </Pressable>
    );
  };
  const grouped = new Set(open.filter((el) => el.group_id && groups.some((g) => g.id === el.group_id)).map((el) => el.id));
  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: 'Price' }} />
      {multi && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {data.subs.length ? data.subs.map((a) => (
            <Pressable key={a.id} onPress={() => setSub(a.id)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: subId === a.id ? base.ink : base.line, backgroundColor: subId === a.id ? base.ink : base.card }}>
              <Text style={{ fontWeight: '700', color: subId === a.id ? '#fff' : base.ink }}>{a.name}</Text>
            </Pressable>
          )) : <Muted>No addresses on this job yet.</Muted>}
        </View>
      )}
      <Button kind="ghost" title="💷 Price Sheets" onPress={() => router.push(`/sites/${site.id}/price/sheets` as never)} />
      {data.mgr && (!multi || subId) && <Button title="+ Add price" onPress={async () => {
        const n = await promptText('Name for the new price (e.g. Flat Roofing)', ''); if (!n || !n.trim()) { if (n !== null) toast('Enter a name for the Pricing Element'); return; }
        if (await addElement(me, site.id, subId, n.trim())) { toast('Pricing Element added'); void qc.invalidateQueries({ queryKey: ['priceTile', site.id] }); } else toast('Could not save — try again.');
      }} />}
      {!open.length && <Empty>{multi && !subId ? 'Choose an address above first.' : data.mgr ? 'No prices on this job yet. Tap + Add price to start one.' : 'Nothing priced here for you yet.'}</Empty>}
      {groups.map((g) => { const fg = data.groupFigs[g.id]; return (
        <View key={g.id}>
          <Card style={{ borderColor: g.color, borderWidth: 1.5 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: g.color }} /><Text style={{ flex: 1, fontWeight: '800', color: base.ink }}>{g.name}</Text><Muted>{fg.count} tile{fg.count === 1 ? '' : 's'}</Muted></View>
            <Muted>{money(fg.priceTotal)} price · {money(fg.bookedIn)} booked</Muted>
            <Text style={{ fontWeight: '700', color: fg.balance < 0 ? base.warn : base.ink }}>Balance: {money(fg.balance)}</Text>
          </Card>
          {open.filter((el) => el.group_id === g.id).map(tile)}
        </View>
      ); })}
      {open.filter((el) => !grouped.has(el.id)).map(tile)}
      {closed.length > 0 && (
        <>
          <Pressable onPress={() => setShowClosed(!showClosed)} style={{ paddingVertical: 10 }}><Text style={{ fontWeight: '700', color: base.ink }}>{showClosed ? '▼' : '▶'} Closed ({closed.length})</Text></Pressable>
          {showClosed && closed.map(tile)}
        </>
      )}
    </ScrollView>
  );
}
