// Bottom bar at phone size for a manager: only inside Projects.
module.exports = async ({as, step, state}) => {
  const a = await as('admin');
  await a.page.setViewportSize({width: 375, height: 812});
  const bar = async () => a.page.locator('[aria-label="Deliveries"][role=button]').locator('visible=true').count();
  const look = (name, path, want) => step(name, async () => {
    await a.go(path, 5000); await a.page.getByText(/^not now$/i).first().click({timeout: 800}).catch(() => {}); await a.page.waitForTimeout(1200); await a.shot(name.replace(/\W+/g, '-').toLowerCase());
    const n = await bar();
    return {ok: (n > 0) === want, note: path + ' bar ' + n};
  });
  await look('Home none', '/home', false);
  await look('Finance none', '/fin', false);
  await look('Deliveries none', '/pm/deliveries', false);
  await look('Projects has it', '/sites', true);
  const [J] = await a.get('sites?select=id&status=eq.active&limit=1');
  await look('Job has it', '/sites/' + J.id, true);
};
