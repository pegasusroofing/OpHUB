// O&M manual: Export, then OneDrive, lands in Warranties & Inspections.
module.exports = async ({as, step, state}) => {
  const a = await as('admin');
  const J = state.pack;
  await step('O&M: export to OneDrive lands in Warranties', async () => {
    await a.go(`/sites/${J}/handover`, 5000);
    await a.tap('+ New O&M manual', {wait: 1500});
    await a.tap('OK', {wait: 7000});
    await a.page.getByText(/Export PDF/i).locator('visible=true').last().click({timeout: 7000});
    const od = a.page.getByText('☁️ OneDrive', {exact: true}).locator('visible=true').last();
    await od.waitFor({timeout: 60000}); await od.click(); await a.page.waitForTimeout(9000);
    await a.shot('om');
    return {ok: /Saved to OneDrive/i.test(await a.text()), note: (await a.text()).replace(/\s+/g, ' ').slice(0, 160)};
  });
};
