// An unallocated invoice's lines, as read: change any line, choose its job, cost code and VAT, and see what it should
// have cost. Compact rows like Applications (Andy, 3 Nov 2026): wide enough, one row per line under headings
// (Description, Job, Cost Code, Qty, £ Each, VAT, Total); narrower (a phone, or beside the PDF) the description, then
// Job and Cost Code, then the figures. Bulk Edit sets the job, cost code or VAT on every line at once.
import { useState, type ReactNode } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { pickJob } from '@/components/FinSales';
import { chooseAction } from '@/components/toast';
import { Card } from '@/components/ui';
import { COST_CATS } from '@/lib/rules/finBook';
import { jobTag, money, rateMoney, round2 } from '@/lib/rules/finance';
import { lineValue, type PriceCheck, type RLine, type RSite } from '@/lib/rules/invoiceRead';
import { base } from '@/theme/theme';

type Line = RLine & { vat_rate?: number | 'rc' };
const box = { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 7, paddingHorizontal: 7, paddingVertical: 4, color: '#111827', backgroundColor: base.card, fontSize: 13, height: 30 } as const;
const head = { fontSize: 10.5, fontWeight: '600' as const, letterSpacing: 0.4, textTransform: 'uppercase' as const, color: '#6b7280' };
const COSTS = Object.entries(COST_CATS).filter(([c]) => c !== 'labour');
const VATS: [string, string][] = [['20', '20%'], ['5', '5%'], ['0', '0%'], ['rc', 'Reverse charge']];
const vatOf = (l: Line) => (l.vat_rate == null ? '20' : String(l.vat_rate));
const vatLabel = (l: Line) => (vatOf(l) === 'rc' ? 'RC' : `${vatOf(l)}%`);
const when = (d?: string) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : '');
const cheque = (c?: PriceCheck) => {
  if (!c || c.state === 'none') return c?.charged != null ? { t: 'No quote or price list for this', col: base.slate } : null;
  const src = `${c.from}${c.date ? `, ${when(c.date)}` : ''}`;
  if (c.state === 'ok') return { t: `Matches ${src}`, col: base.ok };
  return { t: `${c.state === 'over' ? 'Dearer' : 'Cheaper'} than ${src}: ${rateMoney(c.rate as number)}`, col: c.state === 'over' ? base.red : base.blue };
};
// Column widths on a wide card.
const W = { desc: 2.6, job: 1.6, cost: 1.15, qty: 0.55, rate: 0.8, vat: 0.6, total: 0.85 };

export function InvoiceLines({ lines: lines0, checks, sites, read, onChange, readOnly }: { lines: RLine[]; checks: PriceCheck[]; sites: RSite[]; read: { net?: number; vat?: number; total?: number }; onChange: (l: RLine[]) => void; readOnly?: boolean }) {
  const lines = lines0 as Line[];
  const [cardW, setCardW] = useState(0);
  const wide = cardW >= 720;
  const site = (id?: string | null) => sites.find((s) => s.id === id);
  const set = (k: number, patch: Partial<Line>) => onChange(lines.map((l, j) => (j === k ? { ...l, ...patch } : l)));
  const all = (patch: Partial<Line>) => onChange(lines.map((l) => ({ ...l, ...patch })));
  const num = (t: string) => { const n = Number(t.replace(/[£,\s]/g, '')); return t.trim() && isFinite(n) ? n : undefined; };
  const edit = (k: number, l: Line, patch: Partial<Line>) => { const m = { ...l, ...patch }; set(k, { ...patch, ...(m.qty != null && m.unit_price != null ? { amount: round2(Number(m.qty) * Number(m.unit_price)) } : {}) }); };
  const sum = round2(lines.reduce((t, l) => t + lineValue(l), 0));
  const vatSum = round2(lines.reduce((t, l) => t + (vatOf(l) === 'rc' ? 0 : lineValue(l) * Number(vatOf(l)) / 100), 0));
  const off = read.net != null && Math.abs(sum - Number(read.net)) >= 0.5;
  const vatOff = read.vat != null && Math.abs(vatSum - Number(read.vat)) >= 0.5;

  const pick = (label: string, v: string, warn: boolean, onPress: () => void) => (
    <Pressable disabled={readOnly} accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={[box, { justifyContent: 'center', borderColor: warn ? '#f8e7c2' : '#e5e7eb', backgroundColor: warn ? '#fffaf0' : base.card }]}>
      <Text numberOfLines={1} style={{ fontSize: 12.5, color: warn ? '#b45309' : '#111827', fontWeight: '500' }}>{v}</Text>
    </Pressable>
  );
  const chooseJob = async (onPick: (id: string) => void, title = 'Which project is this line for?') => { const s = await pickJob(title, sites as never); if (s) onPick(s); };
  const chooseCost = async (cur: string | undefined, onPick: (c: string) => void) => { const k = await chooseAction('Cost code', COSTS.map(([c, l]) => ({ key: c, label: `${c === cur ? '✓ ' : ''}${l}` }))); if (k) onPick(k); };
  const chooseVat = async (cur: string, onPick: (v: number | 'rc') => void) => { const k = await chooseAction('VAT rate', VATS.map(([v, l]) => ({ key: v, label: `${v === cur ? '✓ ' : ''}${l}` }))); if (k) onPick(k === 'rc' ? 'rc' : Number(k)); };

  const job = (k: number, l: Line) => pick(`Line ${k + 1} job`, l.site_id ? `${jobTag(site(l.site_id) as never)}${l.how ? ` (from ${l.how})` : ''}` : 'Choose Job ▾', !l.site_id, () => void chooseJob((s) => set(k, { site_id: s, how: undefined })));
  const cost = (k: number, l: Line) => pick(`Line ${k + 1} cost code`, `${COST_CATS[l.cost_code || 'materials'] || 'Materials'} ▾`, false, () => void chooseCost(l.cost_code || 'materials', (c) => set(k, { cost_code: c })));
  const vat = (k: number, l: Line) => pick(`Line ${k + 1} VAT`, `${vatLabel(l)} ▾`, false, () => void chooseVat(vatOf(l), (v) => set(k, { vat_rate: v })));
  const qty = (k: number, l: Line) => <TextInput editable={!readOnly} accessibilityLabel={`Line ${k + 1} quantity`} keyboardType="decimal-pad" placeholder="Qty" value={l.qty == null ? '' : String(l.qty)} onChangeText={(t) => edit(k, l, { qty: num(t) })} style={[box, { textAlign: 'center' }]} />;
  const rate = (k: number, l: Line) => (
    <View style={[box, { flexDirection: 'row', alignItems: 'center', paddingVertical: 0 }]}>
      <Text style={{ color: '#6b7280', fontSize: 13 }}>£</Text>
      <TextInput editable={!readOnly} accessibilityLabel={`Line ${k + 1} unit price`} keyboardType="decimal-pad" placeholder="0.00" value={l.unit_price == null ? '' : String(l.unit_price)} onChangeText={(t) => edit(k, l, { unit_price: num(t) })} style={{ flex: 1, minWidth: 0, paddingLeft: 3, color: '#111827', fontSize: 13, textAlign: 'center', height: 28 }} />
    </View>
  );
  const total = (l: Line) => <Text style={{ fontWeight: '600', color: '#111827', textAlign: 'right', fontSize: 13 }}>{money(lineValue(l))}</Text>;
  const note = (k: number) => { const c = cheque(checks[k]); return c ? <Text style={{ color: c.col, fontSize: 11.5, fontWeight: '500', marginTop: 3 }}>{c.t}</Text> : null; };
  const desc = (k: number, l: Line) => <TextInput editable={!readOnly} accessibilityLabel={`Line ${k + 1} description`} value={l.description ?? ''} onChangeText={(t) => set(k, { description: t })} placeholder="Description" style={box} />;
  const cell = (flex: number, child: ReactNode) => <View style={{ flex, minWidth: 0 }}>{child}</View>;
  const labelled = (flex: number, label: string, child: ReactNode, align: 'center' | 'right' = 'center') => cell(flex, <><Text style={[head, { textAlign: align, marginBottom: 2 }]}>{label}</Text>{child}</>);

  const bulk = async () => {
    const k = await chooseAction('Bulk edit — every line', [{ key: 'job', label: 'Set the job on every line' }, { key: 'cost', label: 'Set the cost code on every line' }, { key: 'vat', label: 'Set the VAT rate on every line' }]);
    if (k === 'job') void chooseJob((s) => all({ site_id: s, how: undefined }), 'Which project are they all for?');
    else if (k === 'cost') void chooseCost(undefined, (c) => all({ cost_code: c }));
    else if (k === 'vat') void chooseVat('', (v) => all({ vat_rate: v }));
  };

  return (
    <Card style={{ paddingVertical: 12 }}>
      <View onLayout={(e) => setCardW(e.nativeEvent.layout.width)}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <Text style={{ flex: 1, fontSize: 14.5, fontWeight: '600', color: '#111827' }}>Lines ({lines.length})</Text>
          {!readOnly && lines.length > 0 && <Pressable onPress={() => void bulk()} accessibilityRole="button" style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 7, paddingHorizontal: 10, height: 28, justifyContent: 'center' }}><Text style={{ fontSize: 12.5, fontWeight: '500', color: '#111827' }}>Bulk Edit ▾</Text></Pressable>}
        </View>
        {wide && (
          <View style={{ flexDirection: 'row', gap: 6, paddingBottom: 5, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
            {cell(W.desc, <Text style={head}>Description</Text>)}{cell(W.job, <Text style={head}>Job</Text>)}{cell(W.cost, <Text style={head}>Cost Code</Text>)}
            {cell(W.qty, <Text style={[head, { textAlign: 'center' }]}>Qty</Text>)}{cell(W.rate, <Text style={[head, { textAlign: 'center' }]}>£ Each</Text>)}{cell(W.vat, <Text style={[head, { textAlign: 'center' }]}>VAT</Text>)}{cell(W.total, <Text style={[head, { textAlign: 'right' }]}>Total</Text>)}
          </View>
        )}
        {lines.map((l, k) => (
          <View key={k} style={{ borderBottomWidth: 1, borderBottomColor: '#f0f1f3', paddingVertical: 6 }}>
            {wide ? (
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                {cell(W.desc, desc(k, l))}{cell(W.job, job(k, l))}{cell(W.cost, cost(k, l))}{cell(W.qty, qty(k, l))}{cell(W.rate, rate(k, l))}{cell(W.vat, vat(k, l))}{cell(W.total, total(l))}
              </View>
            ) : (
              <>
                {desc(k, l)}
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 5 }}>{cell(1.4, job(k, l))}{cell(1, cost(k, l))}</View>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-end', marginTop: 5 }}>
                  {labelled(0.8, 'Qty', qty(k, l))}{labelled(1.1, '£ Each', rate(k, l))}{labelled(0.9, 'VAT', vat(k, l))}
                  {labelled(1.1, 'Total', <View style={{ height: 30, justifyContent: 'center' }}>{total(l)}</View>, 'right')}
                </View>
              </>
            )}
            {note(k)}
          </View>
        ))}
        <View style={{ paddingTop: 8, gap: 2, alignSelf: wide ? 'flex-end' : 'stretch', minWidth: wide ? 280 : undefined }}>
          {([['Lines add up to', money(sum), off ? base.red : '#111827', '600'], ['Net on the invoice', read.net == null ? 'Not read' : money(Number(read.net)), '#111827', '400'], ['VAT on the lines', money(vatSum), vatOff ? base.red : '#111827', '400'], ['VAT on the invoice', read.vat == null ? 'Not read' : money(Number(read.vat)), '#111827', '400'], ['Total', read.total == null ? 'Not read' : money(Number(read.total)), '#111827', '600']] as const).map(([lab, v, col, w]) => (
            <View key={lab} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 16 }}><Text style={{ fontSize: 12.5, color: '#6b7280' }}>{lab}</Text><Text style={{ fontSize: 13, fontWeight: w, color: col }}>{v}</Text></View>
          ))}
        </View>
      </View>
    </Card>
  );
}
