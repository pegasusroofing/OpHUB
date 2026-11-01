// End of the second round: approving the PM's leave, snags, laptop view of the lists, then the H&S policy and everyone signing it.
const path = require('path'), fs = require('fs');
module.exports = async ({as, step, state, keep, samples, OUT}) => {
  const a = await as('admin');
  const say = async (n = 400) => (await a.text()).replace(/\s+/g, ' ').slice(0, n);
  const pdf = path.join(samples, 'sample.pdf');
  const held = () => { const f = path.join(__dirname, '../shots/crawl/sandbox-log.jsonl'); return fs.readFileSync(f, 'utf8').trim().split('\n').slice(-6).filter((l) => /"held"/.test(l)).map((l) => { const o = JSON.parse(l); return `${o.table} ${o.method}`; }).join(', '); };
  await step('HR: admin sees the PM’s request and presses Approve', async () => {
    const r = (await a.get('hr_leave?select=id,status&start_date=eq.2026-11-10&order=created_at.desc&limit=1'))[0];
    await a.go('/pm/hr/holidays', 5000);
    await a.page.getByText(/^Requests/).locator('visible=true').first().click();
    await a.page.waitForTimeout(1200);
    await a.shot('hr-req');
    const t = await say(900);
    await a.tap('Approve', {wait: 2500});
    await a.shot('hr-appr');
    const e = (await a.get(`hr_leave?select=status&id=eq.${r.id}`))[0];
    return {ok: r.status === 'pending' && /andy pm/.test(t), note: `${r.status} > ${e.status}; ${held()}`};
  });
  await step('Snags: one closed with its photo', async () => {
    const s = await a.get(`snags?select=title,status,closed_photo_path&site_id=eq.${state.regular}`);
    return {ok: s.some((x) => x.status === 'closed' && x.closed_photo_path), note: JSON.stringify(s.map((x) => [x.title, x.status, !!x.closed_photo_path]))};
  });
  await step('Tab cue shows on every Finance page; laptop lists keep their tables', async () => {
    await a.go('/fin/jobs', 5000);
    await a.shot('cue');
    await a.page.setViewportSize({width: 1300, height: 900});
    await a.go('/fin/jobs', 5000);
    await a.shot('wide-jobs');
    const t = await say(800);
    await a.go('/fin/sales?tab=invoices', 5000);
    await a.shot('wide-sales');
    await a.go('/fin/purchases?tab=orders', 5000);
    await a.shot('wide-po');
    await a.page.setViewportSize({width: 390, height: 844});
    return {ok: /JOB NO|Job No/.test(t), note: t.slice(60, 260)};
  });
  await step('H&S policy: upload with an expiry, gate comes up, admin signs', async () => {
    await a.go('/pm/admin/hspolicy', 4000);
    await a.page.getByText('Upload H&S Policy').locator('visible=true').first().click();
    await a.page.waitForTimeout(600);
    await a.fill('Document name, e.g. Health & Safety Policy 2026', 'ZZ Test H&S Policy');
    await a.label('Expiry date', 700);
    await a.label('Next month', 400);
    await a.page.getByText('15', {exact: true}).locator('visible=true').last().click();
    await a.page.waitForTimeout(400);
    await a.pick(() => a.tap('Choose PDF', {wait: 0}), [pdf], 800);
    await a.shot('hs-form');
    await a.page.getByText('Upload', {exact: true}).locator('visible=true').last().click();
    await a.page.waitForTimeout(3500);
    await a.shot('hs-up');
    const d = (await a.get('hs_policy_docs?select=id,name,expiry_date,status&status=eq.current&order=uploaded_at.desc&limit=1'))[0];
    if (!d) return {ok: false, note: await say(400)};
    state.hsDoc = d.id; keep();
    await a.go('/home', 5000);
    await a.shot('hs-gate');
    const t = await say(500);
    await a.page.getByText(/I have read and understood/).locator('visible=true').first().click({timeout: 7000});
    await a.page.waitForTimeout(3000);
    await a.shot('hs-signed');
    const s = await a.get(`hs_policy_signatures?select=user_id&policy_id=eq.${d.id}`);
    return {ok: d.name === 'ZZ Test H&S Policy' && s.length >= 1, note: `${d.expiry_date} ${d.status}; ${t.slice(0, 150)}; signatures ${s.length}`};
  });
  for (const who of ['pm', 'sm', 'op', 'driver', 'client', 'sub']) {
    await step(`H&S policy: ${who} login meets the gate and signs, so it stays usable`, async () => {
      const p = await as(who);
      await p.go('/home', 5000);
      await p.shot(`hs-${who}`);
      const t = (await p.text()).replace(/\s+/g, ' ');
      const b = p.page.getByText(/I have read and understood/).locator('visible=true');
      if (!(await b.count())) return {note: `no gate or button: ${t.slice(0, 160)}`};
      await b.first().click();
      await p.page.waitForTimeout(3000);
      const left = await p.page.getByText(/I have read and understood/).locator('visible=true').count();
      return {ok: left === 0, note: left ? 'still on the gate' : 'signed'};
    }, who);
  }
  await step('H&S policy page: signed count and the file opens', async () => {
    await a.go('/pm/admin/hspolicy', 4000);
    await a.page.getByText(/^Signed \(/).locator('visible=true').first().click();
    await a.page.waitForTimeout(600);
    await a.shot('hs-list');
    return {note: (await say(800)).slice(40, 500)};
  });
};
