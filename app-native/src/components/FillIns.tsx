// Fill-in buttons for email wording (Andy, 19 Nov 2026: "add in the place holders that are possible as add buttons").
// "+ Project" puts {project} where the cursor is in the box last tapped (the Subject or the Message); the app swaps it
// for the job's own details when the email is made.
import { useRef, useState } from 'react';
import { Pressable, Text, View, type TextInputSelectionChangeEvent } from 'react-native';

import { Muted } from '@/components/ui';
import { addFillIn, type Sel } from '@/lib/rules/emailSignature';
import { base } from '@/theme/theme';

/** Remembers which box was tapped last and where its cursor is, so a button adds in the right place. */
export function useFillIns(start: string) {
  const [target, setTarget] = useState(start);
  const sel = useRef<Record<string, Sel>>({});
  const bind = (k: string) => ({
    onFocus: () => setTarget(k),
    onSelectionChange: (e: TextInputSelectionChangeEvent) => { sel.current[k] = e.nativeEvent.selection; },
  });
  const add = (k: string, text: string, token: string) => { const r = addFillIn(text, token, sel.current[k]); sel.current[k] = r.sel; return r.text; };
  return { target, bind, add };
}

/** The buttons: one per fill-in, under the boxes they add to. */
export function FillInButtons({ items, target, onPick }: { items: [string, string][]; target: string; onPick: (token: string) => void }) {
  return (
    // width, not flexBasis: inside a column (the quote chaser card) a 100% basis is 100% of the height (UI check, 20 Nov 2026).
    <View style={{ width: '100%', marginBottom: 10 }}>
      <Muted style={{ fontSize: 12, marginBottom: 5 }}>Tap to add to the {target.toLowerCase()}, where the cursor is:</Muted>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {items.map(([token, label]) => (
          <Pressable key={token} accessibilityRole="button" accessibilityLabel={`Add ${label}`} onPress={() => onPick(token)}
            style={({ pressed }) => ({ borderWidth: 1, borderColor: base.line, borderRadius: 14, paddingVertical: 5, paddingHorizontal: 10, backgroundColor: pressed ? '#F1F3F6' : base.card })}>
            <Text style={{ fontSize: 12.5, fontWeight: '500', color: base.ink }}>+ {label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
