// Example RAMS / COSHH library rows for screenshots of the new app.
module.exports = db => {
  const ORG = db.organizations[0].id, now = new Date().toISOString();
  const lib = (id, kind, title, data, n) => ({ id, org_id: ORG, kind, title, data, sort_order: n, created_at: now });
  db.rams_library_items = (db.rams_library_items || []).concat([
    lib('h1', 'hazard', 'Working at height', { harm: 'Falls from roof edge — serious injury or death', p: 4, s: 5, rp: 1, rs: 5, controls: ['Edge protection erected before work starts', 'Harness and lanyard where edge protection not possible', 'Scaffold inspected weekly and tagged'] }, 0),
    lib('h2', 'hazard', 'Manual handling', { harm: 'Back injury from lifting tiles and materials', p: 3, s: 3, rp: 2, rs: 2, controls: ['Hoist used for loading out', 'Two-person lifts for heavy items'] }, 1),
    lib('h3', 'hazard', 'Hot works', { harm: 'Burns and fire from torch-on felt', p: 3, s: 4, rp: 1, rs: 4, controls: ['Hot works permit issued daily', 'Fire extinguisher within 2m', 'Fire watch for 1 hour after'] }, 2),
    lib('s1', 'section', 'PPE', { part: 'general', body: 'All operatives wear the PPE listed in this RAMS at all times on site.', steps: [] }, 0),
    lib('m1', 'section', 'Strip and re-tile pitched roof', { part: 'method', body: '', steps: ['Erect scaffold and edge protection', 'Strip existing tiles and battens', 'Fit new membrane and battens', 'Re-tile and fit ridge'] }, 0),
    lib('t1', 'template', 'Pitched Roof Renewal', { hazards: ['Working at height', 'Manual handling'], sections: ['PPE', 'Strip and re-tile pitched roof'], ppe: ['hat', 'boots', 'hivis', 'hand', 'harness'], groups: ['Employees', 'Members of Public'] }, 0),
    lib('c1', 'coshh', 'Bauder Primer', { manufacturer: 'Bauder Ltd', use: 'Priming the deck before felt', pictos: ['GHS02', 'GHS07'], signal: 'Warning', h: ['H226', 'H315', 'H319'], p: ['P210', 'P280'], routes: ['skin', 'eyes'], ppe: ['hand', 'eye'], risk: 'Medium', sdsPath: 'x.pdf' }, 0),
    lib('c2', 'coshh', 'Lead sealant', { manufacturer: 'Geocel', use: 'Sealing lead flashings', pictos: [], signal: '', h: [], p: [], routes: [], ppe: ['hand'], risk: 'Low' }, 0),
  ]);
  db.coshh_library_folders = [{ id: 'f1', org_id: ORG, name: 'Flat Roofing', parent_id: null }, { id: 'f2', org_id: ORG, name: 'Pitched Roofing', parent_id: null }];
  db.coshh_library_files = [{ id: 'cf1', org_id: ORG, folder_id: 'f1', name: 'COSHH Assessment - Bauder Primer.pdf', storage_path: 'a.pdf', uploaded_at: now }];
  db.price_rate_items = [
    { id: 'r1', org_id: ORG, category: 'Pitched Roofing', name: 'Strip and re-tile', unit: 'm2', is_dropdown: false, rate: 38.5, active: true },
    { id: 'r2', org_id: ORG, category: 'Pitched Roofing', name: 'Tile type', unit: 'm2', is_dropdown: true, rate: null, active: true },
    { id: 'r3', org_id: ORG, category: 'Roofline', name: 'Fascia and soffit', unit: 'lm', is_dropdown: false, rate: 24, active: true },
  ];
  db.price_rate_options = [{ id: 'o1', rate_item_id: 'r2', label: 'Marley Eternit Concrete Tile', rate: 12.75 }, { id: 'o2', rate_item_id: 'r2', label: 'Natural slate', rate: 31 }];
  db.rams_builds = [{ id: 'b1', org_id: ORG, site_id: db.sites[0].id, title: 'Studley Rd — Roof Renewal', status: 'draft', revision: 0, details: { raNumber: '0000000042', msNumber: '42', clientContact: 'Jo Smith', description: 'Strip and re-tile main roof', startDate: '2026-11-03', groups: ['Employees'] }, hazards: [
    { id: 'x1', title: 'Working at height', harm: 'Falls from roof edge', p: 4, s: 5, rp: 1, rs: 5, controls: ['Edge protection', 'Harness where needed'] },
    { id: 'x2', title: 'Manual handling', harm: 'Back injury', p: 3, s: 3, rp: 2, rs: 2, controls: ['Hoist for loading out'] }], sections: [], ppe: ['hat', 'boots', 'hivis'], updated_at: now }];
};
