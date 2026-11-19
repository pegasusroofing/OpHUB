// A map snapshot of the job, chosen in the app (Andy, 19 Nov 2026: "in the site layout plan, allow for a snapshot of
// the project to be chosen in the app ... that can then be marked up and same for fire route plan"). Opens the map
// on the job; move and zoom to frame it, then Use This View gives a picture of exactly that view, with the job marked
// by a red pin and the map's credit in the corner, ready to mark up. Web only (the map is drawn by the browser).
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Modal, Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';

import { Button, Muted } from '@/components/ui';
import { darkenRoads, loadMapLibre, MAP_STYLE } from '@/lib/sitesMap';
import { base } from '@/theme/theme';

type Snap = { getCanvas: () => HTMLCanvasElement; project: (x: [number, number]) => { x: number; y: number }; remove: () => void; on: (e: string, f: () => void) => void; addControl: (c: unknown, where?: string) => void };

export function MapSnapshot({ at, onClose }: { at: { lat: number; lon: number } | null; onClose: (picture: string | null) => void }) {
  const { width, height } = useWindowDimensions();
  const box = useRef<ComponentRef<typeof View>>(null);
  const map = useRef<Snap | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>(() => (Platform.OS !== 'web' || !at ? 'failed' : 'loading'));
  const W = Math.min(width - 24, 960), H = Math.min(Math.round(W * 0.68), height - 210);
  useEffect(() => {
    if (Platform.OS !== 'web' || !at) return;
    let gone = false;
    void (async () => {
      const ml = await loadMapLibre();
      const el = box.current as unknown as HTMLElement | null;
      if (gone) return;
      if (!ml || !el) { setState('failed'); return; }
      try {
        // preserveDrawingBuffer keeps the drawn map readable, so the snapshot can copy it.
        const m = new (ml as unknown as { Map: new (o: object) => Snap }).Map({ container: el, style: MAP_STYLE, center: [at.lon, at.lat], zoom: 17.6, maxZoom: 19.5, preserveDrawingBuffer: true, attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false });
        map.current = m;
        m.addControl(new (ml as unknown as { NavigationControl: new (o: object) => unknown }).NavigationControl({ showCompass: false }), 'top-right');
        // The job's pin while framing it (the snapshot draws its own, as pins sit above the map).
        (new (ml as unknown as { Marker: new (o: object) => { setLngLat: (x: [number, number]) => { addTo: (mm: unknown) => unknown } } }).Marker({ color: '#D92D20' })).setLngLat([at.lon, at.lat]).addTo(m);
        m.on('load', () => { darkenRoads(m as never); if (!gone) setState('ready'); });
      } catch { setState('failed'); }
    })();
    return () => { gone = true; try { map.current?.remove(); } catch { /* already gone */ } map.current = null; };
  }, [at]);

  const take = () => {
    const m = map.current; if (!m || !at) return;
    try {
      const src = m.getCanvas(), c = document.createElement('canvas');
      c.width = src.width; c.height = src.height;
      const g = c.getContext('2d'); if (!g) return;
      g.drawImage(src, 0, 0);
      const k = src.width / (src.clientWidth || src.width), p = m.project([at.lon, at.lat]);
      // The job: a red pin.
      const x = p.x * k, y = p.y * k, r = 9 * k;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = '#D92D20'; g.fill(); g.lineWidth = 3 * k; g.strokeStyle = '#fff'; g.stroke();
      // The map's credit.
      const credit = '© OpenStreetMap contributors · OpenFreeMap';
      g.font = `${Math.round(11 * k)}px Arial`;
      const tw = g.measureText(credit).width + 10 * k;
      g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(c.width - tw, c.height - 18 * k, tw, 18 * k);
      g.fillStyle = '#333'; g.fillText(credit, c.width - tw + 5 * k, c.height - 5 * k);
      onClose(c.toDataURL('image/jpeg', 0.9));
    } catch { setState('failed'); }
  };

  return (
    <Modal transparent animationType="fade" onRequestClose={() => onClose(null)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 12 }}>
        <View style={{ backgroundColor: base.card, borderRadius: 14, padding: 12, width: W + 24, maxWidth: '100%' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
            <Text style={{ flex: 1, fontWeight: '600', fontSize: 17, color: base.ink }}>Choose A Map Snapshot</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={() => onClose(null)}><Text style={{ fontSize: 18, color: base.slate, fontWeight: '600' }}>✕</Text></Pressable>
          </View>
          <Muted style={{ marginBottom: 8 }}>Move and zoom the map to frame the job (the red pin), then press Use This View. You mark it up next.</Muted>
          <View ref={box} style={{ width: W, height: H, borderRadius: 10, overflow: 'hidden', backgroundColor: '#EEF0F3' }} />
          {state === 'failed' && <Muted style={{ marginTop: 8, color: base.warn }}>{at ? 'The map could not load here - check your signal, or use a photo instead.' : "This job has no postcode or check-in point to centre the map on - add one, or use a photo instead."}</Muted>}
          <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 10 }}>
            <Button title={state === 'loading' ? 'Loading Map…' : 'Use This View'} disabled={state !== 'ready'} onPress={take} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
