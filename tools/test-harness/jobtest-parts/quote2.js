// The Quotes tile from Home, past the mobile-number pop-up a new login gets.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  await step('Home: Quotes tile opens the tracker', async () => {
    await a.go('/home', 5000);
    const x = a.page.getByText('✕', {exact: true}).locator('visible=true').last();
    if (/Add your mobile number/.test(await a.text())) { await x.click({timeout: 4000}).catch(() => {}); await a.page.waitForTimeout(800); }
    await a.page.getByText('Tender tracker', {exact: true}).locator('visible=true').first().click({timeout: 7000});
    await a.page.waitForTimeout(3500);
    await a.shot('tile');
    return {ok: /pm\/quotes/.test(a.page.url()), note: a.page.url().slice(-20)};
  });
};
