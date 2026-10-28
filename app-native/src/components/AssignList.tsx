// A list of people with an Assign / Assigned ✓ button each (380 Assign Team).
import { Pressable, Text, View } from 'react-native';

import { Empty } from '@/components/ui';
import { base, radius } from '@/theme/theme';

const initials = (n: string) => (n || '?').split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();

export function AssignList({ people, isOn, onToggle, empty, busyId }: {
  people: { id: string; name: string; email: string | null }[]; isOn: (id: string) => boolean;
  onToggle: (id: string, on: boolean) => void; empty: string; busyId?: string | null;
}) {
  if (!people.length) return <Empty>{empty}</Empty>;
  return (
    <View>
      {people.map((p) => {
        const on = isOn(p.id);
        return (
          <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 6, backgroundColor: base.card }}>
            <Text style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: '#3A3D44', color: '#fff', textAlign: 'center', lineHeight: 34, fontWeight: '700', fontSize: 12, overflow: 'hidden' }}>{initials(p.name)}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700', color: base.ink }}>{p.name}</Text>
              {!!p.email && <Text style={{ fontSize: 11, color: base.slate }}>{p.email}</Text>}
            </View>
            <Pressable disabled={busyId === p.id} onPress={() => onToggle(p.id, on)}
              style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: base.ink, backgroundColor: on ? base.ink : base.card, opacity: busyId === p.id ? 0.5 : 1 }}>
              <Text style={{ fontWeight: '700', fontSize: 12, color: on ? '#fff' : base.ink }}>{on ? 'Assigned ✓' : 'Assign'}</Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}
