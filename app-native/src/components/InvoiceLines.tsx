// A purchase invoice's lines (and a PO's): change any line, choose its job, cost code and VAT, and see what it should
// have cost. Compact rows like Applications (Andy, 3 Nov 2026): wide enough, one row per line under headings; narrower
// (a phone, or beside the PDF) the description, then Job and Cost Code, then the figures. Bulk Edit sets the job, cost
// code or VAT on every line at once.
// 5 Nov 2026 (Andy): a unit, a discount %, rates to 3 decimal places, add and remove lines, and any line split across
// several projects by % (⇄), which must add up to 100%.
import { useState, type ReactNode } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { pickJob } from '@/components/FinSales';
import { chooseAction } from '@/components/toast';
import { Card } from '@/components/ui';
import { COST_CATS } from '@/lib/rules/finBook';
import { jobTag, money, rateMoney, round2 } from '@/lib/rules/finance';
import { allocProblem, lineAmount, linesNet, linesVat, lineValue, type Alloc, type PriceCheck, type RLine, type RSite } from '@/lib/rules/invoiceRead';
import { base } from '@/theme/theme';

type Line = RLine;
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
const W = { desc: 2.4, job: 1.6, cost: 1.1, qty: 0.6, unit: 0.6, rate: 0.85, disc: 0.5, vat: 0.6, total: 0.85, x: 0.22 };
/** A fresh line: the project given, materials, 20% VAT. */
export const blankLine = (site?: string | null): RLine => ({ description: '', qty: 1, unit: 'each', unit_price: undefined, amount: 0, site_id: site || null, cost_code: 'materials', vat_rate: 20, disc: 0 });

export function InvoiceLines({ lines: lines0, checks, sites, read, onChange, readOnly, defaultSite, title = 'Lines', costHeading = 'Cost Code', noJob }: {
  lines: RLine[]; checks: PriceCheck[]; sites: RSite[]; read?: { net?: number; vat?: number; total?: number } | null; onChange: (l: RLine[]) => void; readOnly?: boolean;
  defaultSite?: string | null; title?: string; costHeading?: string; noJob?: boolean;
}) {
  const lines = lines0 as Line[];
  const [cardW, setCardW] = useState(0);
  const [splitAt, setSplitAt] = useState<number | null>(null);
  const wide = cardW >= 760;
  const site = (id?: string | null) => sites.find((s) => s.id === id);
  const set = (k: number, patch: Partial<Line>) => onChange(lines.map((l, j) => (j === k ? { ...l, ...patch } : l)));
  const all = (patch: Partial<Line>) => onChange(lines.map((l) => ({ ...l, ...patch })));
  const num = (t: string) => { const n = Number(t.replace(/[£%,\s]/g, '')); return t.trim() && isFinite(n) ? n : undefined; };
  // The line's amount follows its quantity, rate and discount.
  const edit = (k: number, l: Line, patch: Partial<Line>) => { const m = { ...l, ...patch }; set(k, { ...patch, ...(m.qty != null && m.unit_price != null ? { amount: lineAmount(m.qty, m.unit_price, m.disc) } : {}) }); };
  const sum = linesNet(lines), vatSum = linesVat(lines);
  const off = read?.net != null && Math.abs(sum - Number(read.net)) >= 0.5;
  const vatOff = read?.vat != null && Math.abs(vatSum - Number(read.vat)) >= 0.5;

  const pick = (label: string, v: string, warn: boolean, onPress: () => void, blue?: boolean) => (
    <Pressable disabled={readOnly} accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={[box, { justifyContent: 'center', borderColor: warn ? '#f8e7c2' : blue ? base.blue : '#e5e7eb', backgroundColor: warn ? '#fffaf0' : base.card }]}>
      <Text numberOfLines={1} style={{ fontSize: 12.5, color: warn ? '#b45309' : blue ? base.blue : '#111827', fontWeight: '500' }}>{v}</Text>
    </Pressable>
  );
  const chooseJob = async (onPick: (id: string) => void, title2 = 'Which project is this line for?') => { const s = await pickJob(title2, sites as never); if (s) onPick(s); };
  const chooseCost = async (cur: string | undefined, onPick: (c: string) => void) => { const k = await chooseAction('Cost code', COSTS.map(([c, l]) => ({ key: c, label: `${c === cur ? '✓ ' : ''}${l}` }))); if (k) onPick(k); };
  const chooseVat = async (cur: string, onPick: (v: number | 'rc') => void) => { const k = await chooseAction('VAT rate', VATS.map(([v, l]) => ({ key: v, label: `${v === cur ? '✓ ' : ''}${l}` }))); if (k) onPick(k === 'rc' ? 'rc' : Number(k)); };

  // The job cell: one project, or "Split 3 Ways" for a line shared across projects.
  const job = (k: number, l: Line) => (l.alloc?.length
    ? pick(`Line ${k + 1} split`, `Split ${l.alloc.length} Ways${allocProblem(l) ? ' ⚠' : ''}`, !!allocProblem(l), () => setSplitAt(splitAt === k ? null : k), true)
    : pick(`Line ${k + 1} job`, l.site_id ? `${jobTag(site(l.site_id) as never)}${l.how ? ` (from ${l.how})` : ''}` : 'Choose Job ▾', !l.site_id, () => void (async () => {
      const a = await chooseAction(`Line ${k + 1}`, [{ key: 'one', label: 'Choose the project' }, { key: 'split', label: '⇄ Split across projects by %' }]);
      if (a === 'one') void chooseJob((s) => set(k, { site_id: s, how: undefined }));
      if (a === 'split') { set(k, { alloc: [{ site_id: l.site_id || defaultSite || '', pct: 50 }, { site_id: '', pct: 50 }] }); setSplitAt(k); }
    })()));
  const cost = (k: number, l: Line) => pick(`Line ${k + 1} cost code`, `${COST_CATS[l.cost_code || 'materials'] || 'Materials'} ▾`, false, () => void chooseCost(l.cost_code || 'materials', (c) => set(k, { cost_code: c })));
  const vat = (k: number, l: Line) => pick(`Line ${k + 1} VAT`, `${vatLabel(l)} ▾`, false, () => void chooseVat(vatOf(l), (v) => set(k, { vat_rate: v })));
  const field = (k: number, label: string, v: unknown, onT: (t: string) => void, ph: string, align: 'center' | 'right' = 'center', kb: 'decimal-pad' | 'default' = 'decimal-pad') => <TextInput editable={!readOnly} accessibilityLabel={`Line ${k + 1} ${label}`} keyboardType={kb} placeholder={ph} value={v == null ? '' : String(v)} onChangeText={onT} style={[box, { textAlign: align }]} />;
  const qty = (k: number, l: Line) => field(k, 'quantity', l.qty, (t) => edit(k, l, { qty: num(t) }), 'Qty');
  const unit = (k: number, l: Line) => field(k, 'unit', l.unit, (t) => set(k, { unit: t }), 'each', 'center', 'default');
  const disc = (k: number, l: Line) => field(k, 'discount', l.disc || l.disc === 0 ? l.disc : '', (t) => edit(k, l, { disc: num(t) ?? 0 }), '0');
  const rate = (k: number, l: Line) => (
    <View style={[box, { flexDirection: 'row', alignItems: 'center', paddingVertical: 0 }]}>
      <Text style={{ color: '#6b7280', fontSize: 13 }}>£</Text>
      <TextInput editable={!readOnly} accessibilityLabel={`Line ${k + 1} unit price`} keyboardType="decimal-pad" placeholder="0.000" value={l.unit_price == null ? '' : String(l.unit_price)} onChangeText={(t) => edit(k, l, { unit_price: num(t) })} style={{ flex: 1, minWidth: 0, paddingLeft: 3, color: '#111827', fontSize: 13, textAlign: 'center', height: 28 }} />
    </View>
  );
  const total = (l: Line) => <Text style={{ fontWeight: '600', color: '#111827', textAlign: 'right', fontSize: 13 }}>{money(lineValue(l))}</Text>;
  const drop = (k: number) => (readOnly ? null : <Pressable accessibilityRole="button" accessibilityLabel={`Remove line ${k + 1}`} hitSlop={6} onPress={() => { onChange(lines.filter((_, j) => j !== k)); setSplitAt(null); }} style={{ alignItems: 'center' }}><Text style={{ color: '#9ca3af', fontSize: 15 }}>✕</Text></Pressable>);
  const note = (k: number) => { const c = cheque(checks[k]); return c ? <Text style={{ color: c.col, fontSize: 11.5, fontWeight: '500', marginTop: 3 }}>{c.t}</Text> : null; };
  const desc = (k: number, l: Line) => <TextInput editable={!readOnly} accessibilityLabel={`Line ${k + 1} description`} value={l.description ?? ''} onChangeText={(t) => set(k, { description: t })} placeholder="Description" style={box} />;
  const cell = (flex: number, child: ReactNode) => <View style={{ flex, minWidth: 0 }}>{child}</View>;
  const labelled = (flex: number, label: string, child: ReactNode, align: 'center' | 'right' = 'center') => cell(flex, <><Text style={[head, { textAlign: align, marginBottom: 2 }]}>{label}</Text>{child}</>);

  // The split box under a line: a project and a % on each row, with the £ it comes to.
  const splitBox = (k: number, l: Line) => {
    const a = l.alloc || [], amt = lineValue(l), prob = allocProblem(l);
    const setA = (next: Alloc[]) => set(k, next.length ? { alloc: next } : { alloc: undefined, site_id: a[0]?.site_id || l.site_id });
    return (
      <View style={{ marginTop: 6, padding: 10, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: '#cfd4da', backgroundColor: '#F7F8FA', gap: 6 }}>
        <Text style={head}>Split: {l.description || `Line ${k + 1}`} ({money(amt)})</Text>
        {a.map((x, j) => (
          <View key={j} style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            {cell(3, pick(`Split row ${j + 1} project`, x.site_id ? jobTag(site(x.site_id) as never) : 'Choose Project ▾', !x.site_id, () => void chooseJob((s) => setA(a.map((y, i) => (i === j ? { ...y, site_id: s } : y))), 'Which project?')))}
            {cell(0.8, <TextInput editable={!readOnly} accessibilityLabel={`Split row ${j + 1} percent`} keyboardType="decimal-pad" value={String(x.pct ?? '')} onChangeText={(t) => setA(a.map((y, i) => (i === j ? { ...y, pct: num(t) ?? 0 } : y)))} style={[box, { textAlign: 'right' }]} />)}
            <Text style={{ color: '#6b7280' }}>%</Text>
            {cell(0.9, <Text style={{ textAlign: 'right', color: '#111827' }}>{money(round2((amt * Number(x.pct || 0)) / 100))}</Text>)}
            {!readOnly && <Pressable accessibilityLabel={`Remove split row ${j + 1}`} onPress={() => setA(a.filter((_, i) => i !== j))}><Text style={{ color: '#9ca3af' }}>✕</Text></Pressable>}
          </View>
        ))}
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: prob ? base.red : base.ok }}>{prob || 'Adds up to 100% ✓'}</Text>
          {!readOnly && <Pressable onPress={() => setA([...a, { site_id: '', pct: 0 }])}><Text style={{ color: base.blue, fontSize: 12.5 }}>+ Add Project</Text></Pressable>}
          {!readOnly && a.length > 0 && <Pressable onPress={() => { const n = a.length, each = Math.floor((10000 / n)) / 100; setA(a.map((y, i) => ({ ...y, pct: i === n - 1 ? round2(100 - each * (n - 1)) : each }))); }}><Text style={{ color: base.blue, fontSize: 12.5 }}>Split Evenly</Text></Pressable>}
          <Pressable onPress={() => setSplitAt(null)}><Text style={{ color: '#6b7280', fontSize: 12.5 }}>Done</Text></Pressable>
        </View>
      </View>
    );
  };

  const bulk = async () => {
    const k = await chooseAction('Bulk edit — every line', [...(noJob ? [] : [{ key: 'job', label: 'Set the job on every line' }]), { key: 'cost', label: 'Set the cost code on every line' }, { key: 'vat', label: 'Set the VAT rate on every line' }, { key: 'disc', label: 'Set the discount on every line' }]);
    if (k === 'job') void chooseJob((s) => all({ site_id: s, how: undefined, alloc: undefined }), 'Which project are they all for?');
    else if (k === 'cost') void chooseCost(undefined, (c) => all({ cost_code: c }));
    else if (k === 'vat') void chooseVat('', (v) => all({ vat_rate: v }));
    else if (k === 'disc') { const d = await chooseAction('Discount on every line', ['0', '2.5', '5', '10', '15', '20', '25', '30'].map((x) => ({ key: x, label: `${x}%` }))); if (d != null) onChange(lines.map((l) => ({ ...l, disc: Number(d), ...(l.qty != null && l.unit_price != null ? { amount: lineAmount(l.qty, l.unit_price, Number(d)) } : {}) }))); }
  };
  const showJob = !noJob;

  return (
    <Card style={{ paddingVertical: 12 }}>
      <View onLayout={(e) => setCardW(e.nativeEvent.layout.width)}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <Text style={{ flex: 1, fontSize: 14.5, fontWeight: '600', color: '#111827' }}>{title} ({lines.length})</Text>
          {!readOnly && lines.length > 0 && <Pressable onPress={() => void bulk()} accessibilityRole="button" style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 7, paddingHorizontal: 10, height: 28, justifyContent: 'center' }}><Text style={{ fontSize: 12.5, fontWeight: '500', color: '#111827' }}>Bulk Edit ▾</Text></Pressable>}
        </View>
        {wide && (
          <View style={{ flexDirection: 'row', gap: 6, paddingBottom: 5, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
            {cell(W.desc, <Text style={head}>Description</Text>)}{showJob && cell(W.job, <Text style={head}>Job</Text>)}{cell(W.cost, <Text style={head}>{costHeading}</Text>)}
            {cell(W.qty, <Text style={[head, { textAlign: 'center' }]}>Qty</Text>)}{cell(W.unit, <Text style={[head, { textAlign: 'center' }]}>Unit</Text>)}{cell(W.rate, <Text style={[head, { textAlign: 'center' }]}>£ Each</Text>)}
            {cell(W.disc, <Text style={[head, { textAlign: 'center' }]}>Disc %</Text>)}{cell(W.vat, <Text style={[head, { textAlign: 'center' }]}>VAT</Text>)}{cell(W.total, <Text style={[head, { textAlign: 'right' }]}>Total</Text>)}{!readOnly && cell(W.x, null)}
          </View>
        )}
        {lines.map((l, k) => (
          <View key={k} style={{ borderBottomWidth: 1, borderBottomColor: '#f0f1f3', paddingVertical: 6 }}>
            {wide ? (
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                {cell(W.desc, desc(k, l))}{showJob && cell(W.job, job(k, l))}{cell(W.cost, cost(k, l))}{cell(W.qty, qty(k, l))}{cell(W.unit, unit(k, l))}{cell(W.rate, rate(k, l))}{cell(W.disc, disc(k, l))}{cell(W.vat, vat(k, l))}{cell(W.total, total(l))}{!readOnly && cell(W.x, drop(k))}
              </View>
            ) : (
              <>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>{cell(1, desc(k, l))}{drop(k)}</View>
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 5 }}>{showJob && cell(1.4, job(k, l))}{cell(1, cost(k, l))}</View>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-end', marginTop: 5 }}>
                  {labelled(0.75, 'Qty', qty(k, l))}{labelled(0.7, 'Unit', unit(k, l))}{labelled(1.05, '£ Each', rate(k, l))}{labelled(0.65, 'Disc %', disc(k, l))}
                </View>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-end', marginTop: 5 }}>
                  {labelled(0.9, 'VAT', vat(k, l))}{labelled(1.1, 'Total', <View style={{ height: 30, justifyContent: 'center' }}>{total(l)}</View>, 'right')}
                </View>
              </>
            )}
            {splitAt === k && !!l.alloc && splitBox(k, l)}
            {note(k)}
          </View>
        ))}
        {!readOnly && (
          <Pressable accessibilityRole="button" onPress={() => onChange([...lines, blankLine(defaultSite)])} style={{ alignSelf: 'flex-start', marginTop: 8, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 7, paddingHorizontal: 10, height: 30, justifyContent: 'center', backgroundColor: '#fff' }}>
            <Text style={{ fontSize: 12.5, fontWeight: '600', color: '#111827' }}>+ Add A Line</Text>
          </Pressable>
        )}
        <View style={{ paddingTop: 8, gap: 2, alignSelf: wide ? 'flex-end' : 'stretch', minWidth: wide ? 280 : undefined }}>
          {(read && (read.net != null || read.vat != null || read.total != null)
            ? [['Lines add up to', money(sum), off ? base.red : '#111827', '600'], ['Net on the invoice', read.net == null ? 'Not read' : money(Number(read.net)), '#111827', '400'], ['VAT on the lines', money(vatSum), vatOff ? base.red : '#111827', '400'], ['VAT on the invoice', read.vat == null ? 'Not read' : money(Number(read.vat)), '#111827', '400'], ['Total', read.total == null ? money(round2(sum + vatSum)) : money(Number(read.total)), '#111827', '600']]
            : [['Net', money(sum), '#111827', '400'], ['VAT', money(vatSum), '#111827', '400'], ['Total', money(round2(sum + vatSum)), '#111827', '700']]
          ).map(([lab, v, col, w]) => (
            <View key={lab} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 16 }}><Text style={{ fontSize: 12.5, color: '#6b7280' }}>{lab}</Text><Text style={{ fontSize: 13, fontWeight: w as '400', color: col }}>{v}</Text></View>
          ))}
        </View>
      </View>
    </Card>
  );
}
