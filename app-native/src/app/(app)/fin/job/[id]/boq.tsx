// Bill of Quantities for one project (902 renderFinContract / saveFinContract):
// sections, sub-sections and items (ref, description, qty × rate or a lump
// sum, and an optional cost price). Saving sets the contract value (unless
// it was typed by hand) and makes the project billed by application.
// Import a breakdown from Excel, CSV or PDF (902 finContractUploadPicked) and check it
// before use. Copying in the site schedule is still in the current app.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { FinRow } from '@/components/FinNav';
import { chooseAction, confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Muted } from '@/components/ui';
import { fdb } from '@/data/finance';
import { useAuth } from '@/lib/auth';
import { pdfPageTexts } from '@/lib/pdfjs';
import { bestSheet, boqRows, guessColumns, importPdfLines, importRows, type BoqLine } from '@/lib/rules/boqImport';
import { csvRows, readXlsx, type Cell } from '@/lib/rules/xlsxRead';
import { groupTotals, isItem, itemValue } from '@/lib/rules/finApp';
import { money, num, round2 } from '@/lib/rules/finance';
import { base, radius, space } from '@/theme/theme';

type Row = Record<string, any>;
const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 7, color: base.ink, backgroundColor: base.card };

export default function FinBoq() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading } = useQuery({ queryKey: ['finBoq', id], gcTime: 0, queryFn: async () => ((await fdb.from('fin_contract_items').select('*').eq('site_id', id).order('position')).data as Row[] | null) ?? [] });
  if (isLoading || !data) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  return <Editor id={id} initial={data} />;
}

function Editor({ id, initial }: { id: string; initial: Row[] }) {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [rows, setRows] = useState<Row[]>(() => initial.map((r) => ({ ...r, qty: r.qty ?? '', rate: r.rate ?? '', value: r.value ?? '', cost: r.cost ?? '' })));
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [imp, setImp] = useState<Imp | null>(null);
  if (!me) return null;
  const set = (i: number, k: string, v: unknown) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const move = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= rows.length) return; const x = rows.slice(); [x[i], x[j]] = [x[j], x[i]]; setRows(x); };
  const add = (kind: string) => setRows([...rows, { kind, ref: '', description: '', qty: '', unit: '', rate: '', value: '', cost: '' }]);
  const vals = rows.map((r) => (isItem(r) ? itemValue(r) || 0 : 0));
  const tots = groupTotals(rows.map((r, i) => ({ ...r, v: vals[i] })), (r) => r.v, () => 0);
  const total = round2(vals.reduce((t, v) => t + v, 0));
  const costTotal = round2(rows.filter(isItem).reduce((t, r) => t + (Number(num(r.cost)) || 0), 0));
  const save = async () => {
    const clean = rows.map((r) => ({ id: r.id, kind: r.kind || 'item', ref: String(r.ref || '').trim() || null, description: String(r.description || '').trim(), qty: num(r.qty), unit: String(r.unit || '').trim() || null, rate: num(r.rate), value: itemValue(r), cost: num(r.cost) }))
      .map((r) => ({ ...r, qty: r.qty === null || isNaN(r.qty) ? null : r.qty, rate: r.rate === null || isNaN(r.rate) ? null : r.rate, cost: r.cost === null || isNaN(r.cost) ? null : round2(r.cost) }))
      .filter((r) => r.description || r.value !== null);
    if (clean.some((r) => !r.description)) { toast('Every line needs a description.'); return; }
    if (clean.some((r) => isItem(r) && r.value === null)) { toast('Every item needs a value (quantity × rate, or a lump sum).'); return; }
    setBusy(true);
    try {
      const ex = await fdb.from('fin_contract_items').select('id').eq('site_id', id);
      if (ex.error) { toast('Couldn’t reach the server, so nothing was saved — try again.'); return; }
      const keep = new Set(clean.filter((r) => r.id).map((r) => r.id));
      let failed = 0;
      for (const e of (ex.data as Row[]) || []) if (!keep.has(e.id) && (await fdb.from('fin_contract_items').delete().eq('id', e.id)).error) failed++;
      const next = rows.slice();
      for (let i = 0; i < clean.length; i++) {
        const r = clean[i], d = { kind: r.kind, ref: r.ref, description: r.description, qty: r.qty, unit: r.unit, rate: r.rate, value: isItem(r) ? r.value : 0, position: i, cost: isItem(r) ? r.cost : null };
        if (r.id) { if ((await fdb.from('fin_contract_items').update(d as never).eq('id', r.id)).error) failed++; }
        else { const ins = await fdb.from('fin_contract_items').insert({ ...d, org_id: me.org_id, site_id: id } as never).select('id').single(); if (ins.data) next[i] = { ...next[i], id: (ins.data as Row).id }; else failed++; }
      }
      setRows(next);
      const jf = ((await fdb.from('job_finance').select('*').eq('site_id', id).maybeSingle()).data as Row | null) || {};
      const patch: Row = { site_id: id, org_id: me.org_id, billing_type: 'application', updated_at: new Date().toISOString(), updated_by: me.id };
      if (jf.contract_value_source !== 'manual') patch.contract_value = total;
      if (jf.original_value == null) { patch.original_value = total; patch.original_at = new Date().toISOString(); }
      if (jf.original_cost == null && clean.filter(isItem).every((r) => r.cost != null) && costTotal) patch.original_cost = costTotal;
      const jr = await fdb.from('job_finance').upsert(patch as never, { onConflict: 'site_id' });
      if (failed || jr.error) { toast(failed ? `${failed} line${failed === 1 ? '' : 's'} didn’t save — tap Save again.` : 'The contract value didn’t update.'); return; }
      toast(patch.contract_value != null ? `Schedule saved — contract value ${money(total)}` : `Schedule saved — Bill of Quantities ${money(total)} (typed contract value kept)`);
      ['finBoq', 'finBook', 'finJobs'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
    } finally { setBusy(false); }
  };
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 1100, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Bill of Quantities' }} />
      <Card><Text style={{ fontWeight: '800', color: base.ink }}>Total {money(total)}{costTotal ? ` · cost ${money(costTotal)} · margin ${money(total - costTotal)}` : ''}</Text><Muted>Copying in the site&apos;s Schedule of Works is still in the current app.</Muted>
        <View style={{ marginTop: 6 }}><Button kind="ghost" busy={importing} title="📥 Import a breakdown (Excel, CSV or PDF)" onPress={async () => {
          const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true }); if (r.canceled || !r.assets[0]) return;
          const a = r.assets[0];
          if (/\.xls$/i.test(a.name || '')) { toast('Save it as .xlsx or .csv first — old .xls files can’t be read.'); return; }
          setImporting(true);
          try {
            const bytes = new Uint8Array(await (await fetch(a.uri)).arrayBuffer());
            if (/\.pdf$/i.test(a.name || '') || a.mimeType === 'application/pdf') {
              const pages = await pdfPageTexts(bytes, 40);
              setImp({ sheets: [], sheet: '', lines: importPdfLines((pages ?? []).join('\n').split('\n')) });
            } else {
              const sheets = /\.csv$/i.test(a.name || '') ? [{ name: 'CSV', rows: csvRows(new TextDecoder().decode(bytes)) }] : await readXlsx(bytes);
              const best = bestSheet(sheets); if (!best) { toast('Nothing found in that file.'); return; }
              const g = guessColumns(best.rows);
              setImp({ sheets, sheet: best.name, lines: importRows(best.rows, g.header, g.cols) });
            }
          } catch { toast('Could not read that file.'); } finally { setImporting(false); }
        }} /></View>
      </Card>
      {imp && <ImportPreview imp={imp} setImp={setImp} onUse={async (lines) => {
        if (rows.some((x) => String(x.description || '').trim()) && !(await confirmAsk('Replace the lines here with the imported breakdown? Nothing is saved until you tap Save.', 'Replace'))) return;
        setRows(boqRows(lines)); setImp(null);
        toast(`${lines.filter((l) => l.kind !== 'skip').length} lines ready — check them and tap Save`);
      }} />}
      {rows.map((r, i) => {
        const head = r.kind === 'section' || r.kind === 'subsection';
        return (
          <View key={r.id || `n${i}`} style={{ borderWidth: 1, borderColor: head ? base.ink : base.cardLine, borderRadius: radius.row, padding: 8, marginBottom: 6, backgroundColor: head ? '#F2F4F7' : base.card, marginLeft: r.kind === 'subsection' ? 10 : isItem(r) ? 0 : 0 }}>
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              <TextInput value={r.ref || ''} onChangeText={(v) => set(i, 'ref', v)} placeholder="Ref" style={[box, { width: 64 }]} />
              <TextInput value={r.description || ''} onChangeText={(v) => set(i, 'description', v)} placeholder={head ? (r.kind === 'section' ? 'Section heading' : 'Sub-section heading') : 'Description'} multiline style={[box, { flex: 1, fontWeight: head ? '800' : '400' }]} />
              <Pressable hitSlop={6} onPress={async () => { const k = await chooseAction('Line', [{ key: 'up', label: '↑ Move up' }, { key: 'down', label: '↓ Move down' }, { key: 'kind', label: 'Change type' }, { key: 'del', label: '🗑 Remove', danger: true }]); if (k === 'up') move(i, -1); else if (k === 'down') move(i, 1); else if (k === 'del') setRows(rows.filter((_, j) => j !== i)); else if (k === 'kind') { const t = await chooseAction('Type', [{ key: 'item', label: 'Item' }, { key: 'section', label: 'Section heading' }, { key: 'subsection', label: 'Sub-section heading' }]); if (t) set(i, 'kind', t); } }}><Text style={{ fontSize: 18, color: base.slate }}>⋯</Text></Pressable>
            </View>
            {head ? <Text style={{ textAlign: 'right', color: base.slate, marginTop: 4 }}>{money(tots[i]?.value || 0)}</Text> : (
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <TextInput value={String(r.qty ?? '')} onChangeText={(v) => set(i, 'qty', v)} placeholder="Qty" keyboardType="decimal-pad" style={[box, { width: 70 }]} />
                <TextInput value={r.unit || ''} onChangeText={(v) => set(i, 'unit', v)} placeholder="Unit" style={[box, { width: 60 }]} />
                <TextInput value={String(r.rate ?? '')} onChangeText={(v) => set(i, 'rate', v)} placeholder="Rate £" keyboardType="decimal-pad" style={[box, { width: 80 }]} />
                <Text style={{ color: base.slate }}>or</Text>
                <TextInput value={String(r.value ?? '')} onChangeText={(v) => set(i, 'value', v)} placeholder="Lump sum £" keyboardType="decimal-pad" style={[box, { width: 100 }]} editable={!(num(r.qty) !== null && num(r.rate) !== null)} />
                <TextInput value={String(r.cost ?? '')} onChangeText={(v) => set(i, 'cost', v)} placeholder="Cost £" keyboardType="decimal-pad" style={[box, { width: 90 }]} />
                <Text style={{ marginLeft: 'auto', fontWeight: '800', color: base.ink }}>{money(vals[i])}</Text>
              </View>
            )}
          </View>
        );
      })}
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginVertical: 8 }}>
        <Button kind="ghost" title="+ Item" onPress={() => add('item')} /><Button kind="ghost" title="+ Section" onPress={() => add('section')} /><Button kind="ghost" title="+ Sub-section" onPress={() => add('subsection')} />
      </View>
      <Button busy={busy} title="Save Bill of Quantities" onPress={() => void save()} />
      <View style={{ marginTop: 8 }}><Button kind="ghost" title="+ New application from this BoQ" onPress={() => router.push(`/fin/job/${id}/application/new` as never)} /></View>
      {rows.length === 0 && <FinRow title="No lines yet" sub="Add sections and items, then save." />}
    </ScrollView>
  );
}

type Imp = { sheets: { name: string; rows: Cell[][] }[]; sheet: string; lines: BoqLine[] };
const KINDS: BoqLine['kind'][] = ['section', 'subsection', 'item', 'skip'];
const KIND_LABEL: Record<string, string> = { section: 'Section', subsection: 'Sub-section', item: 'Item', skip: 'Skip' };
/** Check the breakdown (902 finImportShow): pick the sheet, tap a line to change its type; totals start as Skip. */
function ImportPreview({ imp, setImp, onUse }: { imp: Imp; setImp: (i: Imp | null) => void; onUse: (lines: BoqLine[]) => void }) {
  const used = imp.lines.filter((l) => l.kind === 'item');
  const total = round2(used.reduce((t, l) => t + Number(l.value || 0), 0));
  return (
    <Card style={{ borderColor: base.blue, borderWidth: 1.5 }}>
      <Text style={{ fontWeight: '800', color: base.ink, marginBottom: 4 }}>Check the breakdown</Text>
      {imp.sheets.length > 1 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
          {imp.sheets.map((s) => <Pressable key={s.name} onPress={() => { const g = guessColumns(s.rows); setImp({ ...imp, sheet: s.name, lines: importRows(s.rows, g.header, g.cols) }); }} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, borderWidth: 1, borderColor: imp.sheet === s.name ? base.ink : base.line, backgroundColor: imp.sheet === s.name ? base.ink : base.card }}><Text style={{ color: imp.sheet === s.name ? '#fff' : base.ink, fontWeight: '700' }}>{s.name}</Text></Pressable>)}
        </View>
      )}
      <Muted style={{ marginBottom: 6 }}>{used.length} item{used.length === 1 ? '' : 's'} · total {money(total)}. Tap a line to change its type; totals are skipped so nothing is counted twice.</Muted>
      {imp.lines.length ? imp.lines.map((l, i) => (
        <Pressable key={i} onPress={() => { const n = imp.lines.slice(); n[i] = { ...l, kind: KINDS[(KINDS.indexOf(l.kind) + 1) % KINDS.length] }; setImp({ ...imp, lines: n }); }} style={{ flexDirection: 'row', gap: 8, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: base.line, opacity: l.kind === 'skip' ? 0.45 : 1 }}>
          <Text style={{ width: 82, fontSize: 11.5, fontWeight: '800', color: l.kind === 'item' ? base.ink : base.blue }}>{KIND_LABEL[l.kind]}</Text>
          <Text style={{ flex: 1, color: base.ink, fontWeight: l.kind === 'section' ? '800' : '400' }}>{l.ref ? `${l.ref} · ` : ''}{l.description}{l.qty != null || l.rate != null ? `  (${l.qty ?? ''} ${l.unit || ''}${l.rate != null ? ` × ${l.rate}` : ''})` : ''}</Text>
          <Text style={{ fontWeight: '700', color: base.ink }}>{l.value != null ? money(l.value) : ''}</Text>
        </Pressable>
      )) : <Muted>Nothing found. Try another sheet.</Muted>}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        <View style={{ flex: 1 }}><Button title="Use this breakdown" disabled={!used.length} onPress={() => onUse(imp.lines)} /></View>
        <View style={{ flex: 1 }}><Button kind="ghost" title="Cancel" onPress={() => setImp(null)} /></View>
      </View>
    </Card>
  );
}
