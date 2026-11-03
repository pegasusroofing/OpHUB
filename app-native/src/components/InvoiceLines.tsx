// An unallocated invoice's lines, as read: change any line, choose its job, and see what it should have cost.
// Laid out in rows like Applications (Andy, 3 Nov 2026): on a laptop one row per line under headings (Description,
// Job, Qty, £ Each, Total); on a phone the description, then Qty / £ Each / Total in a row, then the job.
import type { ReactNode } from 'react';
import { Pressable, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { pickJob } from '@/components/FinSales';
import { Button, Card } from '@/components/ui';
import { jobTag, money, rateMoney, round2 } from '@/lib/rules/finance';
import { lineValue, type PriceCheck, type RLine, type RSite } from '@/lib/rules/invoiceRead';
import { base } from '@/theme/theme';

const box = { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, color: '#111827', backgroundColor: base.card, fontSize: 14 } as const;
const head = { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.4, textTransform: 'uppercase' as const, color: '#6b7280' };
const when = (d?: string) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : '');
const cheque = (c?: PriceCheck) => {
  if (!c || c.state === 'none') return c?.charged != null ? { t: 'No quote or price list for this', col: base.slate } : null;
  const src = `${c.from}${c.date ? `, ${when(c.date)}` : ''}`;
  if (c.state === 'ok') return { t: `Matches ${src}`, col: base.ok };
  return { t: `${c.state === 'over' ? 'Dearer' : 'Cheaper'} than ${src}: ${rateMoney(c.rate as number)}`, col: c.state === 'over' ? base.red : base.blue };
};
// Laptop column widths.
const W = { desc: 3, job: 2, qty: 0.7, rate: 0.9, total: 0.9 };

export function InvoiceLines({ lines, checks, sites, read, onChange, readOnly }: { lines: RLine[]; checks: PriceCheck[]; sites: RSite[]; read: { net?: number; vat?: number; total?: number }; onChange: (l: RLine[]) => void; readOnly?: boolean }) {
  const wide = useWindowDimensions().width >= 760;
  const site = (id?: string | null) => sites.find((s) => s.id === id);
  const set = (k: number, patch: Partial<RLine>) => onChange(lines.map((l, j) => (j === k ? { ...l, ...patch } : l)));
  const num = (t: string) => { const n = Number(t.replace(/[£,\s]/g, '')); return t.trim() && isFinite(n) ? n : undefined; };
  const edit = (k: number, l: RLine, patch: Partial<RLine>) => { const m = { ...l, ...patch }; set(k, { ...patch, ...(m.qty != null && m.unit_price != null ? { amount: round2(Number(m.qty) * Number(m.unit_price)) } : {}) }); };
  const sum = round2(lines.reduce((t, l) => t + lineValue(l), 0));
  const off = read.net != null && Math.abs(sum - Number(read.net)) >= 0.5;

  const job = (k: number, l: RLine) => (
    <Pressable disabled={readOnly} accessibilityRole="button" accessibilityLabel={`Line ${k + 1} job`} onPress={async () => { const s = await pickJob('Which project is this line for?', sites as never); if (s) set(k, { site_id: s, how: undefined }); }}
      style={{ borderWidth: 1, borderColor: l.site_id ? '#e5e7eb' : base.warn, backgroundColor: l.site_id ? base.card : '#fffaf0', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 7 }}>
      <Text numberOfLines={1} style={{ fontSize: 13, color: l.site_id ? '#111827' : '#b45309', fontWeight: '500' }}>{l.site_id ? jobTag(site(l.site_id) as never) : 'Choose The Job ▾'}{l.how ? `  (from ${l.how})` : ''}</Text>
    </Pressable>
  );
  const qty = (k: number, l: RLine) => <TextInput editable={!readOnly} accessibilityLabel={`Line ${k + 1} quantity`} keyboardType="decimal-pad" placeholder="Qty" value={l.qty == null ? '' : String(l.qty)} onChangeText={(t) => edit(k, l, { qty: num(t) })} style={[box, { textAlign: 'center' }]} />;
  const rate = (k: number, l: RLine) => (
    <View style={[box, { flexDirection: 'row', alignItems: 'center', paddingVertical: 0 }]}>
      <Text style={{ color: '#6b7280', fontSize: 14 }}>£</Text>
      <TextInput editable={!readOnly} accessibilityLabel={`Line ${k + 1} unit price`} keyboardType="decimal-pad" placeholder="0.00" value={l.unit_price == null ? '' : String(l.unit_price)} onChangeText={(t) => edit(k, l, { unit_price: num(t) })} style={{ flex: 1, minWidth: 0, paddingVertical: 6, paddingLeft: 3, color: '#111827', fontSize: 14, textAlign: 'center' }} />
    </View>
  );
  const total = (l: RLine) => <Text style={{ fontWeight: '600', color: '#111827', textAlign: 'right', fontSize: 14 }}>{money(lineValue(l))}</Text>;
  const note = (k: number) => { const c = cheque(checks[k]); return c ? <Text style={{ color: c.col, fontSize: 12, fontWeight: '500', marginTop: 4 }}>{c.t}</Text> : null; };
  const desc = (k: number, l: RLine) => <TextInput editable={!readOnly} accessibilityLabel={`Line ${k + 1} description`} value={l.description ?? ''} onChangeText={(t) => set(k, { description: t })} placeholder="Description" style={box} />;
  const cell = (flex: number, child: ReactNode) => <View style={{ flex, minWidth: 0 }}>{child}</View>;

  return (
    <Card>
      <Text style={{ fontSize: 15, fontWeight: '600', color: '#111827', marginBottom: 10 }}>Lines ({lines.length})</Text>
      {wide && (
        <View style={{ flexDirection: 'row', gap: 8, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
          {cell(W.desc, <Text style={head}>Description</Text>)}{cell(W.job, <Text style={head}>Job</Text>)}
          {cell(W.qty, <Text style={[head, { textAlign: 'center' }]}>Qty</Text>)}{cell(W.rate, <Text style={[head, { textAlign: 'center' }]}>£ Each</Text>)}{cell(W.total, <Text style={[head, { textAlign: 'right' }]}>Total</Text>)}
        </View>
      )}
      {lines.map((l, k) => (
        <View key={k} style={{ borderBottomWidth: 1, borderBottomColor: '#f0f1f3', paddingVertical: 8 }}>
          {wide ? (
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              {cell(W.desc, desc(k, l))}{cell(W.job, job(k, l))}{cell(W.qty, qty(k, l))}{cell(W.rate, rate(k, l))}{cell(W.total, total(l))}
            </View>
          ) : (
            <>
              {desc(k, l)}
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end', marginTop: 6 }}>
                {cell(1, <><Text style={[head, { textAlign: 'center', marginBottom: 3 }]}>Qty</Text>{qty(k, l)}</>)}
                {cell(1.3, <><Text style={[head, { textAlign: 'center', marginBottom: 3 }]}>£ Each</Text>{rate(k, l)}</>)}
                {cell(1.3, <><Text style={[head, { textAlign: 'right', marginBottom: 3 }]}>Total</Text><View style={{ height: 33, justifyContent: 'center' }}>{total(l)}</View></>)}
              </View>
              <View style={{ marginTop: 6 }}>{job(k, l)}</View>
            </>
          )}
          {note(k)}
        </View>
      ))}
      <View style={{ paddingTop: 10, gap: 3, alignSelf: wide ? 'flex-end' : 'stretch', minWidth: wide ? 280 : undefined }}>
        {([['Lines add up to', money(sum), off ? base.red : '#111827', '600'], ['Net on the invoice', read.net == null ? 'Not read' : money(Number(read.net)), '#111827', '400'], ['VAT', read.vat == null ? 'Not read' : money(Number(read.vat)), '#111827', '400'], ['Total', read.total == null ? 'Not read' : money(Number(read.total)), '#111827', '600']] as const).map(([lab, v, col, w]) => (
          <View key={lab} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 16 }}><Text style={{ fontSize: 13, color: '#6b7280' }}>{lab}</Text><Text style={{ fontSize: 13.5, fontWeight: w, color: col }}>{v}</Text></View>
        ))}
      </View>
      {!readOnly && lines.length > 1 && <View style={{ marginTop: 10 }}><Button small kind="ghost" title="Put Every Line On One Job" onPress={async () => { const s = await pickJob('Which project are they all for?', sites as never); if (s) onChange(lines.map((l) => ({ ...l, site_id: s, how: undefined }))); }} /></View>}
    </Card>
  );
}
