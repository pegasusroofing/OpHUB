// Construction Phase Plan changes (Andy, 20 Nov 2026), on a phone:
// - "the waste carrier license etc should auto save from before ... that and safety advisor should pull through";
//   "HSEQ should pull through from previous"; our address and phone; 8am - 5pm hours; our own company is not the client;
// - "the issued to should be removed, then move the copy and version to the same row as the prepared by";
// - the email box text 0.85x on a phone; contact sheet names pick from the company's people and pull their number in;
// - once issued it closes: Export / Email / Edit / View (View in the company colour, on the right); Edit opens the tabs.
// Fake database. node cpp20-check.js
const {chromium, makeContext, S1} = require('./harness');
const path = require('path');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'cpp20'); require('fs').mkdirSync(SHOTS, {recursive: true});
const OLD_HOURS = 'The hours on site will be 7.00am - 7.00pm Monday - Friday. Weekend working will only be carried out upon agreement of all parties.';
const roles = ['Contract Director', 'Contract Manager', 'Project Manager', 'First Aiders', 'HSEQ', 'Architects', 'Principal Designer'];
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 390, height: 844}});
  require('./seeds/world')(db);
  const me = db.profiles.find((p) => p.id === 'me'); Object.assign(me, {role: 'admin', howto_dismissed: ['*'], name: 'Andy Cramp'});
  const O = me.org_id;
  db.profiles.push({id: 'demo', name: 'Demo Manager', role: 'pm', org_id: O, phone: '07700 900111', email: 'demo@x.co'});
  const old = new Date(Date.now() - 864e5).toISOString(), now = new Date().toISOString();
  db.cpp_plans = [
    {id: 'prev', org_id: O, site_id: 'other', title: 'Old job', status: 'issued', version: 1, updated_at: old, data: {
      advisor: 'Citation', wasteLicence: 'CBDU123', pc: {name: 'Sandbox Roofing Ltd', address: '1 Old Yard, Leeds', phone: '0113 000 0000', email: ''},
      contacts: roles.map((role) => ({role, name: role === 'HSEQ' ? 'Sam Safe' : role === 'Project Manager' ? 'Old PM' : '', day: role === 'HSEQ' ? '0700 111' : '', ooh: role === 'HSEQ' ? '0700 222' : ''}))}},
    {id: 'cp1', org_id: O, site_id: S1, title: 'Construction Phase Plan - J101', status: 'draft', version: 1, updated_at: now, data: {
      siteName: 'J101 Studley Rd', pc: {name: 'Sandbox Roofing Ltd', address: '', phone: '', email: 'a@x.co'}, client: {name: 'RTB Roofing', contact: 'Andy Cramp', phone: '07700 000000', email: 'andy@x.co', address: ''},
      siteHours: OLD_HOURS, preparedBy: 'Andy Cramp', issues: [{copy: '1', version: '1', issuedTo: 'Andy Cramp', date: ''}], contacts: roles.map((role) => ({role, name: '', day: '', ooh: ''}))}},
    {id: 'cp2', org_id: O, site_id: S1, title: 'Construction Phase Plan - J101 (issued)', status: 'issued', version: 1, updated_at: old, mc_document_id: 'md1', data: {
      siteName: 'J101 Studley Rd', revisions: [{version: 1, date: now.slice(0, 10), by: 'Andy Cramp', note: 'First issue', docId: 'md1', path: 'x/cpp-v1.pdf'}]}},
  ];
  global.__rpc = (n) => (n === 'my_companies' ? [{org_id: 'rtb', name: 'RTB Roofing', logo_path: null, role: 'admin', work_email: null, is_current: false}] : undefined);
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  const tab = async (re) => { await page.getByRole('tab').filter({hasText: re}).first().click(); await page.waitForTimeout(900); };
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);

  // ---- A draft fills its blanks when it opens ----
  await page.goto(`${B}/sites/${S1}/mc/cpp/cp1`); await page.waitForTimeout(6000);
  const d = db.cpp_plans.find((x) => x.id === 'cp1').data;
  check(d.advisor === 'Citation' && d.wasteLicence === 'CBDU123', `the safety advisor and waste carrier licence come from the last plan (${d.advisor} / ${d.wasteLicence})`);
  check(d.pc.address === '1 Old Yard, Leeds' && d.pc.phone === '0113 000 0000', `our address and phone pull through (${d.pc.address} / ${d.pc.phone})`);
  check((d.contacts || []).find((c) => c.role === 'HSEQ')?.name === 'Sam Safe' && !(d.contacts || []).find((c) => c.role === 'Project Manager')?.name, 'HSEQ comes from the last plan (the job’s Project Manager doesn’t)');
  check(/8\.00am - 5\.00pm/.test(d.siteHours) && /Weekend working/.test(d.siteHours), 'site hours are 8am - 5pm, the weekend line kept');
  check(d.client.name === '' && d.client.contact === '', `our own company isn’t the client (client now "${d.client.name}")`);
  let t = await text();
  check(!/Issued To/.test(t) && /Prepared By/.test(t) && /Copy/.test(t), 'no Issued To; Prepared By, Copy and Version');
  const sameRow = await page.evaluate(() => {
    const y = (l) => { const e = [...document.querySelectorAll('div')].find((x) => x.childElementCount === 0 && x.textContent === l); return e ? Math.round(e.getBoundingClientRect().top) : null; };
    return [y('Prepared By'), y('Copy'), y('Version')];
  });
  check(sameRow[0] !== null && sameRow[0] === sameRow[1] && sameRow[1] === sameRow[2], `Prepared By, Copy and Version on one row (${sameRow.join(', ')})`);
  const fs = await page.evaluate(() => { const i = [...document.querySelectorAll('input')].find((x) => x.value === 'a@x.co'); const n = [...document.querySelectorAll('input')].find((x) => x.value === 'J101 Studley Rd'); return [i && getComputedStyle(i).fontSize, n && getComputedStyle(n).fontSize]; });
  check(fs[0] === '12px', `the email box text is 0.85x on a phone (${fs[0]} against ${fs[1]})`);
  await page.screenshot({path: path.join(SHOTS, '1-details-phone.png')});

  // ---- Contact sheet: type a name, pick from the company's people ----
  await tab(/^People/);
  const nameBoxes = page.getByPlaceholder('Type a name');
  // Project Manager first, then the contact sheet: Contract Director, Contract Manager…
  const cm = nameBoxes.nth(2);
  await cm.click(); await cm.fill('Demo'); await page.waitForTimeout(600);
  check(/Demo Manager/.test(await text()), 'typing "Demo" in the Contract Manager’s name lists Demo Manager');
  await page.screenshot({path: path.join(SHOTS, '2-contact-pick-phone.png')});
  await page.getByText('Demo Manager', {exact: true}).first().click(); await page.waitForTimeout(1500);
  const c2 = db.cpp_plans.find((x) => x.id === 'cp1').data.contacts.find((c) => c.role === 'Contract Manager');
  check(c2.name === 'Demo Manager' && c2.day === '07700 900111', `choosing them pulls their number in (${c2.name}, ${c2.day})`);

  // ---- An issued plan opens closed ----
  await page.goto(`${B}/sites/${S1}/mc/cpp/cp2`); await page.waitForTimeout(5000);
  t = await text();
  check(await page.getByRole('tab').count() === 0 && /Construction Phase Plan · Version 1/.test(t), 'an issued plan opens closed (no tabs)');
  // Edit is in the ⋮ since 21 Nov 2026.
  const btns = await page.evaluate(() => ['⬇ Export', '✉ Email', '👁 View'].map((l) => { const e = [...document.querySelectorAll('div')].find((x) => x.childElementCount === 0 && x.textContent === l); const b = e && e.closest('[role="button"]'); const r = e && e.getBoundingClientRect(); return {l, x: r ? Math.round(r.left) : null, y: r ? Math.round(r.top) : null, bg: b ? getComputedStyle(b).backgroundColor : null}; }));
  check(btns.every((b) => b.x !== null) && btns.every((b) => b.y === btns[0].y) && btns[2].x > btns[1].x && btns[1].x > btns[0].x, `Export / Email / View on one row, View on the right (${btns.map((b) => `${b.l}@${b.x}`).join(' ')})`);
  check(btns[2].bg && btns[2].bg !== btns[1].bg, `View is in the company colour (${btns[2].bg} vs ${btns[1].bg})`);
  check(!/Revise The Plan/i.test(t), 'no Revise The Plan box');
  await page.screenshot({path: path.join(SHOTS, '3-issued-closed-phone.png')});
  await page.getByLabel('More for this plan').click(); await page.waitForTimeout(600);
  await page.getByText('✎ Edit', {exact: true}).last().click(); await page.waitForTimeout(900);
  check(await page.getByRole('tab').count() > 0, 'Edit (in the ⋮) opens the tabs');
  await tab(/^Issue/);
  t = await text();
  check(/You.re editing version 1/.test(t) && /Issue Revision 2/.test(t) && /Stop Editing/.test(t), 'the Issue tab says to issue revision 2 (and Stop Editing)');
  await page.screenshot({path: path.join(SHOTS, '4-editing-issue-tab-phone.png')});
  await page.getByText('Stop Editing', {exact: true}).click(); await page.waitForTimeout(700);
  check(await page.getByRole('tab').count() === 0, 'Stop Editing closes it again');

  global.__rpc = undefined;
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
