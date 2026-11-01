// The last of the job pack: permit closed, drawing out and back in, material orders in, O&M, and the OneDrive folder picker.
const path = require('path'), fs = require('fs');
const ROOT = 'C:\\Users\\AndyCramp\\OneDrive - RTB Roofing Ltd\\OpHUB Progress Reports\\ZZ Job Packs\\ZZ JOB Pack Test';
module.exports = async ({as, step, state, samples}) => {
  const a = await as('admin');
  const J = state.pack, pdf = path.join(samples, 'sds.pdf'), csv = path.join(samples, 'boq.csv');
  const say = async (n = 260) => (await a.text()).replace(/\s+/g, ' ').slice(0, n);

  await step('Main contractor switched on for the job', async () => {
    await a.go(`/sites/${J}/admin`, 5000);
    await a.tap('⚙ Site set up — name & address, main contractor, multi-site');
    await a.tap('Main Contractor');
    await a.page.getByText('Acting as a Main Contractor?').locator('visible=true').first().click();
    await a.page.waitForTimeout(2500);
    return (await a.get(`sites?select=acting_as_main_contractor&id=eq.${J}`))[0]?.acting_as_main_contractor === true;
  });
  await step('Permit: closed one lands in 3. Permits to Work', async () => {
    await a.go(`/sites/${J}/mc/permits`, 5000);
    await a.tap('+ Issue Permit');
    await a.shot('p1');
    await a.page.getByText(/Height|Confined|Excavation|General|Roof/i).locator('visible=true').first().click({timeout: 5000}).catch(() => {}); await a.page.waitForTimeout(300);
    await a.shot('p2');
    const who = a.page.getByText(/^☐ /).locator('visible=true').first();
    if (await who.isVisible().catch(() => false)) await who.click();
    else return {ok: false, note: `nobody to pick: ${await say()}`};
    await a.fill('e.g. Hot works to re-felt the plant room roof', 'ZZ pack permit');
    await a.page.getByText('Issue Permit', {exact: true}).locator('visible=true').last().click({timeout: 7000});
    await a.page.waitForTimeout(8000);
    const ps = await a.get(`permits?select=id,permit_type&site_id=eq.${J}&order=issued_at.desc&limit=1`);
    if (!ps[0]) return {ok: false, note: `no permit: ${await say()}`};
    await a.go(`/sites/${J}/mc/permits/${ps[0].id}`, 4500);
    await a.page.getByText('Close Permit').locator('visible=true').last().click({timeout: 7000}); await a.page.waitForTimeout(1200);
    await a.shot('p4');
    const yes = a.page.getByText(/^(Yes|Close|Close anyway)/).locator('visible=true').last();
    if (await yes.isVisible().catch(() => false)) await yes.click();
    await a.page.waitForTimeout(9000);
    await a.shot('p5');
    const after = await a.get(`permits?select=status&id=eq.${ps[0].id}`);
    return {ok: after[0]?.status === 'closed', note: `${ps[0].permit_type}, ${after[0]?.status} | ${await say(150)}`};
  });
  await step('Drawing: added in the app, sent to Project Drawings', async () => {
    const f = (await a.get(`drawing_folders?select=id,name&site_id=eq.${J}&name=eq.Drawings`))[0];
    await a.go(`/sites/${J}/drawings/${f.id}`, 5000);
    await a.page.locator('text="+"').locator('visible=true').first().click({timeout: 7000}); await a.page.waitForTimeout(700);
    await a.tap('📄 Upload a file');
    await a.pick(() => a.tap('Choose file(s)', {wait: 0}), [pdf], 9000);
    const r = await a.get(`drawing_files?select=id,name&site_id=eq.${J}`);
    return {ok: r.length >= 1, note: `${r.length} in the app`};
  });
  await step('Drawing: a file put in OneDrive comes into the app on Manual Sync', async () => {
    await a.go(`/sites/${J}/documents`, 6000);
    await a.page.getByText('3. Drawings & Technical', {exact: true}).locator('visible=true').first().click({timeout: 7000}); await a.page.waitForTimeout(4000);
    await a.page.getByText('1. Project Drawings & Generic Spec', {exact: true}).locator('visible=true').first().click({timeout: 7000}); await a.page.waitForTimeout(4000);
    await a.pick(() => a.tap('⬆️ Add a file here', {wait: 0}), [csv], 8000);
    await a.shot('in1');
    const seen = /boq\.csv/.test(await a.text());
    await a.go(`/sites/${J}/admin`, 5000);
    await a.tap('⚙ Site set up — name & address, main contractor, multi-site');
    await a.page.getByText(/Manual Sync/).locator('visible=true').first().click({timeout: 7000});
    await a.page.waitForTimeout(12000);
    await a.shot('in2');
    const r = await a.get(`drawing_files?select=name&site_id=eq.${J}`);
    return {ok: seen && r.some((x) => /boq/.test(x.name)), note: `${seen} | ${r.map((x) => x.name).join(', ')}`};
  });
  await step('Material orders: a file in OneDrive comes in on Sync Now', async () => {
    await a.go(`/sites/${J}/documents`, 6000);
    await a.page.getByText('4. Subcontractors & Suppliers', {exact: true}).locator('visible=true').first().click({timeout: 7000}); await a.page.waitForTimeout(4000);
    await a.page.getByText('4. Supplier Material Orders', {exact: true}).locator('visible=true').first().click({timeout: 7000}); await a.page.waitForTimeout(4000);
    await a.pick(() => a.tap('⬆️ Add a file here', {wait: 0}), [pdf], 8000);
    await a.go(`/sites/${J}/materials/pos`, 5000);
    await a.shot('mo1');
    await a.page.getByText(/Sync Now/).locator('visible=true').first().click({timeout: 7000});
    await a.page.waitForTimeout(12000);
    await a.shot('mo2');
    return {ok: /sds/.test(await a.text()), note: await say(240)};
  });
  await step('O&M: export to OneDrive lands in Warranties', async () => {
    await a.go(`/sites/${J}/om`, 5000);
    await a.shot('om1');
    return {note: await say(240)};
  });
  await step('Folder picker: choose a folder through the app and link it', async () => {
    await a.go(`/sites/${state.regular}/admin`, 5000);
    await a.tap('⚙ Site set up — name & address, main contractor, multi-site');
    await a.page.getByText(/^(Link folder|Change folder)$/i).locator('visible=true').first().click({timeout: 7000});
    await a.page.waitForTimeout(7000);
    await a.shot('pk1');
    await a.page.getByText('OpHUB Progress Reports').locator('visible=true').first().click({timeout: 9000}); await a.page.waitForTimeout(6000);
    await a.page.getByText('ZZ Estimating').locator('visible=true').first().click({timeout: 9000}); await a.page.waitForTimeout(6000);
    await a.shot('pk2');
    await a.page.getByText(/Use "ZZ Estimating"/i).locator('visible=true').first().click({timeout: 7000});
    await a.page.waitForTimeout(4000);
    const s = (await a.get(`sites?select=onedrive_folder_name,onedrive_drive_id,onedrive_folder_id&id=eq.${state.regular}`))[0];
    return {ok: s?.onedrive_folder_name === 'ZZ Estimating' && !!s.onedrive_folder_id, note: `${s?.onedrive_folder_name}, drive saved ${!!s?.onedrive_drive_id}`};
  });
  await new Promise((r) => setTimeout(r, 30000));
  const files = []; (function w(d, rel) { for (const e of fs.readdirSync(d, {withFileTypes: true})) { const r = rel ? `${rel}/${e.name}` : e.name; if (e.isDirectory()) w(path.join(d, e.name), r); else files.push(r); } })(ROOT, '');
  console.log(files.filter((f) => /Permits|Project Drawings|Material Orders|Warranties/.test(f)).join('\n'));
};
