// Works Orders on a repair contract (Andy, 7 Nov 2026; docs/claude-code/REPAIRS-PLAN.md).
// Managers: a box for each stage (To Book, Booked In, Quote Needed, Awaiting Approval, Approved — To Book,
// On Hold / Other Trades, Works Done), + New Job (Read Works Order) — the job number, address, call-out and tenant are
// read from the PDF — the jobs in the chosen box, the Schedule Of Rates, bulk add and the Excel export.
// Operatives: their jobs, soonest booking first, grouped by day, with Show All (all of them if nobody's booked on any).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { MoneyStrip } from '@/components/MoneyStrip';
import { confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Muted, SectionTitle } from '@/components/ui';
import { nameOf, usePeople } from '@/data/hs';
import { addRepairJob, uploadWorkOrder, useRepairJobs } from '@/data/repairs';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { siteStatusKey } from '@/lib/rules/checkin';
import { supabase } from '@/lib/supabase';
import { pdfLines } from '@/lib/pdfjs';
import { exportRepairTracker } from '@/lib/repairExports';
import { parseWorkOrder } from '@/lib/rules/workOrder';
import { BOXES, bookedFor, bookedTo, dayHeading, operativeJobs, otherTradesOf, repairStage, STAGE_LABEL, type RJob } from '@/lib/rules/repairStages';
import type { RepairJob } from '@/lib/rules/repairs';
import { isFinanceUser, isManager } from '@/lib/roles';
import { base, page, radius, space, useTheme } from '@/theme/theme';

const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card, marginBottom: 8, fontSize: 15 } as const;
/** Work order fields from a picked PDF (nothing when it can't be read). */
async function readWo(uri: string, name?: string | null) {
  if (!/\.pdf$/i.test(name || '')) return {};
  try { const rows = await pdfLines(new Uint8Array(await (await fetch(uri)).arrayBuffer())); return rows ? parseWorkOrder(rows) : {}; } catch { return {}; }
}
// 030 applyTitleCase: capitals only at the start or after a space (Andy's House, not Andy'S House).
const titleCase = (t: string) => t.replace(/(^|\s)([a-z])/g, (_m, a: string, c: string) => a + c.toUpperCase());
const shortDate = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');
const EMPTY = { job_number: '', address: '', description: '', tenant_name: '', tenant_phone: '', tenant_no: '', priority: '' };

export default function WorksOrders() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, org } = useAuth();
  const t = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: site } = useSite(id);
  const { data: people = [] } = usePeople();
  // Nobody assigned yet: the same "assign operatives" prompt as a normal job's home (340).
  const { data: assigned } = useQuery({ queryKey: ['repairAssigned', id], enabled: !!id, queryFn: async () => (((await supabase.from('site_assignments').select('user_id').eq('site_id', id).limit(1)).data ?? []) as unknown[]).length });
  const { data: jobs = [] } = useRepairJobs(id);
  const [sel, setSel] = useState('to_book');
  const [showAll, setShowAll] = useState(false);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState(EMPTY);
  const [wo, setWo] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [bulk, setBulk] = useState('');
  const [find, setFind] = useState('');
  if (!me || !site) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const mgr = isManager(me);
  const all = jobs as unknown as (RJob & RepairJob)[];
  const set = (k: keyof typeof EMPTY) => (v: string) => setF((o) => ({ ...o, [k]: k === 'address' ? titleCase(v) : v }));
  const open = (j: RJob) => router.push(`/sites/${site.id}/repairs/job/${j.id}` as never);

  const add = async () => {
    if (!f.address.trim()) { toast('Enter an address.'); return; }
    setBusy(true);
    const jid = await addRepairJob(me, site.id, f);
    let woFailed = false;
    if (jid && wo) woFailed = !(await uploadWorkOrder(me, { id: jid } as RepairJob, { uri: wo.uri, name: wo.name || 'work-order.pdf', mimeType: wo.mimeType }));
    setBusy(false);
    if (!jid) { toast('Could not save — try again.'); return; }
    if (woFailed) toast('Job added — but the works order failed to upload. Add it from the job later.');
    setAdding(false); setF(EMPTY); setWo(null);
    void qc.invalidateQueries({ queryKey: ['repairJobs', id] });
    router.push(`/sites/${site.id}/repairs/job/${jid}` as never);
    // Then straight into choosing the job's OneDrive folder (340) — back out to link it later from the job.
    if (await confirmAsk('Job added. Choose a OneDrive folder for it now? Photos, the works order and the reports all go there once it’s linked.', 'Choose folder', 'Later')) router.push({ pathname: '/pm/onedrive-pick', params: { target: 'repairjob', id: jid } } as never);
  };
  const pickWo = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
    if (r.canceled || !r.assets[0]) return;
    const a = r.assets[0]; setWo(a);
    const p = await readWo(a.uri, a.name);
    const next = { ...f, ...(p.jobNumber ? { job_number: p.jobNumber } : {}), ...(p.address ? { address: p.address } : {}), ...(p.description ? { description: p.description } : {}), ...(p.tenant ? { tenant_name: p.tenant } : {}), ...(p.tenantPhone ? { tenant_phone: p.tenantPhone } : {}) };
    const n = Object.keys(next).filter((k) => next[k as keyof typeof EMPTY] !== f[k as keyof typeof EMPTY]).length;
    setF(next);
    if (n) toast(`Filled ${n} field${n > 1 ? 's' : ''} from the works order — check before saving`);
  };

  // One job in a list: number and address, then where it's at and when.
  const row = (j: RJob & RepairJob, i: number) => {
    const st = repairStage(j), when = bookedFor(j), who = bookedTo(j), trades = otherTradesOf(j);
    return (
      <Pressable key={j.id} accessibilityRole="button" accessibilityLabel={`${j.job_number || ''} ${j.address || ''}`.trim()} onPress={() => open(j)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderTopWidth: i ? 1 : 0, borderTopColor: '#EEF0F2' }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontSize: 13.5, fontWeight: '600', color: base.ink }}>{j.job_number ? `${j.job_number} · ` : ''}{j.address || 'Repair job'}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 2 }}>
            {j.on_hold && <Text style={{ fontSize: 11, fontWeight: '600', color: '#B45309', backgroundColor: '#FDF1E0', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden' }}>On Hold</Text>}
            {!!trades && <Text style={{ fontSize: 11, fontWeight: '600', color: base.ink, backgroundColor: '#F0F1F4', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden' }}>{trades}{j.other_trades_date ? ` ${shortDate(j.other_trades_date)}` : ''}</Text>}
            <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 11.5, color: base.slate }}>{STAGE_LABEL[st]}{when ? ` · ${shortDate(when)}` : ''}{who && mgr ? ` · ${nameOf(people, who)}` : ''}{!when && j.description ? ` · ${j.description}` : ''}</Text>
          </View>
        </View>
        <Text style={{ fontSize: 18, color: base.slate }}>›</Text>
      </Pressable>
    );
  };
  const list = (items: (RJob & RepairJob)[]) => <View style={{ backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: 12, overflow: 'hidden', marginBottom: 10 }}>{items.map(row)}</View>;

  if (!mgr) {
    // Operatives: their jobs, soonest first, by day.
    const r = operativeJobs(all, me.id, showAll);
    const days: { h: string; items: (RJob & RepairJob)[] }[] = [];
    r.list.forEach((j) => { const h = dayHeading(bookedFor(j)); let d = days.find((x) => x.h === h); if (!d) { d = { h, items: [] }; days.push(d); } d.items.push(j); });
    const pill = (on: boolean, label: string, onPress: () => void) => (
      <Pressable accessibilityRole="button" onPress={onPress} style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radius.input, borderWidth: 1, borderColor: on ? base.ink : base.line, backgroundColor: on ? base.ink : base.card }}>
        <Text style={{ fontWeight: '600', color: on ? '#fff' : base.ink }}>{label}</Text>
      </Pressable>
    );
    return (
      <ScrollView contentContainerStyle={page(720)}>
        <Stack.Screen options={{ title: 'Works Orders' }} />
        {!r.fallback && <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>{pill(!showAll, `My Jobs (${r.mine})`, () => setShowAll(false))}{pill(showAll, `Show All (${r.all})`, () => setShowAll(true))}</View>}
        {r.fallback && <Muted style={{ marginBottom: 10 }}>Nobody has been booked on any jobs yet, so here they all are.</Muted>}
        {days.length ? days.map((d) => (
          <View key={d.h}>
            <Text style={{ fontSize: 11.5, fontWeight: '700', color: d.h === 'Overdue' ? base.red : base.slate, letterSpacing: 0.4, marginBottom: 6 }}>{d.h.toUpperCase()}</Text>
            {list(d.items)}
          </View>
        )) : <Muted>{showAll ? 'No open jobs on this contract.' : 'No jobs booked to you. Tap Show All to see the rest.'}</Muted>}
        <Muted style={{ textAlign: 'center', marginTop: 6 }}>Tap a job to check in and go through its steps.</Muted>
      </ScrollView>
    );
  }

  // Managers.
  const def = BOXES.find((b) => b.k === sel) || BOXES[0];
  const q = find.trim().toLowerCase();
  const inBox = all.filter(def.test).filter((j) => !q || `${j.job_number || ''} ${j.address || ''} ${j.tenant_name || ''} ${j.description || ''}`.toLowerCase().includes(q));
  const items = sel === 'all' ? inBox.slice().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))) : inBox.slice().sort((a, b) => String(bookedFor(a) || '9').localeCompare(String(bookedFor(b) || '9')) || String(b.created_at || '').localeCompare(String(a.created_at || '')));
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Works Orders' }} />
      {isFinanceUser(me, org) && org?.has_finance && <MoneyStrip site={site} />}
      {siteStatusKey(site) === 'live' && assigned === 0 && (
        <Pressable onPress={() => router.push(`/sites/${site.id}/admin` as never)}>
          <Card style={{ backgroundColor: base.warnBg, paddingVertical: 10 }}>
            <Text style={{ color: base.ink, fontSize: 13 }}><Text style={{ fontWeight: '600' }}>Nobody is assigned to this contract yet.</Text> Tap to assign operatives so they see its jobs and can check in.</Text>
          </Card>
        </Pressable>
      )}
      {/* Where every job is at: tap a box for its jobs. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        {BOXES.filter((b) => b.k !== 'all').map((b) => {
          const n = all.filter(b.test).length, on = sel === b.k;
          return (
            <Pressable key={b.k} accessibilityRole="button" accessibilityLabel={`${b.l}, ${n}`} onPress={() => setSel(b.k)}
              style={{ flexGrow: 1, flexBasis: '45%', backgroundColor: base.card, borderRadius: 10, borderWidth: on ? 2 : 1, borderColor: on ? base.ink : base.cardLine, paddingVertical: 10, paddingHorizontal: 12 }}>
              <Text style={{ fontSize: 21, fontWeight: '700', color: b.k === 'to_book' && n ? t.brand1 : base.ink }}>{n}</Text>
              <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '600', color: base.slate }}>{b.l}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
        <View style={{ flex: 2 }}><Button title="+ New Job (Read Works Order)" onPress={() => setAdding(!adding)} /></View>
        <View style={{ flex: 1 }}><Button kind="ghost" title={`All Jobs (${all.length})`} onPress={() => setSel('all')} /></View>
      </View>
      {adding && (
        <Card style={{ backgroundColor: base.paper }}>
          <SectionTitle>New Job</SectionTitle>
          <Button kind="ghost" title={wo ? `📎 ${wo.name}` : '📎 Choose The Works Order PDF (Fills In The Rest)'} onPress={() => void pickWo()} />
          <TextInput value={f.job_number} onChangeText={set('job_number')} placeholder="Works order number" style={box} />
          <TextInput value={f.address} onChangeText={set('address')} placeholder="Address (with the postcode, for the check-in)" style={box} />
          <TextInput value={f.description} onChangeText={set('description')} placeholder="Call-out (what's wrong)" multiline style={[box, { minHeight: 56 }]} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput value={f.tenant_name} onChangeText={set('tenant_name')} placeholder="Tenant" style={[box, { flex: 1 }]} />
            <TextInput value={f.tenant_phone} onChangeText={set('tenant_phone')} placeholder="Phone" keyboardType="phone-pad" style={[box, { flex: 1 }]} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput value={f.tenant_no} onChangeText={set('tenant_no')} placeholder="Tenant No." style={[box, { flex: 1 }]} />
            <TextInput value={f.priority} onChangeText={set('priority')} placeholder="Priority (e.g. 7 Days)" style={[box, { flex: 1 }]} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
            <Button busy={busy} title="Add Job" onPress={() => void add()} />
            <Button kind="ghost" title="Cancel" onPress={() => { setAdding(false); setF(EMPTY); setWo(null); }} />
          </View>
        </Card>
      )}
      <Text style={{ fontSize: 11.5, fontWeight: '700', color: base.slate, letterSpacing: 0.4, marginBottom: 6 }}>{def.l.toUpperCase()} ({inBox.length})</Text>
      {all.length > 8 && <TextInput value={find} onChangeText={setFind} placeholder="Search works order, address or tenant" style={[box, { fontSize: 16 }]} />}
      {items.length ? list(items) : <Muted style={{ marginBottom: 10 }}>No jobs here.</Muted>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 6, marginBottom: space.xl }}>
        <Button small kind="ghost" title="Schedule Of Rates" onPress={() => router.push(`/sites/${site.id}/repairs/rates` as never)} />
        <Button small kind="ghost" title={bulk || '📥 Bulk Add Works Orders'} disabled={!!bulk} onPress={async () => {
          const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', multiple: true, copyToCacheDirectory: true });
          if (r.canceled || !r.assets.length) return;
          const have = new Set(jobs.map((j) => (j.job_number || '').trim().toLowerCase()).filter(Boolean));
          let made = 0, review = 0, dup = 0;
          for (let i = 0; i < r.assets.length; i++) {
            const a = r.assets[i]; setBulk(`Importing ${i + 1} of ${r.assets.length}…`);
            try {
              const p = await readWo(a.uri, a.name), key = (p.jobNumber || '').trim().toLowerCase();
              if (key && have.has(key)) { dup++; continue; }
              const jid = await addRepairJob(me, site.id, { address: p.address || `⚠ Review — ${(a.name || 'works order').replace(/\.pdf$/i, '')}`, job_number: p.jobNumber || '', description: p.description || '', tenant_name: p.tenant, tenant_phone: p.tenantPhone });
              if (!jid) continue;
              await uploadWorkOrder(me, { id: jid } as RepairJob, { uri: a.uri, name: a.name || 'work-order.pdf', mimeType: a.mimeType });
              made++; if (!p.address) review++; if (key) have.add(key);
            } catch { /* one bad file doesn't stop the rest */ }
          }
          setBulk(''); void qc.invalidateQueries({ queryKey: ['repairJobs', id] });
          toast(`Done — ${made} job${made === 1 ? '' : 's'} created${review ? ` (${review} need review — the address couldn't be read, check the attached PDF)` : ''}${dup ? `, ${dup} already on this contract skipped` : ''}`);
        }} />
        <Button small kind="ghost" title="⬇ Export Excel" onPress={async () => { if (!(await exportRepairTracker(site.name, jobs))) toast('Could not make the file — try again.'); }} />
      </View>
    </ScrollView>
  );
}
