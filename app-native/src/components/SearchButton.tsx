// The 🔍 Search bar on Home (136 qsTopBtnHtml) — opens the Search page.
import { router } from 'expo-router';
import { Pressable, Text } from 'react-native';

import { base } from '@/theme/theme';

export function SearchButton() {
  return (
    <Pressable onPress={() => router.push('/search' as never)} accessibilityRole="search"
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: base.line, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: base.card, marginBottom: 14 }}>
      <Text style={{ fontSize: 15 }}>🔍</Text>
      <Text style={{ color: base.slate, flex: 1 }}>Search projects, people, reports…</Text>
    </Pressable>
  );
}
