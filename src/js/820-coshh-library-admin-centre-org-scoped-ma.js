/* ================= COSHH LIBRARY (Admin Centre, org-scoped master library) =================
   Same folder/file tree pattern as Drawings above, but org-scoped instead of
   site-scoped (org_id instead of site_id) and browsed inline inside the Admin
   Centre "COSHH Library" row rather than as its own routed page. */
let coshhLibFolderId = null; // current folder in the Admin Centre browser (null = top level)
let coshhLibNewFolderOpen = false;
let coshhLibUploadOpen = false;
window.jumpCoshhLibraryFolder = function(folderId){
  coshhLibFolderId = folderId || null;
  coshhLibNewFolderOpen = false;
  coshhLibUploadOpen = false;
  render();
};
async function coshhLibraryBrowserHtml(){
  let currentFolder = null;
  if(coshhLibFolderId){
    const rows = await dbSelect('coshh_library_folders', 'id=eq.'+coshhLibFolderId+'&select=*');
    currentFolder = rows[0] || null;
    if(!currentFolder) coshhLibFolderId = null;
  }
  const [subfolders, files, topFolders] = await Promise.all([
    dbSelect('coshh_library_folders', 'org_id=eq.'+ME.org_id+'&'+(coshhLibFolderId?'parent_id=eq.'+coshhLibFolderId:'parent_id=is.null')+'&order=position.asc.nullslast,name.asc'),
    dbSelect('coshh_library_files', 'org_id=eq.'+ME.org_id+'&'+(coshhLibFolderId?'folder_id=eq.'+coshhLibFolderId:'folder_id=is.null')+'&order=name.asc'),
    dbSelect('coshh_library_folders', 'org_id=eq.'+ME.org_id+'&parent_id=is.null&order=position.asc.nullslast,name.asc'),
  ]);
  const parentArg = coshhLibFolderId ? `'${coshhLibFolderId}'` : 'null';
  const isEmpty = subfolders.length===0 && files.length===0;
  // Upload is the default action now — the folder-create form only shows once
  // the "+" (Add Folder) button has been tapped, rather than the other way
  // round, since most visits here are "add another document", not "add
  // another folder".
  const showUploadForm = coshhLibUploadOpen || (isEmpty && !coshhLibNewFolderOpen);
  return `
    <div class="drawheaderrow">
      <span>${currentFolder ? escapeHtml(currentFolder.name) : 'Element of Works'}</span>
      <div style="display:flex;align-items:center;gap:6px;">
        ${currentFolder ? `<div class="roundplusbtn" style="width:26px;height:26px;font-size:15px;" title="Up a level" onclick="jumpCoshhLibraryFolder('${currentFolder.parent_id||''}')">‹</div>` : ''}
        <div class="roundplusbtn" style="background:var(--brand1);border-color:var(--brand1);color:var(--brand1-text,#fff);" title="Add Folder" onclick="coshhLibNewFolderOpen=true;coshhLibUploadOpen=false;render()">+</div>
      </div>
    </div>
    <div class="row-gap" style="margin-bottom:10px;flex-wrap:wrap;">
      <select onchange="jumpCoshhLibraryFolder(this.value)" style="flex:1;min-width:160px;border:1px solid var(--line);border-radius:8px;padding:8px;font-size:12.5px;font-family:inherit;background:#fff;color:var(--ink);">
        <option value="">Filter: jump to element of works…</option>
        ${topFolders.map(f=>`<option value="${f.id}" ${coshhLibFolderId===f.id?'selected':''}>${escapeHtml(f.name)}</option>`).join('')}
      </select>
    </div>
    ${coshhLibNewFolderOpen ? `
      <div class="card" style="margin-bottom:10px;">
        <div class="row-gap">
          <input type="text" id="newCoshhLibFolderName" placeholder="e.g. Bauder">
          <button class="darkbtn" style="width:auto;padding:10px 16px;" onclick="createCoshhLibraryFolder(${parentArg})">Create Folder</button>
        </div>
        <button class="ghostbtn" style="margin-top:8px;" onclick="coshhLibNewFolderOpen=false;render()">Cancel</button>
      </div>
    ` : ''}
    ${subfolders.length || files.length ? `
      ${subfolders.map(f=>`
        <div class="sitecard" style="cursor:pointer;padding:8px 10px;" onclick="jumpCoshhLibraryFolder('${f.id}')">
          <div class="info"><div class="name" style="font-weight:700;font-size:13px;white-space:normal;word-break:break-word;">📁 ${escapeHtml(f.name)}</div></div>
          <div class="taskicons">
            <div class="taskicon" onclick="event.stopPropagation();renameCoshhLibraryFolder('${f.id}','${jsAttr(f.name)}')">✏️</div>
            <div class="taskicon danger" onclick="event.stopPropagation();deleteCoshhLibraryFolder('${f.id}')">🗑</div>
          </div>
        </div>
      `).join('')}
      ${files.map(f=>`
        <div class="card" style="display:flex;align-items:center;gap:8px;padding:12px 14px;margin-bottom:10px;">
          <div class="swatch" style="flex:0 0 36px;width:36px;height:36px;font-size:16px;">📄</div>
          <div style="flex:1;min-width:0;font-weight:700;font-size:14px;color:var(--ink);white-space:normal;word-break:break-word;line-height:1.3;">${escapeHtml(f.name)}</div>
          <div class="ghostbtn" style="flex:0 0 52px;width:52px;text-align:center;padding:6px 3px;font-size:8.5px;cursor:pointer;" onclick="viewDrawing('${publicUrl('coshh-library', f.storage_path)}', ${/\.(jpe?g|png)$/i.test(f.name)}, '${jsAttr(f.name)}')">View</div>
          <div class="taskicon" onclick="renameCoshhLibraryFile('${f.id}','${jsAttr(f.name)}')">✏️</div>
          <div class="taskicon danger" onclick="deleteCoshhLibraryFile('${f.id}','${jsAttr(f.storage_path)}')">🗑</div>
        </div>
      `).join('')}
    ` : `<div class="empty">Nothing here yet.</div>`}
    ${showUploadForm ? `
      <div class="card" style="margin-top:10px;">
        <p class="sectiontitle" style="margin-top:0;">Upload document</p>
        <p class="stub" style="margin:0 0 8px;">Uploads into ${currentFolder ? '"'+escapeHtml(currentFolder.name)+'"' : 'the top level'}. Any document type is accepted.</p>
        <p class="stub" style="margin:0 0 8px;">You can select more than one file at once — each is uploaded and saved separately.</p>
        <div class="ghostbtn" style="cursor:pointer;text-align:center;" id="coshhLibUploadLabel" onclick="document.getElementById('coshhLibUploadInput').click()">Choose file(s)</div>
        <input type="file" id="coshhLibUploadInput" multiple style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;" onchange="uploadCoshhLibraryFile(this,${parentArg})">
        ${!isEmpty ? `<button class="ghostbtn" style="margin-top:8px;" onclick="coshhLibUploadOpen=false;render()">Cancel</button>` : ''}
      </div>
    ` : `
      <button class="darkbtn" style="margin-top:10px;padding:9px 14px;font-size:12.5px;text-transform:none;letter-spacing:.01em;border-radius:9px;" onclick="coshhLibUploadOpen=true;render()">+ Add Document</button>
    `}
  `;
}
window.createCoshhLibraryFolder = async function(folderId){
  const input = document.getElementById('newCoshhLibFolderName');
  const name = input ? input.value.trim() : '';
  if(!name){ toast('Enter a folder name.'); return; }
  const rows = await dbInsert('coshh_library_folders', {org_id:ME.org_id, parent_id:folderId||null, name, created_by:ME.id});
  if(rows){ toast('Folder created'); coshhLibNewFolderOpen = false; render(); }
};
window.renameCoshhLibraryFolder = async function(folderId, currentName){
  const next = await customPrompt('Rename folder', currentName);
  if(next==null) return;
  const trimmed = next.trim();
  if(!trimmed || trimmed===currentName) return;
  const row = await dbUpdate('coshh_library_folders', folderId, {name: trimmed});
  if(row){ toast('Folder renamed'); render(); }
};
window.moveCoshhLibraryFolder = async function(parentFolderId, folderId, dir){
  const siblings = await dbSelect('coshh_library_folders', 'org_id=eq.'+ME.org_id+'&'+(parentFolderId?'parent_id=eq.'+parentFolderId:'parent_id=is.null')+'&order=position.asc.nullslast,name.asc');
  await Promise.all(siblings.map((f,idx)=> f.position!==idx ? dbUpdate('coshh_library_folders', f.id, {position:idx}) : null));
  const idx = siblings.findIndex(f=>f.id===folderId);
  const swapIdx = idx + dir;
  if(idx<0 || swapIdx<0 || swapIdx>=siblings.length) return;
  await Promise.all([
    dbUpdate('coshh_library_folders', siblings[idx].id, {position:swapIdx}),
    dbUpdate('coshh_library_folders', siblings[swapIdx].id, {position:idx}),
  ]);
  render();
};
window.deleteCoshhLibraryFolder = async function(folderId){
  if(!await customConfirm('Delete this folder and everything inside it? This can\'t be undone.')) return;
  const ok = await dbDelete('coshh_library_folders', folderId);
  if(ok){ toast('Folder deleted'); render(); }
};
let coshhLibUploadBusy = false;
window.uploadCoshhLibraryFile = async function(input, folderId){
  const files = input.files ? Array.from(input.files) : [];
  if(!files.length) return;
  if(coshhLibUploadBusy) return;
  coshhLibUploadBusy = true;
  const label = document.getElementById('coshhLibUploadLabel');
  if(label){ label.style.pointerEvents = 'none'; label.style.opacity = '.6'; }
  input.disabled = true;
  let uploaded = 0;
  for(let i=0; i<files.length; i++){
    const file = files[i];
    if(label) label.textContent = `Uploading ${i+1} of ${files.length}…`;
    const path = ME.org_id+'/'+(folderId||'root')+'/'+uid()+'-'+file.name.replace(/[^a-z0-9.\-]+/gi,'_');
    const stored = await uploadToStorage('coshh-library', path, file, file.type || 'application/octet-stream');
    if(!stored) continue;
    const rows = await dbInsert('coshh_library_files', {org_id:ME.org_id, folder_id:folderId||null, name:file.name, storage_path:stored, uploaded_by:ME.id});
    if(rows) uploaded++;
  }
  coshhLibUploadBusy = false;
  if(uploaded) coshhLibUploadOpen = false;
  await render();
  if(uploaded) customAlert('✓ Upload complete — '+(uploaded===1 ? '1 document' : uploaded+' documents')+' added to the COSHH library.'+(uploaded<files.length ? ' '+(files.length-uploaded)+' could not be uploaded — try those again.' : ''));
  else customAlert('Upload failed — nothing was added. Check your connection and try again.');
};
window.renameCoshhLibraryFile = async function(fileId, currentName){
  const next = await customPrompt('Rename document', currentName);
  if(next==null) return;
  const trimmed = next.trim();
  if(!trimmed || trimmed===currentName) return;
  const row = await dbUpdate('coshh_library_files', fileId, {name: trimmed});
  if(row){ toast('Document renamed'); render(); }
};
window.deleteCoshhLibraryFile = async function(fileId, storagePath){
  if(!await customConfirm('Delete this document from the library? This can\'t be undone.')) return;
  const ok = await dbDelete('coshh_library_files', fileId);
  if(ok){
    try{ await sbFetch('/storage/v1/object/coshh-library/'+storagePath, {method:'DELETE'}); }catch(e){ /* non-fatal */ }
    toast('Document deleted');
    render();
  }
};

/* ---- "Add from Library" — multi-pick COSHH docs from the org library straight
   into a site's COSHH tile. Physically copies the file bytes from the
   coshh-library bucket into coshh-docs at a site-specific path and inserts a
   normal coshh_docs row, so the picked file behaves exactly like any other
   site COSHH document (sign/export/replace/delete all work unchanged). ---- */
let coshhPickFolderId = null; // current folder while picking (null = top level)
let coshhPickSelected = new Set(); // library file ids selected to copy in
window.startCoshhLibraryPick = function(siteId){
  coshhPickFolderId = null;
  coshhPickSelected = new Set();
  go(`#/site/${siteId}/hs/coshh-pick`);
};
window.openCoshhPickFolder = function(folderId){
  coshhPickFolderId = folderId || null;
  render();
};
window.toggleCoshhPickSelect = function(fileId){
  if(coshhPickSelected.has(fileId)) coshhPickSelected.delete(fileId); else coshhPickSelected.add(fileId);
  render();
};
// Recursively collects every file id under a library folder (including
// nested subfolders, e.g. a manufacturer folder under Liquid Roofing) —
// lets "Select Folder" tick a whole element-of-works folder in one tap
// instead of ticking each document inside it individually.
async function collectCoshhLibraryFolderFileIds(folderId){
  const [files, subfolders] = await Promise.all([
    dbSelect('coshh_library_files', 'folder_id=eq.'+folderId+'&select=id'),
    dbSelect('coshh_library_folders', 'parent_id=eq.'+folderId+'&select=id'),
  ]);
  let ids = files.map(f=>f.id);
  for(const sf of subfolders){
    ids = ids.concat(await collectCoshhLibraryFolderFileIds(sf.id));
  }
  return ids;
}
window.selectCoshhPickFolder = async function(folderId, folderName){
  const ids = await collectCoshhLibraryFolderFileIds(folderId);
  if(!ids.length){ toast('No documents found in "'+folderName+'".'); return; }
  ids.forEach(id=>coshhPickSelected.add(id));
  toast(ids.length+' document'+(ids.length===1?'':'s')+' selected from "'+folderName+'"');
  render();
};
async function renderCoshhLibraryPick(siteId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  let currentFolder = null;
  if(coshhPickFolderId){
    const rows = await dbSelect('coshh_library_folders', 'id=eq.'+coshhPickFolderId+'&select=*');
    currentFolder = rows[0] || null;
    if(!currentFolder) coshhPickFolderId = null;
  }
  const [subfolders, files] = await Promise.all([
    dbSelect('coshh_library_folders', 'org_id=eq.'+ME.org_id+'&'+(coshhPickFolderId?'parent_id=eq.'+coshhPickFolderId:'parent_id=is.null')+'&order=position.asc.nullslast,name.asc'),
    dbSelect('coshh_library_files', 'org_id=eq.'+ME.org_id+'&'+(coshhPickFolderId?'folder_id=eq.'+coshhPickFolderId:'folder_id=is.null')+'&order=name.asc'),
  ]);
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <div class="stub" style="margin:0 0 10px;font-weight:600;">${currentFolder ? escapeHtml(currentFolder.name) : 'Element of Works'}</div>
    ${currentFolder ? `<button class="ghostbtn" style="margin-bottom:12px;" onclick="openCoshhPickFolder('${currentFolder.parent_id||''}')">‹ Up one level</button>` : ''}
    ${subfolders.length ? `<p class="stub" style="margin:0 0 8px;">Tap a folder to open it, or "Select Folder" to select every document inside it (including subfolders) at once.</p>` : ''}
    ${subfolders.map(f=>`
      <div class="sitecard" style="cursor:pointer;" onclick="openCoshhPickFolder('${f.id}')">
        <div class="info"><div class="name">📁 ${escapeHtml(f.name)}</div></div>
        <button class="ghostbtn" style="flex:0 0 auto;width:auto;padding:6px 10px;font-size:10.5px;" onclick="event.stopPropagation();selectCoshhPickFolder('${f.id}','${jsAttr(f.name)}')">Select Folder</button>
      </div>
    `).join('')}
    ${files.map(f=>{
      const checked = coshhPickSelected.has(f.id);
      return `
      <div class="sitecard" style="cursor:pointer;" onclick="toggleCoshhPickSelect('${f.id}')">
        <input type="checkbox" style="width:18px;height:18px;flex:0 0 18px;" ${checked?'checked':''} onclick="event.stopPropagation();toggleCoshhPickSelect('${f.id}')">
        <div class="info"><div class="name">📄 ${escapeHtml(f.name)}</div></div>
      </div>`;
    }).join('')}
    ${(!subfolders.length && !files.length) ? `<div class="empty">Nothing here.</div>` : ''}
    ${coshhPickSelected.size ? `<button class="darkbtn" id="coshhImportBtn" style="margin-top:14px;" ${coshhImportBusy?'disabled':''} onclick="importSelectedCoshhFromLibrary('${siteId}')">${coshhImportBusy ? 'Adding… please wait' : 'Add '+coshhPickSelected.size+' Selected'}</button>
    <p class="stub" id="coshhImportNote" style="margin:8px 0 0;text-align:center;${coshhImportBusy?'':'display:none;'}">Copying documents — this can take a minute. Please don't leave this page.</p>` : ''}
  `, {title:'Add from Library', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/hs/coshh`, siteId, tabs:false}); }
}
// Only one import runs at a time: the button locks and counts through the
// documents as they copy, and a confirmation pop-up says exactly what was
// added before going back to the site's COSHH page.
let coshhImportBusy = false;
window.importSelectedCoshhFromLibrary = async function(siteId){
  if(coshhImportBusy || !coshhPickSelected.size) return;
  coshhImportBusy = true;
  const setProgress = txt=>{
    const btn = document.getElementById('coshhImportBtn');
    if(btn){ btn.disabled = true; btn.textContent = txt; }
    const note = document.getElementById('coshhImportNote');
    if(note) note.style.display = '';
  };
  setProgress('Adding… please wait');
  let added = 0, failed = 0; const addedNames = [];
  try{
    const ids = Array.from(coshhPickSelected);
    const files = await dbSelect('coshh_library_files', 'id=in.('+ids.join(',')+')&select=*');
    failed = ids.length - files.length; // anything ticked that could no longer be found
    for(let i=0; i<files.length; i++){
      const f = files[i];
      setProgress(`Adding ${i+1} of ${files.length}… please wait`);
      try{
        const srcRes = await fetchWithTimeout(publicUrl('coshh-library', f.storage_path), {}, 60000);
        if(!srcRes.ok) throw new Error('download failed');
        const blob = await srcRes.blob();
        const path = siteId+'/coshh/'+uid()+'-'+f.name.replace(/[^a-z0-9.\-]+/gi,'_');
        const stored = await uploadToStorage('coshh-docs', path, blob, 'application/pdf');
        if(!stored){ failed++; continue; }
        const rows = await dbInsert('coshh_docs', {site_id:siteId, name:f.name, storage_path:stored, uploaded_by:ME.id});
        if(rows){ added++; addedNames.push(f.name); } else failed++;
      }catch(e){ failed++; }
    }
  }finally{
    coshhImportBusy = false;
  }
  if(!added){
    toast('Nothing was added — check your connection and try again.');
    render();
    return;
  }
  coshhPickSelected = new Set();
  customAlert('✓ Upload complete — '+added+' document'+(added===1?'':'s')+' added to this site\'s COSHH'+(added<=6 ? ': '+addedNames.join(', ') : '')+'.'+(failed ? ' '+failed+' could not be added — try those again.' : ''));
  go(`#/site/${siteId}/hs/coshh`);
};

/* ---- "Save to Admin Centre COSHH" — copies one site COSHH document's bytes
   up into the org library at a chosen folder, inserting a coshh_library_files
   row. The site document itself is untouched — this is a copy, not a move. ---- */
let coshhSaveFolderId = null; // current folder while choosing where to save
let coshhSaveDocId = null;
let coshhSaveDocName = '';
let coshhSaveDocStoragePath = '';
window.startCoshhSaveToLibrary = function(siteId, docId, docName, storagePath){
  coshhSaveFolderId = null;
  coshhSaveDocId = docId;
  coshhSaveDocName = docName;
  coshhSaveDocStoragePath = storagePath;
  go(`#/site/${siteId}/hs/coshh-save`);
};
window.openCoshhSaveFolder = function(folderId){
  coshhSaveFolderId = folderId || null;
  render();
};
async function renderCoshhSaveToLibrary(siteId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  if(!coshhSaveDocId){ go(`#/site/${siteId}/hs/coshh`); return; }
  let currentFolder = null;
  if(coshhSaveFolderId){
    const rows = await dbSelect('coshh_library_folders', 'id=eq.'+coshhSaveFolderId+'&select=*');
    currentFolder = rows[0] || null;
    if(!currentFolder) coshhSaveFolderId = null;
  }
  const subfolders = await dbSelect('coshh_library_folders', 'org_id=eq.'+ME.org_id+'&'+(coshhSaveFolderId?'parent_id=eq.'+coshhSaveFolderId:'parent_id=is.null')+'&order=position.asc.nullslast,name.asc');
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <p class="stub" style="margin:0 0 10px;">Choose where to save "${escapeHtml(coshhSaveDocName)}" in the Admin Centre COSHH Library.</p>
    <div class="stub" style="margin:0 0 10px;font-weight:600;">${currentFolder ? escapeHtml(currentFolder.name) : 'Element of Works'}</div>
    ${currentFolder ? `<button class="ghostbtn" style="margin-bottom:12px;" onclick="openCoshhSaveFolder('${currentFolder.parent_id||''}')">‹ Up one level</button>` : ''}
    ${subfolders.map(f=>`
      <div class="sitecard" style="cursor:pointer;" onclick="openCoshhSaveFolder('${f.id}')">
        <div class="info"><div class="name">📁 ${escapeHtml(f.name)}</div></div>
      </div>
    `).join('')}
    ${!subfolders.length ? `<div class="empty">No subfolders here.</div>` : ''}
    <button class="darkbtn" style="margin-top:14px;" onclick="saveCoshhToLibraryHere('${siteId}')">Save to ${currentFolder ? '"'+escapeHtml(currentFolder.name)+'"' : 'the top level'}</button>
  `, {title:'Save to Admin Centre COSHH', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/hs/coshh`, siteId, tabs:false}); }
}
window.saveCoshhToLibraryHere = async function(siteId){
  if(!coshhSaveDocId) return;
  try{
    const srcRes = await fetch(publicUrl('coshh-docs', coshhSaveDocStoragePath));
    const blob = await srcRes.blob();
    const path = ME.org_id+'/'+(coshhSaveFolderId||'root')+'/'+uid()+'-'+coshhSaveDocName.replace(/[^a-z0-9.\-]+/gi,'_');
    const stored = await uploadToStorage('coshh-library', path, blob, 'application/pdf');
    if(!stored){ toast('Could not save — try again.'); return; }
    const rows = await dbInsert('coshh_library_files', {org_id:ME.org_id, folder_id:coshhSaveFolderId||null, name:coshhSaveDocName, storage_path:stored, uploaded_by:ME.id});
    if(rows){ toast('Saved to Admin Centre COSHH Library'); coshhSaveDocId = null; go(`#/site/${siteId}/hs/coshh`); }
    else toast('Could not save — try again.');
  }catch(e){ toast('Could not save — try again.'); }
};
