// A purchase invoice's lines (and a PO's): change any line, choose its job, cost code and VAT, and see what it should
// have cost. Compact rows like Applications (Andy, 3 Nov 2026): wide enough, one row per line under headings; narrower
// (a phone, or beside the PDF) the description, then Job and Cost Code, then the figures. Bulk Edit sets the job, cost
// code or VAT on every line at once.
// 5 Nov 2026 (Andy): a unit, a discount %, rates to 3 decimal places, add and remove lines, and any line split across
// several projects by % (⇄), which must add up to 100%.
// 6 Nov 2026 (Andy: "isn't nice to look at or simple to use"): laid out like the PO lines. Keyboard drop-downs for the
// job, cost code, unit and VAT; cost codes show just the number unless Show Code Descriptions is ticked. Wide: one row
// per line. Narrower (beside the PDF): the description on its own line, then Job, Code and the figures in one row
// under one set of headings, everything centred.
import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { pickJob } from '@/components/FinSales';
import { chooseAction } from '@/components/toast';
import { TypePick, type PickOpt } from '@/components/TypePick';
import { Card } from '@/components/ui';
import { DEFAULT_UNITS, UnitField } from '@/components/UnitField';
import { fdb } from '@/data/finance';
import { useAuth } from '@/lib/auth';
import { COST_CATS } from '@/lib/rules/finBook';
import { jobTag, money, rateMoney, round2 } from '@/lib/rules/finance';
import { allocProblem, lineAmount, linesNet, linesVat, lineValue, type Alloc, type PriceCheck, type RLine, type RSite } from '@/lib/rules/invoiceRead';
import { base, radius } from '@/theme/theme';

type Line = RLine;
const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, paddingHorizontal: 8, paddingVertical: 5, color: base.ink, backgroundColor: base.card, fontSize: 13.5, height: 32 } as const;
const mid = { textAlign: 'center' as const };
type Code = { id: string; code: string | null; name: string; category: string | null; active: boolean | null };
const head = { fontSize: 10.5, fontWeight: '600' as const, letterSpacing: 0.4, textTransform: 'uppercase' as const, color: '#6b7280' };
const COSTS = Object.entries(COST_CATS).filter(([c]) => c !== 'labour');
const VATS: [string, string][] = [['20', '20%'], ['5', '5%'], ['0', '0%'], ['rc', 'Reverse charge']];
const vatOf = (l: Line) => (l.vat_rate == null ? '20' : String(l.vat_rate));
const vatLabel = (l: Line) => (vatOf(l) === 'rc' ? 'RC' : `${vatOf(l)}%`);
const when = (d?: string) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : '');
const cheque = (c?: PriceCheck) => {
  if (!c || c.state === 'none') return null;
  const src = `${c.from}${c.date ? `, ${when(c.date)}` : ''}`;
  if (c.state === 'ok') return { t: `Matches ${src}`, col: base.ok };
  return { t: `${c.state === 'over' ? 'Dearer' : 'Cheaper'} than ${src}: ${rateMoney(c.rate as number)}`, col: c.state === 'over' ? base.red : base.blue };
};
/** A fresh line: the project given, materials, 20% VAT. */
export const blankLine = (site?: string | null): RLine => ({ description: '', qty: 1, unit: 'each', unit_price: undefined, amount: 0, site_id: site || null, cost_code: 'materials', vat_rate: 20, disc: 0 });

export function InvoiceLines({ lines: lines0, checks, sites, read, onChange, readOnly, defaultSite, title = 'Lines', costHeading = 'Cost Code', noJob }: {
  lines: RLine[]; checks: PriceCheck[]; sites: RSite[]; read?: { net?: number; vat?: number; total?: number } | null; onChange: (l: RLine[]) => void; readOnly?: boolean;
  defaultSite?: string | null; title?: string; costHeading?: string; noJob?: boolean;
}) {
  const lines = lines0 as Line[];
  const { me } = useAuth();
  const [cardW, setCardW] = useState(0);
  const [splitAt, setSplitAt] = useState<number | null>(null);
  const [fullCodes, setFullCodes] = useState(false);
  // One row per line whenever it fits (beside the PDF too, with tighter columns); two rows only when narrow.
  const wide = cardW >= 680, tight = cardW < 960, phone = cardW > 0 && cardW < 520;
  // The company's cost codes (numbers); without any, the plain categories.
  const { data: codes = [] } = useQuery({ queryKey: ['finCostCodes', me?.org_id], enabled: !!me, queryFn: async () => (((await fdb.from('fin_cost_codes').select('id,code,name,category,active').eq('org_id', me?.org_id as string)).data as Code[] | null) ?? []).filter((c) => c.active !== false && c.category !== 'labour').sort((a, b) => String(a.code || '').localeCompare(String(b.code || ''), 'en-GB', { numeric: true })) });
  const codeFor = (cat?: string) => codes.find((c) => c.category === (cat || 'materials'))?.id ?? null;
  const codeVal = (l: Line) => (codes.length ? `cc:${l.cost_code_id ?? codeFor(l.cost_code) ?? ''}` : l.cost_code || 'materials');
  const codePatch = (v: string): Partial<Line> => { if (!v.startsWith('cc:')) return { cost_code_id: null, cost_code: v || 'materials' }; const c = codes.find((x) => x.id === v.slice(3)); return { cost_code_id: c?.id ?? null, cost_code: c?.category && COST_CATS[c.category] ? c.category : 'materials' }; };
  const codeOpts: PickOpt[] = codes.length
    ? codes.map((c) => { const full = `${c.code ? `${c.code} – ` : ''}${c.name}`; return { v: `cc:${c.id}`, label: full, short: fullCodes ? full : c.code || c.name }; })
    : COSTS.map(([k, l]) => ({ v: k, label: l }));
  const jobOpts: PickOpt[] = [...sites.map((x) => ({ v: x.id, label: jobTag(x as never), short: x.job_number || x.name || '' })), { v: '__split', label: '⇄ Split across projects by %' }];
  const vatOpts: PickOpt[] = VATS.map(([v, l]) => ({ v, label: l, short: v === 'rc' ? 'RC' : `${v}%` }));
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
      style={[box, { justifyContent: 'center', borderColor: warn ? '#f8e7c2' : blue ? base.blue : base.line, backgroundColor: warn ? '#fffaf0' : base.card }]}>
      <Text numberOfLines={1} style={{ fontSize: 13, textAlign: 'center', color: warn ? '#b45309' : blue ? base.blue : base.ink, fontWeight: '500' }}>{v}</Text>
    </Pressable>
  );
  const ro = (t: string) => <View style={[box, { justifyContent: 'center', backgroundColor: '#F6F7F9' }]}><Text numberOfLines={1} style={{ fontSize: 13, textAlign: 'center', color: base.ink }}>{t}</Text></View>;
  const chooseJob = async (onPick: (id: string) => void, title2 = 'Which project is this line for?') => { const s = await pickJob(title2, sites as never); if (s) onPick(s); };
  const chooseVat = async (cur: string, onPick: (v: number | 'rc') => void) => { const k = await chooseAction('VAT rate', VATS.map(([v, l]) => ({ key: v, label: `${v === cur ? '✓ ' : ''}${l}` }))); if (k) onPick(k === 'rc' ? 'rc' : Number(k)); };
  const shortOf = (opts: PickOpt[], v: string) => { const o = opts.find((x) => x.v === v); return o ? o.short ?? o.label : ''; };

  // The job cell: a keyboard drop-down of job numbers (and ⇄ Split), or "Split 3 Ways" for a line shared across projects.
  const job = (k: number, l: Line) => (l.alloc?.length
    ? pick(`Line ${k + 1} split`, `Split ${l.alloc.length} Ways${allocProblem(l) ? ' ⚠' : ''}`, !!allocProblem(l), () => setSplitAt(splitAt === k ? null : k), true)
    : readOnly ? ro(shortOf(jobOpts, l.site_id || '') || '—')
      : <TypePick label={`Line ${k + 1} job`} value={l.site_id || ''} options={jobOpts} placeholder="Job" listWidth={300}
        style={[box, mid, !l.site_id && { borderColor: '#f8e7c2', backgroundColor: '#fffaf0' }]}
        onChange={(v) => { if (v === '__split') { set(k, { alloc: [{ site_id: l.site_id || defaultSite || '', pct: 50 }, { site_id: '', pct: 50 }] }); setSplitAt(k); } else set(k, { site_id: v, how: undefined }); }} />);
  const cost = (k: number, l: Line) => (readOnly ? ro(shortOf(codeOpts, codeVal(l))) : <TypePick label={`Line ${k + 1} cost code`} value={codeVal(l)} options={codeOpts} listWidth={280} style={[box, mid]} onChange={(v) => set(k, codePatch(v))} />);
  const vat = (k: number, l: Line) => (readOnly ? ro(vatLabel(l)) : <TypePick label={`Line ${k + 1} VAT`} value={vatOf(l)} options={vatOpts} listWidth={200} style={[box, mid]} onChange={(v) => set(k, { vat_rate: v === 'rc' ? 'rc' : Number(v) })} />);
  const field = (k: number, label: string, v: unknown, onT: (t: string) => void, ph: string) => <TextInput editable={!readOnly} accessibilityLabel={`Line ${k + 1} ${label}`} keyboardType="decimal-pad" placeholder={ph} value={v == null ? '' : String(v)} onChangeText={onT} style={[box, mid]} />;
  const qty = (k: number, l: Line) => field(k, 'quantity', l.qty, (t) => edit(k, l, { qty: num(t) }), 'Qty');
  const unit = (k: number, l: Line) => (readOnly ? ro(l.unit || '') : <UnitField value={l.unit || ''} onChangeText={(t) => set(k, { unit: t })} units={DEFAULT_UNITS} style={[box, mid, { width: '100%' }]} />);
  const disc = (k: number, l: Line) => field(k, 'discount', l.disc || l.disc === 0 ? l.disc : '', (t) => edit(k, l, { disc: num(t) ?? 0 }), '0');
  const rate = (k: number, l: Line) => <TextInput editable={!readOnly} accessibilityLabel={`Line ${k + 1} unit price`} keyboardType="decimal-pad" placeholder="0.000" value={l.unit_price == null ? '' : String(l.unit_price)} onChangeText={(t) => edit(k, l, { unit_price: num(t) })} style={[box, mid]} />;
  const total = (l: Line) => <View style={{ height: 32, justifyContent: 'center' }}><Text style={{ fontWeight: '600', color: base.ink, textAlign: 'center', fontSize: 13.5 }}>{money(lineValue(l))}</Text></View>;
  const drop = (k: number) => (readOnly ? null : <Pressable accessibilityRole="button" accessibilityLabel={`Remove line ${k + 1}`} hitSlop={6} onPress={() => { onChange(lines.filter((_, j) => j !== k)); setSplitAt(null); }} style={{ width: 20, height: 32, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#9ca3af', fontSize: 15 }}>✕</Text></Pressable>);
  const note = (k: number) => { const c = cheque(checks[k]); return c ? <Text style={{ color: c.col, fontSize: 11.5, fontWeight: '500', marginTop: 4 }}>{c.t}</Text> : null; };
  const desc = (k: number, l: Line) => <TextInput editable={!readOnly} accessibilityLabel={`Line ${k + 1} description`} value={l.description ?? ''} onChangeText={(t) => set(k, { description: t })} placeholder="Description" style={box} />;
  const cell = (w: number | 'flex', child: ReactNode, z = 0) => <View style={[w === 'flex' ? { flex: 1, minWidth: 120 } : { width: w }, z ? { zIndex: z } : null]}>{child}</View>;
  const H = (t: string, align: 'left' | 'center' | 'right' = 'center') => <Text style={[head, { textAlign: align }]}>{t}</Text>;
  // Column widths. Wide: one row. Narrower: the figures share the second row.
  const CW = tight ? { job: 74, code: fullCodes ? 180 : 66, qty: 48, unit: 58, rate: 74, disc: 46, vat: 56, total: 76, x: 20 } : { job: 92, code: fullCodes ? 210 : 80, qty: 58, unit: 66, rate: 84, disc: 56, vat: 64, total: 84, x: 20 };
  const FIG = phone ? { job: 0, code: 0, qty: 0.8, unit: 0.9, rate: 1.1, disc: 0.75, vat: 0.85, total: 1.25 } : { job: noJob ? 0 : 1.05, code: fullCodes ? 2.4 : 0.95, qty: 0.75, unit: 0.85, rate: 1.05, disc: 0.7, vat: 0.8, total: 1.15 };
  const fcell = (f: number, child: ReactNode, z = 0) => <View style={[{ flex: f, minWidth: 0 }, z ? { zIndex: z } : null]}>{child}</View>;
  const figures = (k: number, l: Line) => (
    <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
      {!phone && showJob && fcell(FIG.job, job(k, l), 5)}{!phone && fcell(FIG.code, cost(k, l), 4)}{fcell(FIG.qty, qty(k, l))}{fcell(FIG.unit, unit(k, l), 3)}{fcell(FIG.rate, rate(k, l))}{fcell(FIG.disc, disc(k, l))}{fcell(FIG.vat, vat(k, l), 2)}{fcell(FIG.total, total(l))}{!readOnly && <View style={{ width: 20 }} />}
    </View>
  );

  // The split box under a line: a project and a % on each row, with the £ it comes to.
  const splitBox = (k: number, l: Line) => {
    const a = l.alloc || [], amt = lineValue(l), prob = allocProblem(l);
    const setA = (next: Alloc[]) => set(k, next.length ? { alloc: next } : { alloc: undefined, site_id: a[0]?.site_id || l.site_id });
    return (
      <View style={{ marginTop: 6, padding: 10, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: '#cfd4da', backgroundColor: '#F7F8FA', gap: 6 }}>
        <Text style={head}>Split: {l.description || `Line ${k + 1}`} ({money(amt)})</Text>
        {a.map((x, j) => (
          <View key={j} style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            {fcell(3, pick(`Split row ${j + 1} project`, x.site_id ? jobTag(site(x.site_id) as never) : 'Choose Project ▾', !x.site_id, () => void chooseJob((s) => setA(a.map((y, i) => (i === j ? { ...y, site_id: s } : y))), 'Which project?')))}
            {fcell(0.8, <TextInput editable={!readOnly} accessibilityLabel={`Split row ${j + 1} percent`} keyboardType="decimal-pad" value={String(x.pct ?? '')} onChangeText={(t) => setA(a.map((y, i) => (i === j ? { ...y, pct: num(t) ?? 0 } : y)))} style={[box, { textAlign: 'right' }]} />)}
            <Text style={{ color: '#6b7280' }}>%</Text>
            {fcell(0.9, <Text style={{ textAlign: 'right', color: '#111827' }}>{money(round2((amt * Number(x.pct || 0)) / 100))}</Text>)}
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
    else if (k === 'cost') { const c = await chooseAction('Cost code on every line', codeOpts.map((o) => ({ key: o.v, label: o.label }))); if (c) all(codePatch(c)); }
    else if (k === 'vat') void chooseVat('', (v) => all({ vat_rate: v }));
    else if (k === 'disc') { const d = await chooseAction('Discount on every line', ['0', '2.5', '5', '10', '15', '20', '25', '30'].map((x) => ({ key: x, label: `${x}%` }))); if (d != null) onChange(lines.map((l) => ({ ...l, disc: Number(d), ...(l.qty != null && l.unit_price != null ? { amount: lineAmount(l.qty, l.unit_price, Number(d)) } : {}) }))); }
  };
  const showJob = !noJob;

  return (
    <Card style={{ paddingVertical: 12 }}>
      <View onLayout={(e) => setCardW(e.nativeEvent.layout.width)}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <Text style={{ flex: 1, fontSize: 14.5, fontWeight: '600', color: base.ink }}>{title} ({lines.length})</Text>
          {codes.length > 0 && <Pressable onPress={() => setFullCodes(!fullCodes)}><Text style={{ color: base.blue, fontSize: 12.5 }}>{fullCodes ? 'Codes Only' : 'Show Code Descriptions'}</Text></Pressable>}
          {!readOnly && lines.length > 0 && <Pressable onPress={() => void bulk()} accessibilityRole="button" style={{ borderWidth: 1, borderColor: base.line, borderRadius: 7, paddingHorizontal: 10, height: 28, justifyContent: 'center' }}><Text style={{ fontSize: 12.5, fontWeight: '500', color: base.ink }}>Bulk Edit ▾</Text></Pressable>}
        </View>
        {/* Headings once at the top. */}
        <View style={{ paddingBottom: 5, borderBottomWidth: 1, borderBottomColor: base.line }}>
          {wide ? (
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {cell('flex', H('Description', 'left'))}{showJob && cell(CW.job, H('Job'))}{cell(CW.code, H(costHeading))}{cell(CW.qty, H('Qty'))}{cell(CW.unit, H('Unit'))}{cell(CW.rate, H('£ Each'))}{cell(CW.disc, H('Disc %'))}{cell(CW.vat, H('VAT'))}{cell(CW.total, H('Total'))}{!readOnly && cell(CW.x, null)}
            </View>
          ) : (
            <>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {!phone && showJob && fcell(FIG.job, H('Job'))}{!phone && fcell(FIG.code, H(costHeading))}{fcell(FIG.qty, H('Qty'))}{fcell(FIG.unit, H('Unit'))}{fcell(FIG.rate, H('£ Each'))}{fcell(FIG.disc, H('Disc %'))}{fcell(FIG.vat, H('VAT'))}{fcell(FIG.total, H('Total'))}{!readOnly && <View style={{ width: 20 }} />}
              </View>
            </>
          )}
        </View>
        {lines.map((l, k) => (
          <View key={k} style={{ borderBottomWidth: 1, borderBottomColor: '#eef0f3', paddingVertical: 8, zIndex: lines.length - k }}>
            {wide ? (
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                {cell('flex', desc(k, l))}{showJob && cell(CW.job, job(k, l), 4)}{cell(CW.code, cost(k, l), 3)}{cell(CW.qty, qty(k, l))}{cell(CW.unit, unit(k, l), 2)}{cell(CW.rate, rate(k, l))}{cell(CW.disc, disc(k, l))}{cell(CW.vat, vat(k, l), 1)}{cell(CW.total, total(l))}{drop(k)}
              </View>
            ) : phone ? (
              <>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>{cell('flex', desc(k, l))}{drop(k)}</View>
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, zIndex: 5 }}>{showJob && cell('flex', job(k, l), 4)}{cell('flex', cost(k, l), 3)}{!readOnly && <View style={{ width: 20 }} />}</View>
                {figures(k, l)}
              </>
            ) : (
              <>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>{cell('flex', desc(k, l))}{drop(k)}</View>
                <View style={{ zIndex: 5 }}>{figures(k, l)}</View>
              </>
            )}
            {splitAt === k && !!l.alloc && splitBox(k, l)}
            {note(k)}
          </View>
        ))}
        {!readOnly && (
          <Pressable accessibilityRole="button" onPress={() => onChange([...lines, blankLine(defaultSite)])} style={{ alignSelf: 'flex-start', marginTop: 10, borderWidth: 1, borderColor: base.line, borderRadius: 7, paddingHorizontal: 10, height: 30, justifyContent: 'center', backgroundColor: '#fff' }}>
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
