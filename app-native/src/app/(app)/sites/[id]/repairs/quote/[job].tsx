// A repair job's quote (Andy, 7 Nov 2026: "really simple"): tap items from the contract's schedule of rates (less its
// set discount), add your own lines, or just put in one figure. No VAT on the lines: the contract's VAT, from its
// Finance set-up, is added once at the bottom. Save, or Save & Send To Client (the job is then Awaiting Approval).
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { useToast } from '@/components/toast';
import { Button, Card, Muted } from '@/components/ui';
import { saveRepairQuote, useContractQuoteSettings, useRepairRates } from '@/data/repairQuote';
import { useRepairJob } from '@/data/repairs';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { exportRepairReport } from '@/lib/repairReportPdf';
import { lineValue, quoteTotals, rateLine, type QuoteLine } from '@/lib/rules/repairQuote';
import { isManager } from '@/lib/roles';
import { base, page, radius, space } from '@/theme/theme';

type Row = Record<string, any>;
const gbp = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, paddingHorizontal: 9, paddingVertical: 7, color: base.ink, backgroundColor: base.card, fontSize: 14 } as const;
const num = (s: string) => { const n = Number(String(s).replace(/[£,\s]/g, '')); return isNaN(n) ? 0 : n; };

export default function RepairQuote() {
  const { id, job: jobId } = useLocalSearchParams<{ id: string; job: string }>();
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data } = useRepairJob(jobId);
  const { data: site } = useSite(id);
  const { data: rates = [] } = useRepairRates(id);
  const { data: qs } = useContractQuoteSettings(id);
  const [lines, setLines] = useState<QuoteLine[] | null>(null);
  const [disc, setDisc] = useState<string | null>(null);
  const [find, setFind] = useState('');
  const [busy, setBusy] = useState(false);
  const job = data?.job as Row | undefined;
  // Start from what's saved (or one blank line).
  useEffect(() => {
    if (!job || lines) return;
    const saved = Array.isArray(job.quote_lines) ? (job.quote_lines as QuoteLine[]) : [];
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLines(saved.length ? saved : job.variation_cost != null ? [{ description: job.priced_schedule_of_works || 'Works as described', qty: 1, rate: Number(job.variation_cost) }] : []);
  }, [job, lines]);
  if (!me || !job || !lines) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  const discount = disc != null ? num(disc) : job.quote_discount_pct != null ? Number(job.quote_discount_pct) : qs?.discount ?? 0;
  const t = quoteTotals(lines, discount, qs?.vat);
  const set = (i: number, p: Partial<QuoteLine>) => setLines(lines.map((l, k) => (k === i ? { ...l, ...p } : l)));
  const q = find.trim().toLowerCase();
  const matches = q ? rates.filter((r) => `${r.code || ''} ${r.description}`.toLowerCase().includes(q)).slice(0, 8) : [];
  const save = async (send: boolean) => {
    const clean = lines.filter((l) => l.description.trim() && Number(l.qty) > 0);
    if (!clean.length) { toast('Add at least one line, or one figure.'); return; }
    setBusy(true); const ok = await saveRepairQuote(job, clean, discount, qs?.vat ?? null, send); setBusy(false);
    if (!ok) { toast('Could not save — try again.'); return; }
    void qc.invalidateQueries({ queryKey: ['repairJob', jobId] }); void qc.invalidateQueries({ queryKey: ['repairJobs', id] });
    toast(send ? 'Quote sent — awaiting the client’s approval' : 'Quote saved');
    router.back();
  };

  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: `Quote${job.job_number ? ` — ${job.job_number}` : ''}` }} />
      <Card>
        <Text style={{ fontWeight: '700', color: base.ink }}>{job.job_number ? `${job.job_number} · ` : ''}{job.address}</Text>
        {!!(job.repair_description || job.survey_notes) && <Muted style={{ marginTop: 4 }}>Repair: {job.repair_description || job.survey_notes}</Muted>}
      </Card>

      {/* Add from the schedule of rates. */}
      {rates.length > 0 ? (
        <Card>
          <Text style={{ fontWeight: '700', color: base.ink, marginBottom: 6 }}>From The Schedule Of Rates</Text>
          <TextInput value={find} onChangeText={setFind} placeholder="Search by code or description" accessibilityLabel="Search the schedule of rates" style={[box, { fontSize: 16 }]} />
          {matches.map((r) => (
            <Pressable key={r.id} accessibilityRole="button" accessibilityLabel={`Add ${r.code || ''} ${r.description}`} onPress={() => { setLines([...lines, rateLine(r)]); setFind(''); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#EEF0F2' }}>
              <Text style={{ width: 64, fontSize: 12, fontWeight: '600', color: base.slate }}>{r.code || ''}</Text>
              <Text style={{ flex: 1, fontSize: 13.5, color: base.ink }}>{r.description}</Text>
              <Text style={{ fontSize: 13, fontWeight: '600', color: base.ink }}>{gbp(Number(r.rate))}{r.unit ? `/${r.unit}` : ''}</Text>
              <Text style={{ fontSize: 18, color: base.slate }}>＋</Text>
            </Pressable>
          ))}
          {!!q && !matches.length && <Muted style={{ marginTop: 6 }}>Nothing matches.</Muted>}
        </Card>
      ) : <Muted style={{ marginBottom: 8 }}>No schedule of rates on this contract yet: add your own lines, or one figure. (Works Orders › Schedule Of Rates to set one up.)</Muted>}

      {/* The lines. */}
      <Card>
        {lines.length === 0 && <Muted>No lines yet.</Muted>}
        {lines.map((l, i) => (
          <View key={i} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#EEF0F2' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {l.sor ? <Text style={{ flex: 1, fontSize: 13.5, color: base.ink }}><Text style={{ fontWeight: '600' }}>{l.code ? `${l.code} ` : ''}</Text>{l.description}</Text>
                : <TextInput value={l.description} onChangeText={(v) => set(i, { description: v })} placeholder="What's being done" accessibilityLabel={`Line ${i + 1} description`} style={[box, { flex: 1 }]} />}
              <Pressable accessibilityLabel={`Remove line ${i + 1}`} hitSlop={8} onPress={() => setLines(lines.filter((_, k) => k !== i))}><Text style={{ fontSize: 16, color: base.slate }}>✕</Text></Pressable>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <Text style={{ fontSize: 12, color: base.slate }}>Qty</Text>
              <TextInput value={String(l.qty)} onChangeText={(v) => set(i, { qty: num(v) })} keyboardType="decimal-pad" accessibilityLabel={`Line ${i + 1} quantity`} style={[box, { width: 64, textAlign: 'center' }]} />
              <Text style={{ fontSize: 12, color: base.slate }}>{l.unit ? `${l.unit} at` : 'at'}</Text>
              {l.sor ? <Text style={{ fontSize: 13, color: base.ink }}>{gbp(Number(l.rate))}</Text>
                : <TextInput value={l.rate ? String(l.rate) : ''} onChangeText={(v) => set(i, { rate: num(v) })} placeholder="£0.00" keyboardType="decimal-pad" accessibilityLabel={`Line ${i + 1} rate`} style={[box, { width: 92 }]} />}
              <Text style={{ flex: 1, textAlign: 'right', fontSize: 14, fontWeight: '700', color: base.ink }}>{gbp(lineValue(l, discount))}</Text>
            </View>
          </View>
        ))}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <View style={{ flex: 1 }}><Button small kind="ghost" title="+ Add Your Own Line" onPress={() => setLines([...lines, { description: '', qty: 1, rate: 0 }])} /></View>
          <View style={{ flex: 1 }}><Button small kind="ghost" title="+ Just One Figure" onPress={() => setLines([...lines, { description: 'Works as described', qty: 1, rate: 0 }])} /></View>
        </View>
      </Card>

      {/* Totals: the discount on the schedule-of-rates lines, then the contract's VAT, once. */}
      <Card>
        {t.sorGross > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Text style={{ flex: 1, color: base.slate }}>Schedule Of Rates Discount</Text>
            <TextInput value={disc ?? String(discount)} onChangeText={setDisc} keyboardType="decimal-pad" accessibilityLabel="Discount percent" style={[box, { width: 64, textAlign: 'center' }]} />
            <Text style={{ color: base.slate }}>%</Text>
          </View>
        )}
        {t.discount > 0 && <View style={{ flexDirection: 'row' }}><Text style={{ flex: 1, color: base.slate }}>Less {discount}% off {gbp(t.sorGross)}</Text><Text style={{ color: base.ink }}>-{gbp(t.discount)}</Text></View>}
        <View style={{ flexDirection: 'row', marginTop: 4 }}><Text style={{ flex: 1, fontWeight: '600', color: base.ink }}>Net</Text><Text style={{ fontWeight: '700', color: base.ink }}>{gbp(t.net)}</Text></View>
        <View style={{ flexDirection: 'row', marginTop: 4 }}><Text style={{ flex: 1, color: base.slate }}>{t.vatPct ? `VAT ${t.vatPct}%` : 'VAT'} (From The Project)</Text><Text style={{ color: base.ink }}>{t.vatPct ? gbp(t.vat) : '—'}</Text></View>
        <View style={{ flexDirection: 'row', marginTop: 4 }}><Text style={{ flex: 1, fontWeight: '700', color: base.ink }}>Total</Text><Text accessibilityLabel="Quote total" style={{ fontWeight: '700', fontSize: 16, color: base.ink }}>{gbp(t.total)}</Text></View>
        {!!t.vatNote && <Muted style={{ marginTop: 6 }}>{t.vatNote}</Muted>}
      </Card>

      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
        <Button kind="ghost" busy={busy} title="Save" onPress={() => void save(false)} />
        <Button busy={busy} title="Save & Send To Client" onPress={() => void save(true)} />
      </View>
      <View style={{ alignItems: 'center', marginBottom: space.xl }}>
        <Button small kind="ghost" title="📄 Quote PDF" onPress={async () => { if (!(await exportRepairReport('quote', { ...job, quote_lines: lines, quote_discount_pct: discount, variation_cost: t.net } as never, site, org, '', qs?.vat).catch(() => false))) toast('Could not build the PDF.'); }} />
      </View>
    </ScrollView>
  );
}
