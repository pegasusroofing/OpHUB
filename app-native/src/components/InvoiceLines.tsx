// An unallocated invoice's lines, as read: change any line, choose its job, and see what it should have cost.
import { Pressable, Text, TextInput, View } from 'react-native';

import { pickJob } from '@/components/FinSales';
import { Button, Card, Muted, SectionTitle } from '@/components/ui';
import { jobTag, money, rateMoney, round2 } from '@/lib/rules/finance';
import { lineValue, type PriceCheck, type RLine, type RSite } from '@/lib/rules/invoiceRead';
import { base, radius } from '@/theme/theme';

const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, paddingHorizontal: 8, paddingVertical: 6, color: base.ink, backgroundColor: base.card, fontSize: 16 } as const;
const when = (d?: string) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : '');
const cheque = (c?: PriceCheck) => {
  if (!c || c.state === 'none') return c?.charged != null ? { t: 'No quote or price list for this', col: base.slate } : null;
  const src = `${c.from}${c.date ? `, ${when(c.date)}` : ''}`;
  if (c.state === 'ok') return { t: `Matches ${src}`, col: base.ok };
  return { t: `${c.state === 'over' ? 'Dearer' : 'Cheaper'} than ${src}: ${rateMoney(c.rate as number)}`, col: c.state === 'over' ? base.red : base.blue };
};

export function InvoiceLines({ lines, checks, sites, read, onChange, readOnly }: { lines: RLine[]; checks: PriceCheck[]; sites: RSite[]; read: { net?: number; vat?: number; total?: number }; onChange: (l: RLine[]) => void; readOnly?: boolean }) {
  const site = (id?: string | null) => sites.find((s) => s.id === id);
  const set = (k: number, patch: Partial<RLine>) => onChange(lines.map((l, j) => (j === k ? { ...l, ...patch } : l)));
  const num = (t: string) => { const n = Number(t.replace(/[£,\s]/g, '')); return t.trim() && isFinite(n) ? n : undefined; };
  const edit = (k: number, l: RLine, patch: Partial<RLine>) => { const m = { ...l, ...patch }; set(k, { ...patch, ...(m.qty != null && m.unit_price != null ? { amount: round2(Number(m.qty) * Number(m.unit_price)) } : {}) }); };
  const sum = round2(lines.reduce((t, l) => t + lineValue(l), 0));
  const off = read.net != null && Math.abs(sum - Number(read.net)) >= 0.5;
  return (
    <Card>
      <SectionTitle>Lines ({lines.length})</SectionTitle>
      {lines.map((l, k) => {
        const c = cheque(checks[k]);
        return (
          <View key={k} style={{ borderTopWidth: k ? 1 : 0, borderTopColor: base.line, paddingVertical: 8 }}>
            <TextInput editable={!readOnly} accessibilityLabel={`Line ${k + 1} description`} value={l.description ?? ''} onChangeText={(t) => set(k, { description: t })} multiline style={[box, { marginBottom: 6 }]} />
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 6 }}>
              <TextInput editable={!readOnly} accessibilityLabel={`Line ${k + 1} quantity`} keyboardType="decimal-pad" placeholder="Qty" value={l.qty == null ? '' : String(l.qty)} onChangeText={(t) => edit(k, l, { qty: num(t) })} style={[box, { width: 62 }]} />
              <Text style={{ color: base.slate }}>×</Text>
              <TextInput editable={!readOnly} accessibilityLabel={`Line ${k + 1} unit price`} keyboardType="decimal-pad" placeholder="£ each" value={l.unit_price == null ? '' : String(l.unit_price)} onChangeText={(t) => edit(k, l, { unit_price: num(t) })} style={[box, { width: 86 }]} />
              <Text style={{ flex: 1, textAlign: 'right', fontWeight: '600', color: base.ink }}>{money(lineValue(l))}</Text>
            </View>
            <Pressable disabled={readOnly} accessibilityRole="button" accessibilityLabel={`Line ${k + 1} job`} onPress={async () => { const s = await pickJob('Which project is this line for?', sites as never); if (s) set(k, { site_id: s, how: undefined }); }} style={{ borderWidth: 1, borderColor: l.site_id ? base.line : base.warn, borderRadius: radius.input, padding: 8 }}>
              <Text style={{ color: l.site_id ? base.ink : base.warn, fontWeight: '500' }}>{l.site_id ? jobTag(site(l.site_id) as never) : 'Choose the job…'}{l.how ? `  (from ${l.how})` : ''}</Text>
            </Pressable>
            {!!c && <Text style={{ color: c.col, fontSize: 12, fontWeight: '500', marginTop: 5 }}>{c.t}</Text>}
          </View>
        );
      })}
      <View style={{ borderTopWidth: 1, borderTopColor: base.ink, paddingTop: 8, gap: 2 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Muted>Lines add up to</Muted><Text style={{ fontWeight: '500', color: off ? base.red : base.ink }}>{money(sum)}</Text></View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Muted>Net on the invoice</Muted><Text style={{ color: base.ink }}>{read.net == null ? 'Not read' : money(Number(read.net))}</Text></View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Muted>VAT</Muted><Text style={{ color: base.ink }}>{read.vat == null ? 'Not read' : money(Number(read.vat))}</Text></View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Muted>Total</Muted><Text style={{ fontWeight: '600', color: base.ink }}>{read.total == null ? 'Not read' : money(Number(read.total))}</Text></View>
      </View>
      {!readOnly && lines.length > 1 && <View style={{ marginTop: 8 }}><Button small kind="ghost" title="Put every line on one job" onPress={async () => { const s = await pickJob('Which project are they all for?', sites as never); if (s) onChange(lines.map((l) => ({ ...l, site_id: s, how: undefined }))); }} /></View>}
    </Card>
  );
}
