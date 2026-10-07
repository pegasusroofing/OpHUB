/* ================= SUBCONTRACTOR INSPECTIONS ================= */
// #410: a plain upload area inside a subcontractor's own tiles — any of
// their allocated operatives can upload (not admin-only, unlike RAMS/
// COSHH), every upload is also emailed to the PM automatically (see
// send-subcontractor-inspection-email), and — unlike the compressed-JPEG
// photo flows used for snags/tools/permit closedown elsewhere in this
// app — files here are uploaded exactly as chosen, no client-side
// recompression, so a hi-res inspection photo stays hi-res.
let subInspectionUploading = false;
async function renderSubInspections(siteId, companyId, folderId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  // Started together rather than one after another.
  const __pProfiles = loadAllProfiles();
  const __pSubAdmin = isSubcontractorAdmin(companyId);
  const company = (await dbSelect('subcontractor_companies', 'id=eq.'+companyId+'&select=*'))[0];
  if(!company){ go(`#/site/${siteId}/mc/subcontractors`); return; }
  await __pProfiles;
  const [folders, files, currentFolder] = await Promise.all([
    folderId ? Promise.resolve([]) : dbSelect('subcontractor_inspection_folders', 'subcontractor_company_id=eq.'+companyId+'&order=name.asc'),
    dbSelect('subcontractor_inspections', 'subcontractor_company_id=eq.'+companyId+(folderId ? '&folder_id=eq.'+folderId : '&folder_id=is.null')+'&order=uploaded_at.desc'),
    folderId ? dbSelect('subcontractor_inspection_folders', 'id=eq.'+folderId+'&select=id,name') : Promise.resolve([]),
  ]);
  const folderRow = currentFolder[0];
  if(folderId && !folderRow){ go(`#/site/${siteId}/mc/subcontractors/${companyId}/inspections`); return; }
  const canManageFolders = isManager(ME) || await __pSubAdmin;
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <p class="stub" style="margin:0 0 14px;">Upload inspection files here — kept full resolution, never compressed — and the site's PM is emailed automatically each time.</p>
    ${!folderId ? `
    ${folders.map(f=>`
      <div class="sitecard" style="cursor:pointer;" onclick="go('#/site/${siteId}/mc/subcontractors/${companyId}/inspections/${f.id}')">
        <div class="swatch">📁</div>
        <div class="info"><div class="name">${escapeHtml(f.name)}</div></div>
        ${canManageFolders ? `<div class="taskicon" title="Rename" onclick="event.stopPropagation();renameSubInspectionFolder('${f.id}','${jsAttr(f.name)}')">✏️</div>` : ''}
      </div>
    `).join('')}
    ${canManageFolders ? `<button class="ghostbtn" style="margin-bottom:14px;" onclick="createSubInspectionFolder('${siteId}','${companyId}')">📁 New Folder</button>` : ''}
    ` : `
    <p class="stub" style="margin:-8px 0 10px;font-weight:700;">📁 ${escapeHtml(folderRow.name)}</p>
    `}
    <div class="formfield" style="margin-top:0;">
      <div class="photoupload" style="cursor:pointer;" onclick="document.getElementById('subInspectionFileInput').click()">
        <div style="font-size:20px;">${subInspectionUploading?'⏳':'📎'}</div>${subInspectionUploading?'Uploading…':'Tap to choose a file (photo, PDF, etc.)'}
      </div>
      <input type="file" id="subInspectionFileInput" ${subInspectionUploading?'disabled':''} style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;" onchange="addSubInspection(this,'${siteId}','${companyId}','${folderId||''}')">
    </div>
    ${files.map(f=>`
      <div class="sitecard">
        <div class="info"><div class="name">${escapeHtml(f.file_name)}</div><div class="addr">${escapeHtml(nameOf(f.uploaded_by))} · ${new Date(f.uploaded_at).toLocaleString('en-GB')}</div></div>
        <a href="${publicUrl('mc-documents', f.storage_path)}" target="_blank" rel="noopener" class="ghostbtn" style="width:auto;padding:8px 12px;text-decoration:none;">View</a>
        ${isManager(ME) ? `<div class="taskicon danger" title="Delete" onclick="deleteSubInspection('${f.id}','${jsAttr(f.storage_path)}')">🗑</div>` : ''}
      </div>
    `).join('') || `<div class="empty">No inspection files ${folderId?'in this folder':'uploaded'} yet.</div>`}
  `, {title:'Inspections', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back: folderId ? `#/site/${siteId}/mc/subcontractors/${companyId}/inspections` : `#/site/${siteId}/mc/subcontractors/${companyId}`, siteId, activeTab:'more'}); }
}
window.createSubInspectionFolder = async function(siteId, companyId){
  const name = await customPrompt('Folder name', '');
  if(!name || !name.trim()) return;
  const rows = await dbInsert('subcontractor_inspection_folders', {org_id:ME.org_id, site_id:siteId, subcontractor_company_id:companyId, name:name.trim(), created_by:ME.id});
  if(rows){ toast('Folder created'); render(); }
};
window.renameSubInspectionFolder = async function(id, currentName){
  const next = await customPrompt('Rename folder', currentName);
  if(!next || !next.trim() || next.trim()===currentName) return;
  const ok = await dbUpdate('subcontractor_inspection_folders', id, {name: next.trim()});
  if(ok){ toast('Renamed'); render(); }
};
window.addSubInspection = async function(input, siteId, companyId, folderId){
  const file = input.files && input.files[0]; if(!file) return;
  subInspectionUploading = true; render();
  try{
    const site = SITES.find(s=>s.id===siteId);
    const company = (await dbSelect('subcontractor_companies', 'id=eq.'+companyId+'&select=name'))[0];
    const cleanName = file.name.replace(/[^a-z0-9.\-]+/gi,'_');
    const path = siteId+'/subcontractor-inspections/'+companyId+'/'+uid()+'-'+cleanName;
    // Uploaded exactly as chosen — no compressImage() pass, unlike every
    // other photo-upload flow in the app — so resolution is never lost.
    const stored = await uploadToStorage('mc-documents', path, file, file.type || 'application/octet-stream');
    if(!stored){ subInspectionUploading = false; render(); return; }
    const rows = await dbInsert('subcontractor_inspections', {
      org_id: ME.org_id, site_id: siteId, subcontractor_company_id: companyId, folder_id: folderId || null,
      uploaded_by: ME.id, file_name: file.name, storage_path: stored, content_type: file.type || null,
    });
    if(rows){
      toast('Uploaded');
      // Best-effort — silently fails if email isn't configured, same
      // "opportunistic, never blocks the user" spirit as the OneDrive push.
      try{
        await sbFetch('/functions/v1/send-subcontractor-inspection-email', {method:'POST', timeoutMs:60000, body: JSON.stringify({
          site_id: siteId, company_name: company ? company.name : null,
          file_name: file.name, file_url: publicUrl('mc-documents', stored),
        })});
      }catch(e){}
    }
  }catch(e){ toast('Upload failed.'); }
  subInspectionUploading = false;
  input.value = '';
  render();
};
window.deleteSubInspection = async function(id, storagePath){
  if(!await customConfirm('Delete this inspection file?')) return;
  const ok = await dbDelete('subcontractor_inspections', id);
  if(ok){ try{ await sbFetch('/storage/v1/object/mc-documents/'+storagePath, {method:'DELETE'}); }catch(e){} toast('Deleted'); render(); }
};
