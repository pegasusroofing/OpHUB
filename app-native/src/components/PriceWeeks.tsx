// Booked In, week by week, for one Pricing Element (390). Ordinary element:
// each week's build-up — the site's operatives, extra people (on the app or
// just a name) and one-off costs — adds up to the week's figure; a manager can
// type the figure straight in, or ↻ to add the build-up again. Element fed by a
// Price Sheet: the qty booked in per sheet line (or a £ override), and for the
// manager the week's labour wages, which can be shared out over the lines; Save
// checks wages and work match (or asks why not).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { chooseAction, promptText, useToast } from '@/components/toast';
import { Button, Card, Muted, SectionTitle } from '@/components/ui';
import { nameOf, usePeople } from '@/data/hs';
import { addEntry, allocateWages, loadElementWeeks, rollUpWeek, saveSheetWeek, setEntryAmount, setOperativeEntry, setWeekAmount, weekWages, type ItemWeek, type WeekEntry } from '@/data/priceSheets';
import { money, readAmount } from '@/lib/rules/price';
import { pbRound2, PRICE_UNIT_LABEL, type SheetItem } from '@/lib/rules/priceSheet';
import type { Profile, Site } from '@/lib/types';
import { base, radius } from '@/theme/theme';

const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, paddingHorizontal: 8, paddingVertical: 6, color: base.ink, backgroundColor: base.card, width: 96, textAlign: 'right' as const };
type Commit = (n: number | null) => void | Promise<unknown>;

/** A £ box that saves when you leave it (blank = clear). */
function Amount({ value, onCommit, placeholder = '0.00', width }: { value: number | null | undefined; onCommit: Commit; placeholder?: string; width?: number }) {
  const [v, setV] = useState(value == null ? '' : String(value));
  const toast = useToast();
  return <TextInput value={v} onChangeText={setV} keyboardType="decimal-pad" placeholder={placeholder} style={[box, width ? { width } : null]} onBlur={() => {
    if (v === (value == null ? '' : String(value))) return;
    const n = readAmount(v); if (n === 'bad' || (n != null && n < 0)) { toast('Enter a number'); return; }
    void onCommit(n);
  }} />;
}

export function PriceWeeks({ me, site, elementId, mgr }: { me: Profile; site: Site; elementId: string; mgr: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: people } = usePeople();
  const { data } = useQuery({ queryKey: ['priceWeeks', elementId], queryFn: () => loadElementWeeks(elementId, site.id) });
  const [open, setOpen] = useState<Record<number, boolean>>({});
  if (!data) return <Muted>Loading…</Muted>;
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['priceWeeks', elementId] }); void qc.invalidateQueries({ queryKey: ['priceTile', site.id] }); };
  // As the current app: the weeks with a figure, plus the next one.
  const max = Math.max(0, ...data.weeks.map((w) => w.week_number));
  const count = max + 1;
  const wkAmt = (wk: number) => data.weeks.find((w) => w.week_number === wk);
  const sheetMode = !!data.sheet;
  return (
    <>
      <SectionTitle>Booked In — week by week</SectionTitle>
      {sheetMode && <Muted style={{ marginBottom: 6 }}>💷 Fed by the Price Sheet “{data.sheet?.title}” — book in the qty done on each line.</Muted>}
      {Array.from({ length: count }, (_, i) => i + 1).map((wk) => {
        const isOpen = open[wk] ?? wk === count;
        const w = wkAmt(wk);
        const touched = () => { setOpen((o) => ({ ...o, [wk]: true })); refresh(); };
        return (
          <Card key={wk} style={{ paddingVertical: 8 }}>
            <Pressable onPress={() => setOpen({ ...open, [wk]: !isOpen })} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ color: base.slate, marginRight: 6 }}>{isOpen ? '▼' : '▶'}</Text>
              <Text style={{ flex: 1, fontWeight: '700', color: base.ink }}>Week {wk}{wk === count && !w ? ' (next)' : ''}</Text>
              <Text style={{ fontWeight: '800', color: base.ink }}>{money(w?.amount ?? 0)}</Text>
            </Pressable>
            {isOpen && (sheetMode
              ? <SheetWeek key={`${wk}-${JSON.stringify(data.itemWeeks.filter((x) => x.week_number === wk))}`} me={me} site={site} elementId={elementId} wk={wk} mgr={mgr} items={data.items} itemWeeks={data.itemWeeks} entries={data.entries.filter((e) => e.week_number === wk)} operatives={data.operatives} people={people ?? []} reason={w?.wage_mismatch_override_reason ?? null} refresh={touched} />
              : (
                <View style={{ marginTop: 8 }}>
                  {mgr && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <Muted style={{ flex: 1 }}>Week figure (adds up the build-up below, or type it)</Muted>
                      <Amount key={`${wk}-${w?.amount}`} value={w?.amount ?? null} onCommit={async (n) => { toast((await setWeekAmount(elementId, site.id, wk, n)) ? 'Saved' : 'Could not save — try again.'); touched(); }} />
                      <Pressable onPress={async () => { await rollUpWeek(elementId, site.id, wk); toast('Recalculated from build-up'); touched(); }} hitSlop={6}><Text style={{ fontSize: 18, color: base.blue }}>↻</Text></Pressable>
                    </View>
                  )}
                  <BuildUp me={me} site={site} elementId={elementId} wk={wk} entries={data.entries.filter((e) => e.week_number === wk)} operatives={data.operatives} people={people ?? []} rollUp refresh={touched} />
                </View>
              ))}
          </Card>
        );
      })}
    </>
  );
}

/** Operatives / extra people / one-off costs for a week. rollUp: each change updates the week's figure (not for a sheet's wages). */
function BuildUp({ me, site, elementId, wk, entries, operatives, people, rollUp, refresh, wagesMode }: { me: Profile; site: Site; elementId: string; wk: number; entries: WeekEntry[]; operatives: { id: string; name: string }[]; people: { id: string; name: string; role: string }[]; rollUp: boolean; refresh: () => void; wagesMode?: boolean }) {
  const toast = useToast();
  const quickKind = wagesMode ? 'extra_operative' : 'assigned';
  const opIds = new Set(operatives.map((o) => o.id));
  const quick = (opId: string) => entries.find((e) => e.operative_id === opId && e.kind === quickKind);
  const others = entries.filter((e) => !(e.operative_id && opIds.has(e.operative_id) && e.kind === quickKind));
  const total = pbRound2(entries.reduce((t, e) => t + Number(e.amount || 0), 0));
  const done = (ok: boolean) => { if (!ok) toast('Could not save — try again.'); refresh(); };
  const add = async () => {
    const k = await chooseAction('Add to this week', [{ key: 'op', label: 'An operative on the app' }, { key: 'name', label: 'A name (not on the app)' }, ...(wagesMode ? [] : [{ key: 'cost', label: 'A one-off cost' }])]);
    if (!k) return;
    let opId: string | null = null, label: string | null = null;
    if (k === 'op') { const ops = people.filter((p) => p.role === 'operative').sort((a, b) => a.name.localeCompare(b.name)); opId = await chooseAction('Operative', ops.map((p) => ({ key: p.id, label: p.name }))); if (!opId) return; }
    else { label = (await promptText(k === 'cost' ? 'Description (e.g. Plant hire)' : 'Name (e.g. J. Smith, subcontractor)', ''))?.trim() || null; if (!label) return; }
    const v = await promptText('Value (£)', ''); if (v === null) return;
    const n = readAmount(v); if (n === 'bad' || (n != null && n < 0)) { toast('Enter a number'); return; }
    // A typed name on a sheet's wages goes in as a cost line, as the current app does.
    done(await addEntry(me, elementId, site.id, wk, { kind: k === 'cost' || (wagesMode && k === 'name') ? 'cost' : 'extra_operative', operative_id: opId, label, amount: n ?? 0 }, rollUp));
  };
  const row = (key: string, label: string, value: number | null, commit: Commit, tint?: string) => (
    <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4, paddingHorizontal: 4, backgroundColor: tint }}>
      <Text style={{ flex: 1, color: base.ink, fontWeight: '600' }}>{label}</Text>
      <Amount key={`${key}-${value}`} value={value} onCommit={commit} />
      <Pressable hitSlop={6} disabled={value == null} onPress={() => void commit(null)}><Text style={{ color: value == null ? 'transparent' : base.red, fontSize: 16 }}>✕</Text></Pressable>
    </View>
  );
  return (
    <View style={{ borderWidth: 1, borderColor: base.line, borderRadius: 10, padding: 6 }}>
      {operatives.length > 0 && <Muted style={{ fontSize: 11, fontWeight: '800' }}>{wagesMode ? 'LABOUR WAGES' : 'OPERATIVES'}</Muted>}
      {operatives.map((o) => { const e = quick(o.id); return row(o.id, o.name, e?.amount ?? null, async (n) => done(await setOperativeEntry(me, elementId, site.id, wk, o.id, quickKind, n, rollUp))); })}
      {others.length > 0 && <Muted style={{ fontSize: 11, fontWeight: '800', marginTop: 4 }}>ADDED</Muted>}
      {others.map((e) => row(e.id, e.operative_id ? nameOf(people, e.operative_id) : e.label || 'Unnamed', e.amount, async (n) => done(await setEntryAmount(me, elementId, site.id, wk, e.id, n, rollUp)), e.kind === 'cost' ? '#FFF6E5' : '#F2F6FC'))}
      {!entries.length && !operatives.length && <Muted style={{ padding: 6 }}>No rows yet — add an operative, a named extra, or a one-off cost.</Muted>}
      <View style={{ flexDirection: 'row', borderTopWidth: 2, borderTopColor: base.ink, marginTop: 4, paddingTop: 6, paddingHorizontal: 4 }}>
        <Text style={{ flex: 1, fontWeight: '800', color: base.ink }}>{wagesMode ? 'Wages total' : 'Week total'}</Text>
        <Text style={{ fontWeight: '800', color: base.ink, marginRight: 24 }}>{money(total)}</Text>
      </View>
      <Pressable onPress={() => void add()} style={{ paddingVertical: 6 }}><Text style={{ color: base.blue, fontWeight: '700' }}>+ Add</Text></Pressable>
    </View>
  );
}

function SheetWeek({ me, site, elementId, wk, mgr, items, itemWeeks, entries, operatives, people, reason, refresh }: { me: Profile; site: Site; elementId: string; wk: number; mgr: boolean; items: SheetItem[]; itemWeeks: ItemWeek[]; entries: WeekEntry[]; operatives: { id: string; name: string }[]; people: { id: string; name: string; role: string }[]; reason: string | null; refresh: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const cur = (id: string) => itemWeeks.find((w) => w.sheet_item_id === id && w.week_number === wk);
  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries(items.map((it) => { const r = cur(it.id); return [it.id, r && !r.is_manual && r.qty != null ? String(r.qty) : '']; })));
  const [ovr, setOvr] = useState<Record<string, string>>(() => Object.fromEntries(items.map((it) => { const r = cur(it.id); return [it.id, r?.is_manual ? String(r.amount ?? '') : '']; })));
  const lineAmt = (it: SheetItem) => (ovr[it.id]?.trim() ? Number(ovr[it.id]) || 0 : pbRound2((Number(qty[it.id]) || 0) * Number(it.rate || 0)));
  const save = async () => {
    const pending: { id: string; qty: number | null; amount: number; manual: boolean }[] = [];
    for (const it of items) {
      const o = (ovr[it.id] || '').trim(), q = (qty[it.id] || '').trim();
      if (o) { const n = Number(o); if (Number.isNaN(n)) { toast(`Enter a valid override amount for ${it.name}`); return; } pending.push({ id: it.id, qty: null, amount: n, manual: true }); }
      else { const n = q ? pbRound2(parseFloat(q)) : null; if (q && Number.isNaN(n)) { toast(`Enter a valid qty for ${it.name}`); return; } pending.push({ id: it.id, qty: n, amount: pbRound2((n || 0) * Number(it.rate || 0)), manual: false }); }
    }
    const work = pbRound2(pending.reduce((t, p) => t + p.amount, 0)), wages = await weekWages(elementId, wk);
    let why: string | null = null;
    if (Math.abs(work - wages) > 0.01) {
      why = await promptText(`Labour wages (£${wages.toFixed(2)}) don't match the value of work entered (£${work.toFixed(2)}). Enter a reason to save anyway, or Cancel to adjust the figures:`, '');
      if (why === null) return;
      if (!why.trim()) { toast('Enter a reason to override, or adjust the figures so they match.'); return; }
    }
    setBusy(true); const ok = await saveSheetWeek(me, elementId, site.id, items, wk, pending, why?.trim() || null); setBusy(false);
    toast(ok ? (why ? 'Saved with override noted' : 'Saved') : 'Could not save — try again.'); refresh();
  };
  return (
    <View style={{ marginTop: 8 }}>
      <Muted style={{ fontSize: 11, fontWeight: '800' }}>PRICED ITEMS — QTY BOOKED IN THIS WEEK</Muted>
      {items.map((it) => (
        <View key={it.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: base.line }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '600', color: base.ink }}>{it.name}{it.option_label ? ` — ${it.option_label}` : ''}</Text>
            <Muted style={{ fontSize: 11 }}>{it.quantity} {PRICE_UNIT_LABEL[it.unit] || it.unit} on order @ {money(it.rate)}</Muted>
          </View>
          {mgr ? <>
            <TextInput value={qty[it.id]} onChangeText={(v) => setQty({ ...qty, [it.id]: v })} keyboardType="decimal-pad" placeholder="Qty" style={[box, { width: 60 }]} />
            <TextInput value={ovr[it.id]} onChangeText={(v) => setOvr({ ...ovr, [it.id]: v })} keyboardType="decimal-pad" placeholder="£ override" style={[box, { width: 84 }]} />
          </> : <Text style={{ color: base.ink, width: 50, textAlign: 'right' }}>{cur(it.id)?.qty ?? '—'}</Text>}
          <Text style={{ fontWeight: '800', color: ovr[it.id]?.trim() ? base.warn : base.ink, width: 80, textAlign: 'right' }}>{money(lineAmt(it))}</Text>
        </View>
      ))}
      {!items.length && <Muted>This sheet has no priced items.</Muted>}
      {mgr && items.length > 0 && (
        <>
          <Muted style={{ marginVertical: 6, fontStyle: 'italic' }}>Nothing is saved until you press Save — labour wages this week must match the value of work entered here.</Muted>
          <BuildUp me={me} site={site} elementId={elementId} wk={wk} entries={entries} operatives={operatives} people={people} rollUp={false} refresh={refresh} wagesMode />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <View style={{ flex: 1 }}><Button kind="ghost" title="Share wages over the items" onPress={async () => { setBusy(true); toast(await allocateWages(me, elementId, site.id, items, wk)); setBusy(false); refresh(); }} /></View>
            <View style={{ flex: 1 }}><Button busy={busy} title="💾 Save" onPress={() => void save()} /></View>
          </View>
        </>
      )}
      {reason ? <Text style={{ color: base.warn, fontSize: 12, marginTop: 6, fontWeight: '600' }}>⚠ Saved despite wages not matching work booked in — {reason}</Text> : null}
    </View>
  );
}
