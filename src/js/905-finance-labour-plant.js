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
function finPlantCost(h){
  const end = h.off_hire || finToday();
  const days = Math.max(1, Math.round((new Date(end+'T12:00:00') - new Date(h.on_hire+'T12:00:00'))/864e5) + 1);
  const cost = h.rate_period==='day' ? days*Number(h.rate||0) : finRound(days/7*Number(h.rate||0));
  return {days, weeks:Math.round(days/7*10)/10, cost:finRound(cost)};
}

/* ---------------- job page cards ---------------- */
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
      ${r.pay_type!=='paye' ? `<div class="fingrid3 finrate-bank">
        <div class="formfield"><label class="field-label">Bank account name</label><input type="text" data-k="bank_account_name" value="${escapeHtml(r.bank_account_name||'')}" autocomplete="off"></div>
        <div class="formfield"><label class="field-label">Sort code</label><input type="text" inputmode="numeric" data-k="bank_sort_code" placeholder="00-00-00" value="${escapeHtml(r.bank_sort_code?finSortCode(r.bank_sort_code):'')}" autocomplete="off"></div>
        <div class="formfield"><label class="field-label">Account number</label><input type="text" inputmode="numeric" data-k="bank_account_no" placeholder="8 digits" value="${escapeHtml(r.bank_account_no||'')}" autocomplete="off"></div>
      </div>` : ''}
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
  if(card.querySelector('[data-k="bank_sort_code"]')){
    const sc = v('bank_sort_code').replace(/\D/g,''), an = v('bank_account_no').replace(/\D/g,'');
    if(sc && sc.length!==6){ toast('Sort code should be 6 numbers.'); return; }
    if(an && an.length!==8){ toast('Account number should be 8 numbers.'); return; }
    Object.assign(row, {bank_account_name:v('bank_account_name')||null, bank_sort_code:sc||null, bank_account_no:an||null});
  }
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
