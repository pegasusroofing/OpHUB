const path = require('path'), fs = require('fs');
module.exports = async ({as, step, state, OUT}) => {
  const a = await as('admin');
  await step('Schedule: export with two days of photos', async () => {
    await a.go(`/sites/${state.regular}/schedule`, 5000);
    await a.tap('📄 Export', {wait: 900}); await a.tap('Full project — every photo', {wait: 500});
    const c = a.page.getByText('📄 PDF', {exact: true}).locator('visible=true').last();
    await c.waitFor({timeout: 150000});
    const [d] = await Promise.all([a.page.waitForEvent('download', {timeout: 30000}), c.click()]);
    const p = path.join(OUT, 'sow-sample.pdf'); await d.saveAs(p);
    return {note: `${fs.statSync(p).size} bytes`};
  });
};
