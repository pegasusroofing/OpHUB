// The phone's sidebar (SideMenu) opens and closes from anywhere: ☰ opens it, a row tapped in it closes it (review,
// 15 Nov 2026: tapping the page you were already on left it open).
const listeners = new Set<(open: boolean) => void>();
export const sideMenuListen = (l: (open: boolean) => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const openSideMenu = () => listeners.forEach((l) => l(true));
export const closeSideMenu = () => listeners.forEach((l) => l(false));
