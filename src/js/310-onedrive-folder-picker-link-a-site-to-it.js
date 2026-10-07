/* ================= ONEDRIVE FOLDER PICKER (link a site to its real, existing project folder) =================
   A folder can either live in the connected account's own OneDrive (driveId
   null — addressed via /me/drive/...) or in a DIFFERENT drive that's been
   shared with them — another person's OneDrive, or a SharePoint document
   library (driveId set — addressed via /drives/{driveId}/...).

   There are two separate ways a folder can be "not really mine" and they
   need different Graph calls to find:
     - Someone individually shared it with this account → /me/drive/sharedWithMe
       (the "🔗 Shared with me" virtual entry).
     - It's visible because this account is a member of a SharePoint team
       site (e.g. everyone at the company can see the org's shared folder,
       nobody explicitly "shared" it with any one person) → /sites then
       /sites/{id}/drives (the "🏢 Company Sites" virtual entry, which lists
       sites and then that site's document libraries).
   Both virtual entries only exist client-side to get the picker into that
   mode — they're not real Graph items. */
const SHARED_ROOT_ID = '__SHARED__';
const SITES_ROOT_ID = '__SITES__';
let odPickerStack = null; // array of {id, name, driveId, isSite} — first entry is always the OneDrive root
let odPickerFolders = [];
let odPickerError = null;
// This same picker is reused for two different site-level folder links —
// 'progress' (photo sync + Drawings import, the original use) and
// 'materials' (Material Orders auto-sync). The target decides which columns
// get written and which page "Use this folder" sends you back to.
let odPickerTarget = 'progress';
// Admin Centre > Integrations > "Synced per site" row action dropdown —
// same compact select-driven pattern as the per-site Sync Folder section,
// just with an extra "Open Site Admin" option since this list spans sites.
window.syncedSiteAction = function(siteId, action){
  if(action==='admin') go(`#/site/${siteId}/team`);
  else if(action==='sync') manualSyncSiteOneDrive(siteId);
};
window.onedriveFolderAction = function(siteId, action){
  if(action==='change') startOneDriveFolderPicker(siteId, 'progress');
  else if(action==='unlink') unlinkOneDriveFolder(siteId);
};
let siteOdSyncBusy = null;
// Manual two-way sync for a site's linked OneDrive folder: pulls in any
// files sitting at the top level of the linked folder that aren't already
// imported as Drawings (matched by name), and confirms the push side —
// every Drawings upload already pushes out to this folder automatically
// (see pushDrawingToOneDrive) — is caught up. One tap, no folder browsing.
window.manualSyncSiteOneDrive = async function(siteId){
  const site = SITES.find(s=>s.id===siteId);
  if(!site || !site.onedrive_folder_id) return;
  siteOdSyncBusy = siteId; render();
  try{
    const body = {parent_id: site.onedrive_folder_id, drive_id: site.onedrive_drive_id||undefined, includeFiles:true};
    const res = await sbFetchODIdempotent('/functions/v1/onedrive-list-folders', {method:'POST', body:JSON.stringify(body)});
    const d = await res.json();
    if(!res.ok || d.error){ toast('Sync failed — '+(d.error||res.status)); siteOdSyncBusy=null; render(); return; }
    const remoteFiles = d.files || [];
    const existing = await dbSelect('drawing_files', 'site_id=eq.'+siteId+'&folder_id=is.null&select=name');
    const existingNames = new Set(existing.map(f=>f.name));
    let pulled = 0, failed = 0;
    for(const f of remoteFiles){
      if(existingNames.has(f.name)) continue;
      try{
        const dres = await sbFetchODIdempotent('/functions/v1/onedrive-download-file', {method:'POST', body:JSON.stringify({item_id:f.id, drive_id:f.driveId||null, name:f.name})});
        const dd = await dres.json();
        if(!dres.ok || dd.error || !dd.content_base64){ failed++; continue; }
        const bytes = Uint8Array.from(atob(dd.content_base64), c=>c.charCodeAt(0));
        const blob = new Blob([bytes]);
        const path = siteId+'/root/'+uid()+'-'+f.name.replace(/[^a-z0-9.\-]+/gi,'_');
        const stored = await uploadToStorage('drawings', path, blob, 'application/octet-stream');
        if(!stored){ failed++; continue; }
        const rows = await dbInsert('drawing_files', {site_id:siteId, folder_id:null, name:f.name, storage_path:stored, uploaded_by:ME.id});
        if(rows) pulled++; else failed++;
      }catch(e){ failed++; }
    }
    const row = await dbUpdate('sites', siteId, {onedrive_last_synced_at: new Date().toISOString()});
    if(row){ const idx = SITES.findIndex(s=>s.id===siteId); if(idx>-1) SITES[idx] = row; }
    toast(`Synced — ${pulled} pulled in${failed?`, ${failed} failed`:''}. Uploads here already push out automatically.`);
  }catch(e){ toast('Sync failed — could not reach the server.'); }
  siteOdSyncBusy = null; render();
};
window.startOneDriveFolderPicker = function(siteId, target){
  odPickerTarget = target || 'progress';
  odPickerStack = [{id:null, name:'OneDrive', driveId:null}];
  odPickerFolders = [];
  odPickerError = null;
  go(`#/site/${siteId}/onedrive-folder`);
};
// Operative-level variant — each operative links their OWN OneDrive folder
// (not a shared/root one), done only from their own record in the
// Operatives area. Same picker UI/logic, just keyed to odPickerOperativeId
// instead of a siteId.
// Per-job variant — each repair job can link its own OneDrive folder (all
// photos/work-order/notes for that job push straight there instead of an
// auto-created subfolder under the site's own linked folder). Prompted
// straight after a new job is created (see addRepairJob) and re-openable
// any time from the job's info card.
let odPickerJobId = null;
window.startRepairJobFolderPicker = function(siteId, jobId){
  odPickerTarget = 'repairjob';
  odPickerJobId = jobId;
  odPickerStack = [{id:null, name:'OneDrive', driveId:null}];
  odPickerFolders = [];
  odPickerError = null;
  go(`#/site/${siteId}/repairjob/${jobId}/onedrive-folder`);
};
let odPickerOperativeId = null;
window.startOperativeFolderPicker = function(operativeId){
  odPickerTarget = 'operative';
  odPickerOperativeId = operativeId;
  odPickerStack = [{id:null, name:'OneDrive', driveId:null}];
  odPickerFolders = [];
  odPickerError = null;
  go(`#/operatives/${operativeId}/onedrive-folder`);
};
// Admin Centre > Integrations > Quick Links — lets a PM/admin browse straight
// to a deep company folder (e.g. Live Projects, 15 clicks deep) once and pin
// it org-wide, so it then shows as a one-tap shortcut at the root of every
// OneDrive folder picker (site sync, Material PO's, operative folders) —
// see the "⭐ Quick Links" section in renderOneDriveFolderPicker below.
window.startQuickLinkPicker = function(){
  odPickerTarget = 'quicklink';
  odPickerStack = [{id:null, name:'OneDrive', driveId:null}];
  odPickerFolders = [];
  odPickerError = null;
  go('#/team/onedrive-quicklinks');
};
async function loadOdPickerFolders(){
  const current = odPickerStack[odPickerStack.length-1];
  try{
    const body = current.id===SHARED_ROOT_ID
      ? {shared:true}
      : current.id===SITES_ROOT_ID
        ? {companySites:true}
        : current.isSite
          ? {company_site_id: current.id}
          : current.driveId
            ? {parent_id: current.id, drive_id: current.driveId}
            : {parent_id: current.id};
    const res = await sbFetchODIdempotent('/functions/v1/onedrive-list-folders', {method:'POST', body: JSON.stringify(body)});
    const d = await res.json();
    if(!res.ok || d.error){ odPickerError = d.error || 'Could not load OneDrive folders.'; odPickerFolders = []; }
    else {
      odPickerFolders = d.folders || [];
      odPickerError = null;
      // At the true root of the user's own OneDrive, also offer the two
      // ways into folders that aren't in their own drive at all — see the
      // comment above.
      if(current.id===null && !current.driveId){
        odPickerFolders = [
          {id:SHARED_ROOT_ID, name:'🔗 Shared with me', driveId:null, virtual:true},
          {id:SITES_ROOT_ID, name:'🏢 Company Sites', driveId:null, virtual:true},
          ...odPickerFolders,
        ];
      }
    }
  }catch(e){ odPickerError = 'Could not reach OneDrive.'; odPickerFolders = []; }
}
async function renderOneDriveFolderPicker(siteId){
  const __gen = RENDER_GEN;
  const site = siteId ? SITES.find(s=>s.id===siteId) : null;
  const pickerOperative = odPickerTarget==='operative' ? PROFILES[odPickerOperativeId] : null;
  let pickerJob = null;
  if(odPickerTarget==='repairjob' && odPickerJobId){
    pickerJob = (repairJobDetailCurrent && repairJobDetailCurrent.id===odPickerJobId) ? repairJobDetailCurrent : null;
    if(!pickerJob){
      const rows = await dbSelect('repair_jobs', 'id=eq.'+odPickerJobId+'&select=id,address,job_number');
      pickerJob = rows && rows[0];
    }
  }
  if(!odPickerStack) odPickerStack = [{id:null, name:'OneDrive', driveId:null}];
  await loadOdPickerFolders();
  const current = odPickerStack[odPickerStack.length-1];
  const canUseCurrent = current.id && current.id!==SHARED_ROOT_ID && current.id!==SITES_ROOT_ID && !current.isSite;
  const emptyMsg = current.id===SHARED_ROOT_ID ? 'Nothing has been shared with this account yet.'
    : current.id===SITES_ROOT_ID ? 'No SharePoint sites found for this account.'
    : current.isSite ? 'No document libraries in this site.'
    : 'No subfolders here.';
  // Favourited folders — org-wide, so any PM/admin can jump straight to a
  // deep folder (e.g. the RTB Roofing OneDrive root) without re-navigating
  // the whole path every time. Shown as quick-jump entries at the true root
  // of the picker only; pinning/unpinning happens from the "Use this
  // folder" screen below, on whichever folder you're currently sitting in.
  const pinned = (ORG && ORG.onedrive_pinned_folders) || [];
  const isCurrentPinned = canUseCurrent && pinned.some(p=>p.id===current.id);
  const atTrueRoot = current.id===null && !current.driveId;
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <p class="stub" style="margin:0 0 10px;">${odPickerStack.map(s=>escapeHtml(s.name)).join(' / ')}</p>
    ${odPickerStack.length>1 ? `<button class="ghostbtn" style="margin-bottom:14px;" onclick="odPickerUp()">‹ Back a folder</button>` : ''}
    ${odPickerError ? `
      <div class="card"><p class="stub" style="color:var(--warn);margin:0;">${escapeHtml(odPickerError)}</p></div>
    ` : `
      ${canUseCurrent ? `
        <div style="display:flex;gap:8px;margin-bottom:14px;">
          ${odPickerTarget==='quicklink' ? `
            <button class="darkbtn" style="flex:1;" ${isCurrentPinned?'disabled':''} onclick="pinAsQuickLink('${current.id}','${jsAttr(current.name)}','${current.driveId||''}')">${isCurrentPinned?`✓ "${escapeHtml(current.name)}" is already a Quick Link`:`Add "${escapeHtml(current.name)}" as a Quick Link`}</button>
          ` : `
            <button class="darkbtn" style="flex:1;" onclick="selectOneDriveFolder(${siteId?`'${siteId}'`:'null'},'${current.id}','${jsAttr(current.name)}','${current.driveId||''}')">Use "${escapeHtml(current.name)}" as ${odPickerTarget==='repairjob'?`this job's folder`:siteId?"this site's folder":pickerOperative?`"${escapeHtml(pickerOperative.name)}"'s folder`:'the folder'}</button>
            <div class="taskicon" style="flex:0 0 auto;font-size:18px;" title="${isCurrentPinned?'Remove Quick Link':'Add as a Quick Link'}" onclick="toggleOdFolderPin('${current.id}','${jsAttr(current.name)}','${current.driveId||''}')">${isCurrentPinned?'⭐':'☆'}</div>
          `}
        </div>
      ` : `<p class="stub" style="margin:0 0 14px;">Open a folder below, then tap "${odPickerTarget==='quicklink'?'Add as a Quick Link':'Use this folder'}" once you're inside the right one.</p>`}
      ${atTrueRoot && pinned.length ? `
        <p class="sectiontitle" style="margin:0 0 8px;">⭐ Quick Links</p>
        ${pinned.map(p=>`
          <div class="sitecard">
            <div class="swatch" onclick="odPickerInto('${p.id}','${jsAttr(p.name)}','${p.driveId||''}',false)">⭐</div>
            <div class="info" onclick="odPickerInto('${p.id}','${jsAttr(p.name)}','${p.driveId||''}',false)"><div class="name">${escapeHtml(p.name)}</div></div>
            <div class="taskicon danger" title="Remove Quick Link" onclick="event.stopPropagation();toggleOdFolderPin('${p.id}','${jsAttr(p.name)}','${p.driveId||''}')">✕</div>
          </div>
        `).join('')}
        <p class="sectiontitle" style="margin:16px 0 8px;">Browse</p>
      ` : ''}
      ${odPickerFolders.map(f=>`
        <div class="sitecard" onclick="odPickerInto('${f.id}','${jsAttr(f.name)}','${f.driveId||''}',${f.isSite?'true':'false'})">
          <div class="swatch">${f.isSite?'🏢':f.virtual?'🔗':'📁'}</div>
          <div class="info"><div class="name">${escapeHtml(f.name)}</div></div>
        </div>
      `).join('') || `<div class="empty">${emptyMsg}</div>`}
    `}
  `, {title: odPickerTarget==='materials' ? "Choose Material PO's Folder" : odPickerTarget==='siteinductions' ? 'Choose Site Inductions Folder' : odPickerTarget==='quicklink' ? 'Add a Quick Link Folder' : odPickerTarget==='operative' ? 'Choose OneDrive Folder' : odPickerTarget==='repairjob' ? "Choose This Job's Folder" : 'Choose OneDrive Folder', subtitle: odPickerTarget==='repairjob' ? (pickerJob ? (pickerJob.address||'Repair Job') : '') : site ? site.name : pickerOperative ? pickerOperative.name : (ORG&&ORG.name)||'', siteNameSubtitle:true, back: odPickerTarget==='materials' ? `#/site/${siteId}/materialorders` : odPickerTarget==='siteinductions' ? `#/site/${siteId}/mc/site_inductions` : odPickerTarget==='quicklink' ? '#/team' : odPickerTarget==='operative' ? `#/operatives/${odPickerOperativeId}` : odPickerTarget==='repairjob' ? `#/site/${siteId}/repairjob/${odPickerJobId}` : `#/site/${siteId}/team`, siteId: siteId||undefined, tabs:false}); }
}
window.toggleOdFolderPin = async function(id, name, driveId){
  const pinned = (ORG && ORG.onedrive_pinned_folders) || [];
  const exists = pinned.some(p=>p.id===id);
  const next = exists ? pinned.filter(p=>p.id!==id) : [...pinned, {id, name, driveId: driveId||null}];
  const row = await dbUpdate('organizations', ME.org_id, {onedrive_pinned_folders: next});
  if(row){
    if(ORG) ORG.onedrive_pinned_folders = row.onedrive_pinned_folders;
    toast(exists ? 'Removed Quick Link' : 'Added Quick Link');
    render();
  }
};
// Dedicated "finish" action for the Admin Centre > Quick Links flow —
// pins the folder (if not already pinned) then drops straight back into
// Admin Centre > Integrations with the pinned list visible, rather than
// leaving the admin sat inside the folder picker after adding one.
window.pinAsQuickLink = async function(id, name, driveId){
  const pinned = (ORG && ORG.onedrive_pinned_folders) || [];
  if(!pinned.some(p=>p.id===id)){
    const next = [...pinned, {id, name, driveId: driveId||null}];
    const row = await dbUpdate('organizations', ME.org_id, {onedrive_pinned_folders: next});
    if(row && ORG) ORG.onedrive_pinned_folders = row.onedrive_pinned_folders;
    toast('Added Quick Link — "'+name+'"');
  }
  odPickerStack = null;
  go('#/team/company/onedrive');
};
window.odPickerInto = function(id, name, driveId, isSite){
  odPickerStack.push({id, name, driveId: driveId || null, isSite: !!isSite});
  render();
};
window.odPickerUp = function(){
  odPickerStack.pop();
  render();
};
window.selectOneDriveFolder = async function(siteId, folderId, folderName, driveId){
  if(odPickerTarget==='repairjob'){
    const jobId = odPickerJobId;
    const row = await dbUpdate('repair_jobs', jobId, {onedrive_folder_id: folderId, onedrive_folder_name: folderName, onedrive_drive_id: driveId || null});
    if(row){
      if(repairJobDetailCurrent && repairJobDetailCurrent.id===jobId) repairJobDetailCurrent = row;
      odPickerStack = null;
      odPickerJobId = null;
      toast('Folder linked — photos, the work order and notes for this job will push there from now on');
      go(`#/site/${siteId}/repairjob/${jobId}`);
    } else {
      toast('Could not link that folder — please try again.');
    }
    return;
  }
  if(odPickerTarget==='operative'){
    const row = await dbUpdate('profiles', odPickerOperativeId, {onedrive_folder_id: folderId, onedrive_folder_name: folderName, onedrive_drive_id: driveId || null, onedrive_last_synced_at: null});
    if(row){
      PROFILES[odPickerOperativeId] = row;
      const opId = odPickerOperativeId;
      odPickerStack = null;
      odPickerOperativeId = null;
      toast('Folder linked — tap Sync Now to pull files in or push uploads out');
      go(`#/operatives/${opId}`);
    }
    return;
  }
  const patch = odPickerTarget==='materials'
    ? {material_orders_folder_id: folderId, material_orders_folder_name: folderName, material_orders_drive_id: driveId || null}
    : odPickerTarget==='siteinductions'
    ? {site_inductions_folder_id: folderId, site_inductions_folder_name: folderName, site_inductions_drive_id: driveId || null}
    : {onedrive_folder_id: folderId, onedrive_folder_name: folderName, onedrive_drive_id: driveId || null};
  const row = await dbUpdate('sites', siteId, patch);
  if(row){
    const idx = SITES.findIndex(s=>s.id===siteId);
    if(idx>-1) SITES[idx] = row;
    odPickerStack = null;
    if(odPickerTarget==='materials'){
      toast("Folder linked — Material PO's will sync from there daily");
      go(`#/site/${siteId}/materialorders`);
    } else if(odPickerTarget==='siteinductions'){
      toast('Folder linked — signed inductions will be pushed there from now on');
      go(`#/site/${siteId}/mc/site_inductions`);
    } else {
      toast('Folder linked — photos for this site will sync there from now on');
      go(`#/site/${siteId}/team`);
    }
  } else {
    // Previously failed silently here — the folder picker would close with
    // no feedback at all, reading as "I linked a folder but it hasn't
    // registered in the app." Always tell the user one way or the other.
    toast('Could not link that folder — please try again.');
  }
};
window.unlinkOperativeFolder = async function(operativeId){
  if(!await customConfirm("Unlink this operative's OneDrive folder? Sync will stop until you link a new one.")) return;
  const row = await dbUpdate('profiles', operativeId, {onedrive_folder_id: null, onedrive_folder_name: null, onedrive_drive_id: null});
  if(row){ PROFILES[operativeId] = row; toast('Folder unlinked'); render(); }
};