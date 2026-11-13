// A job's home page. Ported from renderSiteHome (330); laid out again with Andy, 9 Nov 2026 (his option B): one info bar
// (the job number and client, today's calendar, on site and the weather, the on-site pill and Check In / Out), the
// Finance money strip, then the job's areas as rows, one colour, with counts: two columns on a laptop, one on a phone.
// Clients get a cut-down view (rows only).
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { AssignList } from '@/components/AssignList';
import { HowTo } from '@/components/HowTo';
import { JobSignPrompt } from '@/components/JobSignPrompt';
import { MoneyStrip } from '@/components/MoneyStrip';
import { OphIcon } from '@/components/OphIcon';
import { useToast } from '@/components/toast';
import { Card, Muted } from '@/components/ui';
import { WeatherLink } from '@/components/WeatherSwap';
import { useRepairJobs } from '@/data/repairs';
import { assignToSite, removeFromSite, useTeamData } from '@/data/siteAdmin';
import { useSiteHome } from '@/data/siteHome';
import { useSubOrders } from '@/data/siteOrders';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { heading } from '@/lib/fonts';
import { siteStatusKey } from '@/lib/rules/checkin';
import { BOXES, isOpen, operativeJobs, type RJob } from '@/lib/rules/repairStages';
import { overallPct } from '@/lib/rules/sow';
import { isFinanceUser, isManager } from '@/lib/roles';
import { base, page, space, useDesk, useTheme } from '@/theme/theme';
import { useQueryClient } from '@tanstack/react-query';

type R = { key: string; ic: string; title: string; sub: string; badge?: number | string; onPress: () => void };

// Flat, as Finance (Andy, 3 Nov 2026).
const cardBox = { backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, shadowOpacity: 0, elevation: 0 } as const;
const rule = '#EEF0F2';

/** The job's areas as rows in one box (Andy, 9 Nov 2026): a plain icon, the name, its count or note, ›. On a laptop the
 *  note sits on the right; on a phone it goes under the name. cols 2 = two columns of rows. */
function JobRows({ rows, cols, desk }: { rows: R[]; cols: number; desk: boolean }) {
  // A phone's rows are 1.1 × bigger (Andy, 13 Nov 2026).
  const k = desk ? 1 : 1.1;
  return (
    <View style={[cardBox, { borderRadius: 10, flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: cols > 1 ? 4 : 0 }]}>
      {rows.map((x, i) => (
        <Pressable key={x.key} onPress={x.onPress} accessibilityRole="button" accessibilityLabel={`${x.title}, ${x.sub}`}
          style={({ pressed }) => [{ width: `${100 / cols}%`, flexDirection: 'row', alignItems: 'center', gap: 12 * k, paddingVertical: 11 * k, paddingHorizontal: 14, borderTopWidth: i >= cols ? 1 : 0, borderTopColor: rule }, pressed && { backgroundColor: '#F7F8FA' }]}>
          <View style={{ width: 32 * k, height: 32 * k, borderRadius: 8 * k, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: base.cardLine }}>
            <OphIcon name={x.ic} size={17 * k} color={base.ink} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={[heading(600), { fontSize: 13.5 * k, color: base.ink }]}>{x.title}</Text>
            {!desk && !!x.sub && <Text numberOfLines={1} style={{ fontSize: 11.5 * k, color: base.slateLight, marginTop: 1 }}>{x.sub}</Text>}
          </View>
          {desk && !!x.sub && <Text numberOfLines={1} style={{ flexShrink: 1, maxWidth: '45%', fontSize: 12, color: base.slateLight }}>{x.sub}</Text>}
          {x.badge != null && x.badge !== 0 && (
            <Text style={{ backgroundColor: base.red, color: '#fff', fontSize: 11, fontWeight: '600', borderRadius: 9, minWidth: 18, textAlign: 'center', paddingHorizontal: 5, overflow: 'hidden' }}>{x.badge}</Text>
          )}
          <OphIcon name="chevron" size={14} color={base.slateLight} />
        </Pressable>
      ))}
    </View>
  );
}

/** A repair contract's Works Orders, as the red Live Projects card on the home page (Andy, 9 Nov 2026). */
function WorksOrdersCard({ sub, onPress }: { sub: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Works Orders, ${sub}`}
      style={({ pressed }) => [{ backgroundColor: t.brand1, borderRadius: 22, paddingVertical: 18, paddingHorizontal: 20, marginBottom: 10 }, pressed && { opacity: 0.9 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}><OphIcon name="wrench" size={22} color={t.brand1Text} /></View>
        <OphIcon name="chevron" size={22} color={t.brand1Text} stroke={2.4} />
      </View>
      <Text style={[heading(800), { color: t.brand1Text, fontSize: 20, letterSpacing: -0.2 }]}>Works Orders</Text>
      <Text style={{ color: t.brand1Text, opacity: 0.92, marginTop: 4, fontSize: 13, fontWeight: '500' }}>{sub}</Text>
    </Pressable>
  );
}
/** A manager's line on it: how many are open, and how many to book. */
function worksSub(jobs: RJob[]): string {
  const open = jobs.filter(isOpen).length;
  const toBook = jobs.filter((j) => BOXES.some((b) => b.k === 'to_book' && b.test(j))).length;
  return [`${open} open`, toBook ? `${toBook} to book` : ''].filter(Boolean).join(' · ');
}

/** One part of the info bar: a bold line and a grey line under it; tappable when it opens something. Each part takes an
 *  equal share of the row (Andy, 9 Nov 2026: spread across); centred on a laptop. */
function InfoPart({ top, sub, label, onPress, line, center }: { top: string; sub: ReactNode; label: string; onPress?: () => void; line?: boolean; center?: boolean }) {
  return (
    <Pressable disabled={!onPress} onPress={onPress} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={label}
      style={{ flex: 1, minWidth: 0, alignItems: center ? 'center' : 'flex-start', paddingHorizontal: 12, paddingVertical: 2, borderLeftWidth: line ? 1 : 0, borderLeftColor: rule }}>
      <Text numberOfLines={1} style={[heading(600), { fontSize: 13.5, color: base.ink }]}>{top}</Text>
      {typeof sub === 'string' ? <Text numberOfLines={1} style={{ fontSize: 11.5, color: base.slateLight, marginTop: 1 }}>{sub}</Text> : sub}
    </Pressable>
  );
}

export default function SiteHome() {
  const [assignOpen, setAssignOpen] = useState(false);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, org } = useAuth();
  const desk = useDesk();
  const { data: site, isLoading } = useSite(id);
  const { data: h, refetch } = useSiteHome(site);
  // A repair contract's Works Orders count (Andy, 7 Nov 2026): managers, jobs to book; operatives, their jobs.
  const { data: rjobs = [], refetch: refetchJobs } = useRepairJobs(site?.repair_contract ? site.id : undefined);
  // Subcontract Orders shows when the job is on a price or already has orders (Andy, 13 Nov 2026).
  const { data: subOrders } = useSubOrders(me && isManager(me) ? id : undefined);
  useFocusEffect(useCallback(() => { void refetch(); void refetchJobs(); }, [refetch, refetchJobs]));
  if (!site || !me) return <Muted style={{ padding: space.l }}>{isLoading ? 'Loading…' : 'Project not found.'}</Muted>;
  const mgr = isManager(me);
  const client = me.role === 'client';
  const fin = isFinanceUser(me, org) && org?.has_finance !== false;
  const go = (p: string) => () => router.push(`/sites/${site.id}/${p}` as never);
  const done = h ? h.tasks.filter((x) => x.status === 'done').length : 0;
  const sowSub = h ? `${done} of ${h.tasks.length} done${h.tasks.length ? ` · ${overallPct(h.tasks)}%` : ''}` : '…';
  const header = (
    <Stack.Screen options={{
      title: site.name,
      // On a computer Project Settings is in the left menu.
      headerRight: mgr && !desk ? () => <Pressable onPress={go('admin')} hitSlop={10} style={{ paddingHorizontal: 12 }}><OphIcon name="gear" size={20} color={base.ink} /></Pressable> : undefined,
    }} />
  );
  const footer = (
    <Text style={{ textAlign: 'center', marginTop: 26, fontSize: 11, color: base.slateLight, fontStyle: 'italic' }}>{me.name}{org?.name ? `  -  ${org.name}` : ''}</Text>
  );
  if (site.repair_contract) {
    return (
      <ScrollView contentContainerStyle={page(720)}>
        {header}
        <HowTo k="site_home" />
        {/* Works Orders full width, as Live Projects on the home page (Andy, 9 Nov 2026); then the rest as rows. */}
        <WorksOrdersCard onPress={go('repairs')} sub={client ? 'Repair jobs on this contract' : mgr ? worksSub(rjobs) : (() => { const n = operativeJobs(rjobs, me.id, false).mine; return n ? `${n} job${n === 1 ? '' : 's'} for you` : 'Your repair jobs'; })()} />
        <JobRows desk={desk} cols={desk ? 2 : 1} rows={[
          // A client: Works Orders and Health & Safety only (their pages).
          ...(client ? [] : [{ key: 'cal', ic: 'calendar', title: 'Calendar', sub: 'Key dates', onPress: go('calendar') },
          { key: 'todo', ic: 'check', title: 'To Do List', sub: 'Tasks', onPress: go('todos') }]),
          { key: 'hs', ic: 'shield', title: 'Health & Safety', sub: 'RAMS · COSHH · TBT', onPress: go('hs') },
        ]} />
        {footer}
      </ScrollView>
    );
  }

  const cal = h?.todayEvents ?? [];
  const calLabel = !cal.length ? 'Nothing On' : cal.length === 1 ? cal[0] : `${cal[0]} +${cal.length - 1} more`;
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  const snags = h?.openSnags ?? 0;

  // 510 getMcTiles: nine areas; operatives don't count the ones hidden from them.
  const mcAreas = 9 - (mgr ? 0 : new Set(((site as { mc_hidden_tiles?: string[] | null }).mc_hidden_tiles) ?? []).size);
  const rows: R[] = client ? [
    { key: 'sow', ic: 'clipboard', title: 'Schedule of Works', sub: sowSub, onPress: go('schedule') },
    { key: 'hs', ic: 'shield', title: 'Health & Safety', sub: 'RAMS · COSHH · TBT', onPress: go('hs') },
    { key: 'snag', ic: 'wrench', title: 'Snagging', sub: h ? `${snags} open` : '…', onPress: go('snagging/list') },
  ] : [
    { key: 'sow', ic: 'clipboard', title: 'Schedule of Works', sub: sowSub, onPress: go('schedule') },
    ...(site.acting_as_main_contractor ? [{ key: 'mc', ic: 'building', title: 'Main Contractor', sub: `${mcAreas} area${mcAreas === 1 ? '' : 's'}`, onPress: go('mc') }] : []),
    { key: 'hs', ic: 'shield', title: 'Health & Safety', sub: h ? `${h.pendingRams} to sign` : '…', badge: mgr ? (h?.hsGap ? '!' : undefined) : h?.pendingRams || undefined, onPress: go('hs') },
    { key: 'dwg', ic: 'layers', title: "Drawings, Spec's & Programme", sub: 'View & upload', onPress: go('drawings') },
    ...((me?.role === 'pm' || me?.role === 'admin') && (site as { onedrive_folder_id?: string | null }).onedrive_folder_id ? [{ key: 'docs', ic: 'cloud', title: 'Documents', sub: 'The job’s OneDrive folder', onPress: go('documents') }] : []),
    { key: 'mat', ic: 'box', title: 'Materials', sub: h ? `${h.pendingMaterials} pending` : '…', onPress: go('materials') },
    // Subcontract Orders is labour, not materials: its own row (Andy, 11 Nov 2026).
    // Only when the job is on a price (Admin › Price) or already has orders; otherwise it's raised from Materials (Andy, 13 Nov 2026).
    ...(mgr && (site.price_enabled || (subOrders?.length ?? 0) > 0) ? [{ key: 'subco', ic: 'users', title: 'Subcontract Orders', sub: subOrders?.length ? `${subOrders.length} order${subOrders.length === 1 ? '' : 's'}` : 'Orders to subcontractors', onPress: go('materials/subcontracts') }] : []),
    { key: 'rep', ic: 'reports', title: mgr ? 'Inspections & Reports' : 'Snagging & Variations', sub: h ? `${snags} open` : '…', badge: snags || undefined, onPress: go('snagging') },
    ...(h?.canSeePrice ? [{ key: 'price', ic: 'pound', title: 'Price', sub: h.priceWages ? `${h.priceWages} wage${h.priceWages > 1 ? 's' : ''} to book` : h.priceVars ? `${h.priceVars} variation${h.priceVars > 1 ? 's' : ''} pending` : 'Restricted access', badge: h.priceVars + h.priceWages || undefined, onPress: go('price') }] : []),
    ...(mgr && siteStatusKey(site) === 'closed' ? [{ key: 'ho', ic: 'book', title: 'Handover', sub: 'O&M manual · data sheets · guarantees', onPress: go('handover') }]
      : mgr && desk ? [{ key: 'todo', ic: 'check', title: 'To Do List', sub: h ? (h.openTodos ? `${h.openTodos} open` : 'Nothing outstanding') : '…', onPress: go('todos') }] : []),
  ];
  // Calendar sits second to last, whatever comes before it.
  if (!client) rows.splice(Math.max(0, rows.length - 1), 0, { key: 'cal', ic: 'calendar', title: 'Calendar', sub: 'Key dates', onPress: go('calendar') });
  // No HUB or To Do rows on a phone: the HUB (bottom bar) has the messages and to-dos (Andy, 13 Nov 2026).

  // 330: a client gets a minimal, view-only home: no job bar, money or stats, just the rows.
  if (client) return (
    <ScrollView contentContainerStyle={page(720)}>
      {header}
      <JobRows desk={desk} cols={1} rows={rows} />
    </ScrollView>
  );

  const contact = [site.client_contact_name, site.client_phone].filter(Boolean).join(' · ');
  const pill = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 8, backgroundColor: h?.meOnSite ? base.okBg : base.line }}>
      <View style={{ width: 5.4, height: 5.4, borderRadius: 3, backgroundColor: h?.meOnSite ? base.ok : base.slate }} />
      <Text style={{ fontSize: 9.9, fontWeight: '600', letterSpacing: 0.5, color: h?.meOnSite ? base.ok : base.slate }}>{h?.meOnSite ? 'ON SITE' : 'NOT CHECKED IN'}</Text>
    </View>
  );
  // Check In / Out: the job's main button, red.
  const checkBtn = (
    <Pressable onPress={go('checkin')} accessibilityRole="button" accessibilityLabel="Check In / Out"
      style={({ pressed }) => [{ backgroundColor: base.red, borderRadius: 10, paddingVertical: desk ? 8 : 11, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, pressed && { opacity: 0.85 }]}>
      <OphIcon name="clock" size={16} color="#fff" />
      <Text style={[heading(700), { fontSize: 13.5, color: '#fff' }]}>Check In / Out</Text>
    </Pressable>
  );
  const jobTop = [site.job_number, site.client_name].filter(Boolean).join(' · ') || site.name;
  const clientSub = !desk && (site.client_contact_name || site.client_phone) ? (
    <View style={{ marginTop: 2 }}>
      {!!site.client_contact_name && <Text numberOfLines={1} style={{ fontSize: 12.5, color: base.slate }}>{site.client_contact_name}</Text>}
      {!!site.client_phone && <Text numberOfLines={1} style={{ fontSize: 12.5, color: base.slate, marginTop: 1 }}>{site.client_phone}</Text>}
    </View>
  ) : contact || (!mgr ? '' : site.client_name ? 'Add The Contact ›' : 'Add Client Info ›');
  const clientPart = <InfoPart top={jobTop} sub={clientSub} label={`Client: ${jobTop}`} onPress={mgr ? go('client') : undefined} center={desk} />;
  const todayPart = <InfoPart line={desk} top={today} sub={calLabel} label={`Today: ${calLabel}`} onPress={go('calendar')} center={desk} />;
  const thirdPart = mgr
    ? <InfoPart line top={`${h?.onSiteCount ?? 0} On Site`} sub="Who’s Checked In" label={`${h?.onSiteCount ?? 0} on site`} onPress={go('checkin')} center={desk} />
    : <InfoPart line top={`${done} of ${h?.tasks.length ?? 0}`} sub="Tasks Done" label="Tasks done" onPress={go('schedule')} center={desk} />;
  // The weather in its own box, so a tap opens it (Andy, 11 Nov 2026: it was inside the On Site box and went to Check In).
  const weatherPart = site.postcode && me ? (
    <View style={{ flex: 1, minWidth: 0, alignItems: desk ? 'center' : 'flex-start', paddingHorizontal: 12, paddingVertical: 2, borderLeftWidth: 1, borderLeftColor: rule }}>
      <WeatherLink me={me} site={site} company={org?.name || ''} />
      <Text numberOfLines={1} style={{ fontSize: 11.5, color: base.slateLight, marginTop: 1 }}>Weather · Tap For More</Text>
    </View>
  ) : null;
  // On a laptop one line, spread evenly across; on a phone the job and the pill, then today, on site and the weather, then the button.
  const info = desk ? (
    <View style={[cardBox, { borderRadius: 10, flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingLeft: 2, paddingRight: 12, marginBottom: 10 }]}>
      {clientPart}{todayPart}{thirdPart}{weatherPart}
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10, borderLeftWidth: 1, borderLeftColor: rule, paddingLeft: 12 }}>{pill}{checkBtn}</View>
    </View>
  ) : (
    <View style={[cardBox, { borderRadius: 10, paddingTop: 10, paddingBottom: 12, marginBottom: 10 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingRight: 12, paddingVertical: 4, minHeight: 52 }}>{clientPart}{pill}</View>
      {/* Finance above today, on site and the weather (Andy, 13 Nov 2026). */}
      {fin && <MoneyStrip site={site} embedded />}
      <View style={{ flexDirection: 'row', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: rule }}>{todayPart}{thirdPart}{weatherPart}</View>
      <View style={{ paddingHorizontal: 12, marginTop: 12 }}>{checkBtn}</View>
    </View>
  );
  const nobody = mgr && siteStatusKey(site) === 'live' && h?.assignedCount === 0 && (
    <Pressable onPress={() => setAssignOpen(!assignOpen)}>
      <Card style={{ backgroundColor: base.warnBg, paddingVertical: 10 }}>
        <Text style={{ color: base.ink, fontSize: 13 }}><Text style={{ fontWeight: '600' }}>Nobody is assigned to this job yet.</Text> Tap to assign operatives so they can check in.</Text>
        {assignOpen && <QuickAssign siteId={site.id} />}
      </Card>
    </Pressable>
  );
  return (
    <ScrollView contentContainerStyle={page(720)}>
      {header}
      <HowTo k="site_home" />
      <JobSignPrompt siteId={site.id} />
      {info}
      {fin && desk && <MoneyStrip site={site} />}
      {nobody}
      <JobRows desk={desk} cols={desk ? 2 : 1} rows={rows} />
      {footer}
    </ScrollView>
  );
}

function QuickAssign({ siteId }: { siteId: string }) {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: team, refetch } = useTeamData(siteId, false);
  const [busy, setBusy] = useState<string | null>(null);
  if (!me) return null;
  return (
    <View style={{ marginTop: 10 }}>
      <AssignList people={team?.operatives ?? []} isOn={(u) => !!team?.assigned.has(u)} busyId={busy} empty="No operatives yet — they need to sign up first." onToggle={async (u, on) => {
        setBusy(u); const err = on ? await removeFromSite(siteId, u) : await assignToSite(me, siteId, u); setBusy(null);
        toast(err ?? (on ? 'Removed from site' : 'Assigned to site')); void refetch(); void qc.invalidateQueries({ queryKey: ['siteHome', siteId] });
      }} />
    </View>
  );
}
