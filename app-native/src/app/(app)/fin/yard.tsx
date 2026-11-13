// Purchases › Yard stock (9219m): the full yard list with rates (Finance only)
// and stock value; add items, book stock in, issue to a job, take returns,
// adjust the count. A database trigger (yard_move_apply) keeps the qty right
// and puts the cost of issued stock on the job's costs.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { FinFilterBar, type FilterSel } from '@/components/FinFilterBar';
import { FinPage, FinStat } from '@/components/FinNav';
import { Cell, FinTable } from '@/components/FinTable';
import { PhoneTable, usePhoneFind, type PCol } from '@/components/PhoneTable';
import { YardLeftovers } from '@/components/YardLeftovers';
import { PlantRegister } from '@/components/PlantRegister';
import { YardSubTabs } from '@/components/YardSubTabs';
import { PurchasesStats, usePurchaseBadges } from '@/components/FinPurchases';
import { FinForm, type Field } from '@/components/FinForm';
import { chooseAction, confirmAsk, useToast } from '@/components/toast';
import { Button, Empty, Muted, SectionTitle } from '@/components/ui';
import { fdb, finStatus, selectAll } from '@/data/finance';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { fdate, money, rateMoney, round2, round3 } from '@/lib/rules/finance';
import { yardLow, yardNum, yardQty, type YardItem } from '@/lib/rules/materials';
import { base, radius, useDesk } from '@/theme/theme';

type Row = Record<string, any>;
type Item = YardItem & { notes?: string | null };
// Two ways in and two ways out (Andy, 14 Nov 2026): ⬇ Book In is a new delivery or a return from a job; ⬆ Book Out is to
// a job, or lost (an admin only). Adjust count went (the Stock Take does counts). Lost is saved as a count change.
type Kind = 'in' | 'issue' | 'return' | 'adjust' | 'lost';
// An item opens as a page of its own, so Back (and Yard Stock in the trail) comes back to the list (Andy, 9 Nov 2026).
const openItem = (stockId: string) => router.push({ pathname: '/fin/yard', params: { id: stockId } } as never);
const YARD_CATS = ['Slates & tiles', 'Membranes & felt', 'Timber & battens', 'Lead & metals', 'Insulation', 'Fixings', 'Sealants & adhesives', 'Rainwater goods', 'Safety & PPE', 'Tools & sundries', 'Other'];
const YARD_KIND: Record<string, string> = { in: 'Booked In', issue: 'Booked Out To A Job', return: 'Returned From A Job', adjust: 'Count Adjusted' };
const isLost = (m: Row) => m.kind === 'adjust' && /^Lost\b/.test(String(m.note || ''));
const MOVE_TITLE: Record<Kind, string> = { in: 'Book Stock Into The Yard', issue: 'Book Out To A Job', return: 'Book In: Returned From A Job', adjust: 'Adjust The Yard Count', lost: 'Book Out As Lost' };
const MOVE_SAVE: Record<Kind, string> = { in: 'Book In', issue: 'Book Out', return: 'Book In', adjust: 'Save Count', lost: 'Book Out' };
const isAdminUser = (u: { role?: string | null } | null | undefined) => u?.role === 'admin' || u?.role === 'superadmin';

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
  const { id, sub } = useLocalSearchParams<{ id?: string; sub?: string }>();
  const badges = usePurchaseBadges();
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
  // What issuing will cost the job: the qty × the item's rate, as the database puts it on the job's costs.
  const issueCost = (stockId: string, q: unknown) => {
    const s = items.find((x) => x.id === stockId); if (!s) return 'Choose the item to see what it costs the job.';
    const rate = rateBy[s.id];
    if (rate == null) return 'No rate on this item, so nothing goes on the job’s costs. Add a rate to the item first.';
    const n = yardNum(q as string);
    return `${rateMoney(rate)} per ${s.unit || 'unit'} · ${n ? `Cost To The Job ${money(round2(n * rate))}` : 'enter the qty to see the cost'}`;
  };

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
    if (move.kind === 'lost' && !isAdminUser(me)) return 'Only an admin can book stock out as lost.';
    const site = move.kind === 'issue' || move.kind === 'return' ? String(v.site || '') : null;
    if ((move.kind === 'issue' || move.kind === 'return') && !site) return 'Choose the job.';
    let have = Number(s.qty || 0);
    if (move.kind === 'adjust' || move.kind === 'lost') { const f = (await fdb.from('yard_stock').select('qty').eq('id', s.id).maybeSingle()).data as Row | null; if (f) have = Number(f.qty || 0); }
    if ((move.kind === 'issue' || move.kind === 'lost') && q > have && !(await confirmAsk(`Only ${yardQty(have)} ${s.unit || ''} showing in the yard. Book out ${yardQty(q)} anyway? (The count will go below zero.)`, 'Book Out Anyway'))) return null;
    const qty = move.kind === 'adjust' ? round3(q - have) : move.kind === 'lost' ? -q : q;
    if (move.kind === 'adjust' && !qty) return 'That’s the same as the current count.';
    const note = String(v.note || '').trim();
    // Lost is a count change marked "Lost", so the history shows it as Booked Out As Lost; nothing goes on a job.
    const r = await fdb.from('yard_moves').insert({ org_id: me.org_id, stock_id: s.id, kind: move.kind === 'lost' ? 'adjust' : move.kind, qty, site_id: site, note: move.kind === 'lost' ? `Lost${note ? `: ${note}` : ''}` : note || null, created_by: me.id } as never);
    if (r.error) return 'Could not save — try again.';
    const after = have + (move.kind === 'issue' ? -q : qty);
    toast(`${move.kind === 'lost' ? 'Booked Out As Lost' : YARD_KIND[move.kind]}: ${yardQty(after)} ${s.unit || ''} now in the yard${s.min_qty != null && after <= Number(s.min_qty) ? ' (low stock)' : ''}`);
    refresh(); setMove(null); return null;
  };

  const openMove = (kind: Kind, stockId = '') => {
    if (!items.some((s) => s.active !== false)) { toast('Add a yard stock item first.'); setEdit('new'); return; }
    // 9219zq: booking in uses the full form (supplier, PO, delivery note number and photo).
    if (kind === 'in') { router.push((stockId ? `/fin/yardin?stock=${stockId}` : '/fin/yardin') as never); return; }
    setMove({ kind, stockId });
  };
  // ⬇ Book In: a new delivery, or a return from a job. ⬆ Book Out: to a job, or lost (an admin only sees that).
  const bookIn = async (stockId = '') => { const k = await chooseAction('Book In', [{ key: 'in', label: 'New Delivery' }, { key: 'return', label: 'Returned From A Job' }]); if (k) openMove(k as Kind, stockId); };
  const bookOut = async (stockId = '') => {
    if (!isAdminUser(me)) { openMove('issue', stockId); return; }
    const k = await chooseAction('Book Out', [{ key: 'issue', label: 'To A Job' }, { key: 'lost', label: 'Lost Or Damaged' }]); if (k) openMove(k as Kind, stockId);
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
          note={move.kind === 'issue' ? 'Stock booked out to a job with a price goes on the job’s costs (qty × price).' : move.kind === 'lost' ? 'It comes off the yard count and goes on no job.' : undefined}
          fields={(v) => ([
            { k: 'stock', label: 'Item', kind: 'choice', options: items.filter((s) => s.active !== false).map((s): [string, string] => [s.id, `${s.item}: ${yardQty(s.qty)} ${s.unit || ''} In The Yard${yardLow(s) ? ' (Low)' : ''}`]) },
            // Issuing: the rate and what it will cost the job, as the qty is typed (Andy, 9 Nov 2026).
            { k: 'qty', label: move.kind === 'adjust' ? 'Counted Qty (What’s Actually There)' : move.kind === 'lost' ? 'Qty Lost' : 'Qty', kind: 'number', half: true, note: move.kind === 'issue' ? issueCost(String(v.stock || ''), v.qty) : undefined },
            ...(move.kind === 'issue' || move.kind === 'return' ? [{ k: 'site', label: 'Job', kind: 'choice', options: live.map((s): [string, string] => [s.id, jobName(s.id)]), half: true }] : []),
            { k: 'note', label: move.kind === 'lost' ? 'What Happened (Optional)' : 'Note (Optional)', ph: move.kind === 'lost' ? 'e.g. damaged, stolen' : move.kind === 'in' ? 'e.g. delivery from SIG, leftover from 2653' : 'e.g. collected by Sam' },
          ] as Field[])} />
      )}
    </>
  );

  // The Purchases tabs stay on every yard page, an item's too (Andy, 9 Nov 2026: "I also lose the tabs").
  const onSub = (k: string) => (k === 'yard' ? (id ? router.replace('/fin/yard' as never) : undefined) : k === 'statements' ? router.replace('/fin/statements' as never) : router.replace(`/fin/purchases?tab=${k}` as never));
  if (id) {
    const s = items.find((x) => x.id === id);
    return (
      <FinPage title={s?.item || 'Yard stock'} section="purchases" badges={badges} sub="yard" onSub={onSub}>
        <YardSubTabs on="stock" />
        {isLoading ? <Muted>Loading…</Muted> : !s ? <Muted>Item not found.</Muted> : <ItemView s={s} rate={rateBy[s.id]} jobName={jobName} onEdit={() => setEdit(s)} onIn={() => void bookIn(s.id)} onOut={() => void bookOut(s.id)} />}
        {forms}
      </FinPage>
    );
  }
  return (
    <FinPage title="Purchases" section="purchases" badges={badges} sub="yard" top={<PurchasesStats />} onSub={onSub}>
      <YardSubTabs on={sub === 'plant' ? 'plant' : 'stock'} />
      {sub === 'plant' ? <PlantRegister /> : <><YardLeftovers />
      <YardList items={items} rateBy={rateBy} loading={isLoading} onNew={() => setEdit('new')} onIn={() => void bookIn()} onOut={() => void bookOut()} onIssue={(sid) => openMove('issue', sid)} /></>}
      {forms}
    </FinPage>
  );
}

function YardList({ items, rateBy, loading, onNew, onIn, onOut, onIssue }: { items: Item[]; rateBy: Record<string, number>; loading: boolean; onNew: () => void; onIn: () => void; onOut: () => void; onIssue: (id: string) => void }) {
  const [sel, setSel] = useState<FilterSel>({ show: ['all'], cat: [] });
  const [sort, setSort] = useState('as');
  const desk = useDesk(); // laptop: the current app's yard table with an Issue button on each row (9219m; cmp-fin 5 Nov 2026)
  const f = (sel.show[0] || 'all') as 'all' | 'low' | 'off';
  const [q, setQ] = useState('');
  const F = { all: (s: Item) => s.active !== false, low: (s: Item) => s.active !== false && yardLow(s), off: (s: Item) => s.active === false };
  const val = (s: Item) => (rateBy[s.id] != null ? rateBy[s.id] * Number(s.qty || 0) : 0);
  const total = items.filter(F.all).reduce((t, s) => t + val(s), 0);
  const cats = Array.from(new Set(items.map((s) => s.category).filter(Boolean) as string[])).sort();
  const t = q.trim().toLowerCase();
  const sorter: Record<string, (a: Item, b: Item) => number> = { as: () => 0, az: (a, b) => a.item.localeCompare(b.item), qty: (a, b) => Number(b.qty || 0) - Number(a.qty || 0), val: (a, b) => val(b) - val(a) };
  const list = items.filter(F[f]).filter((s) => !sel.cat.length || sel.cat.includes(s.category || '')).filter((s) => !t || [s.item, s.category, s.location].join(' ').toLowerCase().includes(t)).slice().sort(sorter[sort]);
  // The phone table (Andy, 14 Nov 2026): just the item, the qty in stock, the price per unit and the value; the rest is on
  // the item's own page. Tap a heading to sort, a box under each; ▾ In Use / Low Stock / Not Stocked under In Stock.
  const pcols: PCol<Item>[] = [
    { k: 'i', l: 'Item', lines: 2, main: (s) => s.item, sort: (s) => s.item.toLowerCase(), find: (s) => `${s.item} ${s.category || ''} ${s.location || ''}` },
    { k: 'q', l: 'In Stock', w: 62, center: true, main: (s) => yardQty(s.qty), sub: (s) => s.unit || '', tone: (s) => (yardLow(s) ? '#C0392B' : undefined), sort: (s) => Number(s.qty || 0),
      choose: { opts: [['', 'All'], ['all', 'In Use'], ['low', 'Low Stock'], ['off', 'Not Stocked']], test: (s, v) => (F[v as 'all'] ? F[v as 'all'](s) : true), start: 'all' } },
    { k: 'r', l: 'Unit Price', w: 68, right: true, bigFirst: true, main: (s) => (rateBy[s.id] != null ? money(rateBy[s.id]) : '—'), sort: (s) => rateBy[s.id] ?? null },
    { k: 'v', l: 'Value', w: 76, right: true, bold: true, bigFirst: true, main: (s) => (val(s) ? money(val(s)) : '—'), sort: (s) => val(s) },
  ];
  const find = usePhoneFind(pcols, items, !desk);
  const btn = { small: true, grow: true, oneLine: true } as const;
  return (
    <>
      <Muted style={{ marginBottom: 8 }}>Materials held in the yard. Book them out to a job and the cost goes on that job (qty × price). PMs can see the list and book out to their projects from Material Requests, but don’t see prices.</Muted>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <FinStat v={money(total)} label="Stock Value (Items With A Price)" />
        <FinStat v={String(items.filter(F.low).length)} label="Low Stock" hot={items.some(F.low)} onPress={() => (desk ? setSel({ ...sel, show: ['low'] }) : find.setPick({ ...find.pick, q: 'low' }))} />
      </View>
      {/* One row of buttons (Andy, 14 Nov 2026): Return is under Book In, Lost under Book Out; Adjust count went. */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 10 }}>
        <Button {...btn} title="+ New Item" onPress={onNew} /><Button {...btn} kind="ghost" title="⬇ Book In" onPress={onIn} />
        <Button {...btn} kind="ghost" title="⬆ Book Out" onPress={onOut} /><Button {...btn} kind="ghost" title="Stock Take" onPress={() => router.push('/yardcount' as never)} />
      </View>
      {desk && <FinFilterBar search={{ value: q, onChange: setQ, placeholder: 'Search item or location' }} sel={sel} onChange={(n) => setSel({ ...n, show: n.show.length ? n.show : ['all'] })} onClear={() => setSel({ show: ['all'], cat: [] })}
        sorts={[['as', 'Category order'], ['az', 'Item A to Z'], ['qty', 'Most in the yard'], ['val', 'Highest value']]} sort={sort} onSort={setSort}
        parts={[
          { key: 'show', label: 'Show', single: true, items: ([['all', 'In use'], ['low', 'Low stock'], ['off', 'Not stocked']] as const).map(([v, l]) => ({ v, l, n: items.filter(F[v]).length })) },
          { key: 'cat', label: 'Category', items: cats.map((c) => ({ v: c, l: c })) },
        ]} />}
      {loading ? <Muted>Loading…</Muted> : desk && list.length ? (
        <FinTable rows={list} keyOf={(s) => s.id} onRow={(s) => openItem(s.id)}
          cols={[
            { k: 'i', l: 'Item', flex: 1.6, min: 160, render: (s: Item) => <Cell bold>{s.item}</Cell> },
            { k: 'c', l: 'Category', render: (s: Item) => <Cell>{s.category || '—'}</Cell> },
            { k: 'loc', l: 'Location', render: (s: Item) => <Cell>{s.location || '—'}</Cell> },
            { k: 'q', l: 'In Yard', sort: (s: Item) => Number(s.qty || 0), render: (s: Item) => <Cell bold tone={yardLow(s) ? '#C0392B' : undefined}>{yardQty(s.qty)} {s.unit || ''}{yardLow(s) ? ' · LOW' : ''}</Cell> },
            { k: 'm', l: 'Min', render: (s: Item) => <Cell>{s.min_qty != null ? yardQty(s.min_qty) : '—'}</Cell> },
            { k: 'r', l: 'Rate', render: (s: Item) => (rateBy[s.id] != null ? <Cell>{money(rateBy[s.id])}{s.unit ? ` / ${s.unit}` : ''}</Cell> : <Text style={{ fontSize: 11, fontWeight: '600', color: '#92400E', backgroundColor: '#FEF3C7', borderRadius: 999, paddingVertical: 2, paddingHorizontal: 8, overflow: 'hidden' }}>● No rate</Text>) },
            { k: 'v', l: 'Value', sort: (s: Item) => val(s), total: (rows: Item[]) => money(rows.reduce((x, s) => x + val(s), 0)), render: (s: Item) => <Cell>{val(s) ? money(val(s)) : '—'}</Cell> },
            { k: 'go', l: '', noSort: true, min: 70, flex: 0.6, render: (s: Item) => s.active === false ? null : <Pressable onPress={() => onIssue(s.id)} accessibilityRole="button" accessibilityLabel={`Issue ${s.item}`} style={{ borderWidth: 1, borderColor: base.line, borderRadius: 7, paddingVertical: 5, paddingHorizontal: 12, backgroundColor: '#fff' }}><Text style={{ fontSize: 12.5, fontWeight: '600', color: base.ink }}>Issue</Text></Pressable> },
          ]}
          footLabel={(rows) => `${rows.length} shown`} />
      ) : desk && !list.length ? <Empty>{f === 'low' ? 'Nothing is below its minimum level.' : 'No yard stock yet — add the first item.'}</Empty>
        : items.length ? <PhoneTable label="Yard stock" cols={pcols} rows={items} keyOf={(s) => s.id} onRow={(s) => openItem(s.id)} find={find}
          foot={find.shown.length ? <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: '#EEF0F2', backgroundColor: '#F6F7F9' }}><Text style={{ fontSize: 11.5, color: base.slate }}>{find.shown.length} Item{find.shown.length === 1 ? '' : 's'}</Text><Text style={{ fontSize: 11.5, fontWeight: '500', color: base.slate }}>Value {money(find.shown.reduce((x, s) => x + val(s), 0))}</Text></View> : undefined} />
        : <Empty>No yard stock yet — add the first item.</Empty>}
      {desk && list.length > 0 && <Muted style={{ marginTop: 4 }}>Stock value {money(total)} (items with a rate).</Muted>}
    </>
  );
}

/** One yard item (Andy, 14 Nov 2026): its name at the top, its details as a plain table (in the yard, minimum, location…),
 *  ⬇ Book In and ⬆ Book Out on one row, then its history as a table. */
function ItemView({ s, rate, jobName, onEdit, onIn, onOut }: { s: Item; rate?: number; jobName: (id: string | null) => string; onEdit: () => void; onIn: () => void; onOut: () => void }) {
  const { data: moves = [] } = useQuery({ queryKey: ['finYardMoves', s.id], queryFn: async () => ((await fdb.from('yard_moves').select('*').eq('stock_id', s.id).order('created_at', { ascending: false }).limit(50)).data as Row[] | null) ?? [] });
  const unit = s.unit || '';
  const rows: [string, string, string?][] = [
    ['In The Yard', `${yardQty(s.qty)} ${unit}`.trim(), yardLow(s) ? '#C0392B' : undefined],
    ['Minimum Level', s.min_qty != null ? `${yardQty(s.min_qty)} ${unit}`.trim() : 'None Set'],
    ['Status', s.active === false ? 'No Longer Stocked' : yardLow(s) ? 'Low Stock' : 'In Stock', s.active === false || yardLow(s) ? '#C0392B' : undefined],
    ['Unit Price', rate != null ? `${rateMoney(rate)}${unit ? ` Per ${unit}` : ''}` : 'No Price Yet'],
    ['Stock Value', rate != null ? money(rate * Number(s.qty || 0)) : '—'],
    ['Location', s.location || '—'],
    ['Category', s.category || '—'],
    ...(s.notes ? [['Notes', s.notes] as [string, string]] : []),
  ];
  const moveWord = (m: Row) => (isLost(m) ? 'Booked Out As Lost' : YARD_KIND[m.kind] || m.kind);
  return (
    <>
      <Text accessibilityRole="header" style={{ fontSize: 20, fontWeight: '700', color: base.ink, marginBottom: 10 }}>{s.item}</Text>
      <View accessibilityLabel="Item details" style={{ backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: 12, overflow: 'hidden', marginBottom: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#F6F7F9' }}>
          <Text style={{ flex: 1, fontSize: 10.5, fontWeight: '700', color: base.slate, letterSpacing: 0.3 }}>DETAILS</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Edit item" hitSlop={8} onPress={onEdit}><Text style={{ fontSize: 13, fontWeight: '600', color: base.ink }}>✎ Edit</Text></Pressable>
        </View>
        {rows.map(([l, v, tone]) => (
          <View key={l} style={{ flexDirection: 'row', gap: 10, paddingVertical: 9, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: '#EEF0F2' }}>
            <Text style={{ width: 118, fontSize: 13, color: base.slate }}>{l}</Text>
            <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: tone || base.ink, textAlign: 'right' }}>{v}</Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 14 }}>
        <Button grow oneLine kind="ghost" title="⬇ Book In" onPress={onIn} /><Button grow oneLine kind="ghost" title="⬆ Book Out" onPress={onOut} />
      </View>
      <SectionTitle>History</SectionTitle>
      {moves.length ? (
        <PhoneTable label="Yard history" search={false} rows={moves} keyOf={(m) => m.id}
          cols={[
            { k: 'd', l: 'Date', w: 82, main: (m) => fdate(String(m.created_at).slice(0, 10)) },
            { k: 'm', l: 'Move', lines: 2, main: (m) => moveWord(m), sub: (m) => [jobName(m.site_id), m.supplier_name, m.ref, isLost(m) ? String(m.note).replace(/^Lost:?\s*/, '') : m.note, m.job_cost_id ? 'On The Job’s Costs' : ''].filter(Boolean).join(' · ') },
            { k: 'q', l: 'Qty', w: 70, right: true, bold: true, main: (m) => `${m.kind === 'issue' ? '−' : Number(m.qty) > 0 ? '+' : ''}${yardQty(m.kind === 'issue' ? Math.abs(Number(m.qty)) : m.qty)} ${unit}`.trim() },
          ]} />
      ) : <Empty>No moves yet.</Empty>}
    </>
  );
}
