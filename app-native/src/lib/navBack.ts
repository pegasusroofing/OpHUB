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

/** One level up, by the page's address: what back does when the page has no history, as after a refresh or a Finance tab change. */
export function parentOf(rawPath: string): string {
  const p = rawPath.split('?')[0].replace(/\/$/, ''), s = p.split('/').filter(Boolean);
  if (s[0] === 'fin') {
    if (s[1] === 'job') return s.length > 3 ? `/fin/job/${s[2]}` : '/fin/jobs';
    const list = FIN_LIST[s[1] || ''];
    if (s.length === 1) return '/home';
    if (s[1] === 'yardin') return '/fin/yard';
    if (list && s.length > 2) return list;
    return s.length > 2 ? `/fin/${s[1]}` : '/fin';
  }
  if (s[0] === 'pm' && PM_LIST[s[1] || '']) return PM_LIST[s[1] || ''];
  if (s[0] === 'pm') return s.length > 2 ? `/${s.slice(0, s.length - 1).join('/')}` : '/home';
  if (s[0] === 'sites') {
    if (s.length === 1 || s[1] === 'new') return s.length === 1 ? '/home' : '/sites';
    return s.length > 2 ? `/${s.slice(0, s.length - 1).join('/')}` : '/sites';
  }
  return '/home';
}
const PM_LIST: Record<string, string> = { delivery: '/pm/deliveries', piquery: '/pm/hub', survey: '/pm/reports' };
// Finance pages for one record belong to the list they're picked from.
const FIN_LIST: Record<string, string> = { po: '/fin/purchases', pinv: '/fin/purchases?tab=invoices', plant: '/fin/purchases?tab=plant', inbox: '/fin/purchases?tab=invoices', labour: '/fin/subs', sub: '/fin/subs?tab=orders', sapp: '/fin/subs?tab=apps' };

/** The first page you see on opening a part of the app (Andy, 1 Nov 2026): where the top bar's bold line goes, from anywhere inside it. */
export function areaHome(rawPath: string): string {
  const p = rawPath.split('?')[0].replace(/\/$/, ''), s = p.split('/').filter(Boolean);
  if (s[0] === 'fin') return '/fin';
  if (s[0] === 'sites') return '/sites';
  if (s[0] === 'pm' && s[1]) return PM_LIST[s[1]] || `/pm/${s[1]}`;
  return '/home';
}
