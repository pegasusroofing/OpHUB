/* ================= MAIN CONTRACTOR INSPECTIONS ================= */
// #409: infrastructure/library shell only — the user is defining the
// actual templates (daily site inspection: fencing, fire extinguishers,
// welfare inspection, etc.) separately, so this just needs somewhere for
// that library and its inspections to live. Reuses the exact same
// templated report_templates/report_submissions mechanism the main
// Reports tile and Daily Briefings already share (see the is_daily_briefing
// comment block above renderDailyBriefings) — a template flagged
// is_mc_inspection surfaces here instead of Reports, and starting one
// (startReport — unchanged, it already doesn't care which flavour of
// template it's given) drops straight into the same fill/view pages
// Reports itself uses. Those pages return to the general Reports list when
// done rather than back here — Daily Briefings only got its own bespoke
// fill/view/back-routing once its extra behaviour (issuing for signing,
// weekly grouping) was actually built; MC Inspections can get the same
// treatment once its real templates and behaviour are defined.
let mcInspectionPickerOpen = false;
let mcInspectionSubOpenFor = {}; // subcontractor_company_id -> bool, dropdown state on the main Inspections page
async function renderMcInspectionTemplates(siteId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  const canEdit = isManager(ME);
  const templates = await dbSelect('report_templates', 'org_id=eq.'+ME.org_id+'&is_mc_inspection=eq.true&archived=eq.false&order=name.asc');
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    ${canEdit ? `<p class="stub" style="margin:0 0 10px;">Build and manage Main Contractor Inspection templates here — separate from the site's general Report Templates. Editing a template never changes inspections already started from it.</p>` : ''}
    ${templates.map(t=>`
      <div class="sitecard">
        <div class="info"><div class="name">${escapeHtml(t.name)}</div>${t.description?`<div class="addr">${escapeHtml(t.description)}</div>`:''}</div>
        ${canEdit ? `
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="ghostbtn" style="width:auto;padding:8px 10px;" onclick="openTemplateEditor('${t.id}','${siteId}','#/site/${siteId}/mc/inspections/templates')">Edit</button>
            <button class="ghostbtn" style="width:auto;padding:8px 10px;color:var(--warn);" onclick="deleteTemplate('${t.id}','${jsAttr(t.name)}')">Delete</button>
          </div>
        ` : ''}
      </div>
    `).join('') || `<div class="empty">No Main Contractor Inspection templates yet${canEdit?'.':' — ask a Project Manager to create one.'}</div>`}
    ${canEdit ? `<button class="darkbtn" style="margin-top:10px;" onclick="createMcInspectionTemplate('${siteId}')">+ New Template</button>` : ''}
  `, {title:'Inspection Templates', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/mc/inspections`, siteId, activeTab:'more'}); }
}
async function renderMcInspections(siteId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  const canAdd = isManager(ME);
  const templates = await dbSelect('report_templates', 'org_id=eq.'+ME.org_id+'&is_mc_inspection=eq.true&archived=eq.false&order=name.asc');
  let submissions = [];
  if(templates.length){
    const ids = templates.map(t=>t.id).join(',');
    submissions = await dbSelect('report_submissions', 'site_id=eq.'+siteId+'&template_id=in.('+ids+')&order=submitted_at.desc&limit=100');
  }
  await loadAllProfiles();
  // Subcontractor inspections (uploaded files, not templated reports) are
  // surfaced here too — but only for PM/admin/site_manager (isManager), and
  // grouped per-company in a dropdown, so e.g. Brothers Scaffold's own
  // scaffold inspection shows up on the main site Inspections page without
  // merging into RTB's own templated inspection list above.
  let subCompanies = [], subInspectionsByCompany = {}, subFoldersByCompany = {};
  if(canAdd){
    subCompanies = await dbSelect('subcontractor_companies', 'site_id=eq.'+siteId+'&select=id,name&order=name.asc');
    if(subCompanies.length){
      const companyIds = subCompanies.map(c=>c.id).join(',');
      const [allFiles, allFolders] = await Promise.all([
        dbSelect('subcontractor_inspections', 'subcontractor_company_id=in.('+companyIds+')&order=uploaded_at.desc'),
        dbSelect('subcontractor_inspection_folders', 'subcontractor_company_id=in.('+companyIds+')&select=id,name,subcontractor_company_id'),
      ]);
      allFiles.forEach(f=>{ (subInspectionsByCompany[f.subcontractor_company_id]=subInspectionsByCompany[f.subcontractor_company_id]||[]).push(f); });
      allFolders.forEach(fo=>{ (subFoldersByCompany[fo.subcontractor_company_id]=subFoldersByCompany[fo.subcontractor_company_id]||{})[fo.id]=fo.name; });
      subCompanies = subCompanies.filter(c=>(subInspectionsByCompany[c.id]||[]).length);
    }
  }
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    ${canAdd ? `<button class="ghostbtn" style="margin-bottom:10px;" onclick="go('#/site/${siteId}/mc/inspections/templates')">Manage Templates</button>` : ''}
    ${canAdd ? `
      <button class="darkbtn" style="margin-bottom:10px;" onclick="mcInspectionPickerOpen=!mcInspectionPickerOpen;render()">${mcInspectionPickerOpen?'Cancel':'+ New Inspection'}</button>
      ${mcInspectionPickerOpen ? `
        <div class="card" style="margin-bottom:14px;">
          <p class="stub" style="margin:0 0 8px;">Pick a template to start a new inspection:</p>
          ${templates.map(t=>`
            <div class="sitecard">
              <div class="info"><div class="name">${escapeHtml(t.name)}</div>${t.description?`<div class="addr">${escapeHtml(t.description)}</div>`:''}</div>
              <button class="darkbtn" style="width:auto;padding:8px 14px;" onclick="startReport('${siteId}','${t.id}')">Start</button>
            </div>
          `).join('') || `<div class="empty">No inspection templates yet — set one up first via "Manage Templates".</div>`}
        </div>
      ` : ''}
    ` : ''}
    ${submissions.map(s=>`
      <div class="sitecard" style="cursor:pointer;" onclick="go('#/site/${siteId}/snagging/reports/${s.status==='in_progress'?'fill':'view'}/${s.id}')">
        <div class="info">
          <div class="name">${escapeHtml(s.template_name)}</div>
          <div class="addr">${s.status==='in_progress' ? 'Started' : ('Submitted '+new Date(s.submitted_at).toLocaleString('en-GB'))} · ${escapeHtml(nameOf(s.submitted_by))}</div>
        </div>
        <span class="statustag2 ${REPORT_STATUS_CLASS[s.status]||'closed'}">${REPORT_STATUS_LABEL[s.status]||s.status}</span>
      </div>
    `).join('') || `<div class="empty">No inspections logged yet${templates.length?'.':' — set up a template first.'}</div>`}
    ${canAdd && subCompanies.length ? `
    <p class="sectiontitle" style="margin-top:22px;">Subcontractor Inspections</p>
    ${subCompanies.map(c=>{
      const files = subInspectionsByCompany[c.id]||[];
      const folderNames = subFoldersByCompany[c.id]||{};
      const open = !!mcInspectionSubOpenFor[c.id];
      return `
      <div class="card" style="padding:0;overflow:hidden;margin-bottom:10px;">
        <p class="ddrow" style="margin:0;padding:12px 14px;border:none;border-radius:0;background:transparent;" onclick="toggleMcInspectionSub('${c.id}')">
          <span class="arrow">${open?'▼':'▶'}</span> ${escapeHtml(c.name)} <span class="stub" style="display:inline;">(${files.length} file${files.length===1?'':'s'})</span>
        </p>
        ${open ? `<div style="padding:0 14px 14px;">
          ${files.map(f=>`
            <div class="sitecard">
              <div class="info"><div class="name">${escapeHtml(f.file_name)}</div><div class="addr">${f.folder_id && folderNames[f.folder_id] ? '📁 '+escapeHtml(folderNames[f.folder_id])+' · ' : ''}${escapeHtml(nameOf(f.uploaded_by))} · ${new Date(f.uploaded_at).toLocaleString('en-GB')}</div></div>
              <a href="${publicUrl('mc-documents', f.storage_path)}" target="_blank" rel="noopener" class="ghostbtn" style="width:auto;padding:8px 12px;text-decoration:none;">View</a>
            </div>
          `).join('')}
          <button class="ghostbtn" style="margin-top:6px;" onclick="go('#/site/${siteId}/mc/subcontractors/${c.id}/inspections')">Open ${escapeHtml(c.name)}'s Inspections</button>
        </div>` : ''}
      </div>
      `;
    }).join('')}
    ` : ''}
  `, {title:'Inspections', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/mc`, siteId, activeTab:'more'}); }
}
window.toggleMcInspectionSub = function(companyId){
  mcInspectionSubOpenFor[companyId] = !mcInspectionSubOpenFor[companyId];
  render();
};
async function renderMcDocuments(siteId, category){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  const canAdd = isManager(ME);
  const docs = await dbSelect('mc_documents', 'site_id=eq.'+siteId+'&category=eq.'+category+'&order=uploaded_at.desc');
  await loadAllProfiles();
  const uploadKey = siteId+'_'+category;
  if(!(uploadKey in mcDocUploadOpen)) mcDocUploadOpen[uploadKey] = !docs.length;
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    ${docs.map(d=>`
      <div class="ramsdoc" style="padding:10px 12px;">
        <div class="taskrowtop">
          <div class="name" style="font-size:16.5px;font-weight:800;">${escapeHtml(d.name)}</div>
          ${canAdd ? `<div class="taskicons"><div class="taskicon" title="Rename" onclick="renameMcDocument('${d.id}','${jsAttr(d.name)}')">✏️</div><div class="taskicon danger" onclick="deleteMcDocument('${d.id}','${jsAttr(d.storage_path)}')">🗑</div></div>` : ''}
        </div>
        <div class="meta" style="margin-top:3px;">Uploaded by ${escapeHtml(nameOf(d.uploaded_by))} · ${new Date(d.uploaded_at).toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'})}</div>
        <button class="darkbtn" style="margin-top:10px;width:100%;" onclick="viewDrawing('${publicUrl('mc-documents', d.storage_path)}', false, '${jsAttr(/\.pdf$/i.test(d.name)?d.name:d.name+'.pdf')}')">📄 View Document</button>
      </div>
    `).join('') || `<div class="empty">No documents uploaded.</div>`}
    ${canAdd ? `
    <div class="card" style="padding:0;overflow:hidden;margin-top:14px;">
      <p class="ddrow" style="margin:0;padding:12px 14px;border:none;border-radius:0;background:transparent;" onclick="toggleMcDocUpload('${siteId}','${category}')">
        <span class="arrow">${mcDocUploadOpen[uploadKey]?'▼':'▶'}</span> Upload ${escapeHtml(MC_CATEGORY_LABEL[category])}
      </p>
      ${mcDocUploadOpen[uploadKey] ? `
      <div style="padding:0 14px 14px;">
        <div class="formfield" style="margin-top:0;"><input type="text" id="mcDocName" placeholder="Document name"></div>
        <div class="ghostbtn" style="cursor:pointer;text-align:center;margin-bottom:10px;" onclick="document.getElementById('mcDocFile').click()">Choose PDF</div>
        <input type="file" accept="application/pdf" id="mcDocFile" style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;" onchange="document.getElementById('mcDocFileName').textContent=this.files[0]?this.files[0].name:''">
        <p class="stub" id="mcDocFileName" style="margin:-4px 0 10px;"></p>
        <button class="darkbtn" onclick="addMcDocument('${siteId}','${category}')">Upload</button>
      </div>
      ` : ''}
    </div>
    ` : ''}
  `, {title: MC_CATEGORY_LABEL[category], subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/mc`, siteId, activeTab:'more'}); }
}
window.toggleMcDocUpload = function(siteId, category){
  const key = siteId+'_'+category;
  mcDocUploadOpen[key] = !mcDocUploadOpen[key];
  render();
};
window.addMcDocument = async function(siteId, category){
  const name = document.getElementById('mcDocName').value.trim();
  const fileInput = document.getElementById('mcDocFile');
  const file = fileInput.files && fileInput.files[0];
  if(!name || !file){ toast('Add a name and choose a PDF.'); return; }
  const path = siteId+'/'+category+'/'+uid()+'-'+file.name.replace(/[^a-z0-9.\-]+/gi,'_');
  const stored = await uploadToStorage('mc-documents', path, file, 'application/pdf');
  if(!stored) return;
  const rows = await dbInsert('mc_documents', {org_id:ME.org_id, site_id:siteId, category, name, storage_path:stored, uploaded_by:ME.id});
  if(rows){ mcDocUploadOpen[siteId+'_'+category] = false; toast('Uploaded'); render(); }
};
window.renameMcDocument = async function(id, currentName){
  const next = await customPrompt('Rename document', currentName);
  if(!next || !next.trim() || next.trim()===currentName) return;
  const ok = await dbUpdate('mc_documents', id, {name: next.trim()});
  if(ok){ toast('Renamed'); render(); }
};
window.deleteMcDocument = async function(id, storagePath){
  if(!await customConfirm('Delete this document?')) return;
  const ok = await dbDelete('mc_documents', id);
  if(ok){ try{ await sbFetch('/storage/v1/object/mc-documents/'+storagePath, {method:'DELETE'}); }catch(e){} toast('Deleted'); render(); }
};
