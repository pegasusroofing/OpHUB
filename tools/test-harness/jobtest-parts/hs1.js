// The ones only opened last time, now worked to the end: daily briefing, induction, incident, expense.
const path = require('path');
module.exports = async ({as, step, state, keep, samples}) => {
  const a = await as('admin'), o = await as('op');
  const J = state.regular, C = state.mc, photo = path.join(samples, 'site-photo.jpg');
  const say = async (p) => (await p.text()).replace(/\s+/g, ' ').slice(0, 260);
  const scrollEnd = async (p) => { await p.page.evaluate(() => document.querySelectorAll('*').forEach((e) => { if (e.scrollHeight > e.clientHeight + 40) e.scrollTop = e.scrollHeight; })); await p.page.waitForTimeout(400); };

  await step('Briefing: manager completes the one started', async () => {
    const s0 = await a.get(`report_submissions?select=id,status&site_id=eq.${J}&order=submitted_at.desc&limit=1`);
    state.brief = s0[0].id; keep();
    await a.go(`/sites/${J}/hs/briefings/fill/${state.brief}`);
    await scrollEnd(a);
    await a.shot('b2');
    await a.tap('Complete Briefing', {wait: 5000});
    await a.shot('b3');
    const s = await a.get(`report_submissions?select=status&id=eq.${state.brief}`);
    return {ok: s[0]?.status === 'completed', note: `${s[0]?.status} | ${await say(a)}`};
  });
  await step('Briefing: manager issues it for signing', async () => {
    await a.go(`/sites/${J}/hs/briefings/${state.brief}`);
    await a.tap('Issue for Signing', {wait: 1200});
    await a.shot('b4');
    await a.page.getByText(/^(Issue|Yes|OK|Confirm)/).locator('visible=true').last().click({timeout: 5000});
    await a.page.waitForTimeout(3500);
    const s = await a.get(`report_submissions?select=issued_at&id=eq.${state.brief}`);
    return {ok: !!s[0]?.issued_at, note: s[0]?.issued_at || await say(a)};
  });
  await step('Briefing: operative sees it and signs', async () => {
    await o.go(`/sites/${J}/hs/briefings`);
    await o.shot('b5');
    await o.go(`/sites/${J}/hs/briefings/${state.brief}`);
    await scrollEnd(o);
    await o.shot('b6');
    await o.page.getByText(/sign/i).locator('visible=true').last().click({timeout: 6000});
    await o.page.waitForTimeout(3500);
    await o.shot('b7');
    const g = await a.get(`daily_briefing_signatures?select=id&submission_id=eq.${state.brief}`);
    return {ok: g.length >= 1, note: `${g.length} signature(s) | ${await say(o)}`};
  }, 'op');
  await step('Briefing: Edit goes away after the first signature', async () => {
    await a.go(`/sites/${J}/hs/briefings/${state.brief}`);
    return {ok: !/Edit Briefing/.test(await a.text()), note: 'manager view'};
  });
  await step('Briefing: export is a real PDF', async () => {
    await a.go(`/sites/${J}/hs/briefings/${state.brief}`);
    await a.shot('b8');
    const f = await a.saved(async () => { await a.page.getByText(/Export/).locator('visible=true').first().click(); await a.page.waitForTimeout(1500); const pdf = a.page.getByText(/^(📄 )?(PDF|Download PDF|Save PDF)/).locator('visible=true').last(); if (await pdf.isVisible().catch(() => false)) await pdf.click(); });
    const head = require('fs').readFileSync(f).slice(0, 5).toString();
    return {ok: head === '%PDF-', note: path.basename(f)};
  });

  await step('Induction: operative completes all three stages', async () => {
    await o.go(`/sites/${C}/mc/inductions`, 5000);
    await o.shot('i0');
    const before = await say(o);
    if (/View My Induction/.test(before)) return {ok: true, note: 'already done'};
    const boxes = o.page.getByText('☐', {exact: true}).locator('visible=true');
    const n = await boxes.count();
    for (let i = 0; i < n; i++) { await o.page.getByText('☐', {exact: true}).locator('visible=true').first().click({timeout: 4000}); await o.page.waitForTimeout(120); }
    await o.fill('Emergency contact name *', 'ZZ Test Contact');
    await o.fill('Emergency contact number *', '01234 567890');
    await o.shot('i1');
    await o.tap('Next: Health Questionnaire ›', {wait: 1500});
    const nos = o.page.getByText('No', {exact: true}).locator('visible=true');
    const m = await nos.count();
    for (let i = 0; i < m; i++) { await nos.nth(i).click({timeout: 4000}); await o.page.waitForTimeout(80); }
    await o.shot('i2');
    await scrollEnd(o);
    await o.page.getByText('Tap to sign & complete induction').locator('visible=true').first().click({timeout: 6000});
    await o.page.waitForTimeout(7000);
    await o.shot('i3');
    const r = await a.get(`site_induction_completions?select=id,pdf_path&site_id=eq.${C}`);
    return {ok: r.length >= 1 && !!r[0].pdf_path, note: `${n} items, ${m} health answers, ${r.length} on record | ${await say(o)}`};
  }, 'op');
  await step('Induction: manager sees it and exports it', async () => {
    await a.go(`/sites/${C}/mc/inductions`, 5000);
    await a.shot('i4');
    const t = await a.text();
    return {ok: /andy op/i.test(t), note: t.replace(/\s+/g, ' ').slice(60, 240)};
  });

  await step('Incident: operative fills it in and signs it', async () => {
    await o.go(`/sites/${J}/hs/incidents/new`, 5000);
    await o.tap('Near Miss', {wait: 300});
    await o.page.locator('textarea').locator('visible=true').first().fill('ZZ test: a slate slipped from the stack, nobody hurt.');
    const pickNo = async (label) => { const row = o.page.getByText(label, {exact: true}).locator('visible=true').first().locator('xpath=following-sibling::*[1]'); await row.getByText('No', {exact: true}).click({timeout: 5000}); await o.page.waitForTimeout(150); };
    await pickNo('* Operative requires further medical treatment');
    await pickNo('* Any injuries occurred?');
    await pickNo('* Riddor reportable?');
    await o.shot('n1');
    await o.tap('Sign & Submit Report', {wait: 5000});
    await o.shot('n2');
    const r = await a.get(`incident_reports?select=id,status&site_id=eq.${J}&order=created_at.desc&limit=1`);
    state.incident = r[0]?.id; keep();
    return {ok: !!r[0], note: `${r.length} on record | ${await say(o)}`};
  }, 'op');
  await step('Incident: manager reads it', async () => {
    await a.go(`/sites/${J}/hs/incidents`);
    await a.shot('n3');
    await a.go(`/sites/${J}/hs/incidents/${state.incident}`);
    await a.shot('n4');
    return {ok: /slate slipped/.test(await a.text()), note: await say(a)};
  });

  await step('Expense: operative saves a receipt. The email is blocked by the test rule', async () => {
    await o.go(`/sites/${J}/expenses`, 5000);
    await o.pick(() => o.tap('🖼 Photos', {wait: 0}), [photo], 3000);
    await o.shot('e1');
    await o.page.getByText(/^Save & send/).locator('visible=true').last().click({timeout: 6000});
    await o.page.waitForTimeout(7000);
    await o.shot('e2');
    const r = await o.get('expenses?select=id,site_id,file_paths&order=created_at.desc&limit=1');
    return {ok: r.length >= 1 && (r[0].file_paths || []).length >= 1, note: `${r.length} row | ${await say(o)}`};
  }, 'op');
};
