import { Text } from 'react-native';

import { TBT_STATUS_LABEL } from '@/lib/rules/hs';
import { base } from '@/theme/theme';

const COLOURS: Record<string, { bg: string; fg: string }> = {
  bank: { bg: base.warnBg, fg: base.warn }, live: { bg: base.okBg, fg: base.ok }, completed: { bg: base.paper, fg: base.slate },
};

export function TbtStatusTag({ status }: { status: string }) {
  const c = COLOURS[status] ?? COLOURS.completed;
  return (
    <Text style={{ fontSize: 10.5, fontWeight: '800', color: c.fg, backgroundColor: c.bg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, overflow: 'hidden' }}>
      {TBT_STATUS_LABEL[status] || status}
    </Text>
  );
}
