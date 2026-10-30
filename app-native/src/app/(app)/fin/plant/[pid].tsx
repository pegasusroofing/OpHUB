// Plant hire (905 openFinPlantForm / saveFinPlant): what's on hire, supplier,
// rate per day or week, on / off hire dates, and whether its cost comes from
// the rate or from the supplier's invoices. "new" takes ?site=.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import { FinForm } from '@/components/FinForm';
import { AllocRow } from '@/components/FinSplit';
import { useToast } from '@/components/toast';
import { Button, Muted } from '@/components/ui';
import { fdb } from '@/data/finance';
import { useAuth } from '@/lib/auth';
import { fdate, num, plantCost, round2, today } from '@/lib/rules/finance';
import { space } from '@/theme/theme';

type Row = Record<string, any>;

export default function FinPlant() {
  const { pid, site } = useLocalSearchParams<{ pid: string; site?: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: h, isLoading } = useQuery({ queryKey: ['finPlant', pid], enabled: pid !== 'new', queryFn: async () => (await fdb.from('fin_plant_hires').select('*').eq('id', pid).maybeSingle()).data as Row | null });
  if (!me) return null;
  if (pid !== 'new' && isLoading) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const siteId = h?.site_id || site || '';
  const c = h ? plantCost(h as never) : null;
  return (
    <ScrollView contentContainerStyle={{ padding: space.l }}>
      <Stack.Screen options={{ title: h ? h.item : 'Plant hire' }} />
      {c && <Muted style={{ marginBottom: 8 }}>{h?.off_hire ? `Off hire ${fdate(h.off_hire)}` : `On hire ${c.weeks} wk`} · cost so far £{c.cost.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</Muted>}
      <FinForm title={h ? 'Plant hire' : 'Add plant hire'}
        extra={h ? <>{!h.off_hire && <Button kind="ghost" title="Off-hire today" onPress={async () => {
        if (!(await fdb.from('fin_plant_hires').update({ off_hire: today() } as never).eq('id', h.id).select('id')).data?.length) { toast('Could not save — try again.'); return; }
        toast('Off hire from today'); ['finPlant', 'finPurchases', 'finBook'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] })); router.back();
      }} />}<AllocRow table="fin_plant_hires" row={h} /></> : null} initial={h || { on_hire: today(), rate_period: 'week', cost_from: 'rate' }} onClose={() => router.back()}
        fields={[
          { k: 'item', label: 'What’s on hire' }, { k: 'supplier_name', label: 'Supplier', half: true }, { k: 'hire_ref', label: 'Hire ref', half: true },
          { k: 'on_hire', label: 'On hire', kind: 'date', half: true }, { k: 'off_hire', label: 'Off hire (blank = still on hire)', kind: 'date', half: true },
          { k: 'rate', label: 'Hire rate £', kind: 'money', half: true }, { k: 'rate_period', label: 'Per', kind: 'choice', options: [['week', 'Week'], ['day', 'Day']], half: true },
          { k: 'cost_from', label: 'Cost comes from', kind: 'choice', options: [['rate', 'The hire rate'], ['invoices', 'The supplier’s invoices']] }, { k: 'notes', label: 'Notes', kind: 'multiline' },
        ]}
        onSave={async (v) => {
          const item = String(v.item).trim(), on = String(v.on_hire).trim(), off = String(v.off_hire || '').trim(), rate = num(v.rate);
          if (!item) return 'Say what’s on hire.';
          if (!on) return 'Enter the on-hire date.';
          if (rate === null || isNaN(rate)) return 'Enter the hire rate.';
          if (off && off < on) return 'Off-hire can’t be before on-hire.';
          const row = { item, supplier_name: String(v.supplier_name).trim() || null, hire_ref: String(v.hire_ref).trim() || null, on_hire: on, off_hire: off || null, rate: round2(rate), rate_period: v.rate_period || 'week', notes: String(v.notes).trim() || null, cost_from: v.cost_from || 'rate' };
          const r = h ? await fdb.from('fin_plant_hires').update(row as never).eq('id', h.id) : await fdb.from('fin_plant_hires').insert({ ...row, org_id: me.org_id, site_id: siteId, created_by: me.id } as never);
          if (r.error) return 'Could not save — try again.';
          toast(off ? `Saved — off hire ${fdate(off)}` : 'Saved');
          ['finPlant', 'finPurchases', 'finBook'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
          return null;
        }}
        onDelete={h ? async () => { if (!(await fdb.from('fin_plant_hires').delete().eq('id', h.id).select('id')).data?.length) return 'Could not remove.'; toast('Removed'); ['finPurchases', 'finBook'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] })); return null; } : undefined} />
    </ScrollView>
  );
}
