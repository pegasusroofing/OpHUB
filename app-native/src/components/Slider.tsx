// A sliding bar for a percentage: drag (or tap) along it. It follows your finger smoothly, then settles on the nearest
// `step` and calls onDone when let go. On an iPhone (web) the page mustn't scroll while you drag, or Safari cancels the
// drag part-way: touch-action none on the track stops that (Andy, 13 Nov 2026: "doesn't work smoothly on an iPhone"). It
// settles on 10s, the same as the task's saved percentage (snapPct), so what it shows is what's saved.
import { useRef, useState } from 'react';
import { PanResponder, Platform, Text, View } from 'react-native';

import { base } from '@/theme/theme';

export function Slider({ value, onDone, step = 10, color = '#16A34A' }: { value: number; onDone: (v: number) => void; step?: number; color?: string }) {
  const [drag, setDrag] = useState<number | null>(null);
  const track = useRef<unknown>(null);
  const width = useRef(1);
  const left = useRef(0);
  // Where it last was while dragging: saved on letting go, so it saves exactly what it showed (the let-go event's own
  // position can be a few pixels out on the web).
  const last = useRef(0);
  // Where the finger is along the track, 0–100, not rounded (so the bar moves smoothly).
  const raw = (pageX: number) => Math.max(0, Math.min(100, ((pageX - left.current) / width.current) * 100));
  const snap = (p: number) => Math.max(0, Math.min(100, Math.round(p / step) * step));
  const latest = useRef({ onDone });
  // eslint-disable-next-line react-hooks/refs
  latest.current = { onDone };
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => {
      // The track's left edge on the page. On the web, read it from the page itself (exact, whatever was touched);
      // on a phone app, where you pressed less how far into the track that was.
      const el = track.current as unknown as { getBoundingClientRect?: () => { left: number; width: number } } | null;
      if (Platform.OS === 'web' && el?.getBoundingClientRect) {
        const r = el.getBoundingClientRect();
        left.current = r.left + (typeof window !== 'undefined' ? window.scrollX : 0);
        width.current = r.width || width.current;
      } else left.current = e.nativeEvent.pageX - e.nativeEvent.locationX;
      last.current = raw(e.nativeEvent.pageX); setDrag(last.current);
    },
    onPanResponderMove: (e) => { last.current = raw(e.nativeEvent.pageX); setDrag(last.current); },
    onPanResponderRelease: () => { const v = snap(last.current); setDrag(null); latest.current.onDone(v); },
    onPanResponderTerminate: () => setDrag(null),
  }));
  const v = drag ?? value;
  const shown = drag == null ? v : snap(v);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View ref={track as never} {...pan.panHandlers} accessibilityRole="adjustable" accessibilityLabel="Progress" accessibilityValue={{ min: 0, max: 100, now: shown }}
        onLayout={(e) => { width.current = e.nativeEvent.layout.width || 1; }}
        style={{ flex: 1, height: 44, justifyContent: 'center', cursor: 'pointer', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' } as never}>
        <View pointerEvents="none" style={{ height: 8, borderRadius: 5, backgroundColor: base.line, overflow: 'hidden' }}>
          <View style={{ width: `${v}%`, height: '100%', backgroundColor: color }} />
        </View>
        <View pointerEvents="none" style={{ position: 'absolute', left: `${v}%`, marginLeft: -13, width: 26, height: 26, borderRadius: 13, backgroundColor: '#fff', borderWidth: 2, borderColor: color, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 3, elevation: 2 }} />
      </View>
      <Text style={{ width: 44, textAlign: 'right', fontWeight: '600', color: base.ink }}>{shown}%</Text>
    </View>
  );
}
