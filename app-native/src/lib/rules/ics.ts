// A standard all-day-event .ics calendar (060 buildCalendarIcs) from a job's
// key dates, for "Add to phone calendar". Pure.
const pad = (n: number) => String(n).padStart(2, '0');
export const icsEscape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
export const icsStamp = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
export function buildIcs(events: { id: string; title: string | null; event_date: string }[], calName: string, now: Date = new Date()): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//OpHUB//Site Calendar//EN', 'CALSCALE:GREGORIAN'];
  events.forEach((e) => {
    const end = new Date(`${e.event_date}T12:00:00`); end.setDate(end.getDate() + 1); // DTEND is exclusive
    lines.push('BEGIN:VEVENT', `UID:${e.id}@ophub.app`, `DTSTAMP:${icsStamp(now)}`, `DTSTART;VALUE=DATE:${e.event_date.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${end.getFullYear()}${pad(end.getMonth() + 1)}${pad(end.getDate())}`, `SUMMARY:${icsEscape(e.title || 'Key date')}`);
    if (calName) lines.push(`LOCATION:${icsEscape(calName)}`);
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
