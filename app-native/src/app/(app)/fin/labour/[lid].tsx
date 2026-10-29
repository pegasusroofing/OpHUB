// An operative's invoice (9219c openFinOpInvoice / saveFinOpInvoice): who
// it's from, their invoice no. and date, the week, the amount for each job,
// materials, and CIS worked out from their rate. Saved ready for the pay run.
// (Sending it to the job's PM is off during the Finance trial.)
import * as DocumentPicker from 'expo-document-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { FinRow, FinStat } from '@/components/FinNav';
import { pickJob } from '@/components/FinSales';
import { monday } from '@/components/FinSubs';
import { chooseAction, confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Muted, SectionTitle } from '@/components/ui';
import { fdb, selectAll } from '@/data/finance';
import { openDocLink } from '@/data/hs';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { cisStatement } from '@/lib/finCisPdf';
import { addDays, fdate, jobTag, money, num, round2, today } from '@/lib/rules/finance';
import { opCalc } from '@/lib/rules/finSubs';
import { supabase } from '@/lib/supabase';
import { base, page, radius, space } from '@/theme/theme';

type Row = Record<string, any>;
const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 8, color: base.ink, backgroundColor: base.card };

export default function FinOpInvoice() {
  const { lid } = useLocalSearchParams<{ lid: string }>();
  const { me } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ['finOpInv', lid], gcTime: 0, enabled: !!me, queryFn: async () => {
    const [p, rates, people] = await Promise.all([
      lid === 'new' ? Promise.resolve(null) : fdb.from('fin_sub_payments').select('*').eq('id', lid).maybeSingle().then((r: { data: unknown }) => r.data as Row | null),
      selectAll<Row>('fin_labour_rates', '*', (q) => q.eq('org_id', me?.org_id as string)),
      selectAll<Row>('profiles', 'id,name,role', (q) => q.eq('org_id', me?.org_id as string)),
    ]);
    const rateBy: Record<string, Row> = {}; rates.forEach((r) => { rateBy[r.user_id || `w:${r.id}`] = r; });
    const who = [...people.filter((x) => ['operative', 'site_manager', 'driver'].includes(x.role)).map((x) => ({ key: x.id, name: x.name })), ...rates.filter((r) => !r.user_id).map((r) => ({ key: `w:${r.id}`, name: r.trading_name || r.name || 'Worker' }))].sort((a, b) => a.name.localeCompare(b.name));
    return { p, rateBy, who };
  } });
  if (isLoading || !data) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  return <Editor key={lid} p={data.p} rateBy={data.rateBy} who={data.who} />;
}

function Editor({ p, rateBy, who }: { p: Row | null; rateBy: Record<string, Row>; who: { key: string; name: string }[] }) {
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: sites = [] } = useSites();
  const [key, setKey] = useState<string>(p ? (p.worker_id ? `w:${p.worker_id}` : p.user_id || '') : '');
  const [inv, setInv] = useState({ no: p?.invoice_no || '', date: p?.invoice_date || today(), week: p?.period_start || monday(addDays(today(), -7)), materials: p?.materials != null ? String(p.materials) : '', cis: p?.cis_rate != null ? String(p.cis_rate) : '' });
  const [lines, setLines] = useState<Row[]>(p?.lines?.length ? p.lines.map((l: Row) => ({ ...l, amount: String(l.amount ?? '') })) : [{ site_id: '', amount: '', description: '' }]);
  const [file, setFile] = useState<{ uri: string; name: string; mimeType?: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  const locked = p?.status === 'paid';
  const r = rateBy[key] || {};
  const cisRate = num(inv.cis) ?? (r.cis_rate != null ? Number(r.cis_rate) : 20);
  const c = opCalc(lines, num(inv.materials) || 0, Number(cisRate) || 0);
  const name = (k: string) => who.find((w) => w.key === k)?.name || p?.name || 'Choose who';
  const refresh = () => ['finOpInv', 'finSubs', 'finBook'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
  const save = async () => {
    if (!key) { toast('Choose who the invoice is from.'); return; }
    const L = lines.filter((l) => l.site_id || l.amount).map((l) => ({ site_id: l.site_id, amount: round2(Number(num(l.amount)) || 0), description: String(l.description || '').trim() || null }));
    if (!L.length) { toast('Add the amount for at least one job.'); return; }
    if (L.some((l) => !l.site_id)) { toast('Choose the job on every line.'); return; }
    if (L.some((l) => !(l.amount > 0))) { toast('Every job needs an amount.'); return; }
    if (p?.xero_id && !(await confirmAsk('Save these changes?\n\nThis is already in Xero. Changing it here won’t change Xero — change it in Xero too.', 'I’ll change Xero too'))) return;
    setBusy(true);
    try {
      const row: Row = { lines: L, invoice_no: inv.no.trim() || null, invoice_date: inv.date || null, period_start: inv.week, period_end: addDays(inv.week, 6), name: r.trading_name || (key.startsWith('w:') ? r.name : name(key)), utr: r.utr || null, ...opCalc(L, num(inv.materials) || 0, Number(cisRate) || 0) };
      if (file) {
        const rid = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}`;
        const up = await supabase.storage.from('finance-docs').upload(`${me.org_id}/operative-invoices/${rid}-${file.name.replace(/[^a-z0-9.-]+/gi, '_').slice(-80)}`, await (await fetch(file.uri)).arrayBuffer(), { contentType: file.mimeType || 'application/octet-stream' });
        if (!up.error) { row.file_path = up.data.path; row.file_name = file.name; }
      }
      if (p) { if ((await fdb.from('fin_sub_payments').update(row as never).eq('id', p.id)).error) { toast('Could not save — try again.'); return; } }
      else {
        if (row.invoice_no) {
          const q = fdb.from('fin_sub_payments').select('id').eq('org_id', me.org_id as string).is('sub_app_id', null).neq('status', 'void').eq('invoice_no', row.invoice_no);
          const dup = ((await (key.startsWith('w:') ? q.eq('worker_id', key.slice(2)) : q.eq('user_id', key))).data as Row[] | null) ?? [];
          if (dup.length && !(await confirmAsk(`You already have invoice ${row.invoice_no} from ${row.name}. Add it again?`, 'Add again'))) return;
        }
        if ((await fdb.from('fin_sub_payments').insert({ ...row, org_id: me.org_id, user_id: key.startsWith('w:') ? null : key, worker_id: key.startsWith('w:') ? key.slice(2) : null, status: 'approved', created_by: me.id } as never)).error) { toast('Could not save — try again.'); return; }
      }
      toast(`Saved — ${money(row.net_pay)} to pay in the pay run`); refresh(); router.back();
    } finally { setBusy(false); }
  };
  return (
    <ScrollView contentContainerStyle={page(800)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: p ? `${p.name || 'Operative'} invoice` : 'Operative invoice' }} />
      {locked && <Card><Text style={{ color: '#1E7A3C', fontWeight: '700' }}>Paid {fdate(p?.paid_on)} — it can&apos;t be changed.</Text></Card>}
      <Card>
        <Muted style={{ fontWeight: '700' }}>From</Muted>
        <Pressable disabled={locked || !!p} onPress={async () => { const k = await chooseAction('Who is the invoice from?', who.map((w) => ({ key: w.key, label: w.name }))); if (k) setKey(k); }} style={[box, { marginBottom: 8 }]}><Text style={{ color: base.ink }}>{key ? name(key) : 'Choose who'} ▾</Text></Pressable>
        {key ? <Muted style={{ marginBottom: 8 }}>{r.utr ? `UTR ${r.utr}` : 'No UTR saved'} · CIS {r.cis_rate ?? 20}%{r.pay_type ? ` · ${r.pay_type}` : ''}</Muted> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {([['no', 'Their invoice no.'], ['date', 'Invoice date'], ['week', 'Week commencing (Monday)'], ['materials', 'Materials £ (no CIS)'], ['cis', `CIS % (blank = ${r.cis_rate ?? 20}%)`]] as const).map(([k, l]) => (
            <View key={k} style={{ flexBasis: '47%', flexGrow: 1 }}><Muted>{l}</Muted><TextInput editable={!locked} value={inv[k]} onChangeText={(v) => setInv({ ...inv, [k]: v })} placeholder={k === 'date' || k === 'week' ? 'YYYY-MM-DD' : ''} style={box} /></View>
          ))}
        </View>
      </Card>
      <SectionTitle>Jobs</SectionTitle>
      {lines.map((l, i) => (
        <Card key={i} style={{ padding: 10 }}>
          <Pressable disabled={locked} onPress={async () => { const s = await pickJob('Which job', sites); if (s) setLines(lines.map((x, j) => (j === i ? { ...x, site_id: s } : x))); }} style={[box, { marginBottom: 6 }]}><Text style={{ color: base.ink }}>{l.site_id ? jobTag(sites.find((s) => s.id === l.site_id)) : 'Choose the job ▾'}</Text></Pressable>
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            <TextInput editable={!locked} value={l.description || ''} onChangeText={(v) => setLines(lines.map((x, j) => (j === i ? { ...x, description: v } : x)))} placeholder="Description (optional)" style={[box, { flex: 1 }]} />
            <TextInput editable={!locked} value={String(l.amount ?? '')} onChangeText={(v) => setLines(lines.map((x, j) => (j === i ? { ...x, amount: v } : x)))} placeholder="£" keyboardType="decimal-pad" style={[box, { width: 100 }]} />
            {!locked && lines.length > 1 && <Pressable hitSlop={8} onPress={() => setLines(lines.filter((_, j) => j !== i))}><Text>🗑</Text></Pressable>}
          </View>
        </Card>
      ))}
      {!locked && <Button kind="ghost" title="+ Another job" onPress={() => setLines([...lines, { site_id: '', amount: '', description: '' }])} />}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 10 }}>
        <FinStat v={money(c.gross)} label="Gross" /><FinStat v={`−${money(c.cis_deduction)}`} label={`CIS @ ${c.cis_rate}% on labour`} /><FinStat v={money(c.net_pay)} label="To pay" />
      </View>
      {!locked && <Pressable onPress={async () => { const x = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true }); if (!x.canceled && x.assets[0]) setFile({ uri: x.assets[0].uri, name: x.assets[0].name, mimeType: x.assets[0].mimeType }); }}><Text style={{ color: base.blue, marginBottom: 8 }}>📎 {file ? file.name : 'Attach their invoice'}</Text></Pressable>}
      {p?.file_path && <FinRow title={`📄 ${p.file_name || 'Their invoice'}`} onPress={async () => { const u = await openDocLink('finance-docs', p.file_path); if (u) void Linking.openURL(u); }} />}
      {!locked && <Button busy={busy} title="Save — ready for the pay run" onPress={() => void save()} />}
      {p && p.status !== 'void' && me && <View style={{ marginTop: 8 }}><Button kind="ghost" title="CIS payment statement" onPress={async () => { if (!(await cisStatement(me, org, p))) toast('Could not make the statement — try again.'); }} /></View>}
      {p && !locked && <View style={{ marginTop: 8 }}><Button kind="ghost" title="Void this invoice" onPress={async () => { if (await confirmAsk('Void this operative invoice? It comes off the pay run.', 'Void')) { if (!(await fdb.from('fin_sub_payments').update({ status: 'void' } as never).eq('id', p.id)).error) { toast('Voided'); refresh(); router.back(); } } }} /></View>}
    </ScrollView>
  );
}
