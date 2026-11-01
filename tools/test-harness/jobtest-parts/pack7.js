// Permit closed into the job pack, and no second copy of a drawing on a second sync.
const path = require('path'), fs = require('fs');
const ROOT = 'C:\Users\AndyCramp\OneDrive - RTB Roofing Ltd\OpHUB Progress Reports\ZZ Job Packs\ZZ JOB Pack Test';
module.exports = async ({as, step, state}) => {
  const a = await as('admin');
  const J = state.pack;
  await step('Permit: closed one lands in 3. Permits to Work', async () => {
    await a.go(`/sites/${J}/mc/permits`, 5000);
    await a.tap('+ Issue Permit');
    await a.page.getByText(/Working at Height/).locator('visible=true').first().click({timeout: 5000}); await a.page.waitForTimeout(300);
    await a.page.getByText(/^☐ /).locator('visible=true').first().click({timeout: 5000});
    await a.fill('e.g. Hot works to re-felt the plant room roof', 'ZZ pack permit');
    await a.page.getByText('Issue Permit', {exact: true}).locator('visible=true').last().click({timeout: 7000});
    await a.page.waitForTimeout(8000);
    const ps = await a.get(`permits?select=id,permit_type&site_id=eq.${J}&order=issued_at.desc&limit=1`);
    await a.go(`/sites/${J}/mc/permits/${ps[0].id}`, 4500);
    await a.page.getByText('Close Permit').locator('visible=true').last().click({timeout: 7000}); await a.page.waitForTimeout(1200);
    await a.shot('p4');
    const yes = a.page.getByText(/^(Yes|Close|Close anyway)/).locator('visible=true').last();
    if (await yes.isVisible().catch(() => false)) await yes.click();
    await a.page.waitForTimeout(9000);
    await a.shot('p5');
    const after = await a.get(`permits?select=status&id=eq.${ps[0].id}`);
    return {ok: after[0]?.status === 'closed', note: `${ps[0].permit_type}, ${after[0]?.status}`};
  });
  await step('Drawings: pressing Manual Sync again brings in no second copies', async () => {
    const before = (await a.get(`drawing_files?select=name&site_id=eq.${J}`)).length;
    await a.go(`/sites/${J}/admin`, 5000);
    await a.tap('⚙ Site set up — name & address, main contractor, multi-site');
    await a.page.getByText(/Manual Sync/).locator('visible=true').first().click({timeout: 7000});
    await a.page.waitForTimeout(9000);
    const after = (await a.get(`drawing_files?select=name&site_id=eq.${J}`)).length;
    return {ok: after === before, note: `${before}→${after}`};
  });
  await new Promise((r) => setTimeout(r, 25000));
  const files = []; (function w(d, rel) { for (const e of fs.readdirSync(d, {withFileTypes: true})) { const r = rel ? `${rel}/${e.name}` : e.name; if (e.isDirectory()) w(path.join(d, e.name), r); else files.push(r); } })(ROOT, '');
  console.log(files.filter((f) => /Permits/.test(f)).join('\n'));
};
