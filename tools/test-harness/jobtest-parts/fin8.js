// Finance, second round: variations, day works, then an application valued through its own Excel, certified from the client's Excel and PDF.
const path = require('path'), fs = require('fs');
const ExcelJS = require('exceljs');
const NEAR = (a, b) => Math.abs(Number(a) - b) < 0.005;
// Fill the valued columns of the app's own workbook: column A holds the key, C the description.
async function valued(src, out, pctBy, col) {
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(src);
  let n = 0;
  wb.eachSheet((ws) => {
    const head = ws.getRow(1).values.map((v) => String(v && v.richText ? v.richText.map((t) => t.text).join('') : v || ''));
    const c = head.indexOf(col);
    if (c < 0) return;
    ws.eachRow((row) => { const key = String(row.getCell(1).value || ''); const d = String(row.getCell(3).value || ''); if (/^(L|V):/.test(key) && pctBy[d] != null) { row.getCell(c).value = pctBy[d]; n++; } });
  });
  await wb.xlsx.writeFile(out);
  return n;
}
module.exports = async ({as, step, state, keep, samples, OUT}) => {
  const a = await as('admin');
  const say = async (n = 400) => (await a.text()).replace(/\s+/g, ' ').slice(0, n);
  const J = state.finA;
  const appr = async (id) => (await a.get(`fin_applications?select=*&id=eq.${id}`))[0];
  const ov = async () => { await a.go(`/fin/job/${J}`, 5500); return say(500); };

  if (!state.vari) await step('Variation: issued at 1,000, final account shows it submitted', async () => {
    await a.go(`/fin/job/${J}/variations`, 5000);
    await a.shot('var-list');
    await a.tap('+ Variation', {wait: 900});
    await a.field('Title', 'ZZ Extra flashing');
    await a.field('Value issued to client £', '1000');
    await a.field('Cost estimate £', '600');
    await a.shot('var-form');
    await a.tap('Save', {wait: 3000});
    const r = (await a.get(`fin_variations?select=*&site_id=eq.${J}&title=eq.ZZ%20Extra%20flashing`))[0];
    if (!r) return {ok: false, note: await say(400)};
    state.vari = r.id; keep();
    const t = await ov();
    return {ok: r.status === 'submitted' && /\+ £1,000 submitted/.test(t), note: `${r.number} ${r.status} ${r.quoted}; ${(t.match(/Contract £[^·]*?(?=forecast|£\d+ valued|·)/) || [''])[0]}`};
  });
  await step('Variation: approved at 900, final account 10,900; edit saved', async () => {
    await a.go(`/fin/job/${J}/variations`, 5000);
    await a.page.getByText('ZZ Extra flashing').locator('visible=true').first().click();
    await a.page.waitForTimeout(1000);
    await a.page.getByText('Status', {exact: true}).locator('visible=true').last().locator('xpath=following::*[contains(text(),"▾")][1]').click();
    await a.page.waitForTimeout(700);
    await a.page.getByText('Approved', {exact: true}).locator('visible=true').last().click();
    await a.page.waitForTimeout(400);
    await a.field('Approved value £', '900');
    await a.tap('Save', {wait: 3000});
    const r = (await a.get(`fin_variations?select=status,agreed_value&id=eq.${state.vari}`))[0];
    const t = await ov();
    await a.shot('ov-var');
    return {ok: r.status === 'agreed' && NEAR(r.agreed_value, 900) && /£10,900/.test(t), note: `${JSON.stringify(r)}; ${t.slice(150, 300)}`};
  });
  await step('Variations register: Excel and PDF real', async () => {
    await a.go(`/fin/job/${J}/variations`, 5000);
    await a.tap('Excel', {wait: 1800});
    const x = await a.saved(() => a.tap('⬇️ Download', {wait: 0}));
    await a.page.waitForTimeout(800);
    await a.tap('PDF', {wait: 1800});
    const p = await a.saved(() => a.tap('📄 PDF', {wait: 0}));
    return {ok: fs.readFileSync(x).subarray(0, 2).toString() === 'PK' && fs.readFileSync(p).subarray(0, 4).toString() === '%PDF', note: `${path.basename(x)}, ${path.basename(p)}`};
  });
  if (!state.dw) await step('Day work: issued at 350, approved at 300', async () => {
    await a.go(`/fin/job/${J}/dayworks`, 5000);
    await a.tap('+ Day work', {wait: 900});
    await a.field('Title', 'ZZ Clear gutters');
    await a.field('Value £', '350');
    await a.field('Our cost £', '200');
    await a.shot('dw-form');
    await a.tap('Save', {wait: 3000});
    const r = (await a.get(`fin_dayworks?select=*&site_id=eq.${J}&title=eq.ZZ%20Clear%20gutters`))[0];
    if (!r) return {ok: false, note: await say(400)};
    state.dw = r.id; keep();
    await a.shot('dw-list');
    await a.tap('Approve', {wait: 900});
    await a.page.locator('input').locator('visible=true').last().fill('300');
    await a.page.getByText('OK', {exact: true}).locator('visible=true').last().click();
    await a.page.waitForTimeout(3000);
    const b = (await a.get(`fin_dayworks?select=status,value&id=eq.${state.dw}`))[0];
    return {ok: b.status === 'approved' && NEAR(b.value, 300), note: JSON.stringify(b)};
  });
  await step('Day work: a second one added then deleted', async () => {
    await a.go(`/fin/job/${J}/dayworks`, 5000);
    await a.tap('+ Day work', {wait: 900});
    await a.field('Title', 'ZZ Day spare');
    await a.field('Value £', '50');
    await a.tap('Save', {wait: 3000});
    const r = (await a.get(`fin_dayworks?select=id&site_id=eq.${J}&title=eq.ZZ%20Day%20spare`))[0];
    await a.page.getByText('ZZ Day spare').locator('visible=true').first().click();
    await a.page.waitForTimeout(1000);
    await a.page.getByText('Remove', {exact: true}).locator('visible=true').last().click();
    await a.page.waitForTimeout(900);
    await a.page.getByText('Remove', {exact: true}).locator('visible=true').last().click();
    await a.page.waitForTimeout(2500);
    const g = await a.get(`fin_dayworks?select=id&id=eq.${r.id}`);
    return {ok: !!r && g.length === 0, note: g.length ? 'still there' : 'gone'};
  });
  await step('Monthly report: shows this month, Excel and PDF real', async () => {
    await a.go(`/fin/job/${J}/monthly`, 5000);
    await a.shot('monthly');
    const t = await say(1300);
    await a.tap('Running total', {wait: 700});
    await a.tap('📊 Excel', {wait: 1800});
    const x = await a.saved(() => a.tap('⬇️ Download', {wait: 0}));
    await a.page.waitForTimeout(800);
    await a.tap('📄 PDF', {wait: 1800});
    const p = await a.saved(() => a.page.getByText('📄 PDF', {exact: true}).locator('visible=true').last().click());
    return {ok: fs.readFileSync(x).subarray(0, 2).toString() === 'PK' && fs.readFileSync(p).subarray(0, 4).toString() === '%PDF', note: t.slice(100, 620)};
  });
  await step('Application 2: variation and day work come in on their own', async () => {
    if (!state.app3) { await a.go(`/fin/job/${J}/application/new`, 7000); state.app3 = (a.page.url().match(/application\/([0-9a-f-]{36})/) || [])[1]; keep(); }
    const r = await appr(state.app3);
    return {ok: r.number === 2 && (r.variations || []).some((v) => NEAR(v.value, 900)) && (r.dayworks || []).some((d) => NEAR(d.value, 300)), note: `no ${r.number}, vars ${JSON.stringify(r.variations).slice(0, 110)}, days ${JSON.stringify(r.dayworks).slice(0, 110)}`};
  });
  let xl;
  await step('Application 2: download Excel, value it outside the app, upload: 7,900 + 900 + 300 = 9,100, retention cap 300, less 3,990 = 4,810', async () => {
    await a.go(`/fin/job/${J}/application/${state.app3}`, 6000);
    await a.page.getByText('⬇ Download Excel').locator('visible=true').first().click();
    await a.page.waitForTimeout(2500);
    const src = await a.saved(() => a.tap('⬇️ Download', {wait: 0}));
    xl = path.join(OUT, 'fin8-app2-valued.xlsx');
    const n = await valued(src, xl, {'Strip and re-slate': 100, 'Lead flashing': 100, 'Scaffold weeks': 50, 'Skip hire': 50, 'ZZ Extra flashing': 100}, 'Applied %');
    await a.page.waitForTimeout(800);
    await a.pick(() => a.page.getByText('⬆ Upload edited Excel').locator('visible=true').first().click(), [xl], 4000);
    await a.shot('xl-up');
    const t = await say(300);
    await a.tap('Save', {wait: 3000});
    const r = await appr(state.app3);
    return {ok: NEAR(r.gross_to_date ?? r.gross, 9100) && NEAR(r.retention, 300) && NEAR(r.net_due, 4810), note: `${n} cells; gross ${r.gross_to_date ?? r.gross} ret ${r.retention} net ${r.net_due}`};
  });
  await step('Application 2: mark applied', async () => {
    await a.tap('Mark as Applied (locks it)', {wait: 1500});
    await a.tap('Mark applied', {wait: 3500});
    return {ok: (await appr(state.app3)).status === 'submitted'};
  });
  await step('Certificate from the client’s PDF: reads each line’s %', async () => {
    await a.go(`/fin/job/${J}/application/${state.app3}`, 6000);
    await a.page.getByText('⬇ Download PDF').locator('visible=true').first().click();
    await a.page.waitForTimeout(2500);
    const p = await a.saved(() => a.tap('📄 PDF', {wait: 0}));
    await a.page.waitForTimeout(500);
    await a.pick(() => a.page.getByText(/Fill in from the client's PDF|Fill in from the client’s PDF/).locator('visible=true').first().click(), [p], 4000);
    await a.shot('cert-pdf');
    const t = await a.text();
    const rd = (t.match(/Read \d+ lines?[^.\n]*/) || t.match(/couldn.t[^.\n]*/i) || [''])[0];
    const stat = (await a.page.locator('input').locator('visible=true').evaluateAll((els) => els.map((e) => e.value))).slice(0, 8).join('|');
    return {ok: /Read [1-9]/.test(rd), note: `${rd}; boxes ${stat}`};
  });
  await step('Certificate from the client’s Excel: scaffold cut to 25%: gross 8,100, retention cap 300, net 3,810, short 1,000', async () => {
    await a.go(`/fin/job/${J}/application/${state.app3}`, 6000);
    await a.page.getByText('⬇ Download Excel').locator('visible=true').first().click();
    await a.page.waitForTimeout(2500);
    const src = await a.saved(() => a.tap('⬇️ Download', {wait: 0}));
    const out = path.join(OUT, 'fin8-app2-certified.xlsx');
    const n = await valued(src, out, {'Strip and re-slate': 100, 'Lead flashing': 100, 'Scaffold weeks': 25, 'Skip hire': 50, 'ZZ Extra flashing': 100}, 'Certified %');
    await a.page.waitForTimeout(500);
    await a.pick(() => a.page.getByText(/Fill in from the client's Excel|Fill in from the client’s Excel/).locator('visible=true').first().click(), [out], 4000);
    await a.shot('cert-xl');
    const t = await say(6000);
    await a.tap('Save certificate', {wait: 3500});
    await a.shot('cert-xl-saved');
    const r = await appr(state.app3);
    return {ok: NEAR(r.cert_gross, 8100) && NEAR(r.cert_retention, 300) && NEAR(r.cert_net, 3810), note: `${n} cells; ${r.cert_gross}/${r.cert_retention}/${r.cert_previous}/${r.cert_net}; ${(t.match(/Short by[^.]*|Over by[^.]*/) || [''])[0]}; cert lines ${(r.cert_lines || []).length}`};
  });
};
