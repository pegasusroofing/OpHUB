// Numbered lines for the RAMS builder (Andy, 4 Nov 2026): steps and control measures, each line with its number showing as
// you type. Enter starts the next number; Backspace on an empty line takes that number away again (an accidental Enter is
// easy to undo). A long line just wraps; it only gets a new number when you press Enter. Pasted text splits one per line.
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Text, TextInput, View } from 'react-native';

import { base, radius } from '@/theme/theme';

export function NumberedLines({ value, onChange, placeholder = 'Type, then Enter for the next one' }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [rows, setRows] = useState<string[]>(() => (value.length ? value.slice() : ['']));
  const refs = useRef<(ComponentRef<typeof TextInput> | null)[]>([]);
  const focusTo = useRef<number | null>(null);
  useEffect(() => { if (focusTo.current != null) { refs.current[focusTo.current]?.focus(); focusTo.current = null; } });
  const push = (next: string[], focus?: number) => { setRows(next); if (focus != null) focusTo.current = focus; onChange(next.map((x) => x.trim()).filter(Boolean)); };
  const type = (i: number, v: string) => {
    if (!v.includes('\n')) { push(rows.map((r, j) => (j === i ? v : r))); return; }
    // Enter (or a pasted list): the text after each line break becomes the next numbered line.
    const parts = v.split(/\r?\n/);
    const next = [...rows.slice(0, i), ...parts, ...rows.slice(i + 1)];
    push(next, i + parts.length - 1);
  };
  const key = (i: number, k: string) => {
    if (k === 'Backspace' && rows[i] === '' && rows.length > 1) push(rows.filter((_, j) => j !== i), Math.max(0, i - 1));
  };
  return (
    <View style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, backgroundColor: base.card, paddingVertical: 4, marginBottom: 8 }}>
      {rows.map((r, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 8, borderTopWidth: i ? 1 : 0, borderTopColor: base.cardLine }}>
          <Text style={{ width: 22, paddingTop: 8, fontWeight: '600', color: base.slate }}>{i + 1}.</Text>
          <TextInput
            ref={(el) => { refs.current[i] = el; }}
            value={r}
            multiline
            onChangeText={(v) => type(i, v)}
            onKeyPress={(e) => key(i, (e.nativeEvent as unknown as { key: string }).key)}
            placeholder={i === rows.length - 1 && !r ? placeholder : undefined}
            accessibilityLabel={`Line ${i + 1}`}
            style={{ flex: 1, minWidth: 0, paddingVertical: 7, fontSize: 15, color: base.ink }}
          />
        </View>
      ))}
    </View>
  );
}
