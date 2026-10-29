// A text box that suggests matches as you type (clients from the Directory, suppliers…), just under
// the box. Free text is still allowed when nothing matches. `top` items (favourites) are listed first.
import { useState } from 'react';
import { Pressable, Text, TextInput, View, type TextInputProps } from 'react-native';

import { base, radius } from '@/theme/theme';

export type Suggestion = { key: string; label: string; sub?: string; top?: boolean };

export function SuggestField({ label, value, onChangeText, items, onPick, max = 8, showAllOnFocus, style, ...props }: Omit<TextInputProps, 'value' | 'onChangeText'> & {
  label?: string; value: string; onChangeText: (v: string) => void; items: Suggestion[]; onPick: (s: Suggestion) => void; max?: number; showAllOnFocus?: boolean;
}) {
  const [focus, setFocus] = useState(false);
  const q = value.trim().toLowerCase();
  const list = items
    .filter((s) => (q ? s.label.toLowerCase().includes(q) && s.label.toLowerCase() !== q : showAllOnFocus))
    .sort((a, b) => Number(!!b.top) - Number(!!a.top) || Number(b.label.toLowerCase().startsWith(q)) - Number(a.label.toLowerCase().startsWith(q)) || a.label.localeCompare(b.label))
    .slice(0, max);
  return (
    <View style={[{ marginBottom: 12, zIndex: focus ? 20 : 0 }, style]}>
      {!!label && <Text style={{ fontSize: 12, fontWeight: '700', color: base.slate, marginBottom: 4 }}>{label}</Text>}
      <TextInput value={value} onChangeText={onChangeText} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 200)}
        placeholderTextColor={base.slateLight} autoComplete="off"
        style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, color: base.ink, backgroundColor: base.card }} {...props} />
      {focus && list.length > 0 && (
        <View style={{ marginTop: 2, borderWidth: 1, borderColor: base.line, borderRadius: radius.input, backgroundColor: base.card, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, elevation: 3 }}>
          {list.map((s, i) => (
            <Pressable key={s.key} onPress={() => { onPick(s); setFocus(false); }} style={({ pressed }) => [{ paddingHorizontal: 12, paddingVertical: 9, borderTopWidth: i ? 1 : 0, borderTopColor: '#ECEEF2' }, pressed && { backgroundColor: '#F3F5F8' }]}>
              <Text style={{ fontSize: 15, color: base.ink, fontWeight: '600' }}>{s.top ? '★ ' : ''}{s.label}</Text>
              {!!s.sub && <Text style={{ fontSize: 12, color: base.slate }}>{s.sub}</Text>}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
