// Company admin, second round continued: HR policy, settings and approval, sub applications, COSHH assessment, CIS month, snag close, HAVS tool, then the H&S policy and everyone signing it.
const path = require('path'), fs = require('fs');
module.exports = async ({as, step, state, keep, samples, OUT}) => {
  const a = await as('admin');
  const say = async (n = 400) => (await a.text()).replace(/\s+/g, ' ').slice(0, n);
  const q = (s) => encodeURIComponent(s);
  const pdf = path.join(samples, 'sample.pdf'), jpg = path.join(samples, 'site-photo.jpg');
  const held = () => { const f = path.join(__dirname, '../shots/crawl/sandbox-log.jsonl'); return fs.readFileSync(f, 'utf8').trim().split('\n').slice(-6).filter((l) => /"held"/.test(l)).map((l) => { const o = JSON.parse(l); return `${o.table} ${o.method}`; }).join(', '); };
  const ok = () => a.page.getByText('OK', {exact: true}).locator('visible=true').last().click({timeout: 7000});

  await step('HR policy: uploaded one is listed with a hub count; sign it, then remove', async () => {
    const r = (await a.get('company_policies?select=*&title=eq.sample'))[0];
    if (!r) return {ok: false, note: 'no row'};
    await a.go('/pm/hr', 3500);
    await a.shot('hr-hub');
    const hub = await say(400);
    await a.go('/pm/hr/policies', 5000);
    await a.tap('✍ Sign all', {exact: false, wait: 1500}).catch(() => {});
    await a.shot('pol-sign');
    const y = a.page.getByText(/^(Sign|Yes|Sign all)$/).locator('visible=true');
    if (await y.count()) { await y.last().click(); await a.page.waitForTimeout(2500); }
    const sigs = await a.get(`company_policy_signatures?select=id&policy_id=eq.${r.id}`).catch(() => []);
    await a.go('/pm/hr/policies', 5000);
    await a.page.getByText('▼', {exact: true}).locator('visible=true').first().click();
    await a.page.waitForTimeout(800);
    await a.shot('pol-open');
    await a.tap('Remove document', {wait: 900});
    await a.page.getByText('Remove', {exact: true}).locator('visible=true').last().click();
    await a.page.waitForTimeout(2500);
    const e = (await a.get(`company_policies?select=*&id=eq.${r.id}`))[0];
    return {ok: true, note: `hub: ${(hub.match(/policies & handbook.{0,30}/) || [''])[0]}; signatures ${sigs.length}; removed flags ${JSON.stringify({archived: e?.archived, status: e?.status, active: e?.active})}; ${held()}`};
  });
  await step('HR settings: max off 2, then back', async () => {
    const was = (await a.get('hr_settings?select=*&limit=1'))[0];
    await a.go('/pm/hr/holidays', 5000);
    await a.page.getByText('Settings', {exact: true}).locator('visible=true').first().click();
    await a.page.waitForTimeout(1200);
    await a.shot('hr-set');
    const el = () => a.page.getByText('Most people off at the same time', {exact: true}).locator('visible=true').last().locator('xpath=following::input[1]');
    await el().fill('2');
    await a.tap('Save settings', {wait: 3000});
    const m = (await a.get('hr_settings?select=*&limit=1'))[0];
    await el().fill(String(was?.max_off_at_once ?? 0));
    await a.tap('Save settings', {wait: 3000});
    const e = (await a.get('hr_settings?select=*&limit=1'))[0];
    return {ok: Number(m?.max_off_at_once) === 2 && Number(e?.max_off_at_once) === Number(was?.max_off_at_once ?? 0), note: `${was?.max_off_at_once} > ${m?.max_off_at_once} > ${e?.max_off_at_once}; ${held()}`};
  });
  await step('HR: PM books 10 Nov, it waits; admin sees it; approve goes out', async () => {
    const p = await as('pm');
    await p.go('/pm/hr/holidays', 5000);
    await p.tap('+ Book time off', {wait: 900});
    await p.label('From', 700);
    await p.label('10 Nov 2026', 700);
    await p.shot('hr-pm');
    await p.tap('Book it', {wait: 3000});
    const r = (await a.get('hr_leave?select=id,status,start_date&start_date=eq.2026-11-10&order=created_at.desc&limit=1'))[0];
    if (!r) return {ok: false, note: 'PM booking did not save: ' + (await p.text()).slice(0, 200)};
    await a.go('/pm/hr/holidays', 5000);
    await a.page.getByText('Requests', {exact: true}).locator('visible=true').first().click();
    await a.page.waitForTimeout(1200);
    await a.shot('hr-req');
    const t = await say(900);
    await a.tap('Approve', {wait: 2000});
    await a.shot('hr-appr');
    const e = (await a.get(`hr_leave?select=status&id=eq.${r.id}`))[0];
    return {ok: r.status === 'pending' && /andy pm/.test(t), note: `${r.status} > ${e.status}; ${held()}`};
  }, 'admin');
  await step('Sub application: reject with a reason, then approve', async () => {
    const first = (await a.get('subcontractor_applications?select=id,status&status=eq.approved&limit=1'))[0];
    await a.go(`/pm/admin/subapps/${first.id}`, 5000);
    await a.tap('Reject', {wait: 1000});
    await a.page.locator('input').locator('visible=true').last().fill('ZZ test reason');
    await ok();
    await a.page.waitForTimeout(2500);
    await a.shot('subapp-rej');
    const m = (await a.get(`subcontractor_applications?select=status,review_note&id=eq.${first.id}`))[0];
    await a.go(`/pm/admin/subapps/${first.id}`, 5000);
    await a.tap('✓ Approve', {wait: 1000});
    await a.page.locator('input').locator('visible=true').last().fill('');
    await ok();
    await a.page.waitForTimeout(2500);
    const e = (await a.get(`subcontractor_applications?select=status,review_note&id=eq.${first.id}`))[0];
    return {ok: m.status === 'rejected' && m.review_note === 'ZZ test reason' && e.status === 'approved', note: `approved > ${m.status} (${m.review_note}) > ${e.status}; ${held()}`};
  });
  await step('COSHH: assessment made into the ZZ folder, file really there', async () => {
    await a.go('/pm/admin/coshh', 4000);
    await a.tap('Products (data sheets)', {wait: 1500});
    await a.fill('Search products…', 'ZZ Adm');
    await a.page.waitForTimeout(600);
    await a.page.getByText('ZZ Adm Product').locator('visible=true').first().click();
    await a.page.waitForTimeout(3000);
    await a.tap('Create COSHH assessment', {wait: 2000});
    await a.shot('coshh-pick');
    await a.page.getByText(/ZZ Adm Folder/).locator('visible=true').last().click({timeout: 7000});
    await a.page.waitForTimeout(500);
    await a.tap('Save to the ticked folders', {wait: 9000});
    await a.shot('coshh-made');
    const f = (await a.get(`coshh_library_folders?select=id&name=eq.${q('ZZ Adm Folder')}`))[0];
    const fl = await a.get(`coshh_library_files?select=id,name,storage_path&folder_id=eq.${f.id}`);
    await a.go('/pm/admin/coshh', 4000);
    await a.page.getByText('ZZ Adm Folder').locator('visible=true').first().click();
    await a.page.waitForTimeout(2000);
    await a.shot('coshh-folder2');
    return {ok: fl.length === 1 && !!fl[0].storage_path, note: `${JSON.stringify(fl).slice(0, 170)}; ${held()}`};
  });
  await step('CIS month: tax month to 5 Nov holds the subcontractor payment 1,900 / 280 / 1,520', async () => {
    await a.go('/fin/subs?tab=cis', 5000);
    await a.page.getByText('›', {exact: true}).locator('visible=true').nth(0).click();
    await a.page.waitForTimeout(2000);
    let t = await say(1500);
    if (!/£280\.00/.test(t)) { await a.page.getByText(/Tax month/).locator('visible=true').first().locator('xpath=following::*[text()="›"][1]').click(); await a.page.waitForTimeout(2000); t = await say(1500); }
    await a.shot('cis2');
    return {ok: /£280\.00/.test(t) && /ZZ Sub Ltd/.test(t), note: (t.match(/Tax month.{0,170}/) || [''])[0]};
  });
  await step('Retest Snag: close with a photo of the fix; database says closed', async () => {
    const s = (await a.get(`snags?select=id,status,title&site_id=eq.${state.regular}&title=eq.${q('ZZ cracked tile')}`))[0] || (await a.get(`snags?select=id,status,description&site_id=eq.${state.regular}&status=eq.open&limit=1`))[0];
    await a.go(`/sites/${state.regular}/snagging/list`, 5000);
    await a.shot('snag-list');
    await a.pick(() => a.page.getByText(/Close snag/).locator('visible=true').first().click(), [jpg], 3000).catch(async () => { await a.shot('snag-menu'); const c = a.page.getByText(/library|Choose|Photo library|gallery/i).locator('visible=true'); await a.pick(() => c.last().click(), [jpg], 3000); });
    await a.page.waitForTimeout(4000);
    await a.shot('snag-closed');
    const e = (await a.get(`snags?select=status,closed_photo_path,closed_at&id=eq.${s.id}`))[0];
    return {ok: e.status === 'closed' && !!e.closed_photo_path, note: JSON.stringify(e).slice(0, 180)};
  });
  await step('Retest HAVS: taking a tool off this site and back saves', async () => {
    await a.go(`/sites/${state.regular}/hs/havs`, 5000);
    const was = (await a.get(`sites?select=havs_tools,site_havs_tools&id=eq.${state.regular}`).catch(() => []))[0];
    const n0 = (await a.get(`havs_site_tools?select=id&site_id=eq.${state.regular}`).catch(() => [])).length;
    await a.page.getByText(/ZZ Adm Grinder/).locator('visible=true').first().click();
    await a.page.waitForTimeout(2000);
    await a.shot('havs-tog');
    const t1 = await say(500);
    const n1 = (await a.get(`havs_site_tools?select=id&site_id=eq.${state.regular}`).catch(() => [])).length;
    await a.page.getByText(/ZZ Adm Grinder/).locator('visible=true').first().click();
    await a.page.waitForTimeout(2000);
    return {note: `rows ${n0} > ${n1}; ${held()}; ${(t1.match(/Tools On This Site \(\d+\).{0,40}/) || [''])[0]}`};
  });
};
