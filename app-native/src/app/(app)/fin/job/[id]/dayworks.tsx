// Day works register for one project (9219s): issued → approved or rejected;
// approved ones go onto the next application.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { FinForm } from '@/components/FinForm';
import { FinChip, FinRow, FinStat } from '@/components/FinNav';
import { useToast } from '@/components/toast';
import { Button, Empty, Muted } from '@/components/ui';
import { fdb, insertNumbered } from '@/data/finance';
import { useAuth } from '@/lib/auth';
import { fdate, money, num, round2, today } from '@/lib/rules/finance';
import { space } from '@/theme/theme';

type Row = Record<string, any>;
const ST: Record<string, [string, string]> = { issued: ['Issued', '#D98A00'], approved: ['Approved', '#1E7A3C'], rejected: ['Rejected', '#C0392B'] };

export default function FinDayworks() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState('all');
  const [edit, setEdit] = useState<Row | null>(null);
  const { data = [], isLoading } = useQuery({ queryKey: ['finDw', id], queryFn: async () => ((await fdb.from('fin_dayworks').select('*').eq('site_id', id).order('seq')).data as Row[] | null) ?? [] });
  if (!me) return null;
  const list = data.filter((d) => f === 'all' || d.status === f);
  const sum = (s: string) => round2(data.filter((d) => d.status === s).reduce((t, d) => t + Number(d.value || 0), 0));
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 900, width: '100%', alignSelf: 'center' }}>
      <Stack.Screen options={{ title: 'Day works' }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}><FinStat v={money(sum('approved'), 0)} label="Approved" /><FinStat v={money(sum('issued'), 0)} label="Issued, waiting" /><FinStat v={money(sum('rejected'), 0)} label="Rejected" /></View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {[['all', 'All'], ['issued', 'Issued'], ['approved', 'Approved'], ['rejected', 'Rejected']].map(([k, l]) => <FinChip key={k} on={f === k} label={l} n={data.filter((d) => k === 'all' || d.status === k).length} onPress={() => setF(k)} />)}
        <View style={{ marginLeft: 'auto' }}><Button title="+ Day work" onPress={() => setEdit({ status: 'issued', work_date: today() })} /></View>
      </View>
      {isLoading ? <Muted>Loading…</Muted> : list.length ? list.map((d) => <FinRow key={d.id} left={d.number} title={d.title} sub={[ST[d.status]?.[0], d.work_date ? fdate(d.work_date) : '', d.ref ? `sheet ${d.ref}` : '', d.cost_estimate != null ? `cost ${money(d.cost_estimate)}` : ''].filter(Boolean).join(' · ')} right={money(d.value)} tone={ST[d.status]?.[1]} onPress={() => setEdit(d)} />) : <Empty>No day works yet.</Empty>}
      <Muted style={{ marginTop: 8 }}>Approved day works go onto the next application for payment.</Muted>
      {edit && (
        <FinForm title={edit.id ? `${edit.number} · day work` : 'New day work'} initial={edit} onClose={() => setEdit(null)}
          fields={[{ k: 'title', label: 'Title', ph: 'e.g. Clear debris from gutters (2 men, 1 day)' }, { k: 'description', label: 'Description', kind: 'multiline' }, { k: 'work_date', label: 'Date of the work', kind: 'date', half: true }, { k: 'ref', label: 'Day work sheet ref', half: true }, { k: 'value', label: 'Value £', kind: 'money', half: true }, { k: 'cost_estimate', label: 'Our cost £', kind: 'money', half: true }, { k: 'status', label: 'Status', kind: 'choice', options: [['issued', 'Issued'], ['approved', 'Approved'], ['rejected', 'Rejected']] }, { k: 'notes', label: 'Notes', kind: 'multiline' }]}
          onSave={async (v) => {
            const title = String(v.title || '').trim(); if (!title) return 'Give it a title.';
            const n = (k: string) => { const x = num(v[k]); return x === null || isNaN(x) ? null : round2(x); };
            const status = String(v.status || 'issued');
            if (status === 'approved' && n('value') == null) return 'Add the approved value.';
            const row: Row = { title, description: String(v.description || '').trim() || null, work_date: String(v.work_date || '').trim() || null, ref: String(v.ref || '').trim() || null, value: n('value'), cost_estimate: n('cost_estimate'), status, notes: String(v.notes || '').trim() || null, updated_at: new Date().toISOString() };
            if (status === 'approved' && edit.status !== 'approved') row.approved_on = today();
            const ok = edit.id ? !(await fdb.from('fin_dayworks').update(row as never).eq('id', edit.id)).error : !!(await insertNumbered('fin_dayworks', { col: 'site_id', val: id }, (s) => `DW${String(s).padStart(3, '0')}`, { ...row, org_id: me.org_id, site_id: id, created_by: me.id }));
            if (!ok) return 'Could not save — try again.';
            toast(status === 'approved' ? 'Approved — it goes onto the next application' : 'Saved'); void qc.invalidateQueries({ queryKey: ['finDw'] }); return null;
          }}
          onDelete={edit.id ? async () => { if ((await fdb.from('fin_dayworks').delete().eq('id', edit.id)).error) return 'Could not delete.'; toast('Deleted'); void qc.invalidateQueries({ queryKey: ['finDw'] }); return null; } : undefined} />
      )}
    </ScrollView>
  );
}
