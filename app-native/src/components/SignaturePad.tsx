// Draw-your-signature pad. Ported from 240-my-signature. Produces a PNG
// (same as today, so the PDF exports can embed it): phones snapshot the drawing,
// the web redraws the strokes onto a canvas.
import { forwardRef, useImperativeHandle, useMemo, useRef, useState, type ComponentRef } from 'react';
import { PanResponder, Platform, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import { File } from 'expo-file-system';

import { base } from '@/theme/theme';

type Pt = { x: number; y: number };
export type SignaturePadHandle = { clear: () => void; isEmpty: () => boolean; toPng: () => Promise<ArrayBuffer | null> };

const toPath = (pts: Pt[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

export const SignaturePad = forwardRef<SignaturePadHandle, { height?: number }>(function SignaturePad({ height = 160 }, ref) {
  const [strokes, setStrokes] = useState<Pt[][]>([]);
  const current = useRef<Pt[] | null>(null);
  const [, force] = useState(0);
  const size = useRef({ w: 0, h: height });
  const view = useRef<ComponentRef<typeof View>>(null);

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => { current.current = [{ x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }]; force((n) => n + 1); },
    onPanResponderMove: (e) => { current.current?.push({ x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }); force((n) => n + 1); },
    onPanResponderRelease: () => {
      const s = current.current;
      current.current = null;
      if (s && s.length) setStrokes((all) => [...all, s.length === 1 ? [s[0], { x: s[0].x + 0.5, y: s[0].y + 0.5 }] : s]);
    },
  }), []);

  useImperativeHandle(ref, () => ({
    clear: () => setStrokes([]),
    isEmpty: () => strokes.length === 0,
    toPng: async () => {
      if (!strokes.length) return null;
      if (Platform.OS === 'web') {
        const ratio = globalThis.devicePixelRatio || 1;
        const c = document.createElement('canvas');
        c.width = Math.max(1, size.current.w * ratio); c.height = Math.max(1, size.current.h * ratio);
        const ctx = c.getContext('2d');
        if (!ctx) return null;
        ctx.scale(ratio, ratio);
        ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#101114';
        for (const s of strokes) { ctx.beginPath(); s.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke(); }
        const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
        return blob ? blob.arrayBuffer() : null;
      }
      const uri = await captureRef(view, { format: 'png', quality: 1, result: 'tmpfile' });
      const bytes = await new File(uri).bytes();
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    },
  }), [strokes]);

  return (
    <View ref={view} collapsable={false} {...responder.panHandlers}
      onLayout={(e) => { size.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height }; }}
      style={{ height, backgroundColor: '#fff', borderWidth: 1.5, borderStyle: 'dashed', borderColor: base.line, borderRadius: 8 }}>
      <Svg width="100%" height="100%" pointerEvents="none">
        {strokes.map((s, i) => <Path key={i} d={toPath(s)} stroke="#101114" strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />)}
        {current.current && <Path d={toPath(current.current)} stroke="#101114" strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
      </Svg>
    </View>
  );
});
