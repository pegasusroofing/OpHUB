// A sliding bar for a percentage: drag (or tap) along it; it snaps to `step` and calls onDone when let go.
import { useRef, useState } from 'react';
import { PanResponder, Text, View } from 'react-native';

import { base } from '@/theme/theme';

export function Slider({ value, onDone, step = 10, color = '#16A34A' }: { value: number; onDone: (v: number) => void; step?: number; color?: string }) {
  const [drag, setDrag] = useState<number | null>(null);
  const width = useRef(1);
  const left = useRef(0);
  const at = (pageX: number) => Math.max(0, Math.min(100, Math.round(((pageX - left.current) / width.current) * 100 / step) * step));
  const latest = useRef({ onDone, drag });
  // eslint-disable-next-line react-hooks/refs
  latest.current = { onDone, drag };
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => {
      // The track's left edge on the page: where you pressed, less how far into the track that was.
      left.current = e.nativeEvent.pageX - e.nativeEvent.locationX;
      setDrag(at(e.nativeEvent.pageX));
    },
    onPanResponderMove: (e) => setDrag(at(e.nativeEvent.pageX)),
    onPanResponderRelease: (e) => { const v = at(e.nativeEvent.pageX); setDrag(null); latest.current.onDone(v); },
    onPanResponderTerminate: () => setDrag(null),
  }));
  const v = drag ?? value;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View {...pan.panHandlers} accessibilityRole="adjustable" accessibilityLabel="Progress" accessibilityValue={{ min: 0, max: 100, now: v }}
        onLayout={(e) => { width.current = e.nativeEvent.layout.width || 1; }}
        style={{ flex: 1, height: 32, justifyContent: 'center', cursor: 'pointer' } as never}>
        <View pointerEvents="none" style={{ height: 8, borderRadius: 5, backgroundColor: base.line, overflow: 'hidden' }}>
          <View style={{ width: `${v}%`, height: '100%', backgroundColor: color }} />
        </View>
        <View pointerEvents="none" style={{ position: 'absolute', left: `${v}%`, marginLeft: -11, width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', borderWidth: 2, borderColor: color, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 3, elevation: 2 }} />
      </View>
      <Text style={{ width: 44, textAlign: 'right', fontWeight: '800', color: base.ink }}>{v}%</Text>
    </View>
  );
}
