// Every report, worked out on the server with nothing saved (REPORT_TEST=1), against what its page shows on Sandbox.
const IDS = ['overview', 'cvr', 'ffa', 'budget', 'costs', 'variations', 'apps', 'retention', 'moneydue', 'debtors', 'creditors', 'cashflow', 'pos', 'labour', 'cis', 'vat'];
const gbp = (n) => (n < 0 ? '−' : '') + '£' + Math.abs(n).toLocaleString('en-GB', {minimumFractionDigits: 2, maximumFractionDigits: 2});
module.exports = async ({as, step}) => {
  const a = await as('admin');
  await a.page.setViewportSize({width: 1440, height: 900});
  await a.go('/fin/reports', 5000);
  const server = (id) => a.page.evaluate(async (rid) => {
    const s = JSON.parse(localStorage.getItem('ophub-native-session'));
    const anon = (s.anon || null);
    const r = await fetch('https://dtrfupmcazoioubhwdml.supabase.co/functions/v1/finance-report-run', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-User-Token': s.access_token}, body: JSON.stringify({dry_run: rid, filters: {status: 'live'}})});
    return {status: r.status, body: await r.json().catch(() => null)};
  }, id);
  for (const id of IDS) {
    await step('Server matches the page: ' + id, async () => {
      const r = await server(id);
      if (r.status !== 200) return {ok: false, note: 'status ' + r.status};
      await a.go('/fin/reports?id=' + id, 6000); await a.page.waitForTimeout(2500);
      const text = await a.page.evaluate(() => document.body.innerText);
      const money = r.body.cols.filter((c) => c.money).map((c) => c.k);
      const nums = r.body.rows.slice(0, 40).flatMap((x) => money.map((k) => x[k])).filter((v) => typeof v === 'number' && v !== 0);
      const miss = [...new Set(nums)].filter((v) => !text.includes(gbp(v)));
      return {ok: miss.length === 0, note: r.body.rows.length + ' rows, ' + nums.length + ' figures checked' + (miss.length ? ', missing ' + miss.slice(0, 4).join(' ') : '')};
    });
  }
};
