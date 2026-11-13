// The table rows used across the app on a phone (Andy, 11 Nov 2026: "table row style as the rest of the app"): a grey
// header row, then one row per item, every row the same height. Columns have a width, or one stretches; a column can
// show a second smaller line.
// Like the laptop table (Andy, 14 Nov 2026, from Quotes): tap a heading to sort (A to Z, Z to A, off; ▲ ▼ shows which),
// and a small search box under each heading, its writing lined up with the heading. A column can have a ▾ choice
// instead of a box (a status), which can start on one choice (Owed, To Pay…). The Filter / Sort buttons and the search
// bar above went. usePhoneFind, PhoneHeads and PhoneFindRow are the same pieces for a screen that draws its own rows.
import { isValidElement, useState, type ReactNode } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { chooseAction } from '@/components/toast';
import { nextSort, sortRows, type FinSort } from '@/lib/rules/finTable';
import { base } from '@/theme/theme';

/** A ▾ choice under a heading: [value, label] (the '' value is "everything"), the test for each, and where it starts. */
export type PChoose<T> = { opts: [string, string][]; test: (r: T, v: string) => boolean; start?: string };
// k: the column's key (the heading if not given). center: the column's writing is centred. sort: what it sorts by (else
// the words shown). find: the words its search box looks through (else what's shown, both lines). match: the box's own
// test (Value ">50k"). ph: the box's grey word (else the heading). choose: a ▾ choice instead of a box. noFind: no box.
// bigFirst: the first tap sorts biggest first (money; Andy, 7 Nov 2026), then smallest, then off.
export type PCol<T> = {
  k?: string; l: string; w?: number; right?: boolean; center?: boolean; main: (r: T) => ReactNode; sub?: (r: T) => ReactNode; tone?: (r: T) => string | undefined; bold?: boolean;
  sort?: (r: T) => string | number | null | undefined; noSort?: boolean; find?: (r: T) => string; match?: (r: T, q: string) => boolean; ph?: string; choose?: PChoose<T>; noFind?: boolean; bigFirst?: boolean;
};

const keyOfCol = <T,>(c: PCol<T>) => c.k || c.l;
const alignOf = <T,>(c: PCol<T>): 'left' | 'center' | 'right' => (c.right ? 'right' : c.center ? 'center' : 'left');
const boxOf = <T,>(c: PCol<T>) => (c.w ? { width: c.w } : { flex: 1, minWidth: 0 });
/** The words in a cell, for searching and sorting. */
export function plainText(n: ReactNode): string {
  if (n == null || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(plainText).join(' ');
  if (isValidElement(n)) return plainText((n.props as { children?: ReactNode }).children);
  return '';
}

export type PhoneFind<T> = {
  shown: T[]; q: Record<string, string>; setQ: (q: Record<string, string>) => void; pick: Record<string, string>; setPick: (p: Record<string, string>) => void;
  sort: FinSort | null; setSort: (s: FinSort | null) => void; searching: boolean; clear: () => void;
};
/** The searching and sorting for a phone table: the rows left once the boxes and ▾ choices are applied, in the order
 *  chosen. on = false: no searching (a laptop showing the same table under its own filter bar); headings still sort. */
export function usePhoneFind<T>(cols: PCol<T>[], rows: T[], on = true): PhoneFind<T> {
  const starts = () => Object.fromEntries(cols.filter((c) => c.choose?.start).map((c) => [keyOfCol(c), c.choose?.start as string]));
  const [q, setQ] = useState<Record<string, string>>({});
  const [pick, setPick] = useState<Record<string, string>>(starts);
  const [sort, setSort] = useState<FinSort | null>(null);
  const words = (c: PCol<T>, r: T) => (c.find ? c.find(r) : `${plainText(c.main(r))} ${c.sub ? plainText(c.sub(r)) : ''}`).toLowerCase();
  const typed = on ? cols.filter((c) => !c.choose && !c.noFind && (q[keyOfCol(c)] || '').trim()).map((c) => ({ c, raw: (q[keyOfCol(c)] || '').trim() })) : [];
  const chosen = on ? cols.filter((c) => c.choose && pick[keyOfCol(c)]) : [];
  let shown = typed.length || chosen.length ? rows.filter((r) => typed.every(({ c, raw }) => (c.match ? c.match(r, raw) : words(c, r).includes(raw.toLowerCase()))) && chosen.every((c) => c.choose?.test(r, pick[keyOfCol(c)]))) : rows;
  const sc = sort ? cols.find((c) => keyOfCol(c) === sort.k) : undefined;
  if (sc && sort) shown = sortRows(shown, [{ k: sort.k, sort: sc.sort || ((r: T) => plainText(sc.main(r))) }], sort, () => '');
  const st = starts();
  const searching = typed.length > 0 || cols.some((c) => c.choose && (pick[keyOfCol(c)] || '') !== (st[keyOfCol(c)] || ''));
  return { shown, q, setQ, pick, setPick, sort, setSort, searching, clear: () => { setQ({}); setPick(st); } };
}

/** The heading row: tap to sort. */
export function PhoneHeads<T>({ cols, find, pad = 10 }: { cols: PCol<T>[]; find: PhoneFind<T>; pad?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 9, paddingBottom: 6, paddingHorizontal: pad, backgroundColor: '#F6F7F9' }}>
      {cols.map((c) => {
        const k = keyOfCol(c), on = find.sort?.k === k, can = !c.noSort;
        return (
          <Pressable key={k} disabled={!can} accessibilityRole={can ? 'button' : undefined} accessibilityLabel={can ? `Sort by ${c.l}` : undefined} onPress={() => find.setSort(c.bigFirst ? (find.sort?.k !== k ? { k, dir: 'desc' } : find.sort.dir === 'desc' ? { k, dir: 'asc' } : null) : nextSort(find.sort, k))} style={boxOf(c)}>
            <Text numberOfLines={1} style={{ textAlign: alignOf(c), fontSize: 10.5, fontWeight: '700', color: on ? base.ink : base.slate, letterSpacing: 0.3, textDecorationLine: can ? 'underline' : 'none' }}>{c.l.toUpperCase()}{on ? (find.sort?.dir === 'asc' ? ' ▲' : ' ▼') : ''}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The search row: a small box (or ▾ choice) under each heading, its writing lined up with the heading as on Quotes. The
 *  first column's box starts its border and padding left of the heading; other left / right ones a little (they keep a
 *  small gap to the box beside them); centred ones are centred. 25px high, 12px writing (data-compact in lib/webShell). */
export function PhoneFindRow<T>({ cols, find, pad = 10 }: { cols: PCol<T>[]; find: PhoneFind<T>; pad?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 6.5, paddingHorizontal: pad, backgroundColor: '#F6F7F9' }}>
      {cols.map((c, i) => {
        const k = keyOfCol(c), a = alignOf(c);
        const pos = a === 'left' ? (i === 0 ? { marginLeft: -6, paddingLeft: 5, paddingRight: 5 } : { marginLeft: -4, paddingLeft: 3, paddingRight: 3 })
          : a === 'right' ? (i === cols.length - 1 ? { marginRight: -6, paddingRight: 5, paddingLeft: 5 } : { marginRight: -4, paddingRight: 3, paddingLeft: 3 }) : { paddingHorizontal: 3 };
        const frame = { height: 25, borderWidth: 1, borderRadius: 6, backgroundColor: '#fff' };
        if (c.noFind) return <View key={k} style={boxOf(c)} />;
        if (c.choose) {
          const ch = c.choose, v = find.pick[k] || '', label = ch.opts.find(([x]) => x === v)?.[1] || 'All';
          return (
            <Pressable key={k} accessibilityRole="button" accessibilityLabel={`Search ${c.l}`} onPress={async () => {
              const got = await chooseAction(c.l, ch.opts.map(([x, l]) => ({ key: x || '*', label: `${x === v ? '✓ ' : ''}${l}` })));
              if (got) find.setPick({ ...find.pick, [k]: got === '*' ? '' : got });
            }} style={[boxOf(c), frame, pos, { borderColor: v ? base.ink : base.line, justifyContent: 'center', alignItems: a === 'left' ? 'flex-start' : a === 'right' ? 'flex-end' : 'center' }]}>
              <Text numberOfLines={1} style={{ fontSize: 10, color: v ? base.ink : '#9AA1AB' }}>{label} ▾</Text>
            </Pressable>
          );
        }
        return (
          <TextInput key={k} value={find.q[k] || ''} onChangeText={(t) => find.setQ({ ...find.q, [k]: t })} placeholder={c.ph || c.l} accessibilityLabel={`Search ${c.l}`} placeholderTextColor="#9AA1AB" autoCapitalize="none" autoCorrect={false}
            {...({ dataSet: { compact: '1' } } as object)}
            style={[boxOf(c), frame, pos, { paddingVertical: 0, borderColor: (find.q[k] || '').trim() ? base.ink : base.line, fontSize: 12, color: base.ink, textAlign: a }]} />
        );
      })}
    </View>
  );
}

/** ✕ to empty every box and put the ▾ choices back to where they started. */
export function PhoneClear<T>({ find }: { find: PhoneFind<T> }) {
  if (!find.searching) return null;
  return <Pressable accessibilityRole="button" accessibilityLabel="Clear the column searches" onPress={find.clear} style={{ alignSelf: 'center', paddingVertical: 8 }}><Text style={{ fontSize: 13, fontWeight: '600', color: base.ink }}>✕ Clear The Column Searches</Text></Pressable>;
}

// search: the heading sort and the search row (on unless turned off, e.g. a laptop with its own filter bar). find: the
// screen's own usePhoneFind, when it needs the rows left (for a total).
export function PhoneTable<T>({ cols, rows, keyOf, onRow, foot, label = 'Table', search = true, find: given }: { cols: PCol<T>[]; rows: T[]; keyOf: (r: T) => string; onRow?: (r: T) => void; foot?: ReactNode; label?: string; search?: boolean; find?: PhoneFind<T> }) {
  const own = usePhoneFind(cols, rows, search);
  const find = given || own;
  const box = boxOf;
  return (
    <>
      <View accessibilityLabel={label} style={{ backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: 12, overflow: 'hidden', marginBottom: find.searching ? 0 : 10 }}>
        {search ? <><PhoneHeads cols={cols} find={find} /><PhoneFindRow cols={cols} find={find} /></> : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 10, backgroundColor: '#F6F7F9' }}>
            {cols.map((c) => <Text key={keyOfCol(c)} numberOfLines={1} style={{ ...box(c), fontSize: 10.5, fontWeight: '700', color: base.slate, letterSpacing: 0.3, textAlign: alignOf(c) }}>{c.l.toUpperCase()}</Text>)}
          </View>
        )}
        {!find.shown.length && <Text style={{ padding: 14, textAlign: 'center', color: base.slate, borderTopWidth: 1, borderTopColor: '#EEF0F2' }}>Nothing matches.</Text>}
        {find.shown.map((r) => (
          <Pressable key={keyOf(r)} disabled={!onRow} accessibilityRole={onRow ? 'button' : undefined} onPress={() => onRow?.(r)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 50, paddingVertical: 7, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: '#EEF0F2' }}>
            {cols.map((c, i) => (
              <View key={keyOfCol(c)} style={{ ...box(c), alignItems: c.right ? 'flex-end' : c.center ? 'center' : 'flex-start' }}>
                <Text numberOfLines={1} style={{ fontSize: i === 0 ? 13 : 12, fontWeight: i === 0 || c.bold ? '600' : '500', color: c.tone?.(r) || base.ink }}>{c.main(r)}</Text>
                {c.sub ? <Text numberOfLines={1} style={{ fontSize: 10.5, color: base.slate, marginTop: 1 }}>{c.sub(r)}</Text> : null}
              </View>
            ))}
          </Pressable>
        ))}
        {foot}
      </View>
      {search && <PhoneClear find={find} />}
    </>
  );
}
