// A subcontractor's subcontract orders on the job (Andy, 21 Nov 2026: "can we create a subcontractor order through the main
// contractor tab (even if it takes you to finance to do), will it auto track the job. Can we have multiple orders within
// there selected to track"). The job's orders: tick the ones that are theirs (as many as you like; they count in their money
// tiles), or raise a new one here, which is ticked for them straight away. Finance adds its value.
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { promptText, showAlert, useToast } from '@/components/toast';
import { Button, Card, Muted } from '@/components/ui';
import { useSubco } from '@/data/subcontractors';
import { raiseOrderFor, trackOrder, useCoOrders } from '@/data/subVariations';
import { useAuth } from '@/lib/auth';
import { canRaiseOrders, isFinanceUser, isManager } from '@/lib/roles';
import { money } from '@/lib/rules/finance';
import { base, page, space } from '@/theme/theme';

export default function SubcoOrders() {
  const { id, co } = useLocalSearchParams<{ id: string; co: string }>();
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: sub } = useSubco(co, me);
  const { data: orders = [], isLoading } = useCoOrders(id, co, !!me && isManager(me));
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  if (!isManager(me)) return <><Stack.Screen options={{ title: 'Subcontract Orders' }} /><Muted style={{ padding: space.l }}>Managers only.</Muted></>;
  const fin = isFinanceUser(me, org) && org?.has_finance !== false;
  const name = sub?.company.name || 'this subcontractor';
  const refresh = () => { for (const k of ['coOrders', 'subcoMoney', 'siteSubOrders']) void qc.invalidateQueries({ queryKey: [k] }); };
  const raise = async () => {
    const work = await promptText(`What is ${name} doing on this order?`, '', { placeholder: 'e.g. Slating and tiling, main roof', ok: 'Raise Order' });
    if (work === null) return;
    setBusy(true); const r = await raiseOrderFor(id, co, { name, email: (sub?.company as { email?: string | null } | undefined)?.email }, work); setBusy(false);
    if (typeof r === 'string') { showAlert(r); refresh(); return; }
    refresh();
    // Finance adds the value (and CIS, retention): straight there for a Finance person.
    if (fin) router.push(`/fin/sub/${r.id}` as never);
  };
  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: 'Subcontract Orders' }} />
      <Text style={{ fontSize: 19, fontWeight: '600', color: base.ink }}>{name}: Subcontract Orders</Text>
      <Muted style={{ marginBottom: 10 }}>Tick the orders that are {name}&apos;s. They count in {name}&apos;s money on this job, and their approved variations are added to them.</Muted>
      <Card>
        {isLoading ? <Muted>Loading…</Muted> : !orders.length ? <Muted>No subcontract orders on this job yet.</Muted> : orders.map((o) => (
          <Pressable key={o.id} accessibilityRole="checkbox" accessibilityState={{ checked: o.tracked }} accessibilityLabel={`Track ${o.number || 'order'} for ${name}`}
            onPress={async () => { if (await trackOrder(o.id, co, !o.tracked)) refresh(); else toast('Could not save — try again.'); }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: base.line }}>
            <Text style={{ fontSize: 18 }}>{o.tracked ? '☑' : '☐'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '600', color: base.ink }}>{[o.number, o.name].filter(Boolean).join(' · ') || 'Order'}</Text>
              <Muted style={{ fontSize: 12 }}>{[o.status === 'complete' ? 'Complete' : 'Active', fin ? (o.order_value != null ? money(o.order_value, 0) : 'No value yet') : ''].filter(Boolean).join(' · ')}</Muted>
            </View>
            {fin && o.tracked && <Button small kind="ghost" title="Open ›" onPress={() => router.push(`/fin/sub/${o.id}` as never)} />}
          </Pressable>
        ))}
      </Card>
      <View style={{ alignItems: 'center', marginTop: 4 }}>
        {canRaiseOrders(me) ? <Button small busy={busy} title="+ Raise A Subcontract Order" onPress={() => void raise()} /> : <Muted style={{ textAlign: 'center' }}>Your role can&apos;t raise orders (Admin › People › Invites &amp; Roles).</Muted>}
        <Muted style={{ textAlign: 'center', marginTop: 6, fontSize: 12 }}>{!canRaiseOrders(me) ? '' : fin ? 'Raised here, it is ticked for them; you go straight to Finance to add its value.' : 'Raised here, it is ticked for them; Finance adds its value.'}</Muted>
      </View>
    </ScrollView>
  );
}
