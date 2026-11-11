// The footer bar from Finance (Andy, 11 Nov 2026: "change the export into the bottom footer bar that we have in finance"):
// a bar in the company colour at the bottom of a list, with how many things on the left, a button in the middle if the page
// has one (Settings on Quotes), and Export ▾ on the right. Export asks what to export, then Excel or PDF.
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { chooseAction } from '@/components/toast';
import { useTheme } from '@/theme/theme';

export function FootButton({ label, onPress, a11y }: { label: string; onPress: () => void; a11y?: string }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y || label} onPress={onPress} hitSlop={6}
      style={{ borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)', borderRadius: 7, paddingVertical: 4, paddingHorizontal: 10 }}>
      <Text numberOfLines={1} style={{ color: t.brand1Text, fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

/** The bar. It sits after the list and stays in view at the bottom of the screen while the list scrolls (web). */
export function FootBar({ left, middle, right }: { left: string; middle?: ReactNode; right?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ position: 'sticky' as never, bottom: 10, marginTop: 10, backgroundColor: t.brand1, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Text numberOfLines={1} style={{ flex: 1, color: t.brand1Text, fontSize: 12.5, fontWeight: '600' }}>{left}</Text>
      {middle ? <View style={{ flex: 1, alignItems: 'center' }}>{middle}</View> : null}
      <View style={{ flex: 1, alignItems: 'flex-end' }}>{right}</View>
    </View>
  );
}

export type ExportChoice<K extends string> = { key: K; label: string };
/** Export ▾: what to export (this view first), then Excel or PDF. Null if they backed out. */
export async function pickExport<K extends string>(what: ExportChoice<K>[], pdf = true): Promise<{ key: K; as: 'xlsx' | 'pdf' } | null> {
  const k = what.length === 1 ? what[0].key : ((await chooseAction('What To Export', what.map((w) => ({ key: w.key, label: w.label })))) as K | null);
  if (!k) return null;
  if (!pdf) return { key: k, as: 'xlsx' };
  const as = await chooseAction('Export As', [{ key: 'xlsx', label: '📊 Excel' }, { key: 'pdf', label: '📄 PDF' }]);
  return as ? { key: k, as: as as 'xlsx' | 'pdf' } : null;
}
