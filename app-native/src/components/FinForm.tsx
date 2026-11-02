// A small edit form in a pop-up, used all over Finance (the current app's
// geo-modal-card forms): text, money, dates, multi-line notes and choices.
import { useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { CalendarPopup, DateBox } from '@/components/DateField';
import { chooseAction, confirmAsk } from '@/components/toast';
import { Button, Check, Muted } from '@/components/ui';
import { base, radius } from '@/theme/theme';

export type Field = { k: string; label: string; kind?: 'text' | 'money' | 'number' | 'date' | 'day' | 'multiline' | 'choice' | 'check' | 'email'; options?: [string, string][]; ph?: string; half?: boolean; note?: string; extra?: { label: string; onPress: () => void } };
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
/** A day of the month as a date this month, so the calendar can show it. */
const dayAsDate = (d: number) => { const t = new Date(), last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`; };
type V = Record<string, string | boolean>;
const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 9, color: base.ink, backgroundColor: base.card };

export function FinForm({ title, fields, initial, onSave, onClose, onDelete, saveLabel = 'Save', note, extra }: {
  title: string; fields: Field[]; initial?: Record<string, unknown>; saveLabel?: string; note?: string; extra?: ReactNode;
  onSave: (v: V) => Promise<string | null | void>; onClose: () => void; onDelete?: () => Promise<string | null | void>;
}) {
  const [v, setV] = useState<V>(() => { const o: V = {}; fields.forEach((f) => { const x = initial?.[f.k]; o[f.k] = f.kind === 'check' ? !!x : x == null ? '' : String(x); }); return o; });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [dayOpen, setDayOpen] = useState('');
  const set = (k: string, x: string | boolean) => setV((o) => ({ ...o, [k]: x }));
  const field = (f: Field) => {
    if (f.kind === 'check') return <Check key={f.k} label={f.label} value={!!v[f.k]} onChange={(x) => set(f.k, x)} />;
    return (
      <View key={f.k} style={{ flexBasis: f.half ? '47%' : '100%', flexGrow: 1, marginBottom: 8 }}>
        <Muted style={{ fontWeight: '500' }}>{f.label}</Muted>
        {f.kind === 'choice' ? (
          <Pressable onPress={async () => { const k = await chooseAction(f.label, (f.options || []).map(([key, label]) => ({ key, label }))); if (k !== null && k !== undefined) set(f.k, k); }} style={box}>
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
          <TextInput value={String(v[f.k] ?? '')} onChangeText={(x) => set(f.k, x)} placeholder={f.ph || (f.kind === 'money' ? '£0.00' : '')} multiline={f.kind === 'multiline'}
            keyboardType={f.kind === 'money' ? 'decimal-pad' : f.kind === 'number' ? 'decimal-pad' : f.kind === 'email' ? 'email-address' : 'default'} autoCapitalize={f.kind === 'email' ? 'none' : 'sentences'}
            style={[box, f.kind === 'multiline' ? { minHeight: 80 } : null]} />
        )}
        {f.note ? <Muted style={{ fontSize: 11.5 }}>{f.note}</Muted> : null}
      </View>
    );
  };
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
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 8 }}>{fields.map(field)}</View>
            {extra}
          </ScrollView>
          {err ? <Text style={{ color: '#C0392B', fontWeight: '500', marginTop: 8 }}>{err}</Text> : null}
          <View style={{ gap: 8, marginTop: 6 }}>
            <Button busy={busy} title={saveLabel} onPress={async () => { setBusy(true); setErr(''); try { const e = await onSave(v); if (e) setErr(e); else onClose(); } finally { setBusy(false); } }} />
            {onDelete && <Button kind="ghost" title="Remove" onPress={async () => { if (!(await confirmAsk('Remove this? This can’t be undone.', 'Remove'))) return; const e = await onDelete(); if (e) setErr(e); else onClose(); }} />}
            <Button kind="ghost" title="Cancel" onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
