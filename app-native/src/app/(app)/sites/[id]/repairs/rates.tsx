// A repair contract's schedule of rates (Andy, 7 Nov 2026): the contract's set discount, the priced items (code,
// description, unit, rate), added one at a time or imported from the client's spreadsheet (Excel or CSV). Quotes pick
// from this list.
import { useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { FinForm } from '@/components/FinForm';
import { confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Muted } from '@/components/ui';
import { deleteRate, importRates, saveRate, setContractDiscount, useContractQuoteSettings, useRepairRates } from '@/data/repairQuote';
import { useAuth } from '@/lib/auth';
import { parseRates, type Rate } from '@/lib/rules/repairQuote';
import { csvRows, readXlsx } from '@/lib/rules/xlsxRead';
import { isManager } from '@/lib/roles';
import { base, page, radius, space } from '@/theme/theme';

const gbp = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function RepairRates() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: rates = [] } = useRepairRates(id);
  const { data: qs } = useContractQuoteSettings(id);
  const [edit, setEdit] = useState<Partial<Rate> | null>(null);
  const [find, setFind] = useState('');
  const [busy, setBusy] = useState('');
  if (!me) return null;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['repairRates', id] }); void qc.invalidateQueries({ queryKey: ['repairQuoteSettings', id] }); };
  const q = find.trim().toLowerCase();
  const shown = q ? rates.filter((r) => `${r.code || ''} ${r.description}`.toLowerCase().includes(q)) : rates;
  const importFile = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv', 'text/comma-separated-values', '*/*'], copyToCacheDirectory: true });
    if (r.canceled || !r.assets[0]) return;
    setBusy('Reading the file…');
    try {
      const a = r.assets[0], bytes = new Uint8Array(await (await fetch(a.uri)).arrayBuffer());
      const rows = /\.csv$/i.test(a.name || '') ? csvRows(new TextDecoder().decode(bytes)) : (await readXlsx(bytes))[0]?.rows ?? [];
      const found = parseRates(rows as never);
      if (!found.length) { toast('No rates found — the sheet needs a description and a rate on each row.'); return; }
      if (!(await confirmAsk(`Add ${found.length} rate${found.length === 1 ? '' : 's'} from “${a.name}”?`, 'Add Them'))) return;
      setBusy(`Adding ${found.length}…`);
      const n = await importRates(id, found, rates.length);
      toast(n === found.length ? `${n} rates added` : `${n} of ${found.length} added — try the rest again`); refresh();
    } catch { toast('Could not read that file.'); } finally { setBusy(''); }
  };
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Schedule Of Rates' }} />
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', color: base.ink }}>Contract Discount</Text>
            <Muted style={{ fontSize: 12 }}>Taken off every schedule-of-rates item on a quote (not lines typed in).</Muted>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Change the contract discount" onPress={() => setEdit({ id: '__disc' })} style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: base.card }}>
            <Text style={{ fontWeight: '700', color: base.ink }}>{qs?.discount ?? 0}% ▾</Text>
          </Pressable>
        </View>
      </Card>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
        <View style={{ flex: 2 }}><Button title="+ Add Rate" onPress={() => setEdit({})} /></View>
        <View style={{ flex: 1 }}><Button kind="ghost" busy={!!busy} title={busy || 'Import Excel'} onPress={() => void importFile()} /></View>
      </View>
      {rates.length > 8 && <TextInput value={find} onChangeText={setFind} placeholder="Search by code or description" style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 9, backgroundColor: base.card, color: base.ink, fontSize: 16, marginBottom: 10 }} />}
      {shown.length ? (
        <View style={{ backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: 12, overflow: 'hidden' }}>
          {shown.map((r, i) => (
            <Pressable key={r.id} accessibilityRole="button" onPress={() => setEdit(r)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderTopWidth: i ? 1 : 0, borderTopColor: '#EEF0F2' }}>
              <Text style={{ width: 66, fontSize: 12, fontWeight: '600', color: base.slate }}>{r.code || '—'}</Text>
              <Text style={{ flex: 1, fontSize: 13.5, color: base.ink }}>{r.description}</Text>
              <Text style={{ fontSize: 13, fontWeight: '600', color: base.ink }}>{gbp(Number(r.rate))}{r.unit ? `/${r.unit}` : ''}</Text>
            </Pressable>
          ))}
        </View>
      ) : <Muted>{rates.length ? 'Nothing matches.' : 'No rates yet. Add them one at a time, or import the client’s schedule of rates (columns: Code, Description, Unit, Rate).'}</Muted>}
      {edit?.id === '__disc' ? (
        <FinForm title="Contract Discount" initial={{ pct: String(qs?.discount ?? 0) }} onClose={() => setEdit(null)}
          fields={[{ k: 'pct', label: 'Discount Off The Schedule Of Rates %', kind: 'number' }]}
          onSave={async (v) => { const n = Number(v.pct || 0); if (isNaN(n) || n < 0 || n > 100) return 'Between 0 and 100%.'; if (!(await setContractDiscount(id, n || null))) return 'Could not save — try again.'; refresh(); return null; }} />
      ) : edit && (
        <FinForm title={edit.id ? 'Rate' : 'Add Rate'} initial={{ code: edit.code || '', description: edit.description || '', unit: edit.unit || '', rate: edit.rate != null ? String(edit.rate) : '' }} onClose={() => setEdit(null)}
          fields={[{ k: 'code', label: 'Code', half: true }, { k: 'unit', label: 'Unit (e.g. nr, m, m²)', half: true }, { k: 'description', label: 'Description', kind: 'multiline' }, { k: 'rate', label: 'Rate £', kind: 'money' }]}
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
