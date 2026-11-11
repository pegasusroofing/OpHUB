// A small edit form in a pop-up, used all over Finance (the current app's
// geo-modal-card forms): text, money, dates, multi-line notes and choices.
import { useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { CalendarPopup, DateBox } from '@/components/DateField';
import { chooseAction, confirmAsk } from '@/components/toast';
import { Button, Check, Muted } from '@/components/ui';
import { plainDbText } from '@/lib/rules/plainError';
import { base, radius } from '@/theme/theme';

export type Field = { k: string; label: string; kind?: 'text' | 'money' | 'number' | 'date' | 'day' | 'multiline' | 'choice' | 'check' | 'email'; options?: [string, string][]; ph?: string; half?: boolean; note?: string; extra?: { label: string; onPress: () => void }; tall?: boolean };
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
/** A day of the month as a date this month, so the calendar can show it. */
const dayAsDate = (d: number) => { const t = new Date(), last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`; };
type V = Record<string, string | boolean>;
const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 9, color: base.ink, backgroundColor: base.card };

/** onChange: when a field changes, return other fields to fill in (e.g. the approved value from the value issued). */
export function FinForm({ title, fields, initial, onSave, onClose, onDelete, deleteLabel = 'Remove', deleteAsk = 'Remove this? This can’t be undone.', saveLabel = 'Save', note, extra, onChange, inline }: {
  /** fields: a list, or worked out from what's typed so far (e.g. an invoice job hides retention as soon as you pick Invoice). */
  title: string; fields: Field[] | ((v: V) => Field[]); initial?: Record<string, unknown>; saveLabel?: string; note?: string; extra?: ReactNode;
  onSave: (v: V) => Promise<string | null | void>; onClose: () => void; onDelete?: () => Promise<string | null | void>; deleteLabel?: string; deleteAsk?: string;
  onChange?: (k: string, next: V, before: V) => Partial<V> | void;
  /** In the page rather than a pop-up, with Save and Cancel side by side under the boxes (Finance settings, Andy 11 Nov 2026). */
  inline?: boolean;
}) {
  const [v, setV] = useState<V>(() => {
    const o: V = {};
    // Fields that come and go start from initial too, so they keep their value when they appear.
    if (typeof fields === 'function') Object.entries(initial || {}).forEach(([k, x]) => { if (x == null || ['string', 'number', 'boolean'].includes(typeof x)) o[k] = typeof x === 'boolean' ? x : x == null ? '' : String(x); });
    (typeof fields === 'function' ? fields(o) : fields).forEach((f) => { const x = initial?.[f.k]; o[f.k] = f.kind === 'check' ? !!x : x == null ? '' : String(x); }); return o; });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [dayOpen, setDayOpen] = useState('');
  const set = (k: string, x: string | boolean) => setV((o) => { const n = { ...o, [k]: x }; const more = onChange?.(k, n, o); return more ? { ...n, ...more } as V : n; });
  const field = (f: Field) => {
    if (f.kind === 'check') return <Check key={f.k} label={f.label} value={!!v[f.k]} onChange={(x) => set(f.k, x)} />;
    return (
      <View key={f.k} style={{ flexBasis: f.half ? '47%' : '100%', flexGrow: 1, marginBottom: 8 }}>
        <Muted style={{ fontWeight: '500' }}>{f.label}</Muted>
        {f.kind === 'choice' ? (
          <Pressable accessibilityRole="button" accessibilityLabel={f.label} onPress={async () => { const k = await chooseAction(f.label, (f.options || []).map(([key, label]) => ({ key, label }))); if (k !== null && k !== undefined) set(f.k, k); }} style={box}>
            <Text style={{ color: base.ink }}>{(f.options || []).find(([k]) => k === v[f.k])?.[1] || f.ph || 'Choose…'} ▾</Text>
          </Pressable>
        ) : f.kind === 'day' ? (
          <>
            <Pressable accessibilityRole="button" accessibilityLabel={f.label} onPress={() => setDayOpen(f.k)} style={box}>
              <Text style={{ color: Number(v[f.k]) ? base.ink : base.slateLight }}>{Number(v[f.k]) ? `${ordinal(Number(v[f.k]))} of each month` : f.ph || 'Choose a date'}</Text>
            </Pressable>
            {dayOpen === f.k && <CalendarPopup title={f.label} clearable value={Number(v[f.k]) ? dayAsDate(Number(v[f.k])) : null} onClose={() => setDayOpen('')} onPick={(iso) => { setDayOpen(''); set(f.k, iso ? String(Number(iso.slice(8))) : ''); }}
              footer={f.extra ? <Pressable accessibilityRole="button" onPress={() => { setDayOpen(''); f.extra?.onPress(); }} style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: base.line }}><Text style={{ color: base.blue, fontWeight: '600', textAlign: 'center' }}>{f.extra.label}</Text></Pressable> : undefined} />}
          </>
        ) : f.kind === 'date' ? (
          <DateBox value={String(v[f.k] ?? '')} onChange={(x) => set(f.k, x)} title={f.label} placeholder={f.ph || 'Choose a date'} style={{ paddingVertical: 8 }} />
        ) : (
          <TextInput accessibilityLabel={f.label} value={String(v[f.k] ?? '')} onChangeText={(x) => set(f.k, x)} placeholder={f.ph || (f.kind === 'money' ? '£0.00' : '')} multiline={f.kind === 'multiline'}
            keyboardType={f.kind === 'money' ? 'decimal-pad' : f.kind === 'number' ? 'decimal-pad' : f.kind === 'email' ? 'email-address' : 'default'} autoCapitalize={f.kind === 'email' ? 'none' : 'sentences'}
            // Tapping in picks the whole figure, so typing replaces it (Andy, 11 Nov 2026).
            selectTextOnFocus={f.kind !== 'multiline'}
            style={[box, f.kind === 'multiline' ? { minHeight: f.tall ? 260 : 120, textAlignVertical: 'top' } : null]} />
        )}
        {f.note ? <Muted style={{ fontSize: 11.5 }}>{f.note}</Muted> : null}
      </View>
    );
  };
  const save = async () => { setBusy(true); setErr(''); try { const e = await onSave(v); if (e) setErr(e); else onClose(); } finally { setBusy(false); } };
  if (inline) return (
    <View>
      {note ? <Muted style={{ marginBottom: 8 }}>{note}</Muted> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 8 }}>{(typeof fields === 'function' ? fields(v) : fields).map(field)}</View>
      {extra}
      {err ? <Text style={{ color: '#C0392B', fontWeight: '500', marginTop: 8 }}>{plainDbText(err)}</Text> : null}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 8 }}>
        <View style={{ flex: 2, maxWidth: 260 }}><Button busy={busy} title={saveLabel} onPress={save} /></View>
        <View style={{ flex: 1, maxWidth: 140 }}><Button kind="ghost" title="Cancel" onPress={onClose} /></View>
      </View>
    </View>
  );
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      {/* It only closes on Save, Cancel or the cross: a click outside must not lose what's been typed (Andy, 2 Nov 2026). */}
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 16 }}>
        <View style={{ backgroundColor: base.card, borderRadius: 14, padding: 16, maxHeight: '90%', width: '100%', maxWidth: 560, alignSelf: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 }}>
            <Text style={{ flex: 1, fontWeight: '600', fontSize: 16, color: base.ink }}>{title}</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10}><Text style={{ fontSize: 18, color: base.slate, fontWeight: '500' }}>✕</Text></Pressable>
          </View>
          <ScrollView style={{ flexGrow: 0 }} keyboardShouldPersistTaps="handled">
            {note ? <Muted style={{ marginBottom: 8 }}>{note}</Muted> : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 8 }}>{(typeof fields === 'function' ? fields(v) : fields).map(field)}</View>
            {extra}
          </ScrollView>
          {err ? <Text style={{ color: '#C0392B', fontWeight: '500', marginTop: 8 }}>{plainDbText(err)}</Text> : null}
          <View style={{ gap: 8, marginTop: 6 }}>
            <Button busy={busy} title={saveLabel} onPress={save} />
            {onDelete && <Button kind="ghost" title={deleteLabel} onPress={async () => { if (!(await confirmAsk(deleteAsk, deleteLabel))) return; const e = await onDelete(); if (e) setErr(e); else onClose(); }} />}
            <Button kind="ghost" title="Cancel" onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
