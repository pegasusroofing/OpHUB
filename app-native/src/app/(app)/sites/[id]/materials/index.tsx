// A job's Materials. Operatives (725): their collection list as a tick list, what's
// coming to site, their waiting requests and "Request materials". Managers (720):
// tiles for Material Requests, Material PO's, Plant and Expenses.
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { useToast } from '@/components/toast';
import { Button, Card, Empty, Muted, SectionTitle, Tile } from '@/components/ui';
import { collectPickups, useCollectionsOpenCount, useMaterialRequests, useOpMaterials } from '@/data/materials';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { canSeeMatTile, groupPickups } from '@/lib/rules/materials';
import { isManager } from '@/lib/roles';
import { base, space } from '@/theme/theme';

const fmt = (d: string | null | undefined) => (d ? new Date(d.length === 10 ? `${d}T00:00:00` : d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '');

export default function Materials() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const { data: site } = useSite(id);
  if (!me || !site) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  return (
    <>
      <Stack.Screen options={{ title: 'Materials' }} />
      {isManager(me) ? <ManagerTiles siteId={id} vis={site.materials_visibility} role={me.role} /> : <OperativeMaterials siteId={id} vis={site.materials_visibility} />}
    </>
  );
}

function ManagerTiles({ siteId, vis, role }: { siteId: string; vis: Parameters<typeof canSeeMatTile>[0]; role: string }) {
  const toast = useToast();
  const { data: pending } = useMaterialRequests(siteId, 'pending');
  const { data: collectN } = useCollectionsOpenCount(siteId, true);
  const go = (p: string) => () => router.push(`/sites/${siteId}/${p}` as never);
  const sub = [pending?.length ? `${pending.length} to action` : '', collectN ? `${collectN} to collect` : ''].filter(Boolean).join(' · ') || 'Requests from operatives';
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <Tile icon="🙋" tint="#F1E4FA" title="Material Requests" sub={sub} badge={pending?.length || undefined} onPress={go('materials/requests')} />
      <Tile icon="📄" tint="#FBEFE0" title="Material PO's" sub="Order files for this job" onPress={() => toast("Material PO's is still being built in the new app.")} />
      {canSeeMatTile(vis, 'plant', role) && <Tile icon="🏗" tint="#EAF3EC" title="Plant" sub="Check in / out" onPress={() => toast('Plant is still being built in the new app.')} />}
      {canSeeMatTile(vis, 'expenses', role) && <Tile icon="🧾" tint="#FDF1DE" title="Expenses" sub="Send receipts" onPress={go('expenses')} />}
    </ScrollView>
  );
}

function OperativeMaterials({ siteId, vis }: { siteId: string; vis: Parameters<typeof canSeeMatTile>[0] }) {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading, refetch, isRefetching } = useOpMaterials(siteId, me?.id);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  const supName = (sid: string) => data?.suppliers.find((s) => s.id === sid)?.name ?? null;
  const groups = groupPickups(data?.pickups ?? [], supName);
  const openIds = (data?.pickups ?? []).filter((m) => m.status !== 'collected').map((m) => m.id);
  const picked = [...sel].filter((x) => openIds.includes(x));
  const showPlant = canSeeMatTile(vis, 'plant', me.role);
  const showExp = canSeeMatTile(vis, 'expenses', me.role);
  const toggle = (x: string) => { const n = new Set(sel); if (n.has(x)) n.delete(x); else n.add(x); setSel(n); };

  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { void refetch(); }} />}>
      {isLoading ? <Muted>Loading…</Muted> : (
        <>
          <SectionTitle>Your collection list</SectionTitle>
          {openIds.length > 1 && picked.length > 0 && (
            <Pressable onPress={() => setSel(picked.length >= openIds.length ? new Set() : new Set(openIds))} style={{ marginBottom: 8 }}>
              <Text style={{ fontWeight: '700', color: base.ink }}>{picked.length >= openIds.length ? '☑' : '☐'} Select all ({openIds.length}){picked.length < openIds.length ? ` · ${picked.length} selected` : ''}</Text>
            </Pressable>
          )}
          {groups.length ? groups.map((g) => (
            <Card key={g.key}>
              <Text style={{ fontWeight: '700', color: base.ink }}>{g.name}{g.items[0].assigned_at ? <Text style={{ fontWeight: '400', color: base.slate }}> · asked {fmt(g.items[0].assigned_at)}</Text> : null}</Text>
              {!!g.addr && <Text style={{ color: base.blue, marginTop: 2 }} onPress={() => void Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(g.addr)}`)}>📍 {g.addr}</Text>}
              {!!g.phone && <Text style={{ color: base.blue, marginTop: 2 }} onPress={() => void Linking.openURL(`tel:${g.phone}`)}>📞 {g.phone}</Text>}
              {g.items.map((m) => {
                const done = m.status === 'collected';
                const on = done || sel.has(m.id);
                return (
                  <Pressable key={m.id} disabled={done} onPress={() => toggle(m.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: base.line, marginTop: 6, opacity: done ? 0.6 : 1 }}>
                    <Text style={{ width: 22, height: 22, borderWidth: 1.5, borderColor: on ? base.ok : base.line, borderRadius: 5, textAlign: 'center', color: base.ok, fontWeight: '800' }}>{on ? '✓' : ''}</Text>
                    <Text style={{ flex: 1, color: base.ink, textDecorationLine: done ? 'line-through' : 'none' }}>{m.item}{m.qty ? <Text style={{ color: base.slate }}> × {m.qty}</Text> : null}</Text>
                    {done && <Text style={{ fontSize: 11, fontWeight: '700', color: base.ok }}>Collected</Text>}
                  </Pressable>
                );
              })}
            </Card>
          )) : <Empty>Nothing for you to collect.</Empty>}
          {openIds.length > 0 && (
            <Button busy={busy} kind={picked.length ? 'primary' : 'ghost'} title={`✓ Mark ${picked.length ? `${picked.length} ` : ''}collected`} onPress={async () => {
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
            <Card key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: base.ink }}>{m.item}{m.qty ? <Text style={{ color: base.slate, fontWeight: '400' }}> × {m.qty}</Text> : null}</Text>
                <Muted>Delivery{m.required_for_delivery ? ` · ${fmt(m.required_for_delivery)}` : ''}</Muted>
                {!!m.sub_site_label && <Muted>📍 {m.sub_site_label}</Muted>}
              </View>
              <Text style={{ fontSize: 11, fontWeight: '700', color: m.grn ? (m.grn.ok ? base.ok : base.red) : base.blue }}>{m.grn ? (m.grn.ok ? 'Received' : 'Problem') : 'Delivery'}</Text>
            </Card>
          )) : <Empty>No deliveries booked.</Empty>}

          <SectionTitle>Your requests</SectionTitle>
          {(data?.mine ?? []).map((m) => (
            <Pressable key={m.id} onPress={() => router.push(`/sites/${siteId}/materials/requests` as never)}>
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', color: base.ink }}>{m.item}{m.qty ? <Text style={{ color: base.slate, fontWeight: '400' }}> × {m.qty}</Text> : null}</Text>
                  <Muted>Waiting for manager</Muted>
                </View>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#6A2C91' }}>Requested</Text>
              </Card>
            </Pressable>
          ))}
          <Button title="+ Request materials" onPress={() => router.push(`/sites/${siteId}/materials/requests?add=1` as never)} />
          {showPlant && <Button kind="ghost" title="🏗 Plant" onPress={() => toast('Plant is still being built in the new app.')} />}
          {showExp && <Button kind="ghost" title="🧾 Expenses" onPress={() => router.push(`/sites/${siteId}/expenses` as never)} />}
          <Pressable onPress={() => router.push(`/sites/${siteId}/materials/requests` as never)} style={{ marginTop: 10 }}><Text style={{ color: base.slate }}>See all my requests →</Text></Pressable>
          <Muted style={{ marginTop: space.m }}>Goods received (GRN) on deliveries comes next.</Muted>
        </>
      )}
    </ScrollView>
  );
}
