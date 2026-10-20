/* ============================================================
   OpHUB Finance — subcontractor orders and applications
   A subcontract order per job (SC-001…) with value, retention % and CIS
   rate. The subcontractor applies (cumulative gross to date); you certify
   (cumulative), with retention held and contra charges to date:
     net due this time = certified gross − retention − contra to date − paid before
     CIS on the labour part (this payment less new materials)
   Payment / pay-less notice PDF; "Mark paid" records a CIS payment so it
   shows in the CIS summary, statements and Xero.
   Route: #/site/<id>/finance/sub/<subcontract id>
   ============================================================ */
const FIN_SA_STATUS = {received:'Received', certified:'Certified', paid:'Paid'};

function finSubcontractsCardHtml(siteId, b){
  const scs = finBy(b.scs, siteId);
  const appsOf = id=>(b.sapps||[]).filter(a=>a.subcontract_id===id).sort((x,y)=>x.number-y.number);
  return `<div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
      <p class="sectiontitle" style="margin:0;">Subcontractors</p>
      <button class="ghostbtn" style="padding:6px 12px;width:auto;flex:none;" onclick="openFinSubcontract('${siteId}')">+ Subcontract order</button>
    </div>
    ${scs.length ? scs.map(sc=>{ const apps = appsOf(sc.id); const lastC = apps.filter(a=>a.certified_gross!=null).pop(); const waiting = apps.filter(a=>a.status==='received').length; return `<button type="button" class="pmrow finrow fininvrow" onclick="go('#/site/${siteId}/finance/sub/${sc.id}')">
      <span class="pmrow-txt"><span class="pmrow-t">${escapeHtml(sc.number)} · ${escapeHtml(sc.name)} ${waiting?`<span class="finpill warn">${waiting} to certify</span>`:''}</span>
        <span class="pmrow-s">${escapeHtml(sc.description||'')}${sc.description?' · ':''}certified ${finMoney(lastC?lastC.certified_gross:0, 0)}${sc.order_value!=null?' of '+finMoney(sc.order_value, 0):''}</span></span>
      <span class="finval">${sc.order_value!=null?finMoney(sc.order_value, 0):''}</span></button>`; }).join('')
      : `<p class="stub" style="margin:8px 0 0;">No subcontract orders on this project. Add one for each subcontractor who applies to you for payment (e.g. leadwork, scaffolding).</p>`}
  </div>`;
}

window.openFinSubcontract = async function(siteId, id){
  const sc = id ? (await dbSelect('fin_subcontracts', 'id=eq.'+id))[0] : null;
  const rates = await finLoadRates();
  const workers = Object.values(FIN_WORKERS).filter(w=>w.active!==false);
  let ov = document.getElementById('finScOverlay');
  if(!ov){ ov = document.createElement('div'); ov.id = 'finScOverlay'; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
  ov.onclick = e=>{ if(e.target===ov) ov.style.display='none'; };
  const v = k=>sc && sc[k]!=null ? escapeHtml(String(sc[k])) : '';
  window.__finScWorkers = FIN_WORKERS;
  await finSubJobsLoad(siteId);
  ov.innerHTML = `<div class="geo-modal-card" style="max-width:540px;">
    <h3>${sc ? escapeHtml(sc.number)+' · subcontract order' : 'New subcontract order'}</h3>
    ${!sc && workers.length ? `<div class="formfield"><label class="field-label">From your workers list (optional)</label><select onchange="finScPickWorker(this.value)"><option value="">—</option>${workers.map(w=>`<option value="${w.id}">${escapeHtml(w.name||w.trading_name||'')}</option>`).join('')}</select></div>` : ''}
    <div class="fingrid2">
      <div class="formfield"><label class="field-label">Subcontractor</label><input type="text" id="finScName" value="${v('name')}" placeholder="Company or person"></div>
      <div class="formfield"><label class="field-label">Email</label><input type="email" id="finScEmail" value="${v('email')}"></div>
    </div>
    <div class="formfield"><label class="field-label">Work</label><input type="text" id="finScDesc" value="${v('description')}" placeholder="e.g. Leadwork to all valleys and abutments"></div>
    <div class="fingrid2">
      <div class="formfield"><label class="field-label">Order value £ (excl. VAT)</label><input type="text" inputmode="decimal" data-money id="finScVal" value="${v('order_value')}"></div>
      <div class="formfield"><label class="field-label">Retention %</label><input type="text" inputmode="decimal" id="finScRet" value="${sc?sc.retention_pct:5}"></div>
      <div class="formfield"><label class="field-label">CIS</label><select id="finScCis">${Object.keys(FIN_CIS_LABEL).map(k=>`<option value="${k}" ${Number(sc?sc.cis_rate:20)===Number(k)?'selected':''}>${FIN_CIS_LABEL[k]}</option>`).join('')}</select></div>
      <div class="formfield"><label class="field-label">UTR</label><input type="text" id="finScUtr" value="${v('utr')}"></div>
      <div class="formfield"><label class="field-label">VAT registered</label><select id="finScVat"><option value="false">No</option><option value="true" ${sc&&sc.vat_registered?'selected':''}>Yes (reverse charge)</option></select></div>
      ${sc ? `<div class="formfield"><label class="field-label">Status</label><select id="finScStatus"><option value="active" ${sc.status!=='complete'?'selected':''}>Active</option><option value="complete" ${sc.status==='complete'?'selected':''}>Complete</option></select></div>` : ''}
    </div>
    ${finSubJobSelectHtml('finScSub', siteId, sc ? sc.sub_job_id||'' : '')}
    <input type="hidden" id="finScWorker" value="${v('worker_id')}">
    <button class="darkbtn" style="width:100%;" onclick="saveFinSubcontract('${siteId}','${sc?sc.id:''}')">Save</button>
    <button class="geo-modal-cancel" onclick="document.getElementById('finScOverlay').style.display='none'">Cancel</button>
  </div>`;
  ov.style.display = 'flex';
};
window.finScPickWorker = function(id){
  const w = (window.__finScWorkers||{})[id]; if(!w) return;
  const set = (k, val)=>{ const el = document.getElementById(k); if(el && val!=null) el.value = val; };
  set('finScName', w.trading_name || w.name); set('finScEmail', w.email); set('finScUtr', w.utr); set('finScCis', String(w.cis_rate!=null?w.cis_rate:20)); set('finScVat', w.vat_registered?'true':'false'); set('finScWorker', w.id);
};
window.saveFinSubcontract = async function(siteId, id){
  const name = finVal('finScName'); if(!name){ toast('Enter the subcontractor’s name.'); return; }
  const val = finNum(finVal('finScVal')), ret = finNum(finVal('finScRet'));
  if(ret===null || isNaN(ret) || ret<0 || ret>20){ toast('Retention should be between 0 and 20%.'); return; }
  const row = {name, email:finVal('finScEmail')||null, description:finVal('finScDesc')||null, order_value:(val===null||isNaN(val))?null:finRound(val), retention_pct:ret, cis_rate:Number(finVal('finScCis')||20), utr:finVal('finScUtr')||null, vat_registered:finVal('finScVat')==='true', worker_id:finVal('finScWorker')||null};
  if(id){ const st = finVal('finScStatus'); if(st) row.status = st; }
  if(document.getElementById('finScSub')) row.sub_job_id = finVal('finScSub')||null;
  let r;
  if(id) r = await dbUpdate('fin_subcontracts', id, row);
  else {
    const ex = await dbSelect('fin_subcontracts', 'site_id=eq.'+siteId+'&select=seq&order=seq.desc&limit=1');
    const seq = (ex[0] ? ex[0].seq : 0) + 1;
    r = await dbInsert('fin_subcontracts', Object.assign({org_id:ME.org_id, site_id:siteId, seq, number:'SC-'+String(seq).padStart(3,'0'), created_by:ME.id}, row));
  }
  if(!r) return;
  document.getElementById('finScOverlay').style.display = 'none';
  toast('Subcontract order saved');
  if(!id && r[0]) go('#/site/'+siteId+'/finance/sub/'+r[0].id); else render();
};

/* ---------- the subcontract page ---------- */
async function renderFinSubcontract(siteId, scId){
  if(!finGuard()) return;
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  const [scs, apps] = await Promise.all([dbSelect('fin_subcontracts', 'id=eq.'+scId), dbSelect('fin_sub_apps', 'subcontract_id=eq.'+scId+'&order=number.asc')]);
  if(__gen !== RENDER_GEN) return;
  const sc = scs[0]; if(!sc || !site){ go(`#/site/${siteId}/finance`); return; }
  const lastC = apps.filter(a=>a.certified_gross!=null).pop();
  const certG = lastC ? Number(lastC.certified_gross) : 0, retH = lastC ? Number(lastC.retention) : 0, contra = lastC ? Number(lastC.contra) : 0;
  const paid = finRound(apps.filter(a=>a.status==='paid').reduce((t,a)=>t+Number(a.net_due||0),0));
  document.getElementById('app').innerHTML = shell(`
    <div class="card finhead">
      <div><div class="finhead-l">Order</div><div class="finhead-v">${escapeHtml(sc.number)}${sc.status==='complete'?' <span class="finpill grey">Complete</span>':''}</div></div>
      <div><div class="finhead-l">Order value</div><div class="finhead-v">${sc.order_value!=null?finMoney(sc.order_value):'—'}</div></div>
      <div><div class="finhead-l">Certified to date</div><div class="finhead-v">${finMoney(certG)}</div></div>
      <div><div class="finhead-l">Retention held</div><div class="finhead-v">${finMoney(retH)}</div></div>
    </div>
    <div class="card">
      <div class="finkv"><span>Work</span><b style="white-space:normal;">${escapeHtml(sc.description||'—')}</b></div>
      <div class="finkv"><span>Retention · CIS</span><b>${sc.retention_pct}% · ${FIN_CIS_LABEL[sc.cis_rate]||sc.cis_rate+'%'}</b></div>
      <div class="finkv"><span>UTR</span><b>${escapeHtml(sc.utr||'—')}</b></div>
      <div class="finkv"><span>Contra charges to date</span><b>${finMoney(contra)}</b></div>
      <div class="finkv"><span>Paid to date (before CIS)</span><b>${finMoney(paid)}</b></div>
      <button class="ghostbtn" style="width:100%;margin-top:10px;" onclick="openFinSubcontract('${siteId}','${sc.id}')">Edit order</button>
    </div>
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <p class="sectiontitle" style="margin:0;">Applications</p>
        ${sc.status!=='complete' ? `<button class="darkbtn" style="padding:6px 12px;width:auto;flex:none;" onclick="openFinSubApp('${siteId}','${sc.id}')">+ Record application</button>` : ''}
      </div>
      ${apps.length ? `<table class="fincosttbl" style="margin-top:10px;">
        <thead><tr><th>No.</th><th>Date</th><th class="num">Applied</th><th class="num">Certified</th><th class="num">Net due</th><th class="num">Pay (after CIS)</th><th>Status</th></tr></thead>
        <tbody>${apps.slice().reverse().map(a=>`<tr class="click" onclick="openFinSubApp('${siteId}','${sc.id}','${a.id}')">
          <td data-l="No." class="d">Application ${a.number}</td><td data-l="Date">${finDate(a.app_date)}</td>
          <td data-l="Applied" class="num">${finMoney(a.applied_gross)}</td>
          <td data-l="Certified" class="num">${a.certified_gross!=null?finMoney(a.certified_gross):'—'}</td>
          <td data-l="Net due" class="num">${a.certified_gross!=null?finMoney(a.net_due):'—'}</td>
          <td data-l="Pay" class="num">${a.certified_gross!=null?finMoney(a.pay_amount):'—'}</td>
          <td data-l="Status"><span class="finpill ${a.status==='paid'?'ok':a.status==='certified'?'blue':'warn'}">${FIN_SA_STATUS[a.status]||a.status}</span>${a.payless?' <span class="finpill bad">Pay less</span>':''}</td>
        </tr>`).join('')}</tbody></table>` : `<p class="stub" style="margin:8px 0 0;">No applications yet. When ${escapeHtml(sc.name)} sends one, record the amount they’re applying for to date.</p>`}
    </div>
  `, {title:sc.name, subtitle:sc.number+' · '+site.name, back:`#/site/${siteId}/finance`, siteId, tabs:false});
}

/* ---------- record / certify an application ---------- */
let finSa = null;
window.openFinSubApp = async function(siteId, scId, appId){
  const [scs, apps] = await Promise.all([dbSelect('fin_subcontracts', 'id=eq.'+scId), dbSelect('fin_sub_apps', 'subcontract_id=eq.'+scId+'&order=number.asc')]);
  const sc = scs[0]; if(!sc) return;
  const a = appId ? apps.find(x=>x.id===appId) : null;
  const before = apps.filter(x=>x.number < (a ? a.number : 1e9));
  const prevC = before.filter(x=>x.certified_gross!=null).pop();
  finSa = {siteId, sc, a, prevNet:finRound(before.filter(x=>x.certified_gross!=null).reduce((t,x)=>t+Number(x.net_due||0),0)), prevM:prevC?Number(prevC.materials_part||0):0, prevContra:prevC?Number(prevC.contra||0):0, prevApplied:before.length?Number(before[before.length-1].applied_gross||0):0};
  const locked = a && a.status==='paid';
  const v = (k, d)=>a && a[k]!=null ? a[k] : (d!=null?d:'');
  let ov = document.getElementById('finSaOverlay');
  if(!ov){ ov = document.createElement('div'); ov.id = 'finSaOverlay'; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
  ov.onclick = e=>{ if(e.target===ov) ov.style.display='none'; };
  const appDate = v('app_date', finToday());
  ov.innerHTML = `<div class="geo-modal-card" style="max-width:600px;">
    <h3>${escapeHtml(sc.name)} · application ${a ? a.number : (apps.length+1)}</h3>
    <p class="stub" style="margin:0 0 12px;">All figures are <b>to date</b> (cumulative), excl. VAT. Last application: ${finMoney(finSa.prevApplied)} applied.</p>
    <div class="fingrid2">
      <div class="formfield"><label class="field-label">Application date</label><input type="date" id="finSaDate" value="${appDate}" ${locked?'disabled':''}></div>
      <div class="formfield"><label class="field-label">Final date for payment</label><input type="date" id="finSaFinal" value="${v('final_date', finAddDays(appDate, 30))}" ${locked?'disabled':''}></div>
      <div class="formfield"><label class="field-label">Applied for, gross to date £</label><input type="text" inputmode="decimal" data-money id="finSaApplied" value="${v('applied_gross')}" oninput="finSaPaint()" ${locked?'disabled':''}></div>
      <div class="formfield"><label class="field-label">Of which materials to date £</label><input type="text" inputmode="decimal" data-money id="finSaMat" value="${v('materials_part', finSa.prevM||0)}" oninput="finSaPaint()" ${locked?'disabled':''}></div>
    </div>
    <p class="sectiontitle" style="margin:6px 0 10px;">Your certificate</p>
    <div class="fingrid2">
      <div class="formfield"><label class="field-label">Certified gross to date £</label><input type="text" inputmode="decimal" data-money id="finSaCert" value="${v('certified_gross')}" placeholder="Leave blank until you’ve checked it" oninput="finSaPaint()" ${locked?'disabled':''}></div>
      <div class="formfield"><label class="field-label">Contra charges to date £</label><input type="text" inputmode="decimal" data-money id="finSaContra" value="${v('contra', finSa.prevContra||0)}" oninput="finSaPaint()" ${locked?'disabled':''}></div>
    </div>
    <div class="formfield"><label class="field-label">Contra / reason for paying less (shown on the notice)</label><textarea id="finSaReason" rows="2" ${locked?'disabled':''}>${escapeHtml(a&&(a.payless_reason||a.contra_note)||'')}</textarea></div>
    <div id="finSaSum"></div>
    <div class="formfield" style="margin-top:10px;"><label class="field-label">Their application (PDF / photo)</label>${a&&a.file_path?`<button class="ghostbtn" style="width:auto;margin-bottom:6px;" onclick="openFinDoc('${jsAttr(a.file_path)}','${jsAttr(a.file_name||'')}')">View ${escapeHtml(a.file_name||'file')}</button>`:''}${locked?'':'<input type="file" id="finSaFile" accept=".pdf,image/*">'}</div>
    ${locked ? '' : `<div class="row-gap" style="flex-wrap:wrap;">
      <button class="ghostbtn" style="flex:1;min-width:140px;" onclick="saveFinSubApp(false)">Save as received</button>
      <button class="darkbtn" style="flex:1;min-width:140px;" onclick="saveFinSubApp(true)">Certify</button>
    </div>`}
    ${a && a.certified_gross!=null ? `<div class="row-gap" style="flex-wrap:wrap;margin-top:10px;">
      <button class="ghostbtn" style="flex:1;min-width:140px;" onclick="openFinSubNotice('${a.id}')">Payment notice PDF</button>
      ${a.status==='certified' ? `<button class="darkbtn" style="flex:1;min-width:140px;" onclick="markFinSubAppPaid('${a.id}')">Mark paid today</button>` : ''}
    </div>` : ''}
    ${a && a.status==='received' ? `<button class="ghostbtn" style="width:100%;margin-top:10px;color:var(--red);" onclick="deleteFinSubApp('${a.id}')">Delete</button>` : ''}
    <button class="geo-modal-cancel" onclick="document.getElementById('finSaOverlay').style.display='none'">Close</button>
  </div>`;
  ov.style.display = 'flex';
  finSaPaint();
};
function finSaCalc(){
  const n = id=>{ const x = finNum(finVal(id)); return (x===null||isNaN(x)) ? null : x; };
  const applied = n('finSaApplied')||0, mat = n('finSaMat')||0, cert = n('finSaCert'), contra = n('finSaContra')||0;
  const sc = finSa.sc;
  if(cert===null) return {applied, mat, cert:null};
  const retention = finRound(cert * Number(sc.retention_pct||0)/100);
  const net = finRound(cert - retention - contra - finSa.prevNet);
  const newMat = Math.max(0, finRound(mat - finSa.prevM));
  const labour = Math.max(0, finRound(net - newMat));
  const cis = finRound(labour * Number(sc.cis_rate||0)/100);
  return {applied, mat, cert, contra, retention, net, newMat, labour, cis, pay:finRound(net - cis), payless: cert < applied - 0.005};
}
window.finSaPaint = function(){
  const el = document.getElementById('finSaSum'); if(!el || !finSa) return;
  const c = finSaCalc();
  if(c.cert===null){ el.innerHTML = `<p class="stub" style="margin:0;">Enter the certified amount to see what to pay.</p>`; return; }
  el.innerHTML = `<div class="finkv"><span>Certified gross to date</span><b>${finMoney(c.cert)}</b></div>
    <div class="finkv"><span>Less retention @ ${finSa.sc.retention_pct}%</span><b>−${finMoney(c.retention)}</b></div>
    <div class="finkv"><span>Less contra charges to date</span><b>−${finMoney(c.contra)}</b></div>
    <div class="finkv"><span>Less paid before</span><b>−${finMoney(finSa.prevNet)}</b></div>
    <div class="finkv big"><span>Net due this time</span><b>${finMoney(c.net)}</b></div>
    <div class="finkv"><span>CIS @ ${finSa.sc.cis_rate}% on labour (${finMoney(c.labour)})</span><b>−${finMoney(c.cis)}</b></div>
    <div class="finkv big"><span>Pay them</span><b>${finMoney(c.pay)}</b></div>
    ${c.payless ? `<p class="stub" style="margin:6px 0 0;color:var(--red);">You’re certifying ${finMoney(c.applied - c.cert)} less than they applied for — the notice will be a pay less notice, so give the reason above and send it before the final date for payment.</p>` : ''}`;
};
window.saveFinSubApp = async function(certify){
  const s = finSa; if(!s) return;
  const c = finSaCalc();
  if(!c.applied){ toast('Enter the amount applied for.'); return; }
  if(certify && c.cert===null){ toast('Enter the certified amount.'); return; }
  const row = {app_date:finVal('finSaDate')||finToday(), final_date:finVal('finSaFinal')||null, applied_gross:finRound(c.applied), materials_part:finRound(c.mat)};
  if(certify){ Object.assign(row, {certified_gross:finRound(c.cert), retention:c.retention, contra:finRound(c.contra), contra_note:finVal('finSaReason')||null, previous:s.prevNet, net_due:c.net, cis_deduction:c.cis, pay_amount:c.pay, status:'certified', payless:!!c.payless, payless_reason:c.payless?(finVal('finSaReason')||null):null, notice_on:finToday()}); }
  const fileEl = document.getElementById('finSaFile'); const file = fileEl && fileEl.files && fileEl.files[0];
  if(file){ const stored = await uploadToStorage('finance-docs', ME.org_id+'/'+s.siteId+'/subcontract/'+uid()+'-'+file.name.replace(/[^a-z0-9.\-]+/gi,'_').slice(-80), file, file.type||'application/octet-stream'); if(stored){ row.file_path = stored; row.file_name = file.name; } }
  let r;
  if(s.a) r = await dbUpdate('fin_sub_apps', s.a.id, row);
  else {
    const ex = await dbSelect('fin_sub_apps', 'subcontract_id=eq.'+s.sc.id+'&select=number&order=number.desc&limit=1');
    r = await dbInsert('fin_sub_apps', Object.assign({org_id:ME.org_id, site_id:s.siteId, subcontract_id:s.sc.id, number:(ex[0]?ex[0].number:0)+1, created_by:ME.id}, row));
  }
  if(!r) return;
  document.getElementById('finSaOverlay').style.display = 'none';
  toast(certify ? 'Certified — '+finMoney(c.pay)+' to pay' : 'Application saved'); render();
};
window.deleteFinSubApp = async function(id){
  const btn = event && event.target;
  if(btn && btn.dataset.sure!=='1'){ btn.dataset.sure='1'; btn.textContent='Tap again to delete'; return; }
  if(await dbDelete('fin_sub_apps', id)){ document.getElementById('finSaOverlay').style.display='none'; toast('Deleted'); render(); }
};
// Paying it also records a CIS payment (CIS summary, statements, Xero).
window.markFinSubAppPaid = async function(id){
  const a = (await dbSelect('fin_sub_apps', 'id=eq.'+id))[0]; if(!a) return;
  if(a.status==='paid'){ toast('Already marked paid.'); render(); return; }
  const sc = (await dbSelect('fin_subcontracts', 'id=eq.'+a.subcontract_id))[0]; if(!sc) return;
  const today = finToday();
  const r = await dbUpdate('fin_sub_apps', id, {status:'paid', paid_on:today});
  if(!r) return;
  const prev = (await dbSelect('fin_sub_apps', 'subcontract_id=eq.'+a.subcontract_id+'&number=lt.'+a.number+'&certified_gross=not.is.null&order=number.desc&limit=1'))[0];
  const materials = Math.max(0, finRound(Number(a.materials_part||0) - Number(prev ? prev.materials_part||0 : 0)));
  const labour = Math.max(0, finRound(Number(a.net_due) - materials));
  await dbInsert('fin_sub_payments', {org_id:ME.org_id, worker_id:sc.worker_id||null, name:sc.name, utr:sc.utr||null, sub_app_id:a.id, period_start:a.app_date, period_end:a.app_date,
    lines:[{site_id:a.site_id, description:sc.number+' application '+a.number, days:1, rate:labour, amount:labour}], labour, materials, gross:Number(a.net_due), cis_rate:sc.cis_rate, cis_deduction:Number(a.cis_deduction), net_pay:Number(a.pay_amount), status:'paid', paid_on:today, created_by:ME.id});
  document.getElementById('finSaOverlay').style.display = 'none';
  toast('Marked paid — added to the CIS return'); render();
};

/* ---------- payment / pay less notice ---------- */
window.openFinSubNotice = async function(id){
  const a = (await dbSelect('fin_sub_apps', 'id=eq.'+id))[0]; if(!a) return;
  const sc = (await dbSelect('fin_subcontracts', 'id=eq.'+a.subcontract_id))[0]; if(!sc) return;
  const site = SITES.find(s=>s.id===a.site_id) || {};
  const st = await finLoadSettings();
  if(!(await loadLib('PDFLib'))){ toast('Could not load the PDF tool.'); return; }
  const pdf = await PDFLib.PDFDocument.create(); const page = pdf.addPage([595.28, 841.89]);
  const reg = await pdf.embedFont(PDFLib.StandardFonts.Helvetica), bold = await pdf.embedFont(PDFLib.StandardFonts.HelveticaBold);
  const INK = PDFLib.rgb(0.07,0.08,0.09), SLATE = PDFLib.rgb(0.36,0.39,0.45), LINE = PDFLib.rgb(0.86,0.88,0.9);
  const BRAND = finHexRgb(ORG && ORG.color_primary, PDFLib.rgb(0.78,0.06,0.18));
  page.drawRectangle({x:0, y:841.89-80, width:595.28, height:80, color:BRAND});
  page.drawText((ORG&&ORG.name)||'', {x:44, y:841.89-44, size:16, font:bold, color:PDFLib.rgb(1,1,1)});
  page.drawText(a.payless ? 'PAY LESS NOTICE' : 'PAYMENT NOTICE', {x:44, y:841.89-64, size:11, font:bold, color:PDFLib.rgb(1,1,1)});
  let y = 720;
  const kv = (k, v, b)=>{ page.drawText(k, {x:44, y, size:10, font:reg, color:SLATE}); const t = String(v==null?'—':v); const w = (b?bold:reg).widthOfTextAtSize(t, b?12:10.5); page.drawText(t, {x:551-w, y, size:b?12:10.5, font:b?bold:reg, color:INK}); y -= b?22:18; };
  kv('To', sc.name); kv('Subcontract order', sc.number+(sc.description?' — '+sc.description:'')); kv('Project', (site.job_number?site.job_number+' · ':'')+(site.name||'')); kv('Your application', 'No. '+a.number+' dated '+finDate(a.app_date)); kv('Final date for payment', finDate(a.final_date)); kv('Date of this notice', finDate(a.notice_on||finToday()));
  y -= 6; page.drawLine({start:{x:44,y:y+8}, end:{x:551,y:y+8}, thickness:0.6, color:LINE}); y -= 8;
  kv('Amount applied for (gross to date)', finMoney(a.applied_gross)); kv('Amount certified (gross to date)', finMoney(a.certified_gross));
  kv('Less retention @ '+sc.retention_pct+'%', '−'+finMoney(a.retention)); kv('Less contra charges to date', '−'+finMoney(a.contra)); kv('Less previously certified', '−'+finMoney(a.previous));
  kv('Sum we consider due', finMoney(a.net_due), true);
  kv('Less CIS deduction @ '+sc.cis_rate+'%', '−'+finMoney(a.cis_deduction)); kv('Amount to be paid (excl. VAT)', finMoney(a.pay_amount), true);
  if(sc.vat_registered){ page.drawText('VAT: domestic reverse charge — customer to account for VAT to HMRC.', {x:44, y, size:9, font:reg, color:SLATE}); y -= 16; }
  const reason = a.payless_reason || a.contra_note;
  if(reason){ y -= 6; page.drawText(a.payless ? 'Basis on which the sum has been calculated / reasons for paying less:' : 'Notes:', {x:44, y, size:10, font:bold, color:INK}); y -= 15; finWrap(reason, reg, 10, 507).forEach(l=>{ page.drawText(l, {x:44, y, size:10, font:reg, color:INK}); y -= 13; }); }
  y -= 14;
  finWrap(a.payless ? 'This is a pay less notice under the Housing Grants, Construction and Regeneration Act 1996 (as amended), given before the final date for payment.' : 'This is a payment notice under the Housing Grants, Construction and Regeneration Act 1996 (as amended).', reg, 9, 507).forEach(l=>{ page.drawText(l, {x:44, y, size:9, font:reg, color:SLATE}); y -= 12; });
  y -= 6; page.drawText('Issued by '+(ME.name||'')+' for '+((ORG&&ORG.name)||''), {x:44, y, size:9.5, font:reg, color:INK});
  if(st.company_address) page.drawText(String(st.company_address).replace(/\s*\n\s*/g, ', ').slice(0,110), {x:44, y:40, size:8.5, font:reg, color:SLATE});
  viewPdfInApp(await pdf.save(), (a.payless?'Pay less notice':'Payment notice')+' - '+sc.number+' app '+a.number+'.pdf');
};
