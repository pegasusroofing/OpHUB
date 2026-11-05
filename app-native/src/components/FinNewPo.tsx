// Raise a purchase order from Finance (909 openFinNewPo / saveFinNewPo): supplier (or a new one), a plot on each line,
// delivery or collection, required-by date, reference, notes, and priced lines with a cost code and VAT
// each → a numbered PO (fin_new_po, same <job>-PO-NNN numbering as material orders). Nothing is sent:
// emailing the PO to the supplier waits for the end of the Finance trial.
// Each line has its own job (default this one) and a Disc % (9219zb, Andy 4 Nov 2026). The PO sits on line 1's job;
// lines for other jobs split the cost to those jobs by value. Cost codes are the company's numbered codes
// ("310 – Materials") when it has any, otherwise the cost types.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { DateBox, todayIso } from '@/components/DateField';
import { SelectBox } from '@/components/SelectBox';
import { SuggestField } from '@/components/SuggestField';
import { chooseAction, useToast } from '@/components/toast';
import { pickJob } from '@/components/FinSales';
import { TypePick, type PickOpt } from '@/components/TypePick';
import { PdfPages } from '@/components/DocViewer';
import { FinEmailPopup } from '@/components/FinEmailPopup';
import { emailPo, filePoPdf } from '@/data/finPurchase';
import { buildPoPdf } from '@/lib/finPoPdf';
import { deliverPdf } from '@/lib/pdf';
import { DEFAULT_UNITS, UnitField } from '@/components/UnitField';
import { QUOTE_SKIP_MSG, uploadQuotes } from '@/data/finQuoteUpload';
import { allocOf, evenSplit, lineNet, lineVat, mainSite, orderSplit, poTotals, splitProblem, type Alloc, type PoVat } from '@/lib/rules/poCalc';
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

const OFFLOAD = ['Hiab / Crane Offload', 'Forklift On Site', 'Hand Unload', 'Tail Lift', 'No Artics', 'Call 30 Min Before']; // Delivery Requirements (Andy, 5 Nov 2026)
const TIMES: [string, string][] = [['', 'Any Time'], ['First Thing (Before 9)', 'First Thing (Before 9)'], ['AM (8–12)', 'AM (8–12)'], ['PM (12–5)', 'PM (12–5)'], ['Timed — See Notes', 'Timed — See Notes']];
type QItem = { id: string; quote_id: string; code: string | null; description: string | null; unit: string | null; rate: number | null; supplier_name: string | null };
type Line = { alloc?: Alloc[]; sub?: string; // sub: the plot on the main project (Andy, 5 Nov 2026)
  site_id: string; description: string; qty: string; unit: string; rate: string; disc: string; cost_code: string; cost_code_id: string | null; vat: string };
type Code = { id: string; code: string | null; name: string; category: string | null; active: boolean | null };
const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, paddingHorizontal: 8, paddingVertical: 7, color: base.ink, backgroundColor: base.card };
const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;
const th = { fontSize: 11, fontWeight: '600' as const, color: base.slate };
const cell = { paddingVertical: 5, fontSize: 13.5, textAlign: 'center' as const };

/** site: the project when opened from one; otherwise it's chosen on the form (Andy, 5 Nov 2026: no job picker first). */
/** toTop: scrolls the page to the top (View PO shows the PO there; Andy, 5 Nov 2026). */
export function FinNewPo({ site: site0, itemIds = [], toTop }: { site?: Site | null; itemIds?: string[]; toTop?: () => void }) {
  const { me, org } = useAuth();
  const toast = useToast();
  const desk = useDesk();
  const { data: allSites = [] } = useSites();
  const [siteId, setSiteId] = useState(site0?.id || '');
  const site = (allSites.find((x) => x.id === siteId) || (site0 && site0.id === siteId ? site0 : null) || { id: '', name: '' }) as Site;
  const { data: subs = [] } = useSubJobs(site.id ? site : null as never);
  const jobs = allSites.filter((x) => finStatus(x) !== 'closed' || x.id === site.id).slice().sort((a, b) => String(b.job_number || '').localeCompare(String(a.job_number || ''), 'en-GB', { numeric: true }));
  const { data: codes = [] } = useQuery({ queryKey: ['finCostCodes', me?.org_id], enabled: !!me, queryFn: async () => (((await fdb.from('fin_cost_codes').select('id,code,name,category,active').eq('org_id', me?.org_id as string)).data as Code[] | null) ?? []).filter((c) => c.active !== false && c.category !== 'labour').sort((a, b) => String(a.code || '').localeCompare(String(b.code || ''), 'en-GB', { numeric: true })) });
  const codeFor = (cat: string) => codes.find((c) => c.category === cat)?.id ?? null;
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
  const [delivery, setDelivery] = useState<'delivery' | 'collection'>('delivery');
  const [req, setReq] = useState('');
  const [ref, setRef] = useState('');
  const [note, setNote] = useState('');
  const [contact, setContact] = useState('');
  const [contactPh, setContactPh] = useState('');
  const { data: team } = useQuery({ queryKey: ['finPoTeam', site.id], enabled: !!site.id, queryFn: async () => {
    const a = ((await fdb.from('site_assignments').select('user_id').eq('site_id', site.id)).data as { user_id: string }[] | null) ?? [];
    const ids = [...a.map((x) => x.user_id), (site as { responsible_pm_id?: string | null }).responsible_pm_id].filter(Boolean) as string[];
    return ids.length ? ((await fdb.from('profiles').select('id,name,phone,role').in('id', ids)).data as { id: string; name: string; phone: string | null; role: string }[] | null) ?? [] : [];
  } });
  const { data: finSups } = useQuery({ queryKey: ['finPoSupVat', me?.org_id], enabled: !!me, queryFn: async () => ((await fdb.from('fin_suppliers').select('supplier_id,name,purchase_vat').eq('org_id', me?.org_id as string)).data as { supplier_id: string | null; name: string; purchase_vat: string | null }[] | null) ?? [] });
  // A supplier's default VAT from the Directory goes on every line.
  const applySupVat = (id: string, name: string) => { const v = finSups?.find((x) => x.supplier_id === id || x.name.trim().toLowerCase() === name.trim().toLowerCase())?.purchase_vat; if (v && vats.some((x) => x.code === v)) setLines((ls) => ls.map((l) => ({ ...l, vat: v }))); };
  const [busy, setBusy] = useState(false);
  // Delivery (Andy, 5 Nov 2026): the job address by default, or the office, or typed; a time; what's needed to offload.
  const [deliverTo, setDeliverTo] = useState<'job' | 'office' | 'other'>('job');
  const [addrTyped, setAddrTyped] = useState('');
  const [delTime, setDelTime] = useState('');
  const [offload, setOffload] = useState<string[]>([]);
  const jobAddr = [(site as Record<string, any>).address, (site as Record<string, any>).postcode].filter(Boolean).join(', ');
  const officeAddr = String((setup?.st as Record<string, any> | undefined)?.company_address || '').replace(/\s*\n\s*/g, ', ');
  // The project's quotes and the price lists, as a shopping list: tick what you want and add it (Andy, 5 Nov 2026).
  const { data: quotes } = useQuery({ queryKey: ['finPoQuotes', site.id, me?.org_id], enabled: !!me, queryFn: async () => {
    const qs = ((await fdb.from('fin_quotes').select('id,site_id,supplier_name,quote_no,quote_date,created_at,file_name').eq('org_id', me?.org_id as string).eq('purpose', 'pquote')).data as Record<string, any>[] | null) ?? [];
    const mine = qs.filter((q) => !q.site_id || q.site_id === site.id).sort((a, b) => Number(b.site_id === site.id) - Number(a.site_id === site.id) || String(b.quote_date || b.created_at || '').localeCompare(String(a.quote_date || a.created_at || '')));
    const items = mine.length ? ((await fdb.from('fin_quote_items').select('id,quote_id,code,description,unit,rate,supplier_name,active').in('quote_id', mine.map((q) => q.id)).eq('active', true).order('position')).data as QItem[] | null) ?? [] : [];
    return { list: mine, items };
  } });
  const [qPick, setQPick] = useState('');
  const [showShop, setShowShop] = useState(true); // the project quote panel; ✕ closes it and the PO goes full width
  const [upBusy, setUpBusy] = useState('');
  const [fullCodes, setFullCodes] = useState(false); // cost codes: just the number unless asked
  const [saved, setSaved] = useState<{ id: string; number: string } | null>(null); // after Save Draft / Raise PO
  const [statusNow, setStatusNow] = useState<'draft' | 'open' | ''>('');
  const [panel, setPanel] = useState<'quote' | 'pdf'>('quote'); // the right-hand panel: the project quote, or the PO PDF
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [viewedKey, setViewedKey] = useState(''); // what the PDF on screen was made from
  const [pdfW, setPdfW] = useState(0); // the panel's width, so the PDF fits it
  const [mailRow, setMailRow] = useState<{ row: Record<string, any>; to: string } | null>(null);
  const [split, setSplit] = useState<Alloc[] | null>(null); // Split Purchase: the whole order across several projects
  const [openSplit, setOpenSplit] = useState<number | null>(null); // the line whose own split is open
  const qc = useQueryClient();
  const [ticked, setTicked] = useState<Set<string>>(new Set());
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
  // The sums come from poCalc (tested): VAT on each line at its own rate, so the VAT by rate adds up to the total (Andy, 5 Nov 2026).
  const pv = vats as unknown as PoVat[];
  const dsc = (l: Line) => { const d = num(l.disc); return d === null || isNaN(d) ? 0 : Math.max(0, Math.min(100, d)); };
  const amt = (l: Line) => lineNet(l);
  const tots = poTotals(lines, pv), net = tots.net, vat = tots.vat;
  const set = (i: number, p: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const isNew = !supId && !!supText.trim();

  /** Saves the PO: 'draft' (Save Draft) or 'open' (Raise PO). Gives back the PO row, or null. */
  const persist = async (status: 'draft' | 'open'): Promise<Record<string, any> | null> => {
    const no = (m: string) => { toast(m); return null; };
    if (!site.id && !split?.length) return no('Choose the project, or Split Purchase.');
    const sp = splitProblem(split); if (sp) return no(`Split Purchase: ${sp}`);
    for (const [k, l] of lines.entries()) { if (!l.description.trim()) continue; const lp = splitProblem(l.alloc); if (lp) return no(`Line ${k + 1}: ${lp}`); if (!allocOf({ ...l, site_id: l.site_id || site.id }, split).length) return no(`Choose the job on line ${k + 1}.`); }
    if (!supId && !supText.trim()) return no('Choose the supplier.');
    if (status === 'open' && contact.trim() && !contactPh.trim()) return no(`Add a contact number for ${contact.trim()}.`);
    if (isNew && newEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())) return no('Check the supplier’s email.');
    if (status === 'open' && deliverTo === 'other' && delivery === 'delivery' && !addrTyped.trim()) return no('Type the delivery address.');
    const items = lines.filter((l) => l.description.trim()).map((l) => {
      const d = dsc(l), r = num(l.rate);
      return { item: l.description.trim(), qty: num(l.qty), unit: l.unit.trim() || null, rate: r === null || isNaN(r) ? null : r4(r * (1 - d / 100)), ...(d ? { list_rate: r, discount_pct: d } : {}), amount: amt(l), cost_code: l.cost_code || 'materials', ...(codes.length && (l.cost_code_id ?? codeFor(l.cost_code)) ? { cost_code_id: l.cost_code_id ?? codeFor(l.cost_code) } : {}), site_id: mainSite([{ ...l, site_id: l.site_id || site.id }], split, site.id), ...(allocOf({ ...l, site_id: l.site_id || site.id }, split).length > 1 ? { alloc: allocOf({ ...l, site_id: l.site_id || site.id }, split) } : {}), vat_rate: l.vat, vat: lineVat(l, pv), ...(l.sub && !split?.length && !l.alloc?.length && (l.site_id || site.id) === site.id ? { sub_job_id: l.sub } : {}) };
    });
    if (!items.length) return no('Add at least one item.');
    setBusy(true);
    try {
      let id = supId, name = setup?.sups.find((s) => s.id === supId)?.name || supText.trim();
      if (!id) {
        const made = await fdb.from('suppliers').insert({ org_id: me.org_id, name: supText.trim(), email: newEmail.trim() || '', created_by: me.id } as never).select('id,name').single();
        if (!made.data) return no('Could not add the supplier.');
        id = (made.data as { id: string }).id; name = supText.trim(); setSupId(id);
      }
      const used = lines.filter((l) => l.description.trim()).map((l) => ({ ...l, site_id: l.site_id || site.id }));
      const poSite = site.id && !split?.length ? mainSite(used, null, site.id) : mainSite(used, split, items[0].site_id); // filed on the project with most of it
      const noteText = [contact.trim() ? `Site contact: ${contact.trim()} – ${contactPh.trim()}` : '', note.trim()].filter(Boolean).join('\n') || null;
      // First save numbers it (fin_new_po); later saves change the same PO.
      let d = saved as { id: string; number: string } | null;
      if (!d) {
        const res = await supabase.rpc('fin_new_po' as never, { p_site: poSite, p_supplier_id: id, p_supplier_name: name, p_items: items, p_required: req || null, p_note: noteText, p_delivery: delivery } as never);
        d = res.data as { id: string; number: string } | null;
        if (res.error || !d?.id) return no(`Could not save the PO — ${res.error?.message || 'try again'}`);
      }
      // Lines and Split Purchase across jobs: the cost goes to each job by value, adding up to 100% (poCalc).
      const os = orderSplit(used, split);
      const sids = os ? os.map((x) => x.site_id) : [poSite];
      const poSplit = os ? os.map((x) => ({ site_id: x.site_id, pct: x.pct, amount: x.amount })) : null;
      // The plot list is this job's plots: it only applies if the PO stayed on this job.
      const onSite = items.filter((x) => x.site_id === poSite), plots = new Set(onSite.map((x) => (x as { sub_job_id?: string }).sub_job_id || ''));
      const plot = poSite === site.id && plots.size === 1 ? [...plots][0] : '';
      const patch = { status, supplier_id: id, supplier_name: name, items, value: net, required_by: req || null, fulfilment: delivery, note: noteText, vat, total: r2(net + vat), delivery_to: delivery === 'delivery' ? deliverTo : null, delivery_address: delivery === 'delivery' ? (deliverTo === 'office' ? officeAddr : deliverTo === 'other' ? addrTyped.trim() : jobAddr) || null : null, delivery_time: delTime || null, offload: offload.length ? offload : null, reference: ref.trim() || null, issue_date: todayIso(), site_contact: contact.trim() || null, site_contact_phone: contactPh.trim() || null, sub_job_id: plot || null, ...(poSplit ? { split: poSplit, split_sites: sids.filter((x) => x !== poSite) } : { split: null, split_sites: null }) };
      const up = await fdb.from('purchase_orders').update(patch as never).eq('id', d.id).select('*');
      const row = ((up.data as Record<string, any>[] | null) ?? [])[0];
      if (!row) return no('Could not save the PO — try again.');
      setSaved({ id: d.id, number: d.number }); setStatusNow(status);
      if (panel === 'pdf') void pdfOf(row).then((bytes) => { setViewedKey(JSON.stringify({ ...draftRow(), created_at: '' })); if (pdfUrl) URL.revokeObjectURL(pdfUrl); setPdfUrl(URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))); }).catch(() => undefined);
      void qc.invalidateQueries({ queryKey: ['finPurchases'] }); void qc.invalidateQueries({ queryKey: ['finPo'] });
      return row;
    } finally { setBusy(false); }
  };
  // The PDF of the PO as it stands (View PO shows it in the right-hand panel; Raise PO, Email and Export use it).
  const pdfOf = async (row: Record<string, any>) => buildPoPdf(row, allSites.find((x) => x.id === row.site_id) as Record<string, any> | undefined, await loadSettings(me.org_id), setup?.sups.find((x) => x.id === row.supplier_id) ?? null, org);
  const draftRow = (): Record<string, any> => ({ number: saved?.number || 'DRAFT', created_at: new Date().toISOString(), site_id: site.id, supplier_id: supId, supplier_name: supText, required_by: req || null, fulfilment: delivery, note: note.trim() || null, value: net, vat, total: r2(net + vat), delivery_to: deliverTo, delivery_address: deliverTo === 'office' ? officeAddr : deliverTo === 'other' ? addrTyped.trim() : jobAddr, delivery_time: delTime || null, offload, site_contact: contact.trim() || null, site_contact_phone: contactPh.trim() || null, ordered_by_name: me.name, items: lines.filter((l) => l.description.trim()).map((l) => ({ item: l.description.trim(), qty: num(l.qty), unit: l.unit || null, rate: (() => { const r = num(l.rate); return r === null || isNaN(r) ? null : r4(r * (1 - dsc(l) / 100)); })(), amount: amt(l) })) });
  const nowKey = JSON.stringify({ ...draftRow(), created_at: '' });
  const viewPo = async () => {
    try { setViewedKey(nowKey); const bytes = await pdfOf(draftRow()); if (pdfUrl) URL.revokeObjectURL(pdfUrl); setPdfUrl(URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))); setShowShop(true); setPanel('pdf'); toTop?.(); }
    catch { toast('Could not build the PO PDF.'); }
  };
  const exportPdf = async (row: Record<string, any>) => { try { const bytes = await pdfOf(row); void filePoPdf(me, row, bytes); if (!(await deliverPdf(bytes, `PO ${String(row.number).replace(/[^a-z0-9-]+/gi, '_')}.pdf`))) toast('Could not make the PDF — try again.'); } catch { toast('Could not build the PO PDF.'); } };
  const openEmail = async (row: Record<string, any>) => { const e = row.supplier_id ? ((await fdb.from('suppliers').select('email').eq('id', row.supplier_id).maybeSingle()).data as { email?: string } | null)?.email : ''; setMailRow({ row, to: String(e || newEmail || '') }); };
  const saveDraft = async () => { const row = await persist('draft'); if (row) toast(`Saved as a draft — ${row.number}`, { confirm: true }); };
  const raise = async () => {
    const row = await persist('open'); if (!row) return;
    // What next (Andy, 5 Nov 2026): email it with a template, download the PDF, or leave it for now.
    const k = await chooseAction(`PO ${row.number} raised — what next?`, [{ key: 'email', label: '✉ Email it to the supplier' }, { key: 'pdf', label: '⬇ Download the PDF' }, { key: 'view', label: '👁 View it here' }, { key: 'none', label: 'Nothing for now' }]);
    if (k === 'email') void openEmail(row); else if (k === 'pdf') void exportPdf(row); else if (k === 'view') void viewPo();
  };

  const qList = quotes?.list || [];
  const qOn = qPick || qList[0]?.id || '';
  const qItems = (quotes?.items || []).filter((i) => i.quote_id === qOn);
  // Upload a new quote (Excel / CSV) from here; it opens in the list (Andy, 5 Nov 2026).
  const uploadQuote = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: true, copyToCacheDirectory: true }); if (r.canceled || !r.assets.length) return;
    setUpBusy('Reading…');
    const res = await uploadQuotes(me, site.id || null, supText, r.assets, setUpBusy);
    setUpBusy('');
    if (res.skipped.length) toast(QUOTE_SKIP_MSG(res.skipped)); else if (!res.added) toast('Nothing found in that file.');
    if (res.ids[0]) { setQPick(res.ids[0]); setTicked(new Set()); }
    void qc.invalidateQueries({ queryKey: ['finPoQuotes'] });
  };
  const qLabel = (q: Record<string, any>) => `${q.supplier_name || 'Supplier'}${q.quote_no ? ` ${q.quote_no}` : q.file_name ? ` · ${String(q.file_name).replace(/\.[a-z0-9]+$/i, '')}` : ''}${q.site_id ? '' : ' (price list)'}${q.quote_date ? ` · ${q.quote_date.split('-').reverse().join('/')}` : ''}`;
  const pdfPanel = showShop && panel === 'pdf' && pdfUrl ? (
    <Card style={desk ? { flex: 1, minWidth: 0, marginBottom: 0, padding: 0, overflow: 'hidden' } : { padding: 0, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
        <Text style={{ flex: 1, fontWeight: '600', color: base.ink }}>PO {saved?.number || '(draft)'}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close the PO PDF" onPress={() => setPanel('quote')} style={{ borderWidth: 1, borderColor: base.line, borderRadius: 7, width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 15, color: base.slate }}>✕</Text></Pressable>
      </View>
      <View onLayout={(e) => setPdfW(Math.round(e.nativeEvent.layout.width))} style={{ height: desk ? 560 : 480, backgroundColor: '#f3f4f6' }}>{pdfW > 0 && <PdfPages key={`${pdfUrl}${pdfW}`} url={pdfUrl} zoom={1} width={pdfW - 24} light />}</View>
    </Card>
  ) : null;
  const shop = pdfPanel ? pdfPanel : showShop ? (
    <Card style={desk ? { flex: 1, minWidth: 0, marginBottom: 0 } : undefined}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <View style={{ flex: 1 }}><SectionTitle>From The Project Quote</SectionTitle></View>
        <Button small kind="ghost" busy={!!upBusy} title={upBusy || '📥 Upload Quote'} onPress={() => void uploadQuote()} />
      </View>
      {qList.length ? (
        <>
          <SelectBox value={qOn} title="Quote" options={qList.map((q) => [q.id, qLabel(q)] as [string, string])} onChange={(k) => { setQPick(k); setTicked(new Set()); }} />
          <Muted style={{ marginBottom: 6 }}>Tick what you want, like a shopping list.</Muted>
          <ScrollView style={{ maxHeight: desk ? 300 : undefined }} nestedScrollEnabled>
            {qItems.map((i) => { const on = ticked.has(i.id); return (
              <Pressable key={i.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`Tick ${i.description || ''}`} onPress={() => setTicked((t) => { const n = new Set(t); if (n.has(i.id)) n.delete(i.id); else n.add(i.id); return n; })} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#f0f1f3' }}>
                <View style={{ width: 16, height: 16, borderRadius: 4, borderWidth: 1.5, borderColor: on ? base.blue : '#c3c8d0', backgroundColor: on ? base.blue : '#fff', alignItems: 'center', justifyContent: 'center' }}>{on && <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600', lineHeight: 13 }}>✓</Text>}</View>
                <Text style={{ flex: 1, color: base.ink, fontSize: 13 }} numberOfLines={2}>{i.code ? `${i.code} – ` : ''}{i.description}</Text>
                <Text style={{ color: base.slate, fontSize: 12.5 }}>{i.rate != null ? `£${Number(i.rate).toFixed(3)}${i.unit ? ` / ${i.unit}` : ''}` : ''}</Text>
              </Pressable>
            ); })}
            {!qItems.length && <Muted>Nothing on this quote yet.</Muted>}
          </ScrollView>
          <View style={{ marginTop: 8, alignSelf: 'flex-start' }}><Button small title={ticked.size ? `Add ${ticked.size} Ticked To PO` : 'Tick Items To Add'} onPress={() => {
            const add = qItems.filter((i) => ticked.has(i.id)); if (!add.length) { toast('Tick at least one item.'); return; }
            setLines((ls) => [...ls.filter((l) => l.description.trim() || l.rate), ...add.map((i) => ({ ...blank(ls[0]?.vat || vat0), description: `${i.code ? `${i.code} – ` : ''}${i.description || ''}`, unit: i.unit || '', rate: i.rate != null ? String(i.rate) : '' }))]);
            const q = qList.find((x) => x.id === qOn);
            if (!supId && !supText.trim() && q?.supplier_name) { const m = setup?.sups.find((x) => x.name.trim().toLowerCase() === String(q.supplier_name).trim().toLowerCase()); setSupText(m ? m.name : q.supplier_name); setSupId(m ? m.id : null); }
            // The quote's number (or name) becomes the PO's reference (Andy, 5 Nov 2026).
            if (!ref.trim() && q) setRef(q.quote_no ? `Quote ${q.quote_no}` : q.file_name ? String(q.file_name).replace(/\.[a-z0-9]+$/i, '') : `${q.supplier_name || 'Supplier'} quote`);
            setTicked(new Set()); toast(`${add.length} added to the PO`);
          }} /></View>
        </>
      ) : <Muted>{site.id ? 'No quotes for this project yet. Upload one (Excel or CSV) to pick from it.' : 'Choose the project to see its quotes, or upload one.'}</Muted>}
    </Card>
  ) : desk ? (
    <Pressable accessibilityRole="button" accessibilityLabel="Open the project quote" onPress={() => setShowShop(true)} style={{ width: 36, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff', alignItems: 'center', paddingTop: 12, gap: 10 }}>
      <Text style={{ fontSize: 16, color: base.slate }}>‹</Text>
      {['P', 'R', 'O', 'J', 'E', 'C', 'T', ' ', 'Q', 'U', 'O', 'T', 'E'].map((c, k) => <Text key={k} style={{ fontSize: 10.5, fontWeight: '600', color: base.slate, lineHeight: 12 }}>{c}</Text>)}
    </Pressable>
  ) : null;

  // The open panel folds away from a strip down its left edge (Andy, 5 Nov 2026); the phone keeps a link instead.
  const side = desk && showShop && shop && panel !== 'pdf' ? (
    <View style={{ flex: 1, minWidth: 0, flexDirection: 'row' }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close the project quote" onPress={() => setShowShop(false)} style={{ width: 22, borderTopLeftRadius: 10, borderBottomLeftRadius: 10, borderWidth: 1, borderRightWidth: 0, borderColor: '#e5e7eb', backgroundColor: '#F6F7F9', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 16, color: base.slate }}>›</Text>
      </Pressable>
      <View style={{ flex: 1, minWidth: 0 }}>{shop}</View>
    </View>
  ) : shop;

  // Keyboard drop-downs (TypePick): job number, cost code (number only unless Show Descriptions), VAT, and the Unit box.
  const jobOpts: PickOpt[] = jobs.map((x) => ({ v: x.id, label: jobTag(x), short: x.job_number || x.name }));
  const lineJobOpts: PickOpt[] = [...jobOpts, { v: '__split', label: '⇄ Split this line across jobs…' }];
  const codeOptsK: PickOpt[] = codes.length ? codes.map((c) => ({ v: `cc:${c.id}`, label: `${c.code ? `${c.code} – ` : ''}${c.name}`, short: fullCodes ? `${c.code ? `${c.code} – ` : ''}${c.name}` : c.code || c.name }))
    : Object.entries(COST_CATS).filter(([k]) => k !== 'labour').map(([k, l]) => ({ v: k, label: l }));
  const vatOpts: PickOpt[] = vats.map((v) => ({ v: v.code, label: v.name, short: v.rc ? 'RC' : `${v.rate}%` }));
  const hasPlots = subs.length > 0; // the Plot column only shows for a project with plots
  const plotOpts: PickOpt[] = [{ v: '', label: 'Whole job', short: '—' }, ...subs.map((x) => ({ v: x.id, label: x.short }))];
  const W = { plot: 96, job: 84, qty: 64, unit: 64, rate: 84, disc: 60, code: fullCodes ? 210 : 78, vat: 66, net: 92, x: 20 };
  const ctr = { textAlign: 'center' as const };
  const headCell = (t: string, w: number | null, left = false) => <Text key={t || 'x'} style={[th, w ? { width: w } : { flex: 1, minWidth: 0 }, left ? null : ctr]}>{t}</Text>;
  const setJob = (i: number, v: string) => { set(i, { site_id: v }); if (!siteId) setSiteId(v); };
  const lineRow = (l: Line, i: number) => {
    const del = lines.length > 1 ? <Pressable accessibilityLabel="Remove line" hitSlop={8} onPress={() => setLines((ls) => ls.filter((_, j) => j !== i))} style={{ width: W.x, alignItems: 'center' }}><Text style={{ color: base.slate, fontSize: 15 }}>✕</Text></Pressable> : <View style={{ width: W.x }} />;
    const job = <View style={{ width: desk ? W.job : 110 }}>{l.alloc?.length
      ? <Pressable accessibilityRole="button" accessibilityLabel={`Line ${i + 1} split`} onPress={() => setOpenSplit(openSplit === i ? null : i)} style={[box, { paddingVertical: 6, borderColor: splitProblem(l.alloc) ? '#f8e7c2' : base.blue }]}><Text style={{ textAlign: 'center', color: splitProblem(l.alloc) ? '#b45309' : base.blue, fontSize: 13 }}>Split {l.alloc.length}</Text></Pressable>
      : split?.length ? <View style={[box, { paddingVertical: 6, backgroundColor: '#F6F7F9' }]}><Text style={{ textAlign: 'center', color: base.slate, fontSize: 13 }}>Split</Text></View>
      : <TypePick label={`Line ${i + 1} job`} value={l.site_id} options={lineJobOpts} onChange={(v) => { if (v === '__split') { set(i, { alloc: [{ site_id: l.site_id || site.id, pct: 50 }, { site_id: '', pct: 50 }] }); setOpenSplit(i); } else setJob(i, v); }} placeholder="Job" listWidth={300} style={[box, cell]} />}</View>;
    const onMain = !split?.length && !l.alloc?.length && (l.site_id || site.id) === site.id;
    const plot = !hasPlots ? null : <View style={{ width: desk ? W.plot : 110 }}>{onMain ? <TypePick label={`Line ${i + 1} plot`} value={l.sub || ''} options={plotOpts} onChange={(v) => set(i, { sub: v || undefined })} listWidth={240} style={[box, cell]} /> : <View style={[box, { paddingVertical: 6, backgroundColor: '#F6F7F9' }]}><Text style={{ textAlign: 'center', color: base.slate, fontSize: 13 }}>—</Text></View>}</View>;
    const desc = <TextInput accessibilityLabel={`Line ${i + 1} description`} value={l.description} onChangeText={(v) => set(i, { description: v })} placeholder="Description" style={[box, { flex: 1, minWidth: 0, paddingVertical: 5, fontSize: 13.5, textAlign: 'left' }]} />;
    const nums = (
      <>
        <TextInput accessibilityLabel="Qty" value={l.qty} onChangeText={(v) => set(i, { qty: v.replace(/[^0-9.]/g, '') })} placeholder="Qty" keyboardType="decimal-pad" style={[box, cell, { width: W.qty }]} />
        <View style={{ width: W.unit }}><UnitField value={l.unit} onChangeText={(v) => set(i, { unit: v })} units={DEFAULT_UNITS} style={[box, cell, { width: W.unit }]} /></View>
        <TextInput accessibilityLabel="Rate" value={l.rate} onChangeText={(v) => set(i, { rate: v.replace(/[^0-9.]/g, '') })} placeholder="0.000" keyboardType="decimal-pad" style={[box, cell, { width: W.rate }]} />
        <TextInput accessibilityLabel="Discount %" value={l.disc} onChangeText={(v) => set(i, { disc: v.replace(/[^0-9.]/g, '') })} placeholder="0" keyboardType="decimal-pad" style={[box, cell, { width: W.disc }]} />
        <View style={{ width: W.code }}><TypePick label={`Line ${i + 1} cost code`} value={codeVal(l)} options={codeOptsK} onChange={(v) => setCode(i, v)} listWidth={280} style={[box, cell]} /></View>
        <View style={{ width: W.vat }}><TypePick label={`Line ${i + 1} VAT`} value={l.vat} options={vatOpts} onChange={(v) => set(i, { vat: v })} listWidth={220} style={[box, cell]} /></View>
      </>
    );
    return desk ? (
      <View key={i} style={{ zIndex: lines.length - i }}>
      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 6 }}>
        {job}{plot}{desc}{nums}
        <Text style={{ width: W.net, textAlign: 'center', fontWeight: '600', color: base.ink, fontSize: 13.5 }}>{money(amt(l))}</Text>
        {del}
      </View>
      {openSplit === i && !!l.alloc?.length && splitRows(l.alloc, amt(l), (a) => { set(i, a ? { alloc: a } : { alloc: undefined, site_id: l.alloc?.[0]?.site_id || l.site_id }); if (!a) setOpenSplit(null); }, `Line ${i + 1} split across jobs`)}
      </View>
    ) : (
      <View key={i} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: base.line, paddingTop: i ? 8 : 0, marginBottom: 8, zIndex: lines.length - i }}>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>{job}{plot}{desc}{del}</View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6, alignItems: 'center' }}>{nums}<Text style={{ marginLeft: 'auto', fontWeight: '600', color: base.ink }}>{money(amt(l))}</Text></View>
        {openSplit === i && !!l.alloc?.length && splitRows(l.alloc, amt(l), (a) => { set(i, a ? { alloc: a } : { alloc: undefined, site_id: l.alloc?.[0]?.site_id || l.site_id }); if (!a) setOpenSplit(null); }, `Line ${i + 1} split across jobs`)}
      </View>
    );
  };
  // A split's rows: project, %, the £ it comes to; + Add Project, Split Evenly; must add up to 100%.
  const splitRows = (rows: Alloc[], amount: number, onRows: (a: Alloc[] | null) => void, what: string) => {
    const prob = splitProblem(rows);
    return (
      <View style={{ marginTop: 6, marginBottom: 8, padding: 10, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: '#cfd4da', backgroundColor: '#F7F8FA', gap: 6 }}>
        <Text style={th}>{what}</Text>
        {rows.map((x, j) => (
          <View key={j} style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            <View style={{ flex: 1, minWidth: 0 }}><TypePick label={`${what} row ${j + 1} project`} value={x.site_id} options={jobOpts} onChange={(v) => onRows(rows.map((y, i) => (i === j ? { ...y, site_id: v } : y)))} placeholder="Choose the project" listWidth={320} align="left" style={[box, { paddingVertical: 5, fontSize: 13.5 }]} /></View>
            <TextInput accessibilityLabel={`${what} row ${j + 1} percent`} keyboardType="decimal-pad" value={String(x.pct ?? '')} onChangeText={(t) => onRows(rows.map((y, i) => (i === j ? { ...y, pct: Number(t.replace(/[^0-9.]/g, '')) || 0 } : y)))} style={[box, cell, { width: 70 }]} />
            <Text style={{ color: base.slate }}>%</Text>
            <Text style={{ width: 92, textAlign: 'center', color: base.ink }}>{money(r2((amount * Number(x.pct || 0)) / 100))}</Text>
            <Pressable accessibilityLabel={`Remove ${what} row ${j + 1}`} onPress={() => { const n = rows.filter((_, i) => i !== j); onRows(n.length ? n : null); }} style={{ width: 20, alignItems: 'center' }}><Text style={{ color: base.slate }}>✕</Text></Pressable>
          </View>
        ))}
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: prob ? base.red : '#1E7A43' }}>{prob || 'Adds up to 100% ✓'}</Text>
          <Pressable onPress={() => onRows([...rows, { site_id: '', pct: 0 }])}><Text style={{ color: base.blue, fontSize: 12.5 }}>+ Add Project</Text></Pressable>
          <Pressable onPress={() => onRows(evenSplit(rows.map((r) => r.site_id)))}><Text style={{ color: base.blue, fontSize: 12.5 }}>Split Evenly</Text></Pressable>
          <Pressable onPress={() => onRows(null)}><Text style={{ color: base.slate, fontSize: 12.5 }}>Remove Split</Text></Pressable>
        </View>
      </View>
    );
  };
  const field = (label: string, child: ReactNode, flex: number | 'own' = 1) => <View style={flex === 'own' ? { marginBottom: 10 } : { flexGrow: flex, flexBasis: 200, minWidth: 180, marginBottom: 10 }}><Text style={{ fontSize: 12, fontWeight: '500', color: base.slate, marginBottom: 4 }}>{label}</Text>{child}</View>;
  const dateLabel = delivery === 'collection' ? 'Collection Date' : 'Delivery Date';

  return (
    <View>
      {/* Who and when on the left, the project quote on the right; then the lines full width; then how, below (Andy, 5 Nov 2026). */}
      <View style={desk ? { flexDirection: 'row', gap: 12, alignItems: 'stretch', marginBottom: 12 } : undefined}>
        <Card style={desk ? { flex: 1, minWidth: 0, marginBottom: 0 } : undefined}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}><SectionTitle>New Purchase Order</SectionTitle></View>
            {!showShop && !desk && <Pressable onPress={() => setShowShop(true)}><Text style={{ color: base.blue, fontSize: 13 }}>Show Project Quote</Text></Pressable>}
          </View>
          <SuggestField label="Supplier" value={supText} onChangeText={(t) => { setSupText(t); setSupId(null); }} placeholder="Type to find a supplier, or a new name" showAllOnFocus max={12}
            items={(setup?.sups || []).map((s) => ({ key: s.id, label: s.name, sub: s.email || '' }))} onPick={(s) => { setSupId(s.key); setSupText(s.label); applySupVat(s.key, s.label); }} />
          {isNew && <><Muted style={{ marginTop: -6, marginBottom: 6 }}>New supplier — added to your suppliers when the PO is raised.</Muted><TextInput value={newEmail} onChangeText={setNewEmail} placeholder="Supplier's orders email (optional)" autoCapitalize="none" keyboardType="email-address" style={[box, { marginBottom: 8 }]} /></>}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {field('Main Project', (
              <View style={{ flexDirection: 'row', gap: 6 }}>
              <Pressable accessibilityRole="button" accessibilityLabel="Project" onPress={async () => {
                const sid = await pickJob('Which project is the PO mainly for?', jobs); if (!sid) return;
                // Lines still on the old main project (or none) move with it; lines booked to other jobs stay.
                setLines((ls) => ls.map((l) => (!l.site_id || l.site_id === siteId ? { ...l, site_id: sid } : l))); setSiteId(sid); setLines((ls) => ls.map((l) => ({ ...l, sub: undefined })));
              }} style={[box, { flex: 1, minWidth: 0, height: 46, justifyContent: 'center', borderColor: site.id ? base.line : '#f8e7c2', backgroundColor: site.id ? base.card : '#fffaf0' }]}>
                <Text numberOfLines={1} style={{ color: site.id ? base.ink : '#b45309', fontSize: 14 }}>{site.id ? jobTag(site) : 'Choose the project'} ▾</Text>
              </Pressable>
              {/* ÷ Split Purchase: the whole order across several projects. */}
              <Pressable accessibilityRole="button" accessibilityLabel="Split Purchase" onPress={() => setSplit(split ? null : evenSplit([site.id || '', '']))} style={[box, { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderColor: split ? base.blue : base.line, backgroundColor: split ? '#EEF3FD' : base.card }]}>
                <Text style={{ color: split ? base.blue : base.ink, fontSize: 20, lineHeight: 22 }}>÷</Text>
              </Pressable>
              </View>
            ), 2)}
          </View>
          {!!split && splitRows(split, net, setSplit, 'Split Purchase — the whole order across these projects')}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {field('Delivery Or Collection', <SelectBox value={delivery} options={[['delivery', 'Deliver To Site'], ['collection', 'Collection']]} onChange={setDelivery} style={{ marginBottom: 0 }} />)}
            {field(dateLabel, <DateBox value={req} onChange={setReq} min={todayIso()} title={dateLabel} />)}
          </View>
          {field('Reference', <TextInput accessibilityLabel="Reference" value={ref} onChangeText={setRef} placeholder="e.g. Quote Q-5521 (filled in from a project quote)" style={box} />, 'own')}
        </Card>
        {side}
      </View>
      {!desk && showShop && <Pressable onPress={() => setShowShop(false)} style={{ marginBottom: 8 }}><Text style={{ color: base.blue, fontSize: 13 }}>Hide The Project Quote</Text></Pressable>}
      <Card style={{ zIndex: 5 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 8 }}>
          <View style={{ flex: 1 }}><SectionTitle>Lines</SectionTitle></View>
          {codes.length > 0 && <Pressable onPress={() => setFullCodes(!fullCodes)}><Text style={{ color: base.blue, fontSize: 12.5 }}>{fullCodes ? 'Codes Only' : 'Show Code Descriptions'}</Text></Pressable>}
          <View style={{ width: 200 }}><SelectBox value={lines[0]?.vat || vat0} title="VAT for all lines" options={vats.map((v) => [v.code, v.name] as [string, string])} onChange={(k) => setLines((ls) => ls.map((l) => ({ ...l, vat: k })))} style={{ marginBottom: 0 }} /></View>
        </View>
        {desk && (
          <View style={{ flexDirection: 'row', gap: 6, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: base.line, marginBottom: 6 }}>
            {headCell('Job', W.job)}{hasPlots && headCell('Plot', W.plot)}{headCell('Description', null, true)}{headCell('Qty', W.qty)}{headCell('Unit', W.unit)}{headCell('Rate £', W.rate)}{headCell('Disc %', W.disc)}{headCell('Cost Code', W.code)}{headCell('VAT', W.vat)}{headCell('Net', W.net)}{headCell('', W.x)}
          </View>
        )}
        {lines.map(lineRow)}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 4 }}>
          <Button small kind="ghost" title="+ Add Line" onPress={() => setLines((ls) => [...ls, blank(ls[ls.length - 1]?.vat || vat0, site.id || ls[ls.length - 1]?.site_id || '')])} />
          <View style={{ marginLeft: 'auto', alignItems: 'flex-end', gap: 2 }}>
            <Text style={{ color: base.slate }}>Subtotal {money(net)}</Text>
            {tots.byVat.map((b) => <Text key={b.code} style={{ color: base.slate }}>{b.name} on {money(b.net)}: {money(b.vat)}</Text>)}
            {tots.byVat.length > 1 && <Text style={{ color: base.slate }}>VAT {money(vat)}</Text>}
            <Text style={{ fontWeight: '600', color: base.ink, fontSize: 16 }}>Total {money(r2(net + vat))}</Text>
          </View>
        </View>
      </Card>
      <Card>
        <SectionTitle>{delivery === 'collection' ? 'Collection' : 'Delivery'}</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {field('Site Contact', <SuggestField label="" value={contact} onChangeText={setContact} placeholder="Start typing a name" showAllOnFocus max={12} items={(team || []).map((p) => ({ key: p.id, label: p.name, sub: p.phone || '' }))} onPick={(s) => { setContact(s.label); const ph = team?.find((p) => p.id === s.key)?.phone; if (ph) setContactPh(ph); }} />)}
          {field('Contact Number', <TextInput accessibilityLabel="Contact number" value={contactPh} onChangeText={setContactPh} keyboardType="phone-pad" placeholder="Contact number" style={box} />)}
        </View>
        {delivery === 'delivery' && (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {field('Deliver To', <SelectBox value={deliverTo} options={[['job', `Job Address · ${jobAddr || 'not set on the project'}`], ['office', `Office · ${officeAddr || 'set it in Finance › Settings'}`], ['other', '✏️ Type An Address…']]} onChange={(k) => setDeliverTo(k as 'job')} style={{ marginBottom: 0 }} />, 2)}
              {field('Delivery Time', <SelectBox value={delTime} options={TIMES} onChange={setDelTime} style={{ marginBottom: 0 }} />)}
            </View>
            {deliverTo === 'other' && <TextInput accessibilityLabel="Delivery address" value={addrTyped} onChangeText={setAddrTyped} placeholder="Delivery address" multiline style={[box, { marginBottom: 10, minHeight: 44 }]} />}
            <Text style={{ fontSize: 12, fontWeight: '500', color: base.slate, marginBottom: 4 }}>Delivery Requirements</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {OFFLOAD.map((o) => { const on = offload.includes(o); return (
                <Pressable key={o} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => setOffload(on ? offload.filter((x) => x !== o) : [...offload, o])} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: on ? '#1E7A43' : base.line, backgroundColor: on ? '#E7F6EC' : base.card }}>
                  <Text style={{ fontSize: 12.5, fontWeight: '600', color: on ? '#1E7A43' : base.ink }}>{on ? '✓ ' : ''}{o}</Text>
                </Pressable>
              ); })}
            </View>
          </>
        )}
        {field('Notes For The Supplier', <TextInput value={note} onChangeText={setNote} placeholder="e.g. narrow access, max 7.5t" multiline style={[box, { minHeight: 52 }]} />, 'own')}
      </Card>
      {!!saved && <Text style={{ color: statusNow === 'open' ? '#1E7A43' : base.slate, marginBottom: 8 }}>{statusNow === 'open' ? `✓ PO ${saved.number} raised.` : `Draft ${saved.number} saved — not raised yet.`} Changes here save to the same PO.</Text>}
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <Button small kind="ghost" title="Cancel" onPress={() => router.back()} />
        <Button small kind="ghost" title={pdfUrl && viewedKey !== nowKey ? '↻ Update & View' : '👁 View PO'} onPress={() => void viewPo()} />
        {statusNow === 'open' ? (
          <>
            <Button small kind="ghost" busy={busy} title="Save Changes" onPress={async () => { const row = await persist('open'); if (row) toast('Saved', { confirm: true }); }} />
            <Button small kind="ghost" title="⬇ Export PDF" onPress={async () => { const row = await persist('open'); if (row) void exportPdf(row); }} />
            <Button small title="✉ Email PO" onPress={async () => { const row = await persist('open'); if (row) void openEmail(row); }} />
          </>
        ) : (
          <>
            <Button small kind="ghost" busy={busy} title="Save Draft" onPress={() => void saveDraft()} />
            <Button small busy={busy} title="Raise PO" onPress={() => void raise()} />
          </>
        )}
      </View>
      {mailRow && (
        <FinEmailPopup kind="po" title={`Email PO ${mailRow.row.number}`} to={mailRow.to} note="The PO PDF goes with it."
          vars={{ number: String(mailRow.row.number || ''), project: allSites.find((x) => x.id === mailRow.row.site_id)?.name || '', job_no: allSites.find((x) => x.id === mailRow.row.site_id)?.job_number || '', supplier: mailRow.row.supplier_name || '', amount: money(mailRow.row.total ?? mailRow.row.value), required_by: mailRow.row.required_by ? mailRow.row.required_by.split('-').reverse().join('/') : '' }}
          onSend={async (o) => { const e = await emailPo(me, mailRow.row, await pdfOf(mailRow.row), o); if (e) return e; toast(`PO emailed to ${o.to.join(', ')}`); return null; }}
          onClose={() => setMailRow(null)} />
      )}
    </View>
  );
}
