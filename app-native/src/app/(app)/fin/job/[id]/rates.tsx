// A repair contract's schedule of rates (Andy, 7 Nov 2026): usually the NHF framework rates (a couple of versions) or
// the client's own. Upload the Excel: every sheet is read (each sheet a category, e.g. Pitched Roofing; each heading in
// it an item group), then it asks the discount off the rates. Rates can also be added or changed one at a time. Find
// them by Category ▾, Item ▾ or free text, as on the quote.
import { useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { FinForm } from '@/components/FinForm';
import { RepairTabs } from '@/components/FinNav';
import { RateFinder } from '@/components/RateFinder';
import { confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Muted } from '@/components/ui';
import { deleteRate, importRates, saveRate, setContractRates, useContractQuoteSettings, useRepairRates } from '@/data/repairQuote';
import { useAuth } from '@/lib/auth';
import { parseRates, parseScheduleSheets, type Rate } from '@/lib/rules/repairQuote';
import { csvRows, readXlsx } from '@/lib/rules/xlsxRead';
import { isManager } from '@/lib/roles';
import { base, page, radius, space } from '@/theme/theme';

export default function RepairRates() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: rates = [] } = useRepairRates(id);
  const { data: qs } = useContractQuoteSettings(id);
  const [edit, setEdit] = useState<Partial<Rate> | null>(null);
  const [busy, setBusy] = useState('');
  if (!me) return null;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['repairRates', id] }); void qc.invalidateQueries({ queryKey: ['repairQuoteSettings', id] }); };
  const cats = Array.from(new Set(rates.map((r) => r.category).filter(Boolean))) as string[];
  const upload = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv', 'text/comma-separated-values', '*/*'], copyToCacheDirectory: true });
    if (r.canceled || !r.assets[0]) return;
    setBusy('Reading the file…');
    try {
      const a = r.assets[0], bytes = new Uint8Array(await (await fetch(a.uri)).arrayBuffer());
      const name = String(a.name || 'Schedule of rates').replace(/\.(xlsx|csv)$/i, '');
      // Every sheet, NHF style (categories and headings); a plain one-sheet table reads as before.
      const found = /\.csv$/i.test(a.name || '') ? parseRates(csvRows(new TextDecoder().decode(bytes)) as never) : parseScheduleSheets(await readXlsx(bytes));
      if (!found.length) { toast('No rates found — the sheet needs a description and a rate on each row.'); return; }
      const nCats = new Set(found.map((x) => (x as { category?: string | null }).category).filter(Boolean)).size;
      if (!(await confirmAsk(`Add ${found.length} rate${found.length === 1 ? '' : 's'} from “${name}”${nCats > 1 ? ` (${nCats} categories)` : ''}?${rates.length ? ' Any already on this contract are skipped.' : ''}`, 'Add Them'))) return;
      setBusy(`Adding ${found.length}…`);
      const res = await importRates(id, found, rates, name);
      await setContractRates(id, { uses: true, name: qs?.ratesName && rates.length ? `${qs.ratesName} + ${name}` : name });
      refresh();
      toast(`${res.added} rate${res.added === 1 ? '' : 's'} added${res.skipped ? `, ${res.skipped} already here` : ''}${res.failed ? `, ${res.failed} didn’t go — try again` : ''}`);
      // Then the discount question.
      setEdit({ id: '__disc' });
    } catch { toast('Could not read that file.'); } finally { setBusy(''); }
  };
  return (
    <ScrollView contentContainerStyle={page(820)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Schedule Of Rates' }} />
      <RepairTabs id={id} on="rates" />
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', color: base.ink }}>{qs?.ratesName || 'Contract Rates'}</Text>
            <Muted style={{ fontSize: 12 }}>{rates.length} rate{rates.length === 1 ? '' : 's'}{cats.length ? ` · ${cats.join(', ')}` : ''}. The adjustment (less a discount, or plus an uplift) applies to every rate on a quote, not lines typed in.</Muted>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Change the contract discount" onPress={() => setEdit({ id: '__disc' })} style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: base.card }}>
            <Text style={{ fontWeight: '700', color: base.ink }}>{(qs?.discount ?? 0) < 0 ? `Plus ${-(qs?.discount ?? 0)}%` : `Less ${qs?.discount ?? 0}%`} ▾</Text>
          </Pressable>
        </View>
      </Card>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
        <View style={{ flex: 2 }}><Button busy={!!busy} title={busy || 'Upload Rates (Excel)'} onPress={() => void upload()} /></View>
        <View style={{ flex: 1 }}><Button kind="ghost" title="+ Add Rate" onPress={() => setEdit({})} /></View>
      </View>
      {rates.length ? (
        <Card><RateFinder rates={rates} always action="›" limit={60} onPick={(r) => setEdit(r)} /></Card>
      ) : <Muted>No rates yet. Upload the NHF schedule (or the client’s own) as an Excel file: every sheet is read, with its headings. Or add them one at a time.</Muted>}
      {edit?.id === '__disc' ? (
        <FinForm title="Rates Adjustment" initial={{ sign: (qs?.discount ?? 0) < 0 ? 'plus' : 'less', pct: String(Math.abs(qs?.discount ?? 0)) }} onClose={() => setEdit(null)}
          fields={[{ k: 'sign', label: 'Less Or Plus', kind: 'choice', half: true, options: [['less', 'Less (Discount)'], ['plus', 'Plus (Uplift)']] }, { k: 'pct', label: 'Rates Adjustment %', kind: 'number', half: true }]}
          onSave={async (v) => { const n = Number(v.pct || 0); if (isNaN(n) || n < 0 || n > 100) return 'Between 0 and 100%.'; if (!(await setContractRates(id, { pct: n ? (v.sign === 'plus' ? -n : n) : null }))) return 'Could not save — try again.'; refresh(); return null; }} />
      ) : edit && (
        <FinForm title={edit.id ? 'Rate' : 'Add Rate'} initial={{ code: edit.code || '', description: edit.description || '', unit: edit.unit || '', rate: edit.rate != null ? String(edit.rate) : '' }} onClose={() => setEdit(null)}
          note={edit.category ? `${edit.category}${edit.section ? ` › ${edit.section}` : ''}` : undefined}
          fields={[{ k: 'code', label: 'Code', half: true }, { k: 'unit', label: 'Unit (e.g. IT, LM, SM)', half: true }, { k: 'description', label: 'Description', kind: 'multiline' }, { k: 'rate', label: 'Rate £', kind: 'money' }]}
          onSave={async (v) => {
            const d = String(v.description || '').trim(); if (!d) return 'Add a description.';
            const rate = Number(String(v.rate || '').replace(/[£,\s]/g, '')); if (isNaN(rate)) return 'Enter the rate as a number.';
            if (!(await saveRate(id, { id: edit.id, code: String(v.code || '').trim() || null, description: d, unit: String(v.unit || '').trim() || null, rate }))) return 'Could not save — try again.';
            refresh(); return null;
          }}
          onDelete={edit.id ? async () => { if (!(await deleteRate(edit.id as string))) return 'Could not delete.'; refresh(); return null; } : undefined} />
      )}
    </ScrollView>
  );
}
