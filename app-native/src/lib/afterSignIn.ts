// Where to go once signed in, left by a sign-up link (Andy, 19 Nov 2026: the subcontractor link "needs to take them to
// the sign up page that when they sign up, then takes them straight to the subcontractor sign up page"). Kept on the
// device, used once, and only for pages on this list.
import { plainDelete, plainGet, plainSet } from '@/lib/kv';

const KEY = 'ophub_next';
const ALLOWED = ['/subform'];

export const rememberAfterSignIn = (path: string) => (ALLOWED.includes(path) ? plainSet(KEY, path) : Promise.resolve());
/** The page to open now (and forget it), or null. */
export async function takeAfterSignIn(): Promise<string | null> {
  const next = await plainGet<string>(KEY, '');
  if (!next) return null;
  await plainDelete(KEY);
  return ALLOWED.includes(next) ? next : null;
}
