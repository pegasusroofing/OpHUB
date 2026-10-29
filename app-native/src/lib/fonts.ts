// The current app's fonts (src/css/app.css): IBM Plex Sans for text, Sora for
// titles, tile names and big numbers, IBM Plex Mono for small figures.
// Web (office laptop): the default text font becomes IBM Plex Sans by giving
// the names in react-native-web's system font list ("Segoe UI" on Windows) the
// Plex files, so every piece of text changes without touching each screen;
// headings ask for Sora by name. Phones: Sora / Plex Mono are loaded under one
// name per weight (a custom font on a phone can't switch weight by itself).
import { Asset } from 'expo-asset';
import { useFonts } from 'expo-font';
import { Platform, type TextStyle } from 'react-native';

const F = {
  plex400: require('@expo-google-fonts/ibm-plex-sans/400Regular/IBMPlexSans_400Regular.ttf'),
  plex500: require('@expo-google-fonts/ibm-plex-sans/500Medium/IBMPlexSans_500Medium.ttf'),
  plex600: require('@expo-google-fonts/ibm-plex-sans/600SemiBold/IBMPlexSans_600SemiBold.ttf'),
  plex700: require('@expo-google-fonts/ibm-plex-sans/700Bold/IBMPlexSans_700Bold.ttf'),
  sora600: require('@expo-google-fonts/sora/600SemiBold/Sora_600SemiBold.ttf'),
  sora700: require('@expo-google-fonts/sora/700Bold/Sora_700Bold.ttf'),
  sora800: require('@expo-google-fonts/sora/800ExtraBold/Sora_800ExtraBold.ttf'),
  mono500: require('@expo-google-fonts/ibm-plex-mono/500Medium/IBMPlexMono_500Medium.ttf'),
  mono600: require('@expo-google-fonts/ibm-plex-mono/600SemiBold/IBMPlexMono_600SemiBold.ttf'),
};
const web = Platform.OS === 'web';

function injectWebFonts() {
  if (typeof document === 'undefined' || document.getElementById('ophub-fonts')) return;
  const u = (m: number) => Asset.fromModule(m).uri;
  const face = (family: string, w: number, m: number) => `@font-face{font-family:${family};font-style:normal;font-weight:${w};font-display:swap;src:url(${u(m)}) format('truetype');}`;
  const plex: [number, number][] = [[400, F.plex400], [500, F.plex500], [600, F.plex600], [700, F.plex700], [800, F.plex700], [900, F.plex700]];
  const css = [
    // The system font names react-native-web asks for, given the Plex files.
    ...['"Segoe UI"', 'BlinkMacSystemFont', 'Roboto', '"IBM Plex Sans"'].flatMap((fam) => plex.map(([w, m]) => face(fam, w, m))),
    face('Sora', 600, F.sora600), face('Sora', 700, F.sora700), face('Sora', 800, F.sora800),
    face('"IBM Plex Mono"', 500, F.mono500), face('"IBM Plex Mono"', 600, F.mono600),
    'input,textarea,button,select{font-family:"IBM Plex Sans","Segoe UI",sans-serif;}',
  ].join('\n');
  const el = document.createElement('style'); el.id = 'ophub-fonts'; el.textContent = css; document.head.appendChild(el);
}

/** Loads the fonts; true once they're ready (web is always ready — the browser swaps them in). */
export function useAppFonts(): boolean {
  if (web) injectWebFonts();
  const [ok, err] = useFonts(web ? {} : { Sora_600: F.sora600, Sora_700: F.sora700, Sora_800: F.sora800, PlexMono_500: F.mono500, PlexMono_600: F.mono600 });
  return web || ok || !!err;
}

/** Sora at a weight (titles, tile names, big numbers). */
export const heading = (w: 600 | 700 | 800 = 700): TextStyle => (web ? { fontFamily: 'Sora', fontWeight: String(w) as TextStyle['fontWeight'] } : { fontFamily: `Sora_${w}` });
/** IBM Plex Mono (figures, the header's sub-line). */
export const mono = (w: 500 | 600 = 600): TextStyle => (web ? { fontFamily: '"IBM Plex Mono"', fontWeight: String(w) as TextStyle['fontWeight'] } : { fontFamily: `PlexMono_${w}` });
