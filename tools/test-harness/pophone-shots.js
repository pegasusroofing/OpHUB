// The PO on a phone and a saved PO (Andy, 7 Nov 2026): Lines heading not squashed; each line has headings (Description;
// Job / Qty / Unit / £ Each / Disc %; Cost Code / VAT / Total); the project quote starts closed; calendar / folder ticks start
// unticked and ask first; a saved PO opens on the same screen (its number at the top, Back, Delete). Fake database only.
// node pophone-shots.js
const {chromium, makeContext, S1} = require('./harness');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  for (const [W, H] of [[390, 844], [1300, 950]]) {
    const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: W, height: H}});
    db.profiles[0].howto_dismissed = ['*']; db.profiles[0].finance_enabled = true;
    const org = db.profiles[0].org_id;
    db.suppliers = [{id: 's1', org_id: org, name: 'Bauder', email: 'orders@bauder.test'}];
    db.purchase_orders = [{id: 'pox', org_id: org, site_id: S1, number: 'J101-PO-009', supplier_id: 's1', supplier_name: 'Bauder', status: 'open', is_draft: false, value: 200, vat: 40, total: 240, required_by: '2026-11-20', fulfilment: 'delivery', delivery_to: 'job', created_at: '2026-11-06T10:00:00Z', ordered_by_name: 'Andy', note: 'Site contact: Pat – 0700\nGate code 1234', site_contact: 'Pat', site_contact_phone: '0700',
      items: [{item: 'Felt roll', qty: 4, unit: 'roll', rate: 45, list_rate: 50, discount_pct: 10, amount: 180, cost_code: 'materials', site_id: S1, vat_rate: '20', vat: 36}, {item: 'Nails', qty: 1, unit: 'box', rate: 20, amount: 20, cost_code: 'materials', site_id: S1, vat_rate: '20', vat: 4}]}];
    db.purchase_invoices = db.purchase_invoices || [];
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message)); page.on('dialog', (d) => d.accept());
    await page.goto('http://localhost:8081/login'); await page.waitForTimeout(4000);
    await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
    await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
    await page.goto('http://localhost:8081/fin/po/new?site=' + S1); await page.waitForTimeout(5000);
    const t = await page.getByText('Lines', {exact: true}).first().boundingBox();
    check(t && t.width > t.height, `${W}: the Lines heading reads across (${t && Math.round(t.width)}×${t && Math.round(t.height)})`);
    if (W < 500) {
      check(await page.getByLabel('Open the project quote').count() === 1 && await page.getByText('Tick what you want, like a shopping list.').count() === 0, `${W}: the project quote starts closed`);
      check(await page.getByText('Description', {exact: true}).count() >= 1 && await page.getByText('£ Each', {exact: true}).count() >= 1 && await page.getByText('Cost Code', {exact: true}).count() >= 1, `${W}: each line has headings`);
      const q = await page.getByLabel('Qty', {exact: true}).first().boundingBox(), job = await page.getByLabel('Line 1 job').boundingBox();
      check(q && job && Math.abs(q.y - job.y) < 4, `${W}: Job, Qty, Unit, £ Each, Disc % sit on one row`);
      await page.screenshot({path: 'shots/job/pophone-new-390.png', fullPage: true});
    }
    const cal = page.getByText('Add To Project Calendar', {exact: false}).first();
    check(await page.getByRole('checkbox', {name: /Add To Project Calendar/}).first().getAttribute('aria-checked') !== 'true', `${W}: the calendar tick starts unticked`);
    // A saved PO.
    await page.goto('http://localhost:8081/fin/po/pox'); await page.waitForTimeout(5500);
    check(await page.getByLabel('Line 1 description').inputValue() === 'Felt roll' && await page.getByLabel('Line 2 description').inputValue() === 'Nails', `${W}: a saved PO opens on the PO screen with its lines`);
    check(await page.getByLabel('Rate').first().inputValue() === '50' && await page.getByLabel('Discount %').first().inputValue() === '10', `${W}: its rate before discount and the discount`);
    check(await page.getByText('J101-PO-009').count() >= 1 && await page.getByText('‹ Back', {exact: true}).count() === 1 && await page.getByText('Delete', {exact: true}).count() === 1, `${W}: its number at the top, Back and Delete`);
    check(await page.getByText('This Purchase Order', {exact: true}).count() === 1 && await page.getByText('+ Add Invoice', {exact: true}).count() === 1, `${W}: its invoices section underneath`);
    if (W < 500) await page.screenshot({path: 'shots/job/pophone-saved-390.png', fullPage: true}); else await page.screenshot({path: 'shots/job/posaved-1300.png', fullPage: true});
    // Save Changes keeps the note without doubling the site contact.
    await page.getByText('Save Changes', {exact: true}).click(); await page.waitForTimeout(2500);
    const po = db.purchase_orders[0];
    check((po.note.match(/Site contact/g) || []).length === 1 && /Gate code 1234/.test(po.note) && po.items[0].discount_pct === 10, `${W}: Save Changes keeps the note and discount as they were`);
    await page.getByText('Delete', {exact: true}).click(); await page.waitForTimeout(800);
    const yes = page.getByText('Delete', {exact: true}).last(); await yes.click(); await page.waitForTimeout(2000);
    check(po.status === 'cancelled', `${W}: Delete cancels it (kept in the background): ${po.status}`);
    await ctx.close();
  }
  check(!errs.length, `no errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
