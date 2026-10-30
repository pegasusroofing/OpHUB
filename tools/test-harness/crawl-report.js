// Adds up shots/crawl/*.jsonl: screens opened, buttons pressed, what they did, and every problem grouped.
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, 'shots', 'crawl');
const pick = process.argv[2] ? new RegExp(process.argv[2]) : null;
const rows = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl') && (!pick || pick.test(f))).flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean).map((l) => { const o = JSON.parse(l); o.file = f.replace(/-\d+\.jsonl$/, ''); return o; }));
const tag = (r) => r.file;
const bySet = {};
rows.forEach((r) => { const s = (bySet[tag(r)] = bySet[tag(r)] || {screens: 0, blocked: 0, redirected: 0, empty: 0, presses: 0, nav: 0, changed: 0, wrote: 0, fn: 0, file: 0, none: 0, problems: 0});
  if (r.load) { s.screens++; if (r.blocked) s.blocked++; else if (r.land && r.land.split('?')[0] !== r.route.split('?')[0]) s.redirected++; else if (!r.buttons) s.empty++; }
  else if (r.label !== undefined && !(r.trail || []).includes('(reopen)')) { s.presses++; const d = (r.did || []).join(' '); if (/nav /.test(d)) s.nav++; if (/changed/.test(d)) s.changed++; if (/wrote/.test(d)) s.wrote++; if (/fn /.test(d)) s.fn++; if (/file picker/.test(d)) s.file++; if ((r.problems || []).includes('nothing happened')) s.none++; }
  s.problems += (r.problems || []).length; });
console.log(JSON.stringify(bySet, null, 0).replace(/\},/g, '},\n'));
const group = {};
rows.forEach((r) => (r.problems || []).forEach((p) => { const k = p.replace(/\d{3,}/g, '#').slice(0, 110); (group[k] = group[k] || []).push(`${r.file} ${r.route.replace('/sites/11111111-1111-1111-1111-111111111111', '/S').replace('/fin/job/11111111-1111-1111-1111-111111111111', '/J')}${r.label ? ' › ' + (r.trail || []).filter((t) => t !== '(reopen)').concat(r.label).join(' › ').replace(/\s+/g, ' ').slice(0, 50) : ''}`); }));
Object.entries(group).sort((a, b) => b[1].length - a[1].length).forEach(([k, v]) => { const u = [...new Set(v)]; console.log(`\n[${v.length}] ${k}`); u.slice(0, +(process.env.N || 8)).forEach((x) => console.log('   ' + x)); if (u.length > +(process.env.N || 8)) console.log(`   …and ${u.length - +(process.env.N || 8)} more`); });
const msgs = {};
rows.forEach((r) => (r.did || []).filter((d) => d.startsWith('message:')).forEach((d) => { (msgs[d] = msgs[d] || []).push(r.route.replace('/sites/11111111-1111-1111-1111-111111111111', '/S')); }));
if (Object.keys(msgs).length) { console.log('\nMESSAGES SHOWN'); Object.entries(msgs).sort((a, b) => b[1].length - a[1].length).slice(0, 30).forEach(([k, v]) => console.log(`[${v.length}] ${k} — ${[...new Set(v)].slice(0, 3).join(', ')}`)); }
