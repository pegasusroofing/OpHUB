// A drop-down you can work from the keyboard, like the Unit box in Applications (Andy, 5 Nov 2026): Tab into it, type to
// narrow the list or press the down / up arrows, then Tab or Enter takes the highlighted one and moves on. A click works
// too. Shows the short text (e.g. a cost code's number) in the box, and the full label in the list.
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Text, TextInput, View, type StyleProp, type TextStyle } from 'react-native';

import { base } from '@/theme/theme';

export type PickOpt = { v: string; label: string; short?: string };

export function TypePick({ value, options, onChange, style, label, placeholder, listWidth = 260, align = 'center' }: {
  value: string; options: PickOpt[]; onChange: (v: string) => void; style?: StyleProp<TextStyle>; label: string; placeholder?: string; listWidth?: number; align?: 'left' | 'center';
}) {
  const cur = options.find((o) => o.v === value);
  const shown = cur ? cur.short ?? cur.label : '';
  const [typed, setTyped] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const q = (typed ?? '').trim().toLowerCase();
  const list = options.filter((o) => !q || o.label.toLowerCase().includes(q) || (o.short || '').toLowerCase().startsWith(q));
  // A click in the list mustn't take focus from the box first.
  const box = useRef<View>(null);
  useEffect(() => {
    if (Platform.OS !== 'web' || !open) return;
    const el = box.current as unknown as HTMLElement | null;
    const hold = (e: Event) => e.preventDefault();
    el?.addEventListener?.('mousedown', hold);
    return () => el?.removeEventListener?.('mousedown', hold);
  }, [open]);
  const take = (o?: PickOpt) => { setOpen(false); setHi(-1); setTyped(null); if (o) onChange(o.v); };
  return (
    <View style={{ zIndex: open ? 60 : 0 }}>
      <TextInput value={typed ?? shown} placeholder={placeholder || label} accessibilityLabel={label} autoComplete="off" style={[style, { textAlign: align }]}
        onChangeText={(t) => { setTyped(t); setOpen(true); setHi(0); }}
        onFocus={() => { setOpen(true); setHi(Math.max(0, options.findIndex((o) => o.v === value))); }}
        onBlur={() => { setOpen(false); setHi(-1); setTyped(null); }}
        onKeyPress={(e) => {
          const k = (e.nativeEvent as unknown as { key: string }).key;
          const stop = () => (e as unknown as { preventDefault?: () => void }).preventDefault?.();
          if (k === 'ArrowDown') { stop(); setOpen(true); setHi((h) => Math.min(list.length - 1, h + 1)); }
          else if (k === 'ArrowUp') { stop(); setOpen(true); setHi((h) => Math.max(0, h - 1)); }
          else if ((k === 'Tab' || k === 'Enter') && open && hi >= 0 && list[hi]) take(list[hi]);
          else if (k === 'Tab') setOpen(false);
          else if (k === 'Escape') { setOpen(false); setTyped(null); }
        }} />
      {open && list.length > 0 && (
        <View ref={box as never} {...({ tabIndex: -1 } as object)} style={{ position: 'absolute', top: 32, left: 0, width: listWidth, maxHeight: 260, overflow: 'scroll' as 'hidden', backgroundColor: base.card, borderWidth: 1, borderColor: base.line, borderRadius: 8, paddingVertical: 4, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 }}>
          {list.map((o, i) => (
            <Pressable key={o.v} focusable={false} onPress={() => take(o)} style={{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: hi === i ? '#E7EDF8' : o.v === value ? '#F6F7F9' : undefined }}>
              <Text style={{ fontSize: 13, color: base.ink, fontWeight: o.v === value ? '600' : '400' }}>{o.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
