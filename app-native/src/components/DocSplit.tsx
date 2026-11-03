// The document beside the page on the office laptop (Andy, 3 Nov 2026): a purchase invoice or PO with its PDF
// open on the right at half screen, Full to read it across the whole page, ✕ to close (a slim tab brings it back).
// Phones and narrow windows show the page only; the page's own button opens the document as before.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Image, Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { PdfPages, viewDoc } from '@/components/DocViewer';

type Mode = 'half' | 'full' | 'off';

export function DocSplit({ load, name, children }: { load: (() => Promise<string | null>) | null; name: string; children: ReactNode }) {
  const { width } = useWindowDimensions();
  const can = Platform.OS === 'web' && width >= 1100 && !!load;
  const [mode, setMode] = useState<Mode>('half');
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [panelW, setPanelW] = useState(0);
  const [zoom, setZoom] = useState(1);
  // Fetched once, however often the page redraws.
  const started = useRef(false), loader = useRef(load);
  useEffect(() => { loader.current = load; });
  useEffect(() => {
    if (!can || started.current || !loader.current) return;
    started.current = true;
    void loader.current().then((u) => { if (u) setUrl(u); else setFailed(true); }).catch(() => setFailed(true));
  }, [can]);
  const photo = /\.(jpe?g|png|gif|webp|heic)$/i.test(name);
  if (!can) return <>{children}</>;
  const btn = (label: string, on: boolean, onPress: () => void) => (
    <Pressable key={label} onPress={onPress} accessibilityRole="button" style={{ paddingHorizontal: 10, height: 26, justifyContent: 'center', borderRadius: 7, borderWidth: 1, borderColor: on ? '#111827' : '#e5e7eb', backgroundColor: on ? '#111827' : '#fff' }}>
      <Text style={{ fontSize: 12.5, fontWeight: '500', color: on ? '#fff' : '#111827' }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      {mode !== 'full' && <View style={{ flex: 1, minWidth: 0 }}>{children}</View>}
      {mode === 'off' ? (
        <Pressable onPress={() => setMode('half')} accessibilityRole="button" accessibilityLabel="Show the document" style={{ width: 34, borderLeftWidth: 1, borderLeftColor: '#e5e7eb', backgroundColor: '#fff', alignItems: 'center', paddingTop: 16 }}>
          <Text style={{ fontSize: 16 }}>📄</Text>
          <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>‹</Text>
        </Pressable>
      ) : (
        <View style={{ width: mode === 'full' ? '100%' : '46%', borderLeftWidth: 1, borderLeftColor: '#e5e7eb', backgroundColor: '#f3f4f6' }} onLayout={(e) => setPanelW(e.nativeEvent.layout.width)}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 13.5, fontWeight: '600', color: '#111827' }}>{name}</Text>
            {btn('−', false, () => setZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100)))}
            <Text style={{ fontSize: 12, color: '#6b7280', minWidth: 38, textAlign: 'center' }}>{Math.round(zoom * 100)}%</Text>
            {btn('+', false, () => setZoom((z) => Math.min(4, Math.round((z + 0.25) * 100) / 100)))}
            {btn('Half', mode === 'half', () => setMode('half'))}
            {btn('Full', mode === 'full', () => setMode('full'))}
            {!!url && btn('Open', false, () => viewDoc(url, name.endsWith('.pdf') ? name : `${name}.pdf`))}
            {btn('✕', false, () => setMode('off'))}
          </View>
          {url && photo ? <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }} horizontal={zoom > 1}><Image source={{ uri: url }} resizeMode="contain" style={{ width: Math.max(100, (panelW - 24) * zoom), height: Math.max(200, (panelW - 24) * 1.4 * zoom) }} /></ScrollView>
            : url && panelW > 0 ? <PdfPages key={`${url}${mode}`} url={url} zoom={zoom} width={panelW - 32} light />
            : <Text style={{ color: '#6b7280', marginTop: 40, textAlign: 'center' }}>{failed ? 'Couldn’t open the document.' : 'Loading document…'}</Text>}
        </View>
      )}
    </View>
  );
}
