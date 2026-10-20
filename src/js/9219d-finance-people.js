/* ============================================================
   OpHUB Finance — People & rates (Subcontractors & labour).
   One row per person (operatives who invoice you, subcontractors and PAYE
   staff); "Edit" opens one form with everything: pay type, day rate, CIS,
   UTR, VAT and bank details. Bank details only show the last 4 digits in
   the list. App users (operatives with a login) are listed too.
   ============================================================ */
let finPplF = 'active';
async function renderFinLabourRates(){
  if(!finGuard()) return;
  const __gen = RENDER_GEN;
  await loadAllProfiles();
  const rates = await finLoadRates();
  if(!FIN_SETTINGS) await finLoadSettings();
  if(__gen !== RENDER_GEN) return;
  const users = Object.values(PROFILES).filter(p=>['operative','site_manager'].includes(p.role) && p.org_id===ME.org_id);
  const rows = Object.values(FIN_WORKERS).map(w=>({key:'w:'+w.id, name:w.trading_name||w.name||'Worker', r:w, app:false}))
    .concat(users.map(u=>({key:u.id, name:(rates[u.id]||{}).trading_name || u.name, r:rates[u.id]||{}, app:true})))
    .sort((a,b)=>String(a.name).localeCompare(String(b.name)));
  const F = {active:x=>x.r.active!==false, subs:x=>x.r.active!==false && x.r.pay_type!=='paye', paye:x=>x.r.active!==false && x.r.pay_type==='paye', left:x=>x.r.active===false, all:()=>true};
  if(!F[finPplF]) finPplF = 'active';
  const list = rows.filter(F[finPplF]);
  const bank = r=>finBankOk(r) ? `${escapeHtml(finSortCode(r.bank_sort_code))} · ••${escapeHtml(String(r.bank_account_no).replace(/\D/g,'').slice(-4))}` : (r.pay_type==='paye' ? '<span class="stub" style="margin:0;">Payroll</span>' : '<span class="finpill warn">Missing</span>');
  document.getElementById('app').innerHTML = shell(`
    ${finSectionNav('subs')}${finSubTabs('subs','rates')}
    ${finSecHead('People & rates', '+ Add a person', "openFinPerson('')")}
    <p class="stub" style="margin:-4px 0 10px;">Everyone you pay: operatives and subcontractors who invoice you (CIS), and PAYE staff (their day rate prices their days on site).${typeof finXeroConnected==='function' && finXeroConnected() ? ` <button class="linkbtn" onclick="openFinXeroWorkers()">Bring people in from Xero</button>` : ''}</p>
    <div class="pmchips">${[['active','Current'],['subs','Invoice us (CIS)'],['paye','PAYE staff'],['left','No longer working for us'],['all','All']].map(([k,l])=>finChip(finPplF===k, l, rows.filter(F[k]).length, `finPplF='${k}';render()`)).join('')}</div>
    ${finSearchHtml('Search name', 'finPplList')}
    <div id="finPplList">${list.length ? `<div class="finreptbl-wrap"><table class="fincosttbl fininvtbl">
      <thead><tr><th>Name</th><th>Pay</th><th class="num">Day rate</th><th>CIS</th><th>UTR</th><th>Bank</th><th></th></tr></thead>
      <tbody>${list.map(x=>`<tr class="click" data-lf="${lfText(x.name+' '+(x.r.name||''))}" onclick="openFinPerson('${jsAttr(x.key)}')">
        <td data-l="Name" class="d"><b>${escapeHtml(x.name)}</b>${x.app?'<div class="fininv-addr">Has the app</div>':''}${(x.r.xero_contact_id||x.r.xero_employee_id)?' <span class="finxw-tag">From Xero</span>':''}</td>
        <td data-l="Pay">${x.r.pay_type==='paye'?'PAYE':'Invoices us'}</td>
        <td data-l="Day rate" class="num">${x.r.day_rate!=null?finMoney(x.r.day_rate):'—'}</td>
        <td data-l="CIS">${x.r.pay_type==='paye'?'—':(FIN_CIS_LABEL[x.r.cis_rate!=null?x.r.cis_rate:20]||'')}</td>
        <td data-l="UTR">${x.r.pay_type==='paye'?'—':(x.r.utr?escapeHtml(x.r.utr):'<span class="finpill warn">Missing</span>')}</td>
        <td data-l="Bank">${bank(x.r)}</td>
        <td data-l=""><button class="ghostbtn finsmall" onclick="event.stopPropagation();openFinPerson('${jsAttr(x.key)}')">Edit</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No one here yet.</div>'}</div>
  `, {title:'People & rates', subtitle:'Subcontractors & labour', back:finSecBack(), tabs:false});
}
window.openFinPerson = async function(key){
  const rates = await finLoadRates(); await loadAllProfiles();
  const isNew = !key, isApp = key && !key.startsWith('w:');
  const r = key ? (rates[key] || {}) : {pay_type:'subcontractor', cis_rate:20};
  const name = isApp ? (PROFILES[key]||{}).name : (r.name||'');
  let ov = document.getElementById('finPplOverlay');
  if(!ov){ ov = document.createElement('div'); ov.id = 'finPplOverlay'; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
  ov.onclick = e=>{ if(e.target===ov) ov.style.display='none'; };
  const v = x=>escapeHtml(x==null?'':String(x));
  ov.innerHTML = `<div class="geo-modal-card" style="max-width:620px;">
    <h3>${isNew ? 'Add a person' : escapeHtml(name||'Person')}</h3>
    ${isApp ? `<p class="stub" style="margin:0 0 10px;font-style:normal;">Has the app (${escapeHtml((PROFILES[key]||{}).email||'')}). Their name comes from their app account.</p>` : ''}
    <div class="fingrid2">
      ${isApp ? '' : `<div class="formfield"><label class="field-label">Name *</label><input type="text" id="fpName" value="${v(r.name)}" placeholder="e.g. Sam Slater"></div>`}
      <div class="formfield"><label class="field-label">Trading / company name</label><input type="text" id="fpTrading" value="${v(r.trading_name)}" placeholder="If they invoice as a company"></div>
      <div class="formfield"><label class="field-label">How they’re paid</label><select id="fpPay" onchange="document.getElementById('fpCisWrap').hidden=this.value==='paye'"><option value="subcontractor" ${r.pay_type!=='paye'?'selected':''}>They invoice us (CIS)</option><option value="paye" ${r.pay_type==='paye'?'selected':''}>PAYE (on our payroll)</option></select></div>
      <div class="formfield"><label class="field-label">Day rate £</label><input type="text" inputmode="decimal" data-money id="fpRate" value="${r.day_rate!=null?r.day_rate:''}"></div>
      ${isApp ? '' : `<div class="formfield"><label class="field-label">Email (for CIS statements)</label><input type="email" id="fpEmail" value="${v(r.email)}"></div>`}
    </div>
    <div id="fpCisWrap" ${r.pay_type==='paye'?'hidden':''}>
      <div class="fingrid2">
        <div class="formfield"><label class="field-label">CIS deduction ${finHelp('cis')}</label><select id="fpCis">${Object.keys(FIN_CIS_LABEL).map(k=>`<option value="${k}" ${Number(r.cis_rate!=null?r.cis_rate:20)===Number(k)?'selected':''}>${FIN_CIS_LABEL[k]}</option>`).join('')}</select></div>
        <div class="formfield"><label class="field-label">UTR ${finHelp('utr')}</label><input type="text" inputmode="numeric" id="fpUtr" value="${v(r.utr)}" placeholder="10 digits"></div>
        <div class="formfield"><label class="field-label">VAT registered</label><select id="fpVat"><option value="false">No</option><option value="true" ${r.vat_registered?'selected':''}>Yes (reverse charge)</option></select></div>
      </div>
      <p class="sectiontitle" style="margin:8px 0 6px;">Bank details (for the pay run)</p>
      <div class="fingrid3">
        <div class="formfield"><label class="field-label">Account name</label><input type="text" id="fpBankName" value="${v(r.bank_account_name)}" autocomplete="off"></div>
        <div class="formfield"><label class="field-label">Sort code</label><input type="text" inputmode="numeric" id="fpSort" value="${r.bank_sort_code?v(finSortCode(r.bank_sort_code)):''}" placeholder="00-00-00" autocomplete="off"></div>
        <div class="formfield"><label class="field-label">Account number</label><input type="text" inputmode="numeric" id="fpAcc" value="${v(r.bank_account_no)}" placeholder="8 digits" autocomplete="off"></div>
      </div>
    </div>
    <button class="darkbtn" style="width:100%;margin-top:8px;" onclick="saveFinPerson('${jsAttr(key||'')}')">${isNew?'Add person':'Save'}</button>
    ${!isNew && !isApp ? `<button class="linkbtn" style="margin-top:12px;color:var(--slate);" onclick="finPersonActive('${jsAttr(key)}', ${r.active===false})">${r.active===false?'Working for us again':'No longer working for us'}</button>` : ''}
    <button class="geo-modal-cancel" onclick="document.getElementById('finPplOverlay').style.display='none'">Cancel</button>
  </div>`;
  ov.style.display = 'flex';
  setTimeout(()=>{ const el = document.getElementById(isApp ? 'fpTrading' : 'fpName'); if(el && isNew) el.focus(); }, 50);
};
window.saveFinPerson = async function(key){
  const isNew = !key, isApp = key && !key.startsWith('w:');
  const rate = finNum(finVal('fpRate'));
  if(rate!==null && isNaN(rate)){ toast('Day rate must be a number.'); return; }
  const pay = finVal('fpPay') || 'subcontractor';
  const sc = finVal('fpSort').replace(/\D/g,''), an = finVal('fpAcc').replace(/\D/g,''), utr = finVal('fpUtr').replace(/\s/g,'');
  if(sc && sc.length!==6){ toast('Sort code should be 6 numbers.'); return; }
  if(an && an.length!==8){ toast('Account number should be 8 numbers.'); return; }
  if(utr && !/^\d{10}$/.test(utr)){ toast('A UTR is 10 numbers.'); return; }
  const row = {pay_type:pay, day_rate:rate, trading_name:finVal('fpTrading')||null, updated_at:new Date().toISOString()};
  if(pay!=='paye') Object.assign(row, {cis_rate:Number(finVal('fpCis')||20), utr:utr||null, vat_registered:finVal('fpVat')==='true', bank_account_name:finVal('fpBankName')||null, bank_sort_code:sc||null, bank_account_no:an||null});
  if(!isApp){
    const nm = finVal('fpName'); if(!nm){ toast('Enter their name.'); return; }
    const em = finVal('fpEmail'); if(em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)){ toast('Check the email address.'); return; }
    Object.assign(row, {name:nm, email:em||null});
  }
  let ok;
  if(isNew) ok = await dbInsert('fin_labour_rates', Object.assign({org_id:ME.org_id, user_id:null, active:true}, row));
  else if(isApp){ const res = await sbFetch('/rest/v1/fin_labour_rates?on_conflict=org_id,user_id', {method:'POST', headers:{'Prefer':'resolution=merge-duplicates'}, body:JSON.stringify(Object.assign({org_id:ME.org_id, user_id:key}, row))}); ok = res.ok; if(!ok) toast('Save failed — '+(await safeErr(res))); }
  else ok = await dbUpdate('fin_labour_rates', key.slice(2), row);
  if(!ok) return;
  document.getElementById('finPplOverlay').style.display = 'none';
  toast(isNew ? 'Added' : 'Saved'); render();
};
window.finPersonActive = async function(key, on){
  if(await dbUpdate('fin_labour_rates', key.slice(2), {active:!!on})){ document.getElementById('finPplOverlay').style.display = 'none'; toast(on ? 'Back on the list' : 'Moved to “No longer working for us”'); render(); }
};

/* ---------- plain-English help for trade / accounts words ---------- */
const FIN_HELP = {
  cis:'Construction Industry Scheme: you take tax off a subcontractor’s labour (20% if registered, 30% if not verified, 0% if they have gross status) and pay it to HMRC each month.',
  utr:'Unique Taxpayer Reference: the 10-digit tax number HMRC gives every self-employed person or company. Needed for the monthly CIS return.',
  retention:'Money the client holds back (often 3–5%) until the work is signed off. Half usually comes back at practical completion, half at the end of the defects period.',
  certified:'The amount the client (or their QS) agrees you’re owed — the payment certificate. It can be less than you applied for.',
  payless:'A notice saying you (or the client) will pay less than the amount applied for, and why. It must be sent before the final date for payment.',
  contra:'Charges taken off a subcontractor’s payment, e.g. for damage, clearing up or materials you supplied.',
  committed:'Ordered on a purchase order but not invoiced by the supplier yet.',
  reverse:'Domestic reverse charge (construction): on CIS work between VAT-registered businesses the customer pays the VAT straight to HMRC, so it isn’t added to the invoice total.',
  valuation:'The value of the work done so far, used for the application.',
  finaldate:'The last day a payment can be made under the contract. A pay-less notice must be sent before it.',
};
function finHelp(k){ const t = FIN_HELP[k]; if(!t) return ''; return `<button type="button" class="finhelp" title="${escapeHtml(t)}" onclick="event.preventDefault();event.stopPropagation();customAlert(this.title)">?</button>`; }

/* ---------- phones: scroll the chosen Finance tab into view ---------- */
(function(){
  if(typeof MutationObserver==='undefined') return;
  let t = null;
  const run = ()=>{ document.querySelectorAll('.finsecnav, .finsubtabs').forEach(nav=>{ if(nav.scrollWidth <= nav.clientWidth + 2) { nav.classList.remove('finscroll'); return; } nav.classList.add('finscroll'); const on = nav.querySelector('button.on'); if(on){ const x = on.offsetLeft - (nav.clientWidth - on.offsetWidth)/2; nav.scrollLeft = Math.max(0, x); } }); };
  const start = ()=>{ const app = document.getElementById('app'); if(!app) return setTimeout(start, 500); new MutationObserver(()=>{ clearTimeout(t); t = setTimeout(run, 30); }).observe(app, {childList:true}); };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
