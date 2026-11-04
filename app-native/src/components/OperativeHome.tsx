// Operative home. Ported from renderOpHome (185-pm-home.js).
// The Subcontractor form tile shows until the operative has sent it (867).
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Muted, Screen, Stat, Tile, TileGrid, TINTS } from '@/components/ui';
import { OphIcon } from '@/components/OphIcon';
import { heading } from '@/lib/fonts';
import { HowTo } from '@/components/HowTo';
import { SearchButton } from '@/components/SearchButton';
import { outstandingCount, useOutstanding } from '@/data/inbox';
import { useOpUnreadCount } from '@/data/messages';
import { useOnboarding } from '@/data/onboarding';
import { useSites } from '@/data/sites';
import { useSubformNeeded } from '@/data/subform';
import { useAuth } from '@/lib/auth';
import { greeting, siteStatusKey } from '@/lib/rules/checkin';
import { roleLabel } from '@/lib/roles';
import { base, space, useDesk, useTheme } from '@/theme/theme';

export function OperativeHome() {
  const { me, signOut } = useAuth();
  const t = useTheme();
  const desk = useDesk();
  const { data: sites = [] } = useSites();
  const mine = sites.filter((s) => siteStatusKey(s) !== 'closed');
  const live = mine.filter((s) => siteStatusKey(s) === 'live');
  const upcoming = mine.filter((s) => siteStatusKey(s) === 'upcoming');
  const { data: unread = 0 } = useOpUnreadCount(sites.map((s) => s.id));
  const { data: outRows } = useOutstanding(sites);
  const todo = outstandingCount(outRows);
  const { data: onboarding } = useOnboarding(sites);
  const { data: subform } = useSubformNeeded(me);
  const first = (me?.name || '').trim().split(/\s+/)[0] || '';
  const dateTxt = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <Screen>
      <Text style={{ fontSize: 12.5, color: base.slate, fontWeight: '600' }}>{dateTxt}</Text>
      <Text style={{ fontSize: 21, fontWeight: '800', color: base.ink, marginBottom: 14 }}>{greeting()}{first ? `, ${first}` : ''}</Text>
      {!desk && <SearchButton />}
      <HowTo k="home" />
      {onboarding && !onboarding.allDone && (
        <Pressable onPress={() => router.push('/getting-started')} style={{ backgroundColor: base.warnBg, borderWidth: 1, borderColor: base.warn, borderRadius: 18, padding: 14, marginBottom: 14 }}>
          <Text style={{ fontWeight: '800', color: base.warn }}>Getting Started</Text>
          <Text style={{ color: base.slate, marginTop: 2 }}>{onboarding.items.filter((i) => i.done).length} of {onboarding.items.length} steps done — tap to finish</Text>
        </Pressable>
      )}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: space.m }}>
        <Stat n={live.length} label="Live jobs" onPress={() => router.push('/sites')} />
        <Stat n={upcoming.length} label="Upcoming" onPress={() => router.push('/sites')} />
        <Stat n={todo + unread} label="Messages & tasks" hot={todo + unread > 0} onPress={() => router.push('/inbox')} />
      </View>
      <Pressable onPress={() => router.push('/sites')} accessibilityRole="button"
        style={({ pressed }) => [{ backgroundColor: t.brand1, borderRadius: 22, paddingVertical: 18, paddingHorizontal: 20, marginBottom: space.m }, pressed && { opacity: 0.9 }]}>
        {/* 185 .pmhero: briefcase icon and chevron, like the PM home. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}><OphIcon name="projects" size={22} color={t.brand1Text} /></View>
          <OphIcon name="chevron" size={22} color={t.brand1Text} stroke={2.4} />
        </View>
        <Text style={[heading(800), { color: t.brand1Text, fontSize: 20, letterSpacing: -0.2 }]}>My projects</Text>
        <Text style={{ color: t.brand1Text, opacity: 0.92, marginTop: 4, fontSize: 13, fontWeight: '500' }}>{live.length} live{upcoming.length ? ` · ${upcoming.length} upcoming` : ''}</Text>
      </Pressable>
      {/* 185 .pmtiles: two across on a phone, four on a computer, with line icons. */}
      <TileGrid cols={desk ? 4 : 2}>
        {subform?.needed && <Tile ic="reports" tint={TINTS.orange[0]} fg={TINTS.orange[1]} title="Subcontractor form" sub="Please fill in — takes about 5 minutes" badge="!" onPress={() => router.push('/subform' as never)} />}
        <Tile ic="chat" tint={TINTS.blue[0]} fg={TINTS.blue[1]} title="Messages & tasks" badge={todo + unread || undefined}
          sub={[todo ? `${todo} to sign or do` : 'Nothing to sign', unread ? `${unread} new message${unread === 1 ? '' : 's'}` : 'no new messages'].join(' · ')}
          onPress={() => router.push('/inbox')} />
        <Tile ic="tools" tint={TINTS.green[0]} fg={TINTS.green[1]} title="My dashboard" sub="Hours, tools, certificates" onPress={() => router.push('/dashboard')} />
        <Tile ic="gear" tint={TINTS.grey[0]} fg={TINTS.grey[1]} title="Settings" sub="Account, signature, password" onPress={() => router.push('/account')} />
      </TileGrid>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 22 }}>
        <Muted>{me?.name}</Muted>
        <Muted>{roleLabel(me)}</Muted>
      </View>
      <Pressable onPress={signOut} style={{ alignSelf: 'center', marginTop: 8 }}>
        <Text style={{ color: base.warn, textDecorationLine: 'underline' }}>Sign out</Text>
      </Pressable>
    </Screen>
  );
}
