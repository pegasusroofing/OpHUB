// Finance › Purchases › Yard: Stock and Plant as two tabs of their own (Andy, 4 Nov 2026).
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useTheme } from '@/theme/theme';

/** right: on the right of the row, across the page (Stock Take on a laptop; Andy, 14 Nov 2026). */
export function YardSubTabs({ on, right }: { on: 'stock' | 'plant'; right?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
      {([['stock', 'Stock'], ['plant', 'Plant']] as const).map(([k, l]) => (
        <Pressable key={k} accessibilityRole="button" onPress={() => { if (on !== k) router.replace({ pathname: '/fin/yard', params: k === 'plant' ? { sub: 'plant' } : {} } as never); }} style={{ paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 2, borderBottomColor: on === k ? t.brand1 : 'transparent' }}>
          <Text style={{ fontSize: 14, fontWeight: on === k ? '700' : '600', color: on === k ? '#111827' : '#6b7280' }}>{l}</Text>
        </Pressable>
      ))}
      {!!right && <><View style={{ flex: 1 }} />{right}</>}
    </View>
  );
}
