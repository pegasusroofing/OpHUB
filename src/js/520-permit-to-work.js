/* ================= PERMIT TO WORK ================= */
// #408: a full issue → sign-off → close-down workflow, task-specific (a
// fixed library of permit types — PERMIT_TYPE_LABEL/ICON above) rather
// than a plain upload folder like the other MC document categories. Two
// entry points share this same code: the main "Permits To Work" tile on
// Home (companyId null — every permit at the site; any PM can issue,
// optionally attributing it to a subcontractor) and a subcontractor's own
// "Permits To Work" tile (companyId set — filtered to just their permits;
// only that company's own admin, or a PM, can issue). RLS (see the
// permit_to_work migration) enforces the company isolation and the
// "only a PM or that company's own admin can issue — never a plain
// operative" rule server-side too, not just in this UI.
let permitFilter = 'open'; // 'open'|'closed'
let permitIssueOpen = false;
let permitNewType = 'hot_works';
let permitNewDescription = '';
let permitNewDate = '';
let permitNewCompanyId = ''; // main-level issue form only — which subcontractor (if any) this is for
let permitNewAssigneeIds = new Set();
let permitAssigneeFilterText = ''; // live text filter over the "who needs to sign" roster below
let permitCloseState = {}; // permitId -> {photo1, photo2, notes}
async function renderPermits(siteId, companyId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  const company = companyId ? (await dbSelect('subcontractor_companies', 'id=eq.'+companyId+'&select=*'))[0] : null;
  if(companyId && !company){ go(`#/site/${siteId}/mc/subcontractors`); return; }
  await loadAllProfiles();
  const amSubAdmin = companyId ? await isSubcontractorAdmin(companyId) : false;
  const canIssue = isManager(ME) || amSubAdmin;
  const filterQ = companyId ? '&subcontractor_company_id=eq.'+companyId : '';
  const permits = await dbSelect('permits', 'site_id=eq.'+siteId+filterQ+'&status=eq.'+permitFilter+'&order=created_at.desc');
  const companiesById = {};
  if(!companyId){
    const allCompanies = await dbSelect('subcontractor_companies', 'site_id=eq.'+siteId+'&select=id,name');
    allCompanies.forEach(c=>{ companiesById[c.id]=c.name; });
  }
  if(!permitNewDate) permitNewDate = localISODate(new Date());
  // Roster to pick assignees from when issuing: the chosen subcontractor's
  // own allocated operatives if one's picked (or forced, from within a
  // subcontractor's own tile), otherwise every operative assigned to site.
  let assigneeRoster = [];
  if(canIssue && permitIssueOpen){
    const effectiveCompanyId = companyId || permitNewCompanyId || '';
    if(effectiveCompanyId){
      const opRows = await dbSelect('subcontractor_operatives', 'subcontractor_company_id=eq.'+effectiveCompanyId+'&select=user_id');
      assigneeRoster = opRows.map(r=>PROFILES[r.user_id]).filter(Boolean);
    } else {
      const assigned = await dbSelect('site_assignments', 'site_id=eq.'+siteId+'&select=user_id');
      assigneeRoster = assigned.map(r=>PROFILES[r.user_id]).filter(p=>p && p.role==='operative');
    }
    assigneeRoster.sort((a,b)=>a.name.localeCompare(b.name));
  }
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <div class="filterrow">
      <div class="filterchip ${permitFilter==='open'?'active':''}" onclick="permitFilter='open';permitIssueOpen=false;render()">Open</div>
      <div class="filterchip ${permitFilter==='closed'?'active':''}" onclick="permitFilter='closed';permitIssueOpen=false;render()">Closed</div>
    </div>
    ${permits.length ? permits.map(p=>`
      <div class="sitecard" style="cursor:pointer;" onclick="go('${companyId ? `#/site/${siteId}/mc/subcontractors/${companyId}/permits/${p.id}` : `#/site/${siteId}/mc/permits/${p.id}`}')">
        <div class="swatch">${PERMIT_TYPE_ICON[p.permit_type]||'🧾'}</div>
        <div class="info">
          <div class="name">${escapeHtml(PERMIT_TYPE_LABEL[p.permit_type]||p.permit_type)}</div>
          <div class="addr">${escapeHtml(p.description||'')}${!companyId && p.subcontractor_company_id ? ' · '+escapeHtml(companiesById[p.subcontractor_company_id]||'Subcontractor') : ''}</div>
        </div>
        <span class="statustag2 ${p.status}">${p.status}</span>
      </div>
    `).join('') : `<div class="empty">No ${permitFilter} permits.</div>`}
    ${canIssue && permitFilter==='open' ? (permitIssueOpen ? `
      <div class="card" style="margin-top:14px;">
        <p class="sectiontitle" style="margin-top:0;">Issue a permit</p>
        <div class="formfield">
          <label class="field-label">Permit type</label>
          <select onchange="permitNewType=this.value;render()">
            ${Object.keys(PERMIT_TYPE_LABEL).map(k=>`<option value="${k}" ${permitNewType===k?'selected':''}>${PERMIT_TYPE_ICON[k]} ${escapeHtml(PERMIT_TYPE_LABEL[k])}</option>`).join('')}
          </select>
        </div>
        ${!companyId ? `
        <div class="formfield">
          <label class="field-label">Contractor</label>
          <select onchange="permitNewCompanyId=this.value;permitNewAssigneeIds=new Set();permitAssigneeFilterText='';render()">
            <option value="">— RTB (no subcontractor) —</option>
            ${Object.keys(companiesById).map(id=>`<option value="${id}" ${permitNewCompanyId===id?'selected':''}>${escapeHtml(companiesById[id])}</option>`).join('')}
          </select>
        </div>
        ` : ''}
        <div class="formfield">
          <label class="field-label">Who needs to sign this permit? (required)</label>
          <input type="text" id="permitAssigneeFilterInput" placeholder="Filter by name…" value="${escapeHtml(permitAssigneeFilterText)}" oninput="setPermitAssigneeFilter(this.value)" style="margin-bottom:8px;">
          ${assigneeRoster.length ? (() => {
            const q = permitAssigneeFilterText.trim().toLowerCase();
            const filtered = q ? assigneeRoster.filter(p=>(p.name||'').toLowerCase().includes(q)) : assigneeRoster;
            return filtered.length ? `<div style="max-height:220px;overflow-y:auto;border:1px solid var(--line);border-radius:8px;padding:6px 10px;">
              ${filtered.map(p=>`
                <label class="stub" style="display:flex;align-items:center;gap:8px;margin:4px 0;">
                  <input type="checkbox" style="width:auto;" ${permitNewAssigneeIds.has(p.id)?'checked':''} onchange="togglePermitAssignee('${p.id}')">${escapeHtml(p.name)}
                </label>
              `).join('')}
            </div>` : `<p class="stub" style="margin:0;">No operatives match "${escapeHtml(permitAssigneeFilterText)}".</p>`;
          })() : `<p class="stub" style="margin:0;">No operatives available to pick from yet.</p>`}
        </div>
        <div class="formfield">
          <label class="field-label">Description of works</label>
          <input type="text" value="${escapeHtml(permitNewDescription)}" oninput="permitNewDescription=this.value" placeholder="e.g. Hot works to re-felt the plant room roof">
        </div>
        <div class="formfield">
          <label class="field-label">Location</label>
          <input type="text" value="${escapeHtml(fullSiteAddress(site))}" disabled style="background:#F3F4F6;">
        </div>
        <div class="formfield">
          <label class="field-label">Date</label>
          <input type="date" value="${permitNewDate}" onchange="permitNewDate=this.value">
        </div>
        ${!ME.signature_path ? `<p class="stub" style="color:var(--warn);margin:0 0 10px;">You haven't adopted a signature yet — <span style="text-decoration:underline;cursor:pointer;" onclick="go('#/signature')">set one up</span> before issuing.</p>` : ''}
        <div class="row-gap">
          <button class="ghostbtn" style="flex:1;" onclick="permitIssueOpen=false;permitAssigneeFilterText='';render()">Cancel</button>
          <button class="darkbtn" style="flex:1;" onclick="submitIssuePermit('${siteId}','${companyId||''}')">Issue Permit</button>
        </div>
      </div>
    ` : `<button class="ghostbtn" style="margin-top:14px;" onclick="permitIssueOpen=true;render()">+ Issue Permit</button>`) : ''}
  `, {title:'Permits To Work', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back: companyId ? `#/site/${siteId}/mc/subcontractors/${companyId}` : `#/site/${siteId}/mc`, siteId, activeTab:'more'}); }
}
window.togglePermitAssignee = function(userId){
  if(permitNewAssigneeIds.has(userId)) permitNewAssigneeIds.delete(userId); else permitNewAssigneeIds.add(userId);
  render();
};
window.submitIssuePermit = async function(siteId, fixedCompanyId){
  if(!ME.signature_path){ toast('Adopt your signature first.'); go('#/signature'); return; }
  if(!permitNewDescription.trim()){ toast('Add a description of the works.'); return; }
  if(!permitNewAssigneeIds.size){ toast('Select at least one employee to sign this permit.'); return; }
  const site = SITES.find(s=>s.id===siteId);
  const effectiveCompanyId = fixedCompanyId || permitNewCompanyId || null;
  const rows = await dbInsert('permits', {
    org_id: site.org_id, site_id: siteId, subcontractor_company_id: effectiveCompanyId,
    permit_type: permitNewType, description: permitNewDescription.trim(), location: fullSiteAddress(site),
    work_date: permitNewDate || null, assigned_user_ids: Array.from(permitNewAssigneeIds),
    issued_by: ME.id, issuer_signature_path: ME.signature_path,
  });
  if(rows){
    postSystemMessage(siteId, 'permit_issued', `${ME.name} issued a ${PERMIT_TYPE_LABEL[permitNewType]} permit`);
    logSiteActivity(siteId, 'permit_issued', `Issued a ${PERMIT_TYPE_LABEL[permitNewType]} permit`);
    permitIssueOpen = false;
    permitNewDescription = '';
    permitNewCompanyId = '';
    permitNewAssigneeIds = new Set();
    permitAssigneeFilterText = '';
    toast('Permit issued');
    render();
  }
};
async function renderPermitView(siteId, permitId, companyId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  const rows = await dbSelect('permits', 'id=eq.'+permitId+'&select=*');
  const permit = rows[0];
  const backHash = companyId ? `#/site/${siteId}/mc/subcontractors/${companyId}/permits` : `#/site/${siteId}/mc/permits`;
  if(!permit){ go(backHash); return; }
  await loadAllProfiles();
  const signoffs = await dbSelect('permit_signoffs', 'permit_id=eq.'+permitId+'&select=*');
  const signedById = {}; signoffs.forEach(s=>{ signedById[s.user_id]=s; });
  const assignedProfiles = (permit.assigned_user_ids||[]).map(id=>PROFILES[id]).filter(Boolean);
  const amAssigned = (permit.assigned_user_ids||[]).includes(ME.id);
  const amSigned = !!signedById[ME.id];
  const amSubAdmin = permit.subcontractor_company_id ? await isSubcontractorAdmin(permit.subcontractor_company_id) : false;
  const canManage = isManager(ME) || amSubAdmin;
  const canClose = permit.status==='open' && (canManage || amAssigned);
  const isHotWorks = permit.permit_type==='hot_works';
  const closeState = permitCloseState[permitId] || (permitCloseState[permitId] = {photo1:null, photo2:null, notes:''});
  const company = permit.subcontractor_company_id ? (await dbSelect('subcontractor_companies', 'id=eq.'+permit.subcontractor_company_id+'&select=name'))[0] : null;
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <div class="card">
      <p class="sectiontitle" style="margin-top:0;">${PERMIT_TYPE_ICON[permit.permit_type]||'🧾'} ${escapeHtml(PERMIT_TYPE_LABEL[permit.permit_type]||permit.permit_type)}</p>
      <p class="stub" style="margin:0 0 6px;">${escapeHtml(permit.description||'')}</p>
      <p class="stub" style="margin:0 0 2px;"><b>Location:</b> ${escapeHtml(permit.location||fullSiteAddress(site))}</p>
      <p class="stub" style="margin:0 0 2px;"><b>Date:</b> ${permit.work_date ? new Date(permit.work_date+'T00:00:00').toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'}) : '—'}</p>
      ${company ? `<p class="stub" style="margin:0 0 2px;"><b>Subcontractor:</b> ${escapeHtml(company.name)}</p>` : ''}
      <p class="stub" style="margin:0 0 10px;"><b>Status:</b> <span class="statustag2 ${permit.status}">${permit.status}</span></p>
      <p class="stub" style="margin:0 0 4px;"><b>Issued by</b> ${escapeHtml(nameOf(permit.issued_by))} on ${new Date(permit.issued_at).toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'})}</p>
      ${permit.issuer_signature_path ? `<img src="${publicUrl('signatures', permit.issuer_signature_path)}" style="height:40px;max-width:180px;object-fit:contain;">` : ''}
    </div>

    <p class="sectiontitle" style="margin-top:18px;">Sign-off required</p>
    ${assignedProfiles.length ? assignedProfiles.map(p=>{
      const sig = signedById[p.id];
      return `
      <div class="sitecard">
        <div class="swatch personswatch">${escapeHtml((p.name||'?').split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase())}</div>
        <div class="info"><div class="name">${escapeHtml(p.name)}</div><div class="addr">${sig ? 'Signed '+new Date(sig.signed_at).toLocaleDateString(undefined,{day:'2-digit',month:'short'}) : 'Awaiting signature'}</div></div>
        ${sig ? `<img src="${publicUrl('signatures', sig.signature_image_path)}" style="height:32px;max-width:100px;object-fit:contain;">` : ''}
      </div>
    `;
    }).join('') : `<div class="empty">No employees selected.</div>`}
    ${amAssigned && !amSigned && permit.status==='open' ? `
      <div class="card" style="margin-top:10px;">
        ${!ME.signature_path ? `<p class="stub" style="color:var(--warn);margin:0;">You haven't adopted a signature yet — <span style="text-decoration:underline;cursor:pointer;" onclick="go('#/signature')">set one up</span> before signing.</p>` : `
        <button class="darkbtn" onclick="signPermit('${permitId}')">Sign this permit</button>
        `}
      </div>
    ` : ''}

    ${permit.status==='closed' ? `
      <p class="sectiontitle" style="margin-top:18px;">Closed down</p>
      <div class="card">
        <p class="stub" style="margin:0 0 4px;"><b>Closed by</b> ${escapeHtml(nameOf(permit.closed_by))} on ${permit.closed_at ? new Date(permit.closed_at).toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'}) : ''}</p>
        ${permit.closed_notes ? `<p class="stub" style="margin:0 0 8px;">${escapeHtml(permit.closed_notes)}</p>` : ''}
        ${permit.closer_signature_path ? `<img src="${publicUrl('signatures', permit.closer_signature_path)}" style="height:40px;max-width:180px;object-fit:contain;margin-bottom:8px;display:block;">` : ''}
        ${permit.closedown_photo_path_1 || permit.closedown_photo_path_2 ? `
          <p class="field-label" style="margin-bottom:6px;">Fire extinguisher photos</p>
          <div style="display:flex;gap:8px;">
            ${permit.closedown_photo_path_1 ? `<img src="${publicUrl('site-photos', permit.closedown_photo_path_1)}" style="width:100px;height:100px;object-fit:cover;border-radius:8px;">` : ''}
            ${permit.closedown_photo_path_2 ? `<img src="${publicUrl('site-photos', permit.closedown_photo_path_2)}" style="width:100px;height:100px;object-fit:cover;border-radius:8px;">` : ''}
          </div>
        ` : ''}
      </div>
    ` : ''}

    ${canClose ? `
      <p class="sectiontitle" style="margin-top:18px;">Close this permit down</p>
      <div class="card">
        ${isHotWorks ? `
          <p class="stub" style="margin:0 0 8px;">Hot works can't be closed down without both fire-extinguisher photos attached.</p>
          <div style="display:flex;gap:10px;margin-bottom:10px;">
            ${[1,2].map(n=>`
              <div>
                <p class="field-label" style="margin-bottom:4px;">Photo ${n}</p>
                ${closeState['photo'+n] ? `<img src="${closeState['photo'+n]}" style="width:90px;height:90px;object-fit:cover;border-radius:8px;display:block;margin-bottom:4px;">` : ''}
                <div class="photoupload" style="cursor:pointer;width:90px;padding:8px;" onclick="document.getElementById('permitClosePhoto${n}Input').click()">
                  <div style="font-size:16px;">📷</div>${closeState['photo'+n]?'Retake':'Add photo'}
                </div>
                <input type="file" id="permitClosePhoto${n}Input" accept="image/*" style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;" onchange="permitClosePhotoChosen(this,'${permitId}',${n})">
              </div>
            `).join('')}
          </div>
        ` : ''}
        <div class="formfield">
          <label class="field-label">Closing notes (optional)</label>
          <input type="text" value="${escapeHtml(closeState.notes)}" oninput="permitCloseState['${permitId}'].notes=this.value" placeholder="Anything worth noting">
        </div>
        ${!ME.signature_path ? `<p class="stub" style="color:var(--warn);margin:0 0 10px;">You haven't adopted a signature yet — <span style="text-decoration:underline;cursor:pointer;" onclick="go('#/signature')">set one up</span> before closing.</p>` : ''}
        <button class="darkbtn" onclick="closePermit('${siteId}','${permitId}')">Close Permit</button>
      </div>
    ` : ''}
  `, {title:PERMIT_TYPE_LABEL[permit.permit_type]||'Permit', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:backHash, siteId, activeTab:'more'}); }
}
window.permitClosePhotoChosen = async function(input, permitId, n){
  const file = input.files && input.files[0]; if(!file) return;
  try{
    const dataUrl = await compressImage(file);
    if(!permitCloseState[permitId]) permitCloseState[permitId] = {photo1:null, photo2:null, notes:''};
    permitCloseState[permitId]['photo'+n] = dataUrl;
    render();
  }catch(e){ toast('Could not process photo.'); }
  input.value = '';
};
window.signPermit = async function(permitId){
  if(!ME.signature_path){ toast('Adopt your signature first.'); go('#/signature'); return; }
  const rows = await dbInsert('permit_signoffs', {permit_id:permitId, user_id:ME.id, signature_image_path:ME.signature_path});
  if(rows){ toast('Signed'); render(); }
};
window.closePermit = async function(siteId, permitId){
  if(!ME.signature_path){ toast('Adopt your signature first.'); go('#/signature'); return; }
  const existing = await dbSelect('permits', 'id=eq.'+permitId+'&select=permit_type');
  const permit = existing[0];
  const state = permitCloseState[permitId] || {photo1:null, photo2:null, notes:''};
  if(permit && permit.permit_type==='hot_works' && (!state.photo1 || !state.photo2)){
    toast('Both fire-extinguisher photos are required to close a hot works permit.');
    return;
  }
  let photoPath1 = null, photoPath2 = null;
  if(state.photo1) photoPath1 = await uploadDataUrl('site-photos', siteId+'/permits/'+permitId+'-ext1-'+crypto.randomUUID()+'.jpg', state.photo1);
  if(state.photo2) photoPath2 = await uploadDataUrl('site-photos', siteId+'/permits/'+permitId+'-ext2-'+crypto.randomUUID()+'.jpg', state.photo2);
  if(permit && permit.permit_type==='hot_works' && (!photoPath1 || !photoPath2)){
    toast('One or both fire-extinguisher photos failed to upload — check your connection and try again before closing.');
    return;
  }
  const row = await dbUpdate('permits', permitId, {
    status:'closed', closed_by:ME.id, closed_at:new Date().toISOString(), closed_notes: state.notes||null,
    closer_signature_path: ME.signature_path,
    closedown_photo_path_1: photoPath1, closedown_photo_path_2: photoPath2,
  });
  if(row){
    delete permitCloseState[permitId];
    postSystemMessage(siteId, 'permit_closed', `${ME.name} closed a permit`);
    logSiteActivity(siteId, 'permit_closed', `Closed a ${PERMIT_TYPE_LABEL[row.permit_type]||''} permit`);
    toast('Permit closed');
    render();
  }
};
