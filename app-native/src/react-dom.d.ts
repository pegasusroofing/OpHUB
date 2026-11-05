// react-dom ships with Expo for the web build but without its types; only createPortal is used (FinSlot.web.tsx).
declare module 'react-dom' {
  export function createPortal(children: import('react').ReactNode, container: Element): import('react').ReactPortal;
}
