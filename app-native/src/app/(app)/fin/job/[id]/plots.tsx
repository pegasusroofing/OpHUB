// A project's plots, set from Finance (Andy, 2 Nov 2026): the same list as Project Admin's addresses, so Check In,
// the Bill of Quantities and the cost booking all see them. Turning multi-site on also makes Check In per address.
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { FinForm } from '@/components/FinForm';
import { BoqTabs } from '@/components/FinNav';
import { chooseAction, confirmAsk, useToast } from '@/components/toast';
import { Button, Muted } from '@/components/ui';
import { fdb } from '@/data/finance';
import { deleteSubAddress, saveSubAddress, setSubAddressClosed, useSiteAddresses, type FullSubAddr } from '@/data/siteAdmin';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { base, page, radius, space, useDesk } from '@/theme/theme';

type Row = Record<string, any>;

export default function FinPlots() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const desk = useDesk();
  const { data: site } = useSite(id);
  const s = site as Row | undefined;
  const { data: plots = [], refetch } = useSiteAddresses(id, !!s?.multi_site);
  const [edit, setEdit] = useState<FullSubAddr | 'new' | null>(null);
  if (!me || !s) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const refresh = () => { void refetch(); void qc.invalidateQueries({ queryKey: ['finSubJobs'] }); void qc.invalidateQueries({ queryKey: ['subAddresses'] }); };
  const turnOn = async () => {
    if (!(await confirmAsk('Make this a multi-site project? Check In then works per plot, each with its own GPS area, and costs can be booked to a plot.', 'Yes', 'No'))) return;
    const r = await fdb.from('sites').update({ multi_site: true } as never).eq('id', id).select('id');
    if (!r.data?.length) { toast('Could not save — try again.'); return; }
    void qc.invalidateQueries(); toast('Multi-site switched on — add the plots');
  };
  const cur = edit && edit !== 'new' ? edit : null;
  return (
    <ScrollView contentContainerStyle={page(1100)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Plots' }} />
      <BoqTabs id={id} on="plots" />
      {s.repair_contract ? <Muted>This is a repair contract, so it has repair jobs rather than plots. A project is one or the other.</Muted> : !s.multi_site ? (
        <View style={{ backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, padding: 14, gap: 10, alignItems: 'flex-start' }}>
          <Text style={{ fontSize: 15, fontWeight: '500', color: base.ink }}>This project is a single site.</Text>
          <Button small title="Make it multi-site" onPress={() => void turnOn()} />
        </View>
      ) : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
            <View style={{ alignItems: 'flex-start', gap: 8 }}>
              <Text style={{ fontSize: desk ? 20 : 17, fontWeight: '600', color: base.ink }}>Plots</Text>
              <Button small kind="ghost" title="+ Add plot" onPress={() => setEdit('new')} />
            </View>
            <Button small kind="ghost" title="Costs by plot" onPress={() => router.push(`/fin/job/${id}/parts` as never)} />
          </View>
          {!plots.length ? <Muted>No plots added yet.</Muted> : (
            <View style={{ backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, overflow: 'hidden' }}>
              {plots.map((a, i) => (
                <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 14, borderTopWidth: i ? 1 : 0, borderTopColor: base.cardLine }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '500', color: base.ink }}>{a.name}{a.closed ? ' (closed)' : ''}</Text>
                    {!!(a.address || a.postcode) && <Muted>{[a.address, a.postcode].filter(Boolean).join(', ')}</Muted>}
                  </View>
                  <Pressable hitSlop={8} accessibilityRole="button" accessibilityLabel={`More: ${a.name}`} onPress={async () => {
                    const k = await chooseAction(a.name, [{ key: 'edit', label: 'Edit' }, { key: 'close', label: a.closed ? 'Reopen this plot' : 'Close this plot (finished)' }, { key: 'del', label: 'Remove', danger: true }]);
                    if (k === 'edit') setEdit(a);
                    else if (k === 'close') { if (await setSubAddressClosed(me, id, a, !a.closed)) refresh(); else toast('Could not save — try again.'); }
                    else if (k === 'del' && (await confirmAsk(`Remove ${a.name}? Anything booked to it stays on the project, but no longer shows against a plot. This can't be undone.`, 'Remove'))) {
                      if (await deleteSubAddress(me, id, a)) { toast('Plot removed'); refresh(); } else toast('Could not remove it — try again.');
                    }
                  }}><Text style={{ fontSize: 18, color: base.slate }}>⋯</Text></Pressable>
                </View>
              ))}
            </View>
          )}
        </>
      )}
      {edit && (
        <FinForm title={cur ? `Edit ${cur.name}` : 'Add plot'} initial={cur ? { ...cur } : {}} onClose={() => setEdit(null)}
          fields={[{ k: 'name', label: 'Plot name or number', ph: 'e.g. Plot 12' }, { k: 'address', label: 'Address' }, { k: 'postcode', label: 'Postcode', half: true }]}
          onSave={async (v) => {
            const name = String(v.name || '').trim();
            if (!name) return 'Give the plot a name or number.';
            if (!(await saveSubAddress(me, id, cur ? cur.id : null, { name, address: String(v.address || '').trim(), postcode: String(v.postcode || '').trim() }))) return 'Could not save — try again.';
            toast('Plot saved'); refresh(); return null;
          }} />
      )}
    </ScrollView>
  );
}
