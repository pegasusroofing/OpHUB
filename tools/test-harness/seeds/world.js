// A busy company for crawl.js: one or more rows behind every screen, so buttons that only show with data get pressed.
module.exports = function (db) {
  const seed = require('../fresh/seed');
  seed(db);
  ['ex1', 'ex4', 'native'].forEach((n) => require('./' + n)(db));
  const O = db.organizations[0].id, S1 = '11111111-1111-1111-1111-111111111111';
  const now = new Date().toISOString(), d = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  Object.assign(db.organizations[0], { has_pm: true, has_finance: true });
  const me = db.profiles.find((p) => p.id === 'me');
  Object.assign(me, { finance_enabled: true, howto_dismissed: ['*'] });
  const add = (t, rows) => { db[t] = (db[t] || []).concat(rows); };
  const has = (id) => db.profiles.some((p) => p.id === id);
  if (!has('o1')) add('profiles', [{ id: 'o1', name: 'Jake Morris', role: 'operative', org_id: O, email: 'j@x.co' }, { id: 'o2', name: 'Tom Hughes', role: 'operative', org_id: O, email: 't@x.co' }, { id: 'd1', name: 'Dave Driver', role: 'driver', org_id: O, email: 'd@x.co' }]);
  const site = db.sites.find((s) => s.id === S1);
  Object.assign(site, { acting_as_main_contractor: true, client_email: 'client@x.co', client_name: 'Bellway Homes', responsible_pm_id: 'me' });
  if (!db.site_assignments.some((a) => a.user_id === 'o1' && a.site_id === S1)) add('site_assignments', [{ id: 'saw1', site_id: S1, user_id: 'o1' }]);

  db.report_templates = [
    { id: 'tp1', org_id: O, name: 'Daily report', is_loler_inspection: false, archived: false, sections: [{ id: 'sx1', title: 'Checks', items: [{ id: 'q1', label: 'All safe?', type: 'yesno' }] }] },
    { id: 'tp2', org_id: O, name: 'LOLER check', is_loler_inspection: true, archived: false, sections: [] },
  ];
  db.report_submissions = [
    { id: 'rs1', site_id: S1, org_id: O, template_id: 'tp1', template_name: 'Daily report', status: 'completed', answers: {}, submitted_by: 'me', submitted_at: now, created_at: now },
    { id: 'rs2', site_id: S1, org_id: O, template_id: 'tp1', template_name: 'Daily report', status: 'in_progress', answers: {}, submitted_by: 'me', created_at: now },
    { id: 'rs3', site_id: S1, org_id: O, template_id: 'tp2', template_name: 'LOLER check', status: 'completed', answers: {}, submitted_by: 'me', submitted_at: now, created_at: now },
    { id: 'rs4', site_id: null, org_id: O, template_id: 'tp1', template_name: 'Daily report', general_label: 'Yard survey', status: 'completed', answers: {}, submitted_by: 'me', submitted_at: now, created_at: now },
  ];
  db.incident_reports = [{ id: 'i1', site_id: S1, org_id: O, kind: 'near_miss', description: 'Slip on ladder', status: 'open', reported_by: 'o1', created_at: now }];
  db.permits = [{ id: 'pm1', site_id: S1, org_id: O, permit_type: 'hot_works', title: 'Hot works', status: 'issued', issued_by: 'me', data: {}, created_at: now }];
  db.permit_signoffs = [];
  db.repair_jobs = [{ id: 'rj1', site_id: S1, org_id: O, job_number: 'RJ-1', address: '5 High St', description: 'Leak over bay', job_status: 'To Survey', survey_required: 'N', created_at: now }];
  db.handover_om_manuals = [{ id: 'om1', site_id: S1, org_id: O, name: 'O&M Manual', data: null, created_at: now }];
  db.price_builder_sheets = [{ id: 'ps1', org_id: O, site_id: S1, title: 'Draft roof', status: 'draft', assigned_user_ids: [], created_at: now }];
  db.toolbox_talks = [{ id: 'tb1', site_id: S1, org_id: O, title: 'Ladders', storage_path: 't.pdf', status: 'live', created_by: 'me', created_at: now, subcontractor_company_id: null }, { id: 'tb2', site_id: S1, org_id: O, title: 'Manual handling', storage_path: 't2.pdf', status: 'completed', created_by: 'me', created_at: now, subcontractor_company_id: null }];
  db.materials = [{ id: 'm1', site_id: S1, org_id: O, item: 'Slates', qty: '10', status: 'pending', requested_by: 'o1', created_at: now }, { id: 'm2', site_id: S1, org_id: O, item: 'Battens', qty: '20', status: 'ordered', requested_by: 'o1', created_at: now }];
  db.snags = [{ id: 'sn1', site_id: S1, status: 'open', title: 'Cracked tile', location: 'Rear', created_by: 'me', created_at: now }];
  db.plant_items = [{ id: 'pl1', org_id: O, site_id: S1, name: 'Hoist', status: 'on_site', created_at: now }];
  db.subcontractor_companies = [{ id: 'sc1', site_id: S1, org_id: O, name: 'Acme Scaffolding', created_at: now }];
  db.subcontractor_company_profiles = [{ id: 'cp1', org_id: O, name: 'Brothers Scaffold', created_at: now }];
  db.subcontractor_operatives = [{ id: 'so1', site_id: S1, subcontractor_company_id: 'sc1', name: 'Sam Scaff', created_at: now }];
  db.subcontractor_applications = [{ id: 'ap1', org_id: O, company_name: 'Acme Roofing Ltd', contact_name: 'Sam Acme', email: 'sam@acme.co', phone: '0700', status: 'new', created_at: now, data: { utr: '12345 67890', trades: ['Slating'] } }];
  db.drawing_folders = [{ id: 'df1', site_id: S1, parent_id: null, name: 'Drawings', position: 1, created_at: now }];
  db.drawing_files = [{ id: 'dr1', site_id: S1, folder_id: 'df1', name: 'Roof plan.pdf', storage_path: 'x/r.pdf', status: 'current', uploaded_at: now }];
  db.todos = [{ id: 'td1', org_id: O, site_id: S1, text: 'Chase scaffold', done: false, date_required_by: d(3), created_by: 'me', assigned_to: 'me', created_at: now }];
  db.todo_comments = [];
  db.material_order_folders = [{ id: 'mf1', site_id: S1, name: 'Orders', created_at: now }];
  db.mc_documents = [{ id: 'mc1', org_id: O, site_id: S1, category: 'general', name: 'Site rules.pdf', storage_path: 'x/s.pdf', uploaded_at: now }];
  db.site_layout_docs = [{ id: 'sl1', site_id: S1, name: 'Layout.pdf', storage_path: 'x/l.pdf', created_at: now }];
  db.hr_leave = [{ id: 'hl1', org_id: O, user_id: 'o1', start_date: d(7), end_date: d(9), status: 'pending', created_at: now }];
  db.company_policies = db.company_policies || [];
  db.delivery_tasks = [{ id: 'dt1', org_id: O, site_id: S1, description: 'Slates', scheduled_date: d(0), time_slot: '7am', status: 'pending', created_by: 'me', driver_id: 'd1', created_at: now }];
  db.site_calendar_events = [{ id: 'ev1', site_id: S1, org_id: O, title: 'Scaffold up', event_date: d(0), created_by: 'me', created_at: now }];
  db.coshh_docs = [{ id: 'c1', site_id: S1, org_id: O, name: 'Paint', storage_path: 'c1.pdf', uploaded_at: now, subcontractor_company_id: null }];
  db.rams_docs = [{ id: 'rd1', site_id: S1, org_id: O, name: 'Method.pdf', storage_path: 'x/m.pdf', sign_layout: null, status: 'live', created_at: now }];
  db.ppe_requests = [{ id: 'pr1', site_id: S1, user_id: 'o1', item_name: 'Gloves', status: 'pending', created_at: now }];
  db.ppe_issuances = [{ id: 'pis1', site_id: S1, org_id: O, user_id: 'o1', item_name: 'Hard hat', issued_at: now, created_at: now }];
  db.havs_tools = [{ id: 'ht1', org_id: O, name: 'Breaker', vibration_magnitude: 12, active: true, sort_order: 1 }];
  db.operative_tools = [{ id: 'ot1', user_id: 'o1', org_id: O, name: 'Drill', created_at: now }];
  db.puwer_inspections = [{ id: 'pu1', site_id: S1, user_id: 'o1', week_start: d(-3), comments: 'ok', created_at: now }];
  db.invites = [{ id: 'inv1', org_id: O, email: 'new@x.co', role: 'operative', token: 'abc', created_at: now }];
  db.sign_layout_templates = [{ id: 'lt1', org_id: O, name: 'Two box', layout: { v: 2, boxes: [] }, storage_path: 'x/t.pdf', page_count: 1 }];
  db.tbt_templates = [{ id: 'tt1', org_id: O, title: 'Working at height', storage_path: 'x/wah.pdf', created_at: now }];
  db.hs_policy_docs = [{ id: 'hsp1', org_id: O, name: 'H&S Policy', storage_path: 'x/p.pdf', status: 'current', uploaded_at: now, uploaded_by: 'me' }];
  db.hs_policy_signatures = [{ id: 'hss1', policy_id: 'hsp1', user_id: 'me', org_id: O, signed_at: now }];
  db.sow_library_templates = [{ id: 'slt1', org_id: O, name: 'Flat roof strip' }];
  db.schedule_sections = [{ id: 'sec1', site_id: S1, name: 'Main roof', position: 1 }];
  db.schedule_tasks = [{ id: 't1', site_id: S1, section_id: 'sec1', name: 'Strip roof', status: 'todo', position: 1 }, { id: 't2', site_id: S1, section_id: null, name: 'Fit battens', status: 'in_progress', percent_complete: 40, position: 2 }];
  db.site_sub_addresses = db.site_sub_addresses || [];
  db.expenses = [{ id: 'exp1', site_id: S1, org_id: O, user_id: 'me', description: 'Fixings', amount: 12.5, status: 'pending', created_at: now }];
  db.fin_clients = [{ id: 'cl1', org_id: O, name: 'Bellway Homes', email: 'a@bellway.example', created_at: now }];
  db.fin_suppliers = [{ id: 'fs1', org_id: O, name: 'SIG', email: 's@x.co', created_at: now }];
  db.fin_quotes = [{ id: 'q1', org_id: O, site_id: S1, purpose: 'pquote', supplier_name: 'Alltype', quote_no: 'Q1', created_at: now }];
  db.fin_plant_hires = [{ id: 'h1', org_id: O, site_id: S1, item: 'Cherry picker', on_hire: d(-30), off_hire: null, rate: 300, rate_period: 'week' }];
  db.fin_statements = [{ id: 'st1', org_id: O, supplier_name: 'SIG', statement_date: d(-5), total: 100, created_at: now }];
  db.fin_sub_apps = [{ id: 'sa1', org_id: O, site_id: S1, subcontract_id: 'sc1', number: 1, status: 'submitted', gross: 1000, net_due: 800, created_at: now }];
  db.messages = [{ id: 'ms1', org_id: O, site_id: S1, sender_id: 'o1', recipient_id: 'me', body: 'Scaffold is up', kind: 'general', created_at: now }];
  db.driver_time_off = [];
  db.driver_checkins = [{ id: 'dc1', org_id: O, user_id: 'd1', type: 'in', ts: now }];
  db.checkins = [{ id: 'ck1', org_id: O, user_id: 'o1', site_id: S1, type: 'in', ts: now }];
  db.device_locks = [{ id: 'dl1', org_id: O, user_id: 'o1', device_id: 'abc', last_seen_at: now, created_at: now }];
  (db.purchase_orders || []).forEach((p) => (p.items || []).forEach((i) => { if (!i.item) i.item = i.description; }));
  Object.keys(db).forEach((t) => { if (Array.isArray(db[t])) { const seen = new Map(); db[t].forEach((r, i) => seen.set(r && r.id != null ? r.id : `#${i}`, r)); db[t] = [...seen.values()]; } });
};
