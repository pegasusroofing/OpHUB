// The laptop / web version: the button is drawn in the tab row's spot. Outside a Finance page (a project's own
// tabs) it stays where it is.
import { useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { View } from 'react-native';

import { FinSlotCtx } from '@/components/FinSlotCtx';

export function SubRight({ children }: { children: ReactNode }) {
  const { inPage, el } = useContext(FinSlotCtx);
  if (!inPage) return <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginBottom: 10 }}>{children}</View>;
  return el ? createPortal(<View style={{ flexDirection: 'row', gap: 8 }}>{children}</View>, el) : null;
}
