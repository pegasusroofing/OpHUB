// The back arrow, walked as a person would: tap in through tiles, press back, and see where it lands. Read only, on Sandbox.
module.exports = async ({as, step, state}) => {
  const a = await as('admin');
  const here = () => new URL(a.page.url()).pathname.replace(/\/$/, '') + new URL(a.page.url()).search;
  const clear = async () => { await a.page.getByText(/^not now$/i).locator('visible=true').first().click({timeout: 1500}).catch(() => {}); await a.page.waitForTimeout(300); };
  const tap = async (t) => { await clear(); await a.page.getByText(t instanceof RegExp ? t : new RegExp(`^${t}$`)).locator('visible=true').first().click({timeout: 7000}); await a.page.waitForTimeout(1800); };
  const back = async () => { await clear(); await a.page.locator('[aria-label="Back"]').locator('visible=true').last().click({timeout: 6000}); await a.page.waitForTimeout(1800); return here(); };
  const site = state.regular;
  // start page, tiles to tap, then where each press of back should land
  const walks = [
    ['Home > Dashboard', '/home', ['Dashboard'], ['/home']],
    ['Dashboard > Operative tab', '/pm/dashboard', ['Operative dashboard'], ['/home']],
    ['Home > Admin > Team', '/home', ['Admin', /Users & invites|Users/], ['/pm/admin', '/home']],
    ['Home > Quotes', '/home', ['Quotes'], ['/home']],
    ['Home > HR', '/home', ['HR'], ['/home']],
    ['Home > Calendar', '/home', ['Calendar'], ['/home']],
    ['Home > Finance > Purchases', '/home', ['OpHUB Finance', 'Purchases'], ['/fin', '/home']],
    ['Finance > Projects', '/fin', ['Projects'], ['/fin']],
    ['Job > Materials', `/sites/${site}`, ['Materials'], [`/sites/${site}`, '/sites']],
    ['Job > H&S', `/sites/${site}`, [/^H&S|Health/], [`/sites/${site}`, '/sites']],
    ['Job > Drawings', `/sites/${site}`, [/^Drawings/], [`/sites/${site}`, '/sites']],
    ['Job > Finance > back to job', `/sites/${site}`, [/^COSTS TO DATE$/i], [`/sites/${site}`, '/sites']],
    ['Projects > back to home', '/sites', [], ['/home']],
    ['Reload in Finance job costs', '/fin/jobs', [], ['/fin', '/home']],
    ['Old page left behind: Dashboard, Home, Admin, Users', '/home', ['Dashboard'], ['/home']],
    ['Direct to a Finance record page', '/fin/labour/new', [], ['/fin/subs', '/fin', '/home']],
    ['Direct to Admin Users', '/pm/admin/users', [], ['/pm/admin', '/home']],
  ];
  for (const [name, start, taps, want] of walks) {
    await step(`Back: ${name}`, async () => {
      await a.go(start, 4500);
      const trail = [start];
      for (const t of taps) { await tap(t); trail.push(here()); }
      const got = [];
      for (let i = 0; i < want.length; i++) got.push(await back());
      const ok = want.every((w, i) => got[i].split('?')[0] === w);
      return {ok, note: `went ${trail.join(' > ')} | back ${got.join(' > ')} | wanted ${want.join(' > ')}`};
    });
  }
};
