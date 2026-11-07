// A progress bar of steps, like the purchase invoice one (Andy, 6 and 7 Nov 2026): the steps done filled in, the one
// it's at ringed in the company colour, steps not needed dashed, and one plain line saying what happens next.
import { Text, View } from 'react-native';

import { base, useTheme } from '@/theme/theme';

/** step: 1-based, the one it's at (past the end = all done). skip: steps (1-based) that weren't needed. */
export function StageBar({ steps, step, next, skip = [], rejected, rejectedLabel = 'Rejected' }: { steps: string[]; step: number; next?: string; skip?: number[]; rejected?: boolean; rejectedLabel?: string }) {
  const t = useTheme();
  return (
    <View accessibilityLabel={`Stage: ${rejected ? rejectedLabel : steps[Math.min(step, steps.length) - 1]}`} style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#ECEEF2', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 10, marginBottom: 10 }}>
      <View style={{ flexDirection: 'row' }}>
        {steps.map((n, k) => {
          const i = k + 1, skipped = skip.includes(i), done = !rejected && i < step && !skipped, now = !rejected && i === step;
          return (
            <View key={k} style={{ flex: 1, alignItems: 'center' }}>
              {k < steps.length - 1 && <View style={{ position: 'absolute', top: 11, left: '50%', width: '100%', height: 2, backgroundColor: !rejected && i < step ? base.ink : '#D9DCE1' }} />}
              <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? base.ink : '#fff', borderWidth: now ? 2 : 1.5, borderStyle: skipped ? 'dashed' : 'solid', borderColor: done ? base.ink : now ? t.brand1 : '#C9CDD3' }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: done ? '#fff' : now ? t.brand1 : skipped ? '#C9CDD3' : base.slate }}>{done ? '✓' : skipped ? '–' : i}</Text>
              </View>
              <Text numberOfLines={2} style={{ fontSize: 10, lineHeight: 12, marginTop: 4, textAlign: 'center', color: now ? base.ink : base.slate, fontWeight: now ? '700' : '500', paddingHorizontal: 1 }}>{skipped ? 'Not Needed' : n}</Text>
            </View>
          );
        })}
      </View>
      {rejected && <Text style={{ marginTop: 8, fontSize: 12.5, fontWeight: '600', color: '#C0392B' }}>{rejectedLabel}</Text>}
      {!!next && <Text style={{ marginTop: 8, fontSize: 12.5, color: base.ink, backgroundColor: '#F6F7F9', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 9, overflow: 'hidden' }}>{next}</Text>}
    </View>
  );
}
