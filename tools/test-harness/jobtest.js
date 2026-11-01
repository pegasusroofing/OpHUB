// The job test: works real jobs start to finish on Sandbox Roofing, as the people on them, at phone size.
//   FULL=1 SB_DIR=<folder holding sb-session.json, sb-op.json ...> node jobtest.js <part>
// Parts are in jobtest-parts/. Each step says PASS / FAIL with what the database holds afterwards. Same guard as crawl.js.
const fs = require('fs'), path = require('path');
const {chromium} = require('playwright');
const real = require('./sandbox-guard');
const B = 'http://localhost:8081', API = 'https://dtrfupmcazoioubhwdml.supabase.co';
const SANDBOX = '2eb072b7-2704-48c0-8110-62e45e621ded', ANDY = 'andy.cramp@rtbroofinglimited.com';
const DIR = process.env.SB_DIR, OUT = path.join(__dirname, 'shots', 'job');
const FILES = {admin: process.env.MAIN === 'pm' ? 'sb-pm.json' : 'sb-session.json', pm: 'sb-pm.json', sm: 'sb-sm.json', op: 'sb-op.json', driver: 'sb-driver.json', client: 'sb-client.json', sub: 'sb-sub.json'};
const anon = (fs.readFileSync(path.join(__dirname, '../../app-native/src/lib/supabase.ts'), 'utf8').match(/SUPABASE_ANON_KEY\s*=\s*'([^']+)'/) || [])[1];
fs.mkdirSync(OUT, {recursive: true});
const RESULTS = path.join(OUT, 'results.jsonl');
// A request still going when a page reloads or closes is not a fault in the app.
process.on('unhandledRejection', (e) => { if (!/disposed|closed/i.test(String(e && e.message))) console.log('unhandled', String(e).slice(0, 200)); });

(async () => {
  const part = process.argv[2];
  const browser = await chromium.launch();
  const people = {};
  // One signed-in person, on their own phone-size browser.
  const as = async (who) => {
    if (people[who]) return people[who];
    const {ctx} = await real.open(browser, {viewport: {width: 390, height: 844}, hasTouch: true, isMobile: true, acceptDownloads: true}, path.join(DIR, FILES[who]));
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
    const headers = {apikey: anon, Authorization: `Bearer ${ctx.__token}`};
    const api = {
      who, page, ctx, errs,
      get: async (p) => { const r = await ctx.request.get(`${API}/rest/v1/${p}`, {headers}); return r.ok() ? r.json() : []; },
      go: async (u, ms = 4500) => { await page.goto(B + u); await page.waitForTimeout(ms); },
      vis: (sel) => page.locator(sel).locator('visible=true'),
      text: () => page.locator('body').innerText(),
      // Press something by its words. Exact first, then any text containing it.
      tap: async (label, {exact = true, wait = 1200, last = true} = {}) => {
        const by = exact && typeof label === 'string' ? page.getByText(label, {exact: true}) : page.getByText(label);
        const list = by.locator('visible=true');
        const el = last ? list.last() : list.first();
        await el.click({timeout: 7000});
        await page.waitForTimeout(wait);
      },
      label: async (label, wait = 1200) => { await page.locator(`[aria-label="${label}"]`).locator('visible=true').first().click({timeout: 7000}); await page.waitForTimeout(wait); },
      fill: async (placeholder, value) => { const el = page.locator(`input[placeholder="${placeholder}"], textarea[placeholder="${placeholder}"]`).locator('visible=true').last(); await el.click({timeout: 7000}); await el.fill(value); await page.waitForTimeout(250); },
      field: async (labelText, value) => { const el = page.getByText(labelText, {exact: true}).locator('visible=true').last().locator('xpath=following::input[1] | following::textarea[1]').first(); await el.fill(value, {timeout: 7000}); await page.waitForTimeout(250); },
      // Press a button that opens a file picker, then choose real files.
      pick: async (press, files, wait = 3000) => { const [fc] = await Promise.all([page.waitForEvent('filechooser', {timeout: 15000}), press()]); await fc.setFiles(files); await page.waitForTimeout(wait); },
      saved: async (press) => { const [d] = await Promise.all([page.waitForEvent('download', {timeout: 40000}), press()]); const p = path.join(OUT, d.suggestedFilename()); await d.saveAs(p); return p; },
      shot: (n) => page.screenshot({path: path.join(OUT, `${part}-${n}.png`)}),
    };
    people[who] = api;
    return api;
  };
  const counts = {pass: 0, fail: 0};
  // One step: does its job, then says whether the outcome really happened.
  const step = async (name, fn, who = 'admin') => {
    const t0 = Date.now();
    let ok = false, note = '';
    try { const r = await fn(); ok = r !== false && !(r && typeof r === 'object' && 'ok' in r && !r.ok); note = r && r.note ? String(r.note) : (typeof r === 'string' ? r : ''); }
    catch (e) { note = e.message.split('\n')[0].slice(0, 200); }
    counts[ok ? 'pass' : 'fail']++;
    const line = {part, step: name, ok, note, ms: Date.now() - t0};
    fs.appendFileSync(RESULTS, JSON.stringify(line) + '\n');
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
    if (!ok && people[who]) { await people[who].shot(`fail-${counts.fail}`).catch(() => {}); console.log(`      on screen: ${(await people[who].text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 260)}`); }
    return ok;
  };
  const stateFile = path.join(OUT, 'state.json');
  const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : {};
  const keep = () => fs.writeFileSync(stateFile, JSON.stringify(state, null, 1));
  await require(`./jobtest-parts/${part}`)({as, step, state, keep, SANDBOX, ANDY, OUT, samples: path.join(__dirname, 'shots', 'samples')});
  for (const p of Object.values(people)) if (p.errs.length) console.log(`crashes for ${p.who}:`, [...new Set(p.errs)].slice(0, 5).join(' / '));
  console.log(`\n${part}: ${counts.pass} passed, ${counts.fail} failed`);
  await browser.close(); process.exit(0);
})().catch((e) => { console.log('STOPPED', e.message.slice(0, 400)); process.exit(1); });
