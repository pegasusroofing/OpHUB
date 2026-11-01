// H&S policy, finishing: people with no signature adopt one at the gate and sign; the signed list; then the test policy is retired so nobody stays locked out.
const fs = require('fs'), path = require('path');
const API = 'https://dtrfupmcazoioubhwdml.supabase.co';
const anon = (fs.readFileSync(path.join(__dirname, '../../../app-native/src/lib/supabase.ts'), 'utf8').match(/SUPABASE_ANON_KEY\s*=\s*'([^']+)'/) || [])[1];
module.exports = async ({as, step, state}) => {
  for (const who of ['sm', 'driver', 'client']) {
    await step(`H&S policy: ${who} adopts a signature from the gate, signs`, async () => {
      const p = await as(who);
      await p.go('/home', 5000);
      await p.page.getByText('Adopt Your Signature').locator('visible=true').first().click({timeout: 7000});
      await p.page.waitForTimeout(3000);
      await p.page.mouse.move(80, 300); await p.page.mouse.down(); for (let i = 0; i < 12; i++) await p.page.mouse.move(80 + i * 18, 300 + (i % 2) * 30); await p.page.mouse.up();
      await p.page.waitForTimeout(500);
      await p.tap('Save Signature', {wait: 3500});
      await p.go('/home', 5000);
      await p.shot(`gate-${who}`);
      const b = p.page.getByText(/I have read and understood/).locator('visible=true');
      if (!(await b.count())) return {ok: false, note: (await p.text()).replace(/\s+/g, ' ').slice(0, 200)};
      await b.first().click();
      await p.page.waitForTimeout(3000);
      return {ok: (await p.page.getByText(/I have read and understood/).locator('visible=true').count()) === 0, note: 'signed'};
    }, who);
  }
  const pm = await as('pm');
  await step('H&S policy page as PM: signed list right, file opens', async () => {
    await pm.go('/pm/admin/hspolicy', 4500);
    await pm.page.getByText(/^Signed \(/).locator('visible=true').first().click();
    await pm.page.waitForTimeout(700);
    await pm.shot('hs-list');
    const t = (await pm.text()).replace(/\s+/g, ' ');
    const s = await pm.get(`hs_policy_signatures?select=user_id&policy_id=eq.${state.hsDoc}`);
    return {ok: s.length === 6 && /Signed \(6 of/.test(t), note: `${s.length} signatures; ${(t.match(/Signed \(\d+ of \d+\).{0,160}/) || [''])[0]}`};
  }, 'pm');
  const a = await as('admin');
  await step('Admin is on the gate with no way to sign (the guard holds Demo’s signature); test policy retired through the guard so nobody is locked out', async () => {
    await a.go('/home', 5000);
    await a.shot('gate-admin');
    const r = await a.page.evaluate(async ({url, anon, token}) => { const res = await fetch(url, {method: 'PATCH', headers: {apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation'}, body: JSON.stringify({status: 'superseded'})}); return {status: res.status, body: (await res.text()).slice(0, 120)}; }, {url: `${API}/rest/v1/hs_policy_docs?id=eq.${state.hsDoc}`, anon, token: a.ctx.__token});
    const d = (await a.get(`hs_policy_docs?select=status&id=eq.${state.hsDoc}`))[0];
    await a.go('/home', 5000);
    const t = (await a.text()).replace(/\s+/g, ' ');
    await a.shot('gate-gone');
    return {ok: d.status === 'superseded' && !/Before you can use OpHUB/.test(t), note: `${r.status}; doc ${d.status}; home: ${t.slice(0, 90)}`};
  });
  await step('Admin back in: Finance and Admin Centre open, no gate', async () => {
    await a.go('/fin/jobs', 5000);
    const t = await a.text();
    await a.go('/pm/admin', 3500);
    return {ok: /Projects/.test(t) && /Admin Centre/.test(await a.text())};
  });
};
