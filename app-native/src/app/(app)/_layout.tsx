// The signed-in shell: bottom tabs on a phone, a left-hand menu on a computer
// (wide web window), like 125-desktop.js in the current app.
import { router, Tabs, usePathname } from 'expo-router';
import { useEffect } from 'react';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Platform, useWindowDimensions, View } from 'react-native';

import { SupportBar } from '@/components/PlatformAdmin';
import { PolicyGate } from '@/components/PolicyGate';
import { useHsPolicy } from '@/data/hsPolicy';
import { useAuth } from '@/lib/auth';
import { homeKind } from '@/lib/roles';
import { base, useTheme } from '@/theme/theme';

const icon = (name: SymbolViewProps['name']) => ({ color }: { color: import('react-native').ColorValue }) =>
  <SymbolView name={name} tintColor={color} size={24} />;

// Pages reached from inside the app, not from the menu. Hidden this way (not href: null) so
// a refresh or typed address on the web keeps you on the page instead of bouncing to Home.
const hidden = { tabBarButton: () => null, tabBarItemStyle: { display: 'none' as const } };

export default function AppLayout() {
  const t = useTheme();
  const { me, org } = useAuth();
  // Drivers, finance-only companies and the platform admin have no project list.
  const hasSites = !['driver', 'finance', 'superadmin'].includes(homeKind(me, org));
  const { width } = useWindowDimensions();
  const desk = Platform.OS === 'web' && width >= 900;
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
  if (policy.data?.pending && policy.data.doc && path !== '/signature' && !me?._support) return <PolicyGate doc={policy.data.doc} />;
  return (
    <View style={{ flex: 1 }}>
    <SupportBar />
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.brand1,
        tabBarInactiveTintColor: base.tabIdle,
        tabBarPosition: desk ? 'left' : 'bottom',
        tabBarLabelPosition: desk ? 'beside-icon' : 'below-icon',
        tabBarStyle: desk
          ? { width: 220, borderRightColor: base.cardLine, backgroundColor: base.card, paddingTop: 16 }
          : { borderTopColor: base.cardLine, backgroundColor: base.card },
        tabBarLabelStyle: { fontSize: desk ? 14 : 10, fontWeight: '600' },
      }}>
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: icon({ ios: 'house', android: 'home', web: 'home' }) }} />
      <Tabs.Screen name="sites" options={{ title: 'Projects', href: hasSites ? undefined : null, tabBarIcon: icon({ ios: 'building.2', android: 'apartment', web: 'apartment' }) }} />
      <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: icon({ ios: 'person.crop.circle', android: 'person', web: 'person' }) }} />
      <Tabs.Screen name="onsite" options={{ ...hidden, title: 'On site now' }} />
      <Tabs.Screen name="dashboard" options={{ ...hidden, title: 'My dashboard' }} />
      <Tabs.Screen name="driver" options={{ ...hidden, title: 'Driver' }} />
      <Tabs.Screen name="inbox" options={{ ...hidden, title: 'Messages & tasks' }} />
      <Tabs.Screen name="getting-started" options={{ ...hidden, title: 'Getting Started' }} />
      <Tabs.Screen name="signature" options={{ ...hidden, title: 'My Signature' }} />
      <Tabs.Screen name="search" options={{ ...hidden, title: 'Search' }} />
      <Tabs.Screen name="subform" options={{ ...hidden, title: 'Subcontractor form' }} />
      <Tabs.Screen name="pm" options={{ ...hidden, title: 'Manager' }} />
      <Tabs.Screen name="fin" options={{ ...hidden, title: 'Finance' }} />
    </Tabs>
    </View>
  );
}
