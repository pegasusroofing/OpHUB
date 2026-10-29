// The sites map (125): pins coloured by status; on the full map, tapping a pin
// shows the job's details with "Open project". The Home card (computer only,
// managers) is a small still preview that opens the full map. Web only.
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { heading } from '@/lib/fonts';
import { loadMapLibre, MAP_COLOURS, MAP_STYLE, mapPoints, type MapPoint } from '@/lib/sitesMap';
import { fullSiteAddress } from '@/lib/rules/checkin';
import type { Site } from '@/lib/types';
import { base, useDesk, useTheme } from '@/theme/theme';

const STATUS = { live: 'Live', upcoming: 'Upcoming', closed: 'Closed' } as Record<string, string>;
type AnyMap = { remove: () => void; resize: () => void; fitBounds: (b: unknown, o: object) => void; jumpTo: (o: object) => void; flyTo: (o: object) => void; addControl: (c: unknown, p: string) => void; once: (e: string, f: () => void) => void };
type AnyMarker = { setLngLat: (x: [number, number]) => AnyMarker; setPopup: (p: unknown) => AnyMarker; addTo: (m: unknown) => AnyMarker; getLngLat: () => unknown; getPopup: () => { isOpen: () => boolean } | null; togglePopup: () => void };

export type MapHandle = { focus: (siteId: string) => void };

/** Draws the map into a box. show = which statuses (mini: everything not closed). */
export function SitesMapView({ sites, mini, show, people, onPoints, handle, height }: {
  sites: Site[]; mini?: boolean; show?: Record<string, boolean>; people?: { id: string; name: string }[]; onPoints?: (p: { pts: MapPoint[]; missing: MapPoint[] }) => void; handle?: (h: MapHandle) => void; height?: number | string;
}) {
  const t = useTheme();
  const box = useRef<ComponentRef<typeof View>>(null);
  const [failed, setFailed] = useState(false);
  const key = `${sites.map((s) => `${s.id}:${s.status}:${s.postcode}`).join('|')}|${JSON.stringify(show || {})}`;
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let map: AnyMap | null = null, gone = false;
    void (async () => {
      const [ml, pp] = await Promise.all([loadMapLibre(), mapPoints(sites)]);
      if (gone) return;
      onPoints?.(pp);
      const el = box.current as unknown as HTMLElement | null;
      if (!ml || !el) { setFailed(!ml); return; }
      el.innerHTML = '';
      const shown = pp.pts.filter((p) => (mini ? p.st !== 'closed' : (show ?? {})[p.st]));
      try {
        map = new ml.Map({ container: el, style: MAP_STYLE, center: [-1.5, 52.6], zoom: 5.3, attributionControl: { compact: true }, interactive: !mini, dragRotate: false, pitchWithRotate: false }) as AnyMap;
      } catch { setFailed(true); return; }
      if (!mini) map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right');
      const markers: Record<string, AnyMarker> = {};
      shown.forEach((p) => {
        const pin = document.createElement('div');
        pin.className = `smpin${mini ? ' mini' : ''}`; pin.style.setProperty('--c', MAP_COLOURS[p.st] || '#555'); pin.title = p.s.name; pin.innerHTML = '<span></span>';
        const mk = (new ml.Marker({ element: pin, anchor: 'bottom' }) as AnyMarker).setLngLat([p.lng as number, p.lat as number]);
        if (!mini) mk.setPopup((new ml.Popup({ offset: 28, closeButton: true, maxWidth: '280px' }) as { setDOMContent: (n: Node) => unknown }).setDOMContent(popup(p, people, t.brand1)));
        mk.addTo(map); markers[p.s.id] = mk;
      });
      const fit = () => {
        if (!map || !shown.length) return;
        if (shown.length === 1) { map.jumpTo({ center: [shown[0].lng, shown[0].lat], zoom: 12 }); return; }
        const b = new ml.LngLatBounds() as { extend: (x: [number, number]) => void };
        shown.forEach((p) => b.extend([p.lng as number, p.lat as number]));
        map.fitBounds(b, { padding: mini ? 40 : 70, maxZoom: 13, duration: 0 });
      };
      fit();
      setTimeout(() => { try { map?.resize(); fit(); } catch { /* gone */ } }, 80);
      handle?.({ focus: (id) => { const mk = markers[id]; if (!mk || !map) return; map.flyTo({ center: mk.getLngLat(), zoom: 14, speed: 1.6 }); if (mk.getPopup() && !mk.getPopup()?.isOpen()) mk.togglePopup(); } });
    })();
    return () => { gone = true; try { map?.remove(); } catch { /* already gone */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, mini]);
  if (Platform.OS !== 'web') return null;
  return failed
    ? <View style={{ height: height as number, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: base.slate }}>Map could not load — check your connection.</Text></View>
    : <View ref={box} style={{ height: height as number, width: '100%', backgroundColor: '#EEF0F2' }} />;
}

function popup(p: MapPoint, people: { id: string; name: string }[] | undefined, brand: string): HTMLElement {
  const s = p.s, d = document.createElement('div');
  d.className = 'smpop';
  const add = (tag: string, cls: string, text: string) => { const e = document.createElement(tag); e.className = cls; e.textContent = text; d.appendChild(e); return e; };
  add('b', 't', s.name);
  add('div', 'a', fullSiteAddress(s) || p.pc || '');
  const st = add('div', 'st', `● ${STATUS[p.st] || p.st}`); st.style.color = MAP_COLOURS[p.st];
  const rows = document.createElement('div'); rows.className = 'rows';
  const pm = s.responsible_pm_id ? people?.find((x) => x.id === s.responsible_pm_id)?.name : '';
  const start = s.start_date ? new Date(`${s.start_date}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  ([['Job no.', s.job_number], ['PM', pm], ['Client', s.client_name], ['Starts', p.st === 'upcoming' ? start : '']] as [string, string | null | undefined][]).forEach(([k, v]) => {
    if (!v) return;
    const r = document.createElement('div'); r.className = 'r';
    const a = document.createElement('span'); a.textContent = k; const b = document.createElement('b'); b.textContent = v;
    r.appendChild(a); r.appendChild(b); rows.appendChild(r);
  });
  d.appendChild(rows);
  const btn = document.createElement('button'); btn.type = 'button'; btn.textContent = 'Open project ›'; btn.style.background = brand;
  btn.onclick = () => router.push(`/sites/${s.id}` as never);
  d.appendChild(btn);
  return d;
}

/** The Home page card: computer only, managers. Click to open the full map. */
export function SitesMapCard({ sites }: { sites: Site[] }) {
  const t = useTheme();
  const desk = useDesk();
  const [count, setCount] = useState('');
  if (!desk) return null;
  return (
    <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#ECEEF2', borderRadius: 18, padding: 12, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4, paddingTop: 2, paddingBottom: 10 }}>
        <Text style={[heading(700), { fontSize: 14, color: base.ink }]}>Sites map</Text>
        <Text style={{ fontSize: 11, color: base.slateLight, fontStyle: 'italic' }}>{count}</Text>
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => router.push('/pm/sitemap' as never)}><Text style={{ fontSize: 12.5, fontWeight: '800', color: t.brand1 }}>Open full map ›</Text></Pressable>
      </View>
      <Pressable onPress={() => router.push('/pm/sitemap' as never)} style={{ borderRadius: 12, overflow: 'hidden' }}>
        <View pointerEvents="none">
          <SitesMapView sites={sites} mini height={340} onPoints={({ pts, missing }) => {
            const shown = pts.filter((p) => p.st !== 'closed').length, miss = missing.filter((x) => x.st !== 'closed').length;
            setCount(`${shown} site${shown === 1 ? '' : 's'} on the map${miss ? ` · ${miss} without a postcode` : ''}`);
          }} />
        </View>
      </Pressable>
    </View>
  );
}
