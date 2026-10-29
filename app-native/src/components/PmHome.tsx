// PM / admin home (185 renderPmHome): the date and greeting, four numbers (live
// jobs, on site now, to do, notifications), the Live projects card, then the
// tiles as a grid (2 across on a phone, 4 on a computer) with line icons in
// tinted squares, "Pick up where you left off", and name / role / Sign out.
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { HowTo } from '@/components/HowTo';
import { OphIcon } from '@/components/OphIcon';
import { SearchButton } from '@/components/SearchButton';
import { SitesMapCard } from '@/components/SitesMap';
import { Muted, Screen, SectionTitle, Stat, Tile, TileGrid, TINTS } from '@/components/ui';
import { useHub } from '@/data/hub';
import { useDeliveryRequests } from '@/data/deliveries';
import { useOnSiteNow, usePmReports, usePmTodos } from '@/data/pmHome';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { heading } from '@/lib/fonts';
import { greeting, siteStatusKey } from '@/lib/rules/checkin';
import { isFinanceUser, roleLabel } from '@/lib/roles';
import { base, space, useDesk, useTheme } from '@/theme/theme';

export function PmHome() {
  const { me, org, signOut } = useAuth();
  const t = useTheme();
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
  const live = (sites ?? []).filter((s) => siteStatusKey(s) === 'live');
  const upcoming = (sites ?? []).filter((s) => siteStatusKey(s) === 'upcoming');
  const open = reports.filter((r) => r.status === 'in_progress');
  const mine = open.filter((r) => r.submitted_by === me?.id).slice(0, 2);
  const first = (me?.name || '').trim().split(/\s+/)[0] || '';
  const where = (r: (typeof reports)[number]) => (r.site_id ? (sites ?? []).find((s) => s.id === r.site_id)?.name || 'Project' : r.general_label || 'General survey');
  const go = (p: string) => () => router.push(p as never);

  return (
    <Screen>
      <Text style={{ fontSize: 12.5, color: base.slate, fontWeight: '600' }}>{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
      <Text style={[heading(800), { fontSize: 21, color: base.ink, marginBottom: 14, letterSpacing: -0.2 }]}>{greeting()}{first ? `, ${first}` : ''}</Text>
      {!desk && <SearchButton />}
      <HowTo k="home" />
      <View style={{ flexDirection: 'row', gap: desk ? 14 : 8, marginBottom: space.m }}>
        <Stat n={live.length} label="Live jobs" onPress={go('/sites')} />
        <Stat n={onSite.length} label="On site now" onPress={go('/onsite')} />
        <Stat n={todos.length} label="To do" onPress={go('/pm/todos')} />
        <Stat n={hubN} label="Notifications" hot={hubN > 0} onPress={go('/pm/hub')} />
      </View>
      <Pressable onPress={go('/sites')} accessibilityRole="button"
        style={({ pressed }) => [{ backgroundColor: t.brand1, borderRadius: 22, paddingVertical: 18, paddingHorizontal: 20, marginBottom: space.m }, pressed && { opacity: 0.9 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}><OphIcon name="projects" size={22} color={t.brand1Text} /></View>
          <OphIcon name="chevron" size={22} color={t.brand1Text} stroke={2.4} />
        </View>
        <Text style={[heading(800), { color: t.brand1Text, fontSize: 20, letterSpacing: -0.2 }]}>Live projects</Text>
        <Text style={{ color: t.brand1Text, opacity: 0.92, marginTop: 4, fontSize: 13, fontWeight: '500' }}>{live.length} live{upcoming.length ? ` · ${upcoming.length} upcoming` : ''}</Text>
      </Pressable>
      {!!sites?.length && <SitesMapCard sites={sites} />}
      <TileGrid cols={desk ? 4 : 2}>
        {isFinanceUser(me, org) && <Tile ic="pound" tint={TINTS.green[0]} fg={TINTS.green[1]} title="OpHUB Finance" sub="Money in & out" onPress={go('/fin')} />}
        <Tile ic="chart" tint={TINTS.teal[0]} fg={TINTS.teal[1]} title="Dashboard" sub="Company overview" onPress={go('/pm/dashboard')} />
        <Tile ic="calendar" tint={TINTS.green[0]} fg={TINTS.green[1]} title="Calendar" sub="All projects" onPress={go('/pm/calendar')} />
        <Tile ic="bell" tint={TINTS.orange[0]} fg={TINTS.orange[1]} title="HUB" sub={hubN ? `${hubN} notification${hubN === 1 ? '' : 's'}` : 'Notifications & messages'} badge={hubN || undefined} onPress={go('/pm/hub')} />
        <Tile ic="truck" tint={TINTS.purple[0]} fg={TINTS.purple[1]} title="Deliveries" sub={dlvN ? `${dlvN} to schedule` : 'Delivery schedule'} badge={dlvN || undefined} onPress={go('/pm/deliveries')} />
        <Tile ic="reports" tint={TINTS.blue[0]} fg={TINTS.blue[1]} title="Reports & surveys" sub={open.length ? `${open.length} in progress` : 'All projects'} onPress={go('/pm/reports')} />
        <Tile ic="admin" tint={TINTS.blue[0]} fg={TINTS.blue[1]} title="Operatives" sub="Certifications, training, tools" onPress={go('/pm/operatives')} />
        <Tile ic="users" tint={TINTS.purple[0]} fg={TINTS.purple[1]} title="HR" sub="Holidays, policies & handbook" onPress={go('/pm/hr')} />
        <Tile ic="gear" tint={TINTS.grey[0]} fg={TINTS.grey[1]} title="Admin" sub="Team, libraries, settings" onPress={go('/pm/admin')} />
      </TileGrid>
      {mine.length > 0 && (
        <>
          <SectionTitle>Pick up where you left off</SectionTitle>
          {mine.map((r) => (
            <Pressable key={r.id} onPress={go(r.site_id ? `/sites/${r.site_id}/snagging/reports/fill/${r.id}` : `/pm/survey/${r.id}?mode=fill`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: 16, paddingVertical: 13, paddingHorizontal: 14, marginBottom: 8 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: base.warn }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: base.ink, fontSize: 14 }}>{r.template_name || 'Report'}</Text>
                <Muted>{where(r)} · in progress</Muted>
              </View>
              <OphIcon name="chevron" size={18} color={base.slateLight} stroke={2.2} />
            </Pressable>
          ))}
        </>
      )}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 22 }}>
        <Text style={{ fontSize: 11, color: base.slateLight, fontStyle: 'italic' }}>{me?.name}</Text>
        <Text style={{ fontSize: 11, color: base.slateLight, fontStyle: 'italic' }}>{roleLabel(me)}</Text>
      </View>
      <Pressable onPress={signOut} style={{ alignSelf: 'center', marginTop: 8 }}>
        <Text style={{ color: base.warn, textDecorationLine: 'underline', fontSize: 11, fontStyle: 'italic' }}>Sign out</Text>
      </Pressable>
    </Screen>
  );
}
