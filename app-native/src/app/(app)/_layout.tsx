// The signed-in shell: bottom tabs on a phone, a left-hand menu on a computer
// (wide web window), like 125-desktop.js in the current app.
import { Tabs } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Platform, useWindowDimensions } from 'react-native';

import { useAuth } from '@/lib/auth';
import { homeKind } from '@/lib/roles';
import { base, useTheme } from '@/theme/theme';

const icon = (name: SymbolViewProps['name']) => ({ color }: { color: import('react-native').ColorValue }) =>
  <SymbolView name={name} tintColor={color} size={24} />;

export default function AppLayout() {
  const t = useTheme();
  const { me, org } = useAuth();
  // Drivers, finance-only companies and the platform admin have no project list.
  const hasSites = !['driver', 'finance', 'superadmin'].includes(homeKind(me, org));
  const { width } = useWindowDimensions();
  const desk = Platform.OS === 'web' && width >= 900;
  return (
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
      <Tabs.Screen name="driver" options={{ href: null, title: 'Driver' }} />
      <Tabs.Screen name="inbox" options={{ href: null, title: 'Messages & tasks' }} />
      <Tabs.Screen name="signature" options={{ href: null, title: 'My Signature' }} />
    </Tabs>
  );
}
