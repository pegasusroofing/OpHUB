// PM / admin home. Ported from renderPmHome (185). Tiles for pages not yet built
// say so; they light up as each page arrives.
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { useToast } from '@/components/toast';
import { Muted, Screen, SectionTitle, Stat, Tile } from '@/components/ui';
import { useOnSiteNow, usePmReports, usePmTodos } from '@/data/pmHome';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { greeting, siteStatusKey } from '@/lib/rules/checkin';
import { isFinanceUser, roleLabel } from '@/lib/roles';
import { base, space, useTheme } from '@/theme/theme';

export function PmHome() {
  const { me, org, signOut } = useAuth();
  const t = useTheme();
  const toast = useToast();
  const { data: sites } = useSites();
  const { data: onSite = [] } = useOnSiteNow(sites);
  const { data: todos = [] } = usePmTodos(sites);
  const { data: reports = [] } = usePmReports();
  const live = (sites ?? []).filter((s) => siteStatusKey(s) === 'live');
  const upcoming = (sites ?? []).filter((s) => siteStatusKey(s) === 'upcoming');
  const open = reports.filter((r) => r.status === 'in_progress');
  const mine = open.filter((r) => r.submitted_by === me?.id).slice(0, 2);
  const first = (me?.name || '').trim().split(/\s+/)[0] || '';
  const soon = (what: string) => () => toast(`${what} is still being built in the new app.`);
  const where = (r: (typeof reports)[number]) => (r.site_id ? (sites ?? []).find((s) => s.id === r.site_id)?.name || 'Project' : r.general_label || 'General survey');

  return (
    <Screen>
      <Text style={{ fontSize: 12.5, color: base.slate, fontWeight: '600' }}>{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
      <Text style={{ fontSize: 21, fontWeight: '800', color: base.ink, marginBottom: 14 }}>{greeting()}{first ? `, ${first}` : ''}</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: space.m }}>
        <Stat n={live.length} label="Live jobs" onPress={() => router.push('/sites')} />
        <Stat n={onSite.length} label="On site now" onPress={() => router.push('/onsite')} />
        <Stat n={todos.length} label="To do" onPress={() => router.push('/pm/todos' as never)} />
        <Stat n={0} label="Notifications" onPress={soon('The HUB')} />
      </View>
      <Pressable onPress={() => router.push('/sites')} accessibilityRole="button"
        style={({ pressed }) => [{ backgroundColor: t.brand1, borderRadius: 22, padding: 20, marginBottom: space.m }, pressed && { opacity: 0.85 }]}>
        <Text style={{ color: t.brand1Text, fontSize: 20, fontWeight: '800' }}>Live projects</Text>
        <Text style={{ color: t.brand1Text, opacity: 0.85, marginTop: 4 }}>{live.length} live{upcoming.length ? ` · ${upcoming.length} upcoming` : ''}</Text>
      </Pressable>
      {isFinanceUser(me, org) && <Tile icon="£" tint={base.okBg} title="OpHUB Finance" sub="Money in & out" onPress={soon('Finance')} />}
      <Tile icon="📈" tint="#E0F2F1" title="Dashboard" sub="Company overview" onPress={soon('The company dashboard')} />
      <Tile icon="📅" tint={base.okBg} title="Calendar" sub="All projects" onPress={soon('The calendar')} />
      <Tile icon="🔔" tint={base.warnBg} title="HUB" sub="Notifications & messages" onPress={soon('The HUB')} />
      <Tile icon="🚚" tint="#F0E4F5" title="Deliveries" sub="Delivery schedule" onPress={soon('The delivery schedule')} />
      <Tile icon="📋" tint={base.blueBg} title="Reports & surveys" sub={open.length ? `${open.length} in progress` : 'All projects'} onPress={() => router.push('/pm/reports' as never)} />
      <Tile icon="🪪" tint={base.blueBg} title="Operatives" sub="Certifications, training, tools" onPress={soon('Operatives')} />
      <Tile icon="👥" tint="#F0E4F5" title="HR" sub="Holidays, policies & handbook" onPress={soon('HR')} />
      <Tile icon="⚙️" tint={base.paper} title="Admin" sub="Team, libraries, settings" onPress={soon('Admin')} />
      {mine.length > 0 && (
        <>
          <SectionTitle>Pick up where you left off</SectionTitle>
          {mine.map((r) => (
            <Pressable key={r.id} onPress={() => router.push((r.site_id ? `/sites/${r.site_id}/snagging/reports/fill/${r.id}` : `/pm/survey/${r.id}?mode=fill`) as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: 14, padding: 12, marginBottom: 8 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: base.warn }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: base.ink }}>{r.template_name || 'Report'}</Text>
                <Muted>{where(r)} · in progress</Muted>
              </View>
            </Pressable>
          ))}
        </>
      )}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 22 }}>
        <Muted>{me?.name}</Muted><Muted>{roleLabel(me)}</Muted>
      </View>
      <Pressable onPress={signOut} style={{ alignSelf: 'center', marginTop: 8 }}>
        <Text style={{ color: base.warn, textDecorationLine: 'underline' }}>Sign out</Text>
      </Pressable>
    </Screen>
  );
}
