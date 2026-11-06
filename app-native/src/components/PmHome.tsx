// PM / admin home (185 renderPmHome), option 1 (Andy, 6 Nov 2026): the date and greeting, four plain numbers (live
// projects, on site now, to do, notifications), the sites map with a Today panel beside it, then plain tiles
// (2 across on a phone, 4 on a laptop), "Pick up where you left off", and name / role / Sign out.
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { HomePrompts } from '@/components/HomePrompts';
import { HowTo } from '@/components/HowTo';
import { OphIcon } from '@/components/OphIcon';
import { SearchButton } from '@/components/SearchButton';
import { SitesMapCard } from '@/components/SitesMap';
import { Card, Muted, Screen, SectionTitle, Stat, Tile, TileGrid, TINTS } from '@/components/ui';
import { useHub } from '@/data/hub';
import { useDeliveryRequests } from '@/data/deliveries';
import { useOnSiteNow, usePmReports, usePmTodos, useTodayEvents } from '@/data/pmHome';
import { useSites } from '@/data/sites';
import { useToBook } from '@/data/toBook';
import { useAuth } from '@/lib/auth';
import { heading } from '@/lib/fonts';
import { greeting, siteStatusKey } from '@/lib/rules/checkin';
import { isFinanceUser, roleLabel } from '@/lib/roles';
import { base, space, useDesk } from '@/theme/theme';

export function PmHome() {
  const { me, org, signOut } = useAuth();
  const desk = useDesk();
  const { data: sites } = useSites();
  const { data: onSite = [] } = useOnSiteNow(sites);
  const { data: todos = [] } = usePmTodos(sites);
  const { data: reports = [] } = usePmReports();
  const { data: hub } = useHub(me, sites, '');
  const { data: dlvReqs } = useDeliveryRequests(me?.org_id);
  // Managers: the HUB feed count, as the current app (130 computeMyOutstandingCount).
  const hubN = hub?.items.length ?? 0;
  const dlvN = dlvReqs?.length ?? 0;
  // Things the office has sent you to book (9219b pmToBookCounts).
  const { data: toBook } = useToBook(sites);
  const tbInv = toBook?.inv.length ?? 0, tbWages = toBook?.wages.length ?? 0;
  const live = (sites ?? []).filter((s) => siteStatusKey(s) === 'live');
  const upcoming = (sites ?? []).filter((s) => siteStatusKey(s) === 'upcoming');
  const open = reports.filter((r) => r.status === 'in_progress');
  const mine = open.filter((r) => r.submitted_by === me?.id).slice(0, 2);
  const first = (me?.name || '').trim().split(/\s+/)[0] || '';
  const where = (r: (typeof reports)[number]) => (r.site_id ? (sites ?? []).find((s) => s.id === r.site_id)?.name || 'Project' : r.general_label || 'General survey');
  const go = (p: string) => () => router.push(p as never);
  const { data: today = [] } = useTodayEvents();
  const siteName = (id: string) => (sites ?? []).find((x) => x.id === id)?.name || 'Project';
  const onSiteJobs = new Set(onSite.map((o) => o.site_id)).size;
  // Today (Andy, 6 Nov 2026: option 1): key dates and deliveries from the project calendars, who's on site, reports in progress.
  const todayRows: { ic: string; t: string; sub: string; go: string }[] = [
    ...today.slice(0, 4).map((e) => ({ ic: /deliver|collect|\bPO\b/i.test(e.title) ? 'truck' : 'calendar', t: e.title, sub: siteName(e.site_id), go: `/sites/${e.site_id}/calendar` })),
    { ic: 'users', t: onSite.length ? `${onSite.length} on site` : 'Nobody on site yet', sub: onSite.length ? `across ${onSiteJobs} project${onSiteJobs === 1 ? '' : 's'}` : 'Signed in today', go: '/onsite' },
    ...(dlvN ? [{ ic: 'truck', t: `${dlvN} deliver${dlvN === 1 ? 'y' : 'ies'} to schedule`, sub: 'Delivery schedule', go: '/pm/deliveries' }] : []),
    ...(open.length ? [{ ic: 'reports', t: `${open.length} report${open.length === 1 ? '' : 's'} in progress`, sub: open[0] ? `${open[0].template_name || 'Report'} · ${where(open[0])}` : '', go: '/pm/reports' }] : []),
  ];
  const todayCard = (
    <Card style={{ paddingHorizontal: 0, paddingVertical: 10, marginBottom: desk ? 0 : space.m, ...(desk ? { flex: 1, minWidth: 0 } : {}) }}>
      <Text style={{ fontWeight: '600', color: base.ink, fontSize: 14, paddingHorizontal: 14, paddingBottom: 6 }}>Today</Text>
      {todayRows.map((r, k) => (
        <Pressable key={k} onPress={go(r.go)} style={(st) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: '#f0f1f3' }, (st as { hovered?: boolean }).hovered && { backgroundColor: '#F7F8FA' }]}>
          <OphIcon name={r.ic} size={18} color={base.ink} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontWeight: '600', color: base.ink, fontSize: 13.5 }}>{r.t}</Text>
            {!!r.sub && <Text numberOfLines={1} style={{ fontSize: 12, color: base.slate }}>{r.sub}</Text>}
          </View>
        </Pressable>
      ))}
      {!today.length && <Text style={{ fontSize: 12, color: base.slateLight, paddingHorizontal: 14, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f0f1f3' }}>No key dates or deliveries on the calendars today.</Text>}
    </Card>
  );

  return (
    <Screen>
      <Text style={{ fontSize: 12.5, color: base.slate, fontWeight: '600' }}>{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
      <Text style={[heading(800), { fontSize: 21, color: base.ink, marginBottom: 10, letterSpacing: -0.2 }]}>{greeting()}{first ? `, ${first}` : ''}</Text>
      {!desk && <SearchButton />}
      <HowTo k="home" />
      <HomePrompts />
      {(tbInv > 0 || tbWages > 0) && (
        <Pressable onPress={go('/pm/tobook')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: base.warnBg, borderRadius: 16, padding: 14, marginBottom: space.m }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: base.warn }}>£</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '600', color: base.ink }}>Needs you</Text>
            <Text style={{ fontSize: 12.5, color: base.slate }}>{[tbInv ? `${tbInv} purchase invoice${tbInv === 1 ? '' : 's'} to book to a job` : '', tbWages ? `${tbWages} wage${tbWages === 1 ? '' : 's'} to book to a price` : ''].filter(Boolean).join(' · ')}</Text>
          </View>
          <OphIcon name="chevron" size={18} color={base.slate} stroke={2.2} />
        </Pressable>
      )}
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: space.m }}>
        <Stat n={live.length} label={desk && upcoming.length ? `Live projects · ${upcoming.length} upcoming` : 'Live projects'} onPress={go('/sites')} />
        <Stat n={onSite.length} label="On site now" onPress={go('/onsite')} />
        <Stat n={todos.length} label="To do" onPress={go('/pm/todos')} />
        <Stat n={hubN} label="Notifications" hot={hubN > 0} onPress={go('/pm/hub')} />
      </View>
      {/* Option 1 (Andy, 6 Nov 2026): the map with a Today panel beside it on a laptop; on a phone, Today then the map. */}
      {desk ? (
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'stretch', marginBottom: space.m }}>
          {!!sites?.length && <View style={{ flex: 2, minWidth: 0 }}><SitesMapCard sites={sites} fill /></View>}
          {todayCard}
        </View>
      ) : (
        <>
          {todayCard}
          {!!sites?.length && <SitesMapCard sites={sites} />}
        </>
      )}
      {/* Yard & Plant is under Deliveries now, not a tile (Andy, 5 Nov 2026). */}
      <TileGrid cols={desk ? 4 : 2}>
        <Tile plain ic="projects" tint="" title="Projects" sub={`${live.length} live${upcoming.length ? ` · ${upcoming.length} upcoming` : ''}`} onPress={go('/sites')} />
        {isFinanceUser(me, org) && <Tile plain ic="pound" tint="" title="OpHUB Finance" sub="Money in & out" onPress={go('/fin')} />}
        <Tile plain ic="reports" tint="" title="Quotes" sub="Tender tracker" onPress={go('/pm/quotes')} />
        <Tile plain ic="chart" tint="" title="Dashboard" sub="Company & operatives" onPress={go('/pm/dashboard')} />
        <Tile plain ic="calendar" tint="" title="Calendar" sub="All projects" onPress={go('/pm/calendar')} />
        <Tile plain ic="truck" tint="" title="Deliveries" sub={dlvN ? `${dlvN} to schedule` : 'Delivery schedule'} badge={dlvN || undefined} onPress={go('/pm/deliveries')} />
        <Tile plain ic="reports" tint="" title="Reports & Surveys" sub={open.length ? `${open.length} in progress` : 'All projects'} onPress={go('/pm/reports')} />
        <Tile plain ic="users" tint="" title="HR" sub="Holidays, policies & handbook" onPress={go('/pm/hr')} />
        {!desk && <Tile plain ic="gear" tint="" title="Admin" sub="Team, libraries, settings" onPress={go('/pm/admin')} />}
      </TileGrid>
      {mine.length > 0 && (
        <>
          {/* Lined up with the tiles above (Andy, 5 Nov 2026): same corners and padding, the words start where
              the tile words start, and "In Progress" sits on the right instead of a dot in front. */}
          <View style={{ marginTop: 14 }}><SectionTitle>Pick up where you left off</SectionTitle></View>
          {mine.map((r) => (
            <Pressable key={r.id} onPress={go(r.site_id ? `/sites/${r.site_id}/snagging/reports/fill/${r.id}` : `/pm/survey/${r.id}?mode=fill`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: 10, padding: 13.5, marginBottom: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '600', color: base.ink, fontSize: 14 }}>{r.template_name || 'Report'}</Text>
                <Muted>{where(r)}</Muted>
              </View>
              <View style={{ backgroundColor: TINTS.orange[0], borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}><Text style={{ fontSize: 11, fontWeight: '600', color: TINTS.orange[1] }}>In Progress</Text></View>
              <OphIcon name="chevron" size={18} color={base.slateLight} stroke={2.2} />
            </Pressable>
          ))}
        </>
      )}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 22 }}>
        <Text style={{ fontSize: 11, color: base.slateLight, fontStyle: 'italic' }}>{me?.name}</Text>
        <Text style={{ fontSize: 11, color: base.slateLight, fontStyle: 'italic' }}>{roleLabel(me)}</Text>
      </View>
      <Pressable onPress={signOut} style={{ alignSelf: 'center', marginTop: 10 }}>
        <Text style={{ color: base.warn, textDecorationLine: 'underline', fontSize: 11, fontStyle: 'italic' }}>Sign out</Text>
      </Pressable>
    </Screen>
  );
}
