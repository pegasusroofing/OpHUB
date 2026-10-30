// Purchases › Yard stock (9219m): the full yard list with rates (Finance only)
// and stock value; add items, book stock in, issue to a job, take returns,
// adjust the count. A database trigger (yard_move_apply) keeps the qty right
// and puts the cost of issued stock on the job's costs.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { FinChip, FinPage, FinRow, FinStat } from '@/components/FinNav';
import { FinForm, type Field } from '@/components/FinForm';
import { confirmAsk, useToast } from '@/components/toast';
import { Button, Empty, Muted, SectionTitle } from '@/components/ui';
import { fdb, finStatus, selectAll } from '@/data/finance';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { fdate, money, round2 } from '@/lib/rules/finance';
import { yardLow, yardNum, yardQty, type YardItem } from '@/lib/rules/materials';
import { base, radius } from '@/theme/theme';

type Row = Record<string, any>;
type Item = YardItem & { notes?: string | null };
type Kind = 'in' | 'issue' | 'return' | 'adjust';
const YARD_CATS = ['Slates & tiles', 'Membranes & felt', 'Timber & battens', 'Lead & metals', 'Insulation', 'Fixings', 'Sealants & adhesives', 'Rainwater goods', 'Safety & PPE', 'Tools & sundries', 'Other'];
const YARD_KIND: Record<string, string> = { in: 'Booked in', issue: 'Issued', return: 'Returned', adjust: 'Count adjusted' };
const MOVE_TITLE: Record<Kind, string> = { in: 'Book stock into the yard', issue: 'Issue from the yard to a job', return: 'Return to the yard from a job', adjust: 'Adjust the yard count' };
const MOVE_SAVE: Record<Kind, string> = { in: 'Book in', issue: 'Issue to job', return: 'Return to yard', adjust: 'Save count' };

function useYardBook(orgId: string | null | undefined) {
  return useQuery({ queryKey: ['finYard', orgId], enabled: !!orgId, queryFn: async () => {
    const [items, rates] = await Promise.all([
      selectAll<Item>('yard_stock', '*', (x) => x.eq('org_id', orgId as string).order('item')),
      selectAll<Row>('yard_stock_rates', 'stock_id,rate', (x) => x.eq('org_id', orgId as string)),
    ]);
    const rateBy: Record<string, number> = {}; rates.forEach((r) => { if (r.rate != null) rateBy[r.stock_id] = Number(r.rate); });
    return { items, rateBy };
  } });
}

export default function FinYard() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { me } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useYardBook(me?.org_id);
  const { data: sites = [] } = useSites();
  const [edit, setEdit] = useState<Item | 'new' | null>(null);
  const [move, setMove] = useState<{ kind: Kind; stockId: string } | null>(null);
  if (!me) return null;
  const items = data?.items ?? [], rateBy = data?.rateBy ?? {};
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['finYard'] }); void qc.invalidateQueries({ queryKey: ['yard'] }); void qc.invalidateQueries({ queryKey: ['finYardMoves'] }); };
  const live = sites.filter((s) => finStatus(s) !== 'closed').sort((a, b) => String(b.job_number || '').localeCompare(String(a.job_number || ''), undefined, { numeric: true }));
  const jobName = (sid: string | null) => { const s = sites.find((x) => x.id === sid); return s ? `${s.job_number ? `${s.job_number} · ` : ''}${s.name}` : ''; };

  const saveItem = async (v: Record<string, string | boolean>) => {
    const item = String(v.item || '').trim(); if (!item) return 'Enter the item.';
    const min = String(v.min_qty || '').trim() ? yardNum(v.min_qty) : null;
    const rate = String(v.rate || '').trim() ? yardNum(v.rate) : null;
    const q0 = edit === 'new' ? yardNum(v.qty) : null;
    const row: Row = { item, unit: String(v.unit || '').trim() || null, category: String(v.category || '').trim() || null, location: String(v.location || '').trim() || null, min_qty: min, notes: String(v.notes || '').trim() || null, updated_at: new Date().toISOString() };
    let rec: Row | null;
    if (edit && edit !== 'new') {
      row.active = !v.off;
      const r = await fdb.from('yard_stock').update(row as never).eq('id', edit.id).select().maybeSingle(); if (r.error) return 'Could not save — try again.'; rec = r.data as Row;
    } else {
      const r = await fdb.from('yard_stock').insert({ org_id: me.org_id, created_by: me.id, qty: 0, ...row } as never).select().single(); if (r.error) return 'Could not save — try again.'; rec = r.data as Row;
    }
    if (!rec) return 'Could not save — try again.';
    let warn = '';
    if (rate != null) { const r = await fdb.from('yard_stock_rates').upsert({ stock_id: rec.id, org_id: me.org_id, rate, updated_at: new Date().toISOString(), updated_by: me.id } as never, { onConflict: 'stock_id' }); if (r.error) warn += ' — the rate didn’t save'; }
    if (edit === 'new' && q0) { const r = await fdb.from('yard_moves').insert({ org_id: me.org_id, stock_id: rec.id, kind: 'in', qty: Math.abs(q0), note: 'Opening stock', created_by: me.id } as never); if (r.error) warn += ' — the opening qty didn’t save, book it in'; }
    toast((edit === 'new' ? 'Added to yard stock' : 'Saved') + warn); refresh(); setEdit(null); return null;
  };

  const saveMove = async (v: Record<string, string | boolean>) => {
    if (!move) return null;
    const s = items.find((x) => x.id === v.stock); if (!s) return 'Choose the item.';
    const q = yardNum(v.qty);
    if (q == null || !(q >= 0) || (move.kind !== 'adjust' && !q)) return 'Enter the qty as a number.';
    const site = move.kind === 'issue' || move.kind === 'return' ? String(v.site || '') : null;
    if ((move.kind === 'issue' || move.kind === 'return') && !site) return 'Choose the job.';
    let have = Number(s.qty || 0);
    if (move.kind === 'adjust') { const f = (await fdb.from('yard_stock').select('qty').eq('id', s.id).maybeSingle()).data as Row | null; if (f) have = Number(f.qty || 0); }
    if (move.kind === 'issue' && q > have && !(await confirmAsk(`Only ${yardQty(have)} ${s.unit || ''} showing in the yard. Issue ${yardQty(q)} anyway? (The count will go below zero — adjust it after.)`, 'Issue anyway'))) return null;
    const qty = move.kind === 'adjust' ? round2(q - have) : q;
    if (move.kind === 'adjust' && !qty) return 'That’s the same as the current count.';
    const r = await fdb.from('yard_moves').insert({ org_id: me.org_id, stock_id: s.id, kind: move.kind, qty, site_id: site, note: String(v.note || '').trim() || null, created_by: me.id } as never);
    if (r.error) return 'Could not save — try again.';
    const after = have + (move.kind === 'issue' ? -q : qty);
    toast(`${YARD_KIND[move.kind]} — ${yardQty(after)} ${s.unit || ''} now in the yard${s.min_qty != null && after <= Number(s.min_qty) ? ' (low stock)' : ''}`);
    refresh(); setMove(null); return null;
  };

  const openMove = (kind: Kind, stockId = '') => {
    if (!items.some((s) => s.active !== false)) { toast('Add a yard stock item first.'); setEdit('new'); return; }
    // 9219zq: booking in uses the full form (supplier, PO, delivery note number and photo).
    if (kind === 'in') { router.push((stockId ? `/fin/yardin?stock=${stockId}` : '/fin/yardin') as never); return; }
    setMove({ kind, stockId });
  };
  const forms = (
    <>
      {edit && (
        <FinForm title={edit === 'new' ? 'New yard stock item' : edit.item} saveLabel={edit === 'new' ? 'Add item' : 'Save'} onClose={() => setEdit(null)} onSave={saveItem}
          initial={edit === 'new' ? {} : { ...edit, rate: rateBy[edit.id] ?? '', off: edit.active === false }}
          fields={([
            { k: 'item', label: 'Item *', ph: 'e.g. Code 4 lead 300mm' },
            { k: 'unit', label: 'Unit', ph: 'e.g. roll, m, box, each', half: true },
            { k: 'category', label: 'Category', kind: 'choice', options: [['', 'None'], ...YARD_CATS.map((c): [string, string] => [c, c])], half: true },
            { k: 'location', label: 'Location in the yard', ph: 'e.g. Rack B, container 2', half: true },
            ...(edit === 'new' ? [{ k: 'qty', label: 'Qty in the yard now', kind: 'number', ph: '0', half: true }] : []),
            { k: 'min_qty', label: 'Minimum level (low-stock alert)', kind: 'number', ph: 'Optional', half: true },
            { k: 'rate', label: `Rate £ per ${edit === 'new' ? 'unit' : edit.unit || 'unit'} (Finance only)`, kind: 'money', half: true },
            { k: 'notes', label: 'Notes', kind: 'multiline' },
            ...(edit === 'new' ? [] : [{ k: 'off', label: 'No longer stocked (hide from lists)', kind: 'check' }]),
          ] as Field[])} />
      )}
      {move && (
        <FinForm title={MOVE_TITLE[move.kind]} saveLabel={MOVE_SAVE[move.kind]} onClose={() => setMove(null)} onSave={saveMove} initial={{ stock: move.stockId }}
          note={move.kind === 'issue' ? 'Issued stock with a rate goes on the job’s costs (qty × rate).' : undefined}
          fields={([
            { k: 'stock', label: 'Item', kind: 'choice', options: items.filter((s) => s.active !== false).map((s): [string, string] => [s.id, `${s.item} — ${yardQty(s.qty)} ${s.unit || ''} in yard${yardLow(s) ? ' (low)' : ''}`]) },
            { k: 'qty', label: move.kind === 'adjust' ? 'Counted qty (what’s actually there)' : 'Qty', kind: 'number', half: true },
            ...(move.kind === 'issue' || move.kind === 'return' ? [{ k: 'site', label: 'Job', kind: 'choice', options: live.map((s): [string, string] => [s.id, jobName(s.id)]), half: true }] : []),
            { k: 'note', label: 'Note (optional)', ph: move.kind === 'in' ? 'e.g. delivery from SIG, leftover from 2653' : 'e.g. collected by Sam' },
          ] as Field[])} />
      )}
    </>
  );

  if (id) {
    const s = items.find((x) => x.id === id);
    return (
      <FinPage title={s?.item || 'Yard stock'} section="purchases" sub="yard">
        {isLoading ? <Muted>Loading…</Muted> : !s ? <Muted>Item not found.</Muted> : <ItemView s={s} rate={rateBy[s.id]} jobName={jobName} onEdit={() => setEdit(s)} onMove={(k) => openMove(k, s.id)} />}
        {forms}
      </FinPage>
    );
  }
  return (
    <FinPage title="Purchases" section="purchases" sub="yard" onSub={(k) => (k === 'yard' ? undefined : k === 'statements' ? router.replace('/fin/statements' as never) : router.replace(`/fin/purchases?tab=${k}` as never))}>
      <YardList items={items} rateBy={rateBy} loading={isLoading} onNew={() => setEdit('new')} onMove={openMove} />
      {forms}
    </FinPage>
  );
}

function YardList({ items, rateBy, loading, onNew, onMove }: { items: Item[]; rateBy: Record<string, number>; loading: boolean; onNew: () => void; onMove: (k: Kind, id?: string) => void }) {
  const [f, setF] = useState<'all' | 'low' | 'off'>('all');
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  const F = { all: (s: Item) => s.active !== false, low: (s: Item) => s.active !== false && yardLow(s), off: (s: Item) => s.active === false };
  const val = (s: Item) => (rateBy[s.id] != null ? rateBy[s.id] * Number(s.qty || 0) : 0);
  const total = items.filter(F.all).reduce((t, s) => t + val(s), 0);
  const cats = Array.from(new Set(items.map((s) => s.category).filter(Boolean) as string[])).sort();
  const t = q.trim().toLowerCase();
  const list = items.filter(F[f]).filter((s) => !cat || s.category === cat).filter((s) => !t || [s.item, s.category, s.location].join(' ').toLowerCase().includes(t));
  return (
    <>
      <Muted style={{ marginBottom: 8 }}>Materials held in the yard. Issue them to a job and the cost goes on that job (qty × rate). PMs can see the list and issue to their projects from Material Requests, but don’t see rates.</Muted>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <FinStat v={money(total)} label="Stock value (items with a rate)" /><FinStat v={String(items.filter(F.low).length)} label="Low stock" hot={items.some(F.low)} onPress={() => setF('low')} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <Button title="+ New item" onPress={onNew} /><Button kind="ghost" title="⬇ Book stock in" onPress={() => onMove('in')} /><Button kind="ghost" title="⬆ Issue to a job" onPress={() => onMove('issue')} />
        <Button kind="ghost" title="↩ Return from a job" onPress={() => onMove('return')} /><Button kind="ghost" title="Adjust a count" onPress={() => onMove('adjust')} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {([['all', 'In use'], ['low', 'Low stock'], ['off', 'Not stocked']] as const).map(([k, l]) => <FinChip key={k} on={f === k} label={l} n={items.filter(F[k]).length} onPress={() => setF(k)} />)}
      </View>
      {cats.length > 0 && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>{['', ...cats].map((c) => <FinChip key={c || 'all'} on={cat === c} label={c || 'All categories'} onPress={() => setCat(c)} />)}</View>}
      <TextInput value={q} onChangeText={setQ} placeholder="Search item or location" style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 9, color: base.ink, backgroundColor: base.card, marginBottom: 10 }} />
      {loading ? <Muted>Loading…</Muted> : list.length ? list.map((s) => (
        <FinRow key={s.id} title={s.item} sub={[`${yardQty(s.qty)} ${s.unit || ''} in yard${yardLow(s) ? ' · LOW' : ''}`, s.min_qty != null ? `min ${yardQty(s.min_qty)}` : '', s.category || '', s.location || '', rateBy[s.id] != null ? `${money(rateBy[s.id])}${s.unit ? ` / ${s.unit}` : ''}` : 'No rate'].filter(Boolean).join(' · ')}
          right={val(s) ? money(val(s)) : '—'} tone={yardLow(s) ? '#C0392B' : undefined} onPress={() => router.setParams({ id: s.id })} />
      )) : <Empty>{f === 'low' ? 'Nothing is below its minimum level.' : 'No yard stock yet — add the first item.'}</Empty>}
      {list.length > 0 && <Muted style={{ marginTop: 4 }}>{list.length} item{list.length === 1 ? '' : 's'} · {money(list.reduce((x, s) => x + val(s), 0))}</Muted>}
    </>
  );
}

function ItemView({ s, rate, jobName, onEdit, onMove }: { s: Item; rate?: number; jobName: (id: string | null) => string; onEdit: () => void; onMove: (k: Kind) => void }) {
  const { data: moves = [] } = useQuery({ queryKey: ['finYardMoves', s.id], queryFn: async () => ((await fdb.from('yard_moves').select('*').eq('stock_id', s.id).order('created_at', { ascending: false }).limit(50)).data as Row[] | null) ?? [] });
  return (
    <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <FinStat v={`${yardQty(s.qty)} ${s.unit || ''}`} label={`in the yard${s.min_qty != null ? ` · minimum ${yardQty(s.min_qty)}` : ''}${yardLow(s) ? ' · low stock' : ''}`} hot={yardLow(s)} />
        <FinStat v={rate != null ? money(rate) : 'No rate'} label={`per ${s.unit || 'unit'}`} hot={rate == null} />
        <FinStat v={rate != null ? money(rate * Number(s.qty || 0)) : '—'} label="Stock value" />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <Button kind="ghost" title="⬇ Book in" onPress={() => onMove('in')} /><Button kind="ghost" title="⬆ Issue to a job" onPress={() => onMove('issue')} />
        <Button kind="ghost" title="↩ Return" onPress={() => onMove('return')} /><Button kind="ghost" title="Adjust count" onPress={() => onMove('adjust')} /><Button title="Edit item" onPress={onEdit} />
      </View>
      {[s.category, s.location].some(Boolean) && <Muted style={{ marginBottom: 6 }}>{[s.category, s.location].filter(Boolean).join(' · ')}</Muted>}
      {s.notes ? <Muted style={{ marginBottom: 6 }}>{s.notes}</Muted> : null}
      {s.active === false && <Muted style={{ marginBottom: 6, color: '#C0392B' }}>No longer stocked.</Muted>}
      <SectionTitle>History</SectionTitle>
      {moves.length ? moves.map((m) => (
        <FinRow key={m.id} left={fdate(String(m.created_at).slice(0, 10))} title={`${YARD_KIND[m.kind] || m.kind} ${m.kind === 'adjust' && Number(m.qty) > 0 ? '+' : ''}${yardQty(m.qty)} ${s.unit || ''}`}
          sub={[jobName(m.site_id), m.supplier_name, m.ref, m.note, m.job_cost_id ? 'on the job’s costs' : ''].filter(Boolean).join(' · ')} />
      )) : <Empty>No moves yet.</Empty>}
    </>
  );
}
