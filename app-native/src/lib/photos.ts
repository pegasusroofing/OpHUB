// Taking/picking photos and making the three sizes the current app stores
// (full 1280 wide, mid 800, thumb 200 — see SOW_PHOTO in rules/sow.ts).
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { SOW_PHOTO } from './rules/sow';

export type Picked = { uri: string; width: number; height: number };

export async function pickPhotos(source: 'camera' | 'library', multiple = true): Promise<Picked[] | { error: string }> {
  try {
    if (source === 'camera') {
      const p = await ImagePicker.requestCameraPermissionsAsync();
      if (!p.granted) return { error: "Camera permission denied. Enable it for this app in your phone's Settings." };
      const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
      return r.canceled ? [] : r.assets.map((a) => ({ uri: a.uri, width: a.width, height: a.height }));
    }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: multiple, quality: 1 });
    return r.canceled ? [] : r.assets.map((a) => ({ uri: a.uri, width: a.width, height: a.height }));
  } catch (e) {
    return { error: (e instanceof Error && e.message) || 'Could not open the camera or photos.' };
  }
}

async function shrink(uri: string, w: number, h: number, maxW: number | null, maxSide: number | null, q: number) {
  const scale = Math.min(1, maxW ? maxW / w : (maxSide as number) / Math.max(w, h));
  const ctx = ImageManipulator.manipulate(uri);
  if (scale < 1) ctx.resize({ width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) });
  const img = await ctx.renderAsync();
  return img.saveAsync({ compress: q, format: SaveFormat.JPEG });
}

/** Full, mid and thumb JPEGs. Mid/thumb are best effort: the full photo alone still works. */
export async function makeSizes(p: Picked): Promise<{ full: string; mid: string | null; thumb: string | null }> {
  const full = await shrink(p.uri, p.width, p.height, SOW_PHOTO.full.maxW, null, SOW_PHOTO.full.q);
  let mid: string | null = null, thumb: string | null = null;
  try {
    const m = await shrink(full.uri, full.width, full.height, null, SOW_PHOTO.mid.max, SOW_PHOTO.mid.q);
    mid = m.uri;
    thumb = (await shrink(m.uri, m.width, m.height, null, SOW_PHOTO.thumb.max, SOW_PHOTO.thumb.q)).uri;
  } catch { /* keep going with the full photo */ }
  return { full: full.uri, mid, thumb };
}

/** Single smaller photo for things like the leftover-material picture. */
export async function compressOne(p: Picked): Promise<string> {
  return (await shrink(p.uri, p.width, p.height, SOW_PHOTO.full.maxW, null, SOW_PHOTO.full.q)).uri;
}
