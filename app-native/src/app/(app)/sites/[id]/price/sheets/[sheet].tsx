// One Price Sheet (400). Issued: the lines by category, total, and live
// Total / Taken / Balance from the price tile it feeds, with Excel / PDF /
// email, and (PMs and admins) Edit, Un-issue and Delete. Draft, or ?edit=1:
// the builder — tick items from the rate card (several options of a drop-down
// item each become their own line), then enter quantities, change a line's
// wording, unit or rate (a rate off the card is flagged as manual), add your
// own lines, then Save Draft / Issue / Save Changes. Lines with bookings
// against them can't be removed.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { AssignChips } from '@/components/AssignChips';
import { chooseAction, confirmAsk, promptText, useToast } from '@/components/toast';
import { Button, Card, Check, Muted, SectionTitle } from '@/components/ui';
import { deleteSheet, issueSheet, loadRateCard, loadSheet, renameSheet, saveDraft, saveIssuedEdits, sheetDeleteBlock, sheetFigures, siteOperatives, unissueSheet, type Sheet } from '@/data/priceSheets';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { emailPdf } from '@/lib/pdf';
import { money } from '@/lib/rules/price';
import { canIssue, entryKey, lineTotal, pbRound2, PRICE_UNIT_LABEL, resolvedRate, workingFromRows, type PbWorking, type SheetItem } from '@/lib/rules/priceSheet';
import { rateCategories, RATE_UNITS, type RateItem, type RateOption } from '@/lib/rules/rateCard';
import { isFullManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import { exportTableExcel, exportTablePdf, type Table } from '@/lib/tableExport';
import type { Organization, Profile, Site } from '@/lib/types';
import { base, page, radius, space } from '@/theme/theme';

const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, paddingHorizontal: 8, paddingVertical: 6, color: base.ink, backgroundColor: base.card };

export default function PriceSheetPage() {
  const { id, sheet: sheetId, edit } = useLocalSearchParams<{ id: string; sheet: string; edit?: string }>();
  const { me, org } = useAuth();
  const { data: site } = useSite(id);
  const { data, isLoading } = useQuery({ queryKey: ['priceSheet', sheetId], gcTime: 0, queryFn: () => loadSheet(sheetId) });
  const card = useQuery({ queryKey: ['rateCard', me?.org_id], enabled: !!me && isFullManager(me), queryFn: () => loadRateCard(me?.org_id as string) });
  if (!me || !site || isLoading) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  if (!data) return <Muted style={{ padding: space.l }}>Sheet not found.</Muted>;
  const can = isFullManager(me);
  if (data.sheet.status === 'issued' && edit !== '1') return <View_ me={me} org={org} site={site} sheet={data.sheet} items={data.items} can={can} />;
  if (!can) return <Muted style={{ padding: space.l }}>Only PMs and admins can edit Price Sheets.</Muted>;
  if (!card.data) return <Muted style={{ padding: space.l }}>Loading the rate card…</Muted>;
  return <Builder key={sheetId} me={me} site={site} sheet={data.sheet} items={data.items} alloc={data.alloc} rateItems={card.data.items} options={card.data.options} />;
}

/* ---------- issued view ---------- */
function sheetTable(sheet: Sheet, items: SheetItem[], site: Site, f?: { total: number; taken: number; balance: number }): Table {
  const rows: Table['rows'] = items.map((it) => [it.category, it.option_label ? `${it.name} - ${it.option_label}` : it.name, it.quantity, PRICE_UNIT_LABEL[it.unit] || it.unit, Number(it.rate || 0), Number(it.line_total || 0), it.is_manual_rate ? 'Manual rate' : '']);
  if (f) rows.push(['', 'Taken (booked in)', null, '', null, f.taken, ''], ['', 'Balance', null, '', null, f.balance, '']);
  return { title: sheet.title || 'Price Sheet', site: site.name, sub: [site.name, sheet.subcontractor_name ? `For: ${sheet.subcontractor_name}` : ''].filter(Boolean).join(' · '), cols: [{ l: 'Element', w: 90 }, { l: 'Item', w: 220 }, { l: 'Qty', num: true, w: 45 }, { l: 'Unit', w: 40 }, { l: 'Rate', money: true, w: 70 }, { l: 'Total', money: true, w: 80 }, { l: '', w: 60 }], rows, totals: ['Total', '', null, '', null, pbRound2(Number(sheet.total || 0)), ''] };
}
function View_({ me, org, site, sheet, items, can }: { me: Profile; org: Organization | null; site: Site; sheet: Sheet; items: SheetItem[]; can: boolean }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [title, setTitle] = useState(sheet.title);
  const { data: fig } = useQuery({ queryKey: ['sheetFig', sheet.id], queryFn: () => sheetFigures(sheet) });
  const { cats } = rateCategories(items.map((i) => ({ id: i.id, category: i.category, name: i.name, unit: i.unit, is_dropdown: false, rate: i.rate })), []);
  const byId: Record<string, SheetItem> = Object.fromEntries(items.map((i) => [i.id, i]));
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['priceSheets', site.id] }); void qc.invalidateQueries({ queryKey: ['priceSheet', sheet.id] }); void qc.invalidateQueries({ queryKey: ['priceTile', site.id] }); };
  const menu = async () => {
    const k = await chooseAction(sheet.title, [{ key: 'xl', label: '⬇ Export to Excel' }, { key: 'email', label: '✉️ Email PDF' }, ...(can ? [{ key: 'edit', label: '✏️ Edit' }, { key: 'un', label: '↩️ Un-issue' }, { key: 'del', label: '🗑 Delete' }] : [])]);
    if (k === 'xl') { if (!(await exportTableExcel(sheetTable(sheet, items, site, fig), org).catch(() => false))) toast('Could not make the file — try again.'); }
    else if (k === 'email') {
      const to = (await promptText('Email this price sheet PDF to:', ''))?.trim(); if (!to) return;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) { toast('Enter a valid email address.'); return; }
      toast('Building the PDF…');
      let bytes: Uint8Array | null = null;
      await exportTablePdf(sheetTable(sheet, items, site, fig), org, async (b) => { bytes = b; return true; }).catch(() => false);
      const e = bytes ? await emailPdf(bytes, `${(sheet.title || 'Price Sheet').replace(/[^a-z0-9 -]+/gi, '')}.pdf`, `${site.id}/price-sheets`, { site_id: site.id, recipient_email: to, doc_title: `Price Sheet — ${sheet.title}` }) : 'Could not build the PDF.';
      toast(e || `Emailed to ${to}`);
    } else if (k === 'edit') router.setParams({ edit: '1' });
    else if (k === 'un') { if (!(await confirmAsk('Un-issue this sheet? It goes back to draft and stops being visible to whoever it was issued to, until it\'s issued again.', 'Un-issue'))) return; toast((await unissueSheet(sheet.id)) ? 'Sheet un-issued — back to draft' : 'Could not save — try again.'); refresh(); }
    else if (k === 'del') await del(sheet, site.id, toast, refresh);
  };
  return (
    <ScrollView contentContainerStyle={page(820)}>
      <Stack.Screen options={{ title: 'Price Sheet', headerRight: () => <Pressable onPress={() => void menu()} hitSlop={10} style={{ paddingHorizontal: 12 }}><Text style={{ fontSize: 18, color: base.ink }}>⋮</Text></Pressable> }} />
      <Card>
        {can ? <TextInput value={title} onChangeText={setTitle} onBlur={async () => { if (title.trim() && title !== sheet.title) toast((await renameSheet(sheet.id, title.trim())) ? 'Sheet renamed' : 'Could not save — try again.'); }} style={{ fontSize: 17, fontWeight: '800', color: base.ink, padding: 0 }} /> : <Text style={{ fontSize: 17, fontWeight: '800', color: base.ink }}>{sheet.title}</Text>}
        {sheet.subcontractor_name ? <Muted>For: {sheet.subcontractor_name}</Muted> : null}
        {sheet.issued_at ? <Muted>Issued {new Date(sheet.issued_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</Muted> : null}
      </Card>
      {cats.map((c) => (
        <View key={c.name}>
          <SectionTitle>{c.name}</SectionTitle>
          {c.items.map((x) => { const it = byId[x.id]; return (
            <Card key={it.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '600', color: base.ink }}>{it.option_label ? `${it.name} - ${it.option_label}` : it.name}</Text>
                <Muted>{it.quantity} {PRICE_UNIT_LABEL[it.unit] || it.unit} @ {money(it.rate)}{it.is_manual_rate ? ' · ⚠ Manual rate' : ''}</Muted>
              </View>
              <Text style={{ fontWeight: '800', color: base.ink }}>{money(it.line_total)}</Text>
            </Card>
          ); })}
        </View>
      ))}
      {!items.length && <Muted>No items on this sheet.</Muted>}
      <Card>
        <View style={{ flexDirection: 'row' }}><Text style={{ flex: 1, fontWeight: '800', color: base.ink, fontSize: 16 }}>Total</Text><Text style={{ fontWeight: '800', fontSize: 18, color: base.ink }}>{money(sheet.total)}</Text></View>
        {fig && sheet.pricing_element_id && <><Muted>Taken (booked in): {money(fig.taken)}</Muted><Text style={{ color: fig.balance < 0 ? base.warn : base.ok, fontWeight: '700' }}>Balance: {money(fig.balance)}</Text></>}
      </Card>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}><Button title="📄 PDF" onPress={async () => { if (!(await exportTablePdf(sheetTable(sheet, items, site, fig), org).catch(() => false))) toast('Could not make the PDF — try again.'); }} /></View>
        <View style={{ flex: 1 }}><Button kind="ghost" title="📊 Excel" onPress={async () => { if (!(await exportTableExcel(sheetTable(sheet, items, site, fig), org).catch(() => false))) toast('Could not make the file — try again.'); }} /></View>
      </View>
      {sheet.pricing_element_id && <Button kind="ghost" title="Open its price tile" onPress={() => router.push(`/sites/${site.id}/price/${sheet.pricing_element_id}` as never)} />}
    </ScrollView>
  );
}
async function del(sheet: Sheet, siteId: string, toast: (m: string) => void, refresh: () => void) {
  const why = await sheetDeleteBlock(sheet); if (why) { toast(why); return; }
  if (!(await confirmAsk(sheet.status === 'issued' ? 'Delete this issued sheet? This removes its price tile and its Schedule of Works section (with all its tasks) too. This can\'t be undone.' : 'Delete this draft sheet? This can\'t be undone.', 'Delete'))) return;
  if (await deleteSheet(sheet)) { toast('Sheet deleted'); refresh(); router.replace(`/sites/${siteId}/price/sheets` as never); } else toast('Could not delete — try again.');
}

/* ---------- builder ---------- */
function Builder({ me, site, sheet, items, alloc, rateItems, options }: { me: Profile; site: Site; sheet: Sheet; items: SheetItem[]; alloc: Record<string, number>; rateItems: RateItem[]; options: RateOption[] }) {
  const toast = useToast();
  const qc = useQueryClient();
  const byId: Record<string, RateItem> = Object.fromEntries(rateItems.map((i) => [i.id, i]));
  const { cats, opts } = rateCategories(rateItems, options);
  const optRate = (itemId: string, optId: string) => { const o = (opts[itemId] || []).find((x) => x.id === optId); return o ? Number(o.rate) : null; };
  const [w, setW] = useState<PbWorking>(() => workingFromRows(items, byId, optRate, sheet));
  const [phase, setPhase] = useState<'tick' | 'confirm'>(items.length ? 'confirm' : 'tick');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState('');
  const [rateDraft, setRateDraft] = useState<Record<string, string>>({});
  const { data: ops = [] } = useQuery({ queryKey: ['siteOps', site.id], queryFn: () => siteOperatives(site.id) });
  const up = (fn: (x: PbWorking) => void) => setW((cur) => { const n: PbWorking = JSON.parse(JSON.stringify(cur)); fn(n); return n; });
  const allocated = (rowId?: string | null) => !!rowId && (alloc[rowId] || 0) > 0;
  const names = () => ops.filter((o) => w.assignedUserIds.includes(o.id)).map((o) => o.name).join(', ');
  const issued = sheet.status === 'issued';
  const refresh = () => { ['priceSheets', 'priceTile'].forEach((k) => void qc.invalidateQueries({ queryKey: [k, site.id] })); void qc.invalidateQueries({ queryKey: ['priceSheet', sheet.id] }); void qc.invalidateQueries({ queryKey: ['sheetFig', sheet.id] }); };
  const total = pbRound2(Object.values(w.items).reduce((t, e) => { const it = byId[e.rateItemId]; return t + (it && !(it.is_dropdown && !e.optionId) ? lineTotal(e, it) : 0); }, 0) + w.customRows.reduce((t, c) => t + pbRound2((Number(c.quantity) || 0) * (Number(c.rate) || 0)), 0));

  const draft = async () => { setBusy('d'); toast(await saveDraft(me, sheet.id, w, rateItems, names())); setBusy(''); refresh(); };
  const issue = async () => {
    if (!Object.keys(w.items).length && !w.customRows.length) { toast('Tick at least one item, or add a custom row, before issuing.'); return; }
    if (!canIssue(w)) { toast('Enter a quantity for at least one ticked item (or add a custom row) before issuing.'); return; }
    let tile: string | null = null, subId: string | null = null;
    if (!sheet.pricing_element_id) {
      tile = await promptText('Name this sub tile in the Price tile', w.title); if (tile === null) return; tile = tile.trim() || w.title;
      if (site.multi_site) {
        const addrs = ((await supabase.from('site_sub_addresses').select('id,name').eq('site_id', site.id).order('name')).data ?? []) as { id: string; name: string }[];
        if (!addrs.length) { toast('This job has more than one address but none are set up yet. Add the addresses in Site Settings › Multi-Site first.'); return; }
        subId = addrs.length === 1 ? addrs[0].id : await chooseAction('Which address is this sheet for?', addrs.map((a) => ({ key: a.id, label: a.name || 'Address' })));
        if (!subId) return;
      }
    }
    if (!(await confirmAsk('Issue this sheet? It becomes read-only and visible to everyone assigned to this site. You can un-issue it later if you need to change it.', 'Issue'))) return;
    setBusy('i'); const err = await issueSheet(me, site, sheet, w, rateItems, names(), tile, subId); setBusy('');
    if (err) { toast(err); return; }
    toast('Sheet issued'); refresh(); router.setParams({ edit: '' });
  };
  const saveEdits = async () => {
    if (!canIssue(w)) { toast('Enter a quantity for at least one ticked item (or add a custom row).'); return; }
    if (!(await confirmAsk('Save changes to this issued sheet? Anything already booked in against a line stays untouched.', 'Save changes'))) return;
    setBusy('e'); toast(await saveIssuedEdits(me, site, sheet, w, rateItems, names())); setBusy(''); refresh(); router.setParams({ edit: '' });
  };
  const changeRate = async (key: string, v: string) => {
    const e = w.items[key], it = byId[e.rateItemId]; const val = parseFloat(v);
    if (v === '' || Number.isNaN(val)) { toast('Enter a valid rate.'); return; }
    const baseRate = it.is_dropdown ? Number(e.optionRate || 0) : Number(it.rate || 0);
    if (Math.abs(val - baseRate) < 0.005) { up((x) => { x.items[key].isManualRate = false; x.items[key].rateOverride = null; }); return; }
    if (!(await confirmAsk(`This changes the rate from ${money(baseRate)} to ${money(val)} — different from the rate card. It'll be flagged as a manual, non-conforming rate.`, 'Use this rate'))) return;
    up((x) => { x.items[key].rateOverride = val; x.items[key].isManualRate = true; });
  };

  return (
    <ScrollView contentContainerStyle={page(820)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: issued ? 'Edit Price Sheet' : 'Price Sheet (draft)' }} />
      <Card>
        <TextInput value={w.title} onChangeText={(v) => up((x) => { x.title = v; })} placeholder="Title" style={[box, { fontWeight: '800', fontSize: 16, marginBottom: 8 }]} />
        <Muted style={{ fontWeight: '700', marginBottom: 4 }}>Assign to</Muted>
        <AssignChips ops={ops} sel={w.assignedUserIds} onToggle={(u) => up((x) => { x.assignedUserIds = x.assignedUserIds.includes(u) ? x.assignedUserIds.filter((y) => y !== u) : [...x.assignedUserIds, u]; })} />
        {!sheet.schedule_section_id && <Check label="Add these lines to the Schedule of Works when issued" value={w.populateSOW} onChange={(v) => up((x) => { x.populateSOW = v; })} />}
      </Card>
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
        {(['tick', 'confirm'] as const).map((p) => <Pressable key={p} onPress={() => setPhase(p)} style={{ flex: 1, paddingVertical: 8, borderRadius: 16, borderWidth: 1, alignItems: 'center', borderColor: phase === p ? base.ink : base.line, backgroundColor: phase === p ? base.ink : base.card }}><Text style={{ fontWeight: '700', color: phase === p ? '#fff' : base.ink }}>{p === 'tick' ? '1. Tick items' : `2. Quantities (${Object.keys(w.items).length + w.customRows.length})`}</Text></Pressable>)}
      </View>

      {phase === 'tick' ? (
        <>
          {cats.map((c, ci) => { const isOpen = open[c.name] ?? ci === 0; const n = c.items.filter((it) => Object.values(w.items).some((e) => e.rateItemId === it.id)).length; return (
            <Card key={c.name}>
              <Pressable onPress={() => setOpen({ ...open, [c.name]: !isOpen })}><Text style={{ fontWeight: '800', color: base.ink }}>{isOpen ? '▼' : '▶'} {c.name}{n ? ` (${n} ticked)` : ''}</Text></Pressable>
              {isOpen && c.items.map((it) => it.is_dropdown ? (
                <View key={it.id} style={{ marginTop: 6 }}>
                  <Text style={{ fontWeight: '600', color: base.ink }}>{it.name}</Text>
                  {(opts[it.id] || []).map((o) => { const k = entryKey(it.id, o.id); return <Check key={o.id} label={`${o.label} — ${money(o.rate)} / ${PRICE_UNIT_LABEL[it.unit] || it.unit}`} value={!!w.items[k]} onChange={(v) => { if (!v && allocated(w.items[k]?.id)) { toast("Can't remove — this item already has bookings against it."); return; } up((x) => { if (v) x.items[k] = { rateItemId: it.id, quantity: '', optionId: o.id, optionRate: Number(o.rate), optionLabel: o.label, nameOverride: null, rateOverride: null, isManualRate: false }; else delete x.items[k]; }); }} />; })}
                </View>
              ) : <Check key={it.id} label={`${it.name} — ${money(it.rate)} / ${PRICE_UNIT_LABEL[it.unit] || it.unit}`} value={!!w.items[it.id]} onChange={(v) => { if (!v && allocated(w.items[it.id]?.id)) { toast("Can't remove — this item already has bookings against it."); return; } up((x) => { if (v) x.items[it.id] = x.items[it.id] || { rateItemId: it.id, quantity: '', optionId: null, optionRate: null, optionLabel: null, nameOverride: null, rateOverride: null, isManualRate: false }; else delete x.items[it.id]; }); }} />)}
            </Card>
          ); })}
          {!cats.length && <Muted>The rate card is empty — add items in Admin Centre › Price Sheet Rate Card.</Muted>}
          <Button title="Next — enter quantities" onPress={() => setPhase('confirm')} />
        </>
      ) : (
        <>
          {Object.keys(w.items).length === 0 && !w.customRows.length && <Muted>Nothing ticked yet.</Muted>}
          {Object.entries(w.items).map(([key, e]) => { const it = byId[e.rateItemId]; if (!it) return null; return (
            <Card key={key}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <TextInput value={e.nameOverride ?? it.name} onChangeText={(v) => up((x) => { x.items[key].nameOverride = v.trim() && v !== it.name ? v : null; })} style={[box, { flex: 1, fontWeight: '700' }]} />
                <Pressable hitSlop={6} onPress={() => { if (allocated(e.id)) { toast("Can't remove — this item already has bookings against it."); return; } up((x) => { delete x.items[key]; }); }}><Text style={{ color: base.red, fontSize: 16 }}>✕</Text></Pressable>
              </View>
              <Muted style={{ fontSize: 11 }}>{it.category}</Muted>
              {it.is_dropdown && <Pressable onPress={async () => {
                const k = await chooseAction(it.name, (opts[it.id] || []).map((o) => ({ key: o.id, label: `${o.label} — ${money(o.rate)}` }))); if (!k || k === e.optionId) return;
                const o = (opts[it.id] || []).find((x) => x.id === k); if (!o) return; const nk = entryKey(it.id, o.id);
                if (w.items[nk]) { toast(`"${o.label}" is already on this sheet — change the quantity on that line instead.`); return; }
                up((x) => { const cur = x.items[key]; delete x.items[key]; x.items[nk] = { ...cur, optionId: o.id, optionRate: Number(o.rate), optionLabel: o.label, rateOverride: null, isManualRate: false }; });
              }}><Text style={{ color: base.blue, marginVertical: 4 }}>Option: {e.optionLabel || 'choose…'} ▾</Text></Pressable>}
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
                <TextInput value={e.quantity === '' ? '' : String(e.quantity)} onChangeText={(v) => up((x) => { x.items[key].quantity = v as unknown as number; })} onBlur={() => up((x) => { const q = String(x.items[key]?.quantity ?? '').trim(); if (x.items[key]) x.items[key].quantity = q === '' || Number.isNaN(parseFloat(q)) ? '' : pbRound2(parseFloat(q)); })} keyboardType="decimal-pad" placeholder="Qty" style={[box, { width: 70 }]} />
                <Pressable onPress={async () => { const u = await chooseAction('Unit', RATE_UNITS.map(([k, l]) => ({ key: k, label: l }))); if (u) up((x) => { x.items[key].unit = u === it.unit ? null : u; }); }} style={[box, { width: 64 }]}><Text style={{ color: base.ink }}>{PRICE_UNIT_LABEL[e.unit || it.unit] || e.unit || it.unit} ▾</Text></Pressable>
                <Text style={{ color: base.slate }}>@</Text>
                <TextInput value={rateDraft[key] ?? String(resolvedRate(e, it))} onChangeText={(v) => setRateDraft({ ...rateDraft, [key]: v })} onBlur={() => { const v = rateDraft[key]; if (v == null) return; setRateDraft((d) => { const n = { ...d }; delete n[key]; return n; }); void changeRate(key, v); }} keyboardType="decimal-pad" style={[box, { width: 80 }, e.isManualRate ? { borderColor: base.warn } : null]} />
                <Text style={{ flex: 1, textAlign: 'right', fontWeight: '800', color: base.ink }}>{money(it.is_dropdown && !e.optionId ? 0 : lineTotal(e, it))}</Text>
              </View>
              {e.isManualRate && <Text style={{ color: base.warn, fontSize: 12, fontWeight: '700' }}>⚠ Manual rate (off the rate card)</Text>}
            </Card>
          ); })}
          <SectionTitle>Additional Items</SectionTitle>
          {w.customRows.map((c, i) => (
            <Card key={c.localId}>
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                <TextInput value={c.name} onChangeText={(v) => up((x) => { x.customRows[i].name = v; })} placeholder="Description" style={[box, { flex: 1 }]} />
                <Pressable hitSlop={6} onPress={() => { if (allocated(c.id)) { toast("Can't remove — this item already has bookings against it."); return; } up((x) => { x.customRows.splice(i, 1); }); }}><Text style={{ color: base.red, fontSize: 16 }}>✕</Text></Pressable>
              </View>
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 6 }}>
                <TextInput value={c.quantity === '' ? '' : String(c.quantity)} onChangeText={(v) => up((x) => { x.customRows[i].quantity = v === '' ? '' : (v as unknown as number); })} onEndEditing={() => up((x) => { const q = x.customRows[i].quantity; x.customRows[i].quantity = q === '' ? '' : pbRound2(parseFloat(String(q))); })} keyboardType="decimal-pad" placeholder="Qty" style={[box, { width: 70 }]} />
                <TextInput value={c.unit} onChangeText={(v) => up((x) => { x.customRows[i].unit = v || 'item'; })} placeholder="Unit" style={[box, { width: 64 }]} />
                <Text style={{ color: base.slate }}>@ £</Text>
                <TextInput value={c.rate === '' ? '' : String(c.rate)} onChangeText={(v) => up((x) => { x.customRows[i].rate = v === '' ? '' : (v as unknown as number); })} keyboardType="decimal-pad" placeholder="Rate" style={[box, { width: 80 }]} />
                <Text style={{ flex: 1, textAlign: 'right', fontWeight: '800', color: base.ink }}>{money(pbRound2((Number(c.quantity) || 0) * (Number(c.rate) || 0)))}</Text>
              </View>
            </Card>
          ))}
          <Button kind="ghost" title="+ Add your own line" onPress={() => up((x) => { x.customRows.push({ localId: `c${Date.now()}`, id: null, name: '', rate: '', quantity: '', unit: 'item' }); })} />
          <Card><View style={{ flexDirection: 'row' }}><Text style={{ flex: 1, fontWeight: '800', color: base.ink, fontSize: 16 }}>Total</Text><Text style={{ fontWeight: '800', fontSize: 18, color: base.ink }}>{money(total)}</Text></View></Card>
        </>
      )}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        {issued ? <View style={{ flex: 1 }}><Button busy={busy === 'e'} title="Save changes" onPress={() => void saveEdits()} /></View> : <>
          <View style={{ flex: 1 }}><Button kind="ghost" busy={busy === 'd'} title="Save Draft" onPress={() => void draft()} /></View>
          <View style={{ flex: 1 }}><Button busy={busy === 'i'} title="Issue" onPress={() => void issue()} /></View>
        </>}
      </View>
      {issued ? <Button kind="ghost" title="Cancel" onPress={() => router.setParams({ edit: '' })} /> : <Button kind="ghost" title="🗑 Delete draft" onPress={() => void del(sheet, site.id, toast, refresh)} />}
      <Muted style={{ marginTop: 6, marginBottom: space.xl }}>A draft keeps every tick. Issuing only keeps lines with a quantity (and an option, for drop-down items).</Muted>
    </ScrollView>
  );
}
