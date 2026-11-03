// An application for payment (902 renderFinApplication + 903 certificate).
// "new" starts one from the Bill of Quantities. Draft: % (or £) done per line,
// set a whole section, variations and day works, discount and retention.
// Applied: locked. Then enter the client's certificate (or pay-less notice)
// and raise the invoice from it. Emailing it is off during the Finance trial.
import * as DocumentPicker from 'expo-document-picker';
import { pdfLines } from '@/lib/pdfjs';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { cloneElement, isValidElement, useEffect, useRef, useState, type ComponentRef, type ReactElement, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { ThinExportBar } from '@/components/FinFilterBar';
import { OphIcon } from '@/components/OphIcon';
import { SelectBox } from '@/components/SelectBox';
import { chooseAction, confirmAsk, showAlert, useToast } from '@/components/toast';
import { FinEmailPopup } from '@/components/FinEmailPopup';
import { FinForm } from '@/components/FinForm';
import { Button, Card, Check, Muted } from '@/components/ui';
import { viewDoc } from '@/components/DocViewer';
import { askAppSow } from '@/components/FinRowMenu';
import { DateBox } from '@/components/DateField';
import { addBoqLines, addBoqSection, clearCertificate, emailApplication, deleteApplication, deleteApplicationAny, exportApplication, loadApplication, newApplication, raiseInvoiceFromCert, saveApplication, saveCertificate, setStatus } from '@/data/finApp';
import { useFinSettings } from '@/data/finance';
import { openDocLink } from '@/data/hs';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { plainGet, plainSet } from '@/lib/kv';
import { useFlushOnLeave } from '@/lib/useFlushOnLeave';
import { APP_STAGE, appCalc, appFigures, groupTotals, isItem, pct } from '@/lib/rules/finApp';
import { applyAppUpload, certFromItems, parseAppBook, type AppXlItem } from '@/lib/rules/finAppExcel';
import { readXlsx } from '@/lib/rules/xlsxRead';
import { fdate, money, num, round2, today } from '@/lib/rules/finance';
import { base, page, radius, space, useDesk, useTheme } from '@/theme/theme';

type Row = Record<string, any>;
/** Picks an Excel file and reads it as an OpHUB application workbook (null = cancelled or not one; told why). */
async function pickAppExcel(toast: (m: string) => void): Promise<AppXlItem[] | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true }); if (r.canceled || !r.assets[0]) return null;
  const f = r.assets[0];
  if (/\.xls$/i.test(f.name || '')) { toast('Save it as .xlsx first — old .xls files can’t be read.'); return null; }
  const book = await readXlsx(new Uint8Array(await (await fetch(f.uri)).arrayBuffer())).catch(() => null);
  if (!book) { toast('Could not read that file.'); return null; }
  const items = parseAppBook(book);
  if (!items) toast('That doesn’t look like this application’s Excel — download it from OpHUB, send it to the client and upload their copy.');
  return items;
}
const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 7, color: base.ink, backgroundColor: base.card };
const STAGE: Record<string, string> = { draft: 'Draft', applied: 'Applied — Waiting For Certificate', certified: 'Certified', invoiced: 'Invoiced', void: 'Void' };

// Which view each application was last on, so marking one as applied from Line by line stays there.
const lastView = new Map<string, 'overview' | 'lines'>();

export default function FinApplication() {
  const { id, app } = useLocalSearchParams<{ id: string; app: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const started = useRef(false);
  useEffect(() => {
    if (app !== 'new' || started.current || !me) return;
    started.current = true;
    void newApplication(me, id).then((r) => { if (r.id) router.replace(`/fin/job/${id}/application/${r.id}` as never); else { toast(r.error || 'Could not start.'); if (r.error?.startsWith('Set up')) router.replace(`/fin/job/${id}/boq` as never); } });
  }, [app, me, id, toast]);
  const { data, isLoading } = useQuery({ queryKey: ['finApp', app], enabled: app !== 'new', gcTime: 0, refetchOnWindowFocus: false, queryFn: () => loadApplication(app) });
  if (app === 'new' || isLoading) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  if (!data) return <Muted style={{ padding: space.l }}>Application not found.</Muted>;
  return <Editor key={`${(data.a as Row).id}${data.a.status}${(data.a as Row).cert_net ?? ''}`} a0={data.a} jf={data.jf} prior={data.prior} previousLive={data.previousLive} prevPct={data.prevPct} prevVar={data.prevVar} siteProgress={data.siteProgress} varProgress={data.varProgress} />;
}

function Editor({ a0, jf, prior, previousLive, prevPct, prevVar, siteProgress, varProgress }: { a0: Row; jf: Row; prior: Row | null; previousLive: number; prevPct: Record<string, number>; prevVar: Record<string, number>; siteProgress: Record<string, number>; varProgress: Record<string, number> }) {
  const desk = useDesk(), t = useTheme();
  // Overview first, then line by line (Andy, 2 Nov 2026).
  const [view, setViewNow] = useState<'overview' | 'lines'>(lastView.get(a0.id) || 'overview');
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const setView = (x: 'overview' | 'lines') => { lastView.set(a0.id, x); setViewNow(x); scroller.current?.scrollTo({ y: 0, animated: false }); };
  const [mailing, setMailing] = useState(false);
  // An applied application stays as an application until Certify is pressed.
  const [certifying, setCertifying] = useState(false);
  const [over, setOver] = useState<Record<string, Entry>>({}); // single lines switched away from the page's choice
  const { me, org } = useAuth();
  const { data: site } = useSite(a0.site_id);
  const { data: finSt } = useFinSettings(me?.org_id);
  const toast = useToast();
  const qc = useQueryClient();
  const [a, setA] = useState<Row>(() => JSON.parse(JSON.stringify(a0)));
  const [mode, setModeNow] = useState<Entry>('pct');
  const setMode = (m: Entry) => { setModeNow(m); setOver({}); };
  const flip = (k: string) => (m: Entry) => setOver((o) => ({ ...o, [k]: m }));
  const [hideZero, setHideZero] = useState(false);
  const [busy, setBusy] = useState('');
  const [adding, setAdding] = useState<'line' | 'section' | null>(null);
  // Bumped when a button changes many lines at once, so the % / £ boxes show the new figures.
  const [gen, setGen] = useState(0); // a new Bill of Quantities line / header (9219n)
  // Autosave (9219ze): a copy on this device after every change, saved to the server two seconds after
  // typing stops and when you leave; an unsaved copy left on the device is brought back when it's newer.
  const KEY = `finAppDraft:${a0.id}`, isDraft = APP_STAGE(a0) === 'draft';
  const savedSnap = useRef(JSON.stringify(a0));
  const [autoNote, setAutoNote] = useState('');
  const autoSave = useRef<(() => Promise<unknown>) | null>(null);
  useFlushOnLeave(autoSave);
  const cert = useCert(a0, jf, previousLive, prevPct, prevVar);
  const retryT = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const on = () => { void autoSave.current?.(); };
    if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('online', on);
    return () => { if (retryT.current) clearTimeout(retryT.current); if (typeof window !== 'undefined' && window.removeEventListener) window.removeEventListener('online', on); };
  }, []);
  useEffect(() => {
    if (!isDraft) return;
    void plainGet<{ at: string; a: Row } | null>(KEY, null).then((c) => {
      if (c?.a && (!a0.updated_at || c.at > String(a0.updated_at)) && JSON.stringify(c.a) !== savedSnap.current) { setA(c.a); toast('Your unsaved changes were brought back from this device.'); }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const now = JSON.stringify(a);
    if (!isDraft || now === savedSnap.current) return;
    void plainSet(KEY, { at: new Date().toISOString(), a });
    setAutoNote('Saving…');
    if (retryT.current) clearTimeout(retryT.current);
    const run = async () => {
      if (JSON.stringify(a) === savedSnap.current) return;
      const ok = await saveApplication(a, jf, previousLive);
      if (ok) { savedSnap.current = now; void plainSet(KEY, null); setAutoNote('All changes saved'); } else { setAutoNote('No signal — saved on this device, will send when back'); retryT.current = setTimeout(() => { void autoSave.current?.(); }, 15000); }
    };
    autoSave.current = run;
    const t = setTimeout(() => { void run(); }, 2000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a]);
  if (!me) return null;
  const stage = APP_STAGE(a0), locked = stage !== 'draft', certing = stage === 'applied' && certifying, certDone = stage === 'certified' || stage === 'invoiced';
  const previous = locked ? Number(a0.previous || 0) : previousLive;
  const c = appCalc(a, jf.contract_value, jf.retention_limit_pct, previous);
  const tots = groupTotals(c.lines, (l) => l.value, (l) => l.gross);
  const refresh = () => { ['finApp', 'finSales', 'finBook', 'finOverview'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] })); };
  const setLine = (i: number, patch: Row) => setA({ ...a, lines: a.lines.map((l: Row, j: number) => (j === i ? { ...l, ...patch } : l)) });
  // A variation can be more than one: value = quantity × the figure each (Andy, 2 Nov 2026). The value stays what every sum uses.
  const setVar = (i: number, patch: Row) => setA({ ...a, variations: a.variations.map((y: Row, j: number) => { if (j !== i) return y; const z = { ...y, ...patch }; if ('qty' in patch || 'rate' in patch) { const q = num(z.qty), r = num(z.rate ?? y.value); z.value = r === null || isNaN(r) ? null : round2((q === null || isNaN(q) ? 1 : q) * r); } return z; }) });
  const fill = (i: number, p: number) => { const lv = a.lines[i].kind, ls = a.lines.slice(); for (let j = i + 1; j < ls.length; j++) { const k = ls[j].kind; if (k === 'section' || (lv === 'subsection' && k === 'subsection')) break; if (isItem(ls[j])) ls[j] = { ...ls[j], pct: p }; } setA({ ...a, lines: ls }); setGen((g) => g + 1); };
  // direct: the Export Excel button downloads straight away; the footer still asks Download or OneDrive (Andy, 3 Nov 2026).
  const exportAs = async (kind: 'xlsx' | 'pdf', direct = false) => {
    if (!me) return;
    if (isDraft && !(await save(true))) return;
    // Proof of works (9219zo): ask whether to include the Schedule of Works report.
    const doc = isDraft ? { ...a0, ...a } : a0;
    const sow = await askAppSow(doc, kind); if (sow === undefined) return;
    setBusy(kind);
    const ok = await exportApplication(me, org, doc, kind, sow, direct).catch(() => false);
    setBusy(''); if (!ok) toast(kind === 'pdf' ? 'Could not make the PDF — try again.' : 'Could not make the Excel — try again.');
  };
  // A valued copy back (9219p uploadFinAppExcel): the Applied % column updates this draft; new rows become
  // new variation / day-work rows or new Bill of Quantities lines under their header.
  const uploadExcel = async () => {
    if (!me) return;
    const items = await pickAppExcel(toast); if (!items) return;
    setBusy('up');
    try {
      const up = applyAppUpload(a, items);
      const next = up.a; let added = up.added;
      if (up.newLines.length) {
        const made = await addBoqLines(me, a0.site_id, up.newLines);
        (made || []).forEach(({ under, line }) => {
          const L: Row[] = next.lines, hi = under ? L.findIndex((l) => l.item_id === under) : -1;
          let at = L.length;
          if (hi >= 0) { at = hi + 1; while (at < L.length && L[at].kind !== 'section' && !(L[hi].kind === 'subsection' && L[at].kind === 'subsection')) at++; }
          L.splice(at, 0, line); added++;
        });
        if (!made) toast('Could not add the new lines to the Bill of Quantities.');
      }
      setA(next); setGen((g) => g + 1);
      toast((up.changed || added ? `Updated from Excel: ${up.changed} change${up.changed === 1 ? '' : 's'}${added ? `, ${added} new line${added === 1 ? '' : 's'}` : ''}` : 'No changes found in that file') + (up.skipped ? ` (${up.skipped} new line${up.skipped === 1 ? ' was' : 's were'} already there, so not added again)` : ''));
    } finally { setBusy(''); }
  };
  const save = async (quiet?: boolean) => { setBusy('save'); const ok = await saveApplication(a, jf, previous); setBusy(''); if (ok) { savedSnap.current = JSON.stringify(a); void plainSet(KEY, null); } if (!quiet) toast(ok ? 'Application saved' : 'Could not save — try again.'); refresh(); return ok; };
  // Any stage (9219q finRowDelApp): not with an invoice, and only the latest one.
  const deleteAny = async () => {
    if (!(await confirmAsk(`Delete application No. ${a0.number}?${a0.cert_net != null ? '\n\nIt has a certificate — that will be deleted too.' : ''}\n\nThis can’t be undone.`, 'Delete'))) return;
    const e = await deleteApplicationAny(a0); if (e) { showAlert(e); return; }
    toast('Application deleted'); refresh(); router.back();
  };
  const contractTotal = c.lines.filter(isItem).reduce((n: number, l: Row) => n + Number(l.value || 0), 0);
  // The client's figures: as entered while waiting for the certificate, then as saved.
  const certPrev = stage === 'applied' ? num(cert.v.cert_previous) || 0 : Number(a0.cert_previous || 0);
  const certCalc = certing ? appCalc(cert.certApp(), jf.contract_value, jf.retention_limit_pct, certPrev) : null;
  const certFig = certCalc ? figs(certCalc) : certDone ? appFigures(a0) : null;
  const gridCert = certFig && (stage !== 'applied' || certFig.gross) ? certFig : null;
  const certNet = certCalc ? certCalc.net_due : certDone ? Number(a0.cert_net || 0) : null;
  const dueNow = certNet != null ? certNet : c.net_due;
  // Laptop: below each section bar, a table with a column for each figure (Andy, 2 Nov 2026).
  const entryHead = (w: string) => `${w} ${mode === 'gbp' ? '£' : mode === 'qty' ? 'qty' : '%'}`;
  const cols = certing || certDone ? ['ref', 'desc', 'qty', 'unit', 'value', 'pct', 'gross', 'certBox', 'cert', 'prev', 'now'] : ['ref', 'desc', 'qty', 'unit', 'rate', 'value', stage === 'draft' ? 'box' : 'pct', 'gross', 'prev', 'now'];
  const gridHead = <LineRow head cols={cols} cells={{ ref: 'Ref', desc: 'Description', qty: 'Qty', unit: 'Unit', rate: 'Rate', value: 'Value', box: entryHead('Applied'), pct: 'Applied %', gross: certing || certDone ? 'Applied' : 'Cumulative', certBox: certing ? entryHead('Certified') : 'Certified %', cert: 'Certified', prev: 'Previous', now: 'Current' }} />;
  const varSite = (v: Row, i: number) => {
    const sp = varProgress[v.fin_variation_id || v.variation_id || ''];
    if (sp == null) return null;
    const can = !locked && sp !== pct(v.pct);
    return <Text onPress={can ? () => { const was = pct(v.pct), to = pct(sp); setA({ ...a, variations: a.variations.map((y: Row, j: number) => (j === i ? { ...y, pct: to } : y)) }); setGen((g) => g + 1); toast(`${v.description || 'Variation'}: ${was}% → ${to}% from site`); } : undefined} style={{ fontSize: 11.5, fontWeight: '500', color: sp > pct(v.pct) ? '#b45309' : base.slate }}>Site {sp}%{can ? <Text style={{ color: base.blue, fontWeight: '600', textDecorationLine: 'underline' }}> Use</Text> : null}</Text>;
  };
  return (
    <View style={{ flex: 1 }}>
    <ScrollView ref={scroller} style={{ flex: 1 }} contentContainerStyle={page(1100)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: `Application ${a0.number}` }} />
      {!!a0.retention_release && <Card style={{ backgroundColor: '#f1fbf5', borderColor: '#d3f0de' }}><Text style={{ color: base.ink }}><Text style={{ fontWeight: '600' }}>Retention release — {a0.retention_release === 1 ? 'first half (practical completion)' : 'final release'}.</Text> Retention on this application is {pct(a0.retention_pct)}%, so the client pays back {a0.retention_release === 1 ? 'half of what they hold' : 'what they still hold'} when they certify it.</Text></Card>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <Text style={{ fontSize: desk ? 20 : 17, fontWeight: '600', color: base.ink }}>Application No. {a0.number}</Text>
        <View style={{ backgroundColor: stage === 'draft' ? '#EEF0F3' : stage === 'applied' ? '#FFF4DF' : '#E3F5E9', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}><Text style={{ fontSize: 12.5, fontWeight: '500', color: stage === 'draft' ? base.slate : stage === 'applied' ? '#92580A' : '#1E7A3C' }}>{certing ? 'Entering The Certificate' : STAGE[stage]}</Text></View>
      </View>
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14, borderBottomWidth: 1, borderColor: base.cardLine }}>
        {([['overview', 'Overview'], ['lines', 'Line By Line']] as const).map(([k, l]) => (
          <Pressable key={k} accessibilityRole="button" onPress={() => setView(k)} style={{ paddingHorizontal: 12, paddingVertical: 8, marginBottom: -1, borderBottomWidth: 2, borderBottomColor: view === k ? t.brand1 : 'transparent' }}>
            <Text style={{ fontSize: 14, fontWeight: view === k ? '600' : '500', color: view === k ? base.ink : base.slate }}>{l}</Text>
          </Pressable>
        ))}
      </View>
      {view === 'overview' && (
        <View style={{ flexDirection: desk ? 'row' : 'column', alignItems: desk ? 'flex-start' : 'stretch', gap: 14 }}>
          <View style={desk ? { width: 340 } : undefined}>
            <Panel title="Application">
              <DetailRow l="Application No."><Val>{a0.number}</Val></DetailRow>
              <DetailRow l="Contract Works"><Val>{money(contractTotal)}</Val></DetailRow>
              {([['valuation_date', 'Valuation Date'], ['due_date', 'Due Date'], ['final_date', 'Final Date For Payment']] as const).map(([k, l]) => (
                <DetailRow key={k} l={l}>{locked ? <Val>{a[k] ? fdate(a[k]) : '—'}</Val> : <DateBox value={a[k] || ''} onChange={(x) => setA({ ...a, [k]: x })} title={l} style={{ width: 150, paddingVertical: 5 }} />}</DetailRow>
              ))}
              <DetailRow l={`Retention %${jf.retention_limit_pct ? ` (limit ${jf.retention_limit_pct}%)` : ''}`}>{locked ? <Val>{pct(a.retention_pct)}%</Val> : <TextInput accessibilityLabel="Retention percent" defaultValue={String(pct(a.retention_pct))} onChangeText={(x) => setA({ ...a, retention_pct: pct(x) })} keyboardType="decimal-pad" selectTextOnFocus style={[box, { width: 64, height: 30, paddingVertical: 2, textAlign: 'right' }]} />}</DetailRow>
              <DetailRow l="Discount %" last>{stage !== 'draft' ? <Val>{pct(a.discount_pct || 0)}%</Val> : <TextInput accessibilityLabel="Discount percent" defaultValue={String(pct(a.discount_pct || 0))} onChangeText={(x) => setA({ ...a, discount_pct: pct(x) })} keyboardType="decimal-pad" selectTextOnFocus style={[box, { width: 64, height: 30, paddingVertical: 2, textAlign: 'right' }]} />}</DetailRow>
            </Panel>
          </View>
          <View style={desk ? { flex: 1, minWidth: 0 } : undefined}>
            <Panel title="Valuation">
              <ValGrid desk={desk} heads={gridCert ? ['Applied To Date', 'Certified To Date', 'Previous', 'This Certificate'] : ['Applied To Date', 'Previous', 'This Application']} rows={(() => {
                const ap = figs(c), pr = appFigures(prior), mine = gridCert || ap, row = (l: string, k: keyof typeof ap, o?: Partial<GridRow>): GridRow => ({ l, v: gridCert ? [ap[k], gridCert[k], pr[k], round2(gridCert[k] - pr[k])] : [ap[k], pr[k], round2(ap[k] - pr[k])], ...o });
                const netTo = round2(mine.gross - mine.discount - mine.retention), prevNet = gridCert ? certPrev : c.previous, thisNet = round2(netTo - prevNet);
                const blank = (x: number): (number | null)[] => (gridCert ? [null, null, null, x] : [null, null, x]);
                const vt = jf.vat_treatment || finSt?.default_vat || 'standard', vat = vt === 'standard', rc = vt === 'reverse_charge';
                return [
                  row('Contract Works', 'contract'), row('Variations', 'variations'), row('Day Works', 'dayworks'), row('Subtotal', 'gross', { bold: true }),
                  row('Less Discount', 'discount', { neg: true }), row('Less Retention', 'retention', { neg: true }),
                  { l: 'Balance', bold: true, v: gridCert ? [round2(ap.gross - ap.discount - ap.retention), netTo, prevNet, thisNet] : [netTo, prevNet, thisNet] },
                  ...(vat ? [{ l: 'VAT @ 20%', v: blank(round2(thisNet * 0.2)) }] : rc ? [{ l: 'Reverse Charge VAT', v: blank(round2(thisNet * 0.2)) }] : []),
                  { l: 'Total Due', total: true, v: blank(vat ? round2(thisNet * 1.2) : thisNet) },
                ];
              })()} />
            </Panel>
            <Muted style={{ fontSize: 12, marginTop: -6, marginBottom: 12 }}>An application isn&apos;t a VAT invoice; the invoice follows the certificate.{(jf.vat_treatment || finSt?.default_vat) === 'reverse_charge' ? ' Reverse charge VAT is shown for the client to account for, and isn’t added to the total.' : ''}</Muted>
            {stage === 'applied' && !certing && (
              <>
                <ActionRow onDelete={deleteAny}>
                  <Button kind="ghost" title="Return To Draft" onPress={async () => { if (await confirmAsk('Return this application to draft so you can edit it?', 'Return to draft')) { if (await setStatus(a0.id, { status: 'draft' })) { toast('Back to draft — you can edit it now'); refresh(); } } }} />
                  <Button kind="ghost" busy={busy === 'cert'} title="Import Certificate" onPress={async () => { setBusy('cert'); try { if (await importCertificate(a0, cert, toast)) { setCertifying(true); setView('lines'); } } finally { setBusy(''); } }} />
                  <Button title="Certify" onPress={() => { setCertifying(true); setView('lines'); }} />
                </ActionRow>
                <View style={{ marginTop: 4 }}><Button kind="ghost" title="Email Application" onPress={() => setMailing(true)} /></View>
              </>
            )}
            {certing && (
              <Certificate a={a0} jf={jf} cert={cert} onSaved={refresh} actions={(saveBtn, raiseBtn) => (
                <ActionRow onDelete={deleteAny}>
                  <Button kind="ghost" title="Back To The Application" onPress={() => setCertifying(false)} />
                  {saveBtn}
                  {raiseBtn}
                </ActionRow>
              )} />
            )}
            {(stage === 'certified' || stage === 'invoiced') && (
              <Panel title={`${a0.cert_is_payless ? 'Pay-Less Notice' : 'Payment Certificate'} · ${fdate(a0.cert_date)}`}>
                <View style={{ padding: 12 }}>
                  <SumRow bold l="Net Due" v={money(a0.cert_net)} />
                  {round2(Number(a0.cert_net) - Number(a0.net_due)) !== 0 && <Text style={{ marginTop: 6, color: Number(a0.cert_net) < Number(a0.net_due) ? '#C0392B' : '#1E7A3C', fontWeight: '500' }}>{Number(a0.cert_net) < Number(a0.net_due) ? 'Short by' : 'Over by'} {money(Math.abs(Number(a0.cert_net) - Number(a0.net_due)))} compared with the {money(a0.net_due)} applied for.</Text>}
                  {a0.cert_notes ? <Muted style={{ marginTop: 6 }}>{a0.cert_notes}</Muted> : null}
                  {a0.cert_file_path && <Pressable onPress={async () => { const u = await openDocLink('finance-docs', a0.cert_file_path); if (u) viewDoc(u); }}><Text style={{ color: base.blue, marginTop: 6 }}>📄 Certificate</Text></Pressable>}
                  <ActionRow onDelete={a0.invoice_id ? undefined : deleteAny}>
                    {!a0.invoice_id && <Button kind="ghost" title="Change The Certificate" onPress={async () => { if (await confirmAsk('Clear the certificate figures and enter them again?', 'Clear')) { if (await clearCertificate(a0.id)) refresh(); else toast('Not saved — check your signal and try again.'); } }} />}
                    <Button kind="ghost" busy={busy === 'xlsx'} title="Export Excel" onPress={() => void exportAs('xlsx', true)} />
                    {a0.invoice_id ? <Button title="Open Invoice" onPress={() => router.push(`/fin/job/${a0.site_id}/invoice/${a0.invoice_id}` as never)} />
                      : <Button busy={busy === 'inv'} title="Raise Invoice" onPress={async () => { setBusy('inv'); const r = await raiseInvoiceFromCert(me, org, a0, site as never, false); setBusy(''); if (r.error) toast(r.error); if (r.id) { refresh(); router.push(`/fin/job/${a0.site_id}/invoice/${r.id}` as never); } }} />}
                  </ActionRow>
                </View>
              </Panel>
            )}
          </View>
        </View>
      )}
      {view === 'lines' && <>
      {!desk ? (
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10, alignItems: 'center' }}>
          <View style={{ flex: 1 }}><Button kind="ghost" busy={!!busy} title={certing ? 'Bulk Certify ▾' : stage === 'draft' ? 'Bulk Edit ▾' : `Options${hideZero ? ' · 0% Hidden' : ''} ▾`} onPress={async () => {
            // No Enter % / £ / qty on a phone: the % and qty boxes are both there to type in (Andy, 3 Nov 2026).
            const k = await chooseAction(certing ? 'Bulk Certify' : stage === 'draft' ? 'Bulk Edit' : 'Lines', [
              { key: 'zero', label: hideZero ? 'Show 0% lines' : 'Hide 0% lines' },
              ...(certing ? [{ key: 'applied', label: 'Fill in: certified as applied' }, { key: 'xl', label: 'Fill in: from the client’s Excel' }, { key: 'pdf', label: 'Fill in: from the client’s PDF' }] : []),
              ...(stage === 'draft' ? [{ key: 'all100', label: 'Set every line to 100%' }, { key: 'all0', label: 'Set every line to 0%' }, { key: 'up', label: 'Upload edited Excel' }] : []),
            ]);
            if (k === 'zero') setHideZero(!hideZero);
            else if (k === 'applied') cert.asApplied();
            else if (k === 'xl') { const items = await pickAppExcel(toast); if (items) certFromExcel(a0, cert, items, toast); }
            else if (k === 'pdf') { const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true }); if (!r.canceled && r.assets[0]) await certFromPdf(a0, cert, r.assets[0], toast); }
            else if (k === 'up') void uploadExcel();
            else if (k === 'all100' || k === 'all0') { const to = k === 'all100' ? 100 : 0; setA({ ...a, lines: (a.lines || []).map((l: Row) => (isItem(l) ? { ...l, pct: to } : l)), variations: (a.variations || []).map((x: Row) => ({ ...x, pct: to })) }); setGen((g) => g + 1); }
          }} /></View>
          {stage === 'applied' && !certing && <Button title="Certify" onPress={() => setCertifying(true)} />}
        </View>
      ) : (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8, alignItems: 'center' }}>
        {(stage === 'draft' || certing) && <SelectBox title="Enter Figures By" value={mode} options={[['pct', 'Enter %'], ['gbp', 'Enter £'], ['qty', 'Enter qty']]} onChange={(k) => setMode(k as Entry)} style={{ width: 130, marginBottom: 0 }} />}
        <Check label="Hide 0% Lines" value={hideZero} onChange={setHideZero} />
        {stage === 'draft' && <View style={{ marginLeft: 'auto' }}><Button small kind="ghost" busy={!!busy} title="Upload Edited Excel" onPress={() => void uploadExcel()} /></View>}
        {stage === 'applied' && !certing && <View style={{ marginLeft: 'auto' }}><Button title="Certify" onPress={() => setCertifying(true)} /></View>}
      </View>
      )}
      {certing && <CertTools a={a0} cert={cert} />}
      {!locked && (Object.keys(siteProgress).length > 0 || Object.keys(varProgress).length > 0) && (() => {
        // Site progress from the operatives' Schedule of Works (9219w): lists what would change, nothing moves unless you say.
        const ch: { what: string; from: number; to: number; i: number; isVar: boolean }[] = [];
        (a.lines || []).forEach((l: Row, i: number) => { if (isItem(l) && siteProgress[l.item_id] != null && siteProgress[l.item_id] > pct(l.pct)) ch.push({ what: l.description || 'Line', from: pct(l.pct), to: pct(siteProgress[l.item_id]), i, isVar: false }); });
        (a.variations || []).forEach((v: Row, i: number) => { const key = v.fin_variation_id || v.variation_id; if (key && varProgress[key] != null && varProgress[key] > pct(v.pct)) ch.push({ what: v.description || 'Line', from: pct(v.pct), to: pct(varProgress[key]), i, isVar: true }); });
        const ahead = ch.length;
        return (
          <Card style={{ backgroundColor: ahead ? '#fffaf0' : '#f1fbf5' }}>
            <Text style={{ color: base.ink }}>{ahead ? `Site progress is ahead on ${ahead} line${ahead === 1 ? '' : 's'} (from the operatives’ Schedule of Works).` : 'Matches site progress from the operatives’ Schedule of Works.'}</Text>
            {ahead > 0 && <View style={{ marginTop: 6 }}><Button kind="ghost" title="Use site progress" onPress={async () => {
              const list = ch.slice(0, 25).map((x) => `• ${x.what}: ${x.from}% → ${x.to}%`).join('\n') + (ahead > 25 ? `\n…and ${ahead - 25} more` : '');
              if (!(await confirmAsk(`Use site progress on ${ahead} line${ahead === 1 ? '' : 's'}?\n\n${list}\n\nLines where you've already put more than site are left alone. You can still change any of them before saving.`, 'Use site progress'))) return;
              const lines = (a.lines || []).map((l: Row, i: number) => { const x = ch.find((y) => !y.isVar && y.i === i); return x ? { ...l, pct: x.to } : l; });
              const variations = (a.variations || []).map((v: Row, i: number) => { const x = ch.find((y) => y.isVar && y.i === i); return x ? { ...v, pct: x.to } : v; });
              setA({ ...a, lines, variations }); setGen((g) => g + 1); toast(`${ahead} line${ahead === 1 ? '' : 's'} updated from site progress — check, then Save`);
            }} /></View>}
          </Card>
        );
      })()}
      {/* Each section in its own border with a bar above and below, as the Bill of Quantities (Andy, 2 Nov 2026). */}
      {(c.lines as Row[]).reduce<number[][]>((gs, l, i) => { if (l.kind === 'section' || !gs.length) gs.push([i]); else gs[gs.length - 1].push(i); return gs; }, []).map((g) => {
        const head = c.lines[g[0]] as Row, isSec = head.kind === 'section';
        const sum = (k: string) => round2(g.reduce((n, j) => n + (isItem(c.lines[j]) ? Number((c.lines[j] as Row)[k] || 0) : 0), 0));
        return (
      <SecBlock key={g[0]} title={isSec ? head.description : 'General'} refNo={isSec ? head.ref : ''} total={sum('gross')} of={sum('value')}
        tools={!locked && isSec ? <View style={{ flexDirection: 'row', gap: 6 }}><Button small kind="ghost" title="Set All To 100%" onPress={() => fill(g[0], 100)} /><Button small kind="ghost" title="Set All To 0%" onPress={() => fill(g[0], 0)} /></View> : undefined}>
      {desk ? gridHead : <FigHead />}
      {g.map((i) => {
        const l = c.lines[i] as Row;
        if (l.kind === 'section') return null;
        if (l.kind === 'subsection') {
          const t = tots[i];
          return (
            <View key={i} style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, backgroundColor: '#DFE3EA', paddingVertical: 7, paddingHorizontal: 12 }}>
              <Text style={{ flexGrow: 1, flexBasis: 170, flexShrink: 1, fontWeight: '600', color: base.ink, fontSize: desk ? 14 : 13 }}>{l.ref ? `${l.ref} ` : ''}{l.description}</Text>
              <Text style={{ fontWeight: '500', color: base.ink }}>{money(t?.gross || 0)} <Text style={{ color: base.slate, fontWeight: '400' }}>of {money(t?.value || 0)}</Text></Text>
            </View>
          );
        }
        if (hideZero && !pct(l.pct)) return null;
        const hasQty = l.qty != null && Number(l.qty) !== 0;
        const siteTag = <Text style={{ fontSize: 12 }}>{siteProgress[l.item_id] != null ? <Text style={{ color: siteProgress[l.item_id] > pct(l.pct) ? '#b45309' : base.slate, fontWeight: '500' }}>{`  · Site ${siteProgress[l.item_id]}%`}</Text> : null}{siteProgress[l.item_id] != null && !locked && siteProgress[l.item_id] !== pct(l.pct) ? <Text onPress={() => { const was = pct(l.pct), to = pct(siteProgress[l.item_id]); setLine(i, { pct: to }); setGen((g) => g + 1); toast(`${l.description}: ${was}% → ${to}% from site — check, then Save`); }} style={{ color: base.blue, fontWeight: '600', textDecorationLine: 'underline' }}> Use</Text> : null}{siteProgress[l.item_id] == null && Object.keys(siteProgress).length > 0 ? <Text style={{ fontWeight: '500', color: base.slate }}>  · Not on site schedule</Text> : null}</Text>;
        if (desk) {
          const val = Number(l.value || 0), prev = round2((val * (prevPct[l.item_id] || 0)) / 100), p0 = pct(cert.cp[`l${i}`]);
          const cl = certDone ? (a0.cert_lines || []).find((x: Row) => x.item_id === l.item_id) : null;
          const certG = certing ? round2((val * p0) / 100) : cl ? Number(cl.gross || 0) : null;
          return (
            <LineRow key={i} cols={cols} cells={{
              ref: l.ref || '', desc: <Text style={{ color: base.ink, fontSize: 14 }}>{l.description}{siteTag}</Text>,
              qty: hasQty ? String(l.qty) : '', unit: hasQty ? l.unit || '' : '', rate: hasQty ? money(l.rate) : '', value: money(l.value),
              box: <AmountBox key={`p${i}-${gen}`} p={pct(l.pct)} value={l.value} qty={l.qty} unit={l.unit} mode={over[l.item_id] || mode} onMode={flip(l.item_id)} labels={['Percent done', 'Amount done', 'Quantity done']} onPct={(x) => setLine(i, { pct: x })} />,
              pct: `${pct(l.pct)}%`, gross: <Strong>{money(l.gross)}</Strong>,
              certBox: certing ? <AmountBox p={p0} value={l.value} qty={l.qty} unit={l.unit} mode={over[l.item_id] || mode} onMode={flip(l.item_id)} labels={CERT_LABELS} onPct={(x) => cert.applyLines({ ...cert.cp, [`l${i}`]: String(x) })} /> : cl ? `${pct(cl.pct)}%` : '—',
              cert: certG == null ? '—' : <Strong warn={certing && p0 !== pct(l.pct)}>{money(certG)}</Strong>,
              prev: money(prev), now: certDone && !cl ? '—' : money(round2((certG ?? l.gross) - prev)),
            }} />
          );
        }
        return (
          // Phone (Andy, 3 Nov 2026): ref and description, then rows of unit, rate, %, qty and total — the contract, what went
          // before, applied and certified. % and qty can both be typed in and keep each other in step; £ goes in the total.
          (() => {
            const qd = (x: number) => (hasQty ? String(round2((x * Number(l.qty)) / 100)) : ''), unit = hasQty ? l.unit || '' : '', rate = hasQty ? money(l.rate) : '';
            const pv = prevPct[l.item_id] || 0, prev = round2((Number(l.value || 0) * pv) / 100);
            const boxes = (p0: number, labels: [string, string, string], onPct: (x: number) => void, k: string): Partial<Record<FigCol, ReactNode>> => ({
              pct: <AmountBox bare key={`${k}p`} p={p0} value={l.value} qty={l.qty} mode="pct" labels={labels} onPct={onPct} />,
              ...(hasQty ? { qty: <AmountBox bare key={`${k}q`} p={p0} value={l.value} qty={l.qty} mode="qty" labels={labels} onPct={onPct} /> } : {}),
              ...(mode === 'gbp' ? { total: <AmountBox bare key={`${k}g`} p={p0} value={l.value} mode="gbp" labels={labels} onPct={onPct} /> } : {}),
            });
            return (
          <View key={i} style={{ paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderColor: base.cardLine, gap: 5 }}>
            <Text style={{ color: base.ink, fontSize: 13, marginBottom: 1 }}>{l.ref ? <Text style={{ color: base.slate, fontSize: 11.5 }}>{`${l.ref}  `}</Text> : null}{l.description}{siteTag}</Text>
            <FigRow label="Contract" unit={unit} rate={rate} pct="100%" qty={hasQty ? String(l.qty) : ''} total={money(l.value)} plain bold />
            {pv > 0 && <FigRow label="Previous" unit={unit} rate={rate} pct={`${pct(pv)}%`} qty={qd(pv)} total={money(prev)} plain />}
            <FigRow label="Applied" unit={unit} rate={rate} pct={`${pct(l.pct)}%`} qty={qd(pct(l.pct))} total={money(l.gross)} inputs={locked ? undefined : boxes(pct(l.pct), ['Percent done', 'Amount done', 'Quantity done'], (x) => setLine(i, { pct: x }), `a${i}-${gen}`)} />
            {certing && (() => { const p0 = pct(cert.cp[`l${i}`]); return <FigRow label="Certified" unit={unit} rate={rate} pct={`${p0}%`} qty={qd(p0)} total={money(round2((Number(l.value || 0) * p0) / 100))} warn={p0 !== pct(l.pct)} inputs={boxes(p0, CERT_LABELS, (x) => cert.applyLines({ ...cert.cp, [`l${i}`]: String(x) }), `c${i}`)} />; })()}
            {certDone && (() => { const cl = (a0.cert_lines || []).find((x: Row) => x.item_id === l.item_id); return <FigRow label="Certified" unit={unit} rate={rate} pct={cl ? `${pct(cl.pct)}%` : '—'} qty={cl ? qd(pct(cl.pct)) : ''} total={cl ? money(cl.gross) : '—'} />; })()}
          </View>
            );
          })()
        );
      })}
      </SecBlock>
        );
      })}
      {!locked && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: desk ? 24 : 18 }}>
          <Button small kind="ghost" title="+ Add A Line" onPress={() => setAdding('line')} />
          <Button small kind="ghost" title="+ Add A Section" onPress={() => setAdding('section')} />
        </View>
      )}
      {adding && me && (
        <FinForm title={adding === 'line' ? 'Add A Line' : 'Add A Section'} onClose={() => setAdding(null)}
          note={adding === 'line' ? 'It goes into the Bill of Quantities too, so it carries on to later applications.' : 'A new header at the end of the Bill of Quantities.'}
          initial={{ under: '', pct: '0' }}
          fields={adding === 'line' ? [
            { k: 'under', label: 'Under', kind: 'choice', options: [['__new', 'New section…'], ['', 'At the end'], ...(a.lines || []).filter((l: Row) => !isItem(l)).map((l: Row) => [l.item_id, `${l.ref ? `${l.ref} ` : ''}${l.description}`] as [string, string])] },
            { k: 'ref', label: 'Ref', half: true }, { k: 'description', label: 'Description', half: true },
            { k: 'qty', label: 'Qty', kind: 'number', half: true }, { k: 'unit', label: 'Unit', half: true },
            { k: 'rate', label: 'Rate £', kind: 'money', half: true }, { k: 'value', label: 'Or a lump sum £', kind: 'money', half: true },
            { k: 'pct', label: 'Applied % this time', kind: 'number', half: true }, { k: 'cost', label: 'Cost rate £ (optional)', kind: 'money', half: true },
            { k: 'newHead', label: 'New section name (if New section…)', ph: 'e.g. Extras' },
          ] : [{ k: 'ref', label: 'Ref', half: true }, { k: 'description', label: 'Header', half: true }]}
          onSave={async (v) => {
            const desc = String(v.description ?? '').trim(); if (!desc) return adding === 'line' ? 'Enter the description.' : 'Enter the header.';
            const ref = String(v.ref ?? '').trim() || null;
            if (adding === 'section') {
              const line = await addBoqSection(me, a0.site_id, ref, desc); if (!line) return 'Could not save — try again.';
              setA({ ...a, lines: [...(a.lines || []), line] }); toast('Section added'); return null;
            }
            const n = (k: string) => { const x = num(v[k]); return x === null || isNaN(x) ? null : x; };
            const qty = n('qty'), rate = n('rate'), value = qty != null && rate != null ? round2(qty * rate) : n('value');
            if (value == null) return 'Enter qty × rate, or a lump sum.';
            let under = String(v.under || ''); let lines0: Row[] = a.lines || [];
            if (under === '__new') {
              const head = String(v.newHead ?? '').trim(); if (!head) return 'Enter the new section name.';
              const sec = await addBoqSection(me, a0.site_id, null, head); if (!sec) return 'Could not save — try again.';
              under = sec.item_id; lines0 = [...lines0, sec];
            }
            const costRate = n('cost');
            const made = await addBoqLines(me, a0.site_id, [{ under, ref, desc, qty, unit: String(v.unit ?? '').trim() || null, rate, value, pct: n('pct') || 0, cost: costRate != null ? round2(costRate * (qty ?? 1)) : null }]);
            if (!made?.length) return 'Could not save — try again.';
            const L: Row[] = [...lines0];
            made.forEach(({ under, line }) => {
              const hi = under ? L.findIndex((l) => l.item_id === under) : -1;
              let at = L.length;
              if (hi >= 0) { at = hi + 1; while (at < L.length && L[at].kind !== 'section' && !(L[hi].kind === 'subsection' && L[at].kind === 'subsection')) at++; }
              L.splice(at, 0, line);
            });
            setA({ ...a, lines: L }); toast('Line added'); return null;
          }} />
      )}
      {(c.variations.length > 0 || !locked) && <SecBlock title="Variations" total={round2(c.variations.reduce((n: number, v: Row) => n + Number(v.gross || 0), 0))} tools={!locked ? <Button small kind="ghost" title="+ Variation Line" onPress={() => setA({ ...a, variations: [...(a.variations || []), { variation_id: null, description: '', value: null, pct: 100 }] })} /> : undefined}>
      {desk ? gridHead : <FigHead />}
      {c.variations.map((v: Row, i: number) => desk ? (() => {
        const val = Number(v.value || 0), prev = round2((val * (prevVar[v.fin_variation_id || v.variation_id || ''] || 0)) / 100), cp0 = pct(cert.cp[`v${i}`]);
        const cl = certDone ? (a0.cert_lines || []).find((x: Row) => x.var_index === i) : null;
        const certG = certing ? round2((val * cp0) / 100) : cl ? Number(cl.gross || 0) : null;
        const inp = { width: '100%' as const, height: 30, paddingVertical: 2, fontSize: 13 };
        return (
          <LineRow key={i} cols={cols} cells={{
            ref: '', desc: locked ? <Text style={{ color: base.ink, fontSize: 14 }}>{v.description} {varSite(v, i)}</Text> : <View style={{ width: '100%', flexDirection: 'row', alignItems: 'center', gap: 6 }}><TextInput value={v.description} onChangeText={(x) => setA({ ...a, variations: a.variations.map((y: Row, j: number) => (j === i ? { ...y, description: x } : y)) })} placeholder="Description" style={[box, { flex: 1, minWidth: 0, height: 30, paddingVertical: 2, fontSize: 13 }]} />{varSite(v, i)}</View>,
            qty: locked ? (v.qty != null ? String(v.qty) : '1') : <TextInput accessibilityLabel="Variation quantity" defaultValue={v.qty != null ? String(v.qty) : '1'} onChangeText={(x) => setVar(i, { qty: x })} keyboardType="decimal-pad" selectTextOnFocus style={[box, inp]} />,
            unit: '', rate: locked ? money(v.rate ?? v.value) : <TextInput defaultValue={v.rate != null ? String(v.rate) : v.value != null ? String(v.value) : ''} onChangeText={(x) => setVar(i, { rate: x })} placeholder="£ value" keyboardType="decimal-pad" selectTextOnFocus style={[box, inp]} />,
            value: money(v.value),
            box: <AmountBox key={`vp${i}-${gen}`} p={pct(v.pct)} value={v.value} mode={mode === 'gbp' ? 'gbp' : 'pct'} labels={['Percent done', 'Amount done', 'Quantity done']} onPct={(x) => setA({ ...a, variations: a.variations.map((y: Row, j: number) => (j === i ? { ...y, pct: x } : y)) })} />,
            pct: `${pct(v.pct)}%`, gross: <Strong>{money(v.gross)}</Strong>,
            certBox: certing ? <AmountBox p={cp0} value={v.value} qty={Number(v.qty) > 1 ? v.qty : null} mode={over[`v${i}`] || mode} onMode={flip(`v${i}`)} labels={CERT_LABELS} onPct={(x) => cert.applyLines({ ...cert.cp, [`v${i}`]: String(x) })} /> : cl && val ? `${pct((Number(cl.gross || 0) / val) * 100)}%` : '—',
            cert: certG == null ? '—' : <Strong warn={certing && cp0 !== pct(v.pct)}>{money(certG)}</Strong>,
            prev: money(prev), now: certDone && !cl ? '—' : money(round2((certG ?? v.gross) - prev)),
          }} />
        );
      })() : (() => {
        const vq = Number(v.qty) > 1 ? Number(v.qty) : 1, rate = money(v.rate ?? v.value), qd = (x: number) => String(round2((x * vq) / 100));
        const pv = prevVar[v.fin_variation_id || v.variation_id || ''] || 0;
        const boxes = (p0: number, labels: [string, string, string], onPct: (x: number) => void, k: string): Partial<Record<FigCol, ReactNode>> => ({
          pct: <AmountBox bare key={`${k}p`} p={p0} value={v.value} qty={vq} mode="pct" labels={labels} onPct={onPct} />,
          ...(vq > 1 ? { qty: <AmountBox bare key={`${k}q`} p={p0} value={v.value} qty={vq} mode="qty" labels={labels} onPct={onPct} /> } : {}),
          ...(mode === 'gbp' ? { total: <AmountBox bare key={`${k}g`} p={p0} value={v.value} mode="gbp" labels={labels} onPct={onPct} /> } : {}),
        });
        return (
        <View key={i} style={{ paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderColor: base.cardLine, gap: 5 }}>
          {locked ? <Text style={{ color: base.ink, fontSize: 13, marginBottom: 1 }}>{v.description} {varSite(v, i)}</Text> : (
            <>
              <TapEdit value={v.description || ''} onChange={(x) => setA({ ...a, variations: a.variations.map((y: Row, j: number) => (j === i ? { ...y, description: x } : y)) })} />
              {varSite(v, i)}
            </>
          )}
          <FigRow label="Contract" rate={rate} pct="100%" qty={String(vq)} total={money(v.value)} plain bold inputs={locked ? undefined : {
            qty: <TapNum label="Variation quantity" value={v.qty != null ? String(v.qty) : '1'} onChange={(x) => setVar(i, { qty: x })} />,
            rate: <TapNum label="Variation rate" value={v.rate != null ? String(v.rate) : v.value != null ? String(v.value) : ''} show={rate} onChange={(x) => setVar(i, { rate: x })} wide />,
          }} />
          {pv > 0 && <FigRow label="Previous" rate={rate} pct={`${pct(pv)}%`} qty={qd(pv)} total={money(round2((Number(v.value || 0) * pv) / 100))} plain />}
          <FigRow label="Applied" rate={rate} pct={`${pct(v.pct)}%`} qty={qd(pct(v.pct))} total={money(v.gross)} inputs={locked ? undefined : boxes(pct(v.pct), ['Percent done', 'Amount done', 'Quantity done'], (x) => setA({ ...a, variations: a.variations.map((y: Row, j: number) => (j === i ? { ...y, pct: x } : y)) }), `va${i}-${gen}`)} />
          {certing && <FigRow label="Certified" rate={rate} pct={`${pct(cert.cp[`v${i}`])}%`} qty={qd(pct(cert.cp[`v${i}`]))} total={money(round2((Number(v.value || 0) * pct(cert.cp[`v${i}`])) / 100))} warn={pct(cert.cp[`v${i}`]) !== pct(v.pct)} inputs={boxes(pct(cert.cp[`v${i}`]), CERT_LABELS, (x) => cert.applyLines({ ...cert.cp, [`v${i}`]: String(x) }), `vc${i}`)} />}
          {certDone && (() => { const cl = (a0.cert_lines || []).find((x: Row) => x.var_index === i), cp1 = cl && Number(v.value) ? pct((Number(cl.gross) / Number(v.value)) * 100) : null; return <FigRow label="Certified" rate={rate} pct={cp1 != null ? `${cp1}%` : '—'} qty={cp1 != null ? qd(cp1) : ''} total={cl ? money(cl.gross) : '—'} />; })()}
        </View>
        );
      })())}
      </SecBlock>}
      {/* 902: typed day works can be added and changed on a draft; ones from the Day works register stay as they are. */}
      {(c.dayworks.length > 0 || !locked) && <SecBlock title="Day Works" total={round2(c.dayworks.reduce((n: number, d: Row) => n + Number(d.gross || 0), 0))} tools={!locked ? <Button small kind="ghost" title="+ Add Day Work" onPress={() => setA({ ...a, dayworks: [...(a.dayworks || []), { description: '', value: null }] })} /> : undefined}>
      {desk ? gridHead : <FigHead />}
      {c.dayworks.map((d: Row, i: number) => desk ? (() => {
        const typed = !locked && !d.fin_daywork_id;
        const cl = certDone ? (a0.cert_lines || []).find((x: Row) => x.day_index === i) : null;
        const certG = certing ? num(cert.cp[`d${i}`]) || 0 : cl ? Number(cl.gross || 0) : null;
        return (
          <LineRow key={i} cols={cols} cells={{
            ref: '', desc: typed ? <TextInput value={d.description || ''} onChangeText={(x) => setA({ ...a, dayworks: a.dayworks.map((y: Row, j: number) => (j === i ? { ...y, description: x } : y)) })} placeholder="Description" style={[box, { width: '100%', height: 30, paddingVertical: 2, fontSize: 13 }]} /> : <Text style={{ color: base.ink, fontSize: 14 }}>{d.description}</Text>,
            qty: '', unit: '', rate: '', value: typed ? <TextInput defaultValue={d.value != null ? String(d.value) : ''} onChangeText={(x) => setA({ ...a, dayworks: a.dayworks.map((y: Row, j: number) => (j === i ? { ...y, value: num(x) } : y)) })} placeholder="£ value" keyboardType="decimal-pad" selectTextOnFocus style={[box, { width: '100%', height: 30, paddingVertical: 2, fontSize: 13 }]} /> : money(d.value),
            box: '', pct: '', gross: <Strong>{money(d.gross)}</Strong>,
            certBox: certing ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Text style={{ color: base.slate, fontWeight: '500' }}>£</Text><TextInput accessibilityLabel="Certified amount" value={cert.cp[`d${i}`]} onChangeText={(x) => cert.applyLines({ ...cert.cp, [`d${i}`]: x })} keyboardType="decimal-pad" selectTextOnFocus style={[box, { width: 90, height: 30, paddingVertical: 2, fontSize: 13 }]} /></View> : '',
            cert: certG == null ? '—' : <Strong warn={certing && certG !== Number(d.gross || 0)}>{money(certG)}</Strong>,
            prev: '', now: certG == null ? (certDone ? '—' : money(d.gross)) : money(certG),
          }} />
        );
      })() : (
        <View key={i} style={{ paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderColor: base.cardLine, gap: 6 }}>
          {!locked && !d.fin_daywork_id ? <TapEdit value={d.description || ''} onChange={(x) => setA({ ...a, dayworks: a.dayworks.map((y: Row, j: number) => (j === i ? { ...y, description: x } : y)) })} /> : <Text style={{ color: base.ink, fontSize: 13 }}>{d.description}</Text>}
          <FigRow label="Applied" total={money(d.gross)} inputs={locked || d.fin_daywork_id ? undefined : { total: <TextInput defaultValue={d.value != null ? String(d.value) : ''} onChangeText={(x) => setA({ ...a, dayworks: a.dayworks.map((y: Row, j: number) => (j === i ? { ...y, value: num(x) } : y)) })} placeholder="£" keyboardType="decimal-pad" selectTextOnFocus style={[box, { width: 70, height: 30, paddingVertical: 2, fontSize: 13 }]} /> }} />
          {certing && <FigRow label="Certified" total={money(num(cert.cp[`d${i}`]) || 0)} warn={(num(cert.cp[`d${i}`]) || 0) !== Number(d.gross || 0)}
            inputs={{ total: <TextInput accessibilityLabel="Certified amount" value={cert.cp[`d${i}`]} onChangeText={(x) => cert.applyLines({ ...cert.cp, [`d${i}`]: x })} keyboardType="decimal-pad" selectTextOnFocus style={[box, { width: 70, height: 30, paddingVertical: 2, fontSize: 13 }]} /> }} />}
          {certDone && (() => { const cl = (a0.cert_lines || []).find((x: Row) => x.day_index === i); return <FigRow label="Certified" total={cl ? money(cl.gross) : '—'} />; })()}
        </View>
      ))}
      </SecBlock>}
      {certing && <View style={{ alignSelf: 'flex-end', marginBottom: 12 }}><Button title="Back To Overview To Save The Certificate" onPress={() => setView('overview')} /></View>}
      </>}
      {stage === 'draft' && (
        <ActionRow note={autoNote} onDelete={async () => { if (await confirmAsk('Delete this draft application?', 'Delete')) { if (await deleteApplication(a0.id)) { toast('Draft deleted'); refresh(); router.back(); } else toast('Not saved — check your signal and try again.'); } }}>
          <Button kind="ghost" busy={busy === 'save'} title="Save" onPress={() => void save()} />
          <Button kind="ghost" busy={busy === 'xlsx'} title="Export Excel" onPress={() => void exportAs('xlsx', true)} />
          <Button title="Apply For Payment" onPress={async () => {
            if (!(await save(true))) return;
            if (!(await confirmAsk('Apply for payment? The application is locked so the figures can’t change. You can return it to draft if you need to edit it.', 'Apply For Payment'))) return;
            if (await setStatus(a0.id, { status: 'submitted', submitted_at: new Date().toISOString() })) { toast('Applied for payment — now locked.'); refresh(); } else toast('Not saved — check your signal and try again.');
          }} />
        </ActionRow>
      )}
      {mailing && me && (
        <FinEmailPopup kind="application" title={`Email Application No. ${a0.number}`} to={jf.billing_email || site?.client_email || ''}
          note="The application's Excel goes with it, for the client to fill in what they certify."
          vars={{ client: jf.billing_name || site?.client_name || '', project: site?.name || '', job_no: site?.job_number || '', number: String(a0.number), amount: money(a0.net_due), due: a0.due_date ? fdate(a0.due_date) : '', client_po: a0.client_po || '', company: org?.name || '', my_name: me.name || '' }}
          onSend={async (o) => { const e = await emailApplication(me, org, a0, o.to, o.cc, o); if (e) return e; toast(`Application emailed to ${o.to.join(', ')}`); refresh(); return null; }}
          onClose={() => setMailing(false)} />
      )}
    </ScrollView>
    {view === 'lines' && (
      <View accessibilityLabel="Totals" style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', columnGap: desk ? 26 : 12, backgroundColor: t.brand1, paddingVertical: 8, paddingHorizontal: 16 }}>
        <Text style={{ fontSize: desk ? 14 : 12, color: t.brand1Text }}>Applied To Date <Text style={{ fontWeight: '600' }}>{money(c.gross)}</Text></Text>
        {certFig && <Text style={{ fontSize: desk ? 14 : 12, color: t.brand1Text }}>Certified To Date <Text style={{ fontWeight: '600' }}>{money(certFig.gross)}</Text></Text>}
        <Text style={{ fontSize: desk ? 14 : 12, color: t.brand1Text }}>Due This Time <Text style={{ fontWeight: '600' }}>{money(dueNow)}</Text></Text>
      </View>
    )}
    <ThinExportBar busy={busy ? 'x' : undefined} onExcel={() => void exportAs('xlsx')} onPdf={() => void exportAs('pdf')} />
    </View>
  );
}

const GRID_W: Record<string, number> = { ref: 52, qty: 58, unit: 48, rate: 82, value: 92, box: 124, pct: 84, gross: 96, certBox: 124, cert: 96, prev: 92, now: 92 };
type FigCol = 'pct' | 'qty' | 'total';
/** A small box with small writing. A phone's web browser zooms in on boxes under 16pt, so there the box keeps 16pt and is
 *  drawn smaller instead (Andy, 3 Nov 2026); the installed app just uses the small size. */
const SMALL = 0.7;
function SmallBox({ w, h, style, ...rest }: React.ComponentProps<typeof TextInput> & { w: number; h: number }) {
  if (Platform.OS !== 'web') return <TextInput {...rest} style={[box, { width: w, height: h, paddingVertical: 1, paddingHorizontal: 3, fontSize: 11, textAlign: 'center' }, style]} />;
  return (
    <View style={{ width: w, height: h, alignItems: 'center', justifyContent: 'center' }}>
      <TextInput {...rest} style={[box, { width: w / SMALL, height: h / SMALL, paddingVertical: 1, paddingHorizontal: 4, fontSize: 16, textAlign: 'center', transform: [{ scale: SMALL }] }, style]} />
    </View>
  );
}
/** A figure that looks like a figure, underlined, until tapped; then a small box to change it (Andy, 3 Nov 2026). */
function TapNum({ value, show, onChange, label, wide }: { value: string; show?: string; onChange: (v: string) => void; label: string; wide?: boolean }) {
  const [on, setOn] = useState(false);
  if (on) return <SmallBox w={wide ? 54 : 42} h={26} autoFocus accessibilityLabel={label} defaultValue={value} onChangeText={onChange} onBlur={() => setOn(false)} keyboardType="decimal-pad" selectTextOnFocus />;
  return <Text accessibilityRole="button" accessibilityLabel={`Change ${label.toLowerCase()}`} onPress={() => setOn(true)} style={{ fontSize: 11.5, fontWeight: '600', color: base.ink, textDecorationLine: 'underline', textDecorationStyle: 'dotted' }}>{show ?? (value || '—')}</Text>;
}
/** Words that look like words until tapped, then a box to change them (Andy, 3 Nov 2026). */
function TapEdit({ value, onChange, placeholder = 'Tap to add a description' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [on, setOn] = useState(!value);
  if (on) return <TextInput autoFocus={!!value} value={value} onChangeText={onChange} onBlur={() => { if (value.trim()) setOn(false); }} placeholder={placeholder} accessibilityLabel="Description" style={[box, { fontSize: 13, paddingVertical: 5 }]} />;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Change: ${value}`} onPress={() => setOn(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Text style={{ flexShrink: 1, color: base.ink, fontSize: 13 }}>{value}</Text>
      <OphIcon name="pencil" size={13} color={base.slate} />
    </Pressable>
  );
}
// Shares of the row, so the columns spread evenly across any phone (Andy, 3 Nov 2026).
const FIG_F = { label: 1.15, unit: 0.6, rate: 1.1, pct: 1, qty: 0.95, total: 1.4 };
/** Phone: one figures row under a line (Andy, 3 Nov 2026) — Contract, Previous, Applied or Certified, then unit, rate, %, qty and
 *  total. Boxes to type in take the place of the figures they set; plain rows (contract, previous) have no band. */
function FigRow({ label, unit = '', rate = '', pct: pc = '', qty = '', total, warn, inputs, plain, bold }: { label: string; unit?: string; rate?: string; pct?: string; qty?: string; total: string; warn?: boolean; inputs?: Partial<Record<'unit' | 'rate' | FigCol, ReactNode>>; plain?: boolean; bold?: boolean }) {
  const cell = (k: 'unit' | 'rate' | FigCol, v: string) => (
    <View key={k} style={{ flex: FIG_F[k], minWidth: 0, alignItems: k === 'total' ? 'flex-end' : 'center' }}>
      {inputs?.[k] ?? <Text numberOfLines={1} style={{ fontSize: k === 'unit' ? 10.5 : 11.5, fontWeight: bold || (k === 'total' && !plain) ? '600' : '400', color: plain && !bold ? base.slate : k === 'total' && warn ? '#b45309' : base.ink }}>{v}</Text>}
    </View>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: plain ? 24 : 36, backgroundColor: plain ? undefined : '#F6F7F9', borderRadius: 8, paddingHorizontal: 6, paddingVertical: plain ? 1 : 4 }}>
      <Text style={{ flex: FIG_F.label, minWidth: 0, fontSize: 11, fontWeight: bold ? '600' : '500', color: bold ? base.ink : base.slate }}>{label}</Text>
      {cell('unit', unit)}{cell('rate', rate)}{cell('pct', pc)}{cell('qty', qty)}{cell('total', total)}
    </View>
  );
}
/** The column headings for those rows, under each section bar. */
function FigHead() {
  const h = (l: string, f: number) => <Text key={l} style={{ flex: f, minWidth: 0, textAlign: 'center', fontSize: 10.5, fontWeight: '600', color: base.slate }}>{l}</Text>;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F4F5F7', borderBottomWidth: 1, borderColor: base.cardLine, paddingVertical: 6, paddingHorizontal: 18 }}>
      <View style={{ flex: FIG_F.label }} />{h('Unit', FIG_F.unit)}{h('Rate', FIG_F.rate)}{h('%', FIG_F.pct)}{h('Qty', FIG_F.qty)}<Text style={{ flex: FIG_F.total, minWidth: 0, textAlign: 'right', fontSize: 10.5, fontWeight: '600', color: base.slate }}>Total</Text>
    </View>
  );
}
const Strong = ({ children, warn }: { children: ReactNode; warn?: boolean }) => <Text style={{ fontSize: 13.5, fontWeight: '600', color: warn ? '#b45309' : base.ink }}>{children}</Text>;
/** One row of the lines table: thin lines between the columns, words on the left and figures on the right. */
function LineRow({ cols, cells, head }: { cols: string[]; cells: Record<string, ReactNode>; head?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'stretch', borderBottomWidth: 1, borderColor: base.cardLine, backgroundColor: head ? '#F4F5F7' : undefined }}>
      {cols.map((k, i) => {
        const v = cells[k], words = k === 'desc' || k === 'ref' || k === 'unit', mid = k === 'box' || k === 'certBox';
        return (
          <View key={k} style={{ ...(k === 'desc' ? { flex: 1, minWidth: 0 } : { width: GRID_W[k] }), justifyContent: 'center', alignItems: mid ? 'center' : words ? 'flex-start' : 'flex-end', borderLeftWidth: i ? 1 : 0, borderColor: base.cardLine, paddingVertical: head ? 6 : 6, minHeight: head ? 0 : 42, paddingLeft: i ? 7 : 12, paddingRight: 7 }}>
            {typeof v === 'string' ? <Text style={{ fontSize: head ? 12.5 : 13.5, fontWeight: head ? '600' : '400', color: head || k === 'ref' ? base.slate : base.ink, textAlign: mid ? 'center' : words ? 'left' : 'right' }}>{v}</Text> : v}
          </View>
        );
      })}
    </View>
  );
}

type Entry = 'pct' | 'gbp' | 'qty';
const CERT_LABELS: [string, string, string] = ['Certified percent', 'Certified amount', 'Certified quantity'];

/** One box for how far a line has got, typed as a %, in £ or as a quantity. It's always kept as a %, which every sum uses. */
function AmountBox({ p, value, qty, unit, mode, onMode, labels, onPct, bare }: { p: number; value: unknown; qty?: unknown; unit?: string | null; mode: Entry; onMode?: (m: Entry) => void; labels: [string, string, string]; onPct: (p: number) => void; bare?: boolean }) {
  const [typing, setTyping] = useState<string | null>(null);
  const val = Number(value || 0), q = qty != null && Number(qty) !== 0 ? Number(qty) : 0;
  const m: Entry = mode === 'qty' && !q ? 'pct' : mode;
  const shown = String(m === 'gbp' ? round2((val * p) / 100) : m === 'qty' ? round2((p * q) / 100) : p);
  const type = (x: string) => {
    setTyping(x);
    const n = x.trim() === '' ? 0 : num(x);
    if (n === null || isNaN(n)) return;
    if (m === 'gbp') { if (val) onPct(pct((n / val) * 100)); } else if (m === 'qty') onPct(pct((n / q) * 100)); else onPct(pct(n));
  };
  const props = { accessibilityLabel: labels[m === 'pct' ? 0 : m === 'gbp' ? 1 : 2], value: typing ?? shown, onChangeText: type, onFocus: () => setTyping(shown), onBlur: () => setTyping(null), keyboardType: 'decimal-pad' as const, selectTextOnFocus: true };
  const input = bare ? <SmallBox w={m === 'gbp' ? 70 : 46} h={26} {...props} /> : <TextInput {...props} style={[box, { width: m === 'gbp' ? 90 : 56, height: 30, paddingVertical: 2, fontSize: 13 }]} />;
  if (bare) return input;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      {m === 'gbp' && <Text style={{ color: base.slate, fontWeight: '500' }}>£</Text>}
      <TextInput accessibilityLabel={labels[m === 'pct' ? 0 : m === 'gbp' ? 1 : 2]} value={typing ?? shown} onChangeText={type} onFocus={() => setTyping(shown)} onBlur={() => setTyping(null)} keyboardType="decimal-pad" selectTextOnFocus style={[box, { width: m === 'gbp' ? 90 : 56, height: 30, paddingVertical: 2, fontSize: 13 }]} />
      {m === 'gbp' ? null : q && onMode
        ? <Pressable accessibilityRole="button" accessibilityLabel={m === 'qty' ? 'Enter by percent' : 'Enter by quantity'} hitSlop={8} onPress={() => onMode(m === 'qty' ? 'pct' : 'qty')} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#DFE3EA', borderRadius: 7, height: 26, paddingHorizontal: 8 }}><Text style={{ fontSize: 12.5, fontWeight: '500', color: base.ink }}>{m === 'qty' ? unit || 'qty' : '%'}</Text><Text style={{ fontSize: 9, color: base.slate }}>⇄</Text></Pressable>
        : <Text style={{ color: base.slate, fontWeight: '500' }}>{m === 'qty' ? unit || '' : '%'}</Text>}
    </View>
  );
}

type GridRow = { l: string; v: (number | null)[]; bold?: boolean; neg?: boolean; total?: boolean };
const figs = (x: ReturnType<typeof appCalc>) => {
  const add = (r: Row[]) => round2(r.reduce((n, y) => n + Number(y.gross || 0), 0));
  return { contract: add(x.lines), variations: add(x.variations), dayworks: add(x.dayworks), gross: x.gross, discount: x.discount, retention: x.retention };
};

/** A white panel with the section bar on top, as the Bill of Quantities. */
function Panel({ title, children }: { title: string; children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ borderWidth: 1.5, borderColor: t.brand1, borderRadius: 10, backgroundColor: base.card, marginBottom: 14, overflow: 'hidden' }}>
      <View style={{ backgroundColor: t.brand1, paddingVertical: 9, paddingHorizontal: 12 }}><Text style={{ fontSize: 14, fontWeight: '600', color: t.brand1Text }}>{title}</Text></View>
      {children}
    </View>
  );
}
function DetailRow({ l, children, last }: { l: string; children: ReactNode; last?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 42, paddingVertical: 5, paddingHorizontal: 12, borderBottomWidth: last ? 0 : 1, borderColor: base.cardLine }}>
      <Text style={{ flexShrink: 1, fontSize: 13.5, color: base.slate }}>{l}</Text>
      {children}
    </View>
  );
}
const Val = ({ children }: { children: ReactNode }) => <Text style={{ fontSize: 14, fontWeight: '500', color: base.ink }}>{children}</Text>;

/** The valuation at a glance: each kind of work against what's applied, certified, gone before and due now.
 *  On a phone it all fits the width: smaller figures and a narrower first column, no sideways scrolling (Andy, 3 Nov 2026). */
function ValGrid({ heads, rows, desk }: { heads: string[]; rows: GridRow[]; desk: boolean }) {
  const t = useTheme();
  const fs = desk ? 14 : heads.length > 3 ? 11.5 : 12.5, hs = desk ? 12.5 : 11, px = desk ? 12 : 8, gap = desk ? 8 : 4;
  const cell = (x: number | null, r: GridRow) => (x == null ? '' : r.neg ? (x > 0 ? `−${money(x)}` : money(-x)) : money(x));
  const first = desk ? { flex: 1.2, minWidth: 110 } : { flex: 1.1, minWidth: 0 };
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap, backgroundColor: '#F4F5F7', borderBottomWidth: 1, borderColor: base.cardLine, paddingVertical: 7, paddingHorizontal: px }}>
        <View style={first} />
        {heads.map((h) => <Text key={h} style={{ flex: 1, minWidth: 0, textAlign: 'center', fontSize: hs, fontWeight: '600', color: base.slate }}>{h}</Text>)}
      </View>
      {rows.map((r) => (
        <View key={r.l} style={{ flexDirection: 'row', alignItems: 'center', gap, paddingVertical: desk ? 9 : 8, paddingHorizontal: px, borderBottomWidth: r.total ? 0 : 1, borderColor: base.cardLine, backgroundColor: r.total ? t.brand1 : r.bold ? '#F4F5F7' : undefined }}>
          <Text style={{ ...first, fontSize: desk ? 14 : 12.5, fontWeight: r.bold || r.total ? '600' : '400', color: r.total ? t.brand1Text : base.ink }}>{r.l}</Text>
          {r.v.map((x, i) => <Text key={i} style={{ flex: 1, minWidth: 0, textAlign: 'center', fontSize: fs, fontWeight: r.bold || r.total || i === r.v.length - 1 ? '600' : '400', color: r.total ? t.brand1Text : base.ink }}>{cell(x, r)}</Text>)}
        </View>
      ))}
    </View>
  );
}

/** A summary row: label, an optional box, then the figure, so every figure lines up on the right. */
function SumRow({ l, v, input, bold }: { l: string; v: string; input?: ReactNode; bold?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40, paddingVertical: 5, borderBottomWidth: 1, borderColor: base.cardLine }}>
      <Text style={{ flex: 1, color: base.ink, fontWeight: bold ? '600' : '400' }}>{l}</Text>
      {input}
      <Text style={{ width: 110, textAlign: 'right', color: base.ink, fontWeight: bold ? '600' : '500' }}>{v}</Text>
    </View>
  );
}
/** The page's main buttons in one row: shared evenly and all the same height, with a small red bin on the end (Andy, 3 Nov 2026). */
function ActionRow({ children, onDelete, note }: { children: ReactNode; onDelete?: () => void; note?: string }) {
  return (
    <View style={{ marginTop: 10, marginBottom: 6 }}>
      {!!note && <Muted style={{ fontSize: 12, marginBottom: 6 }}>{note}</Muted>}
      <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: 8 }}>
        {(Array.isArray(children) ? children : [children]).filter(Boolean).map((b, i) => <View key={i} style={{ flex: 1, minWidth: 0 }}>{isValidElement(b) ? cloneElement(b as ReactElement<{ grow?: boolean }>, { grow: true }) : b}</View>)}
        {!!onDelete && <Pressable accessibilityRole="button" accessibilityLabel="Delete" onPress={onDelete} style={({ pressed }) => ({ width: 46, marginTop: 4, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FDECEC', opacity: pressed ? 0.7 : 1 })}><OphIcon name="bin" size={19} color="#B42318" /></Pressable>}
      </View>
    </View>
  );
}

/** A section: blue bar, its lines, any buttons, then a blue bar with the total: the Bill of Quantities' look. */
function SecBlock({ title, refNo, total, of, tools, children }: { title: string; refNo?: string; total: number; of?: number; tools?: ReactNode; children: ReactNode }) {
  const t = useTheme(), desk = useDesk();
  return (
    <View style={{ borderWidth: 1.5, borderColor: t.brand1, borderRadius: 10, backgroundColor: base.card, marginBottom: desk ? 24 : 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: t.brand1, borderTopLeftRadius: 8, borderTopRightRadius: 8, paddingVertical: desk ? 11 : 8, paddingHorizontal: 12 }}>
        <Text style={{ flex: 1, fontSize: desk ? 15 : 13, fontWeight: '600', color: t.brand1Text }}>{refNo ? `${refNo}   ` : ''}{title}</Text>
        <Text style={{ fontSize: desk ? 15 : 12.5, fontWeight: '600', color: t.brand1Text }}>{money(total)}</Text>
      </View>
      {children}
      {tools ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingVertical: 11, paddingHorizontal: 12 }}>{tools}</View> : null}
      <View accessibilityLabel="Section summary" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: desk ? 26 : 12, backgroundColor: t.brand1, borderBottomLeftRadius: 8, borderBottomRightRadius: 8, paddingVertical: desk ? 11 : 8, paddingHorizontal: 12 }}>
        {of != null && <Text style={{ fontSize: desk ? 14 : 12, color: t.brand1Text }}>Section Value <Text style={{ fontWeight: '600' }}>{money(of)}</Text></Text>}
        {of ? <Text style={{ fontSize: desk ? 14 : 12, color: t.brand1Text }}>Complete <Text style={{ fontWeight: '600' }}>{Math.round((total / of) * 1000) / 10}%</Text></Text> : null}
        <Text style={{ fontSize: desk ? 14 : 12, color: t.brand1Text }}>To Date <Text style={{ fontWeight: '600' }}>{money(total)}</Text></Text>
      </View>
    </View>
  );
}

/** The client's figures while they're being entered: on each row of the Bill, and totalled in the certificate. */
function useCert(a: Row, jf: Row, previous: number, prevPct: Record<string, number>, prevVar: Record<string, number>) {
  // Each line starts at what the client last certified (0 on a first certificate), so their figure has to be entered (9219p).
  const startCp = () => {
    const o: Record<string, string> = {};
    (a.lines || []).forEach((l: Row, i: number) => { if (isItem(l)) o[`l${i}`] = String(prevPct[l.item_id] ?? 0); });
    (a.variations || []).forEach((x: Row, i: number) => { o[`v${i}`] = String(prevVar[x.fin_variation_id || x.variation_id || ''] ?? 0); });
    (a.dayworks || []).forEach((d: Row, i: number) => { o[`d${i}`] = String(d.value ?? 0); });
    return o;
  };
  const withCp = (next: Record<string, string>) => ({
    ...a,
    lines: (a.lines || []).map((l: Row, i: number) => (isItem(l) ? { ...l, pct: pct(next[`l${i}`]) } : l)),
    variations: (a.variations || []).map((x: Row, i: number) => ({ ...x, pct: pct(next[`v${i}`]) })),
    dayworks: (a.dayworks || []).map((d: Row, i: number) => ({ ...d, value: num(next[`d${i}`]) || 0 })),
  });
  const [cp, setCp] = useState<Record<string, string>>(startCp);
  const [v, setV] = useState<Row>(() => { const c0 = appCalc(withCp(startCp()), jf.contract_value, jf.retention_limit_pct, previous); return { cert_date: today(), cert_gross: String(c0.gross), cert_retention: String(c0.retention), cert_previous: String(round2(previous)), cert_discount: String(c0.discount), cert_notes: '', cert_is_payless: false, invoiceNow: false }; });
  const [file, setFile] = useState<{ uri: string; name: string; mimeType?: string | null } | null>(null);
  // A Certified % for each line and variation and an amount for each day work; the totals (with discount, retention and its
  // limit) are worked out from them and can't be typed over, so the invoice always matches the certificate (9219p finCertTotals).
  const [xlNote, setXlNote] = useState('');
  const certApp = () => withCp(cp);
  const applyLines = (next: Record<string, string>) => {
    setCp(next);
    const c2 = appCalc(withCp(next), jf.contract_value, jf.retention_limit_pct, num(v.cert_previous) || 0);
    setV({ ...v, cert_gross: String(c2.gross), cert_discount: String(c2.discount), cert_retention: String(c2.retention) });
  };
  const asApplied = () => { const o: Record<string, string> = {}; (a.lines || []).forEach((l: Row, i: number) => { if (isItem(l)) o[`l${i}`] = String(pct(l.pct)); }); (a.variations || []).forEach((x: Row, i: number) => { o[`v${i}`] = String(pct(x.pct)); }); (a.dayworks || []).forEach((d: Row, i: number) => { o[`d${i}`] = String(d.value ?? 0); }); applyLines(o); };
  return { cp, v, setV, file, setFile, xlNote, setXlNote, certApp, applyLines, asApplied };
}
type Cert = ReturnType<typeof useCert>;

/** Our application Excel back from the client: their Certified % on each line fills the Certified column. */
function certFromExcel(a: Row, cert: Cert, items: AppXlItem[], toast: (m: string) => void): boolean {
  const r = certFromItems(a, items);
  if (!r.found) { toast('That doesn’t look like this application’s Excel — download it from OpHUB, send it to the client and upload their copy.'); return false; }
  cert.applyLines({ ...cert.cp, ...r.cp });
  cert.setXlNote(`Read from the client’s Excel. ${r.diffs.length ? `${r.diffs.length} line${r.diffs.length === 1 ? ' differs' : 's differ'} from what you applied for:\n${r.diffs.slice(0, 8).join('\n')}${r.diffs.length > 8 ? `\n…and ${r.diffs.length - 8} more` : ''}` : 'Every line matches what you applied for.'} Check the figures, then save.`);
  toast('Certificate filled in from the Excel');
  return true;
}
/** 9219p finCertFromPdf: each line's certified % read from the client's PDF (the last % on the matching row); the PDF is kept
 *  as the certificate copy. Needs the PDF's text, so not a scan. */
async function certFromPdf(a: Row, cert: Cert, file: { uri: string; name?: string | null }, toast: (m: string) => void): Promise<boolean> {
  const rows = await pdfLines(new Uint8Array(await (await fetch(file.uri)).arrayBuffer()));
  cert.setFile({ uri: file.uri, name: file.name || 'certificate.pdf', mimeType: 'application/pdf' });
  if (!rows) { toast('Couldn’t read any text in that PDF (a scan, or on a phone) — enter the Certified % on each line. The PDF is kept with the certificate.'); return false; }
  const norm = (x: unknown) => String(x || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const next: Record<string, string> = {}; let found = 0;
  (a.lines || []).forEach((l: Row, i: number) => {
    if (!isItem(l)) return; const dsc = norm(l.description); if (!dsc) return;
    const row = rows.find((x) => norm(x).includes(dsc.slice(0, 40))); if (!row) return;
    const pcts = (row.match(/(\d{1,3}(?:\.\d+)?)\s?%/g) || []).map((x) => Number(x.replace(/[^\d.]/g, ''))).filter((n) => n <= 100);
    if (pcts.length) { next[`l${i}`] = String(pcts[pcts.length - 1]); found++; }
  });
  if (!found) { toast('Read the PDF but couldn’t match any lines — enter the Certified % on each line. The PDF is kept with the certificate.'); return false; }
  cert.applyLines({ ...cert.cp, ...next });
  toast(`Read ${found} line${found === 1 ? '' : 's'} from the PDF — check them, then save`);
  return true;
}
/** Import Certificate (Andy, 3 Nov 2026): our Excel back from the client, or their PDF. True when anything was read. */
async function importCertificate(a: Row, cert: Cert, toast: (m: string) => void): Promise<boolean> {
  const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true }); if (r.canceled || !r.assets[0]) return false;
  const f = r.assets[0];
  if (/\.pdf$/i.test(f.name || '') || f.mimeType === 'application/pdf') return certFromPdf(a, cert, f, toast);
  if (/\.xls$/i.test(f.name || '')) { toast('Save it as .xlsx first — old .xls files can’t be read.'); return false; }
  const book = await readXlsx(new Uint8Array(await (await fetch(f.uri)).arrayBuffer())).catch(() => null);
  const items = book ? parseAppBook(book) : null;
  if (!items) { toast('That isn’t this application’s Excel or a PDF certificate — upload the Excel the client sent back, or their PDF.'); return false; }
  return certFromExcel(a, cert, items, toast);
}

/** Quick ways to fill in the Certified column, above the Bill. */
function CertTools({ a, cert }: { a: Row; cert: Cert }) {
  const toast = useToast(), desk = useDesk();
  const { xlNote } = cert;
  const fromExcel = async () => { const items = await pickAppExcel(toast); if (items) certFromExcel(a, cert, items, toast); };
  const fromPdf = async () => { const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true }); if (!r.canceled && r.assets[0]) await certFromPdf(a, cert, r.assets[0], toast); };
  const note = !!xlNote && <Card style={{ backgroundColor: '#f4f8fd', marginTop: 8, marginBottom: 0 }}><Text style={{ color: base.ink, fontSize: 12.5 }}>{xlNote}</Text></Card>;
  // Phone: the three ways in one button, no wordy line (Andy, 3 Nov 2026).
  if (!desk) return note ? <View style={{ marginBottom: 12 }}>{note}</View> : null;
  return (
    <View style={{ marginBottom: 12 }}>
      <Muted style={{ marginBottom: 8 }}>Enter what the client certified in the Certified column on each line. Lines start at what they last certified.</Muted>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <Button small kind="ghost" title="Certified As Applied" onPress={cert.asApplied} />
        <Button small kind="ghost" title="Fill In From The Client's Excel" onPress={() => void fromExcel()} />
        <Button small kind="ghost" title="Fill In From The Client's PDF" onPress={() => void fromPdf()} />
      </View>
      {note}
    </View>
  );
}

function Certificate({ a, cert, onSaved, jf, actions }: { a: Row; jf: Row; cert: Cert; onSaved: () => void; actions: (save: ReactNode, saveAndRaise: ReactNode) => ReactNode }) {
  const { me, org } = useAuth();
  const { data: site } = useSite(a.site_id);
  const toast = useToast();
  const { v, setV, file, setFile, certApp } = cert;
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  const n = (k: string) => num(v[k]) || 0;
  const netWorked = round2(n('cert_gross') - n('cert_retention') - n('cert_previous') - n('cert_discount'));
  const net = netWorked;
  const diff = round2(net - Number(a.net_due));
  const f = (k: string, l: string) => <View key={k} style={{ width: 240, marginBottom: 6 }}><Muted>{l}</Muted>{k === 'cert_date'
    ? <DateBox value={String(v[k] ?? '')} onChange={(x) => setV({ ...v, [k]: x })} title={l} placeholder="Choose a date" style={{ paddingVertical: 8 }} />
    : <TextInput value={String(v[k])} onChangeText={(x) => setV({ ...v, [k]: x })} keyboardType="decimal-pad" selectTextOnFocus style={box} />}</View>;
  return (
    <Panel title="Client's Certificate">
      <View style={{ padding: 12 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 8 }}>
        {f('cert_date', 'Certificate Date')}
      </View>
      {n('cert_gross') ? <SumRow bold l="Net Due" v={money(net)} /> : null}
      <Text style={{ color: !n('cert_gross') ? base.slate : diff < 0 ? '#C0392B' : diff > 0 ? '#1E7A3C' : base.slate, marginTop: 6, marginBottom: 6 }}>{!n('cert_gross') ? 'Nothing certified yet.' : diff ? `${diff < 0 ? 'Short by' : 'Over by'} ${money(Math.abs(diff))} compared with the ${money(a.net_due)} applied for.` : 'Matches what was applied for.'}</Text>
      <Check label="This Is A Pay-Less Notice" value={!!v.cert_is_payless} onChange={(x) => setV({ ...v, cert_is_payless: x })} />
      <TextInput value={v.cert_notes} onChangeText={(x) => setV({ ...v, cert_notes: x })} placeholder="Notes, e.g. reason for any shortfall" style={[box, { marginVertical: 6 }]} />
      <Pressable onPress={async () => { const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true }); if (!r.canceled && r.assets[0]) setFile({ uri: r.assets[0].uri, name: r.assets[0].name, mimeType: r.assets[0].mimeType }); }}><Text style={{ color: base.blue, marginBottom: 6 }}>📎 {file ? file.name : 'Copy Of The Certificate (Optional)'}</Text></Pressable>
      {actions(<Button kind="ghost" busy={busy} title="Save Certificate" onPress={() => void save(false)} />, <Button busy={busy} title="Save & Raise Invoice" onPress={() => void save(true)} />)}
      </View>
    </Panel>
  );
  // Save the certificate; with raise, also raise and issue the invoice from it (Andy, 3 Nov 2026: a button instead of a tick).
  async function save(raise: boolean) {
        if (!me) return;
        const vals = ['cert_gross', 'cert_retention', 'cert_previous', 'cert_discount'].map((k) => num(v[k]));
        if (vals.some((x) => x === null || isNaN(x))) { toast('Fill in every amount (0 if none).'); return; }
        setBusy(true);
        try {
          const ca = appCalc(certApp(), jf.contract_value, jf.retention_limit_pct, vals[2] as number);
          // The extra fields let the old app show these too, while both are in use (9219p).
          const certLines = [...ca.lines.filter(isItem).map((l: Row) => ({ item_id: l.item_id, pct: l.pct, gross: l.gross, value: l.value, applied_pct: pct((a.lines || []).find((y: Row) => y.item_id === l.item_id)?.pct) })), ...ca.variations.map((x: Row, i: number) => ({ var_index: i, fin_variation_id: x.fin_variation_id || null, variation_id: x.variation_id || null, description: x.description, pct: x.pct, gross: x.gross, value: x.value, applied_pct: pct(a.variations?.[i]?.pct) })), ...ca.dayworks.map((d: Row, i: number) => ({ day_index: i, fin_daywork_id: d.fin_daywork_id || null, description: d.description, gross: d.gross }))];
          const e = await saveCertificate(me, a, { ...v, cert_gross: vals[0], cert_retention: vals[1], cert_previous: vals[2], cert_discount: vals[3], cert_net: net, cert_lines: certLines }, file);
          if (e) { toast(e); return; }
          if (raise && net <= 0) { toast('Certificate saved — nothing to invoice, as the net due isn’t above £0.'); onSaved(); return; }
          if (raise) {
            const r = await raiseInvoiceFromCert(me, org, { ...a, cert_gross: vals[0], cert_retention: vals[1], cert_previous: vals[2], cert_discount: vals[3], cert_net: net, cert_date: v.cert_date }, site as never, false);
            // Left as a draft and opened, so it can be checked and changed before it's issued (Andy, 3 Nov 2026).
            if (r.error) showAlert(r.error); else toast('Certificate saved — check the invoice, then issue it.');
            onSaved(); if (r.id) router.push(`/fin/job/${a.site_id}/invoice/${r.id}` as never); return;
          }
          toast('Certificate saved'); onSaved();
        } finally { setBusy(false); }
  }
}
