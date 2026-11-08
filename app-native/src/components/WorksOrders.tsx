// Works Orders on a repair contract (Andy, 7 Nov 2026; docs/claude-code/REPAIRS-PLAN.md). One screen for Projects
// (Works Orders) and Finance (Live Jobs), so a job can be worked from either: Finance opens a job's hub with its money
// and Raise Invoice, ticks done jobs in Completed Works - To Invoice to put them on one invoice, and has the Schedule
// Of Rates and Costs By Job.
// Managers: + New Job (Read Works Order) across the top — the job number, address, call-out and tenant are read from
// the PDF — then a box for each stage (To Schedule, Scheduled - Awaiting Attendance, Quotation Required, Awaiting Client
// Approval, Approved - Requires Booking Date, On Hold / Other Trades, Completed Works - To Invoice, Completed Works -
// Paid, All Jobs), the jobs in the chosen box, and the Excel export in the footer bar. No money here: the schedule of rates and
// quote pricing are in Finance (Andy, 7 Nov 2026).
// Operatives: their boxes (no Quotation Required or Paid; Completed Works without "To Invoice"), and their jobs, soonest
// booking first, grouped by day, with Show All (all of them if nobody's booked on any).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams, usePathname } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { usePageCrumbs } from '@/components/Crumbs';
import { RepairNewJob } from '@/components/RepairNewJob';
import { confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Muted } from '@/components/ui';
import { nameOf, usePeople } from '@/data/hs';
import { raiseRepairInvoice } from '@/data/repairInvoice';
import { useRepairJobs } from '@/data/repairs';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { plainGet, plainSet } from '@/lib/kv';
import { siteStatusKey } from '@/lib/rules/checkin';
import { supabase } from '@/lib/supabase';
import { exportRepairTracker } from '@/lib/repairExports';
import { dueLabel, isOverdue } from '@/lib/rules/repairDue';
import { BOXES, bookedFor, bookedTo, dayHeading, isOpen, noAccessOf, operativeJobs, otherTradesOf, repairStage, STAGE_LABEL, type Box, type RJob } from '@/lib/rules/repairStages';
import type { RepairJob } from '@/lib/rules/repairs';
import { isManager } from '@/lib/roles';
import { base, page, radius, space, useTheme } from '@/theme/theme';

const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card, marginBottom: 8, fontSize: 15 } as const;
const shortDate = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');

export function WorksOrders({ siteId: id, finance = false }: { siteId: string; finance?: boolean }) {
  const { me } = useAuth();
  const t = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: site } = useSite(id);
  const { data: people = [] } = usePeople();
  // Nobody assigned yet: the same "assign operatives" prompt as a normal job's home (340).
  const { data: assigned } = useQuery({ queryKey: ['repairAssigned', id], enabled: !!id, queryFn: async () => (((await supabase.from('site_assignments').select('user_id').eq('site_id', id).limit(1)).data ?? []) as unknown[]).length });
  const { data: jobs = [] } = useRepairJobs(id);
  // Which jobs are paid (their invoice is), for Completed Works - Paid: ids only, no money.
  const mgr0 = !!me && (finance || isManager(me));
  const { data: paidIds = [] } = useQuery({ queryKey: ['repairPaid', id], enabled: !!id && mgr0, queryFn: async () => (((await (supabase.rpc as unknown as (n: string, a: object) => Promise<{ data: unknown }>)('repair_jobs_paid', { p_site: id })).data as string[] | null) ?? []).map(String) });
  // The "assign operatives" banner can be closed (✕), per contract, on this device.
  const { data: hideAssign = false } = useQuery({ queryKey: ['repairAssignHide', id], enabled: !!id, queryFn: () => plainGet<boolean>(`repair_assign_hide_${id}`, false) });
  // The open box lives in the link (?box=quote_needed), so the trail at the top shows it like a folder — Projects › the
  // contract › Works Orders › Quotation Required — and Back closes it (Andy, 8 Nov 2026).
  const { box: boxParam } = useLocalSearchParams<{ box?: string }>();
  const path = usePathname();
  const sel = typeof boxParam === 'string' ? boxParam : '';
  const setSel = (k: string) => router.setParams({ box: k || undefined } as never);
  const opSel = sel, setOpSel = setSel;
  const openBox = BOXES.find((b) => b.k === sel);
  const opView = !!me && !finance && !isManager(me) && me.role !== 'client';
  usePageCrumbs(path, !finance && openBox ? [['Works Orders', path], [opView ? openBox.op || openBox.l : openBox.l, null]] : null);
  const wide = useWindowDimensions().width >= 900;
  const [showAll, setShowAll] = useState(false);
  const [adding, setAdding] = useState(false);
  const [find, setFind] = useState('');
  const [ticked, setTicked] = useState<string[]>([]);
  const [invBusy, setInvBusy] = useState(false);
  if (!me || !site) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const mgr = finance || isManager(me);
  const jobRoute = (jid: string) => (finance ? `/fin/job/${site.id}/repair/${jid}` : `/sites/${site.id}/repairs/job/${jid}`);
  const all = jobs as unknown as (RJob & RepairJob)[];
  const paid = new Set(paidIds);
  const open = (j: RJob) => router.push(jobRoute(j.id) as never);
  const byBookingThenNewest = (xs: (RJob & RepairJob)[]) => xs.slice().sort((a, b) => String(bookedFor(a) || '9').localeCompare(String(bookedFor(b) || '9')) || String(b.created_at || '').localeCompare(String(a.created_at || '')));
  // The boxes (Andy, 7 Nov 2026): on a phone two to a row with the chosen box's jobs below; on the laptop across the
  // page until one is tapped, then down the left with its jobs on the right. Tap the box again to close it.
  const tiles = (boxes: Box[], pool: (RJob & RepairJob)[], on: string, pick: (k: string) => void, label: (b: Box) => string = (b) => b.l, down = false) => (
    <View style={{ flexDirection: down ? 'column' : 'row', flexWrap: down ? 'nowrap' : 'wrap', gap: down ? 6 : 8, marginBottom: 10 }}>
      {boxes.map((b) => {
        const n = pool.filter((j) => b.test(j, paid)).length, sel1 = on === b.k;
        return (
          <Pressable key={b.k} accessibilityRole="button" accessibilityLabel={`${label(b)}, ${n}`} accessibilityState={{ selected: sel1 }} onPress={() => pick(b.k)}
            style={[{ backgroundColor: base.card, borderRadius: 10, borderWidth: sel1 ? 2 : 1, borderColor: sel1 ? base.ink : base.cardLine, paddingHorizontal: 12 },
              down ? { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 } : { flexGrow: 1, flexBasis: wide ? '18%' : '45%', paddingVertical: 10 }]}>
            <Text style={{ fontSize: down ? 17 : 21, fontWeight: '700', minWidth: down ? 30 : undefined, color: b.k === 'to_book' && n ? t.brand1 : base.ink }}>{n}</Text>
            <Text numberOfLines={2} style={{ flexShrink: 1, fontSize: 12, fontWeight: '600', color: base.slate }}>{label(b)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
  /** The tiles and the chosen box's jobs: side by side on the laptop once a box is open, else one under the other. */
  const layout = (tilesFor: (down: boolean) => ReactNode, jobsPart: ReactNode | null) => (wide && jobsPart ? (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
      <View style={{ width: 270 }}>{tilesFor(true)}</View>
      <View style={{ flex: 1, minWidth: 0 }}>{jobsPart}</View>
    </View>
  ) : <>{tilesFor(false)}{jobsPart}</>);

  // One job in a list: number and address, then where it's at and when.
  const row = (j: RJob & RepairJob, i: number) => {
    const st = repairStage(j), when = bookedFor(j), who = bookedTo(j), trades = otherTradesOf(j);
    return (
      <Pressable key={j.id} accessibilityRole="button" accessibilityLabel={`${j.job_number || ''} ${j.address || ''}`.trim()} onPress={() => open(j)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderTopWidth: i ? 1 : 0, borderTopColor: '#EEF0F2' }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontSize: 13.5, fontWeight: '600', color: base.ink }}>{j.job_number ? `${j.job_number} · ` : ''}{j.address || 'Repair job'}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 2 }}>
            {/* Due (from the priority) and no access visits (Andy, 7 Nov 2026). */}
            {isOpen(j) && !!dueLabel(j) && <Text style={{ fontSize: 11, fontWeight: '600', color: isOverdue(j) ? '#fff' : base.ink, backgroundColor: isOverdue(j) ? base.ink : '#F0F1F4', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden' }}>{dueLabel(j)}</Text>}
            {noAccessOf(j).length > 0 && <Text style={{ fontSize: 11, fontWeight: '600', color: base.ink, backgroundColor: '#F0F1F4', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden' }}>No Access ×{noAccessOf(j).length}</Text>}
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

  if (me.role === 'client') {
    // The client: every job and where it's at; tap one for its hub (details, notes, the quote and reports).
    const everything = all.slice().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    return (
      <ScrollView contentContainerStyle={page(wide ? 1180 : 720)}>
        <Stack.Screen options={{ title: 'Works Orders' }} />
        <Muted style={{ marginBottom: 10 }}>Every job on this contract and where it’s at. Tap one for its details, notes and documents.</Muted>
        {everything.length ? list(everything) : <Muted>No jobs yet.</Muted>}
      </ScrollView>
    );
  }
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
    // Their boxes (Andy, 7 Nov 2026): no Quotation Required or Paid, and Completed Works without "To Invoice". Tap one
    // for its jobs (theirs, or everyone's with Show All); tap it again for their list by day.
    const mineAny = (j: RJob & RepairJob) => [j.survey_booking_assigned_to, j.works_booking_assigned_to, j.surveyed_by].includes(me.id);
    const pool = showAll || r.fallback ? all : all.filter(mineAny);
    const opBoxes = BOXES.filter((b) => !b.mgrOnly && b.k !== 'all');
    const opDef = opBoxes.find((b) => b.k === opSel);
    return (
      <ScrollView contentContainerStyle={page(wide ? 1180 : 720)}>
        <Stack.Screen options={{ title: 'Works Orders' }} />
        {!r.fallback && <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>{pill(!showAll, `My Jobs (${r.mine})`, () => setShowAll(false))}{pill(showAll, `Show All (${r.all})`, () => setShowAll(true))}</View>}
        {r.fallback && <Muted style={{ marginBottom: 10 }}>Nobody has been booked on any jobs yet, so here they all are.</Muted>}
        {layout((down) => tiles(opBoxes, pool, opSel, (k) => setOpSel(opSel === k ? '' : k), (b) => b.op || b.l, down), opDef ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
              <Text style={{ flex: 1, fontSize: 11.5, fontWeight: '700', color: base.slate, letterSpacing: 0.4 }}>{(opDef.op || opDef.l).toUpperCase()}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close the list" hitSlop={10} onPress={() => setOpSel('')}><Text style={{ fontSize: 15, color: base.slate }}>✕</Text></Pressable>
            </View>
            {pool.filter((j) => opDef.test(j, paid)).length ? list(byBookingThenNewest(pool.filter((j) => opDef.test(j, paid)))) : <Muted style={{ marginBottom: 10 }}>No jobs here.</Muted>}
          </>
        ) : null)}
        {opDef ? null : days.length ? days.map((d) => (
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
  const inBox = all.filter((j) => def.test(j, paid)).filter((j) => !q || `${j.job_number || ''} ${j.address || ''} ${j.tenant_name || ''} ${j.description || ''}`.toLowerCase().includes(q));
  const items = sel === 'all' ? inBox.slice().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))) : byBookingThenNewest(inBox);
  // Finance: tick done jobs in Completed Works - To Invoice and put them on one invoice.
  const canTick = finance && sel === 'done';
  const tickable = items.filter((j) => !j.invoice_id);
  const tick = (jid: string) => setTicked(ticked.includes(jid) ? ticked.filter((x) => x !== jid) : [...ticked, jid]);
  const invoiceTicked = async () => {
    const pick = all.filter((j) => ticked.includes(j.id) && !j.invoice_id);
    if (!pick.length) { toast('Tick the jobs to put on the invoice.'); return; }
    if (!(await confirmAsk(`Put ${pick.length} job${pick.length === 1 ? '' : 's'} on one invoice?`, 'Yes, Invoice Them'))) return;
    setInvBusy(true); const inv = await raiseRepairInvoice(me, site as never, pick as never); setInvBusy(false);
    if (!inv) { toast('Could not start the invoice — try again.'); return; }
    setTicked([]); void qc.invalidateQueries({ queryKey: ['repairJobs', id] });
    router.push(`/fin/job/${id}/invoice/${inv}` as never);
  };
  const tickList = (xs: (RJob & RepairJob)[]) => (
    <View style={{ backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: 12, overflow: 'hidden', marginBottom: 10 }}>
      {xs.map((j, i) => (
        <View key={j.id} style={{ flexDirection: 'row', alignItems: 'center', borderTopWidth: i ? 1 : 0, borderTopColor: '#EEF0F2' }}>
          {j.invoice_id ? <Text style={{ width: 44, textAlign: 'center', fontSize: 11, color: base.slate }}>Inv.</Text> : (
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: ticked.includes(j.id) }} accessibilityLabel={`Tick ${j.job_number || j.address || 'job'}`} hitSlop={6} onPress={() => tick(j.id)} style={{ width: 44, alignItems: 'center', paddingVertical: 12 }}>
              <View style={{ width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: ticked.includes(j.id) ? base.ink : '#C9CDD3', backgroundColor: ticked.includes(j.id) ? base.ink : '#fff', alignItems: 'center', justifyContent: 'center' }}>
                {ticked.includes(j.id) && <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>✓</Text>}
              </View>
            </Pressable>
          )}
          <View style={{ flex: 1, minWidth: 0 }}>{row(j, 0)}</View>
        </View>
      ))}
    </View>
  );
  const footBtn = (l: string, onPress: () => void) => (
    <Pressable key={l} accessibilityRole="button" accessibilityLabel={l} onPress={onPress} style={{ borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)', borderRadius: 7, paddingVertical: 4, paddingHorizontal: 12 }}>
      <Text style={{ color: t.brand1Text, fontSize: 12.5, fontWeight: '600' }}>{l}</Text>
    </Pressable>
  );
  const shell = (el: ReactNode) => <ScrollView contentContainerStyle={page(wide ? 1180 : 720)} keyboardShouldPersistTaps="handled">{el}</ScrollView>;
  return shell(
    <>
      {!finance && <Stack.Screen options={{ title: 'Works Orders' }} />}
      {siteStatusKey(site) === 'live' && assigned === 0 && !hideAssign && (
        <Card style={{ backgroundColor: base.warnBg, paddingVertical: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <Pressable style={{ flex: 1 }} onPress={() => router.push(`/sites/${site.id}/admin` as never)}>
            <Text style={{ color: base.ink, fontSize: 13 }}><Text style={{ fontWeight: '600' }}>Nobody is assigned to this contract yet.</Text> Tap to assign operatives so they see its jobs and can check in.</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={() => { qc.setQueryData(['repairAssignHide', id], true); void plainSet(`repair_assign_hide_${id}`, true); }}>
            <Text style={{ fontSize: 16, color: base.slate }}>✕</Text>
          </Pressable>
        </Card>
      )}
      {/* + New Job across the top, then where every job is at: tap a box for its jobs (Andy, 7 Nov 2026). */}
      <View style={{ marginBottom: 10 }}><Button title="+ New Job (Read Works Order)" onPress={() => setAdding(!adding)} /></View>
      {adding && <RepairNewJob siteId={site.id} existing={jobs.map((j) => j.job_number || '')} onAdded={(jid) => { setAdding(false); if (jid) router.push(jobRoute(jid) as never); }} onCancel={() => setAdding(false)} />}
      {layout((down) => tiles(BOXES, all, sel, (k) => { setSel(sel === k ? '' : k); setFind(''); setTicked([]); }, undefined, down), sel ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
            <Text style={{ flex: 1, fontSize: 11.5, fontWeight: '700', color: base.slate, letterSpacing: 0.4 }}>{def.l.toUpperCase()} ({inBox.length})</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close the list" hitSlop={10} onPress={() => { setSel(''); setFind(''); }}><Text style={{ fontSize: 15, color: base.slate }}>✕</Text></Pressable>
          </View>
          {all.filter((j) => def.test(j, paid)).length > 8 && <TextInput value={find} onChangeText={setFind} placeholder="Search Works Order, Address Or Resident" style={[box, { fontSize: 16 }]} />}
          {canTick && tickable.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Button small busy={invBusy} title={`Invoice Ticked Jobs (${ticked.length})`} onPress={() => void invoiceTicked()} />
              <Button small kind="ghost" title={ticked.length === tickable.length ? 'Untick All' : 'Tick All'} onPress={() => setTicked(ticked.length === tickable.length ? [] : tickable.map((j) => j.id))} />
            </View>
          )}
          {items.length ? (canTick ? tickList(items) : list(items)) : <Muted style={{ marginBottom: 10 }}>No jobs here.</Muted>}
        </>
      ) : null)}
      {!sel && <Muted style={{ textAlign: 'center', marginBottom: 6 }}>Tap a box to see its jobs.</Muted>}
      {/* The footer bar, as on the other lists (Andy, 8 Nov 2026): how many jobs, and Export Excel on the right. */}
      <View style={{ position: 'sticky' as never, bottom: 10, marginTop: 10, marginBottom: space.xl, backgroundColor: t.brand1, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 16, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <Text style={{ color: t.brand1Text, fontSize: 12.5, fontWeight: '600' }}>{jobs.length} Job{jobs.length === 1 ? '' : 's'}</Text>
        <View style={{ marginLeft: 'auto', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          {finance && footBtn('Schedule Of Rates', () => router.push(`/fin/job/${id}/rates` as never))}
          {finance && footBtn('Costs By Job ›', () => router.push(`/fin/job/${id}/parts` as never))}
          {footBtn('⬇ Export Excel', async () => { if (!(await exportRepairTracker(site.name, jobs, finance))) toast('Could not make the file — try again.'); })}
        </View>
      </View>
    </>
  );
}
