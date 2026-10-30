// An image from Supabase storage. Private buckets get a signed link (cached on the device).
import { useEffect, useState } from 'react';
import { Image, Pressable, View, type ImageStyle, type StyleProp } from 'react-native';

import { viewDoc } from '@/components/DocViewer';

import { publicUrl, resolveStorageUrl } from '@/lib/privateFiles';
import { base } from '@/theme/theme';

export function useStorageUrl(bucket: string, path: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!path) { setUrl(null); return; }
    resolveStorageUrl(publicUrl(bucket, path)).then((u) => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [bucket, path]);
  return url;
}

// For rows that store the full ".../object/public/..." address (e.g. report photos).
export function UrlImage({ url, style }: { url: string; style: StyleProp<ImageStyle> }) {
  const [u, setU] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    resolveStorageUrl(url).then((x) => { if (alive) setU(x); });
    return () => { alive = false; };
  }, [url]);
  if (!u) return <View style={[style as object, { backgroundColor: base.line }]} />;
  return <Image source={{ uri: u }} style={style} />;
}

/** zoom: tap to see it full size (the old app's viewImage). */
export function StorageImage({ bucket, path, style, zoom }: { bucket: string; path: string | null | undefined; style: StyleProp<ImageStyle>; zoom?: boolean }) {
  const url = useStorageUrl(bucket, path);
  if (!url) return <View style={[style as object, { backgroundColor: base.line }]} />;
  if (zoom) return <Pressable onPress={() => viewDoc(url, 'photo.jpg')} accessibilityLabel="View photo full size"><Image source={{ uri: url }} style={style} /></Pressable>;
  return <Image source={{ uri: url }} style={style} />;
}
