/* ================= MATERIALS ================= */
let matFilter = 'live';
let expandedMaterialIds = new Set();
window.toggleMaterialExpand = function(id){
  if(expandedMaterialIds.has(id)) expandedMaterialIds.delete(id); else expandedMaterialIds.add(id);
  render();
};
// Completed tab: items sent together in one grouped order (same send time and
// supplier) show as one row — the first item's name, "N items", and a dropdown
// with every item (each still has its own GRN, edit, resend etc).
function matDoneEntries(list){
  const out = [], byKey = {};
  list.forEach(m=>{
    const key = m.sent_at ? m.sent_at+'|'+(m.merchant||m.supplier_id||'') : null;
    if(key && byKey[key]){ byKey[key].items.push(m); return; }
    const e = {m, items:[m]};
    if(key) byKey[key] = e;
    out.push(e);
  });
  return out;
}
function matGroupGrnTag(items){
  const withGrn = items.filter(x=>x.grn);
  if(!withGrn.length) return '';
  if(withGrn.some(x=>!x.grn.ok)) return matGrnTag({ok:false});
  if(withGrn.length===items.length) return matGrnTag({ok:true});
  return `<span class="opmat-pill" style="background:#FCEFD2;color:#8A5A00;">GRN ${withGrn.length}/${items.length}</span>`;
}
window.toggleMaterialGroupSelect = function(ids){
  ids = String(ids).split(',');
  const all = ids.every(id=>selectedMaterialIds.has(id));
  ids.forEach(id=>{ if(all) selectedMaterialIds.delete(id); else selectedMaterialIds.add(id); });
  render();
};
let suppliersOpen = false;
let supplierAddOpen = false;
let sendingMaterial = null; // {matId, supplierId, supplierName} while PM is entering Required for Delivery
let materialSupplierChoice = {}; // matId -> supplierId, picked but not yet sent
let selectedMaterialIds = new Set(); // matIds ticked for a grouped/combined send
let groupSupplierId = null; // supplier chosen for the current group selection
let sendingGroup = false; // true while entering the Required for Delivery date for a grouped send
// Supplier picker (dropdown replacing the old row-of-chips): supplierPickerFor
// holds the matId whose picker is open, or 'group' for the grouped-send
// panel's picker, or null when every picker is closed. supplierPickerFilter
// is the current text-filter value (only shown once there are 10+ suppliers).
let supplierPickerFor = null;
let supplierPickerFilter = '';
window.toggleSupplierPicker = function(key){
  supplierPickerFor = supplierPickerFor===key ? null : key;
  supplierPickerFilter = '';
  render();
};
window.pickSupplier = function(key, supplierId){
  if(key==='group') groupSupplierId = supplierId;
  else materialSupplierChoice[key] = supplierId;
  supplierPickerFor = null;
  supplierPickerFilter = '';
  render();
};
let supplierPickerFilterTimer = null;
window.setSupplierPickerFilter = function(val){
  // #351: renderMaterialRequests/renderMaterialRequiredList re-fetch both
  // materials and suppliers from the DB on every render() call — fine for a
  // click, but this input previously called render() on every keystroke,
  // so typing a filter string fired a fresh pair of network round-trips per
  // character. Debouncing to one render() per typing pause cuts that back
  // to (usually) a single refetch once the user stops typing, with no
  // change to what ends up on screen.
  supplierPickerFilter = val;
  clearTimeout(supplierPickerFilterTimer);
  supplierPickerFilterTimer = setTimeout(render, 250);
};
// Favouriting is capped at 3 (per the request) — enforced here rather than
// in the DB, so the message on hitting the cap can be specific and helpful.
window.toggleSupplierFavourite = async function(supplierId, isFav){
  if(!isFav){
    const rows = await dbSelect('suppliers', 'org_id=eq.'+ME.org_id+'&favourite=eq.true&select=id');
    if(rows && rows.length>=3){ toast('You can only favourite up to 3 suppliers — unfavourite one first.'); return; }
  }
  const row = await dbUpdate('suppliers', supplierId, {favourite: !isFav});
  if(row) render();
};
// Favourited suppliers (max 3) pin to the top, in alphabetical order among
// themselves; everyone else follows underneath, also alphabetical — the DB
// query already sorts by name.asc, so this is just a stable partition.
// "Email to me" — a stand-in choice at the top of the supplier list when
// sending an order: the order email goes to whoever is signed in and
// sending it, instead of to a supplier.
const SUPPLIER_EMAIL_ME = 'me';
function emailMeSupplier(){ return {id:SUPPLIER_EMAIL_ME, name:'Email to me', email:(ME && ME.email)||''}; }
function supplierPickerHtml(pickerKey, suppliers, selectedId){
  const offerEmailMe = pickerKey==='group' || !/^(edit-|reqnew)/.test(String(pickerKey));
  const q = (supplierPickerFilter||'').trim().toLowerCase();
  const filtered = q ? suppliers.filter(s=>s.name.toLowerCase().includes(q)) : suppliers;
  const favs = filtered.filter(s=>s.favourite);
  const rest = filtered.filter(s=>!s.favourite);
  const list = favs.concat(rest);
  return `
    <div class="card" style="margin-top:8px;padding:10px;">
      ${suppliers.length>10 ? `<div class="formfield" style="margin-bottom:8px;"><input type="text" placeholder="Filter suppliers…" value="${escapeHtml(supplierPickerFilter||'')}" oninput="setSupplierPickerFilter(this.value)"></div>` : ''}
      ${offerEmailMe ? `
        <div class="sitecard" style="padding:8px 10px;cursor:pointer;${selectedId===SUPPLIER_EMAIL_ME?'border-color:var(--brand1);border-width:1.5px;':''}" onclick="pickSupplier('${pickerKey}','${SUPPLIER_EMAIL_ME}')">
          <div class="info" style="min-width:0;"><div class="name">✉ Email to me</div><div class="addr">${escapeHtml((ME && ME.email)||'')}</div></div>
        </div>` : ''}
      ${list.length ? list.map(s=>`
        <div class="sitecard" style="padding:8px 10px;cursor:pointer;${selectedId===s.id?'border-color:var(--brand1);border-width:1.5px;':''}" onclick="pickSupplier('${pickerKey}','${s.id}')">
          <div class="info" style="min-width:0;"><div class="name">${escapeHtml(s.name)}</div></div>
          <span style="cursor:pointer;font-size:18px;line-height:1;color:${s.favourite?'#D9A441':'var(--line)'};" title="${s.favourite?'Unfavourite':'Favourite (up to 3 pin to the top)'}" onclick="event.stopPropagation();toggleSupplierFavourite('${s.id}',${s.favourite?'true':'false'})">${s.favourite?'★':'☆'}</span>
        </div>
      `).join('') : `<div class="empty">No suppliers match${q?' "'+escapeHtml(supplierPickerFilter)+'"':''}.</div>`}
    </div>`;
}
async function renderMaterials(siteId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  const isPM = isManager(ME);
  // Operatives get a small two-tile choice instead of the full PM tile grid
  // — Material Requests (theirs to raise) and the Material List
  // (theirs to action, if a PM has assigned them something to collect) —
  // deliberately not the PM/admin folder-tile navigation below.
  if(!isPM){ return renderOperativeMaterials(siteId); }
  const [pendingCount, orderFileCount, requiredOpenCount] = await Promise.all([
    // Stays counted through "sent" too, not just "pending" — see the
    // matching comment on the Dashboard's materials query above.
    dbSelect('materials', 'site_id=eq.'+siteId+'&status=eq.pending&select=id'),
    dbSelect('material_order_files', 'site_id=eq.'+siteId+'&select=id'),
    dbSelect('material_required_items', 'site_id=eq.'+siteId+'&status=in.(open,assigned)&select=id'),
  ]);
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <div class="tilegrid">
      <div class="tile" onclick="go('#/site/${siteId}/materialrequests')">
        <div class="icon" style="background:#F1E4FA;color:#6A2C91;">🙋</div>
        <div class="lbl">Material Requests</div>
        ${pendingCount.length ? `<div class="matcount" style="background:#F1E4FA;color:#6A2C91;">${pendingCount.length} to action</div>` : ''}
      </div>
      <div class="tile" onclick="go('#/site/${siteId}/materialrequired')">
        <div class="icon" style="background:#FCEFD2;color:#8A5A00;">📦</div>
        <div class="lbl">Collection List</div>
        ${requiredOpenCount.length ? `<div class="matcount" style="background:#FCEFD2;color:#8A5A00;">${requiredOpenCount.length} to collect</div>` : ''}
      </div>
      <div class="tile" onclick="go('#/site/${siteId}/materialorders')">
        <div class="icon" style="background:#FBEFE0;color:#8A5A1E;">📄</div>
        <div class="lbl">Material PO's</div>
      </div>
      ${matVisTileHtml(site, 'plant', '🏗', '#EAF3EC', '#2E7D46', 'Plant', 'Check in / out')}
      ${matVisTileHtml(site, 'expenses', '🧾', '#FDF1DE', '#B0740F', 'Expenses', 'Send receipts')}
    </div>
  `, {title: materialsTileLabel(), subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/home`, siteId, activeTab:'materials'}); }
}
async function renderMaterialRequests(siteId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  const isPM = isManager(ME);
  if(!isPM && matFilter==='ordered') matFilter='live';
  if(isPM && matFilter==='closed') matFilter='ordered';
  // Managers: To action (pending) and Completed (everything else — sent
  // orders, requests moved to the Collection List, closed or cancelled).
  const doneTab = matFilter==='closed' || (isPM && matFilter==='ordered');
  const statusQS = isPM ? (matFilter==='ordered' ? 'status=in.(sent,closed,cancelled)' : 'status=eq.pending')
    : (matFilter==='closed' ? 'status=in.(closed,cancelled)' : 'status=in.(pending,sent)');
  // A sent order goes straight to status 'closed' (with merchant/sent_at
  // set), so for managers "Ordered" = sent orders, and "Closed" = requests
  // closed without an order (closed by hand, moved to the Collection List,
  // or cancelled).
  const wasOrdered = m => m.status==='sent' || !!(m.merchant || m.sent_at);
  const [materialsRaw, suppliers] = await Promise.all([
    dbSelect('materials', 'site_id=eq.'+siteId+'&'+statusQS+'&order=created_at.desc'),
    isPM ? dbSelect('suppliers', 'org_id=eq.'+ME.org_id+'&order=name.asc') : Promise.resolve([]),
  ]);
  if(isPM) window.MAT_SUPPLIERS = suppliers;
  if(siteIsMulti(siteId) && !SUB_ADDR_CACHE[siteId]) await loadSubAddrs(siteId);
  const supplierName = id => { if(id===SUPPLIER_EMAIL_ME) return 'Email to me'; const s=suppliers.find(x=>x.id===id); return s ? s.name : null; };
  // Everything on this tab that can be ticked — used by "Select all".
  const materials = !isPM ? materialsRaw
    : materialsRaw;
  if(__gen === RENDER_GEN) materialSelectableIds = isPM ? (matFilter==='ordered' ? materials.map(m=>m.id) : materials.filter(m=>matFilter==='closed' ? m.status==='closed' : (m.status==='pending' || m.status==='sent')).map(m=>m.id)) : [];
  // Who could collect an order — only needed while the send step is open.
  let orderDrivers = [], orderSiteOps = [];
  if(isPM && (sendingGroup || sendingMaterial)){
    const [, assignedRows] = await Promise.all([loadAllProfiles(), dbSelect('site_assignments', 'site_id=eq.'+siteId+'&select=user_id')]);
    orderDrivers = Object.values(PROFILES).filter(p=>p && p.role==='driver').sort((a,b)=>a.name.localeCompare(b.name));
    orderSiteOps = assignedRows.map(a=>PROFILES[a.user_id]).filter(p=>p && p.role==='operative').sort((a,b)=>a.name.localeCompare(b.name));
  }
  const opStatusLabel = {pending:'Awaiting action', sent:'Actioned', closed:'Closed', cancelled:'Cancelled'};

  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    ${isPM ? `<div class="matbanner" style="background:#F1E4FA;color:#4E1F6E;"><span>🙋</span><div><b>Requests from operatives.</b> Order each one from a merchant for delivery, or add it to the <a href="#/site/${siteId}/materialrequired" style="color:inherit;font-weight:800;">Collection List</a>.</div></div>
    <div class="filterrow">
      <div class="filterchip ${matFilter==='live'?'active':''}" onclick="matFilter='live';clearMaterialSelection();render()">To action</div>
      <div class="filterchip ${matFilter==='ordered'?'active':''}" onclick="matFilter='ordered';clearMaterialSelection();render()">Completed</div>
    </div>
    ` : `
    <div class="filterrow">
      <div class="filterchip ${matFilter==='live'?'active':''}" onclick="matFilter='live';clearMaterialSelection();render()">Live/Pending</div>
      <div class="filterchip ${matFilter==='closed'?'active':''}" onclick="matFilter='closed';clearMaterialSelection();render()">Closed</div>
    </div>`}
    ${isPM && materialSelectableIds.length>1 && (selectedMaterialIds.size>0 || !doneTab) ? `
      <label style="display:flex;align-items:center;gap:10px;margin:0 0 10px;padding:10px 12px;border:1.5px solid var(--line);border-radius:10px;background:var(--card);font-size:13.5px;font-weight:700;cursor:pointer;">
        <input type="checkbox" style="width:20px;height:20px;flex:0 0 20px;" ${selectedMaterialIds.size>=materialSelectableIds.length?'checked':''} onchange="if(this.checked){selectAllMaterials()}else{clearMaterialSelection();render()}">
        Select all (${materialSelectableIds.length})${selectedMaterialIds.size>0 && selectedMaterialIds.size<materialSelectableIds.length ? ` <span class="stub" style="font-weight:400;">· ${selectedMaterialIds.size} selected</span>` : ''}
      </label>
    ` : ''}

    ${isPM && selectedMaterialIds.size>0 ? `
      <div class="card" style="border-color:var(--brand1);border-width:1.5px;">
        <p class="sectiontitle" style="margin-top:0;">${doneTab ? `${selectedMaterialIds.size} completed order${selectedMaterialIds.size>1?'s':''} selected` : `${selectedMaterialIds.size} request${selectedMaterialIds.size>1?'s':''} selected for a grouped order`}</p>
        ${doneTab && !sendingGroup ? `<p class="stub" style="margin:0 0 8px;">Send these again as one order, or reopen or delete them together.</p>` : ''}
        ${sendingGroup ? `
          ${orderFulfilmentHtml('group', orderDrivers, orderSiteOps)}
          <button class="darkbtn" onclick="confirmSendGroupedMaterial('${siteId}')">Confirm &amp; ${groupSupplierId===SUPPLIER_EMAIL_ME ? 'Email '+selectedMaterialIds.size+' Items to me' : 'Send '+selectedMaterialIds.size+' Items to '+escapeHtml(supplierName(groupSupplierId)||'')}</button>
          <button class="ghostbtn" style="margin-top:8px;" onclick="sendingGroup=false;render()">Cancel</button>
        ` : `
          <div class="ddrow" style="margin:0;" onclick="toggleSupplierPicker('group')">
            <span class="arrow">${supplierPickerFor==='group'?'▼':'▶'}</span> ${groupSupplierId ? escapeHtml(supplierName(groupSupplierId)) : 'Supplier'}
          </div>
          ${supplierPickerFor==='group' ? supplierPickerHtml('group', suppliers, groupSupplierId) : ''}
          <button class="darkbtn" style="width:auto;padding:6px 16px;font-size:10.5px;margin-top:10px;" onclick="${groupSupplierId ? 'sendingGroup=true;render()' : `customAlert('Please choose a supplier before sending this order.')`}">${doneTab ? 'Send Again' : (selectedMaterialIds.size>1 ? 'Send as one grouped order' : 'Send Order')} (${selectedMaterialIds.size} item${selectedMaterialIds.size>1?'s':''})</button>
          ${doneTab ? `<div class="row-gap" style="margin-top:8px;">
            <button class="ghostbtn" style="flex:1;" onclick="reopenSelectedMaterials('${siteId}')">Reopen selected</button>
            <button class="ghostbtn" style="flex:1;color:var(--warn);" onclick="deleteSelectedMaterials('${siteId}')">Delete selected</button>
          </div>` : ''}
          <div class="row-gap" style="margin-top:8px;">
            ${selectedMaterialIds.size < materialSelectableIds.length ? `<button class="ghostbtn" style="flex:1;" onclick="selectAllMaterials()">Select all (${materialSelectableIds.length})</button>` : ''}
            <button class="ghostbtn" style="flex:1;" onclick="clearMaterialSelection();render()">Clear selection</button>
          </div>
        `}
      </div>
    ` : ''}

    ${(()=>{ const rowFn = m=>{
      const cardBody = `
          <div class="top">
            <div style="display:flex;align-items:flex-start;gap:8px;min-width:0;">
              ${isPM && (m.status==='pending' || m.status==='sent') ? `<input type="checkbox" style="width:17px;height:17px;flex:0 0 17px;margin-top:2px;" ${selectedMaterialIds.has(m.id)?'checked':''} onclick="toggleMaterialSelect('${m.id}')">` : ''}
              <div style="min-width:0;flex:1;"><div class="name" style="overflow-wrap:break-word;">${escapeHtml(m.item)}</div><div class="qty" style="overflow-wrap:break-word;">Qty ${escapeHtml(m.qty)}</div><div class="qty" style="overflow-wrap:break-word;">Requested by ${escapeHtml(nameOf(m.requested_by))}</div>${m.order_note ? `<div class="qty" style="overflow-wrap:break-word;">📝 ${escapeHtml(m.order_note)}</div>` : ''}${m.required_by_date ? `<div class="qty" style="color:var(--warn);font-size:13.5px;overflow-wrap:break-word;">Required by ${new Date(m.required_by_date+'T00:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</div>` : ''}</div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;flex:0 0 auto;">
              <span class="statustag ${m.status}" style="font-size:12.4px;padding:3.9px 9.1px;border-radius:6.5px;">${isPM ? m.status : (opStatusLabel[m.status]||m.status)}</span>
              ${isPM ? rowActionsMenuHtml('matreq-'+m.id, `
                <div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;openMaterialEdit('${siteId}','${m.id}')">✎ Edit</div>
                <div class="statusmenu-item danger" onclick="rowActionsMenuOpenFor=null;deleteMaterial('${siteId}','${m.id}')">🗑 Delete</div>
              `) : ''}
            </div>
          </div>
          ${m.sub_site_label ? '<div>'+subAddrPill(m.sub_site_label)+'</div>' : ''}
          ${m.grn ? matGrnDetailHtml(m) : ''}
          ${isPM && m.supplier_branch ? `<div class="merchantrow">📍 ${escapeHtml(branchLabel(m.supplier_branch))}</div>` : ''}
          ${(m.status==='sent'||(m.status==='closed'&&m.merchant)) ? (isPM ? (
            m.status==='closed'
              // Closed tab: supplier name is hidden here (kept only in the
              // request/send flow's own data) — show the emailed date instead.
              ? `<div class="merchantrow">${m.email_sent_at ? `<span class="statustag closed">✓ Emailed ${new Date(m.email_sent_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</span>` : '<span class="statustag pending">Email pending</span>'}</div>${m.required_for_delivery ? `<div class="merchantrow" style="margin-top:4px;">Required for delivery: <strong>${new Date(m.required_for_delivery+'T00:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</strong></div>` : ''}`
              : `<div class="merchantrow">→ <span class="merchantchip sent">${escapeHtml(m.merchant||supplierName(m.supplier_id)||'Supplier')}</span> ${m.email_sent_at ? '<span class="statustag closed" style="margin-left:6px;">✓ Email sent</span>' : '<span class="statustag pending" style="margin-left:6px;">Email pending</span>'}</div>${m.required_for_delivery ? `<div class="merchantrow" style="margin-top:4px;">Required for delivery: <strong>${new Date(m.required_for_delivery+'T00:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</strong></div>` : ''}`
          ) : '') :
            m.status==='cancelled' ? `<div class="merchantrow" style="color:var(--warn);">Cancelled by ${escapeHtml(nameOf(m.cancelled_by))}${m.cancel_reason ? ' — '+escapeHtml(m.cancel_reason) : ''}</div>` :
            m.status==='pending' ? (isPM ? (
              selectedMaterialIds.has(m.id) ? `<div class="merchantrow" style="color:var(--brand1);font-weight:800;">✓ Selected — use the grouped order panel above to send.</div>` :
              sendingMaterial && sendingMaterial.matId===m.id ? `
              <div class="card" style="margin:10px 0 0;padding:10px;">
                ${orderFulfilmentHtml(m.id, orderDrivers, orderSiteOps)}
                <button class="darkbtn" onclick="confirmSendMaterial('${siteId}','${m.id}')">Confirm &amp; ${sendingMaterial.supplierId===SUPPLIER_EMAIL_ME ? 'Email to me' : 'Send to '+escapeHtml(sendingMaterial.supplierName)}</button>
                <button class="ghostbtn" style="margin-top:8px;" onclick="sendingMaterial=null;render()">Cancel</button>
              </div>
            ` : `<div class="merchantrow" style="display:block;">
              <div class="ddrow" style="margin:0;" onclick="toggleSupplierPicker('${m.id}')">
                <span class="arrow">${supplierPickerFor===m.id?'▼':'▶'}</span> ${materialSupplierChoice[m.id] ? escapeHtml(supplierName(materialSupplierChoice[m.id])) : 'Supplier'}
              </div>
              ${supplierPickerFor===m.id ? supplierPickerHtml(m.id, suppliers, materialSupplierChoice[m.id]) : ''}
            </div>`
            ) : `<div class="merchantrow">Awaiting action from project manager</div>`) : ''}
          ${!isPM && m.status==='pending' && m.requested_by===ME.id ? `<div class="row-gap" style="margin-top:10px;"><button class="ghostbtn" style="flex:1;" onclick="openMaterialEdit('${siteId}','${m.id}')">✎ Edit request</button><button class="ghostbtn" style="flex:1;color:var(--warn);" onclick="cancelMaterial('${siteId}','${m.id}')">Cancel request</button></div>` : ''}
          ${isPM && m.status==='pending' && !selectedMaterialIds.has(m.id) ? `
          <div class="row-gap" style="margin-top:10px;">
            <button class="darkbtn" style="flex:1;" onclick="beginSendMaterial('${m.id}')">🚚 Order from merchant</button>
            <button class="ghostbtn" style="flex:1;" onclick="materialToCollection('${siteId}','${m.id}')">📦 Add to collections</button>
          </div>
          <button class="ghostbtn" style="margin-top:8px;" onclick="closeMaterial('${siteId}','${m.id}')">Close request</button>
          ` : ''}
          ${isPM && m.status==='sent' && !selectedMaterialIds.has(m.id) ? `
          <div class="row-gap" style="margin-top:10px;">
            <button class="ghostbtn" style="flex:1;" onclick="openMaterialEdit('${siteId}','${m.id}')">✎ Edit order</button>
            <button class="darkbtn" style="flex:1;" onclick="sendMaterialAgain('${m.id}')">↻ Resend order</button>
          </div>
          <button class="ghostbtn" style="margin-top:8px;" onclick="closeMaterial('${siteId}','${m.id}')">✓ Received — close</button>
          ` : ''}
          ${isPM && m.status==='closed' && !selectedMaterialIds.has(m.id) ? (wasOrdered(m) ? `
          <div class="row-gap" style="margin-top:10px;">
            <button class="ghostbtn" style="flex:1;" onclick="openMaterialEdit('${siteId}','${m.id}')">✎ Edit order</button>
            ${m.merchant && m.supplier_id ? `<button class="darkbtn" style="flex:1;" onclick="openReemailPrompt('${siteId}','${m.id}')">↻ Resend order</button>` : ''}
          </div>
          <div class="row-gap" style="margin-top:8px;">
            <button class="ghostbtn" style="flex:1;" onclick="sendMaterialAgain('${m.id}')">Send to another supplier</button>
            <button class="ghostbtn" style="flex:1;" onclick="reopenMaterial('${siteId}','${m.id}')">Reopen</button>
          </div>` : `<div class="row-gap" style="margin-top:10px;">
            <button class="ghostbtn" style="width:auto;" onclick="reopenMaterial('${siteId}','${m.id}')">Reopen</button>
            <button class="ghostbtn" style="width:auto;" onclick="sendMaterialAgain('${m.id}')">Order it</button>
          </div>`) : ''}
      `;
      if(!doneTab) return `<div class="matcard">${cardBody}</div>`;
      // Closed material requests collapse into a single dropdown row —
      // tap to expand the same detail shown for live requests above. Supplier
      // is intentionally hidden in the Closed tab — the emailed date shows
      // here instead.
      const open = expandedMaterialIds.has(m.id);
      const emailedLabel = m.email_sent_at ? 'Emailed '+new Date(m.email_sent_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : null;
      return `
        <div class="ddrow" style="margin-top:10px;" onclick="toggleMaterialExpand('${m.id}')">
          ${isPM ? `<input type="checkbox" style="width:17px;height:17px;flex:0 0 17px;" ${selectedMaterialIds.has(m.id)?'checked':''} onclick="event.stopPropagation();toggleMaterialSelect('${m.id}')">` : ''}
          <span class="arrow">${open?'▼':'▶'}</span> <span style="min-width:0;overflow-wrap:anywhere;">${escapeHtml(m.item)}${m.qty ? ' <span style="font-weight:600;color:var(--slate);">× '+escapeHtml(m.qty)+'</span>' : ''}</span>
          <span style="margin-left:auto;display:flex;gap:5px;align-items:center;flex:none;">${matDoneTag(m)}${m.grn ? matGrnTag(m.grn) : ''}</span>
        </div>
        ${open ? `<div class="matcard" style="margin-top:0;">${cardBody}</div>` : ''}
      `;
    };
    if(!doneTab) return materials.map(rowFn).join('');
    return matDoneEntries(materials).map(e=>{
      if(e.items.length<2) return rowFn(e.m);
      const first = e.items[0], ids = e.items.map(x=>x.id), gk = 'grp:'+first.id;
      const open = expandedMaterialIds.has(gk);
      const allSel = ids.every(id=>selectedMaterialIds.has(id));
      const sentLabel = new Date(first.sent_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
      return `
        <div class="ddrow matgrouprow" style="margin-top:10px;" onclick="toggleMaterialExpand('${gk}')">
          ${isPM ? `<input type="checkbox" style="width:17px;height:17px;flex:0 0 17px;" ${allSel?'checked':''} onclick="event.stopPropagation();toggleMaterialGroupSelect('${ids.join(',')}')">` : ''}
          <span class="arrow">${open?'▼':'▶'}</span> <span style="min-width:0;overflow-wrap:anywhere;">${escapeHtml(first.item)} <span class="opmat-pill" style="background:#EDE7F6;color:#4E1F6E;margin-left:4px;">${e.items.length} items</span></span>
          <span style="margin-left:auto;display:flex;gap:5px;align-items:center;flex:none;">${matDoneTag(first)}${matGroupGrnTag(e.items)}</span>
        </div>
        ${open ? `<div class="matgroupbody"><div class="stub" style="margin:2px 0 0;">Grouped order · sent ${sentLabel}${isPM && first.merchant ? ' · '+escapeHtml(first.merchant) : ''} · ${e.items.length} items</div>${e.items.map(rowFn).join('')}</div>` : ''}`;
    }).join('');
    })() || `<div class="empty">${isPM ? (matFilter==='live' ? 'Nothing to action — no new requests from operatives.' : 'Nothing completed yet.') : 'No '+matFilter+' material requests.'}</div>`}

    ${matFilter==='live' ? `
    <div class="card" id="matRequestCard" style="margin-top:24px;">
      <p class="sectiontitle" style="margin-top:0;">Request material</p>
      ${subAddrSelectHtml('matSubAddr', siteId, '', '', 'Which address on this job?')}
      <div class="formfield"><input type="text" id="matItem" placeholder="Item"></div>
      <div class="row-gap">
        <div class="formfield" style="flex:1;min-width:0;"><label class="field-label">Quantity</label><input type="text" id="matQty" placeholder="Quantity"></div>
        <div class="formfield" onclick="openDatePickerRow(this)" style="flex:1;min-width:0;"><label class="field-label">Required by (optional)</label><input type="date" id="matRequiredBy" min="${localISODate(new Date())}"></div>
      </div>
      <button class="darkbtn" onclick="addMaterial('${siteId}')">Request Material Order</button>
      ${isFullManager(ME) ? `
        <label class="ghostbtn" style="display:block;text-align:center;cursor:pointer;margin:10px 0 0;${matImportBusy?'opacity:.6;pointer-events:none;':''}">${matImportBusy ? 'Importing…' : '📄 Import from Excel'}
          <input type="file" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" style="display:none;" onchange="importMaterialsExcel('${siteId}',this)"></label>
        <p class="stub" style="margin:4px 0 0;">Pick a material order spreadsheet — each item and quantity becomes its own request. You're shown the list to confirm first.</p>
      ` : ''}
    </div>
    ` : ''}
    ${isPM && matFilter==='live' ? `
    <p class="ddrow" style="margin:18px 0 12px;" onclick="suppliersOpen=!suppliersOpen;render()"><span class="arrow">${suppliersOpen?'▼':'▶'}</span> 🏪 Suppliers <span class="stub" style="margin:0 0 0 auto;display:inline;">${suppliers.length} saved</span></p>
    ${suppliersOpen ? `
    <div class="card">
      ${suppliers.map(s=>`
        <div class="sitecard" style="padding:8px 10px;flex-wrap:wrap;">
          <div class="info" style="display:flex;flex-direction:column;gap:5px;min-width:0;flex:1;">
            <input type="text" value="${escapeHtml(s.name)}" style="border:1px solid var(--line);border-radius:6px;padding:6px 8px;font-size:13px;font-weight:700;font-family:inherit;background:#fff;color:var(--ink);" onblur="saveSupplierField(this,'${s.id}','name')">
            <input type="email" value="${escapeHtml(s.email)}" style="border:1px solid var(--line);border-radius:6px;padding:6px 8px;font-size:12px;font-family:inherit;background:#fff;color:var(--ink);" onblur="saveSupplierField(this,'${s.id}','email')">
          </div>
          <span style="cursor:pointer;font-size:19px;line-height:1;color:${s.favourite?'#D9A441':'var(--line)'};align-self:center;" title="${s.favourite?'Unfavourite':'Favourite (up to 3 pin to the top)'}" onclick="toggleSupplierFavourite('${s.id}',${s.favourite?'true':'false'})">${s.favourite?'★':'☆'}</span>
          <div class="taskicon danger" onclick="deleteSupplier('${siteId}','${s.id}')">🗑</div>
        </div>
      `).join('') || `<div class="empty" style="padding:10px;">No suppliers yet.</div>`}
      ${supplierAddOpen ? `
        <div class="formfield" style="margin-top:10px;"><input type="text" id="supName" placeholder="Supplier name"></div>
        <div class="formfield"><input type="email" id="supEmail" placeholder="Supplier order email"></div>
        <div class="row-gap">
          <button class="darkbtn" style="flex:1;" onclick="addSupplier('${siteId}')">Add Supplier</button>
          <button class="ghostbtn" style="flex:1;" onclick="supplierAddOpen=false;render()">Cancel</button>
        </div>
        <p class="stub" style="margin:12px 0 6px;">Or import a list — Excel/CSV with Name and Email columns (or Name in column A, Email in column B):</p>
        <div class="ghostbtn" style="cursor:pointer;text-align:center;" onclick="document.getElementById('supplierExcelInput').click()">Choose Excel/CSV file</div>
        <input type="file" id="supplierExcelInput" accept=".xlsx,.xls,.csv" style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;" onchange="importSuppliersExcel(this,'${siteId}')">
      ` : `
        <button class="darkbtn" style="margin-top:10px;" onclick="supplierAddOpen=true;render()">+ Add Supplier</button>
      `}
    </div>
    ` : ''}
    ` : ''}
  `, {title:'Material Requests', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back: `#/site/${siteId}/materials`, siteId, activeTab:'materials'}); }
}
