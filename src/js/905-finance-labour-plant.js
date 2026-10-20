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
// People are app users (key = user id) or workers set up in Finance with no
// app login (key = 'w:<fin_labour_rates id>') — e.g. Finance-only companies.
let FIN_WORKERS = {};
function finPersonName(id){
  if(id && String(id).startsWith('w:')){ const w = FIN_WORKERS[String(id).slice(2)]; return (w && (w.name || w.trading_name)) || 'Worker'; }
  return (PROFILES[id] && PROFILES[id].name) || 'Unknown';
}
function finPersonKey(r){ return r.user_id || (r.worker_id ? 'w:'+r.worker_id : 'n:'+(r.name||'')); }
// One day per person per job per date with a check-in.
function finLabourDaysFrom(checkins){
  const seen = new Set(), out = [];
  checkins.forEach(c=>{ if(c.type && c.type!=='in') return; const d = finIsoDay(c.ts); const k = c.user_id+'|'+c.site_id+'|'+d; if(seen.has(k)) return; seen.add(k); out.push({user_id:c.user_id, site_id:c.site_id, date:d}); });
  return out;
}
async function finLoadRates(){ const rows = await dbSelect('fin_labour_rates', 'org_id=eq.'+ME.org_id); const m = {}; FIN_WORKERS = {}; rows.forEach(r=>{ if(r.user_id) m[r.user_id] = r; else { m['w:'+r.id] = r; FIN_WORKERS[r.id] = r; } }); return m; }
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
      <button class="ghostbtn" style="padding:6px 12px;width:auto;flex:none;" onclick="openFinManualLabour('${siteId}')">${typeof isFinanceOnly==='function' && isFinanceOnly() ? '+ Add timesheet' : '+ Add labour'}</button>
    </div>
    <p class="stub" style="margin:4px 0 8px;font-style:normal;">${typeof isFinanceOnly==='function' && isFinanceOnly() ? 'From timesheets, at each person’s day rate.' : 'From site sign-in (a day per person per date) at each person’s day rate, plus anything added by hand.'}${lab.noRate?` <b style="color:var(--warn);">${lab.noRate} ${lab.noRate===1?'person has':'people have'} no day rate yet</b> — <a href="#/finance/labour/rates">set rates</a>.`:''}</p>
    ${lab.people.map(p=>`<div class="finkv"><span>${escapeHtml(finPersonName(p.user_id))} · ${p.days} day${p.days===1?'':'s'}${p.rate!=null?' × '+finMoney(p.rate):''}</span><b>${p.rate!=null?finMoney(p.cost):'<span class="finpill warn">No rate</span>'}</b></div>`).join('')}
    ${lab.manual.map(m=>`<div class="finkv"><span>${escapeHtml(m.name||finPersonName(m.user_id))} · ${finDate(m.work_date)}${m.description?' · '+escapeHtml(m.description):''} <button class="linkbtn" onclick="deleteFinManualLabour('${m.id}')">remove</button></span><b>${finMoney(m.amount)}</b></div>`).join('')}
    ${!lab.people.length && !lab.manual.length ? `<p class="stub" style="margin:0;font-style:normal;">No labour on this project yet.</p>` : `<div class="finkv big"><span>Labour to date</span><b>${finMoney(lab.cost)}</b></div>`}
  </div>`;
}
window.openFinManualLabour = async function(siteId, date){
  await loadAllProfiles();
  const rates = await finLoadRates();
  const people = Object.values(PROFILES).filter(p=>['operative','site_manager','pm'].includes(p.role)).sort((a,b)=>a.name.localeCompare(b.name));
  const workers = Object.values(FIN_WORKERS).filter(w=>w.active!==false).sort((a,b)=>String(a.name).localeCompare(String(b.name)));
  window.__finLabRates = rates;
  if(siteId) await finSubJobsLoad(siteId);
  let ov = document.getElementById('finLabOverlay');
  if(!ov){ ov = document.createElement('div'); ov.id = 'finLabOverlay'; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
  ov.onclick = e=>{ if(e.target===ov) ov.style.display='none'; };
  const jobs = SITES.filter(x=>finSiteStatus(x)!=='closed').sort((a,b)=>String(b.job_number||'').localeCompare(String(a.job_number||''), undefined, {numeric:true}));
  ov.innerHTML = `<div class="geo-modal-card">
    <h3>${siteId ? 'Add labour' : 'Add timesheet'}</h3>
    <p class="stub" style="margin:0 0 10px;font-style:normal;">${siteId ? 'For work not captured by sign-in: price work, a gang, or someone without the app.' : 'Days worked by a person on a project. Their day rate fills in the amount.'}</p>
    ${siteId ? '' : `<div class="formfield"><label class="field-label">Project</label><select id="finLabJob"><option value="">Choose…</option>${jobs.map(j=>`<option value="${j.id}">${escapeHtml((j.job_number?j.job_number+' · ':'')+j.name)}</option>`).join('')}</select></div>`}
    <div class="formfield"><label class="field-label">Who</label><select id="finLabWho" onchange="finLabAuto()"><option value="">Someone else (type a name)…</option>
      ${workers.length ? `<optgroup label="Workers">${workers.map(w=>`<option value="w:${w.id}">${escapeHtml(w.name||w.trading_name||'Worker')}</option>`).join('')}</optgroup>` : ''}
      ${people.length ? `<optgroup label="App users">${people.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}</optgroup>` : ''}</select></div>
    <div class="formfield"><label class="field-label">Name (if not listed)</label><input type="text" id="finLabName"></div>
    <div class="fingrid2">
      <div class="formfield"><label class="field-label">Date</label><input type="date" id="finLabDate" value="${date||finToday()}"></div>
      <div class="formfield"><label class="field-label">Days</label><input type="text" inputmode="decimal" id="finLabDays" oninput="finLabAuto()"></div>
    </div>
    <div class="formfield"><label class="field-label">Amount (£)</label><input type="text" inputmode="decimal" data-money id="finLabAmt"></div>
    <div class="formfield"><label class="field-label">What for</label><input type="text" id="finLabDesc" placeholder="e.g. price work, lead to valleys"></div>
    ${siteId ? finSubJobSelectHtml('finLabSub', siteId, '') : ''}
    <button class="darkbtn" style="width:100%;" onclick="saveFinManualLabour('${siteId||''}')">Save</button>
    <button class="geo-modal-cancel" onclick="document.getElementById('finLabOverlay').style.display='none'">Cancel</button>
  </div>`;
  ov.style.display = 'flex';
};
window.finLabAuto = function(){
  const who = finVal('finLabWho'), days = finNum(finVal('finLabDays'));
  const r = (window.__finLabRates||{})[who];
  if(r && r.day_rate!=null && days!==null && !isNaN(days)){ const el = document.getElementById('finLabAmt'); if(el) finSetMoney(el, finRound(days*Number(r.day_rate))); }
};
window.saveFinManualLabour = async function(siteId){
  if(!siteId){ siteId = finVal('finLabJob'); if(!siteId){ toast('Choose the project.'); return; } }
  const who = finVal('finLabWho'), name = finVal('finLabName'), amt = finNum(finVal('finLabAmt')), days = finNum(finVal('finLabDays'));
  if(!who && !name){ toast('Choose who, or type a name.'); return; }
  if(amt===null || isNaN(amt)){ toast('Enter the amount.'); return; }
  const isW = who.startsWith('w:');
  const r = await dbInsert('fin_labour_manual', {org_id:ME.org_id, site_id:siteId, sub_job_id:finVal('finLabSub')||null, user_id:(who && !isW)?who:null, worker_id:isW?who.slice(2):null, name:isW?finPersonName(who):(who?null:name), work_date:finVal('finLabDate')||finToday(), days:(days===null||isNaN(days))?null:days, amount:finRound(amt), description:finVal('finLabDesc')||null, created_by:ME.id});
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
      : `<p class="stub" style="margin:8px 0 0;font-style:normal;">No plant on hire for this project.</p>`}
  </div>`;
}
window.openFinPlantForm = async function(siteId, id){
  const h = id ? (await dbSelect('fin_plant_hires', 'id=eq.'+id))[0] : null;
  await finSubJobsLoad(siteId);
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
      <div class="formfield"><label class="field-label">Rate (£)</label><input type="text" inputmode="decimal" data-money id="finPlRate" value="${h?h.rate:''}"></div>
      <div class="formfield"><label class="field-label">Per</label><select id="finPlPer"><option value="week" ${!h||h.rate_period==='week'?'selected':''}>Week</option><option value="day" ${h&&h.rate_period==='day'?'selected':''}>Day</option></select></div>
    </div>
    <div class="formfield"><label class="field-label">Cost of this hire comes from</label><select id="finPlFrom"><option value="rate" ${!h||h.cost_from!=='invoices'?'selected':''}>The hire rate × time on hire</option><option value="invoices" ${h&&h.cost_from==='invoices'?'selected':''}>The hire company’s invoices (rate is just for reference)</option></select></div>
    <p class="stub" style="margin:-4px 0 10px;font-style:normal;font-size:12.5px;">Pick “invoices” if you’ll enter the hire company’s invoices as plant costs — otherwise the hire would be counted twice.</p>
    <div class="formfield"><label class="field-label">Notes</label><input type="text" id="finPlNotes" value="${escapeHtml(h&&h.notes||'')}"></div>
    ${h && h.split ? finAllocBlockHtml('fin_plant_hires', h) : finSubJobSelectHtml('finPlSub', siteId, h ? h.sub_job_id||'' : '')}
    <button class="darkbtn" style="width:100%;" onclick="saveFinPlant('${siteId}','${h?h.id:''}')">Save</button>
    ${h && !h.off_hire ? `<button class="ghostbtn" style="width:100%;margin-top:8px;" onclick="document.getElementById('finPlOff').value='${finToday()}';saveFinPlant('${siteId}','${h.id}')">Off-hire today</button>` : ''}
    ${h ? `<button class="ghostbtn" style="width:100%;margin-top:8px;" onclick="document.getElementById('finPlantOverlay').style.display='none';openFinSplit('fin_plant_hires','${h.id}')">Split across ${FIN_SUBJOBS[siteId]&&FIN_SUBJOBS[siteId].length?'plots / ':''}projects</button>` : ''}
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
  const row = {item, supplier_name:finVal('finPlSup')||null, hire_ref:finVal('finPlRef')||null, on_hire:on, off_hire:off||null, rate:finRound(rate), rate_period:finVal('finPlPer')||'week', notes:finVal('finPlNotes')||null, cost_from:finVal('finPlFrom')||'rate'};
  if(document.getElementById('finPlSub')) row.sub_job_id = finVal('finPlSub')||null;
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
  const [cks, rates, pays, manual] = await Promise.all([
    dbSelect('checkins', 'type=eq.in&ts=gte.'+from+'T00:00:00&ts=lte.'+to+'T23:59:59&select=user_id,site_id,ts,type&limit=20000'),
    finLoadRates(),
    dbSelect('fin_sub_payments', 'org_id=eq.'+ME.org_id+'&period_start=eq.'+from+'&status=neq.void'),
    dbSelect('fin_labour_manual', 'org_id=eq.'+ME.org_id+'&work_date=gte.'+from+'&work_date=lte.'+to),
  ]);
  if(__gen !== RENDER_GEN) return;
  const days = finLabourDaysFrom(cks);
  const people = {};
  days.forEach(d=>{ const p = people[d.user_id] = people[d.user_id] || {key:d.user_id, sites:{}, days:0, extra:0}; p.sites[d.site_id] = (p.sites[d.site_id]||0)+1; p.days++; });
  manual.forEach(m=>{ const k = finPersonKey(m); const p = people[k] = people[k] || {key:k, name:m.name, sites:{}, days:0, extra:0}; p.sites[m.site_id] = (p.sites[m.site_id]||0)+Number(m.days||0); p.extra += Number(m.amount||0); p.timesheet = true; });
  const nameOf = p=>p.key.startsWith('n:') ? (p.name||'Someone') : finPersonName(p.key);
  const list = Object.values(people).map(p=>{ const r = rates[p.key] || {}; const signIn = r.day_rate!=null ? finRound(p.days*Number(r.day_rate)) : (p.days ? null : 0); return Object.assign(p, {rate:r.day_rate!=null?Number(r.day_rate):null, pay_type:r.pay_type||'subcontractor', cis:r.cis_rate!=null?r.cis_rate:20, amount: signIn===null ? null : finRound(signIn+p.extra)}); }).sort((a,b)=>nameOf(a).localeCompare(nameOf(b)));
  const total = list.reduce((t,p)=>t+(p.amount||0), 0);
  const payBy = {}; pays.forEach(p=>{ payBy[finPersonKey(p)] = p; });
  const fmtW = d=>new Date(d+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric', month:'short'});
  document.getElementById('app').innerHTML = shell(`
    ${finSectionNav('subs')}${finSubTabs('subs','week')}
    <div class="card" style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
      <button class="ghostbtn" style="width:auto;" onclick="finLabWeek=finAddDays(finLabWeek,-7);render()">‹</button>
      <div style="text-align:center;"><div class="finhead-l">Week</div><div class="finhead-v">${fmtW(from)} – ${fmtW(to)}</div></div>
      <button class="ghostbtn" style="width:auto;" onclick="finLabWeek=finAddDays(finLabWeek,7);render()">›</button>
    </div>
    <div class="row-gap" style="flex-wrap:wrap;margin-bottom:12px;">
      <button class="darkbtn" style="flex:1;" onclick="openFinManualLabour(null, finLabWeek)">+ Add timesheet</button>
    </div>
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;"><p class="sectiontitle" style="margin:0;">Labour this week</p><b>${finMoney(total)}</b></div>
      ${list.length ? list.map(p=>{ const pay = payBy[p.key]; return `<div class="finlabrow">
        <div><b>${escapeHtml(nameOf(p))}</b> <button type="button" class="linkbtn" style="font-size:12.5px;" onclick="openFinTimesheet('${jsAttr(p.key)}', finLabWeek)">${p.timesheet ? 'Edit timesheet' : '+ Timesheet'}</button> <span class="finpill ${p.pay_type==='paye'?'grey':'blue'}">${p.pay_type==='paye'?'PAYE':'Sub · CIS '+p.cis+'%'}</span>
          <div class="stub" style="margin:2px 0 0;font-style:normal;">${Object.keys(p.sites).map(s=>{ const st = SITES.find(x=>x.id===s)||{}; return escapeHtml((st.job_number||'')+' '+(st.name||'Project'))+' ×'+p.sites[s]; }).join(' · ')}</div></div>
        <div style="text-align:right;"><b>${p.amount!=null?finMoney(p.amount):'<span class="finpill warn">No rate</span>'}</b><div class="stub" style="margin:2px 0 0;font-style:normal;">${p.days ? p.days+' sign-in day'+(p.days===1?'':'s')+(p.rate!=null?' × '+finMoney(p.rate):'') : ''}${p.days && p.timesheet ? ' + ' : ''}${p.timesheet ? 'timesheet '+finMoney(p.extra) : ''}</div>
          ${p.pay_type!=='paye' && !p.key.startsWith('n:') ? (pay ? `<button class="linkbtn" style="color:var(--blue);" onclick="go('#/finance/labour/payment/${pay.id}')">${pay.status==='paid'?'Paid':'Payment '+pay.status}</button>` : (p.amount!=null ? `<button class="linkbtn" style="color:var(--blue);" onclick="newFinSubPayment('${p.key}')">Make payment</button>` : '')) : ''}</div>
      </div>`; }).join('') : `<p class="stub" style="margin:8px 0 0;font-style:normal;">No labour this week — nobody signed in on site and no timesheets added.</p>`}
    </div>
    ${pays.filter(p=>!people[finPersonKey(p)]).map(p=>`<button class="pmrow pmrow-card finrow" onclick="go('#/finance/labour/payment/${p.id}')"><span class="pmrow-txt"><span class="pmrow-t">${escapeHtml(p.name)}</span><span class="pmrow-s">Payment ${p.status}</span></span><span class="finval">${finMoney(p.net_pay)}</span></button>`).join('')}
  `, {title:'Timesheets', subtitle:'Subcontractors & labour', back:finSecBack(), tabs:false});
}
window.newFinSubPayment = async function(key){
  const from = finLabWeek, to = finAddDays(from, 6);
  const isW = String(key).startsWith('w:'), userId = isW ? null : key, wid = isW ? key.slice(2) : null;
  const [cks, man, rates] = await Promise.all([
    userId ? dbSelect('checkins', 'user_id=eq.'+userId+'&type=eq.in&ts=gte.'+from+'T00:00:00&ts=lte.'+to+'T23:59:59&select=user_id,site_id,ts,type') : Promise.resolve([]),
    dbSelect('fin_labour_manual', (userId ? 'user_id=eq.'+userId : 'worker_id=eq.'+wid)+'&work_date=gte.'+from+'&work_date=lte.'+to),
    finLoadRates(),
  ]);
  const r = rates[key] || {};
  const bySite = {}; finLabourDaysFrom(cks).forEach(d=>{ bySite[d.site_id] = (bySite[d.site_id]||0)+1; });
  const lines = Object.keys(bySite).map(s=>({site_id:s, days:bySite[s], rate:Number(r.day_rate||0), amount:finRound(bySite[s]*Number(r.day_rate||0))}));
  man.forEach(m=>{ const d = Number(m.days||0) || 1; lines.push({site_id:m.site_id, days:d, rate:finRound(Number(m.amount||0)/d), amount:finRound(m.amount), description:m.description||null}); });
  if(!lines.length){ toast('No labour for them this week.'); return; }
  const labour = finRound(lines.reduce((t,l)=>t+l.amount,0)), cis = r.cis_rate!=null ? r.cis_rate : 20;
  const ded = finRound(labour*cis/100);
  const rows = await dbInsert('fin_sub_payments', {org_id:ME.org_id, user_id:userId, worker_id:wid, name:r.trading_name || finPersonName(key), period_start:from, period_end:to, lines, labour, materials:0, gross:labour, cis_rate:cis, cis_deduction:ded, net_pay:finRound(labour-ded), status:'draft', created_by:ME.id});
  if(rows && rows[0]) go('#/finance/labour/payment/'+rows[0].id);
};
let finPay = null;
async function renderFinSubPayment(id){
  if(!finGuard()) return;
  if(!FIN_SETTINGS) await finLoadSettings();
  const __gen = RENDER_GEN;
  const p = (await dbSelect('fin_sub_payments', 'id=eq.'+id))[0];
  const rates = await finLoadRates();
  if(__gen !== RENDER_GEN) return;
  if(!p){ toast('Payment not found.'); go('#/finance/labour'); return; }
  if(!finPay || finPay.id!==p.id) finPay = JSON.parse(JSON.stringify(p));
  const r = rates[finPersonKey(p)] || {};
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
        <div class="finitem-in">${locked ? `<span class="finitem-sum">${l.days} day${l.days==1?'':'s'} × ${finMoney(l.rate)}</span>` : `<label>Days<input type="text" inputmode="decimal" value="${l.days}" oninput="finPaySet(${i},'days',this.value)"></label><label>Rate £<input type="text" inputmode="decimal" data-money value="${l.rate}" oninput="finPaySet(${i},'rate',this.value)"></label>`}<b id="finPayL-${i}">${finMoney(l.amount)}</b></div></div>`; }).join('')}
    </div>
    <div class="card">
      <div class="fingrid2">
        <div class="formfield"><label class="field-label">Materials they supplied (£, no CIS)</label><input type="text" inputmode="decimal" data-money id="finPayMat" value="${finPay.materials||0}" ${locked?'disabled':''} oninput="finPay.materials=finNum(this.value)||0;finPayPaint()"></div>
        <div class="formfield"><label class="field-label">CIS rate</label><select id="finPayCis" ${locked?'disabled':''} onchange="finPay.cis_rate=+this.value;finPayPaint()">${Object.keys(FIN_CIS_LABEL).map(k=>`<option value="${k}" ${Number(finPay.cis_rate)===Number(k)?'selected':''}>${FIN_CIS_LABEL[k]}</option>`).join('')}</select></div>
      </div>
      <div id="finPaySum"></div>
      ${r.vat_registered ? `<p class="stub" style="margin:6px 0 0;font-style:normal;">VAT registered: domestic reverse charge applies, so you account for the VAT, not them.</p>` : ''}
    </div>
    <div class="row-gap" style="flex-wrap:wrap;">
      ${p.status==='draft' ? `<button class="darkbtn" style="flex:1;" onclick="saveFinSubPayment('approved')">Save &amp; approve</button><button class="ghostbtn" style="flex:1;" onclick="saveFinSubPayment('draft')">Save draft</button>` : ''}
      ${p.status==='approved' ? `<button class="darkbtn" style="flex:1;" onclick="saveFinSubPayment('paid')">Mark paid today</button>` : ''}
      <button class="ghostbtn" style="flex:1;" onclick="openFinCisStatement('${p.id}')">Payment statement</button>
    </div>
    ${typeof finXeroRowHtml==='function' ? finXeroRowHtml('sub', p) : ''}
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
  if(!FIN_SETTINGS) await finLoadSettings();
  if(__gen !== RENDER_GEN) return;
  const people = Object.values(PROFILES).filter(p=>['operative','site_manager'].includes(p.role)).sort((a,b)=>a.name.localeCompare(b.name));
  const workers = Object.values(FIN_WORKERS).sort((a,b)=>String(a.name).localeCompare(String(b.name)));
  const card = (key, title, r, isW)=>`<div class="card finrate" id="finRate-${key}">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;"><b>${escapeHtml(title)}</b><span class="stub" style="margin:0;font-style:normal;">${(r.xero_contact_id||r.xero_employee_id)?'<span class="finxw-tag">From Xero</span> ':''}${isW?(r.active===false?'Not active':'Worker'):'App user'}</span></div>
      <div class="fingrid3" style="margin-top:6px;">
        ${isW ? `<div class="formfield"><label class="field-label">Name</label><input type="text" data-k="name" value="${escapeHtml(r.name||'')}"></div>
        <div class="formfield"><label class="field-label">Email (for statements)</label><input type="email" data-k="email" value="${escapeHtml(r.email||'')}"></div>` : ''}
        <div class="formfield"><label class="field-label">Pay</label><select data-k="pay_type"><option value="subcontractor" ${r.pay_type!=='paye'?'selected':''}>Subcontractor</option><option value="paye" ${r.pay_type==='paye'?'selected':''}>PAYE</option></select></div>
        <div class="formfield"><label class="field-label">Day rate £</label><input type="text" inputmode="decimal" data-money data-k="day_rate" value="${r.day_rate!=null?r.day_rate:''}">${r.rate_note?`<span class="finrate-src">${escapeHtml(r.rate_note)}</span>`:''}</div>
        <div class="formfield"><label class="field-label">CIS</label><select data-k="cis_rate">${Object.keys(FIN_CIS_LABEL).map(k=>`<option value="${k}" ${Number(r.cis_rate!=null?r.cis_rate:20)===Number(k)?'selected':''}>${FIN_CIS_LABEL[k]}</option>`).join('')}</select></div>
        <div class="formfield"><label class="field-label">UTR</label><input type="text" data-k="utr" value="${escapeHtml(r.utr||'')}"></div>
        <div class="formfield"><label class="field-label">Trading name</label><input type="text" data-k="trading_name" value="${escapeHtml(r.trading_name||'')}"></div>
        <div class="formfield"><label class="field-label">VAT registered</label><select data-k="vat_registered"><option value="false">No</option><option value="true" ${r.vat_registered?'selected':''}>Yes</option></select></div>
      </div>
      <div class="row-gap"><button class="ghostbtn" style="flex:1;" onclick="saveFinRate('${key}')">Save</button>${isW ? `<button class="ghostbtn" style="flex:none;width:auto;" onclick="finWorkerActive('${r.id}', ${r.active===false})">${r.active===false?'Make active':'Not working for us'}</button>` : ''}</div>
    </div>`;
  document.getElementById('app').innerHTML = shell(`
    ${finSectionNav('subs')}${finSubTabs('subs','rates')}
    <p class="stub" style="margin:0 0 10px;font-style:normal;">Day rates price labour on each project. CIS details are used on subcontractor payments and statements. Workers are people you pay who don’t use the app — add their days with timesheets.</p>
    <div class="row-gap" style="margin:0 0 12px;"><button class="darkbtn" style="flex:1;" onclick="finAddWorker()">+ Add a worker</button>${finXeroConnected() ? `<button class="ghostbtn" style="flex:1;" onclick="openFinXeroWorkers()">Bring in from Xero</button>` : ''}</div>
    ${finXeroConnected() ? '' : '<p class="stub" style="margin:-6px 0 12px;font-style:normal;">Connect Xero in Finance › Settings to bring your subcontractors, CIS rates and PAYE staff in from Xero.</p>'}
    ${workers.map(w=>card('w:'+w.id, w.name||w.trading_name||'Worker', w, true)).join('')}
    ${people.map(p=>card(p.id, p.name, rates[p.id]||{}, false)).join('')}
    ${!workers.length && !people.length ? '<div class="empty">No one yet — add a worker.</div>' : ''}
  `, {title:'Rates & workers', subtitle:'Subcontractors & labour', back:finSecBack(), tabs:false});
}
window.finAddWorker = async function(){
  const name = String(await customPrompt('Worker or subcontractor name') || '').trim();
  if(!name) return;
  const r = await dbInsert('fin_labour_rates', {org_id:ME.org_id, user_id:null, name, pay_type:'subcontractor', cis_rate:20, vat_registered:false, updated_at:new Date().toISOString()});
  if(r){ toast(name+' added — fill in their rate and CIS details'); render(); }
};
window.finWorkerActive = async function(id, on){
  if(await dbUpdate('fin_labour_rates', id, {active:!!on})){ toast(on?'Active again':'Hidden from timesheets'); render(); }
};
window.saveFinRate = async function(key){
  const card = document.getElementById('finRate-'+key); if(!card) return;
  const v = k=>{ const el = card.querySelector(`[data-k="${k}"]`); return el ? el.value.trim() : ''; };
  const rate = finNum(v('day_rate'));
  if(rate!==null && isNaN(rate)){ toast('Day rate must be a number.'); return; }
  const row = {pay_type:v('pay_type')||'subcontractor', day_rate:rate, cis_rate:Number(v('cis_rate')||20), utr:v('utr')||null, trading_name:v('trading_name')||null, vat_registered:v('vat_registered')==='true', updated_at:new Date().toISOString()};
  if(String(key).startsWith('w:')){
    const email = v('email');
    if(!v('name')){ toast('Enter their name.'); return; }
    if(email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ toast('Check the email address.'); return; }
    const r = await dbUpdate('fin_labour_rates', key.slice(2), Object.assign(row, {name:v('name'), email:email||null}));
    if(!r) return;
    toast('Saved '+v('name')); return;
  }
  const res = await sbFetch('/rest/v1/fin_labour_rates?on_conflict=org_id,user_id', {method:'POST', headers:{'Prefer':'resolution=merge-duplicates'}, body:JSON.stringify(Object.assign({org_id:ME.org_id, user_id:key}, row))});
  if(!res.ok){ toast('Save failed — '+(await safeErr(res))); return; }
  toast('Saved '+finPersonName(key));
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
  pays.forEach(p=>{ const k = finPersonKey(p); const b = by[k] = by[k] || {name:p.name, key:k, utr:p.utr, gross:0, materials:0, cis:0, net:0, n:0}; b.gross += Number(p.gross); b.materials += Number(p.materials); b.cis += Number(p.cis_deduction); b.net += Number(p.net_pay); b.n++; });
  const rows = Object.values(by);
  const tot = rows.reduce((t,r)=>({gross:t.gross+r.gross, cis:t.cis+r.cis}), {gross:0, cis:0});
  const shift = n=>{ const d = new Date(finCisMonth+'T12:00:00'); d.setMonth(d.getMonth()+n); return d.toISOString().slice(0,10); };
  document.getElementById('app').innerHTML = shell(`
    ${finSectionNav('subs')}${finSubTabs('subs','cis')}
    <div class="card" style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
      <button class="ghostbtn" style="width:auto;" onclick="finCisMonth='${shift(-1)}';render()">‹</button>
      <div style="text-align:center;"><div class="finhead-l">Tax month</div><div class="finhead-v">${finDate(start)} – ${finDate(end)}</div></div>
      <button class="ghostbtn" style="width:auto;" onclick="finCisMonth='${shift(1)}';render()">›</button>
    </div>
    <div class="pmstats finstats" style="grid-template-columns:1fr 1fr;"><div class="pmstat"><b>${finMoney(tot.gross)}</b><span>Paid to subcontractors</span></div><div class="pmstat"><b>${finMoney(tot.cis)}</b><span>CIS deducted (to pay HMRC)</span></div></div>
    <div class="card">
      <p class="sectiontitle" style="margin-top:0;">For the monthly CIS return</p>
      ${rows.length ? rows.map(r=>{ const rr = rates[r.key] || {}; return `<div class="finlabrow"><div><b>${escapeHtml(r.name)}</b><div class="stub" style="margin:2px 0 0;font-style:normal;">UTR ${escapeHtml(rr.utr||r.utr||'missing')} · ${r.n} payment${r.n===1?'':'s'}</div></div>
        <div style="text-align:right;font-size:13px;">Gross <b>${finMoney(r.gross)}</b><br>Materials ${finMoney(r.materials)}<br>CIS <b>${finMoney(r.cis)}</b></div></div>`; }).join('') : `<p class="stub" style="margin:0;font-style:normal;">No subcontractor payments marked paid in this tax month.</p>`}
      <p class="stub" style="margin:8px 0 0;font-style:normal;">When Xero is linked, the CIS return is made from Xero. Until then use these figures; the HMRC deadline is the 19th.</p>
    </div>
  `, {title:'CIS', subtitle:'Subcontractors & labour', back:finSecBack(), tabs:false});
}

/* ---- payment and deduction statement PDF ---- */
window.openFinCisStatement = async function(id){
  const p = (await dbSelect('fin_sub_payments', 'id=eq.'+id))[0]; if(!p) return;
  const [st, rates] = await Promise.all([finLoadSettings(), finLoadRates()]);
  const r = rates[finPersonKey(p)] || {};
  if(!(await loadLib('PDFLib'))){ toast('Could not load the PDF tool.'); return; }
  const pdf = await PDFLib.PDFDocument.create(); const page = pdf.addPage([595.28, 841.89]);
  const reg = await pdf.embedFont(PDFLib.StandardFonts.Helvetica), bold = await pdf.embedFont(PDFLib.StandardFonts.HelveticaBold);
  const INK = PDFLib.rgb(0.07,0.08,0.09), SLATE = PDFLib.rgb(0.36,0.39,0.45);
  const BRAND = finHexRgb(ORG && ORG.color_primary, PDFLib.rgb(0.78,0.06,0.18));
  page.drawRectangle({x:0, y:841.89-70, width:595.28, height:70, color:BRAND});
  page.drawText((ORG&&ORG.name)||'', {x:44, y:841.89-42, size:16, font:bold, color:PDFLib.rgb(1,1,1)});
  page.drawText('Payment and deduction statement', {x:44, y:841.89-60, size:10, font:reg, color:PDFLib.rgb(1,1,1)});
  let y = 720; const kv = (k, v, b)=>{ page.drawText(k, {x:44, y, size:10, font:reg, color:SLATE}); page.drawText(String(v||'—'), {x:300, y, size:b?12:10.5, font:b?bold:reg, color:INK}); y -= b?22:18; };
  const taxEnd = (()=>{ const d = new Date((p.paid_on||p.period_end)+'T12:00:00'); const after = d.getDate()>5; d.setDate(5); if(after) d.setMonth(d.getMonth()+1); return d.toISOString().slice(0,10); })();
  kv('Contractor', (ORG&&ORG.name)||''); kv('Contractor UTR', st.contractor_utr); kv('Employer reference', st.employer_ref);
  y -= 8; kv('Subcontractor', p.name); kv('Subcontractor UTR', r.utr || p.utr); kv('Tax month ending', finDate(taxEnd)); kv('Work period', finDate(p.period_start)+' – '+finDate(p.period_end)); kv('Paid on', p.paid_on ? finDate(p.paid_on) : 'Not paid yet');
  y -= 8; page.drawLine({start:{x:44,y:y+8}, end:{x:551,y:y+8}, thickness:0.6, color:PDFLib.rgb(0.86,0.88,0.9)}); y -= 8;
  kv('Gross amount paid (excl. VAT)', finMoney(p.gross)); kv('Less cost of materials', finMoney(p.materials)); kv('Amount liable to deduction', finMoney(p.labour));
  kv('Amount deducted ('+p.cis_rate+'%)', finMoney(p.cis_deduction), true); kv('Amount payable', finMoney(p.net_pay), true);
  y -= 10; page.drawText('Keep this statement: it shows the tax deducted under the Construction Industry Scheme.', {x:44, y, size:9, font:reg, color:SLATE});
  const bytes = await pdf.save();
  viewPdfInApp(bytes, 'CIS statement - '+p.name+' - '+p.period_start+'.pdf');
};
