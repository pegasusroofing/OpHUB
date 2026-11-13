// A job's Materials. Operatives (725): their collection list as a tick list, what's
// coming to site, their waiting requests and "Request materials". Managers (720):
// big rows for Material Requests, Material PO's, Plant and Expenses (Andy, 11 Nov 2026: option A; PMs / admins choose
// who else sees Plant and Expenses on this job from the row's ⋯). Subcontract Orders is its own row on the job page.
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { GrnForm } from '@/components/Grn';
import { useToast } from '@/components/toast';
import { OphIcon } from '@/components/OphIcon';
import { Button, Card, Empty, Muted, SectionTitle } from '@/components/ui';
import { collectPickups, useCollectionsOpenCount, useMaterialRequests, useOfficeOrders, useOpMaterials } from '@/data/materials';
import { HowTo } from '@/components/HowTo';
import { useMyPlantHere } from '@/data/plant';
import { useSite } from '@/data/sites';
import { tileRoles, tileVisMenu } from '@/data/tileVis';
import { useAuth } from '@/lib/auth';
import { canSeeMatTile, groupPickups } from '@/lib/rules/materials';
import { isFullManager, isManager } from '@/lib/roles';
import type { Profile, Site } from '@/lib/types';
import { base, page, space } from '@/theme/theme';

const fmt = (d: string | null | undefined) => (d ? new Date(d.length === 10 ? `${d}T00:00:00` : d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '');

export default function Materials() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const { data: site } = useSite(id);
  if (!me || !site) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  return (
    <>
      <Stack.Screen options={{ title: 'Materials' }} />
      {isManager(me) ? <ManagerTiles siteId={id} vis={site.materials_visibility} role={me.role} me={me} site={site} /> : <OperativeMaterials siteId={id} vis={site.materials_visibility} />}
    </>
  );
}

function ManagerTiles({ siteId, vis, role, me, site }: { siteId: string; vis: Parameters<typeof canSeeMatTile>[0]; role: string; me: Profile; site: Site }) {
  const toast = useToast();
  const qc = useQueryClient();
  const visProps = (key: 'plant' | 'expenses', label: string) => (isFullManager(me) ? { dim: !tileRoles(site, key, 'mat').includes('operative'), onMenu: async () => { const m = await tileVisMenu(me, site, key, label, 'mat'); if (m) { toast(m); void qc.invalidateQueries({ queryKey: ['sites'] }); } } } : {});
  const { data: pending } = useMaterialRequests(siteId, 'pending');
  const { data: collectN } = useCollectionsOpenCount(siteId, true);
  const { data: office } = useOfficeOrders(siteId, true);
  const go = (p: string) => () => router.push(`/sites/${siteId}/${p}` as never);
  const sub = [pending?.length ? `${pending.length} new` : '', collectN ? `${collectN} to collect` : ''].filter(Boolean).join(' · ');
  return (
    <ScrollView contentContainerStyle={page(720)}>
      <HowTo k="materials" />
      <BigRows rows={[
        { k: 'req', ic: 'chat', t: 'Requests', s: sub || 'Nothing waiting', badge: pending?.length || 0, go: go('materials/requests') },
        { k: 'po', ic: 'reports', t: "Material PO's", s: office?.length ? `${office.length} raised by the office` : 'Orders to suppliers', go: go('materials/pos') },
        ...(canSeeMatTile(vis, 'plant', role) ? [{ k: 'plant', ic: 'truck', t: 'Plant', s: 'Hired plant on this job', go: go('plant'), ...visProps('plant', 'Plant') }] : []),
        ...(canSeeMatTile(vis, 'expenses', role) ? [{ k: 'exp', ic: 'pound', t: 'Expenses', s: 'Receipts for this job', go: go('expenses'), ...visProps('expenses', 'Expenses') }] : []),
        // Raise a subcontract order from here when the job page doesn't show the row (not on a price) (Andy, 13 Nov 2026).
        ...(!site.price_enabled ? [{ k: 'subco', ic: 'users', t: 'Subcontract Orders', s: 'Raise an order to a subcontractor', go: go('materials/subcontracts') }] : []),
      ]} />
      {!!office?.length && (
        <Card style={{ marginTop: space.m }}>
          <SectionTitle>Ordered By The Office</SectionTitle>
          <Muted style={{ marginBottom: 8 }}>Orders Finance has raised for this job.</Muted>
          {office.map((p, i) => {
            const rec = p.received && typeof p.received === 'object' ? p.received : {};
            return (
              <View key={p.id ?? i} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: base.line, paddingTop: i ? 8 : 0, marginTop: i ? 8 : 0 }}>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Text style={{ fontWeight: '600', color: base.ink }}>{p.number || 'PO'}</Text>
                  <Text style={{ color: base.slate, flex: 1 }}>{p.supplier_name || 'Supplier'}</Text>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: base.blue }}>{p.fulfilment === 'collection' ? 'Collection' : 'Delivery'}{p.required_by ? ` ${fmt(p.required_by)}` : ' date to be confirmed'}</Text>
                </View>
                {!p.sent_at && <Muted>Not sent to the supplier yet</Muted>}
                {(p.items ?? []).length ? (p.items ?? []).map((it, j) => {
                  const g = it.material_id ? rec[it.material_id] : null;
                  return (
                    <View key={j} style={{ flexDirection: 'row', gap: 8, paddingVertical: 3 }}>
                      <Text style={{ flex: 1, color: base.ink }}>{it.item || 'Item'}{it.qty != null && it.qty !== '' ? <Text style={{ color: base.slate }}> × {String(it.qty)}{it.unit ? ` ${it.unit}` : ''}</Text> : null}</Text>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: g ? (g.ok === false ? base.red : base.ok) : base.slate }}>{g ? (g.ok === false ? '⚠ Problem' : '✓ Received') : 'Not received'}</Text>
                    </View>
                  );
                }) : <Muted>No lines on it yet.</Muted>}
              </View>
            );
          })}
        </Card>
      )}
    </ScrollView>
  );
}

type BigRow = { k: string; ic: string; t: string; s: string; badge?: number; go: () => void; dim?: boolean; onMenu?: () => void };
/** Big rows (Andy, 11 Nov 2026, option A): an icon, the name and a line under it, a count, ⋯ for who can see it, and ›. */
function BigRows({ rows }: { rows: BigRow[] }) {
  return (
    <View style={{ backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: 12, overflow: 'hidden' }}>
      {rows.map((r, i) => (
        <View key={r.k} style={{ flexDirection: 'row', alignItems: 'center', borderTopWidth: i ? 1 : 0, borderTopColor: '#EEF0F2' }}>
        <Pressable accessibilityRole="button" accessibilityLabel={r.t} onPress={r.go}
          style={({ pressed }) => [{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 68, paddingVertical: 12, paddingLeft: 14, paddingRight: r.onMenu ? 4 : 14, opacity: r.dim ? 0.6 : 1 }, pressed && { backgroundColor: '#F7F8FA' }]}>
          <View style={{ width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: base.cardLine }}><OphIcon name={r.ic} size={19} color={base.ink} /></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '600', color: base.ink }}>{r.t}</Text>
            <Text numberOfLines={1} style={{ fontSize: 12.5, color: base.slate, marginTop: 2 }}>{r.s}</Text>
          </View>
          {!!r.badge && <Text style={{ minWidth: 22, textAlign: 'center', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 11, overflow: 'hidden', backgroundColor: base.red, color: '#fff', fontSize: 12, fontWeight: '700' }}>{r.badge}</Text>}
          {!r.onMenu && <OphIcon name="chevron" size={16} color={base.slate} stroke={2.2} />}
        </Pressable>
        {r.onMenu && <Pressable accessibilityRole="button" accessibilityLabel={`Who can see ${r.t}`} hitSlop={10} onPress={r.onMenu} style={{ paddingHorizontal: 10, paddingVertical: 12 }}><Text style={{ fontSize: 18, fontWeight: '700', color: base.slate }}>⋯</Text></Pressable>}
        {r.onMenu && <Pressable accessibilityRole="button" accessibilityLabel={`Open ${r.t}`} onPress={r.go} style={{ paddingRight: 14, paddingVertical: 12 }}><OphIcon name="chevron" size={16} color={base.slate} stroke={2.2} /></Pressable>}
        </View>
      ))}
    </View>
  );
}

function OperativeMaterials({ siteId, vis }: { siteId: string; vis: Parameters<typeof canSeeMatTile>[0] }) {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading, refetch, isRefetching } = useOpMaterials(siteId, me?.id);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [grnFor, setGrnFor] = useState<string | null>(null);
  const { data: plantMine = 0 } = useMyPlantHere(siteId, me?.id);
  if (!me) return null;
  const supName = (sid: string) => data?.suppliers.find((s) => s.id === sid)?.name ?? null;
  const groups = groupPickups(data?.pickups ?? [], supName);
  const openIds = (data?.pickups ?? []).filter((m) => m.status !== 'collected').map((m) => m.id);
  const picked = [...sel].filter((x) => openIds.includes(x));
  // Plant hidden from your role still shows while something there waits for your signature or is with you.
  const showPlant = canSeeMatTile(vis, 'plant', me.role) || plantMine > 0;
  const showExp = canSeeMatTile(vis, 'expenses', me.role);
  const toggle = (x: string) => { const n = new Set(sel); if (n.has(x)) n.delete(x); else n.add(x); setSel(n); };

  return (
    <ScrollView contentContainerStyle={page(720)}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { void refetch(); }} />}>
      {isLoading ? <Muted>Loading…</Muted> : (
        <>
          <SectionTitle>Your collection list</SectionTitle>
          {openIds.length > 1 && picked.length > 0 && (
            <Pressable onPress={() => setSel(picked.length >= openIds.length ? new Set() : new Set(openIds))} style={{ marginBottom: 8 }}>
              <Text style={{ fontWeight: '600', color: base.ink }}>{picked.length >= openIds.length ? '☑' : '☐'} Select all ({openIds.length}){picked.length < openIds.length ? ` · ${picked.length} selected` : ''}</Text>
            </Pressable>
          )}
          {groups.length ? groups.map((g) => (
            <Card key={g.key}>
              <Text style={{ fontWeight: '600', color: base.ink }}>{g.name}{g.items[0].assigned_at ? <Text style={{ fontWeight: '400', color: base.slate }}> · asked {fmt(g.items[0].assigned_at)}</Text> : null}</Text>
              {!!g.addr && <Text style={{ color: base.blue, marginTop: 2 }} onPress={() => void Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(g.addr)}`)}>📍 {g.addr}</Text>}
              {!!g.phone && <Text style={{ color: base.blue, marginTop: 2 }} onPress={() => void Linking.openURL(`tel:${g.phone}`)}>📞 {g.phone}</Text>}
              {g.items.map((m) => {
                const done = m.status === 'collected';
                const on = done || sel.has(m.id);
                return (
                  <Pressable key={m.id} disabled={done} onPress={() => toggle(m.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: base.line, marginTop: 6, opacity: done ? 0.6 : 1 }}>
                    <Text style={{ width: 22, height: 22, borderWidth: 1.5, borderColor: on ? base.ok : base.line, borderRadius: 5, textAlign: 'center', color: base.ok, fontWeight: '600' }}>{on ? '✓' : ''}</Text>
                    <Text style={{ flex: 1, color: base.ink, fontWeight: '600', textDecorationLine: done ? 'line-through' : 'none' }}>{m.item}{m.qty ? <Text style={{ color: base.slate }}> × {m.qty}</Text> : null}</Text>
                    {done && <Text style={{ fontSize: 11, fontWeight: '600', color: base.ok }}>Collected</Text>}
                  </Pressable>
                );
              })}
            </Card>
          )) : <Empty>Nothing for you to collect.</Empty>}
          {openIds.length > 0 && (
            <Button busy={busy} kind={picked.length ? 'primary' : 'ghost'} title={`✓ Mark ${picked.length ? `${picked.length} ` : ''}Collected`} onPress={async () => {
              if (!picked.length) { toast('Tick the items you have collected first'); return; }
              setBusy(true);
              const n = await collectPickups(me, siteId, (data?.pickups ?? []).filter((m) => picked.includes(m.id)));
              setBusy(false); setSel(new Set());
              toast(n > 1 ? `${n} items collected` : n ? 'Collected' : 'Could not save — try again.');
              void qc.invalidateQueries({ queryKey: ['materials', siteId] });
            }} />
          )}

          <SectionTitle>Coming to site</SectionTitle>
          {data?.coming.length ? data.coming.map((m) => (
            <Card key={m.id}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '600', color: base.ink }}>{m.item}{m.qty ? <Text style={{ color: base.slate, fontWeight: '400' }}> × {m.qty}</Text> : null}</Text>
                <Muted>Delivery{m.required_for_delivery ? ` · ${fmt(m.required_for_delivery)}` : ''}</Muted>
                {!!m.sub_site_label && <Muted>📍 {m.sub_site_label}</Muted>}
              </View>
              <Text style={{ fontSize: 11, fontWeight: '600', color: m.grn ? (m.grn.ok ? base.ok : base.red) : base.blue, backgroundColor: m.grn ? (m.grn.ok ? base.okBg : '#FDE8E8') : base.blueBg, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' }}>{m.grn ? (m.grn.ok ? 'GRN ✓' : 'GRN ⚠') : 'Delivery'}</Text>
              </View>
              {!m.grn && (grnFor === m.id
                ? <GrnForm siteId={siteId} m={m} onCancel={() => setGrnFor(null)} onDone={() => { setGrnFor(null); void qc.invalidateQueries({ queryKey: ['materials', siteId] }); }} />
                : <Pressable onPress={() => setGrnFor(m.id)} style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: base.line, borderRadius: 10, padding: 10 }}><View style={{ width: 20, height: 20, borderWidth: 1.5, borderColor: base.slate, borderRadius: 4 }} /><Text style={{ color: base.ink, fontWeight: '600' }}>Goods Received (GRN)</Text></Pressable>)}
            </Card>
          )) : <Empty>No deliveries booked.</Empty>}

          <SectionTitle>Your requests</SectionTitle>
          {(data?.mine ?? []).map((m) => (
            <Pressable key={m.id} onPress={() => router.push(`/sites/${siteId}/materials/requests` as never)}>
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '600', color: base.ink }}>{m.item}{m.qty ? <Text style={{ color: base.slate, fontWeight: '400' }}> × {m.qty}</Text> : null}</Text>
                  <Muted>Waiting for manager</Muted>
                </View>
                <Text style={{ fontSize: 11, fontWeight: '600', color: '#6A2C91', backgroundColor: '#F1E7F8', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' }}>Requested</Text>
              </Card>
            </Pressable>
          ))}
          <Button title="+ Request Materials" onPress={() => router.push(`/sites/${siteId}/materials/requests?add=1` as never)} />
          {showPlant && <Button kind="ghost" title={plantMine ? `🏗 Plant (${plantMine})` : '🏗 Plant'} onPress={() => router.push(`/sites/${siteId}/plant` as never)} />}
          {showExp && <Button kind="ghost" title="🧾 Expenses" onPress={() => router.push(`/sites/${siteId}/expenses` as never)} />}
          <Pressable onPress={() => router.push(`/sites/${siteId}/materials/requests` as never)} style={{ marginTop: 10 }}><Text style={{ color: base.slate, fontSize: 12, textDecorationLine: 'underline' }}>See All My Requests →</Text></Pressable>
        </>
      )}
    </ScrollView>
  );
}
