// Finance › Purchases › Yard: Stock and Plant as two tabs of their own (Andy, 4 Nov 2026).
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { useTheme } from '@/theme/theme';

export function YardSubTabs({ on }: { on: 'stock' | 'plant' }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
      {([['stock', 'Stock'], ['plant', 'Plant']] as const).map(([k, l]) => (
        <Pressable key={k} accessibilityRole="button" onPress={() => { if (on !== k) router.setParams({ sub: k === 'plant' ? 'plant' : undefined } as never); }} style={{ paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 2, borderBottomColor: on === k ? t.brand1 : 'transparent' }}>
          <Text style={{ fontSize: 14, fontWeight: on === k ? '700' : '600', color: on === k ? '#111827' : '#6b7280' }}>{l}</Text>
        </Pressable>
      ))}
    </View>
  );
}
