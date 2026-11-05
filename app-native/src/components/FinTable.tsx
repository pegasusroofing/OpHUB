// The Finance list table on a computer (9219f grid / 9219x totals bar): underlined
// uppercase column headings, centred cells, a row per record, and the
// company-colour totals bar underneath. Phones keep the card list. Click a heading to sort A to Z, again for Z to A,
// again for off (Andy, 1 Nov 2026); `defaultSort` is the order when nothing is chosen.
// Also as the current app (cmp-fin, 5 Nov 2026): a column's typed filter can be its own test (Value ">50k"), a column can
// filter from a one-choice drop-down (Start "This month"), totals can sit under their own columns, and `colsKey` adds the
// ⚙ Columns chooser to the totals bar (saved on this device, as 9219f).
import { isValidElement, useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { plainGet, plainSet } from '@/lib/kv';
import { type FinSort, nextSort, sortRows } from '@/lib/rules/finTable';
import { base, useTheme } from '@/theme/theme';

// choices: the column filters with a tick-as-many drop-down of these words instead of a typed box. noSort: the heading doesn't sort.
// match: the typed filter's own test (e.g. ">50k" on a money column); ph: its placeholder.
// pick: a one-choice drop-down filter, each choice with its own test (e.g. date ranges); the first is "any".
// total: what the totals bar shows under this column. off: hidden until ticked in ⚙ Columns; lock: can't be hidden.
export type FinPick<T> = { v: string; l: string; test?: (r: T) => boolean };
export type FinCol<T> = {
  k: string; l: string; flex?: number; min?: number; render: (r: T) => ReactNode; sort?: (r: T) => string | number | null | undefined; choices?: string[]; noSort?: boolean;
  match?: (r: T, q: string) => boolean; ph?: string; pick?: FinPick<T>[]; total?: (shown: T[]) => ReactNode; off?: boolean; lock?: boolean;
};
export type { FinSort };

/** A ticked choice matches a cell that starts with it (after any dot or symbol), so 'Paid' isn't 'Part paid'. */
const choiceHit = (text: string, want: string) => { const t = text.replace(/^[^a-z0-9]+/, '').trim(); return t === want || t.startsWith(`${want} `); };
/** The words a cell shows, for the filter boxes. */
function nodeText(n: ReactNode): string {
  if (n == null || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(nodeText).join(' ');
  if (isValidElement(n)) { const p = n.props as { children?: ReactNode; label?: string; title?: string }; return [nodeText(p.children), p.label || '', p.title || ''].join(' '); }
  return '';
}
export function FinTable<T>({ cols: allCols, rows, keyOf, onRow, foot, onMenu, defaultSort, startFilter, tally, colsKey, footLabel, footRight, onPick }: {
  cols: FinCol<T>[]; rows: T[]; keyOf: (r: T) => string; onRow?: (r: T) => void; foot?: ReactNode | ((shown: T[]) => ReactNode); onMenu?: (r: T) => void; defaultSort?: FinSort;
  startFilter?: Record<string, string | string[]>; tally?: boolean;
  /** Turns on ⚙ Columns; the device remembers the choice under this name. */ colsKey?: string;
  /** With column totals: what sits at the left of the totals bar (e.g. "2 invoices"). */ footLabel?: (shown: T[]) => ReactNode;
  /** Extra things at the right of the totals bar (e.g. the month picker). */ footRight?: ReactNode;
  /** Told when a one-choice drop-down changes (e.g. to ask for custom dates). Return false to keep the old choice. */ onPick?: (k: string, v: string) => boolean | Promise<boolean>;
}) {
  const t = useTheme();
  // startFilter: what the column filters hold when the table opens (Projects starts on Live): words for a typed box, a list for a
  // drop-down column. Cleared like any filter.
  const [q, setQ] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(startFilter || {}).filter(([, v]) => typeof v === 'string')) as Record<string, string>);
  const [picks, setPicks] = useState<Record<string, string[]>>(() => Object.fromEntries(Object.entries(startFilter || {}).filter(([, v]) => Array.isArray(v))) as Record<string, string[]>);
  const [open, setOpen] = useState('');
  const [at, setAt] = useState({ x: 0, y: 0 }); // where the drop-down's arrow was clicked; its pop-up opens there
  const win = useWindowDimensions();
  const [sort, setSort] = useState<FinSort | null>(null);
  // ⚙ Columns: the keys shown, or null for each column's own default.
  const [chosen, setChosen] = useState<string[] | null>(null);
  useEffect(() => { if (colsKey) void plainGet<string[] | null>(`ophub.finCols.${colsKey}`, null).then((v) => setChosen(Array.isArray(v) ? v : null)); }, [colsKey]);
  const isOn = (c: FinCol<T>) => !colsKey || c.lock || (chosen ? chosen.includes(c.k) : !c.off);
  const cols = allCols.filter(isOn);
  const flip = (c: FinCol<T>) => {
    const cur = allCols.filter(isOn).map((x) => x.k), next = cur.includes(c.k) ? cur.filter((k) => k !== c.k) : [...cur, c.k];
    setChosen(next); if (colsKey) void plainSet(`ophub.finCols.${colsKey}`, next);
  };
  const isPick = (c: FinCol<T>) => !!c.pick?.length;
  const on = cols.filter((c) => !c.choices && !isPick(c) && q[c.k]?.trim()).map((c) => ({ c, raw: q[c.k].trim(), q: q[c.k].trim().toLowerCase() }));
  const onPicks = cols.filter((c) => c.choices && picks[c.k]?.length).map((c) => ({ c, want: picks[c.k].map((x) => x.toLowerCase()) }));
  const onOne = cols.filter((c) => isPick(c) && picks[c.k]?.[0]).map((c) => c.pick!.find((p) => p.v === picks[c.k][0])).filter((p): p is FinPick<T> => !!p?.test);
  const cellText = (c: FinCol<T>, r: T) => nodeText(c.render(r)).toLowerCase().replace(/\s+/g, ' ');
  const typedHit = (f: { c: FinCol<T>; raw: string; q: string }, r: T) => (f.c.match ? f.c.match(r, f.raw) : cellText(f.c, r).includes(f.q));
  const filtered = on.length || onPicks.length || onOne.length ? rows.filter((r) => on.every((f) => typedHit(f, r)) && onPicks.every((f) => f.want.some((w) => choiceHit(cellText(f.c, r), w))) && onOne.every((p) => p.test!(r))) : rows;
  const tick = (k: string, v: string) => { const cur = picks[k] || []; setPicks({ ...picks, [k]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] }); };
  const choose = async (k: string, v: string) => { setOpen(''); if (onPick && (await onPick(k, v)) === false) return; setPicks({ ...picks, [k]: v ? [v] : [] }); };
  const pickLabel = (c: FinCol<T>) => {
    if (isPick(c)) { const v = picks[c.k]?.[0]; return (v && c.pick!.find((p) => p.v === v)?.l) || c.pick![0].l; }
    const p = picks[c.k] || []; return p.length === 0 ? `${c.l}: any` : p.length === 1 ? p[0] : p.join(', ');
  };
  const openCol = open === '__cols' ? null : cols.find((c) => c.k === open && (c.choices || isPick(c)));
  const shown = sortRows(filtered, cols, sort || defaultSort || null, (c, r) => nodeText((c as FinCol<T>).render(r)));
  const footer = typeof foot === 'function' ? foot(shown) : foot;
  const hasTotals = cols.some((c) => c.total);
  const cell = (c: FinCol<T>) => ({ flex: c.flex ?? 1, minWidth: c.min ?? 80, paddingHorizontal: 6, alignItems: 'center' as const, justifyContent: 'center' as const });
  const colsBtn = colsKey ? (
    <Pressable onPress={(e) => { setAt({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY - 4 }); setOpen(open === '__cols' ? '' : '__cols'); }} accessibilityRole="button" accessibilityLabel="Columns"
      style={{ borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)', borderRadius: 7, paddingVertical: 3, paddingHorizontal: 9 }}>
      <Text style={{ color: t.brand1Text, fontSize: 12, fontWeight: '600' }}>⚙ Columns</Text>
    </Pressable>
  ) : null;
  const popAt = (w: number, up?: boolean) => ({ position: 'absolute' as const, left: Math.max(8, Math.min(at.x - w / 2, win.width - w - 20)), ...(up ? { bottom: Math.max(8, win.height - at.y + 8) } : { top: at.y + 14 }), width: w, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, overflow: 'hidden' as const, shadowColor: '#101828', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 });
  const filterBox = { width: 0, minWidth: '100%' as const, alignSelf: 'stretch' as const, height: 28, paddingHorizontal: 6, backgroundColor: '#fff', borderWidth: 1, borderRadius: 7 };
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
          {(!!foot || hasTotals) && (
            <View style={{ flexDirection: 'row', paddingBottom: 8, paddingHorizontal: 8 }}>
              {cols.map((c) => <View key={c.k} style={cell(c)}>{!!c.l && (c.choices || isPick(c)) ? (
                <Pressable onPress={(e) => { setAt({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY }); setOpen(open === c.k ? '' : c.k); }} accessibilityRole="button" accessibilityLabel={`Filter ${c.l}`} style={[filterBox, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderColor: picks[c.k]?.length ? t.brand1 : '#e5e7eb' }]}>
                  <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 11.5, fontWeight: picks[c.k]?.length ? '500' : '400', color: base.ink }}>{pickLabel(c)}</Text><Text style={{ fontSize: 9, color: base.slate }}>{open === c.k ? '▲' : '▼'}</Text>
                </Pressable>
              ) : !!c.l && <TextInput value={q[c.k] || ''} onChangeText={(v) => setQ({ ...q, [c.k]: v })} placeholder={c.ph || c.l} accessibilityLabel={`Filter ${c.l}`} placeholderTextColor={base.slateLight} style={[filterBox, { fontSize: 11.5, textAlign: 'center', color: base.ink, borderColor: c.match && q[c.k]?.trim() && !rows.some((r) => c.match!(r, q[c.k].trim())) ? '#C0392B' : '#e5e7eb' }]} />}</View>)}
              {onMenu ? <View style={{ width: 32 }} /> : null}
            </View>
          )}
          {(openCol || open === '__cols') && (
            <Modal transparent visible animationType="none" onRequestClose={() => setOpen('')}>
            <Pressable accessibilityLabel="Close" onPress={() => setOpen('')} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
            {open === '__cols' ? (
              <View style={popAt(200, true)}>
                <Text style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4, fontSize: 11.5, fontWeight: '600', color: base.slate }}>Show These Columns</Text>
                {allCols.filter((c) => !!c.l).map((c) => { const ticked = isOn(c); return (
                  <Pressable key={c.k} disabled={c.lock} accessibilityRole="checkbox" accessibilityState={{ checked: ticked, disabled: !!c.lock }} accessibilityLabel={c.l} onPress={() => flip(c)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 7, borderTopWidth: 1, borderTopColor: '#F0F1F4', opacity: c.lock ? 0.55 : 1 }}>
                    <Text style={{ width: 18, fontSize: 14, color: base.ink }}>{ticked ? '☑' : '☐'}</Text><Text style={{ fontSize: 13, color: base.ink }}>{c.l}</Text>
                  </Pressable>
                ); })}
                <Pressable onPress={() => setOpen('')} style={{ paddingHorizontal: 12, paddingVertical: 7, borderTopWidth: 1, borderTopColor: '#F0F1F4' }}><Text style={{ fontSize: 12.5, fontWeight: '500', color: t.brand1 }}>Done</Text></Pressable>
              </View>
            ) : openCol && isPick(openCol) ? (
              <View style={popAt(190)}>
                {openCol.pick!.map((p, i) => { const sel = (picks[openCol.k]?.[0] || '') === p.v; return (
                  <Pressable key={p.v || 'any'} accessibilityRole="radio" accessibilityState={{ checked: sel }} accessibilityLabel={p.l} onPress={() => void choose(openCol.k, p.v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 7, borderTopWidth: i ? 1 : 0, borderTopColor: '#F0F1F4' }}>
                    <Text style={{ width: 16, fontSize: 13, color: t.brand1 }}>{sel ? '✓' : ''}</Text><Text style={{ fontSize: 13, color: base.ink, fontWeight: sel ? '500' : '400' }}>{p.l}</Text>
                  </Pressable>
                ); })}
              </View>
            ) : openCol ? (
              <View style={popAt(180)}>
                {openCol.choices!.map((v, i) => { const ticked = (picks[openCol.k] || []).includes(v); return (
                  <Pressable key={v} accessibilityRole="checkbox" accessibilityState={{ checked: ticked }} accessibilityLabel={v} onPress={() => tick(openCol.k, v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 7, borderTopWidth: i ? 1 : 0, borderTopColor: '#F0F1F4' }}>
                    <Text style={{ width: 18, fontSize: 14, color: base.ink }}>{ticked ? '☑' : '☐'}</Text><Text style={{ fontSize: 13, color: base.ink, fontWeight: ticked ? '500' : '400' }}>{v}</Text>
                  </Pressable>
                ); })}
                <Pressable onPress={() => setOpen('')} style={{ paddingHorizontal: 12, paddingVertical: 7, borderTopWidth: 1, borderTopColor: '#F0F1F4' }}><Text style={{ fontSize: 12.5, fontWeight: '500', color: t.brand1 }}>Done</Text></Pressable>
              </View>
            ) : null}
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
          {/* Totals under their own columns (9219x): the label in the first column without a total, then each total. */}
          {hasTotals && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, backgroundColor: t.brand1, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 8 }}>
              {cols.map((c, i) => <View key={c.k} style={cell(c)}>{c.total ? <FootText bold>{c.total(shown)}</FootText> : i === cols.findIndex((x) => !x.total) && footLabel ? <FootText bold>{footLabel(shown)}</FootText> : null}</View>)}
              {onMenu ? <View style={{ width: 32 }} /> : null}
            </View>
          )}
        </View>
      </ScrollView>
      {hasTotals && (!!footRight || !!colsBtn) && <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 6 }}>{footRight}{colsKey ? <View style={{ backgroundColor: t.brand1, borderRadius: 8, padding: 2 }}>{colsBtn}</View> : null}</View>}
      {/* tally: the totals as a bar across the table, left and right, that stays in view while the list scrolls. */}
      {!hasTotals && (!!footer || !!colsBtn || !!footRight) && tally && <View style={{ position: 'sticky' as never, bottom: 10, marginTop: 10, backgroundColor: t.brand1, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>{footer}{(footRight || colsBtn) ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>{footRight}{colsBtn}</View> : null}</View>}
      {!hasTotals && (!!footer || !!colsBtn || !!footRight) && !tally && <View style={{ marginTop: 10, backgroundColor: t.brand1, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>{footer}{(footRight || colsBtn) ? <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 8 }}>{footRight}{colsBtn}</View> : null}</View>}
    </View>
  );
}

/** A plain centred table cell. */
export const Cell = ({ children, bold, tone }: { children: ReactNode; bold?: boolean; tone?: string }) => (
  <Text numberOfLines={2} style={{ fontSize: 12.5, color: tone || base.ink, textAlign: 'center', fontWeight: bold ? '600' : '400' }}>{children}</Text>
);
/** Text in the totals bar. */
export const FootText = ({ children, bold }: { children: ReactNode; bold?: boolean }) => {
  const t = useTheme();
  return <Text style={{ color: t.brand1Text, fontSize: 12.5, fontWeight: bold ? '600' : '500' }}>{children}</Text>;
};
/** A small pill on the totals bar that opens a choice (the month picker). */
export function FootPick({ label, onPress }: { label: string; onPress: (x: number, y: number) => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={(e) => onPress(e.nativeEvent.pageX, e.nativeEvent.pageY)} accessibilityRole="button" accessibilityLabel={label}
      style={{ backgroundColor: t.brand1, borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)', borderRadius: 7, paddingVertical: 3, paddingHorizontal: 10 }}>
      <Text style={{ color: t.brand1Text, fontSize: 12, fontWeight: '600' }}>{label} ▾</Text>
    </Pressable>
  );
}
/** A one-choice pop-up beside the tap (the month picker on the totals bar). */
export function FinChoicePop({ at, options, value, onPick, onClose }: { at: { x: number; y: number } | null; options: [string, string][]; value: string; onPick: (v: string) => void; onClose: () => void }) {
  const t = useTheme();
  const win = useWindowDimensions();
  if (!at) return null;
  const w = 180;
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close" onPress={onClose} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      <View style={{ position: 'absolute', left: Math.max(8, Math.min(at.x - w / 2, win.width - w - 20)), bottom: Math.max(8, win.height - at.y + 8), width: w, maxHeight: 360, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, overflow: 'hidden', shadowColor: '#101828', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 }}>
        <Pressable onPress={onClose} accessibilityLabel="Close" style={{ position: 'absolute', right: 6, top: 4, zIndex: 2, padding: 4 }}><Text style={{ fontSize: 14, color: base.slate }}>✕</Text></Pressable>
        <ScrollView>
          {options.map(([v, l], i) => { const sel = v === value; return (
            <Pressable key={v || 'all'} accessibilityRole="radio" accessibilityState={{ checked: sel }} accessibilityLabel={l} onPress={() => { onPick(v); onClose(); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 7, borderTopWidth: i ? 1 : 0, borderTopColor: '#F0F1F4' }}>
              <Text style={{ width: 16, fontSize: 13, color: t.brand1 }}>{sel ? '✓' : ''}</Text><Text style={{ fontSize: 13, color: base.ink, fontWeight: sel ? '500' : '400' }}>{l}</Text>
            </Pressable>
          ); })}
        </ScrollView>
      </View>
    </Modal>
  );
}
