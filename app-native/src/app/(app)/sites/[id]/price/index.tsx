// Price tile (390 renderPriceTile): one tile per Pricing Element with price,
// booked in and balance (red when over-booked); colour groups get a combined
// card (managers group tiles from each tile's ⋮); closed ones fold away.
// Multi-address jobs pick an address first. Laid out as the current app (5 Nov 2026): managers get a Price Sheets
// row with its count, then + Add price and ⋮ Manage on the right, then the prices as tiles (2 across on a phone,
// 4 on a computer) with the ⋮ in the top left corner.
import { WagesToBook } from '@/components/WagesToBook';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { chooseAction, confirmAsk, promptText, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted } from '@/components/ui';
import { addElement, GROUP_COLOURS, newGroupFor, setElementGroup, updateGroup, usePriceTile } from '@/data/price';
import { listSheets } from '@/data/priceSheets';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { heading } from '@/lib/fonts';
import { supabase } from '@/lib/supabase';
import { money, type PriceElement } from '@/lib/rules/price';
import { base, page, space, live, useDesk } from '@/theme/theme';

// 390 .tile: centred icon, name, figures.
const tileBox = { minHeight: 122, borderRadius: 10, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 12, paddingHorizontal: 10, backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine } as const;
const tileIcon = { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF3D9', marginBottom: 2 } as const;
const tileLbl = { ...heading(700), fontSize: 13.2, color: base.ink, textAlign: 'center' } as const;
const tileSub = { fontSize: 11.1, color: base.slateLight, textAlign: 'center' } as const;

export default function PriceTile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const desk = useDesk();
  const { data: site } = useSite(id);
  const { data, isLoading } = usePriceTile(me, site);
  // 390: the row counts every sheet on the job for a PM / admin.
  const { data: sheets } = useQuery({ queryKey: ['priceSheetCount', id], enabled: !!id, queryFn: () => listSheets(id) });
  const [sub, setSub] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [sel, setSel] = useState<Set<string> | null>(null); // ticking tiles to close together (390 closeSelectedPricingElements)
  if (!me || !site) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  if (isLoading || !data) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const multi = !!site.multi_site;
  const subId = multi ? (sub && data.subs.some((a) => a.id === sub) ? sub : data.subs[0]?.id ?? null) : null;
  const here = data.elements.filter((el) => (multi ? el.sub_site_id === subId : !el.sub_site_id));
  const open = here.filter((el) => !el.closed), closed = here.filter((el) => el.closed);
  const groups = data.groups.filter((g) => (multi ? g.sub_site_id === subId : !g.sub_site_id) && data.groupFigs[g.id]);
  const nSheets = (sheets ?? []).length;
  const tile = (el: PriceElement) => {
    const f = data.figs[el.id];
    const cell = (inner: ReactNode) => <View key={el.id} style={{ width: desk ? '25%' : '50%', padding: 5 }}>{inner}</View>;
    if (el.closed && !data.mgr && !el.closed_show_price_to_operatives) return cell(
      <View style={[tileBox, { opacity: 0.55 }]}>
        <View style={[tileIcon, { backgroundColor: '#EDEDED' }]}><Text style={{ fontSize: 18 }}>🔒</Text></View>
        <Text numberOfLines={2} style={tileLbl}>{el.name}</Text>
        <Text style={tileSub}>Closed</Text>
      </View>,
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
    const over = f.balance < 0;
    return cell(
      <Pressable onPress={() => (sel && !el.closed ? setSel((x) => { const n = new Set(x ?? []); if (n.has(el.id)) n.delete(el.id); else n.add(el.id); return n; }) : router.push(`/sites/${site.id}/price/${el.id}` as never))} onLongPress={data.mgr && !el.closed ? () => void groupMenu() : undefined}
        style={[tileBox, { borderWidth: over || g ? 2 : 1, borderColor: over ? base.warn : g ? g.color : base.cardLine, opacity: el.closed ? 0.7 : 1 }]}>
        {data.mgr && !el.closed && (
          <Pressable hitSlop={8} accessibilityLabel="Group this tile" onPress={() => void groupMenu()}
            style={{ position: 'absolute', top: 6, left: 6, width: 24, height: 24, borderRadius: 6, borderWidth: 1, borderColor: base.cardLine, alignItems: 'center', justifyContent: 'center', backgroundColor: base.card }}>
            <Text style={{ fontSize: 13, color: base.slate }}>⋮</Text>
          </Pressable>
        )}
        <View style={tileIcon}><Text style={{ fontSize: 18 }}>{sel && !el.closed ? (sel.has(el.id) ? '☑' : '☐') : '🧾'}</Text></View>
        <Text numberOfLines={2} style={tileLbl}>{el.name}{el.closed ? <Text style={{ fontSize: 9, fontWeight: '600', color: base.slate }}>  CLOSED</Text> : null}</Text>
        <Text style={tileSub}>{money(f.priceTotal)} · {money(f.bookedIn)} booked</Text>
        <Text style={[tileSub, { fontWeight: '600', color: over ? base.warn : base.ink }]}>Bal: {money(f.balance)}</Text>
        {over && <Text style={{ position: 'absolute', top: 8, right: 8, backgroundColor: base.warn, color: '#fff', fontSize: 11, fontWeight: '600', borderRadius: 9, minWidth: 18, textAlign: 'center', overflow: 'hidden' }}>!</Text>}
      </Pressable>,
    );
  };
  const grid = (els: PriceElement[]) => <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5, marginBottom: 14 }}>{els.map(tile)}</View>;
  const addPrice = async () => {
    const n = await promptText('Name for the new price (e.g. Flat Roofing)', ''); if (!n || !n.trim()) { if (n !== null) toast('Enter a name for the Pricing Element'); return; }
    if (await addElement(me, site.id, subId, n.trim())) { toast('Pricing Element added'); void qc.invalidateQueries({ queryKey: ['priceTile', site.id] }); } else toast('Could not save — try again.');
  };
  const grouped = new Set(open.filter((el) => el.group_id && groups.some((g) => g.id === el.group_id)).map((el) => el.id));
  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: 'Price' }} />
      {!!me && data.mgr && <WagesToBook me={me} siteId={id} />}
      {multi && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {data.subs.length ? data.subs.map((a) => (
            <Pressable key={a.id} onPress={() => setSub(a.id)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: subId === a.id ? live.brand1 : base.line, backgroundColor: subId === a.id ? live.brand1 : base.card }}>
              <Text style={{ fontWeight: '500', color: subId === a.id ? live.brand1Text : base.ink }}>{a.name}</Text>
            </Pressable>
          )) : <Muted>No addresses on this job yet.</Muted>}
        </View>
      )}
      {data.mgr && (
        <Pressable onPress={() => router.push(`/sites/${site.id}/price/sheets` as never)} accessibilityRole="button"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 12, borderWidth: 1.5, borderColor: base.line, borderRadius: 12, backgroundColor: base.card }}>
          <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#FFF3D9', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 18 }}>🧮</Text></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontWeight: '600', color: base.ink }}>Price Sheets</Text>
            <Muted style={{ fontStyle: 'italic' }}>{nSheets ? `${nSheets} sheet${nSheets > 1 ? 's' : ''}` : 'Build a priced sheet for this job'}</Muted>
          </View>
          <Text style={{ fontSize: 18, color: base.slate }}>›</Text>
        </Pressable>
      )}
      {data.mgr && (!multi || subId) && !sel && (
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginBottom: 10 }}>
          <Button small title="+ Add price" onPress={addPrice} />
          <Button small kind="ghost" title="⋮ Manage" onPress={async () => {
            const k = await chooseAction('Manage', [{ key: 'add', label: '+ Add Sub Tile' }, ...(open.length > 1 ? [{ key: 'close', label: '☑ Close several…' }] : [])]);
            if (k === 'add') await addPrice(); else if (k === 'close') setSel(new Set());
          }} />
        </View>
      )}
      {data.mgr && sel && (
        <Card style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, borderColor: base.ink, borderWidth: 1.5 }}>
          <Text style={{ flex: 1, fontWeight: '600', color: base.ink }}>{sel.size ? `${sel.size} ticked` : 'Tap the prices to close'}</Text>
          <Button small title={`Close ${sel.size || ''} selected`} disabled={!sel.size} onPress={async () => {
            if (!(await confirmAsk(`Close ${sel.size} price${sel.size === 1 ? '' : 's'}? They move to Closed and can be reopened.`, 'Close'))) return;
            const at = new Date().toISOString();
            const res = await Promise.all([...sel].map((eid) => supabase.from('pricing_elements').update({ closed: true, closed_by: me.id, closed_at: at } as never).eq('id', eid)));
            if (res.some((r) => r.error)) toast('Some could not be closed — try again.');
            setSel(null); void qc.invalidateQueries({ queryKey: ['priceTile'] });
          }} />
          <Button small kind="ghost" title="Cancel" onPress={() => setSel(null)} />
        </Card>
      )}
      {!open.length && <Empty>{multi && !subId ? 'Choose an address above first.' : data.mgr ? 'No prices on this job yet. Tap + Add price to start one.' : 'Nothing priced here for you yet.'}</Empty>}
      {groups.map((g) => { const fg = data.groupFigs[g.id]; return (
        <View key={g.id}>
          <Card style={{ borderColor: g.color, borderWidth: 1.5 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: g.color }} /><Text style={{ flex: 1, fontWeight: '600', color: base.ink }}>{g.name}</Text><Muted>{fg.count} tile{fg.count === 1 ? '' : 's'}</Muted></View>
            <Muted>{money(fg.priceTotal)} price · {money(fg.bookedIn)} booked</Muted>
            <Text style={{ fontWeight: '600', color: fg.balance < 0 ? base.warn : base.ink }}>Balance: {money(fg.balance)}</Text>
          </Card>
          {grid(open.filter((el) => el.group_id === g.id))}
        </View>
      ); })}
      {grid(open.filter((el) => !grouped.has(el.id)))}
      {closed.length > 0 && (
        <Card style={{ padding: 0 }}>
          <Pressable onPress={() => setShowClosed(!showClosed)} style={{ paddingVertical: 12, paddingHorizontal: 14 }}><Text style={{ fontWeight: '600', color: base.ink }}>{showClosed ? '▼' : '▶'} Closed ({closed.length})</Text></Pressable>
          {showClosed && <View style={{ paddingHorizontal: 14 }}>{grid(closed)}</View>}
        </Card>
      )}
    </ScrollView>
  );
}
