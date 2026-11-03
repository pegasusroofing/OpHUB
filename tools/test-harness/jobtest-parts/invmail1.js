// Issued invoice: Email Invoice (template pop-up, nothing sent) and Export PDF buttons. Looks at SBX-INV-1017 on the ddf job only.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const q = (x) => a.page.getByText(x, {exact: true}).locator('visible=true');
  await a.page.setViewportSize({width: 430, height: 932});
  const [i] = await a.get('fin_invoices?select=id,site_id,number&number=eq.SBX-INV-1017');
  await step('Email Invoice and Export PDF on an issued invoice', async () => {
    await a.go('/fin/job/' + i.site_id + '/invoice/' + i.id, 8000); await a.page.waitForTimeout(4000); await a.shot('issued');
    const btns = await q('Email Invoice').count() + await q('Export PDF').count();
    await q('Email Invoice').first().click({timeout: 5000}); await a.page.waitForTimeout(1500); await a.shot('popup');
    const tpl = await q('Template').count(), subj = await a.page.locator('input:visible').evaluateAll((els) => els.map((e) => e.value).filter((v) => /SBX-INV-1017/.test(v)).length);
    await q('Cancel').last().click({timeout: 5000});
    return {ok: btns === 2 && tpl === 1 && subj >= 1, note: 'buttons ' + btns + ', template ' + tpl + ', subject has number ' + subj};
  });
};
