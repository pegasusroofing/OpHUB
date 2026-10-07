/* ================= MATERIAL PO's (PM/admin-managed folders of order files, per site — the main
   folder is auto-synced daily from a linked OneDrive folder for PMs; synced files can then be
   moved into sub-folders by anyone who can manage them) ================= */
let materialOrdersSyncBusy = false;
const autoSyncedMaterialSites = new Set(); // site ids already auto-synced this session, avoids re-checking every render
let matOrderUploadOpen = false;
let matOrderNewFolderOpen = false;
let matOrdersLastFolderId; // undefined initially so the very first render always "changes"
let matOrderMoveOpenId = null; // file id whose "move to folder" picker is showing
function materialOrderFolderPath(folders, id){
  const byId = {}; folders.forEach(f=>byId[f.id]=f);
  const parts = []; let cur = byId[id]; let guard = 0;
  while(cur && guard++<10){ parts.unshift(cur.name); cur = cur.parent_id ? byId[cur.parent_id] : null; }
  return parts.join(' / ');
}
// "+" asks Add Folder vs Add Document — PMs and admins (the only ones who see
// the OneDrive sync section itself) also get a third option to change the
// synced folder, so that control lives in the same place as everything else
// that touches this folder's contents, rather than a separate card only they
// can see.
window.showMaterialOrderAddMenu = function(siteId, folderId, isPmView, linked){
  let ov = document.getElementById('confirmModalOverlay');
  if(!ov){
    ov = document.createElement('div');
    ov.id = 'confirmModalOverlay';
    ov.className = 'geo-modal-overlay';
    document.body.appendChild(ov);
  }
  ov.onclick = (e)=>{ if(e.target===ov) ov.style.display='none'; };
  ov.innerHTML = `
    <div class="geo-modal-card">
      <p class="stub" style="margin:0 0 18px;font-weight:600;color:var(--ink);">What would you like to add?</p>
      <button class="darkbtn" style="width:100%;margin-bottom:8px;" onclick="document.getElementById('confirmModalOverlay').style.display='none';matOrderNewFolderOpen=true;matOrderUploadOpen=false;render()">📁 Add Folder</button>
      <button class="darkbtn" style="width:100%;margin-bottom:8px;" onclick="document.getElementById('confirmModalOverlay').style.display='none';matOrderUploadOpen=true;matOrderNewFolderOpen=false;render()">📄 Add Document</button>
      ${isPmView && linked ? `<button class="darkbtn" style="width:100%;margin-bottom:8px;" onclick="document.getElementById('confirmModalOverlay').style.display='none';syncMaterialOrdersNow('${siteId}')">🔄 Sync Now</button>` : ''}
      ${isPmView ? `<button class="darkbtn" style="width:100%;margin-bottom:8px;" onclick="document.getElementById('confirmModalOverlay').style.display='none';startOneDriveFolderPicker('${siteId}','materials')">🔗 ${linked?'Change':'Link'} OneDrive Sync Folder</button>` : ''}
      ${isPmView && linked ? `<button class="darkbtn" style="width:100%;margin-bottom:8px;background:var(--warn);border-color:var(--warn);" onclick="document.getElementById('confirmModalOverlay').style.display='none';unlinkMaterialOrdersFolder('${siteId}')">🔓 Unlink Folder</button>` : ''}
      <button class="geo-modal-cancel" onclick="document.getElementById('confirmModalOverlay').style.display='none';">Cancel</button>
    </div>`;
  ov.style.display = 'flex';
};
async function renderMaterialOrders(siteId, folderId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  if(!isManager(ME)){ toast('Project managers and admins only.'); go(`#/site/${siteId}/home`); return; }
  // PMs and admins both see the OneDrive sync controls (company admins have
  // full PM-level access to every site already, same as everywhere else in
  // the app) — operatives don't reach this page at all (gated above).
  const isPmView = isManager(ME);
  if(matOrdersLastFolderId !== (folderId||null)){
    matOrderNewFolderOpen = false;
    matOrderUploadOpen = false;
    matOrderMoveOpenId = null;
    matOrdersLastFolderId = folderId||null;
  }
  let currentFolder = null;
  if(folderId){
    const rows = await dbSelect('material_order_folders', 'id=eq.'+folderId+'&select=*');
    currentFolder = rows[0] || null;
    if(!currentFolder){ go(`#/site/${siteId}/materialorders`); return; }
  }
  const [subfolders, files, allFolders] = await Promise.all([
    dbSelect('material_order_folders', 'site_id=eq.'+siteId+'&'+(folderId?'parent_id=eq.'+folderId:'parent_id=is.null')+'&order=position.asc.nullslast,name.asc'),
    dbSelect('material_order_files', 'site_id=eq.'+siteId+'&'+(folderId?'folder_id=eq.'+folderId:'folder_id=is.null')+'&order=position.asc.nullslast,synced_at.desc'),
    dbSelect('material_order_folders', 'site_id=eq.'+siteId+'&order=name.asc'),
  ]);
  const linked = !!site.material_orders_folder_id;
  // Auto-refresh the synced folder when a PM/admin opens the main Material
  // PO folder — but only once per calendar day (checked against the site's
  // last-synced timestamp), so we're not hammering the sync function on
  // every visit. Fires quietly in the background; syncMaterialOrdersNow
  // itself already skips/no-ops server-side if nothing has changed.
  if(isPmView && linked && !currentFolder && !autoSyncedMaterialSites.has(siteId)){
    autoSyncedMaterialSites.add(siteId);
    const lastSync = site.material_orders_last_synced_at ? new Date(site.material_orders_last_synced_at) : null;
    if(!lastSync || (Date.now() - lastSync.getTime()) > 24*60*60*1000){
      syncMaterialOrdersNow(siteId, true);
    }
  }
  const backHref = currentFolder ? (currentFolder.parent_id ? `#/site/${siteId}/materialorders/${currentFolder.parent_id}` : `#/site/${siteId}/materialorders`) : `#/site/${siteId}/materials`;
  const parentArg = folderId ? `'${folderId}'` : 'null';

  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    ${!currentFolder && isPmView ? `
    <div class="card">
      ${linked ? `
        <p class="stub" style="margin:0;color:var(--ok);">📁 Synced daily from "${escapeHtml(site.material_orders_folder_name||'')}" into this main folder${materialOrdersSyncBusy?' — syncing…':''}</p>
      ` : `
        <p class="stub" style="margin:0 0 10px;">Link a OneDrive folder and any files placed in it will sync here automatically once a day into this main folder — no need to upload anything by hand. You can also sync on demand any time, and move synced files into folders below once they've come in.</p>
        <button class="darkbtn" onclick="startOneDriveFolderPicker('${siteId}','materials')">Link OneDrive Folder</button>
      `}
    </div>
    ` : ''}
    <div class="drawheaderrow">
      <span>Folder/File Name</span>
      <div class="roundplusbtn" onclick="showMaterialOrderAddMenu('${siteId}',${parentArg},${isPmView},${linked})">+</div>
    </div>
    ${matOrderNewFolderOpen ? `
      <div class="card" style="margin-bottom:10px;">
        <div class="row-gap">
          <input type="text" id="newMaterialOrderFolderName" placeholder="e.g. Week Commencing 12 Aug">
          <button class="darkbtn" style="width:auto;padding:10px 16px;" onclick="createMaterialOrderFolder('${siteId}',${parentArg})">Create Folder</button>
        </div>
      </div>
    ` : ''}
    ${subfolders.length || files.length ? `
      ${subfolders.map((f,idx)=>`
        <div class="sitecard" style="cursor:pointer;" onclick="go('#/site/${siteId}/materialorders/${f.id}')">
          <div class="swatch">📁</div>
          <div class="info"><div class="name" style="font-weight:700;white-space:normal;word-break:break-word;">${escapeHtml(f.name)}</div><div class="addr">Folder</div></div>
          <div class="taskicons" onclick="event.stopPropagation();">
            ${rowActionsMenuHtml('matorderfolder-'+f.id, `
              <div class="statusmenu-item" style="${idx===0?'opacity:.4;pointer-events:none;':''}" onclick="rowActionsMenuOpenFor=null;moveMaterialOrderFolder('${siteId}',${parentArg},'${f.id}',-1)">▲ Move Up</div>
              <div class="statusmenu-item" style="${idx===subfolders.length-1?'opacity:.4;pointer-events:none;':''}" onclick="rowActionsMenuOpenFor=null;moveMaterialOrderFolder('${siteId}',${parentArg},'${f.id}',1)">▼ Move Down</div>
              <div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;renameMaterialOrderFolder('${f.id}','${jsAttr(f.name)}')">✏️ Rename</div>
              <div class="statusmenu-item danger" onclick="rowActionsMenuOpenFor=null;deleteMaterialOrderFolder('${f.id}')">🗑 Delete</div>
            `)}
          </div>
        </div>
      `).join('')}
      ${files.map((f,fidx)=>`
        <div class="card" style="padding:10px 12px;margin-bottom:10px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <div class="swatch" style="flex:0 0 36px;width:36px;height:36px;font-size:16px;">📦</div>
            <div style="flex:1;min-width:0;">
              <div style="font-weight:700;font-size:14px;color:var(--ink);overflow-wrap:break-word;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${escapeHtml(f.name)}</div>
              ${f.synced_at ? `<div class="meta" style="margin-top:2px;font-size:9.5px;">Synced ${new Date(f.synced_at).toLocaleDateString(undefined,{day:'2-digit',month:'short'})}</div>` : ''}
            </div>
            <div style="flex:0 0 auto;text-align:center;cursor:pointer;" onclick="event.stopPropagation();changeMaterialDeliveryDate('${siteId}','${f.id}','${f.scheduled_delivery_date||''}','${jsAttr(f.name)}')">
              ${f.scheduled_delivery_date ? `
                <div style="background:var(--warn-bg);border:1.5px solid var(--warn);border-radius:8px;padding:6px 10px;min-width:62px;">
                  <div style="font-size:8.5px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--warn);">🚚 Delivery</div>
                  <div style="font-size:14.5px;font-weight:800;color:var(--warn);margin-top:1px;white-space:nowrap;">${new Date(f.scheduled_delivery_date+'T00:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short'})}</div>
                </div>
              ` : `
                <div style="font-size:9.5px;color:var(--blue);text-decoration:underline;white-space:nowrap;padding:6px 4px;">+ Set<br>date</div>
              `}
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;margin-top:8px;">
            <button class="darkbtn" style="flex:1;width:auto;padding:8px 10px;" onclick="viewMaterialOrderFile('${siteId}','${jsAttr(f.storage_path)}','${jsAttr(f.name)}')">View document</button>
            <div onclick="event.stopPropagation();">
              ${rowActionsMenuHtml('matorderfile-'+f.id, `
                <div class="statusmenu-item" style="${fidx===0?'opacity:.4;pointer-events:none;':''}" onclick="rowActionsMenuOpenFor=null;moveMaterialOrderFile('${siteId}',${parentArg},'${f.id}',-1)">▲ Move Up</div>
                <div class="statusmenu-item" style="${fidx===files.length-1?'opacity:.4;pointer-events:none;':''}" onclick="rowActionsMenuOpenFor=null;moveMaterialOrderFile('${siteId}',${parentArg},'${f.id}',1)">▼ Move Down</div>
                <div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;toggleMoveMaterialOrderFile('${f.id}')">📁 Move to folder</div>
                ${f.calendar_event_id ? `<div class="statusmenu-item" style="font-size:11.5px;" onclick="rowActionsMenuOpenFor=null;removeMaterialDeliveryLink('${siteId}','${f.id}')">🔗 Remove delivery link</div>` : ''}
                <div class="statusmenu-item danger" onclick="rowActionsMenuOpenFor=null;deleteMaterialOrderFile('${siteId}','${f.id}','${jsAttr(f.storage_path)}')">🗑 Delete</div>
              `)}
            </div>
          </div>
          ${matOrderMoveOpenId===f.id ? `
            <div class="formfield" style="margin-top:8px;">
              <select onchange="moveMaterialOrderFileToFolder('${siteId}','${f.id}',this.value)">
                <option value="">— Main Material PO folder —</option>
                ${allFolders.map(af=>`<option value="${af.id}" ${f.folder_id===af.id?'selected':''}>${escapeHtml(materialOrderFolderPath(allFolders, af.id))}</option>`).join('')}
              </select>
            </div>
          ` : ''}
        </div>
      `).join('')}
    ` : `<div class="empty">${folderId ? 'Nothing in this folder yet.' : (linked ? 'Nothing synced yet — tap Sync Now, or wait for the daily sync.' : 'No material order files yet.')}</div>`}

    ${matOrderUploadOpen ? `
      <div class="card" style="margin-top:10px;">
        <p class="sectiontitle" style="margin-top:0;">Add document</p>
        <p class="stub" style="margin:0 0 8px;">Uploads into ${currentFolder ? '"'+escapeHtml(currentFolder.name)+'"' : 'the main Material PO folder'}.</p>
        <div class="ghostbtn" style="cursor:pointer;text-align:center;" id="matOrderUploadLabel" onclick="document.getElementById('matOrderUploadInput').click()">Choose file(s)</div>
        <input type="file" id="matOrderUploadInput" multiple style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;" onchange="uploadMaterialOrderDocument(this,'${siteId}',${parentArg})">
        <button class="ghostbtn" style="margin-top:8px;" onclick="matOrderUploadOpen=false;render()">Cancel</button>
      </div>
    ` : ''}
  `, {title: currentFolder ? currentFolder.name : "Material PO's", subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:backHref, siteId, activeTab:'more'}); }
}
window.createMaterialOrderFolder = async function(siteId, folderId){
  const input = document.getElementById('newMaterialOrderFolderName');
  const name = input ? input.value.trim() : '';
  if(!name){ toast('Enter a folder name.'); return; }
  const rows = await dbInsert('material_order_folders', {site_id:siteId, parent_id:folderId||null, name, created_by:ME.id});
  if(rows){ toast('Folder created'); matOrderNewFolderOpen = false; render(); }
};
window.renameMaterialOrderFolder = async function(folderId, currentName){
  const next = await customPrompt('Rename folder', currentName);
  if(next==null) return;
  const trimmed = next.trim();
  if(!trimmed || trimmed===currentName) return;
  const row = await dbUpdate('material_order_folders', folderId, {name: trimmed});
  if(row){ toast('Folder renamed'); render(); }
};
window.moveMaterialOrderFolder = async function(siteId, parentFolderId, folderId, dir){
  const siblings = await dbSelect('material_order_folders', 'site_id=eq.'+siteId+'&'+(parentFolderId?'parent_id=eq.'+parentFolderId:'parent_id=is.null')+'&order=position.asc.nullslast,name.asc');
  await Promise.all(siblings.map((f,idx)=> f.position!==idx ? dbUpdate('material_order_folders', f.id, {position:idx}) : null));
  const idx = siblings.findIndex(f=>f.id===folderId);
  const swapIdx = idx + dir;
  if(idx<0 || swapIdx<0 || swapIdx>=siblings.length) return;
  await Promise.all([
    dbUpdate('material_order_folders', siblings[idx].id, {position:swapIdx}),
    dbUpdate('material_order_folders', siblings[swapIdx].id, {position:idx}),
  ]);
  render();
};
window.deleteMaterialOrderFolder = async function(folderId){
  if(!await customConfirm('Delete this folder? Any documents inside will move back to the main Material PO folder — nothing is deleted.')) return;
  const rows = await dbSelect('material_order_folders', 'id=eq.'+folderId+'&select=site_id,name');
  const folderRow = rows[0];
  await sbFetch('/rest/v1/material_order_files?folder_id=eq.'+folderId, {method:'PATCH', body: JSON.stringify({folder_id:null})});
  const ok = await dbDelete('material_order_folders', folderId);
  if(ok){ toast('Folder deleted'); if(folderRow) logSiteActivity(folderRow.site_id, 'material_order_folder_deleted', `Deleted Material PO folder "${folderRow.name||''}"`); render(); }
};
window.moveMaterialOrderFile = async function(siteId, parentFolderId, fileId, dir){
  const siblings = await dbSelect('material_order_files', 'site_id=eq.'+siteId+'&'+(parentFolderId?'folder_id=eq.'+parentFolderId:'folder_id=is.null')+'&order=position.asc.nullslast,synced_at.desc');
  await Promise.all(siblings.map((f,idx)=> f.position!==idx ? dbUpdate('material_order_files', f.id, {position:idx}) : null));
  const idx = siblings.findIndex(f=>f.id===fileId);
  const swapIdx = idx + dir;
  if(idx<0 || swapIdx<0 || swapIdx>=siblings.length) return;
  await Promise.all([
    dbUpdate('material_order_files', siblings[idx].id, {position:swapIdx}),
    dbUpdate('material_order_files', siblings[swapIdx].id, {position:idx}),
  ]);
  render();
};
window.toggleMoveMaterialOrderFile = function(fileId){
  matOrderMoveOpenId = matOrderMoveOpenId===fileId ? null : fileId;
  render();
};
window.moveMaterialOrderFileToFolder = async function(siteId, fileId, folderId){
  const row = await dbUpdate('material_order_files', fileId, {folder_id: folderId||null});
  if(row){ toast('Moved'); matOrderMoveOpenId = null; render(); }
};
window.deleteMaterialOrderFile = async function(siteId, fileId, storagePath){
  if(!await customConfirm('Delete this document? This can\'t be undone — if it\'s still in the linked OneDrive folder it won\'t be re-synced automatically.')) return;
  // Clean up a linked scheduled-delivery calendar entry too, if there is
  // one — otherwise it'd be left behind on the Calendar with nothing to
  // point back to.
  const rows = await dbSelect('material_order_files', 'id=eq.'+fileId+'&select=calendar_event_id,name');
  const linkedEventId = rows[0] && rows[0].calendar_event_id;
  const fileName = rows[0] && rows[0].name;
  const ok = await dbDelete('material_order_files', fileId);
  if(ok){
    if(storagePath){ try{ await sbFetch('/storage/v1/object/material-orders/'+storagePath, {method:'DELETE'}); }catch(e){ /* non-fatal */ } }
    if(linkedEventId){ try{ await dbDelete('site_calendar_events', linkedEventId); }catch(e){ /* non-fatal */ } }
    toast('Document deleted');
    logSiteActivity(siteId, 'material_order_file_deleted', `Deleted Material PO document "${fileName||''}"`);
    render();
  }
};
window.uploadMaterialOrderDocument = async function(input, siteId, folderId){
  const files = input.files ? Array.from(input.files) : [];
  if(!files.length) return;
  const label = document.getElementById('matOrderUploadLabel');
  let uploaded = 0;
  for(let i=0;i<files.length;i++){
    const file = files[i];
    if(label) label.textContent = `Uploading ${i+1} of ${files.length}…`;
    const path = siteId+'/manual/'+uid()+'-'+file.name.replace(/[^a-z0-9.\-]+/gi,'_');
    const stored = await uploadToStorage('material-orders', path, file, file.type||'application/octet-stream');
    if(!stored) continue;
    const rows = await dbInsert('material_order_files', {site_id:siteId, org_id:ME.org_id, folder_id:folderId||null, name:file.name, item_id:'manual-'+uid(), storage_path:stored, size:file.size||null});
    if(rows) uploaded++;
  }
  if(uploaded){ toast(uploaded===1 ? 'Document added' : `${uploaded} documents added`); matOrderUploadOpen = false; }
  render();
};
window.syncMaterialOrdersNow = async function(siteId, silent){
  materialOrdersSyncBusy = true; if(!silent) render();
  try{
    const res = await sbFetchOD('/functions/v1/sync-material-orders', {method:'POST', body: JSON.stringify({site_id:siteId})});
    const d = await res.json();
    if(!res.ok || d.error){ if(!silent) toast('Sync failed — '+(d.error||res.status)); }
    else{
      if(!silent) toast(d.synced ? `Synced ${d.synced} new file${d.synced===1?'':'s'}`+(d.dupSkipped?` (${d.dupSkipped} duplicate${d.dupSkipped===1?'':'s'} skipped)`:'') : (d.dupSkipped ? `Already up to date — ${d.dupSkipped} duplicate${d.dupSkipped===1?'':'s'} skipped.` : 'Already up to date.'));
      const nowIso = new Date().toISOString();
      dbUpdate('sites', siteId, {material_orders_last_synced_at: nowIso});
      const s = SITES.find(x=>x.id===siteId); if(s) s.material_orders_last_synced_at = nowIso;
    }
  }catch(e){ console.error(e); if(!silent) toast('Sync failed — could not reach the server.'); }
  materialOrdersSyncBusy = false; render();
};
window.viewMaterialOrderFile = async function(siteId, storagePath, name){
  try{
    const res = await sbFetchOD('/functions/v1/material-order-file-access', {method:'POST', body: JSON.stringify({site_id:siteId, storage_path:storagePath})});
    const d = await res.json();
    if(!res.ok || d.error){ toast('Could not open file — '+(d.error||res.status)); return; }
    viewDrawing(d.url, /\.(png|jpe?g|gif|webp)$/i.test(name), name);
  }catch(e){ toast('Could not open file.'); }
};
// Scheduled delivery date on a Material PO file — kept in sync with a
// linked site_calendar_events row (via calendar_event_id) so the date only
// ever needs setting/changing in one place and both stay consistent:
// changing it here moves the existing calendar entry rather than creating
// a duplicate each time, and clearing it removes the calendar entry too.
window.changeMaterialDeliveryDate = async function(siteId, fileId, currentDate, fileName){
  const next = await customDatePrompt('Scheduled delivery — '+fileName, currentDate);
  if(next===null) return;
  const rows = await dbSelect('material_order_files', 'id=eq.'+fileId+'&select=calendar_event_id');
  const existingEventId = rows[0] && rows[0].calendar_event_id;
  let newEventId = existingEventId || null;
  if(!next){
    if(existingEventId) await dbDelete('site_calendar_events', existingEventId);
    newEventId = null;
  } else if(existingEventId){
    await dbUpdate('site_calendar_events', existingEventId, {event_date: next, reminder_sent:false});
  } else {
    const evRows = await dbInsert('site_calendar_events', {site_id:siteId, org_id:ME.org_id, title:'Delivery: '+fileName, event_date: next, is_private:false, reminder_recipient_ids:[], created_by:ME.id});
    newEventId = (evRows && evRows[0]) ? evRows[0].id : null;
  }
  const row = await dbUpdate('material_order_files', fileId, {scheduled_delivery_date: next||null, calendar_event_id: newEventId});
  if(row){ toast(next ? 'Delivery date set — added to the Calendar' : 'Delivery date cleared'); render(); }
};
// Small "remove link" action (#285) — unlinks a synced file's delivery date
// from the Calendar without going through the date-change prompt. Same
// underlying effect as clearing the date in changeMaterialDeliveryDate above.
window.removeMaterialDeliveryLink = async function(siteId, fileId){
  if(!await customConfirm('Remove the delivery date link for this file? The Calendar entry will be deleted.')) return;
  const rows = await dbSelect('material_order_files', 'id=eq.'+fileId+'&select=calendar_event_id');
  const existingEventId = rows[0] && rows[0].calendar_event_id;
  if(existingEventId) await dbDelete('site_calendar_events', existingEventId);
  const row = await dbUpdate('material_order_files', fileId, {scheduled_delivery_date: null, calendar_event_id: null});
  if(row){ toast('Delivery link removed'); render(); }
};
