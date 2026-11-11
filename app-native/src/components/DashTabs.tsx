// The Dashboard's two parts (Andy, 1 Nov 2026): the company's and the operatives'. Swapping replaces the page, so back leaves
// the Dashboard. Centred across the page (Andy, 11 Nov 2026); a company with Finance only has just the company one.
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { base, useTheme } from '@/theme/theme';

const TABS = [['company', 'Company Dashboard', '/pm/dashboard'], ['operatives', 'Operative Dashboard', '/pm/operatives']] as const;

export function DashTabs({ on }: { on: 'company' | 'operatives' }) {
  const { org } = useAuth();
  const t = useTheme();
  const tabs = TABS.filter(([k]) => k === 'company' || org?.has_pm !== false);
  if (tabs.length < 2) return null;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: base.line, marginBottom: 12 }}>
      {tabs.map(([k, label, go]) => (
        <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: k === on }} onPress={() => { if (k !== on) router.replace(go as never); }}
          style={{ flex: 1, maxWidth: 260, alignItems: 'center', paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: k === on ? t.brand1 : 'transparent', marginBottom: -1 }}>
          <Text style={{ fontWeight: k === on ? '700' : '600', color: k === on ? base.ink : base.slate }}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
