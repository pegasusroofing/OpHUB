/* ================= OpHUB FINANCE — A3 Payment certificates + A4 Retention =================
   A3: the client's certificate (or pay-less notice) is recorded against its
   application: total certified, retention, previously certified, discount,
   net due — compared with what was applied for. One tap raises the invoice,
   which carries the same breakdown as its lines.
   A4: retention held per job (from the latest certificate), release dates
   from practical completion + defects period, reminders, and an invoice for
   each half when it falls due. */

/* ---------------- A3: certificate card on the application page ---------------- */
let finCertFile = null;
function finCertSlotRender(a){
  if(finCertSlotRender._for !== a.id){ finCertFile = null; finCertSlotRender._for = a.id; }
  const el = document.getElementById('finCertSlot'); if(!el) return;
  if(a.cert_net==null){
    const appliedPrev = Number(a.previous||0);
    el.innerHTML = `<div class="card" style="margin-top:14px;">
      <p class="sectiontitle" style="margin-top:0;">Client’s certificate ${finHelp('certified')}</p>
      <p class="stub" style="margin:0 0 10px;font-style:normal;">When the client’s certificate (or pay-less notice) comes back, enter its figures. They start as what you applied for.</p>
      <div class="fingrid2">
        <div class="formfield"><label class="field-label">Certificate date</label><input type="date" id="finCertDate" value="${finToday()}"></div>
        <div class="formfield"><label class="field-label">Total certified to date (£)</label><input type="text" inputmode="decimal" data-money id="finCertGross" value="${finRound(a.gross)}" oninput="finCertCalc()"></div>
        <div class="formfield"><label class="field-label">Retention held (£) ${finHelp('retention')}</label><input type="text" inputmode="decimal" data-money id="finCertRet" value="${finRound(a.retention)}" oninput="finCertCalc()"></div>
        <div class="formfield"><label class="field-label">Previously certified (£)</label><input type="text" inputmode="decimal" data-money id="finCertPrev" value="${finRound(appliedPrev)}" oninput="finCertCalc()"></div>
        <div class="formfield"><label class="field-label">Discount, if any (£)</label><input type="text" inputmode="decimal" data-money id="finCertDisc" value="0" oninput="finCertCalc()"></div>
        <div class="formfield"><label class="field-label">Net due (£)</label><input type="text" inputmode="decimal" data-money id="finCertNet" value="${finRound(a.net_due)}"></div>
      </div>
      <label class="finswitch"><input type="checkbox" id="finCertPayless"> This is a pay-less notice ${finHelp('payless')}</label>
      <div class="formfield"><label class="field-label">Copy of the certificate (optional)</label><input type="file" accept="application/pdf,image/*" onchange="finCertFile=this.files[0]||null"></div>
      <div class="formfield"><label class="field-label">Notes</label><input type="text" id="finCertNotes" placeholder="e.g. reason for any shortfall"></div>
      <div id="finCertDiff" class="stub" style="margin:0 0 10px;font-style:normal;"></div>
      <label class="finswitch finxpost" style="margin:0 0 12px;"><input type="checkbox" id="finCertInvoice" checked> <span><b>Raise and issue the invoice now</b><br><span class="stub" style="font-style:normal;">For the net due, numbered and saved as a PDF ready to email.</span></span></label>
      <button class="darkbtn" style="width:100%;" id="finCertSave" onclick="saveFinCertificate('${a.site_id}','${a.id}')">Save certificate</button>
    </div>`;
    finCertCalc();
    return;
  }
  const diff = finRound(Number(a.cert_net) - Number(a.net_due));
  const rows = [['Total certified to date', finMoney(a.cert_gross)], ['Less retention', '−'+finMoney(a.cert_retention)], ['Less previously certified', '−'+finMoney(a.cert_previous)]];
  if(Number(a.cert_discount||0)) rows.push(['Less discount', '−'+finMoney(a.cert_discount)]);
  el.innerHTML = `<div class="card fincertdone" style="margin-top:14px;">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
      <p class="sectiontitle" style="margin:0;">${a.cert_is_payless?'Pay-less notice':'Payment certificate'}</p>
      <span class="stub" style="margin:0;font-style:normal;">${finDate(a.cert_date)}</span>
    </div>
    ${rows.map(r=>`<div class="finkv"><span>${r[0]}</span><b>${r[1]}</b></div>`).join('')}
    <div class="finkv big"><span>Net due</span><b>${finMoney(a.cert_net)}</b></div>
    ${diff ? `<p class="stub" style="margin:6px 0 0;font-style:normal;color:${diff<0?'var(--red)':'var(--ok)'};"><b>${diff<0?'Short by':'Over by'} ${finMoney(Math.abs(diff))}</b> compared with the ${finMoney(a.net_due)} applied for.</p>` : `<p class="stub" style="margin:6px 0 0;font-style:normal;color:var(--ok);">Certified in full.</p>`}
    ${a.cert_notes ? `<p class="stub" style="margin:6px 0 0;font-style:normal;">${escapeHtml(a.cert_notes)}</p>` : ''}
    <div class="row-gap" style="flex-wrap:wrap;margin-top:10px;">
      ${a.cert_file_path ? `<button class="ghostbtn" style="flex:1;min-width:140px;" onclick="openFinDoc('${jsAttr(a.cert_file_path)}','${jsAttr(a.cert_file_name||'')}')">Certificate</button>` : ''}
      ${a.invoice_id ? `<button class="darkbtn" style="flex:1;min-width:140px;" onclick="go('#/site/${a.site_id}/finance/invoice/${a.invoice_id}')">🧾 Open invoice</button><button class="ghostbtn" style="flex:1;min-width:140px;" onclick="openFinEmail('${a.site_id}','${a.invoice_id}')">✉️ Email invoice</button>`
        : `<button class="darkbtn" style="flex:1;min-width:140px;" onclick="raiseInvoiceFromCert('${a.site_id}','${a.id}')">🧾 Raise invoice</button>`}
    </div>
    ${!a.invoice_id ? `<button class="linkbtn" style="margin-top:10px;color:var(--slate);" onclick="clearFinCertificate('${a.id}')">Change the certificate figures</button>` : ''}
  </div>`;
}
window.finCertCalc = function(){
  const g = finNum(finVal('finCertGross'))||0, r = finNum(finVal('finCertRet'))||0, p = finNum(finVal('finCertPrev'))||0, d = finNum(finVal('finCertDisc'))||0;
  const net = finRound(g - r - p - d);
  const el = document.getElementById('finCertNet'); if(el) finSetMoney(el, net);
  const a = finApp || {};
  const diffEl = document.getElementById('finCertDiff');
  if(diffEl && a.net_due!=null){ const diff = finRound(net - Number(a.net_due)); diffEl.innerHTML = diff ? `<b style="color:${diff<0?'var(--red)':'var(--ok)'};">${diff<0?'Short by':'Over by'} ${finMoney(Math.abs(diff))}</b> compared with the ${finMoney(a.net_due)} applied for.` : 'Matches what was applied for.'; }
};
window.saveFinCertificate = async function(siteId, appId){
  const vals = {cert_gross:finNum(finVal('finCertGross')), cert_retention:finNum(finVal('finCertRet')), cert_previous:finNum(finVal('finCertPrev')), cert_discount:finNum(finVal('finCertDisc'))||0, cert_net:finNum(finVal('finCertNet'))};
  if(Object.values(vals).some(v=>v===null || isNaN(v))){ toast('Fill in every amount (0 if none).'); return; }
  const btn = document.getElementById('finCertSave'); if(btn){ btn.disabled = true; btn.textContent = 'Saving…'; }
  const row = Object.assign({}, vals, {cert_date:finVal('finCertDate')||finToday(), cert_is_payless:document.getElementById('finCertPayless').checked, cert_notes:finVal('finCertNotes')||null, status:'certified', updated_at:new Date().toISOString()});
  Object.keys(vals).forEach(k=>{ row[k] = finRound(row[k]); });
  if(finCertFile){
    const safe = finCertFile.name.replace(/[^a-z0-9.\-]+/gi,'_').slice(-80);
    const stored = await uploadToStorage('finance-docs', ME.org_id+'/'+siteId+'/certificates/'+uid()+'-'+safe, finCertFile, finCertFile.type||'application/octet-stream');
    if(stored){ row.cert_file_path = stored; row.cert_file_name = finCertFile.name; }
  }
  const r = await dbUpdate('fin_applications', appId, row);
  if(btn){ btn.disabled = false; btn.textContent = 'Save certificate'; }
  if(!r) return;
  finCertFile = null; finApp = null;
  const inv = document.getElementById('finCertInvoice');
  if(inv && inv.checked && Number(row.cert_net)>0){ await raiseInvoiceFromCert(siteId, appId, true); return; }
  toast('Certificate saved'); render();
};
window.clearFinCertificate = async function(appId){
  const btn = event && event.target;
  if(btn && btn.dataset.sure!=='1'){ btn.dataset.sure='1'; btn.textContent='Tap again to re-enter the certificate'; return; }
  const r = await dbUpdate('fin_applications', appId, {cert_net:null, cert_gross:null, cert_retention:null, cert_previous:null, cert_discount:null, status:'submitted'});
  if(r){ finApp = null; render(); }
};
// The invoice for a certificate: its lines ARE the certificate breakdown.
window.raiseInvoiceFromCert = async function(siteId, appId, issueNow){
  const a = (await dbSelect('fin_applications', 'id=eq.'+appId))[0]; if(!a) return;
  if(a.invoice_id){ go(`#/site/${siteId}/finance/invoice/${a.invoice_id}`); return; }
  const site = SITES.find(s=>s.id===siteId) || {};
  const [st, jfRows] = await Promise.all([finLoadSettings(), dbSelect('job_finance', 'site_id=eq.'+siteId)]);
  const jf = jfRows[0] || {};
  const lines = [{description:`Application ${a.number} — total certified to date${a.cert_date?' ('+finDate(a.cert_date)+')':''}`, amount:finRound(a.cert_gross)},
  ];
  // Order (Andy, 22 Oct): certified total, less discount, less retention, less previously certified / paid. VAT goes on the total, not as a line.
  if(Number(a.cert_discount||0)) lines.push({description:'Less discount', amount:-finRound(a.cert_discount)});
  lines.push({description:'Less retention', amount:-finRound(a.cert_retention)});
  if(Number(a.cert_previous||0)) lines.push({description:'Less previously certified (paid)', amount:-finRound(a.cert_previous)});
  const today = finToday();
  // The client's default VAT code (Directory) wins over the project's VAT setting.
  let cliVat = null;
  if(typeof finClientsLoad==='function'){ await finClientsLoad(); const c = finClientByName(jf.billing_name||site.client_name); const m = {'20':'20','5':'5','rc20':'rc20','rc5':'rc5','0':'0','ex':'ex','none':'ex'}; if(c && m[c.sales_vat] && FIN_INV_VAT[m[c.sales_vat]]) cliVat = m[c.sales_vat]; }
  lines.forEach(l=>{ l.vat = cliVat || finInvVatFromTreatment(jf.vat_treatment||st.default_vat||'standard', 20); });
  const t = finInvTotals(lines, jf.vat_treatment||st.default_vat||'standard', 20);
  const rows = await dbInsert('fin_invoices', {
    org_id:ME.org_id, site_id:siteId, status:'draft', issue_date:today, due_date:a.final_date || finAddDays(today, jf.due_days!=null?jf.due_days:st.default_due_days),
    client_po:a.client_po||null, bill_name:jf.billing_name||site.client_name||null, bill_address:jf.billing_address||null, bill_email:jf.billing_email||site.client_email||null,
    vat_treatment:jf.vat_treatment||st.default_vat||'standard', lines, net:t.net, vat:t.vat, rc_vat:t.vatDue, total:t.total, source:'certificate', source_id:appId, created_by:ME.id,
    notes:'Net due: '+finMoney(a.cert_net)+' (excl. VAT) as certified.',
  });
  if(!rows || !rows[0]) return;
  await dbUpdate('fin_applications', appId, {invoice_id:rows[0].id, status:'invoiced'});
  finApp = null;
  if(issueNow){
    if(!rows[0].bill_name){ toast('Certificate saved — add who the invoice is to, then issue it.'); go(`#/site/${siteId}/finance/invoice/${rows[0].id}`); return; }
    const issued = await finIssueInvoiceById(rows[0].id);
    if(issued){ go(`#/site/${siteId}/finance/invoice/${rows[0].id}`); return; }
  }
  go(`#/site/${siteId}/finance/invoice/${rows[0].id}`);
};

/* ---------------- A4: Retention ---------------- */
// Retention held = what the latest certificate holds back (it is cumulative).
function finRetentionHeld(apps){
  const c = apps.filter(a=>a.cert_retention!=null && a.status!=='void').sort((x,y)=>y.number-x.number)[0];
  return c ? finRound(c.cert_retention) : 0;
}
function finAddMonths(iso, m){ const d = new Date(iso+'T12:00:00'); const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth()+(Number(m)||0)); const last = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate(); d.setDate(Math.min(day, last)); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
// Retention halves: the second half takes the odd penny so the two add up to what's held.
function finRetHalf(held, n){ const a = finRound(held/2); return n===1 ? a : finRound(held - a); }
function finRetentionDates(jf, st){
  if(!jf || !jf.pc_date) return {first:null, second:null};
  const months = jf.defects_months!=null ? jf.defects_months : ((st&&st.default_defects_months)!=null ? st.default_defects_months : 12);
  return {first:jf.pc_date, second:finAddMonths(jf.pc_date, months), months};
}
// 'due' within 30 days (or past) and not yet invoiced.
function finRetentionAlerts(jf, st, held){
  if(!held) return [];
  const d = finRetentionDates(jf, st), soon = finAddDays(finToday(), 30), out = [];
  if(d.first && !jf.ret1_invoice_id && d.first <= soon) out.push({half:1, date:d.first});
  if(d.second && !jf.ret2_invoice_id && d.second <= soon) out.push({half:2, date:d.second});
  return out;
}
function finRetentionCardHtml(siteId, jf, st, apps){
  const held = finRetentionHeld(apps);
  const d = finRetentionDates(jf, st);
  const alerts = finRetentionAlerts(jf, st, held);
  const row = (n, date, invId)=>`<div class="finkv"><span>${n===1?'First half — at practical completion':'Second half — end of defects period'}<em style="display:block;font-style:normal;font-size:12px;">${date?finDate(date):'Set the practical completion date'}</em></span>
      <b>${finMoney(finRetHalf(held, n))} ${invId ? `<button class="linkbtn" style="color:var(--blue);" onclick="go('#/site/${siteId}/finance/invoice/${invId}')">invoice</button>` : (held && date ? `<button class="linkbtn" style="color:var(--blue);" onclick="raiseRetentionInvoice('${siteId}',${n})">raise invoice</button>` : '')}</b></div>`;
  return `<div class="card">
    <p class="sectiontitle" style="margin-top:0;">Retention</p>
    ${alerts.length ? `<div class="finchecks" style="margin:0 0 8px;">${alerts.map(x=>`<span>${x.half===1?'First':'Second'} half due ${finDate(x.date)}</span>`).join('')}</div>` : ''}
    <div class="finkv big"><span>Held to date</span><b>${finMoney(held)}</b></div>
    ${row(1, d.first, jf.ret1_invoice_id)}${row(2, d.second, jf.ret2_invoice_id)}
    <div class="fingrid2" style="margin-top:10px;">
      <div class="formfield"><label class="field-label">Practical completion date</label><input type="date" id="finPcDate" value="${jf.pc_date||''}"></div>
      <div class="formfield"><label class="field-label">Defects period (months)</label><input type="number" min="0" step="1" id="finDefects" value="${jf.defects_months!=null?jf.defects_months:(st.default_defects_months!=null?st.default_defects_months:12)}"></div>
    </div>
    <button class="ghostbtn" style="width:100%;" onclick="saveFinRetentionDates('${siteId}')">Save dates</button>
  </div>`;
}
window.saveFinRetentionDates = async function(siteId){
  const months = finInt(finVal('finDefects'));
  if(months===null || isNaN(months) || months<0 || months>120){ toast('Enter the defects period in months.'); return; }
  const res = await sbFetch('/rest/v1/job_finance', {method:'POST', headers:{'Prefer':'resolution=merge-duplicates'}, body:JSON.stringify({site_id:siteId, org_id:ME.org_id, pc_date:finVal('finPcDate')||null, defects_months:months, updated_at:new Date().toISOString(), updated_by:ME.id})});
  if(!res.ok){ toast('Save failed — '+(await safeErr(res))); return; }
  toast('Retention dates saved'); render();
};
window.raiseRetentionInvoice = async function(siteId, n){
  const site = SITES.find(s=>s.id===siteId) || {};
  const [st, jfRows, apps, pos] = await Promise.all([finLoadSettings(), dbSelect('job_finance', 'site_id=eq.'+siteId), dbSelect('fin_applications', 'site_id=eq.'+siteId+'&select=number,status,cert_retention'), dbSelect('client_pos', 'site_id=eq.'+siteId+'&order=is_primary.desc,created_at.asc&select=po_number')]);
  const jf = jfRows[0] || {};
  const already = n===1 ? jf.ret1_invoice_id : jf.ret2_invoice_id;
  if(already){ go(`#/site/${siteId}/finance/invoice/${already}`); return; }
  const amt = finRetHalf(finRetentionHeld(apps), n);
  if(!amt){ toast('No retention held on this project yet.'); return; }
  const lines = [{description:`Release of retention — ${n===1?'first half (practical completion'+(jf.pc_date?' '+finDate(jf.pc_date):'')+')':'second half (end of defects period)'}`, amount:amt}];
  if(typeof finClientsLoad==='function'){ await finClientsLoad(); const c = finClientByName(jf.billing_name||site.client_name); const m = {'20':'20','5':'5','rc20':'rc20','rc5':'rc5','0':'0','ex':'ex','none':'ex'}; if(c && m[c.sales_vat] && FIN_INV_VAT[m[c.sales_vat]]) lines.forEach(l=>{ if(!l.vat) l.vat = m[c.sales_vat]; }); }
  const t = finInvTotals(lines, jf.vat_treatment||st.default_vat||'standard', 20);
  const today = finToday();
  const rows = await dbInsert('fin_invoices', {
    org_id:ME.org_id, site_id:siteId, status:'draft', issue_date:today, due_date:finAddDays(today, jf.due_days!=null?jf.due_days:st.default_due_days),
    client_po:(pos[0]||{}).po_number||null, bill_name:jf.billing_name||site.client_name||null, bill_address:jf.billing_address||null, bill_email:jf.billing_email||site.client_email||null,
    vat_treatment:jf.vat_treatment||st.default_vat||'standard', lines, net:t.net, vat:t.vat, rc_vat:t.vatDue, total:t.total, source:'retention', created_by:ME.id,
  });
  if(!rows || !rows[0]) return;
  const patch = {site_id:siteId, org_id:ME.org_id, updated_at:new Date().toISOString()}; patch[n===1?'ret1_invoice_id':'ret2_invoice_id'] = rows[0].id;
  const lk = await sbFetch('/rest/v1/job_finance', {method:'POST', headers:{'Prefer':'resolution=merge-duplicates'}, body:JSON.stringify(patch)});
  if(!lk.ok) toast('Invoice made, but it couldn’t be linked to the retention — '+(await safeErr(lk)));
  go(`#/site/${siteId}/finance/invoice/${rows[0].id}`);
};
