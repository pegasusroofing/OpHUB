/* ================= MATERIALS — operative view + "Add to collections" =================
 * Operatives get one simple Materials screen instead of tiles:
 *   1. Your collection list — Collection List items a manager has assigned to
 *      them, grouped by merchant, as a tick list (tick = collected).
 *   2. Coming to site — requests a manager has ordered for delivery.
 *   3. Your requests — what they've asked for that's still waiting.
 * Plus "Request materials" and quick links to Plant and Expenses.
 * Managers keep the tile grid (Material Requests / Collection List /
 * Material PO's / Plant / Expenses) in renderMaterials. */
let opMatSelected = new Set(); // Collection List ids ticked by the operative
// Who (besides PMs/admins, who always see everything) can see the Plant and
// Expenses tiles on a job's Materials screen. Stored per job on
// sites.materials_visibility as {plant:[roles], expenses:[roles]}.
// Default: site managers yes, operatives and drivers no.
const MAT_VIS_ROLES = [{role:'site_manager', label:'Site Managers'}, {role:'operative', label:'Operatives'}, {role:'driver', label:'Delivery Drivers'}];
const MAT_VIS_DEFAULT = {plant:['site_manager'], expenses:['site_manager']};
function matVisibility(site){
  const v = (site && site.materials_visibility) || {};
  return {plant: Array.isArray(v.plant) ? v.plant : MAT_VIS_DEFAULT.plant, expenses: Array.isArray(v.expenses) ? v.expenses : MAT_VIS_DEFAULT.expenses};
}
function canSeeMatTile(site, key, p){
  p = p || ME;
  if(!p) return false;
  if(isFullManager(p) || p.role==='superadmin') return true;
  return matVisibility(site)[key].includes(p.role);
}
// Plant / Expenses tiles on the manager Materials screen. PMs/admins get a
// ⋮ menu on the tile (same pattern as the Main Contractor and Live Jobs
// tiles) to choose which job roles see it; the tile greys out while it's
// hidden from operatives. Site managers only see the tile if allowed.
function matVisTileHtml(site, key, icon, bg, color, label, sub){
  if(!canSeeMatTile(site, key)) return '';
  const siteId = site.id;
  const v = matVisibility(site)[key];
  const full = isFullManager(ME);
  const hiddenFromOps = !v.includes('operative');
  const who = v.length ? 'Seen by '+MAT_VIS_ROLES.filter(r=>v.includes(r.role)).map(r=>r.label).join(', ') : 'PM / admin only';
  return `<div class="tile ${full && hiddenFromOps ? 'matvis-off' : ''}" style="position:relative;" onclick="go('#/site/${siteId}/${key}')">
      ${full ? `<div style="position:absolute;top:6px;right:6px;z-index:1;" onclick="event.stopPropagation()">${rowActionsMenuHtml('mattile-'+key, MAT_VIS_ROLES.map(r=>{
        const on = v.includes(r.role);
        return `<div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;setMatVisibility('${siteId}','${key}','${r.role}',${on?'false':'true'})">${on ? '🙈 Hide from '+r.label : '👁 Show to '+r.label}</div>`;
      }).join(''))}</div>` : ''}
      <div class="icon" style="background:${bg};color:${color};">${icon}</div>
      <div class="lbl">${label}</div>
    </div>`;
}
function matVisibilityHtml(){ return ''; }
window.setMatVisibility = async function(siteId, key, role, on){
  const site = SITES.find(s=>s.id===siteId);
  const v = matVisibility(site);
  const next = {plant: v.plant.slice(), expenses: v.expenses.slice()};
  next[key] = on ? Array.from(new Set(next[key].concat(role))) : next[key].filter(r=>r!==role);
  const row = await dbUpdate('sites', siteId, {materials_visibility: next});
  if(row){ if(site) site.materials_visibility = next; toast('Saved'); logSiteActivity(siteId, 'materials_visibility', `${key==='plant'?'Plant':'Expenses'} ${on?'shown to':'hidden from'} ${(MAT_VIS_ROLES.find(r=>r.role===role)||{}).label||role}`); }
  render();
};

async function renderOperativeMaterials(siteId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  let [myPickups, coming, myReqs, suppliers] = await Promise.all([
    dbSelect('material_required_items', 'site_id=eq.'+siteId+'&assigned_to=eq.'+ME.id+'&status=in.(assigned,collected)&order=created_at.asc'),
    dbSelect('materials', 'site_id=eq.'+siteId+'&status=in.(sent,closed)&order=required_for_delivery.asc'),
    dbSelect('materials', 'site_id=eq.'+siteId+'&requested_by=eq.'+ME.id+'&status=eq.pending&order=created_at.desc'),
    dbSelect('suppliers', 'org_id=eq.'+ME.org_id+'&select=id,name,branches').catch(()=>[]),
  ]);
  // Coming to site = orders sent for delivery (not collections) that are due
  // today or later.
  const todayIso = localISODate(new Date());
  // Deliveries stay here until someone does the GRN (goods received), then
  // show as received for the rest of that day.
  const twoWeeksAgo = localISODate(new Date(Date.now()-14*864e5));
  coming = (coming||[]).filter(m=>(m.status==='sent' || m.merchant || m.sent_at) && m.fulfilment!=='collection'
    && (m.grn ? String(m.grn.at||'').slice(0,10)===todayIso : (!m.required_for_delivery || m.required_for_delivery>=twoWeeksAgo))).slice(0,20);
  const supName = id => { const s=(suppliers||[]).find(x=>x.id===id); return s ? s.name : null; };
  const fmt = d => d ? new Date(String(d).length===10 ? d+'T00:00:00' : d).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'}) : '';
  // Group pick-ups by merchant so one trip reads as one card.
  const groups = [];
  (myPickups||[]).forEach(m=>{
    const key = (m.supplier_id || '_')+'|'+((m.supplier_branch && m.supplier_branch.id) || '');
    let g = groups.find(x=>x.key===key);
    if(!g){ g = {key, name: (supName(m.supplier_id) || (m.supplier_id ? 'Merchant' : 'To collect')) + (m.supplier_branch ? ', '+(m.supplier_branch.name||'') : ''), addr: m.supplier_branch ? (m.supplier_branch.address||'') : '', phone: m.supplier_branch ? (m.supplier_branch.phone||'') : '', items:[]}; groups.push(g); }
    g.items.push(m);
  });
  const openIds = (myPickups||[]).filter(m=>m.status!=='collected').map(m=>m.id);
  opMatSelected = new Set(Array.from(opMatSelected).filter(id=>openIds.includes(id)));
  const tick = (m)=>{
    const done = m.status==='collected';
    const sel = opMatSelected.has(m.id);
    return `<div class="opmat-tick ${done?'done':''} ${sel?'sel':''}" ${done?'':`onclick="opMatToggle('${m.id}')"`}>
      <span class="opmat-box">${done||sel?'✓':''}</span>
      <span class="opmat-item">${escapeHtml(m.item)}${m.qty ? ` <span class="opmat-qty">× ${escapeHtml(m.qty)}</span>` : ''}</span>
      ${done ? '<span class="opmat-pill" style="background:#DDF3E3;color:#1E7A3C;margin-left:auto;">Collected</span>' : ''}
    </div>`;
  };
  const showPlant = canSeeMatTile(site,'plant'), showExp = canSeeMatTile(site,'expenses');
  const html = `
    <p class="opmat-h">Your collection list</p>
    ${openIds.length>1 && opMatSelected.size>0 ? `<label class="selallrow"><input type="checkbox" ${opMatSelected.size>=openIds.length?'checked':''} onchange="opMatSelectAll(this.checked, ${escapeHtml(JSON.stringify(openIds))})"> Select all (${openIds.length})${opMatSelected.size && opMatSelected.size<openIds.length ? ` <span class="stub" style="font-weight:400;">· ${opMatSelected.size} selected</span>` : ''}</label>` : ''}
    ${groups.length ? groups.map(g=>`<div class="card opmat-card">
        <div class="opmat-sub"><b style="color:var(--ink);">${escapeHtml(g.name)}</b>${g.items[0].assigned_at ? ' · asked '+fmt(g.items[0].assigned_at) : ''}${g.addr ? `<br>📍 <a href="https://maps.google.com/?q=${encodeURIComponent(g.addr)}" target="_blank" style="color:inherit;">${escapeHtml(g.addr)}</a>` : ''}${g.phone ? ` · <a href="tel:${escapeHtml(g.phone)}" style="color:inherit;">${escapeHtml(g.phone)}</a>` : ''}</div>
        ${g.items.map(tick).join('')}
      </div>`).join('') : `<div class="empty" style="padding:12px;">Nothing for you to collect.</div>`}
    ${openIds.length ? `<button class="darkbtn" style="margin:0 0 4px;${opMatSelected.size?'':'opacity:.5;'}" onclick="${opMatSelected.size ? `opMatCollect('${siteId}', Array.from(opMatSelected))` : `toast('Tick the items you have collected first')`}">✓ Mark ${opMatSelected.size ? opMatSelected.size+' ' : ''}collected</button>` : ''}

    <p class="opmat-h">Coming to site</p>
    ${(coming||[]).length ? coming.map(m=>`<div class="card opmat-card">
        <div class="opmat-row">
          <div style="min-width:0;flex:1;"><div class="opmat-item">${escapeHtml(m.item)}${m.qty ? ` <span class="opmat-qty">× ${escapeHtml(m.qty)}</span>` : ''}</div>
          <div class="opmat-sub" style="margin:2px 0 0;">Delivery${m.required_for_delivery ? ' · '+fmt(m.required_for_delivery) : ''}</div></div>
          ${m.grn ? matGrnTag(m.grn) : `<span class="opmat-pill" style="background:#E3EEFA;color:#1F5FA6;">Delivery</span>`}
        </div>
        ${m.grn ? '' : (grnOpenFor===m.id ? grnFormHtml(siteId, m) : `<label class="grnchk grnopen" onclick="event.preventDefault();openGrn('${m.id}')"><input type="checkbox"> Goods received (GRN)</label>`)}
      </div>`).join('') : `<div class="empty" style="padding:12px;">No deliveries booked.</div>`}

    <p class="opmat-h">Your requests</p>
    ${(myReqs||[]).map(m=>`<div class="card opmat-card opmat-row" onclick="go('#/site/${siteId}/materialrequests')" style="cursor:pointer;">
        <div style="min-width:0;flex:1;"><div class="opmat-item">${escapeHtml(m.item)}${m.qty ? ` <span class="opmat-qty">× ${escapeHtml(m.qty)}</span>` : ''}</div>
        <div class="opmat-sub" style="margin:2px 0 0;">Waiting for manager</div></div>
        <span class="opmat-pill" style="background:#F1E4FA;color:#6A2C91;">Requested</span>
      </div>`).join('')}
    <button class="darkbtn" style="margin-top:4px;" onclick="opMatRequest('${siteId}')">+ Request materials</button>
    ${showPlant || showExp ? `<div class="row-gap" style="margin-top:10px;">
      ${showPlant ? `<button class="ghostbtn" style="flex:1;" onclick="go('#/site/${siteId}/plant')">🏗 Plant</button>` : ''}
      ${showExp ? `<button class="ghostbtn" style="flex:1;" onclick="go('#/site/${siteId}/expenses')">🧾 Expenses</button>` : ''}
    </div>` : ''}
    <p class="stub" style="margin:12px 2px 0;"><a href="#/site/${siteId}/materialrequests" style="color:var(--slate);">See all my requests →</a></p>
  `;
  if(__gen === RENDER_GEN) document.getElementById('app').innerHTML = shell(html, {title: materialsTileLabel(), subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/home`, siteId, activeTab:'materials'});
}
window.opMatToggle = function(id){ if(opMatSelected.has(id)) opMatSelected.delete(id); else opMatSelected.add(id); render(); };
window.opMatSelectAll = function(on, ids){ opMatSelected = on ? new Set(ids) : new Set(); render(); };
window.opMatCollect = async function(siteId, ids){
  ids = (ids||[]).filter(Boolean);
  if(!ids.length) return;
  const rows = await dbSelect('material_required_items', 'id=in.('+ids.join(',')+')&select=id,item,qty');
  const now = new Date().toISOString();
  const res = await Promise.all(ids.map(id=>{
    const r = (rows||[]).find(x=>x.id===id) || {};
    return dbUpdate('material_required_items', id, {status:'collected', qty_collected:r.qty||null, collected_by:ME.id, collected_at:now});
  }));
  const ok = res.filter(Boolean).length;
  opMatSelected = new Set();
  if(ok){
    toast(ok>1 ? ok+' items collected' : 'Collected');
    (rows||[]).forEach(r=>logSiteActivity(siteId, 'material_required_item_collected', `Collected "${r.item||''}"`));
  }
  render();
};
window.opMatRequest = function(siteId){
  matFilter = 'live';
  go('#/site/'+siteId+'/materialrequests');
  let n = 0;
  const t = setInterval(()=>{
    const el = document.getElementById('matItem');
    if(el || ++n>40){ clearInterval(t); if(el){ (document.getElementById('matRequestCard')||el).scrollIntoView({behavior:'smooth', block:'center'}); el.focus(); } }
  }, 100);
};
// Manager: move an operative's request onto the Collection List instead of
// ordering it for delivery. The request is closed (noted as moved) and a new
// open Collection List row is created, ready to assign a collector.
window.materialToCollection = async function(siteId, matId){
  const rows = await dbSelect('materials', 'id=eq.'+matId);
  const m = rows && rows[0];
  if(!m){ toast('Request not found'); return; }
  const ok = await customConfirm(`Add "${m.item}"${m.qty ? ' × '+m.qty : ''} to the Collection List?\n\nYou can then choose who collects it.`);
  if(!ok) return;
  const inserted = await dbInsert('material_required_items', [{site_id:siteId, org_id:ME.org_id, item:m.item, qty:m.qty||null, supplier_id:null, status:'open', created_by:ME.id}]);
  if(!inserted){ toast('Could not add to the Collection List'); return; }
  await dbUpdate('materials', matId, {status:'closed', order_note: m.order_note ? m.order_note+' · Moved to Collection List' : 'Moved to Collection List'});
  logSiteActivity(siteId, 'material_moved_to_collection', `Moved "${m.item}" from Material Requests to the Collection List`);
  toast('Added to the Collection List');
  render();
};
