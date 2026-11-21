// Company Dashboard (230 renderDashboard): live / upcoming / closed counts, open
// snags, RAMS / COSHH / TBT signatures still needed (operatives only, current
// signing cycle), Schedule of Works progress, recent incidents — each with the
// list of live jobs behind the number. Since 11 Nov 2026 (Andy: "make sure everything we need is on there"): Money (a
// company with Finance, for people with Finance), Quotes and Deliveries; a company with only Finance sees Money alone.
// 14 Nov 2026 (Andy: "have this replicate the finance styling"): the numbers are Finance Overview's tiles (figure on
// top, words under, tinted by what they mean) and each list is a Needs Attention card (a count, the name, ›).
import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { DashTabs } from '@/components/DashTabs';
import { FinStat, TONE } from '@/components/FinNav';
import { Card, Muted, SectionTitle } from '@/components/ui';
import { useDeliveryRequests } from '@/data/deliveries';
import { useFinOverview } from '@/data/finance';
import { useQuotes } from '@/data/quotes';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { siteStatusKey } from '@/lib/rules/checkin';
import { currentCycleSigs } from '@/lib/rules/hs';
import { overallPct } from '@/lib/rules/sow';
import { isFinanceUser, isFullManager, isManager } from '@/lib/roles';
import { groupQuotes, isQuoted } from '@/lib/rules/quotes';
import { supabase } from '@/lib/supabase';
import type { Site } from '@/lib/types';
import { base, page, space, useDesk } from '@/theme/theme';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
const rows = <T,>(r: { data: unknown }) => ((r.data as T[] | null) ?? []);
type Doc = { id: string; site_id: string; uploaded_at: string; resign_cycle_start: string | null };

function useCompanyDashboard(sites: Site[] | undefined) {
  return useQuery({
    queryKey: ['companyDashboard', (sites ?? []).length],
    enabled: !!sites,
    queryFn: async () => {
      const live = (sites ?? []).filter((s) => siteStatusKey(s) === 'live');
      const ids = live.map((s) => s.id);
      const none = Promise.resolve({ data: [] });
      const [snags, rams, coshh, assign, tasks, inc, tbts, ops] = await Promise.all([
        ids.length ? db.from('snags').select('id,site_id').eq('status', 'open').in('site_id', ids) : none,
        ids.length ? db.from('rams_docs').select('id,site_id,uploaded_at,resign_cycle_start').eq('status', 'current').in('site_id', ids).is('subcontractor_company_id', null).is('signing_closed_at', null) : none,
        ids.length ? db.from('coshh_docs').select('id,site_id,uploaded_at,resign_cycle_start').in('site_id', ids).is('subcontractor_company_id', null).is('signing_closed_at', null) : none,
        ids.length ? db.from('site_assignments').select('site_id,user_id').in('site_id', ids) : none,
        ids.length ? db.from('schedule_tasks').select('site_id,status,percent_complete').in('site_id', ids) : none,
        db.from('incident_reports').select('id,site_id,created_at,riddor_reportable,location').order('created_at', { ascending: false }).limit(500),
        ids.length ? db.from('toolbox_talks').select('id,site_id').eq('status', 'live').in('site_id', ids).is('subcontractor_company_id', null) : none,
        db.from('profiles').select('id').eq('role', 'operative'),
      ]);
      const ramsD = rows<Doc>(rams), coshhD = rows<Doc>(coshh), talks = rows<{ id: string; site_id: string }>(tbts);
      const [ts, rs, cs] = await Promise.all([
        talks.length ? db.from('toolbox_talk_signatures').select('tbt_id,user_id').in('tbt_id', talks.map((t) => t.id)) : none,
        ramsD.length ? db.from('rams_signatures').select('rams_id,user_id,signed_at').in('rams_id', ramsD.map((d) => d.id)) : none,
        coshhD.length ? db.from('coshh_signatures').select('coshh_id,user_id,signed_at').in('coshh_id', coshhD.map((d) => d.id)) : none,
      ]);
      const opSet = new Set(rows<{ id: string }>(ops).map((o) => o.id));
      const roster: Record<string, string[]> = {};
      rows<{ site_id: string; user_id: string }>(assign).forEach((a) => { if (opSet.has(a.user_id)) (roster[a.site_id] ||= []).push(a.user_id); });
      const outstanding = (docs: { id: string; site_id: string }[], sigs: { user_id: string; [k: string]: string }[], fk: string) => {
        const by: Record<string, number> = {};
        docs.forEach((d) => { const who = new Set(sigs.filter((s) => s[fk] === d.id).map((s) => s.user_id)); by[d.site_id] = (by[d.site_id] || 0) + (roster[d.site_id] ?? []).filter((u) => !who.has(u)).length; });
        return by;
      };
      const act = { status: 'active' };
      const ramsBy = outstanding(ramsD, currentCycleSigs(rows<{ rams_id: string; user_id: string; signed_at: string }>(rs), ramsD, 'rams_id', act) as never, 'rams_id');
      const coshhBy = outstanding(coshhD, currentCycleSigs(rows<{ coshh_id: string; user_id: string; signed_at: string }>(cs), coshhD, 'coshh_id', act) as never, 'coshh_id');
      const tbtBy = outstanding(talks, rows<{ tbt_id: string; user_id: string }>(ts) as never, 'tbt_id');
      const snagBy: Record<string, number> = {};
      rows<{ site_id: string }>(snags).forEach((s) => { snagBy[s.site_id] = (snagBy[s.site_id] || 0) + 1; });
      const taskRows = rows<{ site_id: string; status: string; percent_complete: number | null }>(tasks);
      const siteIds = new Set((sites ?? []).map((s) => s.id));
      const incidents = rows<{ id: string; site_id: string; created_at: string; riddor_reportable: boolean | null; location: string | null }>(inc).filter((r) => siteIds.has(r.site_id));
      return { snagBy, ramsBy, coshhBy, tbtBy, tasks: taskRows.length, pct: overallPct(taskRows as never), incidents };
    },
  });
}

export default function CompanyDashboard() {
  const { me, org } = useAuth();
  const { data: sites } = useSites();
  const pmCo = org?.has_pm !== false, finOn = !!me && isFinanceUser(me, org);
  const { data, isLoading } = useCompanyDashboard(pmCo ? sites : undefined);
  const { data: money } = useFinOverview(finOn ? me : null, sites);
  const { data: quotes } = useQuotes(pmCo && me && isFullManager(me) ? me.org_id : null);
  const { data: dlv } = useDeliveryRequests(pmCo ? me?.org_id : null);
  const [show, setShow] = useState<string | null>(null);
  const desk = useDesk();
  if (!me) return null;
  if (!isManager(me)) return <><Stack.Screen options={{ title: 'Dashboards' }} /><Muted style={{ padding: space.l }}>Managers only.</Muted></>;
  const all = sites ?? [];
  const live = all.filter((s) => siteStatusKey(s) === 'live');
  const count = (k: string) => all.filter((s) => siteStatusKey(s) === k).length;
  const gbp = (n: number) => `£${Math.round(n || 0).toLocaleString('en-GB')}`;
  const sum = (m: Record<string, number> | undefined) => Object.values(m ?? {}).reduce((a, b) => a + b, 0);
  // Three to a row on a laptop, two on a phone, as Finance Overview.
  const basis = desk ? '31%' : '45%';
  type Tone = 'blue' | 'green' | 'red' | 'amber';
  const stat = (label: string, value: string | number, sub: string | null, onPress?: () => void, tone?: Tone) => (
    <FinStat key={label} basis={basis} v={String(value)} label={label} sub={sub} tone={tone} onPress={onPress} />
  );
  const tiles = (children: React.ReactNode) => <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>{children}</View>;
  // A Needs Attention card: a title, then a row each (a count, the name and a line under it, ›).
  const badge = (n: string | number, tone: string) => <Text style={{ minWidth: 22, height: 22, lineHeight: 22, paddingHorizontal: 4, textAlign: 'center', fontWeight: '600', fontSize: 12, color: TONE[tone], backgroundColor: `${TONE[tone]}1F`, borderRadius: 6, overflow: 'hidden' }}>{n}</Text>;
  const listCard = (title: string, items: { key: string; n: string | number; tone: string; label: string; sub?: string; go: string }[], empty: string) => (
    <Card key={title} style={{ marginBottom: 10 }}>
      <Text style={{ fontWeight: '600', fontSize: 15, color: '#111827', marginBottom: 4 }}>{title}</Text>
      {items.length ? items.map((x) => (
        <Pressable key={x.key} onPress={() => router.push(x.go as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, borderTopWidth: 1, borderColor: '#F0F1F4' }}>
          {badge(x.n, x.tone)}
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '500', fontSize: 13.5, color: '#111827' }}>{x.label}</Text>
            {!!x.sub && <Text numberOfLines={1} style={{ fontSize: 12, color: base.slate }}>{x.sub}</Text>}
          </View>
          <Text style={{ color: base.slate }}>›</Text>
        </Pressable>
      )) : <Muted style={{ paddingTop: 6, borderTopWidth: 1, borderColor: '#F0F1F4' }}>{empty}</Muted>}
    </Card>
  );
  const lists: Record<string, { title: string; map?: Record<string, number>; go: (id: string) => string }> = {
    snags: { title: 'Live Projects With Open Snags', map: data?.snagBy, go: (id) => `/sites/${id}/snagging` },
    rams: { title: 'Live Projects With RAMS Outstanding', map: data?.ramsBy, go: (id) => `/sites/${id}/hs/rams` },
    coshh: { title: 'Live Projects With COSHH Outstanding', map: data?.coshhBy, go: (id) => `/sites/${id}/hs/coshh` },
    tbt: { title: 'Live Projects With TBT Outstanding', map: data?.tbtBy, go: (id) => `/sites/${id}/hs/tbt` },
  };
  const toggle = (k: string) => () => setShow(show === k ? null : k);
  const KEEP = new Set(['PO', 'POs', 'VAT', 'CIS']);
  const titleCase = (x: string) => x.replace(/[A-Za-z][A-Za-z'’.]*/g, (w) => (KEEP.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)));
  const sel = show && lists[show];
  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: 'Dashboards' }} />
      <DashTabs on="company" />
      {pmCo && tiles(<>
        {stat('Live Projects', live.length, null, () => router.push('/sites'), 'blue')}
        {stat('Upcoming', count('upcoming'), null, () => router.push('/sites?tab=upcoming' as never), 'blue')}
        {stat('Closed', count('closed'), null, () => router.push('/sites?tab=closed' as never))}
      </>)}
      {finOn && money && (
        <>
          <SectionTitle>Money</SectionTitle>
          {tiles(<>
            {stat('Live Contract Value', gbp(money.liveValue), null, () => router.push('/fin/jobs' as never), 'blue')}
            {stat('Total Live Jobs', money.liveCount, null, () => router.push('/fin/jobs' as never), 'blue')}
            {stat('Still To Invoice', gbp(money.toInvoice), null, () => router.push('/fin/jobs' as never), 'blue')}
            {stat('Owed To You', gbp(money.owed), null, () => router.push('/fin/sales?tab=invoices' as never), 'green')}
            {stat('Overdue', gbp(money.overdue), null, () => router.push('/fin/sales?tab=invoices&f=overdue' as never), 'red')}
            {stat('Retention Held By Clients', gbp(money.retHeld), null, () => router.push('/fin/sales?tab=retention' as never), 'amber')}
          </>)}
          {money.todo.length > 0 && listCard('Needs Attention', money.todo.map((x) => ({ key: x.t, n: x.n, tone: x.tone, label: titleCase(x.t), sub: x.s, go: x.go })), '')}
        </>
      )}
      {pmCo && !!quotes && (() => {
        const yr = String(new Date().getFullYear());
        const liveQ = quotes.filter((x) => !isQuoted(x)), quoted = quotes.filter((x) => isQuoted(x));
        const g = groupQuotes(quoted.filter((x) => (x.completed_at || x.returned_at || x.return_date || '').startsWith(yr)).map((x) => ({ ...x, client_name: 'all' })), 'client_name')[0];
        return (
          <>
            <SectionTitle>Quotes</SectionTitle>
            {tiles(<>
              {stat('Being Priced', liveQ.length, liveQ.filter((x) => x.status === 'checking').length ? `${liveQ.filter((x) => x.status === 'checking').length} ready for checking` : null, () => router.push('/pm/quotes?tab=live' as never), 'blue')}
              {stat('Quoted', gbp(quoted.reduce((t2, x) => t2 + (x.value || 0), 0)), `${quoted.length} quoted`, () => router.push('/pm/quotes?tab=quoted' as never), 'blue')}
              {stat(`Won ${yr}`, gbp(g?.wonValue || 0), g?.rate == null ? null : `${g.rate}% win rate`, () => router.push('/pm/quotes?tab=quoted&out=won' as never), 'green')}
            </>)}
          </>
        );
      })()}
      {pmCo && !!dlv?.length && (
        tiles(stat('Deliveries To Schedule', dlv.length, 'requests waiting', () => router.push('/pm/deliveries' as never), 'amber'))
      )}
      {pmCo && <SectionTitle>Projects And Health & Safety</SectionTitle>}
      {!pmCo ? null : isLoading || !data ? <Muted>Loading…</Muted> : (
        <>
          {tiles(<>
            {stat('Open Snags', sum(data.snagBy), 'across live projects', toggle('snags'), sum(data.snagBy) ? 'amber' : undefined)}
            {stat('RAMS Outstanding', sum(data.ramsBy), 'signatures needed', toggle('rams'), sum(data.ramsBy) ? 'amber' : undefined)}
            {stat('COSHH Outstanding', sum(data.coshhBy), 'signatures needed', toggle('coshh'), sum(data.coshhBy) ? 'amber' : undefined)}
            {stat('Schedule Complete', `${data.pct}%`, `${data.tasks} tasks across live projects`, undefined, 'blue')}
            {stat('Incidents', data.incidents.length, 'most recent 500 reports', toggle('incidents'), data.incidents.length ? 'red' : undefined)}
            {stat('Outstanding TBT', sum(data.tbtBy), 'signatures needed', toggle('tbt'), sum(data.tbtBy) ? 'amber' : undefined)}
          </>)}
          {(sel ? [show as string] : show ? [] : Object.keys(lists)).map((k) => {
            const l = lists[k];
            const ranked = live.map((s) => ({ s, n: l.map?.[s.id] || 0 })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
            return listCard(l.title, ranked.map(({ s, n }) => ({ key: s.id, n, tone: 'warn', label: `${s.job_number ? `${s.job_number} · ` : ''}${s.name}`, go: l.go(s.id) })), 'Nothing outstanding.');
          })}
          {(show === 'incidents' || !show) && (
            listCard('Recent Accident / Incident Reports', data.incidents.slice(0, 8).map((r) => ({ key: r.id, n: '!', tone: 'bad', label: all.find((x) => x.id === r.site_id)?.name || 'Unknown project',
              sub: [r.location, new Date(r.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }), r.riddor_reportable ? 'RIDDOR' : ''].filter(Boolean).join(' · '), go: `/sites/${r.site_id}/hs/incidents/${r.id}` })), 'No accidents, incidents or near misses reported recently.')
          )}
        </>
      )}
    </ScrollView>
  );
}
