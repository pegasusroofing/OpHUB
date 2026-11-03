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
    @media (pointer: coarse), (max-width: 1099px) { input, textarea, select { font-size: 16px !important; } }
  `;
  document.head.appendChild(style);
}
