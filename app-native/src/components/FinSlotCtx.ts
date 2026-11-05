// Where a Finance page's own button goes: the right-hand end of its tab row (Andy, 5 Nov 2026).
// FinPage gives the spot; a section inside it puts its button there with <SubRight>.
import { createContext } from 'react';

export const FinSlotCtx = createContext<{ inPage: boolean; el: HTMLElement | null }>({ inPage: false, el: null });
