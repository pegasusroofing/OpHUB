// A message box where typing @ lists people to mention (Andy, 31 Oct 2026).
import { Pressable, Text, TextInput, View, type StyleProp, type TextStyle } from 'react-native';

import { base, radius } from '@/theme/theme';

type Person = { id: string; name: string | null };

/** The people whose @Name is in the text. */
export const mentionedIn = (text: string, people: Person[]) => people.filter((p) => p.name && text.includes(`@${p.name}`)).map((p) => p.id);

export function MentionBox({ value, onChangeText, people, placeholder, style }: { value: string; onChangeText: (t: string) => void; people: Person[]; placeholder?: string; style?: StyleProp<TextStyle> }) {
  const typing = (value.match(/(^|\s)@([^@\n]{0,30})$/) || [])[2];
  const q = typing?.toLowerCase();
  const shown = q === undefined ? [] : people.filter((p) => p.name && p.name.toLowerCase().includes(q)).slice(0, 6);
  return (
    <View>
      <TextInput multiline value={value} onChangeText={onChangeText} placeholder={placeholder} style={style} />
      {shown.length > 0 && (
        <View style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, backgroundColor: base.card, marginTop: 4, marginBottom: 8 }}>
          {shown.map((p) => (
            <Pressable key={p.id} accessibilityRole="button" onPress={() => onChangeText(`${value.slice(0, value.length - (typing as string).length)}${p.name} `)} style={{ paddingVertical: 9, paddingHorizontal: 12 }}>
              <Text style={{ color: base.ink, fontWeight: '600' }}>@{p.name}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
