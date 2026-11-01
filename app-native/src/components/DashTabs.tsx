// The Dashboard's two parts (Andy, 1 Nov 2026): the company's and the operatives'. Swapping replaces the page, so back leaves the Dashboard.
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { base } from '@/theme/theme';

const TABS = [['company', 'Company dashboard', '/pm/dashboard'], ['operatives', 'Operative dashboard', '/pm/operatives']] as const;

export function DashTabs({ on }: { on: 'company' | 'operatives' }) {
  return (
    <View style={{ flexDirection: 'row', gap: 16, borderBottomWidth: 1, borderBottomColor: base.line, marginBottom: 12 }}>
      {TABS.map(([k, label, go]) => (
        <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: k === on }} onPress={() => { if (k !== on) router.replace(go as never); }} style={{ paddingVertical: 8, borderBottomWidth: 2, borderBottomColor: k === on ? base.ink : 'transparent', marginBottom: -1 }}>
          <Text style={{ fontWeight: '700', color: k === on ? base.ink : base.slate }}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
