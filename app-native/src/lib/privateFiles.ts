// Signed links for files in private storage buckets. Ported from 065-private-files.js.
// Rows in the database still hold ".../object/public/<bucket>/<path>" addresses. For the
// private buckets those are swapped for a signed link (valid 7 days, renewed when less
// than a day is left), cached on the device so pictures load with no signal.
import { plainGet, plainSet } from './kv';
import { SUPABASE_URL, supabase } from './supabase';

export const PRIVATE_BUCKETS = new Set([
  'mc-documents', 'signatures', 'site-photos', 'incident-photos', 'rams-docs', 'coshh-docs',
  'coshh-library', 'drawings', 'operative-tools', 'finance-docs',
]);
const PUBLIC_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/`;
const TTL_S = 7 * 24 * 3600;
const MIN_LEFT_MS = 24 * 3600 * 1000;
const CACHE_KEY = 'ophub_signed_v1';

type Parsed = { bucket: string; path: string; query: string; hash: string; key: string };
type Signed = Record<string, { u: string; e: number }>;

let signed: Signed | null = null;
async function cache(): Promise<Signed> {
  if (!signed) signed = await plainGet<Signed>(CACHE_KEY, {});
  return signed;
}

export function publicUrl(bucket: string, path: string): string {
  return PUBLIC_PREFIX + bucket + '/' + path.split('/').map(encodeURIComponent).join('/');
}

export function storageParse(u: string): Parsed | null {
  if (typeof u !== 'string' || !u.startsWith(PUBLIC_PREFIX)) return null;
  const rest = u.slice(PUBLIC_PREFIX.length);
  const qi = rest.indexOf('?'), hi = rest.indexOf('#');
  const end = qi > -1 ? qi : hi > -1 ? hi : rest.length;
  const main = rest.slice(0, end);
  const query = qi > -1 ? rest.slice(qi + 1).split('#')[0] : '';
  const hash = hi > -1 ? rest.slice(hi) : '';
  const si = main.indexOf('/');
  if (si < 1) return null;
  const bucket = main.slice(0, si);
  if (!PRIVATE_BUCKETS.has(bucket)) return null;
  let path = main.slice(si + 1);
  try { path = decodeURIComponent(path); } catch { /* keep as is */ }
  return { bucket, path, query, hash, key: `${bucket}/${path}` };
}

function withExtras(url: string, p: Parsed): string {
  let u = url;
  if (p.query) {
    const extra = p.query.split('&').filter((x) => x && !x.startsWith('token='));
    if (extra.length) u += '&' + extra.join('&');
  }
  return p.hash ? u + p.hash : u;
}

// The address to actually use. Public files come straight back; private ones get signed.
// Returns null if a private file can't be signed right now (no signal and nothing cached).
export async function resolveStorageUrl(u: string): Promise<string | null> {
  const p = storageParse(u);
  if (!p) return u;
  const c = await cache();
  const hit = c[p.key];
  if (hit && hit.e - Date.now() > MIN_LEFT_MS) return withExtras(hit.u, p);
  const { data, error } = await supabase.storage.from(p.bucket).createSignedUrl(p.path, TTL_S);
  if (error || !data?.signedUrl) return hit ? withExtras(hit.u, p) : null;
  c[p.key] = { u: data.signedUrl, e: Date.now() + TTL_S * 1000 };
  plainSet(CACHE_KEY, c);
  return withExtras(data.signedUrl, p);
}

export async function clearSignedCache(): Promise<void> {
  signed = {};
  await plainSet(CACHE_KEY, {});
}
