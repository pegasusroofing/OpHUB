// A slim drop-down: shows the choice, tap to pick from a list that opens beside it (with search when long).
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { chooseAction } from '@/components/toast';
import { base, radius } from '@/theme/theme';

// short: a shorter name to show in the box when it is narrow (the list keeps the full names).
export function SelectBox<K extends string>({ label, value, options, onChange, placeholder = 'Choose…', style, title, compact, textSize, short }: {
  label?: string; value: K | null | undefined; options: [K, string][]; onChange: (k: K) => void; placeholder?: string; style?: StyleProp<ViewStyle>; title?: string; compact?: boolean; textSize?: number; short?: Partial<Record<K, string>>;
}) {
  const cur = (value != null && short?.[value]) || options.find(([k]) => k === value)?.[1];
  return (
    <View style={[{ marginBottom: 10 }, style]}>
      {!!label && <Text style={{ fontSize: 12, fontWeight: '600', color: base.slate, marginBottom: 4 }}>{label}</Text>}
      <Pressable accessibilityRole="button" accessibilityLabel={label || title || placeholder} onPress={async () => {
        const k = await chooseAction(title || label || placeholder, options.map(([key, l]) => ({ key, label: `${key === value ? '✓ ' : ''}${l}` })));
        if (k !== null && k !== undefined) onChange(k as K);
      }} style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: base.line, borderRadius: compact ? 7 : radius.input, paddingHorizontal: compact ? 8 : 12, paddingVertical: compact ? 3 : 9, backgroundColor: base.card }}>
        <Text numberOfLines={1} style={{ flex: 1, fontSize: textSize || (compact ? 12 : 15), color: cur ? base.ink : base.slateLight }}>{cur || placeholder}</Text>
        <Text style={{ color: base.slate, fontSize: 12 }}>▾</Text>
      </Pressable>
    </View>
  );
}
