// Andy's list of 11 Nov 2026: phone (and laptop) screenshots of the pages it mentions, as they stand. Fake database only.
// node andy11-shots.js [tag] [page,page,...]   (tag goes in the file names: before / after)
const {chromium, makeContext, S1} = require('./harness');
const path = require('path');
const fs = require('fs');
const B = 'http://localhost:8081';
const tag = process.argv[2] || 'before';
const only = (process.argv[3] || '').split(',').filter(Boolean);
const OUT = path.join(__dirname, 'shots', 'andy11'); fs.mkdirSync(OUT, {recursive: true});
const PAGES = [
  ['home', '/home'], ['hub', '/pm/hub'], ['todos', '/pm/todos'], ['calendar', '/pm/calendar'],
  ['materials', `/sites/${S1}/materials`], ['schedule', `/sites/${S1}/schedule`], ['snags', `/sites/${S1}/snagging/list`], ['jobhome', `/sites/${S1}`],
  ['siteadmin', `/sites/${S1}/admin`], ['checkin', `/sites/${S1}/checkin`],
  ['quotes', '/pm/quotes'], ['quote', '/pm/quotes/q1'], ['quote2', '/pm/quotes/q2'], ['quotenew', '/pm/quotes/new'], ['qsettings', '/pm/quotes/settings'], ['quoted', '/pm/quotes?tab=quoted'], ['dash', '/pm/dashboard'], ['dashes', '/pm/dashboards'], ['hr', '/pm/hr'], ['hrpol', '/pm/hr/policies'], ['hrhol', '/pm/hr/holidays'],
];
(async () => {
  const browser = await chromium.launch(); const errs = [];
  for (const [W, H] of [[390, 844]]) {
    const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: W, height: H}});
    require('./seeds/world')(db); const me = db.profiles.find((p) => p.id === 'me'); me.role = 'admin'; me.howto_dismissed = ['*']; me.finance_enabled = true;
    const org = me.org_id;
    db.quotes = [
      {id: 'q1', org_id: org, client_name: 'Bellway Homes', contact_name: 'Bob', contact_email: 'bob@bellway.example', title: 'Hove Flats re-roof', address: '12 Kings Rd, Hove', discipline: 'Flat Roofing', status: 'pricing', value: null, return_date: '2026-11-20', received_date: '2026-11-03', chase_on: true, chase_count: 0, priced_by: 'me', priced_by_name: 'Andy Admin', guide_markup_pct: 15, created_at: '2026-11-03T08:00:00Z'},
      {id: 'q2', org_id: org, client_name: 'Persimmon', title: 'Ashford School', discipline: 'Pitched Roofing', status: 'returned', value: 84000, profit_pct: 0.12, return_date: '2026-11-01', returned_at: '2026-11-01', chase_on: true, next_chase_date: '2026-12-01', chase_count: 0, priced_by_name: 'Neil', created_at: '2026-10-20T08:00:00Z'},
      {id: 'q3', org_id: org, client_name: 'Osborne', title: 'Croydon Depot', discipline: 'Mixed', status: 'won', value: 120500, profit_pct: 0.15, return_date: '2026-09-10', returned_at: '2026-09-10', completed_at: '2026-10-02', chase_on: false, chase_count: 1, priced_by_name: 'Neil', created_at: '2026-09-01T08:00:00Z'},
      {id: 'q4', org_id: org, client_name: 'Wates', title: 'Leyton Library', discipline: 'Flat Roofing', status: 'lost', value: 46000, return_date: '2026-08-10', returned_at: '2026-08-10', completed_at: '2026-09-02', chase_on: false, chase_count: 2, priced_by_name: 'Andy Admin', created_at: '2026-08-01T08:00:00Z'},
      {id: 'q5', org_id: org, client_name: 'Kier', title: 'Brent Flats Block C', discipline: 'Repairs', status: 'awaiting', value: null, return_date: '2026-11-25', chase_on: true, chase_count: 0, priced_by_name: 'Neil', created_at: '2026-11-05T08:00:00Z'},
    ];
    db.quote_clients = [{id: 'qc1', org_id: org, quote_id: 'q1', client_name: 'Persimmon', created_at: '2026-10-21T08:00:00Z'}];
    db.quote_settings = [{org_id: org, chase_enabled: true, chase_first_days: 30, chase_every_days: 14, chase_max: 3}];
    db.quote_chases = [];
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(B + '/login'); await page.waitForTimeout(5000);
    await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
    await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
    for (const [name, url] of PAGES) {
      if (only.length && !only.includes(name)) continue;
      await page.goto(B + url); await page.waitForTimeout(4500);
      await page.screenshot({path: path.join(OUT, `${tag}-${name}-${W}.png`), fullPage: true});
    }
    await ctx.close();
  }
  console.log('errors:', errs.length ? errs.slice(0, 3).join(' | ') : 'none');
  await browser.close();
})();
