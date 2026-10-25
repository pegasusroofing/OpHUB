/* ============================================================
   Materials ⇄ Finance purchase orders (25 Oct 2026, Andy chose these from the
   Projects ⇄ Finance map, stage 5 "Materials & orders"):
   1. A request that's on a sent PO is locked in Projects — no edit, cancel,
      delete or re-send ("Changes are made in Finance"). Finance users get
      "Open the PO". In Finance, cancelling a PO or removing a line from it
      marks the linked request(s) cancelled, so the site's list stays right.
   2. Goods received with a problem tells Finance (fin_flag_grn_problem: the
      PO's supplier invoices go on query and every Finance user gets a
      "Delivery problem" message).
   3. Managers see "Ordered By The Office" on the job's Materials screen
      (site_office_orders, no prices). Everyone on the job sees the delivery /
      collection dates on the job calendar (site_delivery_dates — supplier
      only, no PO numbers, values or items); managers also on the
      all-projects calendar. Operatives and drivers never see POs.
   4. A driver collection booked from an order remembers the requests and PO
      (delivery_tasks.material_ids / po_id). When the driver completes it, the
      goods are marked received with the driver's photos.
   5. Finance PO PDFs are filed in the job's Material PO's › "Finance POs"
      folder, with the required-by date as the delivery date.
   6. A supplier invoice put on query messages the job's PM; the PM answers
      from a small pop-up (fin_pi_query_view / fin_pi_query_reply). Finance
      sees the conversation on the invoice and can reply too.
   7. The note on a material order is kept on its PO.
   The database pieces are added separately. Anything not there yet is
   skipped quietly (no section, no error).
   ============================================================ */

/* ---------- small helpers ---------- */
function mplId(x){ return String(x==null ? '' : x).replace(/[^A-Za-z0-9_-]/g, ''); }
function mplIsUuid(x){ return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(x||'')); }
function mplFin(){ return typeof isFinanceUser==='function' && isFinanceUser(); }
function mplMgr(){ return !!ME && typeof isManager==='function' && isManager(ME); }
function mplMoney(v){ if(v==null || v==='') return ''; return typeof finMoney==='function' ? finMoney(v) : '£'+Number(v).toFixed(2); }
function mplDay(d){ if(!d) return ''; const x = new Date(String(d).length===10 ? d+'T12:00:00' : d); return isNaN(x) ? '' : x.toLocaleDateString('en-GB', {weekday:'short', day:'numeric', month:'short'}); }
function mplWhen(d){ if(!d) return ''; const x = new Date(d); return isNaN(x) ? '' : x.toLocaleString('en-GB', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'}); }
// Calls a database function. {ok, data} — or {ok:false, missing:true} when it isn't there yet.
async function mplRpc(name, body){
  try{
    const res = await sbFetch('/rest/v1/rpc/'+name, {method:'POST', body:JSON.stringify(body||{})});
    if(!res.ok){
      let msg = '', code = '';
      try{ const j = await res.json(); msg = j.message || j.error || ''; code = j.code || ''; }catch(e){}
      return {ok:false, missing: res.status===404 || code==='PGRST202' || code==='42883', msg: msg || String(res.status)};
    }
    let data = null; try{ data = await res.json(); }catch(e){}
    return {ok:true, data};
  }catch(e){ return {ok:false, offline:true, msg:(e && e.message) || ''}; }
}
// Quiet writes: a side effect that fails must never show "Update failed" over the thing that worked.
async function mplPatch(table, qs, patch){
  try{
    const res = await sbFetch('/rest/v1/'+table+'?'+qs, {method:'PATCH', headers:{'Prefer':'return=representation'}, body:JSON.stringify(patch)});
    if(!res.ok){ console.warn('not saved ('+table+'):', await safeErr(res)); return null; }
    const d = await res.json().catch(()=>[]);
    return Array.isArray(d) ? d : [d];
  }catch(e){ return null; }
}
async function mplInsert(table, row){
  try{
    const res = await sbFetch('/rest/v1/'+table, {method:'POST', headers:{'Prefer':'return=representation'}, body:JSON.stringify(row)});
    if(!res.ok){ console.warn('not saved ('+table+'):', await safeErr(res)); return null; }
    return await res.json().catch(()=>null);
  }catch(e){ return null; }
}
async function mplGetOne(table, qs){
  try{
    const res = await sbFetch('/rest/v1/'+table+'?'+qs, {method:'GET'});
    if(!res.ok) return null;
    const d = await res.json();
    return Array.isArray(d) ? (d[0] || null) : d;
  }catch(e){ return null; }
}
function mplOverlay(id){
  let ov = document.getElementById(id);
  if(!ov){ ov = document.createElement('div'); ov.id = id; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
  ov.onclick = e=>{ if(e.target===ov) ov.style.display = 'none'; };
  return ov;
}

/* ============================================================
   1. Requests on a sent PO are locked in Projects
   ============================================================ */
// The first of these requests that's on a PO which has been sent (and not cancelled), or null.
async function mplLockedPo(matIds){
  const ids = Array.from(new Set((matIds||[]).map(mplId).filter(Boolean)));
  if(!ids.length) return null;
  const rows = await dbSelect('materials', 'id=in.('+ids.join(',')+')&select=*');
  const on = (rows||[]).filter(m=>m && m.status!=='cancelled' && (m.po_number || m.po_id) && (m.sent_at || m.email_sent_at || m.status==='sent' || m.status==='closed'));
  for(const m of on){
    let po = null;
    // Finance users can read the PO itself: a cancelled one doesn't lock anything, and it gives the link.
    if(mplFin()){
      if(mplIsUuid(m.po_id)) po = (await dbSelect('purchase_orders', 'id=eq.'+m.po_id+'&select=id,number,status,site_id,sent_at'))[0] || null;
      if(!po) po = (await dbSelect('purchase_orders', 'material_ids=cs.{'+mplId(m.id)+'}&order=created_at.desc&limit=1&select=id,number,status,site_id,sent_at'))[0] || null;
      if(po && po.status==='cancelled') continue;
    }
    return {number: (po && po.number) || m.po_number || '', poId: po ? po.id : (mplIsUuid(m.po_id) ? m.po_id : null), siteId: (po && po.site_id) || m.site_id, many: ids.length>1};
  }
  return null;
}
function mplLockText(L){
  return (L.many ? 'One or more of these is on PO ' : 'This is on PO ')+(L.number || '(no number)')+', which has been sent. Changes are made in Finance (it’s linked to Xero).';
}
// True (after telling them) when the action must stop.
async function mplLockStop(matIds){
  let L = null;
  try{ L = await mplLockedPo(matIds); }catch(e){ return false; }
  if(!L) return false;
  const msg = mplLockText(L);
  if(mplFin() && L.poId && L.siteId){
    if(await customConfirm(msg, {confirmLabel:'Open the PO', cancelLabel:'OK'})) go('#/site/'+L.siteId+'/finance/po/'+L.poId);
  } else customAlert(msg);
  return true;
}
window.matPoLockCheck = mplLockStop;
(function(){
  const sel = ()=>{ try{ return Array.from(selectedMaterialIds); }catch(e){ return []; } };
  const guards = {
    openMaterialEdit: a=>[a[1]], deleteMaterial: a=>[a[1]], cancelMaterial: a=>[a[1]], openReemailPrompt: a=>[a[1]],
    sendMaterialAgain: a=>[a[0]], deleteSelectedMaterials: sel, confirmSendGroupedMaterial: sel,
  };
  Object.keys(guards).forEach(name=>{
    const base = window[name];
    if(typeof base!=='function') return;
    window[name] = async function(){
      const args = arguments;
      if(await mplLockStop(guards[name](args))) return;
      return base.apply(this, args);
    };
  });
})();
// If the database refuses a change (trigger materials_po_lock) the raw error
// reached the toast as "Update failed — This item is on PO …". Show just the
// reason — and operatives / drivers never see a PO number.
(function(){
  const base = toast;
  toast = function(msg){
    try{
      const s = String(msg==null ? '' : msg), i = s.indexOf('This item is on PO');
      if(i>=0) msg = mplMgr() ? s.slice(i) : 'This has already been ordered by the office, so it can’t be changed here.';
    }catch(e){}
    return base.apply(this, [msg].concat(Array.prototype.slice.call(arguments, 1)));
  };
  window.toast = toast;
})();
// Finance: requests on a cancelled PO / a removed line are marked cancelled.
async function mplCancelMaterials(ids, poNumber){
  const clean = Array.from(new Set((ids||[]).map(mplId).filter(Boolean)));
  if(!clean.length) return 0;
  const rows = await mplPatch('materials', 'id=in.('+clean.join(',')+')&status=neq.cancelled', {status:'cancelled', cancel_reason:'Cancelled on PO '+(poNumber||'')+' in Finance', cancelled_by:ME.id});
  return rows ? rows.length : 0;
}
(function(){
  const base = window.setFinPoStatus;
  if(typeof base!=='function') return;
  window.setFinPoStatus = async function(poId, status){
    const r = await base.apply(this, arguments); // reads the tapped button straight away ("tap again to cancel")
    if(status!=='cancelled') return r;
    try{
      const po = await mplGetOne('purchase_orders', 'id=eq.'+mplId(poId)+'&select=id,number,status,material_ids');
      if(!po || po.status!=='cancelled') return r; // first tap only asked "tap again"
      const n = await mplCancelMaterials(po.material_ids || [], po.number);
      if(n) toast('PO cancelled — '+n+' site request'+(n===1?'':'s')+' marked cancelled');
    }catch(e){ console.error(e); }
    return r;
  };
})();
// PO page: "Remove lines…" on an open PO.
(function(){
  if(typeof renderFinPo!=='function') return;
  const base = renderFinPo;
  renderFinPo = async function(siteId, poId){
    const gen = RENDER_GEN;
    const r = await base.apply(this, arguments);
    try{
      if(gen!==RENDER_GEN) return r;
      const po = (await dbSelect('purchase_orders', 'id=eq.'+mplId(poId)+'&select=id,status,items'))[0];
      if(gen!==RENDER_GEN || !po || po.status!=='open' || !(po.items||[]).length) return r;
      const t = Array.from(document.querySelectorAll('#app .sectiontitle')).find(e=>e.textContent.trim()==='Items');
      if(!t || t.parentElement.querySelector('.mpl-rmlines')) return r;
      t.parentElement.insertAdjacentHTML('beforeend', `<button type="button" class="ghostbtn mpl-rmlines" style="width:100%;margin-top:10px;" onclick="mplPoRemoveLinesOpen('${jsAttr(siteId)}','${jsAttr(po.id)}')">Remove lines…</button>`);
    }catch(e){ console.error(e); }
    return r;
  };
})();
window.mplPoRemoveLinesOpen = async function(siteId, poId){
  const po = (await dbSelect('purchase_orders', 'id=eq.'+mplId(poId)))[0];
  if(!po){ toast('PO not found.'); return; }
  if(po.status!=='open'){ toast('Only an open PO can have lines taken off.'); return; }
  const items = po.items || [];
  const ov = mplOverlay('mplPoRmOverlay');
  ov.innerHTML = `<div class="geo-modal-card">
    <h3>Remove Lines From PO ${escapeHtml(po.number||'')}</h3>
    <p class="stub" style="margin:0 0 10px;font-style:normal;">Tick the lines to take off this PO. A site request on a removed line is marked cancelled (“Cancelled on PO ${escapeHtml(po.number||'')} in Finance”). Email the supplier the new PO afterwards if they need to know.</p>
    ${items.map((it,i)=>`<label class="mpl-rmrow"><input type="checkbox" data-i="${i}"><span>${escapeHtml(it.item||'Item')}${it.qty!=null && it.qty!=='' ? ' · '+escapeHtml(String(it.qty))+(it.unit?' '+escapeHtml(it.unit):'') : ''}${it.material_id ? ' <em>site request</em>' : ''}</span><b>${it.amount!=null ? mplMoney(it.amount) : ''}</b></label>`).join('')}
    <button class="darkbtn" style="width:100%;margin-top:10px;background:var(--warn);border-color:var(--warn);" id="mplPoRmGo" onclick="mplPoRemoveLines('${jsAttr(siteId)}','${jsAttr(po.id)}')">Remove ticked lines</button>
    <button class="geo-modal-cancel" onclick="document.getElementById('mplPoRmOverlay').style.display='none'">Cancel</button>
  </div>`;
  ov.style.display = 'flex';
};
let mplPoRmBusy = false;
window.mplPoRemoveLines = async function(siteId, poId){
  if(mplPoRmBusy) return;
  const idx = new Set(Array.from(document.querySelectorAll('#mplPoRmOverlay input[data-i]:checked')).map(el=>Number(el.dataset.i)));
  if(!idx.size){ toast('Tick at least one line.'); return; }
  mplPoRmBusy = true;
  try{
    const po = (await dbSelectChecked('purchase_orders', 'id=eq.'+mplId(poId))).data[0];
    if(!po){ toast('Couldn’t load the PO — check your signal and try again.'); return; }
    const items = po.items || [];
    if(idx.size >= items.length){ toast('To take every line off, cancel the PO instead.'); return; }
    if(!(await customConfirm('Take '+idx.size+' line'+(idx.size===1?'':'s')+' off PO '+(po.number||'')+'?', {confirmLabel:'Remove', danger:true}))) return;
    const keep = items.filter((_,i)=>!idx.has(i)), gone = items.filter((_,i)=>idx.has(i));
    const goneMats = gone.map(x=>x.material_id).filter(Boolean);
    const patch = {items:keep, material_ids:(po.material_ids||[]).filter(id=>!goneMats.includes(id))};
    if(po.value!=null){
      const r2 = n=>Math.round((Number(n)||0)*100)/100;
      const goneAmt = gone.reduce((t,x)=>t+(x.amount!=null ? Number(x.amount)||0 : 0), 0);
      patch.value = r2(Math.max(0, Number(po.value) - goneAmt));
      if(po.vat!=null){
        const ratio = Number(po.value) ? Number(po.vat)/Number(po.value) : 0;
        const goneVat = gone.reduce((t,x)=>t+(x.vat!=null ? Number(x.vat)||0 : (x.amount!=null ? (Number(x.amount)||0)*ratio : 0)), 0);
        patch.vat = r2(Math.max(0, Number(po.vat) - goneVat));
        patch.total = r2(patch.value + patch.vat);
      }
    }
    const row = await dbUpdate('purchase_orders', po.id, patch);
    if(!row) return;
    const n = await mplCancelMaterials(goneMats, po.number);
    document.getElementById('mplPoRmOverlay').style.display = 'none';
    toast(gone.length+' line'+(gone.length===1?'':'s')+' removed'+(n ? ' — '+n+' site request'+(n===1?'':'s')+' marked cancelled' : ''));
    render();
  } finally { mplPoRmBusy = false; }
};

/* ============================================================
   2. Goods received with a problem → Finance
   ============================================================ */
(function(){
  const base = window.saveGrn;
  if(typeof base!=='function') return;
  window.saveGrn = async function(siteId, matId){
    let wasOk = true, note = '';
    try{ wasOk = !!grnDraft.ok; note = String(grnDraft.notes||'').trim(); }catch(e){}
    const r = await base.apply(this, arguments);
    try{
      // Only after a GRN with a problem really saved (the form closes on success).
      if(wasOk || !note || grnOpenFor!==null) return r;
      const res = await mplRpc('fin_flag_grn_problem', {p_material_id: matId, p_note: note});
      if(!res.ok) return r; // not there yet — the managers' message from 726 still went
      let d = res.data; if(Array.isArray(d)) d = d[0];
      if(d && typeof d==='object' && (d.ok===false || d.po_id===null)) return r; // not on a PO: nothing for Finance
      const q = d && typeof d==='object' ? Number(d.queried!=null ? d.queried : d.invoices_queried!=null ? d.invoices_queried : d.invoices) : NaN;
      if(mplMgr()) toast('Saved — Finance has been told about the problem'+(q>0 ? ' and '+q+' supplier invoice'+(q===1?' is':'s are')+' on hold' : ''));
      else toast('Saved — the office has been told about the problem');
    }catch(e){ console.error(e); }
    return r;
  };
})();

/* ============================================================
   3a. "Ordered By The Office" on the job's Materials screen (managers only)
   ============================================================ */
function mplOfficeOrdersHtml(rows){
  const line = (it, rec)=>{
    const g = it && it.material_id && rec ? rec[it.material_id] : null;
    const tag = g ? (g.ok===false ? `<span class="opmat-pill" style="background:#FDE2E0;color:#B3261E;">⚠ Problem</span>` : `<span class="opmat-pill" style="background:#DDF3E3;color:#1E7A3C;">✓ Received</span>`)
      : `<span class="opmat-pill" style="background:#EEF0F3;color:#5B6270;">Not received</span>`;
    return `<div class="mplofc-line"><span>${escapeHtml(it.item||'Item')}${it.qty!=null && it.qty!=='' ? ` <span class="opmat-qty">× ${escapeHtml(String(it.qty))}${it.unit?' '+escapeHtml(it.unit):''}</span>` : ''}</span>${tag}</div>`;
  };
  return `<div class="card mplofc">
    <p class="sectiontitle" style="margin-top:0;">Ordered By The Office</p>
    <p class="stub" style="margin:0 0 8px;">Orders Finance has raised for this job.</p>
    ${rows.map(p=>{
      const items = Array.isArray(p.items) ? p.items : [], rec = (p.received && typeof p.received==='object') ? p.received : {};
      const coll = p.fulfilment==='collection';
      return `<div class="mplofc-po">
        <div class="mplofc-h"><b>${escapeHtml(p.number||'PO')}</b><span>${escapeHtml(p.supplier_name||'Supplier')}</span>
          <span class="opmat-pill" style="background:#E3EEFA;color:#1F5FA6;margin-left:auto;">${coll ? 'Collection' : 'Delivery'}${p.required_by ? ' '+escapeHtml(mplDay(p.required_by)) : ' date to be confirmed'}</span></div>
        ${p.sent_at ? '' : `<div class="stub" style="margin:2px 0 4px;font-size:12px;">Not sent to the supplier yet</div>`}
        ${items.length ? items.map(it=>line(it, rec)).join('') : `<div class="stub" style="margin:4px 0 0;font-size:12px;">No lines on it yet.</div>`}
      </div>`;
    }).join('')}
  </div>`;
}
(function(){
  if(typeof renderMaterials!=='function') return;
  const base = renderMaterials;
  renderMaterials = async function(siteId){
    const gen = RENDER_GEN;
    const r = await base.apply(this, arguments);
    try{
      if(!mplMgr() || gen!==RENDER_GEN) return r;
      const res = await mplRpc('site_office_orders', {p_site: siteId});
      if(gen!==RENDER_GEN || !res.ok || !Array.isArray(res.data)) return r;
      // POs raised from the Materials tile already show under Material Requests.
      const rows = res.data.filter(p=>p && p.source!=='materials' && p.status!=='cancelled');
      const grid = document.querySelector('#app .tilegrid');
      if(!rows.length || !grid || document.querySelector('#app .mplofc')) return r;
      grid.insertAdjacentHTML('afterend', mplOfficeOrdersHtml(rows));
    }catch(e){ console.error(e); }
    return r;
  };
})();

/* ============================================================
   3b. Delivery dates on the calendars — supplier only, no PO
   ============================================================ */
let mplDlvCache = {};       // site|from|to -> {at, rows}
let mplDlvMissing = false;  // site_delivery_dates isn't there yet
async function mplDeliveryRows(siteId, from, to){
  if(mplDlvMissing || !siteId) return [];
  const key = siteId+'|'+from+'|'+to, c = mplDlvCache[key];
  if(c && Date.now()-c.at < 120000) return c.rows;
  const res = await mplRpc('site_delivery_dates', {p_site: siteId, p_from: from, p_to: to});
  if(!res.ok){ if(res.missing) mplDlvMissing = true; return c ? c.rows : []; }
  const rows = Array.isArray(res.data) ? res.data : [];
  mplDlvCache[key] = {at: Date.now(), rows};
  return rows;
}
function mplDeliveryEvents(rows, siteId){
  return (rows||[]).map((r,i)=>{
    if(!r) return null;
    const date = String(r.required_by || r.delivery_date || r.event_date || r.date || '').slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const sid = r.site_id || siteId, sup = String(r.supplier_name || r.supplier || '').trim();
    return {_pseudo:'delivery', _color:'#1F5FA6', id:'dlv-'+sid+'-'+date+'-'+i, _target:sid, site_id:sid, event_date:date, is_private:false,
      title:'🚚 '+(r.fulfilment==='collection' ? 'Collection' : 'Delivery')+(sup ? ': '+sup : '')};
  }).filter(Boolean);
}
async function mplDeliveryEventsAll(from, to){
  const sites = (SITES||[]).filter(s=>{ const k = typeof siteStatusKey==='function' ? siteStatusKey(s) : 'live'; return k==='live' || k==='upcoming'; });
  const out = [];
  for(let i=0; i<sites.length && !mplDlvMissing; i+=6){
    const part = await Promise.all(sites.slice(i, i+6).map(s=>mplDeliveryRows(s.id, from, to).then(rows=>mplDeliveryEvents(rows, s.id)).catch(()=>[])));
    part.forEach(p=>out.push(...p));
  }
  return out;
}
(function(){
  const base = dbSelect;
  dbSelect = async function(table, qs){
    const rows = await base.apply(this, arguments);
    try{
      if(table!=='site_calendar_events' || !Array.isArray(rows) || !ME || mplDlvMissing) return rows;
      const from = (/event_date=gte\.(\d{4}-\d{2}-\d{2})/.exec(qs||'')||[])[1], to = (/event_date=lte\.(\d{4}-\d{2}-\d{2})/.exec(qs||'')||[])[1];
      if(!from || !to) return rows;
      const site = (/(?:^|&)site_id=eq\.([0-9a-f-]{36})/.exec(qs||'')||[])[1] || null;
      let extra = [];
      if(site) extra = mplDeliveryEvents(await mplDeliveryRows(site, from, to), site);
      else if(mplMgr()) extra = await mplDeliveryEventsAll(from, to);   // all-projects calendar: managers only
      return extra.length ? rows.concat(extra).sort((a,b)=>String(a.event_date).localeCompare(String(b.event_date))) : rows;
    }catch(e){ console.error(e); return rows; }
  };
  window.dbSelect = dbSelect;
  const op = window.openCalPseudo;
  window.openCalPseudo = function(kind, id){
    if(kind==='delivery'){ go('#/site/'+mplId(id)+'/'+(mplMgr() ? 'materials' : 'calendar')); return; }
    return op ? op.apply(this, arguments) : undefined;
  };
})();

/* ---------- 3c. drivers booking stock into the yard: no PO wording ---------- */
(function(){
  const base = window.yardBookInOpen;
  if(typeof base!=='function') return;
  window.yardBookInOpen = async function(){
    const r = await base.apply(this, arguments);
    try{
      if(mplMgr() || mplFin()) return r;
      const ov = document.getElementById('yardInOverlay'); if(!ov) return r;
      const ref = ov.querySelector('#yiRef');
      if(ref){ ref.placeholder = 'e.g. DN 55231'; const lab = ref.parentElement && ref.parentElement.querySelector('.field-label'); if(lab) lab.textContent = 'Delivery note number'; }
      // Bookings made by the office can carry a PO number as the reference — not shown to drivers.
      const walk = document.createTreeWalker(ov.querySelector('.yardin-list') || ov, NodeFilter.SHOW_TEXT);
      const hits = []; while(walk.nextNode()) hits.push(walk.currentNode);
      hits.forEach(n=>{ if(/-PO-\d+/i.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(/ · [^·]*-PO-\d+[^·]*/gi, '').replace(/[A-Z0-9]+-PO-\d+/gi, ''); });
    }catch(e){}
    return r;
  };
})();

/* ============================================================
   4. Driver collection = goods received
   ============================================================ */
// Called by 760 bookOrderCollection once the collection is on the Delivery Schedule.
async function matLinkDeliveryTask(taskId, materials, poId){
  const ids = (materials||[]).map(m=>m && mplId(m.id)).filter(Boolean);
  if(!taskId || (!ids.length && !poId)) return;
  await mplPatch('delivery_tasks', 'id=eq.'+mplId(taskId), Object.assign({material_ids: ids}, poId ? {po_id: poId} : {}));
}
window.matLinkDeliveryTask = matLinkDeliveryTask;
(function(){
  const base = window.finRaisePoForOrder;
  if(typeof base!=='function') return;
  finRaisePoForOrder = window.finRaisePoForOrder = async function(siteId, matIds, supplier, toMe, fulfil){
    const po = await base.apply(this, arguments);
    try{
      if(po && po.id && fulfil && typeof fulfil==='object'){
        fulfil.poId = po.id; // 4: the collection booked next is linked to this PO
        // 7: the order's note (branch + message) is kept on the PO — fin_raise_po is passed p_note;
        // if it didn't come back saved, put it on.
        const note = String(fulfil.note||'').trim();
        if(note && !po.note) await mplPatch('purchase_orders', 'id=eq.'+mplId(po.id), {note});
      }
    }catch(e){}
    return po;
  };
})();
async function mplGrnFromTask(taskId){
  const t = (await dbSelect('delivery_tasks', 'id=eq.'+mplId(taskId)+'&select=*'))[0];
  if(!t || t.status!=='completed') return 0;
  const ids = (Array.isArray(t.material_ids) ? t.material_ids : []).map(mplId).filter(Boolean);
  if(!ids.length) return 0;
  const who = (PROFILES[t.completed_by] && PROFILES[t.completed_by].name) || (ME && ME.name) || 'the driver';
  const photos = typeof deliveryCompletionPhotos==='function' ? deliveryCompletionPhotos(t) : [];
  const grn = {at: t.completed_at || new Date().toISOString(), by: t.completed_by || ME.id, byName: who, ok:true, notes:'Collected by '+who, photos};
  // Only the ones not already received.
  const rows = await mplPatch('materials', 'id=in.('+ids.join(',')+')&grn=is.null', {grn});
  const n = rows ? rows.length : 0;
  if(n && t.site_id) logSiteActivity(t.site_id, 'material_grn', 'Goods received: collected by '+who+' ('+n+' item'+(n===1?'':'s')+')');
  return n;
}
['markDeliveryComplete', 'completeDeliveryTask'].forEach(name=>{
  const base = window[name];
  if(typeof base!=='function') return;
  window[name] = async function(){
    const taskId = name==='markDeliveryComplete' ? arguments[0] : arguments[1];
    const r = await base.apply(this, arguments);
    try{ const n = await mplGrnFromTask(taskId); if(n) toast('Delivery marked complete — '+n+' item'+(n===1?'':'s')+' marked as received'); }catch(e){ console.error(e); }
    return r;
  };
});

/* ============================================================
   5. Finance PO PDFs filed in Material PO's › Finance POs
   ============================================================ */
let mplLastPoPdf = null; // {id, bytes} — the PDF just built, so it isn't built twice
async function mplUploadQuiet(bucket, path, blob){
  try{
    await ensureFreshToken();
    if(!SESSION || !SESSION.access_token) return false;
    const res = await fetchWithTimeout(SUPABASE_URL+'/storage/v1/object/'+bucket+'/'+path, {method:'POST',
      headers:{'apikey':SUPABASE_ANON_KEY, 'Authorization':'Bearer '+SESSION.access_token, 'Content-Type':'application/pdf', 'x-upsert':'true'}, body:blob}, 60000);
    return res.ok;
  }catch(e){ return false; }
}
async function mplFilePoPdf(po, bytes){
  const siteId = po && po.site_id;
  if(!siteId || !bytes) return false;
  const FOLDER = 'Finance POs';
  let folder = (await dbSelect('material_order_folders', 'site_id=eq.'+mplId(siteId)+'&parent_id=is.null&name=eq.'+encodeURIComponent(FOLDER)+'&select=id&limit=1'))[0];
  if(!folder){ const ins = await mplInsert('material_order_folders', {site_id:siteId, parent_id:null, name:FOLDER, created_by:ME.id}); folder = ins && ins[0]; }
  const path = mplId(siteId)+'/finance-pos/'+mplId(po.id)+'.pdf';
  if(!(await mplUploadQuiet('material-orders', path, new Blob([bytes], {type:'application/pdf'})))) return false;
  const itemId = 'finpo-'+mplId(po.id);
  const row = {name:'PO '+(po.number||'')+(po.supplier_name ? ' – '+po.supplier_name : '')+'.pdf', storage_path:path, size:bytes.byteLength || bytes.length || null,
    scheduled_delivery_date: po.required_by ? String(po.required_by).slice(0,10) : null, synced_at:new Date().toISOString()};
  const ex = (await dbSelect('material_order_files', 'site_id=eq.'+mplId(siteId)+'&item_id=eq.'+encodeURIComponent(itemId)+'&select=id&limit=1'))[0];
  const ok = ex ? await mplPatch('material_order_files', 'id=eq.'+mplId(ex.id), row)
    : await mplInsert('material_order_files', Object.assign({site_id:siteId, org_id:ME.org_id, folder_id: folder ? folder.id : null, item_id:itemId}, row));
  return !!ok;
}
(function(){
  if(typeof finBuildPoPdf!=='function' || typeof finStorePoPdf!=='function') return;
  const baseBuild = finBuildPoPdf, baseStore = finStorePoPdf;
  finBuildPoPdf = async function(po){
    const b = await baseBuild.apply(this, arguments);
    mplLastPoPdf = (b && po) ? {id:po.id, bytes:b} : null;
    return b;
  };
  finStorePoPdf = async function(po){
    const stored = await baseStore.apply(this, arguments);
    try{
      if(stored && po && mplLastPoPdf && mplLastPoPdf.id===po.id){
        const bytes = mplLastPoPdf.bytes; mplLastPoPdf = null;
        mplFilePoPdf(po, bytes).catch(e=>console.warn('PO not filed in Material PO’s', e));
      }
    }catch(e){}
    return stored;
  };
})();

/* ============================================================
   6. Supplier invoice query → the job's PM
   ============================================================ */
async function mplTellPm(pi, kind, body){
  const site = (SITES||[]).find(s=>s.id===pi.site_id);
  const pm = site && site.responsible_pm_id;
  if(!pm) return {sent:false, why:'nopm'};
  if(pm===ME.id) return {sent:false, why:'me'};
  await postSystemMessageToUser(pm, pi.site_id, kind, body, pi.id);
  return {sent:true, pm};
}
function mplPiLabel(pi){ return (pi.supplier_name || 'supplier')+' invoice'+(pi.invoice_no ? ' '+pi.invoice_no : ''); }
(function(){
  const base = window.savePurchaseInvoiceQuery;
  if(typeof base!=='function') return;
  window.savePurchaseInvoiceQuery = async function(id){
    const r = await base.apply(this, arguments);
    try{
      const pi = await mplGetOne('purchase_invoices', 'id=eq.'+mplId(id)+'&select=id,site_id,status,supplier_name,invoice_no,query_note');
      if(!pi || pi.status!=='query') return r;
      const t = await mplTellPm(pi, 'pi_query', 'Query on '+mplPiLabel(pi)+': '+(pi.query_note || 'Query'));
      if(t.sent){ await loadAllProfiles().catch(()=>{}); toast('Marked as query — sent to '+nameOf(t.pm)+' to answer'); }
      else if(t.why==='nopm') toast('Marked as query — this project has no PM set, so nobody on site was asked.');
    }catch(e){ console.error(e); }
    return r;
  };
})();
function mplThreadHtml(thread){
  const list = (Array.isArray(thread) ? thread : []).filter(x=>x && x.text);
  if(!list.length) return `<p class="stub" style="margin:0 0 8px;font-style:normal;">No replies yet.</p>`;
  return `<div class="mplpiq-thread">${list.map(x=>`<div class="mplpiq-msg ${x.by===ME.id?'me':''}"><div class="mplpiq-who">${escapeHtml(x.name || nameOf(x.by))} · ${escapeHtml(mplWhen(x.at))}</div><div class="mplpiq-txt">${escapeHtml(x.text)}</div></div>`).join('')}</div>`;
}
// PM side: the pop-up opened from the Inbox message.
window.openPiQuery = async function(piId){
  const id = mplId(piId); if(!id) return;
  const res = await mplRpc('fin_pi_query_view', {p_pi:id});
  if(!res.ok){ toast(res.missing ? 'Invoice queries aren’t switched on yet — ask the office.' : res.offline ? 'Couldn’t reach the server — check your signal.' : 'Couldn’t open the query — '+String(res.msg||'').slice(0,120)); return; }
  let d = res.data; if(Array.isArray(d)) d = d[0];
  if(!d || typeof d!=='object'){ toast('This invoice query couldn’t be found — it may have been sorted already.'); return; }
  const site = (SITES||[]).find(s=>s.id===d.site_id);
  const kv = (k, v)=> v!=null && v!=='' ? `<div class="finkv"><span>${k}</span><b style="white-space:normal;">${escapeHtml(String(v))}</b></div>` : '';
  const ov = mplOverlay('mplPiqOverlay');
  ov.innerHTML = `<div class="geo-modal-card">
    <h3 style="margin-bottom:4px;">Invoice Query</h3>
    <p class="stub" style="margin:0 0 10px;font-style:normal;">The office needs your help with this supplier invoice.</p>
    ${kv('Supplier', d.supplier_name)}${kv('Invoice no.', d.invoice_no)}${kv('Date', d.invoice_date ? (typeof finDate==='function' ? finDate(String(d.invoice_date).slice(0,10)) : d.invoice_date) : '')}
    ${kv('Project', d.site_name || (site && site.name))}${kv('PO', d.po_number)}${kv('For', d.description)}
    ${d.net!=null ? kv('Net', mplMoney(d.net)) : ''}${d.total!=null ? kv('Total', mplMoney(d.total)) : ''}
    ${d.query_note ? `<p class="stub" style="margin:10px 0;font-style:normal;color:var(--red,#B3261E);"><b>Query:</b> ${escapeHtml(d.query_note)}</p>` : ''}
    ${d.status && d.status!=='query' ? `<p class="stub" style="margin:0 0 10px;font-style:normal;color:var(--ok);">The office has sorted this one now.</p>` : ''}
    <p class="sectiontitle" style="margin:12px 0 6px;">Conversation</p>
    ${mplThreadHtml(d.query_thread)}
    <div class="formfield" style="margin-top:8px;"><label class="field-label">Your reply</label><textarea id="mplPiqText" rows="3" placeholder="e.g. Yes, 2 packs came short — the driver has the note"></textarea></div>
    <button class="darkbtn" style="width:100%;" id="mplPiqGo" onclick="mplPiqSend('${jsAttr(id)}')">Send reply</button>
    <button class="geo-modal-cancel" onclick="document.getElementById('mplPiqOverlay').style.display='none'">Close</button>
  </div>`;
  ov.style.display = 'flex';
};
let mplPiqBusy = false;
window.mplPiqSend = async function(piId){
  if(mplPiqBusy) return;
  const el = document.getElementById('mplPiqText'), text = el ? el.value.trim() : '';
  if(!text){ toast('Write a reply first.'); return; }
  mplPiqBusy = true;
  const btn = document.getElementById('mplPiqGo'); if(btn){ btn.disabled = true; btn.textContent = 'Sending…'; }
  try{
    const res = await mplRpc('fin_pi_query_reply', {p_pi: mplId(piId), p_text: text.slice(0, 2000)});
    if(!res.ok){ toast(res.missing ? 'Replies aren’t switched on yet — ask the office.' : 'Couldn’t send the reply — '+(res.offline ? 'check your signal.' : String(res.msg||'').slice(0,120))); return; }
    toast('Reply sent to the office');
    await window.openPiQuery(piId);
  } finally { mplPiqBusy = false; const b = document.getElementById('mplPiqGo'); if(b){ b.disabled = false; b.textContent = 'Send reply'; } }
};
// Finance side: the conversation under the query note on the purchase invoice, with a reply box.
(function(){
  const base = window.openPurchaseInvoiceView;
  if(typeof base!=='function') return;
  window.openPurchaseInvoiceView = async function(siteId, id){
    const r = await base.apply(this, arguments);
    try{
      const card = document.querySelector('#finPiOverlay .geo-modal-card');
      if(!card || card.querySelector('.mplpiq')) return r;
      const i = await mplGetOne('purchase_invoices', 'id=eq.'+mplId(id)+'&select=id,status,query_thread,site_id'); // null while query_thread isn't there yet
      if(!i || !document.body.contains(card) || card.querySelector('.mplpiq')) return r;
      const thread = Array.isArray(i.query_thread) ? i.query_thread : [];
      if(i.status!=='query' && !thread.length) return r;
      const site = (SITES||[]).find(s=>s.id===i.site_id), pm = site && site.responsible_pm_id;
      const html = `<div class="mplpiq">
        <p class="sectiontitle" style="margin:4px 0 6px;">Conversation With The PM${pm ? ' <span class="stub" style="text-transform:none;letter-spacing:0;font-style:normal;">('+escapeHtml(nameOf(pm))+')</span>' : ''}</p>
        ${mplThreadHtml(thread)}
        ${i.status==='query' ? (pm ? `<div class="row-gap" style="margin:6px 0 10px;"><input type="text" id="mplPiThreadText" placeholder="Reply to the PM…" style="flex:1;min-width:0;"><button class="darkbtn" style="width:auto;flex:none;" onclick="mplPiThreadSend('${jsAttr(i.id)}')">Send</button></div>`
          : `<p class="stub" style="margin:0 0 10px;font-style:normal;">This project has no PM set, so nobody on site can be asked.</p>`) : ''}
      </div>`;
      const chk = Array.from(card.querySelectorAll('p.stub')).find(p=>/^\s*Check:/.test(p.textContent));
      if(chk) chk.insertAdjacentHTML('afterend', html);
      else { const h = card.querySelector('h3'); if(h) h.insertAdjacentHTML('afterend', html); }
    }catch(e){ console.error(e); }
    return r;
  };
})();
let mplPiThreadBusy = false;
window.mplPiThreadSend = async function(piId){
  if(mplPiThreadBusy) return;
  const el = document.getElementById('mplPiThreadText'), text = el ? el.value.trim() : '';
  if(!text){ toast('Write a reply first.'); return; }
  mplPiThreadBusy = true;
  try{
    const pi = await mplGetOne('purchase_invoices', 'id=eq.'+mplId(piId)+'&select=id,site_id,supplier_name,invoice_no,query_thread');
    if(!pi){ toast('Couldn’t load the invoice — check your signal and try again.'); return; }
    const thread = (Array.isArray(pi.query_thread) ? pi.query_thread : []).concat([{by:ME.id, name:ME.name||'', at:new Date().toISOString(), text:text.slice(0,2000)}]);
    const saved = await mplPatch('purchase_invoices', 'id=eq.'+mplId(pi.id), {query_thread:thread});
    if(!saved || !saved.length){ toast('Couldn’t save the reply — try again.'); return; }
    const t = await mplTellPm(pi, 'pi_query', 'Reply on '+mplPiLabel(pi)+': '+text.slice(0,300));
    toast(t.sent ? 'Reply sent to '+nameOf(t.pm) : 'Reply saved');
    if(typeof openPurchaseInvoiceView==='function') await openPurchaseInvoiceView(pi.site_id, pi.id);
  } finally { mplPiThreadBusy = false; }
};

/* ---------- Inbox / HUB / push: the new message kinds ---------- */
const MPL_KIND_LABEL = {grn_problem:'Delivery problem', pi_query:'Invoice query', pi_query_reply:'Invoice query reply'};
window.msgExtraLabel = function(m){ return (m && MPL_KIND_LABEL[m.kind]) || ''; };
window.msgExtraClick = function(m){
  if(!m || !MPL_KIND_LABEL[m.kind]) return '';
  const site = jsAttr(mplId(m.site_id)), rel = jsAttr(mplId(m.related_id));
  if(m.kind==='grn_problem') return `mplOpenGrnProblem('${site}','${rel}')`;
  if(!m.related_id) return '';
  return m.kind==='pi_query_reply' ? `mplOpenPiForFinance('${site}','${rel}')` : `openPiQuery('${rel}')`;
};
window.mplOpenPiForFinance = async function(siteId, piId){
  if(mplFin() && typeof openPurchaseInvoiceView==='function'){
    const pi = await mplGetOne('purchase_invoices', 'id=eq.'+mplId(piId)+'&select=id,site_id');
    if(pi){ await openPurchaseInvoiceView(pi.site_id || siteId, pi.id); return; }
  }
  return window.openPiQuery(piId);
};
window.mplOpenGrnProblem = async function(siteId, relId){
  if(mplFin() && mplIsUuid(relId)){
    let po = (await dbSelect('purchase_orders', 'id=eq.'+relId+'&select=id,site_id'))[0];
    if(!po) po = (await dbSelect('purchase_orders', 'material_ids=cs.{'+relId+'}&order=created_at.desc&limit=1&select=id,site_id'))[0];
    if(po && po.site_id){ go('#/site/'+po.site_id+'/finance/po/'+po.id); return; }
  }
  if(!siteId){ toast('This delivery isn’t linked to a project.'); return; }
  if(mplMgr()){ try{ matFilter = 'ordered'; }catch(e){} go('#/site/'+siteId+'/materialrequests'); }
  else go('#/site/'+siteId+'/materials');
};
// Push tap (080): returns true when handled here.
window.msgPushOpen = function(data){
  if(!data || !MPL_KIND_LABEL[data.kind]) return false;
  const rel = data.related_id || data.task_id || '';
  const m = {kind:data.kind, site_id:data.site_id||'', related_id:rel};
  if(m.kind==='grn_problem'){ window.mplOpenGrnProblem(mplId(m.site_id), mplId(rel)); return true; }
  if(!rel) return false;
  if(m.kind==='pi_query_reply') window.mplOpenPiForFinance(mplId(m.site_id), mplId(rel)); else window.openPiQuery(rel);
  return true;
};
// HUB: unread delivery-problem / invoice-query messages sent to me (they open from the Inbox).
(function(){
  if(typeof computeHubItems!=='function') return;
  const base = computeHubItems;
  computeHubItems = async function(forcedPmId){
    const out = await base.apply(this, arguments);
    try{
      const who = forcedPmId!==undefined ? forcedPmId : (typeof hubFilterPmId!=='undefined' ? hubFilterPmId : '');
      if(who!=='' || !out || !Array.isArray(out.items)) return out;
      const since = new Date(Date.now()-90*864e5).toISOString();
      const rows = await dbSelect('messages', 'audience=eq.single&recipient_id=eq.'+ME.id+'&kind=in.(grn_problem,pi_query,pi_query_reply)&created_at=gte.'+since+'&order=created_at.desc&limit=50&select=id,site_id,kind,body,created_at');
      if(!rows.length) return out;
      const reads = await dbSelect('message_reads', 'user_id=eq.'+ME.id+'&message_id=in.('+rows.map(m=>mplId(m.id)).join(',')+')&select=message_id');
      const read = new Set(reads.map(x=>x.message_id));
      rows.filter(m=>!read.has(m.id)).forEach(m=>{
        const site = m.site_id ? (SITES||[]).find(s=>s.id===m.site_id) : null;
        out.items.push({type:'message', typeLbl:MPL_KIND_LABEL[m.kind], label:String(m.body||MPL_KIND_LABEL[m.kind]).slice(0,120), siteId:m.site_id||null, siteName: site ? site.name : 'Finance', pmId:null, dueDate:null, at:new Date(m.created_at), href:'#/my-messages'});
      });
    }catch(e){ console.error(e); }
    return out;
  };
})();

/* styles for the above */
(function(){
  const css = `
  .mplofc{margin-top:14px;}
  .mplofc-po{border:1px solid var(--line,#E3E6EB);border-radius:12px;padding:10px 12px;margin-top:8px;}
  .mplofc-h{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13.5px;}
  .mplofc-h span{color:var(--slate);}
  .mplofc-line{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 0 0;font-size:13px;min-width:0;}
  .mplofc-line > span:first-child{min-width:0;overflow-wrap:anywhere;}
  .mplofc-line .opmat-pill{flex:none;}
  .mpl-rmrow{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--line,#ECEEF2);font-size:13px;cursor:pointer;}
  .mpl-rmrow input{width:18px;height:18px;flex:0 0 18px;margin:0;}
  .mpl-rmrow span{flex:1;min-width:0;overflow-wrap:anywhere;}
  .mpl-rmrow em{font-style:normal;font-size:11px;color:var(--blue,#1F5FA6);margin-left:4px;}
  .mpl-rmrow b{flex:none;font-variant-numeric:tabular-nums;}
  .mplpiq-thread{display:flex;flex-direction:column;gap:6px;margin:0 0 8px;max-height:40vh;overflow-y:auto;}
  .mplpiq-msg{background:var(--bg,#F4F5F7);border-radius:10px;padding:7px 10px;max-width:92%;}
  .mplpiq-msg.me{align-self:flex-end;background:#E3EEFA;}
  .mplpiq-who{font-size:11px;color:var(--slate);margin-bottom:2px;}
  .mplpiq-txt{font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere;}`;
  try{ const st = document.createElement('style'); st.id = 'mplCss'; st.textContent = css; document.head.appendChild(st); }catch(e){}
})();
