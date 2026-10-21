/* ============================================================
   OpHUB Finance — Subcontractors & labour, rebuilt around how RTB works:
   operatives INVOICE us (no timesheets).
     • Operative invoices: who, their invoice no., date, the week it's for,
       an amount per job (+ materials), copy of the invoice. CIS is worked
       out from the person's CIS rate. Saved = approved, ready to pay.
     • Each job line goes to that job's PM to book against the price or
       general costs (wage_pushes), and is the labour cost on the job.
     • Pay run: approved, unpaid operative invoices up to the week in hand
       → pay them by bank transfer as usual → mark them paid here.
     • Subcontract orders and their applications (apply → certify) as rows.
   Stored in fin_sub_payments (rows with sub_app_id are subcontract-order
   payments, not operative invoices).
   ============================================================ */
const FIN_OPINV_Q = 'org_id=eq.'+'{org}'+'&sub_app_id=is.null&status=neq.void';
function finOpQ(){ return FIN_OPINV_Q.replace('{org}', ME.org_id); }
function finOpJobs(p){ return Array.from(new Set((p.lines||[]).map(l=>l.site_id).filter(Boolean))).map(finJobTag).join(', '); }

/* ---------- Subcontractors section ---------- */
let finOpF = 'topay', finScF = 'active';
async function renderFinSubsSection(sub){
  if(!finGuard()) return;
  if(sub==='payments') sub = 'opinv';
  sub = ['orders','apps','opinv'].includes(sub) ? sub : 'opinv';
  const __gen = RENDER_GEN;
  const [scs, sapps, ops] = await Promise.all([
    dbSelect('fin_subcontracts', 'org_id=eq.'+ME.org_id+'&order=created_at.desc'),
    dbSelect('fin_sub_apps', 'org_id=eq.'+ME.org_id+'&order=app_date.desc'),
    dbSelect('fin_sub_payments', finOpQ()+'&order=created_at.desc&limit=3000'),
  ]);
  if(__gen !== RENDER_GEN) return;
  if(!FIN_SETTINGS) await finLoadSettings();
  const scBy = {}; scs.forEach(s=>scBy[s.id]=s);
  const toCert = sapps.filter(a=>a.status==='received'), certToPay = sapps.filter(a=>a.status==='certified');
  const opToPay = ops.filter(p=>p.status==='approved'), opDraft = ops.filter(p=>p.status==='draft');
  const lastCert = id=>sapps.filter(a=>a.subcontract_id===id && a.certified_gross!=null).sort((x,y)=>y.number-x.number)[0];
  let body = '';
  if(sub==='opinv'){
    const F = {topay:p=>p.status==='approved' || p.status==='draft', paid:p=>p.status==='paid', all:()=>true};
    if(!F[finOpF]) finOpF = 'topay';
    const list = ops.filter(F[finOpF]);
    body = finSecHead('Operative invoices', '+ Operative invoice', 'openFinOpInvoice()')
      + `<p class="stub" style="margin:-4px 0 10px;">When an operative sends you their invoice, put it in here with the amount for each job. CIS is worked out for you, it goes to that job’s PM to book against the price, and it’s paid in the Friday pay run.</p>`
      + `<div class="pmchips">${[['topay','To pay'],['paid','Paid'],['all','All']].map(([k,l])=>finChip(finOpF===k, l, ops.filter(F[k]).length, `finOpF='${k}';render()`)).join('')}</div>`
      + finSearchHtml('Search name, invoice no. or job', 'finSubList')
      + `<div id="finSubList">${list.length ? `<div class="finreptbl-wrap"><table class="fincosttbl fininvtbl">
        <thead><tr><th>Operative</th><th>Their invoice</th><th>Week</th><th>Jobs</th><th class="num">Gross</th><th class="num">CIS</th><th class="num">To pay</th><th>Status</th></tr></thead>
        <tbody>${list.map(p=>`<tr class="click" data-lf="${lfText([p.name, p.invoice_no, finOpJobs(p)].join(' '))}" onclick="go('#/finance/labour/payment/${p.id}')">
          <td data-l="Operative" class="d"><b>${escapeHtml(p.name||'')}</b></td><td data-l="Their invoice">${escapeHtml(p.invoice_no||'—')}${p.invoice_date?`<div class="fininv-addr">${finDate(p.invoice_date)}</div>`:''}</td>
          <td data-l="Week">w/c ${finDate(p.period_start)}</td><td data-l="Jobs">${escapeHtml(finOpJobs(p)||'—')}</td>
          <td data-l="Gross" class="num">${finMoney(p.gross)}</td><td data-l="CIS" class="num">−${finMoney(p.cis_deduction)}</td><td data-l="To pay" class="num"><b>${finMoney(p.net_pay)}</b></td>
          <td data-l="Status">${p.status==='paid'?`<span class="finpill ok">Paid ${finDate(p.paid_on)}</span>`:p.status==='approved'?'<span class="finpill blue">To pay</span>':'<span class="finpill grey">Draft</span>'} ${typeof finInvXeroTag==='function' ? finInvXeroTag(Object.assign({}, p, {status:'issued'})) : ''}</td></tr>`).join('')}</tbody>
        ${list.length>1?`<tfoot><tr><td class="d" colspan="4">Total (${list.length})</td><td class="num">${finMoney(list.reduce((t,p)=>t+Number(p.gross||0),0))}</td><td class="num">−${finMoney(list.reduce((t,p)=>t+Number(p.cis_deduction||0),0))}</td><td class="num">${finMoney(list.reduce((t,p)=>t+Number(p.net_pay||0),0))}</td><td></td></tr></tfoot>`:''}
        </table></div>` : '<div class="empty">No operative invoices here.</div>'}</div>`;
  } else if(sub==='orders'){
    const F = {active:s=>s.status!=='complete', complete:s=>s.status==='complete', all:()=>true};
    if(!F[finScF]) finScF = 'active';
    const list = scs.filter(F[finScF]);
    body = finSecHead('Subcontract orders', '+ Subcontract order', "finPickJob('New subcontract order','openFinSubcontract')")
      + `<p class="stub" style="margin:-4px 0 10px;">For subcontractors on a fixed price who apply for payment (e.g. leadwork, scaffolding). Price sheets your PMs issue come in here by themselves.</p>`
      + `<div class="pmchips">${[['active','Active'],['complete','Complete'],['all','All']].map(([k,l])=>finChip(finScF===k, l, scs.filter(F[k]).length, `finScF='${k}';render()`)).join('')}</div>`
      + finSearchHtml('Search subcontractor or project', 'finSubList')
      + `<div id="finSubList">${list.length ? `<div class="finreptbl-wrap"><table class="fincosttbl fininvtbl"><thead><tr><th>Order</th><th>Subcontractor</th><th>Project</th><th>Work</th><th class="num">Order value</th><th class="num">Certified</th><th>Status</th></tr></thead>
        <tbody>${list.map(sc=>{ const l = lastCert(sc.id); return `<tr class="click" data-lf="${lfText([sc.name, sc.number, sc.description, finJobTag(sc.site_id)].join(' '))}" onclick="go('#/site/${sc.site_id}/finance/sub/${sc.id}')">
          <td data-l="Order" class="d"><b>${escapeHtml(sc.number)}</b></td><td data-l="Subcontractor">${escapeHtml(sc.name)}</td><td data-l="Project">${escapeHtml(finJobTag(sc.site_id))}</td><td data-l="Work">${escapeHtml(sc.description||'—')}${sc.source==='price_sheet'?'<div class="fininv-addr">From the PM’s price sheet</div>':''}</td>
          <td data-l="Order value" class="num">${sc.order_value!=null?finMoney(sc.order_value):'—'}</td><td data-l="Certified" class="num">${finMoney(l?l.certified_gross:0)}</td>
          <td data-l="Status">${sc.status==='complete'?'<span class="finpill ok">Complete</span>':'<span class="finpill blue">Active</span>'}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty">No subcontract orders here.</div>'}</div>`;
  } else {
    const F = {open:a=>a.status==='received', certified:a=>a.status==='certified', paid:a=>a.status==='paid', all:()=>true};
    if(!F[finSaFilter]) finSaFilter = 'open';
    const list = sapps.filter(F[finSaFilter]);
    body = finSecHead('Applications & certificates', '+ Record an application', 'finPickSubOrder()')
      + `<p class="stub" style="margin:-4px 0 10px;">A subcontractor applies → you certify it (that’s the certificate) and send the payment or pay-less notice before the final date → mark it paid.</p>`
      + `<div class="pmchips">${[['open','To certify'],['certified','Certified — to pay'],['paid','Paid'],['all','All']].map(([k,l])=>finChip(finSaFilter===k, l, sapps.filter(F[k]).length, `finSaFilter='${k}';render()`)).join('')}</div>`
      + finSearchHtml('Search subcontractor or project', 'finSubList')
      + `<div id="finSubList">${list.length ? `<div class="finreptbl-wrap"><table class="fincosttbl fininvtbl"><thead><tr><th>Subcontractor</th><th>Application</th><th>Project</th><th>Date</th><th>Final date to pay</th><th class="num">Applied</th><th class="num">Certified</th><th class="num">To pay (after CIS)</th><th>Stage</th></tr></thead>
        <tbody>${list.map(a=>{ const sc = scBy[a.subcontract_id] || {}; const late = a.status!=='paid' && a.final_date && a.final_date < finToday(); return `<tr class="click" data-lf="${lfText([sc.name, sc.number, finJobTag(a.site_id)].join(' '))}" onclick="openFinSubApp('${a.site_id}','${a.subcontract_id}','${a.id}')">
          <td data-l="Subcontractor" class="d"><b>${escapeHtml(sc.name||'')}</b></td><td data-l="Application">No. ${a.number} · ${escapeHtml(sc.number||'')}</td><td data-l="Project">${escapeHtml(finJobTag(a.site_id))}</td>
          <td data-l="Date">${finDate(a.app_date)}</td><td data-l="Final date" class="${late?'finbad':''}">${a.final_date?finDate(a.final_date):'—'}</td>
          <td data-l="Applied" class="num">${finMoney(a.applied_gross)}</td><td data-l="Certified" class="num">${a.certified_gross!=null?finMoney(a.certified_gross):'—'}</td><td data-l="To pay" class="num">${a.certified_gross!=null?finMoney(a.pay_amount):'—'}</td>
          <td data-l="Stage"><span class="finpill ${a.status==='paid'?'ok':a.status==='certified'?'warn':'blue'}">${a.status==='paid'?'Paid':a.status==='certified'?'Certified':'To certify'}</span>${a.payless?' <span class="finpill bad">Pay less</span>':''}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty">Nothing here.</div>'}</div>`;
  }
  document.getElementById('app').innerHTML = shell(`
    ${finSectionNav('subs')}
    <div class="pmstats finstats">
      <div class="pmstat" onclick="finOpF='topay';go('#/finance/subs/opinv')"><b>${finMoney(opToPay.reduce((t,p)=>t+Number(p.net_pay||0),0), 0)}</b><span>Operative invoices to pay</span></div>
      <div class="pmstat" onclick="go('#/finance/labour/payrun')"><b>${finDate(finNextPayDay())}</b><span>Next pay day</span></div>
      <div class="pmstat" onclick="finSaFilter='open';go('#/finance/subs/apps')"><b>${toCert.length}</b><span>Applications to certify</span></div>
      <div class="pmstat" onclick="finSaFilter='certified';go('#/finance/subs/apps')"><b>${finMoney(certToPay.reduce((t,a)=>t+Number(a.pay_amount||0),0), 0)}</b><span>Certified, to pay</span></div>
    </div>
    ${finSubTabs('subs', sub, {apps:toCert.length, opinv:opDraft.length})}
    ${body}
  `, {title:'Subcontractors & labour', subtitle:'OpHUB Finance', back:finSecBack(), tabs:false});
}
// "+ Record an application": pick the subcontract order first.
window.finPickSubOrder = async function(){
  const scs = (await dbSelect('fin_subcontracts', 'org_id=eq.'+ME.org_id+'&status=neq.complete&order=created_at.desc'));
  if(!scs.length){ toast('Add a subcontract order first.'); go('#/finance/subs/orders'); return; }
  let ov = document.getElementById('finPickOverlay');
  if(!ov){ ov = document.createElement('div'); ov.id = 'finPickOverlay'; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
  ov.onclick = e=>{ if(e.target===ov) ov.style.display='none'; };
  ov.innerHTML = `<div class="geo-modal-card"><h3>Which subcontract order?</h3>
    ${scs.map(sc=>`<button type="button" class="pmrow pmrow-card" style="margin:4px 0;" onclick="document.getElementById('finPickOverlay').style.display='none';openFinSubApp('${sc.site_id}','${sc.id}')"><span class="pmrow-txt"><span class="pmrow-t">${escapeHtml(sc.name)} · ${escapeHtml(sc.number)}</span><span class="pmrow-s">${escapeHtml(finJobTag(sc.site_id))}${sc.description?' · '+escapeHtml(sc.description):''}</span></span></button>`).join('')}
    <button class="geo-modal-cancel" onclick="document.getElementById('finPickOverlay').style.display='none'">Cancel</button></div>`;
  ov.style.display = 'flex';
};

/* ---------- Record an operative invoice ---------- */
let finOp = null;
window.openFinOpInvoice = async function(siteId, id){
  const rates = await finLoadRates();
  await loadAllProfiles();
  const p = id ? (await dbSelect('fin_sub_payments', 'id=eq.'+id))[0] : null;
  const people = Object.keys(rates).filter(k=>rates[k].pay_type!=='paye' && rates[k].active!==false).map(k=>({key:k, name:rates[k].trading_name || (k.startsWith('w:') ? rates[k].name : finPersonName(k)), r:rates[k]})).sort((a,b)=>String(a.name).localeCompare(String(b.name)));
  finOp = p ? {id:p.id, key:p.worker_id ? 'w:'+p.worker_id : (p.user_id||''), invoice_no:p.invoice_no||'', invoice_date:p.invoice_date||finToday(), week:p.period_start, lines:(p.lines||[]).map(l=>({site_id:l.site_id, amount:l.amount, description:l.description||''})), materials:Number(p.materials||0), cis:p.cis_rate, file:null, file_path:p.file_path, file_name:p.file_name}
    : {key:'', invoice_no:'', invoice_date:finToday(), week:finMonday(finAddDays(finToday(), -7)), lines:[{site_id:siteId||'', amount:null, description:''}], materials:0, cis:null, file:null};
  finOp.people = people; finOp.rates = rates;
  let ov = document.getElementById('finOpOverlay');
  if(!ov){ ov = document.createElement('div'); ov.id = 'finOpOverlay'; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
  ov.onclick = e=>{ if(e.target===ov) ov.style.display='none'; };
  ov.style.display = 'flex';
  finOpPaint();
};
function finOpWeeks(){ const out = []; let d = finMonday(finAddDays(finToday(), 7)); for(let i=0;i<10;i++){ out.push(d); d = finAddDays(d, -7); } if(finOp && finOp.week && !out.includes(finOp.week)) out.push(finOp.week); return out; }
window.finOpPaint = function(){
  const ov = document.getElementById('finOpOverlay'); if(!ov || !finOp) return;
  const O = finOp, r = O.rates[O.key] || {};
  const cis = O.cis!=null ? Number(O.cis) : (r.cis_rate!=null ? Number(r.cis_rate) : 20);
  const jobs = SITES.filter(s=>finSiteStatus(s)!=='closed').sort((a,b)=>String(b.job_number||'').localeCompare(String(a.job_number||''), undefined, {numeric:true}));
  const wk = d=>'w/c '+new Date(d+'T12:00:00').toLocaleDateString('en-GB', {day:'numeric', month:'short'});
  ov.innerHTML = `<div class="geo-modal-card finopmodal">
    <h3>${O.id ? 'Operative invoice' : 'New operative invoice'}</h3>
    <div class="fingrid2">
      <div class="formfield"><label class="field-label">Who is it from?</label><select onchange="finOpWho(this.value)"><option value="">Choose…</option>${O.people.map(p=>`<option value="${escapeHtml(p.key)}" ${O.key===p.key?'selected':''}>${escapeHtml(p.name)}</option>`).join('')}<option value="__new">+ Someone new…</option></select></div>
      <div class="formfield"><label class="field-label">Their invoice number</label><input type="text" value="${escapeHtml(O.invoice_no)}" oninput="finOp.invoice_no=this.value" placeholder="e.g. 042"></div>
      <div class="formfield"><label class="field-label">Invoice date</label><input type="date" value="${O.invoice_date||''}" onchange="finOp.invoice_date=this.value"></div>
      <div class="formfield"><label class="field-label">Week the work was done</label><select onchange="finOp.week=this.value">${finOpWeeks().map(d=>`<option value="${d}" ${O.week===d?'selected':''}>${wk(d)}</option>`).join('')}</select></div>
    </div>
    <p class="sectiontitle" style="margin:6px 0 6px;">Amount for each job</p>
    <div class="finoplines">${O.lines.map((l,i)=>`<div class="finopline">
      <select onchange="finOp.lines[${i}].site_id=this.value"><option value="">Job…</option>${jobs.map(s=>`<option value="${s.id}" ${l.site_id===s.id?'selected':''}>${escapeHtml((s.job_number?s.job_number+' · ':'')+s.name)}</option>`).join('')}</select>
      <input type="text" placeholder="What for (optional)" value="${escapeHtml(l.description||'')}" oninput="finOp.lines[${i}].description=this.value">
      <input type="text" inputmode="decimal" data-money placeholder="£" value="${l.amount!=null?l.amount:''}" oninput="finOp.lines[${i}].amount=finNum(this.value);finOpTot()">
      ${O.lines.length>1?`<button type="button" class="linkbtn" onclick="finOp.lines.splice(${i},1);finOpPaint()">Remove</button>`:'<span></span>'}
    </div>`).join('')}</div>
    <button type="button" class="ghostbtn" style="width:100%;margin-top:4px;" onclick="finOp.lines.push({site_id:'',amount:null,description:''});finOpPaint()">+ Another job</button>
    <div class="fingrid2" style="margin-top:10px;">
      <div class="formfield"><label class="field-label">Materials they supplied £ (no CIS)</label><input type="text" inputmode="decimal" data-money value="${O.materials||''}" placeholder="0" oninput="finOp.materials=finNum(this.value)||0;finOpTot()"></div>
      <div class="formfield"><label class="field-label">CIS deduction</label><select onchange="finOp.cis=+this.value;finOpTot()">${Object.keys(FIN_CIS_LABEL).map(k=>`<option value="${k}" ${cis===Number(k)?'selected':''}>${FIN_CIS_LABEL[k]}</option>`).join('')}</select></div>
    </div>
    <div class="formfield"><label class="field-label">Copy of their invoice (optional)</label>${O.file_path?`<button class="linkbtn" onclick="openFinDoc('${jsAttr(O.file_path)}','${jsAttr(O.file_name||'')}')">View the one saved</button> · replace: `:''}<input type="file" accept="application/pdf,image/*" onchange="finOp.file=this.files[0]||null"></div>
    <div id="finOpTot" class="finoptot"></div>
    ${r.vat_registered ? `<p class="stub" style="margin:4px 0 0;font-style:normal;">They’re VAT registered: construction reverse charge — you account for the VAT, so pay the figure below.</p>` : ''}
    <button class="darkbtn" style="width:100%;margin-top:10px;" id="finOpSave" onclick="saveFinOpInvoice()">${O.id ? 'Save changes' : 'Save — ready for the pay run'}</button>
    <button class="geo-modal-cancel" onclick="document.getElementById('finOpOverlay').style.display='none'">Cancel</button>
  </div>`;
  finOpTot();
};
window.finOpWho = async function(v){
  if(v==='__new'){
    const name = String(await customPrompt('Their name (or company name)') || '').trim();
    if(!name){ finOpPaint(); return; }
    const r = await dbInsert('fin_labour_rates', {org_id:ME.org_id, user_id:null, name, pay_type:'subcontractor', cis_rate:20, vat_registered:false, active:true, updated_at:new Date().toISOString()});
    if(!r || !r[0]){ finOpPaint(); return; }
    const k = 'w:'+r[0].id; finOp.rates[k] = r[0]; finOp.people.push({key:k, name, r:r[0]}); finOp.key = k; finOp.cis = null;
    toast(name+' added — add their bank details and UTR in People & rates');
    finOpPaint(); return;
  }
  finOp.key = v; finOp.cis = null; finOpPaint();
};
function finOpCalc(){
  const O = finOp, r = O.rates[O.key] || {};
  const cis = O.cis!=null ? Number(O.cis) : (r.cis_rate!=null ? Number(r.cis_rate) : 20);
  const labour = finRound(O.lines.reduce((t,l)=>t+(Number(l.amount)||0),0)), mat = finRound(Number(O.materials||0));
  const ded = finRound(labour*cis/100);
  return {labour, materials:mat, gross:finRound(labour+mat), cis_rate:cis, cis_deduction:ded, net_pay:finRound(labour+mat-ded)};
}
window.finOpTot = function(){
  const el = document.getElementById('finOpTot'); if(!el || !finOp) return;
  const c = finOpCalc();
  el.innerHTML = `<div class="finkv"><span>Labour</span><b>${finMoney(c.labour)}</b></div>${c.materials?`<div class="finkv"><span>Materials</span><b>${finMoney(c.materials)}</b></div>`:''}<div class="finkv"><span>CIS taken off (${c.cis_rate}% of labour, paid to HMRC)</span><b>−${finMoney(c.cis_deduction)}</b></div><div class="finkv big"><span>Pay them</span><b>${finMoney(c.net_pay)}</b></div>`;
};
window.saveFinOpInvoice = async function(){
  const O = finOp; if(!O) return;
  if(!O.key){ toast('Choose who the invoice is from.'); return; }
  const lines = O.lines.filter(l=>l.site_id || l.amount).map(l=>({site_id:l.site_id, amount:finRound(Number(l.amount)||0), description:String(l.description||'').trim()||null}));
  if(!lines.length){ toast('Add the amount for at least one job.'); return; }
  if(lines.some(l=>!l.site_id)){ toast('Choose the job on every line.'); return; }
  if(lines.some(l=>!(l.amount>0))){ toast('Every job needs an amount.'); return; }
  const r = O.rates[O.key] || {};
  const c = finOpCalc();
  const btn = document.getElementById('finOpSave'); if(btn){ btn.disabled = true; btn.textContent = 'Saving…'; }
  const row = Object.assign({lines, invoice_no:O.invoice_no.trim()||null, invoice_date:O.invoice_date||null, period_start:O.week, period_end:finAddDays(O.week, 6), name:r.trading_name || (O.key.startsWith('w:') ? r.name : finPersonName(O.key)), utr:r.utr||null}, c);
  if(O.file){
    const safe = O.file.name.replace(/[^a-z0-9.\-]+/gi,'_').slice(-80);
    const stored = await uploadToStorage('finance-docs', ME.org_id+'/operative-invoices/'+uid()+'-'+safe, O.file, O.file.type||'application/octet-stream');
    if(stored){ row.file_path = stored; row.file_name = O.file.name; }
  }
  let saved;
  if(O.id){ saved = await dbUpdate('fin_sub_payments', O.id, row); }
  else {
    if(row.invoice_no){
      const dup = await dbSelect('fin_sub_payments', finOpQ()+'&invoice_no=eq.'+encodeURIComponent(row.invoice_no)+'&'+(O.key.startsWith('w:') ? 'worker_id=eq.'+O.key.slice(2) : 'user_id=eq.'+O.key)+'&select=id');
      if(dup.length && !await customConfirm('You already have invoice '+row.invoice_no+' from '+row.name+'. Add it again?')){ if(btn){ btn.disabled = false; btn.textContent = 'Save — ready for the pay run'; } return; }
    }
    const ins = await dbInsert('fin_sub_payments', Object.assign({org_id:ME.org_id, user_id:O.key.startsWith('w:') ? null : O.key, worker_id:O.key.startsWith('w:') ? O.key.slice(2) : null, status:'approved', created_by:ME.id}, row));
    saved = ins && ins[0];
  }
  if(btn){ btn.disabled = false; btn.textContent = 'Save'; }
  if(!saved) return;
  await finOpPushToPm(Object.assign({}, saved, row, {id:saved.id||O.id}), O.key);
  document.getElementById('finOpOverlay').style.display = 'none';
  finOp = null;
  toast('Saved — '+finMoney(c.net_pay)+' to pay in the pay run'); render();
};
// Each job line goes to that job's PM to book against a price (or general costs). Kept in step if the invoice changes.
async function finOpPushToPm(p, key){
  try{
    const existing = await dbSelect('wage_pushes', 'org_id=eq.'+ME.org_id+'&src_key=like.'+encodeURIComponent('pay|'+p.id+'|*'));
    const exBy = {}; existing.forEach(e=>{ exBy[e.site_id] = e; });
    const bySite = {}; (p.lines||[]).forEach(l=>{ const b = bySite[l.site_id] = bySite[l.site_id] || {amount:0, desc:[]}; b.amount += Number(l.amount||0); if(l.description) b.desc.push(l.description); });
    for(const sid of Object.keys(bySite)){
      const b = bySite[sid], amount = finRound(b.amount), ex = exBy[sid];
      const row = {org_id:ME.org_id, site_id:sid, src_key:'pay|'+p.id+'|'+sid, person_key:key, operative_id:key && !key.startsWith('w:') ? key : null, person_name:p.name, week_start:p.period_start, days:0, amount, description:[p.invoice_no?'Invoice '+p.invoice_no:'', b.desc.join(', ')].filter(Boolean).join(' · ')||null, status:'pending', created_by:ME.id};
      if(!ex){ await dbInsert('wage_pushes', row); continue; }
      if(Number(ex.amount)===amount) continue;
      await dbUpdate('wage_pushes', ex.id, {amount, description:row.description, status:ex.status==='withdrawn'?'pending':ex.status});
      if(ex.status==='price' && ex.price_entry_id) await sbFetch('/rest/v1/price_week_operative_entries?id=eq.'+ex.price_entry_id, {method:'PATCH', body:JSON.stringify({amount, updated_at:new Date().toISOString()})});
    }
    for(const e of existing){ if(!bySite[e.site_id]){ if(e.status==='pending') await dbDelete('wage_pushes', e.id); else await dbUpdate('wage_pushes', e.id, {status:'withdrawn', amount:0}); } }
  }catch(e){ console.error('push', e); }
}

/* ---------- Pay run: approved operative invoices, a week in hand ---------- */
async function renderFinPayRun(){
  if(!finGuard()) return;
  const __gen = RENDER_GEN;
  if(!FIN_SETTINGS) await finLoadSettings();
  if(!finRunDay) finRunDay = finNextPayDay();
  const upTo = finAddDays(finRunWeek(finRunDay), 6); // last day of the week being paid
  const [ops, rates] = await Promise.all([dbSelect('fin_sub_payments', finOpQ()+'&order=period_start.asc&limit=3000'), finLoadRates()]);
  if(__gen !== RENDER_GEN) return;
  const keyOf = p=>p.worker_id ? 'w:'+p.worker_id : (p.user_id||'');
  const due = ops.filter(p=>p.status==='approved' && p.period_start <= upTo);
  const later = ops.filter(p=>p.status==='approved' && p.period_start > upTo);
  const paidHere = ops.filter(p=>p.status==='paid' && (p.pay_date===finRunDay || p.paid_on===finRunDay));
  const rows = due.concat(paidHere).map(p=>Object.assign({}, p, {r:rates[keyOf(p)]||{}}));
  const tot = k=>finRound(due.reduce((t,p)=>t+Number(p[k]||0),0));
  const noBank = due.filter(p=>!finBankOk(rates[keyOf(p)])).length;
  const fmtD = d=>new Date(d+'T12:00:00').toLocaleDateString('en-GB', {weekday:'short', day:'numeric', month:'short'});
  const {wd, wih} = finPayCfg();
  document.getElementById('app').innerHTML = shell(`
    ${finSectionNav('subs')}${finSubTabs('subs','payrun')}
    <div class="card finrun-head">
      <div class="finrun-day">
        <button class="ghostbtn" onclick="finRunDay=finAddDays(finRunDay,-7);render()" aria-label="Previous pay day">‹</button>
        <div><div class="finhead-l">Pay day</div><div class="finhead-v">${fmtD(finRunDay)}</div><div class="finrun-sub">Pays operative invoices for work up to ${fmtD(upTo)}</div></div>
        <button class="ghostbtn" onclick="finRunDay=finAddDays(finRunDay,7);render()" aria-label="Next pay day">›</button>
      </div>
      <div class="finrun-cfg">Paid <select onchange="finPayCfgSave('pay_weekday', this.value)">${FIN_WEEKDAYS.map((n,i)=>`<option value="${i}" ${i===wd?'selected':''}>${n}s</option>`).join('')}</select>
        <select onchange="finPayCfgSave('pay_weeks_in_hand', this.value)">${[0,1,2].map(n=>`<option value="${n}" ${n===wih?'selected':''}>${n===0?'for the same week':n===1?'one week behind (a week in hand)':'two weeks behind'}</option>`).join('')}</select> by bank transfer</div>
    </div>
    <div class="finrun-tiles">
      <div><span>Invoices</span><b>${finMoney(tot('gross'))}</b></div>
      <div><span>CIS to pay HMRC</span><b>${finMoney(tot('cis_deduction'))}</b></div>
      <div class="hl"><span>To transfer</span><b>${finMoney(tot('net_pay'))}</b></div>
    </div>
    <div class="finrun-steps one">
      <button class="darkbtn" ${due.length?'':'disabled'} onclick="finRunMarkPaid()">Mark ${due.length||''} paid once you’ve sent the money</button>
    </div>
    ${noBank ? `<p class="finrun-warn">${noBank} ${noBank===1?'person has':'people have'} no bank details saved — add them in <a href="#/finance/labour/rates">People &amp; rates</a> so they’re here when you pay.</p>` : ''}
    ${rows.length ? `<div class="finreptbl-wrap"><table class="fincosttbl fininvtbl">
      <thead><tr><th>Operative</th><th>Their invoice</th><th>Week</th><th class="num">Gross</th><th class="num">CIS</th><th class="num">Pay</th><th>Bank</th><th>Status</th></tr></thead>
      <tbody>${rows.map(p=>`<tr class="click" onclick="go('#/finance/labour/payment/${p.id}')">
        <td data-l="Operative" class="d"><b>${escapeHtml(p.name||'')}</b></td><td data-l="Their invoice">${escapeHtml(p.invoice_no||'—')}</td><td data-l="Week">w/c ${finDate(p.period_start)}</td>
        <td data-l="Gross" class="num">${finMoney(p.gross)}</td><td data-l="CIS" class="num">−${finMoney(p.cis_deduction)}</td><td data-l="Pay" class="num"><b>${finMoney(p.net_pay)}</b></td>
        <td data-l="Bank">${finBankOk(p.r) ? `<span class="finrun-bank">${escapeHtml(p.r.bank_account_name||'')}${p.r.bank_account_name?'<br>':''}${escapeHtml(finSortCode(p.r.bank_sort_code))} · ${escapeHtml(String(p.r.bank_account_no).replace(/\D/g,''))}</span>` : '<span class="finpill warn">Not saved</span>'}</td>
        <td data-l="Status">${p.status==='paid'?'<span class="finpill ok">Paid</span>':'<span class="finpill blue">To pay</span>'}</td></tr>`).join('')}</tbody></table></div>`
      : `<div class="empty">Nothing to pay on this day. Add operative invoices as they come in — <button class="linkbtn" onclick="openFinOpInvoice()">+ Operative invoice</button></div>`}
    ${later.length ? `<p class="stub" style="margin:10px 0 0;font-style:normal;">${later.length} later invoice${later.length===1?'':'s'} (${finMoney(later.reduce((t,p)=>t+Number(p.net_pay||0),0))}) will be in a later pay run.</p>` : ''}
  `, {title:'Pay run', subtitle:'Subcontractors & labour', back:finSecBack(), tabs:false});
  window.__finRun = {due, rates, keyOf};
}
window.finRunMarkPaid = async function(){
  const R = window.__finRun; if(!R || !R.due.length) return;
  if(!await customConfirm(`Mark ${R.due.length} operative invoice${R.due.length===1?'':'s'} (${finMoney(R.due.reduce((t,p)=>t+Number(p.net_pay||0),0))}) as paid on ${finDate(finRunDay)}?`)) return;
  let n = 0;
  for(const p of R.due){ if(await dbUpdate('fin_sub_payments', p.id, {status:'paid', paid_on:finRunDay, pay_date:finRunDay})) n++; }
  toast(n+' marked paid'); render();
};
window.finPayCfgSave = async function(k, v){
  const res = await sbFetch('/rest/v1/fin_settings?on_conflict=org_id', {method:'POST', headers:{'Prefer':'resolution=merge-duplicates,return=representation'}, body:JSON.stringify({org_id:ME.org_id, [k]:Number(v)})});
  if(!res.ok){ toast('Not saved — '+(await safeErr(res))); return; }
  await finLoadSettings(); finRunDay = finNextPayDay(); render();
};

/* ---------- Labour on a job: operative invoices + PAYE days ---------- */
async function finJobLabour(siteId){
  const [ops, cks, manual, rates] = await Promise.all([
    dbSelect('fin_sub_payments', finOpQ()+'&status=in.(approved,paid)&limit=5000'),
    dbSelect('checkins', 'site_id=eq.'+siteId+'&type=eq.in&select=user_id,site_id,ts,type&order=ts.desc&limit=20000'),
    dbSelect('fin_labour_manual', 'site_id=eq.'+siteId+'&order=work_date.desc'),
    finLoadRates(),
  ]);
  const inv = [];
  ops.forEach(p=>(p.lines||[]).forEach(l=>{ if(l.site_id===siteId) inv.push({id:p.id, name:p.name, invoice_no:p.invoice_no, week:p.period_start, amount:Number(l.amount||0), description:l.description, status:p.status}); }));
  const byUser = {};
  finLabourDaysFrom(cks).forEach(d=>{ const r = rates[d.user_id]; if(!r || r.pay_type!=='paye') return; const u = byUser[d.user_id] = byUser[d.user_id] || {user_id:d.user_id, days:0, rate:r.day_rate!=null?Number(r.day_rate):null}; u.days++; });
  let cost = 0, noRate = 0;
  Object.values(byUser).forEach(u=>{ u.cost = u.rate!=null ? finRound(u.days*u.rate) : 0; if(u.rate==null) noRate++; cost += u.cost; });
  cost += inv.reduce((t,x)=>t+x.amount,0) + manual.reduce((t,m)=>t+Number(m.amount||0),0);
  return {people:Object.values(byUser).sort((a,b)=>b.days-a.days), inv, manual, cost:finRound(cost), noRate};
}
function finLabourCardHtml(siteId, lab){
  return `<div class="card">
    <div class="fincard-head"><p class="sectiontitle" style="margin:0;">Labour</p><button class="ghostbtn finsmall" onclick="openFinOpInvoice('${siteId}')">+ Operative invoice</button></div>
    <p class="stub" style="margin:4px 0 8px;font-style:normal;">Operatives’ invoices for this job, plus PAYE staff’s days on site at their day rate.${lab.noRate?` <b style="color:var(--warn);">${lab.noRate} PAYE ${lab.noRate===1?'person has':'people have'} no day rate</b> — <a href="#/finance/labour/rates">set rates</a>.`:''}</p>
    ${lab.inv.length ? `<div class="finreptbl-wrap"><table class="fincosttbl fininvtbl"><thead><tr><th>Operative</th><th>Invoice</th><th>Week</th><th>For</th><th class="num">Amount</th><th>Status</th></tr></thead><tbody>
      ${lab.inv.map(x=>`<tr class="click" onclick="go('#/finance/labour/payment/${x.id}')"><td data-l="Operative" class="d"><b>${escapeHtml(x.name||'')}</b></td><td data-l="Invoice">${escapeHtml(x.invoice_no||'—')}</td><td data-l="Week">w/c ${finDate(x.week)}</td><td data-l="For">${escapeHtml(x.description||'—')}</td><td data-l="Amount" class="num">${finMoney(x.amount)}</td><td data-l="Status">${x.status==='paid'?'<span class="finpill ok">Paid</span>':'<span class="finpill blue">To pay</span>'}</td></tr>`).join('')}
      </tbody></table></div>` : ''}
    ${lab.people.map(p=>`<div class="finkv"><span>${escapeHtml(finPersonName(p.user_id))} (PAYE) · ${p.days} day${p.days===1?'':'s'}${p.rate!=null?' × '+finMoney(p.rate):''}</span><b>${p.rate!=null?finMoney(p.cost):'<span class="finpill warn">No rate</span>'}</b></div>`).join('')}
    ${lab.manual.map(m=>`<div class="finkv"><span>${escapeHtml(m.name||finPersonName(m.user_id))} · ${finDate(m.work_date)}${m.description?' · '+escapeHtml(m.description):''}</span><b>${finMoney(m.amount)}</b></div>`).join('')}
    ${!lab.inv.length && !lab.people.length && !lab.manual.length ? `<p class="stub" style="margin:0;font-style:normal;">No labour on this job yet.</p>` : `<div class="finkv big"><span>Labour to date</span><b>${finMoney(lab.cost)}</b></div>`}
  </div>`;
}
// Old entry points now open the operative invoice form.
window.openFinManualLabour = function(siteId){ return openFinOpInvoice(siteId||''); };
window.openFinTimesheet = function(){ return openFinOpInvoice(''); };

/* ---------- One operative invoice / payment ---------- */
async function renderFinSubPayment(id){
  if(!finGuard()) return;
  if(!FIN_SETTINGS) await finLoadSettings();
  const __gen = RENDER_GEN;
  const p = (await dbSelect('fin_sub_payments', 'id=eq.'+id))[0];
  const rates = await finLoadRates();
  if(__gen !== RENDER_GEN) return;
  if(!p){ toast('Not found.'); go('#/finance/subs/opinv'); return; }
  const r = rates[p.worker_id ? 'w:'+p.worker_id : p.user_id] || {};
  const op = !p.sub_app_id;
  document.getElementById('app').innerHTML = shell(`
    <div class="card finhead">
      <div><div class="finhead-l">${op?'Operative':'Subcontractor'}</div><div class="finhead-v">${escapeHtml(p.name||'')}</div></div>
      <div><div class="finhead-l">Their invoice</div><div class="finhead-v">${escapeHtml(p.invoice_no||'—')}</div></div>
      <div><div class="finhead-l">Week</div><div class="finhead-v">w/c ${finDate(p.period_start)}</div></div>
      <div><div class="finhead-l">Status</div><div class="finhead-v">${p.status==='paid'?`<span class="finpill ok">Paid ${finDate(p.paid_on)}</span>`:p.status==='void'?'<span class="finpill grey">Cancelled</span>':'<span class="finpill blue">To pay</span>'}</div></div>
    </div>
    <div class="card">
      <p class="sectiontitle" style="margin-top:0;">Jobs</p>
      ${(p.lines||[]).map(l=>`<div class="finkv"><span>${escapeHtml(finJobTag(l.site_id)||l.description||'Labour')}${l.description && l.site_id?' · '+escapeHtml(l.description):''}${l.days?' · '+l.days+' day'+(Number(l.days)===1?'':'s'):''}</span><b>${finMoney(l.amount)}</b></div>`).join('')}
      ${Number(p.materials||0)?`<div class="finkv"><span>Materials they supplied</span><b>${finMoney(p.materials)}</b></div>`:''}
      <div class="finkv"><span>CIS taken off @ ${p.cis_rate}% of labour (you pay this to HMRC)</span><b>−${finMoney(p.cis_deduction)}</b></div>
      <div class="finkv big"><span>${p.status==='paid'?'Paid them':'Pay them'}</span><b>${finMoney(p.net_pay)}</b></div>
      ${r.vat_registered ? `<p class="stub" style="margin:6px 0 0;font-style:normal;">VAT registered: construction reverse charge — you account for the VAT.</p>` : ''}
      ${p.utr||r.utr ? `<p class="stub" style="margin:6px 0 0;font-style:normal;">UTR ${escapeHtml(p.utr||r.utr)}</p>` : `<p class="stub" style="margin:6px 0 0;font-style:normal;color:var(--warn);">No UTR saved — add it in People &amp; rates for the CIS return.</p>`}
    </div>
    <div class="row-gap" style="flex-wrap:wrap;">
      ${p.file_path ? `<button class="ghostbtn" style="flex:1;min-width:140px;" onclick="openFinDoc('${jsAttr(p.file_path)}','${jsAttr(p.file_name||'')}')">Their invoice</button>` : ''}
      ${op && p.status!=='paid' && p.status!=='void' ? `<button class="ghostbtn" style="flex:1;min-width:140px;" onclick="openFinOpInvoice(null,'${p.id}')">Edit</button>` : ''}
      ${p.status==='approved' ? `<button class="darkbtn" style="flex:1;min-width:140px;" onclick="finOpMarkPaid('${p.id}')">Mark paid today</button>` : ''}
      <button class="ghostbtn" style="flex:1;min-width:140px;" onclick="openFinCisStatement('${p.id}')">CIS payment statement</button>
    </div>
    ${typeof finXeroRowHtml==='function' ? finXeroRowHtml('sub', p) : ''}
    ${p.status==='approved' ? `<button class="linkbtn" style="margin-top:14px;color:var(--red);" onclick="finOpCancel('${p.id}')">Cancel this ${op?'invoice':'payment'}</button>` : ''}
  `, {title:op?'Operative invoice':'Subcontractor payment', subtitle:p.name, back:op?'#/finance/subs/opinv':'#/finance/subs/apps', tabs:false});
}
window.finOpMarkPaid = async function(id){ if(await dbUpdate('fin_sub_payments', id, {status:'paid', paid_on:finToday(), pay_date:finToday()})){ toast('Marked paid'); render(); } };
window.finOpCancel = async function(id){
  if(!await customConfirm('Cancel this invoice? It comes off the job’s costs and out of the pay run.')) return;
  if(!(await dbUpdate('fin_sub_payments', id, {status:'void'}))) return;
  await finOpPushToPm({id, lines:[]}, '');
  toast('Cancelled'); go('#/finance/subs/opinv');
};
