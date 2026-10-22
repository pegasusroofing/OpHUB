/* ============================================================
   Yard stock (21 Oct 2026, Andy).
   A list of materials held in the yard (item, unit, qty in the yard,
   minimum level, location) that can be issued to jobs.
     • Finance › Purchases › Yard stock — the full list with rates and stock
       value; add items, book stock in, issue to a job, take returns, adjust.
     • Projects › Material Requests (PMs / admins) — "📦 Yard stock" to see
       what's in the yard (no rates) and issue to this project, and
       "From yard stock" on a request line to fill it from the yard.
   Tables: yard_stock (org can read; managers / finance edit),
   yard_stock_rates (finance only), yard_moves (in / issue / return / adjust).
   A database trigger (yard_move_apply) keeps the qty right and, when an
   item with a rate is issued to (or returned from) a job, adds the cost to
   that job's costs (fin_job_costs, "Yard stock: …").
   ============================================================ */
const YARD_CATS = ['Slates & tiles','Membranes & felt','Timber & battens','Lead & metals','Insulation','Fixings','Sealants & adhesives','Rainwater goods','Safety & PPE','Tools & sundries','Other'];
const YARD_KIND = {in:'Booked in', issue:'Issued', return:'Returned', adjust:'Count adjusted'};
let yardCache = null;
async function yardLoad(force){
  if(yardCache && !force && Date.now()-yardCache.at < 15000) return yardCache;
  const fin = typeof isFinanceUser==='function' && isFinanceUser();
  const [items, rates] = await Promise.all([
    dbSelect('yard_stock', 'org_id=eq.'+ME.org_id+'&order=item.asc&limit=3000').catch(()=>[]),
    fin ? dbSelect('yard_stock_rates', 'org_id=eq.'+ME.org_id+'&limit=3000').catch(()=>[]) : Promise.resolve([]),
  ]);
  const rateBy = {}; rates.forEach(r=>{ rateBy[r.stock_id] = r.rate; });
  yardCache = {items, rateBy, fin, at:Date.now()};
  return yardCache;
}
const yardQty = n=>{ const v = Number(n||0); return (Math.round(v*100)/100).toLocaleString('en-GB'); };
const yardLow = s=>s.min_qty!=null && Number(s.qty||0) <= Number(s.min_qty);
function yardCanEdit(){ return !!ME && (['pm','admin'].includes(ME.role) || (ME.role==='superadmin' && ME.view_as_org_id) || (typeof isFinanceUser==='function' && isFinanceUser())); }
// "2 rolls" → 2, "1.5" → 1.5; null if no number
function yardNum(t){ const m = String(t==null?'':t).replace(/,/g,'').match(/-?\d+(?:\.\d+)?/); return m ? Number(m[0]) : null; }

/* ================= Finance › Purchases › Yard stock ================= */
(function(){
  if(typeof FIN_SUBS==='undefined') return;
  const i = FIN_SUBS.purchases.findIndex(t=>t[0]==='statements');
  FIN_SUBS.purchases.splice(i+1, 0, ['yard','Yard stock','#/finance/purchases/yard']);
  const base = renderFinPurchases;
  renderFinPurchases = function(sub){ if(sub==='yard') return renderFinYard(); return base.apply(this, arguments); };
})();
let finYardF = 'all', finYardCat = '';
async function renderFinYard(){
  if(!finGuard()) return;
  const __gen = RENDER_GEN;
  const Y = await yardLoad(true);
  if(__gen !== RENDER_GEN) return;
  const act = Y.items.filter(s=>s.active!==false);
  const F = {all:s=>s.active!==false, low:s=>s.active!==false && yardLow(s), off:s=>s.active===false};
  if(!F[finYardF]) finYardF = 'all';
  let list = Y.items.filter(F[finYardF]); if(finYardCat) list = list.filter(s=>s.category===finYardCat);
  const val = s=>Y.rateBy[s.id]!=null ? Number(Y.rateBy[s.id])*Number(s.qty||0) : 0;
  const total = act.reduce((t,s)=>t+val(s),0);
  const cats = Array.from(new Set(Y.items.map(s=>s.category).filter(Boolean))).sort();
  document.getElementById('app').innerHTML = shell(`${finSectionNav('purchases')}${finSubTabs('purchases','yard')}
    ${finSecHead('Yard stock', '+ New item', "yardItemOpen('')")}
    <p class="stub" style="margin:-4px 0 8px;">Materials held in the yard. Issue them to a job and the cost goes on that job (qty × rate). PMs can see the list and issue to their projects from Material Requests, but don’t see rates.</p>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin:0 0 10px;"><button class="ghostbtn finsmall" style="width:auto;margin:0;" onclick="yardMoveOpen('in','')">⬇ Book stock in</button><button class="ghostbtn finsmall" style="width:auto;margin:0;" onclick="yardMoveOpen('issue','')">⬆ Issue to a job</button><button class="ghostbtn finsmall" style="width:auto;margin:0;" onclick="yardMoveOpen('return','')">↩ Return from a job</button></div>
    <div class="pmchips">${[['all','In use'],['low','Low stock'],['off','Not stocked']].map(([k,l])=>finChip(finYardF===k, l, Y.items.filter(F[k]).length, `finYardF='${k}';render()`)).join('')}</div>
    ${cats.length ? `<div class="finjobfilt"><label>Category<select onchange="finYardCat=this.value;render()"><option value="">All</option>${cats.map(c=>`<option ${finYardCat===c?'selected':''}>${escapeHtml(c)}</option>`).join('')}</select></label></div>` : ''}
    ${finSearchHtml('Search item or location', 'finYardList')}
    <div id="finYardList">${list.length ? `<div class="finreptbl-wrap"><table class="fincosttbl fininvtbl">
      <thead><tr><th>Item</th><th>Category</th><th>Location</th><th class="num">In yard</th><th class="num">Min</th><th class="num">Rate</th><th class="num">Value</th><th></th></tr></thead>
      <tbody>${list.map(s=>`<tr class="click" data-lf="${lfText([s.item, s.category, s.location].join(' '))}" onclick="yardItemOpen('${s.id}')">
        <td data-l="Item" class="d"><b>${escapeHtml(s.item)}</b></td><td data-l="Category">${escapeHtml(s.category||'—')}</td><td data-l="Location">${escapeHtml(s.location||'—')}</td>
        <td data-l="In yard" class="num"><b class="${yardLow(s)?'finbad':''}">${yardQty(s.qty)}</b> ${escapeHtml(s.unit||'')}</td>
        <td data-l="Min" class="num">${s.min_qty!=null?yardQty(s.min_qty):'—'}</td>
        <td data-l="Rate" class="num">${Y.rateBy[s.id]!=null?finMoney(Y.rateBy[s.id])+(s.unit?' / '+escapeHtml(s.unit):''):'<span class="finpill warn">No rate</span>'}</td>
        <td data-l="Value" class="num">${val(s)?finMoney(val(s)):'—'}</td>
        <td data-l="">${yardLow(s)?'<span class="finpill bad">Low</span>':''}<button class="ghostbtn finsmall" style="width:auto;margin:0 0 0 6px;" onclick="event.stopPropagation();yardMoveOpen('issue','${s.id}')">Issue</button></td></tr>`).join('')}</tbody>
      <tfoot><tr><td class="d" colspan="6">${list.length} item${list.length===1?'':'s'}</td><td class="num">${finMoney(list.reduce((t,s)=>t+val(s),0))}</td><td></td></tr></tfoot></table></div>
      <div class="empty lf-empty" style="display:none;">Nothing matches.</div>` : `<div class="empty">${finYardF==='low'?'Nothing is below its minimum level.':'No yard stock yet — add the first item.'}</div>`}</div>
    <p class="stub" style="margin:8px 0 0;font-style:normal;">Stock value ${finMoney(total, 0)} (items with a rate).</p>`,
    {title:'Purchases', subtitle:'OpHUB Finance · money out', back:finSecBack(), tabs:false});
}

/* ================= one item: details, rate, history ================= */
window.yardItemOpen = async function(id){
  const Y = await yardLoad(true);
  const s = id ? (Y.items.find(x=>x.id===id) || {}) : {};
  const moves = id ? await dbSelect('yard_moves', 'stock_id=eq.'+id+'&order=created_at.desc&limit=50').catch(()=>[]) : [];
  if(moves.length) await loadAllProfiles();
  let ov = document.getElementById('yardOverlay');
  if(!ov){ ov = document.createElement('div'); ov.id = 'yardOverlay'; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
  ov.onclick = e=>{ if(e.target===ov) ov.style.display='none'; };
  const v = x=>escapeHtml(x==null?'':String(x));
  const job = sid=>{ const st = SITES.find(x=>x.id===sid); return st ? (st.job_number?st.job_number+' · ':'')+st.name : ''; };
  ov.innerHTML = `<div class="geo-modal-card yard-card">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;"><h3 style="margin:0;">${id?escapeHtml(s.item):'New yard stock item'}</h3><button class="ghostbtn finsmall" style="width:auto;margin:0;" onclick="document.getElementById('yardOverlay').style.display='none'">✕</button></div>
    ${id ? `<div class="yard-qtybox ${yardLow(s)?'low':''}"><b>${yardQty(s.qty)} ${escapeHtml(s.unit||'')}</b><span>in the yard${s.min_qty!=null?' · minimum '+yardQty(s.min_qty):''}${yardLow(s)?' · <b>low stock</b>':''}</span></div>
      <div class="yard-acts"><button class="ghostbtn finsmall" onclick="yardMoveOpen('in','${id}')">⬇ Book in</button><button class="ghostbtn finsmall" onclick="yardMoveOpen('issue','${id}')">⬆ Issue to a job</button><button class="ghostbtn finsmall" onclick="yardMoveOpen('return','${id}')">↩ Return</button><button class="ghostbtn finsmall" onclick="yardMoveOpen('adjust','${id}')">± Adjust count</button></div>` : ''}
    <div class="fingrid2">
      <div class="formfield"><label class="field-label">Item *</label><input type="text" id="ydItem" value="${v(s.item)}" placeholder="e.g. Code 4 lead 300mm"></div>
      <div class="formfield"><label class="field-label">Unit</label><input type="text" id="ydUnit" value="${v(s.unit)}" placeholder="e.g. roll, m, box, each" list="ydUnits"><datalist id="ydUnits">${['each','box','roll','m','m²','pack','bag','tube','sheet','length','pallet','kg'].map(u=>`<option value="${u}">`).join('')}</datalist></div>
      <div class="formfield"><label class="field-label">Category</label><input type="text" id="ydCat" value="${v(s.category)}" list="ydCats"><datalist id="ydCats">${YARD_CATS.map(c=>`<option value="${escapeHtml(c)}">`).join('')}</datalist></div>
      <div class="formfield"><label class="field-label">Location in the yard</label><input type="text" id="ydLoc" value="${v(s.location)}" placeholder="e.g. Rack B, container 2"></div>
      ${id ? '' : `<div class="formfield"><label class="field-label">Qty in the yard now</label><input type="text" inputmode="decimal" id="ydQty" placeholder="0"></div>`}
      <div class="formfield"><label class="field-label">Minimum level (low-stock alert)</label><input type="text" inputmode="decimal" id="ydMin" value="${s.min_qty!=null?s.min_qty:''}" placeholder="Optional"></div>
      ${Y.fin ? `<div class="formfield"><label class="field-label">Rate £ per ${escapeHtml(s.unit||'unit')} (Finance only)</label><input type="text" inputmode="decimal" data-money id="ydRate" value="${id && Y.rateBy[id]!=null?Y.rateBy[id]:''}"></div>` : ''}
    </div>
    <div class="formfield"><label class="field-label">Notes</label><textarea id="ydNotes" rows="2">${v(s.notes)}</textarea></div>
    ${id ? `<label style="display:flex;align-items:center;gap:8px;margin:0 0 10px;font-size:13.5px;"><input type="checkbox" id="ydOff" ${s.active===false?'checked':''} style="width:auto;"> No longer stocked (hide from lists)</label>` : ''}
    <button class="darkbtn" onclick="yardItemSave('${id||''}')">${id?'Save':'Add item'}</button>
    ${moves.length ? `<p class="sectiontitle" style="margin:14px 0 6px;">History</p><div class="yard-hist">${moves.map(m=>`<div><span>${finDate(String(m.created_at).slice(0,10))}</span><b>${YARD_KIND[m.kind]||m.kind} ${m.kind==='adjust'&&Number(m.qty)>0?'+':''}${yardQty(m.qty)}</b><span>${escapeHtml(job(m.site_id) || m.note || '')}</span><em>${escapeHtml((PROFILES[m.created_by]||{}).name||'')}</em></div>`).join('')}</div>` : ''}
  </div>`;
  ov.style.display = 'flex';
};
let yardItemBusy = false;
window.yardItemSave = async function(id){
  const item = finVal('ydItem'); if(!item){ toast('Enter the item.'); return; }
  const num = x=>{ const t = String(x||'').trim(); if(!t) return null; const n = Number(t.replace(/[£,\s]/g,'')); return isNaN(n) ? NaN : n; };
  const min = num(finVal('ydMin')); if(Number.isNaN(min)){ toast('Minimum must be a number.'); return; }
  const rEl0 = document.getElementById('ydRate');
  const rate0 = rEl0 ? num(rEl0.value) : null; if(Number.isNaN(rate0)){ toast('Rate must be a number.'); return; }
  const q0 = id ? null : num(finVal('ydQty')); if(Number.isNaN(q0)){ toast('Qty must be a number.'); return; }
  if(yardItemBusy) return; yardItemBusy = true;
  try{
  const row = {item, unit:finVal('ydUnit')||null, category:finVal('ydCat')||null, location:finVal('ydLoc')||null, min_qty:min, notes:finVal('ydNotes')||null, updated_at:new Date().toISOString()};
  if(id){ const off = document.getElementById('ydOff'); row.active = !(off && off.checked); }
  let rec;
  if(id) rec = await dbUpdate('yard_stock', id, row);
  else { const ins = await dbInsert('yard_stock', Object.assign({org_id:ME.org_id, created_by:ME.id, qty:0}, row)); rec = ins && ins[0]; }
  if(!rec) return;
  let warn = '';
  if(rEl0){ const res = await sbFetch('/rest/v1/yard_stock_rates?on_conflict=stock_id', {method:'POST', headers:{'Prefer':'resolution=merge-duplicates'}, body:JSON.stringify({stock_id:rec.id, org_id:ME.org_id, rate:rate0, updated_at:new Date().toISOString(), updated_by:ME.id})}); if(!res.ok) warn = ' — but the rate didn’t save'; }
  if(!id && q0){ const mv = await dbInsert('yard_moves', {org_id:ME.org_id, stock_id:rec.id, kind:'in', qty:Math.abs(q0), note:'Opening stock', created_by:ME.id}); if(!mv) warn += ' — the opening qty didn’t save, book it in'; }
  document.getElementById('yardOverlay').style.display = 'none';
  yardCache = null; await yardLoad(true); toast((id ? 'Saved' : 'Added to yard stock')+warn);
  const pm = document.getElementById('yardPmOverlay');
  if(pm && pm.style.display!=='none' && pm.dataset.site) yardPmOpen(pm.dataset.site); else render();
  } finally { yardItemBusy = false; }
};

/* ================= book in / issue / return / adjust ================= */
let yardMove = null;
window.yardMoveOpen = async function(kind, stockId, siteId, materialId){
  const Y = await yardLoad(true);
  const items = Y.items.filter(s=>s.active!==false);
  if(!items.length){ toast('Add a yard stock item first.'); if(yardCanEdit()) yardItemOpen(''); return; }
  let mat = null;
  if(materialId) mat = (await dbSelect('materials', 'id=eq.'+materialId+'&select=id,item,qty,site_id'))[0] || null;
  let pick = stockId;
  if(!pick && mat){ // best guess from the request's wording
    const words = String(mat.item||'').toLowerCase().split(/[^a-z0-9]+/).filter(w=>w.length>2);
    let best = null, bestN = 0; items.forEach(s=>{ const n = words.filter(w=>String(s.item).toLowerCase().includes(w)).length; if(n>bestN){ bestN = n; best = s; } });
    if(best) pick = best.id;
  }
  yardMove = {kind, materialId:materialId||null, siteId:siteId || (mat && mat.site_id) || ''};
  const live = SITES.filter(s=>typeof finSiteStatus!=='function' || finSiteStatus(s)!=='closed').slice().sort((a,b)=>String(b.job_number||'').localeCompare(String(a.job_number||''), undefined, {numeric:true}));
  const qty0 = mat && /^\s*\d+(\.\d+)?\s*[a-z]*\s*$/i.test(String(mat.qty||'')) ? String(yardNum(mat.qty)) : '';
  const title = {in:'Book stock into the yard', issue:'Issue from the yard to a job', return:'Return to the yard from a job', adjust:'Adjust the yard count'}[kind];
  let ov = document.getElementById('yardMoveOverlay');
  if(!ov){ ov = document.createElement('div'); ov.id = 'yardMoveOverlay'; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
  ov.onclick = e=>{ if(e.target===ov) ov.style.display='none'; };
  ov.innerHTML = `<div class="geo-modal-card">
    <h3>${title}</h3>
    ${mat ? `<p class="stub" style="margin:0 0 10px;font-style:normal;">For the request: <b>${escapeHtml(mat.item)}</b> × ${escapeHtml(mat.qty||'1')}</p>` : ''}
    <div class="formfield"><label class="field-label">Item</label><select id="ymItem" onchange="yardMovePaintQty()">${items.map(s=>`<option value="${s.id}" ${s.id===pick?'selected':''}>${escapeHtml(s.item)} — ${yardQty(s.qty)} ${escapeHtml(s.unit||'')} in yard${yardLow(s)?' (low)':''}</option>`).join('')}</select></div>
    <div class="fingrid2">
      <div class="formfield"><label class="field-label">${kind==='adjust'?'Counted qty (what’s actually there)':'Qty'}</label><input type="text" inputmode="decimal" id="ymQty" value="${escapeHtml(qty0)}"></div>
      ${kind==='issue'||kind==='return' ? `<div class="formfield"><label class="field-label">Job</label><select id="ymSite"><option value="">Choose…</option>${live.map(s=>`<option value="${s.id}" ${s.id===yardMove.siteId?'selected':''}>${escapeHtml((s.job_number?s.job_number+' · ':'')+s.name)}</option>`).join('')}</select></div>` : '<div></div>'}
    </div>
    <p class="stub" id="ymInfo" style="margin:0 0 8px;font-style:normal;"></p>
    <div class="formfield"><label class="field-label">Note (optional)</label><input type="text" id="ymNote" placeholder="${kind==='in'?'e.g. delivery from SIG, leftover from 2653':'e.g. collected by Sam'}"></div>
    <button class="darkbtn" id="ymGo" onclick="yardMoveSave()">${{in:'Book in', issue:'Issue to job', return:'Return to yard', adjust:'Save count'}[kind]}</button>
    <button class="geo-modal-cancel" onclick="document.getElementById('yardMoveOverlay').style.display='none'">Cancel</button>
  </div>`;
  ov.style.display = 'flex'; yardMovePaintQty();
};
window.yardMovePaintQty = function(){
  const el = document.getElementById('ymInfo'); if(!el || !yardCache) return;
  const s = yardCache.items.find(x=>x.id===finVal('ymItem')); if(!s) return;
  const r = yardCache.rateBy[s.id];
  el.innerHTML = `${yardQty(s.qty)} ${escapeHtml(s.unit||'')} in the yard${s.location?' · '+escapeHtml(s.location):''}${yardCache.fin ? (r!=null?` · ${finMoney(r)} per ${escapeHtml(s.unit||'unit')} — goes on the job’s costs`:' · <span class="finbad">no rate set, so no cost goes on the job</span>') : ''}`;
};
window.yardMoveSave = async function(){
  const M = yardMove; if(!M) return;
  const stockId = finVal('ymItem'); const s = yardCache && yardCache.items.find(x=>x.id===stockId); if(!s) return;
  const q = yardNum(finVal('ymQty'));
  if(q==null || !(q >= 0) || (M.kind!=='adjust' && !q)){ toast('Enter the qty as a number.'); return; }
  if(M.kind==='adjust'){ const fresh = (await dbSelect('yard_stock', 'id=eq.'+stockId+'&select=qty').catch(()=>[]))[0]; if(fresh) s.qty = fresh.qty; }
  const site = (M.kind==='issue'||M.kind==='return') ? finVal('ymSite') : null;
  if((M.kind==='issue'||M.kind==='return') && !site){ toast('Choose the job.'); return; }
  if(M.kind==='issue' && q > Number(s.qty||0) && !(await customConfirm(`Only ${yardQty(s.qty)} ${s.unit||''} showing in the yard. Issue ${yardQty(q)} anyway? (The count will go below zero — adjust it after.)`))) return;
  const qty = M.kind==='adjust' ? finRound(q - Number(s.qty||0)) : q;
  if(M.kind==='adjust' && !qty){ toast('That’s the same as the current count.'); return; }
  const btn = document.getElementById('ymGo'); if(btn){ btn.disabled = true; btn.textContent = 'Saving…'; }
  const ins = await dbInsert('yard_moves', {org_id:ME.org_id, stock_id:stockId, kind:M.kind, qty, site_id:site, material_id:M.materialId, note:finVal('ymNote')||null, created_by:ME.id});
  if(!ins){ if(btn){ btn.disabled = false; } return; }
  if(M.materialId){
    const note = `From yard: ${yardQty(q)} ${s.unit||''} ${s.item}`.replace(/\s+/g,' ').trim();
    await dbUpdate('materials', M.materialId, {status:'closed', merchant:'Yard stock', sent_at:new Date().toISOString(), order_note:note});
  }
  document.getElementById('yardMoveOverlay').style.display = 'none';
  const yo = document.getElementById('yardOverlay'); if(yo) yo.style.display = 'none';
  const yp = document.getElementById('yardPmOverlay'); if(yp) yp.style.display = 'none';
  yardCache = null;
  const after = Number(s.qty||0) + (M.kind==='issue' ? -q : M.kind==='adjust' ? qty : q);
  toast(`${YARD_KIND[M.kind]} — ${yardQty(after)} ${s.unit||''} now in the yard${s.min_qty!=null && after<=Number(s.min_qty)?' (low stock)':''}`);
  render();
};

/* ================= Projects side: Material Requests ================= */
(function(){
  if(typeof matTopTabsHtml!=='function') return;
  const base = matTopTabsHtml;
  matTopTabsHtml = function(siteId, active, collectN){
    let h = base.apply(this, arguments);
    if(yardCanEdit()) h = h.replace(/<\/div>\s*$/, `<div class="filterchip yardchip" onclick="yardPmOpen('${siteId}')">📦 Yard stock</div></div>`);
    return h;
  };
})();
window.yardPmOpen = async function(siteId){
  const Y = await yardLoad(true);
  const items = Y.items.filter(s=>s.active!==false);
  const site = SITES.find(x=>x.id===siteId);
  let ov = document.getElementById('yardPmOverlay');
  if(!ov){ ov = document.createElement('div'); ov.id = 'yardPmOverlay'; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
  ov.onclick = e=>{ if(e.target===ov) ov.style.display='none'; };
  ov.dataset.site = siteId;
  ov.innerHTML = `<div class="geo-modal-card yard-card">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;"><h3 style="margin:0;">📦 Yard stock</h3><button class="ghostbtn finsmall" style="width:auto;margin:0;" onclick="document.getElementById('yardPmOverlay').style.display='none'">✕</button></div>
    <p class="stub" style="margin:4px 0 10px;">What’s in the yard. Tap Issue to send it to ${escapeHtml(site?site.name:'this project')}.</p>
    <div class="yard-sbtns">${yardCanEdit()?`<button type="button" class="yard-sbtn" onclick="yardItemOpen('')">+ New item</button><button type="button" class="yard-sbtn" onclick="yardMoveOpen('in','')">⬇ Book in</button><button type="button" class="yard-sbtn" onclick="yardMoveOpen('return','','${siteId}')">↩ Return from this job</button>`:''}</div>
    <input type="text" class="yard-search" placeholder="Search the yard" oninput="liveFilter(this.value,'#yardPmList')">
    <div id="yardPmList" class="yard-pmlist">${items.length ? items.map(s=>`<div class="yard-pmrow" data-lf="${lfText([s.item, s.category, s.location].join(' '))}">
      <div class="yard-pmname"><b>${escapeHtml(s.item)}</b>${s.category||s.location?`<span>${escapeHtml([s.category, s.location].filter(Boolean).join(' · '))}</span>`:''}</div>
      <div class="yard-pmq ${yardLow(s)?'low':''}" title="In the yard">${yardQty(s.qty)} ${escapeHtml(s.unit||'')}${yardLow(s)?' · low':''}</div>
      <input type="text" inputmode="decimal" class="yard-qin" id="yq-${s.id}" placeholder="Qty" onkeydown="if(event.key==='Enter')yardQuickIssue('${s.id}','${siteId}')">
      <button type="button" class="yard-sbtn dark" onclick="yardQuickIssue('${s.id}','${siteId}')">Issue</button></div>`).join('') : '<div class="empty">Nothing in the yard list yet.</div>'}<div class="empty lf-empty" style="display:none;">Nothing matches.</div></div>
  </div>`;
  ov.style.display = 'flex';
};

let yardQuickBusy = false;
window.yardQuickIssue = async function(stockId, siteId){
  if(yardQuickBusy) return;
  const el = document.getElementById('yq-'+stockId); const q = yardNum(el && el.value);
  if(!(q > 0)){ toast('Enter the qty to issue.'); if(el) el.focus(); return; }
  const Y = await yardLoad();
  const s = Y.items.find(x=>x.id===stockId); if(!s){ toast('That item has gone — refresh the list.'); return; }
  yardQuickBusy = true;
  if(q > Number(s.qty||0) && !(await customConfirm(`Only ${yardQty(s.qty)} ${s.unit||''} showing in the yard. Issue ${yardQty(q)} anyway?`))){ yardQuickBusy = false; return; }
  document.querySelectorAll('#yardPmList .yard-sbtn').forEach(b=>b.disabled = true);
  let ins; try{ ins = await dbInsert('yard_moves', {org_id:ME.org_id, stock_id:stockId, kind:'issue', qty:q, site_id:siteId, created_by:ME.id}); } finally { yardQuickBusy = false; }
  if(!ins){ document.querySelectorAll('#yardPmList .yard-sbtn').forEach(b=>b.disabled = false); return; }
  toast(`Issued ${yardQty(q)} ${s.unit||''} ${s.item}`.replace(/\s+/g,' '));
  yardCache = null; yardPmOpen(siteId);
};

(function(){
  const css = `.yard-card{max-width:620px;width:100%;max-height:90vh;overflow:auto;}
  .yard-qtybox{display:flex;align-items:baseline;gap:8px;background:#eefaf1;border:1px solid #9fd9ae;border-radius:10px;padding:10px 12px;margin:10px 0;}
  .yard-qtybox b{font-size:20px;} .yard-qtybox span{font-size:13px;color:var(--slate);}
  .yard-qtybox.low{background:#fdecec;border-color:#f3b4b4;}
  .yard-acts{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 12px;} .yard-acts .ghostbtn{width:auto;margin:0;}
  .yard-hist{border:1px solid var(--line);border-radius:10px;overflow:hidden;}
  .yard-hist > div{display:grid;grid-template-columns:90px 130px 1fr auto;gap:8px;padding:7px 10px;border-bottom:1px solid var(--line);font-size:12.5px;align-items:center;}
  .yard-hist > div:last-child{border-bottom:0;} .yard-hist em{color:var(--slate);font-style:normal;}
  .yard-pmlist{border:1px solid var(--line);border-radius:10px;overflow:hidden;max-height:60vh;overflow-y:auto;}
  .yard-sbtns{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 8px;}
  .yard-sbtn{all:unset;box-sizing:border-box;cursor:pointer;font-size:12px;font-weight:700;line-height:1;padding:6px 10px;border-radius:7px;border:1px solid var(--line);background:#fff;color:var(--ink);white-space:nowrap;text-transform:none;letter-spacing:0;}
  .yard-sbtn:hover{border-color:#c9ced6;}
  .yard-sbtn.dark{background:var(--brand1,#E3262E);border-color:var(--brand1,#E3262E);color:#fff;}
  .yard-search{width:100%;box-sizing:border-box;padding:6px 10px;font-size:13px;border:1px solid var(--line);border-radius:8px;margin:0 0 8px;min-height:0;height:32px;}
  .yard-qin{width:64px;flex:0 0 64px;box-sizing:border-box;padding:4px 6px;font-size:12.5px;border:1px solid var(--line);border-radius:7px;text-align:center;min-height:0 !important;height:28px !important;margin:0;}
  .yard-pmname{flex:1;min-width:0;display:flex;flex-direction:column;}
  .yard-pmname b{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .yard-pmrow{display:flex;align-items:center;gap:8px;padding:5px 10px;border-bottom:1px solid var(--line);background:#fff;}
  .yard-pmrow:last-of-type{border-bottom:0;}
  .yard-pmrow span{font-size:11px;color:var(--slate);line-height:1.25;}
  .yard-pmq{font-weight:700;font-size:12.5px;white-space:nowrap;text-align:right;color:var(--slate);} .yard-pmq.low{color:#b42318;}
  .yard-card .ghostbtn.finsmall, .yard-acts .ghostbtn{font-size:12px !important;padding:6px 10px !important;text-transform:none !important;letter-spacing:0 !important;min-height:0 !important;height:auto !important;border-radius:7px !important;width:auto !important;}
  #yardMoveOverlay .darkbtn, .yard-card > .darkbtn{text-transform:none;letter-spacing:0;font-size:13.5px;padding:9px 12px;min-height:0;}
  .finpill.bad{background:#fdecec;color:#b42318;}
  .filterchip.yardchip{margin-left:auto;}
  @media (max-width:600px){ .filterrow .filterchip.yardchip{flex:1 0 100%;margin:4px 0 0;} }
  #confirmModalOverlay{z-index:10050 !important;}
  @media (max-width:600px){ .yard-hist > div{grid-template-columns:80px 1fr;} }`;
  try{ const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); }catch(e){}
})();
