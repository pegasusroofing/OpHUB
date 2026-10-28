// Admin Centre › Check-In Logs (300 checkinLogRange / pairCheckinSessions). Pure.

export type LogRow = { ts: string; type: string; site_id: string | null; user_id: string };
export type Session = { inTs: string | null; outTs: string | null; siteId: string | null };

const startOfWeek = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; };

/** Monday–Sunday week, or calendar month, `offset` back from now; or chosen dates. */
export function logRange(mode: 'weekly' | 'monthly', offset: number, from?: string, to?: string, now = Date.now()) {
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
