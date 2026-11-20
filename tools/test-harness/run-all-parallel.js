// Runs every *-check.js against the dev server on :8081, several at once (Andy, 20 Nov 2026: "run all the checks ... I
// want it fully checked"). Like run-all.sh (EXTRA=1 and the sample files), but in parallel and with a summary.
// node run-all-parallel.js [jobs=4] [out=shots/run-all.jsonl] [filter regex]
// Each line of the output: {file, ok, code, timedOut, ms, fails:[...], pageErrors:[...], tail}. A check counts as passed
// when it exits 0 and prints no FAIL lines and no page errors.
const {spawn} = require('child_process');
const fs = require('fs'), path = require('path');
const JOBS = +(process.argv[2] || 4), OUT = process.argv[3] || path.join(__dirname, 'shots', 'run-all.jsonl');
const only = process.argv[4] ? new RegExp(process.argv[4]) : null;
const LIMIT_MS = +(process.env.LIMIT_MS || 360000);
const files = fs.readdirSync(__dirname).filter((f) => /-check\.js$/.test(f) && (!only || only.test(f))).sort();
fs.writeFileSync(OUT, '');
const S = path.join(__dirname, 'shots', 'samples');
const env = {...process.env, EXTRA: '1', BOQ: `${S}/boq.csv`, QUOTE: `${S}/quote.csv`, STMT: `${S}/stmt.csv`, SDS: `${S}/sds.pdf`, WO: `${S}/wo.pdf`};
let next = 0, done = 0, passed = 0;
const failed = [];
function runOne(file) {
  return new Promise((resolve) => {
    const t0 = Date.now(); let out = ''; let timedOut = false;
    const p = spawn(process.execPath, [file], {cwd: __dirname, env});
    p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
    const timer = setTimeout(() => { timedOut = true; p.kill('SIGKILL'); }, LIMIT_MS);
    p.on('close', (code) => {
      clearTimeout(timer);
      const lines = out.split(/\r?\n/);
      const fails = lines.filter((l) => /^\s*FAIL\b/.test(l)).map((l) => l.trim().slice(0, 220));
      const pageErrors = lines.filter((l) => /^\s*(errors?|page ?errors?)\s*[:=]/i.test(l) && !/[:=]\s*(none|\[\]|0)\s*$/i.test(l)).map((l) => l.trim().slice(0, 220));
      const ok = code === 0 && !timedOut && !fails.length && !pageErrors.length;
      const tail = ok ? '' : lines.filter((l) => l.trim() && !/^\s+at /.test(l)).slice(-6).join(' | ').slice(0, 600);
      resolve({file, ok, code, timedOut, ms: Date.now() - t0, fails, pageErrors, tail});
    });
  });
}
async function worker() {
  while (next < files.length) {
    const f = files[next++];
    const r = await runOne(f);
    done++; if (r.ok) passed++; else failed.push(r.file);
    fs.appendFileSync(OUT, JSON.stringify(r) + '\n');
    console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${done}/${files.length} ${f} ${Math.round(r.ms / 1000)}s${r.ok ? '' : ' :: ' + (r.fails[0] || r.pageErrors[0] || (r.timedOut ? 'timed out' : r.tail)).slice(0, 160)}`);
  }
}
(async () => {
  await Promise.all(Array.from({length: Math.min(JOBS, files.length)}, worker));
  console.log(`DONE ${passed}/${files.length} passed. Not passing: ${failed.join(', ') || 'none'}`);
})();
