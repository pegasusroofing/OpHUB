// A QR code for a link (visitor sign-in, 21 Nov 2026), drawn with react-native-svg so it works on a phone and a laptop.
import { create } from 'qrcode/lib/core/qrcode';
import { useMemo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';

export function QrCode({ value, size = 220 }: { value: string; size?: number }) {
  const { n, d } = useMemo(() => {
    const m = create(value, { errorCorrectionLevel: 'M' }).modules;
    let p = '';
    for (let y = 0; y < m.size; y++) for (let x = 0; x < m.size; x++) if (m.data[y * m.size + x]) p += `M${x + 4},${y + 4}h1v1h-1z`;
    return { n: m.size + 8, d: p };
  }, [value]);
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${n} ${n}`} accessibilityLabel="QR code">
      <Rect width={n} height={n} fill="#fff" />
      <Path d={d} fill="#000" />
    </Svg>
  );
}
