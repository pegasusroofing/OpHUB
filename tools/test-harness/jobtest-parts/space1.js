// Measures the gaps between the blocks on the main screens: every gap should match the one between Projects tiles. Read only.
module.exports = async ({as, step, state}) => {
  const a = await as('admin');
  const site = state.regular;
  const pages = ['/home', '/sites', `/sites/${site}`, `/sites/${site}/materials`, `/sites/${site}/materials/requests`, `/sites/${site}/hs`, `/sites/${site}/snagging`, '/pm/dashboard', '/pm/operatives', '/pm/quotes', '/pm/hub', '/pm/deliveries', '/pm/admin', '/pm/hr', '/fin', '/fin/jobs', '/fin/purchases', '/fin/subs', '/fin/sales', '/fin/directory'];
  for (const p of pages) {
    await step(`Gaps ${p.replace(site, 'JOB')}`, async () => {
      await a.go(p, 4000);
      await a.page.getByText(/^not now$/i).locator('visible=true').first().click({timeout: 800}).catch(() => {});
      const r = await a.page.evaluate(() => {
        // the deepest scroller on show, then its content's direct children, top to bottom
        const scrollers = [...document.querySelectorAll('div')].filter((d) => { const c = getComputedStyle(d); return /(auto|scroll)/.test(c.overflowY) && d.clientHeight > 300 && d.getBoundingClientRect().width > 200 && d.offsetParent; });
        const sc = scrollers[scrollers.length - 1]; if (!sc) return null;
        let box = sc.firstElementChild; if (!box) return null;
        const out = [], top = sc.getBoundingClientRect().top;
        const kids = [...box.children].filter((k) => k.getBoundingClientRect().height > 0);
        out.push(['top', Math.round(kids[0]?.getBoundingClientRect().top - top)]);
        for (let i = 1; i < kids.length; i++) {
          const g = Math.round(kids[i].getBoundingClientRect().top - kids[i - 1].getBoundingClientRect().bottom);
          out.push([(kids[i].innerText || '').replace(/\s+/g, ' ').slice(0, 18), g]);
        }
        const tiles = [...document.querySelectorAll('[role=button]')].filter((b) => b.getBoundingClientRect().height > 60 && b.offsetParent).slice(0, 4).map((b) => b.getBoundingClientRect());
        const tileGap = tiles.length > 2 ? Math.round(tiles[2].top - tiles[0].bottom) : null;
        return {gaps: out, tileGap};
      });
      return {note: JSON.stringify(r)};
    });
  }
};
