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

const s = StyleSheet.create({
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
