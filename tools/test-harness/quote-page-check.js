// The client's online quote approval page (quote.html, Andy 7 Nov 2026), on a phone, with the server function faked:
// it shows the quote, needs a name, and Approve sends the decision once; an already-approved quote just says so; a
// broken link says so. node quote-page-check.js
const path = require('path');
const { chromium } = require('playwright');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const url = 'file:///' + path.resolve(__dirname, '../../quote.html').split(path.sep).join('/');
const T = '11111111-1111-4111-8111-111111111111';
const quote = (status) => ({ company: 'Sandbox Roofing', brand: '#C8102E', logo: null, contract: 'Sovereign Repairs', job: { number: 'WO-1003', address: '14 Elm Close', description: 'Leak above bedroom' },
  discount: 10, lines: [{ code: 'RF101', description: 'Replace slipped tile', unit: 'nr', qty: 4, value: 162 }, { code: null, description: 'New lead flashing', unit: null, qty: 1, value: 120 }],
  net: 282, vatPct: 20, vat: 56.4, total: 338.4, vatNote: '', status, sentAt: '2026-11-07T10:00:00Z', decidedAt: status === 'approved' ? '2026-11-07T12:00:00Z' : null });

(async () => {
  const browser = await chromium.launch(); const errs = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const calls = []; let status = 'awaiting';
  await ctx.route('**/functions/v1/repair-quote-decision', async (r) => {
    const b = JSON.parse(r.request().postData() || '{}'); calls.push(b);
    if (b.t !== T) return r.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'This quote can’t be found. It may have been withdrawn — please contact us.' }) });
    if (b.action === 'view') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(quote(status)) });
    status = b.action === 'approve' ? 'approved' : 'rejected';
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, status }) });
  });
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message)); page.on('dialog', (d) => d.accept());
  await page.goto(`${url}?t=${T}`); await page.waitForTimeout(1500);
  let t = await page.locator('body').innerText();
  check(/Quote WO-1003/.test(t) && /14 Elm Close/.test(t) && /Replace slipped tile/.test(t) && /£282\.00/.test(t) && /£338\.40/.test(t) && /Sandbox Roofing/.test(t), 'the quote: job, lines, net, VAT and total, the company');
  check(calls.length === 1 && calls[0].action === 'view', 'opening the page only reads it (nothing decided)');
  await page.screenshot({ path: 'shots/quote-page.png', fullPage: true });
  await page.getByText('Approve Quote', { exact: true }).click(); await page.waitForTimeout(500);
  check(/Please put your name/.test(await page.locator('body').innerText()) && calls.length === 1, 'a name is needed first');
  await page.fill('#nm', 'Jo Bloggs'); await page.fill('#nt', 'Please call before attending');
  await page.getByText('Approve Quote', { exact: true }).click(); await page.waitForTimeout(1000);
  t = await page.locator('body').innerText();
  const d = calls.find((c) => c.action === 'approve');
  check(!!d && d.name === 'Jo Bloggs' && /call before/.test(d.note) && /Quote Approved/.test(t), 'Approve: sent once with the name and comment; “Quote Approved”');
  await page.screenshot({ path: 'shots/quote-page-approved.png', fullPage: true });
  await page.goto(`${url}?t=${T}`); await page.waitForTimeout(1500);
  t = await page.locator('body').innerText();
  check(/has been approved/.test(t) && !/Approve Quote/.test(t), 'opened again: says it’s approved, no buttons');
  await page.goto(`${url}?t=22222222-2222-4222-8222-222222222222`); await page.waitForTimeout(1500);
  check(/can’t be found/.test(await page.locator('body').innerText()), 'a wrong link: says it can’t be found');
  check(!errs.length, `no errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
