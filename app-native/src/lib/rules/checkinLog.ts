// Admin Centre › Check-In Logs (300 checkinLogRange / pairCheckinSessions). Pure.

export type LogRow = { ts: string; type: string; site_id: string | null; user_id: string };
export type Session = { inTs: string | null; outTs: string | null; siteId: string | null };

const startOfWeek = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; };

/** Monday–Sunday week, or calendar month, `offset` back from now; or chosen dates. */
export function logRange(mode: 'weekly' | 'monthly' | 'yearly', offset: number, from?: string, to?: string, now = Date.now()) {
  if (mode === 'yearly' && !(from && to)) {
    const y = new Date(now).getFullYear() + offset;
    return { start: +new Date(y, 0, 1), end: +new Date(y + 1, 0, 1), label: String(y), custom: false };
  }
  if (from && to) {
    const f = new Date(`${from}T00:00:00`), t = new Date(`${to}T00:00:00`), fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    return { start: +f, end: +t + 864e5, label: `${fmt(f)} – ${fmt(t)}`, custom: true };
  }
  if (mode === 'monthly') {
    const n = new Date(now), s = new Date(n.getFullYear(), n.getMonth() + offset, 1), e = new Date(n.getFullYear(), n.getMonth() + offset + 1, 1);
    return { start: +s, end: +e, label: s.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }), custom: false };
  }
  const s = startOfWeek(now); s.setDate(s.getDate() + offset * 7);
  const e = new Date(s); e.setDate(e.getDate() + 7);
  const shown = new Date(e); shown.setDate(shown.getDate() - 1);
  return { start: +s, end: +e, label: `${s.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} – ${shown.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`, custom: false };
}

/** In / out pairs in time order; a lone in is "still on site", a lone out has no in. */
export function pairSessions(rows: LogRow[]): Session[] {
  const out: Session[] = [];
  let open: LogRow | null = null;
  for (const r of rows.slice().sort((a, b) => +new Date(a.ts) - +new Date(b.ts))) {
    if (r.type === 'in') { if (open) out.push({ inTs: open.ts, outTs: null, siteId: open.site_id }); open = r; }
    else if (r.type === 'out') {
      if (open) { out.push({ inTs: open.ts, outTs: r.ts, siteId: open.site_id }); open = null; }
      else out.push({ inTs: null, outTs: r.ts, siteId: r.site_id });
    }
  }
  if (open) out.push({ inTs: open.ts, outTs: null, siteId: open.site_id });
  return out;
}

/** Sessions grouped by day (dd/mm/yyyy), plus total hours of complete sessions. */
export function byDay(sessions: Session[]) {
  const days: Record<string, Session[]> = {};
  let ms = 0;
  sessions.forEach((s) => {
    (days[new Date((s.inTs || s.outTs) as string).toLocaleDateString('en-GB')] ||= []).push(s);
    if (s.inTs && s.outTs) ms += +new Date(s.outTs) - +new Date(s.inTs);
  });
  return { days, hours: (ms / 3600000).toFixed(1) };
}

// Who to show (Andy, 18 Nov 2026: "allow for searching by role, i can type in site managers etc and it pulls all, or
// their name"). A person matches typed words by their name, or by their role: the app's word for it (singular or
// plural, e.g. "site managers") or the company's own role name (e.g. "Quantity Surveyor").
export const ROLE_WORDS: Record<string, string[]> = {
  operative: ['operative'], site_manager: ['site manager'], pm: ['project manager', 'pm'], admin: ['admin', 'company admin'],
  driver: ['driver', 'delivery driver'], estimator: ['estimator'], finance_controller: ['finance controller'],
};
export function personMatches(q: string, p: { name?: string | null; role?: string | null }, roleName?: string | null): boolean {
  const s = q.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!s) return true;
  if ((p.name || '').toLowerCase().includes(s)) return true;
  const one = s.replace(/'?s$/, '');
  const words = [...(ROLE_WORDS[p.role || ''] || []), (roleName || '').toLowerCase()].filter(Boolean);
  return words.some((w) => w === s || w.startsWith(one));
}
