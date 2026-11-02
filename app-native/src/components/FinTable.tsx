// The Finance list table on a computer (9219f grid / 9219x totals bar): underlined
// uppercase column headings, centred cells, a row per record, and the
// company-colour totals bar underneath. Phones keep the card list. Click a heading to sort A to Z, again for Z to A,
// again for off (Andy, 1 Nov 2026); `defaultSort` is the order when nothing is chosen.
import { isValidElement, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { type FinSort, nextSort, sortRows } from '@/lib/rules/finTable';
import { base, useTheme } from '@/theme/theme';

// choices: the column filters with a tick-as-many drop-down of these words instead of a typed box. noSort: the heading doesn't sort.
export type FinCol<T> = { k: string; l: string; flex?: number; min?: number; render: (r: T) => ReactNode; sort?: (r: T) => string | number | null | undefined; choices?: string[]; noSort?: boolean };
export type { FinSort };

/** The words a cell shows, for the filter boxes. */
function nodeText(n: ReactNode): string {
  if (n == null || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(nodeText).join(' ');
  if (isValidElement(n)) { const p = n.props as { children?: ReactNode; label?: string; title?: string }; return [nodeText(p.children), p.label || '', p.title || ''].join(' '); }
  return '';
}
export function FinTable<T>({ cols, rows, keyOf, onRow, foot, onMenu, defaultSort, startFilter, tally }: { cols: FinCol<T>[]; rows: T[]; keyOf: (r: T) => string; onRow?: (r: T) => void; foot?: ReactNode | ((shown: T[]) => ReactNode); onMenu?: (r: T) => void; defaultSort?: FinSort; startFilter?: Record<string, string | string[]>; tally?: boolean }) {
  const t = useTheme();
  // startFilter: what the column filters hold when the table opens (Projects starts on Live): words for a typed box, a list for a
  // drop-down column. Cleared like any filter.
  const [q, setQ] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(startFilter || {}).filter(([, v]) => typeof v === 'string')) as Record<string, string>);
  const [picks, setPicks] = useState<Record<string, string[]>>(() => Object.fromEntries(Object.entries(startFilter || {}).filter(([, v]) => Array.isArray(v))) as Record<string, string[]>);
  const [open, setOpen] = useState('');
  const [at, setAt] = useState({ x: 0, y: 0 }); // where the drop-down's arrow was clicked; its pop-up opens there
  const win = useWindowDimensions();
  const [sort, setSort] = useState<FinSort | null>(null);
  const on = cols.filter((c) => !c.choices && q[c.k]?.trim()).map((c) => ({ c, q: q[c.k].trim().toLowerCase() }));
  const onPicks = cols.filter((c) => c.choices && picks[c.k]?.length).map((c) => ({ c, want: picks[c.k].map((x) => x.toLowerCase()) }));
  const cellText = (c: FinCol<T>, r: T) => nodeText(c.render(r)).toLowerCase().replace(/\s+/g, ' ');
  const filtered = on.length || onPicks.length ? rows.filter((r) => on.every((f) => cellText(f.c, r).includes(f.q)) && onPicks.every((f) => f.want.some((w) => cellText(f.c, r).includes(w)))) : rows;
  const tick = (k: string, v: string) => { const cur = picks[k] || []; setPicks({ ...picks, [k]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] }); };
  const pickLabel = (c: FinCol<T>) => { const p = picks[c.k] || []; return p.length === 0 ? `${c.l}: any` : p.length === 1 ? p[0] : p.join(', '); };
  const openCol = cols.find((c) => c.k === open && c.choices);
  const shown = sortRows(filtered, cols, sort || defaultSort || null, (c, r) => nodeText((c as FinCol<T>).render(r)));
  const footer = typeof foot === 'function' ? foot(shown) : foot;
  const cell = (c: FinCol<T>) => ({ flex: c.flex ?? 1, minWidth: c.min ?? 80, paddingHorizontal: 6, alignItems: 'center' as const, justifyContent: 'center' as const });
  return (
    <View>
      <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }} showsHorizontalScrollIndicator={false}>
        <View style={{ flex: 1, minWidth: '100%' }}>
          <View style={{ flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 8 }}>
            {cols.map((c) => (
              <Pressable key={c.k} disabled={!c.l || c.noSort} onPress={() => setSort(nextSort(sort, c.k))} accessibilityRole={c.noSort ? undefined : 'button'} accessibilityLabel={c.noSort ? undefined : `Sort by ${c.l}${sort?.k === c.k ? (sort.dir === 'asc' ? ', A to Z' : ', Z to A') : ''}`} style={cell(c)}>
                <Text style={{ fontSize: 13, fontWeight: '600', letterSpacing: 0.4, color: sort?.k === c.k ? t.brand1 : base.ink, textDecorationLine: 'underline', textTransform: 'uppercase' }}>{c.l}{sort?.k === c.k ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}</Text>
              </Pressable>
            ))}
              {onMenu ? <View style={{ width: 32 }} /> : null}
          </View>
          {!!foot && (
            <View style={{ flexDirection: 'row', paddingBottom: 8, paddingHorizontal: 8 }}>
              {cols.map((c) => <View key={c.k} style={cell(c)}>{!!c.l && c.choices ? (
                <Pressable onPress={(e) => { setAt({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY }); setOpen(open === c.k ? '' : c.k); }} accessibilityRole="button" accessibilityLabel={`Filter ${c.l}`} style={{ width: 0, minWidth: '100%', alignSelf: 'stretch', height: 28, paddingHorizontal: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: '#fff', borderWidth: 1, borderColor: picks[c.k]?.length ? t.brand1 : '#e5e7eb', borderRadius: 7 }}>
                  <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 11.5, fontWeight: picks[c.k]?.length ? '500' : '400', color: base.ink }}>{pickLabel(c)}</Text><Text style={{ fontSize: 9, color: base.slate }}>{open === c.k ? '▲' : '▼'}</Text>
                </Pressable>
              ) : !!c.l && <TextInput value={q[c.k] || ''} onChangeText={(v) => setQ({ ...q, [c.k]: v })} placeholder={c.l} accessibilityLabel={`Filter ${c.l}`} placeholderTextColor={base.slateLight} style={{ width: 0, minWidth: '100%', alignSelf: 'stretch', height: 28, paddingHorizontal: 6, fontSize: 11.5, textAlign: 'center', color: base.ink, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 7 }} />}</View>)}
              {onMenu ? <View style={{ width: 32 }} /> : null}
            </View>
          )}
          {openCol && (
            <Modal transparent visible animationType="none" onRequestClose={() => setOpen('')}>
            <Pressable accessibilityLabel="Close" onPress={() => setOpen('')} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
            <View style={{ position: 'absolute', left: Math.max(8, Math.min(at.x - 90, win.width - 200)), top: at.y + 14, width: 180, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, overflow: 'hidden', shadowColor: '#101828', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 }}>
              {openCol.choices!.map((v, i) => { const on = (picks[openCol.k] || []).includes(v); return (
                <Pressable key={v} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={v} onPress={() => tick(openCol.k, v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 7, borderTopWidth: i ? 1 : 0, borderTopColor: '#F0F1F4' }}>
                  <Text style={{ width: 18, fontSize: 14, color: base.ink }}>{on ? '☑' : '☐'}</Text><Text style={{ fontSize: 13, color: base.ink, fontWeight: on ? '500' : '400' }}>{v}</Text>
                </Pressable>
              ); })}
              <Pressable onPress={() => setOpen('')} style={{ paddingHorizontal: 12, paddingVertical: 7, borderTopWidth: 1, borderTopColor: '#F0F1F4' }}><Text style={{ fontSize: 12.5, fontWeight: '500', color: t.brand1 }}>Done</Text></Pressable>
            </View>
            </Modal>
          )}
          <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
            {!shown.length && <Text style={{ padding: 14, textAlign: 'center', color: base.slate }}>Nothing matches those filters.</Text>}
            {shown.map((r, i) => (
              <Pressable key={keyOf(r)} onPress={onRow ? () => onRow(r) : undefined}
                style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingVertical: 8, paddingHorizontal: 8, borderTopWidth: i ? 1 : 0, borderTopColor: '#F0F1F4' }, pressed && { backgroundColor: '#F8F9FB' }]}>
                {cols.map((c) => <View key={c.k} style={cell(c)} testID={`col-${c.k}`}>{c.render(r)}</View>)}
                {onMenu ? <Pressable onPress={() => onMenu(r)} hitSlop={8} accessibilityLabel="More" style={{ width: 32, alignItems: 'center' }}><Text style={{ fontSize: 16, fontWeight: '600', color: base.slate }}>⋯</Text></Pressable> : null}
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
      {/* tally: the totals as a bar across the table, left and right, that stays in view while the list scrolls. */}
      {!!footer && tally && <View style={{ position: 'sticky' as never, bottom: 10, marginTop: 10, backgroundColor: t.brand1, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>{footer}</View>}
      {!!footer && !tally && <View style={{ marginTop: 10, backgroundColor: t.brand1, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>{footer}</View>}
    </View>
  );
}

/** A plain centred table cell. */
export const Cell = ({ children, bold, tone }: { children: ReactNode; bold?: boolean; tone?: string }) => (
  <Text numberOfLines={2} style={[bold ? { fontWeight: '600' as const } : {}, { fontSize: 12.5, color: tone || base.ink, textAlign: 'center', fontWeight: bold ? '500' : '400' }]}>{children}</Text>
);
/** Text in the totals bar. */
export const FootText = ({ children, bold }: { children: ReactNode; bold?: boolean }) => {
  const t = useTheme();
  return <Text style={{ color: t.brand1Text, fontSize: 12.5, fontWeight: bold ? '600' : '500' }}>{children}</Text>;
};
