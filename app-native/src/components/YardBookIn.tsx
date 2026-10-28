// "Book Stock Into The Yard" (9219zq): item, qty, who it came from, PO or delivery
// note number, a photo of the delivery note, and the latest bookings in. Managers,
// drivers and Finance can book in; the count and rates stay with the office.
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Image, Pressable, Text, TextInput, View } from 'react-native';

import { showAlert, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted, SectionTitle } from '@/components/ui';
import { nameOf, usePeople } from '@/data/hs';
import { useRecentBookIns, useYard, yardBookIn } from '@/data/materials';
import { useAuth } from '@/lib/auth';
import { pickPhotos, type Picked } from '@/lib/photos';
import { yardNum, yardQty } from '@/lib/rules/materials';
import { base, radius } from '@/theme/theme';

const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card, marginBottom: 8 };

export function YardBookIn({ canAddItems }: { canAddItems: boolean }) {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: items } = useYard(me?.org_id);
  const { data: recent } = useRecentBookIns(me?.org_id);
  const { data: people } = usePeople();
  const [q, setQ] = useState('');
  const [stockId, setStockId] = useState<string | null>(null);
  const [qty, setQty] = useState('');
  const [sup, setSup] = useState('');
  const [ref, setRef] = useState('');
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<Picked | null>(null);
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  const list = items ?? [];
  const shown = q.trim() ? list.filter((s) => s.item.toLowerCase().includes(q.trim().toLowerCase())) : list;
  const stock = list.find((s) => s.id === stockId);

  return (
    <Card>
      <SectionTitle>⬇ Book Stock Into The Yard</SectionTitle>
      {list.length ? (
        <>
          <Muted style={{ fontWeight: '700' }}>Item</Muted>
          {stock ? (
            <Pressable onPress={() => setStockId(null)} style={{ paddingVertical: 8 }}><Text style={{ color: base.ink, fontWeight: '700' }}>▼ {stock.item} — {yardQty(stock.qty)} {stock.unit || ''} in yard</Text></Pressable>
          ) : (
            <View style={{ marginBottom: 8 }}>
              <TextInput value={q} onChangeText={setQ} placeholder="Search the yard" style={box} />
              {shown.slice(0, 40).map((s) => (
                <Pressable key={s.id} onPress={() => { setStockId(s.id); setQ(''); }}><Text style={{ paddingVertical: 6, color: base.ink }}>{s.item} <Text style={{ color: base.slate }}>— {yardQty(s.qty)} {s.unit || ''}</Text></Text></Pressable>
              ))}
            </View>
          )}
          <Muted>{canAddItems ? 'Not on the list? Add new items in Finance › Purchases › Yard stock.' : 'Not on the list? Book it with a note and ask the office to add it.'}</Muted>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <TextInput value={qty} onChangeText={setQty} keyboardType="decimal-pad" placeholder="Qty, e.g. 40" style={[box, { flex: 1 }]} />
            <TextInput value={sup} onChangeText={setSup} placeholder="From (supplier)" style={[box, { flex: 1 }]} />
          </View>
          <TextInput value={ref} onChangeText={setRef} placeholder="PO or delivery note number" style={box} />
          {photo ? (
            <Pressable onPress={() => setPhoto(null)} style={{ marginBottom: 8 }}>
              <Image source={{ uri: photo.uri }} style={{ width: 90, height: 90, borderRadius: 8 }} />
              <Muted>Tap to remove</Muted>
            </Pressable>
          ) : <Button kind="ghost" title="📷 Photo of the delivery note (optional)" onPress={async () => { const p = await pickPhotos('camera', false); if ('error' in p) showAlert(p.error); else if (p[0]) setPhoto(p[0]); }} />}
          <TextInput value={note} onChangeText={setNote} placeholder="Note (optional), e.g. 2 damaged, left in bay 3" style={box} />
          <Button busy={busy} title="Book In" onPress={async () => {
            if (!stock) { toast('Choose the item.'); return; }
            const n = yardNum(qty);
            if (n == null || !(n > 0)) { toast('Enter the qty as a number.'); return; }
            setBusy(true);
            const err = await yardBookIn(me, { stock, qty: n, supplier: sup.trim(), ref: ref.trim(), note: note.trim(), photo });
            setBusy(false);
            if (err) { toast(err); return; }
            toast(`Booked in — ${yardQty(Number(stock.qty || 0) + n)} ${stock.unit || ''} now in the yard`);
            setStockId(null); setQty(''); setSup(''); setRef(''); setNote(''); setPhoto(null);
            void qc.invalidateQueries({ queryKey: ['yard'] });
          }} />
        </>
      ) : <Empty>The yard list is empty. {canAddItems ? 'Add the first items in Finance › Purchases › Yard stock.' : 'Ask the office to add the yard items first.'}</Empty>}

      <SectionTitle>Recently Booked In</SectionTitle>
      {recent?.length ? recent.map((m) => {
        const s = list.find((x) => x.id === m.stock_id);
        return (
          <View key={m.id} style={{ flexDirection: 'row', gap: 10, paddingVertical: 6, borderTopWidth: 1, borderTopColor: base.line }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700', color: base.ink }}>{s?.item ?? 'Item'}</Text>
              <Muted>{[new Date(m.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), m.created_by ? nameOf(people, m.created_by) : '', m.supplier_name, m.ref, m.note].filter(Boolean).join(' · ')}{m.photo_path ? ' · 📷' : ''}</Muted>
            </View>
            <Text style={{ fontWeight: '800', color: base.ok }}>+{yardQty(m.qty)} {s?.unit || ''}</Text>
          </View>
        );
      }) : <Muted>Nothing booked in yet.</Muted>}
    </Card>
  );
}
