// Finding a rate in a contract's schedule (NHF or the client's own; Andy, 7 Nov 2026): Category ▾ (the sheet, e.g.
// Pitched Roofing), Item ▾ (the heading it sits under, e.g. Concrete Plain Tiles) and free text over the code, title and
// wording. Used on the quote (tap to add) and on the Schedule Of Rates page (tap to change).
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { chooseAction } from '@/components/toast';
import { Muted } from '@/components/ui';
import { rateTitle, rateWording, type Rate } from '@/lib/rules/repairQuote';
import { base, radius } from '@/theme/theme';

const gbp = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, paddingHorizontal: 10, paddingVertical: 9, color: base.ink, backgroundColor: base.card, fontSize: 15 } as const;
const uniq = (xs: (string | null | undefined)[]) => Array.from(new Set(xs.filter((x): x is string => !!x)));

/** always: show the list before anything is chosen (the Schedule Of Rates page); else only once searching (the quote). */
export function RateFinder({ rates, onPick, action = '＋', always = false, limit = 40 }: { rates: Rate[]; onPick: (r: Rate) => void; action?: string; always?: boolean; limit?: number }) {
  const [cat, setCat] = useState('');
  const [sec, setSec] = useState('');
  const [find, setFind] = useState('');
  const cats = uniq(rates.map((r) => r.category));
  const inCat = cat ? rates.filter((r) => r.category === cat) : rates;
  const secs = uniq(inCat.map((r) => r.section));
  const words = find.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const list = inCat.filter((r) => (!sec || r.section === sec) && (!words.length || words.every((w) => `${r.code || ''} ${r.title || ''} ${r.description} ${r.section || ''}`.toLowerCase().includes(w))));
  const searching = !!(cat || sec || words.length);
  const shown = searching || always ? list.slice(0, limit) : [];
  const pill = (label: string, value: string, opts: string[], set: (v: string) => void, all: string) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={async () => { const k = await chooseAction(label, [{ key: '__all', label: all }, ...opts.map((o) => ({ key: o, label: o }))]); if (k) set(k === '__all' ? '' : k); }}
      style={[box, { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
      <Text numberOfLines={1} style={{ flex: 1, color: value ? base.ink : base.slate, fontSize: 14 }}>{value || all}</Text>
      <Text style={{ color: base.slate, fontSize: 11 }}>▾</Text>
    </Pressable>
  );
  return (
    <View>
      {(cats.length > 1 || secs.length > 1) && (
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
          {cats.length > 1 && pill('Category', cat, cats, (v) => { setCat(v); setSec(''); }, 'All Categories')}
          {secs.length > 1 && pill('Item', sec, secs, setSec, 'All Items')}
        </View>
      )}
      <TextInput value={find} onChangeText={setFind} placeholder="Search By Code Or Description" accessibilityLabel="Search the schedule of rates" style={[box, { fontSize: 16 }]} />
      {shown.map((r) => {
        const wording = rateWording(r);
        return (
          <Pressable key={r.id} accessibilityRole="button" accessibilityLabel={`${action === '＋' ? 'Add' : 'Open'} ${r.code || ''} ${rateTitle(r)}`.replace(/\s+/g, ' ')} onPress={() => onPick(r)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#EEF0F2' }}>
            <Text style={{ width: 62, fontSize: 12, fontWeight: '600', color: base.slate }}>{r.code || ''}</Text>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 13.5, color: base.ink }}>{rateTitle(r)}</Text>
              {!!(wording || (!sec && r.section)) && <Text numberOfLines={2} style={{ fontSize: 11.5, color: base.slate, marginTop: 1 }}>{!sec && r.section ? `${r.section}${wording ? ' · ' : ''}` : ''}{wording}</Text>}
            </View>
            <Text style={{ fontSize: 13, fontWeight: '600', color: base.ink }}>{gbp(Number(r.rate))}{r.unit ? `/${r.unit}` : ''}</Text>
            <Text style={{ fontSize: action === '＋' ? 18 : 16, color: base.slate }}>{action}</Text>
          </Pressable>
        );
      })}
      {(searching || always) && !list.length && <Muted style={{ marginTop: 6 }}>{rates.length ? 'Nothing matches.' : 'No rates yet.'}</Muted>}
      {list.length > shown.length && shown.length > 0 && <Muted style={{ marginTop: 6 }}>Showing {shown.length} of {list.length} — pick a category or item, or search, to narrow it down.</Muted>}
    </View>
  );
}
