// London borough outlines for the sites map (Andy, 14 Nov 2026: "a map that outlines the suburbs of london ... on a grey
// background with grey roads"). From the ONS Local Authority Districts (December 2023) boundaries, ultra-generalised,
// the 33 London codes E09*; Open Government Licence v3 (contains OS data © Crown copyright and database right 2023).
// Makes app-native/src/lib/londonBoroughs.ts (outlines, one name point per borough at the middle of its biggest part,
// and Greater London as one shape, to hide the base map's own place names inside it) and the same for the comparison
// page. node tools/maps/make-boroughs.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const src = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'website', 'data', 'london-boroughs.geojson'), 'utf8'));
const r5 = (n) => Math.round(n * 1e5) / 1e5;
const ringArea = (ring) => { let a = 0; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]); return a / 2; };
const ringCentroid = (ring) => {
  let a = 0, x = 0, y = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]; a += f; x += (ring[j][0] + ring[i][0]) * f; y += (ring[j][1] + ring[i][1]) * f; }
  return [x / (3 * a), y / (3 * a)];
};
const inside = (pt, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c; } return c; };
// A point inside the shape near its middle: the centroid, or if that falls outside, the inside point on a grid nearest it.
const labelPoint = (ring) => {
  const c = ringCentroid(ring); if (inside(c, ring)) return c;
  const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]); let best = null, bd = Infinity;
  for (let i = 1; i < 30; i++) for (let j = 1; j < 30; j++) {
    const p = [Math.min(...xs) + (Math.max(...xs) - Math.min(...xs)) * i / 30, Math.min(...ys) + (Math.max(...ys) - Math.min(...ys)) * j / 30];
    if (inside(p, ring)) { const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2; if (d < bd) { bd = d; best = p; } }
  }
  return best || c;
};
// Shorter names (Andy, 14 Nov 2026: "shorten hammersmith and fulham to H&F, kensington and chelsea to RBKC").
const SHORT = { 'Kensington and Chelsea': 'RBKC', 'Hammersmith and Fulham': 'H&F', 'Barking and Dagenham': 'Barking & Dagenham', 'Richmond upon Thames': 'Richmond', 'Kingston upon Thames': 'Kingston' };
const NUDGE = {};
const nm = (n) => SHORT[n] || n;
const polys = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
const outlines = { type: 'FeatureCollection', features: src.features.map((f) => ({ type: 'Feature', properties: { name: nm(f.properties.LAD23NM) }, geometry: { type: f.geometry.type, coordinates: f.geometry.type === 'Polygon' ? f.geometry.coordinates.map((r) => r.map((p) => p.map(r5))) : f.geometry.coordinates.map((pl) => pl.map((r) => r.map((p) => p.map(r5)))) } })) };
const labels = { type: 'FeatureCollection', features: src.features.map((f) => {
  const biggest = polys(f.geometry).sort((a, b) => Math.abs(ringArea(b[0])) - Math.abs(ringArea(a[0])))[0];
  return { type: 'Feature', properties: { name: nm(f.properties.LAD23NM) }, geometry: { type: 'Point', coordinates: (NUDGE[f.properties.LAD23NM] || labelPoint(biggest[0])).map(r5) } };
}) };
const area = { type: 'MultiPolygon', coordinates: outlines.features.flatMap((f) => polys(f.geometry)) };
// Town names inside London show (Ilford, Tottenham, Woolwich…) except any that would repeat a borough's name.
const NAMES = [...new Set([...src.features.map((f) => f.properties.LAD23NM), ...src.features.map((f) => nm(f.properties.LAD23NM)), 'London', 'City of London', 'City of Westminster', 'Kensington', 'Chelsea', 'Hammersmith', 'Fulham'])];
const ts = `// London borough outlines for the sites map, made by tools/maps/make-boroughs.js (Andy, 14 Nov 2026). ONS Local Authority
// Districts (December 2023), ultra-generalised; Open Government Licence v3; contains OS data © Crown copyright and
// database right 2023. outlines: each borough; labels: one point per borough; area: Greater London, to hide the base
// map's own place names inside it so no name shows twice.
/* eslint-disable */
export const LONDON_BOROUGHS = ${JSON.stringify(outlines)} as const;
export const LONDON_BOROUGH_LABELS = ${JSON.stringify(labels)} as const;
export const GREATER_LONDON = ${JSON.stringify(area)} as const;
/** The base map's town names inside London that would repeat a borough's name (Greenwich, Lewisham…), and London itself. */
export const LONDON_NAMES: string[] = ${JSON.stringify(NAMES)};
`;
fs.writeFileSync(path.join(ROOT, 'app-native', 'src', 'lib', 'londonBoroughs.ts'), ts);
fs.writeFileSync(path.join(ROOT, 'docs', 'website', 'data', 'london-boroughs.js'), `// Made by tools/maps/make-boroughs.js. ONS boundaries, Open Government Licence v3.
window.LONDON_BOROUGHS = ${JSON.stringify(outlines)};\nwindow.LONDON_BOROUGH_LABELS = ${JSON.stringify(labels)};\nwindow.GREATER_LONDON = ${JSON.stringify(area)};\nwindow.LONDON_NAMES = ${JSON.stringify(NAMES)};\n`);
console.log(`${outlines.features.length} boroughs, ${labels.features.length} labels, ts ${(ts.length / 1024).toFixed(0)} KB`);
