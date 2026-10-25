/* ============================================================
   OpHUB Finance — Bill of Quantities tab with sub-tabs (23 Oct 2026, Andy):
   "when I open it and there is already a BOQ I get lost, I can't add anything …
   make it two sub tabs for BOQ and Variations and Day Works. These need to feed into
   the applications. Variations: Issued, Approved, Rejected — only when approved do they
   push through to the AFP." Also: Finance pages use the full width on a laptop.
   Variation statuses are stored as before (instructed/priced/submitted = Issued,
   agreed = Approved, rejected = Rejected). Day works have their own register
   (fin_dayworks): Issued / Approved / Rejected; approved ones go on applications.
   ============================================================ */
let finBoqSub = {}; // siteId -> 'boq' | 'var' | 'dw'
Object.assign(FIN_VAR_STATUS, {instructed:'Issued', priced:'Issued', submitted:'Issued', agreed:'Approved', rejected:'Rejected'});
function finVarGroup(v){ return v.status==='agreed' ? 'approved' : v.status==='rejected' ? 'rejected' : 'issued'; }
const FIN_GRP = {issued:{l:'Issued', c:'blue'}, approved:{l:'Approved', c:'ok'}, rejected:{l:'Rejected', c:'bad'}};

/* ---------- the project's tabs: Bill of Quantities opens its own page ---------- */
(function(){
  const go0 = window.finProjTabGo;
  window.finProjTabGo = function(siteId, k){
    const onProj = !!document.querySelector('.finptab');
    if(k==='boq'){ finProjTab[siteId] = 'overview'; go('#/site/'+siteId+'/finance/contract'); return; }
    if(!onProj){ finProjTab[siteId] = k; go('#/site/'+siteId+'/finance'); return; }
    return go0.apply(this, arguments);
  };
  const up = finUpTarget;
  finUpTarget = function(){ const t = up.apply(this, arguments); if(t && (t.tab==='boq' || parseRoute()[3]==='variations')) t.tab = 'overview'; return t; };
  const rsf = renderSiteFinance;
  renderSiteFinance = function(siteId){ if(finProjTab[siteId]==='boq') finProjTab[siteId] = 'overview'; return rsf.apply(this, arguments); };
  // The old Variations page is now the Variations sub-tab.
  renderFinVariations = function(siteId){ finBoqSub[siteId] = 'var'; return renderFinContract(siteId); };
})();

window.finBoqSubGo = function(siteId, k){
  finBoqSub[siteId] = k;
  document.querySelectorAll('.finboqpane').forEach(p=>p.style.display = p.dataset.k===k ? '' : 'none');
  document.querySelectorAll('.finboqsub button').forEach(b=>b.classList.toggle('on', b.dataset.k===k));
  if(k==='var') finCtVariationsFill(siteId);
  if(k==='dw') finDwFill(siteId);
};
(function(){
  const base = renderFinContract;
  renderFinContract = async function(siteId){
    const r = await base.apply(this, arguments);
    const sa = document.querySelector('.scrollarea'); if(!sa || sa.querySelector('.finboqsub')) return r;
    const bar = sa.querySelector('.finprojbar');
    const keep = finProjTab[siteId]; finProjTab[siteId] = 'boq';
    const tabs = typeof finProjTabsHtml==='function' ? finProjTabsHtml(siteId, 'application') : '';
    finProjTab[siteId] = keep==='boq' ? 'overview' : keep;
    const sub = finBoqSub[siteId] || 'boq';
    const nav = `<nav class="finboqsub" role="tablist">
      <button type="button" data-k="boq" onclick="finBoqSubGo('${siteId}','boq')">Bill of Quantities</button>
      <button type="button" data-k="var" onclick="finBoqSubGo('${siteId}','var')">Variations</button>
      <button type="button" data-k="dw" onclick="finBoqSubGo('${siteId}','dw')">Day Works</button></nav>`;
    // everything the page drew (after the project bar) is the BoQ pane
    const boq = document.createElement('div'); boq.className = 'finboqpane'; boq.dataset.k = 'boq';
    Array.from(sa.children).filter(c=>c!==bar).forEach(c=>boq.appendChild(c));
    const vCard = boq.querySelector('#finCtVars');
    const vp = document.createElement('div'); vp.className = 'finboqpane'; vp.dataset.k = 'var';
    if(vCard){ vCard.style.marginTop = ''; vp.appendChild(vCard); } else vp.innerHTML = '<div class="card" id="finCtVars"></div>';
    const dp = document.createElement('div'); dp.className = 'finboqpane'; dp.dataset.k = 'dw'; dp.innerHTML = '<div class="card" id="finDwCard"><p class="stub">Loading day works…</p></div>';
    const head = document.createElement('div'); head.innerHTML = tabs + nav;
    const nodes = [...head.childNodes, boq, vp, dp];
    if(bar) bar.after(...nodes); else sa.prepend(...nodes);
    // BoQ pane: the lines first, add buttons at the top, the upload folded away once there are lines
    const lines = Array.from(boq.querySelectorAll('.card')).find(c=>{ const t = c.querySelector('.sectiontitle'); return t && t.textContent.trim().startsWith('Lines'); });
    const upl = boq.querySelector('#finContractUpload'); const uplCard = upl && upl.closest('.card');
    if(lines){
      const hasLines = (finContractRows||[]).length > 0;
      const intro = boq.querySelector(':scope > p.stub'); if(intro) intro.remove();
      if(uplCard && hasLines){
        const d = document.createElement('details'); d.className = 'card finfold finboqup';
        const t = uplCard.querySelector('.sectiontitle'); if(t) t.remove();
        d.innerHTML = '<summary><span class="finfold-t">Upload a Bill of Quantities</span><b>Excel or PDF</b><span class="finfold-a">▾</span></summary><div class="finfold-b"></div>';
        while(uplCard.firstChild) d.querySelector('.finfold-b').appendChild(uplCard.firstChild);
        uplCard.replaceWith(d); lines.after(d);
      }
      const t = lines.querySelector('.sectiontitle'); const hdr = t && t.parentNode;
      if(hdr && !hdr.querySelector('.finboqadd')){
        const add = document.createElement('span'); add.className = 'finboqadd';
        add.innerHTML = `<button class="ghostbtn" onclick="finContractAdd('section')">+ Section</button><button class="ghostbtn" onclick="finContractAdd('subsection')">+ Sub-section</button><button class="ghostbtn" onclick="finContractAdd('item')">+ Item</button>`;
        hdr.appendChild(add);
      }
      if(hasLines) boq.prepend(lines);
    }
    finBoqSubGo(siteId, sub);
    return r;
  };
})();

/* ---------- Variations sub-tab ---------- */
let finVarF = {}; // siteId -> group filter
finCtVariationsFill = async function(siteId){
  const box = document.getElementById('finCtVars'); if(!box) return;
  const fo = typeof isFinanceOnly==='function' && isFinanceOnly();
  let [vs, siteVars] = await Promise.all([
    dbSelect('fin_variations', 'site_id=eq.'+siteId+'&order=seq.asc').catch(()=>[]),
    fo ? Promise.resolve([]) : dbSelect('variations', 'site_id=eq.'+siteId+'&order=created_at.asc').catch(()=>[]),
  ]);
  const linked = new Set(vs.map(v=>v.variation_id).filter(Boolean));
  const fresh = siteVars.filter(v=>!linked.has(v.id) && v.approval_status!=='declined');
  if(fresh.length && !finCtVarBusy){
    finCtVarBusy = true;
    try{ for(const v of fresh){ const amt = finNum(v.cost_impact), ok = amt!==null && !isNaN(amt);
      await finVarInsert(siteId, {title:String(v.description||'Variation').slice(0,200), description:v.description||null, variation_id:v.id, instructed_on:String(v.created_at||'').slice(0,10)||null,
        status: v.approval_status==='approved' ? 'agreed' : 'submitted', quoted: ok ? amt : null, agreed_value: v.approval_status==='approved' && ok ? amt : null, notes:'Raised on site'}); } }
    finally { finCtVarBusy = false; }
    vs = await dbSelect('fin_variations', 'site_id=eq.'+siteId+'&order=seq.asc').catch(()=>vs);
  }
  if(!document.getElementById('finCtVars')) return;
  const siteBy = {}; siteVars.forEach(v=>siteBy[v.id] = v);
  const inSow = v=>v.schedule_section_id || (v.variation_id && siteBy[v.variation_id] && siteBy[v.variation_id].schedule_section_id);
  const amt = v=>v.status==='agreed' ? Number(v.agreed_value!=null ? v.agreed_value : v.quoted||0) : Number(v.quoted!=null ? v.quoted : v.cost_estimate||0);
  const tot = g=>finRound(vs.filter(v=>finVarGroup(v)===g).reduce((t,v)=>t+amt(v),0));
  const f = finVarF[siteId] || 'all';
  const shown = vs.filter(v=>f==='all' || finVarGroup(v)===f);
  const chip = (k,l,n)=>`<button type="button" class="pmchip ${f===k?'on':''}" onclick="finVarF['${siteId}']='${k}';finCtVariationsFill('${siteId}')">${l} (${n})</button>`;
  const sowCell = v=>fo ? '' : `<td data-l="Schedule of Works" onclick="event.stopPropagation()">${inSow(v) ? '<span class="finpill ok">✓ On the schedule</span>' : v.status==='rejected' ? '<span class="stub" style="margin:0;">—</span>' : `<button type="button" class="ghostbtn finsmall" onclick="finVarToSow('${siteId}','${v.id}')">+ Schedule of Works</button>`}</td>`;
  const quick = v=>finVarGroup(v)==='issued' ? `<button type="button" class="ghostbtn finsmall" onclick="event.stopPropagation();finVarSetGroup('${siteId}','${v.id}','approved')">Approve</button> <button type="button" class="ghostbtn finsmall" style="color:var(--red);" onclick="event.stopPropagation();finVarSetGroup('${siteId}','${v.id}','rejected')">Reject</button>` : '';
  box.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
      <p class="sectiontitle" style="margin:0;">Variations</p>
      <span style="display:flex;gap:6px;flex-wrap:wrap;"><button type="button" class="ghostbtn" style="width:auto;margin:0;" onclick="finVarExport('${siteId}','xlsx')">Excel</button><button type="button" class="ghostbtn" style="width:auto;margin:0;" onclick="finVarExport('${siteId}','pdf')">PDF</button><button type="button" class="darkbtn" style="width:auto;margin:0;" onclick="openFinVariation('${siteId}')">+ Add Variation</button></span>
    </div>
    <div class="finboqtot"><span><em>Issued</em><b>${finMoney(tot('issued'))}</b></span><span class="ok"><em>Approved</em><b>${finMoney(tot('approved'))}</b></span><span class="bad"><em>Rejected</em><b>${finMoney(tot('rejected'))}</b></span></div>
    <p class="stub" style="margin:0 0 10px;font-style:normal;">Only <b>approved</b> variations go onto applications, at their approved value.${fo ? '' : ' Variations raised on site (Projects › Variations) come in here on their own.'}</p>
    <div class="pmchips">${chip('all','All',vs.length)}${['issued','approved','rejected'].map(g=>chip(g, FIN_GRP[g].l, vs.filter(v=>finVarGroup(v)===g).length)).join('')}</div>
    ${shown.length ? `<div class="finreptbl-wrap"><table class="fincosttbl fininvtbl"><thead><tr><th>No.</th><th>Title</th><th>Status</th><th class="num">Value</th><th class="num">Budget Cost</th><th></th>${fo?'':'<th>Schedule of Works</th>'}</tr></thead><tbody>
      ${shown.map(v=>{ const g = finVarGroup(v); return `<tr class="click" onclick="openFinVariation('${siteId}','${v.id}')"><td data-l="No."><b>${escapeHtml(v.number||'')}</b></td><td data-l="Title">${escapeHtml(v.title||'')}${v.variation_id?' <span class="finpill grey" title="Raised on the Projects side">Site</span>':''}</td><td data-l="Status"><span class="finpill ${FIN_GRP[g].c}">${FIN_GRP[g].l}</span></td><td data-l="Value" class="num">${finMoney(amt(v))}</td><td data-l="Budget cost" class="num">${v.cost_estimate!=null?finMoney(v.cost_estimate):'—'}</td><td data-l="" onclick="event.stopPropagation()">${quick(v)}</td>${sowCell(v)}</tr>`; }).join('')}
    </tbody></table></div>` : `<div class="empty" style="margin:0;">No variations${f==='all'?' yet':' here'}.</div>`}`;
};
window.finVarSetGroup = async function(siteId, id, g){
  const v = (await dbSelect('fin_variations', 'id=eq.'+id))[0]; if(!v) return;
  const row = {status: g==='approved' ? 'agreed' : g==='rejected' ? 'rejected' : 'submitted', updated_at:new Date().toISOString()};
  if(g==='approved'){
    const def = v.agreed_value!=null ? v.agreed_value : v.quoted;
    const s = await customPrompt(`Approve ${v.number} — approved value (£)`, def!=null ? String(def) : ''); if(s==null) return;
    const n = finNum(s); if(n===null || isNaN(n)){ toast('Enter the approved value.'); return; }
    row.agreed_value = finRound(n); row.agreed_on = finToday();
  }
  if(await dbUpdate('fin_variations', id, row)){ toast(g==='approved' ? 'Approved — it goes onto the next application' : 'Variation '+FIN_GRP[g].l.toLowerCase()); finCtVariationsFill(siteId); }
};
// The variation form: three statuses and the matching words.
(function(){
  const base = window.openFinVariation;
  window.openFinVariation = async function(siteId, id){
    await base.apply(this, arguments);
    const sel = document.getElementById('finVaStatus'); if(!sel) return;
    const cur = sel.value, g = cur==='agreed' ? 'agreed' : cur==='rejected' ? 'rejected' : 'submitted';
    sel.innerHTML = [['submitted','Issued'],['agreed','Approved'],['rejected','Rejected']].map(([k,l])=>`<option value="${k}" ${k===g?'selected':''}>${l}</option>`).join('');
    const lab = (inputId, txt)=>{ const el = document.getElementById(inputId); const f = el && el.closest('.formfield'); const l = f && f.querySelector('.field-label'); if(l) l.textContent = txt; };
    lab('finVaQuote', 'Value issued to client £'); lab('finVaSub', 'Issued on'); lab('finVaAgreed', 'Approved value £'); lab('finVaAgOn', 'Approved on');
  };
  window.saveFinVariation = async function(siteId, id){
    const title = finVal('finVaTitle'); if(!title){ toast('Give it a title.'); return; }
    const num = k=>{ const n = finNum(finVal(k)); return (n===null || isNaN(n)) ? null : finRound(n); };
    const status = finVal('finVaStatus') || 'submitted';
    let agreed = num('finVaAgreed');
    if(status==='agreed' && agreed==null) agreed = num('finVaQuote');
    if(status==='agreed' && agreed==null){ toast('Add the approved value.'); return; }
    const row = {title, description:finVal('finVaDesc')||null, instructed_by:finVal('finVaBy')||null, instruction_ref:finVal('finVaRef')||null, instructed_on:finVal('finVaOn')||null, status,
      cost_estimate:num('finVaCost'), quoted:num('finVaQuote'), submitted_on:finVal('finVaSub')||null, agreed_value:agreed, agreed_on:finVal('finVaAgOn')||(status==='agreed'?finToday():null), notes:finVal('finVaNotes')||null, updated_at:new Date().toISOString()};
    const btn = document.getElementById('finVaSave'); if(btn){ btn.disabled = true; btn.textContent = 'Saving…'; }
    const fileEl = document.getElementById('finVaFile'); const file = fileEl && fileEl.files && fileEl.files[0];
    if(file){ const stored = await uploadToStorage('finance-docs', ME.org_id+'/'+siteId+'/variations/'+uid()+'-'+file.name.replace(/[^a-z0-9.\-]+/gi,'_').slice(-80), file, file.type||'application/octet-stream'); if(stored){ row.file_path = stored; row.file_name = file.name; } }
    const r = id ? await dbUpdate('fin_variations', id, row) : await finVarInsert(siteId, row);
    if(btn){ btn.disabled = false; btn.textContent = 'Save'; }
    if(!r) return;
    document.getElementById('finVarOverlay').style.display = 'none'; toast('Variation saved');
    if(document.getElementById('finCtVars')) finCtVariationsFill(siteId); else render();
  };
})();

/* ---------- Day Works sub-tab ---------- */
let finDwF = {};
async function finDwFill(siteId){
  const box = document.getElementById('finDwCard'); if(!box) return;
  const ds = await dbSelect('fin_dayworks', 'site_id=eq.'+siteId+'&order=seq.asc').catch(()=>[]);
  if(!document.getElementById('finDwCard')) return;
  const tot = g=>finRound(ds.filter(d=>d.status===g).reduce((t,d)=>t+Number(d.value||0),0));
  const f = finDwF[siteId] || 'all';
  const shown = ds.filter(d=>f==='all' || d.status===f);
  const chip = (k,l,n)=>`<button type="button" class="pmchip ${f===k?'on':''}" onclick="finDwF['${siteId}']='${k}';finDwFill('${siteId}')">${l} (${n})</button>`;
  const quick = d=>d.status==='issued' ? `<button type="button" class="ghostbtn finsmall" onclick="event.stopPropagation();finDwSet('${siteId}','${d.id}','approved')">Approve</button> <button type="button" class="ghostbtn finsmall" style="color:var(--red);" onclick="event.stopPropagation();finDwSet('${siteId}','${d.id}','rejected')">Reject</button>` : '';
  box.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
      <p class="sectiontitle" style="margin:0;">Day Works</p>
      <button type="button" class="darkbtn" style="width:auto;margin:0;" onclick="openFinDaywork('${siteId}')">+ Add Day Work</button>
    </div>
    <div class="finboqtot"><span><em>Issued</em><b>${finMoney(tot('issued'))}</b></span><span class="ok"><em>Approved</em><b>${finMoney(tot('approved'))}</b></span><span class="bad"><em>Rejected</em><b>${finMoney(tot('rejected'))}</b></span></div>
    <p class="stub" style="margin:0 0 10px;font-style:normal;">Only <b>approved</b> day works go onto applications, at their approved value.</p>
    <div class="pmchips">${chip('all','All',ds.length)}${['issued','approved','rejected'].map(g=>chip(g, FIN_GRP[g].l, ds.filter(d=>d.status===g).length)).join('')}</div>
    ${shown.length ? `<div class="finreptbl-wrap"><table class="fincosttbl fininvtbl"><thead><tr><th>No.</th><th>Day Work</th><th>Date</th><th>Ref</th><th>Status</th><th class="num">Value</th><th></th></tr></thead><tbody>
      ${shown.map(d=>`<tr class="click" onclick="openFinDaywork('${siteId}','${d.id}')"><td data-l="No."><b>${escapeHtml(d.number||'')}</b></td><td data-l="Day work">${escapeHtml(d.title||'')}</td><td data-l="Date">${d.work_date?finDate(d.work_date):'—'}</td><td data-l="Ref">${escapeHtml(d.ref||'—')}</td><td data-l="Status"><span class="finpill ${FIN_GRP[d.status].c}">${FIN_GRP[d.status].l}</span></td><td data-l="Value" class="num">${d.value!=null?finMoney(d.value):'—'}</td><td data-l="" onclick="event.stopPropagation()">${quick(d)}</td></tr>`).join('')}
    </tbody></table></div>` : `<div class="empty" style="margin:0;">No day works${f==='all'?' yet':' here'}.</div>`}`;
}
window.finDwFill = finDwFill;
window.finDwSet = async function(siteId, id, g){
  const row = {status:g, updated_at:new Date().toISOString()};
  if(g==='approved'){
    const d = (await dbSelect('fin_dayworks', 'id=eq.'+id))[0]; if(!d) return;
    const s = await customPrompt(`Approve ${d.number} — approved value (£)`, d.value!=null ? String(d.value) : ''); if(s==null) return;
    const n = finNum(s); if(n===null || isNaN(n)){ toast('Enter the approved value.'); return; }
    row.value = finRound(n); row.approved_on = finToday();
  }
  if(await dbUpdate('fin_dayworks', id, row)){ toast(g==='approved' ? 'Approved — it goes onto the next application' : 'Day work '+FIN_GRP[g].l.toLowerCase()); finDwFill(siteId); }
};
window.openFinDaywork = async function(siteId, id){
  const d = id ? (await dbSelect('fin_dayworks', 'id=eq.'+id))[0] : null;
  let ov = document.getElementById('finDwOverlay');
  if(!ov){ ov = document.createElement('div'); ov.id = 'finDwOverlay'; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
  ov.onclick = e=>{ if(e.target===ov) ov.style.display='none'; };
  const val = k=>d && d[k]!=null ? escapeHtml(String(d[k])) : '';
  ov.innerHTML = `<div class="geo-modal-card" style="max-width:560px;">
    <h3>${d ? escapeHtml(d.number||'')+' · day work' : 'New day work'}</h3>
    <div class="formfield"><label class="field-label">Title</label><input type="text" id="finDwTitle" value="${val('title')}" placeholder="e.g. Clear debris from gutters (2 men, 1 day)"></div>
    <div class="formfield"><label class="field-label">Description</label><textarea id="finDwDesc" rows="3">${val('description')}</textarea></div>
    <div class="fingrid2">
      <div class="formfield"><label class="field-label">Date of the work</label><input type="date" id="finDwDate" value="${d&&d.work_date||finToday()}"></div>
      <div class="formfield"><label class="field-label">Day work sheet ref</label><input type="text" id="finDwRef" value="${val('ref')}"></div>
      <div class="formfield"><label class="field-label">Value £</label><input type="text" inputmode="decimal" data-money id="finDwVal" value="${val('value')}"></div>
      <div class="formfield"><label class="field-label">Our cost £</label><input type="text" inputmode="decimal" data-money id="finDwCost" value="${val('cost_estimate')}"></div>
      <div class="formfield"><label class="field-label">Status</label><select id="finDwStatus">${['issued','approved','rejected'].map(k=>`<option value="${k}" ${(d?d.status:'issued')===k?'selected':''}>${FIN_GRP[k].l}</option>`).join('')}</select></div>
    </div>
    <div class="formfield"><label class="field-label">Notes</label><textarea id="finDwNotes" rows="2">${val('notes')}</textarea></div>
    <div class="formfield"><label class="field-label">Signed day work sheet</label>${d&&d.file_path?`<button class="ghostbtn" style="width:auto;margin-bottom:6px;" onclick="openFinDoc('${jsAttr(d.file_path)}','${jsAttr(d.file_name||'')}')">View ${escapeHtml(d.file_name||'file')}</button>`:''}<input type="file" id="finDwFile" accept=".pdf,image/*,.doc,.docx,.xlsx,.xls"></div>
    <button class="darkbtn" style="width:100%;" id="finDwSave" onclick="saveFinDaywork('${siteId}','${d?d.id:''}')">Save</button>
    ${d ? `<button class="linkbtn" style="margin-top:10px;color:var(--red);" onclick="deleteFinDaywork('${siteId}','${d.id}')">Delete this day work</button>` : ''}
    <button class="geo-modal-cancel" onclick="document.getElementById('finDwOverlay').style.display='none'">Cancel</button>
  </div>`;
  ov.style.display = 'flex';
};
window.saveFinDaywork = async function(siteId, id){
  const title = finVal('finDwTitle'); if(!title){ toast('Give it a title.'); return; }
  const num = k=>{ const n = finNum(finVal(k)); return (n===null || isNaN(n)) ? null : finRound(n); };
  const status = finVal('finDwStatus') || 'issued';
  if(status==='approved' && num('finDwVal')==null){ toast('Add the approved value.'); return; }
  const row = {title, description:finVal('finDwDesc')||null, work_date:finVal('finDwDate')||null, ref:finVal('finDwRef')||null, value:num('finDwVal'), cost_estimate:num('finDwCost'), status, notes:finVal('finDwNotes')||null, updated_at:new Date().toISOString()};
  if(status==='approved') row.approved_on = finToday();
  const btn = document.getElementById('finDwSave'); if(btn){ btn.disabled = true; btn.textContent = 'Saving…'; }
  const fileEl = document.getElementById('finDwFile'); const file = fileEl && fileEl.files && fileEl.files[0];
  if(file){ const stored = await uploadToStorage('finance-docs', ME.org_id+'/'+siteId+'/dayworks/'+uid()+'-'+file.name.replace(/[^a-z0-9.\-]+/gi,'_').slice(-80), file, file.type||'application/octet-stream'); if(stored){ row.file_path = stored; row.file_name = file.name; } }
  let r;
  if(id) r = await dbUpdate('fin_dayworks', id, row);
  else {
    // FA-16: numbered the same way as variations — a clash takes the next free number and says so.
    const lab = seq=>'DW'+String(seq).padStart(3,'0');
    r = await finScInsertNumbered('fin_dayworks',
      async ()=>{ const ex = await dbSelectNet('fin_dayworks', 'site_id=eq.'+siteId+'&select=seq&order=seq.desc&limit=1').catch(()=>[]); return (ex[0] ? ex[0].seq : 0) + 1; },
      seq=>Object.assign({org_id:ME.org_id, site_id:siteId, seq, number:lab(seq), created_by:ME.id}, row), lab);
    if(r && r[0]) await finRenumberIfClash('fin_dayworks', siteId, r[0], lab);
  }
  if(btn){ btn.disabled = false; btn.textContent = 'Save'; }
  if(!r) return;
  document.getElementById('finDwOverlay').style.display = 'none'; toast('Day work saved'); finDwFill(siteId);
};
window.deleteFinDaywork = async function(siteId, id){
  if(!await customConfirm('Delete this day work? Applications already made keep their copy.', {confirmLabel:'Delete'})) return;
  if(await dbDelete('fin_dayworks', id)){ document.getElementById('finDwOverlay').style.display = 'none'; toast('Day work deleted'); finDwFill(siteId); }
};

/* ---------- a draft application keeps up with the registers ----------
   Approved variations / day works not on it yet are added; ones no longer approved
   come off; approved values are kept in step. Drafts only (applied ones are locked). */
let finRegSynced = {};
(function(){
  const base = renderFinApplication;
  renderFinApplication = async function(siteId, appId){
    const r = await base.apply(this, arguments);
    if(!finApp || finApp.id!==appId || finApp.status!=='draft' || finRegSynced[appId]===finApp.__loaded) return r;
    finRegSynced[appId] = finApp.__loaded;
    const [fv, fd] = await Promise.all([
      dbSelect('fin_variations', 'site_id=eq.'+siteId+'&select=id,number,title,status,agreed_value,quoted,variation_id').catch(()=>null),
      dbSelect('fin_dayworks', 'site_id=eq.'+siteId+'&select=id,number,title,status,value').catch(()=>null)]);
    if(!fv || !fd || !finApp || finApp.id!==appId) return r;
    let changed = false;
    const vBy = {}; fv.forEach(v=>vBy[v.id] = v);
    // A site variation already on the draft (variation_id only) is the same one as its register copy — link them, don't add it twice (bug FB-03).
    (finApp.variations||[]).forEach(v=>{ if(!v.fin_variation_id && v.variation_id){ const x = fv.find(f=>f.variation_id===v.variation_id); if(x){ v.fin_variation_id = x.id; changed = true; } } });
    const vars = (finApp.variations||[]).filter(v=>{ if(!v.fin_variation_id) return true; const x = vBy[v.fin_variation_id]; if(x && x.status==='agreed') return true; changed = true; return false; });
    vars.forEach(v=>{ const x = v.fin_variation_id && vBy[v.fin_variation_id]; if(x && x.agreed_value!=null && Number(v.value)!==Number(x.agreed_value)){ v.value = Number(x.agreed_value); changed = true; } });
    fv.filter(v=>v.status==='agreed' && !vars.some(x=>x.fin_variation_id===v.id)).forEach(v=>{ vars.push({fin_variation_id:v.id, variation_id:null, description:v.number+' '+v.title, value:Number(v.agreed_value!=null?v.agreed_value:v.quoted||0), pct:100}); changed = true; });
    const dBy = {}; fd.forEach(d=>dBy[d.id] = d);
    const days = (finApp.dayworks||[]).filter(d=>{ if(!d.fin_daywork_id) return true; const x = dBy[d.fin_daywork_id]; if(x && x.status==='approved') return true; changed = true; return false; });
    days.forEach(d=>{ const x = d.fin_daywork_id && dBy[d.fin_daywork_id]; if(x && Number(d.value)!==Number(x.value||0)){ d.value = Number(x.value||0); changed = true; } });
    fd.filter(d=>d.status==='approved' && !days.some(x=>x.fin_daywork_id===d.id)).forEach(d=>{ days.push({fin_daywork_id:d.id, description:(d.number?d.number+' ':'')+d.title, value:Number(d.value||0)}); changed = true; });
    if(!changed) return r;
    finApp.variations = vars; finApp.dayworks = days;
    const saved = await finAppSaveSoft();
    if(saved){ toast('Approved variations / day works updated on this draft'); render(); }
    return r;
  };
})();

(function(){
  const st = document.createElement('style');
  st.textContent = `html.desk.finmode .scrollarea > *{max-width:none !important;margin-left:0 !important;margin-right:0 !important;}
html.desk.finmode .scrollarea{padding-left:28px !important;padding-right:28px !important;}
.finboqsub{display:flex;gap:4px;border-bottom:1px solid #E3E6EB;margin:4px 0 14px;overflow-x:auto;overflow-y:hidden;}
.finboqsub button{all:unset;cursor:pointer;padding:10px 16px;font-size:14px;font-weight:700;color:var(--slate);border-bottom:2.5px solid transparent;white-space:nowrap;}
.finboqsub button.on{color:var(--ink);border-bottom-color:var(--brand1);}
.finboqadd{display:flex;gap:6px;flex-wrap:wrap;margin-left:auto;}
.finboqadd .ghostbtn{width:auto !important;margin:0 !important;}
.finboqtot{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0 8px;}
.finboqtot > span{display:flex;flex-direction:column;padding:8px 14px;border-radius:10px;background:#EEF4FF;min-width:120px;}
.finboqtot > span.ok{background:#EAF6EE;} .finboqtot > span.bad{background:#FDECEC;}
.finboqtot em{font-style:normal;font-size:11.5px;font-weight:700;color:var(--slate);} .finboqtot b{font-size:16px;font-variant-numeric:tabular-nums;}
.finsmall{width:auto !important;padding:3px 10px !important;height:auto !important;min-height:0 !important;font-size:12px !important;margin:0 !important;}`;
  document.head.appendChild(st);
})();

/* ---------- Projects list tidy (Andy, 23 Oct): status drop-down without counts and wide
   enough to read; job number in a company-colour outline with a soft fill; the bar under
   the list in the company colour; no search box (each column filters already). ---------- */
finJobStatusSelHtml = function(){
  return `<select class="fgstat" onchange="finHomeTab=this.value;render()" onclick="event.stopPropagation()" aria-label="Status">${[['live','Live'],['upcoming','Upcoming'],['closed','Closed'],['all','All']].map(([k,l])=>`<option value="${k}" ${finHomeTab===k?'selected':''}>${l}</option>`).join('')}</select>`;
};
(function(){
  const st = document.createElement('style');
  st.textContent = `.fggrid .fgfilters select.fgstat{min-width:112px !important;padding:0 22px 0 8px !important;text-align:left !important;text-align-last:left !important;font-size:12px !important;}
.fggrid .fgjob:not(.none){background:var(--brand1-soft,#fff) !important;background:color-mix(in srgb, var(--brand1) 10%, #fff) !important;color:var(--brand1) !important;color:color-mix(in srgb, var(--brand1) 80%, #000) !important;border:1.5px solid var(--brand1) !important;}
.fgfoot{background:var(--brand1) !important;color:var(--brand1-text,#fff) !important;}
.fgfoot .fgcolbtn, .fgfoot-ctl select{background-color:rgba(255,255,255,.16) !important;border:1px solid rgba(255,255,255,.35) !important;color:var(--brand1-text,#fff) !important;}
.fgfoot .fgfoot-bad{color:inherit !important;background:rgba(0,0,0,.2);padding:1px 7px;border-radius:6px;}
.finprojfilt .fin-searchlbl{display:none !important;}
.finprojfilt:not(:has(.fincli-lbl)){display:none !important;}
/* audit FB-12: other lists keep their filter bar on phones, where the column filters are hidden */
@media (min-width:701px){ .finjobfilt:not(.finprojfilt){display:none !important;} }`;
  document.head.appendChild(st);
})();

/* Variation and day work numbers (audit FA-16, 24 Oct): the next number is worked out on the phone or
   computer, so two people adding one at the same moment could both get V005. With the database's
   unique (site, seq) rule the insert itself retries (912 finScInsertNumbered). Until that rule is in
   place, after saving check whether someone else got the same number first; if so, this one moves
   to the next free number. */
async function finRenumberIfClash(table, siteId, mine, label){
  if(!mine || mine.seq==null) return mine;
  try{
    const same = await dbSelectChecked(table, 'site_id=eq.'+siteId+'&seq=eq.'+mine.seq+'&select=id,created_at&order=created_at.asc,id.asc');
    if(same.ok && same.data.length > 1 && same.data[0].id !== mine.id){
      const top = await dbSelectChecked(table, 'site_id=eq.'+siteId+'&select=seq&order=seq.desc&limit=1');
      if(top.ok){
        const seq = ((top.data[0] && top.data[0].seq) || 0) + 1;
        const r = await dbUpdate(table, mine.id, {seq, number:label(seq)});
        if(r){ toast('Someone else took '+(mine.number||label(mine.seq))+' at the same time — this one is '+r.number+'.'); return r; }
      }
    }
  }catch(e){ console.error(e); }
  return mine;
}
(function(){
  if(typeof finVarInsert!=='function') return;
  const base = finVarInsert;
  finVarInsert = async function(siteId, row){
    const ins = await base.apply(this, arguments);
    const mine = ins && ins[0]; if(!mine || mine.seq==null) return ins;
    ins[0] = await finRenumberIfClash('fin_variations', siteId, mine, seq=>'V'+String(seq).padStart(3,'0'));
    return ins;
  };
})();
