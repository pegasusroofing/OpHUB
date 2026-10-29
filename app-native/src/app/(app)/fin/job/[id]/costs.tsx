// Costs ledger for one project (910): every cost line by type, with totals; add, change or remove
// "other" costs with no purchase invoice (skips, fuel, travel, site set-up — fin_job_costs).
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { FinForm } from '@/components/FinForm';
import { FinChip, FinRow } from '@/components/FinNav';
import { showAlert, useToast } from '@/components/toast';
import { Button, Empty, Muted } from '@/components/ui';
import { useBook } from '@/data/finBook';
import { fdb } from '@/data/finance';
import { useAuth } from '@/lib/auth';
import { COST_CATS, forecast } from '@/lib/rules/finBook';
import { fdate, money, num, round2, today } from '@/lib/rules/finance';
import { page, space } from '@/theme/theme';

export default function FinCosts() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const { data } = useBook(me?.org_id, id);
  const [cat, setCat] = useState('all');
  const [edit, setEdit] = useState<Record<string, any> | 'new' | null>(null);
  const toast = useToast();
  const qc = useQueryClient();
  if (!data || !me) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const fc = forecast(data.book, id, data.settings);
  const list = fc.lines.filter((l) => cat === 'all' || l.cat === cat).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const tot = (k: string) => fc.lines.filter((l) => l.cat === k).reduce((t, l) => t + l.net, 0);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['finBook'] });
  // A line from fin_job_costs ("jc:<id>:…") opens the form; a yard-stock cost is changed from the stock.
  const openCost = (key: string) => {
    const x = (data.book.extra || []).find((r) => r.id === key.split(':')[1]); if (!x) return;
    if (x.supplier === 'Yard' && x.ref === 'YARD') { showAlert(`This cost came from yard stock (${x.description || ''}). To change it, issue or return the stock in Purchases › Yard stock (or the project’s Material Requests) — the cost updates itself.`); return; }
    setEdit(x);
  };
  const cur = edit && edit !== 'new' ? edit : null;
  return (
    <ScrollView contentContainerStyle={page(1000)}>
      <Stack.Screen options={{ title: 'Costs ledger' }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        <FinChip on={cat === 'all'} label={`All ${money(fc.costToDate + fc.committedTotal, 0)}`} onPress={() => setCat('all')} />
        {Object.entries(COST_CATS).map(([k, l]) => <FinChip key={k} on={cat === k} label={`${l} ${money(tot(k), 0)}`} onPress={() => setCat(k)} />)}
        <FinChip on={cat === 'committed'} label={`Ordered ${money(fc.committedTotal, 0)}`} onPress={() => setCat('committed')} />
        <View style={{ marginLeft: 'auto' }}><Button title="+ Add cost" onPress={() => setEdit('new')} /></View>
      </View>
      {list.length ? list.map((l) => <FinRow key={l.key} title={l.desc} sub={[l.date ? fdate(l.date) : '', COST_CATS[l.cat] || (l.cat === 'committed' ? `Ordered (${COST_CATS[l.ccat || 'materials']})` : l.cat), l.who, l.ref, l.status].filter(Boolean).join(' · ')} right={money(l.net)} onPress={l.go ? () => router.push(l.go as never) : l.key.startsWith('jc:') ? () => openCost(l.key) : undefined} />) : <Empty>No costs yet.</Empty>}
      {edit && (
        <FinForm title={cur ? 'Cost' : 'Add a cost'} note="For costs without a purchase invoice in OpHUB — skips, fuel, travel, accommodation, site set-up. (Company overheads are added automatically — Finance › Settings › Company overheads.)"
          initial={cur ? { ...cur } : { category: COST_CATS[cat] && cat !== 'labour' ? cat : 'overheads', cost_date: today() }} onClose={() => setEdit(null)}
          fields={[
            { k: 'category', label: 'Type', kind: 'choice', options: Object.entries(COST_CATS), half: true }, { k: 'cost_date', label: 'Date', kind: 'date', half: true },
            { k: 'description', label: 'Description' },
            { k: 'supplier', label: 'Supplier', half: true }, { k: 'ref', label: 'Ref', half: true },
            { k: 'net', label: 'Net £', kind: 'money', half: true }, { k: 'vat', label: 'VAT £', kind: 'money', half: true },
          ]}
          onSave={async (x) => {
            const desc = String(x.description ?? '').trim(), net = num(x.net), vat = num(x.vat);
            if (!desc) return 'Add a description.';
            if (net === null || isNaN(net)) return 'Enter the net amount.';
            const row = { category: String(x.category || 'overheads'), cost_date: String(x.cost_date || '').trim() || today(), description: desc, supplier: String(x.supplier ?? '').trim() || null, ref: String(x.ref ?? '').trim() || null, net: round2(net), vat: vat === null || isNaN(vat) ? 0 : round2(vat) };
            const r = cur ? await fdb.from('fin_job_costs').update(row as never).eq('id', cur.id) : await fdb.from('fin_job_costs').insert({ ...row, org_id: me.org_id, site_id: id, created_by: me.id } as never);
            if (r.error) return 'Could not save — try again.';
            toast('Saved'); refresh(); return null;
          }}
          onDelete={cur ? async () => { const r = await fdb.from('fin_job_costs').delete().eq('id', cur.id); if (r.error) return 'Could not remove — try again.'; toast('Removed'); refresh(); return null; } : undefined} />
      )}
      <Muted style={{ marginTop: 8 }}>All excl. VAT. Labour from sign-ins is only costed for PAYE staff with a day rate (People &amp; rates).</Muted>
    </ScrollView>
  );
}
