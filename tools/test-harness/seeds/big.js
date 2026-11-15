// A busy company a year or two on (speed check, 15 Nov 2026): 120 jobs, 120 operatives, 3,000 sales invoices, 1,200
// applications, 1,500 purchase orders and invoices, 400 manager messages… on top of the crawl's world. Rows are padded
// to the sizes the live database has (a project row is about 1.8 KB, an application 2.7 KB), so a screen that reads
// whole tables pays what it would for real.
module.exports = function (db) {
  require('./world')(db);
  const O = db.organizations[0].id;
  const now = new Date(), iso = (d) => d.toISOString(), day = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  const uuid = (p, i) => `${p}${String(i).padStart(7, '0')}-0000-4000-8000-${String(i).padStart(12, '0')}`;
  const pad = (n) => 'x'.repeat(n);
  const add = (t, rows) => { db[t] = (db[t] || []).concat(rows); };
  const STATUS = (i) => (i % 2 === 0 ? 'live' : i % 3 === 0 ? 'upcoming' : 'closed');
  const sites = [];
  for (let i = 1; i <= 117; i++) {
    sites.push({
      id: uuid('5', i), name: `Job ${i} ${['Mill Lane', 'High Street', 'Station Road', 'Church Close'][i % 4]}`, address: `${i} ${['Mill Lane', 'High Street', 'Station Road', 'Church Close'][i % 4]}, Northampton`, postcode: 'NN1 3AE',
      status: STATUS(i), org_id: O, job_number: `J${200 + i}`, created_at: iso(new Date(now.getTime() - (120 - i) * 864e5)), created_by: 'me',
      responsible_pm_id: i % 3 === 0 ? 'me' : 'pm2', client_name: ['Bellway Homes', 'Persimmon', 'Forma London', 'Vistry'][i % 4], client_email: 'accounts@client.example', client_phone: '01604 000000', client_contact_name: 'Sam Client',
      geofence_lat: 52.24 + i / 1000, geofence_lon: -0.89, geofence_radius_m: 200, start_date: day(-i), price_enabled: i % 2 === 0, price_total: 10000 + i * 100,
      onedrive_folder_id: pad(34), onedrive_folder_name: `J${200 + i} Job ${i}`, onedrive_drive_id: pad(66), material_orders_folder_id: pad(34), material_orders_folder_name: 'Material Orders', material_orders_drive_id: pad(66),
      site_inductions_folder_id: pad(34), site_inductions_folder_name: 'Inductions', site_inductions_drive_id: pad(66), price_excel_path: `${O}/price/${pad(40)}.xlsx`, price_onedrive_item_id: pad(34), price_onedrive_drive_id: pad(66),
      job_pack: { stage: 'live', notes: pad(60) }, tile_visibility: {}, materials_visibility: null, mc_hidden_tiles: [], multi_site: false, acting_as_main_contractor: i % 5 === 0, repair_contract: false,
      additional_works_note: pad(120), price_updated_at: iso(now), onedrive_last_synced_at: iso(now), material_orders_last_synced_at: iso(now),
    });
  }
  add('sites', sites);
  const open = db.sites.filter((s) => s.status === 'live' || s.status === 'upcoming');
  const ops = [];
  for (let i = 1; i <= 120; i++) ops.push({ id: uuid('6', i), name: `Operative ${i}`, role: 'operative', org_id: O, email: `op${i}@x.co`, phone: '07000 000000', created_at: iso(now), notes: pad(400), finance_enabled: false });
  add('profiles', ops);
  open.forEach((s, k) => { for (let j = 0; j < 4; j++) add('site_assignments', [{ id: `bsa-${k}-${j}`, site_id: s.id, user_id: ops[(k * 4 + j) % ops.length].id }]); });
  // Finance: a year and more of sales invoices and applications.
  db.job_finance = db.job_finance.concat(sites.map((s, i) => ({ site_id: s.id, org_id: O, billing_type: i % 2 ? 'application' : 'invoice', contract_value: i % 7 ? 50000 + i * 1000 : null, vat_treatment: 'reverse_charge', billing_name: s.client_name, billing_email: 'ap@client.example', notes: pad(500), app_reminder_day: 25, pc_date: i % 9 === 0 ? day(-200) : null, defects_months: 12 })));
  const inv = [];
  for (let i = 1; i <= 3000; i++) {
    const s = sites[i % sites.length], st = i % 10 < 6 ? 'paid' : i % 10 < 8 ? 'sent' : i % 10 < 9 ? 'part_paid' : 'void';
    inv.push({ id: uuid('7', i), org_id: O, site_id: s.id, number: `INV-${2000 + i}`, status: st, issue_date: day(-(i % 400)), due_date: day(30 - (i % 400)), net: 1000 + i, vat: 0, total: 1000 + i, paid: st === 'paid' ? 1000 + i : 0, vat_treatment: 'reverse_charge', client_name: s.client_name, lines: [{ description: `Works to roof ${pad(300)}`, amount: 1000 + i }], notes: pad(300), created_at: iso(now) });
  }
  add('fin_invoices', inv);
  const apps = [];
  for (let i = 1; i <= 1200; i++) {
    const s = sites[(i * 2 + 1) % sites.length];
    apps.push({ id: uuid('8', i), org_id: O, site_id: s.id, number: Math.ceil(i / sites.length), status: 'certified', valuation_date: day(-(i % 360)), gross: 20000, net_due: 9000, cert_date: day(-(i % 360) + 3), cert_gross: 20000, cert_retention: 1000, cert_previous: 10000, cert_net: 9000, lines: [{ description: pad(1200), value: 20000 }], notes: pad(600), created_at: iso(now) });
  }
  add('fin_applications', apps);
  add('client_pos', sites.filter((_, i) => i % 4).map((s, i) => ({ id: uuid('9', i + 1), org_id: O, site_id: s.id, po_number: `PO-${i}`, value: 50000, notes: pad(200), created_at: iso(now) })));
  const pos = [], pis = [];
  for (let i = 1; i <= 1500; i++) {
    const s = sites[i % sites.length];
    pos.push({ id: uuid('a', i), org_id: O, site_id: s.id, number: `${s.job_number}-PO-${String(i).padStart(3, '0')}`, supplier_id: 'sup1', supplier_name: 'SIG Roofing', status: i % 5 ? 'closed' : 'open', value: 100 + i, total: 100 + i, items: [{ description: `Battens ${pad(200)}`, item: 'Battens', qty: 10, unit: 'm', rate: 10 }], notes: pad(300), created_at: iso(new Date(now.getTime() - i * 36e5)) });
    pis.push({ id: uuid('b', i), org_id: O, site_id: s.id, po_id: uuid('a', i), supplier_id: 'sup1', supplier_name: 'SIG Roofing', invoice_no: `SIG-${10000 + i}`, invoice_date: day(-(i % 300)), due_date: day(30 - (i % 300)), net: 100 + i, vat: 20, total: 120 + i, status: i % 50 ? 'approved' : 'to_approve', lines: [{ description: pad(300) }], created_at: iso(new Date(now.getTime() - i * 36e5)) });
  }
  add('purchase_orders', pos); add('purchase_invoices', pis);
  // Projects: H&S, messages, to-dos and the Schedule of Works across the open jobs.
  const since = (n) => iso(new Date(now.getTime() - n * 36e5));
  open.forEach((s, k) => {
    add('rams_docs', [{ id: `brd-${k}`, site_id: s.id, org_id: O, name: 'Method.pdf', storage_path: 'x/m.pdf', status: 'current', uploaded_at: since(400), created_at: since(400), subcontractor_company_id: null }]);
    add('coshh_docs', [{ id: `bcd-${k}`, site_id: s.id, org_id: O, name: 'Paint.pdf', storage_path: 'c.pdf', uploaded_at: since(400), subcontractor_company_id: null }]);
    add('rams_signatures', [0, 1].map((j) => ({ id: `brs-${k}-${j}`, rams_id: `brd-${k}`, user_id: ops[(k * 4 + j) % ops.length].id, signed_at: since(300) })));
    add('coshh_signatures', [0, 1, 2].map((j) => ({ id: `bcs-${k}-${j}`, coshh_id: `bcd-${k}`, user_id: ops[(k * 4 + j) % ops.length].id, signed_at: since(300) })));
    add('schedule_tasks', [0, 1, 2, 3, 4].map((j) => ({ id: `bst-${k}-${j}`, site_id: s.id, name: `Task ${j}`, status: j ? 'todo' : 'in_progress', position: j })));
    add('toolbox_talks', [0, 1, 2, 3, 4, 5].map((j) => ({ id: `btb-${k}-${j}`, site_id: s.id, org_id: O, title: 'Ladders', storage_path: 't.pdf', status: 'completed', created_by: 'me', created_at: since(24 * 30 * j + 24), subcontractor_company_id: null })));
    if (k % 3 === 0) add('todos', [{ id: `btd-${k}`, org_id: O, site_id: s.id, text: `Chase item ${k}`, done: false, date_required_by: day(k % 20), created_by: 'me', assigned_to: 'me', created_at: since(k) }]);
  });
  const msgs = [], reads = [];
  for (let i = 1; i <= 400; i++) {
    const s = open[i % open.length];
    msgs.push({ id: uuid('c', i), org_id: O, site_id: s.id, sender_id: ops[i % ops.length].id, audience: 'managers', kind: 'general', body: `Update ${i} ${pad(200)}`, parent_id: null, created_at: since(i) });
    if (i % 2) reads.push({ id: `bmr-${i}`, message_id: uuid('c', i), user_id: 'me', read_at: since(i - 1) });
  }
  for (let i = 1; i <= 40; i++) msgs.push({ id: uuid('d', i), org_id: O, site_id: null, sender_id: ops[i].id, recipient_id: 'me', audience: 'single', kind: 'general', body: `Direct ${i}`, parent_id: null, created_at: since(i * 3) });
  add('messages', msgs); add('message_reads', reads);
  // A long materials list on the first job.
  const S1 = '11111111-1111-1111-1111-111111111111';
  for (let i = 1; i <= 300; i++) add('materials', [{ id: `bm-${i}`, site_id: S1, org_id: O, item: `Item ${i}`, qty: String(i % 20 + 1), unit: 'each', status: ['pending', 'ordered', 'delivered'][i % 3], requested_by: 'o1', notes: pad(200), created_at: since(i) }]);
};
