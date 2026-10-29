// The month view (780 calMonthGridHtml): Mon–Sun grid, ‹ month › and Today, each
// day showing its items as short coloured labels (2 on a phone; up to 5 on a
// computer, with the project's name under each on the all-projects calendar).
// Tap a day to pick it. Plus the "Month view  [View ▾]" menu (calToolsHtml).
import { Pressable, Text, View } from 'react-native';

import { chooseAction } from '@/components/toast';
import { heading } from '@/lib/fonts';
import { monthGrid } from '@/lib/rules/calendar';
import { base, useDesk, useTheme } from '@/theme/theme';

export type GridItem = { id: string; title: string; colour: string; site?: string };
const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function MonthGrid({ year, month, sel, today, items, onSelect, onShift, onToday }: {
  year: number; month: number; sel: string; today: string; items: Record<string, GridItem[]>;
  onSelect: (ds: string) => void; onShift: (n: number) => void; onToday: () => void;
}) {
  const t = useTheme();
  const desk = useDesk();
  const grid = monthGrid(year, month);
  const max = desk ? 5 : 2;
  const navBtn = (n: number, label: string) => (
    <Pressable onPress={() => onShift(n)} accessibilityLabel={n < 0 ? 'Previous month' : 'Next month'}
      style={{ width: desk ? 42 : 36, height: desk ? 42 : 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: desk ? 1 : 0, borderColor: '#ECEEF2' }}>
      <Text style={{ fontSize: desk ? 26 : 24, lineHeight: desk ? 28 : 26, color: t.brand1 }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#ECEEF2', borderRadius: desk ? 20 : 18, paddingTop: desk ? 18 : 12, paddingHorizontal: desk ? 18 : 10, paddingBottom: desk ? 14 : 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        {navBtn(-1, '‹')}
        <Text style={[heading(800), { flex: 1, fontSize: desk ? 24 : 18, color: base.ink, letterSpacing: -0.2 }]}>{new Date(year, month, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</Text>
        <Pressable onPress={onToday} style={{ paddingVertical: desk ? 9 : 6, paddingHorizontal: desk ? 14 : 8, borderRadius: 12, borderWidth: desk ? 1 : 0, borderColor: '#ECEEF2' }}>
          <Text style={{ fontSize: desk ? 14 : 12.5, fontWeight: '700', color: t.brand1 }}>Today</Text>
        </Pressable>
        {navBtn(1, '›')}
      </View>
      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#F0F1F4', paddingVertical: desk ? 10 : 0, paddingBottom: 6 }}>
        {WEEK.map((w) => <Text key={w} style={{ flex: 1, textAlign: 'center', fontSize: desk ? 12.5 : 11, fontWeight: '700', color: base.slate, letterSpacing: desk ? 0.7 : 0, textTransform: desk ? 'uppercase' : 'none' }}>{desk ? w : w[0]}</Text>)}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', borderLeftWidth: desk ? 1 : 0, borderLeftColor: '#F0F1F4', paddingTop: desk ? 0 : 4 }}>
        {grid.map((ds) => {
          const d = new Date(`${ds}T00:00:00`);
          const out = d.getMonth() !== month, isToday = ds === today, isSel = ds === sel;
          const evs = items[ds] ?? [];
          return (
            <Pressable key={ds} onPress={() => onSelect(ds)} accessibilityLabel={`${d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}${evs.length ? `, ${evs.length} item${evs.length === 1 ? '' : 's'}` : ''}`}
              style={[{ width: `${100 / 7}%`, gap: desk ? 4 : 3 },
                desk ? { minHeight: 128, padding: 6, paddingBottom: 8, borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#F0F1F4', backgroundColor: out ? '#FAFBFC' : '#fff' }
                  : { minHeight: 48, alignItems: 'center', paddingTop: 4, paddingBottom: 4, borderRadius: 10, backgroundColor: evs.length ? '#F6F8FD' : 'transparent' },
                desk && isSel && { borderWidth: 2, borderColor: base.ink }]}>
              <View style={{ width: desk ? 30 : 32, height: desk ? 30 : 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
                backgroundColor: isSel ? (isToday ? t.brand1 : desk ? 'transparent' : base.ink) : 'transparent' }}>
                <Text style={{ fontSize: desk ? 15 : 16, fontWeight: isToday || isSel ? '800' : '600',
                  color: isSel && (isToday || !desk) ? (isToday ? t.brand1Text : '#fff') : out ? '#B4B8C2' : isToday ? t.brand1 : base.ink }}>{d.getDate()}</Text>
              </View>
              {evs.length > 0 && (
                <View style={{ width: '100%', gap: desk ? 3 : 2, paddingHorizontal: desk ? 0 : 2, opacity: out ? 0.5 : 1 }}>
                  {evs.slice(0, max).map((e) => (
                    <View key={e.id} style={{ backgroundColor: e.colour, borderRadius: desk ? 6 : 4, paddingVertical: desk ? 4 : 1, paddingHorizontal: desk ? 7 : 3 }}>
                      <Text numberOfLines={1} style={{ color: '#fff', fontSize: desk ? 12 : 8.5, fontWeight: '700' }}>{e.title.replace(/^.*? off \(/, 'Off (')}</Text>
                      {desk && !!e.site && <Text numberOfLines={1} style={{ color: '#fff', opacity: 0.88, fontSize: 10.5, fontWeight: '600' }}>{e.site}</Text>}
                    </View>
                  ))}
                  {evs.length > max && <Text style={{ fontSize: desk ? 11.5 : 8, fontWeight: '700', color: base.slate, textAlign: desk ? 'left' : 'center', paddingLeft: desk ? 4 : 0 }}>+{evs.length - max} more</Text>}
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export type CalView = 'week' | 'twoweek' | 'month';
const VIEW_LABEL: Record<CalView, string> = { week: 'Week', twoweek: '2 Weeks', month: 'Month' };

/** "Month view  [View ▾]": the view choice, plus any extra actions first (e.g. Add a key date). */
export function CalTools({ view, onView, label = 'View', extra = [] }: { view: CalView; onView: (v: CalView) => void; label?: string; extra?: { key: string; label: string; run: () => void }[] }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: base.slate }}>{VIEW_LABEL[view]} view</Text>
      <Pressable onPress={async () => {
        const k = await chooseAction(label, [...extra.map((x) => ({ key: x.key, label: x.label })),
          ...(['week', 'twoweek', 'month'] as CalView[]).map((v) => ({ key: `v:${v}`, label: `${view === v ? '✓ ' : ''}${VIEW_LABEL[v]}` }))]);
        if (!k) return;
        if (k.startsWith('v:')) onView(k.slice(2) as CalView); else extra.find((x) => x.key === k)?.run();
      }} style={{ backgroundColor: t.brand1, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 14 }}>
        <Text style={{ color: t.brand1Text, fontSize: 13, fontWeight: '800' }}>{label} ▾</Text>
      </Pressable>
    </View>
  );
}
