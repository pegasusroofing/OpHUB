// Purchase Quotes (9219z) and editing a price list (9219zd). On a project: its own supplier quotes plus
// the yearly price lists that apply to every project; tick items and raise a PO from them. In Finance ›
// Purchases › Price lists: the every-project lists. Upload reads Excel / CSV here (reading a PDF or photo
// waits for the end of the Finance trial). Edit a list (supplier, ref, date, every line) or duplicate it
// for next year. Tables: fin_quotes (purpose 'pquote', no project = every project) + fin_quote_items.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { DateBox } from '@/components/DateField';
import { FinChip } from '@/components/FinNav';
import { SelectBox } from '@/components/SelectBox';
import { SuggestField } from '@/components/SuggestField';
import { confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted, SectionTitle } from '@/components/ui';
import { fdb } from '@/data/finance';
import { useAuth } from '@/lib/auth';
import { bestSheet, guessColumns, importRows } from '@/lib/rules/boqImport';
import { fdate, money, num } from '@/lib/rules/finance';
import { csvRows, readXlsx } from '@/lib/rules/xlsxRead';
import { base, radius } from '@/theme/theme';

type Row = Record<string, any>;
const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, paddingHorizontal: 8, paddingVertical: 6, color: base.ink, backgroundColor: base.card };
const rid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}${Math.random().toString(36).slice(2, 8)}`);
const qLabel = (q: Row) => [q.supplier_name, q.quote_no].filter(Boolean).join(' · ') || q.file_name || 'Quote';

export function PurchaseQuotes({ siteId }: { siteId?: string }) {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const key = ['finPQuotes', me?.org_id, siteId || 'all'];
  const { data } = useQuery({
    queryKey: key, enabled: !!me,
    queryFn: async () => {
      const org = me?.org_id as string;
      const qq = fdb.from('fin_quotes').select('*').eq('org_id', org).eq('purpose', 'pquote');
      const ii = fdb.from('fin_quote_items').select('*').eq('org_id', org).eq('active', true);
      const [quotes, items] = await Promise.all([
        (siteId ? qq.or(`site_id.eq.${siteId},site_id.is.null`) : qq.is('site_id', null)).order('created_at', { ascending: false }),
        (siteId ? ii.or(`site_id.eq.${siteId},site_id.is.null`) : ii.is('site_id', null)).order('position'),
      ]);
      return { quotes: (quotes.data as Row[] | null) ?? [], items: (items.data as Row[] | null) ?? [] };
    },
  });
  const [scope, setScope] = useState<'project' | 'all'>(siteId ? 'project' : 'all');
  const [sup, setSup] = useState('');
  const [filter, setFilter] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');
  const [edit, setEdit] = useState<string | null>(null);
  if (!me || !data) return <Muted>Loading…</Muted>;
  const refresh = () => void qc.invalidateQueries({ queryKey: ['finPQuotes'] });
  const qBy: Record<string, Row> = {}; data.quotes.forEach((x) => { qBy[x.id] = x; });
  const order: Record<string, number> = {}; data.quotes.forEach((x, i) => { order[x.id] = (x.site_id ? 0 : 1000) + i; });
  const ql = q.trim().toLowerCase();
  const shown = data.items.filter((i) => (!filter || i.quote_id === filter) && (!ql || `${i.description} ${i.code || ''}`.toLowerCase().includes(ql))).sort((a, b) => (order[a.quote_id] ?? 9999) - (order[b.quote_id] ?? 9999) || Number(a.position || 0) - Number(b.position || 0));
  const ticked = data.items.filter((i) => sel.has(i.id));

  const upload = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: true, copyToCacheDirectory: true }); if (r.canceled || !r.assets.length) return;
    const all = scope === 'all' || !siteId;
    let added = 0; const skipped: string[] = [];
    for (let n = 0; n < r.assets.length; n++) {
      const a = r.assets[n], nm = a.name || 'quote';
      if (!/\.(xlsx|csv)$/i.test(nm)) { skipped.push(nm); continue; }
      setBusy(`Reading ${n + 1} of ${r.assets.length}…`);
      try {
        const bytes = new Uint8Array(await (await fetch(a.uri)).arrayBuffer());
        const sheet = /\.csv$/i.test(nm) ? { name: 'CSV', rows: csvRows(new TextDecoder().decode(bytes)) } : bestSheet(await readXlsx(bytes));
        if (!sheet) { skipped.push(nm); continue; }
        const g = guessColumns(sheet.rows);
        const lines = importRows(sheet.rows, g.header, g.cols).filter((l) => l.kind === 'item' && l.description);
        if (!lines.length) { skipped.push(nm); continue; }
        const qid = rid();
        const ins = await fdb.from('fin_quotes').insert({ id: qid, org_id: me.org_id, site_id: all ? null : siteId, purpose: 'pquote', supplier_name: sup.trim() || null, file_name: nm, created_by: me.id } as never);
        if (ins.error) { skipped.push(nm); continue; }
        await fdb.from('fin_quote_items').insert(lines.map((l, i) => ({ org_id: me.org_id, quote_id: qid, site_id: all ? null : siteId, supplier_name: sup.trim() || null, code: l.ref ? String(l.ref).slice(0, 60) : null, description: String(l.description).slice(0, 300), unit: l.unit || null, rate: l.rate ?? null, position: i, active: true, created_by: me.id })) as never);
        added++;
      } catch { skipped.push(nm); }
    }
    setBusy(''); refresh();
    if (skipped.length) toast(`Couldn’t read: ${skipped.join(', ')}. Upload quotes as Excel (.xlsx) or CSV — reading PDFs and photos is switched off while Finance is on trial.`);
    else if (!added) toast('Nothing found in those files.');
  };
  const raise = () => {
    if (!siteId) return;
    // 9219z finPqRaisePo: a PO goes to one supplier, so the ticked items must all be theirs.
    if (new Set(ticked.map((i) => String(i.supplier_name || '').trim().toLowerCase())).size > 1) { toast('Tick items from one supplier at a time.'); return; }
    router.push(`/fin/po/new?site=${siteId}&items=${ticked.map((i) => i.id).join(',')}` as never);
    setSel(new Set());
  };

  return (
    <View>
      <Card>
        <SectionTitle>{siteId ? 'Purchase Quotes' : 'Price lists (every project)'}</SectionTitle>
        <Muted style={{ marginBottom: 8 }}>{siteId ? 'Supplier quotes for this project, and your yearly price lists that apply to every project. Tick items and raise a PO from them.' : 'Your main suppliers’ yearly price lists. Their items show under every project’s Purchase Quotes.'}</Muted>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {siteId && <SelectBox value={scope} title="Who it's for" options={[['project', 'This project'], ['all', 'All projects (price list)']]} onChange={setScope} style={{ marginBottom: 0, width: 200 }} />}
          <TextInput value={sup} onChangeText={setSup} placeholder="Supplier name" style={[box, { minWidth: 180 }]} />
          <Button small busy={!!busy} title={busy || '📥 Upload quotes (Excel / CSV)'} onPress={() => void upload()} />
        </View>
      </Card>
      {data.quotes.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          <FinChip on={!filter} label={`All (${data.items.length})`} onPress={() => setFilter('')} />
          {data.quotes.map((x) => <FinChip key={x.id} on={filter === x.id} label={`${qLabel(x)}${x.site_id ? '' : ' · all projects'} (${data.items.filter((i) => i.quote_id === x.id).length})`} onPress={() => setFilter(x.id)} />)}
        </View>
      )}
      {!!filter && qBy[filter] && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          <Button small kind="ghost" title="✎ Edit this list" onPress={() => setEdit(filter)} />
          <Button small kind="ghost" title="⧉ Duplicate" onPress={async () => {
            const src = qBy[filter], nid = rid();
            const ins = await fdb.from('fin_quotes').insert({ id: nid, org_id: me.org_id, site_id: src.site_id, purpose: 'pquote', supplier_id: src.supplier_id, supplier_name: src.supplier_name, quote_no: src.quote_no ? `${src.quote_no} (copy)` : 'Copy', quote_date: null, file_name: src.file_name, created_by: me.id } as never);
            if (ins.error) { toast('Could not duplicate it.'); return; }
            const its = ((await fdb.from('fin_quote_items').select('*').eq('quote_id', filter).order('position')).data as Row[] | null) ?? [];
            if (its.length) await fdb.from('fin_quote_items').insert(its.map((i) => ({ org_id: me.org_id, quote_id: nid, site_id: src.site_id, supplier_name: i.supplier_name, code: i.code, description: i.description, unit: i.unit, rate: i.rate, position: i.position, active: true, created_by: me.id })) as never);
            refresh(); setFilter(nid); setEdit(nid);
          }} />
          <Button small kind="ghost" title="Remove" onPress={async () => {
            const src = qBy[filter];
            if (!(await confirmAsk(`Remove this quote${src.site_id ? '' : ' from every project'}? Its items come off the list. POs already raised aren't changed.`, 'Remove'))) return;
            await fdb.from('fin_quote_items').update({ active: false } as never).eq('quote_id', filter);
            if (!(await fdb.from('fin_quotes').delete().eq('id', filter).select('id')).data?.length) toast('Could not remove it.');
            setFilter(''); refresh();
          }} />
        </View>
      )}
      {edit && <PriceListEdit qid={edit} onClose={(saved) => { setEdit(null); if (saved) refresh(); }} />}
      <TextInput value={q} onChangeText={setQ} placeholder="Search items or codes" style={[box, { marginBottom: 8 }]} />
      {siteId && ticked.length > 0 && (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}>
          <Text style={{ flex: 1, fontWeight: '700', color: base.ink }}>{ticked.length} item{ticked.length === 1 ? '' : 's'} ticked</Text>
          <Button small title="Raise a PO from these" onPress={raise} />
          <Button small kind="ghost" title="Untick" onPress={() => setSel(new Set())} />
        </Card>
      )}
      {shown.length ? shown.map((i) => {
        const on = sel.has(i.id);
        return (
          <Pressable key={i.id} disabled={!siteId} onPress={() => setSel((s) => { const n = new Set(s); if (n.has(i.id)) n.delete(i.id); else n.add(i.id); return n; })} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 9, borderWidth: 1, borderColor: on ? base.ink : base.cardLine, borderRadius: radius.row, marginBottom: 5, backgroundColor: base.card }}>
            {!!siteId && <Text style={{ fontSize: 17 }}>{on ? '☑' : '☐'}</Text>}
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700', color: base.ink, fontSize: 15 }}>{i.code ? `${i.code} – ` : ''}{i.description}</Text>
              <Muted>{[filter ? '' : qLabel(qBy[i.quote_id] || {}), i.unit ? `per ${i.unit}` : ''].filter(Boolean).join(' · ')}</Muted>
            </View>
            {i.rate != null && <Text style={{ color: base.ink, fontWeight: '700' }}>{money(i.rate)}</Text>}
          </Pressable>
        );
      }) : <Empty>{data.items.length ? 'Nothing matches.' : 'No quotes yet — upload one above.'}</Empty>}
    </View>
  );
}

/** Edit a price list / quote: supplier, ref, date and every line (9219zd). */
function PriceListEdit({ qid, onClose }: { qid: string; onClose: (saved: boolean) => void }) {
  const { me } = useAuth();
  const toast = useToast();
  const { data } = useQuery({
    queryKey: ['finPlEdit', qid], gcTime: 0,
    queryFn: async () => {
      const [q, items, sups] = await Promise.all([
        fdb.from('fin_quotes').select('*').eq('id', qid).maybeSingle(),
        fdb.from('fin_quote_items').select('*').eq('quote_id', qid).eq('active', true).order('position'),
        fdb.from('suppliers').select('id,name').eq('org_id', me?.org_id as string).order('name'),
      ]);
      return { q: q.data as Row | null, items: (items.data as Row[] | null) ?? [], sups: (sups.data as Row[] | null) ?? [] };
    },
  });
  if (!data) return <Muted>Loading the list…</Muted>;
  if (!data.q) return <Muted>That price list has gone.</Muted>;
  return <PlForm key={qid} q0={data.q} items0={data.items} sups={data.sups} onClose={onClose} toast={toast} me={me} />;
}
function PlForm({ q0, items0, sups, onClose, toast, me }: { q0: Row; items0: Row[]; sups: Row[]; onClose: (saved: boolean) => void; toast: (m: string) => void; me: Row | null }) {
  const [q, setQ] = useState<Row>({ ...q0 });
  const [items, setItems] = useState<Row[]>(items0.map((i) => ({ ...i, rate: i.rate ?? '' })));
  const [removed, setRemoved] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const set = (i: number, p: Row) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const save = async () => {
    setBusy(true);
    try {
      const supName = String(q.supplier_name || '').trim() || null;
      const r = await fdb.from('fin_quotes').update({ supplier_id: q.supplier_id || null, supplier_name: supName, quote_no: String(q.quote_no || '').trim() || null, quote_date: q.quote_date || null } as never).eq('id', q.id);
      if (r.error) { toast('Could not save the list.'); return; }
      if (removed.length) await fdb.from('fin_quote_items').update({ active: false } as never).in('id', removed);
      for (let i = 0; i < items.length; i++) {
        const x = items[i]; if (!String(x.description || '').trim()) continue;
        const d = { code: String(x.code || '').trim() || null, description: String(x.description).trim(), unit: String(x.unit || '').trim() || null, rate: num(x.rate), position: i, supplier_name: supName };
        if (x.id) await fdb.from('fin_quote_items').update(d as never).eq('id', x.id);
        else await fdb.from('fin_quote_items').insert({ ...d, org_id: q.org_id, quote_id: q.id, site_id: q.site_id, active: true, created_by: me?.id } as never);
      }
      onClose(true);
    } finally { setBusy(false); }
  };
  return (
    <Card style={{ borderColor: base.ink, borderWidth: 1.5 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
        <SectionTitle>Edit price list</SectionTitle>
        <Pressable style={{ marginLeft: 'auto' }} onPress={() => onClose(false)} accessibilityLabel="Close" hitSlop={8}><Text style={{ fontSize: 18, color: base.slate, fontWeight: '700' }}>✕</Text></Pressable>
      </View>
      <SuggestField label="Supplier" value={String(q.supplier_name || '')} onChangeText={(t) => setQ({ ...q, supplier_name: t, supplier_id: null })} items={sups.map((s) => ({ key: s.id, label: s.name }))} onPick={(s) => setQ({ ...q, supplier_name: s.label, supplier_id: s.key })} showAllOnFocus placeholder="Pick from your suppliers or type" />
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <TextInput value={String(q.quote_no || '')} onChangeText={(t) => setQ({ ...q, quote_no: t })} placeholder="Ref / quote no." style={[box, { minWidth: 160, flexGrow: 1 }]} />
        <DateBox value={q.quote_date || ''} onChange={(v) => setQ({ ...q, quote_date: v })} placeholder="Date" title="Quote date" style={{ minWidth: 180, flexGrow: 1 }} />
      </View>
      <Muted style={{ marginTop: 8, marginBottom: 4 }}>{items.length} line{items.length === 1 ? '' : 's'}{q.quote_date ? ` · dated ${fdate(q.quote_date)}` : ''}</Muted>
      {items.map((x, i) => (
        <View key={x.id || `n${i}`} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 6 }}>
          <TextInput value={String(x.code || '')} onChangeText={(t) => set(i, { code: t })} placeholder="Code" style={[box, { width: 90 }]} />
          <TextInput value={String(x.description || '')} onChangeText={(t) => set(i, { description: t })} placeholder="Description" style={[box, { flex: 1, minWidth: 200 }]} />
          <TextInput value={String(x.unit || '')} onChangeText={(t) => set(i, { unit: t })} placeholder="Unit" style={[box, { width: 64 }]} />
          <TextInput value={String(x.rate ?? '')} onChangeText={(t) => set(i, { rate: t.replace(/[^0-9.]/g, '') })} placeholder="Rate £" keyboardType="decimal-pad" style={[box, { width: 84 }]} />
          <Pressable hitSlop={8} accessibilityLabel="Remove line" onPress={() => { if (x.id) setRemoved((r) => [...r, x.id]); setItems((xs) => xs.filter((_, j) => j !== i)); }}><Text style={{ color: base.slate, fontWeight: '700' }}>✕</Text></Pressable>
        </View>
      ))}
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
        <Button small kind="ghost" title="+ Add line" onPress={() => setItems((xs) => [...xs, { code: '', description: '', unit: '', rate: '' }])} />
        <Button small busy={busy} title="Save list" onPress={() => void save()} />
        <Button small kind="ghost" title="Cancel" onPress={() => onClose(false)} />
      </View>
    </Card>
  );
}
