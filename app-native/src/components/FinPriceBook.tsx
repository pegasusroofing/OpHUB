// Purchases › Price book (915 renderFinPriceBook): each supplier's latest
// price for every item, learned from quotes and invoices, or added by hand.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { FinForm } from '@/components/FinForm';
import { FinRow } from '@/components/FinNav';
import { useToast } from '@/components/toast';
import { Button, Empty, Muted } from '@/components/ui';
import { fdb, selectAll } from '@/data/finance';
import { useAuth } from '@/lib/auth';
import { fdate, money, num } from '@/lib/rules/finance';
import { base, radius } from '@/theme/theme';

type PB = { id: string; supplier_name: string | null; supplier_key: string; description: string; code: string | null; unit: string | null; rate: number; source: string | null; updated_at: string };
const itemKey = (t: string) => String(t || '').toLowerCase().replace(/[^a-z0-9.]+/g, ' ').replace(/\s+/g, ' ').trim();

export function PriceBook() {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<PB | 'new' | null>(null);
  const { data: rows, isLoading } = useQuery({ queryKey: ['finPriceBook', me?.org_id], enabled: !!me, queryFn: async () => (await selectAll<PB>('fin_price_book', '*', (x) => x.eq('org_id', me?.org_id as string))).sort((a, b) => `${a.supplier_name} ${a.description}`.localeCompare(`${b.supplier_name} ${b.description}`)) });
  if (!me) return null;
  const ql = q.trim().toLowerCase();
  const list = (rows || []).filter((r) => !ql || `${r.supplier_name} ${r.description} ${r.code || ''}`.toLowerCase().includes(ql));
  const cur = edit && edit !== 'new' ? edit : null;
  return (
    <View>
      <View style={{ flexDirection: 'row', marginBottom: 8 }}><View style={{ marginLeft: 'auto' }}><Button title="+ Add a price" onPress={() => setEdit('new')} /></View></View>
      <Muted style={{ marginBottom: 8 }}>Each supplier&apos;s latest price for every item, learned from quotes and invoices. New POs from the Materials tile are priced from here as an estimate until the real price comes in.</Muted>
      <TextInput value={q} onChangeText={setQ} placeholder="Search supplier, item or code" style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 9, color: base.ink, backgroundColor: base.card, marginBottom: 10 }} />
      {isLoading ? <Muted>Loading…</Muted> : list.length ? list.map((r) => <FinRow key={r.id} title={r.description} sub={`${r.supplier_name || r.supplier_key}${r.code ? ` · ${r.code}` : ''} · from ${r.source || 'manual'} ${fdate(String(r.updated_at).slice(0, 10))}`} right={`${money(r.rate)} ${r.unit ? `per ${r.unit}` : 'each'}`} onPress={() => setEdit(r)} />)
        : <Empty>No prices yet — they&apos;re added as quotes and invoices are read.</Empty>}
      {edit && (
        <FinForm title={cur ? 'Price' : 'Add a price'} initial={cur || {}} onClose={() => setEdit(null)}
          fields={[{ k: 'supplier_name', label: 'Supplier' }, { k: 'description', label: 'Item' }, { k: 'code', label: 'Code', half: true }, { k: 'unit', label: 'Unit', ph: 'nr, m2, roll', half: true }, { k: 'rate', label: 'Price £ (excl. VAT)', kind: 'money' }]}
          onSave={async (v) => {
            const sup = String(v.supplier_name).trim(), desc = String(v.description).trim(), rate = num(v.rate);
            if (!sup || !desc) return 'Enter the supplier and item.';
            if (rate === null || isNaN(rate) || rate < 0) return 'Enter the price.';
            const row = { supplier_key: sup.toLowerCase(), supplier_name: sup, item_key: itemKey(desc), description: desc, code: String(v.code).trim() || null, unit: String(v.unit).trim() || null, rate: Math.round(rate * 10000) / 10000, source: 'manual', updated_at: new Date().toISOString() };
            const r = cur ? await fdb.from('fin_price_book').update(row as never).eq('id', cur.id) : await fdb.from('fin_price_book').insert({ ...row, org_id: me.org_id } as never);
            if (r.error) return 'Could not save — try again.';
            toast('Price saved'); void qc.invalidateQueries({ queryKey: ['finPriceBook'] }); return null;
          }}
          onDelete={cur ? async () => { if (!(await fdb.from('fin_price_book').delete().eq('id', cur.id).select('id')).data?.length) return 'Could not remove.'; toast('Removed'); void qc.invalidateQueries({ queryKey: ['finPriceBook'] }); return null; } : undefined} />
      )}
    </View>
  );
}
