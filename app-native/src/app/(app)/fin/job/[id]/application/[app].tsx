// An application for payment (902 renderFinApplication + 903 certificate).
// "new" starts one from the Bill of Quantities. Draft: % (or £) done per line,
// set a whole section, variations and day works, discount and retention.
// Applied: locked. Then enter the client's certificate (or pay-less notice)
// and raise the invoice from it. Emailing it is off during the Finance trial.
import * as DocumentPicker from 'expo-document-picker';
import { pdfLines } from '@/lib/pdfjs';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { FinChip, FinRow, FinStat } from '@/components/FinNav';
import { chooseAction, confirmAsk, showAlert, useToast } from '@/components/toast';
import { FinForm } from '@/components/FinForm';
import { Button, Card, Check, Muted, SectionTitle } from '@/components/ui';
import { viewDoc } from '@/components/DocViewer';
import { DateBox } from '@/components/DateField';
import { addBoqLines, addBoqSection, clearCertificate, deleteApplication, deleteApplicationAny, exportApplication, appSowChoice, type AppSow, loadApplication, newApplication, raiseInvoiceFromCert, saveApplication, saveCertificate, setStatus } from '@/data/finApp';
import { openDocLink } from '@/data/hs';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { plainGet, plainSet } from '@/lib/kv';
import { useFlushOnLeave } from '@/lib/useFlushOnLeave';
import { APP_STAGE, appCalc, groupTotals, isItem, pct } from '@/lib/rules/finApp';
import { applyAppUpload, certFromItems, parseAppBook, type AppXlItem } from '@/lib/rules/finAppExcel';
import { readXlsx } from '@/lib/rules/xlsxRead';
import { fdate, money, num, round2, today } from '@/lib/rules/finance';
import { base, page, radius, space } from '@/theme/theme';

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
  const { data, isLoading } = useQuery({ queryKey: ['finApp', app], enabled: app !== 'new', gcTime: 0, queryFn: () => loadApplication(app) });
  if (app === 'new' || isLoading) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  if (!data) return <Muted style={{ padding: space.l }}>Application not found.</Muted>;
  return <Editor key={`${data.a.id}${data.a.updated_at}`} a0={data.a} jf={data.jf} previousLive={data.previousLive} prevPct={data.prevPct} siteProgress={data.siteProgress} />;
}

function Editor({ a0, jf, previousLive, prevPct, siteProgress }: { a0: Row; jf: Row; previousLive: number; prevPct: Record<string, number>; siteProgress: Record<string, number> }) {
  const { me, org } = useAuth();
  const { data: site } = useSite(a0.site_id);
  const toast = useToast();
  const qc = useQueryClient();
  const [a, setA] = useState<Row>(() => JSON.parse(JSON.stringify(a0)));
  const [mode, setMode] = useState<'pct' | 'gbp'>('pct');
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
  const fill = (i: number, p: number) => { const lv = a.lines[i].kind, ls = a.lines.slice(); for (let j = i + 1; j < ls.length; j++) { const k = ls[j].kind; if (k === 'section' || (lv === 'subsection' && k === 'subsection')) break; if (isItem(ls[j])) ls[j] = { ...ls[j], pct: p }; } setA({ ...a, lines: ls }); setGen((g) => g + 1); };
  const exportAs = async (kind: 'xlsx' | 'pdf') => {
    if (!me) return;
    if (isDraft && JSON.stringify(a) !== savedSnap.current && !(await save(true))) return;
    // Proof of works (9219zo): ask whether to include the Schedule of Works report.
    const doc = isDraft ? { ...a0, ...a } : a0;
    let sow: AppSow = null;
    const ch = await appSowChoice(doc).catch(() => ({ has: false, since: null }));
    if (ch.has) {
      const k = await chooseAction(`Include the Schedule of Works report as proof of works?${kind === 'pdf' ? ' It goes at the end of the PDF.' : ' It downloads as a PDF beside the Excel.'}`, [{ key: 'full', label: '📋 Yes — the whole Schedule of Works' }, ...(ch.since ? [{ key: 'since', label: `📷 Yes — photos since the last application (${fdate(ch.since.from)} – ${fdate(ch.since.to)})` }] : []), { key: 'no', label: 'No — just the application' }]);
      if (!k) return;
      sow = k === 'full' ? { mode: 'full' } : k === 'since' && ch.since ? { mode: 'since', ...ch.since } : null;
    }
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
  const contractTotal = c.lines.filter(isItem).reduce((t: number, l: Row) => t + Number(l.value || 0), 0), contractDone = c.lines.reduce((t: number, l: Row) => t + l.gross, 0);
  return (
    <ScrollView contentContainerStyle={page(1000)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: `Application ${a0.number}` }} />
      {!!autoNote && <Muted style={{ marginBottom: 6, textAlign: 'right', fontSize: 12 }}>{autoNote}</Muted>}
      {!!a0.retention_release && <Card style={{ backgroundColor: '#f1fbf5', borderColor: '#d3f0de' }}><Text style={{ color: base.ink }}><Text style={{ fontWeight: '800' }}>Retention release — {a0.retention_release === 1 ? 'first half (practical completion)' : 'final release'}.</Text> Retention on this application is {pct(a0.retention_pct)}%, so the client pays back {a0.retention_release === 1 ? 'half of what they hold' : 'what they still hold'} when they certify it.</Text></Card>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <FinStat v={STAGE[stage]} label="Stage" /><FinStat v={money(c.net_due)} label="Amount due this application" />
        <FinStat v={fdate(a.valuation_date)} label="Valuation date" /><FinStat v={a.final_date ? fdate(a.final_date) : '—'} label="Final date for payment" />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <Button kind="ghost" busy={busy === 'xlsx'} title="⬇ Download Excel" onPress={() => void exportAs('xlsx')} />
        <Button kind="ghost" busy={busy === 'pdf'} title="⬇ Download PDF" onPress={() => void exportAs('pdf')} />
        {stage === 'draft' && <Button kind="ghost" busy={busy === 'up'} title="⬆ Upload edited Excel" onPress={() => void uploadExcel()} />}
      </View>
      {!locked && (
        <Card>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {[['valuation_date', 'Valuation date'], ['due_date', 'Due date'], ['final_date', 'Final date']].map(([k, l]) => <View key={k} style={{ flexGrow: 1 }}><Muted>{l}</Muted><DateBox value={a[k] || ''} onChange={(v) => setA({ ...a, [k]: v })} title={l} style={{ marginBottom: 8 }} /></View>)}
          </View>
        </Card>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8, alignItems: 'center' }}>
        {!locked && <><FinChip on={mode === 'pct'} label="Enter %" onPress={() => setMode('pct')} /><FinChip on={mode === 'gbp'} label="Enter £" onPress={() => setMode('gbp')} /></>}
        <Check label="Hide 0% lines" value={hideZero} onChange={setHideZero} />
      </View>
      <SectionTitle>Bill of Quantities</SectionTitle>
      {!locked && Object.keys(siteProgress).length > 0 && (() => {
        // Site progress from the operatives' Schedule of Works (918): lines where site is ahead can be brought up to it.
        const ahead = (a.lines || []).filter((l: Row) => isItem(l) && siteProgress[l.item_id] != null && siteProgress[l.item_id] > pct(l.pct)).length;
        return (
          <Card style={{ backgroundColor: ahead ? '#fffaf0' : '#f1fbf5' }}>
            <Text style={{ color: base.ink }}>{ahead ? `Site progress is ahead on ${ahead} line${ahead === 1 ? '' : 's'} (from the operatives’ Schedule of Works).` : 'Matches site progress from the operatives’ Schedule of Works.'}</Text>
            {ahead > 0 && <View style={{ marginTop: 6 }}><Button kind="ghost" title="Use site progress" onPress={() => {
              let n = 0;
              const lines = (a.lines || []).map((l: Row) => { if (isItem(l) && siteProgress[l.item_id] != null && siteProgress[l.item_id] > pct(l.pct)) { n++; return { ...l, pct: pct(siteProgress[l.item_id]) }; } return l; });
              setA({ ...a, lines }); setGen((g) => g + 1); toast(n ? `${n} line${n === 1 ? '' : 's'} updated from site progress — check them` : 'Already matches site progress');
            }} /></View>}
          </Card>
        );
      })()}
      {c.lines.map((l: Row, i: number) => {
        if (l.kind === 'section' || l.kind === 'subsection') {
          const t = tots[i];
          return (
            <View key={i} style={{ paddingVertical: 8, borderBottomWidth: 1, borderColor: base.line, marginTop: l.kind === 'section' ? 8 : 0 }}>
              <View style={{ flexDirection: 'row' }}>
                <Text style={{ flex: 1, fontWeight: '800', color: base.ink, fontSize: l.kind === 'section' ? 15 : 13.5 }}>{l.ref ? `${l.ref} ` : ''}{l.description}</Text>
                <Text style={{ fontWeight: '700', color: base.ink }}>{money(t?.gross || 0)} <Text style={{ color: base.slate, fontWeight: '400' }}>of {money(t?.value || 0)}</Text></Text>
              </View>
              {!locked && l.kind === 'section' && <View style={{ flexDirection: 'row', gap: 14 }}><Pressable onPress={() => fill(i, 100)}><Text style={{ color: base.blue }}>Set all to 100%</Text></Pressable><Pressable onPress={() => fill(i, 0)}><Text style={{ color: base.slate }}>Set all to 0%</Text></Pressable></View>}
            </View>
          );
        }
        if (hideZero && !pct(l.pct)) return null;
        const hasQty = l.qty != null && Number(l.qty) !== 0;
        return (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, borderBottomWidth: 1, borderColor: base.line }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: base.ink }}>{l.ref ? `${l.ref} · ` : ''}{l.description}</Text>
              <Muted>{hasQty ? `${l.qty} ${l.unit || ''} × ${money(l.rate)} = ` : 'Value '}{money(l.value)}{siteProgress[l.item_id] != null ? <Text style={{ color: siteProgress[l.item_id] > pct(l.pct) ? '#b45309' : base.slate, fontWeight: '700' }}>{`  · Site ${siteProgress[l.item_id]}%`}</Text> : null}</Muted>
              {/* Previous = certified on this line last time; This time = to date less previous (9219r). */}
              {(() => { const prev = round2((Number(l.value || 0) * (prevPct[l.item_id] || 0)) / 100); return prev || l.gross ? <Muted style={{ fontSize: 11.5 }}>Previous {money(prev)} · This time {money(round2(l.gross - prev))}</Muted> : null; })()}
            </View>
            {locked ? <Text style={{ color: base.slate }}>{pct(l.pct)}%</Text> : mode === 'pct'
              ? <TextInput key={`p${i}-${gen}`} defaultValue={String(pct(l.pct))} onChangeText={(v) => setLine(i, { pct: pct(v) })} keyboardType="decimal-pad" style={[box, { width: 70 }]} />
              : <TextInput key={`g${i}-${gen}`} defaultValue={String(l.gross)} onChangeText={(v) => { const n = num(v), val = Number(l.value || 0); if (val && n !== null && !isNaN(n)) setLine(i, { pct: pct((n / val) * 100) }); }} keyboardType="decimal-pad" style={[box, { width: 100 }]} />}
            <Text style={{ width: 96, textAlign: 'right', fontWeight: '700', color: base.ink }}>{money(l.gross)}</Text>
          </View>
        );
      })}
      {!locked && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
          <Button kind="ghost" title="+ Add a line" onPress={() => setAdding('line')} />
          <Button kind="ghost" title="+ Add a section" onPress={() => setAdding('section')} />
        </View>
      )}
      {adding && me && (
        <FinForm title={adding === 'line' ? 'Add a line' : 'Add a section'} onClose={() => setAdding(null)}
          note={adding === 'line' ? 'It goes into the Bill of Quantities too, so it carries on to later applications.' : 'A new header at the end of the Bill of Quantities.'}
          initial={{ under: '', pct: '0' }}
          fields={adding === 'line' ? [
            { k: 'under', label: 'Under', kind: 'choice', options: [['', 'At the end'], ...(a.lines || []).filter((l: Row) => !isItem(l)).map((l: Row) => [l.item_id, `${l.ref ? `${l.ref} ` : ''}${l.description}`] as [string, string])] },
            { k: 'ref', label: 'Ref', half: true }, { k: 'description', label: 'Description', half: true },
            { k: 'qty', label: 'Qty', kind: 'number', half: true }, { k: 'unit', label: 'Unit', half: true },
            { k: 'rate', label: 'Rate £', kind: 'money', half: true }, { k: 'value', label: 'Or a lump sum £', kind: 'money', half: true },
            { k: 'pct', label: 'Applied % this time', kind: 'number', half: true },
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
            const made = await addBoqLines(me, a0.site_id, [{ under: String(v.under || ''), ref, desc, qty, unit: String(v.unit ?? '').trim() || null, rate, value, pct: n('pct') || 0 }]);
            if (!made?.length) return 'Could not save — try again.';
            const L: Row[] = [...(a.lines || [])];
            made.forEach(({ under, line }) => {
              const hi = under ? L.findIndex((l) => l.item_id === under) : -1;
              let at = L.length;
              if (hi >= 0) { at = hi + 1; while (at < L.length && L[at].kind !== 'section' && !(L[hi].kind === 'subsection' && L[at].kind === 'subsection')) at++; }
              L.splice(at, 0, line);
            });
            setA({ ...a, lines: L }); toast('Line added'); return null;
          }} />
      )}
      {(c.variations.length > 0 || !locked) && <SectionTitle>Variations</SectionTitle>}
      {c.variations.map((v: Row, i: number) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
          {locked ? <Text style={{ flex: 1, color: base.ink }}>{v.description}</Text> : <TextInput value={v.description} onChangeText={(x) => setA({ ...a, variations: a.variations.map((y: Row, j: number) => (j === i ? { ...y, description: x } : y)) })} style={[box, { flex: 1 }]} />}
          {locked ? <Text style={{ color: base.slate }}>{money(v.value)} @ {pct(v.pct)}%</Text> : (
            <>
              <TextInput defaultValue={v.value != null ? String(v.value) : ''} onChangeText={(x) => setA({ ...a, variations: a.variations.map((y: Row, j: number) => (j === i ? { ...y, value: num(x) } : y)) })} placeholder="£ value" keyboardType="decimal-pad" style={[box, { width: 90 }]} />
              <TextInput defaultValue={String(pct(v.pct))} onChangeText={(x) => setA({ ...a, variations: a.variations.map((y: Row, j: number) => (j === i ? { ...y, pct: pct(x) } : y)) })} keyboardType="decimal-pad" style={[box, { width: 56 }]} />
            </>
          )}
          <Text style={{ width: 90, textAlign: 'right', fontWeight: '700', color: base.ink }}>{money(v.gross)}</Text>
        </View>
      ))}
      {!locked && <Button kind="ghost" title="+ Variation line" onPress={() => setA({ ...a, variations: [...(a.variations || []), { variation_id: null, description: '', value: null, pct: 100 }] })} />}
      {/* 902: typed day works can be added and changed on a draft; ones from the Day works register stay as they are. */}
      {(c.dayworks.length > 0 || !locked) && <SectionTitle>Day works</SectionTitle>}
      {c.dayworks.map((d: Row, i: number) => (locked || d.fin_daywork_id) ? <FinRow key={i} title={d.description} right={money(d.gross)} /> : (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
          <TextInput value={d.description || ''} onChangeText={(x) => setA({ ...a, dayworks: a.dayworks.map((y: Row, j: number) => (j === i ? { ...y, description: x } : y)) })} placeholder="Description" style={[box, { flex: 1 }]} />
          <TextInput defaultValue={d.value != null ? String(d.value) : ''} onChangeText={(x) => setA({ ...a, dayworks: a.dayworks.map((y: Row, j: number) => (j === i ? { ...y, value: num(x) } : y)) })} placeholder="£ value" keyboardType="decimal-pad" style={[box, { width: 100 }]} />
          <Text style={{ width: 90, textAlign: 'right', fontWeight: '700', color: base.ink }}>{money(d.gross)}</Text>
        </View>
      ))}
      {!locked && <Button kind="ghost" title="+ Add daywork" onPress={() => setA({ ...a, dayworks: [...(a.dayworks || []), { description: '', value: null }] })} />}
      <SectionTitle>Summary</SectionTitle>
      <Card>
        <FinRow title={`Contract works to date${contractTotal ? ` (${Math.round((contractDone / contractTotal) * 1000) / 10}% of ${money(contractTotal)})` : ''}`} right={money(contractDone)} />
        {c.variations.length > 0 && <FinRow title="Variations" right={money(c.variations.reduce((t: number, x: Row) => t + x.gross, 0))} />}
        {c.dayworks.length > 0 && <FinRow title="Day works" right={money(c.dayworks.reduce((t: number, x: Row) => t + x.gross, 0))} />}
        <FinRow title="Gross valuation to date" right={money(c.gross)} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
          <Text style={{ flex: 1, color: base.ink }}>Less discount %</Text>
          {stage === 'draft' ? <TextInput defaultValue={String(pct(a.discount_pct || 0))} onChangeText={(v) => setA({ ...a, discount_pct: pct(v) })} keyboardType="decimal-pad" style={[box, { width: 64 }]} /> : <Text>{pct(a.discount_pct || 0)}%</Text>}
          <Text style={{ width: 96, textAlign: 'right', color: base.ink }}>−{money(c.discount)}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
          <Text style={{ flex: 1, color: base.ink }}>Less retention %{jf.retention_limit_pct ? ` (limit ${jf.retention_limit_pct}%)` : ''}</Text>
          {!locked ? <TextInput defaultValue={String(pct(a.retention_pct))} onChangeText={(v) => setA({ ...a, retention_pct: pct(v) })} keyboardType="decimal-pad" style={[box, { width: 64 }]} /> : <Text>{pct(a.retention_pct)}%</Text>}
          <Text style={{ width: 96, textAlign: 'right', color: base.ink }}>−{money(c.retention)}</Text>
        </View>
        <FinRow title="Less previously certified" right={`−${money(c.previous)}`} />
        <FinRow title="Amount due this application" right={money(c.net_due)} />
        {(jf.vat_treatment || 'standard') === 'standard' && <Muted>VAT @ 20% {money(round2(c.net_due * 0.2))} · total incl. VAT {money(round2(c.net_due * 1.2))}</Muted>}
        <Muted>Excl. VAT. An application isn&apos;t a VAT invoice; the invoice follows the certificate.</Muted>
      </Card>
      {stage === 'draft' && (
        <View style={{ gap: 8 }}>
          <Button kind="ghost" busy={busy === 'save'} title="Save" onPress={() => void save()} />
          <Button title="Mark as Applied (locks it)" onPress={async () => {
            if (!(await save(true))) return;
            if (!(await confirmAsk('Mark this application as Applied? It will be locked so the figures can’t change. You can return it to draft if you need to edit it.', 'Mark applied'))) return;
            if (await setStatus(a0.id, { status: 'submitted', submitted_at: new Date().toISOString() })) { toast('Applied — now locked.'); refresh(); }
          }} />
          <Button kind="ghost" title="Delete draft" onPress={async () => { if (await confirmAsk('Delete this draft application?', 'Delete')) { if (await deleteApplication(a0.id)) { toast('Draft deleted'); refresh(); router.back(); } } }} />
        </View>
      )}
      {stage === 'applied' && (
        <>
          <Certificate a={a0} jf={jf} previous={previousLive} onSaved={refresh} />
          <Button kind="ghost" title="Return to draft to edit" onPress={async () => { if (await confirmAsk('Return this application to draft so you can edit it?', 'Return to draft')) { if (await setStatus(a0.id, { status: 'draft' })) { toast('Back to draft — you can edit it now'); refresh(); } } }} />
          <Muted style={{ marginTop: 6 }}>Emailing the application to the client is switched off while Finance is on trial.</Muted>
        </>
      )}
      {stage !== 'draft' && <View style={{ marginTop: 8 }}><Button kind="ghost" title="🗑 Delete application" onPress={async () => {
        // Any stage (9219q finRowDelApp): not with an invoice, and only the latest one.
        if (!(await confirmAsk(`Delete application No. ${a0.number}?${a0.cert_net != null ? '\n\nIt has a certificate — that will be deleted too.' : ''}\n\nThis can’t be undone.`, 'Delete'))) return;
        const e = await deleteApplicationAny(a0); if (e) { showAlert(e); return; }
        toast('Application deleted'); refresh(); router.back();
      }} /></View>}
      {(stage === 'certified' || stage === 'invoiced') && (
        <Card>
          <SectionTitle>{a0.cert_is_payless ? 'Pay-less notice' : 'Payment certificate'} · {fdate(a0.cert_date)}</SectionTitle>
          <FinRow title="Total certified to date" right={money(a0.cert_gross)} /><FinRow title="Less retention" right={`−${money(a0.cert_retention)}`} /><FinRow title="Less previously certified" right={`−${money(a0.cert_previous)}`} />
          {Number(a0.cert_discount || 0) ? <FinRow title="Less discount" right={`−${money(a0.cert_discount)}`} /> : null}
          <FinRow title="Net due" right={money(a0.cert_net)} />
          {round2(Number(a0.cert_net) - Number(a0.net_due)) !== 0 && <Text style={{ color: Number(a0.cert_net) < Number(a0.net_due) ? '#C0392B' : '#1E7A3C', fontWeight: '700' }}>{Number(a0.cert_net) < Number(a0.net_due) ? 'Short by' : 'Over by'} {money(Math.abs(Number(a0.cert_net) - Number(a0.net_due)))} compared with the {money(a0.net_due)} applied for.</Text>}
          {a0.cert_notes ? <Muted>{a0.cert_notes}</Muted> : null}
          {a0.cert_file_path && <Pressable onPress={async () => { const u = await openDocLink('finance-docs', a0.cert_file_path); if (u) viewDoc(u); }}><Text style={{ color: base.blue, marginTop: 6 }}>📄 Certificate</Text></Pressable>}
          <View style={{ marginTop: 8, gap: 8 }}>
            {a0.invoice_id ? <Button title="🧾 Open invoice" onPress={() => router.push(`/fin/job/${a0.site_id}/invoice/${a0.invoice_id}` as never)} />
              : <Button busy={busy === 'inv'} title="🧾 Raise invoice" onPress={async () => { setBusy('inv'); const r = await raiseInvoiceFromCert(me, org, a0, site as never, false); setBusy(''); if (r.error) toast(r.error); if (r.id) { refresh(); router.push(`/fin/job/${a0.site_id}/invoice/${r.id}` as never); } }} />}
            {!a0.invoice_id && <Button kind="ghost" title="Change the certificate figures" onPress={async () => { if (await confirmAsk('Clear the certificate figures and enter them again?', 'Clear')) { if (await clearCertificate(a0.id)) refresh(); } }} />}
          </View>
        </Card>
      )}
    </ScrollView>
  );
}

function Certificate({ a, jf, previous, onSaved }: { a: Row; jf: Row; previous: number; onSaved: () => void }) {
  const { me, org } = useAuth();
  const { data: site } = useSite(a.site_id);
  const toast = useToast();
  const [v, setV] = useState<Row>({ cert_date: today(), cert_gross: String(round2(a.gross)), cert_retention: String(round2(a.retention)), cert_previous: String(round2(previous)), cert_discount: String(round2(a.discount != null ? Number(a.discount) : (Number(a.gross || 0) * Number(a.discount_pct || 0)) / 100)), cert_notes: '', cert_is_payless: false, invoiceNow: false });
  const [file, setFile] = useState<{ uri: string; name: string; mimeType?: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  // Certify line by line (9219p finCertTotals): a Certified % for each line and variation and an amount for each
  // day work; the totals (with discount, retention and its limit) are worked out from them.
  const [byLine, setByLine] = useState(false);
  const [xlNote, setXlNote] = useState('');
  const [cp, setCp] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    (a.lines || []).forEach((l: Row, i: number) => { if (isItem(l)) o[`l${i}`] = String(l.pct ?? 0); });
    (a.variations || []).forEach((x: Row, i: number) => { o[`v${i}`] = String(x.pct ?? 100); });
    (a.dayworks || []).forEach((d: Row, i: number) => { o[`d${i}`] = String(d.value ?? 0); });
    return o;
  });
  const certApp = () => ({
    ...a,
    lines: (a.lines || []).map((l: Row, i: number) => (isItem(l) ? { ...l, pct: pct(cp[`l${i}`]) } : l)),
    variations: (a.variations || []).map((x: Row, i: number) => ({ ...x, pct: pct(cp[`v${i}`]) })),
    dayworks: (a.dayworks || []).map((d: Row, i: number) => ({ ...d, value: num(cp[`d${i}`]) || 0 })),
  });
  const applyLines = (next: Record<string, string>) => {
    setCp(next);
    const c2 = appCalc({ ...certApp(), ...((): Row => { const o = { ...a }; o.lines = (a.lines || []).map((l: Row, i: number) => (isItem(l) ? { ...l, pct: pct(next[`l${i}`]) } : l)); o.variations = (a.variations || []).map((x: Row, i: number) => ({ ...x, pct: pct(next[`v${i}`]) })); o.dayworks = (a.dayworks || []).map((d: Row, i: number) => ({ ...d, value: num(next[`d${i}`]) || 0 })); return o; })() }, jf.contract_value, jf.retention_limit_pct, num(v.cert_previous) || 0);
    setV({ ...v, cert_gross: String(c2.gross), cert_discount: String(c2.discount), cert_retention: String(c2.retention) });
  };
  if (!me) return null;
  const n = (k: string) => num(v[k]) || 0;
  const net = round2(n('cert_gross') - n('cert_retention') - n('cert_previous') - n('cert_discount'));
  const diff = round2(net - Number(a.net_due));
  const f = (k: string, l: string) => <View key={k} style={{ flexBasis: '47%', flexGrow: 1, marginBottom: 6 }}><Muted>{l}</Muted>{k === 'cert_date'
    ? <DateBox value={String(v[k] ?? '')} onChange={(x) => setV({ ...v, [k]: x })} title={l} placeholder="Choose a date" style={{ paddingVertical: 8 }} />
    : <TextInput value={String(v[k])} onChangeText={(x) => setV({ ...v, [k]: x })} keyboardType="decimal-pad" style={box} />}</View>;
  return (
    <Card>
      <SectionTitle>Client&apos;s certificate</SectionTitle>
      <Muted style={{ marginBottom: 8 }}>When the client&apos;s certificate (or pay-less notice) comes back, enter its figures. They start as what you applied for.</Muted>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 8 }}>
        {f('cert_date', 'Certificate date')}{f('cert_gross', 'Total certified to date (£)')}{f('cert_retention', 'Retention held (£)')}{f('cert_previous', 'Previously certified (£)')}{f('cert_discount', 'Discount, if any (£)')}
      </View>
      <Pressable onPress={async () => {
        const items = await pickAppExcel(toast); if (!items) return;
        const r = certFromItems(a, items);
        if (!r.found) { toast('That doesn’t look like this application’s Excel — download it from OpHUB, send it to the client and upload their copy.'); return; }
        setByLine(true); applyLines({ ...cp, ...r.cp });
        setXlNote(`Read from the client’s Excel. ${r.diffs.length ? `${r.diffs.length} line${r.diffs.length === 1 ? ' differs' : 's differ'} from what you applied for:\n${r.diffs.slice(0, 8).join('\n')}${r.diffs.length > 8 ? `\n…and ${r.diffs.length - 8} more` : ''}` : 'Every line matches what you applied for.'} Check the figures, then save.`);
        toast('Certificate filled in from the Excel');
      }} style={{ marginBottom: 6 }}><Text style={{ color: base.blue, fontWeight: '700' }}>📥 Fill in from the client&apos;s Excel</Text></Pressable>
      <Pressable onPress={async () => {
        // 9219p finCertFromPdf: each line's certified % read from the client's PDF (the last % on the matching row);
        // the PDF is kept as the certificate copy. Needs the PDF's text, so not a scan.
        const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true }); if (r.canceled || !r.assets[0]) return;
        const asset = r.assets[0];
        const rows = await pdfLines(new Uint8Array(await (await fetch(asset.uri)).arrayBuffer()));
        setFile({ uri: asset.uri, name: asset.name || 'certificate.pdf', mimeType: 'application/pdf' });
        if (!rows) { toast('Couldn’t read any text in that PDF (a scan, or on a phone) — enter the Certified % on each line. The PDF is kept with the certificate.'); setByLine(true); return; }
        const norm = (x: unknown) => String(x || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        const next: Record<string, string> = {}; let found = 0;
        (a.lines || []).forEach((l: Row, i: number) => {
          if (!isItem(l)) return; const dsc = norm(l.description); if (!dsc) return;
          const row = rows.find((x) => norm(x).includes(dsc.slice(0, 40))); if (!row) return;
          const pcts = (row.match(/(\d{1,3}(?:\.\d+)?)\s?%/g) || []).map((x) => Number(x.replace(/[^\d.]/g, ''))).filter((n) => n <= 100);
          if (pcts.length) { next[`l${i}`] = String(pcts[pcts.length - 1]); found++; }
        });
        setByLine(true);
        if (!found) { toast('Read the PDF but couldn’t match any lines — enter the Certified % on each line. The PDF is kept with the certificate.'); return; }
        applyLines({ ...cp, ...next });
        toast(`Read ${found} line${found === 1 ? '' : 's'} from the PDF — check them, then Certify`);
      }} style={{ marginBottom: 6 }}><Text style={{ color: base.blue, fontWeight: '700' }}>📥 Fill in from the client&apos;s PDF</Text></Pressable>
      {!!xlNote && <Card style={{ backgroundColor: '#f4f8fd' }}><Text style={{ color: base.ink, fontSize: 12.5 }}>{xlNote}</Text></Card>}
      <Pressable onPress={() => setByLine(!byLine)} style={{ marginBottom: 6 }}><Text style={{ color: base.blue, fontWeight: '700' }}>{byLine ? '▼' : '▶'} Certify line by line</Text></Pressable>
      {byLine && (
        <View style={{ marginBottom: 8 }}>
          <Muted style={{ marginBottom: 6 }}>Type the client&apos;s Certified % against each line (and the amount for each day work). The totals above fill in from these.</Muted>
          {(a.lines || []).map((l: Row, i: number) => isItem(l) ? (
            <View key={`l${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4, borderTopWidth: 1, borderTopColor: '#F0F1F4' }}>
              <Text numberOfLines={2} style={{ flex: 1, color: base.ink, fontSize: 12.5 }}>{[l.ref, l.description].filter(Boolean).join(' ')}</Text>
              <Muted style={{ width: 70, textAlign: 'right', fontSize: 12 }}>applied {pct(l.pct)}%</Muted>
              <TextInput value={cp[`l${i}`]} onChangeText={(x) => applyLines({ ...cp, [`l${i}`]: x })} keyboardType="decimal-pad" style={[box, { width: 64, marginBottom: 0 }]} /><Text>%</Text>
            </View>
          ) : <Text key={`l${i}`} style={{ fontWeight: '800', color: base.ink, marginTop: 8 }}>{l.description}</Text>)}
          {(a.variations || []).map((x: Row, i: number) => (
            <View key={`v${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4, borderTopWidth: 1, borderTopColor: '#F0F1F4' }}>
              <Text numberOfLines={2} style={{ flex: 1, color: base.ink, fontSize: 12.5 }}>Variation: {x.description}</Text>
              <Muted style={{ width: 70, textAlign: 'right', fontSize: 12 }}>applied {pct(x.pct)}%</Muted>
              <TextInput value={cp[`v${i}`]} onChangeText={(t) => applyLines({ ...cp, [`v${i}`]: t })} keyboardType="decimal-pad" style={[box, { width: 64, marginBottom: 0 }]} /><Text>%</Text>
            </View>
          ))}
          {(a.dayworks || []).map((d: Row, i: number) => (
            <View key={`d${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4, borderTopWidth: 1, borderTopColor: '#F0F1F4' }}>
              <Text numberOfLines={2} style={{ flex: 1, color: base.ink, fontSize: 12.5 }}>Day work: {d.description}</Text>
              <Muted style={{ width: 90, textAlign: 'right', fontSize: 12 }}>applied {money(d.value)}</Muted>
              <Text>£</Text><TextInput value={cp[`d${i}`]} onChangeText={(t) => applyLines({ ...cp, [`d${i}`]: t })} keyboardType="decimal-pad" style={[box, { width: 90, marginBottom: 0 }]} />
            </View>
          ))}
        </View>
      )}
      <FinRow title="Net due" right={money(net)} />
      <Text style={{ color: diff < 0 ? '#C0392B' : diff > 0 ? '#1E7A3C' : base.slate, marginBottom: 6 }}>{diff ? `${diff < 0 ? 'Short by' : 'Over by'} ${money(Math.abs(diff))} compared with the ${money(a.net_due)} applied for.` : 'Matches what was applied for.'}</Text>
      <Check label="This is a pay-less notice" value={!!v.cert_is_payless} onChange={(x) => setV({ ...v, cert_is_payless: x })} />
      <TextInput value={v.cert_notes} onChangeText={(x) => setV({ ...v, cert_notes: x })} placeholder="Notes, e.g. reason for any shortfall" style={[box, { marginVertical: 6 }]} />
      <Pressable onPress={async () => { const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true }); if (!r.canceled && r.assets[0]) setFile({ uri: r.assets[0].uri, name: r.assets[0].name, mimeType: r.assets[0].mimeType }); }}><Text style={{ color: base.blue, marginBottom: 6 }}>📎 {file ? file.name : 'Copy of the certificate (optional)'}</Text></Pressable>
      <Check label="Raise and issue the invoice now" value={!!v.invoiceNow} onChange={(x) => setV({ ...v, invoiceNow: x })} />
      <View style={{ marginTop: 8 }}><Button busy={busy} title="Save certificate" onPress={async () => {
        const vals = ['cert_gross', 'cert_retention', 'cert_previous', 'cert_discount'].map((k) => num(v[k]));
        if (vals.some((x) => x === null || isNaN(x))) { toast('Fill in every amount (0 if none).'); return; }
        setBusy(true);
        try {
          const ca = byLine ? appCalc(certApp(), jf.contract_value, jf.retention_limit_pct, vals[2] as number) : null;
          const certLines = ca ? [...ca.lines.filter(isItem).map((l: Row) => ({ item_id: l.item_id, pct: l.pct, gross: l.gross })), ...ca.variations.map((x: Row) => ({ fin_variation_id: x.fin_variation_id || null, variation_id: x.variation_id || null, description: x.description, pct: x.pct, gross: x.gross })), ...ca.dayworks.map((d: Row) => ({ fin_daywork_id: d.fin_daywork_id || null, description: d.description, gross: d.gross }))] : null;
          const e = await saveCertificate(me, a, { ...v, cert_gross: vals[0], cert_retention: vals[1], cert_previous: vals[2], cert_discount: vals[3], cert_net: net, cert_lines: certLines }, file);
          if (e) { toast(e); return; }
          if (v.invoiceNow && net > 0) {
            const r = await raiseInvoiceFromCert(me, org, { ...a, cert_gross: vals[0], cert_retention: vals[1], cert_previous: vals[2], cert_discount: vals[3], cert_net: net, cert_date: v.cert_date }, site as never, true);
            if (r.error) showAlert(r.error); else if (r.needsBill) toast('Certificate saved — add who the invoice is to, then issue it.');
            onSaved(); if (r.id) router.push(`/fin/job/${a.site_id}/invoice/${r.id}` as never); return;
          }
          toast('Certificate saved'); onSaved();
        } finally { setBusy(false); }
      }} /></View>
    </Card>
  );
}
