// Book a cost to a plot / repair job, or split it across projects and plots (917 openFinSplit):
// a "Booked to" row with the button, and the box that edits the split.
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { FinChip } from '@/components/FinNav';
import { pickJob } from '@/components/FinSales';
import { chooseAction, confirmAsk, useToast } from '@/components/toast';
import { Button, Muted } from '@/components/ui';
import { fdb } from '@/data/finance';
import { loadSubJobs, subKind, subNoun, type SubJob } from '@/data/finSubJobs';
import { useSites } from '@/data/sites';
import { allocs } from '@/lib/rules/finBook';
import { jobTag, money, num, plantCost, round2 } from '@/lib/rules/finance';
import { splitAcross, splitEven, splitFoot, splitMode, splitPatch, splitStart, splitTotal, type SplitLine } from '@/lib/rules/finSplit';
import { base, radius } from '@/theme/theme';

type Row = Record<string, any>;
export type SplitTable = 'purchase_invoices' | 'purchase_orders' | 'fin_job_costs' | 'fin_plant_hires';
const NOUN: Record<SplitTable, string> = { purchase_invoices: 'purchase invoice', purchase_orders: 'PO', fin_job_costs: 'cost', fin_plant_hires: 'plant hire' };
// A hire costed from the hire company's invoices has no cost of its own (the invoices carry it).
const netOf = (t: SplitTable, r: Row): number | null => { const n = t === 'purchase_orders' ? r.value : t === 'fin_plant_hires' ? (r.cost_from === 'invoices' || !r.on_hire ? null : plantCost(r as never).cost) : r.net; return n != null && !isNaN(Number(n)) && Number(n) > 0 ? round2(Number(n)) : null; };

/** "Booked to Plot 3 · Change split" — shown when the project has plots / repair jobs or the cost is split. */
export function AllocRow({ table, row, po, onSaved }: { table: SplitTable; row: Row; po?: Row | null; onSaved?: () => void }) {
  const { data: sites = [] } = useSites();
  const home = sites.find((s) => s.id === row.site_id);
  const [subs, setSubs] = useState<Record<string, SubJob[]>>({});
  const [open, setOpen] = useState(false);
  const split = Array.isArray(row.split) && row.split.length > 0;
  const siteIds = Array.from(new Set([row.site_id, ...(split ? row.split.map((e: Row) => e.site_id) : [])])).filter(Boolean).join(',');
  useEffect(() => {
    let live = true;
    void Promise.all(siteIds.split(',').filter(Boolean).map(async (id) => [id, await loadSubJobs(sites.find((s) => s.id === id))] as const)).then((x) => { if (live) setSubs(Object.fromEntries(x)); });
    return () => { live = false; };
  }, [siteIds, sites]);
  if (!row.site_id || (!subKind(home) && !split)) return null;
  const a = allocs(row, { poBy: po ? { [po.id]: po } : {} });
  const nm = (x: { site_id: string; sub: string | null }) => `${x.site_id !== row.site_id ? `${jobTag(sites.find((s) => s.id === x.site_id))}${x.sub ? ' › ' : ''}` : ''}${x.sub ? (subs[x.site_id] || []).find((j) => j.id === x.sub)?.short || 'Plot' : x.site_id !== row.site_id ? '' : 'Whole project'}`;
  let txt = a.length === 1 ? (a[0].sub || a[0].site_id !== row.site_id ? nm(a[0]) : `${jobTag(home)} — whole job`) : `Split: ${a.map((x) => `${nm(x)} ${round2(x.share * 100)}%`).join(' · ')}`;
  if (table === 'purchase_invoices' && row.po_id && !row.sub_job_id && !split && a.some((x) => x.sub)) txt += ' (same as the PO)';
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: base.line }}>
      <Muted>Booked to</Muted>
      <Text style={{ flex: 1, fontWeight: '700', color: base.ink }}>{txt}</Text>
      <Pressable onPress={() => setOpen(true)}><Text style={{ color: base.blue, fontWeight: '700' }}>{a.length > 1 ? 'Change split' : subKind(home) ? 'Allocate / split' : 'Split'}</Text></Pressable>
      {open && <SplitBox table={table} row={row} po={po} onClose={() => setOpen(false)} onSaved={onSaved} />}
    </View>
  );
}

export function SplitBox({ table, row, po, onClose, onSaved }: { table: SplitTable; row: Row; po?: Row | null; onClose: () => void; onSaved?: () => void }) {
  const { data: sites = [] } = useSites();
  const toast = useToast();
  const qc = useQueryClient();
  const net = netOf(table, row);
  const [pct, setPct] = useState(true);
  const [rows, setRows] = useState<SplitLine[]>(() => splitStart(row, allocs(row, { poBy: po ? { [po.id]: po } : {} })));
  const [subs, setSubs] = useState<Record<string, SubJob[]>>({});
  const [busy, setBusy] = useState(false);
  const need = Array.from(new Set([row.site_id, ...rows.map((r) => r.site_id)])).filter((id) => !(id in subs)).join(',');
  useEffect(() => {
    if (!need) return;
    void Promise.all(need.split(',').map(async (id) => [id, await loadSubJobs(sites.find((s) => s.id === id))] as const)).then((x) => setSubs((o) => ({ ...o, ...Object.fromEntries(x) })));
  }, [need, sites]);
  const home = sites.find((s) => s.id === row.site_id), homeSubs = (subs[row.site_id] || []).filter((j) => !j.closed);
  const target = pct ? 100 : Number(net || 0);
  const foot = splitFoot(rows, pct, net, (v) => money(v));
  const set = (i: number, p: Partial<SplitLine>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const save = async () => {
    const r = splitPatch(rows, row.site_id, pct, net, (v) => money(v));
    if (r.error || !r.patch) { toast(r.error || 'Could not save the split.'); return; }
    // A bill already in Xero is tracked there by project.
    const siteSet = (sp: Row[] | null) => Array.from(new Set(sp?.length ? sp.map((e) => e.site_id) : [row.site_id])).sort().join(',');
    if (table === 'purchase_invoices' && row.xero_id && siteSet(row.split) !== siteSet(r.patch.split) && !(await confirmAsk('This bill is already in Xero. Saving moves cost between projects — change the project tracking on the bill in Xero too.', 'Save anyway'))) return;
    setBusy(true);
    const res = await fdb.from(table).update(r.patch as never).eq('id', row.id);
    setBusy(false);
    if (res.error) { toast('Could not save the split.'); return; }
    const p = r.patch;
    toast(p.split ? `Split across ${p.split.length}` : p.sub_job_id ? `Booked to ${homeSubs.find((j) => j.id === p.sub_job_id)?.short || 'the plot'}` : 'Booked to the whole project');
    ['finBook', 'finPinv', 'finPo', 'finPlant', 'finPurchases'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
    onSaved?.(); onClose();
  };
  const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 7, color: base.ink, backgroundColor: base.card };
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 16 }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: base.card, borderRadius: 14, padding: 16, maxHeight: '90%', width: '100%', maxWidth: 640, alignSelf: 'center' }}>
          <Text style={{ fontWeight: '800', fontSize: 16, color: base.ink, marginBottom: 6 }}>Allocate this {NOUN[table]}</Text>
          <ScrollView style={{ flexGrow: 0 }} keyboardShouldPersistTaps="handled">
            {!!row.xero_id && <Muted style={{ color: '#b45309', marginBottom: 6 }}>Already in Xero. Changing the split here won’t change Xero — change the project tracking on the bill in Xero too.</Muted>}
            <Muted style={{ marginBottom: 8 }}>{`${net != null ? `${money(net)} excl. VAT. ` : table === 'fin_plant_hires' && row.cost_from === 'invoices' ? 'The cost comes from the hire company’s invoices. ' : ''}Book it to one ${homeSubs.length ? subNoun(home).toLowerCase() : 'project'}, or split it across as many projects${homeSubs.length ? ` / ${subNoun(home, true).toLowerCase()}` : ''} as you need. It must add up to ${pct ? '100%' : money(net)}.`}</Muted>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
              <FinChip on={pct} label="By %" onPress={() => { if (!pct && net) { setRows(splitMode(rows, 'pct', net)); setPct(true); } }} />
              <FinChip on={!pct} label="By £" onPress={() => { if (pct && net) { setRows(splitMode(rows, 'gbp', net)); setPct(false); } else if (!net) toast('No value yet — split by %.'); }} />
            </View>
            {rows.map((r, i) => {
              const ss = subs[r.site_id] || [];
              return (
                <View key={i} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <Pressable onPress={async () => { const id = await pickJob('Book to', sites.filter((s) => s.status !== 'closed' || s.id === r.site_id)); if (id) set(i, { site_id: id, sub: '' }); }} style={[box, { flexGrow: 1, flexBasis: 160 }]}><Text numberOfLines={1} style={{ color: base.ink }}>{jobTag(sites.find((s) => s.id === r.site_id)) || 'Project'} ▾</Text></Pressable>
                  {ss.length ? <Pressable onPress={async () => { const k = await chooseAction(subNoun(sites.find((s) => s.id === r.site_id)), [{ key: '-', label: 'Whole project' }, ...ss.map((j) => ({ key: j.id, label: `${j.label}${j.closed ? ' (closed)' : ''}` }))]); if (k) set(i, { sub: k === '-' ? '' : k }); }} style={[box, { flexGrow: 1, flexBasis: 140 }]}><Text numberOfLines={1} style={{ color: base.ink }}>{r.sub ? ss.find((j) => j.id === r.sub)?.label || 'Plot' : 'Whole project'} ▾</Text></Pressable> : <Muted style={{ width: 20, textAlign: 'center' }}>—</Muted>}
                  <TextInput value={r.v == null ? '' : String(r.v)} onChangeText={(t) => { const n = num(t); set(i, { v: n === null || isNaN(n) ? null : n }); }} keyboardType="decimal-pad" style={[box, { width: 90 }]} /><Text>{pct ? '%' : '£'}</Text>
                  {rows.length > 1 && <Pressable hitSlop={8} onPress={() => setRows(rows.filter((_, j) => j !== i))}><Text style={{ color: base.slate }}>✕</Text></Pressable>}
                </View>
              );
            })}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 6 }}>
              <Button kind="ghost" title="+ Add a line" onPress={() => { const last = rows[rows.length - 1], left = round2(target - splitTotal(rows)); setRows([...rows, { site_id: last ? last.site_id : row.site_id, sub: '', v: left > 0 ? left : null }]); }} />
              <Button kind="ghost" title="Share evenly" onPress={() => setRows(splitEven(rows, target))} />
              {homeSubs.length > 0 && <Button kind="ghost" title={`Across all ${subNoun(home, true).toLowerCase()}`} onPress={() => setRows(splitAcross(row.site_id, homeSubs.map((j) => j.id), target))} />}
            </View>
            <Text style={{ fontWeight: '700', color: foot.ok ? '#1E7A3C' : '#C0392B', marginBottom: 6 }}>{foot.text}</Text>
          </ScrollView>
          <View style={{ gap: 8, marginTop: 6 }}>
            <Button busy={busy} title="Save" onPress={() => void save()} />
            <Button kind="ghost" title="Cancel" onPress={onClose} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
