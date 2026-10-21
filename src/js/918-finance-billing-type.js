/* ============================================================
   OpHUB Finance — invoice projects vs application projects (Andy, 20 Oct:
   "distinguish on the set up of a job if it is an invoice job or an
   application job… invoice = contract value is manual entry, application =
   a schedule of works which can be added to the operatives' SoW, but also
   goes into the application for payments").

   job_finance.billing_type = 'invoice' | 'application'.
   • Invoice: type the contract value (and a value per plot if it has plots).
   • Application: the priced schedule of works (fin_contract_items) sets the
     contract value; it can be sent to the operatives' Schedule of Works
     (no prices) and site progress can fill the % on an application.
   Links: schedule_tasks.contract_item_id / schedule_sections.contract_item_id.
   ============================================================ */
const FIN_BT = {
  invoice:{t:'Invoices', s:'You invoice as you go (or on completion). You type the contract value.', icon:'🧾'},
  application:{t:'Applications for payment', s:'Monthly valuations against a priced schedule of works. The schedule sets the contract value and can go onto the operatives’ Schedule of Works.', icon:'📋'},
};
function finBillingType(jf, itemsCount, appsCount){
  if(jf && jf.billing_type) return jf.billing_type;
  return (itemsCount || appsCount) ? 'application' : null;
}
// Shown at the top of a project's Finance page until it's chosen.
function finBillingChoiceHtml(siteId){
  return `<div class="card finbtchoose">
    <p class="sectiontitle" style="margin-top:0;">How do you get paid on this project?</p>
    <div class="finbtopts">
      ${Object.keys(FIN_BT).map(k=>`<button type="button" class="finbtopt" onclick="setFinBillingType('${siteId}','${k}')">
        <span class="finbtopt-i">${FIN_BT[k].icon}</span><b>${FIN_BT[k].t}</b><span>${FIN_BT[k].s}</span></button>`).join('')}
    </div>
    <p class="stub" style="margin:10px 0 0;font-style:normal;">You can change it later in Project details.</p>
  </div>`;
}
function finBillingLineHtml(siteId, bt){
  if(!bt) return '';
  return `<div class="finkv"><span>Paid by</span><b>${FIN_BT[bt].icon} ${FIN_BT[bt].t} <button type="button" class="linkbtn" onclick="setFinBillingType('${siteId}','${bt==='invoice'?'application':'invoice'}')">Change to ${bt==='invoice'?'applications':'invoices'}</button></b></div>`;
}
window.setFinBillingType = async function(siteId, bt){
  if(!FIN_BT[bt]) return;
  const [jfRows, apps] = await Promise.all([dbSelect('job_finance', 'site_id=eq.'+siteId), dbSelect('fin_applications', 'site_id=eq.'+siteId+'&status=neq.void&select=id')]);
  const jf = jfRows[0];
  if(jf && jf.billing_type && jf.billing_type!==bt){
    const msg = bt==='invoice'
      ? (apps.length ? 'This project has '+apps.length+' application'+(apps.length===1?'':'s')+'. They stay as they are, but you’ll type the contract value from now on. Change to invoices?' : 'Change this project to invoices? You’ll type the contract value yourself.')
      : 'Change this project to applications? The contract value will come from the priced schedule of works.';
    if(!(await customConfirm(msg))) return;
  }
  const res = await sbFetch('/rest/v1/job_finance', {method:'POST', headers:{'Prefer':'resolution=merge-duplicates'}, body:JSON.stringify({site_id:siteId, org_id:ME.org_id, billing_type:bt, updated_at:new Date().toISOString(), updated_by:ME.id})});
  if(!res.ok){ toast('Could not save — '+(await safeErr(res))); return; }
  toast(bt==='invoice' ? 'Invoice project — enter the contract value below' : 'Application project — set up the priced schedule of works');
  if(bt==='application'){
    const items = await dbSelect('fin_contract_items', 'site_id=eq.'+siteId+'&select=id&limit=1');
    if(!items.length){ go('#/site/'+siteId+'/finance/contract'); return; }
  }
  if(bt==='invoice' && typeof finProjTab!=='undefined') finProjTab[siteId] = 'setup';
  render();
  if(bt==='invoice') setTimeout(()=>{ const el = document.getElementById('finContract'); if(el){ el.scrollIntoView({behavior:'smooth', block:'center'}); el.focus(); } }, 300);
};

/* ---------- plot of each schedule line ---------- */
// A line's plot is its own, else its sub-header's, else its header's.
function finItemPlots(items){
  const out = {}; let sec = null, sub = null;
  (items||[]).forEach(i=>{
    const own = i.sub_job_id || i.sub || null;
    if(i.kind==='section'){ sec = own; sub = null; out[i.id||''] = own; return; }
    if(i.kind==='subsection'){ sub = own; out[i.id||''] = own || sec; return; }
    out[i.id||''] = own || sub || sec;
  });
  return out;
}
// Contract value of each plot / repair job: application projects from the schedule,
// invoice projects as typed (fin_sub_values), repair jobs default to their issued cost.
async function finSubValues(siteId, bt){
  const kind = finSubKind(siteId); const subs = FIN_SUBJOBS[siteId] || [];
  const out = {}; let source = 'manual';
  if(bt==='application'){
    const items = await dbSelect('fin_contract_items', 'site_id=eq.'+siteId+'&order=position.asc');
    if(items.some(finIsItem)){
      source = 'schedule';
      const plots = finItemPlots(items);
      items.filter(finIsItem).forEach(i=>{ const k = plots[i.id] || ''; out[k] = finRound((out[k]||0) + Number(i.value||0)); });
      return {values:out, source};
    }
  }
  const rows = await dbSelect('fin_sub_values', 'site_id=eq.'+siteId);
  if(kind==='repair') subs.forEach(a=>{ if(a.value!=null) out[a.id] = a.value; });
  rows.forEach(r=>{ if(r.value!=null) out[r.sub_job_id] = Number(r.value); });
  return {values:out, source};
}
window.setFinSubValue = async function(siteId, subId, v){
  const n = finNum(v); const value = (n===null || isNaN(n)) ? null : finRound(n);
  const res = await sbFetch('/rest/v1/fin_sub_values?on_conflict=site_id,sub_job_id', {method:'POST', headers:{'Prefer':'resolution=merge-duplicates'}, body:JSON.stringify({org_id:ME.org_id, site_id:siteId, sub_job_id:subId, value, updated_by:ME.id, updated_at:new Date().toISOString()})});
  if(!res.ok){ toast('Could not save the value'); return; }
  toast(value==null ? 'Value cleared' : 'Value saved');
  if(finParts && finParts.siteId===siteId){ const r = finParts.rows.find(x=>x.id===subId); if(r){ r.value = value; r.margin = value!=null ? finRound(value - r.cost - r.committed) : null; } finPartsPaint(); }
};

/* ---------- priced schedule ⇄ operatives' Schedule of Works ---------- */
function finSowAllowed(siteId){ const s = SITES.find(x=>x.id===siteId); return !!(s && !s.repair_contract); }
async function finSowStatus(siteId){
  const [tasks, items] = await Promise.all([
    dbSelect('schedule_tasks', 'site_id=eq.'+siteId+'&select=id,contract_item_id,name,section_id,sub_site_id,status,percent_complete&limit=5000'),
    dbSelect('fin_contract_items', 'site_id=eq.'+siteId+'&select=id,kind&limit=5000'),
  ]);
  const itemIds = new Set(items.filter(finIsItem).map(i=>i.id));
  const linked = new Set(tasks.filter(t=>t.contract_item_id && itemIds.has(t.contract_item_id)).map(t=>t.contract_item_id));
  return {tasks, items:itemIds.size, onSow:linked.size, unlinkedTasks:tasks.filter(t=>!t.contract_item_id).length};
}
function finSowCardHtml(siteId, st){
  if(!finSowAllowed(siteId)) return '';
  const all = st.items && st.onSow===st.items;
  return `<div class="card" id="finSowCard">
    <p class="sectiontitle" style="margin-top:0;">Operatives’ Schedule of Works</p>
    <p class="stub" style="margin:0 0 10px;font-style:normal;">${st.items ? (all ? `✓ All ${st.items} lines are on the operatives’ Schedule of Works (without prices). Their progress can fill in your applications.` : `${st.onSow} of ${st.items} lines are on the operatives’ Schedule of Works.`) : 'Once the schedule is priced, send it to the operatives’ Schedule of Works — they see the work, not the prices.'}</p>
    <div class="row-gap" style="flex-wrap:wrap;">
      ${st.items ? `<button class="darkbtn" style="flex:1;min-width:200px;" onclick="finSendToSow('${siteId}')">${all ? 'Update the operatives’ schedule' : 'Send to the operatives’ schedule'}</button>` : ''}
      ${st.unlinkedTasks ? `<button class="ghostbtn" style="flex:1;min-width:200px;" onclick="finContractFromSow('${siteId}')">Copy in ${st.unlinkedTasks} task${st.unlinkedTasks===1?'':'s'} from the site schedule</button>` : ''}
    </div>
  </div>`;
}
// Creates/updates the site's sections and tasks from the priced schedule. Never deletes, never touches progress.
window.finSendToSow = async function(siteId){
  if(typeof finContractIsDirty==='function' && finContractSite===siteId && finContractIsDirty()){ toast('Save the schedule first.'); return; }
  const isMulti = siteIsMulti(siteId);
  const [items, secs, tasks] = await Promise.all([
    dbSelect('fin_contract_items', 'site_id=eq.'+siteId+'&order=position.asc'),
    dbSelect('schedule_sections', 'site_id=eq.'+siteId+'&select=id,contract_item_id,name,position'),
    dbSelect('schedule_tasks', 'site_id=eq.'+siteId+'&select=id,contract_item_id,name,section_id,sub_site_id,position'),
  ]);
  if(!items.some(finIsItem)){ toast('Add the schedule lines first.'); return; }
  const plots = finItemPlots(items);
  const secBy = {}; secs.forEach(s=>{ if(s.contract_item_id) secBy[s.contract_item_id] = s; });
  const taskBy = {}; tasks.forEach(t=>{ if(t.contract_item_id) taskBy[t.contract_item_id] = t; });
  let secPos = secs.reduce((m,s)=>Math.max(m, Number(s.position||0)), 0) + 1;
  let taskPos = tasks.reduce((m,t)=>Math.max(m, Number(t.position||0)), 0) + 1;
  let curSec = null, headName = '', added = 0, updated = 0, newSecs = 0;
  const nm = i=>(i.ref ? i.ref+' ' : '')+String(i.description||'').trim();
  for(const i of items){
    if(i.kind==='section' || i.kind==='subsection'){
      const name = i.kind==='section' ? nm(i) : (headName ? headName+' — ' : '')+nm(i);
      if(i.kind==='section') headName = nm(i);
      const ex = secBy[i.id];
      if(ex){ if(ex.name!==name) await dbUpdate('schedule_sections', ex.id, {name}); curSec = ex.id; }
      else { const r = await dbInsert('schedule_sections', {site_id:siteId, name, position:secPos++, created_by:ME.id, contract_item_id:i.id}); curSec = r && r[0] ? r[0].id : null; newSecs++; }
      continue;
    }
    const name = nm(i) || 'Item';
    const sub = isMulti ? (plots[i.id] || null) : null;
    const ex = taskBy[i.id];
    if(ex){
      const p = {}; if(ex.name!==name) p.name = name; if((ex.section_id||null)!==(curSec||null)) p.section_id = curSec; if(isMulti && (ex.sub_site_id||null)!==sub) p.sub_site_id = sub;
      if(Object.keys(p).length){ await dbUpdate('schedule_tasks', ex.id, p); updated++; }
    } else {
      const row = {site_id:siteId, name, status:'todo', position:taskPos++, contract_item_id:i.id};
      if(curSec) row.section_id = curSec; if(sub) row.sub_site_id = sub;
      const r = await dbInsert('schedule_tasks', row); if(r) added++;
    }
  }
  toast(added || updated || newSecs ? `Operatives’ schedule: ${added} task${added===1?'':'s'} added${updated?', '+updated+' updated':''}` : 'The operatives’ schedule is already up to date');
  render();
};
// Brings the site's existing (unlinked) Schedule of Works into the priced schedule, ready to price.
window.finContractFromSow = async function(siteId){
  const [secs, tasks] = await Promise.all([
    dbSelect('schedule_sections', 'site_id=eq.'+siteId+'&order=position.asc.nullslast,created_at.asc'),
    dbSelect('schedule_tasks', 'site_id=eq.'+siteId+'&order=position.asc.nullslast,created_at.asc'),
  ]);
  const free = tasks.filter(t=>!t.contract_item_id);
  if(!free.length){ toast('Everything on the site schedule is already in here.'); return; }
  if(!finContractRows || finContractSite!==siteId){ toast('Open the schedule first.'); return; }
  const add = [];
  free.filter(t=>!t.section_id).forEach(t=>add.push({kind:'item', ref:'', description:t.name, qty:null, unit:'', rate:null, value:null, sub:t.sub_site_id||'', _task_id:t.id}));
  secs.forEach(s=>{
    const ts = free.filter(t=>t.section_id===s.id); if(!ts.length) return;
    add.push({kind:'section', ref:'', description:s.name, qty:null, unit:'', rate:null, value:null, sub:'', _sec_id:s.contract_item_id ? null : s.id});
    ts.forEach(t=>add.push({kind:'item', ref:'', description:t.name, qty:null, unit:'', rate:null, value:null, sub:t.sub_site_id||'', _task_id:t.id}));
  });
  finContractRows = finContractRows.concat(add);
  finContractPaint();
  toast(free.length+' task'+(free.length===1?'':'s')+' copied in — add a price to each, then save');
  setTimeout(()=>{ const el = document.getElementById('finContractList'); if(el && el.lastElementChild) el.lastElementChild.scrollIntoView({behavior:'smooth', block:'center'}); }, 100);
};

/* ---------- site progress → application ---------- */
// {item_id: pct} from the operatives' Schedule of Works (done = 100%).
async function finSiteProgress(siteId){
  const tasks = await dbSelect('schedule_tasks', 'site_id=eq.'+siteId+'&contract_item_id=not.is.null&select=contract_item_id,status,percent_complete&limit=5000');
  const acc = {};
  tasks.forEach(t=>{ const p = t.status==='done' ? 100 : Math.max(0, Math.min(100, Number(t.percent_complete||0))); (acc[t.contract_item_id] = acc[t.contract_item_id] || []).push(p); });
  const out = {}; Object.keys(acc).forEach(k=>out[k] = finRound(acc[k].reduce((a,b)=>a+b,0)/acc[k].length));
  return out;
}
window.finAppUseSiteProgress = function(){
  const sp = finAppCtx && finAppCtx.siteProgress; if(!sp) return;
  let n = 0;
  (finApp.lines||[]).forEach(l=>{ if(finIsItem(l) && sp[l.item_id]!=null && sp[l.item_id] > finPct(l.pct)){ l.pct = finPct(sp[l.item_id]); n++; } });
  finAppPaintLines(); finAppPaint();
  toast(n ? n+' line'+(n===1?'':'s')+' updated from site progress — check, then Save' : 'Already matches site progress');
};

/* ---------- project Finance page: tabs across the top (Andy, 20 Oct) ---------- */
const FIN_PTABS = [{k:'overview', l:'Overview'}, {k:'sales', l:'Sales'}, {k:'purchases', l:'Purchases'}, {k:'subs', l:'Subcontractors & Labour'}, {k:'setup', l:'Set-up'}];
let finProjTab = {}; // siteId -> tab
function finProjTabCur(siteId){
  const q = typeof routeQuery==='function' ? routeQuery().get('tab') : null;
  if(q && FIN_PTABS.some(t=>t.k===q)) finProjTab[siteId] = q;
  return finProjTab[siteId] || 'overview';
}
function finProjTabsHtml(siteId, bt){
  const cur = finProjTabCur(siteId);
  return `<div class="finsubtabs finptabs" role="tablist">${FIN_PTABS.map(t=>`<button type="button" role="tab" data-t="${t.k}" class="${t.k===cur?'on':''}" onclick="finProjTabGo('${siteId}','${t.k}')">${t.k==='setup' && bt==='application' ? 'Schedule & set-up' : t.l}</button>`).join('')}</div>`;
}
window.finProjTabGo = function(siteId, k){ finProjTab[siteId] = k; finProjTabShow(k); try{ window.scrollTo({top:0}); document.querySelector('.scrollarea') && (document.querySelector('.scrollarea').scrollTop = 0); }catch(e){} };
function finProjTabShow(k){
  document.querySelectorAll('.finptab').forEach(el=>el.style.display = el.dataset.t===k ? '' : 'none');
  document.querySelectorAll('.finptabs button').forEach(b=>b.classList.toggle('on', b.dataset.t===k));
}

/* ---------- application dates: the next 12 months, each can be changed (Andy, 20 Oct) ---------- */
function finNext12Months(){ const out = []; const d = new Date(); d.setDate(1); for(let i=0;i<12;i++){ out.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')); d.setMonth(d.getMonth()+1); } return out; }
function finAppDatesHtml(jf, st){
  const months = finNext12Months(), custom = (jf && jf.app_dates) || {};
  const n = months.filter(m=>custom[m]).length;
  return `<details class="finappdates" style="grid-column:1 / -1;" ${n?'open':''}>
    <summary>Application dates for the next 12 months${n ? ` <em>· ${n} set by hand</em>` : ''}</summary>
    <p class="stub" style="margin:6px 0 10px;font-style:normal;">Each month uses the day above unless you pick a date for it (e.g. the client’s valuation calendar). Leave a box empty to use the normal day.</p>
    <div class="finappdates-g">${months.map(m=>{ const def = finAppDateFor({app_reminder_day:jf && jf.app_reminder_day}, st, m) || ''; const v = custom[m] || '';
      return `<label class="${custom[m]?'set':''}"><span>${new Date(m+'-01T12:00:00').toLocaleDateString('en-GB',{month:'short', year:'numeric'})}</span><input type="date" data-ym="${m}" data-def="${def}" value="${v}" min="${m}-01" max="${m}-31" onchange="this.parentNode.classList.toggle('set', !!this.value && this.value!==this.dataset.def)"><em>${def ? 'Normally '+finDate(def) : 'No day set'}</em></label>`; }).join('')}</div>
  </details>`;
}
// Only the months that differ from the day-of-month rule are stored.
function finAppDatesRead(day){
  const out = {}; let any = false;
  document.querySelectorAll('.finappdates input[data-ym]').forEach(el=>{
    const ym = el.dataset.ym, v = el.value;
    const def = day ? ym+'-'+String(Math.min(day, new Date(+ym.slice(0,4), +ym.slice(5,7), 0).getDate())).padStart(2,'0') : (el.dataset.def||'');
    if(v && v!==def){ out[ym] = v; any = true; }
  });
  return any ? out : null;
}

/* ---------- neat drop-downs: cards become tap-to-open sections (Finance › Settings, Andy 20 Oct) ---------- */
let FIN_COLL_OPEN = null;
function finCollOpenSet(){ if(!FIN_COLL_OPEN){ try{ FIN_COLL_OPEN = new Set(JSON.parse(localStorage.getItem('ophub.finColl')||'[]')); }catch(e){ FIN_COLL_OPEN = new Set(); } } return FIN_COLL_OPEN; }
function finCollapseCards(root, key){
  if(!root) return;
  root.querySelectorAll('.card').forEach(card=>{
    if(card.dataset.coll) return;
    const t = card.firstElementChild;
    if(!t || !t.classList || !t.classList.contains('sectiontitle')) return;
    const title = t.textContent.trim(), id = key+':'+title;
    card.dataset.coll = '1'; card.classList.add('fincoll');
    const det = document.createElement('details'); det.className = 'fincoll-d';
    if(finCollOpenSet().has(id)) det.open = true;
    const sum = document.createElement('summary'); sum.className = 'fincoll-s';
    sum.innerHTML = `<span>${escapeHtml(title)}</span><span class="fincoll-c" aria-hidden="true">▾</span>`;
    const body = document.createElement('div'); body.className = 'fincoll-b';
    t.remove();
    while(card.firstChild) body.appendChild(card.firstChild);
    det.appendChild(sum); det.appendChild(body); card.appendChild(det);
    det.addEventListener('toggle', ()=>{ const s = finCollOpenSet(); if(det.open) s.add(id); else s.delete(id); try{ localStorage.setItem('ophub.finColl', JSON.stringify(Array.from(s))); }catch(e){} });
  });
}
