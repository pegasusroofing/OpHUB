// Tick-chips for who a Price Sheet is for (400 pbAssigneeChipsHtml) — ticking
// someone gives them access to the price tile the sheet feeds once it's issued.
import { Pressable, Text, View } from 'react-native';

import { Muted } from '@/components/ui';
import { base } from '@/theme/theme';

export function AssignChips({ ops, sel, onToggle }: { ops: { id: string; name: string }[]; sel: string[]; onToggle: (id: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {ops.length ? ops.map((p) => { const on = sel.includes(p.id); return (
        <Pressable key={p.id} onPress={() => onToggle(p.id)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: on ? base.blue : base.line, backgroundColor: on ? base.blueBg : base.card }}>
          <Text style={{ fontSize: 12.5, fontWeight: '700', color: on ? base.blue : base.ink }}>{on ? '✓ ' : ''}{p.name}</Text>
        </Pressable>
      ); }) : <Muted>No operatives assigned to this site yet.</Muted>}
    </View>
  );
}
