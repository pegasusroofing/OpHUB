// HAVS (hand-arm vibration) rules, ported from 660-havs-hand-arm-vibration-exposure.js.
// HSE formula: A(8) = magnitude × √(minutes / 480); points = A(8)² × 100 / 6.25.
// 100 points a day = Exposure Action Value (EAV), 400 = Exposure Limit Value (ELV).
// Several tools in a day simply add their points.

export const HAVS_DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
export const EAV = 100, ELV = 400;

export function a8(magnitude: number, minutes: number): number { return magnitude * Math.sqrt(minutes / 480); }
export function points(magnitude: number, minutes: number): number { const x = a8(magnitude, minutes); return (x * x * 100) / 6.25; }

/** Minutes box: blank is skipped quietly; otherwise whole numbers 1–480. */
export function wholeMinutes(raw: string | null | undefined): { ok: true; minutes: number } | { ok: false; empty?: boolean; error?: string } {
  const s = (raw == null ? '' : String(raw)).trim();
  if (!s) return { ok: false, empty: true };
  if (!/^\d+$/.test(s)) return { ok: false, error: 'Whole numbers only.' };
  const n = parseInt(s, 10);
  if (n <= 0 || n > 480) return { ok: false, error: 'Enter minutes between 1 and 480.' };
  return { ok: true, minutes: n };
}

/** Monday–Friday of the week `offset` weeks from this one. */
export function weekDates(offset: number, now: Date = new Date()): Date[] {
  const ws = new Date(now); ws.setHours(0, 0, 0, 0);
  ws.setDate(ws.getDate() - ((ws.getDay() + 6) % 7) + offset * 7);
  return [0, 1, 2, 3, 4].map((i) => { const d = new Date(ws); d.setDate(d.getDate() + i); return d; });
}
export function weekLabel(days: Date[]): string {
  return `${days[0].toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} – ${days[4].toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`;
}

/** Day pill: ELV EXCEEDED / ACTION NEEDED / OK (none when nothing logged). */
export function dayStatus(pts: number): 'elv' | 'eav' | 'ok' | null {
  if (pts <= 0) return null;
  return pts >= ELV ? 'elv' : pts >= EAV ? 'eav' : 'ok';
}
export const DAY_STATUS_LABEL = { elv: 'ELV EXCEEDED', eav: 'ACTION NEEDED', ok: 'OK' } as const;

/** Message for the managers when an entry takes someone over a limit that day, else null. */
export function thresholdMessage(before: number, total: number, sitePrefix: string, name: string, dateLabel: string): { kind: string; body: string } | null {
  if (before < ELV && total >= ELV) {
    return { kind: 'havs_elv_exceeded', body: `${sitePrefix}${name} has exceeded the daily HAVS Exposure Limit Value (ELV) on ${dateLabel} — ${total.toFixed(0)} pts. Immediate action required.` };
  }
  if (before < EAV && total >= EAV) {
    return { kind: 'havs_eav_exceeded', body: `${sitePrefix}${name} has passed the daily HAVS Exposure Action Value (EAV) on ${dateLabel} — ${total.toFixed(0)} pts.` };
  }
  return null;
}

/** "circular saw" → "Circular Saw" (acronyms like SDS left alone). */
export const titleCaseWords = (s: string) => String(s || '').replace(/\b\w/g, (c) => c.toUpperCase());
