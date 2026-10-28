// Basic building blocks matching the current app's look (cards, fields, buttons).
import type { ReactNode } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type TextInputProps, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { base, radius, space, useTheme } from '@/theme/theme';

export function Screen({ children, center }: { children: ReactNode; center?: boolean }) {
  return (
    <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={[s.scroll, center && s.center]} keyboardShouldPersistTaps="handled">
        <View style={s.inner}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={s.title}>{children}</Text>;
}
export function Muted({ children, style }: { children: ReactNode; style?: object }) {
  return <Text style={[s.muted, style]}>{children}</Text>;
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ marginBottom: space.m }}>
      <Text style={s.label}>{label}</Text>
      <TextInput placeholderTextColor={base.slateLight} style={s.input} {...props} />
    </View>
  );
}

export function Button({ title, onPress, busy, kind = 'primary', disabled }: {
  title: string; onPress: () => void; busy?: boolean; kind?: 'primary' | 'ghost'; disabled?: boolean;
}) {
  const t = useTheme();
  const primary = kind === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={busy || disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.btn,
        primary ? { backgroundColor: t.brand1, borderColor: t.brand1 } : { backgroundColor: base.card, borderColor: base.line },
        (pressed || busy || disabled) && { opacity: 0.7 },
      ]}>
      {busy && <ActivityIndicator color={primary ? t.brand1Text : base.ink} style={{ marginRight: 8 }} />}
      <Text style={[s.btnText, { color: primary ? t.brand1Text : base.ink }]}>{title}</Text>
    </Pressable>
  );
}

export function Notice({ kind, text }: { kind: 'error' | 'info'; text: string }) {
  const err = kind === 'error';
  return (
    <View style={[s.notice, { backgroundColor: err ? '#FBE7EA' : base.okBg, borderColor: err ? base.red : base.ok }]}>
      <Text style={{ color: err ? base.red : base.ok, fontWeight: '700' }}>{text}</Text>
    </View>
  );
}

export function Link({ title, onPress }: { title: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="link" style={{ alignSelf: 'center', paddingVertical: 8 }}>
      <Text style={{ color: t.brand1, fontWeight: '700' }}>{title}</Text>
    </Pressable>
  );
}

export function Check({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={() => onChange(!value)} accessibilityRole="checkbox" accessibilityState={{ checked: value }} style={s.checkRow}>
      <View style={[s.box, value && { backgroundColor: t.brand1, borderColor: t.brand1 }]}>
        {value && <Text style={{ color: t.brand1Text, fontSize: 12, fontWeight: '800' }}>✓</Text>}
      </View>
      <Text style={[s.muted, { flex: 1 }]}>{label}</Text>
    </Pressable>
  );
}

// Green "On site since 07:42" / grey "Not checked in" pill.
export function Pill({ on, text }: { on: boolean; text: string }) {
  return (
    <View style={[s.pill, { backgroundColor: on ? base.okBg : base.paper }]}>
      <View style={[s.dot, { backgroundColor: on ? base.ok : base.slateLight }]} />
      <Text style={{ color: on ? base.ok : base.slate, fontWeight: '700', fontSize: 12.5 }}>{text}</Text>
    </View>
  );
}

// Tappable card row, e.g. a site or an address.
export function Row({ title, sub, extra, onPress, dim }: { title: string; sub?: string | null; extra?: ReactNode; onPress?: () => void; dim?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [s.row, dim && { opacity: 0.7 }, pressed && { opacity: 0.6 }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.rowTitle} numberOfLines={1}>{title}</Text>
        {!!sub && <Text style={s.rowSub} numberOfLines={1}>{sub}</Text>}
        {extra}
      </View>
      {onPress && <Text style={{ fontSize: 20, color: base.slate, marginLeft: 8 }}>›</Text>}
    </Pressable>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={s.section}>{children}</Text>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <Text style={s.empty}>{children}</Text>;
}

// Collapsible header row ("▶ Recent").
export function Toggle({ title, open, onPress }: { title: string; open: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[s.row, { marginTop: space.l }]} accessibilityRole="button" accessibilityState={{ expanded: open }}>
      <Text style={{ color: base.slate, marginRight: 8 }}>{open ? '▼' : '▶'}</Text>
      <Text style={[s.rowTitle, { fontSize: 13.5 }]}>{title}</Text>
    </Pressable>
  );
}

// Small stat box on home pages (big number + label).
export function Stat({ n, label, hot, onPress }: { n: number | string; label: string; hot?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={s.stat}>
      <Text style={[s.statN, hot && { color: base.red }]}>{n}</Text>
      <Text style={s.statL}>{label}</Text>
    </Pressable>
  );
}

// Home tile: coloured icon square + title + subtitle.
export function Tile({ icon, tint, title, sub, onPress, badge }: { icon: string; tint: string; title: string; sub: string; onPress: () => void; badge?: number }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.tile, pressed && { opacity: 0.7 }]} accessibilityRole="button">
      <View style={[s.tileIc, { backgroundColor: tint }]}>
        <Text style={{ fontSize: 20 }}>{icon}</Text>
        {!!badge && <Text style={s.badge}>{badge}</Text>}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.rowTitle}>{title}</Text>
        <Text style={s.rowSub}>{sub}</Text>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, paddingHorizontal: 14, paddingVertical: 12, marginBottom: space.s },
  rowTitle: { fontSize: 14.5, fontWeight: '700', color: base.ink },
  rowSub: { fontSize: 12, color: base.slate, marginTop: 2 },
  section: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', color: base.slate, marginTop: space.l, marginBottom: space.s },
  empty: { color: base.slate, textAlign: 'center', paddingVertical: space.l, fontSize: 13 },
  stat: { flex: 1, backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: 16, paddingVertical: 11, paddingHorizontal: 10 },
  statN: { fontSize: 21, fontWeight: '800', color: base.ink },
  statL: { fontSize: 10.5, color: base.slate, fontWeight: '600' },
  tile: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.tile, padding: 14, marginBottom: space.s },
  tileIc: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -6, right: -6, backgroundColor: base.red, color: '#fff', fontSize: 11, fontWeight: '800', borderRadius: 9, minWidth: 18, textAlign: 'center', paddingHorizontal: 4, overflow: 'hidden' },
  screen: { flex: 1, backgroundColor: base.paper },
  scroll: { flexGrow: 1, padding: space.l },
  center: { justifyContent: 'center' },
  inner: { width: '100%', maxWidth: 520, alignSelf: 'center' },
  card: { backgroundColor: base.card, borderRadius: radius.card, borderWidth: 1, borderColor: base.cardLine, padding: space.l, marginBottom: space.m },
  title: { fontSize: 21, fontWeight: '800', color: base.ink, marginBottom: space.s, letterSpacing: -0.2 },
  muted: { fontSize: 13, color: base.slate, lineHeight: 18 },
  label: { fontSize: 12, fontWeight: '700', color: base.slate, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, color: base.ink, backgroundColor: base.card },
  btn: { borderWidth: 1, borderRadius: radius.button, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', marginTop: 4 },
  btnText: { fontSize: 15, fontWeight: '700' },
  notice: { borderWidth: 1, borderRadius: radius.input, padding: 10, marginBottom: space.m },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: space.s },
  box: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: base.slateLight, alignItems: 'center', justifyContent: 'center' },
});
