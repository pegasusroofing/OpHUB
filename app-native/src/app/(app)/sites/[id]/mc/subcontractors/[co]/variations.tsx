// A subcontractor's variations on the job (Andy, 21 Nov 2026: "Can we add variations in there which add to the existing po
// raised, providing it's approved? Can subcontractors raise variation requests"). Their Project Manager, or ours, asks for
// one (what it is, its value); a Project Manager or admin approves it and its value is added to the subcontract order, or
// declines it with a reason. The subcontractor's people see their own; our managers see them all.
import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';

import { chooseAction, confirmAsk, promptText, showAlert } from '@/components/toast';
import { Button, Card, Muted, SectionTitle } from '@/components/ui';
import { nameOf, usePeople } from '@/data/hs';
import { useSubco, useSubcos } from '@/data/subcontractors';
import { sendSubOrder } from '@/data/subOrderDoc';
import { decideVariation, requestVariation, useCoOrders, useSubVariations } from '@/data/subVariations';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { isFinanceUser, isManager } from '@/lib/roles';
import { money } from '@/lib/rules/finance';
import { base, page, radius, space } from '@/theme/theme';

const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card, marginBottom: 8 } as const;

export default function SubcoVariations() {
  const { id, co } = useLocalSearchParams<{ id: string; co: string }>();
  const { me, org } = useAuth();
  const qc = useQueryClient();
  const { data: sub } = useSubco(co, me);
  const { data: site } = useSite(id);
  const { data: list } = useSubcos(site, me);
  const { data: people } = usePeople();
  const mgr = !!me && isManager(me);
  const decider = !!me && (me.role === 'admin' || me.role === 'pm');
  const theirs = !!me && !mgr && list?.myCompany === co;
  const { data: vars = [], isLoading } = useSubVariations(co, mgr || theirs);
  const { data: orders = [] } = useCoOrders(id, co, mgr);
  const [form, setForm] = useState<{ title: string; description: string; value: string } | null>(null);
  const [busy, setBusy] = useState('');
  if (!me) return null;
  if (!mgr && !theirs) return <><Stack.Screen options={{ title: 'Variations' }} /><Muted style={{ padding: space.l }}>You don&apos;t have access to this subcontractor.</Muted></>;
  const canAsk = mgr || !!sub?.isAdmin;
  const name = sub?.company.name || 'Subcontractor';
  const tracked = orders.filter((o) => o.tracked);
  const refresh = () => { for (const k of ['subVariations', 'subcoMoney', 'coOrders', 'mcTiles']) void qc.invalidateQueries({ queryKey: [k] }); };
  const send = async () => {
    if (!form) return;
    const value = Number(form.value.replace(/[£,\s]/g, ''));
    if (!form.title.trim()) { showAlert('Say what the variation is.'); return; }
    if (!isFinite(value) || value <= 0) { showAlert('Enter its value in pounds.'); return; }
    setBusy('send'); const err = await requestVariation(me, id, co, { title: form.title, description: form.description, value, subcontractId: tracked.length === 1 ? tracked[0].id : null }); setBusy('');
    if (err) { showAlert(err); return; }
    setForm(null); refresh();
  };
  const approve = async (v: (typeof vars)[number]) => {
    let order = v.subcontract_id;
    if (!order) {
      if (!tracked.length) { showAlert(`No subcontract order is tracked for ${name} yet. Tick or raise one in Subcontract Orders first.`); return; }
      if (tracked.length === 1) order = tracked[0].id;
      else { order = await chooseAction('Add It To Which Order', tracked.map((o) => ({ key: o.id, label: [o.number, o.name].filter(Boolean).join(' · ') || 'Order' }))); if (!order) return; }
    }
    const o = orders.find((x) => x.id === order);
    if (!(await confirmAsk(`Approve "${v.title}" for ${money(v.value)}? It is added to ${o ? [o.number, o.name].filter(Boolean).join(' · ') : 'the order'}.`, 'Yes', 'No'))) return;
    setBusy(v.id); const err = await decideVariation(v.id, true, order); setBusy('');
    refresh();
    if (err) { showAlert(err); return; }
    // It's a VO on that order now: offer to send the updated order (Andy, 21 Nov 2026: "Once the po is approved it should
    // give the option to resend the po"). Finance people only: the order and its values are Finance's.
    if (isFinanceUser(me, org) && org?.has_finance !== false && (await confirmAsk(`Approved: "${v.title}" is now a VO on ${o ? [o.number, o.name].filter(Boolean).join(' · ') : 'the order'}. Send the updated order to ${name}?`, 'Yes', 'No'))) {
      setBusy(v.id); const m = await sendSubOrder(me, org, order); setBusy('');
      showAlert(m);
    }
  };
  const decline = async (v: (typeof vars)[number]) => {
    const reason = await promptText(`Why is "${v.title}" declined?`, '', { ok: 'Decline' });
    if (reason === null) return;
    setBusy(v.id); const err = await decideVariation(v.id, false, null, reason); setBusy('');
    if (err) showAlert(err); refresh();
  };
  const waiting = vars.filter((v) => v.status === 'requested'), done = vars.filter((v) => v.status !== 'requested');
  const approvedTotal = vars.filter((v) => v.status === 'approved').reduce((t, v) => t + Number(v.added_to_order ?? v.value), 0);
  const row = (v: (typeof vars)[number]) => (
    <View key={v.id} style={{ paddingVertical: 9, borderTopWidth: 1, borderTopColor: base.line }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Text style={{ flex: 1, fontWeight: '600', color: base.ink }}>{v.title}</Text>
        <Text style={{ fontWeight: '700', color: base.ink }}>{money(v.value)}</Text>
      </View>
      {!!v.description && <Muted style={{ fontSize: 12.5 }}>{v.description}</Muted>}
      <Muted style={{ fontSize: 12 }}>{[v.status === 'requested' ? 'Waiting for approval' : v.status === 'approved' ? 'Approved · added to the order' : `Declined${v.decline_reason ? `: ${v.decline_reason}` : ''}`, `asked by ${nameOf(people, v.requested_by || '')}`, new Date(v.requested_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })].join(' · ')}</Muted>
      {v.status === 'requested' && decider && (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 6 }}>
          <Button small busy={busy === v.id} title="Approve" onPress={() => void approve(v)} />
          <Button small kind="ghost" title="Decline" onPress={() => void decline(v)} />
        </View>
      )}
    </View>
  );
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Variations' }} />
      <Text style={{ fontSize: 19, fontWeight: '600', color: base.ink }}>{name}: Variations</Text>
      <Muted style={{ marginBottom: 10 }}>{mgr ? `Approved variations are added to ${name}'s subcontract order${approvedTotal ? ` (${money(approvedTotal)} so far)` : ''}. A Project Manager or admin approves them.` : 'Ask for a variation here. Our Project Manager approves it, and it is added to your order.'}</Muted>
      {canAsk && !form && <View style={{ alignItems: 'center', marginBottom: 10 }}><Button small title={mgr ? '+ Add A Variation' : '+ Request A Variation'} onPress={() => setForm({ title: '', description: '', value: '' })} /></View>}
      {form && (
        <Card>
          <SectionTitle>{mgr ? 'Add A Variation' : 'Request A Variation'}</SectionTitle>
          <Muted style={{ fontWeight: '600', marginBottom: 3 }}>What Is It? *</Muted>
          <TextInput value={form.title} onChangeText={(t) => setForm({ ...form, title: t })} accessibilityLabel="What Is It?" placeholder="e.g. Extra lead flashing to the dormers" placeholderTextColor={base.slateLight} style={box} />
          <Muted style={{ fontWeight: '600', marginBottom: 3 }}>Details</Muted>
          <TextInput value={form.description} onChangeText={(t) => setForm({ ...form, description: t })} accessibilityLabel="Details" multiline placeholder="Where, why, who asked for it" placeholderTextColor={base.slateLight} style={[box, { minHeight: 64, textAlignVertical: 'top' }]} />
          <Muted style={{ fontWeight: '600', marginBottom: 3 }}>Value £ *</Muted>
          <TextInput value={form.value} onChangeText={(t) => setForm({ ...form, value: t })} accessibilityLabel="Value £" keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={base.slateLight} style={box} />
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
            <Button small busy={busy === 'send'} title={mgr ? 'Add For Approval' : 'Send For Approval'} onPress={() => void send()} />
            <Button small kind="ghost" title="Cancel" onPress={() => setForm(null)} />
          </View>
        </Card>
      )}
      {isLoading ? <Muted>Loading…</Muted> : (
        <>
          <Card><SectionTitle>{`Waiting For Approval (${waiting.length})`}</SectionTitle>{waiting.length ? waiting.map(row) : <Muted>None waiting.</Muted>}</Card>
          {!!done.length && <Card><SectionTitle>{`Decided (${done.length})`}</SectionTitle>{done.map(row)}</Card>}
        </>
      )}
    </ScrollView>
  );
}
