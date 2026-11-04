// Words on the old screen that the new screen doesn't have, and the other way round (case-insensitive), from cmp-ops.js.
//   node cmp-ops-diff.js [width] [name filter]
const fs = require('fs'), path = require('path');
const W = process.argv[2] || '390', only = process.argv[3] ? new RegExp(process.argv[3]) : null;
const D = path.join(__dirname, 'shots', 'cmp', 'ops');
const norm = (t) => new Set(t.split('\n').slice(1).map((l) => l.trim().toLowerCase().replace(/\d{2}:\d{2}/g, '').replace(/\s+/g, ' ')).filter((l) => l && l.length > 1 && !/^(text|buttons)$/.test(l)));
for (const f of fs.readdirSync(D).filter((x) => x.endsWith(`-old-${W}.txt`))) {
  const name = f.replace(`-old-${W}.txt`, ''); if (only && !only.test(name)) continue;
  const nf = path.join(D, `${name}-new-${W}.txt`); if (!fs.existsSync(nf)) continue;
  const o = norm(fs.readFileSync(path.join(D, f), 'utf8')), n = norm(fs.readFileSync(nf, 'utf8'));
  const onlyOld = [...o].filter((x) => !n.has(x)), onlyNew = [...n].filter((x) => !o.has(x));
  console.log(`== ${name}\n  old only: ${onlyOld.join(' | ')}\n  new only: ${onlyNew.join(' | ')}`);
}
