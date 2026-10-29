// Sites map (125 sites-map, website only): each project's postcode turned into a
// map position with the free UK postcodes.io service (remembered in this
// browser), drawn with MapLibre and OpenFreeMap's "positron" style — free, no
// account or key.
import { siteStatusKey } from '@/lib/rules/checkin';
import type { Site } from '@/lib/types';

export const MAP_COLOURS: Record<string, string> = { live: '#1E9E5A', upcoming: '#E08A00', closed: '#8A8D93' };
const MAPLIBRE_JS = ['https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js', 'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.js'];
const MAPLIBRE_CSS = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
export const MAP_STYLE = 'https://tiles.openfreemap.org/styles/positron';

const UK_POSTCODE_RE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;
export function sitePostcode(s: Pick<Site, 'postcode' | 'address'>): string | null {
  const m = UK_POSTCODE_RE.exec(String(s.postcode || '')) || UK_POSTCODE_RE.exec(String(s.address || ''));
  return m ? `${m[1]} ${m[2]}`.toUpperCase() : null;
}

const GEO_KEY = 'ophub_pc_geo_v1';
const readCache = (): Record<string, [number, number] | 0> => { try { return JSON.parse(globalThis.localStorage?.getItem(GEO_KEY) || '{}') || {}; } catch { return {}; } };
let mem: Record<string, [number, number] | 0> | null = null;
async function geocode(list: (string | null)[]) {
  const cache = mem || (mem = readCache());
  const want = [...new Set(list.filter((x): x is string => !!x))].filter((pc) => !(pc in cache));
  for (let i = 0; i < want.length; i += 100) {
    try {
      const r = await fetch('https://api.postcodes.io/postcodes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ postcodes: want.slice(i, i + 100) }) });
      if (!r.ok) break;
      const d = (await r.json()) as { result?: { query: string; result: { latitude: number; longitude: number } | null }[] };
      (d.result || []).forEach((x) => { cache[String(x.query || '').toUpperCase()] = x.result && x.result.latitude != null ? [x.result.latitude, x.result.longitude] : 0; });
    } catch { break; }
  }
  try { globalThis.localStorage?.setItem(GEO_KEY, JSON.stringify(cache)); } catch { /* private window */ }
  return cache;
}

export type MapPoint = { s: Site; pc: string | null; st: string; lat?: number; lng?: number };
/** Projects with a map position, and those without (no postcode, or not found). */
export async function mapPoints(sites: Site[]): Promise<{ pts: MapPoint[]; missing: MapPoint[] }> {
  const pcs = sites.map(sitePostcode);
  const geo = await geocode(pcs);
  const pts: MapPoint[] = [], missing: MapPoint[] = [];
  sites.forEach((s, i) => {
    const pc = pcs[i], g = pc ? geo[pc] : null, st = siteStatusKey(s);
    if (g) pts.push({ s, pc, st, lat: g[0], lng: g[1] }); else missing.push({ s, pc, st });
  });
  return { pts, missing };
}

type MapLibre = { Map: new (o: object) => unknown; Marker: new (o: object) => unknown; Popup: new (o: object) => unknown; LngLatBounds: new () => unknown; NavigationControl: new (o: object) => unknown };
let loading: Promise<MapLibre | null> | null = null;
/** Loads MapLibre once (web only); null when it can't (no WebGL, offline). */
export function loadMapLibre(): Promise<MapLibre | null> {
  const w = globalThis as unknown as { maplibregl?: MapLibre; document?: Document };
  if (w.maplibregl?.Map) return Promise.resolve(w.maplibregl);
  if (!w.document) return Promise.resolve(null);
  try { const c = w.document.createElement('canvas'); if (!(c.getContext('webgl2') || c.getContext('webgl'))) return Promise.resolve(null); } catch { return Promise.resolve(null); }
  if (loading) return loading;
  const doc = w.document;
  loading = (async () => {
    if (!doc.querySelector('link[data-maplibre]')) { const l = doc.createElement('link'); l.rel = 'stylesheet'; l.href = MAPLIBRE_CSS; l.setAttribute('data-maplibre', '1'); doc.head.appendChild(l); }
    if (!doc.querySelector('style[data-smpin]')) {
      const st = doc.createElement('style'); st.setAttribute('data-smpin', '1');
      st.textContent = `.smpin{width:30px;height:32px;cursor:pointer;filter:drop-shadow(0 3px 4px rgba(0,0,0,.28));}
.smpin span{position:absolute;left:3px;top:0;width:24px;height:24px;border-radius:50% 50% 50% 0;background:var(--c);transform:rotate(-45deg);border:2.5px solid #fff;box-sizing:border-box;transition:transform .15s;}
.smpin span::after{content:'';position:absolute;left:50%;top:50%;width:7px;height:7px;margin:-3.5px 0 0 -3.5px;border-radius:50%;background:#fff;}
.smpin:hover span{transform:rotate(-45deg) scale(1.15);}
.smpin.mini{width:22px;height:28px;}.smpin.mini span{width:18px;height:18px;left:2px;border-width:2px;}.smpin.mini span::after{width:5px;height:5px;margin:-2.5px 0 0 -2.5px;}
.smpop{font-family:'IBM Plex Sans',sans-serif;font-size:12.5px;line-height:1.45;min-width:220px;}
.smpop .t{font-size:15px;font-weight:800;display:block;margin-bottom:2px;}.smpop .a{color:#5B6472;}.smpop .st{font-weight:700;margin-top:4px;}
.smpop .rows{margin-top:8px;border-top:1px solid #EEF0F3;padding-top:6px;}.smpop .r{display:flex;justify-content:space-between;gap:10px;padding:2px 0;}.smpop .r span{color:#5B6472;}
.smpop button{all:unset;cursor:pointer;display:block;width:100%;box-sizing:border-box;text-align:center;margin-top:10px;padding:8px 10px;border-radius:8px;font-weight:700;font-size:12px;color:#fff;}`;
      doc.head.appendChild(st);
    }
    for (const src of MAPLIBRE_JS) {
      const ok = await new Promise<boolean>((res) => {
        const sc = doc.createElement('script'); sc.src = src; sc.async = true;
        sc.onload = () => res(!!w.maplibregl?.Map); sc.onerror = () => { sc.remove(); res(false); };
        doc.head.appendChild(sc);
      });
      if (ok) return w.maplibregl as MapLibre;
    }
    loading = null; return null;
  })();
  return loading;
}
