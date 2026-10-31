// The back arrow, as the current app (Andy, 31 Oct 2026): inside one part of the app it goes up a
// level; after a tile or link into a different part (Projects into Finance, say) it goes back to the
// page you came from, and from there up a level again.
const area = (p: string) => p.split('/')[1] || '';
const jumps = new Map<string, string>();
let last = '', backing = false;

/** The job this page belongs to, for saving an export to its OneDrive folder. */
export const currentJobId = () => (last.match(/^\/(?:sites|fin\/job)\/([0-9a-f-]{36})/) || [])[1] || null;

/** Called on every page change. */
export function recordPath(p: string) {
  if (p === last) return;
  if (last && !backing && area(last) !== area(p)) jumps.set(p, last);
  else jumps.delete(p);
  backing = false;
  last = p;
}

/** The page this one was jumped to from, if any. Used once. */
export function takeJump(p: string): string | null {
  const j = jumps.get(p);
  if (!j) return null;
  jumps.delete(p);
  backing = true;
  return j;
}
