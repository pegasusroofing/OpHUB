// Operative home. Ported from renderOpHome (185-pm-home.js).
// The Subcontractor form tile shows until the operative has sent it (867).
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Muted, Screen, Stat, Tile } from '@/components/ui';
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
import { base, space, useTheme } from '@/theme/theme';

export function OperativeHome() {
  const { me, signOut } = useAuth();
  const t = useTheme();
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
      <SearchButton />
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
        style={({ pressed }) => [{ backgroundColor: t.brand1, borderRadius: 22, padding: 20, marginBottom: space.m }, pressed && { opacity: 0.85 }]}>
        <Text style={{ color: t.brand1Text, fontSize: 20, fontWeight: '800' }}>My projects</Text>
        <Text style={{ color: t.brand1Text, opacity: 0.85, marginTop: 4 }}>{live.length} live{upcoming.length ? ` · ${upcoming.length} upcoming` : ''}</Text>
      </Pressable>
      {subform?.needed && <Tile icon="📝" tint={base.warnBg} title="Subcontractor form" sub="Please fill in — takes about 5 minutes" badge={1} onPress={() => router.push('/subform' as never)} />}
      <Tile icon="💬" tint={base.blueBg} title="Messages & tasks" badge={todo + unread}
        sub={[todo ? `${todo} to sign or do` : 'Nothing to sign', unread ? `${unread} new message${unread === 1 ? '' : 's'}` : 'no new messages'].join(' · ')}
        onPress={() => router.push('/inbox')} />
      <Tile icon="🧰" tint={base.okBg} title="My dashboard" sub="Hours, tools, certificates" onPress={() => router.push('/dashboard')} />
      <Tile icon="⚙️" tint={base.paper} title="Settings" sub="Account, signature, password" onPress={() => router.push('/account')} />
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
