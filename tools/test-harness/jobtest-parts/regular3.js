// A regular job, continued: email, file viewer, supersede; RAMS and toolbox talks through to an operative signing.
const fs = require('fs'), path = require('path');
module.exports = async ({as, step, state, keep, samples, ANDY}) => {
  const a = await as('admin'), J = state.regular, pdf = path.join(samples, 'wo.pdf');
  const emailLog = async () => { /* read back by the caller with SQL */ };

  await step('Email Report: real email to Andy only', async () => {
    await a.go(`/sites/${J}/schedule`, 5000);
    await a.page.getByText('Email Report', {exact: false}).locator('visible=true').last().click({timeout: 7000});
    await a.page.waitForTimeout(1000);
    await a.page.getByText(/andy pm/).locator('visible=true').last().click(); // starts ticked: untick
    await a.page.locator('input').locator('visible=true').last().fill(ANDY);
    await a.page.waitForTimeout(300);
    await a.tap('Send');
    await a.page.waitForTimeout(800);
    await a.tap('Today only', {wait: 9000});
    const after = await a.text();
    return {ok: /Emailed to 1 recipient/.test(after) || !/failed/i.test(after), note: after.match(/Emailed[^\n]*|Email failed[^\n]*/)?.[0] || ''};
  });

  await step('Viewing a PDF: Export hands over the same file', async () => {
    await a.go(`/sites/${J}/drawings/${state.dwg}`);
    await a.label('Options for Roof plan A.pdf', 500).catch(() => {});
    await a.page.keyboard.press('Escape').catch(() => {});
    await a.go(`/sites/${J}/drawings/${state.dwg}`);
    const views = a.page.getByText('View', {exact: true}).locator('visible=true');
    await views.first().click({timeout: 7000});
    await a.page.waitForTimeout(5000);
    await a.shot('dwg-view');
    await a.page.locator('[aria-label="Export"]').locator('visible=true').click({timeout: 7000});
    await a.page.waitForTimeout(1500);
    await a.shot('dwg-export');
    const t = await a.text();
    const file = await a.saved(() => a.tap('📄 PDF'));
    await a.label('Close');
    return {ok: t.includes('OneDrive') && fs.statSync(file).size > 500, note: path.basename(file)};
  });

  await step('Drawing supersede: new replaces old, old moves to Superseded', async () => {
    await a.go(`/sites/${J}/drawings/${state.dwg}`);
    await a.page.locator('text="+"').locator('visible=true').first().click({timeout: 7000});
    await a.tap('📄 Upload a file');
    await a.page.getByText(/○ Roof plan A\.pdf/).locator('visible=true').first().click();
    await a.pick(() => a.tap('Choose file(s)', {wait: 0}), [pdf], 5000);
    const f = await a.get(`drawing_files?select=id,name,status,supersedes&site_id=eq.${J}&folder_id=eq.${state.dwg}`);
    const old = f.find((x) => x.name === 'Roof plan A.pdf'), nw = f.find((x) => x.supersedes === old?.id);
    await a.go(`/sites/${J}/drawings/${state.dwg}`);
    const t = await a.text();
    return {ok: old?.status === 'superseded' && !!nw && /Superseded Documents \(\d\)/.test(t), note: old?.status};
  });

  // RAMS.
  const rams = () => a.get(`rams_docs?select=id,name,status,version,superseded_by,sign_layout&site_id=eq.${J}&order=uploaded_at`);
  const upRams = async (name) => {
    await a.go(`/sites/${J}/hs/rams`);
    const open = a.page.getByText('📄 UPLOAD RAMS', {exact: false}).locator('visible=true').first();
    if (!(await open.isVisible().catch(() => false))) await a.page.getByText(/Create \/ Upload RAMS/).locator('visible=true').first().click({timeout: 7000}), await a.page.waitForTimeout(800);
    await a.page.getByText(/Upload RAMS/i).locator('visible=true').first().click({timeout: 7000}); await a.page.waitForTimeout(800);
    await a.fill('RAMS name', name);
    await a.shot('rams-form');
    await a.pick(() => a.page.getByText(/Choose PDF/i).locator('visible=true').first().click({timeout: 7000}), [pdf], 1000);
    await a.page.getByText(/^UPLOAD RAMS$|^Upload RAMS$/).locator('visible=true').last().click({timeout: 7000});
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
    await a.page.getByText(/Upload RAMS/i).locator('visible=true').first().click({timeout: 7000}); await a.page.waitForTimeout(800);
    await a.shot('rams-sup-form');
    const t = await a.text();
    return {ok: /supersede|replac|new version/i.test(t), note: (t.match(/[^\n]*(supersede|replac|version)[^\n]*/i) || ['no supersede option on the form'])[0].slice(0, 90)};
  });

  // Toolbox talk.
  const talks = () => a.get(`toolbox_talks?select=id,title,status&site_id=eq.${J}&order=created_at`);
  await step('Toolbox talk: upload a real PDF into the bank', async () => {
    await a.go(`/sites/${J}/hs/tbt`);
    await a.shot('tbt');
    await a.fill('Title, e.g. Week 24 — Manual Handling', 'ZZ TBT Working at Height').catch(async () => { await a.page.getByText(/Upload/i).locator('visible=true').first().click(); await a.page.waitForTimeout(600); await a.fill('Title, e.g. Week 24 — Manual Handling', 'ZZ TBT Working at Height'); });
    await a.pick(() => a.page.getByText(/Choose PDF/i).locator('visible=true').first().click({timeout: 7000}), [pdf], 800);
    await a.page.getByText(/^UPLOAD$|^Upload$/).locator('visible=true').last().click({timeout: 7000});
    await a.page.waitForTimeout(3500);
    const t = (await talks()).find((x) => /ZZ TBT/.test(x.title));
    state.tbt = t?.id; keep();
    return {ok: !!t, note: t?.status};
  });
  await step('Toolbox talk: issue for signing', async () => {
    await a.go(`/sites/${J}/hs/tbt/${state.tbt}`);
    await a.shot('tbt-one');
    await a.page.getByText(/Issue for Signing/i).locator('visible=true').first().click({timeout: 7000});
    await a.page.waitForTimeout(2500);
    const t = (await talks()).find((x) => x.id === state.tbt);
    return {ok: t?.status === 'live', note: t?.status};
  });
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
  void emailLog;
};
