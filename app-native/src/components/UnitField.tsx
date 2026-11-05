// Unit on a Bill of Quantities line (Andy, 1 Nov 2026): free type, with the company's saved units suggested as you go. Down and up
// arrows move through the list; Tab or Enter takes the highlighted one. "Edit saved units" is always the last choice.
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Text, TextInput, View, type StyleProp, type TextStyle } from 'react-native';

import { base } from '@/theme/theme';

export const DEFAULT_UNITS = ['nr', 'm', 'm²', 'm³', 'lm', 'item', 'sum', 'hr', 'day', 'wk', 'roll', 'bag', 'box', 'pack', 'load', 't', 'kg', 'ltr'];

// Typing m2 or m3 gives m² or m³ (Andy, 2 Nov 2026); lines imported as m2 show the same way.
const tidy = (v: string) => (/^m2$/i.test(v.trim()) ? 'm²' : /^m3$/i.test(v.trim()) ? 'm³' : v);
const plain = (v: string) => v.trim().toLowerCase().replace(/²/g, '2').replace(/³/g, '3');

export function UnitField({ value, onChangeText, units, onEdit, style, onFocus, onBlur }: {
  value: string; onChangeText: (v: string) => void; units: string[]; onEdit?: () => void; style?: StyleProp<TextStyle>; onFocus?: () => void; onBlur?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const q = plain(value);
  const list = units.filter((u) => !q || plain(u).includes(q));
  const count = list.length + (onEdit ? 1 : 0); // the last row is Edit saved units
  // A click in the list mustn't take focus from the box, or the line would close before the click lands.
  const box = useRef<View>(null);
  useEffect(() => {
    if (Platform.OS !== 'web' || !open) return;
    const el = box.current as unknown as HTMLElement | null;
    const hold = (e: Event) => e.preventDefault();
    el?.addEventListener?.('mousedown', hold);
    return () => el?.removeEventListener?.('mousedown', hold);
  }, [open]);
  const take = (i: number) => {
    setOpen(false); setHi(-1);
    if (i === list.length) onEdit?.(); else if (list[i] !== undefined) onChangeText(list[i]);
  };
  return (
    <View style={{ zIndex: open ? 60 : 0 }}>
      <TextInput value={tidy(value)} placeholder="Unit" accessibilityLabel="Unit" autoComplete="off" style={style}
        onChangeText={(v) => { onChangeText(tidy(v)); setOpen(true); setHi(-1); }}
        onFocus={() => { setOpen(true); onFocus?.(); }}
        onBlur={() => { setOpen(false); setHi(-1); onBlur?.(); }}
        onKeyPress={(e) => {
          const k = (e.nativeEvent as unknown as { key: string }).key;
          if (k === 'ArrowDown') { (e as unknown as { preventDefault?: () => void }).preventDefault?.(); setOpen(true); setHi((h) => (h + 1) % count); }
          else if (k === 'ArrowUp') { (e as unknown as { preventDefault?: () => void }).preventDefault?.(); setOpen(true); setHi((h) => (h <= 0 ? count - 1 : h - 1)); }
          else if ((k === 'Tab' || k === 'Enter') && open && hi >= 0) take(hi);
          else if (k === 'Tab') setOpen(false); // the open list would otherwise take a Tab of its own
          else if (k === 'Escape') setOpen(false);
        }} />
      {open && (
        <View ref={box as never} {...({ tabIndex: -1 } as object)} style={{ position: 'absolute', top: 34, left: 0, width: 170, maxHeight: 240, overflow: 'scroll' as 'hidden', backgroundColor: base.card, borderWidth: 1, borderColor: base.line, borderRadius: 8, shadowColor: '#101828', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 }}>
          {list.map((u, i) => (
            <Pressable key={u} focusable={false} onPress={() => take(i)} style={{ paddingHorizontal: 10, paddingVertical: 5, backgroundColor: hi === i ? '#E7EDF8' : undefined }}>
              <Text style={{ fontSize: 13, color: base.ink, fontWeight: hi === i ? '700' : '400' }}>{u}</Text>
            </Pressable>
          ))}
          {onEdit && <Pressable focusable={false} onPress={() => take(list.length)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderTopWidth: list.length ? 1 : 0, borderTopColor: base.line, backgroundColor: hi === list.length ? '#E7EDF8' : undefined }}>
            <Text style={{ fontSize: 12.5, fontWeight: '600', color: base.slate }}>Edit saved units…</Text>
          </Pressable>}
        </View>
      )}
    </View>
  );
}
