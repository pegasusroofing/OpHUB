// Where a purchase invoice is up to (Andy, 6 Nov 2026: "I can't tell what stage it's at"): five steps across the top,
// Received → Job And PM → Checked → Approved → Paid, the one it's at ringed in the company colour, and one plain line
// saying what happens next or who it's waiting on. The Purchases tabs are the same five steps.
import { Text, View } from 'react-native';

import { base, useTheme } from '@/theme/theme';

export const PINV_STEPS = ['Received', 'Job And PM', 'Checked', 'Approved', 'Paid'];

/** step: 1–5, the one it's at (6 = all done). label2: what step 2 says (e.g. "With Pat"). */
export function PinvStages({ step, label2, next, rejected }: { step: number; label2?: string; next: string; rejected?: boolean }) {
  const t = useTheme();
  const names = PINV_STEPS.map((n, k) => (k === 1 && label2 ? label2 : n));
  return (
    <View accessibilityLabel={`Stage: ${rejected ? 'Rejected' : names[Math.min(step, 5) - 1]}`} style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#ECEEF2', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 10 }}>
      <View style={{ flexDirection: 'row' }}>
        {names.map((n, k) => {
          const i = k + 1, done = !rejected && i < step, now = !rejected && i === step;
          return (
            <View key={k} style={{ flex: 1, alignItems: 'center' }}>
              {/* The line to the next step, behind the dots. */}
              {k < names.length - 1 && <View style={{ position: 'absolute', top: 11, left: '50%', width: '100%', height: 2, backgroundColor: done ? base.ink : '#D9DCE1' }} />}
              <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? base.ink : '#fff', borderWidth: now ? 2 : 1.5, borderColor: done ? base.ink : now ? t.brand1 : '#C9CDD3' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: done ? '#fff' : now ? t.brand1 : base.slate }}>{done ? '✓' : i}</Text>
              </View>
              <Text numberOfLines={1} style={{ fontSize: 12, marginTop: 5, color: now ? base.ink : base.slate, fontWeight: now ? '700' : '500', paddingHorizontal: 2 }}>{n}</Text>
            </View>
          );
        })}
      </View>
      <Text style={{ fontSize: 13, color: rejected ? base.red : base.slate, marginTop: 10, textAlign: 'center' }}>{next}</Text>
    </View>
  );
}
