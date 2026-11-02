// What the app shows right now on Sandbox, and any failing network calls.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const bad = [];
  a.page.on('response', (r) => { if (r.status() >= 400 && /supabase/.test(r.url())) bad.push(r.status() + ' ' + r.url().split('supabase.co')[1].slice(0, 70)); });
  a.page.on('requestfailed', (r) => { if (/supabase/.test(r.url())) bad.push('FAILED ' + (r.failure() || {}).errorText + ' ' + r.url().split('supabase.co')[1].slice(0, 70)); });
  a.page.on('console', (m) => { if (m.type() === 'error') bad.push('console ' + m.text().slice(0, 120)); });
  await step('Home', async () => {
    await a.go('/home', 8000); await a.page.waitForTimeout(4000); await a.shot('home');
    const t = (await a.text()).replace(/\s+/g, ' ');
    console.log('BAD', JSON.stringify(bad.slice(0, 10)));
    return {ok: !/offline/i.test(t), note: new URL(a.page.url()).pathname + ' | ' + t.slice(0, 160)};
  });
};
