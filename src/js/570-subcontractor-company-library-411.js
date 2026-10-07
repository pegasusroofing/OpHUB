/* ================= SUBCONTRACTOR COMPANY LIBRARY (#411) =================
   A single library of documents (insurance, accreditations, RAMS/method
   statement templates, operative certificates the company wants on file,
   etc.) that belongs to the subcontractor COMPANY itself rather than to any
   one site — keyed by subcontractor_company_profiles (the org-level
   "master" identity created/matched by name in addSubcontractorCompany).
   Because every site's subcontractor_companies row for "Acme Scaffolding"
   points at the same master_company_id, whatever's uploaded here shows up
   automatically the next time Acme is chosen on any other site — no
   re-uploading required. */
const COMPANY_LIBRARY_CATEGORIES = [
  {key:'public_liability_insurance', label:'Public Liability Insurance'},
  {key:'employers_liability_insurance', label:"Employer's Liability Insurance"},
  {key:'accreditation', label:'Accreditation / Certification'},
  {key:'rams_template', label:'RAMS / Method Statement Template'},
  {key:'operative_certificate', label:'Operative Certificate'},
  {key:'other', label:'Other'},
];
function companyLibraryCategoryLabel(key){ return (COMPANY_LIBRARY_CATEGORIES.find(c=>c.key===key)||{}).label || 'Other'; }
let companyLibraryAddOpen = false;
let companyLibraryUploading = false;
// Org-wide Company Library hub — every subcontractor_company_profiles row
// for this org, reachable from Settings & Admin (both the Main Contractor
// and the Subcontractor dropdowns link here) rather than only via a
// specific site's Subcontractors tile. Lets a PM/admin manage a company's
// library documents even before that company has been added to any site.
let companyLibraryNewName = '';
let companyLibraryAddCompanyOpen = false;
async function renderCompanyLibraryHub(siteId){
  const __gen = RENDER_GEN;
  const site = siteId ? SITES.find(s=>s.id===siteId) : null;
  const canManage = isManager(ME);
  const linkBase = siteId ? `#/site/${siteId}/mc/companylibrary` : '#/companylibrary';
  const profiles = await dbSelect('subcontractor_company_profiles', 'org_id=eq.'+ME.org_id+'&order=name.asc');
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <p class="stub" style="margin:0 0 14px;">Every subcontractor company's own document library — shared across every site that company is added to.</p>
    ${profiles.map(p=>`
      <div class="sitecard" style="cursor:pointer;" onclick="go('${linkBase}/${p.id}')">
        <div class="swatch">${operativeInitials(p.name)}</div>
        <div class="info"><div class="name">${escapeHtml(p.name)}</div></div>
        ${canManage ? `<div class="taskicon" title="Rename" onclick="event.stopPropagation();renameCompanyLibraryProfile('${p.id}','${jsAttr(p.name)}')">✏️</div>` : ''}
      </div>
    `).join('') || `<div class="empty">No companies in the library yet.</div>`}
    ${canManage ? (companyLibraryAddCompanyOpen ? `
      <div class="card" style="margin-top:10px;">
        <div class="formfield" style="margin-top:0;"><input type="text" id="companyLibraryNewNameInput" placeholder="e.g. Acme Scaffolding" value="${escapeHtml(companyLibraryNewName)}" oninput="companyLibraryNewName=this.value"></div>
        <div class="row-gap"><button class="ghostbtn" style="flex:1;" onclick="companyLibraryAddCompanyOpen=false;render();">Cancel</button><button class="darkbtn" style="flex:1;" onclick="addCompanyLibraryProfile('${siteId}')">Add</button></div>
      </div>
    ` : `<button class="ghostbtn" style="margin-top:10px;" onclick="companyLibraryAddCompanyOpen=true;companyLibraryNewName='';render();">+ Add Company</button>`) : ''}
  `, {title:'Company Library', subtitle: site ? fullSiteAddress(site) : null, siteNameSubtitle:!!site, back: siteId ? `#/site/${siteId}/team` : '#/team', siteId, activeTab:'more'}); }
}
window.renameCompanyLibraryProfile = async function(id, currentName){
  const next = await customPrompt('Rename company', currentName);
  if(!next || !next.trim() || next.trim()===currentName) return;
  const row = await dbUpdate('subcontractor_company_profiles', id, {name: next.trim()});
  if(row){ toast('Renamed'); render(); }
};
window.addCompanyLibraryProfile = async function(siteId){
  const name = (document.getElementById('companyLibraryNewNameInput')||{}).value ? document.getElementById('companyLibraryNewNameInput').value.trim() : companyLibraryNewName.trim();
  if(!name){ toast('Enter a company name.'); return; }
  const rows = await dbInsert('subcontractor_company_profiles', {org_id: ME.org_id, name, created_by:ME.id});
  if(rows){ companyLibraryAddCompanyOpen=false; companyLibraryNewName=''; toast('Company added to the library'); render(); }
};
async function renderCompanyLibraryDocs(siteId, masterCompanyId){
  const __gen = RENDER_GEN;
  const site = siteId ? SITES.find(s=>s.id===siteId) : null;
  const linkBase = siteId ? `#/site/${siteId}/mc/companylibrary` : '#/companylibrary';
  const profileRows = await dbSelect('subcontractor_company_profiles', 'id=eq.'+masterCompanyId+'&select=*');
  const profile = profileRows[0];
  if(!profile){ go(linkBase); return; }
  const canUpload = isManager(ME);
  await loadAllProfiles();
  const docs = await dbSelect('subcontractor_company_documents', 'master_company_id=eq.'+masterCompanyId+'&order=uploaded_at.desc');
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <p class="stub" style="margin:0 0 14px;">${escapeHtml(profile.name)}'s own document library — insurance, accreditations, RAMS templates and the like. Anything kept here follows this company onto every site they're added to.</p>
    ${canUpload ? (companyLibraryAddOpen ? `
      <div class="card" style="margin-bottom:12px;">
        <p class="field-label" style="margin-bottom:6px;">Upload a document</p>
        <select id="companyLibraryCategory" class="stub" style="width:100%;padding:10px;border:1.5px solid var(--line);border-radius:8px;margin-bottom:8px;background:var(--card);">
          ${COMPANY_LIBRARY_CATEGORIES.map(c=>`<option value="${c.key}">${c.label}</option>`).join('')}
        </select>
        <div class="photoupload" style="cursor:pointer;" onclick="document.getElementById('companyLibraryFileInput').click()">
          <div style="font-size:20px;">${companyLibraryUploading?'⏳':'📎'}</div>${companyLibraryUploading?'Uploading…':'Tap to choose a file'}
        </div>
        <input type="file" id="companyLibraryFileInput" ${companyLibraryUploading?'disabled':''} style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;" onchange="addCompanyLibraryDoc(this,'${masterCompanyId}')">
        <div class="row-gap" style="margin-top:10px;"><button class="ghostbtn" style="flex:1;" onclick="companyLibraryAddOpen=false;render();">Cancel</button></div>
      </div>
    ` : `<button class="ghostbtn" style="margin-bottom:12px;" onclick="companyLibraryAddOpen=true;render();">+ Add to Library</button>`) : ''}
    ${docs.map(d=>`
      <div class="sitecard">
        <div class="info"><div class="name">${escapeHtml(d.name)}</div><div class="addr">${companyLibraryCategoryLabel(d.category)} · ${escapeHtml(nameOf(d.uploaded_by))} · ${new Date(d.uploaded_at).toLocaleDateString('en-GB')}${d.expiry_date ? ' · expires '+new Date(d.expiry_date).toLocaleDateString('en-GB') : ''}</div></div>
        <a href="${publicUrl('mc-documents', d.storage_path)}" target="_blank" rel="noopener" class="ghostbtn" style="width:auto;padding:8px 12px;text-decoration:none;">View</a>
        ${canUpload ? `<div class="taskicon danger" title="Delete" onclick="deleteCompanyLibraryDoc('${d.id}','${jsAttr(d.storage_path)}')">🗑</div>` : ''}
      </div>
    `).join('') || `<div class="empty">No library documents yet.</div>`}
  `, {title:'Company Library', subtitle: site ? fullSiteAddress(site) : null, siteNameSubtitle:!!site, back: linkBase, siteId, activeTab:'more'}); }
}
async function renderSubCompanyLibrary(siteId, companyId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  // Started together rather than one after another.
  const __pProfiles = loadAllProfiles();
  const __pSubAdmin = isSubcontractorAdmin(companyId);
  const company = (await dbSelect('subcontractor_companies', 'id=eq.'+companyId+'&select=*'))[0];
  if(!company){ go(`#/site/${siteId}/mc/subcontractors`); return; }
  if(!company.master_company_id){ go(`#/site/${siteId}/mc/subcontractors/${companyId}`); return; }
  const canManage = isManager(ME);
  const canUpload = canManage || await __pSubAdmin;
  await __pProfiles;
  const docs = await dbSelect('subcontractor_company_documents', 'master_company_id=eq.'+company.master_company_id+'&order=uploaded_at.desc');
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <p class="stub" style="margin:0 0 14px;">${company.name}'s own document library — insurance, accreditations, RAMS templates and the like. Anything kept here follows this company onto every site they're added to, so it never needs re-uploading.</p>
    ${canUpload ? (companyLibraryAddOpen ? `
      <div class="card" style="margin-bottom:12px;">
        <p class="field-label" style="margin-bottom:6px;">Upload a document</p>
        <select id="companyLibraryCategory" class="stub" style="width:100%;padding:10px;border:1.5px solid var(--line);border-radius:8px;margin-bottom:8px;background:var(--card);">
          ${COMPANY_LIBRARY_CATEGORIES.map(c=>`<option value="${c.key}">${c.label}</option>`).join('')}
        </select>
        <div class="photoupload" style="cursor:pointer;" onclick="document.getElementById('companyLibraryFileInput').click()">
          <div style="font-size:20px;">${companyLibraryUploading?'⏳':'📎'}</div>${companyLibraryUploading?'Uploading…':'Tap to choose a file'}
        </div>
        <input type="file" id="companyLibraryFileInput" ${companyLibraryUploading?'disabled':''} style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;" onchange="addCompanyLibraryDoc(this,'${company.master_company_id}')">
        <div class="row-gap" style="margin-top:10px;"><button class="ghostbtn" style="flex:1;" onclick="companyLibraryAddOpen=false;render();">Cancel</button></div>
      </div>
    ` : `<button class="ghostbtn" style="margin-bottom:12px;" onclick="companyLibraryAddOpen=true;render();">+ Add to Library</button>`) : ''}
    ${docs.map(d=>`
      <div class="sitecard">
        <div class="info"><div class="name">${escapeHtml(d.name)}</div><div class="addr">${companyLibraryCategoryLabel(d.category)} · ${escapeHtml(nameOf(d.uploaded_by))} · ${new Date(d.uploaded_at).toLocaleDateString('en-GB')}${d.expiry_date ? ' · expires '+new Date(d.expiry_date).toLocaleDateString('en-GB') : ''}</div></div>
        <a href="${publicUrl('mc-documents', d.storage_path)}" target="_blank" rel="noopener" class="ghostbtn" style="width:auto;padding:8px 12px;text-decoration:none;">View</a>
        ${canUpload ? `<div class="taskicon danger" title="Delete" onclick="deleteCompanyLibraryDoc('${d.id}','${jsAttr(d.storage_path)}')">🗑</div>` : ''}
      </div>
    `).join('') || `<div class="empty">No library documents yet.</div>`}
  `, {title:'Company Library', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/mc/subcontractors/${companyId}`, siteId, activeTab:'more'}); }
}
window.addCompanyLibraryDoc = async function(input, masterCompanyId){
  const file = input.files && input.files[0]; if(!file) return;
  const category = (document.getElementById('companyLibraryCategory')||{}).value || 'other';
  companyLibraryUploading = true; render();
  try{
    const cleanName = file.name.replace(/[^a-z0-9.\-]+/gi,'_');
    const path = 'company-library/'+masterCompanyId+'/'+uid()+'-'+cleanName;
    const stored = await uploadToStorage('mc-documents', path, file, file.type || 'application/octet-stream');
    if(!stored){ companyLibraryUploading = false; render(); return; }
    const rows = await dbInsert('subcontractor_company_documents', {
      org_id: ME.org_id, master_company_id: masterCompanyId, category,
      uploaded_by: ME.id, name: file.name, storage_path: stored,
      content_type: file.type || null, size: file.size || null,
    });
    if(rows){ toast('Uploaded'); companyLibraryAddOpen = false; }
  }catch(e){ toast('Upload failed.'); }
  companyLibraryUploading = false;
  input.value = '';
  render();
};
window.deleteCompanyLibraryDoc = async function(id, storagePath){
  if(!await customConfirm('Delete this document? This can\'t be undone.')) return;
  const ok = await dbDelete('subcontractor_company_documents', id);
  if(ok){ try{ await sbFetch('/storage/v1/object/mc-documents/'+storagePath, {method:'DELETE'}); }catch(e){} toast('Deleted'); render(); }
};
