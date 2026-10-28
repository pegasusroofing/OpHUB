// Company Dashboard (230 renderDashboard): live / upcoming / closed counts, open
// snags, RAMS / COSHH / TBT signatures still needed (operatives only, current
// signing cycle), Schedule of Works progress, recent incidents — each with the
// list of live jobs behind the number.
import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Card, Empty, Muted, SectionTitle } from '@/components/ui';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { siteStatusKey } from '@/lib/rules/checkin';
import { currentCycleSigs } from '@/lib/rules/hs';
import { overallPct } from '@/lib/rules/sow';
import { isManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import type { Site } from '@/lib/types';
import { base, radius, space } from '@/theme/theme';

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
  const { me } = useAuth();
  const { data: sites } = useSites();
  const { data, isLoading } = useCompanyDashboard(sites);
  const [show, setShow] = useState<string | null>(null);
  if (!me) return null;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  const all = sites ?? [];
  const live = all.filter((s) => siteStatusKey(s) === 'live');
  const count = (k: string) => all.filter((s) => siteStatusKey(s) === k).length;
  const sum = (m: Record<string, number> | undefined) => Object.values(m ?? {}).reduce((a, b) => a + b, 0);
  const stat = (label: string, value: string | number, sub: string | null, onPress?: () => void) => (
    <Pressable onPress={onPress} disabled={!onPress} style={{ flex: 1, minWidth: 100 }}>
      <Card style={{ alignItems: 'center' }}>
        <Text style={{ fontSize: 26, fontWeight: '800', color: base.ink }}>{value}</Text>
        <Muted style={{ textAlign: 'center' }}>{label}</Muted>
        {!!sub && <Muted style={{ fontSize: 11, textAlign: 'center' }}>{sub}</Muted>}
        {!!onPress && <Text style={{ fontSize: 11, color: base.blue, marginTop: 2 }}>Tap to open ›</Text>}
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
  const sel = show && lists[show];
  const ranked = sel ? live.map((s) => ({ s, n: sel.map?.[s.id] || 0 })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n) : [];
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <Stack.Screen options={{ title: 'Company Dashboard' }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {stat('Live Projects', live.length, null, () => router.push('/sites'))}
        {stat('Upcoming', count('upcoming'), null, () => router.push('/sites'))}
        {stat('Closed', count('closed'), null, () => router.push('/sites'))}
      </View>
      {isLoading || !data ? <Muted>Loading…</Muted> : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {stat('Open Snags', sum(data.snagBy), 'across live projects', toggle('snags'))}
            {stat('RAMS Outstanding', sum(data.ramsBy), 'signatures needed', toggle('rams'))}
            {stat('COSHH Outstanding', sum(data.coshhBy), 'signatures needed', toggle('coshh'))}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {stat('Schedule Complete', `${data.pct}%`, `${data.tasks} tasks across live projects`)}
            {stat('Incidents', data.incidents.length, 'most recent 500 reports', toggle('incidents'))}
            {stat('Outstanding TBT', sum(data.tbtBy), 'signatures needed', toggle('tbt'))}
          </View>
          {sel && (
            <>
              <SectionTitle>{sel.title}</SectionTitle>
              {ranked.length ? ranked.map(({ s, n }) => (
                <Pressable key={s.id} onPress={() => router.push(sel.go(s.id) as never)} style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 6, backgroundColor: base.card }}>
                  <Text style={{ flex: 1, fontWeight: '700', color: base.ink }}>{s.name}</Text>
                  <Text style={{ fontWeight: '800', color: base.warn }}>{n}</Text>
                </Pressable>
              )) : <Empty>Nothing outstanding.</Empty>}
            </>
          )}
          {(show === 'incidents' || !show) && (
            <>
              <SectionTitle>Recent Accident / Incident Reports</SectionTitle>
              {data.incidents.slice(0, 8).length ? data.incidents.slice(0, 8).map((r) => (
                <Pressable key={r.id} onPress={() => router.push(`/sites/${r.site_id}/hs/incidents/${r.id}` as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 6, backgroundColor: base.card }}>
                  <Text>⚠️</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '700', color: base.ink }}>{all.find((x) => x.id === r.site_id)?.name || 'Unknown project'}</Text>
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
