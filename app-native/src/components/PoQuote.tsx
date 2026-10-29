// Price a PO from the supplier's quote (915 finPoFromQuote / finPoQuoteApply):
// the quote's priced lines are read in the app (typed PDF, Excel or CSV — no
// AI), each PO item is matched to a line (change any match), then Apply prices
// the items, keeps the quote on the PO, and teaches the price book.
import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { chooseAction, useToast } from '@/components/toast';
import { Button, Card, Muted } from '@/components/ui';
import { fdb } from '@/data/finance';
import { pdfPageTexts } from '@/lib/pdfjs';
import { money, round2 } from '@/lib/rules/finance';
import { itemKey, linesFromRows, linesFromText, matchLines, qtyNum, round4, type QLine } from '@/lib/rules/finQuote';
import { csvRows, readXlsx } from '@/lib/rules/xlsxRead';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';
import { base } from '@/theme/theme';

type Row = Record<string, any>;
export function PoQuote({ me, po, onDone }: { me: Profile; po: Row; onDone: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState<{ lines: QLine[]; map: Record<number, number>; path: string | null; file: string } | null>(null);
  const items = (po.items || []) as Row[];
  const read = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true }); if (r.canceled || !r.assets[0]) return;
    const a = r.assets[0], name = a.name || 'quote';
    if (/\.xls$/i.test(name)) { toast('Save it as .xlsx or .csv first — old .xls files can’t be read.'); return; }
    setBusy(true); toast('Reading the quote…');
    try {
      const bytes = new Uint8Array(await (await fetch(a.uri)).arrayBuffer());
      let lines: QLine[] = [], path: string | null = null;
      if (/\.(xlsx|csv)$/i.test(name)) lines = linesFromRows(/\.csv$/i.test(name) ? csvRows(new TextDecoder().decode(bytes)) : (await readXlsx(bytes))[0]?.rows ?? []);
      else {
        const up = await supabase.storage.from('finance-docs').upload(`${me.org_id}/${po.site_id || 'general'}/quotes/${Date.now()}-${name.replace(/[^a-z0-9.-]+/gi, '_').slice(-80)}`, bytes, { contentType: a.mimeType || 'application/pdf' });
        if (!up.error) path = up.data.path;
        if (/\.pdf$/i.test(name)) lines = linesFromText(((await pdfPageTexts(bytes, 20)) ?? []).join('\n'));
      }
      lines = lines.filter((l) => l.unit_price != null);
      if (!lines.length) { toast('No priced lines found in that quote — photos and some layouts can’t be read without the AI reader.'); return; }
      setQ({ lines, map: matchLines(items, lines), path, file: name });
    } catch { toast('Could not read that file.'); } finally { setBusy(false); }
  };
  const apply = async () => {
    if (!q) return;
    setBusy(true);
    const next = items.map((x) => ({ ...x }));
    Object.entries(q.map).forEach(([i, j]) => { const it = next[Number(i)], l = q.lines[j]; if (!it || !l) return; const n = qtyNum(it.qty); it.rate = round4(l.unit_price); it.rate_source = 'quote'; it.amount = n != null ? round2(n * it.rate) : null; });
    const priced = next.filter((x) => x.amount != null);
    const quote = await fdb.from('fin_quotes').insert({ org_id: me.org_id, site_id: po.site_id, po_id: po.id, purpose: 'po', supplier_id: po.supplier_id || null, supplier_name: po.supplier_name, file_path: q.path, file_name: q.file, lines: q.lines, created_by: me.id } as never).select('id').single();
    const r = await fdb.from('purchase_orders').update({ items: next, value: priced.length ? round2(priced.reduce((t, x) => t + Number(x.amount || 0), 0)) : po.value, value_estimated: priced.length < next.length, quote_id: quote.data ? (quote.data as Row).id : null } as never).eq('id', po.id);
    const sup = String(po.supplier_name || '').trim();
    if (sup) {
      const seen = new Set<string>();
      const rows = q.lines.filter((l) => l.kind === 'item' && l.description && l.unit_price > 0).map((l) => ({ org_id: me.org_id, supplier_key: sup.toLowerCase(), supplier_name: sup, item_key: itemKey(l.description), description: l.description.slice(0, 300), code: l.code || null, unit: l.unit || null, rate: round4(l.unit_price), source: 'quote', source_ref: null, updated_at: new Date().toISOString() })).filter((x) => (seen.has(x.item_key) ? false : (seen.add(x.item_key), true)));
      if (rows.length) await fdb.from('fin_price_book').upsert(rows as never, { onConflict: 'org_id,supplier_key,item_key' });
    }
    setBusy(false);
    if (r.error) { toast('Could not save — try again.'); return; }
    toast(`${priced.length} of ${next.length} items priced from the quote`); setQ(null); onDone();
  };
  if (!q) return <Button kind="ghost" busy={busy} title="💷 Price from a quote file (PDF, Excel or CSV)" onPress={() => void read()} />;
  return (
    <Card style={{ borderColor: base.blue, borderWidth: 1.5 }}>
      <Text style={{ fontWeight: '800', color: base.ink }}>Price {po.number} from the quote</Text>
      <Muted style={{ marginBottom: 6 }}>{q.lines.length} priced line{q.lines.length === 1 ? '' : 's'} read from {q.file}. Check each match, then apply.</Muted>
      {items.map((it, i) => { const j = q.map[i], l = j != null ? q.lines[j] : null; return (
        <Pressable key={i} onPress={async () => {
          const k = await chooseAction(String(it.item || it.description || 'Item'), [{ key: '-', label: '— not on the quote —' }, ...q.lines.map((x, jj) => ({ key: String(jj), label: `${x.description.slice(0, 70)} · ${money(x.unit_price)}${x.unit ? `/${x.unit}` : ''}` }))]);
          if (k == null) return; const m = { ...q.map }; if (k === '-') delete m[i]; else m[i] = Number(k); setQ({ ...q, map: m });
        }} style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: base.line }}>
          <Text style={{ color: base.ink, fontWeight: '600' }}>{it.item || it.description} · qty {String(it.qty ?? '')}</Text>
          <Text style={{ color: l ? base.blue : base.slate, fontSize: 12.5 }}>{l ? `→ ${l.description} · ${money(l.unit_price)}${l.unit ? `/${l.unit}` : ''}` : '— not on the quote — (tap to choose)'}</Text>
        </Pressable>
      ); })}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        <View style={{ flex: 1 }}><Button busy={busy} title="Apply prices" onPress={() => void apply()} /></View>
        <View style={{ flex: 1 }}><Button kind="ghost" title="Cancel" onPress={() => setQ(null)} /></View>
      </View>
    </Card>
  );
}
