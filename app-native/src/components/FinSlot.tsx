// The phone app version: the button stays above the list, on the right (the tab row scrolls sideways there).
import type { ReactNode } from 'react';
import { View } from 'react-native';

export function SubRight({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginBottom: 10 }}>{children}</View>;
}
