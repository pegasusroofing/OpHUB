// Raise a purchase order from Finance (909 openFinNewPo / saveFinNewPo): supplier (or a new one), plot,
// delivery or collection, required-by date, reference, notes, and priced lines with a cost code and VAT
// each → a numbered PO (fin_new_po, same <job>-PO-NNN numbering as material orders). Nothing is sent:
// emailing the PO to the supplier waits for the end of the Finance trial.
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { DateBox, todayIso } from '@/components/DateField';
import { SelectBox } from '@/components/SelectBox';
import { SuggestField } from '@/components/SuggestField';
import { useToast } from '@/components/toast';
import { Button, Card, Muted, SectionTitle } from '@/components/ui';
import { fdb, loadSettings } from '@/data/finance';
import { useSubJobs } from '@/data/finSubJobs';
import { useAuth } from '@/lib/auth';
import { COST_CATS } from '@/lib/rules/finBook';
import { jobTag, money, num, vatList } from '@/lib/rules/finance';
import { supabase } from '@/lib/supabase';
import type { Site } from '@/lib/types';
import { base, radius } from '@/theme/theme';

type Line = { description: string; qty: string; unit: string; rate: string; cost_code: string; vat: string };
const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, paddingHorizontal: 8, paddingVertical: 7, color: base.ink, backgroundColor: base.card };
const r2 = (n: number) => Math.round(n * 100) / 100;

export function FinNewPo({ site }: { site: Site }) {
  const { me } = useAuth();
  const toast = useToast();
  const { data: subs = [] } = useSubJobs(site);
  const { data: setup } = useQuery({ queryKey: ['finNewPoSetup', me?.org_id], enabled: !!me, queryFn: async () => ({ st: await loadSettings(me?.org_id ?? null), sups: (((await fdb.from('suppliers').select('id,name,email').eq('org_id', me?.org_id as string).order('name')).data as { id: string; name: string; email: string | null }[] | null) ?? []) }) });
  const vats = vatList(setup?.st as never).filter((v) => v.active);
  const vat0 = String((setup?.st as { po_vat_default?: string } | undefined)?.po_vat_default || '20');
  const blank = (v = vat0): Line => ({ description: '', qty: '1', unit: '', rate: '', cost_code: 'materials', vat: v });
  const [lines, setLines] = useState<Line[]>([blank()]);
  const [supText, setSupText] = useState('');
  const [supId, setSupId] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [sub, setSub] = useState('');
  const [delivery, setDelivery] = useState<'delivery' | 'collection'>('delivery');
  const [req, setReq] = useState('');
  const [ref, setRef] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  const rateOf = (code: string) => { const v = vats.find((x) => x.code === code); return v && !v.rc ? v.rate / 100 : 0; };
  const amt = (l: Line) => { const q = num(l.qty), r = num(l.rate); return q !== null && r !== null && !isNaN(q) && !isNaN(r) ? r2(q * r) : 0; };
  const net = r2(lines.reduce((t, l) => t + amt(l), 0)), vat = r2(lines.reduce((t, l) => t + r2(amt(l) * rateOf(l.vat)), 0));
  const set = (i: number, p: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const isNew = !supId && !!supText.trim();

  const raise = async () => {
    if (!supId && !supText.trim()) { toast('Choose the supplier.'); return; }
    if (isNew && newEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())) { toast('Check the supplier’s email.'); return; }
    const items = lines.filter((l) => l.description.trim()).map((l) => ({ item: l.description.trim(), qty: num(l.qty), unit: l.unit.trim() || null, rate: num(l.rate), amount: amt(l), cost_code: l.cost_code || 'materials', vat_rate: l.vat, vat: r2(amt(l) * rateOf(l.vat)) }));
    if (!items.length) { toast('Add at least one item.'); return; }
    setBusy(true);
    try {
      let id = supId, name = setup?.sups.find((s) => s.id === supId)?.name || supText.trim();
      if (!id) {
        const made = await fdb.from('suppliers').insert({ org_id: me.org_id, name: supText.trim(), email: newEmail.trim() || null, created_by: me.id } as never).select('id,name').single();
        if (!made.data) { toast('Could not add the supplier.'); return; }
        id = (made.data as { id: string }).id; name = supText.trim();
      }
      const res = await supabase.rpc('fin_new_po' as never, { p_site: site.id, p_supplier_id: id, p_supplier_name: name, p_items: items, p_required: req || null, p_note: note.trim() || null, p_delivery: delivery } as never);
      const d = res.data as { id: string; number: string } | null;
      if (res.error || !d?.id) { toast(`Could not raise the PO — ${res.error?.message || 'try again'}`); return; }
      await fdb.from('purchase_orders').update({ vat, total: r2(net + vat), reference: ref.trim() || null, issue_date: todayIso(), ...(sub ? { sub_job_id: sub } : {}) } as never).eq('id', d.id);
      router.replace(`/fin/po/${d.id}` as never);
    } finally { setBusy(false); }
  };

  return (
    <View>
      <Card>
        <SectionTitle>New purchase order · {jobTag(site)}</SectionTitle>
        <SuggestField label="Supplier" value={supText} onChangeText={(t) => { setSupText(t); setSupId(null); }} placeholder="Type to find a supplier, or a new name" showAllOnFocus max={12}
          items={(setup?.sups || []).map((s) => ({ key: s.id, label: s.name, sub: s.email || '' }))} onPick={(s) => { setSupId(s.key); setSupText(s.label); }} />
        {isNew && <><Muted style={{ marginTop: -6, marginBottom: 6 }}>New supplier — added to your suppliers when the PO is raised.</Muted><TextInput value={newEmail} onChangeText={setNewEmail} placeholder="Supplier's orders email (optional)" autoCapitalize="none" keyboardType="email-address" style={[box, { marginBottom: 8 }]} /></>}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {subs.length > 0 && <SelectBox label="Plot / address" value={sub || '-'} options={[['-', 'Whole job'], ...subs.map((s) => [s.id, s.short] as [string, string])]} onChange={(k) => setSub(k === '-' ? '' : k)} style={{ minWidth: 180, flexGrow: 1 }} />}
          <SelectBox label="Delivery" value={delivery} options={[['delivery', 'Deliver to site'], ['collection', 'Collection']]} onChange={setDelivery} style={{ minWidth: 180, flexGrow: 1 }} />
          <View style={{ minWidth: 180, flexGrow: 1, marginBottom: 10 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: base.slate, marginBottom: 4 }}>Required by</Text>
            <DateBox value={req} onChange={setReq} min={todayIso()} title="Required by" />
          </View>
        </View>
        <TextInput value={ref} onChangeText={setRef} placeholder="Your reference (optional), e.g. Quote Q-5521" style={[box, { marginBottom: 8 }]} />
        <TextInput value={note} onChangeText={setNote} placeholder="Notes for the supplier (optional)" multiline style={[box, { minHeight: 52 }]} />
      </Card>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
          <SectionTitle>Lines</SectionTitle>
          <View style={{ marginLeft: 'auto', width: 200 }}><SelectBox value={lines[0]?.vat || vat0} title="VAT for all lines" options={vats.map((v) => [v.code, v.name] as [string, string])} onChange={(k) => setLines((ls) => ls.map((l) => ({ ...l, vat: k })))} style={{ marginBottom: 0 }} /></View>
        </View>
        {lines.map((l, i) => (
          <View key={i} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: base.line, paddingTop: i ? 8 : 0, marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              <TextInput value={l.description} onChangeText={(v) => set(i, { description: v })} placeholder="Description" style={[box, { flex: 1, fontSize: 15 }]} />
              {lines.length > 1 && <Pressable accessibilityLabel="Remove line" hitSlop={8} onPress={() => setLines((ls) => ls.filter((_, j) => j !== i))}><Text style={{ color: base.slate, fontSize: 16, fontWeight: '700' }}>✕</Text></Pressable>}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6, alignItems: 'center' }}>
              <TextInput value={l.qty} onChangeText={(v) => set(i, { qty: v.replace(/[^0-9.]/g, '') })} placeholder="Qty" keyboardType="decimal-pad" style={[box, { width: 64 }]} />
              <TextInput value={l.unit} onChangeText={(v) => set(i, { unit: v })} placeholder="Unit" style={[box, { width: 64 }]} />
              <TextInput value={l.rate} onChangeText={(v) => set(i, { rate: v.replace(/[^0-9.]/g, '') })} placeholder="Rate £" keyboardType="decimal-pad" style={[box, { width: 84 }]} />
              <SelectBox value={l.cost_code} title="Cost code" options={Object.entries(COST_CATS).filter(([k]) => k !== 'labour')} onChange={(k) => set(i, { cost_code: k })} style={{ marginBottom: 0, width: 170 }} />
              <SelectBox value={l.vat} title="VAT" options={vats.map((v) => [v.code, v.name] as [string, string])} onChange={(k) => set(i, { vat: k })} style={{ marginBottom: 0, width: 170 }} />
              <Text style={{ marginLeft: 'auto', fontWeight: '800', color: base.ink }}>{money(amt(l))}</Text>
            </View>
          </View>
        ))}
        <Button small kind="ghost" title="+ Add line" onPress={() => setLines((ls) => [...ls, blank(ls[0]?.vat || vat0)])} />
        <View style={{ alignItems: 'flex-end', marginTop: 8, gap: 2 }}>
          <Text style={{ color: base.slate }}>Subtotal {money(net)}</Text>
          <Text style={{ color: base.slate }}>VAT {money(vat)}</Text>
          <Text style={{ fontWeight: '800', color: base.ink, fontSize: 16 }}>Total {money(r2(net + vat))}</Text>
        </View>
      </Card>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button small busy={busy} title="Raise PO" onPress={() => void raise()} />
        <Button small kind="ghost" title="Cancel" onPress={() => router.back()} />
        <Muted style={{ fontSize: 12 }}>The PO is saved and numbered here. Emailing it to the supplier is off while Finance is on trial — print or download the PDF instead.</Muted>
      </View>
    </View>
  );
}
