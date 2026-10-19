/* ================= OpHUB FINANCE — Phase C labour & CIS, Phase D plant =================
   Labour: days come from site sign-in (one day per person per job per date
   they checked in), priced at each person's day rate (Finance › Labour ›
   Rates). Extra labour not captured by sign-in is added by hand on the job.
   Subcontractor payments are made per week: days × rate (+ materials), CIS
   deducted on the labour part at 0/20/30%, with a payment and deduction
   statement PDF and a CIS summary per tax month (6th to 5th).
   Plant: hires per job with on/off-hire dates and a day or week rate; cost to
   date, reminders for kit on hire more than 4 weeks. */

const FIN_CIS_LABEL = {0:'Gross (0%)', 20:'Standard (20%)', 30:'Unverified (30%)'};
function finMonday(iso){ const d = new Date((iso||finToday())+'T12:00:00'); const w = (d.getDay()+6)%7; d.setDate(d.getDate()-w); return d.toISOString().slice(0,10); }
function finIsoDay(ts){ const d = new Date(ts); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function finPersonName(id){ return (PROFILES[id] && PROFILES[id].name) || 'Unknown'; }
// One day per person per job per date with a check-in.
function finLabourDaysFrom(checkins){
  const seen = new Set(), out = [];
  checkins.forEach(c=>{ if(c.type && c.type!=='in') return; const d = finIsoDay(c.ts); const k = c.user_id+'|'+c.site_id+'|'+d; if(seen.has(k)) return; seen.add(k); out.push({user_id:c.user_id, site_id:c.site_id, date:d}); });
  return out;
}
async function finLoadRates(){ const rows = await dbSelect('fin_labour_rates', 'org_id=eq.'+ME.org_id); const m = {}; rows.forEach(r=>{ m[r.user_id] = r; }); return m; }
// Labour cost on one job: sign-in days × rate + manual entries.
async function finJobLabour(siteId){
  const [cks, manual, rates] = await Promise.all([
    dbSelect('checkins', 'site_id=eq.'+siteId+'&type=eq.in&select=user_id,site_id,ts,type&order=ts.desc&limit=20000'),
    dbSelect('fin_labour_manual', 'site_id=eq.'+siteId+'&order=work_date.desc'),
    finLoadRates(),
  ]);
  const days = finLabourDaysFrom(cks);
  const byUser = {};
  days.forEach(d=>{ const u = byUser[d.user_id] = byUser[d.user_id] || {user_id:d.user_id, days:0}; u.days++; });
  let cost = 0, noRate = 0;
  Object.values(byUser).forEach(u=>{ const r = rates[u.user_id]; u.rate = r && r.day_rate!=null ? Number(r.day_rate) : null; u.cost = u.rate!=null ? finRound(u.days*u.rate) : 0; if(u.rate==null) noRate++; cost += u.cost; });
  const manualCost = manual.reduce((t,m)=>t+Number(m.amount||0), 0);
  return {people:Object.values(byUser).sort((a,b)=>b.days-a.days), manual, cost:finRound(cost+manualCost), noRate};
}
function finPlantCost(h){
  const end = h.off_hire || finToday();
  const days = Math.max(1, Math.round((new Date(end+'T12:00:00') - new Date(h.on_hire+'T12:00:00'))/864e5) + 1);
  const cost = h.rate_period==='day' ? days*Number(h.rate||0) : finRound(days/7*Number(h.rate||0));
  return {days, weeks:Math.round(days/7*10)/10, cost:finRound(cost)};
}

/* ---------------- job page cards ---------------- */
function finLabourCardHtml(siteId, lab){
  return `<div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
      <p class="sectiontitle" style="margin:0;">Labour</p>
      <button class="ghostbtn" style="padding:6px 12px;width:auto;flex:none;" onclick="openFinManualLabour('${siteId}')">+ Add labour</button>
    </div>
    <p class="stub" style="margin:4px 0 8px;font-style:normal;">From site sign-in (a day per person per date) at each person’s day rate, plus anything added by hand.${lab.noRate?` <b style="color:var(--warn);">${lab.noRate} ${lab.noRate===1?'person has':'people have'} no day rate yet</b> — <a href="#/finance/labour/rates">set rates</a>.`:''}</p>
    ${lab.people.map(p=>`<div class="finkv"><span>${escapeHtml(finPersonName(p.user_id))} · ${p.days} day${p.days===1?'':'s'}${p.rate!=null?' × '+finMoney(p.rate):''}</span><b>${p.rate!=null?finMoney(p.cost):'<span class="finpill warn">No rate</span>'}</b></div>`).join('')}
    ${lab.manual.map(m=>`<div class="finkv"><span>${escapeHtml(m.name||finPersonName(m.user_id))} · ${finDate(m.work_date)}${m.description?' · '+escapeHtml(m.description):''} <button class="linkbtn" onclick="deleteFinManualLabour('${m.id}')">remove</button></span><b>${finMoney(m.amount)}</b></div>`).join('')}
    ${!lab.people.length && !lab.manual.length ? `<p class="stub" style="margin:0;font-style:normal;">No labour on this job yet.</p>` : `<div class="finkv big"><span>Labour to date</span><b>${finMoney(lab.cost)}</b></div>`}
  </div>`;
}
window.openFinManualLabour = async function(siteId){
  await loadAllProfiles();
  const people = Object.values(PROFILES).filter(p=>['operative','site_manager','pm'].includes(p.role)).sort((a,b)=>a.name.localeCompare(b.name));
  let ov = document.getElementById('finLabOverlay');
  if(!ov){ ov = document.createElement('div'); ov.id = 'finLabOverlay'; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
  ov.onclick = e=>{ if(e.target===ov) ov.style.display='none'; };
  ov.innerHTML = `<div class="geo-modal-card">
    <h3>Add labour</h3>
    <p class="stub" style="margin:0 0 10px;font-style:normal;">For work not captured by sign-in: price work, a gang, or someone without the app.</p>
    <div class="formfield"><label class="field-label">Who</label><select id="finLabWho"><option value="">Someone not in the app…</option>${people.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}</select></div>
    <div class="formfield"><label class="field-label">Name (if not in the app)</label><input type="text" id="finLabName"></div>
    <div class="fingrid2">
      <div class="formfield"><label class="field-label">Date</label><input type="date" id="finLabDate" value="${finToday()}"></div>
      <div class="formfield"><label class="field-label">Days (optional)</label><input type="text" inputmode="decimal" id="finLabDays"></div>
    </div>
    <div class="formfield"><label class="field-label">Amount (£)</label><input type="text" inputmode="decimal" id="finLabAmt"></div>
    <div class="formfield"><label class="field-label">What for</label><input type="text" id="finLabDesc" placeholder="e.g. price work, lead to valleys"></div>
    <button class="darkbtn" style="width:100%;" onclick="saveFinManualLabour('${siteId}')">Save</button>
    <button class="geo-modal-cancel" onclick="document.getElementById('finLabOverlay').style.display='none'">Cancel</button>
  </div>`;
  ov.style.display = 'flex';
};
window.saveFinManualLabour = async function(siteId){
  const who = finVal('finLabWho'), name = finVal('finLabName'), amt = finNum(finVal('finLabAmt')), days = finNum(finVal('finLabDays'));
  if(!who && !name){ toast('Choose who, or type a name.'); return; }
  if(amt===null || isNaN(amt)){ toast('Enter the amount.'); return; }
  const r = await dbInsert('fin_labour_manual', {org_id:ME.org_id, site_id:siteId, user_id:who||null, name:who?null:name, work_date:finVal('finLabDate')||finToday(), days:(days===null||isNaN(days))?null:days, amount:finRound(amt), description:finVal('finLabDesc')||null, created_by:ME.id});
  if(!r) return;
  document.getElementById('finLabOverlay').style.display = 'none'; toast('Labour added'); render();
};
window.deleteFinManualLabour = async function(id){
  const btn = event && event.target;
  if(btn && btn.dataset.sure!=='1'){ btn.dataset.sure='1'; btn.textContent='tap again'; return; }
  if(await dbDelete('fin_labour_manual', id)){ toast('Removed'); render(); }
};

function finPlantCardHtml(siteId, hires){
  const on = hires.filter(h=>!h.off_hire);
  const total = hires.reduce((t,h)=>t+finPlantCost(h).cost, 0);
  return `<div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
      <p class="sectiontitle" style="margin:0;">Plant hire</p>
      <button class="ghostbtn" style="padding:6px 12px;width:auto;flex:none;" onclick="openFinPlantForm('${siteId}')">+ Add hire</button>
    </div>
    ${hires.length ? hires.map(h=>{ const c = finPlantCost(h); const long = !h.off_hire && c.days > 28; return `<div class="finkv" style="cursor:pointer;" onclick="openFinPlantForm('${siteId}','${h.id}')"><span><b style="color:var(--ink);">${escapeHtml(h.item)}</b>${h.supplier_name?' · '+escapeHtml(h.supplier_name):''}<em style="display:block;font-style:normal;font-size:12px;">${finDate(h.on_hire)} → ${h.off_hire?finDate(h.off_hire):'<span style="color:'+(long?'var(--red)':'var(--ok)')+';font-weight:700;">on hire '+c.weeks+' wk</span>'} · ${finMoney(h.rate)}/${h.rate_period}</em></span><b>${finMoney(c.cost)}</b></div>`; }).join('')
      + `<div class="finkv big"><span>Plant to date${on.length?' ('+on.length+' on hire)':''}</span><b>${finMoney(total)}</b></div>`
      : `<p class="stub" style="margin:8px 0 0;font-style:normal;">No plant on hire for this job.</p>`}
  </div>`;
}
window.openFinPlantForm = async function(siteId, id){
  const h = id ? (await dbSelect('fin_plant_hires', 'id=eq.'+id))[0] : null;
  let ov = document.getElementById('finPlantOverlay');
  if(!ov){ ov = document.createElement('div'); ov.id = 'finPlantOverlay'; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
  ov.onclick = e=>{ if(e.target===ov) ov.style.display='none'; };
  ov.innerHTML = `<div class="geo-modal-card">
    <h3>${h?'Plant hire':'Add plant hire'}</h3>
    <div class="formfield"><label class="field-label">What</label><input type="text" id="finPlItem" value="${escapeHtml(h?h.item:'')}" placeholder="e.g. Scaffold hoist, cherry picker"></div>
    <div class="fingrid2">
      <div class="formfield"><label class="field-label">Hire company</label><input type="text" id="finPlSup" value="${escapeHtml(h&&h.supplier_name||'')}"></div>
      <div class="formfield"><label class="field-label">Hire ref / contract no.</label><input type="text" id="finPlRef" value="${escapeHtml(h&&h.hire_ref||'')}"></div>
      <div class="formfield"><label class="field-label">On hire</label><input type="date" id="finPlOn" value="${h?h.on_hire:finToday()}"></div>
      <div class="formfield"><label class="field-label">Off hire</label><input type="date" id="finPlOff" value="${h&&h.off_hire||''}"></div>
      <div class="formfield"><label class="field-label">Rate (£)</label><input type="text" inputmode="decimal" id="finPlRate" value="${h?h.rate:''}"></div>
      <div class="formfield"><label class="field-label">Per</label><select id="finPlPer"><option value="week" ${!h||h.rate_period==='week'?'selected':''}>Week</option><option value="day" ${h&&h.rate_period==='day'?'selected':''}>Day</option></select></div>
    </div>
    <div class="formfield"><label class="field-label">Notes</label><input type="text" id="finPlNotes" value="${escapeHtml(h&&h.notes||'')}"></div>
    <button class="darkbtn" style="width:100%;" onclick="saveFinPlant('${siteId}','${h?h.id:''}')">Save</button>
    ${h && !h.off_hire ? `<button class="ghostbtn" style="width:100%;margin-top:8px;" onclick="document.getElementById('finPlOff').value='${finToday()}';saveFinPlant('${siteId}','${h.id}')">Off-hire today</button>` : ''}
    ${h ? `<button class="ghostbtn" style="width:100%;margin-top:8px;color:var(--red);" onclick="deleteFinPlant('${h.id}')">Remove</button>` : ''}
    <button class="geo-modal-cancel" onclick="document.getElementById('finPlantOverlay').style.display='none'">Cancel</button>
  </div>`;
  ov.style.display = 'flex';
};
window.saveFinPlant = async function(siteId, id){
  const item = finVal('finPlItem'), rate = finNum(finVal('finPlRate')), on = finVal('finPlOn'), off = finVal('finPlOff');
  if(!item){ toast('Say what’s on hire.'); return; }
  if(!on){ toast('Enter the on-hire date.'); return; }
  if(rate===null || isNaN(rate)){ toast('Enter the hire rate.'); return; }
  if(off && off < on){ toast('Off-hire can’t be before on-hire.'); return; }
  const row = {item, supplier_name:finVal('finPlSup')||null, hire_ref:finVal('finPlRef')||null, on_hire:on, off_hire:off||null, rate:finRound(rate), rate_period:finVal('finPlPer')||'week', notes:finVal('finPlNotes')||null};
  const r = id ? await dbUpdate('fin_plant_hires', id, row) : await dbInsert('fin_plant_hires', Object.assign({org_id:ME.org_id, site_id:siteId, created_by:ME.id}, row));
  if(!r) return;
  document.getElementById('finPlantOverlay').style.display = 'none'; toast(off ? 'Saved — off hire '+finDate(off) : 'Saved'); render();
};
window.deleteFinPlant = async function(id){
  const btn = event && event.target;
  if(btn && btn.dataset.sure!=='1'){ btn.dataset.sure='1'; btn.textContent='Tap again to remove'; return; }
  if(await dbDelete('fin_plant_hires', id)){ document.getElementById('finPlantOverlay').style.display='none'; toast('Removed'); render(); }
};

/* ---------------- Labour & CIS (company-wide) ---------------- */
let finLabWeek = null;
async function renderFinLabour(){
  if(!finGuard()) return;
  const __gen = RENDER_GEN;
  if(!finLabWeek) finLabWeek = finMonday(finAddDays(finToday(), -7));
  const from = finLabWeek, to = finAddDays(from, 6);
  await loadAllProfiles();
  const [cks, rates, pays] = await Promise.all([
    dbSelect('checkins', 'type=eq.in&ts=gte.'+from+'T00:00:00&ts=lte.'+to+'T23:59:59&select=user_id,site_id,ts,type&limit=20000'),
    finLoadRates(),
    dbSelect('fin_sub_payments', 'org_id=eq.'+ME.org_id+'&period_start=eq.'+from+'&status=neq.void'),
  ]);
  if(__gen !== RENDER_GEN) return;
  const days = finLabourDaysFrom(cks);
  const people = {};
  days.forEach(d=>{ const p = people[d.user_id] = people[d.user_id] || {user_id:d.user_id, sites:{}, days:0}; p.sites[d.site_id] = (p.sites[d.site_id]||0)+1; p.days++; });
  const list = Object.values(people).map(p=>{ const r = rates[p.user_id] || {}; return Object.assign(p, {rate:r.day_rate!=null?Number(r.day_rate):null, pay_type:r.pay_type||'subcontractor', cis:r.cis_rate!=null?r.cis_rate:20, amount: r.day_rate!=null ? finRound(p.days*Number(r.day_rate)) : null}); }).sort((a,b)=>finPersonName(a.user_id).localeCompare(finPersonName(b.user_id)));
  const total = list.reduce((t,p)=>t+(p.amount||0), 0);
  const payBy = {}; pays.forEach(p=>{ if(p.user_id) payBy[p.user_id] = p; });
  const fmtW = d=>new Date(d+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric', month:'short'});
  document.getElementById('app').innerHTML = shell(`
    <div class="card" style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
      <button class="ghostbtn" style="width:auto;" onclick="finLabWeek=finAddDays(finLabWeek,-7);render()">‹</button>
      <div style="text-align:center;"><div class="finhead-l">Week</div><div class="finhead-v">${fmtW(from)} – ${fmtW(to)}</div></div>
      <button class="ghostbtn" style="width:auto;" onclick="finLabWeek=finAddDays(finLabWeek,7);render()">›</button>
    </div>
    <div class="row-gap" style="flex-wrap:wrap;margin-bottom:12px;">
      <button class="ghostbtn" style="flex:1;" onclick="go('#/finance/labour/rates')">Rates &amp; CIS details</button>
      <button class="ghostbtn" style="flex:1;" onclick="go('#/finance/labour/cis')">CIS summary</button>
    </div>
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;"><p class="sectiontitle" style="margin:0;">From site sign-in</p><b>${finMoney(total)}</b></div>
      ${list.length ? list.map(p=>{ const pay = payBy[p.user_id]; return `<div class="finlabrow">
        <div><b>${escapeHtml(finPersonName(p.user_id))}</b> <span class="finpill ${p.pay_type==='paye'?'grey':'blue'}">${p.pay_type==='paye'?'PAYE':'Sub · CIS '+p.cis+'%'}</span>
          <div class="stub" style="margin:2px 0 0;font-style:normal;">${Object.keys(p.sites).map(s=>{ const st = SITES.find(x=>x.id===s)||{}; return escapeHtml((st.job_number||'')+' '+(st.name||'Job'))+' ×'+p.sites[s]; }).join(' · ')}</div></div>
        <div style="text-align:right;"><b>${p.amount!=null?finMoney(p.amount):'<span class="finpill warn">No rate</span>'}</b><div class="stub" style="margin:2px 0 0;font-style:normal;">${p.days} day${p.days===1?'':'s'}${p.rate!=null?' × '+finMoney(p.rate):''}</div>
          ${p.pay_type!=='paye' ? (pay ? `<button class="linkbtn" style="color:var(--blue);" onclick="go('#/finance/labour/payment/${pay.id}')">${pay.status==='paid'?'Paid':'Payment '+pay.status}</button>` : (p.rate!=null ? `<button class="linkbtn" style="color:var(--blue);" onclick="newFinSubPayment('${p.user_id}')">Make payment</button>` : '')) : ''}</div>
      </div>`; }).join('') : `<p class="stub" style="margin:8px 0 0;font-style:normal;">Nobody signed in on site this week.</p>`}
    </div>
    ${pays.filter(p=>!p.user_id || !people[p.user_id]).map(p=>`<button class="pmrow pmrow-card finrow" onclick="go('#/finance/labour/payment/${p.id}')"><span class="pmrow-txt"><span class="pmrow-t">${escapeHtml(p.name)}</span><span class="pmrow-s">Payment ${p.status}</span></span><span class="finval">${finMoney(p.net_pay)}</span></button>`).join('')}
  `, {title:'Labour & CIS', subtitle:'OpHUB Finance', back:'#/finance', tabs:false});
}
window.newFinSubPayment = async function(userId){
  const from = finLabWeek, to = finAddDays(from, 6);
  const [cks, rates] = await Promise.all([
    dbSelect('checkins', 'user_id=eq.'+userId+'&type=eq.in&ts=gte.'+from+'T00:00:00&ts=lte.'+to+'T23:59:59&select=user_id,site_id,ts,type'),
    finLoadRates(),
  ]);
  const r = rates[userId] || {};
  const bySite = {}; finLabourDaysFrom(cks).forEach(d=>{ bySite[d.site_id] = (bySite[d.site_id]||0)+1; });
  const lines = Object.keys(bySite).map(s=>({site_id:s, days:bySite[s], rate:Number(r.day_rate||0), amount:finRound(bySite[s]*Number(r.day_rate||0))}));
  const labour = finRound(lines.reduce((t,l)=>t+l.amount,0)), cis = r.cis_rate!=null ? r.cis_rate : 20;
  const ded = finRound(labour*cis/100);
  const rows = await dbInsert('fin_sub_payments', {org_id:ME.org_id, user_id:userId, name:r.trading_name || finPersonName(userId), period_start:from, period_end:to, lines, labour, materials:0, gross:labour, cis_rate:cis, cis_deduction:ded, net_pay:finRound(labour-ded), status:'draft', created_by:ME.id});
  if(rows && rows[0]) go('#/finance/labour/payment/'+rows[0].id);
};
let finPay = null;
async function renderFinSubPayment(id){
  if(!finGuard()) return;
  const __gen = RENDER_GEN;
  const p = (await dbSelect('fin_sub_payments', 'id=eq.'+id))[0];
  const rates = await finLoadRates();
  if(__gen !== RENDER_GEN) return;
  if(!p){ toast('Payment not found.'); go('#/finance/labour'); return; }
  if(!finPay || finPay.id!==p.id) finPay = JSON.parse(JSON.stringify(p));
  const r = (p.user_id && rates[p.user_id]) || {};
  const locked = p.status==='paid' || p.status==='void';
  document.getElementById('app').innerHTML = shell(`
    <div class="card finhead">
      <div><div class="finhead-l">Subcontractor</div><div class="finhead-v">${escapeHtml(p.name)}</div></div>
      <div><div class="finhead-l">Status</div><div class="finhead-v"><span class="finpill ${p.status==='paid'?'ok':p.status==='approved'?'blue':'grey'}">${p.status[0].toUpperCase()+p.status.slice(1)}</span></div></div>
      <div><div class="finhead-l">Week</div><div class="finhead-v">${finDate(p.period_start)}</div></div>
      <div><div class="finhead-l">UTR</div><div class="finhead-v">${escapeHtml(r.utr||'—')}</div></div>
    </div>
    <div class="card">
      <p class="sectiontitle" style="margin-top:0;">Labour</p>
      ${finPay.lines.map((l,i)=>{ const st = SITES.find(x=>x.id===l.site_id)||{}; return `<div class="finitem"><div class="finitem-d">${escapeHtml((st.job_number?st.job_number+' · ':'')+(st.name||l.description||'Labour'))}</div>
        <div class="finitem-in">${locked ? `<span class="finitem-sum">${l.days} day${l.days==1?'':'s'} × ${finMoney(l.rate)}</span>` : `<label>Days<input type="text" inputmode="decimal" value="${l.days}" oninput="finPaySet(${i},'days',this.value)"></label><label>Rate £<input type="text" inputmode="decimal" value="${l.rate}" oninput="finPaySet(${i},'rate',this.value)"></label>`}<b id="finPayL-${i}">${finMoney(l.amount)}</b></div></div>`; }).join('')}
    </div>
    <div class="card">
      <div class="fingrid2">
        <div class="formfield"><label class="field-label">Materials they supplied (£, no CIS)</label><input type="text" inputmode="decimal" id="finPayMat" value="${finPay.materials||0}" ${locked?'disabled':''} oninput="finPay.materials=finNum(this.value)||0;finPayPaint()"></div>
        <div class="formfield"><label class="field-label">CIS rate</label><select id="finPayCis" ${locked?'disabled':''} onchange="finPay.cis_rate=+this.value;finPayPaint()">${Object.keys(FIN_CIS_LABEL).map(k=>`<option value="${k}" ${Number(finPay.cis_rate)===Number(k)?'selected':''}>${FIN_CIS_LABEL[k]}</option>`).join('')}</select></div>
      </div>
      <div id="finPaySum"></div>
      ${r.vat_registered ? `<p class="stub" style="margin:6px 0 0;font-style:normal;">VAT registered: domestic reverse charge applies, so you account for the VAT, not them.</p>` : ''}
    </div>
    <div class="row-gap" style="flex-wrap:wrap;">
      ${p.status==='draft' ? `<button class="darkbtn" style="flex:1;" onclick="saveFinSubPayment('approved')">Save &amp; approve</button><button class="ghostbtn" style="flex:1;" onclick="saveFinSubPayment('draft')">Save draft</button>` : ''}
      ${p.status==='approved' ? `<button class="darkbtn" style="flex:1;" onclick="saveFinSubPayment('paid')">Mark paid today</button>` : ''}
      <button class="ghostbtn" style="flex:1;" onclick="openFinCisStatement('${p.id}')">📄 Payment statement</button>
    </div>
    ${p.status!=='paid' && p.status!=='void' ? `<button class="ghostbtn" style="width:100%;margin-top:10px;color:var(--red);" onclick="voidFinSubPayment('${p.id}')">Cancel this payment</button>` : ''}
  `, {title:'Subcontractor payment', subtitle:p.name, back:'#/finance/labour', tabs:false});
  finPayPaint();
}
function finPayCalc(){
  const labour = finRound(finPay.lines.reduce((t,l)=>t+Number(l.amount||0),0)), mat = finRound(Number(finPay.materials||0));
  const ded = finRound(labour*Number(finPay.cis_rate||0)/100);
  return {labour, materials:mat, gross:finRound(labour+mat), cis_deduction:ded, net_pay:finRound(labour+mat-ded)};
}
window.finPaySet = function(i, k, v){ const l = finPay.lines[i]; l[k] = finNum(v)||0; l.amount = finRound(Number(l.days||0)*Number(l.rate||0)); const el = document.getElementById('finPayL-'+i); if(el) el.textContent = finMoney(l.amount); finPayPaint(); };
window.finPayPaint = function(){
  const c = finPayCalc(); const el = document.getElementById('finPaySum'); if(!el) return;
  el.innerHTML = `<div class="finkv"><span>Labour</span><b>${finMoney(c.labour)}</b></div><div class="finkv"><span>Materials</span><b>${finMoney(c.materials)}</b></div>
    <div class="finkv"><span>Gross</span><b>${finMoney(c.gross)}</b></div><div class="finkv"><span>CIS deducted @ ${finPay.cis_rate}% of labour</span><b>−${finMoney(c.cis_deduction)}</b></div>
    <div class="finkv big"><span>Pay them</span><b>${finMoney(c.net_pay)}</b></div>`;
};
window.saveFinSubPayment = async function(status){
  const c = finPayCalc();
  const row = Object.assign({lines:finPay.lines, cis_rate:Number(finPay.cis_rate), status}, c);
  if(status==='paid') row.paid_on = finToday();
  const r = await dbUpdate('fin_sub_payments', finPay.id, row);
  if(!r) return;
  finPay = null; toast(status==='paid' ? 'Marked paid' : status==='approved' ? 'Approved' : 'Saved'); render();
};
window.voidFinSubPayment = async function(id){
  const btn = event && event.target;
  if(btn && btn.dataset.sure!=='1'){ btn.dataset.sure='1'; btn.textContent='Tap again to cancel it'; return; }
  if(await dbUpdate('fin_sub_payments', id, {status:'void'})){ finPay = null; toast('Payment cancelled'); go('#/finance/labour'); }
};

/* ---- rates ---- */
async function renderFinLabourRates(){
  if(!finGuard()) return;
  const __gen = RENDER_GEN;
  await loadAllProfiles();
  const rates = await finLoadRates();
  if(__gen !== RENDER_GEN) return;
  const people = Object.values(PROFILES).filter(p=>['operative','site_manager'].includes(p.role)).sort((a,b)=>a.name.localeCompare(b.name));
  document.getElementById('app').innerHTML = shell(`
    <p class="stub" style="margin:0 0 10px;font-style:normal;">Day rates price the labour on each job from site sign-in. CIS details are used on subcontractor payments and statements. Only you can see these.</p>
    ${people.map(p=>{ const r = rates[p.id] || {}; return `<div class="card finrate" id="finRate-${p.id}">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;"><b>${escapeHtml(p.name)}</b><span class="stub" style="margin:0;font-style:normal;">${r.updated_at?'Saved':''}</span></div>
      <div class="fingrid3" style="margin-top:6px;">
        <div class="formfield"><label class="field-label">Pay</label><select data-k="pay_type"><option value="subcontractor" ${r.pay_type!=='paye'?'selected':''}>Subcontractor</option><option value="paye" ${r.pay_type==='paye'?'selected':''}>PAYE</option></select></div>
        <div class="formfield"><label class="field-label">Day rate £</label><input type="text" inputmode="decimal" data-k="day_rate" value="${r.day_rate!=null?r.day_rate:''}"></div>
        <div class="formfield"><label class="field-label">CIS</label><select data-k="cis_rate">${Object.keys(FIN_CIS_LABEL).map(k=>`<option value="${k}" ${Number(r.cis_rate!=null?r.cis_rate:20)===Number(k)?'selected':''}>${FIN_CIS_LABEL[k]}</option>`).join('')}</select></div>
        <div class="formfield"><label class="field-label">UTR</label><input type="text" data-k="utr" value="${escapeHtml(r.utr||'')}"></div>
        <div class="formfield"><label class="field-label">Trading name</label><input type="text" data-k="trading_name" value="${escapeHtml(r.trading_name||'')}"></div>
        <div class="formfield"><label class="field-label">VAT registered</label><select data-k="vat_registered"><option value="false">No</option><option value="true" ${r.vat_registered?'selected':''}>Yes</option></select></div>
      </div>
      <button class="ghostbtn" style="width:100%;" onclick="saveFinRate('${p.id}')">Save</button>
    </div>`; }).join('') || '<div class="empty">No operatives yet.</div>'}
  `, {title:'Rates & CIS details', subtitle:'OpHUB Finance', back:'#/finance/labour', tabs:false});
}
window.saveFinRate = async function(userId){
  const card = document.getElementById('finRate-'+userId); if(!card) return;
  const v = k=>{ const el = card.querySelector(`[data-k="${k}"]`); return el ? el.value.trim() : ''; };
  const rate = finNum(v('day_rate'));
  if(rate!==null && isNaN(rate)){ toast('Day rate must be a number.'); return; }
  const res = await sbFetch('/rest/v1/fin_labour_rates?on_conflict=org_id,user_id', {method:'POST', headers:{'Prefer':'resolution=merge-duplicates'}, body:JSON.stringify({
    org_id:ME.org_id, user_id:userId, pay_type:v('pay_type')||'subcontractor', day_rate:rate, cis_rate:Number(v('cis_rate')||20), utr:v('utr')||null, trading_name:v('trading_name')||null, vat_registered:v('vat_registered')==='true', updated_at:new Date().toISOString()})});
  if(!res.ok){ toast('Save failed — '+(await safeErr(res))); return; }
  toast('Saved '+finPersonName(userId));
};

/* ---- CIS summary by tax month (6th to 5th) ---- */
let finCisMonth = null; // the 6th that starts the tax month
function finTaxMonthStart(iso){ const d = new Date((iso||finToday())+'T12:00:00'); if(d.getDate() < 6) d.setMonth(d.getMonth()-1); d.setDate(6); return d.toISOString().slice(0,10); }
async function renderFinCis(){
  if(!finGuard()) return;
  const __gen = RENDER_GEN;
  if(!finCisMonth) finCisMonth = finTaxMonthStart(finAddDays(finToday(), -30));
  const start = finCisMonth, endD = new Date(start+'T12:00:00'); endD.setMonth(endD.getMonth()+1); endD.setDate(5); const end = endD.toISOString().slice(0,10);
  const [pays, rates] = await Promise.all([dbSelect('fin_sub_payments', 'org_id=eq.'+ME.org_id+'&status=eq.paid&paid_on=gte.'+start+'&paid_on=lte.'+end+'&order=name.asc'), finLoadRates()]);
  if(__gen !== RENDER_GEN) return;
  const by = {};
  pays.forEach(p=>{ const k = p.user_id || p.name; const b = by[k] = by[k] || {name:p.name, user_id:p.user_id, gross:0, materials:0, cis:0, net:0, n:0}; b.gross += Number(p.gross); b.materials += Number(p.materials); b.cis += Number(p.cis_deduction); b.net += Number(p.net_pay); b.n++; });
  const rows = Object.values(by);
  const tot = rows.reduce((t,r)=>({gross:t.gross+r.gross, cis:t.cis+r.cis}), {gross:0, cis:0});
  const shift = n=>{ const d = new Date(finCisMonth+'T12:00:00'); d.setMonth(d.getMonth()+n); return d.toISOString().slice(0,10); };
  document.getElementById('app').innerHTML = shell(`
    <div class="card" style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
      <button class="ghostbtn" style="width:auto;" onclick="finCisMonth='${shift(-1)}';render()">‹</button>
      <div style="text-align:center;"><div class="finhead-l">Tax month</div><div class="finhead-v">${finDate(start)} – ${finDate(end)}</div></div>
      <button class="ghostbtn" style="width:auto;" onclick="finCisMonth='${shift(1)}';render()">›</button>
    </div>
    <div class="pmstats finstats" style="grid-template-columns:1fr 1fr;"><div class="pmstat"><b>${finMoney(tot.gross)}</b><span>Paid to subcontractors</span></div><div class="pmstat"><b>${finMoney(tot.cis)}</b><span>CIS deducted (to pay HMRC)</span></div></div>
    <div class="card">
      <p class="sectiontitle" style="margin-top:0;">For the monthly CIS return</p>
      ${rows.length ? rows.map(r=>{ const rr = (r.user_id && rates[r.user_id]) || {}; return `<div class="finlabrow"><div><b>${escapeHtml(r.name)}</b><div class="stub" style="margin:2px 0 0;font-style:normal;">UTR ${escapeHtml(rr.utr||'missing')} · ${r.n} payment${r.n===1?'':'s'}</div></div>
        <div style="text-align:right;font-size:13px;">Gross <b>${finMoney(r.gross)}</b><br>Materials ${finMoney(r.materials)}<br>CIS <b>${finMoney(r.cis)}</b></div></div>`; }).join('') : `<p class="stub" style="margin:0;font-style:normal;">No subcontractor payments marked paid in this tax month.</p>`}
      <p class="stub" style="margin:8px 0 0;font-style:normal;">When Xero is linked, the CIS return is made from Xero. Until then use these figures; the HMRC deadline is the 19th.</p>
    </div>
  `, {title:'CIS summary', subtitle:'OpHUB Finance', back:'#/finance/labour', tabs:false});
}

/* ---- payment and deduction statement PDF ---- */
window.openFinCisStatement = async function(id){
  const p = (await dbSelect('fin_sub_payments', 'id=eq.'+id))[0]; if(!p) return;
  const [st, rates] = await Promise.all([finLoadSettings(), finLoadRates()]);
  const r = (p.user_id && rates[p.user_id]) || {};
  if(!(await loadLib('PDFLib'))){ toast('Could not load the PDF tool.'); return; }
  const pdf = await PDFLib.PDFDocument.create(); const page = pdf.addPage([595.28, 841.89]);
  const reg = await pdf.embedFont(PDFLib.StandardFonts.Helvetica), bold = await pdf.embedFont(PDFLib.StandardFonts.HelveticaBold);
  const INK = PDFLib.rgb(0.07,0.08,0.09), SLATE = PDFLib.rgb(0.36,0.39,0.45);
  const BRAND = finHexRgb(ORG && ORG.color_primary, PDFLib.rgb(0.78,0.06,0.18));
  page.drawRectangle({x:0, y:841.89-70, width:595.28, height:70, color:BRAND});
  page.drawText((ORG&&ORG.name)||'', {x:44, y:841.89-42, size:16, font:bold, color:PDFLib.rgb(1,1,1)});
  page.drawText('Payment and deduction statement', {x:44, y:841.89-60, size:10, font:reg, color:PDFLib.rgb(1,1,1)});
  let y = 720; const kv = (k, v, b)=>{ page.drawText(k, {x:44, y, size:10, font:reg, color:SLATE}); page.drawText(String(v||'—'), {x:300, y, size:b?12:10.5, font:b?bold:reg, color:INK}); y -= b?22:18; };
  const taxEnd = (()=>{ const d = new Date((p.paid_on||p.period_end)+'T12:00:00'); if(d.getDate()>5) d.setMonth(d.getMonth()+1); d.setDate(5); return d.toISOString().slice(0,10); })();
  kv('Contractor', (ORG&&ORG.name)||''); kv('Contractor UTR', st.contractor_utr); kv('Employer reference', st.employer_ref);
  y -= 8; kv('Subcontractor', p.name); kv('Subcontractor UTR', r.utr); kv('Tax month ending', finDate(taxEnd)); kv('Work period', finDate(p.period_start)+' – '+finDate(p.period_end)); kv('Paid on', p.paid_on ? finDate(p.paid_on) : 'Not paid yet');
  y -= 8; page.drawLine({start:{x:44,y:y+8}, end:{x:551,y:y+8}, thickness:0.6, color:PDFLib.rgb(0.86,0.88,0.9)}); y -= 8;
  kv('Gross amount paid (excl. VAT)', finMoney(p.gross)); kv('Less cost of materials', finMoney(p.materials)); kv('Amount liable to deduction', finMoney(p.labour));
  kv('Amount deducted ('+p.cis_rate+'%)', finMoney(p.cis_deduction), true); kv('Amount payable', finMoney(p.net_pay), true);
  y -= 10; page.drawText('Keep this statement: it shows the tax deducted under the Construction Industry Scheme.', {x:44, y, size:9, font:reg, color:SLATE});
  const bytes = await pdf.save();
  viewPdfInApp(bytes, 'CIS statement - '+p.name+' - '+p.period_start+'.pdf');
};
