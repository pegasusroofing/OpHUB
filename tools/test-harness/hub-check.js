// The HUB (Andy, 7 Nov 2026, Option 1): tabs Everything, Projects, Finance and Company Chat with red counts. Finance
// brings in what's been sent to the PM (purchase invoices to book, wages to book, invoice queries); each item drops off
// once it's dealt with; the Company Chat is the whole company, with @tags. Phone size. Fake database; nothing is sent.
// node hub-check.js
const {chromium, makeContext, S1} = require('./harness');
const seed = require('./fresh/seed');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const ago = (mins) => new Date(Date.now() - mins * 60000).toISOString();
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'pm', [], {shot: true});
  seed(db); db.profiles[0].howto_dismissed = ['*'];
  const O = db.organizations[0].id;
  db.profiles.push({id: 'fp1', org_id: O, name: 'Fiona Books', role: 'admin', finance_enabled: true}, {id: 'ms1', org_id: O, name: 'Mike Site', role: 'operative'}, {id: 'cl1', org_id: O, name: 'Clara Client', role: 'client'});
  db.fin_inbox = [{id: 'fi1', org_id: O, assigned_pm: 'me', status: 'new', stage: 'with_pm', site_id: null, file_name: 'jewson.pdf', extracted: {supplier: 'Jewson', invoice_no: '88412', total: 1240.5}, assigned_at: ago(120), received_at: ago(200)}];
  db.wage_pushes = [{id: 'w1', org_id: O, site_id: S1, status: 'pending', amount: 640, week_start: '2026-11-03'}];
  db.messages = (db.messages || []).concat([
    {id: 'mq1', org_id: O, site_id: S1, sender_id: 'fp1', audience: 'single', recipient_id: 'me', kind: 'pi_query', body: 'Query on SIG Inv 5521: Is this delivery yours?', related_id: 'pi9', parent_id: null, created_at: ago(60)},
    {id: 'mm1', org_id: O, site_id: null, sender_id: 'fp1', audience: 'single', recipient_id: 'me', kind: 'message', body: 'Can you call the client back?', related_id: null, parent_id: null, created_at: ago(50)},
    {id: 'mt1', org_id: O, site_id: null, sender_id: 'fp1', audience: 'single', recipient_id: 'me', kind: 'message', body: 'Fiona Books tagged you in Company Chat: PO came in, it\'s on the job.', related_id: null, parent_id: null, created_at: ago(40)},
  ]);
  db.message_reads = db.message_reads || [];
  db.company_chat = [
    {id: 'c3', org_id: O, sender_id: 'fp1', sender_name: 'Fiona Books', body: '@Paula PM PO came in, it\'s on the job. Bellway valuation is due Friday.', mentions: ['me'], created_at: ago(40)},
    {id: 'c2', org_id: O, sender_id: 'me', sender_name: 'Paula PM', body: 'Nice one. @Fiona Books can you chase the Bellway PO?', mentions: ['fp1'], created_at: ago(1500)},
    {id: 'c1', org_id: O, sender_id: 'ms1', sender_name: 'Mike Site', body: 'Scaffold down at Cleveland Primary, north side clear.', mentions: [], created_at: ago(1520)},
  ];
  db.company_chat_reads = [];
  // The invoice query page (a PM can't read purchase invoices themselves): its view and reply.
  const thread = [{by: 'fp1', name: 'Fiona Books', at: ago(60), text: 'Is this delivery yours?'}];
  await ctx.route('**/rest/v1/rpc/fin_pi_query_view', (r) => r.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify([{status: 'query', supplier_name: 'SIG', invoice_no: '5521', site_name: 'Studley Rd', net: 260, total: 312, query_note: 'Is this delivery yours?', query_thread: thread}])}));
  await ctx.route('**/rest/v1/rpc/fin_pi_query_reply', (r) => { const b = JSON.parse(r.request().postData() || '{}'); thread.push({by: 'me', name: 'Paula PM', at: new Date().toISOString(), text: b.p_text}); r.fulfill({status: 200, contentType: 'application/json', body: 'null'}); });

  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  const hub = async (tab) => { await page.goto('http://localhost:8081/pm/hub' + (tab ? '?tab=' + tab : '')); await page.waitForTimeout(5000); };
  const tabLabel = async (name) => (await page.getByRole('tab', {name: new RegExp('^' + name)}).first().getAttribute('aria-label')) || '';
  const body = async () => page.locator('body').innerText();

  await hub();
  const fin = await tabLabel('Finance'), chat = await tabLabel('Company Chat'), all = await tabLabel('Everything');
  check(/Finance, 6$/.test(fin), 'Finance tab counts 6: 3 sent to me, and Finance’s 3 to-dos as I’m a Finance user (' + fin + ')');
  check(/Company Chat, 2$/.test(chat), 'Company Chat counts the 2 messages from other people (' + chat + ')');
  check(/Everything, \d+$/.test(all), 'Everything has a count (' + all + ')');
  const red = await page.evaluate(() => { const t = [...document.querySelectorAll('[role="tab"]')].find((x) => /^Finance/.test(x.getAttribute('aria-label') || '')); const n = t && [...t.querySelectorAll('div')].find((d) => d.textContent === '6'); return n ? getComputedStyle(n).backgroundColor : ''; });
  check(red === 'rgb(227, 38, 43)', 'the counts are red (' + red + ')');
  let t = await body();
  check(/Finance · Purchase Invoice To Book/.test(t) && /Company Chat · Tagged You/.test(t) && /Projects · /.test(t), 'Everything says which area each item is from');
  await page.screenshot({path: 'shots/hub-everything.png'});

  await page.getByRole('tab', {name: /^Finance/}).click(); await page.waitForTimeout(800);
  t = await body();
  check(/Purchase Invoice To Book/.test(t) && /£1,240\.50/.test(t), 'Finance tile: the purchase invoice sent to me to book, with its amount');
  check(/Wages To Book/.test(t) && /£640\.00/.test(t), 'Finance: wages to book on my job');
  check(/Invoice Query/.test(t), 'Finance tile: the invoice query');
  check(/Purchase Invoices To Approve/.test(t) && /Overdue Invoices/.test(t), 'Finance tiles: Finance’s own to-do list, for a Finance user (capitalised)');
  await page.screenshot({path: 'shots/hub-finance.png'});
  // Projects: line by line under a heading for each kind of task.
  await page.getByRole('tab', {name: /^Projects/}).click(); await page.waitForTimeout(600);
  const pt = await body();
  check(/TOOLBOX TALK \(\d+\)/.test(pt) && /MESSAGE \(\d+\)/.test(pt), 'Projects grouped by task, with headings');
  await page.screenshot({path: 'shots/hub-projects.png'});
  await page.getByRole('tab', {name: /^Finance/}).click(); await page.waitForTimeout(600);
  check(!/Can you call the client/.test(t), 'Finance shows Finance only');
  await page.screenshot({path: 'shots/hub-finance.png'});

  // Dealt with → gone.
  await page.getByRole('tab', {name: /^Projects/}).click(); await page.waitForTimeout(600);
  await page.getByText('Can you call the client back?', {exact: true}).click(); await page.waitForTimeout(2500);
  check(db.message_reads.some((r) => r.message_id === 'mm1'), 'opening a message marks it read');
  await page.getByText('Invoice Query', {exact: false}).first().count(); // (on Inbox now)
  await page.goto('http://localhost:8081/pm/piquery/pi9'); await page.waitForTimeout(4000);
  await page.screenshot({path: 'shots/hub-piquery.png'});
  await page.getByPlaceholder(/2 packs came short/).fill('Yes, ours — the driver has the note');
  await page.getByText('Send reply', {exact: true}).click(); await page.waitForTimeout(3000);
  check(db.message_reads.some((r) => r.message_id === 'mq1'), 'replying to the invoice query clears it');
  db.fin_inbox[0].status = 'filed'; // the PM booked it to a job (fin_inbox_pm_book)
  db.wage_pushes[0].status = 'booked'; // booked against a price
  await hub();
  t = await body();
  check(!/Can you call the client/.test(t), 'the message has dropped off');
  check(!/Jewson/.test(t), 'the booked invoice has dropped off');
  check(!/Wages To Book/.test(t), 'the booked wages have dropped off');
  check(!/Is this delivery yours/.test(t), 'the answered query has dropped off');
  check(/Finance, 3$/.test(await tabLabel('Finance')), 'Finance counts only its own 3 to-dos now, still to do (' + await tabLabel('Finance') + ')');

  // The Company Chat.
  await page.getByRole('tab', {name: /^Company Chat/}).click(); await page.waitForTimeout(2500);
  t = await body();
  check(/Scaffold down at Cleveland Primary/.test(t) && /Bellway valuation is due Friday/.test(t), 'the chat shows the team’s messages');
  check(db.company_chat_reads.some((r) => r.user_id === 'me'), 'opening the chat marks it read');
  check(db.message_reads.some((r) => r.message_id === 'mt1'), 'and the "tagged you" message too');
  const box = page.getByLabel('Message', {exact: true});
  await box.click(); await box.type('Thanks @Fi'); await page.waitForTimeout(600);
  t = await body();
  check(/Tag Someone/.test(t) && /Fiona Books/.test(t) && !/Clara Client/.test(t), 'typing @Fi offers Fiona Books (not clients)');
  await page.screenshot({path: 'shots/hub-chat.png'});
  await page.getByLabel('Tag Fiona Books').click(); await page.waitForTimeout(300);
  check((await box.inputValue()) === 'Thanks @Fiona Books ', 'choosing her puts @Fiona Books in the message (' + await box.inputValue() + ')');
  await box.type('great'); await page.getByLabel('Send', {exact: true}).click(); await page.waitForTimeout(2500);
  const sent = db.company_chat.find((m) => /great$/.test(m.body || ''));
  check(!!sent && sent.body === 'Thanks @Fiona Books great' && JSON.stringify(sent.mentions) === '["fp1"]', 'sent, with Fiona tagged (' + JSON.stringify(sent && sent.mentions) + ')');
  check((await box.inputValue()) === '', 'the box empties after sending');
  await hub();
  check(/Company Chat$/.test(await tabLabel('Company Chat')), 'the chat count has gone (' + await tabLabel('Company Chat') + ')');
  check(!/Tagged You/.test(await body()), 'and the "tagged you" item has dropped off');
  check(!errs.length, `no errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
