/* ================= OpHUB FINANCE =================
   The money side of each job. Hidden: only people with profiles.finance_enabled
   see any of it, and the database (fin_settings / job_finance / client_pos,
   bucket finance-docs) refuses everyone else — see is_finance().
   Step 0 (this file): Finance page (#/finance), Finance settings
   (#/finance/settings), a Finance tile on each job (#/site/<id>/finance) with
   job details and client PO numbers, automatic job numbers, and the per-user
   switch in Admin Centre › Users. */
function isFinanceUser(){ return !!(ME && ME.finance_enabled === true && !(ORG && ORG.has_pm===false && ORG.has_finance===false)); }
window.isFinanceUser = isFinanceUser;

let FIN_SETTINGS = null;           // this company's fin_settings row (or null = defaults)
let finHomeTab = 'live';           // live | upcoming | closed | all
const FIN_DEFAULTS = {invoice_prefix:'INV-', next_invoice_number:1001, default_retention_pct:5, default_due_days:30, default_final_days:14, default_vat:'standard', app_reminder_day:null};
const FIN_VAT_LABEL = {standard:'Standard VAT (20%)', reverse_charge:'Domestic reverse charge (CIS)', zero:'Zero rated / no VAT'};

function finMoney(n, dp){
  if(n===null || n===undefined || n==='' || isNaN(Number(n))) return '—';
  const d = dp===undefined ? 2 : dp;
  return '£'+Number(n).toLocaleString('en-GB', {minimumFractionDigits:d, maximumFractionDigits:d});
}
function finNum(v){
  const s = String(v===undefined||v===null ? '' : v).replace(/[£,\s]/g, '');
  if(s==='') return null;
  const n = Number(s);
  return isNaN(n) ? NaN : n;
}
function finInt(v){ const n = finNum(v); return (n===null || isNaN(n)) ? n : Math.round(n); }
function finVal(id){ const el = document.getElementById(id); return el ? el.value.trim() : ''; }
function finSettings(){ return Object.assign({}, FIN_DEFAULTS, FIN_SETTINGS||{}); }
async function finLoadSettings(){
  const rows = await dbSelect('fin_settings', 'org_id=eq.'+ME.org_id);
  FIN_SETTINGS = rows[0] || null;
  return finSettings();
}
// Highest plain-number job number already used, +1 — the suggested start.
function finSuggestedNextJobNumber(){
  const prefix = (ORG && ORG.job_number_prefix) || '';
  let max = 0;
  SITES.forEach(s=>{
    let j = String(s.job_number||'').trim();
    if(prefix && j.toLowerCase().startsWith(prefix.toLowerCase())) j = j.slice(prefix.length);
    if(/^\d{3,6}$/.test(j)){ const n = Number(j); if(n > max && n < 100000) max = n; }
  });
  return max ? max+1 : 1001;
}
function finNextJobNumberLabel(){
  if(!ORG || !ORG.auto_job_numbers) return '';
  const n = ORG.next_job_number || finSuggestedNextJobNumber();
  return (ORG.job_number_prefix||'') + n;
}
window.finNextJobNumberLabel = finNextJobNumberLabel;
function finSiteStatus(s){ return typeof siteStatusKey==='function' ? siteStatusKey(s) : (s.status||'live'); }
function finGuard(){
  if(isFinanceUser()) return true;
  if(typeof isFinanceOnly==='function' && isFinanceOnly()){ renderFinNoAccess(); return false; }
  toast('OpHUB Finance isn’t switched on for your account.');
  go(typeof homeHash==='function' ? homeHash() : '#/sites');
  return false;
}

/* The Finance overview (renderFinanceHome) is in 914-finance-sections.js. */

/* ---------- Finance settings ---------- */
async function renderFinanceSettings(){
  if(!finGuard()) return;
  const __gen = RENDER_GEN;
  const st = await finLoadSettings();
  if(__gen !== RENDER_GEN) return;
  const auto = !!(ORG && ORG.auto_job_numbers);
  const next = (ORG && ORG.next_job_number) || finSuggestedNextJobNumber();
  const vatOpts = Object.keys(FIN_VAT_LABEL).map(k=>`<option value="${k}" ${st.default_vat===k?'selected':''}>${FIN_VAT_LABEL[k]}</option>`).join('');
  document.getElementById('app').innerHTML = shell(`
    ${finSectionNav('settings')}
    <div class="card" id="finCostAccess"><p class="stub">Loading…</p></div>
    ${typeof isFinanceOnly==='function' && isFinanceOnly() ? `<div class="finshort"><button class="ghostbtn" onclick="go('#/fin-team')">Team</button>${isFullManager(ME)?`<button class="ghostbtn" onclick="go('#/suppliers')">Suppliers</button>`:''}<button class="ghostbtn" onclick="go('#/account')">My account</button></div>` : ''}
    <div class="card">
      <p class="sectiontitle" style="margin-top:0;">Project numbers</p>
      <p class="stub" style="margin:0 0 10px;font-style:normal;">When this is on, every new project gets the next number automatically and nobody types one in. A number can’t be used twice.</p>
      <label class="finswitch"><input type="checkbox" id="finAutoJob" ${auto?'checked':''}> Give new projects the next number automatically</label>
      <div class="fingrid2">
        <div class="formfield"><label class="field-label">Prefix (optional)</label><input type="text" id="finJobPrefix" maxlength="12" placeholder="e.g. RTB-" value="${escapeHtml((ORG&&ORG.job_number_prefix)||'')}"></div>
        <div class="formfield"><label class="field-label">Next number</label><input type="number" id="finJobNext" min="1" step="1" value="${escapeHtml(String(next))}"></div>
      </div>
      <p class="stub" style="margin:0;font-style:normal;">Your highest project number so far is ${finSuggestedNextJobNumber()-1}, so the next free one is ${finSuggestedNextJobNumber()}.</p>
    </div>
    <div class="card">
      <p class="sectiontitle" style="margin-top:0;">Purchase orders</p>
      <p class="stub" style="margin:0 0 10px;font-style:normal;">Every material order sent from a project’s Materials tile becomes a purchase order numbered by project (e.g. ${escapeHtml(((SITES.find(x=>x.job_number)||{}).job_number)||'2628')}-PO-001). The number goes on the order email and the request.</p>
      <label class="finswitch"><input type="checkbox" id="finPoOn" ${st.po_enabled?'checked':''}> Raise a PO for every PM’s order</label>
      <p class="stub" style="margin:0;font-style:normal;">${st.po_enabled ? 'On: every order from every PM gets a PO number.' : 'Off: only orders you send get a PO, so PMs see no change while this is tested.'}</p>
    </div>
    <div class="card">
      <p class="sectiontitle" style="margin-top:0;">Invoice numbers</p>
      <div class="fingrid2">
        <div class="formfield"><label class="field-label">Prefix</label><input type="text" id="finInvPrefix" maxlength="12" value="${escapeHtml(st.invoice_prefix||'')}"></div>
        <div class="formfield"><label class="field-label">Next number</label><input type="number" id="finInvNext" min="1" step="1" value="${escapeHtml(String(st.next_invoice_number))}"></div>
      </div>
      <p class="stub" style="margin:0;font-style:normal;">Used when invoices are added in the next step. Next invoice: <b>${escapeHtml((st.invoice_prefix||'')+st.next_invoice_number)}</b></p>
    </div>
    <div class="card">
      <p class="sectiontitle" style="margin-top:0;">Defaults for new projects</p>
      <p class="stub" style="margin:0 0 10px;font-style:normal;">Each project starts with these and can be changed on its own Finance page.</p>
      <div class="fingrid2">
        <div class="formfield"><label class="field-label">Retention %</label><input type="number" id="finDefRet" min="0" max="100" step="0.5" value="${escapeHtml(String(st.default_retention_pct))}"></div>
        <div class="formfield"><label class="field-label">Application date (day of month)</label><input type="number" id="finDefAppDay" min="1" max="31" step="1" placeholder="e.g. 25" value="${st.app_reminder_day||''}"></div>
        <div class="formfield"><label class="field-label">Days to due date</label><input type="number" id="finDefDue" min="0" step="1" value="${escapeHtml(String(st.default_due_days))}"></div>
        <div class="formfield"><label class="field-label">Days from due date to final date for payment</label><input type="number" id="finDefFinal" min="0" step="1" value="${escapeHtml(String(st.default_final_days))}"></div>
      </div>
      <div class="formfield"><label class="field-label">VAT</label><select id="finDefVat">${vatOpts}</select></div>
    </div>
    <div class="card">
      <p class="sectiontitle" style="margin-top:0;">On your invoices</p>
      <p class="stub" style="margin:0 0 10px;font-style:normal;">Printed at the bottom of every invoice and application.</p>
      <div class="formfield"><label class="field-label">Company address</label><textarea id="finCoAddr" rows="3">${escapeHtml(st.company_address||'')}</textarea></div>
      <div class="fingrid2">
        <div class="formfield"><label class="field-label">VAT number</label><input type="text" id="finCoVat" value="${escapeHtml(st.company_vat_no||'')}"></div>
        <div class="formfield"><label class="field-label">Company number</label><input type="text" id="finCoReg" value="${escapeHtml(st.company_reg_no||'')}"></div>
        <div class="formfield"><label class="field-label">Your UTR (for CIS statements)</label><input type="text" id="finCoUtr" value="${escapeHtml(st.contractor_utr||'')}"></div>
        <div class="formfield"><label class="field-label">Employer / accounts office ref</label><input type="text" id="finCoEmp" value="${escapeHtml(st.employer_ref||'')}"></div>
        <div class="formfield"><label class="field-label">Bank</label><input type="text" id="finBank" value="${escapeHtml(st.bank_name||'')}"></div>
        <div class="formfield"><label class="field-label">Account name</label><input type="text" id="finBankName" value="${escapeHtml(st.bank_account_name||'')}"></div>
        <div class="formfield"><label class="field-label">Sort code</label><input type="text" id="finBankSort" value="${escapeHtml(st.bank_sort_code||'')}" placeholder="00-00-00"></div>
        <div class="formfield"><label class="field-label">Account number</label><input type="text" id="finBankAcc" value="${escapeHtml(st.bank_account_no||'')}"></div>
      </div>
      <div class="formfield"><label class="field-label">Footer note (optional)</label><input type="text" id="finFooter" value="${escapeHtml(st.invoice_footer||'')}" placeholder="e.g. Payment terms 30 days"></div>
    </div>
    ${typeof finInboxSettingsHtml==='function' ? finInboxSettingsHtml(st) : ''}
    ${typeof finXeroSettingsHtml==='function' ? finXeroSettingsHtml(st) : ''}
    <button class="darkbtn" style="width:100%;" id="finSettingsSave" onclick="saveFinanceSettings()">Save settings</button>
  `, {title:'Finance settings', subtitle:'OpHUB Finance', back:finSecBack(), tabs:false});
  if(typeof finCostsAccessFill==='function') finCostsAccessFill();
}
window.saveFinanceSettings = async function(){
  const auto = document.getElementById('finAutoJob').checked;
  const prefix = finVal('finJobPrefix');
  const nextJob = finInt(finVal('finJobNext'));
  const invNext = finInt(finVal('finInvNext'));
  const ret = finNum(finVal('finDefRet')), due = finInt(finVal('finDefDue')), fin = finInt(finVal('finDefFinal')), appDay = finInt(finVal('finDefAppDay'));
  if(auto && (!nextJob || nextJob < 1)){ toast('Enter the next project number.'); return; }
  if(auto){
    const clash = SITES.find(s=>String(s.job_number||'').trim().toLowerCase() === (prefix+nextJob).toLowerCase());
    if(clash){ toast('Project number '+prefix+nextJob+' is already used on '+clash.name+'. Pick a higher number.'); return; }
  }
  if(!invNext || invNext < 1){ toast('Enter the next invoice number.'); return; }
  if(ret===null || isNaN(ret) || ret < 0 || ret > 100){ toast('Retention must be between 0 and 100%.'); return; }
  if(appDay!==null && (isNaN(appDay) || appDay < 1 || appDay > 31)){ toast('Application date must be a day of the month, 1 to 31.'); return; }
  const btn = document.getElementById('finSettingsSave'); if(btn){ btn.disabled = true; btn.textContent = 'Saving…'; }
  const orgRow = await dbUpdate('organizations', ORG.id, {auto_job_numbers:auto, job_number_prefix:prefix, next_job_number:nextJob||null});
  if(orgRow) ORG = Object.assign(ORG, orgRow);
  const res = await sbFetch('/rest/v1/fin_settings', {method:'POST', headers:{'Prefer':'resolution=merge-duplicates,return=representation'}, body:JSON.stringify({
    org_id:ME.org_id, invoice_prefix:finVal('finInvPrefix'), next_invoice_number:invNext, default_retention_pct:ret,
    default_due_days:(due===null||isNaN(due))?30:due, default_final_days:(fin===null||isNaN(fin))?14:fin,
    default_vat:finVal('finDefVat')||'standard', app_reminder_day:appDay, updated_at:new Date().toISOString(), updated_by:ME.id,
    po_enabled: !!(document.getElementById('finPoOn')||{}).checked,
    contractor_utr:finVal('finCoUtr')||null, employer_ref:finVal('finCoEmp')||null,
    company_address:finVal('finCoAddr')||null, company_vat_no:finVal('finCoVat')||null, company_reg_no:finVal('finCoReg')||null,
    bank_name:finVal('finBank')||null, bank_account_name:finVal('finBankName')||null, bank_sort_code:finVal('finBankSort')||null,
    bank_account_no:finVal('finBankAcc')||null, invoice_footer:finVal('finFooter')||null,
  })});
  if(btn){ btn.disabled = false; btn.textContent = 'Save settings'; }
  if(!res.ok){ toast('Save failed — '+(await safeErr(res))); return; }
  FIN_SETTINGS = (await res.json())[0] || FIN_SETTINGS;
  if(!orgRow){ return; }
  toast('Finance settings saved');
  render();
};

/* ---------- A job's Finance page ---------- */
async function renderSiteFinance(siteId){
  if(!finGuard()) return;
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  if(!site){ go('#/finance'); return; }
  const [st, jfRows, pos, invs, items, apps, pords, pinvs, lab, hires, xcosts] = await Promise.all([
    finLoadSettings(),
    dbSelect('job_finance', 'site_id=eq.'+siteId),
    dbSelect('client_pos', 'site_id=eq.'+siteId+'&order=is_primary.desc,created_at.asc'),
    dbSelect('fin_invoices', 'site_id=eq.'+siteId+'&order=created_at.desc'),
    dbSelect('fin_contract_items', 'site_id=eq.'+siteId+'&select=id,value'),
    dbSelect('fin_applications', 'site_id=eq.'+siteId+'&order=number.desc&select=id,number,status,valuation_date,gross,net_due,cert_net,cert_retention,invoice_id'),
    dbSelect('purchase_orders', 'site_id=eq.'+siteId+'&order=seq.desc'),
    dbSelect('purchase_invoices', 'site_id=eq.'+siteId+'&order=created_at.desc'),
    finJobLabour(siteId),
    dbSelect('fin_plant_hires', 'site_id=eq.'+siteId+'&order=on_hire.desc'),
    dbSelect('fin_job_costs', 'site_id=eq.'+siteId+'&select=net'),
  ]);
  if(__gen !== RENDER_GEN) return;
  const jf = jfRows[0] || {};
  const saved = !!jfRows[0];
  const pick = (k, d)=> (jf[k]!==undefined && jf[k]!==null && jf[k]!=='') ? jf[k] : d;
  const vat = pick('vat_treatment', st.default_vat);
  const poTotal = pos.reduce((t,p)=>t+Number(p.value||0), 0);
  document.getElementById('app').innerHTML = shell(`
    ${typeof isFinanceOnly==='function' && isFinanceOnly() ? '' : '<div class="finbanner">🔒 Only you can see this while OpHUB Finance is being built.</div>'}
    <div class="card finhead">
      <div><div class="finhead-l">Project no.</div><div class="finhead-v">${escapeHtml(site.job_number||'—')}</div></div>
      <div><div class="finhead-l">Client</div><div class="finhead-v">${escapeHtml(site.client_name||'—')}</div></div>
      <div><div class="finhead-l">Client PO</div><div class="finhead-v">${pos.length ? escapeHtml(pos.map(p=>p.po_number).join(', ')) : '—'}</div></div>
      <div><div class="finhead-l">Contract value</div><div class="finhead-v">${finMoney(jf.contract_value)}</div></div>
    </div>

    <div id="finJcSlot">${finJobCostCardHtml(finJobCost(jf, invs, pords, pinvs, lab.cost, hires.reduce((t,h)=>t+finPlantCost(h).cost,0), xcosts.reduce((t,x)=>t+Number(x.net||0),0)), siteId)}</div>
    <div id="finFcSlot"></div>
    <div id="fin-a-apps"></div>${finApplicationsCardHtml(siteId, apps, finAppDueThisMonth(apps, finAppDayFor(jf, st)) && finSiteStatus(site)==='live')}
    <div id="fin-a-invoices"></div>${finInvoicesCardHtml(siteId, invs)}
    <div id="fin-a-purchasing"></div>${finPurchasingCardHtml(siteId, pords, pinvs)}
    <div id="finScSlot"></div>
    ${finLabourCardHtml(siteId, lab)}
    ${finPlantCardHtml(siteId, hires)}
    ${finRetentionCardHtml(siteId, jf, st, apps)}
    ${finContractCardHtml(siteId, items, jf)}

    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <p class="sectiontitle" style="margin:0;">Client purchase orders</p>
        <button class="ghostbtn" style="padding:6px 12px;width:auto;flex:none;" onclick="openClientPoForm('${siteId}')">+ Add PO</button>
      </div>
      <p class="stub" style="margin:4px 0 10px;font-style:normal;">The main PO goes on every invoice, application and certificate for this project. Add another PO for variations if the client issues one.</p>
      ${pos.length ? pos.map(p=>`
        <div class="finpo">
          <div class="finpo-main">
            <div class="finpo-no">${escapeHtml(p.po_number)} ${p.is_primary?'<span class="tag-ok">Main PO</span>':''}</div>
            <div class="stub" style="margin:2px 0 0;font-style:normal;">${[p.value!=null?finMoney(p.value):'', p.po_date?new Date(p.po_date).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'', p.description||''].filter(Boolean).map(escapeHtml).join(' · ') || 'No value or date'}</div>
          </div>
          <div class="finpo-act">
            ${p.file_path ? `<button class="ghostbtn" style="padding:5px 10px;width:auto;" onclick="openClientPoFile('${p.id}')">View</button>` : ''}
            <button class="ghostbtn" style="padding:5px 10px;width:auto;" onclick="openClientPoForm('${siteId}','${p.id}')">Edit</button>
          </div>
        </div>`).join('') + (pos.length>1 ? `<p class="stub" style="margin:8px 0 0;font-style:normal;">Total of POs: <b>${finMoney(poTotal)}</b></p>` : '')
      : `<div class="empty" style="margin:0;">No client PO yet.</div>`}
    </div>

    ${typeof finJobEditHtml==='function' ? finJobEditHtml(site) : ''}
    <div class="card">
      <p class="sectiontitle" style="margin-top:0;">Project details</p>
      <div class="fingrid2">
        <div class="formfield"><label class="field-label">Project number</label><input type="text" id="finJobNo" value="${escapeHtml(site.job_number||'')}"></div>
        <div class="formfield"><label class="field-label">Contract value (£, excl. VAT)</label><input type="text" inputmode="decimal" id="finContract" placeholder="0.00" value="${jf.contract_value!=null?escapeHtml(String(jf.contract_value)):''}" ${items.length?'disabled title="Set by the contract breakdown"':''}></div>
        <div class="formfield"><label class="field-label">Retention %</label><input type="number" id="finRet" min="0" max="100" step="0.5" value="${escapeHtml(String(pick('retention_pct', st.default_retention_pct)))}"></div>
        <div class="formfield"><label class="field-label">Retention limit % (if any)</label><input type="number" id="finRetLimit" min="0" max="100" step="0.5" placeholder="None" value="${jf.retention_limit_pct!=null?escapeHtml(String(jf.retention_limit_pct)):''}"></div>
        <div class="formfield"><label class="field-label">Days to due date</label><input type="number" id="finDue" min="0" step="1" value="${escapeHtml(String(pick('due_days', st.default_due_days)))}"></div>
        <div class="formfield"><label class="field-label">Days to final date for payment</label><input type="number" id="finFinal" min="0" step="1" value="${escapeHtml(String(pick('final_days', st.default_final_days)))}"></div>
        <div class="formfield"><label class="field-label">Application date (day of month)</label><input type="number" id="finAppDay" min="1" max="31" step="1" placeholder="e.g. 25" value="${escapeHtml(String(pick('app_reminder_day', st.app_reminder_day)||''))}"></div>
        <div class="formfield"><label class="field-label">VAT</label><select id="finVat">${Object.keys(FIN_VAT_LABEL).map(k=>`<option value="${k}" ${vat===k?'selected':''}>${FIN_VAT_LABEL[k]}</option>`).join('')}</select></div>
      </div>
      <p class="stub" style="margin:0;font-style:normal;">${items.length ? 'The contract value comes from the contract breakdown.' : 'Upload the contract breakdown (below) and the contract value fills in from it.'}</p>
    </div>

    <div class="card">
      <p class="sectiontitle" style="margin-top:0;">Billing</p>
      <p class="stub" style="margin:0 0 10px;font-style:normal;">Who invoices and applications go to. Filled from the project’s client details to start with. ${typeof finXeroConnected==='function' && finXeroConnected() ? 'Find the client in Xero to pull their details; anything Xero is missing is added when an invoice is sent.' : 'Once Xero is connected (Finance › Settings) you can pull these from Xero.'}</p>
      ${typeof finXeroBillingHtml==='function' ? finXeroBillingHtml() : ''}
      <div class="formfield"><label class="field-label">Bill to (company name)</label><input type="text" id="finBillName" value="${escapeHtml(pick('billing_name', site.client_name||''))}"></div>
      <div class="formfield"><label class="field-label">Billing address</label><textarea id="finBillAddr" rows="3">${escapeHtml(jf.billing_address||'')}</textarea></div>
      <div class="formfield"><label class="field-label">Accounts email</label><input type="email" id="finBillEmail" value="${escapeHtml(pick('billing_email', site.client_email||''))}"></div>
      <div class="formfield"><label class="field-label">Notes</label><textarea id="finNotes" rows="2" placeholder="Anything about payment on this project">${escapeHtml(jf.notes||'')}</textarea></div>
    </div>
    <button class="darkbtn" style="width:100%;" id="finJobSave" onclick="saveSiteFinance('${siteId}')">${saved?'Save changes':'Save project details'}</button>


  `, {title:'Finance', subtitle:site.name, back:typeof isFinanceOnly==='function' && isFinanceOnly() ? '#/finance' : `#/site/${siteId}/home`, siteId, tabs:false});
  if(typeof finAfterProjectRender==='function') finAfterProjectRender();
  // Forecast and subcontractor cards fill in once the job's full book has loaded (911/912).
  if(typeof finLoadBook==='function') finLoadBook(siteId).then(b=>{
    if(__gen !== RENDER_GEN) return;
    const fc = finJobForecast(b, siteId);
    const fs = document.getElementById('finFcSlot'); if(fs) fs.innerHTML = finForecastCardHtml(siteId, fc);
    const js = document.getElementById('finJcSlot'); if(js) js.innerHTML = finJobCostCardFromForecast(siteId, fc);
    const ss = document.getElementById('finScSlot'); if(ss && typeof finSubcontractsCardHtml==='function') ss.innerHTML = finSubcontractsCardHtml(siteId, b);
  }).catch(e=>console.error(e));
}
window.saveSiteFinance = async function(siteId){
  const site = SITES.find(s=>s.id===siteId);
  const contract = finNum(finVal('finContract'));
  const ret = finNum(finVal('finRet')), retLim = finNum(finVal('finRetLimit'));
  const due = finInt(finVal('finDue')), fin = finInt(finVal('finFinal')), appDay = finInt(finVal('finAppDay'));
  const email = finVal('finBillEmail');
  if(contract!==null && (isNaN(contract) || contract < 0)){ toast('Enter the contract value as a number.'); return; }
  if(ret!==null && (isNaN(ret) || ret < 0 || ret > 100)){ toast('Retention must be between 0 and 100%.'); return; }
  if(retLim!==null && (isNaN(retLim) || retLim < 0 || retLim > 100)){ toast('Retention limit must be between 0 and 100%.'); return; }
  if(appDay!==null && (isNaN(appDay) || appDay < 1 || appDay > 31)){ toast('Application date must be a day of the month, 1 to 31.'); return; }
  if(email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ toast('Enter a valid accounts email.'); return; }
  const btn = document.getElementById('finJobSave'); if(btn){ btn.disabled = true; btn.textContent = 'Saving…'; }
  const done = ()=>{ if(btn){ btn.disabled = false; btn.textContent = 'Save changes'; } };
  const jobPatch = typeof finJobEditPatch==='function' && site ? finJobEditPatch(site) : null;
  if(jobPatch && jobPatch.error){ toast(jobPatch.error); done(); return; }
  if(jobPatch){ const row = await dbUpdate('sites', siteId, jobPatch); if(!row){ done(); return; } Object.assign(site, row); }
  // Job number lives on the job itself (everyone sees it).
  const jobNo = finVal('finJobNo');
  if(site && jobNo !== String(site.job_number||'')){
    if(!jobNo){ toast('A project needs a project number.'); done(); return; }
    const row = await dbUpdate('sites', siteId, {job_number:jobNo});
    if(!row){ done(); return; }
    Object.assign(site, row);
  }
  const res = await sbFetch('/rest/v1/job_finance', {method:'POST', headers:{'Prefer':'resolution=merge-duplicates,return=representation'}, body:JSON.stringify({
    site_id:siteId, org_id:ME.org_id, contract_value:contract, retention_pct:ret, retention_limit_pct:retLim,
    due_days:(due===null||isNaN(due))?null:due, final_days:(fin===null||isNaN(fin))?null:fin, app_reminder_day:appDay,
    vat_treatment:finVal('finVat')||null, billing_name:finVal('finBillName')||null, billing_address:finVal('finBillAddr')||null,
    billing_email:email||null, notes:finVal('finNotes')||null, updated_at:new Date().toISOString(), updated_by:ME.id,
  })});
  done();
  if(!res.ok){ toast('Save failed — '+(await safeErr(res))); return; }
  toast('Project details saved');
  render();
};

/* ---------- Client PO add / edit ---------- */
let finPoFile = null;
window.openClientPoForm = async function(siteId, poId){
  const po = poId ? ((await dbSelect('client_pos', 'id=eq.'+poId))[0] || null) : null;
  const existing = await dbSelect('client_pos', 'site_id=eq.'+siteId+'&select=id');
  finPoFile = null;
  let ov = document.getElementById('finPoOverlay');
  if(!ov){ ov = document.createElement('div'); ov.id = 'finPoOverlay'; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
  ov.onclick = e=>{ if(e.target===ov) closeClientPoForm(); };
  const primary = po ? po.is_primary : !existing.length;
  ov.innerHTML = `<div class="geo-modal-card">
      <h3>${po ? 'Edit client PO' : 'Add client PO'}</h3>
      <div class="formfield"><label class="field-label">PO number</label><input type="text" id="finPoNo" value="${escapeHtml(po?po.po_number:'')}" placeholder="As shown on the client’s order"></div>
      <div class="fingrid2">
        <div class="formfield"><label class="field-label">Value (£, excl. VAT)</label><input type="text" inputmode="decimal" id="finPoVal" value="${po&&po.value!=null?escapeHtml(String(po.value)):''}" placeholder="Optional"></div>
        <div class="formfield"><label class="field-label">Date</label><input type="date" id="finPoDate" value="${po&&po.po_date?po.po_date:''}"></div>
      </div>
      <div class="formfield"><label class="field-label">What it covers</label><input type="text" id="finPoDesc" value="${escapeHtml(po&&po.description||'')}" placeholder="e.g. Main contract, Variation 2"></div>
      <label class="finswitch"><input type="checkbox" id="finPoPrimary" ${primary?'checked':''}> Main PO (shown on invoices, applications and certificates)</label>
      <div class="formfield"><label class="field-label">Copy of the PO (optional)</label>
        <input type="file" id="finPoFileInput" accept="application/pdf,image/*" onchange="finPoFile=this.files[0]||null">
        ${po&&po.file_name ? `<p class="stub" style="margin:4px 0 0;font-style:normal;">Saved: ${escapeHtml(po.file_name)}</p>` : ''}
      </div>
      <button class="darkbtn" id="finPoSave" style="width:100%;" onclick="saveClientPo('${siteId}','${po?po.id:''}')">Save PO</button>
      ${po ? `<button class="ghostbtn" style="width:100%;margin-top:8px;color:var(--red);" onclick="deleteClientPo('${siteId}','${po.id}')">Remove this PO</button>` : ''}
      <button class="geo-modal-cancel" onclick="closeClientPoForm()">Cancel</button>
    </div>`;
  ov.style.display = 'flex';
  setTimeout(()=>{ const i = document.getElementById('finPoNo'); if(i && !po) i.focus(); }, 50);
};
window.closeClientPoForm = function(){ const ov = document.getElementById('finPoOverlay'); if(ov) ov.style.display = 'none'; finPoFile = null; };
window.saveClientPo = async function(siteId, poId){
  const no = finVal('finPoNo');
  const val = finNum(finVal('finPoVal'));
  if(!no){ toast('Enter the PO number.'); return; }
  if(val!==null && (isNaN(val) || val < 0)){ toast('Enter the PO value as a number.'); return; }
  const primary = document.getElementById('finPoPrimary').checked;
  const btn = document.getElementById('finPoSave'); if(btn){ btn.disabled = true; btn.textContent = 'Saving…'; }
  const row = {po_number:no, value:val, po_date:finVal('finPoDate')||null, description:finVal('finPoDesc')||null, is_primary:primary};
  if(finPoFile){
    if(finPoFile.size > 20*1024*1024){ toast('That file is over 20 MB.'); if(btn){ btn.disabled=false; btn.textContent='Save PO'; } return; }
    const safe = finPoFile.name.replace(/[^a-z0-9.\-]+/gi,'_').slice(-80);
    const path = ME.org_id+'/'+siteId+'/client-po/'+uid()+'-'+safe;
    const stored = await uploadToStorage('finance-docs', path, finPoFile, finPoFile.type||'application/octet-stream');
    if(!stored){ if(btn){ btn.disabled=false; btn.textContent='Save PO'; } return; }
    row.file_path = stored; row.file_name = finPoFile.name;
  }
  let saved;
  if(poId) saved = await dbUpdate('client_pos', poId, row);
  else { const r = await dbInsert('client_pos', Object.assign({org_id:ME.org_id, site_id:siteId, created_by:ME.id}, row)); saved = r && r[0]; }
  if(!saved){ if(btn){ btn.disabled=false; btn.textContent='Save PO'; } return; }
  // Only one main PO per job.
  if(primary){
    const others = await dbSelect('client_pos', 'site_id=eq.'+siteId+'&is_primary=eq.true&id=neq.'+saved.id+'&select=id');
    for(const o of others) await dbUpdate('client_pos', o.id, {is_primary:false});
  }
  closeClientPoForm();
  toast('PO saved');
  render();
};
window.deleteClientPo = async function(siteId, poId){
  const btn = event && event.target;
  if(btn && btn.dataset.sure !== '1'){ btn.dataset.sure = '1'; btn.textContent = 'Tap again to remove'; return; }
  const ok = await dbDelete('client_pos', poId);
  if(!ok) return;
  closeClientPoForm();
  toast('PO removed');
  render();
};
window.openClientPoFile = async function(poId){
  const po = (await dbSelect('client_pos', 'id=eq.'+poId+'&select=file_path,file_name'))[0];
  if(!po || !po.file_path) return;
  const url = await resolveStorageUrl(publicUrl('finance-docs', po.file_path));
  if(/\.pdf$/i.test(po.file_name||po.file_path) && typeof viewPdfInApp==='function') return viewPdfInApp(url, po.file_name||'Client PO');
  if(/\.(jpe?g|png|gif|webp|heic)$/i.test(po.file_name||po.file_path) && typeof viewImage==='function') return viewImage(url);
  window.open(url, '_blank');
};

/* ---------- Admin Centre › Users: the per-person switch ---------- */
window.toggleFinanceAccess = async function(userId){
  if(!isFinanceUser()) return;
  const p = PROFILES[userId]; if(!p) return;
  if(userId===ME.id){ toast('You can’t switch Finance off for yourself here.'); return; }
  const next = !p.finance_enabled;
  const row = await dbUpdate('profiles', userId, {finance_enabled: next});
  if(!row) return;
  if(row.finance_enabled !== next){ toast('Only an admin with Finance switched on can change this.'); return; }
  p.finance_enabled = row.finance_enabled;
  toast(next ? 'OpHUB Finance switched on for '+p.name : 'OpHUB Finance switched off for '+p.name);
  render();
};
