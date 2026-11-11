// Search, then a Filter drop-down (tick as many as you like) and a Sort drop-down, for the Finance lists: the same
// style as the Quotes list. Also the thin export bar that sits at the bottom of a page.
import { useState, type ReactNode } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui';
import { base, radius } from '@/theme/theme';

export type FilterItem = { v: string; l: string; n?: number };
export type FilterPart = { key: string; label: string; items: FilterItem[]; single?: boolean };
export type FilterSel = Record<string, string[]>;

export function FinFilterBar({ search, parts, sel, onChange, onClear, sorts, sort, onSort, more, moreOn, beside, views, view, onView }: {
  search?: { value: string; onChange: (t: string) => void; placeholder: string };
  parts: FilterPart[]; sel: FilterSel; onChange: (next: FilterSel) => void; onClear: () => void;
  sorts?: [string, string][]; sort?: string; onSort?: (k: string) => void;
  more?: ReactNode; moreOn?: boolean;
  /** A button on the Filter row: the left two-thirds, Filter the right third, the same height (+ New Project on a phone, Andy 7 Nov 2026). */
  beside?: ReactNode;
  /** A third drop-down, first on the row: how the list is shown (List, By Customer…) (Quotes, Andy 11 Nov 2026). */
  views?: [string, string][]; view?: string; onView?: (k: string) => void;
}) {
  const [menu, setMenu] = useState<'' | 'filter' | 'sort' | 'view'>('');
  const [part, setPart] = useState('');
  const [find, setFind] = useState('');
  const ticked = parts.flatMap((p) => (sel[p.key] || []).map((v) => p.items.find((i) => i.v === v)?.l || v));
  const count = ticked.length + (moreOn ? 1 : 0);
  const label = count === 0 ? 'Filter: everything' : count === 1 && ticked[0] ? `Filter: ${ticked[0]}` : `Filter (${count})`;
  const drop = (key: 'filter' | 'sort' | 'view', text: string, on: boolean) => (
    <Pressable accessibilityRole="button" accessibilityLabel={key === 'filter' ? 'Filter' : key === 'view' ? 'View' : 'Sort'} onPress={() => setMenu(menu === key ? '' : key)} style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.input, borderWidth: 1, borderColor: on || menu === key ? base.ink : base.line, backgroundColor: base.card }}>
      <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 12.5, fontWeight: '500', color: base.ink }}>{text}</Text>
      <Text style={{ fontSize: 11, color: base.slate }}>{menu === key ? '▲' : '▼'}</Text>
    </Pressable>
  );
  const option = (text: string, on: boolean, press: () => void, box: boolean) => (
    <Pressable key={text} accessibilityRole={box ? 'checkbox' : 'button'} accessibilityLabel={text} onPress={press} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: base.cardLine }}>
      <Text style={{ width: 18, fontSize: 15, color: base.ink }}>{box ? (on ? '☑' : '☐') : on ? '✓' : ''}</Text>
      <Text style={{ flex: 1, fontSize: 13.5, color: base.ink, fontWeight: on ? '500' : '400' }}>{text}</Text>
    </Pressable>
  );
  const panel = { backgroundColor: base.card, borderWidth: 1, borderColor: base.line, borderRadius: radius.input, marginBottom: 10, overflow: 'hidden' as const };
  const tick = (p: FilterPart, v: string) => {
    const cur = sel[p.key] || [];
    onChange({ ...sel, [p.key]: p.single ? (cur.includes(v) ? [] : [v]) : cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] });
  };
  return (
    <View>
      {search && <TextInput value={search.value} onChangeText={search.onChange} placeholder={search.placeholder} style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: base.card, color: base.ink, marginBottom: 10, fontSize: 16 }} />}
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
        {/* Both in plain boxes, so the split is exactly two-thirds / one-third (padding would otherwise count). */}
        {beside ? <View style={{ flex: 2, minWidth: 0 }}>{beside}</View> : null}
        {!!views?.length && drop('view', views.find(([k]) => k === view)?.[1] || 'View', false)}
        {beside ? <View style={{ flex: 1, minWidth: 0, flexDirection: 'row' }}>{drop('filter', label, count > 0)}</View> : drop('filter', label, count > 0)}
        {!!sorts?.length && drop('sort', sorts.find(([k]) => k === sort)?.[1] || 'Sort', false)}
      </View>
      {menu === 'view' && <View style={panel}>{(views || []).map(([k, l]) => option(l, view === k, () => { onView?.(k); setMenu(''); }, false))}</View>}
      {menu === 'sort' && <View style={panel}>{(sorts || []).map(([k, l]) => option(l, sort === k, () => { onSort?.(k); setMenu(''); }, false))}</View>}
      {menu === 'filter' && (
        <View style={panel}>
          {parts.filter((p) => p.items.length).map((p) => {
            const on = sel[p.key] || [];
            return (
              <View key={p.key}>
                <Pressable accessibilityRole="button" accessibilityLabel={p.label} onPress={() => { setPart(part === p.key ? '' : p.key); setFind(''); }} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 9, borderTopWidth: 1, borderTopColor: base.cardLine }}>
                  <Text style={{ fontSize: 13.5, fontWeight: '500', color: base.ink }}>{p.label}{on.length ? ` (${on.length})` : ''}</Text>
                  <Text style={{ fontSize: 11, color: base.slate }}>{part === p.key ? '▲' : '▼'}</Text>
                </Pressable>
                {part === p.key && (
                  <View style={{ backgroundColor: base.paper }}>
                    {p.items.length > 12 && <TextInput value={find} onChangeText={setFind} placeholder={`Find a ${p.label.toLowerCase()}…`} style={{ margin: 8, borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 8, backgroundColor: base.card, color: base.ink, fontSize: 16 }} />}
                    {p.items.filter((i) => !find.trim() || i.l.toLowerCase().includes(find.trim().toLowerCase())).slice(0, 60).map((i) => option(`${i.l}${i.n != null ? ` (${i.n})` : ''}`, on.includes(i.v), () => tick(p, i.v), !p.single))}
                  </View>
                )}
              </View>
            );
          })}
          {more ? <View style={{ padding: 8, borderTopWidth: 1, borderTopColor: base.cardLine }}>{more}</View> : null}
          <View style={{ flexDirection: 'row', gap: 8, padding: 8, borderTopWidth: 1, borderTopColor: base.cardLine }}>
            <View style={{ flex: 1 }}><Button small kind="ghost" title="Show everything" onPress={onClear} /></View>
            <View style={{ flex: 1 }}><Button small title="Done" onPress={() => setMenu('')} /></View>
          </View>
        </View>
      )}
    </View>
  );
}

/** Excel and PDF as links in a thin bar: goes below the page's scrolling part, as on the Quotes list. */
export function ThinExportBar({ onExcel, onPdf, busy, excelLabel = 'Export To Excel', pdfLabel = 'Export To PDF' }: { onExcel?: () => void; onPdf?: () => void; busy?: string; excelLabel?: string; pdfLabel?: string }) {
  const link = (t: string, press: () => void) => <Pressable accessibilityRole="button" onPress={press}><Text style={{ fontSize: 13, fontWeight: '500', color: base.blue }}>{t}</Text></Pressable>;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: base.card, borderTopWidth: 1, borderTopColor: base.line, paddingHorizontal: 16, paddingVertical: 9 }}>
      {onExcel ? link(busy === 'x' ? 'Making…' : excelLabel, onExcel) : <View />}
      {onPdf ? link(busy === 'p' ? 'Making…' : pdfLabel, onPdf) : <View />}
    </View>
  );
}
