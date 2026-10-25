/* ============================================================
   OpHUB Finance — costs by plot / address / repair job (Andy, 20 Oct:
   "Multi site projects and repairs need to have costs allocated to the
   jobs within them… an overview and go into each sub job", and "invoices
   need to be split… a percentage or £ split… always totalling 100%").

   Sub-jobs are what the project already has:
     • multi-site projects → site_sub_addresses (plots / blocks / addresses)
     • repair contracts    → repair_jobs
   Any cost row can carry sub_job_id (one plot) or split = [{site_id,
   sub_job_id, pct, amount}] across plots and/or projects (a DB trigger
   checks it totals 100% and keeps split_sites for lookups).
   Booking stays simple: a material request for Plot 3 → its PO is for
   Plot 3 → the purchase invoice on that PO follows the PO.
   ============================================================ */
const FIN_SUBJOBS = {}; // siteId -> [{id, label, short, detail, value, closed}]
function finSubKind(siteId){ const s = SITES.find(x=>x.id===siteId); return !s ? '' : s.repair_contract ? 'repair' : s.multi_site ? 'multi' : ''; }
function finSubNoun(siteId, plural){ const k = finSubKind(siteId); return k==='repair' ? (plural?'Repair jobs':'Repair job') : (plural?'Plots & addresses':'Plot / address'); }
async function finSubJobsLoad(siteId, force){
  if(!siteId) return [];
  if(FIN_SUBJOBS[siteId] && !force) return FIN_SUBJOBS[siteId];
  const k = finSubKind(siteId); let out = [];
  if(k==='repair'){
    const rows = await finSelectAll('repair_jobs', 'site_id=eq.'+siteId+'&select=id,job_number,address,description,variation_cost,job_status,closed,created_at&order=created_at.asc');
    out = (rows||[]).map(r=>({id:r.id, short:r.job_number || (r.address||'').split(',')[0] || 'Repair', label:[r.job_number, r.address].filter(Boolean).join(' — ') || 'Repair job', detail:r.description||'', value:r.variation_cost!=null ? Number(r.variation_cost) : null, status:r.job_status||'', closed:!!r.closed}));
  } else if(k==='multi'){
    const rows = await dbSelect('site_sub_addresses', 'site_id=eq.'+siteId+'&order=name.asc');
    out = (rows||[]).map(a=>({id:a.id, short:a.name||'Address', label:a.name||'Address', detail:[a.address, a.postcode].filter(Boolean).join(', '), value:null, closed:!!a.closed}));
  }
  FIN_SUBJOBS[siteId] = out;
  return out;
}
function finSubLabel(siteId, subId, short){
  if(!subId) return '';
  const a = (FIN_SUBJOBS[siteId]||[]).find(x=>x.id===subId);
  return a ? (short ? a.short : a.label) : (finSubKind(siteId)==='repair' ? 'Repair job' : 'Address');
}
// <select> of a project's plots / repair jobs ('' when it has none). Load with finSubJobsLoad first.
function finSubJobSelectHtml(id, siteId, selected, label){
  const list = FIN_SUBJOBS[siteId] || [];
  if(!finSubKind(siteId) || !list.length) return '';
  return `<div class="formfield"><label class="field-label">${label || finSubNoun(siteId)}</label><select id="${id}">
    <option value="">Whole project (not allocated)</option>
    ${list.map(a=>`<option value="${a.id}" ${selected===a.id?'selected':''}>${escapeHtml(a.label)}${a.closed?' (closed)':''}</option>`).join('')}
  </select></div>`;
}

/* ---------- where a cost row goes ---------- */
// Returns [{site_id, sub, share}] with shares adding up to 1.
function finAllocs(row, ctx){
  if(Array.isArray(row.split) && row.split.length){
    return row.split.map(e=>({site_id:e.site_id, sub:e.sub_job_id||null, share:Number(e.pct||0)/100, cat:e.cost_code||null}));
  }
  // A purchase invoice on a PO follows the PO unless it has its own allocation.
  if(row.po_id && !row.sub_job_id && ctx && ctx.poBy && ctx.poBy[row.po_id]){
    const po = ctx.poBy[row.po_id];
    const a = finAllocs(po, ctx);
    if(a.some(x=>x.sub) || a.some(x=>x.site_id!==row.site_id)) return a;
  }
  // A PO for several plots: shared by item value (or item count when not priced).
  if(Array.isArray(row.items) && !row.sub_job_id){
    const its = row.items.filter(i=>i);
    const subs = new Set(its.map(i=>i.sub_job_id||''));
    if(subs.size > 1){
      const priced = its.every(i=>i.amount!=null && Number(i.amount) > 0);
      const w = i=>priced ? Number(i.amount) : 1;
      const tot = its.reduce((t,i)=>t+w(i), 0) || 1;
      const by = {}; its.forEach(i=>{ const k = i.sub_job_id||''; by[k] = (by[k]||0) + w(i)/tot; });
      return Object.keys(by).map(k=>({site_id:row.site_id, sub:k||null, share:by[k]}));
    }
    if(subs.size===1 && its[0] && its[0].sub_job_id) return [{site_id:row.site_id, sub:its[0].sub_job_id, share:1}];
  }
  return [{site_id:row.site_id, sub:row.sub_job_id||null, share:1}];
}
// One line of text: "Plot 3" / "Split: Plot 1 50% · Plot 2 50%" / "Not allocated".
function finAllocText(row, ctx){
  const a = finAllocs(row, ctx);
  const nm = x=>(x.site_id!==row.site_id ? (finSiteShort(x.site_id)+(x.sub?' › ':'')) : '')+(x.sub ? finSubLabel(x.site_id, x.sub, true) : (x.site_id!==row.site_id ? '' : 'Whole project'));
  if(a.length===1) return a[0].sub || a[0].site_id!==row.site_id ? nm(a[0]) : '';
  return 'Split: '+a.map(x=>nm(x)+' '+finRound(x.share*100)+'%').join(' · ');
}
function finSiteShort(siteId){ const s = SITES.find(x=>x.id===siteId); return s ? (s.job_number || s.name) : 'Project'; }

/* ---------- split / allocate modal ---------- */
const FIN_SPLIT_TABLES = {
  purchase_invoices:{noun:'purchase invoice', net:r=>r.net},
  purchase_orders:{noun:'PO', net:r=>r.value},
  fin_job_costs:{noun:'cost', net:r=>r.net},
  // FA-20: a hire costed from the hire company's invoices has no cost of its own (the invoices carry it).
  fin_plant_hires:{noun:'plant hire', net:r=>r.cost_from==='invoices' ? null : (typeof finPlantCost==='function' ? finPlantCost(r).cost : null)},
};
let finSplit = null; // {table, id, row, net, mode, rows:[{site_id, sub, v}]}
window.openFinSplit = async function(table, id){
  const cfg = FIN_SPLIT_TABLES[table]; if(!cfg) return;
  const row = (await dbSelect(table, 'id=eq.'+id))[0]; if(!row){ toast('Not found'); return; }
  let net = cfg.net(row); net = net!=null && !isNaN(Number(net)) && Number(net) > 0 ? finRound(Number(net)) : null;
  let rows;
  if(Array.isArray(row.split) && row.split.length) rows = row.split.map(e=>({site_id:e.site_id, sub:e.sub_job_id||'', v:Number(e.pct)}));
  else {
    let a = [{site_id:row.site_id, sub:row.sub_job_id||null, share:1}];
    if(table==='purchase_invoices' && row.po_id && !row.sub_job_id){ const po = (await dbSelect('purchase_orders', 'id=eq.'+row.po_id))[0]; if(po){ const pa = finAllocs(po, {}); if(pa.some(x=>x.sub) || pa.some(x=>x.site_id!==row.site_id)) a = pa; } }
    else if(table==='purchase_orders') a = finAllocs(row, {});
    rows = a.map(x=>({site_id:x.site_id, sub:x.sub||'', v:finRound(x.share*100)}));
  }
  await Promise.all(Array.from(new Set(rows.map(r=>r.site_id).concat([row.site_id]))).map(s=>finSubJobsLoad(s)));
  finSplit = {table, id, row, net, noun:cfg.noun, mode:'pct', rows};
  let ov = document.getElementById('finSplitOverlay');
  if(!ov){ ov = document.createElement('div'); ov.id = 'finSplitOverlay'; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
  ov.onclick = e=>{ if(e.target===ov) ov.style.display='none'; };
  ov.style.display = 'flex';
  finSplitPaint();
};
function finSplitSites(){
  return SITES.filter(s=>s.status!=='closed' || finSplit.rows.some(r=>r.site_id===s.id)).slice().sort((a,b)=>String(a.job_number||a.name).localeCompare(String(b.job_number||b.name), undefined, {numeric:true}));
}
function finSplitTotal(){ return finRound(finSplit.rows.reduce((t,r)=>t+(Number(r.v)||0), 0)); }
window.finSplitPaint = function(){
  const ov = document.getElementById('finSplitOverlay'); if(!ov || !finSplit) return;
  const d = finSplit, pct = d.mode==='pct';
  const target = pct ? 100 : d.net;
  const tot = finSplitTotal(), left = finRound(target - tot);
  const ok = Math.abs(left) < 0.01;
  const sites = finSplitSites();
  const homeSubs = FIN_SUBJOBS[d.row.site_id] || [];
  ov.innerHTML = `<div class="geo-modal-card finsplit" style="max-width:640px;">
    <h3>Allocate this ${d.noun}</h3>
    ${d.row.xero_id ? `<div class="finnote warn" style="margin:0 0 10px;"><b style="display:inline;">Already in Xero.</b> Changing the split here won’t change Xero — change the project tracking on the bill in Xero too, or the two won’t match.</div>` : ''}
    <p class="stub" style="margin:-4px 0 12px;font-style:normal;">${d.net!=null ? finMoney(d.net)+' excl. VAT. ' : (d.table==='fin_plant_hires' && d.row.cost_from==='invoices' ? 'The cost comes from the hire company’s invoices. ' : '')}Book it to one ${homeSubs.length ? finSubNoun(d.row.site_id).toLowerCase() : 'project'}, or split it across as many projects${homeSubs.length ? ' / '+finSubNoun(d.row.site_id, true).toLowerCase() : ''} as you need. It must add up to ${pct ? '100%' : finMoney(d.net)}.</p>
    <div class="finseg" role="tablist">
      <button type="button" class="${pct?'on':''}" onclick="finSplitMode('pct')">By %</button>
      <button type="button" class="${!pct?'on':''}" ${d.net==null?'disabled title="No value yet"':''} onclick="finSplitMode('gbp')">By £</button>
    </div>
    <div class="finsplit-rows">
      ${d.rows.map((r,i)=>{ const subs = FIN_SUBJOBS[r.site_id] || []; return `<div class="finsplit-row">
        <select aria-label="Project" onchange="finSplitSite(${i}, this.value)">${sites.map(s=>`<option value="${s.id}" ${s.id===r.site_id?'selected':''}>${escapeHtml((s.job_number?s.job_number+' · ':'')+s.name)}</option>`).join('')}</select>
        ${subs.length ? `<select aria-label="${finSubNoun(r.site_id)}" onchange="finSplit.rows[${i}].sub=this.value"><option value="">Whole project</option>${subs.map(a=>`<option value="${a.id}" ${a.id===r.sub?'selected':''}>${escapeHtml(a.label)}</option>`).join('')}</select>` : `<span class="finsplit-none">—</span>`}
        <label class="finsplit-v"><input type="text" inputmode="decimal" value="${r.v===''||r.v==null?'':r.v}" oninput="finSplit.rows[${i}].v=finNum(this.value);finSplitFoot()"><span>${pct?'%':'£'}</span></label>
        ${d.rows.length>1 ? `<button type="button" class="linkbtn" aria-label="Remove" onclick="finSplit.rows.splice(${i},1);finSplitPaint()">✕</button>` : '<span></span>'}
      </div>`; }).join('')}
    </div>
    <div class="finsplit-tools">
      <button type="button" class="ghostbtn" onclick="finSplitAdd()">+ Add a line</button>
      <button type="button" class="ghostbtn" onclick="finSplitEven()">Share evenly</button>
      ${homeSubs.length ? `<button type="button" class="ghostbtn" onclick="finSplitAllSubs()">Across all ${escapeHtml(finSubNoun(d.row.site_id, true).toLowerCase())}</button>` : ''}
    </div>
    <div id="finSplitFoot" class="finsplit-foot ${ok?'ok':'bad'}">${ok ? '✓ Adds up to '+(pct?'100%':finMoney(d.net)) : (left>0 ? 'Still to allocate: ' : 'Over by: ')+(pct ? finRound(Math.abs(left))+'%' : finMoney(Math.abs(left)))}</div>
    <button class="darkbtn" style="width:100%;" onclick="saveFinSplit()">Save</button>
    <button class="geo-modal-cancel" onclick="document.getElementById('finSplitOverlay').style.display='none'">Cancel</button>
  </div>`;
};
window.finSplitFoot = function(){
  const el = document.getElementById('finSplitFoot'); if(!el) return;
  const pct = finSplit.mode==='pct', target = pct ? 100 : finSplit.net;
  const left = finRound(target - finSplitTotal()), ok = Math.abs(left) < 0.01;
  el.className = 'finsplit-foot '+(ok?'ok':'bad');
  el.textContent = ok ? '✓ Adds up to '+(pct?'100%':finMoney(finSplit.net)) : (left>0 ? 'Still to allocate: ' : 'Over by: ')+(pct ? finRound(Math.abs(left))+'%' : finMoney(Math.abs(left)));
};
window.finSplitMode = function(m){
  const d = finSplit; if(m===d.mode || (m==='gbp' && d.net==null)) return;
  d.rows.forEach(r=>{ const v = Number(r.v)||0; r.v = m==='gbp' ? finRound(v/100*d.net) : finRound(v/d.net*100); });
  d.mode = m;
  if(Math.abs(finSplitTotal() - (m==='pct'?100:d.net)) < 0.05) finSplitFix();
  finSplitPaint();
};
function finSplitFix(){ // put any rounding penny on the last line
  const d = finSplit, target = d.mode==='pct' ? 100 : d.net;
  const last = d.rows[d.rows.length-1]; if(!last) return;
  last.v = finRound((Number(last.v)||0) + target - finSplitTotal());
}
window.finSplitSite = async function(i, siteId){ finSplit.rows[i].site_id = siteId; finSplit.rows[i].sub = ''; await finSubJobsLoad(siteId); finSplitPaint(); };
window.finSplitAdd = function(){
  const d = finSplit, last = d.rows[d.rows.length-1];
  const left = finRound((d.mode==='pct'?100:d.net) - finSplitTotal());
  d.rows.push({site_id:last ? last.site_id : d.row.site_id, sub:'', v:left > 0 ? left : ''});
  finSplitPaint();
};
window.finSplitEven = function(){
  const d = finSplit, n = d.rows.length, target = d.mode==='pct' ? 100 : d.net;
  d.rows.forEach(r=>r.v = finRound(target/n)); finSplitFix(); finSplitPaint();
};
window.finSplitAllSubs = function(){
  const d = finSplit, subs = (FIN_SUBJOBS[d.row.site_id]||[]).filter(a=>!a.closed); if(!subs.length) return;
  const target = d.mode==='pct' ? 100 : d.net;
  d.rows = subs.map(a=>({site_id:d.row.site_id, sub:a.id, v:finRound(target/subs.length)}));
  finSplitFix(); finSplitPaint();
};
window.saveFinSplit = async function(){
  const d = finSplit; if(!d) return;
  const rows = d.rows.filter(r=>r.site_id && Number(r.v) > 0);
  if(!rows.length){ toast('Add at least one line.'); return; }
  const pct = d.mode==='pct', target = pct ? 100 : d.net;
  const tot = finRound(rows.reduce((t,r)=>t+Number(r.v), 0));
  if(Math.abs(tot - target) >= 0.01){ toast('It needs to add up to '+(pct?'100%':finMoney(d.net))+' — it’s '+(pct?tot+'%':finMoney(tot))+'.'); return; }
  const seen = new Set();
  for(const r of rows){ const k = r.site_id+'|'+(r.sub||''); if(seen.has(k)){ toast('The same project / plot is on two lines — put them together.'); return; } seen.add(k); }
  let patch;
  if(rows.length===1 && rows[0].site_id===d.row.site_id){
    patch = {sub_job_id:rows[0].sub||null, split:null};
  } else {
    // Percentages to 4 dp, last line takes the rounding so it's exactly 100.
    const out = rows.map(r=>({site_id:r.site_id, sub_job_id:r.sub||null, pct:pct ? Math.round(Number(r.v)*10000)/10000 : Math.round(Number(r.v)/d.net*1000000)/10000, amount:d.net!=null ? (pct ? finRound(Number(r.v)/100*d.net) : finRound(Number(r.v))) : null}));
    const sumP = out.reduce((t,x)=>t+x.pct, 0); out[out.length-1].pct = Math.round((out[out.length-1].pct + 100 - sumP)*10000)/10000;
    patch = {split:out, sub_job_id:null};
  }
  // FA-11: a bill already in Xero is tracked there by project — stop unless they'll change Xero too.
  const siteSet = sp=>Array.from(new Set(sp && sp.length ? sp.map(e=>e.site_id) : [d.row.site_id])).sort().join(',');
  if(d.table==='purchase_invoices' && siteSet(d.row.split)!==siteSet(patch.split) && typeof finXeroPostedConfirm==='function'
    && !(await finXeroPostedConfirm(d.table, d.id, 'Save this split? It moves cost between projects.', 'change the project tracking on the bill in Xero'))) return;
  const res = await dbUpdate(d.table, d.id, patch);
  if(!res){ toast('Could not save the split.'); return; }
  document.getElementById('finSplitOverlay').style.display = 'none';
  toast(patch.split ? 'Split across '+patch.split.length : (patch.sub_job_id ? 'Booked to '+finSubLabel(d.row.site_id, patch.sub_job_id, true) : 'Booked to the whole project'));
  finSplit = null; render();
};
// Small inline block for a document page: where it's booked + the button.
function finAllocBlockHtml(table, row, ctx){
  const kind = finSubKind(row.site_id);
  let txt = finAllocText(row, ctx);
  if(txt && table==='purchase_invoices' && row.po_id && !row.sub_job_id && !(row.split && row.split.length)) txt += ' (same as the PO)';
  return `<div class="finkv finalloc"><span>Booked to</span><b>${escapeHtml(txt || (kind ? finJobTag(row.site_id)+' — whole job' : finJobTag(row.site_id)))} <button type="button" class="linkbtn" onclick="openFinSplit('${table}','${row.id}')">${txt && txt.startsWith('Split') ? 'Change split' : (kind ? 'Allocate / split' : 'Split')}</button></b></div>`;
}

/* ---------- overview page: costs by plot / repair job ---------- */
let finParts = null; // {siteId, rows}
async function renderFinParts(siteId){
  if(!finGuard()) return;
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId); if(!site){ go('#/finance'); return; }
  const [b, subs] = await Promise.all([finLoadBook(siteId), finSubJobsLoad(siteId, true)]);
  const jf = finBy(b.jf, siteId)[0] || {};
  const bt = finBillingType(jf, 0, finBy(b.apps, siteId).length);
  const sv = await finSubValues(siteId, bt);
  if(__gen !== RENDER_GEN) return;
  const lines = finCostLinesFromBook(b, siteId);
  const isRepair = finSubKind(siteId)==='repair';
  const blank = ()=>({materials:0, labour:0, plant:0, subcontract:0, other:0, committed:0, cost:0, n:0});
  const by = {}; subs.forEach(a=>by[a.id] = blank()); by[''] = blank();
  lines.forEach(l=>{
    const k = l.sub && by[l.sub] ? l.sub : (l.sub ? l.sub : '');
    if(!by[k]) by[k] = blank();
    const t = by[k]; t.n++;
    if(l.cat==='committed') t.committed += l.net;
    else { const c = ['materials','labour','plant','subcontract'].includes(l.cat) ? l.cat : 'other'; t[c] += l.net; t.cost += l.net; }
  });
  const mk = (id, name, detail, value, status)=>{ const t = by[id] || blank(); const r = {id:id||'none', name, detail, status, materials:finRound(t.materials), labour:finRound(t.labour), plant:finRound(t.plant), subcontract:finRound(t.subcontract), other:finRound(t.other), cost:finRound(t.cost), committed:finRound(t.committed), n:t.n};
    r.value = value; r.margin = value!=null ? finRound(value - r.cost - r.committed) : null;
    return r; };
  const rows = subs.map(a=>mk(a.id, a.label, a.detail, sv.values[a.id]!=null ? sv.values[a.id] : null, a.closed ? 'Closed' : a.status));
  Object.keys(by).filter(k=>k && !subs.some(a=>a.id===k)).forEach(k=>rows.push(mk(k, 'Removed '+finSubNoun(siteId).toLowerCase(), '', null, '')));
  const un = mk('', 'Not allocated — whole project', 'Costs not booked to one '+finSubNoun(siteId).toLowerCase()+' yet', sv.values['']!=null ? sv.values[''] : null, '');
  finParts = {siteId, rows, un, isRepair, q:'', editValues: sv.source==='manual' && bt!=='application', bt};
  const valTot = finRound(rows.reduce((t,r)=>t+(Number(r.value)||0), 0) + (Number(un.value)||0));
  const cv = jf.contract_value!=null ? Number(jf.contract_value) : null;
  const tot = k=>finRound(rows.reduce((t,r)=>t+(Number(r[k])||0), 0) + (Number(un[k])||0));
  const allocated = finRound(rows.reduce((t,r)=>t+r.cost, 0));
  document.getElementById('app').innerHTML = shell(`
    <div class="pmstats finstats">
      <div class="pmstat"><b>${finMoney(tot('cost'), 0)}</b><span>Total cost</span></div>
      <div class="pmstat"><b>${finMoney(allocated, 0)}</b><span>Allocated to ${escapeHtml(finSubNoun(siteId, true).toLowerCase())}</span></div>
      <div class="pmstat" onclick="go('#/site/${siteId}/finance/costs?sub=none')"><b ${un.cost>0?'style="color:var(--warn,#B0740F);"':''}>${finMoney(un.cost, 0)}</b><span>Not allocated</span></div>
      <div class="pmstat"><b>${finMoney(tot('committed'), 0)}</b><span>Committed (ordered)</span></div>
    </div>
    ${subs.length && cv!=null && valTot && Math.abs(valTot - cv) >= 1 ? `<div class="finnote warn">The ${escapeHtml(finSubNoun(siteId, true).toLowerCase())} add up to <b style="display:inline;">${finMoney(valTot)}</b> but the contract value is <b style="display:inline;">${finMoney(cv)}</b>.</div>` : ''}
    ${subs.length && bt==='application' && sv.source!=='schedule' ? `<div class="finnote">Values come from the Bill of Quantities — <a href="#/site/${siteId}/finance/contract">set it up</a> and put each header on a ${escapeHtml(finSubNoun(siteId).toLowerCase())}.</div>` : ''}
    ${subs.length ? '' : `<div class="finnote">No ${escapeHtml(finSubNoun(siteId, true).toLowerCase())} on this project yet. ${isRepair ? 'Add repair jobs from the project home.' : 'Add them in the project’s Settings › Multi-Site.'}</div>`}
    <div class="fincosttools">
      <input type="search" placeholder="Search ${escapeHtml(finSubNoun(siteId, true).toLowerCase())}…" oninput="finParts.q=this.value;finPartsPaint()">
      <div class="fincosttools-b">
        <button class="ghostbtn" onclick="finPartsExport('xlsx')">Excel</button>
        <button class="ghostbtn" onclick="finPartsExport('pdf')">PDF</button>
        <button class="darkbtn" onclick="go('#/site/${siteId}/finance/costs')">All costs</button>
      </div>
    </div>
    <div id="finPartsTbl"></div>
    <p class="stub" style="margin:10px 0 0;font-style:normal;">Excl. VAT. Tap a ${escapeHtml(finSubNoun(siteId).toLowerCase())} to see every cost booked to it. Materials ordered for a ${escapeHtml(finSubNoun(siteId).toLowerCase())} carry through to the PO and the purchase invoice. Split costs show their share. Sign-in days are shared across the addresses signed into that day. ${sv.source==='schedule' ? 'Value = the Bill of Quantities for each one.' : (isRepair ? 'Value = the cost issued on the repair job, unless you type another.' : 'Type a value for each one.')} Margin = value − cost − committed.</p>
  `, {title:'Costs by '+(isRepair?'repair job':'plot'), subtitle:(site.job_number?site.job_number+' · ':'')+site.name, back:`#/site/${siteId}/finance`, siteId, tabs:false, wide:true});
  finPartsPaint();
}
function finPartsCols(){
  const c = [{k:'name', l:finSubNoun(finParts.siteId)}, {k:'materials', l:'Materials', money:true}, {k:'labour', l:'Labour', money:true}, {k:'plant', l:'Plant', money:true}, {k:'subcontract', l:'Subcontract', money:true}, {k:'other', l:'Other', money:true}, {k:'cost', l:'Total cost', money:true}, {k:'committed', l:'Committed', money:true}];
  c.splice(1, 0, {k:'value', l:'Value', money:true});
  c.push({k:'margin', l:'Margin', money:true});
  return c;
}
window.finPartsPaint = function(){
  const box = document.getElementById('finPartsTbl'); if(!box || !finParts) return;
  const q = (finParts.q||'').toLowerCase();
  const rows = finParts.rows.filter(r=>!q || [r.name, r.detail, r.status].join(' ').toLowerCase().includes(q)).concat(q ? [] : [finParts.un]);
  const cols = finPartsCols();
  const sum = k=>finRound(rows.reduce((t,r)=>t+(Number(r[k])||0), 0));
  box.innerHTML = `<div class="finreptbl-wrap"><table class="fincosttbl finreptbl finparts">
    <thead><tr>${cols.map(c=>`<th class="${c.money?'num':''}">${escapeHtml(c.l)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r=>`<tr class="click ${r.id==='none'?'finparts-un':''}" onclick="go('#/site/${finParts.siteId}/finance/costs?sub=${r.id}')">${cols.map((c,i)=>i===0
      ? `<td class="d" data-l="${escapeHtml(c.l)}"><b>${escapeHtml(r.name)}</b>${r.detail||r.status?`<em class="finparts-s">${escapeHtml([r.detail, r.status].filter(Boolean).join(' · '))}</em>`:''}</td>`
      : c.k==='value' && finParts.editValues && r.id!=='none' && finParts.rows.includes(r) ? `<td class="num" data-l="Value" onclick="event.stopPropagation()"><input type="text" inputmode="decimal" data-money class="finvalin" placeholder="£ value" value="${r.value!=null?r.value:''}" onchange="setFinSubValue('${finParts.siteId}','${r.id}',this.value)"></td>`
      : `<td class="num" data-l="${escapeHtml(c.l)}" ${c.k==='margin' && Number(r[c.k])<0?'style="color:var(--red);"':''}>${r[c.k]==null ? '—' : (Number(r[c.k]) ? finMoney(r[c.k]) : '<span class="stub">–</span>')}</td>`).join('')}</tr>`).join('')}</tbody>
    <tfoot><tr>${cols.map((c,i)=>`<td class="${c.money?'num':''}">${i===0 ? 'Total' : finMoney(sum(c.k))}</td>`).join('')}</tr></tfoot>
  </table></div>`;
};
window.finPartsExport = function(kind){
  const s = SITES.find(x=>x.id===finParts.siteId) || {};
  const cols = finPartsCols().map(c=>c.k==='name' ? c : c);
  const rows = finParts.rows.concat([finParts.un]).map(r=>Object.assign({}, r, {name:r.name+(r.detail?' — '+r.detail:'')}));
  const totals = {}; cols.filter(c=>c.money).forEach(c=>totals[c.k] = true);
  return finExportTable(kind, {title:'Costs by '+(finParts.isRepair?'repair job':'plot / address'), subtitle:(s.job_number?s.job_number+' · ':'')+(s.name||''), cols, rows, totals, name:'Costs by '+(finParts.isRepair?'repair job':'plot')+' - '+(s.job_number||s.name||'')});
};
