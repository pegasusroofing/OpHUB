// The app on a phone's web browser (130 shell .appshell): the page itself never moves, so the screen
// width stays fixed, the bottom bar stays clear of the browser's address bar, and pressing into a box
// doesn't zoom the screen. Does nothing in the installed app.
import { LogBox, Platform } from 'react-native';

// react-native-web's touch handling reports these in development only. Neither stops the press working.
const HUSH = ['Cannot find single active touch', "ScrollView doesn't take rejection well"];
LogBox.ignoreLogs(HUSH);
const consoleError = console.error;
console.error = (...args: unknown[]) => { if (typeof args[0] === 'string' && HUSH.some((h) => (args[0] as string).includes(h))) return; consoleError(...args); };

if (Platform.OS === 'web' && typeof document !== 'undefined') {
  let meta = document.querySelector('meta[name="viewport"]');
  if (!meta) { meta = document.createElement('meta'); meta.setAttribute('name', 'viewport'); document.head.appendChild(meta); }
  meta.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover');
  const style = document.createElement('style');
  style.textContent = `
    html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; overscroll-behavior: none; -webkit-text-size-adjust: 100%; }
    /* The strip between the app and Safari's floating address bar shows the page behind: white, like the bottom bar (Andy, 3 Nov 2026). */
    html, body { background-color: #FFFFFF; }
    body { position: fixed; inset: 0; }
    #root { width: 100%; height: 100%; height: 100dvh; overflow: hidden; }
    /* Boxes a touch smaller on a phone (Andy, 7 Nov 2026: 0.9x); maximum-scale=1 above stops Safari zooming into them. */
    @media (pointer: coarse), (max-width: 1099px) { input, textarea, select { font-size: 14.4px !important; } }
    /* The small search boxes under a phone table's headings (Quotes, Andy 14 Nov 2026: the search boxes 1.2x smaller). */
    @media (pointer: coarse), (max-width: 1099px) { input[data-compact="1"] { font-size: 12px !important; } }
  `;
  document.head.appendChild(style);
}

// Tap the top of an iPhone's screen to go back to the top (Andy, 19 Nov 2026: "when I press the top of the screen everywhere
// else it takes me to the top of the page but in this it doesn't"). The iPhone only does that for the page itself, which
// never moves here (above), so the page is given one spare pixel to scroll: the app is fixed in place, so nothing on
// screen moves. Tapping the top takes the page from that pixel back to 0; the app then scrolls whatever list is open to
// the top, as the iPhone would, and puts the page back on its pixel. Not while typing: the keyboard moves the page too.
if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof document !== 'undefined') {
  const ua = navigator.userAgent || '';
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1);
  if (ios) {
    const style = document.createElement('style');
    style.textContent = 'html.tap-top { height: calc(100% + 1px); overflow-y: scroll; scrollbar-width: none; } html.tap-top::-webkit-scrollbar { display: none; }';
    document.head.appendChild(style);
    document.documentElement.classList.add('tap-top');
    let typingUntil = 0;
    const typing = () => {
      const a = document.activeElement as HTMLElement | null;
      return Date.now() < typingUntil || !!(a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable));
    };
    document.addEventListener('focusin', () => { typingUntil = Date.now() + 900; });
    document.addEventListener('focusout', () => { typingUntil = Date.now() + 900; });
    const park = () => { if (window.scrollY < 1) window.scrollTo(0, 1); };
    const toTop = () => {
      document.querySelectorAll<HTMLElement>('div').forEach((el) => {
        if (el.scrollTop <= 0 || el.scrollHeight <= el.clientHeight + 2) return;
        const oy = getComputedStyle(el).overflowY;
        if (oy !== 'auto' && oy !== 'scroll') return;
        const r = el.getBoundingClientRect();
        if (r.width < 40 || r.height < 40 || r.bottom <= 0 || r.top >= window.innerHeight) return;
        el.scrollTo({ top: 0, behavior: 'smooth' });
      });
    };
    let parked = false;
    window.addEventListener('scroll', () => {
      if (window.scrollY > 0) { parked = true; return; }
      if (parked && !typing()) toTop();
      parked = false;
      setTimeout(park, 350);
    }, { passive: true });
    window.addEventListener('load', () => setTimeout(park, 300));
    setTimeout(park, 1200);
  }
}
