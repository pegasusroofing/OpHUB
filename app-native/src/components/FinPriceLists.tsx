// Finance › Purchases › Price Lists (Andy, 14 Nov 2026: "Price lists should be one tab only, remove price book … per
// company so I can have a table view that opens up the supplier I choose"). One table of suppliers; tap one for
// everything priced from them in one table: their uploaded price lists' items (fin_quotes / fin_quote_items, every
// project) and the prices learned from their quotes and invoices or added by hand (fin_price_book, which prices new
// POs). The two only differ in where the price came from, which each row says.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { viewDoc } from '@/components/DocViewer';
import { PriceForm, type PB } from '@/components/FinPriceBook';
import { PriceListEdit, qLabel, uploadPriceFiles } from '@/components/FinPurchaseQuotes';
import { PhoneTable } from '@/components/PhoneTable';
import { chooseAction, confirmAsk, promptText, useToast } from '@/components/toast';
import { Button, Empty, Muted, SectionTitle } from '@/components/ui';
import { fdb, selectAll } from '@/data/finance';
import { openDocLink } from '@/data/hs';
import { useAuth } from '@/lib/auth';
import { fdate, money } from '@/lib/rules/finance';
import { base } from '@/theme/theme';

type Row = Record<string, any>;
const keyOf = (n: unknown) => String(n || '').trim().toLowerCase();
const rid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}${Math.random().toString(36).slice(2, 8)}`);
/** One priced item on a supplier's page: from a price list, or learned / added (the Price Book). */
type Price = { id: string; desc: string; code: string; unit: string; rate: number | null; from: string; date: string; list?: string; pb?: PB };
const SOURCE: Record<string, string> = { manual: 'By Hand', invoice: 'Invoice', quote: 'Quote', po: 'PO' };

function usePriceLists(orgId: string | null | undefined) {
  return useQuery({
    queryKey: ['finPriceLists', orgId], enabled: !!orgId,
    queryFn: async () => {
      const org = orgId as string;
      const [lists, items, book, sups] = await Promise.all([
        selectAll<Row>('fin_quotes', '*', (q) => q.eq('org_id', org).eq('purpose', 'pquote').is('site_id', null)),
        selectAll<Row>('fin_quote_items', '*', (q) => q.eq('org_id', org).eq('active', true).is('site_id', null)),
        selectAll<PB>('fin_price_book', '*', (q) => q.eq('org_id', org)),
        selectAll<Row>('suppliers', 'id,name', (q) => q.eq('org_id', org)),
      ]);
      return { lists, items, book, sups };
    },
  });
}

export function PriceLists({ sup }: { sup?: string }) {
  const { me } = useAuth();
  const { data } = usePriceLists(me?.org_id);
  if (!me || !data) return <Muted>Loading…</Muted>;
  return sup ? <SupplierPrices name={sup} data={data} /> : <Suppliers data={data} />;
}

const open = (name: string) => router.push({ pathname: '/fin/purchases', params: { tab: 'prices', sup: name } } as never);

/** Every supplier with prices: how many items, how many uploaded lists, when last updated. */
function Suppliers({ data }: { data: { lists: Row[]; items: Row[]; book: PB[]; sups: Row[] } }) {
  const listBy: Record<string, Row> = {}; data.lists.forEach((l) => { listBy[l.id] = l; });
  const by: Record<string, { name: string; items: number; lists: number; date: string }> = {};
  const add = (name: unknown, date: unknown, kind: 'item' | 'list') => {
    const k = keyOf(name); const n = String(name || '').trim() || 'No Supplier Named';
    const e = (by[k] = by[k] || { name: n, items: 0, lists: 0, date: '' });
    if (kind === 'item') e.items++; else e.lists++;
    const d = String(date || '').slice(0, 10); if (d > e.date) e.date = d;
  };
  data.lists.forEach((l) => add(l.supplier_name, l.quote_date || l.created_at, 'list'));
  data.items.forEach((i) => add(i.supplier_name || listBy[i.quote_id]?.supplier_name, '', 'item'));
  data.book.forEach((p) => add(p.supplier_name || p.supplier_key, p.updated_at, 'item'));
  const rows = Object.values(by).sort((a, b) => a.name.localeCompare(b.name, 'en-GB', { sensitivity: 'base' }));
  // A new supplier's list: pick them from the Directory (or type a new name), then their page opens to upload it.
  const addSupplier = async () => {
    const names = Array.from(new Set(data.sups.map((s) => String(s.name || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'en-GB', { sensitivity: 'base' }));
    const k = await chooseAction('Which Supplier?', [...names.map((n) => ({ key: n, label: n })), { key: '*new', label: '➕ Another Supplier' }]); if (!k) return;
    const name = k === '*new' ? (await promptText('The Supplier’s Name', ''))?.trim() : k;
    if (name) open(name);
  };
  return (
    <View>
      <Muted style={{ marginBottom: 8 }}>Each supplier’s prices: their price lists, and prices picked up from their quotes and invoices. New POs from the Materials tile are priced from here until the real price comes in. Tap a supplier to see their prices.</Muted>
      <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 10 }}><Button grow title="+ Add A Supplier’s Prices" onPress={() => void addSupplier()} /></View>
      {rows.length ? (
        <PhoneTable label="Price lists" rows={rows} keyOf={(r) => r.name} onRow={(r) => open(r.name)}
          cols={[
            { k: 's', l: 'Supplier', lines: 2, main: (r) => r.name, sub: (r) => (r.lists ? `${r.lists} Price List${r.lists === 1 ? '' : 's'}` : ''), sort: (r) => r.name.toLowerCase() },
            { k: 'n', l: 'Items', w: 56, center: true, main: (r) => String(r.items), sort: (r) => r.items, bigFirst: true },
            { k: 'd', l: 'Updated', w: 92, right: true, main: (r) => (r.date ? fdate(r.date) : '—'), sort: (r) => r.date || null },
          ]} />
      ) : <Empty>No prices yet. Add a supplier’s price list, or they’re picked up as quotes and invoices are read.</Empty>}
    </View>
  );
}

/** One supplier's page: their name, Upload / Add A Price, their uploaded lists, then every price as one table. */
function SupplierPrices({ name, data }: { name: string; data: { lists: Row[]; items: Row[]; book: PB[]; sups: Row[] } }) {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState('');
  const [editList, setEditList] = useState<string | null>(null);
  const [price, setPrice] = useState<PB | 'new' | null>(null);
  if (!me) return null;
  const k = keyOf(name);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['finPriceLists'] }); void qc.invalidateQueries({ queryKey: ['finPQuotes'] }); void qc.invalidateQueries({ queryKey: ['finPriceBook'] }); };
  const listBy: Record<string, Row> = {}; data.lists.forEach((l) => { listBy[l.id] = l; });
  const lists = data.lists.filter((l) => keyOf(l.supplier_name) === k).sort((a, b) => String(b.quote_date || b.created_at || '').localeCompare(String(a.quote_date || a.created_at || '')));
  const prices: Price[] = [
    ...data.items.filter((i) => keyOf(i.supplier_name || listBy[i.quote_id]?.supplier_name) === k).map((i): Price => ({ id: `l:${i.id}`, desc: String(i.description || ''), code: String(i.code || ''), unit: String(i.unit || ''), rate: i.rate != null ? Number(i.rate) : null, from: 'Price List', date: String(listBy[i.quote_id]?.quote_date || listBy[i.quote_id]?.created_at || '').slice(0, 10), list: i.quote_id })),
    ...data.book.filter((p) => keyOf(p.supplier_name || p.supplier_key) === k).map((p): Price => ({ id: `b:${p.id}`, desc: p.description, code: p.code || '', unit: p.unit || '', rate: Number(p.rate), from: SOURCE[p.source || 'manual'] || String(p.source), date: String(p.updated_at || '').slice(0, 10), pb: p })),
  ].sort((a, b) => a.desc.localeCompare(b.desc, 'en-GB', { sensitivity: 'base' }));
  const upload = async () => {
    const { added, skipped, picked } = await uploadPriceFiles(me, name, null, setBusy); if (!picked) return;
    refresh();
    if (skipped.length) toast(`Couldn’t read: ${skipped.join(', ')}. Upload price lists as Excel (.xlsx) or CSV — reading PDFs and photos is switched off while Finance is on trial.`);
    else if (!added) toast('Nothing found in those files.');
  };
  const listMenu = async (l: Row) => {
    const act = await chooseAction(qLabel(l), [
      { key: 'edit', label: '✎ Edit This List' },
      ...(l.file_path ? [{ key: 'file', label: `📄 View ${l.file_name || 'The File'}` }] : []),
      { key: 'dup', label: '⧉ Duplicate For Next Year' },
      { key: 'rm', label: 'Remove' },
    ]);
    if (act === 'edit') setEditList(l.id);
    if (act === 'file') { const u = await openDocLink('finance-docs', l.file_path); if (u) viewDoc(u, l.file_name || ''); else toast('Could not open the file.'); }
    if (act === 'dup') {
      const nid = rid();
      const ins = await fdb.from('fin_quotes').insert({ id: nid, org_id: me.org_id, site_id: null, purpose: 'pquote', supplier_id: l.supplier_id, supplier_name: l.supplier_name, file_path: l.file_path ?? null, quote_no: l.quote_no ? `${l.quote_no} (copy)` : 'Copy', quote_date: null, file_name: l.file_name, created_by: me.id } as never);
      if (ins.error) { toast('Could not duplicate it.'); return; }
      const its = ((await fdb.from('fin_quote_items').select('*').eq('quote_id', l.id).order('position')).data as Row[] | null) ?? [];
      if (its.length) await fdb.from('fin_quote_items').insert(its.map((i) => ({ org_id: me.org_id, quote_id: nid, site_id: null, supplier_name: i.supplier_name, code: i.code, description: i.description, unit: i.unit, rate: i.rate, position: i.position, active: true, created_by: me.id })) as never);
      refresh(); setEditList(nid);
    }
    if (act === 'rm') {
      if (!(await confirmAsk('Remove this price list from every project? Its items come off the list. POs already raised aren’t changed.', 'Remove'))) return;
      await fdb.from('fin_quote_items').update({ active: false } as never).eq('quote_id', l.id);
      if (!(await fdb.from('fin_quotes').delete().eq('id', l.id).select('id')).data?.length) toast('Could not remove it.');
      refresh();
    }
  };
  return (
    <View>
      <Text accessibilityRole="header" style={{ fontSize: 20, fontWeight: '700', color: base.ink, marginBottom: 10 }}>{name}</Text>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
        <Button grow oneLine busy={!!busy} title={busy || '📥 Upload Price List'} onPress={() => void upload()} />
        <Button grow oneLine kind="ghost" title="+ Add A Price" onPress={() => setPrice('new')} />
      </View>
      {editList && <PriceListEdit qid={editList} onClose={(saved) => { setEditList(null); if (saved) refresh(); }} />}
      {price && <PriceForm cur={price === 'new' ? null : price} supplier={name} onClose={() => setPrice(null)} />}
      {lists.length > 0 && (
        <>
          <SectionTitle>Price Lists</SectionTitle>
          <PhoneTable label="Their price lists" search={false} rows={lists} keyOf={(l) => l.id} onRow={(l) => void listMenu(l)}
            cols={[
              { k: 'l', l: 'List', lines: 2, main: (l) => l.quote_no || l.file_name || 'Price List', sub: (l) => (l.quote_no && l.file_name ? l.file_name : '') },
              { k: 'n', l: 'Items', w: 56, center: true, main: (l) => String(data.items.filter((i) => i.quote_id === l.id).length) },
              { k: 'd', l: 'Dated', w: 92, right: true, main: (l) => fdate(String(l.quote_date || l.created_at || '').slice(0, 10)) },
            ]} />
        </>
      )}
      <SectionTitle>Prices</SectionTitle>
      {prices.length ? (
        <PhoneTable label="Prices" rows={prices} keyOf={(p) => p.id} onRow={(p) => (p.pb ? setPrice(p.pb) : p.list ? setEditList(p.list) : undefined)}
          cols={[
            { k: 'i', l: 'Item', lines: 2, main: (p) => p.desc, sub: (p) => p.code, find: (p) => `${p.desc} ${p.code}`, sort: (p) => p.desc.toLowerCase() },
            { k: 'u', l: 'Unit', w: 50, center: true, main: (p) => p.unit || '—' },
            { k: 'p', l: 'Price', w: 96, right: true, bold: true, bigFirst: true, main: (p) => (p.rate != null ? money(p.rate) : '—'), sub: (p) => p.from, sort: (p) => p.rate,
              choose: { opts: [['', 'All'], ['list', 'Price Lists'], ['learned', 'Picked Up']], test: (p, v) => (v === 'list' ? !!p.list : !!p.pb) } },
          ]} />
      ) : <Empty>No prices from {name} yet. Upload their price list (Excel or CSV) or add a price.</Empty>}
    </View>
  );
}
