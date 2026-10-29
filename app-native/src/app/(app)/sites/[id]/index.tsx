// A job's home page. Ported from renderSiteHome (330): the job number and
// on-site pill, the Finance money strip (921), three stat boxes (client,
// today's calendar, snags / on site / tasks), the wide Check In / Out tile,
// then the tiles — 2 across on a phone, 4 on a computer, centred icon and
// label; an odd last tile fills its row. Clients get a cut-down view.
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { HowTo } from '@/components/HowTo';
import { JobSignPrompt } from '@/components/JobSignPrompt';
import { OphIcon } from '@/components/OphIcon';
import { Card, Muted, TINTS } from '@/components/ui';
import { useBook } from '@/data/finBook';
import { useSiteHome } from '@/data/siteHome';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { heading, mono } from '@/lib/fonts';
import { siteStatusKey } from '@/lib/rules/checkin';
import { forecast, marginOn, pctTxt } from '@/lib/rules/finBook';
import { money } from '@/lib/rules/finance';
import { overallPct } from '@/lib/rules/sow';
import { isFinanceUser, isManager } from '@/lib/roles';
import type { Site } from '@/lib/types';
import { base, page, space, useDesk } from '@/theme/theme';

type T = { key: string; ic?: string; emoji?: string; bg: string; fg: string; title: string; sub: string; badge?: number | string; onPress: () => void };

const shadow = { shadowColor: '#14181D', shadowOpacity: 0.07, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 1 } as const;
const cardBox = { backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, ...shadow } as const;

/** The .tilegrid.hometiles grid: an odd last tile stretches across its row. */
function JobTiles({ tiles, cols }: { tiles: T[]; cols: number }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 }}>
      {tiles.map((x, i) => (
        <View key={x.key} style={{ width: tiles.length % 2 === 1 && i === tiles.length - 1 ? '100%' : `${100 / cols}%`, padding: 5 }}>
          <Pressable onPress={x.onPress} accessibilityRole="button"
            style={({ pressed }) => [cardBox, { borderRadius: 18, height: 106, alignItems: 'center', justifyContent: 'center', gap: 6.6, paddingHorizontal: 10 }, pressed && { opacity: 0.7 }]}>
            <View style={{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: x.bg }}>
              {x.ic ? <OphIcon name={x.ic} size={20} color={x.fg} /> : <Text style={{ fontSize: 18 }}>{x.emoji}</Text>}
            </View>
            <Text numberOfLines={2} style={[heading(700), { fontSize: 13.2, color: base.ink, textAlign: 'center' }]}>{x.title}</Text>
            {!!x.sub && <Text numberOfLines={1} style={{ fontSize: 11.1, color: base.slateLight, textAlign: 'center' }}>{x.sub}</Text>}
            {x.badge != null && x.badge !== 0 && (
              <Text style={{ position: 'absolute', top: 8, right: 8, backgroundColor: base.red, color: '#fff', fontSize: 11, fontWeight: '800', borderRadius: 9, minWidth: 18, textAlign: 'center', paddingHorizontal: 4, overflow: 'hidden' }}>{x.badge}</Text>
            )}
          </Pressable>
        </View>
      ))}
    </View>
  );
}

/** One .statrow box. */
function StatBox({ children, onPress }: { children: ReactNode; onPress?: () => void }) {
  return (
    <Pressable disabled={!onPress} onPress={onPress} style={[cardBox, { flex: 1, minWidth: 0, height: 64, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 6 }]}>{children}</Pressable>
  );
}
const statN = { ...mono(600), fontSize: 19, color: base.ink } as const;
const statL = { fontSize: 10, color: base.slateLight, textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: '700', textAlign: 'center' } as const;

/** Finance users: costs to date, invoiced to date, profit margin (921 finHomeStripHtml). Tap for the project's Finance. */
function MoneyStrip({ site }: { site: Site }) {
  const { me } = useAuth();
  const desk = useDesk();
  const { data } = useBook(me?.org_id, site.id);
  const fc = data ? forecast(data.book, site.id, data.settings) : null;
  const cell = (label: string, v: ReactNode, em: string, first?: boolean) => (
    <View style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 3, paddingVertical: desk ? 14 : 10, paddingHorizontal: desk ? 16 : 8, borderLeftWidth: first ? 0 : 1, borderLeftColor: '#EEF0F4' }}>
      <Text numberOfLines={1} style={{ fontSize: desk ? 12 : 10.5, fontWeight: '700', color: base.slate, textTransform: 'uppercase', letterSpacing: desk ? 0.5 : 0.2 }}>{label}</Text>
      {fc ? v : <View style={{ backgroundColor: '#F0F2F5', borderRadius: 6, width: '70%', height: 24 }} />}
      <Text numberOfLines={1} style={{ fontSize: desk ? 12.5 : 11, color: base.slate }}>{fc ? em || ' ' : ' '}</Text>
    </View>
  );
  const big = (s: string, colour: string = base.ink, small?: string) => (
    <Text numberOfLines={1} style={[heading(800), { fontSize: desk ? 22 : 16, color: colour }]}>{s}{small ? <Text style={{ fontSize: desk ? 13 : 11 }}> {small}</Text> : null}</Text>
  );
  let costs = <View />, inv = <View />, marg = <View />, e1 = '', e2 = '', e3 = '';
  if (fc) {
    const prog = fc.certified || fc.applied || 0;
    const on = marginOn(fc), m = on.value - fc.costToDate, pct = on.value ? (m / on.value) * 100 : null;
    costs = big(money(fc.costToDate, 0));
    e1 = fc.committedTotal ? `+ ${money(fc.committedTotal, 0)} ordered` : fc.budgetTotal ? `${pctTxt((fc.costToDate / fc.budgetTotal) * 100)} of budget` : '';
    inv = big(money(fc.invoiced, 0));
    e2 = prog ? `${fc.certified ? 'Certified' : 'Applied'} ${money(prog, 0)}` : fc.ffa ? `of ${money(fc.ffa, 0)}` : '';
    marg = on.value ? big(money(m, 0), m < 0 ? base.red : base.ok, pctTxt(pct)) : big('—');
    e3 = on.value ? `on ${money(on.value, 0)} ${on.label}` : 'Nothing applied or invoiced yet';
  }
  return (
    <Pressable onPress={() => router.push(`/fin/job/${site.id}` as never)} accessibilityLabel="Open project finance"
      style={{ flexDirection: 'row', backgroundColor: '#fff', borderWidth: 1, borderColor: '#E6E9EF', borderRadius: 16, marginBottom: 14, overflow: 'hidden' }}>
      {cell('Costs to date', costs, e1, true)}
      {cell('Invoiced to date', inv, e2)}
      {cell('Profit margin', marg, e3)}
    </Pressable>
  );
}

export default function SiteHome() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, org } = useAuth();
  const desk = useDesk();
  const { data: site, isLoading } = useSite(id);
  const { data: h, refetch } = useSiteHome(site);
  useFocusEffect(useCallback(() => { void refetch(); }, [refetch]));
  if (!site || !me) return <Muted style={{ padding: space.l }}>{isLoading ? 'Loading…' : 'Project not found.'}</Muted>;
  const mgr = isManager(me);
  const client = me.role === 'client';
  const fin = isFinanceUser(me, org) && org?.has_finance !== false;
  const cols = desk ? 4 : 2;
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
        <JobTiles cols={cols} tiles={[
          { key: 'jobs', ic: 'wrench', bg: TINTS.red[0], fg: TINTS.red[1], title: 'Live Jobs', sub: 'Repair jobs on this contract', onPress: go('repairs') },
          { key: 'hs', ic: 'shield', bg: '#E7E9EE', fg: base.ink, title: 'Health & Safety', sub: 'RAMS · COSHH · TBT', onPress: go('hs') },
          { key: 'mat', ic: 'box', bg: base.okBg, fg: base.ok, title: 'Materials', sub: 'Orders', onPress: go('materials') },
          { key: 'cal', ic: 'calendar', bg: '#E4EEFB', fg: TINTS.blue[1], title: 'Calendar', sub: 'Key dates', onPress: go('calendar') },
          { key: 'todo', ic: 'check', bg: '#EFEAFB', fg: '#5B3FA6', title: 'To Do List', sub: 'Tasks', onPress: go('todos') },
        ]} />
        {footer}
      </ScrollView>
    );
  }

  const cal = h?.todayEvents ?? [];
  const calLabel = !cal.length ? 'Nothing today' : cal.length === 1 ? cal[0] : `${cal[0]} +${cal.length - 1} more`;
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  const clientLine = { fontSize: 11, color: base.ink, fontWeight: '500', textAlign: 'center' } as const;
  const hasClient = site.client_name || site.client_contact_name || site.client_phone;
  const clientBox = (
    <StatBox key="client" onPress={mgr ? go('client') : undefined}>
      {hasClient ? (
        <>
          <Text numberOfLines={1} style={clientLine}><Text style={{ fontWeight: '800' }}>Client:</Text> {site.client_name || '—'}</Text>
          <Text numberOfLines={1} style={clientLine}><Text style={{ fontWeight: '800' }}>Contact:</Text> {[site.client_contact_name, site.client_phone].filter(Boolean).join(' · ') || '—'}</Text>
        </>
      ) : <Text style={{ fontSize: 12, color: base.slateLight, fontWeight: '700' }}>{mgr ? 'Add client info' : 'No client info yet'}</Text>}
    </StatBox>
  );
  const calBox = (
    <StatBox key="cal" onPress={go('calendar')}>
      <Text style={statN}>{today}</Text>
      <Text numberOfLines={2} style={{ fontSize: 10, color: base.slateLight, fontWeight: '600', textAlign: 'center' }}>{calLabel}</Text>
    </StatBox>
  );
  const snags = h?.openSnags ?? 0;
  const tasksBox = <StatBox key="tasks" onPress={go('schedule')}><Text style={statN}>{done}/{h?.tasks.length ?? 0}</Text><Text style={statL}>Tasks done</Text></StatBox>;
  const snagBox = <StatBox key="snags" onPress={go('snagging/list')}><Text style={[statN, !!snags && { color: base.warn }]}>{snags}</Text><Text style={statL}>Open snags</Text></StatBox>;
  const onSiteBox = <StatBox key="on" onPress={go('checkin')}><Text style={[statN, !!h?.onSiteCount && { color: base.ok }]}>{h?.onSiteCount ?? 0}</Text><Text style={statL}>On site now</Text></StatBox>;
  const stats = mgr ? [clientBox, calBox, snags ? snagBox : onSiteBox] : client ? [tasksBox, calBox, snagBox] : [clientBox, calBox, tasksBox];

  const tiles: T[] = client ? [
    { key: 'sow', ic: 'clipboard', bg: TINTS.blue[0], fg: TINTS.blue[1], title: 'Schedule of Works', sub: sowSub, onPress: go('schedule') },
    { key: 'hs', ic: 'shield', bg: '#E7E9EE', fg: base.ink, title: 'Health & Safety', sub: 'RAMS · COSHH · TBT', onPress: go('hs') },
    { key: 'snag', ic: 'reports', bg: base.warnBg, fg: base.warn, title: 'Snagging', sub: h ? `${snags} open` : '…', onPress: go('snagging/list') },
  ] : [
    { key: 'sow', ic: 'clipboard', bg: TINTS.blue[0], fg: TINTS.blue[1], title: 'Schedule of Works', sub: sowSub, onPress: go('schedule') },
    ...(site.acting_as_main_contractor ? [{ key: 'mc', ic: 'building', bg: '#E7E9EE', fg: base.ink, title: 'Main Contractor', sub: 'Areas and subcontractors', onPress: go('mc') }] : []),
    { key: 'hs', ic: 'shield', bg: '#E7E9EE', fg: base.ink, title: 'Health & Safety', sub: h ? `${h.pendingRams} to sign` : '…', badge: mgr ? (h?.hsGap ? '!' : undefined) : h?.pendingRams || undefined, onPress: go('hs') },
    { key: 'dwg', ic: 'pencil', bg: '#E7EFEA', fg: '#2F6B4A', title: "Drawings, Spec's & Programme", sub: 'View & upload', onPress: go('drawings') },
    { key: 'mat', ic: 'box', bg: base.okBg, fg: base.ok, title: 'Materials', sub: h ? `${h.pendingMaterials} pending` : '…', onPress: go('materials') },
    { key: 'rep', ic: 'reports', bg: base.warnBg, fg: base.warn, title: mgr ? 'Inspections & Reports' : 'Snagging & Variations', sub: h ? `${snags} open` : '…', badge: snags || undefined, onPress: go('snagging') },
    ...(h?.canSeePrice ? [{ key: 'price', emoji: '💷', bg: '#FFF3D9', fg: '#8A6300', title: 'Price', sub: 'Pricing elements', onPress: go('price') }] : []),
    ...(fin ? [{ key: 'fin', ic: 'pound', bg: '#E6F2EC', fg: '#1E6B45', title: 'Finance', sub: site.job_number ? `Job ${site.job_number}` : 'OpHUB Finance', onPress: () => router.push(`/fin/job/${site.id}` as never) }] : []),
    // Messages is in the left menu on a computer.
    ...(!desk ? [{ key: 'msg', ic: 'chat', bg: TINTS.blue[0], fg: TINTS.blue[1], title: 'Messages', sub: 'Team messages', onPress: go('messages') }] : []),
    ...(mgr && siteStatusKey(site) === 'closed' ? [{ key: 'ho', emoji: '📘', bg: '#E3F4EA', fg: '#1E7A46', title: 'Handover', sub: 'O&M manual · data sheets · guarantees', onPress: go('handover') }]
      : mgr ? [{ key: 'todo', ic: 'check', bg: '#EFEAFB', fg: '#5B3FA6', title: 'To Do List', sub: h ? (h.openTodos ? `${h.openTodos} open` : 'Nothing outstanding') : '…', onPress: go('todos') }] : []),
  ];
  // Calendar sits second to last, whatever comes before it.
  if (!client) tiles.splice(Math.max(0, tiles.length - 1), 0, { key: 'cal', ic: 'calendar', bg: '#E4EEFB', fg: TINTS.blue[1], title: 'Calendar', sub: 'Key dates', onPress: go('calendar') });

  return (
    <ScrollView contentContainerStyle={page(720)}>
      {header}
      <HowTo k="site_home" />
      <JobSignPrompt siteId={site.id} />
      <View style={[cardBox, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderColor: base.line, borderRadius: 16, paddingVertical: 10.8, paddingHorizontal: 12.6, marginBottom: 12.6, shadowOpacity: 0 }]}>
        <Text style={{ fontSize: 12.6, color: base.ink }}>{site.job_number ? <><Text style={{ fontWeight: '800' }}>Job No:</Text> {site.job_number}</> : ' '}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingVertical: 4.5, paddingHorizontal: 8, backgroundColor: h?.meOnSite ? base.okBg : base.line }}>
          <View style={{ width: 5.4, height: 5.4, borderRadius: 3, backgroundColor: h?.meOnSite ? base.ok : base.slate }} />
          <Text style={{ fontSize: 9.9, fontWeight: '800', letterSpacing: 0.5, color: h?.meOnSite ? base.ok : base.slate }}>{h?.meOnSite ? 'ON SITE' : 'NOT CHECKED IN'}</Text>
        </View>
      </View>
      {fin && !client && <MoneyStrip site={site} />}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>{stats}</View>
      {mgr && siteStatusKey(site) === 'live' && h?.assignedCount === 0 && (
        <Pressable onPress={go('admin')}>
          <Card style={{ backgroundColor: base.warnBg, paddingVertical: 10 }}>
            <Text style={{ color: base.ink, fontSize: 13 }}><Text style={{ fontWeight: '700' }}>Nobody is assigned to this job yet.</Text> Tap to assign operatives so they can check in.</Text>
          </Card>
        </Pressable>
      )}
      {!client && (
        <Pressable onPress={go('checkin')} accessibilityRole="button"
          style={({ pressed }) => [cardBox, { borderRadius: 18, minHeight: 59.8, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 5 }, pressed && { opacity: 0.7 }]}>
          <View style={{ width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: base.red }}><OphIcon name="clock" size={18} color="#fff" /></View>
          <Text style={[heading(700), { fontSize: 13.2, color: base.ink }]}>Check In / Out</Text>
          <Text style={{ fontSize: 11.1, color: base.slateLight }}>Tap to log time</Text>
        </Pressable>
      )}
      <JobTiles cols={cols} tiles={tiles} />
      {footer}
    </ScrollView>
  );
}
