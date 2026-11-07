// A repair job's quote (Andy, 7 Nov 2026: "really simple"): find items in the contract's schedule of rates (NHF or the
// client's own) by Category ▾, Item ▾ or free text, less its set discount; add your own lines, or just put in one
// figure. No VAT on the lines: the contract's VAT, from its Finance set-up, is added once at the bottom. Save asks where
// the quote stands (Not Sent Yet, Awaiting Approval, Client Approved, Client Rejected); Save & Send To Client makes it
// Awaiting Approval.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native';

import { FinForm } from '@/components/FinForm';
import { RateFinder } from '@/components/RateFinder';
import { chooseAction, showAlert, useToast } from '@/components/toast';
import { Button, Card, Muted } from '@/components/ui';
import { fdb } from '@/data/finance';
import { emailRepairQuote, QUOTE_STATUS, quoteStatusOf, repairApprovalLink, saveRepairQuote, useContractQuoteSettings, useRepairRates, type QuoteStatus } from '@/data/repairQuote';
import { useRepairJob } from '@/data/repairs';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { buildRepairReport, exportRepairReport } from '@/lib/repairReportPdf';
import { FIN_TRIAL_MSG } from '@/lib/rules/finance';
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
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const job = data?.job as Row | undefined;
  // Who the quote goes to: Finance's bill-to email for the contract, else the client's email on the project.
  const { data: billEmail } = useQuery({ queryKey: ['repairQuoteTo', id], enabled: !!id, queryFn: async () => ((await fdb.from('job_finance').select('billing_email').eq('site_id', id).maybeSingle()).data as { billing_email?: string | null } | null)?.billing_email || null });
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
  const now = quoteStatusOf(job);
  const save = async (status: QuoteStatus) => {
    const clean = lines.filter((l) => l.description.trim() && Number(l.qty) > 0);
    if (!clean.length) { toast('Add at least one line, or one figure.'); return; }
    setBusy(true); const ok = await saveRepairQuote(job, clean, discount, qs?.vat ?? null, status, me.id); setBusy(false);
    if (!ok) { toast('Could not save — try again.'); return; }
    ['repairJob', 'repairJobs', 'repairPaid'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
    router.back();
  };
  // Save: where does the quote stand? (Its status now is ticked.)
  const saveAs = async () => {
    const k = await chooseAction('Save As', QUOTE_STATUS.map(([key, label]) => ({ key, label: key === now ? `${label} ✓` : label })));
    if (k) await save(k as QuoteStatus);
  };
  // Save & Send To Client: Awaiting Approval, and the quote emailed (with Approve Or Reject Online when it's switched on).
  const clean = () => lines.filter((l) => l.description.trim() && Number(l.qty) > 0);
  const sendIt = async (to: string[], words: string): Promise<string | null> => {
    const cl = clean(); if (!cl.length) return 'Add at least one line, or one figure.';
    if (!(await saveRepairQuote(job, cl, discount, qs?.vat ?? null, 'awaiting', me.id))) return 'Could not save — try again.';
    ['repairJob', 'repairJobs'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
    const pdf = await buildRepairReport('quote', { ...job, quote_lines: cl, quote_discount_pct: discount, variation_cost: t.net } as never, site, org, '', qs?.vat);
    const err = await emailRepairQuote(me, pdf, job, to, words);
    if (err === FIN_TRIAL_MSG) { showAlert('Saved as Awaiting Approval. The email wasn’t sent: Finance is in trial.'); router.back(); return null; }
    if (err) return `Saved as Awaiting Approval, but the email didn’t go: ${err}`;
    router.back(); return null;
  };
  // The approval link to send yourself (any email you like); nothing is emailed.
  const copyLink = async () => {
    setBusy(true); const r = await repairApprovalLink(me, job.id); setBusy(false);
    if (!r.link) { toast(r.error || 'Could not make the link — try again.'); return; }
    if (Platform.OS === 'web') { try { await globalThis.navigator.clipboard.writeText(r.link); toast('Approval link copied'); return; } catch { showAlert(r.link); return; } }
    await Share.share({ message: r.link });
  };
  const sign = discount < 0 ? 'plus' : 'less';

  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: `Quote${job.job_number ? ` — ${job.job_number}` : ''}` }} />
      <Card>
        <Text style={{ fontWeight: '700', color: base.ink }}>{job.job_number ? `${job.job_number} · ` : ''}{job.address}</Text>
        {!!(job.repair_description || job.survey_notes) && <Muted style={{ marginTop: 4 }}>Repair: {job.repair_description || job.survey_notes}</Muted>}
      </Card>

      {/* Add from the schedule of rates: Category ▾, Item ▾, or search. */}
      {rates.length > 0 ? (
        <Card>
          <Text style={{ fontWeight: '700', color: base.ink, marginBottom: 6 }}>From The Schedule Of Rates{qs?.ratesName ? ` — ${qs.ratesName}` : ''}</Text>
          <RateFinder rates={rates} onPick={(r) => { setLines([...lines, rateLine(r)]); toast(`Added ${r.code || 'the item'}`); }} />
        </Card>
      ) : <Muted style={{ marginBottom: 8 }}>No schedule of rates on this contract yet: add your own lines, or one figure. (Upload one in Finance › Project Admin › Edit Project Financials › Contract Rates?)</Muted>}

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
            <Text style={{ flex: 1, color: base.slate }}>Schedule Of Rates</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Less or plus" onPress={async () => { const k = await chooseAction('Rates Adjustment', [{ key: 'less', label: 'Less (Discount)' }, { key: 'plus', label: 'Plus (Uplift)' }]); if (k && k !== sign) setDisc(String(-discount)); }} style={[box, { flexDirection: 'row', gap: 6 }]}>
              <Text style={{ color: base.ink, fontWeight: '600' }}>{sign === 'plus' ? 'Plus' : 'Less'}</Text><Text style={{ color: base.slate, fontSize: 11 }}>▾</Text>
            </Pressable>
            <TextInput value={String(Math.abs(disc != null ? num(disc) : discount))} onChangeText={(v) => setDisc(String((sign === 'plus' ? -1 : 1) * num(v)))} keyboardType="decimal-pad" accessibilityLabel="Discount percent" style={[box, { width: 64, textAlign: 'center' }]} />
            <Text style={{ color: base.slate }}>%</Text>
          </View>
        )}
        {t.discount > 0 && <View style={{ flexDirection: 'row' }}><Text style={{ flex: 1, color: base.slate }}>Less {discount}% off {gbp(t.sorGross)}</Text><Text style={{ color: base.ink }}>-{gbp(t.discount)}</Text></View>}
        {t.discount < 0 && <View style={{ flexDirection: 'row' }}><Text style={{ flex: 1, color: base.slate }}>Plus {-discount}% on {gbp(t.sorGross)}</Text><Text style={{ color: base.ink }}>+{gbp(-t.discount)}</Text></View>}
        <View style={{ flexDirection: 'row', marginTop: 4 }}><Text style={{ flex: 1, fontWeight: '600', color: base.ink }}>Net</Text><Text style={{ fontWeight: '700', color: base.ink }}>{gbp(t.net)}</Text></View>
        <View style={{ flexDirection: 'row', marginTop: 4 }}><Text style={{ flex: 1, color: base.slate }}>{t.vatPct ? `VAT ${t.vatPct}%` : 'VAT'} (From The Project)</Text><Text style={{ color: base.ink }}>{t.vatPct ? gbp(t.vat) : '—'}</Text></View>
        <View style={{ flexDirection: 'row', marginTop: 4 }}><Text style={{ flex: 1, fontWeight: '700', color: base.ink }}>Total</Text><Text accessibilityLabel="Quote total" style={{ fontWeight: '700', fontSize: 16, color: base.ink }}>{gbp(t.total)}</Text></View>
        {!!t.vatNote && <Muted style={{ marginTop: 6 }}>{t.vatNote}</Muted>}
      </Card>

      <Muted style={{ textAlign: 'center', marginBottom: 6 }}>Now: {QUOTE_STATUS.find(([k]) => k === now)?.[1]}</Muted>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
        <Button kind="ghost" busy={busy} title="Save ▾" onPress={() => void saveAs()} />
        <Button busy={busy} title="Save & Send To Client" onPress={() => setSending(true)} />
      </View>
      {/* Decided online by the client (Andy, 7 Nov 2026). */}
      {!!job.quote_decided_online_at && <Muted style={{ textAlign: 'center', marginBottom: 6 }}>{job.quote_approved ? 'Approved' : 'Turned down'} online {new Date(job.quote_decided_online_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}{job.quote_decision_note ? ` — ${job.quote_decision_note}` : ''}</Muted>}
      {qs?.onlineApproval && <View style={{ alignItems: 'center', marginBottom: 6 }}><Button small kind="ghost" busy={busy} title="🔗 Copy Approval Link" onPress={() => void copyLink()} /></View>}
      {sending && (
        <FinForm title="Send Quote To Client" saveLabel="Send" onClose={() => setSending(false)}
          note={qs?.onlineApproval ? 'The email has an Approve Or Reject Online button.' : 'Client Approves Quotes Online is off for this contract (Project Admin).'}
          initial={{ to: billEmail || (site as Row | undefined)?.client_email || '', words: `Hello,\n\nPlease find attached our quote for ${[job.job_number, job.address].filter(Boolean).join(' — ')}.${qs?.onlineApproval ? ' You can approve or reject it online with the button below.' : ''}\n\nKind regards,` }}
          fields={[{ k: 'to', label: 'To', kind: 'email' }, { k: 'words', label: 'Message', kind: 'multiline' }]}
          onSave={async (v) => {
            const to = String(v.to || '').split(/[;,\s]+/).map((x) => x.trim()).filter(Boolean);
            if (!to.length || to.some((x) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x))) return 'Enter the client’s email address.';
            return sendIt(to, String(v.words || ''));
          }} />
      )}
      <View style={{ alignItems: 'center', marginBottom: space.xl }}>
        <Button small kind="ghost" title="📄 Quote PDF" onPress={async () => { if (!(await exportRepairReport('quote', { ...job, quote_lines: lines, quote_discount_pct: discount, variation_cost: t.net } as never, site, org, '', qs?.vat).catch(() => false))) toast('Could not build the PDF.'); }} />
      </View>
    </ScrollView>
  );
}
