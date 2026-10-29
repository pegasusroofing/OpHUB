// A slim drop-down: shows the choice, tap to pick from a list that opens beside it (with search when long).
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { chooseAction } from '@/components/toast';
import { base, radius } from '@/theme/theme';

export function SelectBox<K extends string>({ label, value, options, onChange, placeholder = 'Choose…', style, title }: {
  label?: string; value: K | null | undefined; options: [K, string][]; onChange: (k: K) => void; placeholder?: string; style?: StyleProp<ViewStyle>; title?: string;
}) {
  const cur = options.find(([k]) => k === value)?.[1];
  return (
    <View style={[{ marginBottom: 10 }, style]}>
      {!!label && <Text style={{ fontSize: 12, fontWeight: '700', color: base.slate, marginBottom: 4 }}>{label}</Text>}
      <Pressable accessibilityRole="button" accessibilityLabel={label || title || placeholder} onPress={async () => {
        const k = await chooseAction(title || label || placeholder, options.map(([key, l]) => ({ key, label: `${key === value ? '✓ ' : ''}${l}` })));
        if (k !== null && k !== undefined) onChange(k as K);
      }} style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: base.line, borderRadius: radius.input, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: base.card }}>
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, color: cur ? base.ink : base.slateLight }}>{cur || placeholder}</Text>
        <Text style={{ color: base.slate, fontSize: 12 }}>▾</Text>
      </Pressable>
    </View>
  );
}
