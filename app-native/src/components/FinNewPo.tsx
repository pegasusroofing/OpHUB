// Raise a purchase order from Finance (909 openFinNewPo / saveFinNewPo): supplier (or a new one), plot,
// delivery or collection, required-by date, reference, notes, and priced lines with a cost code and VAT
// each → a numbered PO (fin_new_po, same <job>-PO-NNN numbering as material orders). Nothing is sent:
// emailing the PO to the supplier waits for the end of the Finance trial.
// Each line has its own job (default this one) and a Disc % (9219zb, Andy 4 Nov 2026). The PO sits on line 1's job;
// lines for other jobs split the cost to those jobs by value. Cost codes are the company's numbered codes
// ("310 – Materials") when it has any, otherwise the cost types.
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { DateBox, todayIso } from '@/components/DateField';
import { SelectBox } from '@/components/SelectBox';
import { SuggestField } from '@/components/SuggestField';
import { useToast } from '@/components/toast';
import { Button, Card, Muted, SectionTitle } from '@/components/ui';
import { fdb, finStatus, loadSettings } from '@/data/finance';
import { useSites } from '@/data/sites';
import { useSubJobs } from '@/data/finSubJobs';
import { useAuth } from '@/lib/auth';
import { COST_CATS } from '@/lib/rules/finBook';
import { jobTag, money, num, vatList } from '@/lib/rules/finance';
import { supabase } from '@/lib/supabase';
import type { Site } from '@/lib/types';
import { base, radius, useDesk } from '@/theme/theme';

type Line = { site_id: string; description: string; qty: string; unit: string; rate: string; disc: string; cost_code: string; cost_code_id: string | null; vat: string };
type Code = { id: string; code: string | null; name: string; category: string | null; active: boolean | null };
const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, paddingHorizontal: 8, paddingVertical: 7, color: base.ink, backgroundColor: base.card };
const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;
const COL = { job: 96, qty: 54, unit: 58, rate: 78, disc: 58, code: 160, vat: 110, net: 84 };
const th = { fontSize: 11, fontWeight: '600' as const, color: base.slate };
const cell = { paddingVertical: 5, fontSize: 13.5, textAlign: 'center' as const };

export function FinNewPo({ site, itemIds = [] }: { site: Site; itemIds?: string[] }) {
  const { me } = useAuth();
  const toast = useToast();
  const { data: subs = [] } = useSubJobs(site);
  const desk = useDesk();
  const { data: allSites = [] } = useSites();
  const jobs = allSites.filter((x) => finStatus(x) !== 'closed' || x.id === site.id).slice().sort((a, b) => String(b.job_number || '').localeCompare(String(a.job_number || ''), 'en-GB', { numeric: true }));
  const { data: codes = [] } = useQuery({ queryKey: ['finCostCodes', me?.org_id], enabled: !!me, queryFn: async () => (((await fdb.from('fin_cost_codes').select('id,code,name,category,active').eq('org_id', me?.org_id as string)).data as Code[] | null) ?? []).filter((c) => c.active !== false && c.category !== 'labour').sort((a, b) => String(a.code || '').localeCompare(String(b.code || ''), 'en-GB', { numeric: true })) });
  const codeFor = (cat: string) => codes.find((c) => c.category === cat)?.id ?? null;
  const codeOpts: [string, string][] = codes.length ? codes.map((c) => [`cc:${c.id}`, `${c.code ? `${c.code} – ` : ''}${c.name}`]) : Object.entries(COST_CATS).filter(([k]) => k !== 'labour');
  const codeVal = (l: Line) => (codes.length ? `cc:${l.cost_code_id ?? codeFor(l.cost_code) ?? ''}` : l.cost_code);
  const setCode = (i: number, v: string) => { if (v.startsWith('cc:')) { const c = codes.find((x) => x.id === v.slice(3)); set(i, { cost_code_id: c?.id ?? null, cost_code: c?.category && COST_CATS[c.category] ? c.category : 'materials' }); } else set(i, { cost_code_id: null, cost_code: v || 'materials' }); };
  const { data: setup } = useQuery({ queryKey: ['finNewPoSetup', me?.org_id], enabled: !!me, queryFn: async () => ({ st: await loadSettings(me?.org_id ?? null), sups: (((await fdb.from('suppliers').select('id,name,email').eq('org_id', me?.org_id as string).order('name')).data as { id: string; name: string; email: string | null }[] | null) ?? []) }) });
  const vats = vatList(setup?.st as never).filter((v) => v.active);
  const vat0 = String((setup?.st as { po_vat_default?: string } | undefined)?.po_vat_default || '20');
  const blank = (v = vat0, sid = site.id): Line => ({ site_id: sid, description: '', qty: '1', unit: '', rate: '', disc: '', cost_code: 'materials', cost_code_id: null, vat: v });
  const [lines, setLines] = useState<Line[]>([blank()]);
  const [supText, setSupText] = useState('');
  const [supId, setSupId] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [sub, setSub] = useState('');
  const [delivery, setDelivery] = useState<'delivery' | 'collection'>('delivery');
  const [req, setReq] = useState('');
  const [ref, setRef] = useState('');
  const [note, setNote] = useState('');
  const [contact, setContact] = useState('');
  const [contactPh, setContactPh] = useState('');
  const { data: team } = useQuery({ queryKey: ['finPoTeam', site.id], queryFn: async () => {
    const a = ((await fdb.from('site_assignments').select('user_id').eq('site_id', site.id)).data as { user_id: string }[] | null) ?? [];
    const ids = [...a.map((x) => x.user_id), (site as { responsible_pm_id?: string | null }).responsible_pm_id].filter(Boolean) as string[];
    return ids.length ? ((await fdb.from('profiles').select('id,name,phone,role').in('id', ids)).data as { id: string; name: string; phone: string | null; role: string }[] | null) ?? [] : [];
  } });
  const { data: finSups } = useQuery({ queryKey: ['finPoSupVat', me?.org_id], enabled: !!me, queryFn: async () => ((await fdb.from('fin_suppliers').select('supplier_id,name,purchase_vat').eq('org_id', me?.org_id as string)).data as { supplier_id: string | null; name: string; purchase_vat: string | null }[] | null) ?? [] });
  // A supplier's default VAT from the Directory goes on every line.
  const applySupVat = (id: string, name: string) => { const v = finSups?.find((x) => x.supplier_id === id || x.name.trim().toLowerCase() === name.trim().toLowerCase())?.purchase_vat; if (v && vats.some((x) => x.code === v)) setLines((ls) => ls.map((l) => ({ ...l, vat: v }))); };
  const [busy, setBusy] = useState(false);
  // Ticked on Purchase Quotes (9219z finPqRaisePo): those items become the lines, the supplier filled in.
  const [filled, setFilled] = useState(false);
  const { data: picked } = useQuery({ queryKey: ['finNewPoItems', itemIds.join(',')], enabled: itemIds.length > 0, queryFn: async () => ((await fdb.from('fin_quote_items').select('*').in('id', itemIds)).data as Record<string, any>[] | null) ?? [] });
  if (picked && picked.length && setup && !filled) {
    setFilled(true);
    setLines(picked.map((i) => ({ ...blank(), description: `${i.code ? `${i.code} – ` : ''}${i.description}`, unit: i.unit || '', rate: i.rate != null ? String(i.rate) : '' })));
    const names = Array.from(new Set(picked.map((i) => String(i.supplier_name || '').trim()).filter(Boolean)));
    if (names.length === 1) { const m = setup.sups.find((x) => x.name.trim().toLowerCase() === names[0].toLowerCase()); setSupText(m ? m.name : names[0]); setSupId(m ? m.id : null); }
  }
  if (!me) return null;
  const rateOf = (code: string) => { const v = vats.find((x) => x.code === code); return v && !v.rc ? v.rate / 100 : 0; };
  const dsc = (l: Line) => { const d = num(l.disc); return d === null || isNaN(d) ? 0 : Math.max(0, Math.min(100, d)); };
  const amt = (l: Line) => { const q = num(l.qty), r = num(l.rate); return q !== null && r !== null && !isNaN(q) && !isNaN(r) ? r2(q * r * (1 - dsc(l) / 100)) : 0; };
  const net = r2(lines.reduce((t, l) => t + amt(l), 0)), vat = r2(lines.reduce((t, l) => t + r2(amt(l) * rateOf(l.vat)), 0));
  const set = (i: number, p: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const isNew = !supId && !!supText.trim();

  const raise = async () => {
    if (!supId && !supText.trim()) { toast('Choose the supplier.'); return; }
    if (contact.trim() && !contactPh.trim()) { toast(`Add a contact number for ${contact.trim()}.`); return; }
    if (isNew && newEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())) { toast('Check the supplier’s email.'); return; }
    const items = lines.filter((l) => l.description.trim()).map((l) => {
      const d = dsc(l), r = num(l.rate);
      return { item: l.description.trim(), qty: num(l.qty), unit: l.unit.trim() || null, rate: r === null || isNaN(r) ? null : r4(r * (1 - d / 100)), ...(d ? { list_rate: r, discount_pct: d } : {}), amount: amt(l), cost_code: l.cost_code || 'materials', ...(codes.length && (l.cost_code_id ?? codeFor(l.cost_code)) ? { cost_code_id: l.cost_code_id ?? codeFor(l.cost_code) } : {}), site_id: l.site_id || site.id, vat_rate: l.vat, vat: r2(amt(l) * rateOf(l.vat)) };
    });
    if (!items.length) { toast('Add at least one item.'); return; }
    setBusy(true);
    try {
      let id = supId, name = setup?.sups.find((s) => s.id === supId)?.name || supText.trim();
      if (!id) {
        const made = await fdb.from('suppliers').insert({ org_id: me.org_id, name: supText.trim(), email: newEmail.trim() || '', created_by: me.id } as never).select('id,name').single();
        if (!made.data) { toast('Could not add the supplier.'); return; }
        id = (made.data as { id: string }).id; name = supText.trim();
      }
      const poSite = items[0].site_id; // the PO shows line 1's job
      const res = await supabase.rpc('fin_new_po' as never, { p_site: poSite, p_supplier_id: id, p_supplier_name: name, p_items: items, p_required: req || null, p_note: [contact.trim() ? `Site contact: ${contact.trim()} – ${contactPh.trim()}` : '', note.trim()].filter(Boolean).join('\n') || null, p_delivery: delivery } as never);
      const d = res.data as { id: string; number: string } | null;
      if (res.error || !d?.id) { toast(`Could not raise the PO — ${res.error?.message || 'try again'}`); return; }
      // Lines for other jobs: their cost goes to those jobs, split by value.
      const bySite: Record<string, number> = {}; items.forEach((x) => { bySite[x.site_id] = (bySite[x.site_id] || 0) + x.amount; });
      const sids = Object.keys(bySite);
      let split: { site_id: string; pct: number }[] | null = null;
      if (sids.length > 1) { const tot = net || 1; split = sids.map((x) => ({ site_id: x, pct: r2((bySite[x] / tot) * 100) })); split[0].pct = r2(split[0].pct + r2(100 - split.reduce((t, e) => t + e.pct, 0))); }
      // The plot list is this job's plots: it only applies if the PO stayed on this job.
      const plot = poSite === site.id ? sub : '';
      await fdb.from('purchase_orders').update({ vat, total: r2(net + vat), reference: ref.trim() || null, issue_date: todayIso(), site_contact: contact.trim() || null, site_contact_phone: contactPh.trim() || null, ...(plot ? { sub_job_id: plot } : {}), ...(split ? { split, split_sites: sids.filter((x) => x !== poSite) } : {}) } as never).eq('id', d.id);
      if (split) toast(`PO ${d.number} raised — costs split across ${sids.length} jobs`);
      router.replace(`/fin/po/${d.id}` as never);
    } finally { setBusy(false); }
  };

  return (
    <View>
      <Card>
        <SectionTitle>New purchase order · {jobTag(site)}</SectionTitle>
        <SuggestField label="Supplier" value={supText} onChangeText={(t) => { setSupText(t); setSupId(null); }} placeholder="Type to find a supplier, or a new name" showAllOnFocus max={12}
          items={(setup?.sups || []).map((s) => ({ key: s.id, label: s.name, sub: s.email || '' }))} onPick={(s) => { setSupId(s.key); setSupText(s.label); applySupVat(s.key, s.label); }} />
        {isNew && <><Muted style={{ marginTop: -6, marginBottom: 6 }}>New supplier — added to your suppliers when the PO is raised.</Muted><TextInput value={newEmail} onChangeText={setNewEmail} placeholder="Supplier's orders email (optional)" autoCapitalize="none" keyboardType="email-address" style={[box, { marginBottom: 8 }]} /></>}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {subs.length > 0 && <SelectBox label="Plot / address" value={sub || '-'} options={[['-', 'Whole job'], ...subs.map((s) => [s.id, s.short] as [string, string])]} onChange={(k) => setSub(k === '-' ? '' : k)} style={{ minWidth: 180, flexGrow: 1 }} />}
          <SelectBox label="Delivery" value={delivery} options={[['delivery', 'Deliver to site'], ['collection', 'Collection']]} onChange={setDelivery} style={{ minWidth: 180, flexGrow: 1 }} />
          <View style={{ minWidth: 180, flexGrow: 1, marginBottom: 10 }}>
            <Text style={{ fontSize: 12, fontWeight: '500', color: base.slate, marginBottom: 4 }}>Required by</Text>
            <DateBox value={req} onChange={setReq} min={todayIso()} title="Required by" />
          </View>
        </View>
        <SuggestField label="Site contact" value={contact} onChangeText={setContact} placeholder="Start typing a name" showAllOnFocus max={12} items={(team || []).map((p) => ({ key: p.id, label: p.name, sub: p.phone || '' }))} onPick={(s) => { setContact(s.label); const ph = team?.find((p) => p.id === s.key)?.phone; if (ph) setContactPh(ph); }} />
        <TextInput accessibilityLabel="Contact number" value={contactPh} onChangeText={setContactPh} keyboardType="phone-pad" placeholder="Contact number" style={[box, { marginBottom: 8 }]} />
        <TextInput value={ref} onChangeText={setRef} placeholder="Your reference (optional), e.g. Quote Q-5521" style={[box, { marginBottom: 8 }]} />
        <TextInput value={note} onChangeText={setNote} placeholder="Notes for the supplier (optional)" multiline style={[box, { minHeight: 52 }]} />
      </Card>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
          <SectionTitle>Lines</SectionTitle>
          <View style={{ marginLeft: 'auto', width: 200 }}><SelectBox value={lines[0]?.vat || vat0} title="VAT for all lines" options={vats.map((v) => [v.code, v.name] as [string, string])} onChange={(k) => setLines((ls) => ls.map((l) => ({ ...l, vat: k })))} style={{ marginBottom: 0 }} /></View>
        </View>
        {desk && (
          <View style={{ flexDirection: 'row', gap: 6, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: base.line, marginBottom: 6 }}>
            {[['Job', COL.job], ['Description', 0], ['Qty', COL.qty], ['Unit', COL.unit], ['Rate £', COL.rate], ['Disc %', COL.disc], ['Cost Code', COL.code], ['VAT', COL.vat], ['Net', COL.net], ['', 18]].map(([t, w], k) => (
              <Text key={k} style={[th, w ? { width: w as number } : { flex: 1 }, k > 1 && { textAlign: 'center' }]}>{t}</Text>
            ))}
          </View>
        )}
        {lines.map((l, i) => {
          const jobBox = <SelectBox compact value={l.site_id} title="Job" options={jobs.map((x) => [x.id, x.job_number || x.name] as [string, string])} onChange={(k) => set(i, { site_id: k })} style={{ marginBottom: 0, width: desk ? COL.job : 120 }} />;
          const del = lines.length > 1 ? <Pressable accessibilityLabel="Remove line" hitSlop={8} onPress={() => setLines((ls) => ls.filter((_, j) => j !== i))} style={{ width: 18, alignItems: 'center' }}><Text style={{ color: base.slate, fontSize: 15, fontWeight: '500' }}>✕</Text></Pressable> : <View style={{ width: 18 }} />;
          const nums = (
            <>
              <TextInput accessibilityLabel="Qty" value={l.qty} onChangeText={(v) => set(i, { qty: v.replace(/[^0-9.]/g, '') })} placeholder="Qty" keyboardType="decimal-pad" style={[box, cell, { width: COL.qty }]} />
              <TextInput accessibilityLabel="Unit" value={l.unit} onChangeText={(v) => set(i, { unit: v })} placeholder="nr" style={[box, cell, { width: COL.unit }]} />
              <TextInput accessibilityLabel="Rate" value={l.rate} onChangeText={(v) => set(i, { rate: v.replace(/[^0-9.]/g, '') })} placeholder="£" keyboardType="decimal-pad" style={[box, cell, { width: COL.rate }]} />
              <TextInput accessibilityLabel="Discount %" value={l.disc} onChangeText={(v) => set(i, { disc: v.replace(/[^0-9.]/g, '') })} placeholder="0" keyboardType="decimal-pad" style={[box, cell, { width: COL.disc }]} />
              <SelectBox compact value={codeVal(l)} title="Cost code" options={codeOpts} onChange={(k) => setCode(i, k)} style={{ marginBottom: 0, width: COL.code }} />
              <SelectBox compact value={l.vat} title="VAT" options={vats.map((v) => [v.code, v.name] as [string, string])} onChange={(k) => set(i, { vat: k })} style={{ marginBottom: 0, width: COL.vat }} />
            </>
          );
          return desk ? (
            <View key={i} style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 6 }}>
              {jobBox}
              <TextInput value={l.description} onChangeText={(v) => set(i, { description: v })} placeholder="Description" style={[box, { flex: 1, minWidth: 0, paddingVertical: 5, fontSize: 13.5 }]} />
              {nums}
              <Text style={{ width: COL.net, textAlign: 'center', fontWeight: '600', color: base.ink, fontSize: 13.5 }}>{money(amt(l))}</Text>
              {del}
            </View>
          ) : (
            <View key={i} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: base.line, paddingTop: i ? 8 : 0, marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                {jobBox}
                <TextInput value={l.description} onChangeText={(v) => set(i, { description: v })} placeholder="Description" style={[box, { flex: 1, fontSize: 15 }]} />
                {del}
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6, alignItems: 'center' }}>
                {nums}
                <Text style={{ marginLeft: 'auto', fontWeight: '600', color: base.ink }}>{money(amt(l))}</Text>
              </View>
            </View>
          );
        })}
        <Button small kind="ghost" title="+ Add line" onPress={() => setLines((ls) => [...ls, blank(ls[ls.length - 1]?.vat || vat0, ls[ls.length - 1]?.site_id || site.id)])} />
        <View style={{ alignItems: 'flex-end', marginTop: 8, gap: 2 }}>
          <Text style={{ color: base.slate }}>Subtotal {money(net)}</Text>
          <Text style={{ color: base.slate }}>VAT {money(vat)}</Text>
          <Text style={{ fontWeight: '600', color: base.ink, fontSize: 16 }}>Total {money(r2(net + vat))}</Text>
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
