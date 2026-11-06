// The document beside the page on the office laptop (Andy, 3 Nov 2026): a purchase invoice or PO with its PDF
// open on the right at half screen, Full to read it across the whole page, ✕ or the › strip down its left edge to
// close (a slim DOCUMENT tab brings it back, and the page widens so the lines fit on one row).
// Phones and narrow windows show the page only; the page's own button opens the document as before.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Image, Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { PdfPages, viewDoc } from '@/components/DocViewer';

type Mode = 'half' | 'full' | 'off';

export function DocSplit({ load, name, children, reloadKey }: { load: (() => Promise<string | null>) | null; name: string; children: ReactNode; reloadKey?: string }) {
  const { width } = useWindowDimensions();
  const can = Platform.OS === 'web' && width >= 1100 && !!load;
  const [mode, setMode] = useState<Mode>('half');
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [panelW, setPanelW] = useState(0);
  const [zoom, setZoom] = useState(1);
  // Fetched once, however often the page redraws.
  const started = useRef<string | null>(null), loader = useRef(load);
  useEffect(() => { loader.current = load; });
  useEffect(() => {
    if (!can || !loader.current) return undefined;
    if (started.current === reloadKey) return undefined;
    started.current = reloadKey ?? '';
    let alive = true, made: string | null = null;
    void loader.current().then((u) => { if (!alive) { if (u?.startsWith('blob:')) URL.revokeObjectURL(u); return; } made = u; if (u) { setUrl(u); setFailed(false); } else setFailed(true); }).catch(() => { if (alive) setFailed(true); });
    // Let go of a PDF made in the browser when it's replaced or the page closes.
    return () => { alive = false; if (made?.startsWith('blob:')) URL.revokeObjectURL(made); };
  }, [can, reloadKey]);
  const photo = /\.(jpe?g|png|gif|webp|heic)$/i.test(name);
  if (!can) return <>{children}</>;
  const btn = (label: string, on: boolean, onPress: () => void) => (
    <Pressable key={label} onPress={onPress} accessibilityRole="button" style={{ paddingHorizontal: 10, height: 26, justifyContent: 'center', borderRadius: 7, borderWidth: 1, borderColor: on ? '#111827' : '#e5e7eb', backgroundColor: on ? '#111827' : '#fff' }}>
      <Text style={{ fontSize: 12.5, fontWeight: '500', color: on ? '#fff' : '#111827' }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      <View style={[{ flex: 1, minWidth: 0 }, mode === 'full' && { display: 'none' }]}>{children}</View>
      {mode === 'off' ? (
        <Pressable onPress={() => setMode('half')} accessibilityRole="button" accessibilityLabel="Show the document" style={{ width: 36, borderLeftWidth: 1, borderLeftColor: '#e5e7eb', backgroundColor: '#fff', alignItems: 'center', paddingTop: 14, gap: 10 }}>
          <Text style={{ fontSize: 16, color: '#6b7280' }}>‹</Text>
          {'DOCUMENT'.split('').map((c, k) => <Text key={k} style={{ fontSize: 10.5, fontWeight: '600', color: '#6b7280', lineHeight: 12 }}>{c}</Text>)}
        </Pressable>
      ) : (
        <View style={{ width: mode === 'full' ? '100%' : '46%', flexDirection: 'row' }}>
        <Pressable onPress={() => setMode('off')} accessibilityRole="button" accessibilityLabel="Close the document" style={{ width: 22, borderLeftWidth: 1, borderLeftColor: '#e5e7eb', backgroundColor: '#F6F7F9', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 16, color: '#6b7280' }}>›</Text>
        </Pressable>
        <View style={{ flex: 1, minWidth: 0, borderLeftWidth: 1, borderLeftColor: '#e5e7eb', backgroundColor: '#f3f4f6' }} onLayout={(e) => setPanelW(e.nativeEvent.layout.width)}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 13.5, fontWeight: '600', color: '#111827' }}>{name}</Text>
            {btn('−', false, () => setZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100)))}
            <Text style={{ fontSize: 12, color: '#6b7280', minWidth: 38, textAlign: 'center' }}>{Math.round(zoom * 100)}%</Text>
            {btn('+', false, () => setZoom((z) => Math.min(4, Math.round((z + 0.25) * 100) / 100)))}
            {btn('Half', mode === 'half', () => setMode('half'))}
            {btn('Full', mode === 'full', () => setMode('full'))}
            {!!url && btn('Open', false, () => viewDoc(url, photo || name.endsWith('.pdf') ? name : `${name}.pdf`))}
            {btn('✕', false, () => setMode('off'))}
          </View>
          {url && photo ? <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }} horizontal={zoom > 1}><Image source={{ uri: url }} resizeMode="contain" style={{ width: Math.max(100, (panelW - 24) * zoom), height: Math.max(200, (panelW - 24) * 1.4 * zoom) }} /></ScrollView>
            : url && panelW > 0 ? <PdfPages key={`${url}${mode}`} url={url} zoom={zoom} width={panelW - 32} light />
            : <Text style={{ color: '#6b7280', marginTop: 40, textAlign: 'center' }}>{failed ? 'Couldn’t open the document.' : 'Loading document…'}</Text>}
        </View>
        </View>
      )}
    </View>
  );
}
