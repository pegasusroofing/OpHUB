// Admin Centre + Finance, old app vs new app (cmp-fin.js, 5 Nov 2026). The busy company (world.js) plus a few
// Finance rows the old and new screens both need: a draft application, yard stock, an operative invoice,
// a subcontract payment and HR policies. Same rows go into both apps.
module.exports = function (db, S1) {
  require('./world')(db);
  S1 = S1 || '11111111-1111-1111-1111-111111111111';
  const O = db.organizations[0].id, now = new Date().toISOString();
  const d = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  const add = (t, rows) => { db[t] = (db[t] || []).concat(rows); };
  add('fin_applications', [{ id: 'a3', org_id: O, site_id: S1, number: 3, status: 'draft', valuation_date: d(-2), gross: 30000, net_due: 8000, lines: [], variations: [], dayworks: [], retention_pct: 5 }]);
  db.yard_stock = [{ id: 'y1', org_id: O, item: 'Slate 500x250', unit: 'nr', qty: 400, active: true, category: 'Slates & tiles', rate: 1.2 }];
  db.yard_moves = db.yard_moves || [];
  add('fin_op_invoices', [{ id: 'oi1', org_id: O, user_id: 'o1', labour_id: 'w1', period_start: d(-12), period_end: d(-6), status: 'submitted', gross: 1000, cis_deduction: 200, net: 800, lines: [{ site_id: S1, description: 'Slating', amount: 1000 }], created_at: now }]);
  db.hr_policies = db.hr_policies || [{ id: 'hp1', org_id: O, title: 'Staff handbook', storage_path: 'x/h.pdf', created_at: now }];
  db.subscriptions = db.subscriptions || [{ org_id: O, plan: 'pro', status: 'active' }];
  db.fin_cost_codes = db.fin_cost_codes || [{ id: 'cc1', org_id: O, grp: 'Materials', code: '310', name: 'Materials' }];
  const jf = db.job_finance.find((x) => x.site_id === S1); if (jf) jf.app_reminder_day = 25;
};
