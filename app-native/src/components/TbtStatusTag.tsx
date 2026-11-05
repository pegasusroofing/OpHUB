import { Text } from 'react-native';

import { TBT_STATUS_LABEL } from '@/lib/rules/hs';
import { base } from '@/theme/theme';

const COLOURS: Record<string, { bg: string; fg: string }> = {
  // As the old app: LIVE orange, COMPLETED green (5 Nov 2026).
  bank: { bg: base.paper, fg: base.slate }, live: { bg: base.warnBg, fg: base.warn }, completed: { bg: base.okBg, fg: base.ok },
};

export function TbtStatusTag({ status }: { status: string }) {
  const c = COLOURS[status] ?? COLOURS.completed;
  return (
    <Text style={{ fontSize: 10.5, fontWeight: '600', color: c.fg, backgroundColor: c.bg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, overflow: 'hidden' }}>
      {TBT_STATUS_LABEL[status] || status}
    </Text>
  );
}
