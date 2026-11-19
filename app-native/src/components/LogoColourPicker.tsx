// Choosing the company colours by clicking (Andy, 19 Nov 2026: "i want to be able to click to choose and then click on
// the uploaded logo to choose the two colours"). Pick which colour you're setting, then click the logo to take the
// colour under the pointer, tap one of the colours found in the logo, or one from the palette; the code box is still
// there for an exact colour. Reading the logo's colours needs the browser (the office laptop and the web app).
import { useEffect, useState } from 'react';
import { Image, Platform, Pressable, Text, TextInput, View, type GestureResponderEvent } from 'react-native';

import { Muted } from '@/components/ui';
import { mainColours, PALETTE, tapToPixel, toHex } from '@/lib/rules/logoColours';
import { base, radius } from '@/theme/theme';

const HEX = /^#[0-9a-f]{6}$/i;
const BOX = 220;
type Px = { data: Uint8ClampedArray; w: number; h: number };

export function LogoColourPicker({ logoUri, c1, c2, set1, set2 }: { logoUri: string | null; c1: string; c2: string; set1: (v: string) => void; set2: (v: string) => void }) {
  const [which, setWhich] = useState<1 | 2>(1);
  const [px, setPx] = useState<Px | null>(null);
  const [found, setFound] = useState<string[]>([]);
  const web = Platform.OS === 'web';
  useEffect(() => {
    if (!web || !logoUri) return;
    let gone = false;
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (gone) return;
      try {
        const k = Math.min(1, 400 / Math.max(img.naturalWidth, img.naturalHeight)), w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const g = c.getContext('2d'); if (!g) return;
        g.drawImage(img, 0, 0, w, h);
        const data = g.getImageData(0, 0, w, h).data;
        setPx({ data, w, h }); setFound(mainColours(data, 6));
      } catch { setPx(null); setFound([]); }
    };
    img.onerror = () => { if (!gone) { setPx(null); setFound([]); } };
    img.src = logoUri;
    return () => { gone = true; };
  }, [logoUri, web]);
  const cur = which === 1 ? c1 : c2, set = which === 1 ? set1 : set2;
  const fromLogo = (e: GestureResponderEvent) => {
    if (!px) return;
    const ne = e.nativeEvent as unknown as { locationX?: number; locationY?: number; offsetX?: number; offsetY?: number };
    const at = tapToPixel(ne.locationX ?? ne.offsetX ?? -1, ne.locationY ?? ne.offsetY ?? -1, BOX, BOX, px.w, px.h);
    if (!at) return;
    const i = (at.y * px.w + at.x) * 4;
    if (px.data[i + 3] < 128) return; // a see-through part of the logo
    set(toHex(px.data[i], px.data[i + 1], px.data[i + 2]));
  };
  const dot = (c: string, on: boolean, onPress: () => void, size = 30) => (
    <Pressable key={c} accessibilityRole="button" accessibilityLabel={`Use ${c}`} onPress={onPress}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c, borderWidth: on ? 3 : 1, borderColor: on ? base.ink : base.line }} />
  );
  const target = (n: 1 | 2, label: string, v: string) => (
    <Pressable key={n} accessibilityRole="button" accessibilityState={{ selected: which === n }} onPress={() => setWhich(n)}
      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: radius.input, borderWidth: which === n ? 2 : 1, borderColor: which === n ? base.ink : base.line, backgroundColor: base.card }}>
      <View style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: HEX.test(v) ? v : base.line, borderWidth: 1, borderColor: base.line }} />
      <View><Text style={{ fontWeight: '600', color: base.ink }}>{label}</Text><Muted>{v}</Muted></View>
    </Pressable>
  );
  return (
    <View>
      <Muted style={{ marginBottom: 8 }}>Choose which colour you&apos;re setting, then click your logo to take a colour from it, or pick one below.</Muted>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>{target(1, 'Primary Colour', c1)}{target(2, 'Secondary Colour', c2)}</View>
      {web && logoUri ? (
        <View style={{ alignItems: 'center', marginBottom: 10 }}>
          <Pressable onPress={fromLogo} accessibilityLabel="Click the logo to take a colour" style={{ width: BOX, height: BOX, borderRadius: 12, borderWidth: 1, borderColor: base.line, backgroundColor: '#fff', overflow: 'hidden' }}>
            <Image source={{ uri: logoUri }} style={{ width: BOX, height: BOX }} resizeMode="contain" />
          </Pressable>
          <Muted style={{ marginTop: 6 }}>{px ? `Click your logo to set the ${which === 1 ? 'primary' : 'secondary'} colour` : 'Loading your logo…'}</Muted>
          {!!found.length && (
            <>
              <Muted style={{ fontWeight: '600', marginTop: 10, marginBottom: 6 }}>Colours In Your Logo</Muted>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>{found.map((c) => dot(c, cur.toUpperCase() === c, () => set(c), 34))}</View>
            </>
          )}
        </View>
      ) : !logoUri ? <Muted style={{ marginBottom: 10 }}>Add your logo above to pick colours straight from it.</Muted> : null}
      <Muted style={{ fontWeight: '600', marginBottom: 6 }}>Or Choose A Colour</Muted>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>{PALETTE.map((c) => dot(c, cur.toUpperCase() === c, () => set(c)))}</View>
      <Muted style={{ fontWeight: '600' }}>{which === 1 ? 'Primary' : 'Secondary'} Colour Code</Muted>
      <TextInput value={cur} onChangeText={set} autoCapitalize="none" placeholder="#4E8FD1" style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 8, color: base.ink, marginBottom: 10 }} />
    </View>
  );
}
