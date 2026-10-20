/* ================= OpHUB FINANCE — Contract breakdown + A2 Applications =================
   Contract breakdown (#/site/<id>/finance/contract): headers, sub-headers and
   priced items (qty × unit × rate, or a lump sum), typed in or read from an
   uploaded Excel / PDF. The total becomes the job's contract value.
   Applications (#/site/<id>/finance/application/<appId>): % complete (or the
   quantity done) per item, grouped under the same headers with rates and
   units shown, + variations + dayworks → gross, less retention, less
   previously certified → amount due. Comes out as an Excel file that can be
   edited and uploaded back; emailed from the app. Certificate fields on the
   same row are filled in at step A3. */

/* ---------------- helpers ---------------- */
function finPct(v){ const n = finNum(v); return (n===null || isNaN(n)) ? 0 : Math.max(0, Math.min(100, Math.round(n*100)/100)); }
function finQtyFmt(n){ if(n===null || n===undefined || n==='' || isNaN(Number(n))) return ''; return Number(n).toLocaleString('en-GB', {maximumFractionDigits:3}); }
function finRateFmt(n){ if(n===null || n===undefined || n==='' || isNaN(Number(n))) return ''; const v = Number(n); return '£'+v.toLocaleString('en-GB', {minimumFractionDigits:2, maximumFractionDigits: (Math.round(v*100)===v*100) ? 2 : 4}); }
function finIsItem(l){ return !l.kind || l.kind==='item'; }
// An item's contract value: qty × rate when both are given, otherwise the lump sum.
function finItemValue(r){
  const q = finNum(r.qty), rt = finNum(r.rate);
  if(q!==null && !isNaN(q) && rt!==null && !isNaN(rt)) return finRound(q*rt);
  const v = finNum(r.value); return (v===null || isNaN(v)) ? null : finRound(v);
}
function finAppCalc(app, contractValue, retLimitPct, previous){
  const lines = (app.lines||[]).map(l=>finIsItem(l) ? Object.assign({}, l, {gross: finRound(Number(l.value||0)*finPct(l.pct)/100)}) : Object.assign({}, l, {gross:0}));
  const variations = (app.variations||[]).map(v=>Object.assign({}, v, {gross: finRound(Number(v.value||0)*finPct(v.pct)/100)}));
  const dayworks = (app.dayworks||[]).map(d=>Object.assign({}, d, {gross: finRound(Number(d.value||0))}));
  const gross = finRound([...lines, ...variations, ...dayworks].reduce((t,x)=>t+x.gross, 0));
  let retention = finRound(gross*Number(app.retention_pct||0)/100);
  if(retLimitPct && contractValue){ retention = Math.min(retention, finRound(Number(contractValue)*Number(retLimitPct)/100)); }
  const prev = finRound(previous||0);
  return {lines, variations, dayworks, gross, retention, previous:prev, net_due:finRound(gross - retention - prev)};
}
// What was certified (or, until the certificate is in, applied for) on earlier applications.
function finPreviousCertified(apps, number){
  return finRound(apps.filter(a=>a.number < number && !['draft','void'].includes(a.status))
    .reduce((t,a)=>t + Number(a.cert_net!=null ? a.cert_net : (a.net_due||0)), 0));
}
// Sub-totals for header rows: each header adds up the items below it until
// the next header of the same or higher level. Returns {index: {value, gross}}.
function finGroupTotals(rows, valueOf, grossOf){
  const out = {}; let sec = null, sub = null;
  rows.forEach((r,i)=>{
    if(r.kind==='section'){ sec = i; sub = null; out[i] = {value:0, gross:0}; return; }
    if(r.kind==='subsection'){ sub = i; out[i] = {value:0, gross:0}; return; }
    const v = Number(valueOf(r)||0), g = Number(grossOf ? grossOf(r) : 0);
    [sec, sub].forEach(k=>{ if(k!==null){ out[k].value += v; out[k].gross += g; } });
  });
  Object.values(out).forEach(o=>{ o.value = finRound(o.value); o.gross = finRound(o.gross); });
  return out;
}
const FIN_APP_STATUS = {draft:'Draft', submitted:'Submitted', certified:'Certified', invoiced:'Invoiced', void:'Void'};
function finAppPill(a){ if(a.status==='invoiced' && 'invoice_id' in a && !a.invoice_id) a = Object.assign({}, a, {status:'certified'}); const c = {draft:'grey', submitted:'blue', certified:'warn', invoiced:'ok', void:'grey'}[a.status]||'grey'; return `<span class="finpill ${c}">${FIN_APP_STATUS[a.status]||a.status}</span>`; }
function finAppDayFor(jf, st){ return Number((jf && jf.app_reminder_day) || (st && st.app_reminder_day) || 0) || null; }
// Is this month's application due (application day reached, none dated this month)?
// Application date for a month (YYYY-MM): a date set for that month, else the day-of-month rule.
function finAppDateFor(jf, st, ym){
  const custom = jf && jf.app_dates && jf.app_dates[ym];
  if(custom) return custom;
  const day = finAppDayFor(jf, st); if(!day) return null;
  const [y,m] = ym.split('-').map(Number);
  return ym+'-'+String(Math.min(day, new Date(y, m, 0).getDate())).padStart(2,'0');
}
function finAppDueThisMonth(apps, due){
  // 'due' = this month's application date (YYYY-MM-DD), or a day of the month (older callers).
  if(!due) return false;
  const ym = finToday().slice(0,7);
  if(typeof due==='number'){ if(new Date().getDate() < Math.min(due, 28)) return false; }
  else if(finToday() < due) return false;
  return !apps.some(a=>a.status!=='void' && String(a.valuation_date||'').slice(0,7)===ym);
}

/* ---------------- cards on the job's Finance page ---------------- */
function finContractCardHtml(siteId, items, jf){
  const priced = items.filter(finIsItem);
  const heads = items.filter(i=>i.kind==='section').length;
  const total = finRound(priced.reduce((t,i)=>t+Number(i.value||0), 0));
  return `<div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
      <p class="sectiontitle" style="margin:0;">Priced schedule of works</p>
      <button class="ghostbtn" style="padding:6px 12px;width:auto;flex:none;" onclick="go('#/site/${siteId}/finance/contract')">${items.length?'Open':'Set up'}</button>
    </div>
    <p class="stub" style="margin:4px 0 0;font-style:normal;">${priced.length ? `${heads?heads+' section'+(heads===1?'':'s')+' · ':''}${priced.length} item${priced.length===1?'':'s'} · total <b>${finMoney(total)}</b>${jf&&jf.contract_file_name?' · from '+escapeHtml(jf.contract_file_name):''}` : 'Upload the priced breakdown (Excel or PDF) or type it in, with headers, sub-headers, quantities, units and rates. Applications are valued against it.'}</p>
  </div>`;
}
function finApplicationsCardHtml(siteId, apps, due){
  return `<div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
      <p class="sectiontitle" style="margin:0;">Applications</p>
      <button class="ghostbtn" style="padding:6px 12px;width:auto;flex:none;" onclick="newFinApplication('${siteId}')">+ New application</button>
    </div>
    ${due ? `<div class="finchecks" style="margin:8px 0 0;"><span>This month’s application is due</span></div>` : ''}
    ${apps.length ? apps.map(a=>`<button type="button" class="pmrow finrow fininvrow" onclick="go('#/site/${siteId}/finance/application/${a.id}')">
        <span class="pmrow-txt"><span class="pmrow-t">Application ${a.number} ${finAppPill(a)}</span>
          <span class="pmrow-s">${finDate(a.valuation_date)} · gross ${finMoney(a.gross)}${a.cert_net!=null?' · certified '+finMoney(a.cert_net):''}</span></span>
        <span class="finval">${finMoney(a.cert_net!=null ? a.cert_net : a.net_due)}</span>
      </button>`).join('') : `<div class="empty" style="margin:8px 0 0;">No applications yet.</div>`}
  </div>`;
}

/* ---------------- Contract breakdown page ---------------- */
let finContractRows = null, finContractSite = null, finContractFile = null, finContractSnap = '';
function finContractSnapOf(rows){ return JSON.stringify(rows.map(r=>[r.kind,r.ref,r.description,r.qty,r.unit,r.rate,r.value,r.sub||'',r.cost==null?null:r.cost,r.cost_basis||'',r.cost_pct==null?null:r.cost_pct])); }
function finContractIsDirty(){ return !!finContractRows && finContractSnapOf(finContractRows) !== finContractSnap; }
const FIN_KIND_LABEL = {section:'Header', subsection:'Sub-header', item:'Item'};
async function renderFinContract(siteId){
  if(!finGuard()) return;
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  const [items, jfRows, apps, , sowSt] = await Promise.all([
    dbSelect('fin_contract_items', 'site_id=eq.'+siteId+'&order=position.asc'),
    dbSelect('job_finance', 'site_id=eq.'+siteId),
    dbSelect('fin_applications', 'site_id=eq.'+siteId+'&status=neq.void&select=id'),
    finSubJobsLoad(siteId),
    finSowStatus(siteId),
  ]);
  if(__gen !== RENDER_GEN) return;
  if(finContractSite !== siteId || !finContractRows){
    finContractRows = items.map(i=>({id:i.id, kind:i.kind||'item', ref:i.ref||'', description:i.description, qty:i.qty!=null?Number(i.qty):null, unit:i.unit||'', rate:i.rate!=null?Number(i.rate):null, value:i.value!=null?Number(i.value):null, sub:i.sub_job_id||'', cost:i.cost!=null?Number(i.cost):null, cost_basis:i.cost_basis||'', cost_pct:i.cost_pct!=null?Number(i.cost_pct):null}));
    finContractSite = siteId; finContractFile = null;
    finContractSnap = finContractSnapOf(finContractRows);
  }
  const jf = jfRows[0] || {};
  document.getElementById('app').innerHTML = shell(`
    <p class="stub" style="margin:0 0 12px;font-style:normal;">The priced list of work for this project. It sets the contract value, it’s what each application is valued against, and it can go onto the operatives’ Schedule of Works (without prices).</p>
    ${finSowCardHtml(siteId, sowSt)}
    <div class="card">
      <p class="sectiontitle" style="margin-top:0;">Upload a priced schedule</p>
      <p class="stub" style="margin:0 0 10px;font-style:normal;">An Excel or PDF of the priced contract (tender, contract sum analysis or bill of quantities). The app reads headers, sub-headers and each priced line with its quantity, unit and rate; you check them before they’re saved.</p>
      <input type="file" id="finContractUpload" accept=".xlsx,.xls,.csv,application/pdf" onchange="finContractUploadPicked(this.files[0])">
      ${jf.contract_file_name ? `<p class="stub" style="margin:8px 0 0;font-style:normal;">Last uploaded: ${escapeHtml(jf.contract_file_name)} <button class="linkbtn" style="color:var(--blue);" onclick="openFinDoc('${jsAttr(jf.contract_file_path||'')}','${jsAttr(jf.contract_file_name||'')}')">view</button></p>` : ''}
    </div>
    ${apps.length ? `<div class="finbanner" style="background:var(--warn-bg);color:var(--warn);border-color:#F2D9B8;">This project already has applications. Changes here apply to new applications; existing ones keep the lines they were made with.</div>` : ''}
    <div class="card fincosttool">
      <p class="sectiontitle" style="margin-top:0;">Cost price (your budget)</p>
      <p class="stub" style="margin:0 0 10px;font-style:normal;">Type a cost against each line, or work them out from the sale price with a %. Tick lines to change just those.</p>
      <div class="fincosttool-row">
        <select id="finCtBasis" aria-label="Margin or mark-up"><option value="margin">Margin on the sale price</option><option value="markup">Mark-up on cost</option></select>
        <label class="finpctin"><input type="text" inputmode="decimal" id="finCtPct" placeholder="20"><span>%</span></label>
        <button class="ghostbtn" id="finCtSelBtn" onclick="finContractApplyPct(true)" disabled>Apply to ticked</button>
        <button class="darkbtn" onclick="finContractApplyPct(false)">Apply to all lines</button>
      </div>
      <p class="stub" id="finCtEg" style="margin:8px 0 0;font-style:normal;">e.g. a £1,000.00 line at 20% margin costs £800.00; at 20% mark-up it costs £833.33.</p>
    </div>
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
        <p class="sectiontitle" style="margin:0;">Schedule</p>
        <span class="fincontot"><span class="finval" id="finContractTotal"></span><span class="stub" id="finContractCostTot" style="margin:0;font-style:normal;"></span></span>
      </div>
      <div id="finCtBulk" class="finbulkbar" style="display:none;"></div>
      <div id="finContractList" style="margin-top:8px;"></div>
      <div class="row-gap" style="flex-wrap:wrap;margin-top:8px;">
        <button class="ghostbtn" style="flex:1;min-width:110px;" onclick="finContractAdd('section')">+ Header</button>
        <button class="ghostbtn" style="flex:1;min-width:110px;" onclick="finContractAdd('subsection')">+ Sub-header</button>
        <button class="ghostbtn" style="flex:1;min-width:110px;" onclick="finContractAdd('item')">+ Item</button>
      </div>
    </div>
    <button class="darkbtn" style="width:100%;" id="finContractSave" onclick="saveFinContract('${siteId}')">Save schedule</button>
    <p class="stub" style="margin:6px 0 0;font-style:normal;">Saving sets the project’s contract value to the total of the items. Value = quantity × rate; leave the quantity and rate empty to enter a lump sum.${(FIN_SUBJOBS[siteId]||[]).length ? ' Put a header on a '+escapeHtml(finSubNoun(siteId).toLowerCase())+' and everything under it goes there too.' : ''}</p>
  `, {title:'Priced schedule of works', subtitle:site?site.name:'', back:`#/site/${siteId}/finance`, siteId, tabs:false});
  finContractPaint();
}
function finContractPaint(){
  const el = document.getElementById('finContractList'); if(!el) return;
  const tot = finGroupTotals(finContractRows, r=>finItemValue(r));
  const subs = FIN_SUBJOBS[finContractSite] || [];
  const plotSel = i=>subs.length ? `<select class="fincrow-plot" aria-label="${escapeHtml(finSubNoun(finContractSite))}" onchange="finContractRows[${i}].sub=this.value"><option value="">${finContractRows[i].kind==='item' ? 'Plot: as header' : 'Plot: none'}</option>${subs.map(a=>`<option value="${a.id}" ${finContractRows[i].sub===a.id?'selected':''}>${escapeHtml(a.short)}</option>`).join('')}</select>` : '';
  const ctl = i=>plotSel(i)+`<span class="fincrow-ctl"><button class="linkbtn" title="Move up" onclick="finContractMove(${i},-1)">↑</button><button class="linkbtn" title="Move down" onclick="finContractMove(${i},1)">↓</button><select onchange="finContractRows[${i}].kind=this.value;finContractPaint()">${Object.keys(FIN_KIND_LABEL).map(k=>`<option value="${k}" ${finContractRows[i].kind===k?'selected':''}>${FIN_KIND_LABEL[k]}</option>`).join('')}</select><button class="linkbtn" title="Remove" onclick="finContractRows.splice(${i},1);finContractPaint()">✕</button></span>`;
  el.innerHTML = finContractRows.length ? finContractRows.map((r,i)=>{
    if(r.kind==='section' || r.kind==='subsection') return `<div class="fincrow ${r.kind}">
        <div class="fincrow-head"><input type="checkbox" class="fincsel" aria-label="Tick everything under this" ${finContractGroupTicked(i)?'checked':''} onchange="finContractTickGroup(${i}, this.checked)"><input type="text" class="fincline-ref" placeholder="Ref" value="${escapeHtml(r.ref||'')}" oninput="finContractRows[${i}].ref=this.value">
          <input type="text" class="fincrow-title" placeholder="${r.kind==='section'?'Header, e.g. Main roof':'Sub-header, e.g. Slating'}" value="${escapeHtml(r.description||'')}" oninput="finContractRows[${i}].description=this.value"></div>
        <div class="fincrow-foot">${ctl(i)}<b id="finCTot-${i}">${finMoney((tot[i]||{}).value)}</b></div>
      </div>`;
    const v = finItemValue(r);
    const auto = finNum(r.qty)!==null && finNum(r.rate)!==null;
    return `<div class="fincrow item ${r._sel?'sel':''}">
      <div class="fincrow-head"><input type="checkbox" class="fincsel" aria-label="Tick this line" ${r._sel?'checked':''} onchange="finContractTick(${i}, this.checked)"><input type="text" class="fincline-ref" placeholder="Ref" value="${escapeHtml(r.ref||'')}" oninput="finContractRows[${i}].ref=this.value">
        <textarea rows="1" placeholder="Description" oninput="finContractRows[${i}].description=this.value">${escapeHtml(r.description||'')}</textarea></div>
      <div class="fincrow-nums">
        <label>Qty<input type="text" inputmode="decimal" value="${r.qty!=null&&!isNaN(r.qty)?escapeHtml(String(r.qty)):''}" oninput="finContractSetNum(${i},'qty',this.value)"></label>
        <label>Unit<input type="text" value="${escapeHtml(r.unit||'')}" placeholder="m², nr" oninput="finContractRows[${i}].unit=this.value"></label>
        <label>Rate £<input type="text" inputmode="decimal" data-money value="${r.rate!=null&&!isNaN(r.rate)?escapeHtml(String(r.rate)):''}" oninput="finContractSetNum(${i},'rate',this.value)"></label>
        <label>Value £<input type="text" inputmode="decimal" data-money id="finCVal-${i}" value="${v!=null?escapeHtml(String(v)):''}" ${auto?'disabled':''} oninput="finContractSetNum(${i},'value',this.value)"></label>
        <label>Cost £<input type="text" inputmode="decimal" data-money id="finCCost-${i}" value="${r.cost!=null?escapeHtml(String(r.cost)):''}" placeholder="—" oninput="finContractSetCost(${i}, this.value)"></label>
      </div>
      <div class="fincrow-mg" id="finCMg-${i}">${finContractMgTxt(r)}</div>
      <div class="fincrow-foot">${ctl(i)}</div>
    </div>`;
  }).join('') : `<div class="empty" style="margin:0;">No lines yet. Upload a file or add a header and items.</div>`;
  finContractPaintTotal();
  finContractBulkPaint();
}
window.finContractSetNum = function(i, key, v){
  const r = finContractRows[i]; r[key] = finNum(v);
  const auto = finNum(r.qty)!==null && !isNaN(finNum(r.qty)) && finNum(r.rate)!==null && !isNaN(finNum(r.rate));
  const vEl = document.getElementById('finCVal-'+i);
  if(vEl && key!=='value'){ vEl.disabled = auto; if(auto) finSetMoney(vEl, finItemValue(r)); }
  if(auto) r.value = finItemValue(r);
  if(r.cost_basis && r.cost_pct!=null){ r.cost = finCostFromPct(finItemValue(r), r.cost_basis, r.cost_pct); finSetMoney(document.getElementById('finCCost-'+i), r.cost); }
  const mg = document.getElementById('finCMg-'+i); if(mg) mg.innerHTML = finContractMgTxt(r);
  finContractPaintTotal();
};
window.finContractMove = function(i, d){ const j = i+d; if(j<0 || j>=finContractRows.length) return; const t = finContractRows[i]; finContractRows[i] = finContractRows[j]; finContractRows[j] = t; finContractPaint(); };
window.finContractPaintTotal = function(){
  const items = finContractRows.filter(finIsItem);
  const sell = items.reduce((s,r)=>s+(Number(finItemValue(r))||0),0);
  const t = document.getElementById('finContractTotal'); if(t) t.textContent = finMoney(sell);
  const costed = items.filter(r=>r.cost!=null && !isNaN(r.cost)); const cost = costed.reduce((s,r)=>s+Number(r.cost),0);
  const ct = document.getElementById('finContractCostTot');
  if(ct) ct.innerHTML = costed.length ? `Cost ${finMoney(cost)} · margin ${finPctTxt(sell ? (sell-cost)/sell*100 : null)}${costed.length<items.length ? ` · <span style="color:var(--warn,#B0740F);">${items.length-costed.length} line${items.length-costed.length===1?'':'s'} without a cost</span>` : ''}` : 'No costs yet';
  const tot = finGroupTotals(finContractRows, r=>finItemValue(r));
  Object.keys(tot).forEach(i=>{ const el = document.getElementById('finCTot-'+i); if(el) el.textContent = finMoney(tot[i].value); });
};
window.finContractAdd = function(kind){ finContractRows.push({kind, ref:'', description:'', qty:null, unit:'', rate:null, value:null}); finContractPaint(); };
window.saveFinContract = async function(siteId){
  const rows = finContractRows.map((r,_i)=>({_i, id:r.id, sub:r.sub||null, _task_id:r._task_id||null, _sec_id:r._sec_id||null, kind:r.kind||'item', ref:String(r.ref||'').trim()||null, description:String(r.description||'').trim(),
      qty: (finNum(r.qty)===null||isNaN(finNum(r.qty))) ? null : finNum(r.qty), unit:String(r.unit||'').trim()||null,
      rate: (finNum(r.rate)===null||isNaN(finNum(r.rate))) ? null : finNum(r.rate), value: finItemValue(r), cost:(r.cost==null||isNaN(r.cost))?null:finRound(Number(r.cost)), cost_basis:r.cost_basis||null, cost_pct:r.cost_pct==null?null:Number(r.cost_pct)}))
    .filter(r=>r.description || r.value!==null);
  if(rows.some(r=>!r.description)){ toast('Every line needs a description.'); return; }
  if(rows.some(r=>finIsItem(r) && r.value===null)){ toast('Every item needs a value (quantity × rate, or a lump sum).'); return; }
  const btn = document.getElementById('finContractSave'); if(btn){ btn.disabled = true; btn.textContent = 'Saving…'; }
  const existing = await dbSelect('fin_contract_items', 'site_id=eq.'+siteId+'&select=id');
  const keep = new Set(rows.filter(r=>r.id).map(r=>r.id));
  let failed = 0;
  for(const e of existing) if(!keep.has(e.id)){ if(!(await dbDelete('fin_contract_items', e.id))) failed++; }
  for(let i=0;i<rows.length;i++){
    const r = rows[i], data = {kind:r.kind, ref:r.ref, description:r.description, qty:r.qty, unit:r.unit, rate:r.rate, value: finIsItem(r) ? r.value : 0, position:i, section:null, sub_job_id:r.sub, cost: finIsItem(r) ? r.cost : null, cost_basis: finIsItem(r) && r.cost!=null ? r.cost_basis : null, cost_pct: finIsItem(r) && r.cost!=null && r.cost_basis ? r.cost_pct : null};
    if(r.id && existing.some(e=>e.id===r.id)){ if(!(await dbUpdate('fin_contract_items', r.id, data))) failed++; }
    else { const ins = await dbInsert('fin_contract_items', Object.assign({org_id:ME.org_id, site_id:siteId}, data)); if(ins && ins[0]){ r.id = ins[0].id; } else failed++; }
    // Copied in from the site schedule: link the task / section to this line.
    if(r.id && r._task_id) await dbUpdate('schedule_tasks', r._task_id, {contract_item_id:r.id});
    if(r.id && r._sec_id) await dbUpdate('schedule_sections', r._sec_id, {contract_item_id:r.id});
  }
  const total = finRound(rows.filter(finIsItem).reduce((t,r)=>t+r.value, 0));
  const costTotal = finRound(rows.filter(r=>finIsItem(r) && r.cost!=null).reduce((t,r)=>t+r.cost, 0));
  const allCosted = rows.filter(finIsItem).every(r=>r.cost!=null);
  const jfNow = (await dbSelect('job_finance', 'site_id=eq.'+siteId))[0] || {};
  const base = {};
  if(jfNow.original_value==null){ base.original_value = total; base.original_at = new Date().toISOString(); }
  if(jfNow.original_cost==null && allCosted && costTotal){ base.original_cost = costTotal; if(!base.original_at) base.original_at = new Date().toISOString(); }
  const patch = {...base, site_id:siteId, org_id:ME.org_id, contract_value:total, billing_type:'application', updated_at:new Date().toISOString(), updated_by:ME.id};
  if(finContractFile){
    const safe = finContractFile.name.replace(/[^a-z0-9.\-]+/gi,'_').slice(-80);
    const stored = await uploadToStorage('finance-docs', ME.org_id+'/'+siteId+'/contract/'+uid()+'-'+safe, finContractFile, finContractFile.type||'application/octet-stream');
    if(stored){ patch.contract_file_path = stored; patch.contract_file_name = finContractFile.name; }
  }
  const jr = await sbFetch('/rest/v1/job_finance', {method:'POST', headers:{'Prefer':'resolution=merge-duplicates'}, body:JSON.stringify(patch)});
  if(failed || !jr.ok){
    if(btn){ btn.disabled = false; btn.textContent = 'Save schedule'; }
    toast(failed ? failed+' line'+(failed===1?'':'s')+' didn’t save — check your connection and tap Save again.' : 'The contract value didn’t update — '+(await safeErr(jr)));
    // keep the rows on screen; give new lines their ids so a retry doesn't duplicate them
    rows.forEach(r=>{ if(r.id && finContractRows[r._i]) finContractRows[r._i].id = r.id; });
    return;
  }
  finContractRows = null; finContractFile = null;
  if(btn){ btn.disabled = false; btn.textContent = 'Save schedule'; }
  toast('Schedule saved — contract value '+finMoney(total));
  render();
};
window.openFinDoc = async function(path, name){
  if(!path) return;
  const url = await resolveStorageUrl(publicUrl('finance-docs', path));
  if(/\.pdf$/i.test(name||path)) return viewPdfInApp(url, name||'Document');
  window.open(url, '_blank');
};

/* ---- reading an uploaded breakdown ---- */
let finImport = null; // {kind:'sheet', sheets, bolds, sheet, header, cols:{desc,ref,qty,unit,rate,amount}, preview} | {kind:'pdf', lines, preview}
const FIN_TOTAL_RE = /^(sub[\s-]?total|total|grand total|carried|brought|c\/f|b\/f|collection|summary|vat|net total|contract sum|to collection|to summary)\b/i;
const FIN_UNIT_RE = /^(m2|m²|sqm|m3|m³|m|lm|mtr|nr|no|item|sum|ls|l\.s\.|hr|hrs|day|days|wk|week|kg|t|tonne|set|pair|each|ea|prov|ps|pc)\.?$/i;
function finNumCell(v){ if(typeof v==='number') return v; if(typeof v==='string'){ const s = v.replace(/[£,\s]/g,''); if(/^-?\d+(\.\d+)?$/.test(s)) return Number(s); } return null; }
window.finContractUploadPicked = async function(file){
  if(!file) return;
  finContractFile = file;
  const isPdf = /\.pdf$/i.test(file.name) || file.type==='application/pdf';
  try{
    if(isPdf){
      if(!(await loadLib('pdfjsLib'))){ toast('Could not load the PDF reader — check your connection.'); return; }
      const pdf = await pdfjsLib.getDocument({data: new Uint8Array(await file.arrayBuffer())}).promise;
      const lines = [];
      for(let p=1; p<=Math.min(pdf.numPages, 40); p++){
        const tc = await (await pdf.getPage(p)).getTextContent();
        const rows = {};
        tc.items.forEach(it=>{ const y = Math.round(it.transform[5]/3)*3; (rows[y] = rows[y] || []).push({x:it.transform[4], s:it.str}); });
        Object.keys(rows).map(Number).sort((a,b)=>b-a).forEach(y=>{ lines.push(rows[y].sort((a,b)=>a.x-b.x).map(t=>t.s).join(' ').replace(/\s+/g,' ').trim()); });
      }
      const found = [];
      lines.forEach(t=>{
        if(!t) return;
        // "<desc> <qty> <unit> <rate> <amount>" or "<desc> <amount>"
        let m = /^(.*?[A-Za-z].*?)\s+([\d,]+(?:\.\d+)?)\s+([A-Za-z²³.]{1,6})\s+£?\s?([\d,]+\.\d{2,4})\s+£?\s?(-?[\d,]+\.\d{2})\s*$/.exec(t);
        if(m){ found.push({kind:'item', description:m[1].trim(), qty:Number(m[2].replace(/,/g,'')), unit:m[3], rate:Number(m[4].replace(/,/g,'')), value:Number(m[5].replace(/,/g,''))}); return; }
        m = /^(.*?[A-Za-z].*?)\s+£?\s?(-?[\d,]+\.\d{2})\s*$/.exec(t);
        if(m){ const desc = m[1].trim(); found.push({kind: FIN_TOTAL_RE.test(desc) ? 'skip' : 'item', description:desc, value:Number(m[2].replace(/,/g,''))}); return; }
        // A short line in capitals with no amount reads as a header.
        if(t.length <= 60 && /[A-Z]{3}/.test(t) && t===t.toUpperCase() && !/\d{3,}/.test(t)) found.push({kind:'section', description:t});
      });
      finImport = {kind:'pdf', lines:found};
    } else {
      if(!(await loadLib('XLSX'))){ toast('Could not load the Excel reader — check your connection.'); return; }
      const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), {type:'array', cellStyles:true});
      const sheets = {}, bolds = {};
      wb.SheetNames.forEach(n=>{
        sheets[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], {header:1, raw:true, blankrows:true, defval:''});
        // remember bold rows (a common way of marking headers)
        const ws = wb.Sheets[n], b = {};
        Object.keys(ws).forEach(k=>{ if(k[0]==='!') return; const c = ws[k]; if(c && c.s && c.s.font && c.s.font.bold){ const a = XLSX.utils.decode_cell(k); b[a.r] = true; } });
        bolds[n] = b;
      });
      const score = rows=>rows.filter(r=>r.some(c=>typeof c==='number') && r.some(c=>typeof c==='string' && /[a-z]{3}/i.test(c))).length;
      const sheet = wb.SheetNames.slice().sort((a,b)=>score(sheets[b])-score(sheets[a]))[0];
      finImport = Object.assign({kind:'sheet', sheets, bolds}, finGuessColumns(sheets[sheet]), {sheet});
    }
  }catch(e){ console.error(e); toast('Could not read that file.'); return; }
  finImport.preview = finImportRows();
  finImportShow();
};
function finGuessColumns(rows){
  const width = Math.max(0, ...rows.slice(0, 400).map(r=>r.length));
  let header = -1;
  for(let i=0;i<Math.min(rows.length, 40);i++){ if(rows[i].some(c=>typeof c==='string' && /^(description|item|details|element|work|amount|total|£|value|price|ref|qty|quantity|rate|unit)/i.test(c.trim()))){ header = i; break; } }
  const hdr = (rows[header]||[]).map(c=>String(c||'').trim().toLowerCase());
  const find = re=>{ for(let c=width-1;c>=0;c--) if(re.test(hdr[c]||'')) return c; return -1; };
  const findFirst = re=>{ for(let c=0;c<width;c++) if(re.test(hdr[c]||'')) return c; return -1; };
  const body = rows.slice(header+1, header+400);
  let desc = findFirst(/^(description|details|item description|work|element)/);
  if(desc<0){ let best=-1; for(let c=0;c<width;c++){ const t = body.reduce((s,r)=>s+(typeof r[c]==='string'?Math.min(60,r[c].trim().length):0),0); if(t>best){ best=t; desc=c; } } }
  // A "cost price" column next to a "sell price" column (Coreloops-style exports): read both.
  const costCol = findFirst(/^(cost price|cost rate|nett cost|net cost|our cost|budget|cost)/);
  let amount = find(/^(sell|sale)/);
  if(amount<0) amount = find(/^(amount|total|£|value|price|sum)/);
  if(amount<0 && costCol<0) amount = find(/^cost/);
  if(amount<0){ let bestN=-1; for(let c=width-1;c>=0;c--){ if(c===desc) continue; const n = body.filter(r=>finNumCell(r[c])).length; if(n>bestN){ bestN=n; amount=c; } } }
  let qty = findFirst(/^(qty|quantity|quant)/), unit = findFirst(/^(unit|units|uom)$/), rate = findFirst(/^(rate|unit rate|£\/unit)/);
  // No headings for them: look for a unit-looking text column and the numbers either side of it.
  if(unit<0){ for(let c=0;c<width;c++){ if(c===desc) continue; const n = body.filter(r=>typeof r[c]==='string' && FIN_UNIT_RE.test(r[c].trim())).length; if(n >= Math.max(2, body.length*0.15)){ unit = c; break; } } }
  if(unit>=0 && qty<0 && unit-1!==desc && unit-1>=0) qty = unit-1;
  if(unit>=0 && rate<0 && unit+1<width && unit+1!==amount) rate = unit+1;
  let ref = findFirst(/^(ref|item|no\.?|code)$/);
  if(ref<0){ for(let c=0;c<desc;c++){ const n = body.filter(r=>String(r[c]||'').trim().length && String(r[c]).trim().length<=8).length; if(n > body.length*0.3){ ref = c; break; } } }
  return {header, cols:{desc, ref, qty, unit, rate, amount, cost: costCol!==amount ? costCol : -1}};
}
function finImportRows(){
  if(!finImport) return [];
  if(finImport.kind==='pdf') return finImport.lines;
  const rows = finImport.sheets[finImport.sheet] || [], bold = (finImport.bolds||{})[finImport.sheet] || {}, c = finImport.cols;
  const out = [];
  rows.forEach((r, ri)=>{
    if(ri <= finImport.header) return;
    const desc = c.desc>=0 ? String(r[c.desc]==null?'':r[c.desc]).trim() : '';
    const ref = c.ref>=0 ? String(r[c.ref]==null?'':r[c.ref]).trim() : '';
    const amt = c.amount>=0 ? finNumCell(r[c.amount]) : null;
    const qty = c.qty>=0 ? finNumCell(r[c.qty]) : null;
    const rate = c.rate>=0 ? finNumCell(r[c.rate]) : null;
    const unit = c.unit>=0 ? String(r[c.unit]==null?'':r[c.unit]).trim() : '';
    const cost = c.cost>=0 ? finNumCell(r[c.cost]) : null;
    if(!desc && !amt) return;
    let value = amt;
    if((value===null || value===0) && qty!==null && rate!==null) value = finRound(qty*rate);
    if(value!==null && value!==0){
      out.push({kind: FIN_TOTAL_RE.test(desc) ? 'skip' : 'item', ref, description:desc||ref, qty, unit, rate, value:finRound(value), cost:cost!=null?finRound(cost):null});
    } else if(desc){
      // No money on the row: a header. Capitals, bold or a whole-number ref → header; otherwise sub-header.
      const top = (desc===desc.toUpperCase() && /[A-Z]/.test(desc)) || (/^[A-Z0-9]{1,3}$/.test(ref));
      out.push({kind: (top || bold[ri]) && !/^\d+\.\d+/.test(ref) ? 'section' : 'subsection', ref, description:desc});
    }
  });
  return out;
}
function finImportShow(){
  let ov = document.getElementById('finImportOverlay');
  if(!ov){ ov = document.createElement('div'); ov.id = 'finImportOverlay'; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
  ov.onclick = e=>{ if(e.target===ov) ov.style.display='none'; };
  const rows = finImport.preview || [];
  const used = rows.filter(r=>r.kind==='item');
  const total = used.reduce((t,r)=>t+r.value, 0);
  const colName = i=>{ let s=''; i++; while(i>0){ const m=(i-1)%26; s=String.fromCharCode(65+m)+s; i=Math.floor((i-1)/26); } return s; };
  const sheetRows = finImport.kind==='sheet' ? finImport.sheets[finImport.sheet] : [];
  const width = finImport.kind==='sheet' ? Math.max(1, ...sheetRows.slice(0,200).map(r=>r.length)) : 0;
  const hdr = finImport.kind==='sheet' ? (sheetRows[finImport.header]||[]) : [];
  const colSel = (key, label)=>`<div class="formfield"><label class="field-label">${label}</label><select onchange="finImportSetCol('${key}', +this.value)"><option value="-1">None</option>${Array.from({length:width}, (_,i)=>`<option value="${i}" ${finImport.cols[key]===i?'selected':''}>${colName(i)}${hdr[i]?' — '+escapeHtml(String(hdr[i]).slice(0,20)):''}</option>`).join('')}</select></div>`;
  const kinds = {section:'Header', subsection:'Sub-header', item:'Item', skip:'Skip'};
  ov.innerHTML = `<div class="geo-modal-card" style="max-width:720px;">
    <h3>Check the breakdown</h3>
    ${finImport.kind==='sheet' ? `
      <div class="formfield"><label class="field-label">Sheet</label><select onchange="finImportSet('sheet', this.value)">${Object.keys(finImport.sheets).map(n=>`<option ${n===finImport.sheet?'selected':''}>${escapeHtml(n)}</option>`).join('')}</select></div>
      <details class="fincols"><summary>Columns</summary><div class="fingrid3">${colSel('ref','Ref')}${colSel('desc','Description')}${colSel('qty','Quantity')}${colSel('unit','Unit')}${colSel('rate','Rate')}${colSel('amount','Amount (sell)')}${colSel('cost','Cost price')}</div></details>` : `<p class="stub" style="margin:0 0 8px;font-style:normal;">Read from the PDF. Lines ending in an amount are items; short lines in capitals are headers.</p>`}
    <p class="stub" style="margin:6px 0;font-style:normal;" id="finImportSum">${used.length} item${used.length===1?'':'s'} · total <b>${finMoney(total)}</b>. Change any line’s type; totals are skipped so nothing is counted twice.</p>
    <div class="finimport">${rows.length ? rows.map((r,i)=>`<div class="finimport-r k-${r.kind}">
        <select onchange="finImport.preview[${i}].kind=this.value;finImportSync()">${Object.keys(kinds).map(k=>`<option value="${k}" ${r.kind===k?'selected':''}>${kinds[k]}</option>`).join('')}</select>
        <span>${escapeHtml(r.ref?r.ref+' · ':'')}${escapeHtml(r.description)}${r.qty!=null||r.rate!=null?`<em>${finQtyFmt(r.qty)} ${escapeHtml(r.unit||'')}${r.rate!=null?' × '+finRateFmt(r.rate):''}</em>`:''}</span>
        <b>${r.value!=null?finMoney(r.value):''}</b></div>`).join('') : '<div class="empty" style="margin:0;">Nothing found. Try another sheet or set the columns.</div>'}</div>
    <button class="darkbtn" style="width:100%;margin-top:10px;" onclick="finImportUse()" ${used.length?'':'disabled'}>Use this breakdown</button>
    <button class="geo-modal-cancel" onclick="document.getElementById('finImportOverlay').style.display='none'">Cancel</button>
  </div>`;
  ov.style.display = 'flex';
}
window.finImportSet = function(k, v){
  finImport[k] = v;
  if(k==='sheet') Object.assign(finImport, finGuessColumns(finImport.sheets[v]));
  finImport.preview = finImportRows();
  finImportShow();
};
window.finImportSetCol = function(k, v){ finImport.cols[k] = v; finImport.preview = finImportRows(); finImportShow(); };
window.finImportSync = function(){
  const used = finImport.preview.filter(r=>r.kind==='item');
  const p = document.getElementById('finImportSum'); if(p) p.innerHTML = `${used.length} item${used.length===1?'':'s'} · total <b>${finMoney(used.reduce((t,r)=>t+r.value,0))}</b>. Change any line’s type; totals are skipped so nothing is counted twice.`;
  document.querySelectorAll('#finImportOverlay .finimport-r').forEach((el,i)=>{ el.className = 'finimport-r k-'+finImport.preview[i].kind; });
};
window.finImportUse = function(){
  const kept = (finImport.preview||[]).filter(r=>r.kind!=='skip' && !(r.kind==='item' && (r.value===null || r.value===undefined)));
  finContractRows = kept.map(r=>({kind:r.kind, ref:r.ref||'', description:r.description, qty:r.kind==='item'?(r.qty??null):null, unit:r.kind==='item'?(r.unit||''):'', rate:r.kind==='item'?(r.rate??null):null, value:r.kind==='item'?r.value:null, cost:r.kind==='item' && r.cost!=null ? r.cost : null, cost_basis:'', cost_pct:null, sub:''}));
  // A quantity and rate that don't multiply up to the amount: keep the amount as a lump sum.
  finContractRows.forEach(r=>{ if(r.kind==='item' && r.qty!=null && r.rate!=null && Math.abs(finRound(r.qty*r.rate) - r.value) > 1){ r.qty = null; r.rate = null; } });
  document.getElementById('finImportOverlay').style.display = 'none';
  finContractPaint();
  toast(kept.length+' lines ready — check them and tap Save schedule');
};

/* ---------------- Applications ---------------- */
window.newFinApplication = async function(siteId){
  const site = SITES.find(s=>s.id===siteId); if(!site) return;
  const [st, jfRows, pos, items, apps, vars, fvars] = await Promise.all([
    finLoadSettings(),
    dbSelect('job_finance', 'site_id=eq.'+siteId),
    dbSelect('client_pos', 'site_id=eq.'+siteId+'&order=is_primary.desc,created_at.asc&select=po_number'),
    dbSelect('fin_contract_items', 'site_id=eq.'+siteId+'&order=position.asc'),
    dbSelect('fin_applications', 'site_id=eq.'+siteId+'&order=number.desc'),
    dbSelect('variations', 'site_id=eq.'+siteId+'&approval_status=eq.approved&order=created_at.asc'),
    dbSelect('fin_variations', 'site_id=eq.'+siteId+'&status=in.(priced,submitted,agreed)&order=seq.asc'),
  ]);
  if(!items.filter(finIsItem).length){ toast('Set up the priced schedule of works first.'); go(`#/site/${siteId}/finance/contract`); return; }
  const jf = jfRows[0] || {};
  const last = apps.find(a=>a.status!=='void');
  const lastPct = {}; ((last&&last.lines)||[]).forEach(l=>{ if(finIsItem(l)) lastPct[l.item_id] = l.pct; });
  const lastVar = {}, lastFinVar = {}; ((last&&last.variations)||[]).forEach(v=>{ if(v.variation_id) lastVar[v.variation_id] = v; if(v.fin_variation_id) lastFinVar[v.fin_variation_id] = v; });
  const today = finToday();
  const val = finAppDateFor(jf, st, today.slice(0,7)) || today;
  const dueDays = jf.due_days!=null ? jf.due_days : st.default_due_days, finalDays = jf.final_days!=null ? jf.final_days : st.default_final_days;
  const due = finAddDays(val, dueDays);
  // Variations register (911) first: agreed at the agreed value, priced/submitted at the quoted value.
  const linkedSite = new Set(fvars.map(v=>v.variation_id).filter(Boolean));
  const varRows = fvars.map(v=>{ const prev = lastFinVar[v.id]; const val = v.status==='agreed' && v.agreed_value!=null ? Number(v.agreed_value) : Number(v.quoted||0); return {fin_variation_id:v.id, variation_id:v.variation_id||null, description:v.number+' '+v.title+(v.status==='agreed'?'':' (not yet agreed)'), value:val, pct: prev ? prev.pct : 100}; });
  vars.filter(v=>!linkedSite.has(v.id)).map(v=>{ const prev = lastVar[v.id]; const amt = finNum(v.cost_impact); return {variation_id:v.id, description:v.description||'Variation', value: prev ? prev.value : ((amt===null||isNaN(amt))?0:amt), pct: prev ? prev.pct : 100}; }).forEach(r=>varRows.push(r));
  ((last&&last.variations)||[]).filter(v=>!v.variation_id && !v.fin_variation_id).forEach(v=>varRows.push(Object.assign({}, v)));
  const row = {
    org_id:ME.org_id, site_id:siteId, number:(apps[0] ? apps[0].number : 0)+1, status:'draft',
    valuation_date:val, due_date:due, final_date:finAddDays(due, finalDays), client_po:(pos[0]||{}).po_number||null,
    lines: items.map(i=>finIsItem(i)
      ? {kind:'item', item_id:i.id, ref:i.ref||'', description:i.description, qty:i.qty!=null?Number(i.qty):null, unit:i.unit||'', rate:i.rate!=null?Number(i.rate):null, value:Number(i.value), pct: lastPct[i.id]!=null ? lastPct[i.id] : 0}
      : {kind:i.kind, item_id:i.id, ref:i.ref||'', description:i.description}),
    variations: varRows, dayworks: [],
    retention_pct: jf.retention_pct!=null ? jf.retention_pct : st.default_retention_pct, created_by:ME.id,
  };
  const ins = await dbInsert('fin_applications', row);
  if(ins && ins[0]) go(`#/site/${siteId}/finance/application/${ins[0].id}`);
};

let finApp = null, finAppCtx = null, finAppCollapsed = {}, finAppMode = 'pct', finAppValued = false;
async function renderFinApplication(siteId, appId){
  if(!finGuard()) return;
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  const [rows, apps, jfRows, siteProgress] = await Promise.all([
    dbSelect('fin_applications', 'id=eq.'+appId),
    dbSelect('fin_applications', 'site_id=eq.'+siteId+'&select=id,number,status,net_due,cert_net,cert_previous'),
    dbSelect('job_finance', 'site_id=eq.'+siteId),
    finSiteProgress(siteId),
  ]);
  if(__gen !== RENDER_GEN) return;
  const a = rows[0];
  if(!a || !site){ toast('Application not found.'); go(`#/site/${siteId}/finance`); return; }
  if(!finApp || finApp.id!==a.id){ finAppCollapsed = {}; finAppValued = false; }
  if(!finApp || finApp.id!==a.id || finApp.__loaded !== a.updated_at){ finApp = JSON.parse(JSON.stringify(a)); finApp.__loaded = a.updated_at; }
  const jf = jfRows[0] || {};
  finAppCtx = {site, jf, previous: finPreviousCertified(apps, a.number), locked: ['certified','invoiced','void'].includes(a.status), siteProgress};
  const spAhead = (finApp.lines||[]).filter(l=>finIsItem(l) && siteProgress[l.item_id]!=null && siteProgress[l.item_id] > finPct(l.pct)).length;
  const locked = finAppCtx.locked;
  document.getElementById('app').innerHTML = shell(`
    <div class="card finhead">
      <div><div class="finhead-l">Application</div><div class="finhead-v">No. ${a.number} ${finAppPill(a)}</div></div>
      <div><div class="finhead-l">Valuation date</div><div class="finhead-v">${finDate(a.valuation_date)}</div></div>
      <div><div class="finhead-l">Client PO</div><div class="finhead-v">${escapeHtml(a.client_po||'—')}</div></div>
      <div><div class="finhead-l">Due this time</div><div class="finhead-v" id="finAppDueHead">—</div></div>
    </div>
    ${locked ? `<div class="finbanner" style="background:var(--warn-bg);color:var(--warn);border-color:#F2D9B8;">This application has been certified, so it can’t be changed.</div>` : `
    <div class="card">
      <div class="fingrid2">
        <div class="formfield"><label class="field-label">Valuation date</label><input type="date" value="${a.valuation_date||''}" onchange="finApp.valuation_date=this.value"></div>
        <div class="formfield"><label class="field-label">Due date</label><input type="date" value="${a.due_date||''}" onchange="finApp.due_date=this.value"></div>
        <div class="formfield"><label class="field-label">Final date for payment</label><input type="date" value="${a.final_date||''}" onchange="finApp.final_date=this.value"></div>
        <div class="formfield"><label class="field-label">Retention %</label><input type="text" inputmode="decimal" value="${finPct(a.retention_pct)}" oninput="finApp.retention_pct=finPct(this.value);finAppPaint()"></div>
      </div>
    </div>`}
    <div class="card finappcard">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
        <p class="sectiontitle" style="margin:0;">Contract works</p>
        <div class="finapptools" id="finAppTools"></div>
      </div>
      ${!locked && Object.keys(siteProgress).length ? `<div class="finnote ${spAhead?'warn':'ok'}" style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;"><span>${spAhead ? `Site progress is ahead on <b style="display:inline;">${spAhead} line${spAhead===1?'':'s'}</b> (from the operatives’ Schedule of Works).` : 'Matches site progress from the operatives’ Schedule of Works.'}</span>${spAhead ? `<button class="ghostbtn" style="width:auto;margin:0;padding:7px 12px;" onclick="finAppUseSiteProgress()">Use site progress</button>` : ''}</div>` : ''}
      <div id="finAppLines"></div>
    </div>
    <div class="card">
      <p class="sectiontitle" style="margin-top:0;">Variations</p>
      ${(finApp.variations||[]).length ? finApp.variations.map((v,i)=>`<div class="finitem">
          <div class="finitem-d">${locked ? escapeHtml(v.description) : `<input type="text" value="${escapeHtml(v.description||'')}" placeholder="Variation" oninput="finApp.variations[${i}].description=this.value">`}</div>
          <div class="finitem-in">
            ${locked ? `<span class="finitem-sum">Value ${finMoney(v.value)} · ${finPct(v.pct)}%</span>` : `
            <label>Value £<input type="text" inputmode="decimal" data-money value="${v.value!=null?escapeHtml(String(v.value)):''}" oninput="finAppSet('variations',${i},'value',this.value)"></label>
            <label>% done<input type="text" inputmode="decimal" class="finpct" value="${finPct(v.pct)}" oninput="finAppSet('variations',${i},'pct',this.value)"></label>`}
            <b id="finAppG-variations-${i}">—</b>
          </div></div>`).join('') : `<p class="stub" style="margin:0;font-style:normal;">No agreed or submitted variations on this project — add them in the project’s Variations register.</p>`}
      ${locked ? '' : `<button class="ghostbtn" style="width:100%;margin-top:6px;" onclick="finAppAddVar()">+ Add a variation not in the app</button>`}
    </div>
    <div class="card">
      <p class="sectiontitle" style="margin-top:0;">Dayworks</p>
      ${(finApp.dayworks||[]).map((d,i)=>`<div class="finitem">
          <div class="finitem-d">${locked ? escapeHtml(d.description) : `<input type="text" value="${escapeHtml(d.description||'')}" placeholder="Description" oninput="finApp.dayworks[${i}].description=this.value">`}</div>
          <div class="finitem-in">${locked ? '' : `<label>Value £<input type="text" inputmode="decimal" data-money value="${d.value!=null?escapeHtml(String(d.value)):''}" oninput="finAppSet('dayworks',${i},'value',this.value)"></label>`}<b id="finAppG-dayworks-${i}">—</b></div>
        </div>`).join('') || `<p class="stub" style="margin:0;font-style:normal;">None.</p>`}
      ${locked ? '' : `<button class="ghostbtn" style="width:100%;margin-top:6px;" onclick="finApp.dayworks.push({description:'',value:null});finAppSaveSoft().then(render)">+ Add daywork</button>`}
    </div>
    <div class="card" id="finAppSummary"></div>
    ${locked ? '' : `<div class="row-gap" style="flex-wrap:wrap;">
      <button class="darkbtn" style="flex:1;min-width:140px;" id="finAppSave" onclick="saveFinApplication(true)">Save</button>
      <button class="darkbtn" style="flex:1;min-width:140px;" onclick="openFinAppEmail('${siteId}','${a.id}')">Email</button>
    </div>`}
    <div class="row-gap" style="flex-wrap:wrap;margin-top:10px;">
      <button class="ghostbtn" style="flex:1;min-width:140px;" onclick="downloadFinAppExcel('${a.id}')">Excel</button>
      ${locked ? '' : `<label class="ghostbtn" style="flex:1;min-width:140px;text-align:center;cursor:pointer;">Upload edited Excel<input type="file" accept=".xlsx,.xls" style="display:none;" onchange="uploadFinAppExcel(this.files[0])"></label>`}
    </div>
    ${['submitted','certified','invoiced'].includes(a.status) ? `<div id="finCertSlot"></div>` : ''}
    ${a.status==='draft' ? `<button class="ghostbtn" style="width:100%;margin-top:14px;color:var(--red);" onclick="deleteFinApplication('${siteId}','${a.id}')">Delete draft</button>` : ''}
  `, {title:'Application '+a.number, subtitle:site.name, back:`#/site/${siteId}/finance`, siteId, tabs:false});
  finAppPaintLines();
  finAppPaint();
  if(typeof finCertSlotRender==='function') finCertSlotRender(a);
}
// The contract lines, grouped under their headers (tap a header to fold it).
// Each item shows qty × unit × rate = value, then % complete and the
// quantity done — either can be typed and the other follows.
function finAppPaintLines(){
  const el = document.getElementById('finAppLines'); if(!el || !finApp) return;
  const locked = finAppCtx.locked;
  const lines = finApp.lines || [];
  let html = '', hiddenSec = false, hiddenSub = false;
  lines.forEach((l,i)=>{
    if(l.kind==='section'){ hiddenSec = !!finAppCollapsed[i]; hiddenSub = false;
      html += `<div class="finapphead sec" onclick="finAppToggle(${i})"><span><span class="finarrow">${hiddenSec?'▶':'▼'}</span>${escapeHtml(l.ref?l.ref+' ':'')}${escapeHtml(l.description)}</span><b id="finAppH-${i}"></b></div>`;
      if(!locked && !hiddenSec) html += `<div class="finappfill"><button class="linkbtn" style="color:var(--blue);" onclick="finAppFillGroup(${i},100)">Set all to 100%</button><button class="linkbtn" style="color:var(--slate);" onclick="finAppFillGroup(${i},0)">Set all to 0%</button></div>`;
      return; }
    if(l.kind==='subsection'){ hiddenSub = !!finAppCollapsed[i];
      if(hiddenSec) return;
      html += `<div class="finapphead sub" onclick="finAppToggle(${i})"><span><span class="finarrow">${hiddenSub?'▶':'▼'}</span>${escapeHtml(l.ref?l.ref+' ':'')}${escapeHtml(l.description)}</span><b id="finAppH-${i}"></b></div>`;
      return; }
    if(hiddenSec || hiddenSub) return;
    if(finAppValued && !finPct(l.pct)) return;
    const hasQty = l.qty!=null && !isNaN(Number(l.qty)) && Number(l.qty)!==0;
    const done = hasQty ? finRound(Number(l.qty)*finPct(l.pct)/100) : null;
    const gdone = finRound(Number(l.value||0)*finPct(l.pct)/100);
    const mode = finAppMode==='qty' && !hasQty ? 'pct' : finAppMode;
    html += `<div class="finitem">
      <div class="finitem-d">${escapeHtml(l.ref?l.ref+' · ':'')}${escapeHtml(l.description)}
        <em>${hasQty ? `${finQtyFmt(l.qty)} ${escapeHtml(l.unit||'')} × ${finRateFmt(l.rate)} = ` : (l.unit?escapeHtml(l.unit)+' · ':'')+'Value '}${finMoney(l.value)}${finAppCtx.siteProgress && finAppCtx.siteProgress[l.item_id]!=null ? ` · <span class="finsitepct ${finAppCtx.siteProgress[l.item_id] > finPct(l.pct) ? 'ahead' : ''}">site ${finAppCtx.siteProgress[l.item_id]}%</span>` : ''}</em></div>
      <div class="finitem-in">
        ${locked ? `<span class="finitem-sum">${finPct(l.pct)}%${hasQty?' · '+finQtyFmt(done)+' '+escapeHtml(l.unit||'')+' done':''}</span>` : `
        ${mode==='pct' ? `<label>% done<input type="text" inputmode="decimal" class="finpct" id="finAppP-${i}" value="${finPct(l.pct)}" oninput="finAppSetLine(${i},'pct',this.value)"></label>` : ''}
        ${mode==='gbp' ? `<label>£ to date<input type="text" inputmode="decimal" data-money id="finAppM-${i}" value="${gdone}" oninput="finAppSetLine(${i},'gbp',this.value)"></label>` : ''}
        ${mode==='qty' || (mode==='pct' && hasQty) ? `<label>${escapeHtml(l.unit||'Qty')} done<input type="text" inputmode="decimal" id="finAppQ-${i}" value="${String(done)}" oninput="finAppSetLine(${i},'qty',this.value)"></label>` : ''}
        <span class="finitem-sum" id="finAppS-${i}">${finAppLineSum(l, mode)}</span>`}
        <b id="finAppG-lines-${i}">—</b>
      </div></div>`;
  });
  el.innerHTML = html || `<div class="empty" style="margin:8px 0 0;">${finAppValued ? 'Nothing valued yet.' : 'No lines.'}</div>`;
  finAppToolsPaint();
}
function finAppLineSum(l, mode){
  const hasQty = l.qty!=null && !isNaN(Number(l.qty)) && Number(l.qty)!==0;
  const p = finPct(l.pct), g = finRound(Number(l.value||0)*p/100);
  const bits = [];
  if(mode!=='pct') bits.push(p+'%');
  if(mode!=='gbp') bits.push(finMoney(g));
  if(hasQty && mode==='gbp') bits.push(finQtyFmt(finRound(Number(l.qty)*p/100))+' '+escapeHtml(l.unit||''));
  return bits.join(' · ');
}
function finAppToolsPaint(){
  const el = document.getElementById('finAppTools'); if(!el) return;
  const secs = (finApp.lines||[]).map((l,i)=>l.kind==='section'||l.kind==='subsection' ? i : -1).filter(i=>i>-1);
  const allShut = secs.length && secs.every(i=>finAppCollapsed[i]);
  el.innerHTML = `${finAppCtx.locked ? '' : `<div class="finseg" role="tablist" title="Enter by"><button type="button" class="${finAppMode==='pct'?'on':''}" onclick="finAppSetMode('pct')">%</button><button type="button" class="${finAppMode==='gbp'?'on':''}" onclick="finAppSetMode('gbp')">£</button><button type="button" class="${finAppMode==='qty'?'on':''}" onclick="finAppSetMode('qty')">Qty</button></div>`}
    <label class="finswitch" style="margin:0;"><input type="checkbox" ${finAppValued?'checked':''} onchange="finAppValued=this.checked;finAppPaintLines();finAppPaint()"> Valued only</label>
    ${secs.length ? `<button type="button" class="linkbtn" onclick="finAppCollapseAll(${allShut?'false':'true'})">${allShut?'Expand all':'Collapse all'}</button>` : ''}`;
}
window.finAppSetMode = function(m){ finAppMode = m; finAppPaintLines(); finAppPaint(); };
window.finAppCollapseAll = function(shut){ (finApp.lines||[]).forEach((l,i)=>{ if(l.kind==='section'||l.kind==='subsection') finAppCollapsed[i] = !!shut; }); finAppPaintLines(); finAppPaint(); };
window.finAppToggle = function(i){ finAppCollapsed[i] = !finAppCollapsed[i]; finAppPaintLines(); finAppPaint(); };
window.finAppFillGroup = function(i, pct){
  const lines = finApp.lines; const level = lines[i].kind;
  for(let j=i+1;j<lines.length;j++){
    const k = lines[j].kind;
    if(k==='section' || (level==='subsection' && k==='subsection')) break;
    if(finIsItem(lines[j])) lines[j].pct = pct;
  }
  finAppPaintLines(); finAppPaint();
};
window.finAppSetLine = function(i, key, v){
  const l = finApp.lines[i];
  if(key==='gbp'){
    const n = finNum(v), val = Number(l.value||0);
    if(val && n!==null && !isNaN(n)) l.pct = finPct(n/val*100);
  } else if(key==='pct'){
    l.pct = finPct(v);
    const q = document.getElementById('finAppQ-'+i); if(q && l.qty) q.value = finRound(Number(l.qty)*l.pct/100);
  } else {
    const n = finNum(v); const tot = Number(l.qty||0);
    if(tot && n!==null && !isNaN(n)){ l.pct = finPct(n/tot*100); const p = document.getElementById('finAppP-'+i); if(p) p.value = l.pct; }
  }
  const sEl = document.getElementById('finAppS-'+i); if(sEl) sEl.innerHTML = finAppLineSum(l, finAppMode);
  finAppPaint();
};
window.finAppSet = function(path, i, key, v){
  finApp[path][i][key] = key==='pct' ? finPct(v) : finNum(v);
  finAppPaint();
};
window.finAppAddVar = function(){ finApp.variations.push({variation_id:null, description:'', value:null, pct:100}); finAppSaveSoft().then(render); };
window.finAppPaint = function(){
  if(!finApp || !finAppCtx) return;
  const c = finAppCalc(finApp, finAppCtx.jf.contract_value, finAppCtx.jf.retention_limit_pct, finAppCtx.previous);
  ['lines','variations','dayworks'].forEach(k=>c[k].forEach((x,i)=>{ const el = document.getElementById(`finAppG-${k}-${i}`); if(el) el.textContent = finMoney(x.gross); }));
  const tot = finGroupTotals(c.lines, l=>l.value, l=>l.gross);
  Object.keys(tot).forEach(i=>{ const el = document.getElementById('finAppH-'+i); if(el){ const t = tot[i]; const p = t.value ? Math.round(t.gross/t.value*1000)/10 : 0; el.innerHTML = `${finMoney(t.gross)}<em>of ${finMoney(t.value)} · ${p}%</em>`; } });
  const s = document.getElementById('finAppSummary');
  const contractTotal = c.lines.filter(finIsItem).reduce((t,l)=>t+Number(l.value||0),0), contractDone = c.lines.reduce((t,l)=>t+l.gross,0);
  if(s) s.innerHTML = `<div class="finkv"><span>Contract works to date${contractTotal?' ('+(Math.round(contractDone/contractTotal*1000)/10)+'% of '+finMoney(contractTotal)+')':''}</span><b>${finMoney(contractDone)}</b></div>
    ${c.variations.length?`<div class="finkv"><span>Variations</span><b>${finMoney(c.variations.reduce((t,x)=>t+x.gross,0))}</b></div>`:''}
    ${c.dayworks.length?`<div class="finkv"><span>Dayworks</span><b>${finMoney(c.dayworks.reduce((t,x)=>t+x.gross,0))}</b></div>`:''}
    <div class="finkv"><span><b>Gross valuation to date</b></span><b>${finMoney(c.gross)}</b></div>
    <div class="finkv"><span>Less retention @ ${finPct(finApp.retention_pct)}%${finAppCtx.jf.retention_limit_pct?' (limit '+finAppCtx.jf.retention_limit_pct+'%)':''}</span><b>−${finMoney(c.retention)}</b></div>
    <div class="finkv"><span>Less previously certified</span><b>−${finMoney(c.previous)}</b></div>
    <div class="finkv big"><span>Amount due this application</span><b>${finMoney(c.net_due)}</b></div>
    <p class="stub" style="margin:6px 0 0;font-style:normal;">Excl. VAT. An application isn’t a VAT invoice; the invoice follows the certificate.</p>`;
  const h = document.getElementById('finAppDueHead'); if(h) h.textContent = finMoney(c.net_due);
  return c;
};
function finAppRowForSave(){
  const c = finAppCalc(finApp, finAppCtx.jf.contract_value, finAppCtx.jf.retention_limit_pct, finAppCtx.previous);
  return {valuation_date:finApp.valuation_date||null, due_date:finApp.due_date||null, final_date:finApp.final_date||null,
    lines:c.lines, variations:c.variations.map(v=>Object.assign(v, {description:String(v.description||'').trim()})), dayworks:c.dayworks,
    gross:c.gross, retention_pct:finPct(finApp.retention_pct), retention:c.retention, previous:c.previous, net_due:c.net_due, updated_at:new Date().toISOString()};
}
window.finAppSaveSoft = async function(){ const r = await dbUpdate('fin_applications', finApp.id, finAppRowForSave()); if(r){ finApp = null; } return r; };
window.saveFinApplication = async function(showToast){
  const btn = document.getElementById('finAppSave'); if(btn){ btn.disabled = true; btn.textContent = 'Saving…'; }
  const r = await dbUpdate('fin_applications', finApp.id, finAppRowForSave());
  if(btn){ btn.disabled = false; btn.textContent = 'Save'; }
  if(r){ finApp = null; if(showToast) toast('Application saved'); render(); }
  return r;
};
window.deleteFinApplication = async function(siteId, id){
  const btn = event && event.target;
  if(btn && btn.dataset.sure!=='1'){ btn.dataset.sure='1'; btn.textContent='Tap again to delete'; return; }
  if(await dbDelete('fin_applications', id)){ finApp = null; toast('Draft deleted'); go(`#/site/${siteId}/finance`); }
};

/* ---- Excel out ----
   Columns: A ID (hidden) | B Ref | C Description | D Qty | E Unit | F Rate |
   G Contract value | H % complete | I Value to date | J Section to date.
   Header rows carry their sub-totals in G/J; only item rows feed the gross. */
async function finAppExcelBytes(a){
  if(!(await loadLib('ExcelJS'))){ toast('Could not load the Excel tool — check your connection.'); return null; }
  const site = SITES.find(s=>s.id===a.site_id) || {};
  const jfRows = await dbSelect('job_finance', 'site_id=eq.'+a.site_id); const jf = jfRows[0] || {};
  const wb = new ExcelJS.Workbook(); wb.creator = (ORG&&ORG.name)||'OpHUB';
  const ws = wb.addWorksheet('Application '+a.number, {pageSetup:{paperSize:9, orientation:'landscape', fitToPage:true, fitToWidth:1, fitToHeight:0}});
  ws.columns = [{key:'id', width:4, hidden:true}, {key:'ref', width:12}, {key:'desc', width:50}, {key:'qty', width:10}, {key:'unit', width:8}, {key:'rate', width:12}, {key:'value', width:15}, {key:'pct', width:11}, {key:'gross', width:15}, {key:'sec', width:15}];
  const money = '£#,##0.00;[Red]-£#,##0.00', rateFmt = '£#,##0.00##';
  const brand = String((ORG&&ORG.color_primary)||'#C8102E').replace('#','').toUpperCase();
  const t = ws.addRow(['', (ORG&&ORG.name)||'']); t.getCell(2).font = {bold:true, size:16, color:{argb:'FF'+brand}};
  const t2 = ws.addRow(['', 'Application for payment No. '+a.number]); t2.getCell(2).font = {bold:true, size:13};
  ws.addRow([]);
  const info = [['Client', jf.billing_name||site.client_name||''], ['Project', site.name||''], ['Project no.', site.job_number||''], ['Client PO', a.client_po||''], ['Valuation date', a.valuation_date?finDate(a.valuation_date):''], ['Due date', a.due_date?finDate(a.due_date):''], ['Final date for payment', a.final_date?finDate(a.final_date):'']];
  info.forEach(([k,v])=>{ const r = ws.addRow(['', k, v]); r.getCell(2).font = {bold:true, color:{argb:'FF5B6472'}}; r.getCell(3).font = {bold:true}; });
  ws.addRow([]);
  const head = ws.addRow(['ID', 'Ref', 'Description', 'Qty', 'Unit', 'Rate', 'Contract value', '% complete', 'Value to date', 'Section to date']);
  head.eachCell(c=>{ c.font = {bold:true, color:{argb:'FFFFFFFF'}}; c.fill = {type:'pattern', pattern:'solid', fgColor:{argb:'FF1F3A5F'}}; c.alignment = {vertical:'middle', wrapText:true}; });
  const firstData = head.number + 1;
  const band = (r, argb)=>{ for(let c=2;c<=10;c++) r.getCell(c).fill = {type:'pattern', pattern:'solid', fgColor:{argb}}; };
  const c = finAppCalc(a, jf.contract_value, jf.retention_limit_pct, a.previous);
  const tot = finGroupTotals(c.lines, l=>l.value, l=>l.gross);
  const line = (id, ref, desc, qty, unit, rate, value, pct, gross)=>{
    const r = ws.addRow([id, ref||'', desc||'', qty, unit||'', rate, value, pct, null, null]);
    const n = r.number;
    r.getCell(9).value = pct===null ? {formula:`G${n}`, result:gross} : {formula:`ROUND(G${n}*H${n}/100,2)`, result:gross};
    r.getCell(6).numFmt = rateFmt; r.getCell(7).numFmt = money; r.getCell(9).numFmt = money; r.getCell(8).numFmt = '0.##'; r.getCell(4).numFmt = '#,##0.###';
    if(pct!==null) r.getCell(8).fill = {type:'pattern', pattern:'solid', fgColor:{argb:'FFFFF6DB'}};
    r.getCell(3).alignment = {wrapText:true, vertical:'top'};
  };
  const section = (title)=>{ const r = ws.addRow(['', '', title]); r.getCell(3).font = {bold:true}; band(r, 'FFE7EDF4'); };
  section('CONTRACT WORKS');
  c.lines.forEach((l,i)=>{
    if(l.kind==='section' || l.kind==='subsection'){
      const r = ws.addRow(['H:'+(l.item_id||i), l.ref||'', l.description, null, null, null, (tot[i]||{}).value||0, null, null, (tot[i]||{}).gross||0]);
      r.getCell(3).font = {bold:true, size:l.kind==='section'?12:11, italic:l.kind==='subsection'}; r.getCell(2).font = {bold:true};
      r.getCell(7).numFmt = money; r.getCell(10).numFmt = money; r.getCell(7).font = {bold:true}; r.getCell(10).font = {bold:true};
      band(r, l.kind==='section' ? 'FFEEF1F5' : 'FFF7F8FA');
      return;
    }
    line('L:'+l.item_id, l.ref, l.description, l.qty!=null?Number(l.qty):null, l.unit, l.rate!=null?Number(l.rate):null, Number(l.value), finPct(l.pct), l.gross);
  });
  section('VARIATIONS'); c.variations.forEach((v,i)=>line('V:'+(v.variation_id||('x'+i)), '', v.description, null, '', null, Number(v.value||0), finPct(v.pct), v.gross));
  section('DAYWORKS'); c.dayworks.forEach((d,i)=>line('D:'+i, '', d.description, null, '', null, Number(d.value||0), null, d.gross));
  const lastData = ws.lastRow.number;
  ws.addRow([]);
  const sum = (label, formula, result, bold)=>{ const r = ws.addRow(['', '', label, null, null, null, null, null, {formula, result}]); r.getCell(3).font = {bold:!!bold}; r.getCell(3).alignment = {horizontal:'right'}; r.getCell(9).numFmt = money; r.getCell(9).font = {bold:!!bold}; return r.number; };
  // Value-to-date (I) only has figures on item rows, so a plain SUM adds up items, variations and dayworks.
  const g = sum('Gross valuation to date', `SUM(I${firstData}:I${lastData})`, c.gross, true);
  const rr = ws.addRow(['', '', 'Retention %', null, null, null, null, finPct(a.retention_pct), null]); rr.getCell(3).alignment = {horizontal:'right'}; rr.getCell(8).fill = {type:'pattern', pattern:'solid', fgColor:{argb:'FFFFF6DB'}};
  const ret = sum('Less retention', jf.retention_limit_pct && jf.contract_value ? `-MIN(ROUND(I${g}*H${rr.number}/100,2),${finRound(jf.contract_value*jf.retention_limit_pct/100)})` : `-ROUND(I${g}*H${rr.number}/100,2)`, -c.retention);
  const prev = sum('Less previously certified', `-${finRound(a.previous||0)}`, -finRound(a.previous||0));
  sum('Amount due this application (excl. VAT)', `I${g}+I${ret}+I${prev}`, c.net_due, true);
  ws.addRow([]);
  const note = ws.addRow(['', '', 'This application is not a VAT invoice. Edit the yellow % cells and upload this file back to OpHUB to update it.']); note.getCell(3).font = {italic:true, color:{argb:'FF5B6472'}};
  ws.views = [{state:'frozen', ySplit:head.number}];
  return await wb.xlsx.writeBuffer();
}
function finAppFilename(a){ const site = SITES.find(s=>s.id===a.site_id) || {}; return 'Application '+a.number+' - '+String(site.name||'').replace(/[\\/:*?"<>|]+/g,'')+(site.job_number?' ('+site.job_number+')':'')+'.xlsx'; }
window.downloadFinAppExcel = async function(id){
  if(finApp && finApp.id===id && document.getElementById('finAppSave')) await saveFinApplication(false);
  const a = (await dbSelect('fin_applications', 'id=eq.'+id))[0]; if(!a) return;
  const buf = await finAppExcelBytes(a); if(!buf) return;
  return deliverExcelBuffer(buf, finAppFilename(a));
};

/* ---- Excel back in (finds the columns by their headings, so older files still read) ---- */
window.uploadFinAppExcel = async function(file){
  if(!file || !finApp) return;
  if(!(await loadLib('XLSX'))){ toast('Could not load the Excel reader — check your connection.'); return; }
  let rows;
  try{ const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), {type:'array'}); rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header:1, raw:true, defval:''}); }
  catch(e){ toast('Could not read that file.'); return; }
  const num = v=>{ if(typeof v==='number') return v; const n = Number(String(v||'').replace(/[£,%\s]/g,'')); return (String(v||'').trim()==='' || isNaN(n)) ? null : n; };
  const hi = rows.findIndex(r=>r.some(c=>/^description$/i.test(String(c).trim())));
  const H = (hi>=0 ? rows[hi] : []).map(c=>String(c).trim().toLowerCase());
  const col = (re, dflt)=>{ const i = H.findIndex(h=>re.test(h)); return i>=0 ? i : dflt; };
  const cDesc = col(/^description$/, 2), cPct = col(/^% ?complete/, 4), cValue = col(/^contract value$/, 3), cGross = col(/^value to date$/, 5);
  let changed = 0, added = 0, inDay = false;
  const newDay = [];
  rows.forEach((r, ri)=>{
    if(ri<=hi) return;
    const id = String(r[0]||'').trim(), desc = String(r[cDesc]||'').trim();
    if(/^DAYWORKS$/i.test(desc)){ inDay = true; return; }
    if(/^(CONTRACT WORKS|VARIATIONS)$/i.test(desc) || /^Gross valuation/i.test(desc)){ inDay = false; return; }
    if(/^Retention %$/i.test(desc)){ const p = num(r[cPct]); if(p!==null && finPct(p)!==finPct(finApp.retention_pct)){ finApp.retention_pct = finPct(p); changed++; } return; }
    let m;
    if((m = /^L:(.+)$/.exec(id))){ const l = finApp.lines.find(x=>finIsItem(x) && x.item_id===m[1]); const p = num(r[cPct]); if(l && p!==null && finPct(p)!==finPct(l.pct)){ l.pct = finPct(p); changed++; } return; }
    if((m = /^V:(.+)$/.exec(id))){
      const v = finApp.variations.find((x,i)=>(x.variation_id||('x'+i))===m[1]); if(!v) return;
      const p = num(r[cPct]), val = num(r[cValue]);
      if(p!==null && finPct(p)!==finPct(v.pct)){ v.pct = finPct(p); changed++; }
      if(val!==null && val!==Number(v.value)){ v.value = val; changed++; }
      if(desc && desc!==v.description){ v.description = desc; changed++; }
      return;
    }
    if((m = /^D:(\d+)$/.exec(id))){ const val = num(r[cValue]); const d = finApp.dayworks[+m[1]]; if(d){ newDay.push({description:desc||d.description, value:val!==null?val:d.value}); if(val!==Number(d.value) || desc!==d.description) changed++; } return; }
    if(inDay && !id && desc){ const val = num(r[cValue]) ?? num(r[cGross]); if(val!==null){ newDay.push({description:desc, value:val}); added++; } }
  });
  if(rows.some(r=>/^D:\d+$/.test(String(r[0]||'').trim())) || added) finApp.dayworks = newDay;
  const r = await dbUpdate('fin_applications', finApp.id, finAppRowForSave());
  if(!r) return;
  finApp = null;
  toast(changed||added ? `Updated from Excel: ${changed} change${changed===1?'':'s'}${added?', '+added+' new daywork'+(added===1?'':'s'):''}` : 'No changes found in that file');
  render();
};

/* ---- email ---- */
window.openFinAppEmail = async function(siteId, appId){
  await saveFinApplication(false);
  const a = (await dbSelect('fin_applications', 'id=eq.'+appId))[0]; if(!a) return;
  const jf = (await dbSelect('job_finance', 'site_id=eq.'+siteId))[0] || {};
  const site = SITES.find(s=>s.id===siteId) || {};
  let ov = document.getElementById('finMailOverlay');
  if(!ov){ ov = document.createElement('div'); ov.id = 'finMailOverlay'; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
  ov.onclick = e=>{ if(e.target===ov) ov.style.display='none'; };
  ov.innerHTML = `<div class="geo-modal-card">
    <h3>Email application ${a.number}</h3>
    <p class="stub" style="margin:0 0 10px;font-style:normal;">Sent as an Excel file. Amount due: <b>${finMoney(a.net_due)}</b></p>
    <div class="formfield"><label class="field-label">To</label><input type="text" id="finMailTo" value="${escapeHtml(jf.billing_email||site.client_email||'')}" placeholder="qs@client.co.uk (use commas for more than one)"></div>
    <label class="finswitch"><input type="checkbox" id="finMailMe" checked> Send me a copy (${escapeHtml(ME.email||'')})</label>
    <div class="formfield"><label class="field-label">Message (optional)</label><textarea id="finMailMsg" rows="3"></textarea></div>
    <button class="darkbtn" style="width:100%;" id="finMailSend" onclick="sendFinAppEmail('${siteId}','${appId}')">Send</button>
    <button class="geo-modal-cancel" onclick="document.getElementById('finMailOverlay').style.display='none'">Cancel</button>
  </div>`;
  ov.style.display = 'flex';
};
window.sendFinAppEmail = async function(siteId, appId){
  const to = finVal('finMailTo').split(/[,;\s]+/).map(s=>s.trim()).filter(Boolean);
  if(!to.length || to.some(e=>!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))){ toast('Check the email address.'); return; }
  const btn = document.getElementById('finMailSend'); const reset = ()=>{ if(btn){ btn.disabled=false; btn.textContent='Send'; } };
  if(btn){ btn.disabled = true; btn.textContent = 'Sending…'; }
  const a = (await dbSelect('fin_applications', 'id=eq.'+appId))[0]; if(!a){ reset(); return; }
  const buf = await finAppExcelBytes(a); if(!buf){ reset(); return; }
  const path = ME.org_id+'/'+siteId+'/applications/Application-'+a.number+'-'+Date.now()+'.xlsx';
  const stored = await uploadToStorage('finance-docs', path, new Blob([buf], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  if(!stored){ reset(); return; }
  let res;
  try{
    res = await sbFetch('/functions/v1/send-finance-email', {method:'POST', timeoutMs:60000, body:JSON.stringify({
      kind:'application', site_id:siteId, storage_path:stored, filename:finAppFilename(a), recipients:to,
      cc: document.getElementById('finMailMe').checked && ME.email ? [ME.email] : [],
      reference:'No. '+a.number, client_po:a.client_po||'', amount:finMoney(a.net_due)+' excl. VAT', due:a.due_date?finDate(a.due_date):'', message:finVal('finMailMsg'),
    })});
  }catch(e){ toast('Could not reach the server — check your connection.'); reset(); return; }
  const d = await res.json().catch(()=>({}));
  if(!res.ok || d.error){ toast('Email failed — '+String(d.error||res.status).slice(0,140)); reset(); return; }
  await dbUpdate('fin_applications', appId, {excel_path:stored, submitted_at:new Date().toISOString(), sent_to:to.join(', '), status: a.status==='draft' ? 'submitted' : a.status});
  document.getElementById('finMailOverlay').style.display = 'none';
  finApp = null; toast('Application emailed'); render();
};

/* ---------- cost price per line: % margin / mark-up, manual, bulk (Andy, 20 Oct) ---------- */
// margin m% of the sale price: cost = sale × (1 − m/100). mark-up k% on cost: cost = sale ÷ (1 + k/100).
function finCostFromPct(sale, basis, pct){
  const s = Number(sale), p = Number(pct); if(isNaN(s) || isNaN(p)) return null;
  return finRound(basis==='markup' ? s/(1+p/100) : s*(1-p/100));
}
function finContractMgTxt(r){
  const v = Number(finItemValue(r)), c = r.cost;
  if(c==null || isNaN(c) || !v) return '';
  const m = (v-c)/v*100, k = c ? (v-c)/c*100 : null;
  return `<span class="${m<0?'neg':''}">Margin ${finPctTxt(finRound(m))}${k!=null?' · mark-up '+finPctTxt(finRound(k)):''}</span>${r.cost_basis && r.cost_pct!=null ? ` <em>(set at ${finRound(r.cost_pct)}% ${r.cost_basis==='markup'?'mark-up':'margin'})</em>` : ''}`;
}
window.finContractSetCost = function(i, v){
  const r = finContractRows[i]; const n = finNum(v);
  r.cost = (n===null || isNaN(n)) ? null : n; r.cost_basis = ''; r.cost_pct = null; // typed by hand
  const mg = document.getElementById('finCMg-'+i); if(mg) mg.innerHTML = finContractMgTxt(r);
  finContractPaintTotal();
};
function finContractGroupRange(i){
  const rows = finContractRows, level = rows[i].kind, out = [];
  for(let j=i+1;j<rows.length;j++){ const k = rows[j].kind; if(k==='section' || (level==='subsection' && k==='subsection')) break; if(finIsItem(rows[j])) out.push(j); }
  return out;
}
function finContractGroupTicked(i){ const r = finContractGroupRange(i); return r.length>0 && r.every(j=>finContractRows[j]._sel); }
window.finContractTick = function(i, on){ finContractRows[i]._sel = !!on; finContractPaint(); };
window.finContractTickGroup = function(i, on){ finContractGroupRange(i).forEach(j=>finContractRows[j]._sel = !!on); finContractPaint(); };
window.finContractTickAll = function(on){ finContractRows.forEach(r=>{ if(finIsItem(r)) r._sel = !!on; }); finContractPaint(); };
function finContractSelIdx(){ return finContractRows.map((r,i)=>r._sel && finIsItem(r) ? i : -1).filter(i=>i>-1); }
window.finContractApplyPct = function(onlyTicked){
  const pct = finNum(finVal('finCtPct')), basis = finVal('finCtBasis') || 'margin';
  if(pct===null || isNaN(pct) || pct<0 || (basis==='margin' && pct>=100)){ toast(basis==='margin' ? 'Enter a margin between 0 and 99%.' : 'Enter a mark-up %.'); return; }
  const idx = onlyTicked ? finContractSelIdx() : finContractRows.map((r,i)=>finIsItem(r)?i:-1).filter(i=>i>-1);
  if(!idx.length){ toast(onlyTicked ? 'Tick some lines first.' : 'No lines yet.'); return; }
  let n = 0;
  idx.forEach(i=>{ const r = finContractRows[i]; const v = finItemValue(r); if(v==null) return; r.cost_basis = basis; r.cost_pct = pct; r.cost = finCostFromPct(v, basis, pct); n++; });
  finContractPaint();
  toast(n+' line'+(n===1?'':'s')+' costed at '+pct+'% '+(basis==='markup'?'mark-up':'margin')+' — save to keep it');
};
window.finContractBulk = async function(action){
  const idx = finContractSelIdx(); if(!idx.length) return;
  if(action==='clear'){ idx.forEach(i=>{ const r = finContractRows[i]; r.cost = null; r.cost_basis = ''; r.cost_pct = null; }); }
  else if(action==='plot'){ const v = finVal('finCtBulkPlot'); idx.forEach(i=>finContractRows[i].sub = v); }
  else if(action==='unit'){ const u = await customPrompt('Unit for the ticked lines (e.g. m², nr, item)'); if(u===null) return; idx.forEach(i=>finContractRows[i].unit = String(u).trim()); }
  else if(action==='remove'){ if(!(await customConfirm('Remove '+idx.length+' ticked line'+(idx.length===1?'':'s')+'?'))) return; idx.slice().reverse().forEach(i=>finContractRows.splice(i,1)); }
  finContractPaint();
};
function finContractBulkPaint(){
  const el = document.getElementById('finCtBulk'); const btn = document.getElementById('finCtSelBtn');
  const idx = finContractSelIdx(); const items = finContractRows.filter(finIsItem).length;
  if(btn){ btn.disabled = !idx.length; btn.textContent = idx.length ? 'Apply to '+idx.length+' ticked' : 'Apply to ticked'; }
  if(!el) return;
  const subs = FIN_SUBJOBS[finContractSite] || [];
  el.style.display = 'flex';
  el.innerHTML = idx.length ? `<b>${idx.length} ticked</b>
    <button class="linkbtn" onclick="document.getElementById('finCtPct').focus()">Margin / mark-up ↑</button>
    ${subs.length ? `<span class="finbulk-plot"><select id="finCtBulkPlot"><option value="">No plot</option>${subs.map(a=>`<option value="${a.id}">${escapeHtml(a.short)}</option>`).join('')}</select><button class="linkbtn" onclick="finContractBulk('plot')">Set plot</button></span>` : ''}
    <button class="linkbtn" onclick="finContractBulk('unit')">Set unit</button>
    <button class="linkbtn" onclick="finContractBulk('clear')">Clear costs</button>
    <button class="linkbtn" style="color:var(--red);" onclick="finContractBulk('remove')">Remove</button>
    <button class="linkbtn" onclick="finContractTickAll(false)">Untick all</button>`
    : (items ? `<button class="linkbtn" onclick="finContractTickAll(true)">Tick all ${items} lines</button><span class="stub" style="margin:0;font-style:normal;">Tick lines (or a header) to change them together.</span>` : '');
}
