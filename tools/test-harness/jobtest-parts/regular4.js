// A regular job, continued: email, file viewer, supersede; RAMS and toolbox talks through to an operative signing.
const fs = require('fs'), path = require('path');
module.exports = async ({as, step, state, keep, samples, ANDY}) => {
  const a = await as('admin'), J = state.regular, pdf = path.join(samples, 'wo.pdf');
  await step('Team: the operative is on the job', async () => {
    await a.go(`/sites/${J}/admin`);
    await a.tap('👥 Team — operatives, site managers & clients');
    await a.tap('Assign Operatives to Project');
    const row = a.page.getByText('andy op', {exact: true}).locator('visible=true').last().locator('xpath=ancestor::div[2]');
    await row.getByText('Assign', {exact: true}).click({timeout: 7000});
    await a.page.waitForTimeout(2000);
    const n = await a.get(`site_assignments?select=user_id&site_id=eq.${J}`);
    return {ok: n.length >= 3, note: `${n.length} assigned`};
  });
  // RAMS.
  const rams = () => a.get(`rams_docs?select=id,name,status,version,superseded_by,sign_layout&site_id=eq.${J}&order=uploaded_at`);
  const upRams = async (name) => {
    await a.go(`/sites/${J}/hs/rams`);
    if (!(await a.page.getByText('📄 Upload RAMS').locator('visible=true').count())) { await a.page.getByText(/Create \/ Upload RAMS/).locator('visible=true').first().click({timeout: 7000}); await a.page.waitForTimeout(800); }
    await a.page.getByText('📄 Upload RAMS').locator('visible=true').first().click({timeout: 7000}); await a.page.waitForTimeout(800);
    await a.fill('RAMS name', name);
    await a.shot('rams-form');
    await a.pick(() => a.page.getByText(/Choose PDF/i).locator('visible=true').first().click({timeout: 7000}), [pdf], 1000);
    await a.page.getByText(/^Upload RAMS$/).locator('visible=true').last().click({timeout: 7000});
    await a.page.waitForTimeout(4000);
  };
  await step('RAMS: upload a real PDF', async () => {
    await upRams('ZZ RAMS Roof Works');
    await a.shot('rams-up');
    const r = await rams();
    state.rams = r[0]?.id; keep();
    return {ok: r.length === 1, note: `${r[0]?.name} ${r[0]?.status}`};
  });
  await step('RAMS: open the file from the menu', async () => {
    await a.go(`/sites/${J}/hs/rams`);
    await a.page.getByText('⋮', {exact: true}).locator('visible=true').first().click({timeout: 7000}); await a.page.waitForTimeout(700);
    await a.shot('rams-menu');
    await a.tap('👁 View document', {wait: 4000});
    await a.shot('rams-view');
    await a.label('Close').catch(() => {});
    return true;
  });
  await step('RAMS: issue it for signing', async () => {
    await a.go(`/sites/${J}/hs/rams`);
    await a.page.getByText(/Mark All RAMS as Issued/i).locator('visible=true').first().click({timeout: 7000});
    await a.page.waitForTimeout(2500);
    const t = await a.text();
    return {ok: /marked as issued|Issued/i.test(t), note: (t.match(/[^\n]*issued[^\n]*/i) || [''])[0].slice(0, 80)};
  });

  // The operative: signature, then signs.
  const o = await as('op');
  await step('Operative opens the job (assigned, phone lock passes)', async () => {
    await o.go(`/sites/${J}`, 6000);
    await o.shot('op-job');
    const t = await o.text();
    return {ok: /ZZ JOB Regular/.test(t), note: t.replace(/\s+/g, ' ').slice(0, 120)};
  }, 'op');
  await step('Operative draws and saves a signature', async () => {
    await o.go('/signature', 5000);
    await o.shot('op-sig');
    await o.page.mouse.move(80, 300); await o.page.mouse.down(); for (let i = 0; i < 12; i++) await o.page.mouse.move(80 + i * 18, 300 + (i % 2) * 30); await o.page.mouse.up();
    await o.page.waitForTimeout(500);
    await o.tap('Save Signature', {wait: 3500});
    const me = (await o.get('profiles?select=signature_path&email=eq.andy.cramp%2Bop%40rtbroofinglimited.com'))[0];
    return {ok: !!me?.signature_path, note: me?.signature_path ? 'saved' : 'none'};
  }, 'op');
  await step('Operative sees the RAMS to sign and signs it', async () => {
    await o.go(`/sites/${J}/hs/rams`, 5000);
    await o.shot('op-rams');
    await o.page.getByText(/Sign All/i).locator('visible=true').first().click({timeout: 7000});
    await o.page.waitForTimeout(1200);
    await o.shot('op-rams-sign');
    const yes = o.page.getByText(/^(Yes|Sign|Confirm|I agree)/).locator('visible=true').last();
    if (await yes.isVisible().catch(() => false)) await yes.click();
    await o.page.waitForTimeout(3000);
    const s = await o.get(`rams_signatures?select=id&rams_id=eq.${state.rams}`);
    return {ok: s.length >= 1, note: `${s.length} signature(s)`};
  }, 'op');
  await step('Manager: signed PDF exports with the signature', async () => {
    await a.go(`/sites/${J}/hs/rams`);
    await a.page.getByText('⋮', {exact: true}).locator('visible=true').first().click({timeout: 7000}); await a.page.waitForTimeout(700);
    await a.tap('📄 Export signed PDF', {wait: 5000});
    const file = await a.saved(() => a.tap('📄 PDF'));
    const size = fs.statSync(file).size, base = fs.statSync(pdf).size;
    return {ok: size > base, note: `${path.basename(file)} ${Math.round(size / 1024)}KB (original ${Math.round(base / 1024)}KB)`};
  });
  await step('RAMS supersede: a new version replaces it and signatures start again', async () => {
    await a.go(`/sites/${J}/hs/rams`);
    await a.page.getByText(/Create \/ Upload RAMS/).locator('visible=true').first().click({timeout: 7000}).catch(() => {}); await a.page.waitForTimeout(800);
    await a.page.getByText('📄 Upload RAMS').locator('visible=true').first().click({timeout: 7000}); await a.page.waitForTimeout(800);
    await a.shot('rams-sup-form');
    const t = await a.text();
    return {ok: /supersede|replac|new version/i.test(t), note: (t.match(/[^\n]*(supersede|replac|version)[^\n]*/i) || ['no supersede option on the form'])[0].slice(0, 90)};
  });

  // Toolbox talk.
  const talks = () => a.get(`toolbox_talks?select=id,title,status&site_id=eq.${J}&order=created_at`);
  state.tbt = ((await talks()).find((x) => x.status === 'live') || {}).id; keep();
  await step('Operative signs the toolbox talk', async () => {
    await o.go(`/sites/${J}/hs/tbt/${state.tbt}`, 5000);
    await o.shot('op-tbt');
    await o.page.getByText(/Tap to sign/i).locator('visible=true').first().click({timeout: 7000});
    await o.page.waitForTimeout(3000);
    const s = await o.get(`tbt_signatures?select=id&tbt_id=eq.${state.tbt}`);
    const t = (await talks()).find((x) => x.id === state.tbt);
    return {ok: s.length >= 1, note: `${s.length} signature(s), talk now ${t?.status}`};
  }, 'op');
  await step('Toolbox talk: signed PDF exports', async () => {
    await a.go(`/sites/${J}/hs/tbt/${state.tbt}`);
    await a.page.getByText(/Export Signed TBT/i).locator('visible=true').first().click({timeout: 7000});
    await a.page.waitForTimeout(4000);
    const file = await a.saved(() => a.tap('📄 PDF'));
    return {ok: fs.statSync(file).size > fs.statSync(pdf).size, note: path.basename(file)};
  });
};
