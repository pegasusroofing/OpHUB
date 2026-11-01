// Finance, for real: new jobs (application + invoice), BOQ with typed lines and import, overview, retention.
const path = require('path'), fs = require('fs');
module.exports = async ({as, step, state, keep, samples, OUT}) => {
  const a = await as('admin');
  const say = async (n = 400) => (await a.text()).replace(/\s+/g, ' ').slice(0, n);
  const newJob = async (name, chip, cv, key) => {
    await a.go('/fin/newjob', 4500);
    await a.field('Project name *', name);
    await a.tap(chip);
    if (cv) await a.field('Contract value (excl. VAT)', cv);
    await a.field('Client', 'ZZ Fin Client');
    await a.field('Postcode', 'SW1A 1AA');
    await a.shot(key + '-form');
    const n = a.page.getByText('Project number *', {exact: true}).locator('xpath=following::input[1]');
    if (await n.isEditable().catch(() => false)) await n.fill('ZZ' + Date.now().toString().slice(-6));
    await a.tap('Create project', {wait: 500});
    for (let i = 0; i < 20 && !/fin\/job\/[0-9a-f-]{36}/.test(a.page.url()); i++) await a.page.waitForTimeout(1000);
    const id = (a.page.url().match(/fin\/job\/([0-9a-f-]{36})/) || [])[1];
    state[key] = id; keep();
    await a.page.waitForTimeout(3000);
    await a.shot(key + '-made');
    const jf = id && (await a.get(`job_finance?select=billing_type,contract_value&site_id=eq.${id}`))[0];
    return {id, jf};
  };
  if (!state.finA) await step('New job A, by application, no contract value yet', async () => { const {id, jf} = await newJob('ZZ JOB Fin A', 'Application for payment', '', 'finA'); return {ok: !!id && jf?.billing_type === 'application', note: JSON.stringify(jf)}; });
  if (!state.finB) await step('New job B, by invoice, 20,000', async () => { const {id, jf} = await newJob('ZZ JOB Fin B', 'Invoice', '20000', 'finB'); return {ok: !!id && jf?.billing_type === 'invoice' && Number(jf.contract_value) === 20000, note: JSON.stringify(jf)}; });
  await step('Job B: invoice job offers no BOQ tab, no application, no retention', async () => {
    await a.go(`/fin/job/${state.finB}`, 6000);
    const t = await a.text();
    await a.tap('+ New', {exact: false, wait: 800});
    await a.shot('b-new');
    const menu = await a.text();
    await a.page.keyboard.press('Escape');
    return {ok: !/Bill of Quantities/i.test(t) && !/Retention/i.test(t) && !/\bApplication\b/i.test(menu), note: menu.replace(/\s+/g, ' ').slice(-120)};
  });
  await step('BOQ on A: import sample boq.csv, totals 5,800', async () => {
    await a.go(`/fin/job/${state.finA}/boq`, 4500);
    await a.pick(() => a.page.getByText(/Import a breakdown/).locator('visible=true').first().click(), [path.join(samples, 'boq.csv')], 3000);
    await a.shot('boq-preview');
    await a.tap('Use this breakdown', {wait: 1000});
    await a.tap('Save Bill of Quantities', {wait: 3500});
    await a.shot('boq-imported');
    const rows = await a.get(`fin_contract_items?select=kind,ref,description,qty,rate,value&site_id=eq.${state.finA}&order=position`);
    const jf = (await a.get(`job_finance?select=contract_value,contract_file_name,billing_type&site_id=eq.${state.finA}`))[0];
    const items = rows.filter((r) => r.kind === 'item');
    const sum = items.reduce((s, r) => s + Number(r.value), 0);
    return {ok: sum === 5800 && Number(jf.contract_value) === 5800, note: `${rows.length} rows, items ${items.length}, sum ${sum}, contract ${jf.contract_value}, file ${jf.contract_file_name}`};
  });
  await step('BOQ on A: add typed lines with costs, saves, total adds up', async () => {
    await a.go(`/fin/job/${state.finA}/boq`, 4500);
    // A section then two items: 10 x 400 = 4,000 and a 200 lump sum. Costs given for each.
    await a.tap('+ Section', {wait: 400});
    await a.page.locator('textarea[placeholder="Section heading"], input[placeholder="Section heading"]').locator('visible=true').last().fill('Extras');
    await a.tap('+ Item', {wait: 400});
    const last = async (ph, v) => { await a.page.locator(`input[placeholder="${ph}"], textarea[placeholder="${ph}"]`).locator('visible=true').last().fill(v); await a.page.waitForTimeout(150); };
    await last('Ref', '2.1'); await last('Description', 'Scaffold weeks'); await last('Qty', '10'); await last('Unit', 'wk'); await last('Rate £', '400'); await last('Budget cost £', '3000');
    await a.tap('+ Item', {wait: 400});
    await last('Ref', '2.2'); await last('Description', 'Skip hire'); await last('Lump sum £', '200'); await last('Budget cost £', '150');
    await a.tap('Save Bill of Quantities', {wait: 3500});
    await a.shot('boq-typed');
    const rows = await a.get(`fin_contract_items?select=kind,description,value,cost&site_id=eq.${state.finA}&order=position`);
    const jf = (await a.get(`job_finance?select=contract_value&site_id=eq.${state.finA}`))[0];
    const sum = rows.filter((r) => r.kind === 'item').reduce((s, r) => s + Number(r.value), 0);
    return {ok: sum === 10000 && Number(jf.contract_value) === 10000, note: `sum ${sum}, contract ${jf.contract_value}, rows ${JSON.stringify(rows.map((r) => [r.description, r.value, r.cost]))}`};
  });
  await step('BOQ: Excel and PDF exports are real files', async () => {
    await a.go(`/fin/job/${state.finA}/boq`, 4500);
    const t = await say(300);
    const x = await a.saved(() => a.page.getByText('📊 Excel').locator('visible=true').first().click());
    const p = await a.saved(() => a.page.getByText('📄 PDF').locator('visible=true').last().click());
    const px = fs.readFileSync(p).subarray(0, 5).toString(), xx = fs.readFileSync(x).subarray(0, 2).toString();
    return {ok: px === '%PDF-' && xx === 'PK', note: `${path.basename(x)} ${fs.statSync(x).size}b, ${path.basename(p)} ${fs.statSync(p).size}b, ${t.slice(0, 120)}`};
  });
  await step('Overview on A: reads', async () => {
    await a.go(`/fin/job/${state.finA}`, 6000);
    await a.shot('ov-a');
    return {note: await say(900)};
  });
  await step('Job set-up: set retention 5%, OHP 10%, save', async () => {
    await a.go(`/fin/job/${state.finA}?tab=setup`, 5000);
    await a.tap('Edit project details', {wait: 1000});
    await a.field('Retention %', '5');
    await a.page.getByText(/Company overheads %/).locator('visible=true').last().locator('xpath=following::input[1]').fill('10');
    await a.shot('setup-form');
    await a.tap('Save', {wait: 2500});
    const jf = (await a.get(`job_finance?select=retention_pct,ohp_pct&site_id=eq.${state.finA}`))[0];
    return {ok: Number(jf.retention_pct) === 5 && Number(jf.ohp_pct) === 10, note: JSON.stringify(jf)};
  });
};
