// Draws its children on top of the whole page (web), so a drop-down list isn't hidden or overlapped by what comes
// after it on the page (Andy, 6 Nov 2026).
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function Portal({ children }: { children: ReactNode }) {
  return typeof document === 'undefined' ? <>{children}</> : createPortal(children, document.body);
}
