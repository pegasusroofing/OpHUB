// RTB's Daily Briefing Sheet template (questions only, as it is on the live database, 4 Nov 2026) and one completed,
// issued briefing with two signatures, for comparing the old and new apps side by side. Same ids in both harnesses.
module.exports = function briefcmp(db, S1) {
  const O = db.organizations[0].id, me = db.profiles[0].id;
  const sections = [
    { id: 'id_xjnrmvpp', title: 'Briefing Details', items: [
      { id: 'id_lquxf0bo', type: 'text', label: 'Site conducted', options: [], autofill: 'site_address', required: true },
      { id: 'id_sjejl7kq', type: 'date', label: 'Conducted on', options: [], autofill: 'today_date', required: true },
      { id: 'id_ylyp6v61', type: 'text', label: 'Supervisor delivering briefing', options: [], autofill: 'inspector_name', required: true }] },
    { id: 'id_q77ug8v1', title: 'Description of Work', items: [{ id: 'id_se4dmlp0', type: 'textarea', label: 'Work to be undertaken', options: [], required: true }] },
    { id: 'id_nw58o1hf', title: 'Operatives In Attendance', items: [
      { id: 'id_g485uu70', type: 'multichoice', label: 'Role(s) on site', options: ['Supervisor', 'Roofer', 'Leadworker', 'Felter', 'Liquid installer', 'Single Ply installer', 'Labourer'], required: false },
      { id: 'id_gl3z7uw4', type: 'operatives', label: 'Operatives On Site', options: [], required: false },
      { id: 'id_1o10aqdy', type: 'text', label: 'Location of works', options: [], required: true }] },
    { id: 'id_nmp4l37q', title: 'Sign Off', items: [{ id: 'id_h88nzqog', type: 'signature', label: 'Supervisor signature', options: [], required: true }] },
  ];
  db.report_templates = (db.report_templates || []).filter((t) => t.id !== 'bt1').concat([{ id: 'bt1', org_id: O, name: 'Daily Briefing Sheet', is_daily_briefing: true, archived: false, sections, created_at: '2026-10-01T08:00:00Z' }]);
  const answers = {
    id_lquxf0bo: 'Studley Rd, London, SW4 6RZ', id_sjejl7kq: '2026-11-04', id_ylyp6v61: 'Andy Admin',
    id_se4dmlp0: 'Strip existing slates to the rear slope, check battens, felt and re-batten. Scaffold inspected this morning; edge protection in place.',
    id_g485uu70: ['Supervisor', 'Roofer', 'Labourer'],
    id_gl3z7uw4: [{ id: 'o1', name: 'Jake Morris', role: 'Roofer', included: true }, { id: 'o2', name: 'Tom Hughes', role: 'Labourer', included: true }],
    id_1o10aqdy: 'Rear roof slope',
    id_h88nzqog: 'sig/me.png',
  };
  db.report_submissions = (db.report_submissions || []).filter((r) => r.id !== 'bf1' && r.id !== 'bf2').concat([{ id: 'bf2', site_id: S1, org_id: O, template_id: 'bt1', template_name: 'Daily Briefing Sheet', sections, answers: {}, status: 'in_progress', submitted_by: me, created_at: '2026-11-04T09:00:00Z' }, { id: 'bf1', site_id: S1, org_id: O, template_id: 'bt1', template_name: 'Daily Briefing Sheet', sections, answers, status: 'completed', submitted_by: me, submitted_at: '2026-11-04T07:45:00Z', created_at: '2026-11-04T07:30:00Z', issued_at: '2026-11-04T07:50:00Z', issued_by: me }]);
  db.daily_briefing_signatures = (db.daily_briefing_signatures || []).filter((s) => s.submission_id !== 'bf1').concat([
    { id: 'bs1', submission_id: 'bf1', user_id: 'o1', signature_image_path: 'sig/o1.png', signed_at: '2026-11-04T08:00:00Z' },
  ]);
};
