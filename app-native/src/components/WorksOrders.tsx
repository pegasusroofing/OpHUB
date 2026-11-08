// Works Orders on a repair contract (Andy, 7 Nov 2026; docs/claude-code/REPAIRS-PLAN.md). One screen for Projects
// (Works Orders) and Finance (Live Jobs), so a job can be worked from either: Finance opens a job's hub with its money
// and Raise Invoice, and ticks done jobs in Completed Works - To Invoice to put them on one invoice. Finance's Costs By
// Job and Schedule Of Rates are tabs beside Live Jobs (Andy, 8 Nov 2026).
// Managers: + New Job (Read Works Order) across the top — the job number, address, call-out and resident are read from
// the PDF — then a box for each stage (To Schedule, Scheduled - Awaiting Attendance, Quotation Required, Awaiting Client
// Approval, Approved - Requires Booking Date, On Hold / Other Trades, Completed Works - To Invoice, Completed Works -
// Paid, All Jobs), all the same size. Tapping a box opens its jobs on a page of their own, on the phone and the laptop,
// with a drop-down to jump to another box (Andy, 8 Nov 2026); the jobs are in a table, as other lists are. The footer bar
// has the number of jobs and Export Excel. No money here: the schedule of rates and quote pricing are in Finance.
// Operatives: their boxes (no Quotation Required or Paid; Completed Works without "To Invoice"), and their jobs, soonest
// booking first, grouped by day, with Show All (all of them if nobody's booked on any).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams, usePathname } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { usePageCrumbs } from '@/components/Crumbs';
import { RepairTabs } from '@/components/FinNav';
import { RepairNewJob } from '@/components/RepairNewJob';
import { chooseAction, confirmAsk, useToast } from '@/components/toast';
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
const chip = (txt: string, dark = false, amber = false) => (
  <Text key={txt} style={{ fontSize: 10.5, fontWeight: '600', color: dark ? '#fff' : amber ? '#B45309' : base.ink, backgroundColor: dark ? base.ink : amber ? '#FDF1E0' : '#F0F1F4', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1, overflow: 'hidden' }}>{txt}</Text>
);
type J = RJob & RepairJob;

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
  // The open box lives in the link (?box=quote_needed): a page of its own, so Back returns to the boxes, and the trail at
  // the top shows it like a folder — Works Orders (or Live Jobs) › Quotation Required (Andy, 8 Nov 2026).
  const { box: boxParam } = useLocalSearchParams<{ box?: string }>();
  const path = usePathname();
  const sel = typeof boxParam === 'string' ? boxParam : '';
  const openBox = BOXES.find((b) => b.k === sel);
  const opView = !!me && !finance && !isManager(me) && me.role !== 'client';
  usePageCrumbs(path, openBox ? [[finance ? 'Live Jobs' : 'Works Orders', path], [opView ? openBox.op || openBox.l : openBox.l, null]] : null);
  const wide = useWindowDimensions().width >= 900;
  const [showAll, setShowAll] = useState(false);
  const [adding, setAdding] = useState(false);
  const [find, setFind] = useState('');
  const [ticked, setTicked] = useState<string[]>([]);
  const [invBusy, setInvBusy] = useState(false);
  if (!me || !site) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const mgr = finance || isManager(me);
  const jobRoute = (jid: string) => (finance ? `/fin/job/${site.id}/repair/${jid}` : `/sites/${site.id}/repairs/job/${jid}`);
  const all = jobs as unknown as J[];
  const paid = new Set(paidIds);
  const open = (j: RJob) => router.push(jobRoute(j.id) as never);
  const byBookingThenNewest = (xs: J[]) => xs.slice().sort((a, b) => String(bookedFor(a) || '9').localeCompare(String(bookedFor(b) || '9')) || String(b.created_at || '').localeCompare(String(a.created_at || '')));
  // A box opens its own page (pushed, so Back comes back to the boxes); the drop-down on that page swaps the box in place.
  const goBox = (k: string) => { setFind(''); setTicked([]); router.push({ pathname: path, params: { box: k } } as never); };
  const swapBox = (k: string) => { setFind(''); setTicked([]); router.setParams({ box: k } as never); };

  // The boxes, all the same size (Andy, 8 Nov 2026): two to a row on a phone, five on the laptop.
  const tiles = (boxes: Box[], pool: J[], label: (b: Box) => string = (b) => b.l) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
      {boxes.map((b) => {
        const n = pool.filter((j) => b.test(j, paid)).length;
        return (
          <Pressable key={b.k} accessibilityRole="button" accessibilityLabel={`${label(b)}, ${n}`} onPress={() => goBox(b.k)}
            style={{ backgroundColor: base.card, borderRadius: 10, borderWidth: 1, borderColor: base.cardLine, paddingHorizontal: 12, paddingVertical: 10, height: 82, flexGrow: 1, flexBasis: wide ? '18%' : '45%', maxWidth: wide ? '19.2%' : '48.6%' }}>
            <Text style={{ fontSize: 21, fontWeight: '700', color: b.k === 'to_book' && n ? t.brand1 : base.ink }}>{n}</Text>
            <Text numberOfLines={2} style={{ fontSize: 12, fontWeight: '600', color: base.slate }}>{label(b)}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  // The jobs as a table, as other lists are (Andy, 8 Nov 2026): a header row, then a row per job. The laptop has more columns.
  const table = (items: J[], tick?: { on: (j: J) => boolean; flip: (j: J) => void }) => {
    const W = wide ? { no: 120, st: 170, bk: 110, op: 120, due: 110 } : { no: 82, st: 0, bk: 70, op: 0, due: 0 };
    const head = (l: string, w?: number) => <Text numberOfLines={1} style={{ ...(w ? { width: w } : { flex: 1 }), fontSize: 11, fontWeight: '700', color: base.slate, letterSpacing: 0.3 }}>{l.toUpperCase()}</Text>;
    return (
      <View accessibilityLabel="Jobs table" style={{ backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: 12, overflow: 'hidden', marginBottom: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, paddingHorizontal: 10, backgroundColor: '#F6F7F9' }}>
          {tick && <View style={{ width: 24 }} />}
          {head(wide ? 'Works Order' : 'Order No', W.no)}{head('Address')}{wide && head('Stage', W.st)}{head('Booked', W.bk)}{wide && mgr && head('Operative', W.op)}{wide && head('Due', W.due)}
        </View>
        {items.map((j) => {
          const st = repairStage(j), when = bookedFor(j), who = bookedTo(j), trades = otherTradesOf(j);
          const chips = [
            ...(isOpen(j) && dueLabel(j) && !wide ? [chip(dueLabel(j) as string, isOverdue(j))] : []),
            ...(noAccessOf(j).length ? [chip(`No Access ×${noAccessOf(j).length}`)] : []),
            ...(j.on_hold ? [chip('On Hold', false, true)] : []),
            ...(trades ? [chip(`${trades}${j.other_trades_date ? ` ${shortDate(j.other_trades_date)}` : ''}`)] : []),
          ];
          return (
            <Pressable key={j.id} accessibilityRole="button" accessibilityLabel={`${j.job_number || ''} ${j.address || ''}`.trim()} onPress={() => open(j)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: '#EEF0F2' }}>
              {tick && (j.invoice_id ? <Text style={{ width: 24, textAlign: 'center', fontSize: 10.5, color: base.slate }}>Inv.</Text> : (
                <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: tick.on(j) }} accessibilityLabel={`Tick ${j.job_number || j.address || 'job'}`} hitSlop={8} onPress={() => tick.flip(j)} style={{ width: 24, alignItems: 'center' }}>
                  <View style={{ width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: tick.on(j) ? base.ink : '#C9CDD3', backgroundColor: tick.on(j) ? base.ink : '#fff', alignItems: 'center', justifyContent: 'center' }}>
                    {tick.on(j) && <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>✓</Text>}
                  </View>
                </Pressable>
              ))}
              <Text numberOfLines={2} style={{ width: W.no, fontSize: 12.5, fontWeight: '700', color: base.ink }}>{j.job_number || '—'}</Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={2} style={{ fontSize: 13, fontWeight: '600', color: base.ink }}>{j.address || 'Repair job'}</Text>
                {(!!j.description || !wide) && <Text numberOfLines={1} style={{ fontSize: 11.5, color: base.slate, marginTop: 1 }}>{wide ? j.description : [STAGE_LABEL[st], j.description].filter(Boolean).join(' · ')}</Text>}
                {chips.length > 0 && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 3 }}>{chips}</View>}
              </View>
              {wide && <Text numberOfLines={2} style={{ width: W.st, fontSize: 12, color: base.ink }}>{STAGE_LABEL[st]}</Text>}
              <View style={{ width: W.bk }}>
                <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '600', color: when ? base.ink : base.slate }}>{when ? shortDate(when) : '—'}</Text>
                {!wide && who && mgr && <Text numberOfLines={1} style={{ fontSize: 11, color: base.slate }}>{nameOf(people, who).split(' ')[0]}</Text>}
              </View>
              {wide && mgr && <Text numberOfLines={1} style={{ width: W.op, fontSize: 12, color: who ? base.ink : base.slate }}>{who ? nameOf(people, who) : '—'}</Text>}
              {wide && <Text numberOfLines={1} style={{ width: W.due, fontSize: 12, fontWeight: isOverdue(j) && isOpen(j) ? '700' : '400', color: isOverdue(j) && isOpen(j) ? '#C0392B' : base.ink }}>{isOpen(j) ? dueLabel(j) || '—' : '—'}</Text>}
            </Pressable>
          );
        })}
      </View>
    );
  };

  // A box's own page: a drop-down to jump to another box, search, the jobs.
  const boxPage = (boxes: Box[], pool: J[], label: (b: Box) => string, extra?: ReactNode, tick?: Parameters<typeof table>[1]) => {
    const def = boxes.find((b) => b.k === sel) || boxes[0];
    const q = find.trim().toLowerCase();
    const inBox = pool.filter((j) => def.test(j, paid));
    const shown = inBox.filter((j) => !q || `${j.job_number || ''} ${j.address || ''} ${j.tenant_name || ''} ${j.description || ''}`.toLowerCase().includes(q));
    const items = def.k === 'all' ? shown.slice().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))) : byBookingThenNewest(shown);
    return (
      <>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Box: ${label(def)}`} onPress={async () => {
            const k = await chooseAction('Jump To', boxes.map((b) => ({ key: b.k, label: `${b.k === def.k ? '✓ ' : ''}${label(b)} (${pool.filter((j) => b.test(j, paid)).length})` })));
            if (k && k !== def.k) swapBox(k);
          }} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: base.line, borderRadius: radius.input, paddingVertical: 9, paddingHorizontal: 12, backgroundColor: base.card, flexShrink: 1 }}>
            <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '700', color: base.ink, flexShrink: 1 }}>{label(def)} ({inBox.length})</Text>
            <Text style={{ color: base.slate }}>▾</Text>
          </Pressable>
        </View>
        {inBox.length > 8 && <TextInput value={find} onChangeText={setFind} placeholder="Search Works Order, Address Or Resident" style={[box, { fontSize: 16 }]} />}
        {extra}
        {items.length ? table(items, tick) : <Muted style={{ marginBottom: 10 }}>No jobs here.</Muted>}
      </>
    );
  };

  // The footer bar, as on the other lists (Andy, 8 Nov 2026): how many jobs, and Export Excel, on one line.
  const footer = (n: number) => (
    <View style={{ position: 'sticky' as never, bottom: 10, marginTop: 10, marginBottom: space.xl, backgroundColor: t.brand1, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Text style={{ flex: 1, color: t.brand1Text, fontSize: 12.5, fontWeight: '600' }}>{n} Job{n === 1 ? '' : 's'}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Export Excel" onPress={async () => { if (!(await exportRepairTracker(site.name, jobs, finance))) toast('Could not make the file — try again.'); }}
        style={{ borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)', borderRadius: 7, paddingVertical: 3, paddingHorizontal: 10 }}>
        <Text style={{ color: t.brand1Text, fontSize: 12, fontWeight: '600' }}>⬇ Export Excel</Text>
      </Pressable>
    </View>
  );
  const shell = (el: ReactNode) => <ScrollView contentContainerStyle={page(wide ? 1180 : 720)} keyboardShouldPersistTaps="handled">{el}</ScrollView>;

  if (me.role === 'client') {
    // The client: every job and where it's at; tap one for its hub (details, notes, the quote and reports).
    const everything = all.slice().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    return shell(
      <>
        <Stack.Screen options={{ title: 'Works Orders' }} />
        <Muted style={{ marginBottom: 10 }}>Every job on this contract and where it’s at. Tap one for its details, notes and documents.</Muted>
        {everything.length ? table(everything) : <Muted>No jobs yet.</Muted>}
      </>,
    );
  }
  if (!mgr) {
    // Operatives: their jobs, soonest first, by day.
    const r = operativeJobs(all, me.id, showAll);
    const days: { h: string; items: J[] }[] = [];
    r.list.forEach((j) => { const h = dayHeading(bookedFor(j)); let d = days.find((x) => x.h === h); if (!d) { d = { h, items: [] }; days.push(d); } d.items.push(j); });
    const pill = (on: boolean, label: string, onPress: () => void) => (
      <Pressable accessibilityRole="button" onPress={onPress} style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radius.input, borderWidth: 1, borderColor: on ? base.ink : base.line, backgroundColor: on ? base.ink : base.card }}>
        <Text style={{ fontWeight: '600', color: on ? '#fff' : base.ink }}>{label}</Text>
      </Pressable>
    );
    // Their boxes (Andy, 7 Nov 2026): no Quotation Required or Paid, and Completed Works without "To Invoice". A box opens
    // its jobs (theirs, or everyone's with Show All) on their own page.
    const mineAny = (j: J) => [j.survey_booking_assigned_to, j.works_booking_assigned_to, j.surveyed_by].includes(me.id);
    const pool = showAll || r.fallback ? all : all.filter(mineAny);
    const opBoxes = BOXES.filter((b) => !b.mgrOnly && b.k !== 'all');
    const opLabel = (b: Box) => b.op || b.l;
    return shell(
      <>
        <Stack.Screen options={{ title: 'Works Orders' }} />
        {!r.fallback && <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>{pill(!showAll, `My Jobs (${r.mine})`, () => setShowAll(false))}{pill(showAll, `Show All (${r.all})`, () => setShowAll(true))}</View>}
        {r.fallback && <Muted style={{ marginBottom: 10 }}>Nobody has been booked on any jobs yet, so here they all are.</Muted>}
        {openBox && opBoxes.some((b) => b.k === sel) ? boxPage(opBoxes, pool, opLabel) : (
          <>
            {tiles(opBoxes, pool, opLabel)}
            {days.length ? days.map((d) => (
              <View key={d.h}>
                <Text style={{ fontSize: 11.5, fontWeight: '700', color: d.h === 'Overdue' ? base.red : base.slate, letterSpacing: 0.4, marginBottom: 6 }}>{d.h.toUpperCase()}</Text>
                {table(d.items)}
              </View>
            )) : <Muted>{showAll ? 'No open jobs on this contract.' : 'No jobs booked to you. Tap Show All to see the rest.'}</Muted>}
            <Muted style={{ textAlign: 'center', marginTop: 6 }}>Tap a job to check in and go through its steps.</Muted>
          </>
        )}
      </>,
    );
  }

  // Managers. Finance: tick done jobs in Completed Works - To Invoice and put them on one invoice.
  const canTick = finance && sel === 'done';
  const doneJobs = all.filter((j) => BOXES.find((b) => b.k === 'done')?.test(j, paid) && !j.invoice_id);
  const invoiceTicked = async () => {
    const pick = all.filter((j) => ticked.includes(j.id) && !j.invoice_id);
    if (!pick.length) { toast('Tick the jobs to put on the invoice.'); return; }
    if (!(await confirmAsk(`Put ${pick.length} job${pick.length === 1 ? '' : 's'} on one invoice?`, 'Yes, Invoice Them'))) return;
    setInvBusy(true); const inv = await raiseRepairInvoice(me, site as never, pick as never); setInvBusy(false);
    if (!inv) { toast('Could not start the invoice — try again.'); return; }
    setTicked([]); void qc.invalidateQueries({ queryKey: ['repairJobs', id] });
    router.push(`/fin/job/${id}/invoice/${inv}` as never);
  };
  const tickBar = canTick && doneJobs.length > 0 ? (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <Button small busy={invBusy} title={`Invoice Ticked Jobs (${ticked.length})`} onPress={() => void invoiceTicked()} />
      <Button small kind="ghost" title={ticked.length === doneJobs.length ? 'Untick All' : 'Tick All'} onPress={() => setTicked(ticked.length === doneJobs.length ? [] : doneJobs.map((j) => j.id))} />
    </View>
  ) : null;
  const inOpen = openBox ? all.filter((j) => openBox.test(j, paid)).length : jobs.length;
  return shell(
    <>
      {!finance && <Stack.Screen options={{ title: 'Works Orders' }} />}
      {finance && <RepairTabs id={id} on="repairs" />}
      {siteStatusKey(site) === 'live' && assigned === 0 && !hideAssign && !openBox && (
        <Card style={{ backgroundColor: base.warnBg, paddingVertical: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <Pressable style={{ flex: 1 }} onPress={() => router.push(`/sites/${site.id}/admin` as never)}>
            <Text style={{ color: base.ink, fontSize: 13 }}><Text style={{ fontWeight: '600' }}>Nobody is assigned to this contract yet.</Text> Tap to assign operatives so they see its jobs and can check in.</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={() => { qc.setQueryData(['repairAssignHide', id], true); void plainSet(`repair_assign_hide_${id}`, true); }}>
            <Text style={{ fontSize: 16, color: base.slate }}>✕</Text>
          </Pressable>
        </Card>
      )}
      {openBox ? boxPage(BOXES, all, (b) => b.l, tickBar, canTick ? { on: (j) => ticked.includes(j.id), flip: (j) => setTicked(ticked.includes(j.id) ? ticked.filter((x) => x !== j.id) : [...ticked, j.id]) } : undefined) : (
        <>
          {/* + New Job across the top, then where every job is at: tap a box for its jobs (Andy, 7 Nov 2026). */}
          <View style={{ marginBottom: 10 }}><Button title="+ New Job (Read Works Order)" onPress={() => setAdding(!adding)} /></View>
          {adding && <RepairNewJob siteId={site.id} existing={jobs.map((j) => j.job_number || '')} onAdded={(jid) => { setAdding(false); if (jid) router.push(jobRoute(jid) as never); }} onCancel={() => setAdding(false)} />}
          {tiles(BOXES, all)}
          <Muted style={{ textAlign: 'center', marginBottom: 6 }}>Tap a box to see its jobs.</Muted>
        </>
      )}
      {footer(inOpen)}
    </>,
  );
}
