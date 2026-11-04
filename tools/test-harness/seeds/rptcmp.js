// RTB's own report templates (questions as on the live database, 4 Nov 2026; long LOLER labels cut short) with one
// completed and one in-progress report each, for comparing the old and new apps side by side. Same ids in both harnesses.
module.exports = function rptcmp(db, S1) {
  const O = db.organizations[0].id, me = db.profiles[0].id;
  let n = 0;
  const q = (type, label, x = {}) => ({ id: 'q' + (++n), type, label, options: [], required: false, ...x });
  const yn = (label) => q('choice', label, { options: ['Yes', 'No', 'N/A'] });
  const sec = (title, items, x = {}) => ({ id: 's' + (++n), title, items, ...x });
  const head = (a, b, c) => [q('text', a, { autofill: 'site_address', required: true }), q('date', b, { autofill: 'today_date', required: true }), q('text', c, { autofill: 'inspector_name', required: true })];

  const renewal = q('choice', 'Renewal or repair?', { options: ['Renewal', 'Repair'], required: true, mediaRequiredWhen: ['Renewal'] });
  const strip = q('passfail', 'Roof to be stripped?', { scored: true, showIf: { qId: renewal.id, values: ['Renewal'] }, required: true, mediaRequiredWhen: ['Pass'] });
  const scaff = q('passfail', 'Scaffolding in place & correct heights to facilitate roof works?', { scored: true, required: true });
  const preStart = [
    sec('Project Details', head('Project address', 'Date', 'RTB attendance')),
    sec('Scope Of Works', [renewal, strip,
      q('choice', 'Waste away solution?', { showIf: { qId: strip.id, values: ['Pass'] }, options: ['Yes - RTB sorting Skips', 'No - Solution required', 'By Client and to be in place ready for operatives'] }),
      q('passfail', 'Loft insulation to be renewed?', { showIf: { qId: strip.id, values: ['Pass'] } }),
      q('choice', 'Any visible signs of concern with structural elements (rafters/gables etc)?', { showIf: { qId: renewal.id, values: ['Renewal'] }, options: ['Yes', 'No', 'Unable to Determine'], mediaRequiredWhen: ['Yes'] }),
      q('checkbox', 'Lead work to be carried out?', { showIf: { qId: renewal.id, mode: 'equals', values: ['Renewal'] }, mediaRequiredWhen: [true] }),
      q('text', 'Description of repair works to carry out:', { showIf: { qId: renewal.id, values: ['Repair'] } }),
      q('textarea', 'Any other works/variations/issues visible at time of pre-start?')]),
    sec('Health & Safety', [scaff,
      q('passfail', 'Is scaffold signed off and handed over? Copy received?', { showIf: { qId: scaff.id, values: ['Pass'] }, required: true }),
      q('checkbox', 'Hoist/Ginny wheel in situ?', { showIf: { qId: scaff.id, values: ['Pass'] } }),
      q('checkbox', 'Chute in position?', { showIf: { qId: scaff.id, values: ['Pass'] } })]),
    sec('RAMS', [q('checkbox', 'RAMS in place and suitable?', { required: true })]),
    sec('Sign Off', [q('signature', 'Sign off signature', { required: true })]),
  ];

  const levels = [{ id: 'tl_green', color: 'green', label: 'Satisfactory' }, { id: 'tl_yellow', color: 'yellow', label: 'Repair Required' }, { id: 'tl_orange', color: 'orange', label: 'Replacement should be planned' }, { id: 'tl_red', color: 'red', label: 'Immediate replacement' }];
  const roof = [
    sec('Project Overview', [q('text', 'Site Address', { required: true, allowMedia: true }), q('date', 'Date of Survey', { autofill: 'today_date', required: true }), q('text', 'Surveyor from RTB', { autofill: 'inspector_name' })], { traffic: { on: true, levels }, showUnanswered: false }),
    sec('Roof Drawing / Mark-up', [q('drawing', 'Roof drawing / mark-up (upload the A3 drawing, PDF or photo)')]),
    sec('Roof Survey Area 1', [q('textarea', 'Description of Surveyed Area', { allowMedia: true }), ...[1, 2, 3, 4].map((i) => q('textarea', 'Item ' + i, { allowMedia: true }))]),
  ];

  const roofline = q('passfail', 'Roofline works');
  const handover = [
    sec('Handover Details', head('Address', 'Conducted on', 'Inspected by')),
    sec('Inspection', [q('passfail', 'Roofing works are completed, snag free and ready to be handed over to client team?', { required: true, mediaRequiredWhen: ['Pass', 'Fail'] }),
      q('photo', 'Main roof covering photos', { required: true }), q('passfail', 'Detailing works', { required: true }), roofline,
      q('passfail', 'Fascia, soffit & guttering completed?', { showIf: { qId: roofline.id, mode: 'equals', values: ['Pass'] }, required: true }),
      q('checkbox', 'Any other works completed?', { required: true }), q('checkbox', 'Left-over material cleared / working area cleared?', { required: true })]),
    sec('Sign Off', [q('signature', 'Inspector signature', { required: true })]),
  ];

  const loler = [
    sec('Equipment', [q('text', 'Site'), q('text', 'Inspected By'), q('date', 'Conducted On'), q('text', 'Make & Model'), q('text', 'Equipment Description'), q('text', 'Serial Number / Identification')]),
    sec('Regulation 3: Application', [yn('Is the equipment suitable for the task?'), q('text', 'How often is the equipment used?'), q('textarea', 'What is the nature and characteristics of the load'), yn('Is access to the equipment safe and suitable?')]),
    sec('Regulation 4: Strength & Stability', [yn('Does the equipment have adequate strength for the proposed use?'), yn('Is the equipment of adequate stability for the job?'), yn('Are measures in place to resist overturning?'), yn('Are lifting points on loads of suitable strength?')]),
    sec('Regulation 9: Thorough Examination & Inspection', [yn('Has the lifting equipment been thoroughly examined before first use?'), yn('Is it inspected, where appropriate, at suitable intervals?')]),
    sec('Result & Actions', [q('choice', 'Overall Result', { options: ['Pass — Fit for Continued Use', 'Pass with Actions', 'Fail — Withdraw From Use'] }), q('textarea', 'Details of any defects found / actions required'), q('photo', 'Photo of defect (if applicable)')]),
    sec('Signature', [q('signature', 'Inspector Signature'), q('date', 'Date')]),
  ];

  const T = [
    { id: 'rt1', name: 'Pre-Start Inspection', sections: preStart },
    { id: 'rt2', name: 'Roof Condition Report - RTB Roofing', sections: roof },
    { id: 'rt3', name: 'Project Handover - RTB Roofing', sections: handover },
    { id: 'rt4', name: 'LOLER Inspection', sections: loler, is_loler_inspection: true },
  ];
  // Fill every question with something sensible for its type.
  const fill = (sections) => {
    const a = {};
    sections.forEach((s) => s.items.forEach((it, i) => {
      const t = it.type;
      if (it.autofill === 'site_address') a[it.id] = 'Studley Rd, London, SW4 6RZ';
      else if (t === 'date') a[it.id] = '2026-11-04';
      else if (it.autofill === 'inspector_name') a[it.id] = 'Andy Admin';
      else if (t === 'text') a[it.id] = it.label === 'Serial Number / Identification' ? 'HST-0042' : 'Rear elevation, scaffold lift 3';
      else if (t === 'textarea') a[it.id] = 'Slates slipped near the valley; battens sound. Lead flashing to the chimney needs re-dressing.';
      else if (t === 'choice') a[it.id] = it.options[i % 5 === 3 && it.options.length > 1 ? 1 : 0];
      else if (t === 'passfail') a[it.id] = i % 4 === 2 ? 'Fail' : 'Pass';
      else if (t === 'checkbox') a[it.id] = i % 2 === 0;
      else if (t === 'photo' || t === 'drawing') a[it.id] = ['https://placehold.co/600x400/png'];
      else if (t === 'signature') a[it.id] = 'sig/me.png';
      if (s.traffic && t !== 'date') a[it.id + '__tl'] = levels[i % 4].id;
    }));
    return a;
  };
  db.report_templates = (db.report_templates || []).filter((t) => !/^rt\d$/.test(t.id)).concat(T.map((t) => ({ org_id: O, archived: false, is_daily_briefing: false, is_loler_inspection: false, created_at: '2026-10-01T08:00:00Z', ...t })));
  db.report_submissions = (db.report_submissions || []).filter((r) => !/^r[cf]\d$/.test(r.id)).concat(T.flatMap((t, i) => [
    { id: 'rc' + (i + 1), site_id: S1, org_id: O, template_id: t.id, template_name: t.name, sections: t.sections, answers: fill(t.sections), status: 'completed', submitted_by: me, submitted_at: '2026-11-04T10:00:00Z', created_at: '2026-11-04T09:00:00Z' },
    { id: 'rf' + (i + 1), site_id: S1, org_id: O, template_id: t.id, template_name: t.name, sections: t.sections, answers: {}, status: 'in_progress', submitted_by: me, created_at: '2026-11-04T11:00:00Z' },
  ]));
};
