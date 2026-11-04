// Operative and driver data for comparing the old and new apps side by side (cmp-ops.js, 5 Nov 2026).
// Same rows in both harnesses. Call after seeds/world: require('./opscmp')(db, role).
module.exports = function opscmp(db, role) {
  const O = db.organizations[0].id, S1 = '11111111-1111-1111-1111-111111111111', S2 = '22222222-2222-2222-2222-222222222222';
  const now = new Date().toISOString(), d = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  const me = db.profiles.find((p) => p.id === 'me');
  const add = (t, rows) => { db[t] = (db[t] || []).concat(rows); };
  Object.assign(me, { role, finance_enabled: false, howto_dismissed: ['*'], signature_path: 'sig/me.png', phone: '07000 000000' });
  me.name = role === 'driver' ? 'Dan Driver' : 'Olly Operative';
  require('./briefcmp')(db, S1);
  if (role === 'operative') {
    add('site_assignments', [{ id: 'sam1', site_id: S1, user_id: 'me' }, { id: 'sam2', site_id: S2, user_id: 'me' }]);
    db.materials.forEach((m) => { m.requested_by = 'me'; });
    add('materials', [{ id: 'm3', site_id: S1, org_id: O, item: 'Lead code 4', qty: '2', unit: 'rolls', status: 'sent', fulfilment: 'delivery', sent_at: now, delivery_date: d(2), requested_by: 'pm2', created_at: now }]);
    add('material_required_items', [{ id: 'mr1', site_id: S1, org_id: O, item: 'Felt nails', qty: '3', unit: 'boxes', status: 'assigned', assigned_to: 'me', supplier_id: 'sup1', created_at: now }]);
    db.messages = [{ id: 'ms1', org_id: O, site_id: S1, sender_id: 'pm2', audience: 'operatives', parent_id: null, body: 'Scaffold is up — roof access from the rear.', kind: 'general', created_at: now }, { id: 'ms2', org_id: O, site_id: S1, sender_id: 'pm2', audience: 'operatives', parent_id: null, body: 'Skip arrives at 10am', kind: 'general', created_at: now }];
    db.rams_docs.forEach((r) => { r.status = 'current'; r.uploaded_at = now; r.uploaded_by = 'pm2'; r.subcontractor_company_id = null; });
    add('rams_docs', [{ id: 'rd2', site_id: S1, org_id: O, name: 'Roof strip RAMS.pdf', storage_path: 'x/r2.pdf', status: 'current', uploaded_at: now, uploaded_by: 'pm2', subcontractor_company_id: null, created_at: now }]);
    add('rams_signatures', [{ id: 'rsg1', rams_id: 'rd1', user_id: 'me', signed_at: now, signature_image_path: 'sig/me.png' }]);
    add('operative_tools', [{ id: 'ot2', user_id: 'me', org_id: O, name: 'Makita drill', serial_number: 'MK-221', created_at: now }]);
    add('havs_entries', [{ id: 'he1', org_id: O, site_id: S1, user_id: 'me', tool_id: 'ht1', entry_date: d(0), minutes: 30, created_at: now }]);
    add('snags', [{ id: 'sn2', site_id: S1, status: 'open', title: 'Loose ridge', location: 'Front', created_by: 'me', assigned_to: 'me', created_at: now }]);
    add('variations', [{ id: 'va1', site_id: S1, org_id: O, title: 'Extra lead flashing', description: 'Chimney needs new flashing', status: 'pending', raised_by: 'me', created_at: now }]);
    add('site_calendar_events', [{ id: 'ev2', site_id: S1, org_id: O, title: 'Roof inspection', event_date: d(2), created_by: 'pm2', created_at: now }]);
    add('checkins', [{ id: 'ck2', org_id: O, user_id: 'me', site_id: S1, type: 'in', ts: d(-1) + 'T07:30:00Z' }, { id: 'ck3', org_id: O, user_id: 'me', site_id: S1, type: 'out', ts: d(-1) + 'T16:10:00Z' }]);
    db.schedule_tasks.forEach((t) => { if (!t.assigned_to) t.assigned_to = null; });
  }
  if (role === 'driver') {
    db.delivery_tasks = [
      { id: 'dt1', org_id: O, site_id: S1, description: 'Slates and battens', scheduled_date: d(0), time_slot: '7am', status: 'pending', created_by: 'pm2', driver_id: 'me', created_at: now, items: [{ name: 'Slates', qty: '200' }] },
      { id: 'dt2', org_id: O, site_id: S2, description: 'Collect skip bags', scheduled_date: d(0), time_slot: '10am', status: 'pending', created_by: 'pm2', driver_id: 'me', collection_type: 'merchant', supplier_id: 'sup1', created_at: now },
      { id: 'dt3', org_id: O, site_id: S1, description: 'Lead rolls', scheduled_date: d(1), time_slot: '8am', status: 'pending', created_by: 'pm2', driver_id: 'me', created_at: now },
    ];
    db.driver_checkins = [];
    db.driver_time_off = [{ id: 'dto1', org_id: O, user_id: 'me', start_date: d(10), end_date: d(11), note: 'Holiday', created_by: 'me', created_at: now }];
  }
};
