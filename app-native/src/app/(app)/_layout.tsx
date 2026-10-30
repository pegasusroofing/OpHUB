// The signed-in shell: bottom tabs on a phone, a left-hand menu on a computer
// (wide web window), like 125-desktop.js in the current app.
import { Redirect, router, Tabs, usePathname } from 'expo-router';
import { useEffect } from 'react';
import { Platform, Pressable, Text, useWindowDimensions, View } from 'react-native';

import { OneDriveSaveBar } from '@/components/OneDriveSaveBar';
import { AppBar } from '@/components/AppBar';
import { DeskNav } from '@/components/DeskNav';
import { OphIcon } from '@/components/OphIcon';
import { SupportBar } from '@/components/PlatformAdmin';
import { PolicyGate } from '@/components/PolicyGate';
import { useHsPolicy } from '@/data/hsPolicy';
import { useAuth } from '@/lib/auth';
import { usePushTaps } from '@/lib/push';
import { homeKind, isFinanceOnlyOrg, isFinanceUser } from '@/lib/roles';
import { base, useTheme } from '@/theme/theme';

const icon = (name: string) => function TabIcon({ color }: { color: unknown }) { return <OphIcon name={name} size={22} color={String(color)} />; };

// Pages reached from inside the app, not from the menu. Hidden this way (not href: null) so
// a refresh or typed address on the web keeps you on the page instead of bouncing to Home.
const hidden = { tabBarButton: () => null, tabBarItemStyle: { display: 'none' as const } };

export default function AppLayout() {
  const t = useTheme();
  const { me, org } = useAuth();
  // Tapping a notification opens the right screen (080).
  usePushTaps(me);
  // Drivers, finance-only companies and the platform admin have no project list.
  const hasSites = !['driver', 'finance', 'superadmin'].includes(homeKind(me, org));
  // Site managers, clients and subcontractor logins land on Projects; on a phone their bar also has
  // Inbox and My Dashboard (and HUB for site managers), as the current app's bottom bar.
  const extra = !!me && (me.role === 'site_manager' || ['client', 'subcontractor'].includes(homeKind(me, org)));
  const siteMgr = me?.role === 'site_manager';
  const { width } = useWindowDimensions();
  const desk = Platform.OS === 'web' && width >= 1100;
  // Compulsory H&S Policy: until it's signed, nothing but the signature page (640).
  const policy = useHsPolicy();
  const path = usePathname();
  // Ctrl / ⌘ K opens Search on the office laptop (136).
  useEffect(() => {
    if (Platform.OS !== 'web' || !me || homeKind(me, org) === 'finance') return;
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); router.push('/search' as never); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [me, org]);
  // A new company's admin sets up the logo first (160): kept on the branding page until there is one.
  const needsSetup = me?.role === 'admin' && !me._support && !!org && !org.logo_path;
  useEffect(() => { if (needsSetup && path !== '/pm/admin/branding') router.replace('/pm/admin/branding' as never); }, [needsSetup, path]);
  if (policy.data?.pending && policy.data.doc && path !== '/signature' && !me?._support) return <PolicyGate doc={policy.data.doc} />;
  // A Finance-only company (908 finOnlyRoute): just the Finance app; someone without Finance is told who switches it on.
  if (me && org && isFinanceOnlyOrg(org) && me.role !== 'superadmin') {
    if (!isFinanceUser(me, org)) return <FinNoAccess />;
    // 160 company setup (logo) comes first, else the two redirects bounce off each other.
    if (!(needsSetup && path === '/pm/admin/branding') && !/^\/(fin|account|signature|home)(\/|$)/.test(path)) return <Redirect href={'/fin' as never} />;
  }
  return (
    <View style={{ flex: 1 }}>
    <SupportBar />
    <Tabs
      tabBar={desk ? () => <DeskNav /> : undefined}
      screenOptions={{
        // Pages straight under the tabs get the shared top bar; the sections with their own Stack draw it themselves.
        header: (p) => <AppBar title={p.options.title} home={p.route.name === 'home'} onBack={p.route.name === 'home' ? undefined : () => router.navigate('/home' as never)} />,
        tabBarActiveTintColor: t.brand1,
        tabBarInactiveTintColor: base.tabIdle,
        tabBarPosition: desk ? 'left' : 'bottom',
        tabBarLabelPosition: desk ? 'beside-icon' : 'below-icon',
        tabBarStyle: desk
          ? { width: 220, borderRightColor: base.cardLine, backgroundColor: base.card, paddingTop: 16 }
          : { borderTopColor: base.cardLine, backgroundColor: base.card },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
      }}>
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: icon('home') }} />
      <Tabs.Screen name="sites" options={{ title: 'Projects', href: hasSites ? undefined : null, tabBarIcon: icon('projects'), headerShown: false }} />
      <Tabs.Screen name="account" options={{ title: 'Settings', tabBarIcon: icon('gear') }} />
      <Tabs.Screen name="onsite" options={{ ...hidden, title: 'On site now' }} />
      <Tabs.Screen name="dashboard" options={{ ...(extra && !desk ? { tabBarIcon: icon('reports') } : hidden), title: 'My Dashboard' }} />
      <Tabs.Screen name="driver" options={{ ...hidden, title: 'Driver', headerShown: false }} />
      <Tabs.Screen name="inbox" options={{ ...(extra && !desk ? { tabBarIcon: icon('chat'), tabBarLabel: 'Inbox' } : hidden), title: 'Messages & tasks' }} />
      <Tabs.Screen name="getting-started" options={{ ...hidden, title: 'Getting Started' }} />
      <Tabs.Screen name="signature" options={{ ...hidden, title: 'My Signature' }} />
      <Tabs.Screen name="search" options={{ ...hidden, title: 'Search' }} />
      <Tabs.Screen name="subform" options={{ ...hidden, title: 'Subcontractor form' }} />
      <Tabs.Screen name="pm" options={{ ...(siteMgr && !desk ? { tabBarIcon: icon('bell'), tabBarLabel: 'HUB', href: '/pm/hub' as never } : hidden), title: 'Manager', headerShown: false }} />
      <Tabs.Screen name="fin" options={{ ...hidden, title: 'Finance', headerShown: false }} />
    </Tabs>
    <OneDriveSaveBar />
    </View>
  );
}

function FinNoAccess() {
  const { signOut } = useAuth();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: base.paper }}>
      <View style={{ backgroundColor: base.card, borderRadius: 16, padding: 24, maxWidth: 420, width: '100%', alignItems: 'center', borderWidth: 1, borderColor: base.cardLine }}>
        <Text style={{ fontSize: 34 }}>🔒</Text>
        <Text style={{ fontWeight: '800', fontSize: 16, color: base.ink, marginTop: 10, marginBottom: 4, textAlign: 'center' }}>You don’t have OpHUB Finance yet</Text>
        <Text style={{ color: base.slate, textAlign: 'center', marginBottom: 16 }}>Ask your company admin to switch Finance on for you in Finance › Team.</Text>
        <Pressable onPress={() => void signOut()} style={{ borderWidth: 1, borderColor: base.line, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 18 }}><Text style={{ fontWeight: '700', color: base.ink }}>Sign out</Text></Pressable>
      </View>
    </View>
  );
}
