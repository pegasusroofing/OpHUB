// Project quotes — the project's shopping list (915 renderFinShopping): supplier quotes / price lists
// uploaded for the project; the team pick items from them when they request materials, and POs are
// priced from them. Rates are only seen by Finance users and people allowed to see costs.
// Upload reads Excel / CSV here (a PDF or photo needs the reader, which is off during the Finance trial).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { FinChip } from '@/components/FinNav';
import { confirmAsk, promptText, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted, SectionTitle } from '@/components/ui';
import { fdb } from '@/data/finance';
import { useAuth } from '@/lib/auth';
import { bestSheet, guessColumns, importRows } from '@/lib/rules/boqImport';
import { fdate, num } from '@/lib/rules/finance';
import { csvRows, readXlsx } from '@/lib/rules/xlsxRead';
import { supabase } from '@/lib/supabase';
import { base, page, radius, space } from '@/theme/theme';

type Row = Record<string, any>;
type Draft = { name: string; path: string | null; supplier: string; lines: { keep: boolean; description: string; unit: string; qty: number | null; rate: number | null }[] };
const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 7, color: base.ink, backgroundColor: base.card };

export default function ProjectQuotes() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['finShop', id], enabled: !!me,
    queryFn: async () => {
      const [items, prices, quotes] = await Promise.all([
        fdb.from('fin_shop_items').select('*').eq('site_id', id).order('position'),
        fdb.from('fin_shop_prices').select('item_id,rate').eq('org_id', me!.org_id as string),
        fdb.from('fin_quotes').select('*').eq('site_id', id).eq('purpose', 'shopping').order('created_at', { ascending: false }),
      ]);
      const rate: Record<string, number | null> = {}; (((prices.data as Row[] | null) ?? [])).forEach((p) => { rate[p.item_id] = p.rate; });
      return { items: (items.data as Row[] | null) ?? [], rate, quotes: (quotes.data as Row[] | null) ?? [] };
    },
  });
  const [sel, setSel] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  if (!me || !data) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const refresh = () => void qc.invalidateQueries({ queryKey: ['finShop', id] });
  const qLabel = (q: Row) => [q.supplier_name, q.quote_no].filter(Boolean).join(' · ') || 'Quote';
  const shown = data.items.filter((i) => !sel || (sel === 'manual' ? !i.quote_id : i.quote_id === sel));
  const manual = data.items.filter((i) => !i.quote_id);

  const read = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true }); if (r.canceled || !r.assets[0]) return;
    const f = r.assets[0], nm = f.name || 'quote';
    if (!/\.(xlsx|csv)$/i.test(nm)) { toast('Upload the quote as Excel (.xlsx) or CSV — reading PDFs and photos is switched off while Finance is on trial.'); return; }
    setBusy(true);
    try {
      const bytes = new Uint8Array(await (await fetch(f.uri)).arrayBuffer());
      const sheet = /\.csv$/i.test(nm) ? { name: 'CSV', rows: csvRows(new TextDecoder().decode(bytes)) } : bestSheet(await readXlsx(bytes));
      const g = guessColumns(sheet.rows);
      const lines = importRows(sheet.rows, g.header, g.cols).filter((l) => l.kind === 'item' && l.description).map((l) => ({ keep: true, description: l.description, unit: l.unit || '', qty: l.qty ?? null, rate: l.rate ?? null }));
      const up = await supabase.storage.from('finance-docs').upload(`${me.org_id}/${id}/quotes/${Date.now()}-${nm.replace(/[^a-z0-9.-]+/gi, '_').slice(-80)}`, bytes, { contentType: f.mimeType || 'application/octet-stream' });
      setDraft({ name: nm, path: up.error ? null : up.data.path, supplier: '', lines });
      if (!lines.length) toast('No lines found in that file — it needs Description (and Unit / Rate) columns.');
    } catch { toast('Could not read that file.'); } finally { setBusy(false); }
  };
  const saveDraft = async () => {
    if (!draft) return;
    const keep = draft.lines.filter((l) => l.keep && l.description.trim()); if (!keep.length) { toast('Nothing ticked.'); return; }
    setBusy(true);
    try {
      const q = await fdb.from('fin_quotes').insert({ org_id: me.org_id, site_id: id, purpose: 'shopping', supplier_name: draft.supplier.trim() || null, file_path: draft.path, file_name: draft.name, created_by: me.id } as never).select('id').single();
      const quoteId = (q.data as Row | null)?.id ?? null;
      const top = Math.max(0, ...data.items.map((i) => Number(i.position) || 0));
      const rows = keep.map((l, i) => ({ id: globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}${i}`, org_id: me.org_id, site_id: id, supplier_name: draft.supplier.trim() || null, description: l.description.trim().slice(0, 300), unit: l.unit || null, qty: l.qty, quote_id: quoteId, quote_label: draft.supplier.trim() || draft.name, position: top + 1 + i, active: true, created_by: me.id }));
      const ins = await fdb.from('fin_shop_items').insert(rows as never);
      if (ins.error) { toast('Could not save the list — try again.'); return; }
      const pr = rows.map((r, i) => ({ item_id: r.id, org_id: me.org_id, rate: keep[i].rate })).filter((p) => p.rate != null);
      if (pr.length) await fdb.from('fin_shop_prices').insert(pr as never);
      toast(`${rows.length} items added as a project quote`); setDraft(null); if (quoteId) setSel(quoteId); refresh();
    } finally { setBusy(false); }
  };

  return (
    <ScrollView contentContainerStyle={page(900)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Project quotes' }} />
      <Card>
        <SectionTitle>Upload a project quote</SectionTitle>
        <Muted style={{ marginBottom: 8 }}>A supplier quote or price list for this project (Excel or CSV). Add as many as you need. The team pick items from them when they request materials, and POs are priced from them.</Muted>
        {!draft ? <Button busy={busy} title="📥 Choose the quote file" onPress={() => void read()} /> : (
          <View style={{ gap: 6 }}>
            <Muted>{draft.name} · {draft.lines.length} lines found. Untick anything that shouldn’t be on the list.</Muted>
            <TextInput value={draft.supplier} onChangeText={(v) => setDraft({ ...draft, supplier: v })} placeholder="Supplier name" style={box} />
            {draft.lines.map((l, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Pressable onPress={() => setDraft({ ...draft, lines: draft.lines.map((x, j) => (j === i ? { ...x, keep: !x.keep } : x)) })}><Text style={{ fontSize: 18 }}>{l.keep ? '☑' : '☐'}</Text></Pressable>
                <TextInput value={l.description} onChangeText={(v) => setDraft({ ...draft, lines: draft.lines.map((x, j) => (j === i ? { ...x, description: v } : x)) })} style={[box, { flex: 1 }]} />
                <Text style={{ width: 120, color: base.slate, fontSize: 12 }}>{[l.unit, l.rate != null ? `£${l.rate}` : ''].filter(Boolean).join(' · ')}</Text>
              </View>
            ))}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 2 }}><Button busy={busy} title={`Add ${draft.lines.filter((l) => l.keep).length} items as a project quote`} onPress={() => void saveDraft()} /></View>
              <View style={{ flex: 1 }}><Button kind="ghost" title="Cancel" onPress={() => setDraft(null)} /></View>
            </View>
          </View>
        )}
      </Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <SectionTitle>Project quotes</SectionTitle>
        <View style={{ marginLeft: 'auto' }}><Button kind="ghost" title="+ Add an item by hand" onPress={async () => {
          const desc = ((await promptText('Item description', '')) || '').trim(); if (!desc) return;
          const unit = ((await promptText('Unit (e.g. nr, m2, roll) — optional', '')) || '').trim();
          if ((await fdb.from('fin_shop_items').insert({ org_id: me.org_id, site_id: id, description: desc, unit: unit || null, position: 9999, active: true, created_by: me.id } as never)).error) toast('Could not save — try again.'); else refresh();
        }} /></View>
      </View>
      {(data.quotes.length > 0 || manual.length > 0) && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          <FinChip on={!sel} label={`All quotes (${data.items.length})`} onPress={() => setSel('')} />
          {data.quotes.map((q) => <FinChip key={q.id} on={sel === q.id} label={`${qLabel(q)} · ${fdate(q.quote_date || String(q.created_at).slice(0, 10))} (${data.items.filter((i) => i.quote_id === q.id).length})`} onPress={() => setSel(q.id)} />)}
          {manual.length > 0 && <FinChip on={sel === 'manual'} label={`Added by hand (${manual.length})`} onPress={() => setSel('manual')} />}
        </View>
      )}
      {!!sel && sel !== 'manual' && (
        <Button kind="ghost" title="Hide all on this quote from the team" onPress={async () => {
          const n = data.items.filter((i) => i.quote_id === sel).length;
          if (!(await confirmAsk(`Hide all ${n} items on this quote from the team? They stay here and you can show them again.`, 'Hide'))) return;
          toast((await fdb.from('fin_shop_items').update({ active: false } as never).eq('quote_id', sel)).error ? 'Could not hide them' : 'Hidden from the team'); refresh();
        }} />
      )}
      {shown.length ? shown.map((i) => (
        <View key={i.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 6, backgroundColor: base.card, opacity: i.active ? 1 : 0.5 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', color: base.ink }}>{i.description}</Text>
            <Muted>{[sel ? '' : i.quote_label || (i.quote_id ? '' : 'Added by hand'), i.code, i.unit ? `per ${i.unit}` : '', i.qty != null ? `quoted qty ${i.qty}` : ''].filter(Boolean).join(' · ')}</Muted>
          </View>
          <TextInput defaultValue={data.rate[i.id] != null ? String(data.rate[i.id]) : ''} placeholder="£" keyboardType="decimal-pad" style={[box, { width: 90 }]} onEndEditing={async (e) => {
            const n = num(e.nativeEvent.text), rate = n === null || isNaN(n) ? null : Math.round(n * 10000) / 10000;
            toast((await fdb.from('fin_shop_prices').upsert({ item_id: i.id, org_id: me.org_id, rate } as never, { onConflict: 'item_id' })).error ? 'Could not save the rate' : 'Rate saved');
          }} />
          <Pressable onPress={async () => { if (!(await fdb.from('fin_shop_items').update({ active: !i.active } as never).eq('id', i.id)).error) refresh(); }}><Text style={{ color: base.blue, fontWeight: '700' }}>{i.active ? 'Hide' : 'Show'}</Text></Pressable>
        </View>
      )) : <Empty>No items yet — upload a quote or add items by hand.</Empty>}
    </ScrollView>
  );
}
