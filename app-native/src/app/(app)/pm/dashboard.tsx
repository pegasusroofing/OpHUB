// Company Dashboard (230 renderDashboard): live / upcoming / closed counts, open
// snags, RAMS / COSHH / TBT signatures still needed (operatives only, current
// signing cycle), Schedule of Works progress, recent incidents — each with the
// list of live jobs behind the number. Since 11 Nov 2026 (Andy: "make sure everything we need is on there"): Money (a
// company with Finance, for people with Finance), Quotes and Deliveries; a company with only Finance sees Money alone.
import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { DashTabs } from '@/components/DashTabs';
import { Card, Empty, Muted, SectionTitle } from '@/components/ui';
import { useDeliveryRequests } from '@/data/deliveries';
import { useFinOverview } from '@/data/finance';
import { useQuotes } from '@/data/quotes';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { heading } from '@/lib/fonts';
import { siteStatusKey } from '@/lib/rules/checkin';
import { currentCycleSigs } from '@/lib/rules/hs';
import { overallPct } from '@/lib/rules/sow';
import { isFinanceUser, isFullManager, isManager } from '@/lib/roles';
import { groupQuotes, isQuoted } from '@/lib/rules/quotes';
import { supabase } from '@/lib/supabase';
import type { Site } from '@/lib/types';
import { base, page, radius, space, useTheme } from '@/theme/theme';

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
        ids.length ? db.from('rams_docs').select('id,site_id,uploaded_at,resign_cycle_start').eq('status', 'current').in('site_id', ids).is('subcontractor_company_id', null) : none,
        ids.length ? db.from('coshh_docs').select('id,site_id,uploaded_at,resign_cycle_start').in('site_id', ids).is('subcontractor_company_id', null) : none,
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
  const t = useTheme();
  if (!me) return null;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  const all = sites ?? [];
  const live = all.filter((s) => siteStatusKey(s) === 'live');
  const count = (k: string) => all.filter((s) => siteStatusKey(s) === k).length;
  const gbp = (n: number) => `£${Math.round(n || 0).toLocaleString('en-GB')}`;
  const sum = (m: Record<string, number> | undefined) => Object.values(m ?? {}).reduce((a, b) => a + b, 0);
  const stat = (label: string, value: string | number, sub: string | null, onPress?: () => void) => (
    <Pressable onPress={onPress} disabled={!onPress} style={{ flex: 1, minWidth: 100 }}>
      <Card style={{ alignItems: 'center', paddingVertical: 16, borderRadius: 18, marginBottom: 0 }}>
        <Text style={[heading(800), { fontSize: 22, color: base.ink }]}>{value}</Text>
        <Text style={{ fontSize: 13, color: base.ink, textAlign: 'center', marginTop: 2 }}>{label}</Text>
        {!!sub && <Text style={{ fontSize: 10.5, color: base.slateLight, fontStyle: 'italic', textAlign: 'center' }}>{sub}</Text>}
        {!!onPress && <Text style={{ fontSize: 10.5, color: base.slateLight, fontStyle: 'italic', marginTop: 4 }}>Tap to open ›</Text>}
      </Card>
    </Pressable>
  );
  const lists: Record<string, { title: string; map?: Record<string, number>; go: (id: string) => string }> = {
    snags: { title: 'Live Projects With Open Snags', map: data?.snagBy, go: (id) => `/sites/${id}/snagging` },
    rams: { title: 'Live Projects With RAMS Outstanding', map: data?.ramsBy, go: (id) => `/sites/${id}/hs/rams` },
    coshh: { title: 'Live Projects With COSHH Outstanding', map: data?.coshhBy, go: (id) => `/sites/${id}/hs/coshh` },
    tbt: { title: 'Live Projects With TBT Outstanding', map: data?.tbtBy, go: (id) => `/sites/${id}/hs/tbt` },
  };
  const toggle = (k: string) => () => setShow(show === k ? null : k);
  // 230 .sitecard: a company-colour swatch (the project's initials, or ⚠️), the name, the count underneath.
  const swatch = (txt: string) => <View style={{ width: 50, height: 43, borderRadius: 14, backgroundColor: t.brand1, alignItems: 'center', justifyContent: 'center' }}><Text style={[heading(800), { color: t.brand1Text, fontSize: 12 }]}>{txt}</Text></View>;
  const initials = (n: string) => (n || '?').split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const sel = show && lists[show];
  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: 'Dashboards' }} />
      <DashTabs on="company" />
      {pmCo && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
        {stat('Live Projects', live.length, null, () => router.push('/sites'))}
        {stat('Upcoming', count('upcoming'), null, () => router.push('/sites?tab=upcoming' as never))}
        {stat('Closed', count('closed'), null, () => router.push('/sites?tab=closed' as never))}
      </View>}
      {finOn && money && (
        <>
          <SectionTitle>Money</SectionTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
            {stat('Live Contract Value', gbp(money.liveValue), `${money.liveCount} live project${money.liveCount === 1 ? '' : 's'}`, () => router.push('/fin/jobs' as never))}
            {stat('Still To Invoice', gbp(money.toInvoice), 'on live projects', () => router.push('/fin/jobs' as never))}
            {stat('Owed To Us', gbp(money.owed), money.overdue ? `${gbp(money.overdue)} overdue` : 'nothing overdue', () => router.push('/fin/sales?tab=invoices' as never))}
            {stat('Retention Held', gbp(money.retHeld), 'still with clients', () => router.push('/fin/sales?tab=retention' as never))}
          </View>
          {money.todo.slice(0, 6).map((x) => (
            <Pressable key={x.t} onPress={() => router.push(x.go as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 8, backgroundColor: base.card }}>
              <View style={{ flex: 1 }}><Text style={{ fontWeight: '600', color: base.ink, fontSize: 13.5 }}>{x.t} ({x.n})</Text><Text numberOfLines={1} style={{ fontSize: 12, color: base.slate }}>{x.s}</Text></View>
              <Text style={{ color: base.slate }}>›</Text>
            </Pressable>
          ))}
        </>
      )}
      {pmCo && !!quotes && (() => {
        const yr = String(new Date().getFullYear());
        const liveQ = quotes.filter((x) => !isQuoted(x)), quoted = quotes.filter((x) => isQuoted(x));
        const g = groupQuotes(quoted.filter((x) => (x.completed_at || x.returned_at || x.return_date || '').startsWith(yr)).map((x) => ({ ...x, client_name: 'all' })), 'client_name')[0];
        return (
          <>
            <SectionTitle>Quotes</SectionTitle>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
              {stat('Being Priced', liveQ.length, liveQ.filter((x) => x.status === 'checking').length ? `${liveQ.filter((x) => x.status === 'checking').length} ready for checking` : null, () => router.push('/pm/quotes?tab=live' as never))}
              {stat('Quoted', gbp(quoted.reduce((t2, x) => t2 + (x.value || 0), 0)), `${quoted.length} quoted`, () => router.push('/pm/quotes?tab=quoted' as never))}
              {stat(`Won ${yr}`, gbp(g?.wonValue || 0), g?.rate == null ? null : `${g.rate}% win rate`, () => router.push('/pm/quotes?tab=quoted&out=won' as never))}
            </View>
          </>
        );
      })()}
      {pmCo && !!dlv?.length && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
          {stat('Deliveries To Schedule', dlv.length, 'requests waiting', () => router.push('/pm/deliveries' as never))}
        </View>
      )}
      {pmCo && <SectionTitle>Projects And Health & Safety</SectionTitle>}
      {!pmCo ? null : isLoading || !data ? <Muted>Loading…</Muted> : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
            {stat('Open Snags', sum(data.snagBy), 'across live projects', toggle('snags'))}
            {stat('RAMS Outstanding', sum(data.ramsBy), 'signatures needed', toggle('rams'))}
            {stat('COSHH Outstanding', sum(data.coshhBy), 'signatures needed', toggle('coshh'))}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
            {stat('Schedule Complete', `${data.pct}%`, `${data.tasks} tasks across live projects`)}
            {stat('Incidents', data.incidents.length, 'most recent 500 reports', toggle('incidents'))}
            {stat('Outstanding TBT', sum(data.tbtBy), 'signatures needed', toggle('tbt'))}
          </View>
          {(sel ? [show as string] : show ? [] : Object.keys(lists)).map((k) => {
            const l = lists[k];
            const ranked = live.map((s) => ({ s, n: l.map?.[s.id] || 0 })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
            return (
            <View key={k}>
              <SectionTitle>{l.title}</SectionTitle>
              {ranked.length ? ranked.map(({ s, n }) => (
                <Pressable key={s.id} onPress={() => router.push(l.go(s.id) as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 10, backgroundColor: base.card }}>
                  {swatch(initials(s.name))}
                  <View style={{ flex: 1 }}>
                    <Text style={[heading(700), { color: base.ink, fontSize: 14.5 }]}>{s.name}</Text>
                    <Text style={{ color: base.slate, fontSize: 12 }}>{n}</Text>
                  </View>
                </Pressable>
              )) : <Empty>Nothing outstanding.</Empty>}
            </View>
            );
          })}
          {(show === 'incidents' || !show) && (
            <>
              <SectionTitle>Recent Accident / Incident Reports</SectionTitle>
              {data.incidents.slice(0, 8).length ? data.incidents.slice(0, 8).map((r) => (
                <Pressable key={r.id} onPress={() => router.push(`/sites/${r.site_id}/hs/incidents/${r.id}` as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 10, backgroundColor: base.card }}>
                  {swatch('⚠️')}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '600', color: base.ink }}>{all.find((x) => x.id === r.site_id)?.name || 'Unknown project'}</Text>
                    <Muted>{r.location || ''} · {new Date(r.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}{r.riddor_reportable ? ' · RIDDOR' : ''}</Muted>
                  </View>
                </Pressable>
              )) : <Empty>No accidents, incidents or near misses reported recently.</Empty>}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}
