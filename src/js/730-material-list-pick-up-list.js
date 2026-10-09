/* ================= MATERIAL LIST (pick-up list) ================
 * A separate flow from Material Requests (operative-raised) — PM/admin adds
 * rows to a pick-up list, assigns one to an operative to collect, and the
 * operative (or a PM/admin) marks it collected. open -> assigned -> collected
 * -> closed, closable from any prior status ("Collected" in the UI — see
 * statusLabel below; the underlying DB value stays 'closed'). Multi-site-
 * aware, same dropdown+"Not on the list"/📍 pill pattern used on Schedule of
 * Works. Rows are grouped by supplier so a PM can email one supplier's items
 * straight from the list (see openMatReqSupplierEmailPrompt below), and are
 * collapsible dropdown rows with a tick-box multi-select for bulk "Email
 * Selected" / partial "Mark Selected Collected" actions. */
let matReqFilter = 'live'; // 'live' | 'closed'
let matReqAssignFor = null; // material_required_items id whose assign picker is open
let matReqCollectFor = null; // id whose "confirm collected qty" field is open
let matReqEditFor = null; // id whose item/qty/supplier edit card is open — PM/admin only
let expandedMatReqIds = new Set(); // ids whose collapsible row is expanded
let selectedMatReqIds = new Set();
let matReqBulkAssignOpen = false; // ids ticked for "Email Selected" / "Mark Selected Collected"
// Draft rows for the "Add More" / "Complete List" flow (item 14) — the row
// currently in the open input fields is NOT in this array until either
// "Add More" pushes it in (to start a new row) or "Complete List" inserts
// everything at once. Kept as plain vars (not DOM reads) so a re-render
// triggered by the supplier/address pickers never loses what's been typed
// (item 13's fix) — every input syncs into these on every keystroke/change.
let matReqDraftRows = [];
let matReqDraftItem = '';
let matReqDraftQty = '';
let matReqDraftSubAddr = null;
async function renderMaterialRequiredList(siteId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  const isPM = isManager(ME);
  const isMultiSite = !!(site && site.multi_site);
  const statusQS = matReqFilter==='live' ? 'status=in.(open,assigned,collected)' : 'status=eq.closed';
  const [itemsRaw, suppliers, subAddressesList, assignedRows] = await Promise.all([
    dbSelect('material_required_items', 'site_id=eq.'+siteId+'&'+statusQS+'&order=created_at.desc'),
    isPM ? dbSelect('suppliers', 'org_id=eq.'+ME.org_id+'&order=name.asc') : Promise.resolve([]),
    isMultiSite ? dbSelect('site_sub_addresses', 'site_id=eq.'+siteId+'&order=name.asc') : Promise.resolve([]),
    isPM ? dbSelect('site_assignments', 'site_id=eq.'+siteId+'&select=user_id') : Promise.resolve([]),
  ]);
  await loadAllProfiles();
  // Operative view stays deliberately minimal — their own assigned/collected
  // rows, plus a read-only glance at whatever's still open/unassigned on the
  // site so they know what's coming.
  const items = isPM ? itemsRaw : itemsRaw.filter(m=>m.assigned_to===ME.id || m.status==='open');
  const subAddrById = {}; subAddressesList.forEach(a=>{ subAddrById[a.id]=a; });
  if(isPM) window.MAT_SUPPLIERS = suppliers;
  const supplierName = id => { const s=suppliers.find(x=>x.id===id); return s ? s.name : null; };
  const supplierEmail = id => { const s=suppliers.find(x=>x.id===id); return s ? s.email : null; };
  const assignedIds = new Set(assignedRows.map(a=>a.user_id));
  const siteOperatives = isPM ? Object.values(PROFILES).filter(p=>p.role==='operative' && assignedIds.has(p.id)).sort((a,b)=>a.name.localeCompare(b.name)) : [];
  // "Closed" is shown to users as "Collected" (with a ✓) — the pick-up is
  // done, whether that final step was via the per-row tick or a bulk
  // "Mark Selected Collected". The DB value stays 'closed' throughout.
  const statusLabel = {open:'Open', assigned:'Assigned', collected:'Collected', closed:'✓ Collected'};

  const rowHtml = (m)=>{
    const subLabel = m.sub_site_id && subAddrById[m.sub_site_id] ? subAddrById[m.sub_site_id].name : null;
    const open = expandedMatReqIds.has(m.id);
    const selected = selectedMatReqIds.has(m.id);
    return `
      <div class="matcard" style="padding:0;overflow:hidden;">
        <div class="ddrow" style="margin:0;padding:12px;" onclick="toggleMatReqExpand('${m.id}')">
          ${isPM ? `<input type="checkbox" style="width:17px;height:17px;flex:0 0 17px;" ${selected?'checked':''} onclick="event.stopPropagation();toggleMatReqSelect('${m.id}')">` : ''}
          <span class="arrow">${open?'▼':'▶'}</span>
          <span style="flex:1;min-width:0;overflow-wrap:break-word;font-weight:700;">${escapeHtml(m.item)}</span>
          <span class="statustag ${m.status}" style="flex:0 0 auto;">${statusLabel[m.status]||m.status}</span>
        </div>
        ${open ? `
        <div style="padding:0 12px 14px;">
          <div class="qty">Qty ${escapeHtml(m.qty||'—')}${m.qty_collected ? ` (collected ${escapeHtml(m.qty_collected)})` : ''}</div>
          ${m.supplier_id ? `<div class="qty">Supplier: ${escapeHtml(supplierName(m.supplier_id)||'')}</div>` : ''}
          ${m.supplier_branch ? `<div class="qty">📍 ${escapeHtml(branchLabel(m.supplier_branch))}</div>` : ''}
          ${m.assigned_to ? `<div class="qty">Assigned to ${escapeHtml(nameOf(m.assigned_to))}</div>` : ''}
          ${subLabel ? `<div class="meta" style="margin-top:2px;"><span style="display:inline-block;font-size:10.5px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:var(--slate);background:var(--paper);border:1px solid var(--line);border-radius:20px;padding:2px 8px;">📍 ${escapeHtml(subLabel)}</span></div>` : ''}
          ${isPM ? `
          <div style="display:flex;gap:14px;margin-top:8px;">
            <div class="taskicon" onclick="openMatReqEdit('${m.id}','${m.supplier_id||''}')">✎</div>
            <div class="taskicon danger" onclick="deleteMaterialRequiredItem('${siteId}','${m.id}')">🗑</div>
          </div>` : ''}
          ${isPM && matReqEditFor===m.id ? `
            <div class="card" style="margin:10px 0 0;padding:10px;background:var(--paper);">
              <p class="stub" style="margin:0 0 8px;">Edit item</p>
              <div class="formfield"><input type="text" id="matReqEditItem-${m.id}" value="${escapeHtml(m.item)}" placeholder="Item"></div>
              <div class="formfield"><input type="text" id="matReqEditQty-${m.id}" value="${escapeHtml(m.qty||'')}" placeholder="Quantity (optional)"></div>
              <div class="ddrow" style="margin:0;" onclick="toggleSupplierPicker('edit-${m.id}')">
                <span class="arrow">${supplierPickerFor==='edit-'+m.id?'▼':'▶'}</span> ${materialSupplierChoice['edit-'+m.id] ? escapeHtml(supplierName(materialSupplierChoice['edit-'+m.id])) : 'Supplier (optional)'}
              </div>
              ${supplierPickerFor==='edit-'+m.id ? (suppliers.length ? supplierPickerHtml('edit-'+m.id, suppliers, materialSupplierChoice['edit-'+m.id]) : `<p class="stub" style="margin:8px 0 0;">No suppliers set up yet — add one on Material Requests.</p>`) : ''}
              ${branchSelectHtml('branch-edit-'+m.id, (materialSupplierChoice['edit-'+m.id]!==undefined ? materialSupplierChoice['edit-'+m.id] : m.supplier_id), m.supplier_branch)}
              <div class="row-gap" style="margin-top:10px;">
                <button class="darkbtn" style="flex:1;" onclick="saveMatReqEdit('${siteId}','${m.id}')">Save</button>
                <button class="ghostbtn" style="flex:1;" onclick="matReqEditFor=null;supplierPickerFor=null;render()">Cancel</button>
              </div>
            </div>
          ` : ''}
          ${isPM && matReqAssignFor===m.id ? `
            <div class="card" style="margin:10px 0 0;padding:10px;">
              <p class="stub" style="margin:0 0 8px;">Who should collect this?</p>
              <select id="matReqAssignSelect-${m.id}" style="width:100%;padding:8px 10px;font-size:12px;border:1.5px solid var(--line);border-radius:8px;background:var(--card);box-sizing:border-box;">
                <option value="">— Choose —</option>
                ${siteOperatives.map(o=>`<option value="${o.id}" ${m.assigned_to===o.id?'selected':''}>${escapeHtml(o.name)}</option>`).join('')}
              </select>
              <div class="row-gap" style="margin-top:8px;">
                <button class="darkbtn" style="flex:1;" onclick="confirmAssignMaterialRequired('${siteId}','${m.id}')">Assign</button>
                <button class="ghostbtn" style="flex:1;" onclick="matReqAssignFor=null;render()">Cancel</button>
              </div>
            </div>
          ` : ''}
          ${m.status==='assigned' && (isPM || m.assigned_to===ME.id) ? (
            matReqCollectFor===m.id ? `
              <div class="card" style="margin:10px 0 0;padding:10px;">
                <p class="stub" style="margin:0 0 8px;">Qty actually collected:</p>
                <input type="text" id="matReqCollectQty-${m.id}" value="${escapeHtml(m.qty||'')}" style="width:100%;padding:8px 10px;font-size:12px;border:1.5px solid var(--line);border-radius:8px;box-sizing:border-box;">
                <div class="row-gap" style="margin-top:8px;">
                  <button class="darkbtn" style="flex:1;" onclick="confirmCollectMaterialRequired('${siteId}','${m.id}')">Confirm Collected</button>
                  <button class="ghostbtn" style="flex:1;" onclick="matReqCollectFor=null;render()">Cancel</button>
                </div>
              </div>
            ` : `<label style="display:flex;align-items:center;gap:6px;margin-top:10px;font-size:12.5px;cursor:pointer;">
                <input type="checkbox" style="width:16px;height:16px;" onclick="if(this.checked){this.checked=false;matReqCollectFor='${m.id}';render();}"> Collected
              </label>`
          ) : ''}
          ${isPM && m.status!=='closed' && matReqAssignFor!==m.id ? `
            <div style="display:flex;gap:8px;margin-top:10px;">
              <button class="darkbtn" style="flex:1;" onclick="matReqAssignFor='${m.id}';matReqCollectFor=null;render()">Assign Operative to Collect</button>
              <button class="darkbtn" style="flex:1;background:var(--ok);" onclick="closeMaterialRequiredItem('${siteId}','${m.id}')">✓ Collected</button>
            </div>
          ` : ''}
        </div>` : ''}
      </div>
    `;
  };

  // PM/admin view groups rows by supplier — each group can be emailed to its
  // supplier in one tap (item 19). Operative view stays a flat list (no
  // supplier management/emailing for them).
  const groupsHtml = ()=>{
    if(!isPM){
      return items.map(rowHtml).join('') || `<div class="empty">${matReqFilter==='live'?'Nothing waiting to be collected.':'Nothing collected yet.'}</div>`;
    }
    if(!items.length) return `<div class="empty">${matReqFilter==='live'?'Nothing waiting to be collected.':'Nothing collected yet.'}</div>`;
    const groups = {};
    items.forEach(m=>{ const key = m.supplier_id || '__none'; (groups[key]=groups[key]||[]).push(m); });
    const keys = Object.keys(groups).sort((a,b)=>{
      if(a==='__none') return 1; if(b==='__none') return -1;
      return (supplierName(a)||'').localeCompare(supplierName(b)||'');
    });
    return keys.map(key=>{
      const groupItems = groups[key];
      const label = key==='__none' ? 'No supplier' : (supplierName(key)||'Supplier');
      const email = key==='__none' ? null : supplierEmail(key);
      return `
        <div class="card" style="margin-bottom:14px;padding:12px;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;">
            <p class="sectiontitle" style="margin:0;">${escapeHtml(label)} <span class="stub" style="margin:0;display:inline;">(${groupItems.length} item${groupItems.length>1?'s':''})</span></p>
            ${key!=='__none' ? `<button class="ghostbtn" style="width:auto;padding:6px 14px;font-size:11px;flex:0 0 auto;" onclick="openMatReqSupplierEmailPrompt('${siteId}','${key}')" ${email?'':'disabled title="This supplier has no email on file"'}>✉ Email Supplier</button>` : ''}
          </div>
          ${groupItems.map(rowHtml).join('')}
        </div>
      `;
    }).join('');
  };

  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    ${isPM ? `<div class="matbanner" style="background:#FCEFD2;color:#5E3D00;"><span>📦</span><div><b>Items for someone to pick up.</b> Assign who collects each one — it shows on their Materials screen as a tick list.</div></div>` : ''}
    <div class="filterrow">
      <div class="filterchip ${matReqFilter==='live'?'active':''}" onclick="matReqFilter='live';matReqAssignFor=null;matReqCollectFor=null;selectedMatReqIds=new Set();render()">To collect</div>
      <div class="filterchip ${matReqFilter==='closed'?'active':''}" onclick="matReqFilter='closed';matReqAssignFor=null;matReqCollectFor=null;selectedMatReqIds=new Set();render()">Collected</div>
    </div>
    ${isPM && items.length>1 && selectedMatReqIds.size>0 ? `
      <label class="selallrow">
        <input type="checkbox" ${selectedMatReqIds.size>=items.length?'checked':''} onchange="selectedMatReqIds=this.checked?new Set(${escapeHtml(JSON.stringify(items.map(m=>m.id)))}):new Set();render()">
        Select all (${items.length})${selectedMatReqIds.size>0 && selectedMatReqIds.size<items.length ? ` <span class="stub" style="font-weight:400;">· ${selectedMatReqIds.size} selected</span>` : ''}
      </label>` : ''}
    ${isPM && selectedMatReqIds.size>0 ? `
      <div class="card" style="border-color:var(--brand1);border-width:1.5px;margin-top:12px;">
        <p class="sectiontitle" style="margin-top:0;">${selectedMatReqIds.size} item${selectedMatReqIds.size>1?'s':''} selected</p>
        <div class="row-gap">
          <button class="darkbtn" style="flex:1;" onclick="openMatReqEmailSelectedPrompt('${siteId}')">✉ Email Selected</button>
          ${matReqFilter==='live' ? `<button class="darkbtn" style="flex:1;background:var(--ok);" onclick="closeMaterialRequiredItems('${siteId}', Array.from(selectedMatReqIds))">✓ Mark Selected Collected</button>` : ''}
        </div>
        ${matReqFilter==='live' ? (matReqBulkAssignOpen ? `
          <div class="row-gap" style="margin-top:8px;">
            <select id="matReqBulkAssignSelect" style="flex:1;padding:8px 10px;font-size:13px;border:1.5px solid var(--line);border-radius:8px;background:var(--card);">
              <option value="">— Who collects? —</option>
              ${siteOperatives.map(o=>`<option value="${o.id}">${escapeHtml(o.name)}</option>`).join('')}
            </select>
            <button class="darkbtn" style="width:auto;padding:8px 16px;" onclick="assignSelectedMatReq('${siteId}')">Assign</button>
          </div>` : `<button class="ghostbtn" style="margin-top:8px;" onclick="matReqBulkAssignOpen=true;render()">👤 Assign selected to an operative</button>`) : ''}
        <button class="ghostbtn" style="margin-top:8px;" onclick="selectedMatReqIds=new Set();matReqBulkAssignOpen=false;render()">Clear selection</button>
      </div>
    ` : ''}
    <div style="margin-top:12px;">${groupsHtml()}</div>
    ${isPM && matReqFilter==='live' ? `
    <div class="card" style="margin-top:24px;">
      <p class="sectiontitle" style="margin-top:0;">Add item</p>
      ${matReqDraftRows.length ? `
        <div class="card" style="margin:0 0 12px;padding:8px 10px;background:var(--paper);">
          <p class="stub" style="margin:0 0 6px;">${matReqDraftRows.length} row${matReqDraftRows.length>1?'s':''} queued — not saved yet:</p>
          ${matReqDraftRows.map((r,i)=>`
            <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;font-size:12.5px;">
              <span style="overflow-wrap:break-word;">${escapeHtml(r.item)}${r.qty?' — qty '+escapeHtml(r.qty):''}</span>
              <span class="taskicon danger" style="flex:0 0 auto;" onclick="removeMatReqDraftRow(${i})">🗑</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
      <div class="formfield"><input type="text" id="matReqItem" placeholder="Item" value="${escapeHtml(matReqDraftItem)}" oninput="matReqDraftItem=this.value"></div>
      <div class="formfield"><input type="text" id="matReqQty" placeholder="Quantity (optional)" value="${escapeHtml(matReqDraftQty)}" oninput="matReqDraftQty=this.value"></div>
      <div class="ddrow" style="margin:0;" onclick="toggleSupplierPicker('reqnew')">
        <span class="arrow">${supplierPickerFor==='reqnew'?'▼':'▶'}</span> ${materialSupplierChoice['reqnew'] ? escapeHtml(supplierName(materialSupplierChoice['reqnew'])) : 'Supplier (optional)'}
      </div>
      ${supplierPickerFor==='reqnew' ? (suppliers.length ? supplierPickerHtml('reqnew', suppliers, materialSupplierChoice['reqnew']) : `<p class="stub" style="margin:8px 0 0;">No suppliers set up yet — add one on Material Requests.</p>`) : ''}
      ${branchSelectHtml('branch-reqnew', materialSupplierChoice['reqnew'])}
      ${isMultiSite ? `
        <p class="field-label" style="margin:10px 0 6px;">Address</p>
        <select id="matReqSubAddr" onchange="matReqDraftSubAddr=this.value||null" style="width:100%;padding:8px 10px;font-size:12px;border:1.5px solid var(--line);border-radius:8px;background:var(--card);box-sizing:border-box;">
          <option value="" ${!matReqDraftSubAddr?'selected':''}>Not on the list</option>
          ${subAddressesList.map(a=>`<option value="${a.id}" ${matReqDraftSubAddr===a.id?'selected':''}>${escapeHtml(a.name)}</option>`).join('')}
        </select>
      ` : ''}
      <div class="row-gap" style="margin-top:10px;">
        <button class="ghostbtn" style="flex:1;" onclick="addMaterialRequiredDraftRow()">Add More</button>
        <button class="darkbtn" style="flex:1;" onclick="completeMaterialRequiredList('${siteId}')">Complete List</button>
      </div>
    </div>
    ` : ''}
  `, {title:'Collection List', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back: `#/site/${siteId}/materials`, siteId, activeTab:'materials'}); }
}
window.toggleMatReqExpand = function(id){
  if(expandedMatReqIds.has(id)) expandedMatReqIds.delete(id); else expandedMatReqIds.add(id);
  render();
};
window.toggleMatReqSelect = function(id){
  if(selectedMatReqIds.has(id)) selectedMatReqIds.delete(id); else selectedMatReqIds.add(id);
  render();
};
// "Add More" stashes the currently-typed row into matReqDraftRows (no DB
// write yet) and clears just the item/qty fields so the PM can keep typing
// the next row under the same supplier/address without re-picking them.
// "Complete List" (below) inserts every queued row plus whatever's still in
// the open fields, in one go.
// ---- Import a material order spreadsheet into the queue ----------------
// Reads the first sheet that has a recognisable table: a header row with a
// description/item column and a quantity column (a unit column is used too
// if there is one). Rows with no quantity — section headings like "Lead",
// blank lines, totals — are skipped. Nothing is saved: rows only join the
// queue, so they can be checked or binned before tapping Complete List.
function matReqParseSheetRows(rows){
  const norm = v=>String(v==null?'':v).trim().toLowerCase();
  const isDesc = t=>/^(description|item|items|material|materials|product|name|item description|material description)$/.test(t);
  const isQty = t=>/^(qty|quantity|quantities|qty required|quantity required|no\.?|amount)$/.test(t);
  const isUnit = t=>/^(unit|units|uom)$/.test(t);
  let hdr = -1, cDesc = -1, cQty = -1, cUnit = -1;
  for(let r=0; r<Math.min(rows.length, 40) && hdr<0; r++){
    const cells = (rows[r]||[]).map(norm);
    const d = cells.findIndex(isDesc), q = cells.findIndex(isQty);
    if(d>-1 && q>-1){ hdr = r; cDesc = d; cQty = q; cUnit = cells.findIndex(isUnit); }
  }
  if(hdr<0){
    // No headings found: take the first text column and the first number column.
    for(let r=0; r<Math.min(rows.length, 60) && cDesc<0; r++){
      const row = rows[r]||[];
      const d = row.findIndex(v=>typeof v==='string' && v.trim().length>1);
      const q = row.findIndex(v=>typeof v==='number');
      if(d>-1 && q>-1){ cDesc = d; cQty = q; hdr = r-1; }
    }
  }
  if(cDesc<0 || cQty<0) return [];
  const out = [];
  for(let r=hdr+1; r<rows.length; r++){
    const row = rows[r]||[];
    const item = String(row[cDesc]==null?'':row[cDesc]).trim();
    const rawQ = row[cQty];
    const n = typeof rawQ==='number' ? rawQ : parseFloat(String(rawQ==null?'':rawQ).replace(/,/g,''));
    if(!item || !isFinite(n) || n<=0) continue;
    if(/total/i.test(item)) continue;
    const q = String(Math.round(n*100)/100);
    const unit = cUnit>-1 ? String(row[cUnit]==null?'':row[cUnit]).trim() : '';
    out.push({item: item.slice(0,300), qty: unit ? q+' '+unit : q});
  }
  return out;
}
let matImportBusy = false;
window.importMaterialsExcel = async function(siteId, input){
  const file = input.files && input.files[0];
  const reqEl = document.getElementById('matRequiredBy');
  const requiredBy = reqEl ? reqEl.value : '';
  try{ input.value = ''; }catch(e){}
  if(!file || matImportBusy) return;
  if(!isFullManager(ME)){ toast('Project managers and admins only.'); return; }
  if(file.size > 15*1024*1024){ toast('That file is too big to read.'); return; }
  if(!(await loadLib('XLSX'))){ toast('Excel library failed to load — check connection.'); return; }
  let found = [];
  try{
    const wb = XLSX.read(await file.arrayBuffer(), {type:'array'});
    for(const name of wb.SheetNames){
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], {header:1, raw:true, defval:null, blankrows:false});
      found = matReqParseSheetRows(rows);
      if(found.length) break;
    }
  }catch(e){ console.error(e); toast('Could not read that file — is it an Excel or CSV file?'); return; }
  if(!found.length){ customAlert('No items found in that file. It needs a column headed "Description" (or "Item") and one headed "Quantity" (or "Qty").'); return; }
  if(found.length > 300){ customAlert('That file has '+found.length+' items — the most that can be imported in one go is 300.'); return; }
  const preview = found.slice(0,12).map(r=>'• '+r.item+' — '+r.qty).join('\n') + (found.length>12 ? '\n…and '+(found.length-12)+' more' : '');
  if(!await customConfirm('Add these '+found.length+' item'+(found.length===1?'':'s')+' from "'+file.name+'" as material requests?'+(requiredBy ? ' Required by '+requiredBy+'.' : '')+'\n\n'+preview)) return;
  matImportBusy = true; render();
  let ok = 0;
  try{
    // Lists show newest first, so each row is stamped a millisecond earlier
    // than the one above it in the spreadsheet: the items then read top to
    // bottom in the same order as the file (they used to come out reversed).
    const base = Date.now();
    const payload = found.map((r,i)=>({site_id:siteId, item:r.item, qty:r.qty||'1', required_by_date: requiredBy||null, requested_by:ME.id, status:'pending', created_at:new Date(base - i).toISOString()}));
    const rows = await dbInsert('materials', payload);
    if(rows) ok = Array.isArray(rows) ? rows.length : found.length;
  }catch(e){ console.error(e); }
  matImportBusy = false;
  if(ok) postSystemMessage(siteId, 'material_request', `${ME.name} requested ${ok} material item${ok===1?'':'s'} from a spreadsheet (${file.name})`+(requiredBy?` — required by ${requiredBy}`:''));
  await render();
  if(ok===found.length) customAlert('✓ '+ok+' material request'+(ok===1?'':'s')+' added.');
  else customAlert(ok+' of '+found.length+' were added — the rest failed. Check your connection, then import again (delete any duplicates).');
};
window.addMaterialRequiredDraftRow = function(){
  const itemEl = document.getElementById('matReqItem');
  const item = (itemEl ? itemEl.value : matReqDraftItem || '').trim();
  if(!item){ toast('Enter an item first.'); return; }
  const qtyEl = document.getElementById('matReqQty');
  const qty = (qtyEl ? qtyEl.value : matReqDraftQty || '').trim();
  const supplierId = materialSupplierChoice['reqnew'] || null;
  const subAddrEl = document.getElementById('matReqSubAddr');
  const subSiteId = subAddrEl ? (subAddrEl.value || null) : (matReqDraftSubAddr || null);
  matReqDraftRows.push({item, qty: qty||null, supplier_id: supplierId, sub_site_id: subSiteId, supplier_branch: readBranch('branch-reqnew', supplierId)});
  matReqDraftItem = ''; matReqDraftQty = '';
  toast('Row queued — add another or tap Complete List');
  render();
};
window.removeMatReqDraftRow = function(idx){
  matReqDraftRows.splice(idx,1);
  render();
};
window.completeMaterialRequiredList = async function(siteId){
  const itemEl = document.getElementById('matReqItem');
  const item = (itemEl ? itemEl.value : matReqDraftItem || '').trim();
  const rows = matReqDraftRows.slice();
  if(item){
    const qtyEl = document.getElementById('matReqQty');
    const qty = (qtyEl ? qtyEl.value : matReqDraftQty || '').trim();
    const supplierId = materialSupplierChoice['reqnew'] || null;
    const subAddrEl = document.getElementById('matReqSubAddr');
    const subSiteId = subAddrEl ? (subAddrEl.value || null) : (matReqDraftSubAddr || null);
    rows.push({item, qty: qty||null, supplier_id: supplierId, sub_site_id: subSiteId, supplier_branch: readBranch('branch-reqnew', supplierId)});
  }
  if(!rows.length){ toast('Enter at least one item.'); return; }
  const payload = rows.map(r=>({site_id:siteId, org_id:ME.org_id, item:r.item, qty:r.qty, supplier_id:r.supplier_id, sub_site_id:r.sub_site_id, supplier_branch:r.supplier_branch||null, status:'open', created_by:ME.id}));
  const inserted = await dbInsert('material_required_items', payload);
  if(inserted){
    matReqDraftRows = [];
    matReqDraftItem = ''; matReqDraftQty = ''; matReqDraftSubAddr = null;
    delete materialSupplierChoice['reqnew'];
    supplierPickerFor = null;
    toast(`${rows.length} item${rows.length>1?'s':''} added to the list`);
    render();
  }
};
window.confirmAssignMaterialRequired = async function(siteId, id){
  const sel = document.getElementById('matReqAssignSelect-'+id);
  const userId = sel ? sel.value : '';
  if(!userId){ toast('Choose an operative.'); return; }
  const itemRows = await dbSelect('material_required_items', 'id=eq.'+id+'&select=item');
  const itemLabel = (itemRows && itemRows[0] && itemRows[0].item) || 'an item';
  const row = await dbUpdate('material_required_items', id, {assigned_to:userId, status:'assigned', assigned_at:new Date().toISOString()});
  if(!row) return;
  matReqAssignFor = null;
  toast('Assigned');
  render();
  // Push notification (best-effort) AND an Inbox row (messages table) — the
  // push alone doesn't land anything in the operative's Inbox if they're not
  // looking at their phone right when it fires, so both are sent. The
  // messages table only supports broadcast audiences ('operatives'/site or
  // company-wide, not a single named recipient), so this goes out to the
  // site's operatives with the assignee named in the body — the closest fit
  // the current schema allows.
  try{
    await sbFetch('/functions/v1/notify-material-pickup', {method:'POST', body: JSON.stringify({site_id:siteId, user_id:userId, item_label:itemLabel})});
  }catch(e){ /* best-effort push — the assignment itself already saved */ }
  postSystemMessageTo(siteId, 'material_pickup', `${nameOf(userId)} was asked to collect "${itemLabel}" for ${SITES.find(s=>s.id===siteId)?.name||'this site'}.`);
};
window.assignSelectedMatReq = async function(siteId){
  const sel = document.getElementById('matReqBulkAssignSelect');
  const userId = sel ? sel.value : '';
  if(!userId){ toast('Choose an operative.'); return; }
  const ids = Array.from(selectedMatReqIds);
  if(!ids.length) return;
  const now = new Date().toISOString();
  const res = await Promise.all(ids.map(id=>dbUpdate('material_required_items', id, {assigned_to:userId, status:'assigned', assigned_at:now})));
  const n = res.filter(Boolean).length;
  matReqBulkAssignOpen = false; selectedMatReqIds = new Set();
  toast(n+' item'+(n>1?'s':'')+' assigned to '+nameOf(userId));
  render();
  if(n){
    try{ await sbFetch('/functions/v1/notify-material-pickup', {method:'POST', body: JSON.stringify({site_id:siteId, user_id:userId, item_label: n+' items'})}); }catch(e){}
    postSystemMessageTo(siteId, 'material_pickup', `${nameOf(userId)} was asked to collect ${n} item${n>1?'s':''} for ${SITES.find(s=>s.id===siteId)?.name||'this site'}.`);
  }
};
window.confirmCollectMaterialRequired = async function(siteId, id){
  const input = document.getElementById('matReqCollectQty-'+id);
  const qtyCollected = input ? input.value.trim() : '';
  const row = await dbUpdate('material_required_items', id, {status:'collected', qty_collected:qtyCollected||null, collected_by:ME.id, collected_at:new Date().toISOString()});
  if(row){ matReqCollectFor=null; toast('Marked collected'); render(); }
};
// Close now doubles as "mark Collected" in the UI (see statusLabel above).
// Kept as a single-id wrapper around closeMaterialRequiredItems so every
// existing per-row call site still works unchanged.
window.closeMaterialRequiredItem = async function(siteId, id){
  return closeMaterialRequiredItems(siteId, [id]);
};
// Accepts an array of ids so a multi-select group can be PARTIALLY closed —
// only the ticked ids move to Collected; anything left unticked stays
// exactly where it was (item 18).
window.closeMaterialRequiredItems = async function(siteId, ids){
  ids = Array.isArray(ids) ? ids : [ids];
  ids = ids.filter(Boolean);
  if(!ids.length) return;
  const itemRows = await dbSelect('material_required_items', 'id=in.('+ids.join(',')+')&select=id,item');
  const results = await Promise.all(ids.map(id=>dbUpdate('material_required_items', id, {status:'closed', closed_by:ME.id, closed_at:new Date().toISOString()})));
  const okIds = ids.filter((id,i)=>results[i]);
  if(okIds.length){
    toast(okIds.length>1 ? `${okIds.length} items marked Collected` : 'Marked Collected');
    okIds.forEach(id=>{
      const r = itemRows.find(x=>x.id===id);
      logSiteActivity(siteId, 'material_required_item_closed', `Marked material item "${(r&&r.item)||''}" as collected`);
    });
    selectedMatReqIds = new Set(Array.from(selectedMatReqIds).filter(id=>!okIds.includes(id)));
    render();
  }
};
window.deleteMaterialRequiredItem = async function(siteId, id){
  if(!await customConfirm('Delete this item from the list?')) return;
  const rows = await dbSelect('material_required_items', 'id=eq.'+id+'&select=item');
  const item = rows[0] && rows[0].item;
  const ok = await dbDelete('material_required_items', id);
  if(ok){ selectedMatReqIds.delete(id); toast('Deleted'); logSiteActivity(siteId, 'material_required_item_deleted', `Deleted material required item "${item||''}"`); render(); }
};
// Item/qty/supplier were originally only settable when a row was first
// created — PM/admin can now go back and amend any of the three afterwards
// (e.g. the merchant substituted a product, or the quantity changed), on any
// row regardless of status. Assignment/collection/close stay their own
// separate actions above, untouched by this.
window.openMatReqEdit = function(id, currentSupplierId){
  matReqEditFor = id;
  matReqAssignFor = null; matReqCollectFor = null;
  supplierPickerFor = null;
  // Seed the picker with the row's existing supplier so it displays
  // correctly even if the PM never touches the picker — saveMatReqEdit only
  // overwrites supplier_id when this key has actually been set.
  materialSupplierChoice['edit-'+id] = currentSupplierId || null;
  expandedMatReqIds.add(id);
  render();
};
window.saveMatReqEdit = async function(siteId, id){
  const itemEl = document.getElementById('matReqEditItem-'+id);
  const item = itemEl ? itemEl.value.trim() : '';
  if(!item){ toast('Item can\'t be empty.'); return; }
  const qtyEl = document.getElementById('matReqEditQty-'+id);
  const qty = qtyEl ? qtyEl.value.trim() : '';
  const key = 'edit-'+id;
  const supplierId = Object.prototype.hasOwnProperty.call(materialSupplierChoice, key) ? (materialSupplierChoice[key]||null) : undefined;
  const patch = {item, qty: qty||null};
  if(supplierId !== undefined) patch.supplier_id = supplierId;
  const effSup = supplierId !== undefined ? supplierId : ((await dbSelect('material_required_items','id=eq.'+id+'&select=supplier_id'))[0]||{}).supplier_id;
  patch.supplier_branch = readBranch('branch-edit-'+id, effSup);
  delete matBranchChoice['branch-edit-'+id];
  const row = await dbUpdate('material_required_items', id, patch);
  if(row){
    matReqEditFor = null;
    delete materialSupplierChoice[key];
    supplierPickerFor = null;
    toast('Item updated');
    render();
  }
};
// "Email Selected" (item 15) — sends whichever rows are ticked (which can
// span several suppliers, or none) to a chosen set of recipients. Reuses the
// same recipient-picker pattern as openScheduleEmailPrompt (tick PMs/admins
// and/or type another address) — a persistent DOM node outside render() so
// typing/ticking isn't wiped by a re-render.
window.openMatReqEmailSelectedPrompt = async function(siteId){
  if(!selectedMatReqIds.size){ toast('Nothing selected.'); return; }
  await loadAllProfiles();
  const managers = Object.values(PROFILES).filter(p=>(p.role==='pm'||p.role==='admin') && p.email && !isEstimator(p));
  let ov = document.getElementById('matReqEmailModalOverlay');
  if(!ov){
    ov = document.createElement('div');
    ov.id = 'matReqEmailModalOverlay';
    ov.className = 'geo-modal-overlay';
    ov.onclick = (e)=>{ if(e.target===ov) window.closeMatReqEmailPrompt(); };
    document.body.appendChild(ov);
  }
  const ticked = managers.filter(p=>p.id===ME.id).map(p=>p.id);
  ov.innerHTML = `
    <div class="geo-modal-card">
      <h3>Email ${selectedMatReqIds.size} Collection List item${selectedMatReqIds.size>1?'s':''}</h3>
      <p class="stub">Tick who should receive it, or add another address below.</p>
      <div style="max-height:180px;overflow-y:auto;margin-bottom:10px;">
        ${managers.map(p=>`
          <label style="display:flex;align-items:center;gap:8px;padding:6px 2px;font-size:13px;font-weight:600;cursor:pointer;">
            <input type="checkbox" class="matReqEmailTick" value="${escapeHtml(p.email)}" ${ticked.includes(p.id)?'checked':''}>
            ${escapeHtml(p.name)} <span class="stub" style="margin:0;">(${escapeHtml(p.email)})</span>
          </label>
        `).join('') || `<p class="stub">No other PMs/admins found.</p>`}
      </div>
      <div class="formfield"><label class="field-label">Add another address</label><input type="email" id="matReqEmailExtraInput" placeholder="name@example.com"></div>
      <button class="darkbtn" id="matReqEmailConfirmBtn" style="width:100%;" onclick="confirmMatReqEmailSelected('${siteId}')">Confirm &amp; Send</button>
      <button class="geo-modal-cancel" onclick="closeMatReqEmailPrompt()">Cancel</button>
    </div>`;
  ov.style.display = 'flex';
};
window.closeMatReqEmailPrompt = function(){
  const ov = document.getElementById('matReqEmailModalOverlay');
  if(ov) ov.style.display = 'none';
};
window.confirmMatReqEmailSelected = async function(siteId){
  const ticks = Array.from(document.querySelectorAll('.matReqEmailTick:checked')).map(el=>el.value);
  const extraInput = document.getElementById('matReqEmailExtraInput');
  const extra = extraInput ? extraInput.value.trim() : '';
  if(extra){
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(extra)){ toast('Enter a valid email address.'); return; }
    ticks.push(extra);
  }
  const recipients = Array.from(new Set(ticks));
  if(!recipients.length){ toast('Tick or enter at least one recipient.'); return; }
  const btn = document.getElementById('matReqEmailConfirmBtn');
  if(btn){ btn.disabled = true; btn.textContent = 'Sending…'; }
  const ids = Array.from(selectedMatReqIds);
  const [rows, suppliers] = await Promise.all([
    dbSelect('material_required_items', 'id=in.('+ids.join(',')+')&select=item,qty,supplier_id'),
    dbSelect('suppliers', 'org_id=eq.'+ME.org_id+'&select=id,name'),
  ]);
  const supplierName = id => { const s=suppliers.find(x=>x.id===id); return s ? s.name : null; };
  const items = rows.map(r=>({item:r.item, qty:r.qty, supplier_name: r.supplier_id ? supplierName(r.supplier_id) : null}));
  try{
    const res = await sbFetch('/functions/v1/send-material-list-email', {method:'POST', timeoutMs:60000, body: JSON.stringify({
      site_id: siteId, recipients, items, context_label: 'Collection List',
    })});
    const d = await res.json();
    if(res.ok && !d.error){
      const card = document.querySelector('#matReqEmailModalOverlay .geo-modal-card');
      if(card){
        card.innerHTML = `<h3>✓ Email sent</h3><p class="stub" style="margin:0 0 12px;">${items.length} item${items.length>1?'s':''} emailed to ${recipients.length} recipient${recipients.length>1?'s':''}.</p><button class="darkbtn" style="width:100%;" onclick="closeMatReqEmailPrompt();selectedMatReqIds=new Set();render()">Done</button>`;
      } else { closeMatReqEmailPrompt(); selectedMatReqIds = new Set(); toast('Email sent'); render(); }
    } else {
      console.error('send-material-list-email failed:', d.error || res.status);
      toast('Email failed — '+(d.error ? String(d.error).slice(0,140) : 'try again.'));
      if(btn){ btn.disabled = false; btn.textContent = 'Confirm & Send'; }
    }
  }catch(e){
    console.error('send-material-list-email failed:', e);
    toast('Email failed — could not reach the server.');
    if(btn){ btn.disabled = false; btn.textContent = 'Confirm & Send'; }
  }
};
// "Email Supplier" (item 19) — per supplier-group button on the Material
// List. Shows a confirm step (recipient address + item summary) before
// actually sending, same "preview before send" shape as openReemailPrompt.
window.openMatReqSupplierEmailPrompt = async function(siteId, supplierId){
  const suppliers = await dbSelect('suppliers', 'id=eq.'+supplierId+'&select=*');
  const supplier = suppliers && suppliers[0];
  if(!supplier){ toast('Could not find that supplier.'); return; }
  if(!supplier.email){ toast('This supplier has no email on file.'); return; }
  const statusQS = matReqFilter==='live' ? 'status=in.(open,assigned,collected)' : 'status=eq.closed';
  const rows = await dbSelect('material_required_items', 'site_id=eq.'+siteId+'&supplier_id=eq.'+supplierId+'&'+statusQS+'&select=item,qty');
  if(!rows.length){ toast('No items in this section.'); return; }
  let ov = document.getElementById('matReqSupplierEmailModalOverlay');
  if(!ov){
    ov = document.createElement('div');
    ov.id = 'matReqSupplierEmailModalOverlay';
    ov.className = 'geo-modal-overlay';
    ov.onclick = (e)=>{ if(e.target===ov) window.closeMatReqSupplierEmailPrompt(); };
    document.body.appendChild(ov);
  }
  ov.innerHTML = `
    <div class="geo-modal-card">
      <h3>Email ${escapeHtml(supplier.name)}</h3>
      <p class="stub" style="margin:0 0 10px;">Sending to <strong>${escapeHtml(supplier.email)}</strong> — ${rows.length} item${rows.length>1?'s':''}:</p>
      <div style="max-height:180px;overflow-y:auto;margin-bottom:14px;border:1px solid var(--line);border-radius:8px;padding:8px 10px;">
        ${rows.map(r=>`<div style="font-size:12.5px;padding:3px 0;">${escapeHtml(r.item)}${r.qty?' — qty '+escapeHtml(r.qty):''}</div>`).join('')}
      </div>
      <button class="darkbtn" id="matReqSupplierEmailConfirmBtn" style="width:100%;" onclick="confirmMatReqSupplierEmail('${siteId}','${supplierId}','${jsAttr(supplier.name)}','${jsAttr(supplier.email)}')">Confirm &amp; Send</button>
      <button class="geo-modal-cancel" onclick="closeMatReqSupplierEmailPrompt()">Cancel</button>
    </div>`;
  ov.style.display = 'flex';
};
window.closeMatReqSupplierEmailPrompt = function(){
  const ov = document.getElementById('matReqSupplierEmailModalOverlay');
  if(ov) ov.style.display = 'none';
};
window.confirmMatReqSupplierEmail = async function(siteId, supplierId, supplierName, supplierEmail){
  const btn = document.getElementById('matReqSupplierEmailConfirmBtn');
  if(btn){ btn.disabled = true; btn.textContent = 'Sending…'; }
  const statusQS = matReqFilter==='live' ? 'status=in.(open,assigned,collected)' : 'status=eq.closed';
  const rows = await dbSelect('material_required_items', 'site_id=eq.'+siteId+'&supplier_id=eq.'+supplierId+'&'+statusQS+'&select=item,qty');
  const items = rows.map(r=>({item:r.item, qty:r.qty}));
  try{
    const res = await sbFetch('/functions/v1/send-material-list-email', {method:'POST', timeoutMs:60000, body: JSON.stringify({
      site_id: siteId, recipients:[supplierEmail], items, context_label: 'Collection List — '+supplierName,
    })});
    const d = await res.json();
    if(res.ok && !d.error){
      const card = document.querySelector('#matReqSupplierEmailModalOverlay .geo-modal-card');
      if(card){
        card.innerHTML = `<h3>✓ Email sent</h3><p class="stub" style="margin:0 0 12px;">The Collection List was emailed to ${escapeHtml(supplierName)}.</p><button class="darkbtn" style="width:100%;" onclick="closeMatReqSupplierEmailPrompt()">Done</button>`;
      } else { closeMatReqSupplierEmailPrompt(); toast('Email sent'); }
    } else {
      console.error('send-material-list-email failed:', d.error || res.status);
      toast('Email failed — '+(d.error ? String(d.error).slice(0,140) : 'try again.'));
      if(btn){ btn.disabled = false; btn.textContent = 'Confirm & Send'; }
    }
  }catch(e){
    console.error('send-material-list-email failed:', e);
    toast('Email failed — could not reach the server.');
    if(btn){ btn.disabled = false; btn.textContent = 'Confirm & Send'; }
  }
};

// Supplier duplicate detection — company names get typed inconsistently
// (case, punctuation, "Ltd"/"Limited", or plain typos), so a straight
// string-equality check misses obvious dupes. Two tiers:
//  - "blocked": normalized-identical, OR a 1-character edit apart on a
//    reasonably long name (e.g. "Alltype" vs "altype") — this is almost
//    certainly the same company typed slightly differently, so it's never
//    allowed, no override.
//  - "warn": more loosely similar (shared prefix/substring, or a modest
//    edit distance) — flagged, but a PM can confirm and add it anyway as a
//    genuinely different company.
function normalizeSupplierName(name){
  return String(name||'').toLowerCase().replace(/[^a-z0-9]+/g,'');
}
function levenshteinDistance(a,b){
  const m=a.length, n=b.length;
  if(!m) return n; if(!n) return m;
  let prev = Array.from({length:n+1}, (_,j)=>j);
  for(let i=1;i<=m;i++){
    const cur=[i];
    for(let j=1;j<=n;j++){
      cur[j] = a[i-1]===b[j-1] ? prev[j-1] : 1+Math.min(prev[j-1], prev[j], cur[j-1]);
    }
    prev=cur;
  }
  return prev[n];
}
function findSupplierConflict(name, suppliers, excludeId){
  const norm = normalizeSupplierName(name);
  if(!norm) return {blocked:null, warn:null};
  let warn = null;
  for(const s of suppliers){
    if(excludeId && s.id===excludeId) continue;
    const sNorm = normalizeSupplierName(s.name);
    if(!sNorm) continue;
    if(sNorm===norm) return {blocked:s, warn:null};
    const dist = levenshteinDistance(norm, sNorm);
    const shorter = Math.min(norm.length, sNorm.length);
    if(shorter>=5 && dist<=1) return {blocked:s, warn:null};
    if(!warn){
      const maxLen = Math.max(norm.length, sNorm.length) || 1;
      const ratio = 1 - dist/maxLen;
      if(ratio>=0.6 || norm.includes(sNorm) || sNorm.includes(norm)) warn = s;
    }
  }
  return {blocked:null, warn};
}
window.addSupplier = async function(siteId){
  const name = document.getElementById('supName').value.trim();
  const email = document.getElementById('supEmail').value.trim();
  if(!name || !email){ toast('Enter a supplier name and email.'); return; }
  const existing = await dbSelect('suppliers', 'org_id=eq.'+ME.org_id+'&select=id,name');
  const conflict = findSupplierConflict(name, existing);
  if(conflict.blocked){ customAlert(`"${escapeHtml(conflict.blocked.name)}" is already a supplier — that looks like the same company under a slightly different spelling, so it can't be added again.`); return; }
  if(conflict.warn){
    const ok = await customConfirm(`This looks similar to an existing supplier, "${conflict.warn.name}" — add "${name}" anyway as a separate supplier?`);
    if(!ok) return;
  }
  const rows = await dbInsert('suppliers', {org_id: ME.org_id, name, email, created_by: ME.id});
  if(rows){ toast('Supplier added'); supplierAddOpen = false; render(); }
};
window.saveSupplierField = async function(input, supplierId, field){
  const val = input.value.trim();
  if(!val){ toast((field==='name'?'Supplier name':'Email')+' can\'t be empty.'); render(); return; }
  if(val === input.defaultValue) return;
  if(field==='name'){
    const existing = await dbSelect('suppliers', 'org_id=eq.'+ME.org_id+'&select=id,name');
    const conflict = findSupplierConflict(val, existing, supplierId);
    if(conflict.blocked){ toast(`"${conflict.blocked.name}" already exists — not saved.`); render(); return; }
    if(conflict.warn){
      const ok = await customConfirm(`This looks similar to an existing supplier, "${conflict.warn.name}" — rename to "${val}" anyway?`);
      if(!ok){ render(); return; }
    }
  }
  const row = await dbUpdate('suppliers', supplierId, {[field]:val});
  if(row) toast('Supplier updated');
};
window.importSuppliersExcel = async function(input, siteId){
  const file = input.files && input.files[0]; if(!file) return;
  if(!(await loadLib('XLSX'))){ toast('Excel library failed to load — check connection.'); return; }
  try{
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, {type:'array'});
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, {header:1});
    if(!rows.length){ toast('No rows found in that file.'); return; }
    // Try to find "Name"/"Email" columns from a header row; fall back to
    // column A = name, column B = email if no matching header is found.
    let nameCol = 0, emailCol = 1, startRow = 0;
    const header = (rows[0]||[]).map(c=>String(c||'').trim().toLowerCase());
    const nameIdx = header.findIndex(h=>h.includes('name'));
    const emailIdx = header.findIndex(h=>h.includes('email'));
    if(nameIdx>-1 || emailIdx>-1){
      if(nameIdx>-1) nameCol = nameIdx;
      if(emailIdx>-1) emailCol = emailIdx;
      startRow = 1;
    }
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    // Dedupe against suppliers already on file AND against rows already
    // accepted earlier in this same import, so two near-identical rows in
    // one spreadsheet don't both get added.
    const seen = await dbSelect('suppliers', 'org_id=eq.'+ME.org_id+'&select=id,name');
    const found = [];
    let skippedDupe = 0; const skippedSimilar = [];
    for(let i=startRow;i<rows.length;i++){
      const r = rows[i]; if(!r) continue;
      const name = String(r[nameCol]!=null?r[nameCol]:'').trim();
      const email = String(r[emailCol]!=null?r[emailCol]:'').trim();
      if(!name || !EMAIL_RE.test(email)) continue;
      const conflict = findSupplierConflict(name, seen);
      if(conflict.blocked){ skippedDupe++; continue; }
      if(conflict.warn){ skippedSimilar.push(name+' (like "'+conflict.warn.name+'")'); continue; }
      found.push({org_id:ME.org_id, name, email, created_by:ME.id});
      seen.push({id:null, name});
    }
    if(!found.length){
      toast((skippedDupe || skippedSimilar.length) ? 'Nothing new to import — every row matched an existing (or similar) supplier.' : 'Could not find any name + email pairs — check the file has Name/Email columns (or Name in column A, Email in column B).');
      return;
    }
    const inserted = await dbInsert('suppliers', found);
    if(inserted){
      let msg = `${found.length} supplier${found.length===1?'':'s'} imported`;
      if(skippedDupe) msg += `, ${skippedDupe} skipped (already exists)`;
      if(skippedSimilar.length) msg += `, ${skippedSimilar.length} skipped as possible duplicates`;
      toast(msg);
      if(skippedSimilar.length) customAlert('Skipped as possible duplicates — add manually below if these are genuinely different companies: '+skippedSimilar.join(', '));
      supplierAddOpen = false; render();
    }
  }catch(e){ toast('Could not read that file — check it\'s a valid .xlsx or .csv.'); }
};
window.deleteSupplier = async function(siteId, supplierId){
  if(!await customConfirm('Remove this supplier?')) return;
  const ok = await dbDelete('suppliers', supplierId);
  if(ok){ toast('Supplier removed'); render(); }
};
