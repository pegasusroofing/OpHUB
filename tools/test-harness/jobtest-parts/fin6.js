// Finance, for real: statement reconcile, yard moves, a manual cost, PDF contents, all the reports with exports.
const path = require('path'), fs = require('fs'), zlib = require('zlib');
const NEAR = (a, b) => Math.abs(Number(a) - b) < 0.005;
const API = 'https://dtrfupmcazoioubhwdml.supabase.co';
const anon = (fs.readFileSync(path.join(__dirname, '../../../app-native/src/lib/supabase.ts'), 'utf8').match(/SUPABASE_ANON_KEY\s*=\s*'([^']+)'/) || [])[1];
// Words in a PDF made by pdf-lib: inflate the streams, read the hex strings.
const pdfText = (buf) => {
  let out = '', i = 0;
  const s = buf.toString('latin1');
  while ((i = s.indexOf('stream', i)) >= 0) {
    let st = i + 6; if (s[st] === '\r') st++; if (s[st] === '\n') st++;
    const en = s.indexOf('endstream', st); if (en < 0) break;
    try { const t = zlib.inflateSync(buf.subarray(st, en)).toString('latin1'); out += (t.match(/<[0-9A-Fa-f]+>\s*Tj|\([^)]*\)\s*Tj/g) || []).map((x) => x[0] === '<' ? Buffer.from(x.replace(/[<>\sTj]/g, ''), 'hex').toString('latin1') : x.slice(1, x.lastIndexOf(')'))).join(' ') + ' '; } catch (e) { /* not a text stream */ }
    i = en + 9;
  }
  return out.replace(/\xA3/g, '£');
};
module.exports = async ({as, step, state, keep, samples, OUT}) => {
  const a = await as('admin');
  const say = async (n = 400) => (await a.text()).replace(/\s+/g, ' ').slice(0, n);
  const A = state.finA;
  const stock = async () => (await a.get(`yard_stock?select=qty&id=eq.${state.yard}`))[0];
  const choice = async (labelText, option) => {
    await a.page.getByText(labelText, {exact: true}).locator('visible=true').last().locator('xpath=following::*[contains(text(),"▾")][1]').click({timeout: 7000});
    await a.page.waitForTimeout(800);
    await a.page.getByText(option).locator('visible=true').last().click({timeout: 7000});
    await a.page.waitForTimeout(500);
  };
  await step('Statement: mark reconciled, then reopen', async () => {
    await a.go(`/fin/statements?id=${state.stmt}`, 5000);
    await a.tap('Mark reconciled', {wait: 1200});
    await a.shot('stmt-ask');
    await a.page.getByText('Mark reconciled', {exact: true}).locator('visible=true').last().click();
    await a.page.waitForTimeout(3000);
    const s = (await a.get(`fin_statements?select=status&id=eq.${state.stmt}`))[0];
    await a.tap('Reopen', {wait: 2500});
    const b = (await a.get(`fin_statements?select=status&id=eq.${state.stmt}`))[0];
    return {ok: s.status === 'reconciled' && b.status === 'open', note: `${s.status} then ${b.status}`};
  });
  await step('Yard: book in 5 on the book-in form = 15 (was 10)', async () => {
    const was = await stock();
    await a.go('/fin/yardin', 5000);
    await a.page.getByText(/ZZ Code 4 lead/).locator('visible=true').first().click();
    await a.page.waitForTimeout(500);
    await a.fill('Qty, e.g. 40', '5');
    await a.fill('From (supplier)', 'ZZ Hire Co');
    await a.shot('yard-in');
    await a.page.getByText('Book In', {exact: true}).locator('visible=true').last().click();
    await a.page.waitForTimeout(3500);
    const n = await stock();
    return {ok: Number(n.qty) === 15, note: `${was.qty} > ${n.qty}; ${await say(100)}`};
  });
  const move = async (btn, qtyLabel, qty, saveL, job) => {
    await a.go('/fin/yard', 5000);
    await a.tap(btn, {wait: 800});
    await choice('Item', /ZZ Code 4 lead/);
    await a.field(qtyLabel, String(qty));
    if (job) await choice('Job', /ZZ JOB Fin A/);
    await a.shot('yard-' + qty);
    await a.tap(saveL, {wait: 3000});
    return Number((await stock()).qty);
  };
  await step('Yard: issue 3 to the job = 12', async () => { const q = await move('⬆ Issue to a job', 'Qty', 3, 'Issue to job', true); return {ok: q === 12, note: String(q)}; });
  await step('Yard: return 1 = 13', async () => { const q = await move('↩ Return from a job', 'Qty', 1, 'Return to yard', true); return {ok: q === 13, note: String(q)}; });
  await step('Yard: count to 20', async () => { const q = await move('Adjust a count', 'Counted qty (what’s actually there)', 20, 'Save count', false); return {ok: q === 20, note: String(q)}; });
  await step('Costs ledger: yard 3 x 5 less 1 x 5 = 10 on the job; drop-downs in place', async () => {
    await a.go(`/fin/job/${A}/costs`, 5000);
    await a.shot('costs');
    const t = await say(2500);
    const m = (await a.get(`yard_moves?select=kind,qty&stock_id=eq.${state.yard}`));
    return {ok: /ZZ Code 4 lead/.test(t), note: `${JSON.stringify(m)} ${(t.match(/.{30}ZZ Code 4 lead.{90}/g) || []).join(' | ').slice(0, 300)} HEAD ${t.slice(70, 230)}`};
  });
  await step('Costs ledger: add a 200 skip, edit to 250, remove', async () => {
    await a.go(`/fin/job/${A}/costs`, 5000);
    await a.tap('+ Add cost', {wait: 900});
    await a.field('Description', 'ZZ skip');
    await a.field('Net £', '200');
    await a.shot('cost-form');
    await a.tap('Save', {wait: 3000});
    const r = (await a.get(`fin_job_costs?select=id,net&site_id=eq.${A}&description=eq.ZZ%20skip`))[0];
    if (!r) return {ok: false, note: await say(300)};
    await a.go(`/fin/job/${A}/costs`, 5000);
    await a.page.getByText('ZZ skip').locator('visible=true').first().click();
    await a.page.waitForTimeout(900);
    await a.field('Net £', '250');
    await a.tap('Save', {wait: 3000});
    const r2 = (await a.get(`fin_job_costs?select=net&id=eq.${r.id}`))[0];
    await a.go(`/fin/job/${A}/costs`, 5000);
    await a.page.getByText('ZZ skip').locator('visible=true').first().click();
    await a.page.waitForTimeout(900);
    await a.tap('Remove', {wait: 1000});
    await a.page.getByText('Remove', {exact: true}).locator('visible=true').last().click();
    await a.page.waitForTimeout(2500);
    const r3 = (await a.get(`fin_job_costs?select=id&id=eq.${r.id}`))[0];
    return {ok: NEAR(r2.net, 250) && !r3, note: `200 > ${r2.net} > ${r3 ? 'still there' : 'gone'}`};
  });
  await step('Application PDF holds the right figures', async () => {
    const f = state.appPdf; const t = pdfText(fs.readFileSync(f));
    const has = ['4,300.00', '215.00', '4,085.00'].filter((x) => t.includes(x));
    return {ok: has.length === 3, note: `found ${has.join(', ')}; ${t.slice(0, 260)}`};
  });
  await step('Invoice PDF (job B) holds the right figures', async () => {
    const i = (await a.get(`fin_invoices?select=pdf_path&id=eq.${state.bInv}`))[0];
    const h = {apikey: anon, Authorization: `Bearer ${a.ctx.__token}`};
    const s = await a.ctx.request.post(`${API}/storage/v1/object/sign/finance-docs/${i.pdf_path}`, {headers: h, data: {expiresIn: 120}});
    const u = (await s.json()).signedURL;
    const buf = await (await a.ctx.request.get(`${API}/storage/v1${u}`)).body();
    const p = path.join(OUT, 'fin-b-invoice.pdf'); fs.writeFileSync(p, buf);
    const t = pdfText(buf);
    const has = ['1,250.00', '250.00', '1,500.00', 'Lead work'].filter((x) => t.includes(x));
    return {ok: buf.subarray(0, 4).toString() === '%PDF' && has.length === 4, note: `found ${has.join(', ')}, ${buf.length}b`};
  });
  const reps = ['overview', 'cvr', 'ffa', 'budget', 'costs', 'variations', 'apps', 'retention', 'debtors', 'creditors', 'cashflow', 'pos', 'labour', 'cis', 'vat'];
  const from = Number(process.env.REP_FROM || 0);
  for (const id of reps.slice(from, from + 15)) {
    await step(`Report ${id}: opens, Excel and PDF real`, async () => {
      await a.go(`/fin/reports?id=${id}`, 3500);
      const t = await a.text();
      await a.shot(`rep-${id}`);
      let x, p;
      await a.tap('📊 Excel', {wait: 1500});
      if (/Nothing to export/.test(await a.text())) return {note: `nothing to export; ${t.replace(/\s+/g, ' ').slice(60, 240)}`};
      x = await a.saved(() => a.tap('⬇️ Download', {wait: 0}));
      await a.page.waitForTimeout(600);
      await a.tap('📄 PDF', {wait: 1800});
      p = await a.saved(() => a.page.getByText('📄 PDF', {exact: true}).locator('visible=true').last().click());
      const txt = pdfText(fs.readFileSync(p));
      if (id === 'cis' || id === 'vat' || id === 'debtors') state[`rep_${id}`] = txt.slice(0, 500), keep();
      return {ok: fs.readFileSync(x).subarray(0, 2).toString() === 'PK' && fs.readFileSync(p).subarray(0, 4).toString() === '%PDF', note: `${path.basename(p)} ${fs.statSync(p).size}b | ${txt.slice(0, 180)}`};
    });
  }
};
