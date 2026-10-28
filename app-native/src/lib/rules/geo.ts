// Reading GPS co-ordinates typed or pasted by a PM. Ported from parseCoordToken /
// splitCoordPair (350-to-do-list.js). Accepts plain decimal (51.51828) and Google's
// degrees/minutes/seconds (51°31'05.8"N), and a whole pair pasted into one box.

export const GEO_RADII = [25, 50, 75, 100, 150, 200, 300, 500];
/** Distance choices, adding the job's current one if it's not a standard size. */
export const radiusOptions = (current: number | null | undefined) => {
  const cur = current || 100;
  return [...new Set([...GEO_RADII, cur])].sort((a, b) => a - b);
};

export function parseCoordToken(raw: string | null | undefined): number {
  if (raw == null) return NaN;
  let str = String(raw).trim();
  if (!str) return NaN;
  str = str.replace(/[’′]/g, "'").replace(/[”″]/g, '"');
  let m = str.match(/^([NSEW])?\s*(-?\d+(?:\.\d+)?)\s*°?\s*([NSEW])?$/i);
  if (m) {
    let val = parseFloat(m[2]);
    const hem = (m[1] || m[3] || '').toUpperCase();
    if (hem === 'S' || hem === 'W') val = -Math.abs(val);
    else if (hem === 'N' || hem === 'E') val = Math.abs(val);
    return val;
  }
  m = str.match(/^(-?\d+(?:\.\d+)?)\s*(?:°|deg)\s*(\d+(?:\.\d+)?)?\s*(?:'|min)?\s*(\d+(?:\.\d+)?)?\s*(?:"|sec)?\s*([NSEW])?$/i);
  if (m && (m[2] != null || m[4] != null)) {
    const deg = parseFloat(m[1]);
    const min = m[2] != null ? parseFloat(m[2]) : 0;
    const sec = m[3] != null ? parseFloat(m[3]) : 0;
    let val = Math.abs(deg) + min / 60 + sec / 3600;
    const hem = (m[4] || '').toUpperCase();
    if (hem === 'S' || hem === 'W' || deg < 0) val = -val;
    return val;
  }
  return NaN;
}

/** A full "lat, lon" pair pasted into one box, split in two (or null). */
export function splitCoordPair(str: string | null | undefined): [string, string] | null {
  if (!str) return null;
  const s = String(str).trim();
  const dms = s.match(/-?\d+(?:\.\d+)?\s*(?:°|deg)\s*\d*(?:\.\d+)?\s*(?:'|min)?\s*\d*(?:\.\d+)?\s*(?:"|sec)?\s*[NSEW]/gi);
  if (dms && dms.length === 2) return [dms[0].trim(), dms[1].trim()];
  const m = s.match(/^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/);
  return m ? [m[1], m[2]] : null;
}

export function validLatLon(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}
