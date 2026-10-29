// Basic building blocks matching the current app's look (src/css/app.css): cards
// with a soft shadow, small uppercase Sora section titles, outlined uppercase
// buttons, home tiles as a grid of boxes (TileGrid) with line icons in tinted squares.
import { createContext, useContext, type ReactNode } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type TextInputProps, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OphIcon } from '@/components/OphIcon';
import { heading } from '@/lib/fonts';

import { base, isDesk, radius, space, useTheme } from '@/theme/theme';

export function Screen({ children, center }: { children: ReactNode; center?: boolean }) {
  return (
    <SafeAreaView style={s.screen} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={[s.scroll, isDesk() && { paddingHorizontal: 40, paddingTop: 26, paddingBottom: 40 }, center && s.center]} keyboardShouldPersistTaps="handled">
        <View style={[s.inner, isDesk() && { maxWidth: '100%' }]}>{children}</View>
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
        primary ? { backgroundColor: base.card, borderColor: t.brand1, borderWidth: 2.5 } : { backgroundColor: base.card, borderColor: base.line },
        (pressed || busy || disabled) && { opacity: 0.7 },
      ]}>
      {busy && <ActivityIndicator color={primary ? t.brand1 : base.ink} style={{ marginRight: 8 }} />}
      <Text style={[s.btnText, { color: primary ? t.brand1 : base.ink }]}>{title}</Text>
    </Pressable>
  );
}

/** The .filterrow tabs: equal-width boxes, the chosen one outlined in the company colour.
 *  seg = the grey sliding bar used on Schedule of Works (.sowpage .filterrow). */
export function FilterRow<K extends string>({ options, value, onChange, seg }: { options: [K, string][]; value: K; onChange: (k: K) => void; seg?: boolean }) {
  const t = useTheme();
  return (
    <View style={[{ flexDirection: 'row', gap: seg ? 4 : 8, marginBottom: 12 }, seg && { backgroundColor: '#ECEDF0', borderRadius: 14, padding: 4 }]}>
      {options.map(([k, l]) => {
        const on = k === value;
        return (
          <Pressable key={k} onPress={() => onChange(k)} accessibilityRole="tab" accessibilityState={{ selected: on }}
            style={[{ flex: 1, minWidth: 0, minHeight: 34, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, paddingVertical: seg ? 6 : 8 },
              seg ? [{ borderRadius: 10 }, on && { backgroundColor: '#fff', ...shadowSm }]
                : { borderRadius: 8, backgroundColor: '#fff', borderWidth: on ? 2 : 1.5, borderColor: on ? t.brand1 : base.line }]}>
            <Text numberOfLines={2} style={{ textAlign: 'center', fontSize: 12, fontWeight: seg ? '700' : '800', letterSpacing: seg ? 0 : 0.4, textTransform: seg ? 'none' : 'uppercase', color: on ? (seg ? base.ink : t.brand1) : base.slate }}>{l}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
const shadowSm = { shadowColor: '#14161C', shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 } as const;

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

// Tiles laid out as a grid of boxes (the current app's .pmtiles / .tilegrid): 2 across on a
// phone, more on a wide screen. Outside a TileGrid a Tile is a full-width row.
const GridCtx = createContext<number>(0);
export function TileGrid({ children, cols = 2 }: { children: ReactNode; cols?: number }) {
  return <GridCtx.Provider value={cols}><View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 }}>{children}</View></GridCtx.Provider>;
}
// The tint behind a line icon, and the icon colour that goes with it (.pmtint-*).
export const TINTS = {
  blue: ['#EEF3FD', '#2457C5'], orange: ['#FDF1E6', '#B35A00'], green: ['#EAF6EF', '#17804A'], purple: ['#F3EEFA', '#6B3FA8'], grey: ['#F1F2F4', '#1E2124'], teal: ['#E7F5F5', '#0E7F7C'], red: ['#FDECEA', '#C8102E'],
} as const;

// Home tile: coloured icon square (a line icon via ic, else the emoji) + title + subtitle.
export function Tile({ icon, ic, tint, fg, title, sub, onPress, badge, onMenu, dim }: { icon?: string; ic?: string; tint: string; fg?: string; title: string; sub: string; onPress: () => void; badge?: number; onMenu?: () => void; dim?: boolean }) {
  const cols = useContext(GridCtx);
  if (cols) return (
    <View style={{ width: `${100 / cols}%`, padding: 5 }}>
      <Pressable onPress={onPress} style={({ pressed }) => [s.tbox, dim && { backgroundColor: '#F3F3F1' }, pressed && { opacity: 0.7 }]} accessibilityRole="button">
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <View style={[s.boxIc, { backgroundColor: tint }, dim && { opacity: 0.45 }]}>
            {ic ? <OphIcon name={ic} size={19} color={fg || base.ink} /> : <Text style={{ fontSize: 18 }}>{icon}</Text>}
            {!!badge && <Text style={s.badge}>{badge}</Text>}
          </View>
          <View style={{ flex: 1 }} />
          {onMenu && <Pressable onPress={onMenu} hitSlop={10} accessibilityLabel={`Who sees ${title}`}><Text style={{ fontSize: 18, color: base.slate, paddingHorizontal: 2 }}>⋮</Text></Pressable>}
        </View>
        <View style={dim ? { opacity: 0.45 } : undefined}>
          <Text style={s.boxT} numberOfLines={2}>{title}</Text>
          {!!sub && <Text style={s.boxS} numberOfLines={1}>{sub}</Text>}
        </View>
      </Pressable>
    </View>
  );
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.tile, dim && { opacity: 0.55 }, pressed && { opacity: 0.7 }]} accessibilityRole="button">
      <View style={[s.tileIc, { backgroundColor: tint }]}>
        {ic ? <OphIcon name={ic} size={20} color={fg || base.ink} /> : <Text style={{ fontSize: 20 }}>{icon}</Text>}
        {!!badge && <Text style={s.badge}>{badge}</Text>}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.rowTitle}>{title}</Text>
        <Text style={s.rowSub}>{sub}</Text>
      </View>
      {onMenu && <Pressable onPress={onMenu} hitSlop={10} accessibilityLabel={`Who sees ${title}`}><Text style={{ fontSize: 18, color: base.slate, paddingHorizontal: 4 }}>⋮</Text></Pressable>}
    </Pressable>
  );
}

// --shadow-card in app.css.
const shadow = { shadowColor: '#14181D', shadowOpacity: 0.07, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 1 } as const;

const s = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 13, marginBottom: space.s },
  rowTitle: { fontSize: 14, fontWeight: '700', color: base.ink },
  rowSub: { fontSize: 12, color: base.slate, marginTop: 2 },
  section: { ...heading(700), fontSize: 11, letterSpacing: 0.9, textTransform: 'uppercase', color: base.slate, marginTop: 14, marginBottom: 10 },
  empty: { color: base.slateLight, textAlign: 'center', paddingVertical: 26, paddingHorizontal: 10, fontSize: 13 },
  stat: { flex: 1, backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: 16, paddingVertical: 11, paddingHorizontal: 10 },
  statN: { ...heading(800), fontSize: 21, color: base.ink, lineHeight: 24 },
  statL: { fontSize: 10.5, color: base.slate, fontWeight: '600' },
  tile: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.tile, padding: 14, marginBottom: space.s, ...shadow },
  tileIc: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  tbox: { backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: 18, padding: 13.5, height: 112, justifyContent: 'space-between', ...shadow },
  boxIc: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  boxT: { fontSize: 13, fontWeight: '800', color: base.ink },
  boxS: { fontSize: 10.5, color: base.slate, fontWeight: '500', marginTop: 2 },
  badge: { position: 'absolute', top: -6, right: -6, backgroundColor: base.red, color: '#fff', fontSize: 11, fontWeight: '800', borderRadius: 9, minWidth: 18, textAlign: 'center', paddingHorizontal: 4, overflow: 'hidden' },
  screen: { flex: 1, backgroundColor: base.paper },
  scroll: { flexGrow: 1, padding: space.l },
  center: { justifyContent: 'center' },
  inner: { width: '100%', maxWidth: 520, alignSelf: 'center' },
  card: { backgroundColor: base.card, borderRadius: radius.card, borderWidth: 1, borderColor: base.cardLine, padding: 14, marginBottom: space.m, ...shadow },
  title: { ...heading(800), fontSize: 21, color: base.ink, marginBottom: space.s, letterSpacing: -0.2 },
  muted: { fontSize: 13, color: base.slate, lineHeight: 18 },
  label: { fontSize: 12, fontWeight: '700', color: base.slate, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, color: base.ink, backgroundColor: base.card },
  btn: { borderWidth: 1, borderRadius: radius.button, paddingVertical: 10, paddingHorizontal: 8, minHeight: 40, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', marginTop: 4 },
  btnText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.3, textTransform: 'uppercase', textAlign: 'center' },
  notice: { borderWidth: 1, borderRadius: radius.input, padding: 10, marginBottom: space.m },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: space.s },
  box: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: base.slateLight, alignItems: 'center', justifyContent: 'center' },
});
