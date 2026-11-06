// Phones: drawn where it is (the web version lifts it on top of the page).
import type { ReactNode } from 'react';

export function Portal({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
