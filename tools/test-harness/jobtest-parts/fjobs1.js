// Finance › Projects on Sandbox (Andy, 1 Nov): no Clients tab, no long search bar on a laptop, the box stays on a phone.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const clear = async () => { await a.page.getByText(/^not now$/i).locator('visible=true').first().click({timeout: 800}).catch(() => {}); };
  const vis = (sel) => a.page.locator(sel).locator('visible=true').count();
  await step('Laptop: table, no Clients tab, no search bar', async () => {
    await a.page.setViewportSize({width: 1440, height: 800});
    await a.go('/fin/jobs', 6000); await clear(); await a.page.waitForTimeout(2000); await a.shot('desk');
    const tabs = await a.page.getByText(/^Clients$/).locator('visible=true').count();
    const search = await vis('input[placeholder^="Search project"]');
    const rows = (await a.text()).match(/SBX-\d+/g) || [];
    return {ok: tabs === 0 && search === 0 && rows.length > 3, note: `Clients tabs ${tabs}, search boxes ${search}, ${rows.length} job numbers`};
  });
  await step('Headings sort: name A to Z by default, click Value for low to high, again for high to low, again back to name', async () => {
    // The Value column's cells, top to bottom, as numbers (— is 0).
    const values = async () => { const t = (await a.text()).replace(/\s+/g, ' '); return (t.match(/(£[\d,]+|—)(?= (?:SBX-|\d+ projects))/g) || []).map((v) => Number(v.replace(/[£,]/g, '')) || 0); };
    const text = async () => (await a.text()).replace(/\s+/g, ' ');
    await a.go('/fin/jobs', 6000); await clear(); await a.page.waitForTimeout(1500);
    const names0 = ((await text()).match(/SBX-\d+ ([A-Za-z][A-Za-z0-9 '&-]{2,40}?) (?=[A-Z][a-z]+ |—|No |ZZ)/g) || []).map((x) => x.replace(/^SBX-\d+ /, '').trim());
    const sortedByName = names0.length > 3 && names0.slice().sort((x, y) => x.localeCompare(y, 'en-GB', {sensitivity: 'base'})).join('|') === names0.join('|');
    await a.page.getByText(/^Value$/).locator('visible=true').first().click({timeout: 6000}); await a.page.waitForTimeout(800); await a.shot('sort1');
    const v1 = await values(), asc = /Value ▲/.test(await text()) && v1.every((v, i) => !i || v >= v1[i - 1]);
    await a.page.getByText(/^Value ▲$/).locator('visible=true').first().click({timeout: 6000}); await a.page.waitForTimeout(800);
    const v2 = await values(), desc = /Value ▼/.test(await text()) && v2.every((v, i) => !i || v <= v2[i - 1]);
    await a.page.getByText(/^Value ▼$/).locator('visible=true').first().click({timeout: 6000}); await a.page.waitForTimeout(800); await a.shot('sort3');
    const off = !/Value [▲▼]/.test(await text());
    return {ok: sortedByName && asc && desc && off, note: `by name first ${sortedByName} (${names0.slice(0, 3).join(', ')}); low to high ${asc} (${v1.slice(0, 4).join(',')}); high to low ${desc}; off ${off}`};
  });
  await step('Old Clients link goes to the Projects list', async () => {
    await a.go('/fin/jobs?tab=clients', 5000); await clear(); await a.page.waitForTimeout(1500);
    const t = await a.text();
    return {ok: /Job No|SBX-/.test(t) && !/Search clients/.test(t), note: t.replace(/\s+/g, ' ').slice(0, 120)};
  });
  await step('Directory: clients with jobs, owed, and jobs with no client', async () => {
    await a.go('/fin/directory?kind=client', 6000); await clear(); await a.page.waitForTimeout(2000); await a.shot('dir');
    const t = (await a.text()).replace(/\s+/g, ' ');
    return {ok: /Jobs/.test(t) && /Owed/.test(t), note: (t.match(/Jobs with no client set:[^.]{0,120}/) || ['no "no client" line'])[0]};
  });
  await step('Phone: search box back, list rows', async () => {
    await a.page.setViewportSize({width: 375, height: 812});
    await a.go('/fin/jobs', 6000); await clear(); await a.page.waitForTimeout(2000); await a.shot('phone');
    const search = await vis('input[placeholder^="Search project"]');
    return {ok: search === 1, note: `search boxes ${search}`};
  });
};
