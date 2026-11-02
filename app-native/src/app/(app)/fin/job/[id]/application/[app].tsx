// An application for payment (902 renderFinApplication + 903 certificate).
// "new" starts one from the Bill of Quantities. Draft: % (or £) done per line,
// set a whole section, variations and day works, discount and retention.
// Applied: locked. Then enter the client's certificate (or pay-less notice)
// and raise the invoice from it. Emailing it is off during the Finance trial.
import * as DocumentPicker from 'expo-document-picker';
import { pdfLines } from '@/lib/pdfjs';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { ThinExportBar } from '@/components/FinFilterBar';
import { FinChip } from '@/components/FinNav';
import { chooseAction, confirmAsk, showAlert, useToast } from '@/components/toast';
import { FinForm } from '@/components/FinForm';
import { Button, Card, Check, Muted } from '@/components/ui';
import { viewDoc } from '@/components/DocViewer';
import { askAppSow } from '@/components/FinRowMenu';
import { DateBox } from '@/components/DateField';
import { addBoqLines, addBoqSection, clearCertificate, deleteApplication, deleteApplicationAny, exportApplication, loadApplication, newApplication, raiseInvoiceFromCert, saveApplication, saveCertificate, setStatus } from '@/data/finApp';
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
const STAGE: Record<string, string> = { draft: 'Draft', applied: 'Applied — waiting for certificate', certified: 'Certified', invoiced: 'Invoiced', void: 'Void' };

// Which view each application was last on, so marking one as applied from Line by line stays there.
const lastView: Record<string, 'overview' | 'lines'> = {};

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
  const [view, setViewNow] = useState<'overview' | 'lines'>(lastView[a0.id] || 'overview');
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const setView = (x: 'overview' | 'lines') => { lastView[a0.id] = x; setViewNow(x); scroller.current?.scrollTo({ y: 0, animated: false }); };
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
  const stage = APP_STAGE(a0), locked = stage !== 'draft';
  const previous = locked ? Number(a0.previous || 0) : previousLive;
  const c = appCalc(a, jf.contract_value, jf.retention_limit_pct, previous);
  const tots = groupTotals(c.lines, (l) => l.value, (l) => l.gross);
  const refresh = () => { ['finApp', 'finSales', 'finBook', 'finOverview'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] })); };
  const setLine = (i: number, patch: Row) => setA({ ...a, lines: a.lines.map((l: Row, j: number) => (j === i ? { ...l, ...patch } : l)) });
  // A variation can be more than one: value = quantity × the figure each (Andy, 2 Nov 2026). The value stays what every sum uses.
  const setVar = (i: number, patch: Row) => setA({ ...a, variations: a.variations.map((y: Row, j: number) => { if (j !== i) return y; const z = { ...y, ...patch }; if ('qty' in patch || 'rate' in patch) { const q = num(z.qty), r = num(z.rate ?? y.value); z.value = r === null || isNaN(r) ? null : round2((q === null || isNaN(q) ? 1 : q) * r); } return z; }) });
  const fill = (i: number, p: number) => { const lv = a.lines[i].kind, ls = a.lines.slice(); for (let j = i + 1; j < ls.length; j++) { const k = ls[j].kind; if (k === 'section' || (lv === 'subsection' && k === 'subsection')) break; if (isItem(ls[j])) ls[j] = { ...ls[j], pct: p }; } setA({ ...a, lines: ls }); setGen((g) => g + 1); };
  const exportAs = async (kind: 'xlsx' | 'pdf') => {
    if (!me) return;
    if (isDraft && !(await save(true))) return;
    // Proof of works (9219zo): ask whether to include the Schedule of Works report.
    const doc = isDraft ? { ...a0, ...a } : a0;
    const sow = await askAppSow(doc, kind); if (sow === undefined) return;
    setBusy(kind);
    const ok = await exportApplication(me, org, doc, kind, sow).catch(() => false);
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
  const certCalc = stage === 'applied' ? appCalc(cert.certApp(), jf.contract_value, jf.retention_limit_pct, certPrev) : null;
  const certFig = certCalc ? figs(certCalc) : locked ? appFigures(a0) : null;
  const gridCert = certFig && (stage !== 'applied' || certFig.gross) ? certFig : null;
  const certNet = certCalc ? certCalc.net_due : locked ? Number(a0.cert_net || 0) : null;
  const dueNow = certNet != null ? certNet : c.net_due;
  return (
    <View style={{ flex: 1 }}>
    <ScrollView ref={scroller} style={{ flex: 1 }} contentContainerStyle={page(1100)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: `Application ${a0.number}` }} />
      {!!a0.retention_release && <Card style={{ backgroundColor: '#f1fbf5', borderColor: '#d3f0de' }}><Text style={{ color: base.ink }}><Text style={{ fontWeight: '600' }}>Retention release — {a0.retention_release === 1 ? 'first half (practical completion)' : 'final release'}.</Text> Retention on this application is {pct(a0.retention_pct)}%, so the client pays back {a0.retention_release === 1 ? 'half of what they hold' : 'what they still hold'} when they certify it.</Text></Card>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <Text style={{ fontSize: desk ? 20 : 17, fontWeight: '600', color: base.ink }}>Application No. {a0.number}</Text>
        <View style={{ backgroundColor: stage === 'draft' ? '#EEF0F3' : stage === 'applied' ? '#FFF4DF' : '#E3F5E9', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}><Text style={{ fontSize: 12.5, fontWeight: '500', color: stage === 'draft' ? base.slate : stage === 'applied' ? '#92580A' : '#1E7A3C' }}>{STAGE[stage]}</Text></View>
      </View>
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14, borderBottomWidth: 1, borderColor: base.cardLine }}>
        {([['overview', 'Overview'], ['lines', 'Line by line']] as const).map(([k, l]) => (
          <Pressable key={k} accessibilityRole="button" onPress={() => setView(k)} style={{ paddingHorizontal: 12, paddingVertical: 8, marginBottom: -1, borderBottomWidth: 2, borderBottomColor: view === k ? t.brand1 : 'transparent' }}>
            <Text style={{ fontSize: 14, fontWeight: view === k ? '600' : '500', color: view === k ? base.ink : base.slate }}>{l}</Text>
          </Pressable>
        ))}
      </View>
      {view === 'overview' && (
        <View style={{ flexDirection: desk ? 'row' : 'column', alignItems: desk ? 'flex-start' : 'stretch', gap: 14 }}>
          <View style={desk ? { width: 340 } : undefined}>
            <Panel title="Application">
              <DetailRow l="Application no."><Val>{a0.number}</Val></DetailRow>
              <DetailRow l="Contract works"><Val>{money(contractTotal)}</Val></DetailRow>
              {([['valuation_date', 'Valuation date'], ['due_date', 'Due date'], ['final_date', 'Final date for payment']] as const).map(([k, l]) => (
                <DetailRow key={k} l={l}>{locked ? <Val>{a[k] ? fdate(a[k]) : '—'}</Val> : <DateBox value={a[k] || ''} onChange={(x) => setA({ ...a, [k]: x })} title={l} style={{ width: 150, paddingVertical: 5 }} />}</DetailRow>
              ))}
              <DetailRow l={`Retention %${jf.retention_limit_pct ? ` (limit ${jf.retention_limit_pct}%)` : ''}`}>{locked ? <Val>{pct(a.retention_pct)}%</Val> : <TextInput accessibilityLabel="Retention percent" defaultValue={String(pct(a.retention_pct))} onChangeText={(x) => setA({ ...a, retention_pct: pct(x) })} keyboardType="decimal-pad" selectTextOnFocus style={[box, { width: 64, height: 30, paddingVertical: 2, textAlign: 'right' }]} />}</DetailRow>
              <DetailRow l="Discount %" last>{stage !== 'draft' ? <Val>{pct(a.discount_pct || 0)}%</Val> : <TextInput accessibilityLabel="Discount percent" defaultValue={String(pct(a.discount_pct || 0))} onChangeText={(x) => setA({ ...a, discount_pct: pct(x) })} keyboardType="decimal-pad" selectTextOnFocus style={[box, { width: 64, height: 30, paddingVertical: 2, textAlign: 'right' }]} />}</DetailRow>
            </Panel>
          </View>
          <View style={desk ? { flex: 1, minWidth: 0 } : undefined}>
            <Panel title="Valuation">
              <ValGrid desk={desk} heads={gridCert ? ['Applied to date', 'Certified to date', 'Previous', 'This certificate'] : ['Applied to date', 'Previous', 'This application']} rows={(() => {
                const ap = figs(c), pr = appFigures(prior), mine = gridCert || ap, row = (l: string, k: keyof typeof ap, o?: Partial<GridRow>): GridRow => ({ l, v: gridCert ? [ap[k], gridCert[k], pr[k], round2(gridCert[k] - pr[k])] : [ap[k], pr[k], round2(ap[k] - pr[k])], ...o });
                const netTo = round2(mine.gross - mine.discount - mine.retention), prevNet = gridCert ? certPrev : c.previous, thisNet = round2(netTo - prevNet);
                const blank = (x: number): (number | null)[] => (gridCert ? [null, null, null, x] : [null, null, x]);
                const vat = (jf.vat_treatment || finSt?.default_vat || 'standard') === 'standard';
                return [
                  row('Contract works', 'contract'), row('Variations', 'variations'), row('Day works', 'dayworks'), row('Subtotal', 'gross', { bold: true }),
                  row('Less discount', 'discount', { neg: true }), row('Less retention', 'retention', { neg: true }),
                  { l: 'Balance', bold: true, v: gridCert ? [round2(ap.gross - ap.discount - ap.retention), netTo, prevNet, thisNet] : [netTo, prevNet, thisNet] },
                  ...(vat ? [{ l: 'VAT @ 20%', v: blank(round2(thisNet * 0.2)) }] : []),
                  { l: 'Total due', total: true, v: blank(vat ? round2(thisNet * 1.2) : thisNet) },
                ];
              })()} />
            </Panel>
            <Muted style={{ fontSize: 12, marginTop: -6, marginBottom: 12 }}>An application isn&apos;t a VAT invoice; the invoice follows the certificate.</Muted>
            {stage === 'applied' && (
              <>
                <Certificate a={a0} jf={jf} cert={cert} onSaved={refresh} onLines={() => setView('lines')} actions={(saveBtn) => (
                  <ActionRow onDelete={deleteAny}>
                    {saveBtn}
                    <Button kind="ghost" title="Return to draft" onPress={async () => { if (await confirmAsk('Return this application to draft so you can edit it?', 'Return to draft')) { if (await setStatus(a0.id, { status: 'draft' })) { toast('Back to draft — you can edit it now'); refresh(); } } }} />
                  </ActionRow>
                )} />
                <Muted style={{ marginTop: 6 }}>Emailing the application to the client is switched off while Finance is on trial.</Muted>
              </>
            )}
            {(stage === 'certified' || stage === 'invoiced') && (
              <Panel title={`${a0.cert_is_payless ? 'Pay-less notice' : 'Payment certificate'} · ${fdate(a0.cert_date)}`}>
                <View style={{ padding: 12 }}>
                  <SumRow bold l="Net due" v={money(a0.cert_net)} />
                  {round2(Number(a0.cert_net) - Number(a0.net_due)) !== 0 && <Text style={{ marginTop: 6, color: Number(a0.cert_net) < Number(a0.net_due) ? '#C0392B' : '#1E7A3C', fontWeight: '500' }}>{Number(a0.cert_net) < Number(a0.net_due) ? 'Short by' : 'Over by'} {money(Math.abs(Number(a0.cert_net) - Number(a0.net_due)))} compared with the {money(a0.net_due)} applied for.</Text>}
                  {a0.cert_notes ? <Muted style={{ marginTop: 6 }}>{a0.cert_notes}</Muted> : null}
                  {a0.cert_file_path && <Pressable onPress={async () => { const u = await openDocLink('finance-docs', a0.cert_file_path); if (u) viewDoc(u); }}><Text style={{ color: base.blue, marginTop: 6 }}>📄 Certificate</Text></Pressable>}
                  <ActionRow onDelete={a0.invoice_id ? undefined : deleteAny}>
                    {a0.invoice_id ? <Button title="Open invoice" onPress={() => router.push(`/fin/job/${a0.site_id}/invoice/${a0.invoice_id}` as never)} />
                      : <Button busy={busy === 'inv'} title="Raise invoice" onPress={async () => { setBusy('inv'); const r = await raiseInvoiceFromCert(me, org, a0, site as never, false); setBusy(''); if (r.error) toast(r.error); if (r.id) { refresh(); router.push(`/fin/job/${a0.site_id}/invoice/${r.id}` as never); } }} />}
                    {!a0.invoice_id && <Button kind="ghost" title="Change the certificate" onPress={async () => { if (await confirmAsk('Clear the certificate figures and enter them again?', 'Clear')) { if (await clearCertificate(a0.id)) refresh(); else toast('Not saved — check your signal and try again.'); } }} />}
                  </ActionRow>
                </View>
              </Panel>
            )}
          </View>
        </View>
      )}
      {view === 'lines' && <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8, alignItems: 'center' }}>
        {(stage === 'draft' || stage === 'applied') && <><FinChip on={mode === 'pct'} label="Enter %" onPress={() => setMode('pct')} /><FinChip on={mode === 'gbp'} label="Enter £" onPress={() => setMode('gbp')} /><FinChip on={mode === 'qty'} label="Enter qty" onPress={() => setMode('qty')} /></>}
        <Check label="Hide 0% lines" value={hideZero} onChange={setHideZero} />
        {stage === 'draft' && <View style={{ marginLeft: 'auto' }}><Button small kind="ghost" busy={!!busy} title="Upload edited Excel" onPress={() => void uploadExcel()} /></View>}
      </View>
      {stage === 'applied' && <CertTools a={a0} cert={cert} />}
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
        tools={!locked && isSec ? <View style={{ flexDirection: 'row', gap: 6 }}><Button small kind="ghost" title="Set all to 100%" onPress={() => fill(g[0], 100)} /><Button small kind="ghost" title="Set all to 0%" onPress={() => fill(g[0], 0)} /></View> : undefined}>
      {locked && desk && (
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, backgroundColor: '#F4F5F7', borderBottomWidth: 1, borderColor: base.cardLine, paddingVertical: 6, paddingHorizontal: 12 }}>
          {([['Applied %', 62], ['Applied', 96], [stage === 'applied' && mode !== 'pct' ? (mode === 'gbp' ? 'Certified £' : 'Certified qty') : 'Certified %', CERT_W], ['Certified', 96]] as [string, number][]).map(([x, w]) => <Text key={x} style={{ width: w, textAlign: 'right', fontSize: 12.5, fontWeight: '600', color: base.slate }}>{x}</Text>)}
        </View>
      )}
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
        return (
          <View key={i} style={{ flexDirection: desk ? 'row' : 'column', alignItems: desk ? 'center' : 'stretch', gap: 8, paddingVertical: desk ? 11 : 10, paddingHorizontal: 12, borderBottomWidth: 1, borderColor: base.cardLine }}>
            <View style={desk ? { flex: 1 } : undefined}>
              <Text style={{ color: base.ink, fontSize: desk ? 15 : 14 }}><Text style={{ color: base.slate }}>{l.ref ? `${l.ref}  ` : ''}</Text>{l.description}</Text>
              <Muted>{hasQty ? `${l.qty} ${l.unit || ''} × ${money(l.rate)} = ` : 'Value '}{money(l.value)}{siteProgress[l.item_id] != null ? <Text style={{ color: siteProgress[l.item_id] > pct(l.pct) ? '#b45309' : base.slate, fontWeight: '500' }}>{`  · Site ${siteProgress[l.item_id]}%`}</Text> : null}{siteProgress[l.item_id] != null && !locked && siteProgress[l.item_id] !== pct(l.pct) ? <Text onPress={() => { const was = pct(l.pct), to = pct(siteProgress[l.item_id]); setLine(i, { pct: to }); setGen((g) => g + 1); toast(`${l.description}: ${was}% → ${to}% from site — check, then Save`); }} style={{ color: base.blue, fontWeight: '600', textDecorationLine: 'underline' }}> Use</Text> : null}{siteProgress[l.item_id] == null && Object.keys(siteProgress).length > 0 ? <Text style={{ fontSize: 10.5, fontWeight: '500', color: base.slate }}>  · Not on site schedule</Text> : null}</Muted>
              {/* Previous = certified on this line last time; This time = to date less previous (9219r). */}
              {(() => { const prev = round2((Number(l.value || 0) * (prevPct[l.item_id] || 0)) / 100); return prev || l.gross ? <Muted style={{ fontSize: 11.5 }}>Previous {money(prev)} · This time {money(round2(l.gross - prev))}</Muted> : null; })()}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: desk ? 'nowrap' : 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            {locked ? <Text style={{ width: 62, textAlign: 'right', color: base.ink }}>{pct(l.pct)}%</Text> : <AmountBox key={`p${i}-${gen}`} p={pct(l.pct)} value={l.value} qty={l.qty} unit={l.unit} mode={over[l.item_id] || mode} onMode={flip(l.item_id)} labels={['Percent done', 'Amount done', 'Quantity done']} onPct={(x) => setLine(i, { pct: x })} />}
            <Text style={{ width: 96, textAlign: 'right', fontSize: desk ? 15 : 14, fontWeight: '600', color: base.ink }}>{money(l.gross)}</Text>
            {stage === 'applied' && (() => { const p0 = pct(cert.cp[`l${i}`]); return (
              <>
                <View style={{ width: CERT_W, alignItems: 'flex-end' }}><AmountBox p={p0} value={l.value} qty={l.qty} unit={l.unit} mode={over[l.item_id] || mode} onMode={flip(l.item_id)} labels={CERT_LABELS} onPct={(x) => cert.applyLines({ ...cert.cp, [`l${i}`]: String(x) })} /></View>
                <Text style={{ width: 96, textAlign: 'right', fontSize: desk ? 15 : 14, fontWeight: '600', color: p0 !== pct(l.pct) ? '#b45309' : base.ink }}>{money(round2((Number(l.value || 0) * p0) / 100))}</Text>
              </>
            ); })()}
            {(stage === 'certified' || stage === 'invoiced') && (() => { const cl = (a0.cert_lines || []).find((x: Row) => x.item_id === l.item_id); return (
              <>
                <Text style={{ width: CERT_W, textAlign: 'right', color: base.ink }}>{cl ? `${pct(cl.pct)}%` : '—'}</Text>
                <Text style={{ width: 96, textAlign: 'right', fontSize: desk ? 15 : 14, fontWeight: '600', color: base.ink }}>{cl ? money(cl.gross) : '—'}</Text>
              </>
            ); })()}
            </View>
          </View>
        );
      })}
      </SecBlock>
        );
      })}
      {!locked && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: desk ? 24 : 18 }}>
          <Button small kind="ghost" title="+ Add a line" onPress={() => setAdding('line')} />
          <Button small kind="ghost" title="+ Add a section" onPress={() => setAdding('section')} />
        </View>
      )}
      {adding && me && (
        <FinForm title={adding === 'line' ? 'Add a line' : 'Add a section'} onClose={() => setAdding(null)}
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
      {(c.variations.length > 0 || !locked) && <SecBlock title="Variations" total={round2(c.variations.reduce((n: number, v: Row) => n + Number(v.gross || 0), 0))} tools={!locked ? <Button small kind="ghost" title="+ Variation line" onPress={() => setA({ ...a, variations: [...(a.variations || []), { variation_id: null, description: '', value: null, pct: 100 }] })} /> : undefined}>
      {c.variations.map((v: Row, i: number) => (
        <View key={i} style={{ flexDirection: desk ? 'row' : 'column', alignItems: desk ? 'center' : 'stretch', gap: 8, paddingVertical: 8, paddingHorizontal: 12, borderBottomWidth: 1, borderColor: base.cardLine }}>
          {locked ? <Text style={desk ? { flex: 1, color: base.ink } : { color: base.ink }}>{v.description}</Text> : <TextInput value={v.description} onChangeText={(x) => setA({ ...a, variations: a.variations.map((y: Row, j: number) => (j === i ? { ...y, description: x } : y)) })} placeholder="Description" style={[box, desk ? { flex: 1 } : null]} />}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          {locked ? <Text style={{ color: base.slate }}>{Number(v.qty) > 1 ? `${v.qty} × ${money(v.rate)} = ` : ''}{money(v.value)} @ {pct(v.pct)}%</Text> : (
            <>
              <Text style={{ color: base.slate, fontSize: 13 }}>Qty</Text>
              <TextInput accessibilityLabel="Variation quantity" defaultValue={v.qty != null ? String(v.qty) : '1'} onChangeText={(x) => setVar(i, { qty: x })} keyboardType="decimal-pad" selectTextOnFocus style={[box, { width: 56 }]} />
              <Text style={{ color: base.slate }}>×</Text>
              <TextInput defaultValue={v.rate != null ? String(v.rate) : v.value != null ? String(v.value) : ''} onChangeText={(x) => setVar(i, { rate: x })} placeholder="£ value" keyboardType="decimal-pad" selectTextOnFocus style={[box, { width: 90 }]} />
              <AmountBox key={`vp${i}-${gen}`} p={pct(v.pct)} value={v.value} mode={mode === 'gbp' ? 'gbp' : 'pct'} labels={['Percent done', 'Amount done', 'Quantity done']} onPct={(x) => setA({ ...a, variations: a.variations.map((y: Row, j: number) => (j === i ? { ...y, pct: x } : y)) })} />
            </>
          )}
          {(() => {
            const sp = varProgress[v.fin_variation_id || v.variation_id || ''];
            if (sp == null) return null;
            const can = !locked && sp !== pct(v.pct);
            return <Text onPress={can ? () => { const was = pct(v.pct), to = pct(sp); setA({ ...a, variations: a.variations.map((y: Row, j: number) => (j === i ? { ...y, pct: to } : y)) }); setGen((g) => g + 1); toast(`${v.description || 'Variation'}: ${was}% → ${to}% from site`); } : undefined} style={{ fontSize: 11.5, fontWeight: '500', color: sp > pct(v.pct) ? '#b45309' : base.slate }}>Site {sp}%{can ? <Text style={{ color: base.blue, fontWeight: '600', textDecorationLine: 'underline' }}> Use</Text> : null}</Text>;
          })()}
          <Text style={{ marginLeft: 'auto', minWidth: 90, textAlign: 'right', fontWeight: '600', color: base.ink }}>{money(v.gross)}</Text>
          {stage === 'applied' && <><View style={{ width: CERT_W, alignItems: 'flex-end' }}><AmountBox p={pct(cert.cp[`v${i}`])} value={v.value} qty={Number(v.qty) > 1 ? v.qty : null} mode={over[`v${i}`] || mode} onMode={flip(`v${i}`)} labels={CERT_LABELS} onPct={(x) => cert.applyLines({ ...cert.cp, [`v${i}`]: String(x) })} /></View><Text style={{ width: 96, textAlign: 'right', fontWeight: '600', color: base.ink }}>{money(round2((Number(v.value || 0) * pct(cert.cp[`v${i}`])) / 100))}</Text></>}
          </View>
        </View>
      ))}
      </SecBlock>}
      {/* 902: typed day works can be added and changed on a draft; ones from the Day works register stay as they are. */}
      {(c.dayworks.length > 0 || !locked) && <SecBlock title="Day works" total={round2(c.dayworks.reduce((n: number, d: Row) => n + Number(d.gross || 0), 0))} tools={!locked ? <Button small kind="ghost" title="+ Add daywork" onPress={() => setA({ ...a, dayworks: [...(a.dayworks || []), { description: '', value: null }] })} /> : undefined}>
      {c.dayworks.map((d: Row, i: number) => (locked || d.fin_daywork_id) ? <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderColor: base.cardLine }}><Text style={{ flex: 1, color: base.ink }}>{d.description}</Text><Text style={{ fontWeight: '600', color: base.ink }}>{money(d.gross)}</Text>{stage === 'applied' && <View style={{ width: 180, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}><Text style={{ color: base.slate }}>£</Text><TextInput accessibilityLabel="Certified amount" value={cert.cp[`d${i}`]} onChangeText={(x) => cert.applyLines({ ...cert.cp, [`d${i}`]: x })} keyboardType="decimal-pad" selectTextOnFocus style={[box, { width: 96, height: 30, paddingVertical: 2, fontSize: 13 }]} /></View>}</View> : (
        <View key={i} style={{ flexDirection: desk ? 'row' : 'column', alignItems: desk ? 'center' : 'stretch', gap: 8, paddingVertical: 8, paddingHorizontal: 12, borderBottomWidth: 1, borderColor: base.cardLine }}>
          <TextInput value={d.description || ''} onChangeText={(x) => setA({ ...a, dayworks: a.dayworks.map((y: Row, j: number) => (j === i ? { ...y, description: x } : y)) })} placeholder="Description" style={[box, desk ? { flex: 1 } : null]} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <TextInput defaultValue={d.value != null ? String(d.value) : ''} onChangeText={(x) => setA({ ...a, dayworks: a.dayworks.map((y: Row, j: number) => (j === i ? { ...y, value: num(x) } : y)) })} placeholder="£ value" keyboardType="decimal-pad" selectTextOnFocus style={[box, { width: 100 }]} />
          <Text style={{ width: 90, textAlign: 'right', fontWeight: '500', color: base.ink }}>{money(d.gross)}</Text>
          </View>
        </View>
      ))}
      </SecBlock>}
      {stage === 'applied' && <View style={{ alignSelf: 'flex-end', marginBottom: 12 }}><Button title="Back to Overview to save the certificate" onPress={() => setView('overview')} /></View>}
      </>}
      {stage === 'draft' && (
        <ActionRow note={autoNote} onDelete={async () => { if (await confirmAsk('Delete this draft application?', 'Delete')) { if (await deleteApplication(a0.id)) { toast('Draft deleted'); refresh(); router.back(); } else toast('Not saved — check your signal and try again.'); } }}>
          <Button kind="ghost" busy={busy === 'save'} title="Save" onPress={() => void save()} />
          <Button title="Mark as Applied" onPress={async () => {
            if (!(await save(true))) return;
            if (!(await confirmAsk('Mark this application as Applied? It will be locked so the figures can’t change. You can return it to draft if you need to edit it.', 'Mark applied'))) return;
            if (await setStatus(a0.id, { status: 'submitted', submitted_at: new Date().toISOString() })) { toast('Applied — now locked.'); refresh(); } else toast('Not saved — check your signal and try again.');
          }} />
        </ActionRow>
      )}
    </ScrollView>
    {view === 'lines' && (
      <View accessibilityLabel="Totals" style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', columnGap: desk ? 26 : 12, backgroundColor: t.brand1, paddingVertical: 8, paddingHorizontal: 16 }}>
        <Text style={{ fontSize: desk ? 14 : 12, color: t.brand1Text }}>Applied to date <Text style={{ fontWeight: '600' }}>{money(c.gross)}</Text></Text>
        {certFig && <Text style={{ fontSize: desk ? 14 : 12, color: t.brand1Text }}>Certified to date <Text style={{ fontWeight: '600' }}>{money(certFig.gross)}</Text></Text>}
        <Text style={{ fontSize: desk ? 14 : 12, color: t.brand1Text }}>Due this time <Text style={{ fontWeight: '600' }}>{money(dueNow)}</Text></Text>
      </View>
    )}
    <ThinExportBar busy={busy ? 'x' : undefined} onExcel={() => void exportAs('xlsx')} onPdf={() => void exportAs('pdf')} />
    </View>
  );
}

type Entry = 'pct' | 'gbp' | 'qty';
const CERT_W = 124;
const CERT_LABELS: [string, string, string] = ['Certified percent', 'Certified amount', 'Certified quantity'];

/** One box for how far a line has got, typed as a %, in £ or as a quantity. It's always kept as a %, which every sum uses. */
function AmountBox({ p, value, qty, unit, mode, onMode, labels, onPct }: { p: number; value: unknown; qty?: unknown; unit?: string | null; mode: Entry; onMode?: (m: Entry) => void; labels: [string, string, string]; onPct: (p: number) => void }) {
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

/** The valuation at a glance: each kind of work against what's applied, certified, gone before and due now. */
function ValGrid({ heads, rows, desk }: { heads: string[]; rows: GridRow[]; desk: boolean }) {
  const t = useTheme();
  const w = desk ? undefined : 92;
  const cell = (x: number | null, r: GridRow) => (x == null ? '' : r.neg ? (x > 0 ? `−${money(x)}` : money(-x)) : money(x));
  const grid = (
    <View style={desk ? undefined : { minWidth: 140 + 92 * heads.length }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, backgroundColor: '#F4F5F7', borderBottomWidth: 1, borderColor: base.cardLine, paddingVertical: 7, paddingHorizontal: 12 }}>
        <View style={{ flex: 1.2, minWidth: 110 }} />
        {heads.map((h) => <Text key={h} style={{ flex: w ? undefined : 1, width: w, textAlign: 'right', fontSize: 12.5, fontWeight: '600', color: base.slate }}>{h}</Text>)}
      </View>
      {rows.map((r) => (
        <View key={r.l} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, paddingHorizontal: 12, borderBottomWidth: r.total ? 0 : 1, borderColor: base.cardLine, backgroundColor: r.total ? t.brand1 : r.bold ? '#F4F5F7' : undefined }}>
          <Text style={{ flex: 1.2, minWidth: 110, fontSize: 14, fontWeight: r.bold || r.total ? '600' : '400', color: r.total ? t.brand1Text : base.ink }}>{r.l}</Text>
          {r.v.map((x, i) => <Text key={i} style={{ flex: w ? undefined : 1, width: w, textAlign: 'right', fontSize: 14, fontWeight: r.bold || r.total || i === r.v.length - 1 ? '600' : '400', color: r.total ? t.brand1Text : base.ink }}>{cell(x, r)}</Text>)}
        </View>
      ))}
    </View>
  );
  return desk ? grid : <ScrollView horizontal showsHorizontalScrollIndicator={false}>{grid}</ScrollView>;
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
/** The page's main buttons in one row: shared evenly, with a small Delete on the end. */
function ActionRow({ children, onDelete, note }: { children: ReactNode; onDelete?: () => void; note?: string }) {
  return (
    <View style={{ marginTop: 10, marginBottom: 6 }}>
      {!!note && <Muted style={{ fontSize: 12, marginBottom: 6 }}>{note}</Muted>}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {(Array.isArray(children) ? children : [children]).filter(Boolean).map((b, i) => <View key={i} style={{ flex: 1, minWidth: 0 }}>{b}</View>)}
        {!!onDelete && <Button small kind="ghost" title="Delete" onPress={onDelete} />}
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
        {of != null && <Text style={{ fontSize: desk ? 14 : 12, color: t.brand1Text }}>Section value <Text style={{ fontWeight: '600' }}>{money(of)}</Text></Text>}
        {of ? <Text style={{ fontSize: desk ? 14 : 12, color: t.brand1Text }}>Complete <Text style={{ fontWeight: '600' }}>{Math.round((total / of) * 1000) / 10}%</Text></Text> : null}
        <Text style={{ fontSize: desk ? 14 : 12, color: t.brand1Text }}>To date <Text style={{ fontWeight: '600' }}>{money(total)}</Text></Text>
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

/** Quick ways to fill in the Certified column, above the Bill. */
function CertTools({ a, cert }: { a: Row; cert: Cert }) {
  const toast = useToast();
  const { cp, applyLines, setFile, xlNote, setXlNote } = cert;
  return (
    <View style={{ marginBottom: 12 }}>
      <Muted style={{ marginBottom: 8 }}>Enter what the client certified in the Certified column on each line. Lines start at what they last certified.</Muted>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <Button small kind="ghost" title="Certified as applied" onPress={cert.asApplied} />
        <Button small kind="ghost" title="Fill in from the client's Excel" onPress={async () => {
          const items = await pickAppExcel(toast); if (!items) return;
          const r = certFromItems(a, items);
          if (!r.found) { toast('That doesn’t look like this application’s Excel — download it from OpHUB, send it to the client and upload their copy.'); return; }
          applyLines({ ...cp, ...r.cp });
          setXlNote(`Read from the client’s Excel. ${r.diffs.length ? `${r.diffs.length} line${r.diffs.length === 1 ? ' differs' : 's differ'} from what you applied for:\n${r.diffs.slice(0, 8).join('\n')}${r.diffs.length > 8 ? `\n…and ${r.diffs.length - 8} more` : ''}` : 'Every line matches what you applied for.'} Check the figures, then save.`);
          toast('Certificate filled in from the Excel');
        }} />
        <Button small kind="ghost" title="Fill in from the client's PDF" onPress={async () => {
          // 9219p finCertFromPdf: each line's certified % read from the client's PDF (the last % on the matching row);
          // the PDF is kept as the certificate copy. Needs the PDF's text, so not a scan.
          const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true }); if (r.canceled || !r.assets[0]) return;
          const asset = r.assets[0];
          const rows = await pdfLines(new Uint8Array(await (await fetch(asset.uri)).arrayBuffer()));
          setFile({ uri: asset.uri, name: asset.name || 'certificate.pdf', mimeType: 'application/pdf' });
          if (!rows) { toast('Couldn’t read any text in that PDF (a scan, or on a phone) — enter the Certified % on each line. The PDF is kept with the certificate.'); return; }
          const norm = (x: unknown) => String(x || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
          const next: Record<string, string> = {}; let found = 0;
          (a.lines || []).forEach((l: Row, i: number) => {
            if (!isItem(l)) return; const dsc = norm(l.description); if (!dsc) return;
            const row = rows.find((x) => norm(x).includes(dsc.slice(0, 40))); if (!row) return;
            const pcts = (row.match(/(\d{1,3}(?:\.\d+)?)\s?%/g) || []).map((x) => Number(x.replace(/[^\d.]/g, ''))).filter((n) => n <= 100);
            if (pcts.length) { next[`l${i}`] = String(pcts[pcts.length - 1]); found++; }
          });
          if (!found) { toast('Read the PDF but couldn’t match any lines — enter the Certified % on each line. The PDF is kept with the certificate.'); return; }
          applyLines({ ...cp, ...next });
          toast(`Read ${found} line${found === 1 ? '' : 's'} from the PDF — check them, then save`);
        }} />
      </View>
      {!!xlNote && <Card style={{ backgroundColor: '#f4f8fd', marginTop: 8, marginBottom: 0 }}><Text style={{ color: base.ink, fontSize: 12.5 }}>{xlNote}</Text></Card>}
    </View>
  );
}

function Certificate({ a, cert, onSaved, onLines, jf, actions }: { a: Row; jf: Row; cert: Cert; onSaved: () => void; onLines: () => void; actions: (save: ReactNode) => ReactNode }) {
  const { me, org } = useAuth();
  const { data: site } = useSite(a.site_id);
  const toast = useToast();
  const { cp, v, setV, file, setFile, certApp } = cert;
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
    <Panel title="Client's certificate">
      <View style={{ padding: 12 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}><Button small kind="ghost" title="Enter the certified figures line by line" onPress={onLines} /><Button small kind="ghost" title="Certified as applied" onPress={cert.asApplied} /></View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 8 }}>
        {f('cert_date', 'Certificate date')}
      </View>
      {n('cert_gross') ? <SumRow bold l="Net due" v={money(net)} /> : null}
      <Text style={{ color: !n('cert_gross') ? base.slate : diff < 0 ? '#C0392B' : diff > 0 ? '#1E7A3C' : base.slate, marginTop: 6, marginBottom: 6 }}>{!n('cert_gross') ? 'Nothing certified yet.' : diff ? `${diff < 0 ? 'Short by' : 'Over by'} ${money(Math.abs(diff))} compared with the ${money(a.net_due)} applied for.` : 'Matches what was applied for.'}</Text>
      <Check label="This is a pay-less notice" value={!!v.cert_is_payless} onChange={(x) => setV({ ...v, cert_is_payless: x })} />
      <TextInput value={v.cert_notes} onChangeText={(x) => setV({ ...v, cert_notes: x })} placeholder="Notes, e.g. reason for any shortfall" style={[box, { marginVertical: 6 }]} />
      <Pressable onPress={async () => { const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true }); if (!r.canceled && r.assets[0]) setFile({ uri: r.assets[0].uri, name: r.assets[0].name, mimeType: r.assets[0].mimeType }); }}><Text style={{ color: base.blue, marginBottom: 6 }}>📎 {file ? file.name : 'Copy of the certificate (optional)'}</Text></Pressable>
      <Check label="Raise and issue the invoice now" value={!!v.invoiceNow} onChange={(x) => setV({ ...v, invoiceNow: x })} />
      {actions(<Button busy={busy} title="Save certificate" onPress={async () => {
        const vals = ['cert_gross', 'cert_retention', 'cert_previous', 'cert_discount'].map((k) => num(v[k]));
        if (vals.some((x) => x === null || isNaN(x))) { toast('Fill in every amount (0 if none).'); return; }
        setBusy(true);
        try {
          const ca = appCalc(certApp(), jf.contract_value, jf.retention_limit_pct, vals[2] as number);
          // The extra fields let the old app show these too, while both are in use (9219p).
          const certLines = [...ca.lines.filter(isItem).map((l: Row) => ({ item_id: l.item_id, pct: l.pct, gross: l.gross, value: l.value, applied_pct: pct((a.lines || []).find((y: Row) => y.item_id === l.item_id)?.pct) })), ...ca.variations.map((x: Row, i: number) => ({ var_index: i, fin_variation_id: x.fin_variation_id || null, variation_id: x.variation_id || null, description: x.description, pct: x.pct, gross: x.gross, value: x.value, applied_pct: pct(a.variations?.[i]?.pct) })), ...ca.dayworks.map((d: Row, i: number) => ({ day_index: i, fin_daywork_id: d.fin_daywork_id || null, description: d.description, gross: d.gross }))];
          const e = await saveCertificate(me, a, { ...v, cert_gross: vals[0], cert_retention: vals[1], cert_previous: vals[2], cert_discount: vals[3], cert_net: net, cert_lines: certLines }, file);
          if (e) { toast(e); return; }
          if (v.invoiceNow && net > 0) {
            const r = await raiseInvoiceFromCert(me, org, { ...a, cert_gross: vals[0], cert_retention: vals[1], cert_previous: vals[2], cert_discount: vals[3], cert_net: net, cert_date: v.cert_date }, site as never, true);
            if (r.error) showAlert(r.error); else if (r.needsBill) toast('Certificate saved — add who the invoice is to, then issue it.');
            onSaved(); if (r.id) router.push(`/fin/job/${a.site_id}/invoice/${r.id}` as never); return;
          }
          toast('Certificate saved'); onSaved();
        } finally { setBusy(false); }
      }} />)}
      </View>
    </Panel>
  );
}
