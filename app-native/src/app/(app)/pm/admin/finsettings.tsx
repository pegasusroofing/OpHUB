// Admin Centre › Finance: one part of Finance's settings on its own page (Andy, 18 Nov 2026: "keep tab style but add
// into the main admin tabs for finance settings, then a project settings etc"). The same parts, and the same rules on
// who can change them, as Finance › Settings; the page takes its name from the Admin Centre's row.
import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import { FinSettingsBody } from '@/components/FinSettingsBody';
import { Muted } from '@/components/ui';
import { ADMIN_ITEMS, FIN_GROUPS } from '@/lib/adminItems';
import { useAuth } from '@/lib/auth';
import { isFinanceUser } from '@/lib/roles';
import { page, space } from '@/theme/theme';

export default function AdminFinSettings() {
  const { me, org } = useAuth();
  const { part } = useLocalSearchParams<{ part?: string }>();
  const k = typeof part === 'string' && part ? part : 'sales';
  const item = ADMIN_ITEMS.find((i) => i.route === `/pm/admin/finsettings?part=${k}`);
  if (!me) return null;
  if (!isFinanceUser(me, org)) return <Muted style={{ padding: space.l }}>For people with Finance switched on.</Muted>;
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: item?.label || 'Finance Settings' }} />
      <FinSettingsBody only={FIN_GROUPS[k] ?? k} />
    </ScrollView>
  );
}
