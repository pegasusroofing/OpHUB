// Operative home. Ported from renderOpHome (185-pm-home.js).
// Still to come: the Getting Started checklist, the subcontractor form tile,
// "to sign / do" tasks (outstanding tasks) and My dashboard.
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Muted, Screen, Stat, Tile } from '@/components/ui';
import { useOpUnreadCount } from '@/data/messages';
import { useSites } from '@/data/sites';
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
  const first = (me?.name || '').trim().split(/\s+/)[0] || '';
  const dateTxt = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <Screen>
      <Text style={{ fontSize: 12.5, color: base.slate, fontWeight: '600' }}>{dateTxt}</Text>
      <Text style={{ fontSize: 21, fontWeight: '800', color: base.ink, marginBottom: 14 }}>{greeting()}{first ? `, ${first}` : ''}</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: space.m }}>
        <Stat n={live.length} label="Live jobs" onPress={() => router.push('/sites')} />
        <Stat n={upcoming.length} label="Upcoming" onPress={() => router.push('/sites')} />
        <Stat n={unread} label="Messages & tasks" hot={unread > 0} />
      </View>
      <Pressable onPress={() => router.push('/sites')} accessibilityRole="button"
        style={({ pressed }) => [{ backgroundColor: t.brand1, borderRadius: 22, padding: 20, marginBottom: space.m }, pressed && { opacity: 0.85 }]}>
        <Text style={{ color: t.brand1Text, fontSize: 20, fontWeight: '800' }}>My projects</Text>
        <Text style={{ color: t.brand1Text, opacity: 0.85, marginTop: 4 }}>{live.length} live{upcoming.length ? ` · ${upcoming.length} upcoming` : ''}</Text>
      </Pressable>
      <Tile icon="💬" tint={base.blueBg} title="Messages & tasks" badge={unread}
        sub={unread ? `${unread} new message${unread === 1 ? '' : 's'}` : 'No new messages'} onPress={() => undefined} />
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
