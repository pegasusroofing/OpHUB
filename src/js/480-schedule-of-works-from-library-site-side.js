/* ================= Schedule of Works — "From Library" (site side). Lets a
   PM/admin pick one of the org's sow_library_templates (built in Admin
   Centre) and COPY its sections/tasks into THIS site's real
   schedule_sections/schedule_tasks — a one-time copy, not a live link, so
   every line is immediately an ordinary editable/deletable task. ================= */
let scheduleLibraryOpen = false;
let scheduleLibraryTemplates = [];
let scheduleLibraryPreviewId = null;
let scheduleLibraryPreviewCache = {};
window.openScheduleLibraryPanel = async function(siteId){
  scheduleAddPanel = null;
  scheduleLibraryOpen = true;
  scheduleLibraryPreviewId = null;
  scheduleLibraryTemplates = await dbSelect('sow_library_templates', 'org_id=eq.'+ME.org_id+'&order=name.asc');
  render();
};
window.closeScheduleLibraryPanel = function(){ scheduleLibraryOpen = false; scheduleLibraryPreviewId = null; render(); };
window.toggleScheduleLibraryPreview = async function(templateId){
  if(scheduleLibraryPreviewId===templateId){ scheduleLibraryPreviewId = null; render(); return; }
  scheduleLibraryPreviewId = templateId;
  if(!scheduleLibraryPreviewCache[templateId]){
    const [secs, tasks] = await Promise.all([
      dbSelect('sow_library_sections', 'template_id=eq.'+templateId+'&order=position.asc.nullslast,created_at.asc'),
      dbSelect('sow_library_tasks', 'template_id=eq.'+templateId+'&order=position.asc.nullslast,created_at.asc'),
    ]);
    scheduleLibraryPreviewCache[templateId] = {secs, tasks};
  }
  render();
};
function scheduleLibraryPreviewHtml(cache){
  const {secs, tasks} = cache;
  const bySec = {};
  tasks.forEach(t=>{ if(t.section_id) (bySec[t.section_id]=bySec[t.section_id]||[]).push(t); });
  const ungrouped = tasks.filter(t=>!t.section_id);
  if(!secs.length && !tasks.length) return `<p class="stub" style="margin:0;">This template is empty.</p>`;
  return `
    ${secs.map(s=>`
      <p class="stub" style="margin:0 0 2px;font-weight:700;color:var(--ink);">${escapeHtml(s.name)}</p>
      ${(bySec[s.id]||[]).map(t=>`<p class="stub" style="margin:0 0 2px 10px;">• ${escapeHtml(t.name)}</p>`).join('') || `<p class="stub" style="margin:0 0 2px 10px;">No tasks</p>`}
    `).join('')}
    ${ungrouped.length ? `
      <p class="stub" style="margin:6px 0 2px;font-weight:700;color:var(--ink);">Ungrouped</p>
      ${ungrouped.map(t=>`<p class="stub" style="margin:0 0 2px 10px;">• ${escapeHtml(t.name)}</p>`).join('')}
    ` : ''}
  `;
}
window.useScheduleLibraryTemplate = async function(siteId, templateId){
  if(!await customConfirm('Copy this template into the Schedule of Works for this site? Nothing in the library itself changes, and every copied line can be edited or deleted afterwards like any other task.')) return;
  const cache = scheduleLibraryPreviewCache[templateId] || await (async()=>{
    const [secs, tasks] = await Promise.all([
      dbSelect('sow_library_sections', 'template_id=eq.'+templateId+'&order=position.asc.nullslast,created_at.asc'),
      dbSelect('sow_library_tasks', 'template_id=eq.'+templateId+'&order=position.asc.nullslast,created_at.asc'),
    ]);
    return {secs, tasks};
  })();
  const {secs, tasks} = cache;
  let secPos = await nextSectionPosition(siteId);
  const secIdMap = {};
  for(const s of secs){
    const rows = await dbInsert('schedule_sections', {site_id:siteId, name:s.name, position:secPos++, created_by:ME.id});
    if(rows && rows[0]) secIdMap[s.id] = rows[0].id;
  }
  let taskPos = await nextTaskPosition(siteId);
  const newTaskRows = tasks
    .filter(t=>!t.section_id || secIdMap[t.section_id])
    .map(t=>{
      const row = {site_id:siteId, name:t.name, status:'todo', position:taskPos++};
      if(t.section_id) row.section_id = secIdMap[t.section_id];
      return row;
    });
  if(newTaskRows.length) await dbInsert('schedule_tasks', newTaskRows);
  toast(`Copied ${secs.length} section${secs.length===1?'':'s'} and ${tasks.length} task${tasks.length===1?'':'s'} into the schedule`);
  scheduleLibraryOpen = false; scheduleLibraryPreviewId = null;
  render();
};
function taskRowHtml(siteId, t, canAdd, photosByTask, isMultiSite, subAddrById, subAddressesList, subCompanies, isMc){
  if(canAdd && scheduleMultiSelectMode){
    const checked = scheduleMultiSelectedIds.has(t.id);
    return `
      <div class="task">
        <div class="taskbody">
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
            <input type="checkbox" style="width:18px;height:18px;flex:0 0 18px;" ${checked?'checked':''} onclick="toggleScheduleMultiSelectId('${t.id}')">
            <span class="taskname ${t.status==='done'?'done':''}" style="flex:1;">${escapeHtml(t.name)}${t.status==='done'?' <span class="donetick">✓</span>':''}</span>
          </label>
        </div>
      </div>
    `;
  }
  // Per the "allow all rows in whilst they're in to do to be editable text"
  // requirement — a To Do task's name is always a live-editable input
  // (autosaves on blur) rather than needing the separate pencil-edit toggle.
  const alwaysEditable = canAdd && t.status==='todo' && pendingCompleteTaskId!==t.id;
  // Multi-site address pill — moved up into the same header row as the ▾
  // actions button (top-right, immediately to its left) instead of sitting
  // on its own line underneath.
  const sitePillHtml = isMultiSite ? `
    <span ${canAdd?`onclick="addressPickerTaskId='${t.id}';render()" style="cursor:pointer;`:`style="`}display:inline-block;flex:0 0 auto;font-size:10.5px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:${t.sub_site_id?'var(--slate)':'var(--warn)'};background:${t.sub_site_id?'var(--paper)':'var(--warn-bg)'};border:1px solid var(--line);border-radius:20px;padding:2px 8px;white-space:nowrap;">📍 ${t.sub_site_id && subAddrById[t.sub_site_id] ? escapeHtml(subAddrById[t.sub_site_id].name) : (canAdd ? 'Unlinked — tap to link' : 'Unlinked')}</span>
  ` : '';
  // Subcontractor tag — independent of the PM/operative visibility_mode
  // picker above; a task tagged here shows live in that subcontractor's own
  // Schedule of Works tile (see renderSubSchedule) since both views read the
  // same row. Shown to everyone (not just canAdd) so operatives can see at a
  // glance which company a task belongs to; only canAdd gets the picker.
  const assignedCo = t.subcontractor_company_id ? (subCompanies||[]).find(c=>c.id===t.subcontractor_company_id) : null;
  const subCoPillHtml = t.subcontractor_company_id ? `
    <span ${canAdd?`onclick="openSubcontractorAssignPicker('${t.id}')" style="cursor:pointer;`:`style="`}display:inline-block;flex:0 0 auto;font-size:10.5px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:var(--ink);background:#E7E9EE;border:1px solid var(--line);border-radius:20px;padding:2px 8px;white-space:nowrap;">🏗 ${escapeHtml(assignedCo ? assignedCo.name : 'Subcontractor')}</span>
  ` : '';
  return `
      <div class="task">
        <div class="taskbody">
          ${canAdd && editingTaskId===t.id && !alwaysEditable ? `
            <div class="taskeditrow">
              <input type="text" id="editTaskInput-${t.id}" value="${escapeHtml(t.name)}">
              <button class="darkbtn" style="width:auto;" onclick="saveTaskEdit('${siteId}','${t.id}')">Save</button>
              <button class="ghostbtn" style="width:auto;" onclick="editingTaskId=null;render()">Cancel</button>
            </div>
          ` : `
            <div class="taskrowtop">
              ${alwaysEditable ? `
                <input type="text" class="taskname-input" value="${escapeHtml(t.name)}" onblur="saveTaskNameInline(this,'${siteId}','${t.id}')" onkeydown="if(event.key==='Enter')this.blur();">
              ` : `
                <div class="taskname ${t.status==='done'?'done':''}">${(!t.section_id && t.visibility_mode==='assigned')?'🔒 ':''}${escapeHtml(t.name)}${t.status==='done'?' <span class="donetick">✓</span>':''}</div>
                ${t.status==='done' && t.completed_at ? `<div class="meta" style="width:100%;margin-top:2px;">Completed ${new Date(t.completed_at).toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'})}</div>` : ''}
              `}
              <div style="display:flex;align-items:center;gap:6px;flex:0 0 auto;">
                ${sitePillHtml}
                ${subCoPillHtml}
                ${canAdd ? `
                  <div class="taskicons">
                    ${rowActionsMenuHtml('sowtask-'+t.id, `
                      ${!alwaysEditable ? `<div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;editingTaskId='${t.id}';render()">✎ Edit</div>` : ''}
                      ${isMultiSite ? `<div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;addressPickerTaskId='${t.id}';render()">📍 Link Address</div>` : ''}
                      ${!t.section_id ? `<div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;openScheduleAssignExisting('task','${t.id}','${siteId}')">🔒 Assign visibility</div>` : ''}
                      ${isMc ? `<div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;openSubcontractorAssignPicker('${t.id}')">🏗 ${t.subcontractor_company_id?'Change':'Assign'} Subcontractor</div>` : ''}
                      <div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;moveScheduleTask('${siteId}','${t.id}',-1)">▲ Move up</div>
                      <div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;moveScheduleTask('${siteId}','${t.id}',1)">▼ Move down</div>
                      <div class="statusmenu-item danger" onclick="rowActionsMenuOpenFor=null;deleteTask('${siteId}','${t.id}')">🗑 Delete</div>
                      <div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;enterScheduleMultiSelect('${t.id}')">☑ Select Multiple</div>
                    `)}
                  </div>
                ` : ''}
              </div>
            </div>
          `}
          ${canAdd && addressPickerTaskId===t.id ? `
            <div class="card" style="margin:8px 0 0;padding:10px;">
              <p class="stub" style="margin:0 0 8px;">Link this task to an address:</p>
              <div class="row-gap" style="flex-wrap:wrap;">
                <button class="${!t.sub_site_id?'darkbtn':'ghostbtn'}" style="width:auto;padding:6px 10px;font-size:11.5px;" onclick="setTaskSubAddress('${siteId}','${t.id}',null)">Not on the list</button>
                ${(subAddressesList||[]).map(a=>`<button class="${t.sub_site_id===a.id?'darkbtn':'ghostbtn'}" style="width:auto;padding:6px 10px;font-size:11.5px;" onclick="setTaskSubAddress('${siteId}','${t.id}','${a.id}')">${escapeHtml(a.name)}</button>`).join('')}
              </div>
              <button class="ghostbtn" style="margin-top:8px;" onclick="addressPickerTaskId=null;render()">Close</button>
            </div>
          ` : ''}
          ${canAdd && subcontractorAssignPickerTaskId===t.id ? `
            <div class="card" style="margin:8px 0 0;padding:10px;">
              <p class="stub" style="margin:0 0 8px;">Assign this task to a subcontractor — it'll show live in that company's own Schedule of Works tile, and any status/photo update they make shows back here automatically:</p>
              <div class="row-gap" style="flex-wrap:wrap;">
                <button class="${!t.subcontractor_company_id?'darkbtn':'ghostbtn'}" style="width:auto;padding:6px 10px;font-size:11.5px;" onclick="setTaskSubcontractor('${siteId}','${t.id}',null)">RTB / No subcontractor</button>
                ${(subCompanies||[]).map(c=>`<button class="${t.subcontractor_company_id===c.id?'darkbtn':'ghostbtn'}" style="width:auto;padding:6px 10px;font-size:11.5px;" onclick="setTaskSubcontractor('${siteId}','${t.id}','${c.id}')">${escapeHtml(c.name)}</button>`).join('') || `<span class="stub" style="margin:0;">No subcontractors added for this site yet — add one from the Main Contractor tile.</span>`}
              </div>
              <button class="ghostbtn" style="margin-top:8px;" onclick="subcontractorAssignPickerTaskId=null;render()">Close</button>
            </div>
          ` : ''}
          ${photosByTask[t.id] ? `<div class="taskphoto">${photosByTask[t.id].map(p=>`
            <div class="taskphotowrap">
              <img src="${sowPhotoUrl(p,'thumb')}" loading="lazy" decoding="async" width="40" height="40" style="cursor:pointer;" onclick="viewImage('${publicUrl('site-photos',p.storage_path)}')" onerror="this.onerror=null;this.src='${PHOTO_PLACEHOLDER_INLINE}';this.style.cursor='default';this.removeAttribute('onclick');">
              ${t.status!=='done' && (isManager(ME) || p.uploaded_by===ME.id) ? `<div class="taskphotodel" onclick="event.stopPropagation();deleteSchedulePhoto('${siteId}','${t.id}','${p.id}','${p.storage_path}')">×</div>` : ''}
            </div>
          `).join('')}</div>` : ''}
          ${pendingCompleteTaskId===t.id ? `
            <div class="card" style="margin:10px 0 0;padding:10px;background:#FCEFEF;border-color:#E8B4B4;">
              <p class="stub" style="margin:0 0 8px;color:#7A1F1F;">Upload at least one completed photo to mark this task complete.</p>
              <div class="ghostbtn" style="cursor:pointer;text-align:center;" onclick="document.getElementById('completePhotoInput-${t.id}').click()">📸 Upload completed photos</div>
              <input type="file" id="completePhotoInput-${t.id}" accept="image/*" multiple style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;" onchange="completeTaskWithPhotos(this,'${siteId}','${t.id}')">
              <button class="ghostbtn" style="margin-top:8px;" onclick="pendingCompleteTaskId=null;render()">‹ Back to In Progress</button>
            </div>
          ` : `
            <div class="addphotobtn" style="cursor:pointer;${t.status==='done'?'color:var(--ink);':''}" onclick="document.getElementById('taskPhotoInput-${t.id}').click()">📷 Add photo</div>
            <input type="file" id="taskPhotoInput-${t.id}" accept="image/*" multiple style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;" onchange="taskPhoto(this,'${siteId}','${t.id}','${t.status}')">
          `}
        </div>
        <div class="statusbtns">
          <div class="statusbtn ${t.status==='todo'&&pendingCompleteTaskId!==t.id?'active-todo':''}" onclick="setTaskStatus('${siteId}','${t.id}','todo')">To Commence</div>
          <div class="statusbtn ${t.status==='progress'&&pendingCompleteTaskId!==t.id?'active-progress':''}" onclick="setTaskStatus('${siteId}','${t.id}','progress')">In Progress</div>
          <div class="statusbtn ${(t.status==='done'||pendingCompleteTaskId===t.id)?'active-done':''}" onclick="beginTaskComplete('${t.id}')">Complete</div>
        </div>
        ${t.status==='progress' && pendingCompleteTaskId!==t.id ? (()=>{
          // Percentage complete for an In Progress task — a slider that
          // snaps to steps of 10. Anyone who can update the task can move
          // it, so a PM can simply override whatever an operative set.
          const pct = t.percent_complete || 0;
          const prompting = percentPromptTaskId===t.id;
          return `
          <div class="taskpct ${prompting?'prompt':''}">
            ${prompting ? `<p class="stub" style="margin:0 0 6px;font-weight:700;color:var(--warn);">Photo added — how far along is this task now?</p>` : ''}
            <div class="pctrow">
              <input type="range" min="0" max="100" step="10" value="${pct}" aria-label="Percentage complete" style="background:${taskPctFill(pct)};" oninput="this.nextElementSibling.textContent=this.value+'%';this.style.background=taskPctFill(this.value)" onchange="setTaskPercent('${siteId}','${t.id}',this.value)">
              <span class="pctval">${pct}%</span>
            </div>
            ${prompting ? `<button class="ghostbtn" style="margin-top:6px;padding:6px 10px;font-size:11.5px;" onclick="percentPromptTaskId=null;render()">Skip — leave at ${pct}%</button>` : ''}
          </div>`;
        })() : ''}
      </div>
  `;
}
// Fill for the percentage slider: the filled part of the bar is white at 0%
// and deepens to a bold green by 100%, so the shade itself shows how close
// the task is to finished. Returned as a CSS background (filled part up to
// pct, plain white after it).
function taskPctFill(pct){
  const p = Math.max(0, Math.min(100, Number(pct)||0));
  const t = p/100;
  const mix = (from, to)=>Math.round(from + (to-from)*t);
  const col = 'rgb('+mix(255,22)+','+mix(255,163)+','+mix(255,74)+')'; // white -> #16A34A
  return 'linear-gradient(to right, '+col+' 0%, '+col+' '+p+'%, #fff '+p+'%, #fff 100%)';
}
// True while the user is in the middle of something a background refresh
// would destroy: an open dropdown, a slider mid-drag, or a text box with the
// cursor in it (the 8-second poll used to wipe a half-typed task name).
function scheduleControlBusy(){
  const el = document.activeElement;
  if(!el) return false;
  if(el.tagName==='SELECT' || el.tagName==='TEXTAREA') return true;
  if(el.tagName==='INPUT'){
    const t = (el.type||'text').toLowerCase();
    return t!=='checkbox' && t!=='radio' && t!=='button' && t!=='submit' && t!=='file';
  }
  return false;
}
window.setTaskPercent = async function(siteId, taskId, value){
  const pct = Math.max(0, Math.min(100, Math.round(Number(value)/10)*10));
  if(percentPromptTaskId===taskId) percentPromptTaskId = null;
  // 100% means finished — and finishing always needs a completed photo, so
  // hand over to the normal Complete flow rather than saving "100% but
  // still In Progress". Backing out of that leaves the previous figure.
  if(pct>=100){ toast('Upload a completed photo to finish this task'); beginTaskComplete(taskId); return; }
  const row = await dbUpdate('schedule_tasks', taskId, {percent_complete: pct});
  if(row) toast('Progress set to '+pct+'%');
  render();
};
// Compact "site condition" row shown under any section (or the ungrouped
// pseudo-section) that has ever had at least one task — deliberately smaller/
// lighter than a task row, since ticking these is a site-condition report
// anyone with site access can make, not a management action. Both boxes tick
// straight away; Leftover material additionally opens the photo picker right
// after so a photo gets attached to the now-ticked flag (see
// onLeftoverCheckboxClick/leftoverMaterialPhotoChosen below).
function sectionFlagRowHtml(siteId, sectionId, flag){
  const sid = sectionId || '';
  const domKey = sectionId || 'ungrouped';
  const waste = flag ? !!flag.waste_to_clear : false;
  const leftover = flag ? !!flag.leftover_material : false;
  return `
    <div class="sectionflagrow" style="display:flex;gap:16px;flex-wrap:wrap;align-items:center;margin-top:10px;padding:7px 8px 6px;border-top:1px dashed var(--line);">
      <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:11px;font-weight:600;color:var(--slate);">
        <input type="checkbox" style="width:14px;height:14px;margin:0;" ${waste?'checked':''} onclick="toggleWasteFlag(this,'${siteId}','${sid}')"> 🗑 Waste to clear
      </label>
      <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:11px;font-weight:600;color:var(--slate);">
        <input type="checkbox" style="width:14px;height:14px;margin:0;" ${leftover?'checked':''} onclick="onLeftoverCheckboxClick(this,'${siteId}','${sid}')"> 📦 Leftover material
      </label>
      <input type="file" id="leftoverPhotoInput-${domKey}" accept="image/*" style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;" onchange="leftoverMaterialPhotoChosen(this,'${siteId}','${sid}')">
    </div>
  `;
}
function sectionFlagLabel(sectionId){
  if(!sectionId) return 'the ungrouped tasks';
  const sec = scheduleSectionsCache.find(s=>s.id===sectionId);
  return sec ? sec.name : 'a section';
}
// Upsert-by-lookup, same pattern used for the Price week build-up's
// assigned-row (PostgREST on_conflict can't target a partial unique index,
// so look the row up first and PATCH/INSERT accordingly).
async function saveSectionFlag(siteId, sectionId, field, value, photoPath){
  const qs = 'site_id=eq.'+siteId+'&section_id='+(sectionId?('eq.'+sectionId):'is.null')+'&select=*';
  const existing = await dbSelect('schedule_section_flags', qs);
  const row = existing[0];
  const wasOn = row ? !!row[field] : false;
  const now = new Date().toISOString();
  const patch = {[field]: value, updated_at: now};
  if(field==='waste_to_clear' && value){ patch.waste_flagged_by = ME.id; patch.waste_flagged_at = now; }
  if(field==='leftover_material' && value){ patch.leftover_flagged_by = ME.id; patch.leftover_flagged_at = now; if(photoPath) patch.leftover_photo_path = photoPath; }
  let saved;
  if(row){ saved = await dbUpdate('schedule_section_flags', row.id, patch); }
  else { const rows = await dbInsert('schedule_section_flags', Object.assign({site_id:siteId, section_id:sectionId}, patch)); saved = Array.isArray(rows)?rows[0]:rows; }
  if(!saved){ toast('Could not save — try again.'); render(); return; }
  // Only a fresh unticked→ticked transition pushes a notification to the
  // site's PM/admins — unticking (or a page load that already shows it
  // ticked) never fires one.
  if(!wasOn && value){
    const site = SITES.find(s=>s.id===siteId);
    const flagLabel = field==='waste_to_clear' ? 'Waste to clear' : 'Leftover material';
    postSystemMessage(siteId, 'schedule_flag', `${ME.name} flagged "${flagLabel}" on ${sectionFlagLabel(sectionId)}${site?(' at '+site.name):''}.`);
  }
  toast('Saved');
  render();
}
window.toggleWasteFlag = function(el, siteId, sectionId){
  saveSectionFlag(siteId, sectionId||null, 'waste_to_clear', el.checked);
};
// Leftover material ticks straight away, same as Waste — then, only on a
// fresh tick (not on unticking), the photo picker opens right after so a
// photo gets attached to the now-ticked flag. If the picker is cancelled the
// flag stays ticked with no photo yet; leftoverMaterialPhotoChosen just
// attaches leftover_photo_path onto the already-true flag when one is chosen.
window.onLeftoverCheckboxClick = function(el, siteId, sectionId){
  sectionId = sectionId || null;
  saveSectionFlag(siteId, sectionId, 'leftover_material', el.checked);
  if(el.checked){
    document.getElementById('leftoverPhotoInput-'+(sectionId||'ungrouped')).click();
  }
};
window.leftoverMaterialPhotoChosen = async function(input, siteId, sectionId){
  sectionId = sectionId || null;
  const files = input.files ? Array.from(input.files) : [];
  if(!files.length) return;
  try{
    const dataUrl = await compressImage(files[0]);
    const path = siteId+'/schedule-flags/'+(sectionId||'ungrouped')+'/'+uid()+'.jpg';
    const stored = await uploadDataUrl('site-photos', path, dataUrl);
    if(!stored){ toast('Could not upload photo — try again.'); input.value=''; return; }
    await saveSectionFlagPhoto(siteId, sectionId, stored);
  }catch(e){ toast('Could not process photo — try again.'); }
  input.value = '';
};
// Attaches a leftover photo onto an already-ticked flag without re-touching
// waste_to_clear or re-firing the tick notification (that already fired the
// moment the box was ticked, in saveSectionFlag above).
async function saveSectionFlagPhoto(siteId, sectionId, photoPath){
  const qs = 'site_id=eq.'+siteId+'&section_id='+(sectionId?('eq.'+sectionId):'is.null')+'&select=id';
  const existing = await dbSelect('schedule_section_flags', qs);
  const row = existing[0];
  if(!row) return;
  await dbUpdate('schedule_section_flags', row.id, {leftover_photo_path: photoPath, updated_at: new Date().toISOString()});
  toast('Photo added');
  render();
}
// "Schedule of Works Document" — the office's own copy of the SOW (Excel,
// Word, PDF, anything), kept on the SOW page alongside the task list. Lives
// in the private schedule-docs bucket. Each document is visible to everyone
// with access to the site by default; a manager can switch one to "Managers
// only" from the dropdown beside it (e.g. a priced copy). Enforced by RLS on
// both the table and the bucket, not just hidden in the UI. Only managers
// can add, re-scope or remove documents.
let scheduleDocUploading = false;
window.uploadScheduleDocument = async function(input, siteId){
  const files = input.files ? Array.from(input.files) : [];
  if(!files.length) return;
  scheduleDocUploading = true; render();
  let added = 0;
  try{
    for(const file of files){
      const path = siteId+'/'+uid()+'-'+file.name.replace(/[^a-z0-9.\-]+/gi,'_');
      const stored = await uploadToStorage('schedule-docs', path, file, file.type||'application/octet-stream');
      if(!stored) continue;
      const rows = await dbInsert('schedule_documents', {site_id:siteId, org_id:ME.org_id, name:file.name, storage_path:stored, size:file.size||null, uploaded_by:ME.id});
      if(rows) added++;
    }
  }finally{
    scheduleDocUploading = false;
  }
  if(added) toast(added===1 ? 'Document added' : added+' documents added');
  render();
};
window.viewScheduleDocument = async function(docId){
  const rows = await dbSelect('schedule_documents', 'id=eq.'+docId+'&select=name,storage_path');
  const doc = rows[0];
  if(!doc){ toast('Document not found.'); return; }
  try{
    // Private bucket — a short-lived signed link is minted per open, which
    // the bucket's select policies only allow for a viewer who can see it.
    const encPath = doc.storage_path.split('/').map(encodeURIComponent).join('/');
    // Plain fetch with just the auth headers, same as uploadToStorage — the
    // Storage API doesn't need (or necessarily allow) sbFetch's extra
    // cache-busting headers.
    await ensureFreshToken();
    if(!SESSION || !SESSION.access_token){ toast('Your session has expired — please log out and back in, then try again.'); return; }
    const res = await fetchWithTimeout(SUPABASE_URL+'/storage/v1/object/sign/schedule-docs/'+encPath, {method:'POST', headers:{'apikey':SUPABASE_ANON_KEY,'Authorization':'Bearer '+SESSION.access_token,'Content-Type':'application/json'}, body: JSON.stringify({expiresIn: 600})}, 20000);
    const d = await res.json().catch(()=>({}));
    const signed = d.signedURL || d.signedUrl;
    if(!res.ok || !signed){ toast('Could not open document.'); return; }
    const url = SUPABASE_URL+'/storage/v1'+(signed.charAt(0)==='/'?'':'/')+signed;
    if(/\.(png|jpe?g|gif|webp)$/i.test(doc.name)){ viewImage(url); return; }
    if(/\.pdf$/i.test(doc.name)){ await viewPdfInApp(url, doc.name); return; }
    // Excel/Word/anything else can't be rendered in-app — hand it to the
    // browser/OS, same as Excel programme files in viewDrawing.
    await openExternalFile(url);
  }catch(e){ toast('Could not open document.'); }
};
window.setScheduleDocumentVisibility = async function(docId, visibility){
  const row = await dbUpdate('schedule_documents', docId, {visibility: visibility==='managers' ? 'managers' : 'all'});
  if(row) toast(visibility==='managers' ? 'Now visible to managers only' : 'Now visible to everyone on this site');
  render();
};
window.deleteScheduleDocument = async function(siteId, docId){
  const rows = await dbSelect('schedule_documents', 'id=eq.'+docId+'&select=name,storage_path');
  const doc = rows[0];
  if(!doc) { render(); return; }
  if(!await customConfirm('Remove "'+doc.name+'" from this Schedule of Works?')) return;
  const ok = await dbDelete('schedule_documents', docId);
  if(!ok) return;
  try{ await ensureFreshToken(); await fetchWithTimeout(SUPABASE_URL+'/storage/v1/object/schedule-docs/'+doc.storage_path.split('/').map(encodeURIComponent).join('/'), {method:'DELETE', headers:{'apikey':SUPABASE_ANON_KEY,'Authorization':'Bearer '+SESSION.access_token}}, 20000); }catch(e){ /* row is gone; orphaned file is harmless */ }
  logSiteActivity(siteId, 'schedule_document_deleted', 'Removed Schedule of Works document "'+doc.name+'"');
  toast('Document removed');
  render();
};
async function renderSchedule(siteId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  const canAdd = isManager(ME);
  // #291: "Add to Schedule of Works" from a variation carries ?from=<hash>
  // so Back returns to the variation's own folder/page instead of always
  // falling back to the site Home — same ?from= pattern as Certifications
  // (#207) and Admin Centre (#248).
  const scheduleBackFrom = routeQuery().get('from');
  // Onboarding checklist item "Open and view the Schedule of Works" — ticks
  // the first time an operative actually opens this page. Fire-and-forget:
  // never worth blocking the page paint on.
  if(!canAdd && !ME.viewed_schedule_at){
    ME.viewed_schedule_at = new Date().toISOString();
    dbUpdate('profiles', ME.id, {viewed_schedule_at: ME.viewed_schedule_at});
  }
  const isMultiSite = !!(site && site.multi_site);
  const isMc = !!(site && site.acting_as_main_contractor);
  // schedule_tasks/schedule_sections are RLS-scoped server-side by assigned
  // visibility (see schedule_visibility_ok) — an operative or PM simply
  // never gets back a row they're not allowed to see, so nothing further
  // needs filtering client-side; admins always get everything back.
  const [allTasks, sections, subAddressesList, sectionFlags, siteAssignments, pmOptions, subCompanies, scheduleDocs] = await Promise.all([
    dbSelect('schedule_tasks', 'site_id=eq.'+siteId+'&order=position.asc.nullslast,created_at.asc'),
    dbSelect('schedule_sections', 'site_id=eq.'+siteId+'&order=position.asc.nullslast,created_at.asc'),
    isMultiSite ? dbSelect('site_sub_addresses', 'site_id=eq.'+siteId+'&order=name.asc') : Promise.resolve([]),
    dbSelect('schedule_section_flags', 'site_id=eq.'+siteId),
    canAdd ? dbSelect('site_assignments', 'site_id=eq.'+siteId+'&select=user_id') : Promise.resolve([]),
    canAdd ? loadPMList() : Promise.resolve([]),
    site && site.acting_as_main_contractor ? dbSelect('subcontractor_companies', 'site_id=eq.'+siteId+'&select=id,name') : Promise.resolve([]),
    // Office copy of the SOW (see the "Schedule of Works Document" box
    // below the tabs). Open to everyone on the site unless a manager has
    // switched a document to "Managers only" — RLS only hands back the rows
    // this viewer is allowed to see, so no client-side filtering needed.
    dbSelect('schedule_documents', 'site_id=eq.'+siteId+'&order=created_at.asc'),
  ]);
  scheduleSectionsCache = sections;
  if(canAdd) await loadAllProfiles();
  const operativeOptions = canAdd ? Object.values(PROFILES).filter(p=>siteAssignments.some(a=>a.user_id===p.id)).sort((a,b)=>a.name.localeCompare(b.name)) : [];
  // Flags row visibility/state is driven off allTasks (every task ever added
  // to a section), not the currently filtered `tasks` list below — so the
  // 🗑/📦 row stays put across the All/To Do/In Progress tabs instead of
  // disappearing whenever a filter happens to hide every task in a section.
  const bySectionAll = {};
  allTasks.forEach(t=>{ if(t.section_id){ (bySectionAll[t.section_id]=bySectionAll[t.section_id]||[]).push(t); } });
  const allUngrouped = allTasks.filter(t=>!t.section_id);
  const flagsBySection = {};
  sectionFlags.forEach(f=>{ flagsBySection[f.section_id || '__ungrouped__'] = f; });
  const subAddrById = {};
  subAddressesList.forEach(a=>{ subAddrById[a.id] = a; });
  // Fixed three-tab layout: To Do/In Progress, Complete, All — always in
  // this order, never reshuffled by what state the site's tasks happen to
  // be in. Only the default TAB on first opening a site is chosen (To Do/
  // In Progress, since that's what's actionable), never re-applied after
  // that, so it doesn't fight a tab the user has deliberately picked.
  if(scheduleLastSiteId !== siteId){
    scheduleLastSiteId = siteId;
    percentPromptTaskId = null;
    scheduleFilter = 'active';
    sectionFirstSubAddr = {};
    scheduleMultiSelectMode = false;
    scheduleMultiSelectedIds = new Set();
  }
  const scheduleTabOrder = ['active','done','all'];
  const scheduleTabLabel = {active:'To Do / In Progress', done:'Complete', all:'All'};
  const tasks = scheduleFilter==='all' ? allTasks
    : scheduleFilter==='done' ? allTasks.filter(t=>t.status==='done')
    : allTasks.filter(t=>t.status==='todo'||t.status==='progress');
  let photosByTask = {};
  if(allTasks.length){
    const ids = allTasks.map(t=>t.id).join(',');
    const photos = await dbSelect('schedule_photos', 'task_id=in.('+ids+')&order=uploaded_at.asc');
    photos.forEach(p=>{ (photosByTask[p.task_id]=photosByTask[p.task_id]||[]).push(p); });
    // Older photos have no small versions yet — make them in the background.
    setTimeout(()=>{ backfillSchedulePhotoRenditions(photos); }, 1500);
  }
  const ungrouped = tasks.filter(t=>!t.section_id);
  const bySection = {};
  tasks.forEach(t=>{ if(t.section_id){ (bySection[t.section_id]=bySection[t.section_id]||[]).push(t); } });

  // Each tab only shows the tables (sections) that actually belong on it —
  // a section whose tasks are all complete drops off To Do / In Progress
  // entirely rather than sitting there as an empty "No tasks for this
  // filter" card, and a section with nothing complete yet stays off
  // Complete. A section with no tasks at all still shows on To Do / In
  // Progress (and All) for managers, since that's where its first task
  // gets added. All shows everything.
  const sectionVisibleOnTab = (matching, everAdded)=>{
    if(scheduleFilter==='all') return true;
    if(matching) return true;
    return scheduleFilter==='active' && !everAdded && canAdd;
  };
  // The top "Schedule of Works" table is the exception for managers: it
  // always stays on screen so its Add Task button is never out of reach,
  // but sits collapsed whenever it has nothing to show on this tab (see
  // `open` in its card below) instead of an empty "No tasks" body.
  const showUngroupedCard = canAdd ? true
    : scheduleFilter==='all' ? !!allUngrouped.length : !!ungrouped.length;
  const visibleSections = sections.filter(sec=>{
    if(sectionVisibleOnTab((bySection[sec.id]||[]).length, (bySectionAll[sec.id]||[]).length)) return true;
    // Never yank a section out from under an open "who can see this" form.
    return !!(scheduleAssignTarget && scheduleAssignTarget.kind==='section' && scheduleAssignTarget.id===sec.id);
  });

  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    ${canAdd ? `
      <div class="drawheaderrow">
        <span>Schedule of Works</span>
        <div class="row-gap" style="width:auto;">
          ${rowActionsMenuHtml('sow-more', `
            <div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;scheduleAddPanel='section';render()">📁 Add Section</div>
            <div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;scheduleAddPanel='variation';render()">📐 Add Variation Work</div>
            <div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;openScheduleLibraryPanel('${siteId}')">📚 From Library</div>
            <div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;scheduleAddPanel='upload';render()">📤 Upload Schedule</div>
            <div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;render();document.getElementById('scheduleDocInput').click()">📎 Add Document</div>
          `)}
        </div>
      </div>
    ` : ''}
    <div class="filterrow">
      ${scheduleTabOrder.map(k=>`<div class="filterchip ${scheduleFilter===k?'active':''}" onclick="scheduleFilter='${k}';uiReadCacheClear();render()">${scheduleTabLabel[k]}</div>`).join('')}
    </div>
    ${canAdd ? `<input type="file" id="scheduleDocInput" multiple style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;" onchange="uploadScheduleDocument(this,'${siteId}')">` : ''}
    ${(scheduleDocs.length || (canAdd && scheduleDocUploading)) ? `
      <div class="card">
        <p class="sectiontitle" style="margin-top:0;">Schedule of Works Document</p>
        ${scheduleDocs.map(d=>`
          <div style="display:flex;align-items:center;gap:10px;padding:6px 0;">
            <a href="#" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:600;color:var(--brand1);text-decoration:underline;" onclick="event.preventDefault();viewScheduleDocument('${d.id}')">📎 ${escapeHtml(d.name)}</a>
            ${canAdd ? `
              <select title="Who can see this document" style="flex:0 0 auto;width:auto;padding:5px 8px;font-size:11px;border:1.5px solid var(--line);border-radius:8px;background:var(--card);" onchange="setScheduleDocumentVisibility('${d.id}', this.value)">
                <option value="all" ${d.visibility!=='managers'?'selected':''}>👥 Everyone</option>
                <option value="managers" ${d.visibility==='managers'?'selected':''}>🔒 Managers only</option>
              </select>
              <span class="taskicon" title="Remove document" style="flex:0 0 auto;" onclick="deleteScheduleDocument('${siteId}','${d.id}')">🗑</span>
            ` : ''}
          </div>
        `).join('')}
        ${scheduleDocUploading ? `<p class="stub" style="margin:6px 0 0;"><span class="spinner"></span> Uploading…</p>` : ''}
      </div>
    ` : ''}
    ${canAdd && scheduleMultiSelectMode ? `
      <div class="card" style="display:flex;align-items:center;justify-content:space-between;gap:10px;position:sticky;top:0;z-index:2;">
        <span class="stub" style="margin:0;font-weight:700;">${scheduleMultiSelectedIds.size} selected</span>
        <div class="row-gap" style="width:auto;">
          <button class="darkbtn" style="width:auto;padding:8px 14px;" ${scheduleMultiSelectedIds.size?'':'disabled'} onclick="deleteScheduleMultiSelected('${siteId}')">🗑 Delete Selected</button>
          <button class="ghostbtn" style="width:auto;padding:8px 14px;" onclick="cancelScheduleMultiSelect()">Cancel</button>
        </div>
      </div>
    ` : ''}
    ${canAdd && scheduleAddPanel==='section' ? `
      <div class="card">
        <p class="sectiontitle" style="margin-top:0;">Add Section</p>
        <div class="row-gap">
          <input type="text" id="newSectionName" placeholder="e.g. Roof Level 1" style="flex:2;padding:8px 10px;font-size:12px;">
          <button class="darkbtn" style="flex:1;padding:8px 10px;font-size:12px;" onclick="addSection('${siteId}')">Add</button>
        </div>
        <button class="ghostbtn" style="margin-top:8px;" onclick="scheduleAddPanel=null;render()">Close</button>
      </div>
    ` : ''}
    ${canAdd && scheduleAddPanel==='variation' ? `
      <div class="card">
        <p class="sectiontitle" style="margin-top:0;">Add Variation Work</p>
        <p class="stub" style="margin:0 0 8px;">Creates a new "Variation N" section at the bottom of the schedule (auto-numbered) with this as its first task — same behaviour as any other section.</p>
        <div class="row-gap">
          <input type="text" id="newVariationTaskName" placeholder="e.g. Additional lead flashing to bay window" style="flex:2;padding:8px 10px;font-size:12px;">
          <button class="darkbtn" style="flex:1;padding:8px 10px;font-size:12px;" onclick="addVariationWorkFromSchedule('${siteId}')">Add</button>
        </div>
        <button class="ghostbtn" style="margin-top:8px;" onclick="scheduleAddPanel=null;render()">Close</button>
      </div>
    ` : ''}
    ${canAdd && scheduleAddPanel==='upload' ? `
      <div class="card">
        <p class="sectiontitle" style="margin-top:0;">Upload schedule</p>
        ${scheduleImportPreview ? `
          <p class="stub" style="margin:0 0 8px;">Which column has the task/scope text? We've guessed one below — pick a different one if it's not right.</p>
          <div class="formfield" style="margin-top:0;">
            <select onchange="setScheduleImportColumn(parseInt(this.value,10))">
              ${scheduleImportPreview.headers.map((h,i)=>`<option value="${i}" ${i===scheduleImportPreview.colIndex?'selected':''}>${escapeHtml(h)}</option>`).join('')}
            </select>
          </div>
          <p class="stub" style="margin:0 0 4px;font-weight:700;">Preview (first ${Math.min(5,scheduleImportPreview.dataRows.length)} of ${scheduleImportPreview.dataRows.length} rows):</p>
          <div class="card" style="background:var(--paper);margin-bottom:10px;">
            ${scheduleImportPreview.dataRows.slice(0,5).map(r=>`<p class="stub" style="margin:0 0 4px;">${escapeHtml(r[scheduleImportPreview.colIndex]!=null?String(r[scheduleImportPreview.colIndex]):'(blank)')}</p>`).join('')}
          </div>
          <div class="row-gap">
            <button class="darkbtn" style="flex:1;" onclick="confirmScheduleImport('${siteId}')">Import ${scheduleImportPreview.dataRows.length} Task(s)</button>
            <button class="ghostbtn" style="flex:1;" onclick="cancelScheduleImport()">Choose Different File</button>
          </div>
        ` : ''}
        ${!scheduleImportPreview ? `
          <p class="stub" style="margin:0 0 8px;">Excel/CSV: pick which column to import after choosing the file — row 1 is treated as the header.</p>
          <div class="row-gap" style="margin-bottom:14px;">
            <div class="ghostbtn" style="cursor:pointer;text-align:center;flex:2;" onclick="document.getElementById('scheduleExcelInput').click()">Choose Excel/CSV file</div>
            <div class="ghostbtn" style="cursor:pointer;text-align:center;flex:1;" onclick="downloadScheduleTemplate()">Download Template</div>
          </div>
          <input type="file" id="scheduleExcelInput" accept=".xlsx,.xls,.csv" style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;" onchange="importScheduleExcel(this,'${siteId}')">
          <p class="stub" style="margin:0 0 8px;">PDF: we'll try to automatically pull the task list out for you, then let you review it before anything's added. Tick the box if it's a scanned or complex-layout PDF and you'd rather type/paste the list yourself instead.</p>
          <label style="display:flex;align-items:center;gap:8px;font-size:12.5px;margin-bottom:10px;">
            <input type="checkbox" id="pdfManualMode"> I'll enter the list manually instead of relying on auto-extract
          </label>
          <div class="ghostbtn" style="cursor:pointer;text-align:center;" onclick="document.getElementById('schedulePdfInput').click()">Choose PDF file</div>
          <input type="file" id="schedulePdfInput" accept="application/pdf" style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;" onchange="importSchedulePdf(this,'${siteId}')">
        ` : ''}
        <button class="ghostbtn" style="margin-top:14px;" onclick="scheduleImportPreview=null;scheduleAddPanel=null;render()">Close</button>
      </div>
    ` : ''}
    ${canAdd && scheduleLibraryOpen ? `
      <div class="card">
        <p class="sectiontitle" style="margin-top:0;">From Library</p>
        <p class="stub" style="margin:0 0 10px;">Copies a template's sections/tasks into this site's schedule — nothing in the library changes, and everything copied stays fully editable and deletable here afterwards.</p>
        ${scheduleLibraryTemplates.length ? scheduleLibraryTemplates.map(tpl=>`
          <div class="ddrow" onclick="toggleScheduleLibraryPreview('${tpl.id}')">
            <span class="arrow">${scheduleLibraryPreviewId===tpl.id?'▼':'▶'}</span> ${escapeHtml(tpl.name)}
          </div>
          ${scheduleLibraryPreviewId===tpl.id ? `
            <div style="margin:0 0 12px 14px;padding-left:10px;border-left:2px solid var(--line);">
              ${scheduleLibraryPreviewCache[tpl.id] ? scheduleLibraryPreviewHtml(scheduleLibraryPreviewCache[tpl.id]) : `<p class="stub" style="margin:0;">Loading…</p>`}
              <button class="darkbtn" style="margin-top:8px;" onclick="useScheduleLibraryTemplate('${siteId}','${tpl.id}')">Use This Template</button>
            </div>
          ` : ''}
        `).join('') : `<div class="empty">No templates yet — build some in Settings &amp; Admin › Schedule of Works — Library first.</div>`}
        <button class="ghostbtn" style="margin-top:8px;" onclick="closeScheduleLibraryPanel()">Close</button>
      </div>
    ` : ''}
    ${showUngroupedCard ? (()=>{
      const open = scheduleAddPanel==='task' || (ungrouped.length ? scheduleSectionsOpen['__ungrouped__'] !== false : false);
      // A dropdown/"who can see this" popup for any task in here is an
      // absolutely-positioned (or just tall) element nested inside this
      // card — the overflow:hidden below (there only to clip this card's
      // own rounded corners) was also clipping that popup down to whatever
      // short height the card happened to be, instead of letting it open
      // fully. Switching to overflow:visible only while something inside
      // is actually open avoids that without changing the normal look.
      const somethingOpenHere = ungrouped.some(t=>rowActionsMenuOpenFor==='sowtask-'+t.id) ||
        (scheduleAssignTarget && scheduleAssignTarget.kind==='task' && ungrouped.some(t=>t.id===scheduleAssignTarget.id)) ||
        scheduleAddPanel==='task';
      return `
      <div class="card" style="padding:0;${somethingOpenHere?'overflow:visible;':'overflow:hidden;'}">
        <p class="ddrow" style="margin:0;padding:12px 14px;border:none;border-radius:0;background:transparent;">
          <span style="cursor:pointer;flex:1;min-width:0;" onclick="toggleScheduleSection('__ungrouped__')"><span class="arrow">${open?'▼':'▶'}</span> Schedule of Works</span>
          ${canAdd ? `<button class="darkbtn" style="width:auto;flex:0 0 auto;padding:6px 10px;font-size:10px;" onclick="event.stopPropagation();scheduleAddPanel=scheduleAddPanel==='task'?null:'task';scheduleSectionsOpen['__ungrouped__']=true;render()">➕ Add Task</button>` : ''}
        </p>
        ${open ? `<div style="padding:0 14px 14px;">
          ${canAdd && scheduleAddPanel==='task' ? `
            <div class="card" style="background:var(--paper);">
              <p class="sectiontitle" style="margin-top:0;">Add Task</p>
              <div class="row-gap">
                <input type="text" id="newTaskName" placeholder="e.g. Fit lead flashing" style="flex:2;padding:8px 10px;font-size:12px;">
                <button class="darkbtn" style="flex:1;padding:8px 10px;font-size:12px;" onclick="addTask('${siteId}')">Add</button>
              </div>
              ${isMultiSite ? (sectionFirstSubAddr['__ungrouped__'] ? `
                <p class="stub" style="margin:10px 0 0;">📍 Tagged to ${escapeHtml((subAddrById[sectionFirstSubAddr['__ungrouped__']]||{}).name || '')} — same address as the last task added here.</p>
              ` : `
                <p class="field-label" style="margin:10px 0 6px;">Address</p>
                <select id="newTaskSubAddr" style="width:100%;padding:8px 10px;font-size:12px;border:1.5px solid var(--line);border-radius:8px;background:var(--card);box-sizing:border-box;">
                  <option value="">Not on the list</option>
                  ${subAddressesList.map(a=>`<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('')}
                </select>
              `) : ''}
              <button class="ghostbtn" style="margin-top:8px;" onclick="scheduleAddPanel=null;render()">Close</button>
            </div>
          ` : ''}
          ${ungrouped.length ? ungrouped.map(t=>taskRowHtml(siteId,t,canAdd,photosByTask,isMultiSite,subAddrById,subAddressesList,subCompanies,isMc) + (canAdd && scheduleAssignTarget && scheduleAssignTarget.kind==='task' && scheduleAssignTarget.id===t.id ? scheduleAssignFormHtml(siteId, pmOptions, operativeOptions) : '')).join('') : `<div class="empty">No tasks${scheduleFilter!=='all'?' for this filter':''}.</div>`}
          ${sectionFlagRowHtml(siteId, null, flagsBySection['__ungrouped__'])}
        </div>` : ''}
      </div>
    `;})() : ''}
    ${visibleSections.map(sec=>{
      const secTasks = bySection[sec.id] || [];
      const open = scheduleSectionsOpen[sec.id] !== false;
      // Same fix as the ungrouped card above — this section's own "..."
      // menu, any of its tasks' "..." menus, and the "who can see this"
      // assign form were all getting clipped to the card's own (often
      // short, e.g. a freshly-added empty section) height. Only relax the
      // clip while one of them is actually open here.
      const somethingOpenHere = rowActionsMenuOpenFor==='sowsec-'+sec.id ||
        secTasks.some(t=>rowActionsMenuOpenFor==='sowtask-'+t.id) ||
        (scheduleAssignTarget && ((scheduleAssignTarget.kind==='section' && scheduleAssignTarget.id===sec.id) || (scheduleAssignTarget.kind==='task' && secTasks.some(t=>t.id===scheduleAssignTarget.id))));
      return `
      <div class="card" style="padding:0;${somethingOpenHere?'overflow:visible;':'overflow:hidden;'}">
        <div class="ddrow" style="margin:0;padding:12px 14px;border:none;border-radius:0;background:transparent;flex-wrap:nowrap;" onclick="toggleScheduleSection('${sec.id}')">
          <div style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"><span class="arrow">${open?'▼':'▶'}</span> ${sec.visibility_mode==='assigned'?'🔒 ':''}${escapeHtml(sec.name)}</div>
          ${canAdd ? `<div style="flex:0 0 auto;margin-left:8px;" onclick="event.stopPropagation()">
            ${rowActionsMenuHtml('sowsec-'+sec.id, `
              <div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;duplicateSection('${siteId}','${sec.id}')">⧉ Duplicate section</div>
              <div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;renameSection('${siteId}','${sec.id}')">✎ Rename</div>
              <div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;openScheduleAssignExisting('section','${sec.id}','${siteId}')">🔒 Assign visibility</div>
              <div class="statusmenu-item danger" onclick="rowActionsMenuOpenFor=null;deleteSection('${siteId}','${sec.id}')">🗑 Delete</div>
            `)}
          </div>` : ''}
        </div>
        ${open ? `
          <div style="padding:0 14px 14px;">
            ${canAdd && scheduleAssignTarget && scheduleAssignTarget.kind==='section' && scheduleAssignTarget.id===sec.id ? scheduleAssignFormHtml(siteId, pmOptions, operativeOptions) : ''}
            ${secTasks.length ? secTasks.map(t=>taskRowHtml(siteId,t,canAdd,photosByTask,isMultiSite,subAddrById,subAddressesList,subCompanies,isMc)).join('') : `<div class="empty">No tasks in this section${scheduleFilter!=='all'?' for this filter':''}.</div>`}
            ${canAdd && scheduleFilter!=='done' ? `
              <div class="row-gap" style="margin-top:10px;">
                <input type="text" id="newTaskName-${sec.id}" placeholder="e.g. Fit lead flashing" style="flex:2;padding:8px 10px;font-size:12px;">
                <button class="darkbtn" style="flex:1;padding:8px 10px;font-size:12px;" onclick="addTask('${siteId}','${sec.id}')">Add</button>
              </div>
              ${isMultiSite ? (sectionFirstSubAddr[sec.id] ? `
                <p class="stub" style="margin:6px 0 0;">📍 Tagged to ${escapeHtml((subAddrById[sectionFirstSubAddr[sec.id]]||{}).name || '')} — same address as the last task added here.</p>
              ` : `
                <select id="newTaskSubAddr-${sec.id}" style="width:100%;margin-top:6px;padding:6px 10px;font-size:11.5px;border:1.5px solid var(--line);border-radius:8px;background:var(--card);box-sizing:border-box;">
                  <option value="">📍 Address — not on the list</option>
                  ${subAddressesList.map(a=>`<option value="${a.id}">📍 ${escapeHtml(a.name)}</option>`).join('')}
                </select>
              `) : ''}
            ` : ''}
            ${bySectionAll[sec.id] && bySectionAll[sec.id].length ? sectionFlagRowHtml(siteId, sec.id, flagsBySection[sec.id]) : ''}
          </div>
        ` : ''}
      </div>
    `;}).join('')}
    ${!showUngroupedCard && !visibleSections.length ? `<div class="empty">${!allTasks.length ? 'No tasks yet.' : scheduleFilter==='done' ? 'Nothing completed yet.' : 'Nothing left to do — everything is complete.'}</div>` : ''}

    ${pdfImportSiteId===siteId ? `
      <div class="card">
        <p class="sectiontitle" style="margin-top:0;">Review extracted tasks</p>
        <p class="stub" style="margin:0 0 8px;">One task per line — edit, delete, or add lines, then import. Nothing is added until you confirm.</p>
        <textarea id="pdfImportTextarea" rows="10" style="width:100%;font-family:inherit;font-size:13px;padding:10px;border-radius:8px;border:1px solid var(--line);box-sizing:border-box;">${escapeHtml(pdfImportText)}</textarea>
        <div class="row-gap" style="margin-top:10px;">
          <button class="darkbtn" style="width:auto;padding:10px 16px;" onclick="confirmPdfImport('${siteId}')">Import as tasks</button>
          <button class="ghostbtn" style="width:auto;" onclick="pdfImportSiteId=null;render()">Cancel</button>
        </div>
      </div>
      ` : ''}
    ${allTasks.length ? `
    <div class="row-gap" style="margin-bottom:14px;flex-wrap:nowrap;">
      <button class="ghostbtn exportbtn sowexportbtn" style="min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" onclick="exportSchedulePDF('${siteId}')">📄 Export PDF</button>
      <button class="ghostbtn" style="min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" onclick="openScheduleEmailPrompt('${siteId}')">✉ Email Report</button>
    </div>
    ` : ''}
    <div id="scheduleLiveMarker" style="display:none;"></div>
  `, {title:'Schedule of Works', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back: scheduleBackFrom ? decodeURIComponent(scheduleBackFrom) : `#/site/${siteId}/home`, siteId, activeTab:'schedule'}); }

  // Live two-way sync with any subcontractor's own filtered Schedule of
  // Works view (renderSubSchedule) — both pages read/write the exact same
  // schedule_tasks rows, so a status/photo update a subcontractor makes on
  // their tile needs to show up here without the PM navigating away and
  // back, and vice versa. Full-page refresh (not a partial DOM patch, unlike
  // the RAMS poll) since this page's structure is too nested to patch
  // piecemeal — skipped whenever an inline editor/picker is open so a poll
  // never clobbers something mid-edit.
  // No background refresh here any more (it re-downloaded the whole page
  // every 8 seconds): the page now loads fresh when you come into it and
  // again each time you switch tab inside it.
  if(schedulePollTimer){ clearInterval(schedulePollTimer); schedulePollTimer = null; }
}
window.toggleScheduleSection = function(sectionId){
  const currentlyOpen = scheduleSectionsOpen[sectionId] !== false;
  scheduleSectionsOpen[sectionId] = !currentlyOpen;
  render();
};
async function nextSectionPosition(siteId){
  const rows = await dbSelect('schedule_sections', 'site_id=eq.'+siteId+'&select=position&order=position.desc.nullslast&limit=1');
  return ((rows[0] && rows[0].position) || 0) + 1;
}
window.addSection = async function(siteId){
  const input = document.getElementById('newSectionName');
  const name = input.value.trim(); if(!name) return;
  const position = await nextSectionPosition(siteId);
  const rows = await dbInsert('schedule_sections', {site_id:siteId, name, position, created_by:ME.id});
  const newSection = rows && rows[0];
  if(newSection){
    toast('Section added');
    scheduleAddPanel = null;
    scheduleSectionsOpen[newSection.id] = true;
    // Straight into "Who can see this" for the section just created, inline
    // in its own new row — defaults to All until narrowed down.
    const [assignments, pmList] = await Promise.all([
      dbSelect('site_assignments', 'site_id=eq.'+siteId+'&select=user_id'),
      loadPMList(),
    ]);
    openScheduleAssign('section', newSection.id, null, assignments.map(a=>a.user_id), pmList.map(p=>p.id));
  }
};
// Shared by "Add to Schedule of Works" on an approved variation, and the
// direct "Add Variation Work" option in the Schedule "+" menu — both create
// a new "Variation N" section (auto-numbered, next after any existing ones)
// with a single task in it, then leave it auto-expanded like every other
// section (sections default open unless explicitly collapsed).
async function addVariationSection(siteId, taskName){
  const existing = await dbSelect('schedule_sections', 'site_id=eq.'+siteId+'&select=name');
  let maxN = 0;
  existing.forEach(s=>{
    const m = /^Variation (\d+)$/i.exec((s.name||'').trim());
    if(m) maxN = Math.max(maxN, parseInt(m[1],10));
  });
  const secName = 'Variation ' + (maxN+1);
  const secPosition = await nextSectionPosition(siteId);
  const newSecRows = await dbInsert('schedule_sections', {site_id:siteId, name:secName, position:secPosition, created_by:ME.id});
  const newSection = newSecRows && newSecRows[0];
  if(!newSection) return null;
  const taskPosition = await nextTaskPosition(siteId);
  await dbInsert('schedule_tasks', {site_id:siteId, section_id:newSection.id, name:taskName||secName, status:'todo', position:taskPosition});
  scheduleSectionsOpen[newSection.id] = true; // auto-expanded, same behaviour as any other new section
  return newSection;
}
window.addVariationWorkFromSchedule = async function(siteId){
  const input = document.getElementById('newVariationTaskName');
  const name = input ? input.value.trim() : '';
  if(!name){ toast('Enter what the variation work is.'); return; }
  const newSection = await addVariationSection(siteId, name);
  if(!newSection){ toast('Could not add — try again.'); return; }
  scheduleAddPanel = null;
  toast(`Added as "${newSection.name}"`);
  render();
};
window.addVariationToSchedule = async function(siteId, variationId){
  const rows = await dbSelect('variations', 'id=eq.'+variationId+'&select=*');
  const v = rows[0]; if(!v) return;
  // #291: only ever allowed once a PM has approved the variation.
  if(v.approval_status!=='approved'){ toast('This variation needs PM approval before it can be added to the schedule.'); return; }
  if(v.schedule_section_id){ toast('Already added to the schedule.'); return; }
  const newSection = await addVariationSection(siteId, v.description||'Variation work');
  if(!newSection){ toast('Could not add to the schedule — try again.'); return; }
  await dbUpdate('variations', variationId, {schedule_section_id: newSection.id});
  toast(`Added to Schedule of Works as "${newSection.name}"`);
  go(`#/site/${siteId}/schedule?from=`+encodeURIComponent(`#/site/${siteId}/snagging/variations`));
};
window.renameSection = async function(siteId, sectionId){
  const sec = scheduleSectionsCache.find(s=>s.id===sectionId);
  const name = await customPrompt('Section name', sec ? sec.name : '');
  if(name===null) return;
  const trimmed = name.trim();
  if(!trimmed){ toast('Section name can\'t be empty.'); return; }
  const row = await dbUpdate('schedule_sections', sectionId, {name:trimmed});
  if(row){ toast('Section renamed'); render(); }
};
window.deleteSection = async function(siteId, sectionId){
  if(!await customConfirm('Delete this section? Its tasks move back to the ungrouped list — they are not deleted.')) return;
  const sec = scheduleSectionsCache.find(s=>s.id===sectionId);
  const ok = await dbDelete('schedule_sections', sectionId);
  if(ok){ toast('Section deleted'); logSiteActivity(siteId, 'schedule_section_deleted', `Deleted Schedule of Works section "${sec?sec.name:''}"`); render(); }
};
// Duplicates a section's task LIST (names only) into a brand new section —
// handy for repeating the same set of tasks across plots on a scheme (e.g.
// "Plot 1" → "Plot 2"..."Plot 10"). The new section is always fresh: every
// task starts back at To Commence with no completed date and no photos
// (photos aren't copied — a new task row means a new id with nothing
// attached to it yet), regardless of how far along the original tasks were.
window.duplicateSection = async function(siteId, sectionId){
  const original = scheduleSectionsCache.find(s=>s.id===sectionId);
  if(!original) return;
  const suggested = original.name + ' (Copy)';
  const name = await customPrompt('Name the new section', suggested);
  if(name===null) return;
  const trimmed = name.trim();
  if(!trimmed){ toast('Section name can\'t be empty.'); return; }
  const tasksToCopy = await dbSelect('schedule_tasks', 'site_id=eq.'+siteId+'&section_id=eq.'+sectionId+'&order=position.asc.nullslast,created_at.asc&select=name');
  const secPosition = await nextSectionPosition(siteId);
  const newSecRows = await dbInsert('schedule_sections', {site_id:siteId, name:trimmed, position:secPosition, created_by:ME.id});
  const newSection = newSecRows && newSecRows[0];
  if(!newSection){ toast('Could not create the new section — try again.'); return; }
  if(tasksToCopy.length){
    let pos = await nextTaskPosition(siteId);
    const newTaskRows = tasksToCopy.map(t=>({site_id:siteId, section_id:newSection.id, name:t.name, status:'todo', position:pos++}));
    await dbInsert('schedule_tasks', newTaskRows);
  }
  toast(`"${trimmed}" created with ${tasksToCopy.length} task${tasksToCopy.length===1?'':'s'} — fresh, nothing carried over`);
  render();
};
window.saveTaskNameInline = async function(input, siteId, taskId){
  const name = input.value.trim();
  if(!name){ toast('Task name can\'t be empty.'); render(); return; }
  if(name === input.defaultValue) return;
  await dbUpdate('schedule_tasks', taskId, {name});
};
window.setTaskStatus = async function(siteId, taskId, next){
  // Completion always goes through beginTaskComplete/completeTaskWithPhotos
  // instead, since it requires a photo upload first — this only ever
  // handles the direct, no-evidence-needed To Commence/In Progress moves.
  if(next==='done') return;
  if(pendingCompleteTaskId===taskId) pendingCompleteTaskId = null;
  if(percentPromptTaskId===taskId) percentPromptTaskId = null;
  // Moving a task back off "done" (e.g. re-opening it) clears the completed
  // date too, so it doesn't keep a stale timestamp from a previous completion.
  // Back to To Commence wipes the percentage; re-opening a finished task to
  // In Progress drops its 100% so it doesn't read as "In Progress — 100%".
  const patch = {status:next, completed_at:null};
  if(next==='todo') patch.percent_complete = null;
  const row = await dbUpdate('schedule_tasks', taskId, patch);
  if(row && next==='progress' && row.percent_complete===100) await dbUpdate('schedule_tasks', taskId, {percent_complete:null});
  if(row) render();
};
// Clicking "Complete" doesn't save anything yet — it just opens the
// mandatory completed-photo upload prompt. Nothing is marked done until a
// photo actually uploads successfully (see completeTaskWithPhotos below).
window.beginTaskComplete = function(taskId){
  if(percentPromptTaskId===taskId) percentPromptTaskId = null;
  pendingCompleteTaskId = taskId;
  render();
};
// ---------- Schedule of Works photos: three sizes of every photo ----------
// A job can carry 300 photos. Showing each one as a 40px tile used to
// download the full camera-size file (about 870KB each on real jobs — 53MB
// to open one site's Schedule of Works), and every export had to download
// and shrink all of them again. Each photo is now stored three ways:
//   full  (1400px) — what opens when you tap a photo
//   mid   (800px)  — what the PDF export / email uses
//   thumb (200px)  — the little tiles on the page and in the PDF rows
// The page and the exports only ever touch the small ones. Photos uploaded
// before this get their small versions made quietly in the background the
// next time someone opens the job (see backfillSchedulePhotoRenditions).
const SOW_PHOTO_FULL = {maxW:1400, quality:0.78}, SOW_PHOTO_MID = {max:800, quality:0.62}, SOW_PHOTO_THUMB = {max:200, quality:0.7};
function shrinkDataUrl(dataUrl, maxDim, quality){
  return new Promise((resolve, reject)=>{
    const im = new Image();
    im.onload = ()=>{
      try{
        const longest = Math.max(im.naturalWidth, im.naturalHeight) || 1;
        const sc = Math.min(1, maxDim/longest);
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(im.naturalWidth*sc)); c.height = Math.max(1, Math.round(im.naturalHeight*sc));
        const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,c.width,c.height);
        ctx.drawImage(im, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', quality));
      }catch(e){ reject(e); }
    };
    im.onerror = ()=>reject(new Error('img-decode-failed'));
    im.src = dataUrl;
  });
}
function sowPhotoUrl(p, kind){
  const path = kind==='thumb' ? (p.thumb_path || p.mid_path || p.storage_path) : (kind==='mid' ? (p.mid_path || p.storage_path) : p.storage_path);
  return path ? publicUrl('site-photos', path) : null;
}
// Runs fn over items, `limit` at a time.
async function runPool(items, limit, fn){
  let next = 0; const out = new Array(items.length);
  const worker = async ()=>{ while(next < items.length){ const i = next++; try{ out[i] = await fn(items[i], i); }catch(e){ out[i] = null; } } };
  await Promise.all(Array.from({length: Math.min(limit, items.length)}, worker));
  return out;
}
// One photo: shrink once, upload its three sizes together, save the row.
async function uploadSchedulePhoto(siteId, taskId, file, stage){
  const full = await compressImage(file, SOW_PHOTO_FULL);
  const base = siteId+'/schedule/'+taskId+'/'+crypto.randomUUID();
  let mid = null, thumb = null;
  try{ mid = await shrinkDataUrl(full, SOW_PHOTO_MID.max, SOW_PHOTO_MID.quality); thumb = await shrinkDataUrl(mid, SOW_PHOTO_THUMB.max, SOW_PHOTO_THUMB.quality); }catch(e){ /* the full photo alone still works */ }
  const quiet = (path, data)=>{ uploadBusy.quietNext = true; try{ return uploadDataUrl('site-photos', path, data); } finally { uploadBusy.quietNext = false; } };
  const [stored, midStored, thumbStored] = await Promise.all([
    uploadDataUrl('site-photos', base+'.jpg', full),
    mid ? quiet(base+'_m.jpg', mid).catch(()=>null) : null,
    thumb ? quiet(base+'_t.jpg', thumb).catch(()=>null) : null,
  ]);
  if(!stored) return null;
  const rows = await dbInsert('schedule_photos', {task_id:taskId, storage_path:stored, mid_path:midStored||null, thumb_path:thumbStored||null, uploaded_by:ME.id, stage});
  return rows ? {row: rows[0], dataUrl: full} : null;
}
// OneDrive copies go one after another in the background once the photos
// are safely saved, so they never hold up the uploads themselves.
let oneDriveSyncChain = Promise.resolve();
function queueOneDrivePhoto(dataUrl, filename, siteId){
  oneDriveSyncChain = oneDriveSyncChain.then(()=>syncPhotoToOneDrive(dataUrl, filename, siteId)).catch(()=>{});
}
// Makes the small versions for photos uploaded before they existed. Quiet,
// a few at a time, capped per visit; anything left is picked up next time.
let sowBackfillRunning = false;
async function backfillSchedulePhotoRenditions(photos){
  if(sowBackfillRunning || navigator.onLine===false) return;
  const todo = (photos||[]).filter(p=>p && p.storage_path && !p.thumb_path).slice(0, 60);
  if(!todo.length) return;
  sowBackfillRunning = true;
  const quiet = (path, data)=>{ uploadBusy.quietNext = true; try{ return uploadDataUrl('site-photos', path, data); } finally { uploadBusy.quietNext = false; } };
  try{
    await runPool(todo, 3, async p=>{
      const res = await fetchWithTimeout(publicUrl('site-photos', p.storage_path), {}, 30000);
      if(!res.ok) return;
      const dataUrl = 'data:image/jpeg;base64,'+(await blobToBase64(await res.blob()));
      const mid = await shrinkDataUrl(dataUrl, SOW_PHOTO_MID.max, SOW_PHOTO_MID.quality);
      const thumb = await shrinkDataUrl(mid, SOW_PHOTO_THUMB.max, SOW_PHOTO_THUMB.quality);
      const base = p.storage_path.replace(/\.[a-z0-9]+$/i, '');
      const [m, t] = await Promise.all([quiet(base+'_m.jpg', mid), quiet(base+'_t.jpg', thumb)]);
      if(!m || !t) return;
      const r = await sbFetch('/rest/v1/rpc/set_schedule_photo_renditions', {method:'POST', body: JSON.stringify({p_id:p.id, p_mid:m, p_thumb:t})});
      if(r && r.ok){ p.mid_path = m; p.thumb_path = t; }
    });
  }catch(e){ /* best effort */ }
  sowBackfillRunning = false;
}
window.completeTaskWithPhotos = async function(input, siteId, taskId){
  const files = input.files ? Array.from(input.files) : [];
  if(!files.length) return;
  // Three photos at a time instead of one after another.
  let uploaded = 0;
  await runPool(files, 3, async file=>{
    const done = await uploadSchedulePhoto(siteId, taskId, file, 'done');
    if(done){ uploaded++; queueOneDrivePhoto(done.dataUrl, 'Completed '+uploaded+'.jpg', siteId); }
  });
  if(!uploaded){ toast('Could not process photo(s) — try again.'); return; }
  const row = await dbUpdate('schedule_tasks', taskId, {status:'done', completed_at: new Date().toISOString(), percent_complete:100});
  if(row){
    pendingCompleteTaskId = null;
    toast('Task marked complete');
    if(row.section_id) await maybeAutoCloseVariationForSection(siteId, row.section_id);
    render();
  }
};
// A variation added to the Schedule of Works becomes its own section
// (see addVariationToSchedule) — once every task in that section is done,
// the variation itself is finished too, so it's auto-closed rather than
// left sitting in "Live" indefinitely waiting for someone to remember to
// close it by hand. Only touches variations still 'live' and linked to
// this exact section; does nothing if the section isn't a variation's.
async function maybeAutoCloseVariationForSection(siteId, sectionId){
  try{
    const vRows = await dbSelect('variations', 'schedule_section_id=eq.'+sectionId+'&status=eq.live&select=id,description');
    const v = vRows[0];
    if(!v) return;
    const tasks = await dbSelect('schedule_tasks', 'section_id=eq.'+sectionId+'&select=status');
    if(!tasks.length || tasks.some(t=>t.status!=='done')) return;
    const closed = await dbUpdate('variations', v.id, {status:'closed', closed_at:new Date().toISOString()});
    if(closed){
      toast('All work complete — variation auto-closed');
      logSiteActivity(siteId, 'variation_closed', `Auto-closed variation "${v.description||''}" (all Schedule of Works tasks complete)`);
    }
  }catch(e){ /* non-fatal — worst case the PM closes it manually */ }
}
// Kept separate from created_at deliberately -- created_at ties (e.g. from a
// bulk Excel import) have no reliable scan order, and an UPDATE (like
// marking a task in-progress) can shuffle rows tied on created_at. Position
// is set once here and never touched again, so the list order stays locked
// to upload/add order regardless of status changes.
async function nextTaskPosition(siteId){
  const rows = await dbSelect('schedule_tasks', 'site_id=eq.'+siteId+'&select=position&order=position.desc.nullslast&limit=1');
  return ((rows[0] && rows[0].position) || 0) + 1;
}
window.addTask = async function(siteId, sectionId){
  const input = document.getElementById(sectionId ? ('newTaskName-'+sectionId) : 'newTaskName');
  const name = input.value.trim(); if(!name) return;
  const position = await nextTaskPosition(siteId);
  const row = {site_id:siteId, name, status:'todo', position};
  if(sectionId) row.section_id = sectionId;
  // Multi-site Address step — present on both the main Add Task panel and
  // the per-section quick-add row (each has its own id); leaving it on
  // "not on the list" leaves sub_site_id null, still linkable later via the
  // task's own 📍 pill or ▾ Link Address.
  // Once this add-row (keyed by sectionId, or '__ungrouped__' for the main
  // panel) has had one task tagged to a chosen address, the dropdown is
  // hidden on later renders (see renderSchedule) and every further task
  // added here auto-tags to that same address without asking again.
  const rowKey = sectionId || '__ungrouped__';
  if(sectionFirstSubAddr[rowKey]){
    row.sub_site_id = sectionFirstSubAddr[rowKey];
  } else {
    const subAddrSel = document.getElementById(sectionId ? ('newTaskSubAddr-'+sectionId) : 'newTaskSubAddr');
    if(subAddrSel && subAddrSel.value){
      row.sub_site_id = subAddrSel.value;
      sectionFirstSubAddr[rowKey] = subAddrSel.value;
    }
  }
  const rows = await dbInsert('schedule_tasks', row);
  const newTask = rows && rows[0];
  if(newTask){
    toast('Task added');
    // Only an UNGROUPED task gets its own "who can see this" — a task added
    // straight into a section always inherits that section's visibility.
    if(!sectionId){
      scheduleAddPanel = null;
      const assignments = await dbSelect('site_assignments', 'site_id=eq.'+siteId+'&select=user_id');
      openScheduleAssign('task', newTask.id, null, assignments.map(a=>a.user_id));
    } else {
      render();
    }
  }
};
window.saveTaskEdit = async function(siteId, taskId){
  const input = document.getElementById('editTaskInput-'+taskId);
  const name = input.value.trim();
  if(!name){ toast('Task name can\'t be empty.'); return; }
  const row = await dbUpdate('schedule_tasks', taskId, {name});
  if(row){
    editingTaskId = null;
    toast('Task updated');
    render();
  }
};
// Move an item up or down within its own section (or within the loose,
// un-sectioned list). It swaps with the next item above/below that is in
// the same state (open with open, completed with completed) so the move is
// always visible on the tab you're looking at, then renumbers that section.
let scheduleMoveBusy = false;
window.moveScheduleTask = async function(siteId, taskId, dir){
  if(scheduleMoveBusy) return;
  scheduleMoveBusy = true;
  try{
    const all = await dbSelect('schedule_tasks', 'site_id=eq.'+siteId+'&order=position.asc.nullslast,created_at.asc&select=id,section_id,sub_site_id,status,position');
    const me = all.find(t=>t.id===taskId);
    if(!me){ render(); return; }
    const sibs = all.filter(t=>(t.section_id||null)===(me.section_id||null));
    sibs.forEach((t,k)=>{ t._k = k; });
    sibs.sort((x,y)=>((x.position==null?1e9:x.position)-(y.position==null?1e9:y.position)) || (x._k-y._k));
    const isDone = t=>t.status==='done';
    const i = sibs.indexOf(me);
    let j = i + dir;
    while(j>=0 && j<sibs.length && isDone(sibs[j])!==isDone(me)) j += dir;
    if(j<0 || j>=sibs.length){ toast(dir<0 ? 'Already at the top.' : 'Already at the bottom.'); render(); return; }
    sibs.splice(i,1); sibs.splice(j,0,me);
    const changed = sibs.map((t,idx)=>({t,idx})).filter(x=>x.t.position!==x.idx);
    const results = await Promise.all(changed.map(x=>dbUpdate('schedule_tasks', x.t.id, {position:x.idx})));
    if(results.some(r=>!r)) toast('Could not save the new order — please try again.');
  }finally{ scheduleMoveBusy = false; }
  render();
};
window.deleteTask = async function(siteId, taskId){
  if(!await customConfirm('Delete this task? This also removes its progress photos. This can\'t be undone.')) return;
  const rows = await dbSelect('schedule_tasks', 'id=eq.'+taskId+'&select=name');
  const name = rows[0] && rows[0].name;
  const ok = await dbDelete('schedule_tasks', taskId);
  if(ok){ toast('Task deleted'); logSiteActivity(siteId, 'schedule_task_deleted', `Deleted Schedule of Works task "${name||''}"`); render(); }
};
window.enterScheduleMultiSelect = function(taskId){
  scheduleMultiSelectMode = true;
  scheduleMultiSelectedIds = new Set(taskId ? [taskId] : []);
  render();
};
window.toggleScheduleMultiSelectId = function(taskId){
  if(scheduleMultiSelectedIds.has(taskId)) scheduleMultiSelectedIds.delete(taskId); else scheduleMultiSelectedIds.add(taskId);
  render();
};
window.cancelScheduleMultiSelect = function(){
  scheduleMultiSelectMode = false;
  scheduleMultiSelectedIds = new Set();
  render();
};
window.deleteScheduleMultiSelected = async function(siteId){
  if(!scheduleMultiSelectedIds.size) return;
  const ids = Array.from(scheduleMultiSelectedIds);
  const count = ids.length;
  if(!await customConfirm(`Delete ${count} task${count===1?'':'s'}? This also removes their progress photos. This can't be undone.`)) return;
  const res = await sbFetch('/rest/v1/schedule_tasks?id=in.('+ids.join(',')+')', {method:'DELETE'});
  if(res.ok){
    toast(`${count} task${count===1?'':'s'} deleted`);
    logSiteActivity(siteId, 'schedule_task_deleted', `Deleted ${count} Schedule of Works task${count>1?'s':''}`);
    scheduleMultiSelectMode = false;
    scheduleMultiSelectedIds = new Set();
    render();
  } else toast('Could not delete — '+(await safeErr(res)));
};
// Every photo is tagged with the task's stage AT THE TIME it's taken
// (stage: 'todo'/'progress'/'done'), not derived later from wherever the
// task's status has since moved on to — that's what lets the Schedule of
// Works export group each task's photos into Before / In Progress /
// Completed Photos correctly even after the task itself has moved on.
// A photo added while a task is still To Do prompts "has this started?" —
// Yes tags the new photos as In Progress and moves the task there too
// (rather than silently filing a during-work photo under "Before"); No
// keeps both the task and the new photos exactly where they were.
window.taskPhoto = async function(input, siteId, taskId, currentStatus){
  const files = input.files ? Array.from(input.files) : [];
  if(!files.length) return;
  let stage = currentStatus === 'done' ? 'done' : (currentStatus === 'progress' ? 'progress' : 'todo');
  let moveToProgress = false;
  if(currentStatus === 'todo'){
    const started = await customConfirm('Has this task started?', {confirmLabel:'Yes — move to In Progress', cancelLabel:'No — still To Do'});
    if(started){ stage = 'progress'; moveToProgress = true; }
  }
  // Looked up once for the whole batch (it used to be asked again after
  // every single photo), then three photos go up at a time.
  const [existing, taskRows] = await Promise.all([
    dbSelect('schedule_photos', 'task_id=eq.'+taskId+'&select=id'),
    dbSelect('schedule_tasks', 'id=eq.'+taskId+'&select=name&limit=1'),
  ]);
  const taskName = ((taskRows && taskRows[0] && taskRows[0].name) ? taskRows[0].name : 'Photo').replace(/[^a-z0-9 ]+/gi,'').trim();
  let photoNum = existing ? existing.length : 0;
  let uploaded = 0;
  await runPool(files, 3, async file=>{
    const done = await uploadSchedulePhoto(siteId, taskId, file, stage);
    if(done){ uploaded++; photoNum++; queueOneDrivePhoto(done.dataUrl, taskName+' '+photoNum+'.jpg', siteId); }
  });
  if(uploaded){
    if(moveToProgress) await dbUpdate('schedule_tasks', taskId, {status:'progress'});
    // A progress photo prompts for an updated percentage (skippable).
    if(stage==='progress') percentPromptTaskId = taskId;
    toast(uploaded===1 ? (moveToProgress?'Photo added — moved to In Progress':'Photo added') : (moveToProgress?`${uploaded} photos added — moved to In Progress`:`${uploaded} photos added`));
    render();
  }
  else toast('Could not process photo(s).');
};
// Photos can be removed while a task is still To Do/In Progress — once it's
// marked Complete its photos are the evidence record and are locked (the ×
// button is hidden entirely in that state, see taskRowHtml), so this never
// runs against a done task in normal use.
window.deleteSchedulePhoto = async function(siteId, taskId, photoId, storagePath){
  if(!await customConfirm('Delete this photo? This can\'t be undone.')) return;
  const ok = await dbDelete('schedule_photos', photoId);
  if(!ok) return;
  if(storagePath){
    const base = storagePath.replace(/\.[a-z0-9]+$/i, '');
    for(const pth of [storagePath, base+'_m.jpg', base+'_t.jpg']){ try{ await sbFetch('/storage/v1/object/site-photos/'+pth, {method:'DELETE'}); }catch(e){ /* non-fatal */ } }
  }
  toast('Photo deleted');
  render();
};
// Best-effort background sync — never blocks the UI or shows an error toast,
// since most companies won't have OneDrive connected yet. If this site has
// been linked to a real OneDrive folder, the edge function uploads straight
// there; otherwise it falls back to an auto-created subfolder named after
// the site under the company's generic root.
async function syncPhotoToOneDrive(dataUrl, filename, siteId){
  try{
    const base64 = dataUrl.split(',')[1];
    await sbFetchOD('/functions/v1/onedrive-upload', {method:'POST', body: JSON.stringify({filename, content_base64: base64, site_id: siteId})});
  }catch(e){ /* silent — OneDrive sync is opportunistic */ }
}
// Same as above but targets an explicit folder_id/drive_id directly (e.g. a
// repair job's own linked folder) instead of resolving one from a site row
// — the onedrive-upload function always prefers folder_id when it's given.
async function syncPhotoToOneDriveFolder(dataUrl, filename, folderId, driveId){
  try{
    const base64 = dataUrl.split(',')[1];
    await sbFetchOD('/functions/v1/onedrive-upload', {method:'POST', body: JSON.stringify({filename, content_base64: base64, folder_id: folderId, drive_id: driveId||undefined})});
  }catch(e){ /* silent — OneDrive sync is opportunistic */ }
}
window.downloadScheduleTemplate = async function(){
  if(!(await loadLib('XLSX'))){ toast('Excel library failed to load — check connection.'); return; }
  const data = [
    {Task:'e.g. Strip and dispose of existing roof covering'},
    {Task:'e.g. Fit new lead flashing to chimney'},
    {Task:''},
  ];
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [{wch:60}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Schedule');
  await deliverExcelFile(wb, 'Schedule of Works - Upload Template.xlsx');
};
window.importScheduleExcel = async function(input, siteId){
  const file = input.files && input.files[0]; if(!file) return;
  if(!(await loadLib('XLSX'))){ toast('Excel library failed to load — check connection.'); return; }
  try{
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, {type:'array'});
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, {header:1});
    if(!rows.length){ toast('That file looks empty.'); input.value=''; return; }
    // Always let the person pick which column has the task/scope text —
    // some exports (e.g. a Bill of Quantities style Schedule of Works) put
    // a line ID/ref in column A and the actual scope further along the row,
    // so we never assume column A is the right one.
    const headerRow = rows[0] || [];
    const dataRows = rows.slice(1).filter(r=>r.some(v=>v!=null && String(v).trim()!==''));
    if(!dataRows.length){ toast('No data rows found below the header row.'); input.value=''; return; }
    const colCount = Math.max(headerRow.length, ...dataRows.map(r=>r.length));
    const headers = [];
    for(let i=0;i<colCount;i++){
      const h = headerRow[i];
      headers.push(h!=null && String(h).trim()!=='' ? String(h).trim() : 'Column '+String.fromCharCode(65+i));
    }
    // Guess the best default column: prefer one whose header suggests a
    // description/scope of work, otherwise fall back to whichever column
    // has the longest average text (an ID/ref column is typically short and
    // numeric, so this naturally steers away from picking that by default).
    let guess = headers.findIndex(h=>/scope|description|desc|task|item|work/i.test(h));
    if(guess<0){
      let bestLen = -1;
      for(let i=0;i<colCount;i++){
        const avgLen = dataRows.reduce((sum,r)=>sum+(r[i]!=null?String(r[i]).length:0),0)/dataRows.length;
        if(avgLen>bestLen){ bestLen=avgLen; guess=i; }
      }
    }
    scheduleImportPreview = {headers, dataRows, colIndex: guess<0?0:guess};
    input.value = ''; // so choosing the same file again still fires onchange
    render();
  }catch(e){ toast('Could not read that file — check it\'s a valid .xlsx or .csv.'); input.value=''; }
};
window.setScheduleImportColumn = function(idx){ scheduleImportPreview.colIndex = idx; render(); };
window.cancelScheduleImport = function(){ scheduleImportPreview = null; render(); };
window.confirmScheduleImport = async function(siteId){
  if(!scheduleImportPreview) return;
  const {dataRows, colIndex} = scheduleImportPreview;
  const names = dataRows.map(r=>r[colIndex]).filter(v=>v!=null && String(v).trim()!=='');
  if(!names.length){ toast('That column is empty for every row.'); return; }
  const startPos = await nextTaskPosition(siteId);
  const newRows = names.map((n,i)=>({site_id:siteId, name:String(n).trim(), status:'todo', position:startPos+i}));
  const inserted = await dbInsert('schedule_tasks', newRows);
  if(inserted){ toast(`${names.length} task(s) imported`); scheduleImportPreview = null; render(); }
};
window.importSchedulePdf = async function(input, siteId){
  const file = input.files && input.files[0]; if(!file) return;
  if(!(await loadLib('pdfjsLib'))){ toast('PDF reader failed to load — check connection.'); return; }
  const manual = !!(document.getElementById('pdfManualMode') && document.getElementById('pdfManualMode').checked);
  toast('Reading PDF…');
  try{
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({data: buf}).promise;
    let lines = [];
    for(let i=1;i<=pdf.numPages;i++){
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      // Group text fragments into lines by their vertical position, since
      // pdf.js returns individual text runs rather than whole lines.
      let lineMap = {};
      content.items.forEach(it=>{
        const y = Math.round(it.transform[5]);
        (lineMap[y] = lineMap[y] || []).push(it.str);
      });
      Object.keys(lineMap).map(Number).sort((a,b)=>b-a).forEach(y=>{
        const text = lineMap[y].join(' ').replace(/\s+/g,' ').trim();
        if(text) lines.push(text);
      });
    }
    if(!lines.length){ toast('No readable text found in that PDF — try ticking manual entry and paste the list yourself.'); pdfImportSiteId=siteId; pdfImportText=''; render(); return; }
    let prefill;
    if(manual){
      // Manual mode: hand back everything we could read so the person can
      // trim it down themselves, rather than guessing what's a task line.
      prefill = lines.join('\n');
    } else {
      // Best-effort auto-pull: drop obvious non-task lines (page numbers,
      // headers, very short fragments) and hope the rest are task rows —
      // still reviewed and editable before anything is actually imported.
      const skip = /^(page\s*\d+|schedule of works|item|description|task|ref\.?|no\.?|date|status|notes?)$/i;
      prefill = lines.filter(l=>{
        const t = l.trim();
        if(t.length<3) return false;
        if(/^\d+$/.test(t)) return false;
        if(skip.test(t)) return false;
        return true;
      }).join('\n');
    }
    pdfImportSiteId = siteId;
    pdfImportText = prefill;
    render();
  }catch(e){ console.error(e); toast('Could not read that PDF — try ticking manual entry and paste the list yourself.'); }
  input.value = '';
};
window.confirmPdfImport = async function(siteId){
  const ta = document.getElementById('pdfImportTextarea');
  const names = (ta ? ta.value : '').split('\n').map(s=>s.trim()).filter(Boolean);
  if(!names.length){ toast('Nothing to import.'); return; }
  const startPos = await nextTaskPosition(siteId);
  const newRows = names.map((n,i)=>({site_id:siteId, name:n, status:'todo', position:startPos+i}));
  const inserted = await dbInsert('schedule_tasks', newRows);
  if(inserted){
    toast(`${names.length} task${names.length===1?'':'s'} added`);
    pdfImportSiteId = null; pdfImportText = '';
    render();
  }
};
