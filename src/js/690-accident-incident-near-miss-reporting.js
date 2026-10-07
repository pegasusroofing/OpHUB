/* ================= ACCIDENT / INCIDENT / NEAR MISS REPORTING =================
   Modelled directly on RTB Roofing's paper "Accident, Incident & Near Miss
   Report" form. Anyone with site access can file one (near misses need
   reporting by whoever's there, not just PMs) — reports are permanent once
   signed, matching a filed safety record; only a PM/admin can delete one.
*/
function newIncidentDraft(){
  return {
    witnesses:'', medicalRequired:'', injuryOccurred:'', injuryFurtherTreatment:'',
    damageOccurred:'', damageSeverity:'', potentialSeverity:'', reoccurrence:'', riddor:'',
    incidentType:'', areaPhotos:[], damagePhotos:[], textFields:{},
  };
}
let incidentDraft = null;
let incidentPhotoBusy = false;
// Every uncontrolled text input/textarea in the incident form, by id — its
// typed value lives only in the DOM until Submit reads it (see `val()` in
// submitIncidentReport). Ticking a toggle/checkbox re-renders the whole form
// (setIncidentField -> render()), which used to silently wipe every one of
// these back to blank because the fresh markup had nothing to seed them with
// (#264, same root cause as the tool-photo bug in #253). Fix: capture
// whatever's currently typed into incidentDraft.textFields right before any
// such re-render, and have the template read back from there.
const INCIDENT_TEXT_FIELD_IDS = ['incSiteAddress','incLocation','incDate','incOperatives','incFiledBy','incDetail','incDateTime','incReportedDateTime','incReportedTo','incWitnessNames','incMedicalDetail','incInjuryTo','incInjuryDescription','incDamageDescription','incContributingFactors','incCorrectiveAction','incPotentialOutcome'];
function captureIncidentTextFields(){
  if(!incidentDraft) return;
  INCIDENT_TEXT_FIELD_IDS.forEach(id=>{
    const el = document.getElementById(id);
    if(el) incidentDraft.textFields[id] = el.value;
  });
}
function incidentToggleRow(field, value, options){
  return `<div class="row-gap" style="margin-bottom:14px;flex-wrap:wrap;">${options.map(opt=>`<button type="button" class="${value===opt.v?'darkbtn':'ghostbtn'}" style="flex:1;min-width:70px;" onclick="setIncidentField('${field}','${opt.v}')">${opt.l}</button>`).join('')}</div>`;
}
window.setIncidentField = function(field, value){ captureIncidentTextFields(); if(incidentDraft) incidentDraft[field] = value; render(); };
window.toggleIncidentOperativeTick = function(name, checked){
  const el = document.getElementById('incOperatives');
  if(!el) return;
  const names = el.value.split(',').map(s=>s.trim()).filter(Boolean);
  const idx = names.indexOf(name);
  if(checked && idx===-1) names.push(name);
  else if(!checked && idx!==-1) names.splice(idx,1);
  el.value = names.join(', ');
  if(incidentDraft){ incidentDraft.textFields = incidentDraft.textFields||{}; incidentDraft.textFields.incOperatives = el.value; }
};
window.uploadIncidentPhoto = async function(input, siteId, field){
  const files = input.files ? Array.from(input.files) : [];
  if(!files.length || !incidentDraft) return;
  captureIncidentTextFields();
  incidentPhotoBusy = true; render();
  let failedPhotos = 0;
  for(const file of files){
    const path = siteId+'/incidents/tmp/'+crypto.randomUUID()+'-'+file.name.replace(/[^a-z0-9.\-]+/gi,'_');
    const stored = await uploadToStorage('incident-photos', path, file, file.type);
    if(stored) incidentDraft[field].push(stored); else failedPhotos++;
  }
  incidentPhotoBusy = false; render();
  if(failedPhotos>0) toast(`${failedPhotos} photo${failedPhotos>1?'s':''} failed to upload — check your connection and try again.`);
};
window.removeIncidentPhoto = function(field, idx){ if(!incidentDraft) return; captureIncidentTextFields(); incidentDraft[field].splice(idx,1); render(); };
async function renderIncidents(siteId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  await loadAllProfiles();
  const reports = await dbSelect('incident_reports', 'site_id=eq.'+siteId+'&order=created_at.desc');
  const canDelete = isManager(ME);
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <button class="darkbtn" style="margin-bottom:14px;border:1px solid var(--brand2);" onclick="incidentDraft=newIncidentDraft();go('#/site/${siteId}/hs/incidents/new')">⚠️ Report Accident / Incident / Near Miss</button>
    ${reports.length ? reports.map(r=>`
      <div class="sitecard" style="cursor:pointer;align-items:flex-start;" onclick="go('#/site/${siteId}/hs/incidents/${r.id}')">
        <div class="swatch">⚠️</div>
        <div class="info">
          <div class="name" style="font-weight:700;white-space:normal;word-break:break-word;">${escapeHtml(r.location||'Location not given')}</div>
          <div class="addr">${r.incident_date ? new Date(r.incident_date+'T00:00:00').toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'}) : new Date(r.created_at).toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'})} · Filed by ${escapeHtml(r.filed_by_name || nameOf(r.created_by))}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">
            ${r.riddor_reportable ? `<span class="rolechip" style="background:#FDECEA;color:var(--red);">RIDDOR</span>` : ''}
            ${r.injury_occurred ? `<span class="rolechip">Injury</span>` : ''}
            ${r.damage_occurred ? `<span class="rolechip">Damage</span>` : ''}
            ${!r.injury_occurred && !r.damage_occurred && !r.riddor_reportable ? `<span class="rolechip">Near miss</span>` : ''}
          </div>
        </div>
        ${canDelete ? `<div class="taskicons"><div class="taskicon danger" onclick="event.stopPropagation();deleteIncidentReport('${r.id}','${siteId}')">🗑</div></div>` : ''}
      </div>
    `).join('') : `<div class="empty">No accidents, incidents or near misses reported for this project.</div>`}
  `, {title:'Accident / Incident', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/hs`, siteId, activeTab:'more'}); }
}
window.deleteIncidentReport = async function(reportId, siteId){
  if(!await customConfirm('Delete this report? This can\'t be undone.')) return;
  const rows = await dbSelect('incident_reports', 'id=eq.'+reportId+'&select=incident_type,incident_date');
  const incRow = rows[0];
  const ok = await dbDelete('incident_reports', reportId);
  if(ok){ toast('Report deleted'); if(incRow) logSiteActivity(siteId, 'incident_report_deleted', `Deleted ${incRow.incident_type||'incident'} report${incRow.incident_date?' ('+incRow.incident_date+')':''}`); render(); }
};
async function renderIncidentFill(siteId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  if(!incidentDraft) incidentDraft = newIncidentDraft();
  const d = incidentDraft;
  const tf = d.textFields || {};
  const tfv = (id, dflt) => tf[id]!==undefined ? tf[id] : (dflt||'');
  // Tick-box operative picker (#292-style — matches the report-template
  // "operatives" item): fetched once per draft and cached on the draft
  // itself so re-renders (every toggle/field capture) don't refetch. Ticking
  // a name adds/removes it from the same comma-separated incOperatives text
  // field the manual typing already writes to, so nothing downstream (the
  // DB column, the PDF export) needs to change — this is purely an easier
  // way to fill that one field, still free-text-editable alongside it.
  if(!d.assignedOperatives){
    await loadAllProfiles();
    const assignedRows = await dbSelect('site_assignments', 'site_id=eq.'+siteId+'&select=user_id');
    d.assignedOperatives = assignedRows.map(r=>PROFILES[r.user_id]).filter(p=>p && p.role==='operative').sort((a,b)=>a.name.localeCompare(b.name));
  }
  const tickedNames = new Set(tfv('incOperatives').split(',').map(s=>s.trim()).filter(Boolean));
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <p class="stub" style="margin:0 0 14px;">Fill in what you can — the more detail the better. Fields marked * are required.</p>

    <label class="field-label">* 2. What type of report is this?</label>
    ${incidentToggleRow('incidentType', d.incidentType, [{v:'incident',l:'Incident'},{v:'accident',l:'Accident'},{v:'near_miss',l:'Near Miss'}])}

    <div class="formfield" style="margin-top:0;"><label class="field-label">Site of accident / incident / near miss</label><input type="text" id="incSiteAddress" value="${escapeHtml(tfv('incSiteAddress', site.name + (fullSiteAddress(site) ? ', '+fullSiteAddress(site) : '')))}"></div>
    <div class="formfield"><label class="field-label">Location of incident</label><input type="text" id="incLocation" value="${escapeHtml(tfv('incLocation'))}"></div>
    <div class="formfield" onclick="openDatePickerRow(this)"><label class="field-label">Date of incident</label><input type="date" id="incDate" value="${escapeHtml(tfv('incDate', localISODate(new Date())))}"></div>
    <label class="field-label">Operatives involved</label>
    ${d.assignedOperatives.length ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">${d.assignedOperatives.map(op=>`<label class="stub" style="display:flex;align-items:center;gap:5px;border:1px solid var(--line);border-radius:8px;padding:6px 9px;margin:0;"><input type="checkbox" style="width:auto;" ${tickedNames.has(op.name)?'checked':''} onchange="toggleIncidentOperativeTick('${jsAttr(op.name)}',this.checked)">${escapeHtml(op.name)}</label>`).join('')}</div>` : ''}
    <div class="formfield"><input type="text" id="incOperatives" placeholder="Tick above, or type names not assigned to this site" value="${escapeHtml(tfv('incOperatives'))}"></div>
    <div class="formfield"><label class="field-label">Form filed by</label><input type="text" id="incFiledBy" value="${escapeHtml(tfv('incFiledBy', ME.name))}"></div>

    <div class="formfield"><label class="field-label">* Detail of the incident</label><textarea id="incDetail" rows="4" style="width:100%;box-sizing:border-box;">${escapeHtml(tfv('incDetail'))}</textarea></div>

    <label class="field-label">Photo of area of incident</label>
    <div class="ghostbtn" style="cursor:pointer;text-align:center;margin-bottom:6px;" onclick="document.getElementById('incAreaPhotoInput').click()">${incidentPhotoBusy ? 'Uploading…' : '📷 Add Photo(s)'}</div>
    <input type="file" accept="image/jpeg,image/png" multiple id="incAreaPhotoInput" style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;" onchange="uploadIncidentPhoto(this,'${siteId}','areaPhotos')">
    ${d.areaPhotos.length ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;">${d.areaPhotos.map((p,i)=>`<div style="position:relative;"><img src="${publicUrl('incident-photos',p)}" style="width:60px;height:60px;object-fit:cover;border-radius:6px;"><div class="taskicon danger" style="position:absolute;top:-6px;right:-6px;background:#fff;border-radius:50%;" onclick="removeIncidentPhoto('areaPhotos',${i})">✕</div></div>`).join('')}</div>` : `<div style="margin-bottom:14px;"></div>`}

    <div class="formfield"><label class="field-label">Date and time of incident</label><input type="datetime-local" id="incDateTime" value="${escapeHtml(tfv('incDateTime'))}"></div>
    <div class="formfield"><label class="field-label">Date and time incident was reported</label><input type="datetime-local" id="incReportedDateTime" value="${escapeHtml(tfv('incReportedDateTime'))}"></div>
    <div class="formfield"><label class="field-label">To whom was the incident reported?</label><input type="text" id="incReportedTo" value="${escapeHtml(tfv('incReportedTo'))}"></div>

    <label class="field-label">Was there any witness(es)?</label>
    ${incidentToggleRow('witnesses', d.witnesses, [{v:'yes',l:'Yes'},{v:'no',l:'No'},{v:'na',l:'N/A'}])}
    ${d.witnesses==='yes' ? `<div class="formfield"><label class="field-label">Witness name(s)</label><input type="text" id="incWitnessNames" value="${escapeHtml(tfv('incWitnessNames'))}"></div>` : ''}

    <label class="field-label">* Operative requires further medical treatment</label>
    ${incidentToggleRow('medicalRequired', d.medicalRequired, [{v:'yes',l:'Yes'},{v:'no',l:'No'}])}
    ${d.medicalRequired==='yes' ? `<div class="formfield"><label class="field-label">What medical treatment is required/advised?</label><textarea id="incMedicalDetail" rows="2" style="width:100%;box-sizing:border-box;">${escapeHtml(tfv('incMedicalDetail'))}</textarea></div>` : ''}

    <p class="sectiontitle">Details of injury, if applicable</p>
    <label class="field-label">* Any injuries occurred?</label>
    ${incidentToggleRow('injuryOccurred', d.injuryOccurred, [{v:'yes',l:'Yes'},{v:'no',l:'No'}])}
    ${d.injuryOccurred==='yes' ? `
      <div class="formfield"><label class="field-label">Injury to who?</label><input type="text" id="incInjuryTo" value="${escapeHtml(tfv('incInjuryTo'))}"></div>
      <div class="formfield"><label class="field-label">Description of injury</label><textarea id="incInjuryDescription" rows="2" style="width:100%;box-sizing:border-box;">${escapeHtml(tfv('incInjuryDescription'))}</textarea></div>
      <label class="field-label">Further medical treatment required</label>
      ${incidentToggleRow('injuryFurtherTreatment', d.injuryFurtherTreatment, [{v:'yes',l:'Yes'},{v:'no',l:'No'}])}
    ` : ''}

    <p class="sectiontitle">Details of damage</p>
    <label class="field-label">Did any damage occur to any property or plant?</label>
    ${incidentToggleRow('damageOccurred', d.damageOccurred, [{v:'yes',l:'Yes'},{v:'no',l:'No'}])}
    ${d.damageOccurred==='yes' ? `
      <label class="field-label">What damage occurred?</label>
      ${incidentToggleRow('damageSeverity', d.damageSeverity, [{v:'minor',l:'Minor'},{v:'serious',l:'Serious'},{v:'major',l:'Major'}])}
      <label class="field-label">Photo of damage</label>
      <div class="ghostbtn" style="cursor:pointer;text-align:center;margin-bottom:6px;" onclick="document.getElementById('incDamagePhotoInput').click()">${incidentPhotoBusy ? 'Uploading…' : '📷 Add Photo(s)'}</div>
      <input type="file" accept="image/jpeg,image/png" multiple id="incDamagePhotoInput" style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;" onchange="uploadIncidentPhoto(this,'${siteId}','damagePhotos')">
      ${d.damagePhotos.length ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;">${d.damagePhotos.map((p,i)=>`<div style="position:relative;"><img src="${publicUrl('incident-photos',p)}" style="width:60px;height:60px;object-fit:cover;border-radius:6px;"><div class="taskicon danger" style="position:absolute;top:-6px;right:-6px;background:#fff;border-radius:50%;" onclick="removeIncidentPhoto('damagePhotos',${i})">✕</div></div>`).join('')}</div>` : ''}
      <div class="formfield"><label class="field-label">Detailed description of how the incident happened, and what happened</label><textarea id="incDamageDescription" rows="3" style="width:100%;box-sizing:border-box;">${escapeHtml(tfv('incDamageDescription'))}</textarea></div>
    ` : ''}

    <p class="sectiontitle">Analysis</p>
    <div class="formfield" style="margin-top:0;"><label class="field-label">Any contributing factors to incident?</label><textarea id="incContributingFactors" rows="2" style="width:100%;box-sizing:border-box;">${escapeHtml(tfv('incContributingFactors'))}</textarea></div>
    <div class="formfield"><label class="field-label">Corrective action (include detail of action and person(s) responsible)</label><textarea id="incCorrectiveAction" rows="3" style="width:100%;box-sizing:border-box;">${escapeHtml(tfv('incCorrectiveAction'))}</textarea></div>
    <label class="field-label">What was the potential for severity?</label>
    ${incidentToggleRow('potentialSeverity', d.potentialSeverity, [{v:'minor',l:'Minor'},{v:'serious',l:'Serious'},{v:'major',l:'Major'}])}
    <div class="formfield"><label class="field-label">What could have potentially happened?</label><textarea id="incPotentialOutcome" rows="2" style="width:100%;box-sizing:border-box;">${escapeHtml(tfv('incPotentialOutcome'))}</textarea></div>
    <label class="field-label">What is the probability of reoccurrence?</label>
    ${incidentToggleRow('reoccurrence', d.reoccurrence, [{v:'remote',l:'Remote'},{v:'improbable',l:'Improbable'},{v:'probable',l:'Probable'}])}

    <label class="field-label">* Riddor reportable?</label>
    ${incidentToggleRow('riddor', d.riddor, [{v:'yes',l:'Yes'},{v:'no',l:'No'}])}

    <p class="stub">Submitting signs this report with your adopted signature — the same one used on RAMS and Toolbox Talks.</p>
    <button class="darkbtn" style="width:100%;" onclick="submitIncidentReport('${siteId}')">Sign &amp; Submit Report</button>
  `, {title:'New Report', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/hs/incidents`, siteId, tabs:false}); }
}
window.submitIncidentReport = async function(siteId){
  if(!incidentDraft) return;
  const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  const detail = val('incDetail');
  const d = incidentDraft;
  if(!d.incidentType){ toast('Please choose whether this is an Incident, Accident or Near Miss.'); return; }
  if(!detail){ toast('Please describe what happened.'); return; }
  if(!d.medicalRequired){ toast('Please answer: does the operative require further medical treatment?'); return; }
  if(!d.injuryOccurred){ toast('Please answer: did any injuries occur?'); return; }
  if(!d.riddor){ toast('Please answer: is this RIDDOR reportable?'); return; }
  if(!ME.signature_path){
    toast('Adopt your signature first — one tap and it\'s used everywhere.');
    go('#/signature');
    return;
  }
  const payload = {
    org_id: ME.org_id, site_id: siteId, created_by: ME.id,
    incident_type: d.incidentType,
    site_address: val('incSiteAddress')||null,
    location: val('incLocation')||null,
    incident_date: val('incDate')||null,
    operatives_involved: val('incOperatives')||null,
    filed_by_name: val('incFiledBy')||ME.name,
    detail,
    area_photo_paths: d.areaPhotos,
    incident_datetime: val('incDateTime') ? new Date(val('incDateTime')).toISOString() : null,
    reported_datetime: val('incReportedDateTime') ? new Date(val('incReportedDateTime')).toISOString() : null,
    reported_to: val('incReportedTo')||null,
    witnesses: d.witnesses||null,
    witness_names: val('incWitnessNames')||null,
    medical_treatment_required: d.medicalRequired==='yes',
    medical_treatment_detail: val('incMedicalDetail')||null,
    injury_occurred: d.injuryOccurred==='yes',
    injury_to: val('incInjuryTo')||null,
    injury_description: val('incInjuryDescription')||null,
    injury_further_treatment: d.injuryFurtherTreatment==='yes',
    damage_occurred: d.damageOccurred==='yes',
    damage_severity: d.damageSeverity||null,
    damage_photo_paths: d.damagePhotos,
    damage_description: val('incDamageDescription')||null,
    contributing_factors: val('incContributingFactors')||null,
    corrective_action: val('incCorrectiveAction')||null,
    potential_severity: d.potentialSeverity||null,
    potential_outcome: val('incPotentialOutcome')||null,
    reoccurrence_probability: d.reoccurrence||null,
    riddor_reportable: d.riddor==='yes',
    signature_image_path: ME.signature_path,
    signed_at: new Date().toISOString(),
  };
  const rows = await dbInsert('incident_reports', payload);
  if(rows){
    incidentDraft = null;
    toast('Report submitted');
    go(`#/site/${siteId}/hs/incidents/${rows[0].id}`);
  }
};
function incidentFieldRow(label, value){
  if(value===null || value===undefined || value==='') return '';
  return `<div style="margin-bottom:10px;"><div class="meta" style="font-weight:700;">${escapeHtml(label)}</div><div style="font-size:14px;color:var(--ink);white-space:pre-wrap;word-break:break-word;">${escapeHtml(String(value))}</div></div>`;
}
function incidentYesNo(v){ return v===true ? 'Yes' : (v===false ? 'No' : ''); }
async function renderIncidentView(siteId, reportId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  await loadAllProfiles();
  const rows = await dbSelect('incident_reports', 'id=eq.'+reportId+'&select=*');
  const r = rows[0];
  if(!r){ go(`#/site/${siteId}/hs/incidents`); return; }
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <div class="card" style="margin-bottom:14px;">
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">
        ${r.riddor_reportable ? `<span class="rolechip" style="background:#FDECEA;color:var(--red);">RIDDOR Reportable</span>` : ''}
        ${r.injury_occurred ? `<span class="rolechip">Injury</span>` : ''}
        ${r.damage_occurred ? `<span class="rolechip">Damage</span>` : ''}
      </div>
      ${incidentFieldRow('Site of accident / incident / near miss', r.site_address)}
      ${incidentFieldRow('Location of incident', r.location)}
      ${incidentFieldRow('Date of incident', r.incident_date ? new Date(r.incident_date+'T00:00:00').toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'}) : '')}
      ${incidentFieldRow('Operatives involved', r.operatives_involved)}
      ${incidentFieldRow('Form filed by', r.filed_by_name)}
      ${incidentFieldRow('Detail of the incident', r.detail)}
      ${r.area_photo_paths && r.area_photo_paths.length ? `<div class="meta" style="font-weight:700;">Photo of area of incident</div><div style="display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 10px;">${r.area_photo_paths.map(p=>`<img src="${publicUrl('incident-photos',p)}" style="width:70px;height:70px;object-fit:cover;border-radius:6px;cursor:pointer;" onclick="viewDrawing('${publicUrl('incident-photos',p)}', true, 'photo.jpg')" onerror="this.onerror=null;this.src='${PHOTO_PLACEHOLDER_INLINE}';this.style.cursor='default';this.removeAttribute('onclick');">`).join('')}</div>` : ''}
      ${incidentFieldRow('Date and time of incident', r.incident_datetime ? new Date(r.incident_datetime).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '')}
      ${incidentFieldRow('Date and time incident was reported', r.reported_datetime ? new Date(r.reported_datetime).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '')}
      ${incidentFieldRow('Reported to', r.reported_to)}
      ${incidentFieldRow('Witnesses', r.witnesses==='na'?'N/A':(r.witnesses ? r.witnesses.charAt(0).toUpperCase()+r.witnesses.slice(1) : ''))}
      ${incidentFieldRow('Witness name(s)', r.witness_names)}
      ${incidentFieldRow('Operative requires further medical treatment', incidentYesNo(r.medical_treatment_required))}
      ${incidentFieldRow('Medical treatment required/advised', r.medical_treatment_detail)}
      ${incidentFieldRow('Any injuries occurred', incidentYesNo(r.injury_occurred))}
      ${incidentFieldRow('Injury to who', r.injury_to)}
      ${incidentFieldRow('Description of injury', r.injury_description)}
      ${incidentFieldRow('Further medical treatment required', incidentYesNo(r.injury_further_treatment))}
      ${incidentFieldRow('Damage to property/plant', incidentYesNo(r.damage_occurred))}
      ${incidentFieldRow('Damage severity', r.damage_severity ? r.damage_severity.charAt(0).toUpperCase()+r.damage_severity.slice(1) : '')}
      ${r.damage_photo_paths && r.damage_photo_paths.length ? `<div class="meta" style="font-weight:700;">Photo of damage</div><div style="display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 10px;">${r.damage_photo_paths.map(p=>`<img src="${publicUrl('incident-photos',p)}" style="width:70px;height:70px;object-fit:cover;border-radius:6px;cursor:pointer;" onclick="viewDrawing('${publicUrl('incident-photos',p)}', true, 'photo.jpg')" onerror="this.onerror=null;this.src='${PHOTO_PLACEHOLDER_INLINE}';this.style.cursor='default';this.removeAttribute('onclick');">`).join('')}</div>` : ''}
      ${incidentFieldRow('How the incident happened', r.damage_description)}
      ${incidentFieldRow('Contributing factors', r.contributing_factors)}
      ${incidentFieldRow('Corrective action', r.corrective_action)}
      ${incidentFieldRow('Potential severity', r.potential_severity ? r.potential_severity.charAt(0).toUpperCase()+r.potential_severity.slice(1) : '')}
      ${incidentFieldRow('What could have potentially happened', r.potential_outcome)}
      ${incidentFieldRow('Probability of reoccurrence', r.reoccurrence_probability ? r.reoccurrence_probability.charAt(0).toUpperCase()+r.reoccurrence_probability.slice(1) : '')}
      ${incidentFieldRow('RIDDOR reportable', incidentYesNo(r.riddor_reportable))}
      <div class="meta" style="margin-top:10px;">Signed by ${escapeHtml(nameOf(r.created_by))} · ${r.signed_at ? new Date(r.signed_at).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : ''}</div>
      ${r.signature_image_path ? `<img src="${publicUrl('signatures', r.signature_image_path)}" style="height:28px;object-fit:contain;margin-top:4px;">` : ''}
    </div>
    <div class="row-gap">
      <button class="ghostbtn exportbtn" style="flex:1;" onclick="exportIncidentPdf('${reportId}')">Export PDF</button>
      <button class="ghostbtn exportbtn" style="flex:1;" onclick="emailIncidentReport('${siteId}','${reportId}')">Email PDF</button>
    </div>
    ${isManager(ME) ? `<button class="ghostbtn" style="margin-top:10px;margin-bottom:10px;color:var(--red);" onclick="deleteIncidentReport('${reportId}','${siteId}')">Delete Report</button>` : ''}
  `, {title:'Incident Report', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/hs/incidents`, siteId, tabs:false, tightBottom:true}); }
}
async function buildIncidentPdf(reportId){
  if(!(await loadLib('PDFLib'))){ toast('PDF library failed to load — check connection.'); return null; }
  const rows = await dbSelect('incident_reports', 'id=eq.'+reportId+'&select=*');
  const r = rows[0]; if(!r) return null;
  await loadAllProfiles();
  const site = SITES.find(s=>s.id===r.site_id);
  const pdfDoc = await PDFLib.PDFDocument.create();
  const fonts = await havsPdfFonts(pdfDoc);
  const {bold, reg, INK, SLATE, LINE} = fonts;
  const logoImg = await havsFetchLogoImg(pdfDoc);
  const PAGE_W = 595.28, PAGE_H = 841.89, MARGIN = 44, CONTENT_W = PAGE_W-2*MARGIN;
  const BRAND = pdfHexToRgb((ORG && ORG.color_primary) || DEFAULT_BRAND1);
  const WHITE = PDFLib.rgb(1,1,1);
  let page, y;
  function drawHeader(){
    page.drawRectangle({x:0, y:PAGE_H-92, width:PAGE_W, height:92, color:BRAND});
    if(logoImg){
      const dim = logoImg.scale(1); const s = 40/Math.max(dim.width, dim.height);
      const w = dim.width*s, h = dim.height*s;
      // Aligned with the 3-line title block beside it (see buildReportPdf's
      // drawHeaderBand) rather than the plain band height.
      page.drawRectangle({x:MARGIN, y:PAGE_H-76, width:40, height:40, color:WHITE});
      page.drawImage(logoImg, {x:MARGIN+(40-w)/2, y:PAGE_H-76+(40-h)/2, width:w, height:h});
    }
    const textX = logoImg ? MARGIN+52 : MARGIN;
    page.drawText('ACCIDENT / INCIDENT / NEAR MISS REPORT', {x:textX, y:PAGE_H-40, size:9, font:bold, color:WHITE, opacity:0.85});
    pdfDrawFit(page, r.location || pdfSiteLabel(site), {x:textX, y:PAGE_H-60, size:16, font:bold, color:WHITE});
    pdfDrawFit(page, pdfSiteLabel(site) + ' · ' + (r.incident_date ? new Date(r.incident_date+'T00:00:00').toLocaleDateString('en-GB') : ''), {x:textX, y:PAGE_H-76, size:9.5, font:reg, color:WHITE, opacity:0.9});
  }
  function drawFooter(){
    page.drawLine({start:{x:MARGIN,y:34}, end:{x:PAGE_W-MARGIN,y:34}, thickness:0.75, color:PDFLib.rgb(0.85,0.84,0.80)});
    page.drawText('Generated via OpHUB', {x:MARGIN, y:20, size:8, font:reg, color:SLATE});
  }
  function newPage(){ page = pdfDoc.addPage([PAGE_W,PAGE_H]); drawHeader(); drawFooter(); y = PAGE_H-118; }
  function ensureSpace(h){ if(y-h<50) newPage(); }
  function wrapText(text, font, size, maxWidth){
    const words = String(text).split(/\s+/); const lines=[]; let line='';
    words.forEach(w=>{ const test = line?line+' '+w:w; if(font.widthOfTextAtSize(test,size)>maxWidth && line){ lines.push(line); line=w; } else line=test; });
    if(line) lines.push(line);
    return lines;
  }
  function drawRow(label, value){
    if(value===null || value===undefined || value==='') return;
    ensureSpace(30);
    page.drawText(String(label), {x:MARGIN, y, size:9.5, font:bold, color:SLATE});
    y -= 13;
    const lines = wrapText(String(value), reg, 11, CONTENT_W);
    lines.forEach(ln=>{ ensureSpace(15); page.drawText(ln, {x:MARGIN, y, size:11, font:reg, color:INK}); y -= 15; });
    y -= 6;
    page.drawLine({start:{x:MARGIN,y:y+2}, end:{x:PAGE_W-MARGIN,y:y+2}, thickness:0.5, color:LINE});
    y -= 8;
  }
  async function drawPhotos(label, paths){
    if(!paths || !paths.length) return;
    ensureSpace(24);
    page.drawText(label, {x:MARGIN, y, size:9.5, font:bold, color:SLATE}); y -= 8;
    let x = MARGIN; const size = 90;
    await pdfPrefetchImages(paths.map(p=>publicUrl('incident-photos', p)));
    for(const p of paths){
      if(x + size > PAGE_W-MARGIN){ x = MARGIN; y -= (size+8); }
      ensureSpace(size+8);
      try{
        const bytes = await pdfFetchImageBytesScaled(publicUrl('incident-photos', p), Math.round(size*3), 0.78);
        if(bytes){
          let img; try{ img = await pdfDoc.embedJpg(bytes); }catch(e){ img = await pdfDoc.embedPng(bytes); }
          page.drawImage(img, {x, y:y-size, width:size, height:size});
        }
      }catch(e){}
      x += size+8;
    }
    y -= (size+14);
  }
  newPage();
  const fmtDT = v => v ? new Date(v).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
  const cap = v => v ? v.charAt(0).toUpperCase()+v.slice(1) : '';
  drawRow('Site of accident / incident / near miss', r.site_address);
  drawRow('Location of incident', r.location);
  drawRow('Date of incident', r.incident_date ? new Date(r.incident_date+'T00:00:00').toLocaleDateString('en-GB') : '');
  drawRow('Operatives involved', r.operatives_involved);
  drawRow('Form filed by', r.filed_by_name);
  drawRow('Detail of the incident', r.detail);
  await drawPhotos('Photo of area of incident', r.area_photo_paths);
  drawRow('Date and time of incident', fmtDT(r.incident_datetime));
  drawRow('Date and time incident was reported', fmtDT(r.reported_datetime));
  drawRow('To whom was the incident reported', r.reported_to);
  drawRow('Witnesses', r.witnesses==='na'?'N/A':cap(r.witnesses));
  drawRow('Witness name(s)', r.witness_names);
  drawRow('Operative requires further medical treatment', incidentYesNo(r.medical_treatment_required));
  drawRow('Medical treatment required/advised', r.medical_treatment_detail);
  drawRow('Any injuries occurred', incidentYesNo(r.injury_occurred));
  drawRow('Injury to who', r.injury_to);
  drawRow('Description of injury', r.injury_description);
  drawRow('Further medical treatment required', incidentYesNo(r.injury_further_treatment));
  drawRow('Damage to property or plant', incidentYesNo(r.damage_occurred));
  drawRow('Damage severity', cap(r.damage_severity));
  await drawPhotos('Photo of damage', r.damage_photo_paths);
  drawRow('How the incident happened', r.damage_description);
  drawRow('Contributing factors', r.contributing_factors);
  drawRow('Corrective action', r.corrective_action);
  drawRow('Potential severity', cap(r.potential_severity));
  drawRow('What could have potentially happened', r.potential_outcome);
  drawRow('Probability of reoccurrence', cap(r.reoccurrence_probability));
  drawRow('RIDDOR reportable', incidentYesNo(r.riddor_reportable));
  ensureSpace(60);
  // Date only on the sign-off line, no time — matches the RAMS/COSHH sign-off pattern (#265).
  const signedDateOnly = r.signed_at ? new Date(r.signed_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '';
  page.drawText('Signed by '+nameOf(r.created_by)+' · '+signedDateOnly, {x:MARGIN, y, size:9.5, font:bold, color:SLATE});
  y -= 20;
  if(r.signature_image_path){
    try{
      const bytes = await pdfFetchImageBytes(publicUrl('signatures', r.signature_image_path));
      if(bytes){ const img = await pdfEmbedImageBytes(pdfDoc, bytes); if(img){ const dim = img.scale(1); const s = 28/dim.height; page.drawImage(img, {x:MARGIN, y:y-28, width:dim.width*s, height:28}); } }
    }catch(e){}
  }
  const bytes = await pdfDoc.save();
  const filename = exportFilename(site.name, 'Incident Report - '+(r.location||'')+' - '+(r.incident_date||''), 'pdf');
  return {bytes, filename};
}
window.exportIncidentPdf = async function(reportId){
  if(!(await loadLib('PDFLib'))){ toast('PDF library failed to load — check connection.'); return; }
  toast('Building PDF…');
  try{
    const built = await buildIncidentPdf(reportId);
    if(!built){ toast('Report not found.'); return; }
    await deliverPdf(built.bytes, built.filename);
  }catch(e){ console.error('Incident PDF export failed', e); toast('Export failed — '+(e && e.message ? e.message : 'unknown error')); }
};
window.emailIncidentReport = async function(siteId, reportId){
  if(!(await loadLib('PDFLib'))){ toast('PDF library failed to load — check connection.'); return; }
  const incidentSite = SITES.find(s=>s.id===siteId);
  let incidentCcClientEmail = null;
  if(incidentSite && incidentSite.client_email){
    const cc = await customConfirm('CC client contact'+((incidentSite.client_contact_name||incidentSite.client_name)?' ('+(incidentSite.client_contact_name||incidentSite.client_name)+')':'')+' on this email?', {confirmLabel:'Yes, CC them', cancelLabel:'No'});
    if(cc) incidentCcClientEmail = incidentSite.client_email;
  }
  toast('Building PDF…');
  try{
    const built = await buildIncidentPdf(reportId);
    if(!built){ toast('Report not found.'); return; }
    let binary=''; const chunk=0x8000; const bytes = built.bytes;
    for(let i=0;i<bytes.length;i+=chunk) binary += String.fromCharCode.apply(null, bytes.subarray(i,i+chunk));
    const content_base64 = btoa(binary);
    const res = await sbFetch('/functions/v1/send-incident-email', {method:'POST', timeoutMs:60000, body: JSON.stringify({site_id:siteId, filename: built.filename, content_base64, client_cc_email: incidentCcClientEmail})});
    const d = await res.json();
    if(!res.ok || d.error){ toast('Email failed — '+(d.error||res.status)); return; }
    toast('Incident report emailed to '+ME.email);
  }catch(e){ console.error('Incident email failed', e); toast('Email failed — '+(e && e.message ? e.message : 'unknown error')); }
};
