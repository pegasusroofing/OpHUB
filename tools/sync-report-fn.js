// Auto-run reports use the app's own report code. This copies it into the server function's folder.
//   node tools/sync-report-fn.js          writes the copies (then redeploy finance-report-run)
//   node tools/sync-report-fn.js --check  fails if the copies are out of date
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..'), src = path.join(R, 'app-native/src/lib'), out = path.join(R, 'supabase/functions/finance-report-run');
const read = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const want = {
  'reports.ts': read(path.join(src, 'finReports.ts')).replace("'@/lib/rules/finBook'", "'./book.ts'").replace("'@/lib/rules/finance'", "'./rules.ts'"),
  'book.ts': read(path.join(src, 'rules/finBook.ts')).replace("'./finance.ts'", "'./rules.ts'"),
};
let bad = 0;
for (const [name, text] of Object.entries(want)) {
  const p = path.join(out, name);
  if (process.argv.includes('--check')) { if (!fs.existsSync(p) || read(p) !== text) { console.error(`${name} is out of date: run node tools/sync-report-fn.js and redeploy finance-report-run`); bad = 1; } }
  else fs.writeFileSync(p, text);
}
process.exit(bad);
