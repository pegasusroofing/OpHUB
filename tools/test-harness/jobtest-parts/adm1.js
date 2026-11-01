// Company admin: each Admin Centre page as it opens at phone size, with its screenshot. Reads only.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const say = async (n = 400) => (await a.text()).replace(/\s+/g, ' ').slice(0, n);
  const pages = ['/pm/admin', '/pm/admin/invites', '/pm/admin/users', '/pm/admin/devicelocks', '/pm/admin/checkinlogs', '/pm/admin/drivercheckins', '/pm/admin/subapps', '/pm/admin/templates', '/pm/admin/signtemplates', '/pm/admin/sowlibrary', '/pm/admin/ratecard', '/pm/admin/suppliers', '/pm/admin/companylibrary', '/pm/admin/hspolicy', '/pm/admin/havstools', '/pm/admin/ramslibrary', '/pm/admin/coshh', '/pm/admin/tbt', '/pm/admin/ppelog', '/pm/admin/branding', '/pm/admin/expensesemail', '/pm/admin/onedrive'];
  for (const u of pages) {
    await step(`Opens ${u}`, async () => {
      await a.go(u, 3500);
      await a.shot(u.split('/').pop());
      const t = await say(600);
      return {ok: !/not found|Unmatched/i.test(t) && a.page.url().includes(u), note: t.slice(40, 330)};
    });
  }
};
