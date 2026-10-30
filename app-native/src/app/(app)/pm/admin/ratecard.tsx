// Admin Centre › Price Sheet Rate Card (260 + 760): the company's one rate
// card — items by element of works, each with a unit and a rate, or a
// dropdown priced by option — plus the Terms & Conditions page printed first
// on every Price Sheet. Sheets already issued keep their own copy of the rates.
// Download the card as Excel to edit; uploading it back replaces the card.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { chooseAction, confirmAsk, promptText, useToast } from '@/components/toast';
import { Button, Card, Check, Empty, Muted, SectionTitle } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { deliverXlsx } from '@/lib/pdf';
import { rateCardSheets, readRateCard } from '@/lib/rules/rateCardExcel';
import { makeXlsx } from '@/lib/rules/xlsx';
import { readXlsx } from '@/lib/rules/xlsxRead';
import { RATE_UNITS, rateCategories, readRate, type RateItem, type RateOption } from '@/lib/rules/rateCard';
import { supabase } from '@/lib/supabase';
import { base, page, radius, space } from '@/theme/theme';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 8, color: base.ink, backgroundColor: base.card };

/** A box that saves when you leave it (blank is put back). */
function Cell({ value, onSave, money, style }: { value: string; onSave: (v: string) => Promise<void>; money?: boolean; style?: object }) {
  const [v, setV] = useState(value);
  return <TextInput value={v} onChangeText={setV} keyboardType={money ? 'decimal-pad' : 'default'} onBlur={() => { if (v.trim() !== value) void onSave(v.trim()).catch(() => setV(value)); }} style={[box, style]} />;
}

export default function RateCard() {
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['rateCard', me?.org_id], enabled: !!me,
    queryFn: async () => {
      const items = ((await db.from('price_rate_items').select('*').eq('org_id', me?.org_id as string).eq('active', true).order('category').order('sort_order').order('name')).data as RateItem[] | null) ?? [];
      const ids = items.filter((i) => i.is_dropdown).map((i) => i.id);
      const options = ids.length ? ((await db.from('price_rate_options').select('*').in('rate_item_id', ids).order('sort_order')).data as RateOption[] | null) ?? [] : [];
      const terms = ((await db.from('organizations').select('price_builder_terms').eq('id', me?.org_id as string).maybeSingle()).data as { price_builder_terms: string | null } | null)?.price_builder_terms ?? '';
      return { items, options, terms };
    },
  });
  const [terms, setTerms] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [nw, setNw] = useState({ category: '', name: '', unit: 'lm', dropdown: false, rate: '' });
  if (!me) return null;
  if (me.role !== 'admin') return <Muted style={{ padding: space.l }}>Admins only.</Muted>;
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['rateCard'] }); };
  const upd = async (table: string, id: string, patch: object, ok: string) => {
    if (!(await db.from(table).update(patch as never).eq('id', id).select('id')).data?.length) { toast('Could not save — try again.'); throw new Error('save'); }
    toast(ok); refresh();
  };
  const field = (it: RateItem | RateOption, table: string, key: string, label: string) => async (v: string) => {
    if (!v) { toast(`${label} can't be empty.`); throw new Error('empty'); }
    const val = key === 'rate' ? readRate(v) : v;
    if (key === 'rate' && val === null) { toast('Enter a valid number.'); throw new Error('nan'); }
    await upd(table, it.id, { [key]: val }, table === 'price_rate_items' ? 'Rate card updated' : 'Option updated');
  };
  const { cats, opts } = rateCategories(data?.items ?? [], data?.options ?? []);
  const t = terms ?? data?.terms ?? '';
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Price Sheet Rate Card' }} />
      <Muted style={{ marginBottom: 10 }}>One shared rate card for the whole company. Changes here don&apos;t affect any sheet already issued — those keep their own copy of the rates used.</Muted>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
        <View style={{ flex: 1 }}><Button kind="ghost" title="⬇ Download as Excel" onPress={async () => {
          if (!(await deliverXlsx(makeXlsx(rateCardSheets(data?.items ?? [], data?.options ?? [], org?.name || 'Company')), `${(org?.name || 'Company').replace(/[^a-z0-9]+/gi, '_')}_Price_Builder_Rate_Card.xlsx`))) toast('Could not make the file — try again.');
        }} /></View>
        <View style={{ flex: 1 }}><Button kind="ghost" title="⬆ Upload Excel (replaces the card)" onPress={async () => {
          const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true }); if (r.canceled || !r.assets[0]) return;
          let read;
          try { read = readRateCard(await readXlsx(new Uint8Array(await (await fetch(r.assets[0].uri)).arrayBuffer()))); } catch { toast('Could not read that file — check it’s a valid .xlsx exported from this tool.'); return; }
          const { items: ni, skipped } = read;
          if (!ni.length) { toast('Nothing usable found — check each tab has Item / Unit / Rate (or Option) columns filled in.'); return; }
          const cats = new Set(ni.map((i) => i.category)).size;
          if (!(await confirmAsk(`This will replace the entire rate card with ${ni.length} item${ni.length === 1 ? '' : 's'} across ${cats} categor${cats === 1 ? 'y' : 'ies'} from this file.${skipped ? ` (${skipped} row${skipped === 1 ? '' : 's'} skipped — missing rate or options.)` : ''} Continue?`, 'Replace'))) return;
          // The new card goes in first; the old one is only removed once it's safely saved.
          const ex = await db.from('price_rate_items').select('id').eq('org_id', me.org_id as string);
          if (ex.error) { toast('Could not reach the server — rate card left unchanged.'); return; }
          const oldIds = ((ex.data as { id: string }[] | null) ?? []).map((x) => x.id);
          const ins = await db.from('price_rate_items').insert(ni.map((it) => ({ org_id: me.org_id, category: it.category, name: it.name, unit: it.unit, rate: it.rate, is_dropdown: it.is_dropdown, sort_order: it.sort_order, created_by: me.id })) as never).select('id');
          const newRows = (ins.data as { id: string }[] | null) ?? [];
          const undo = async () => { if (newRows.length) await db.from('price_rate_items').delete().in('id', newRows.map((x) => x.id)); };
          if (ins.error || newRows.length !== ni.length) { await undo(); toast('Import failed — your existing rate card has been left unchanged.'); refresh(); return; }
          const optRows = ni.flatMap((it, i) => it.options.map((o) => ({ rate_item_id: newRows[i].id, label: o.label, rate: o.rate, sort_order: o.sort_order })));
          if (optRows.length && (await db.from('price_rate_options').insert(optRows as never)).error) { await undo(); toast('Import failed part way — your existing rate card has been left unchanged.'); refresh(); return; }
          let left = 0;
          for (let i = 0; i < oldIds.length; i += 80) { const chunk = oldIds.slice(i, i + 80); if ((await db.from('price_rate_items').delete().in('id', chunk)).error) left += chunk.length; }
          toast(left ? `New rates imported, but ${left} old item${left === 1 ? '' : 's'} could not be removed — delete the duplicates by hand or import again.` : `Rate card replaced — ${ni.length} item${ni.length === 1 ? '' : 's'}, ${optRows.length} option${optRows.length === 1 ? '' : 's'}.`);
          refresh();
        }} /></View>
      </View>
      <Card>
        <SectionTitle>Terms &amp; Conditions</SectionTitle>
        <Muted style={{ marginBottom: 6 }}>Shown as its own page 1 on every Price Sheet PDF export, before the priced items — paste your subcontractor T&amp;Cs in here word for word.</Muted>
        <TextInput value={t} onChangeText={setTerms} multiline placeholder="Paste your subcontractor terms & conditions here…" style={[box, { minHeight: 120, marginBottom: 8 }]} />
        <Button kind="ghost" title="Save Terms" onPress={async () => { toast(!(await db.from('organizations').update({ price_builder_terms: t || null } as never).eq('id', org?.id || (me.org_id as string)).select('id')).data?.length ? 'Could not save — admins only' : 'Terms saved'); refresh(); }} />
      </Card>
      {isLoading ? <Muted>Loading…</Muted> : cats.length ? cats.map((c) => (
        <View key={c.name}>
          <SectionTitle>{c.name}</SectionTitle>
          {c.items.map((it) => (
            <View key={it.id}>
              <Card style={{ padding: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Cell value={it.name} onSave={field(it, 'price_rate_items', 'name', 'Item name')} style={{ flex: 1, fontWeight: '700' }} />
                  {!it.is_dropdown && <><Text style={{ color: base.ink }}>£</Text><Cell money value={it.rate != null ? String(it.rate) : ''} onSave={field(it, 'price_rate_items', 'rate', 'Rate')} style={{ width: 80 }} /></>}
                  <Pressable hitSlop={8} onPress={async () => {
                    if (!(await confirmAsk(`Remove "${it.name}" from the rate card? This can't be undone — it won't affect any sheet that's already been issued, since those keep their own snapshot of the rates used.`, 'Remove'))) return;
                    toast(!(await db.from('price_rate_items').delete().eq('id', it.id).select('id')).data?.length ? 'Could not remove — try again.' : 'Rate item removed'); refresh();
                  }}><Text>🗑</Text></Pressable>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  <Pressable onPress={async () => { const k = await chooseAction('Unit', RATE_UNITS.map(([key, label]) => ({ key, label }))); if (k && k !== it.unit) await upd('price_rate_items', it.id, { unit: k }, 'Unit updated').catch(() => {}); }} style={[box, { paddingVertical: 4 }]}>
                    <Text style={{ color: base.ink, fontSize: 12 }}>{RATE_UNITS.find(([k]) => k === it.unit)?.[1] || it.unit} ▾</Text>
                  </Pressable>
                  {it.is_dropdown && <Muted>Dropdown — priced by option below</Muted>}
                </View>
              </Card>
              {it.is_dropdown && (
                <View style={{ marginLeft: 14, paddingLeft: 10, borderLeftWidth: 2, borderColor: base.line, marginBottom: 8 }}>
                  {(opts[it.id] || []).length ? (opts[it.id] || []).map((o) => (
                    <View key={o.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <Cell value={o.label} onSave={field(o, 'price_rate_options', 'label', 'Option name')} style={{ flex: 1 }} />
                      <Text style={{ color: base.ink }}>£</Text>
                      <Cell money value={String(o.rate)} onSave={field(o, 'price_rate_options', 'rate', 'Rate')} style={{ width: 72 }} />
                      <Pressable hitSlop={8} onPress={async () => { if (await confirmAsk('Remove this option?', 'Remove')) { toast(!(await db.from('price_rate_options').delete().eq('id', o.id).select('id')).data?.length ? 'Could not remove — try again.' : 'Option removed'); refresh(); } }}><Text>🗑</Text></Pressable>
                    </View>
                  )) : <Muted>No options yet.</Muted>}
                  <Pressable onPress={async () => {
                    const label = await promptText('Option name, e.g. "Marley Eternit Concrete Tile"', ''); if (!label || !label.trim()) return;
                    const r = await promptText(`Rate for "${label.trim()}" (£)`, ''); if (r === null) return;
                    const rate = readRate(r); if (rate === null) { toast('Enter a valid number.'); return; }
                    toast((await db.from('price_rate_options').insert({ rate_item_id: it.id, label: label.trim(), rate } as never)).error ? 'Could not add — try again.' : 'Option added'); refresh();
                  }} style={{ paddingVertical: 4 }}><Text style={{ color: base.blue, fontWeight: '700' }}>+ Add option</Text></Pressable>
                </View>
              )}
            </View>
          ))}
        </View>
      )) : <Empty>No rate card items yet — add your first one below.</Empty>}
      {adding ? (
        <Card>
          <TextInput value={nw.category} onChangeText={(v) => setNw({ ...nw, category: v })} placeholder="Category, e.g. Pitched Roofing" style={[box, { marginBottom: 8 }]} />
          <TextInput value={nw.name} onChangeText={(v) => setNw({ ...nw, name: v })} placeholder="Item name, e.g. Strip" style={[box, { marginBottom: 8 }]} />
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>{RATE_UNITS.map(([k, l]) => <Pressable key={k} onPress={() => setNw({ ...nw, unit: k })} style={{ flex: 1, padding: 8, borderRadius: radius.input, borderWidth: 1, borderColor: nw.unit === k ? base.ink : base.line, backgroundColor: nw.unit === k ? base.ink : base.card }}><Text style={{ textAlign: 'center', fontSize: 12, color: nw.unit === k ? '#fff' : base.ink }}>{l}</Text></Pressable>)}</View>
          <Check label="This is a dropdown (e.g. Tile Type) — priced by option, added after" value={nw.dropdown} onChange={(v) => setNw({ ...nw, dropdown: v })} />
          {!nw.dropdown && <TextInput value={nw.rate} onChangeText={(v) => setNw({ ...nw, rate: v })} placeholder="Rate (£) e.g. 12.50" keyboardType="decimal-pad" style={[box, { marginVertical: 8 }]} />}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <View style={{ flex: 1 }}><Button title="Add Item" onPress={async () => {
              const category = nw.category.trim(), name = nw.name.trim();
              if (!category || !name) { toast('Enter a category and item name.'); return; }
              const rate = nw.dropdown ? null : readRate(nw.rate);
              if (!nw.dropdown && rate === null) { toast('Enter a rate, or tick "This is a dropdown".'); return; }
              if ((await db.from('price_rate_items').insert({ org_id: me.org_id, category, name, unit: nw.unit, is_dropdown: nw.dropdown, rate, created_by: me.id } as never)).error) { toast('Could not add — try again.'); return; }
              toast(`Rate item added${nw.dropdown ? ' — now add its options below' : ''}`);
              setNw({ ...nw, name: '', rate: '', dropdown: false }); if (!nw.dropdown) setAdding(false); refresh();
            }} /></View>
            <View style={{ flex: 1 }}><Button kind="ghost" title="Cancel" onPress={() => setAdding(false)} /></View>
          </View>
        </Card>
      ) : <Button title="+ Add Rate Item" onPress={() => setAdding(true)} />}
    </ScrollView>
  );
}
