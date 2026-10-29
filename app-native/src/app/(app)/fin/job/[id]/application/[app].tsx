// An application for payment (902 renderFinApplication + 903 certificate).
// "new" starts one from the Bill of Quantities. Draft: % (or £) done per line,
// set a whole section, variations and day works, discount and retention.
// Applied: locked. Then enter the client's certificate (or pay-less notice)
// and raise the invoice from it. Emailing it is off during the Finance trial.
import * as DocumentPicker from 'expo-document-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { FinChip, FinRow, FinStat } from '@/components/FinNav';
import { confirmAsk, showAlert, useToast } from '@/components/toast';
import { Button, Card, Check, Muted, SectionTitle } from '@/components/ui';
import { clearCertificate, deleteApplication, loadApplication, newApplication, raiseInvoiceFromCert, saveApplication, saveCertificate, setStatus } from '@/data/finApp';
import { openDocLink } from '@/data/hs';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { APP_STAGE, appCalc, groupTotals, isItem, pct } from '@/lib/rules/finApp';
import { fdate, money, num, round2, today } from '@/lib/rules/finance';
import { base, page, radius, space } from '@/theme/theme';

type Row = Record<string, any>;
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
  return <Editor key={`${data.a.id}${data.a.updated_at}`} a0={data.a} jf={data.jf} previousLive={data.previousLive} />;
}

function Editor({ a0, jf, previousLive }: { a0: Row; jf: Row; previousLive: number }) {
  const { me, org } = useAuth();
  const { data: site } = useSite(a0.site_id);
  const toast = useToast();
  const qc = useQueryClient();
  const [a, setA] = useState<Row>(() => JSON.parse(JSON.stringify(a0)));
  const [mode, setMode] = useState<'pct' | 'gbp'>('pct');
  const [hideZero, setHideZero] = useState(false);
  const [busy, setBusy] = useState('');
  if (!me) return null;
  const stage = APP_STAGE(a0), locked = stage !== 'draft';
  const previous = locked ? Number(a0.previous || 0) : previousLive;
  const c = appCalc(a, jf.contract_value, jf.retention_limit_pct, previous);
  const tots = groupTotals(c.lines, (l) => l.value, (l) => l.gross);
  const refresh = () => { ['finApp', 'finSales', 'finBook', 'finOverview'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] })); };
  const setLine = (i: number, patch: Row) => setA({ ...a, lines: a.lines.map((l: Row, j: number) => (j === i ? { ...l, ...patch } : l)) });
  const fill = (i: number, p: number) => { const lv = a.lines[i].kind, ls = a.lines.slice(); for (let j = i + 1; j < ls.length; j++) { const k = ls[j].kind; if (k === 'section' || (lv === 'subsection' && k === 'subsection')) break; if (isItem(ls[j])) ls[j] = { ...ls[j], pct: p }; } setA({ ...a, lines: ls }); };
  const save = async (quiet?: boolean) => { setBusy('save'); const ok = await saveApplication(a, jf, previous); setBusy(''); if (!quiet) toast(ok ? 'Application saved' : 'Could not save — try again.'); refresh(); return ok; };
  const contractTotal = c.lines.filter(isItem).reduce((t: number, l: Row) => t + Number(l.value || 0), 0), contractDone = c.lines.reduce((t: number, l: Row) => t + l.gross, 0);
  return (
    <ScrollView contentContainerStyle={page(1000)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: `Application ${a0.number}` }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <FinStat v={STAGE[stage]} label="Stage" /><FinStat v={money(c.net_due)} label="Amount due this application" />
        <FinStat v={fdate(a.valuation_date)} label="Valuation date" /><FinStat v={a.final_date ? fdate(a.final_date) : '—'} label="Final date for payment" />
      </View>
      {!locked && (
        <Card>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {[['valuation_date', 'Valuation date'], ['due_date', 'Due date'], ['final_date', 'Final date']].map(([k, l]) => <View key={k} style={{ flexGrow: 1 }}><Muted>{l}</Muted><TextInput value={a[k] || ''} onChangeText={(v) => setA({ ...a, [k]: v })} placeholder="YYYY-MM-DD" style={box} /></View>)}
          </View>
        </Card>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8, alignItems: 'center' }}>
        {!locked && <><FinChip on={mode === 'pct'} label="Enter %" onPress={() => setMode('pct')} /><FinChip on={mode === 'gbp'} label="Enter £" onPress={() => setMode('gbp')} /></>}
        <Check label="Hide 0% lines" value={hideZero} onChange={setHideZero} />
      </View>
      <SectionTitle>Bill of Quantities</SectionTitle>
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
              <Muted>{hasQty ? `${l.qty} ${l.unit || ''} × ${money(l.rate)} = ` : 'Value '}{money(l.value)}</Muted>
            </View>
            {locked ? <Text style={{ color: base.slate }}>{pct(l.pct)}%</Text> : mode === 'pct'
              ? <TextInput defaultValue={String(pct(l.pct))} onChangeText={(v) => setLine(i, { pct: pct(v) })} keyboardType="decimal-pad" style={[box, { width: 70 }]} />
              : <TextInput defaultValue={String(l.gross)} onChangeText={(v) => { const n = num(v), val = Number(l.value || 0); if (val && n !== null && !isNaN(n)) setLine(i, { pct: pct((n / val) * 100) }); }} keyboardType="decimal-pad" style={[box, { width: 100 }]} />}
            <Text style={{ width: 96, textAlign: 'right', fontWeight: '700', color: base.ink }}>{money(l.gross)}</Text>
          </View>
        );
      })}
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
      {c.dayworks.length > 0 && <><SectionTitle>Day works</SectionTitle>{c.dayworks.map((d: Row, i: number) => <FinRow key={i} title={d.description} right={money(d.gross)} />)}</>}
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
          <Certificate a={a0} previous={previousLive} onSaved={refresh} />
          <Button kind="ghost" title="Return to draft to edit" onPress={async () => { if (await confirmAsk('Return this application to draft so you can edit it?', 'Return to draft')) { if (await setStatus(a0.id, { status: 'draft' })) { toast('Back to draft — you can edit it now'); refresh(); } } }} />
          <Muted style={{ marginTop: 6 }}>Emailing the application to the client is switched off while Finance is on trial.</Muted>
        </>
      )}
      {(stage === 'certified' || stage === 'invoiced') && (
        <Card>
          <SectionTitle>{a0.cert_is_payless ? 'Pay-less notice' : 'Payment certificate'} · {fdate(a0.cert_date)}</SectionTitle>
          <FinRow title="Total certified to date" right={money(a0.cert_gross)} /><FinRow title="Less retention" right={`−${money(a0.cert_retention)}`} /><FinRow title="Less previously certified" right={`−${money(a0.cert_previous)}`} />
          {Number(a0.cert_discount || 0) ? <FinRow title="Less discount" right={`−${money(a0.cert_discount)}`} /> : null}
          <FinRow title="Net due" right={money(a0.cert_net)} />
          {round2(Number(a0.cert_net) - Number(a0.net_due)) !== 0 && <Text style={{ color: Number(a0.cert_net) < Number(a0.net_due) ? '#C0392B' : '#1E7A3C', fontWeight: '700' }}>{Number(a0.cert_net) < Number(a0.net_due) ? 'Short by' : 'Over by'} {money(Math.abs(Number(a0.cert_net) - Number(a0.net_due)))} compared with the {money(a0.net_due)} applied for.</Text>}
          {a0.cert_notes ? <Muted>{a0.cert_notes}</Muted> : null}
          {a0.cert_file_path && <Pressable onPress={async () => { const u = await openDocLink('finance-docs', a0.cert_file_path); if (u) void Linking.openURL(u); }}><Text style={{ color: base.blue, marginTop: 6 }}>📄 Certificate</Text></Pressable>}
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

function Certificate({ a, previous, onSaved }: { a: Row; previous: number; onSaved: () => void }) {
  const { me, org } = useAuth();
  const { data: site } = useSite(a.site_id);
  const toast = useToast();
  const [v, setV] = useState<Row>({ cert_date: today(), cert_gross: String(round2(a.gross)), cert_retention: String(round2(a.retention)), cert_previous: String(round2(previous)), cert_discount: String(round2(a.discount != null ? Number(a.discount) : (Number(a.gross || 0) * Number(a.discount_pct || 0)) / 100)), cert_notes: '', cert_is_payless: false, invoiceNow: false });
  const [file, setFile] = useState<{ uri: string; name: string; mimeType?: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  const n = (k: string) => num(v[k]) || 0;
  const net = round2(n('cert_gross') - n('cert_retention') - n('cert_previous') - n('cert_discount'));
  const diff = round2(net - Number(a.net_due));
  const f = (k: string, l: string) => <View key={k} style={{ flexBasis: '47%', flexGrow: 1, marginBottom: 6 }}><Muted>{l}</Muted><TextInput value={String(v[k])} onChangeText={(x) => setV({ ...v, [k]: x })} keyboardType={k === 'cert_date' ? 'default' : 'decimal-pad'} style={box} /></View>;
  return (
    <Card>
      <SectionTitle>Client&apos;s certificate</SectionTitle>
      <Muted style={{ marginBottom: 8 }}>When the client&apos;s certificate (or pay-less notice) comes back, enter its figures. They start as what you applied for.</Muted>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 8 }}>
        {f('cert_date', 'Certificate date')}{f('cert_gross', 'Total certified to date (£)')}{f('cert_retention', 'Retention held (£)')}{f('cert_previous', 'Previously certified (£)')}{f('cert_discount', 'Discount, if any (£)')}
      </View>
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
          const e = await saveCertificate(me, a, { ...v, cert_gross: vals[0], cert_retention: vals[1], cert_previous: vals[2], cert_discount: vals[3], cert_net: net }, file);
          if (e) { toast(e); return; }
          if (v.invoiceNow && net > 0) {
            const r = await raiseInvoiceFromCert(me, org, { ...a, cert_gross: vals[0], cert_retention: vals[1], cert_previous: vals[2], cert_discount: vals[3], cert_net: net, cert_date: v.cert_date }, site as never, true);
            if (r.error) showAlert(r.error);
            onSaved(); if (r.id) router.push(`/fin/job/${a.site_id}/invoice/${r.id}` as never); return;
          }
          toast('Certificate saved'); onSaved();
        } finally { setBusy(false); }
      }} /></View>
    </Card>
  );
}
