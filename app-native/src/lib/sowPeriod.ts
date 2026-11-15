// The Schedule of Works report's period (500 sowPeriodRange). No PDF library here, so the screens that choose it
// don't load pdf-lib (speed review, 15 Nov 2026); lib/sowPdf.ts re-exports it.
export type SowPeriod = { from: number; to: number; label: string; file: string } | null;
export type SowTab = 'active' | 'done' | 'all';

/** Today / this week / last week / chosen dates (500 sowPeriodRange). */
export function sowPeriod(key: string, fromIso?: string, toIso?: string): SowPeriod | 'bad' {
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const day = 864e5, fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), dash = (d: Date) => d.toLocaleDateString('en-GB').replace(/\//g, '-');
  if (key === 'today') return { from: +d0, to: +d0 + day, label: `Today ${fmt(d0)}`, file: `Daily ${dash(d0)}` };
  if (key === 'week' || key === 'lastweek') {
    const mon = new Date(d0); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7)); if (key === 'lastweek') mon.setDate(mon.getDate() - 7);
    const sun = new Date(mon); sun.setDate(sun.getDate() + 6);
    return { from: +mon, to: +sun + day, label: `Week ${fmt(mon)} – ${fmt(sun)}`, file: `Week commencing ${dash(mon)}` };
  }
  if (key === 'custom') {
    const f = new Date(`${fromIso}T00:00:00`), t = new Date(`${toIso}T00:00:00`);
    if (isNaN(+f) || isNaN(+t) || t < f) return 'bad';
    return { from: +f, to: +t + day, label: `${fmt(f)} – ${fmt(t)}`, file: `${dash(f)} to ${dash(t)}` };
  }
  return null;
}
