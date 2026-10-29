// A date you pick from a calendar (Andy: every date is a clickable calendar). The value is kept as
// YYYY-MM-DD and shown as 29 Oct 2026. `min` stops earlier days being picked (e.g. today onwards).
import { useEffect, useState, type ComponentProps } from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Popup } from '@/components/Popup';
import { base, radius } from '@/theme/theme';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n: number) => String(n).padStart(2, '0');
export const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayIso = () => isoOf(new Date());
const parse = (v?: string | null) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v || ''); return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null; };
export const showDate = (v?: string | null) => { const d = parse(v); return d ? `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}` : ''; };

export function CalendarPopup({ value, min, max, title = 'Choose a date', onPick, onClose, clearable }: {
  value?: string | null; min?: string; max?: string; title?: string; clearable?: boolean;
  onPick: (iso: string) => void; onClose: () => void;
}) {
  const start = parse(value) || parse(min) || new Date();
  const [ym, setYm] = useState({ y: start.getFullYear(), m: start.getMonth() });
  const first = new Date(ym.y, ym.m, 1), days = new Date(ym.y, ym.m + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // weeks start on Monday
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const today = todayIso();
  const step = (n: number) => setYm(({ y, m }) => { const d = new Date(y, m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const nav = (label: string, n: number) => (
    <Pressable accessibilityRole="button" accessibilityLabel={n < 0 ? 'Previous month' : 'Next month'} onPress={() => step(n)} hitSlop={6} style={{ paddingHorizontal: 12, paddingVertical: 4 }}>
      <Text style={{ fontSize: 18, fontWeight: '800', color: base.blue }}>{label}</Text>
    </Pressable>
  );
  return (
    <Popup title={title} onClose={onClose} width={330}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
        {nav('‹', -1)}
        <Text style={{ flex: 1, textAlign: 'center', fontWeight: '800', color: base.ink, fontSize: 15 }}>{MONTHS[ym.m]} {ym.y}</Text>
        {nav('›', 1)}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => <Text key={d} style={{ width: '14.28%', textAlign: 'center', color: base.slate, fontSize: 12, fontWeight: '700', paddingVertical: 4 }}>{d}</Text>)}
        {cells.map((n, i) => {
          if (!n) return <View key={i} style={{ width: '14.28%', height: 38 }} />;
          const iso = `${ym.y}-${pad(ym.m + 1)}-${pad(n)}`;
          const off = (!!min && iso < min) || (!!max && iso > max);
          const on = iso === value, isToday = iso === today;
          return (
            <Pressable key={i} disabled={off} accessibilityRole="button" accessibilityLabel={showDate(iso)} onPress={() => onPick(iso)} style={{ width: '14.28%', height: 38, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? base.blue : 'transparent', borderWidth: isToday && !on ? 1.5 : 0, borderColor: base.blue }}>
                <Text style={{ color: on ? '#fff' : off ? '#C4C8CE' : base.ink, fontWeight: on || isToday ? '800' : '500' }}>{n}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
        {!min || today >= min ? <Pressable onPress={() => onPick(today)}><Text style={{ color: base.blue, fontWeight: '700' }}>Today</Text></Pressable> : <View />}
        {clearable && <Pressable onPress={() => onPick('')}><Text style={{ color: base.slate, fontWeight: '700' }}>Clear</Text></Pressable>}
      </View>
    </Popup>
  );
}

// The box you tap. Looks like a text box, opens the calendar.
export function DateBox({ value, onChange, min, max, placeholder = 'Choose a date', clearable = true, style, disabled, title }: {
  value?: string | null; onChange: (iso: string) => void; min?: string; max?: string; placeholder?: string; clearable?: boolean;
  style?: StyleProp<ViewStyle>; disabled?: boolean; title?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={title || placeholder} disabled={disabled} onPress={() => setOpen(true)}
        style={[{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: base.line, borderRadius: radius.input, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: base.card, opacity: disabled ? 0.6 : 1 }, style]}>
        <Text style={{ flex: 1, fontSize: 15, color: value ? base.ink : base.slateLight }}>{value ? showDate(value) : placeholder}</Text>
        <Text style={{ fontSize: 15 }}>📅</Text>
      </Pressable>
      {open && <CalendarPopup value={value} min={min} max={max} title={title} clearable={clearable} onClose={() => setOpen(false)} onPick={(iso) => { setOpen(false); onChange(iso); }} />}
    </>
  );
}

// With a label, laid out like ui Field.
export function DateField({ label, ...p }: ComponentProps<typeof DateBox> & { label: string }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: base.slate, marginBottom: 4 }}>{label}</Text>
      <DateBox title={label} {...p} />
    </View>
  );
}

// A calendar you can wait on (e.g. "Required by" while importing). Resolves '' for no date, null if closed.
type AskReq = { title: string; min?: string; resolve: (v: string | null) => void };
const askListeners = new Set<(r: AskReq) => void>();
export function askDate(title: string, opts: { min?: string } = {}): Promise<string | null> {
  return new Promise((resolve) => { askListeners.forEach((l) => l({ title, min: opts.min, resolve })); });
}
export function DateAskHost() {
  const [req, setReq] = useState<AskReq | null>(null);
  useEffect(() => { const l = (r: AskReq) => setReq(r); askListeners.add(l); return () => { askListeners.delete(l); }; }, []);
  if (!req) return null;
  return <CalendarPopup title={req.title} min={req.min} clearable onClose={() => { req.resolve(null); setReq(null); }} onPick={(iso) => { req.resolve(iso); setReq(null); }} />;
}
