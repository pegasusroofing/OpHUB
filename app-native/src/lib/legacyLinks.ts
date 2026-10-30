// Links made by the old single-page app keep working (switch-over): invite links already shared
// (…#/join/<id>), password-reset emails (…#/reset?t=&e=) and the OneDrive sign-in coming back
// (?onedrive=success|error, 890 / 090). Web only — the phone app gets ophub://onedrive-callback.
import { Platform } from 'react-native';

export const ONEDRIVE_DONE = (status: string | null | undefined) => (status === 'success' ? 'OneDrive connected' : 'OneDrive connection failed — try again.');

export function legacyTarget(): { to: string; toast?: string } | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const h = window.location.hash || '';
  const q = h.includes('?') ? new URLSearchParams(h.slice(h.indexOf('?') + 1)) : null;
  const od = new URLSearchParams(window.location.search).get('onedrive') || q?.get('onedrive');
  if (od) return { to: '/pm/admin/onedrive', toast: ONEDRIVE_DONE(od) };
  const m = h.match(/^#\/join\/([^/?#]+)/);
  if (m) return { to: `/join/${m[1]}` };
  if (h.startsWith('#/reset')) return { to: `/reset${h.slice('#/reset'.length)}` };
  return null;
}
