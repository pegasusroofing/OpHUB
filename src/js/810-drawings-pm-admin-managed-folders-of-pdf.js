/* ================= DRAWINGS (PM/admin-managed folders of PDF drawings, per site) ================= */
let drawingUploadOpen = false;
let drawingNewFolderOpen = false;
let drawingsLastFolderId; // undefined initially so the very first render always "changes"
let drawingSupersededOpen = false;
// #(programme-key-date) 2026-09-27 — {fileId, fileName, siteId, folderId}
// while the "add a key date to the Calendar?" card is showing after a
// single-file upload into a Programme (or Main Contractor Programme)
// folder; null otherwise. See uploadDrawingFile/saveProgrammeKeyDate.
let drawingProgrammeKeyDatePrompt = null;
// "+" now asks Add Folder vs Add Drawings instead of jumping straight to
// "new folder" — same geo-modal look used for confirm dialogs / PM pickers
// elsewhere in the app.
window.showDrawingAddMenu = function(siteId, folderId){
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
      <button class="darkbtn" style="width:100%;margin-bottom:8px;" onclick="document.getElementById('confirmModalOverlay').style.display='none';drawingNewFolderOpen=true;drawingUploadOpen=false;render()">📁 Add Folder</button>
      <button class="darkbtn" style="width:100%;margin-bottom:8px;" onclick="document.getElementById('confirmModalOverlay').style.display='none';drawingUploadOpen=true;drawingNewFolderOpen=false;render()">📄 Add Document</button>
      <button class="geo-modal-cancel" onclick="document.getElementById('confirmModalOverlay').style.display='none';">Cancel</button>
    </div>`;
  ov.style.display = 'flex';
};
async function renderDrawings(siteId, folderId, opts){
  opts = opts || {};
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  const canManage = isManager(ME);
  // The "New folder" input and "Upload" panel are page-level toggles, not
  // per-folder ones — without this reset, opening either while inside one
  // folder left it stuck open after navigating into a different folder (or
  // back to the top level), which read as "the new-folder box shows up in
  // every drawings tab." Reset both whenever the folder actually changes.
  if(drawingsLastFolderId !== (folderId||null)){
    drawingNewFolderOpen = false;
    drawingUploadOpen = false;
    drawingSupersededOpen = false;
    drawingProgrammeKeyDatePrompt = null;
    drawingsLastFolderId = folderId||null;
  }
  let currentFolder = null;
  if(folderId){
    const rows = await dbSelect('drawing_folders', 'id=eq.'+folderId+'&select=*');
    currentFolder = rows[0] || null;
    if(!currentFolder){ go(`#/site/${siteId}/drawings`); return; }
  }
  // The construction programme is normally an Excel file, not a PDF — only
  // the two "programme" folders accept it, everywhere else in Drawings stays
  // PDF/JPEG/PNG only so a spreadsheet doesn't end up filed as a "drawing".
  const isProgrammeFolder = !!currentFolder && (currentFolder.name==='Programme' || currentFolder.name==='Main Contractor Programme');
  let [subfolders, files, supersededFiles, siteAssignments, pmOptions] = await Promise.all([
    dbSelect('drawing_folders', 'site_id=eq.'+siteId+'&'+(folderId?'parent_id=eq.'+folderId:'parent_id=is.null')+'&order=position.asc.nullslast,name.asc'),
    dbSelect('drawing_files', 'site_id=eq.'+siteId+'&'+(folderId?'folder_id=eq.'+folderId:'folder_id=is.null')+'&status=eq.current&order=name.asc'),
    dbSelect('drawing_files', 'site_id=eq.'+siteId+'&'+(folderId?'folder_id=eq.'+folderId:'folder_id=is.null')+'&status=eq.superseded&order=uploaded_at.desc'),
    canManage ? dbSelect('site_assignments', 'site_id=eq.'+siteId+'&select=user_id') : Promise.resolve([]),
    canManage ? loadPMList() : Promise.resolve([]),
  ]);
  if(canManage) await loadAllProfiles();
  const drawingOperativeOptions = canManage ? Object.values(PROFILES).filter(p=>siteAssignments.some(a=>a.user_id===p.id)).sort((a,b)=>a.name.localeCompare(b.name)) : [];
  const drawingNameById = docNameLookup(files, supersededFiles);
  // "Specification" used to hide itself from operatives while genuinely
  // empty (PMs always saw it). That was the one place Specification's
  // visibility diverged from every other Drawings folder, which never hides
  // itself for anyone regardless of role or empty state — #280 aligns
  // Specification to the same rule so it behaves exactly like Drawings.
  const backHref = currentFolder ? (currentFolder.parent_id ? `#/site/${siteId}/drawings/${currentFolder.parent_id}` : (opts.rootBackHref || `#/site/${siteId}/drawings`)) : `#/site/${siteId}/home`;
  const parentArg = folderId ? `'${folderId}'` : 'null';
  // Was gated on subfolders.length alone, so any folder holding drawing
  // FILES but no sub-folders (the normal case) kept "New folder" forced
  // open forever — the reported "New folder is stuck" bug. Now it opens by
  // default only while the folder is genuinely empty of both, and collapses
  // as soon as either a sub-folder or a drawing is added, matching the rule
  // that's meant to apply once there's anything in the folder.
  // Only auto-opens the create-folder box for an empty SUB-folder — the
  // top level now has its own explicit "Upload Document"/"Create Folder"
  // chooser row instead, so nothing should pop open there uninvited.
  const isDrawingsFolderEmpty = !!currentFolder && subfolders.length===0 && files.length===0;

  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    ${canManage ? `
      <div class="drawheaderrow">
        <span>Folder/File Name</span>
        <div class="roundplusbtn" style="background:var(--brand1);border-color:var(--brand1);color:var(--brand1-text,#fff);" onclick="showDrawingAddMenu('${siteId}',${parentArg})">+</div>
      </div>
    ` : ''}
    ${canManage && drawingNewFolderOpen ? `
      <div class="card" style="margin-bottom:10px;">
        <div class="row-gap">
          <input type="text" id="newDrawingFolderName" placeholder="e.g. Roof Plans">
          <button class="darkbtn" style="width:auto;padding:10px 16px;" onclick="createDrawingFolder('${siteId}',${parentArg})">Create Folder</button>
        </div>
      </div>
    ` : ''}
    ${subfolders.length || files.length ? `
      ${subfolders.map((f,idx)=>`
        <div class="sitecard" style="cursor:pointer;" onclick="go('#/site/${siteId}/drawings/${f.id}')">
          <div class="swatch">${f.name==='Specification'?'📄':'📁'}</div>
          <div class="info"><div class="name" style="font-weight:700;white-space:normal;word-break:break-word;">${f.visibility_mode==='assigned'?'🔒 ':''}${escapeHtml(f.name)}</div><div class="addr">Folder</div></div>
          ${canManage ? `
            <div class="taskicons" onclick="event.stopPropagation();">
              ${rowActionsMenuHtml('drawfolder-'+f.id, `
                <div class="statusmenu-item" style="${idx===0?'opacity:.4;pointer-events:none;':''}" onclick="rowActionsMenuOpenFor=null;moveDrawingFolder('${siteId}',${parentArg},'${f.id}',-1)">▲ Move Up</div>
                <div class="statusmenu-item" style="${idx===subfolders.length-1?'opacity:.4;pointer-events:none;':''}" onclick="rowActionsMenuOpenFor=null;moveDrawingFolder('${siteId}',${parentArg},'${f.id}',1)">▼ Move Down</div>
                <div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;renameDrawingFolder('${f.id}','${jsAttr(f.name)}')">✏️ Rename</div>
                <div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;openScheduleAssignExisting('drawingfolder','${f.id}','${siteId}')">🔒 Assign visibility</div>
                <div class="statusmenu-item danger" onclick="rowActionsMenuOpenFor=null;deleteDrawingFolder('${f.id}')">🗑 Delete</div>
              `)}
            </div>
          ` : ''}
        </div>
        ${canManage && scheduleAssignTarget && scheduleAssignTarget.kind==='drawingfolder' && scheduleAssignTarget.id===f.id ? scheduleAssignFormHtml(siteId, pmOptions, drawingOperativeOptions) : ''}
      `).join('')}
      ${files.map(f=>`
        <div class="card" style="display:flex;align-items:center;gap:8px;padding:12px 14px;margin-bottom:10px;">
          <div class="swatch" style="flex:0 0 36px;width:36px;height:36px;font-size:16px;">${/\.(jpe?g|png)$/i.test(f.name) ? '🖼' : /\.(xlsx|xls)$/i.test(f.name) ? '📊' : '📐'}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:14px;color:var(--ink);white-space:normal;word-break:break-word;line-height:1.3;">${escapeHtml(f.name)}</div>
            ${f.supersedes ? `<div class="meta">Supersedes "${escapeHtml(drawingNameById[f.supersedes]||'an earlier version')}"</div>` : ''}
          </div>
          <div class="ghostbtn" style="flex:0 0 52px;width:52px;text-align:center;padding:6px 3px;font-size:8.5px;cursor:pointer;" onclick="viewDrawing('${publicUrl('drawings', f.storage_path)}', ${/\.(jpe?g|png)$/i.test(f.storage_path)}, '${jsAttr(drawingDownloadFilename(f))}')">View</div>
          ${canManage ? `<div class="taskicon" onclick="renameDrawingFile('${f.id}','${jsAttr(f.name)}')">✏️</div>` : ''}
          ${canManage ? `<div class="taskicon danger" onclick="deleteDrawingFile('${f.id}','${jsAttr(f.storage_path)}')">🗑</div>` : ''}
        </div>
      `).join('')}
    ` : `<div class="empty">Nothing here yet.</div>`}

    ${supersededFiles.length ? `
    <p class="ddrow" onclick="drawingSupersededOpen=!drawingSupersededOpen;render()"><span class="arrow">${drawingSupersededOpen?'▼':'▶'}</span> Superseded Documents (${supersededFiles.length})</p>
    ${drawingSupersededOpen ? `<div class="card">${supersededFiles.map(f=>`
      <div style="padding:8px 0;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:8px;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:12.5px;">${escapeHtml(f.name)}</div>
          <div class="meta">Uploaded ${new Date(f.uploaded_at).toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'})} · superseded${f.superseded_by?' by "'+escapeHtml(drawingNameById[f.superseded_by]||'a newer version')+'"':''}</div>
          <div class="viewlink" style="cursor:pointer;" onclick="viewDrawing('${publicUrl('drawings', f.storage_path)}', ${/\.(jpe?g|png)$/i.test(f.storage_path)}, '${jsAttr(drawingDownloadFilename(f))}')">View document ↗</div>
        </div>
        ${canManage ? `<div class="taskicon danger" style="flex:0 0 auto;" onclick="deleteDrawingFile('${f.id}','${jsAttr(f.storage_path)}')">🗑</div>` : ''}
      </div>
    `).join('')}</div>` : ''}
    ` : ''}

    ${canManage && drawingProgrammeKeyDatePrompt && drawingProgrammeKeyDatePrompt.folderId===(folderId||null) ? `
      <div class="card" style="margin-bottom:14px;background:var(--paper);">
        <p class="sectiontitle" style="margin-top:0;">Add key dates from "${escapeHtml(drawingProgrammeKeyDatePrompt.fileName)}"?</p>
        <p class="stub" style="margin:0 0 10px;">Puts dates straight onto the site Calendar so the team can see them without opening the document.</p>
        ${drawingProgrammeKeyDatePrompt.candidates && drawingProgrammeKeyDatePrompt.candidates.length ? `
          <p class="stub" style="margin:0 0 8px;">We spotted ${drawingProgrammeKeyDatePrompt.candidates.length} date${drawingProgrammeKeyDatePrompt.candidates.length===1?'':'s'} in the spreadsheet — tick the ones that are genuine milestones (dates in a Gantt chart's every row aren't all worth a Calendar entry, so nothing's pre-ticked). You can also edit the label before adding.</p>
          <div style="max-height:260px;overflow-y:auto;border:1px solid var(--line);border-radius:10px;padding:8px;margin:0 0 10px;">
            ${drawingProgrammeKeyDatePrompt.candidates.map((c,i)=>`
              <label style="display:flex;align-items:flex-start;gap:8px;margin:0 0 8px;">
                <input type="checkbox" style="width:auto;margin-top:3px;" ${drawingProgrammeKeyDatePrompt.selected.has(i)?'checked':''} onchange="toggleProgrammeKeyDateCandidate(${i})">
                <div style="flex:1;min-width:0;">
                  <div class="stub" style="margin:0 0 2px;">${new Date(c.date+'T00:00:00').toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'})}</div>
                  <input type="text" id="programmeKeyDateLabel_${i}" value="${escapeHtml(c.label||('Programme: '+drawingProgrammeKeyDatePrompt.fileName))}" style="font-size:12.5px;padding:6px 8px;">
                </div>
              </label>
            `).join('')}
          </div>
          <div class="row-gap">
            <button class="darkbtn" style="flex:1;" onclick="saveProgrammeKeyDates()">Add Ticked to Calendar</button>
            <button class="ghostbtn" style="flex:1;" onclick="skipProgrammeKeyDate()">Skip</button>
          </div>
        ` : `
          <div class="formfield"><label class="field-label">Date</label><input type="date" id="programmeKeyDateInput"></div>
          <div class="formfield"><label class="field-label">Label</label><input type="text" id="programmeKeyDateLabel" value="${escapeHtml('Programme: '+drawingProgrammeKeyDatePrompt.fileName)}"></div>
          <div class="row-gap">
            <button class="darkbtn" style="flex:1;" onclick="saveProgrammeKeyDate()">Add to Calendar</button>
            <button class="ghostbtn" style="flex:1;" onclick="skipProgrammeKeyDate()">Skip</button>
          </div>
        `}
      </div>
    ` : ''}

    ${canManage ? `<div style="height:66px;"></div>` : ''}

    ${canManage ? `
      ${drawingUploadOpen ? `
        <div class="card" style="margin-top:10px;">
          <p class="sectiontitle" style="margin-top:0;">Upload drawing (PDF, JPEG or PNG)</p>
          <p class="stub" style="margin:0 0 8px;">Uploads into ${currentFolder ? '"'+escapeHtml(currentFolder.name)+'"' : 'the top-level Drawings folder'}.</p>
          <p class="stub" style="margin:0 0 8px;">You can select more than one file at once — each is uploaded and saved separately.${isProgrammeFolder ? ' Excel files (.xlsx/.xls) are accepted here — key dates in the sheet will be offered for the Calendar once it\'s uploaded.' : ''}</p>
          ${files.length ? `<div class="formfield" style="margin-top:0;"><label class="field-label">Supersedes (optional)</label>
            <select id="drawingSupersedes"><option value="">— New document, doesn't replace anything —</option>${files.map(f=>`<option value="${f.id}">${escapeHtml(f.name)}</option>`).join('')}</select>
            <p class="stub" style="margin:4px 0 0;">Only applies if you choose a single file below — keeps the old version on file, marked Superseded.</p>
          </div>` : ''}
          <div class="ghostbtn" style="cursor:pointer;text-align:center;" id="drawingUploadLabel" onclick="document.getElementById('drawingUploadInput').click()">Choose file(s)</div>
          <input type="file" id="drawingUploadInput" accept="${isProgrammeFolder ? 'application/pdf,image/jpeg,image/png,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel' : 'application/pdf,image/jpeg,image/png'}" multiple style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;" onchange="uploadDrawingFile(this,'${siteId}',${parentArg})">
          <button class="ghostbtn" style="margin-top:8px;" onclick="drawingUploadOpen=false;render()">Cancel</button>
        </div>
      ` : ''}
    ` : ''}
  `, {title: currentFolder ? currentFolder.name : 'Drawings', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:backHref, siteId, activeTab:'more'}); }
}
window.createDrawingFolder = async function(siteId, folderId){
  const input = document.getElementById('newDrawingFolderName');
  const name = input ? input.value.trim() : '';
  if(!name){ toast('Enter a folder name.'); return; }
  const rows = await dbInsert('drawing_folders', {site_id:siteId, parent_id:folderId||null, name, created_by:ME.id});
  if(rows){ toast('Folder created'); drawingNewFolderOpen = false; render(); }
};
window.renameDrawingFolder = async function(folderId, currentName){
  const next = await customPrompt('Rename folder', currentName);
  if(next==null) return;
  const trimmed = next.trim();
  if(!trimmed || trimmed===currentName) return;
  const row = await dbUpdate('drawing_folders', folderId, {name: trimmed});
  if(row){ toast('Folder renamed'); render(); }
};
window.moveDrawingFolder = async function(siteId, parentFolderId, folderId, dir){
  if(window.__movingDrawingFolder) return; // ignore a rapid second tap while the first is still saving
  window.__movingDrawingFolder = true;
  try{
    const siblings = await dbSelect('drawing_folders', 'site_id=eq.'+siteId+'&'+(parentFolderId?'parent_id=eq.'+parentFolderId:'parent_id=is.null')+'&order=position.asc.nullslast,name.asc');
    const idx = siblings.findIndex(f=>f.id===folderId);
    const swapIdx = idx + dir;
    if(idx<0 || swapIdx<0 || swapIdx>=siblings.length) return;
    // Re-number every sibling 0..n-1 in their current order, but with the two
    // moved folders' target indices already swapped — one pass, so there's no
    // window where a second click (or a slow connection) can read a
    // half-normalized order back and compute the wrong swap from it.
    const results = await Promise.all(siblings.map((f,i)=>{
      const newPos = i===idx ? swapIdx : (i===swapIdx ? idx : i);
      return dbUpdate('drawing_folders', f.id, {position:newPos});
    }));
    if(results.some(r=>!r)){ toast('Move failed — could not save the new order, try again.'); return; }
    render();
  } finally {
    window.__movingDrawingFolder = false;
  }
};
window.deleteDrawingFolder = async function(folderId){
  if(!await customConfirm('Delete this folder and everything inside it? This can\'t be undone.')) return;
  const rows = await dbSelect('drawing_folders', 'id=eq.'+folderId+'&select=site_id,name');
  const folderRow = rows[0];
  const ok = await dbDelete('drawing_folders', folderId);
  if(ok){ toast('Folder deleted'); if(folderRow) logSiteActivity(folderRow.site_id, 'drawing_folder_deleted', `Deleted drawings folder "${folderRow.name||''}"`); render(); }
};
// Best-effort scan of an uploaded Excel programme for date cells, so their
// milestones can be offered for the Calendar without the PM re-typing them.
// Layout varies a lot job-to-job, so this only ever SUGGESTS candidates —
// nothing is pre-ticked, and the PM reviews/edits before anything is saved.
async function parseExcelKeyDates(file){
  if(!(await loadLib('XLSX'))) return [];
  try{
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, {type:'array', cellDates:true});
    const out = [];
    const seen = new Set();
    for(const sheetName of wb.SheetNames){
      const ws = wb.Sheets[sheetName];
      if(!ws || !ws['!ref']) continue;
      const range = XLSX.utils.decode_range(ws['!ref']);
      for(let r=range.s.r; r<=range.e.r && out.length<30; r++){
        let dateCell = null, dateCol = -1;
        for(let c=range.s.c; c<=range.e.c; c++){
          const cell = ws[XLSX.utils.encode_cell({r,c})];
          if(cell && cell.t==='d' && cell.v instanceof Date && !isNaN(cell.v)){ dateCell = cell; dateCol = c; break; }
        }
        if(!dateCell) continue;
        const y = dateCell.v.getFullYear();
        if(y<2015 || y>2100) continue; // filters out stray numeric-as-date misreads
        let label = '';
        for(let c=dateCol-1; c>=range.s.c && !label; c--){
          const cell = ws[XLSX.utils.encode_cell({r,c})];
          if(cell && cell.v!=null && String(cell.v).trim()) label = String(cell.v).trim();
        }
        if(!label){
          for(let c=dateCol+1; c<=range.e.c && !label; c++){
            const cell = ws[XLSX.utils.encode_cell({r,c})];
            if(cell && cell.v!=null && String(cell.v).trim()) label = String(cell.v).trim();
          }
        }
        const m = String(dateCell.v.getMonth()+1).padStart(2,'0'), d = String(dateCell.v.getDate()).padStart(2,'0');
        const iso = `${y}-${m}-${d}`;
        const key = iso+'|'+label;
        if(seen.has(key)) continue;
        seen.add(key);
        out.push({date: iso, label});
      }
    }
    return out;
  }catch(e){ console.error('Programme Excel date scan failed', e); return []; }
}
window.uploadDrawingFile = async function(input, siteId, folderId){
  const files = input.files ? Array.from(input.files) : [];
  if(!files.length) return;
  const excelMimes = {'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':true, 'application/vnd.ms-excel':true};
  const isExcelName = name => /\.(xlsx|xls)$/i.test(name);
  const allowed = {'application/pdf':true, 'image/jpeg':true, 'image/png':true};
  const label = document.getElementById('drawingUploadLabel');
  // Supersedes only ever applies to a single-file upload — picking several
  // files at once and also choosing a document to supersede would be
  // ambiguous about which new file replaces it, so it's silently ignored
  // (with a toast) for a multi-file batch.
  const supersedesEl = document.getElementById('drawingSupersedes');
  const supersedesId = (supersedesEl && files.length===1) ? supersedesEl.value : '';
  if(supersedesEl && supersedesEl.value && files.length>1) toast('Supersedes only applies when uploading a single file — uploaded as new documents instead.');
  let uploaded = 0, skipped = 0, lastUploadedRow = null;
  for(let i=0; i<files.length; i++){
    const file = files[i];
    const isExcel = !!excelMimes[file.type] || isExcelName(file.name);
    if(!allowed[file.type] && !isExcel){ skipped++; continue; }
    if(label) label.textContent = `Uploading ${i+1} of ${files.length}…`;
    const path = siteId+'/'+(folderId||'root')+'/'+uid()+'-'+file.name.replace(/[^a-z0-9.\-]+/gi,'_');
    const contentType = isExcel ? (file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') : file.type;
    const stored = await uploadToStorage('drawings', path, file, contentType);
    if(!stored) continue;
    const rows = await dbInsert('drawing_files', {site_id:siteId, folder_id:folderId||null, name:file.name, storage_path:stored, uploaded_by:ME.id, supersedes: supersedesId||null});
    if(rows){
      uploaded++;
      lastUploadedRow = rows[0];
      if(supersedesId) await dbUpdate('drawing_files', supersedesId, {status:'superseded', superseded_by:rows[0].id});
    }
    pushDrawingToOneDrive(siteId, file);
  }
  if(uploaded){ toast(uploaded===1 ? 'Drawing uploaded' : `${uploaded} drawings uploaded`+(skipped?`, ${skipped} skipped (wrong file type)`:'')); drawingUploadOpen = false; }
  else if(skipped) toast('Please choose a PDF, JPEG, PNG or (in the Programme folder) an Excel file.');
  // #(programme-key-date) 2026-09-27 — uploading a new/updated construction
  // programme normally comes with its own key milestone dates, so offer to
  // put them straight onto the site Calendar right away rather than relying
  // on someone remembering to add them separately. Only offered for a
  // single-file upload (a batch of programme pages doesn't map to one set of
  // dates), and only into the two folders that are actually "the
  // programme" — every other Drawings/Spec folder is unaffected. When the
  // upload is an Excel file, scan it for candidate date cells first (see
  // parseExcelKeyDates); otherwise fall back to the plain manual-date form.
  if(uploaded===1 && files.length===1 && folderId && lastUploadedRow){
    const folderRows = await dbSelect('drawing_folders', 'id=eq.'+folderId+'&select=name');
    const folderName = folderRows[0] && folderRows[0].name;
    if(folderName==='Programme' || folderName==='Main Contractor Programme'){
      const uploadedFile = files[0];
      const isExcel = !!excelMimes[uploadedFile.type] || isExcelName(uploadedFile.name);
      const candidates = isExcel ? await parseExcelKeyDates(uploadedFile) : [];
      drawingProgrammeKeyDatePrompt = {fileId: lastUploadedRow.id, fileName: lastUploadedRow.name, siteId, folderId, candidates, selected: new Set()};
    }
  }
  render();
};
window.saveProgrammeKeyDate = async function(){
  const p = drawingProgrammeKeyDatePrompt;
  if(!p) return;
  const dateEl = document.getElementById('programmeKeyDateInput');
  const labelEl = document.getElementById('programmeKeyDateLabel');
  const date = dateEl ? dateEl.value : '';
  if(!date){ toast('Choose a date.'); return; }
  const titleText = (labelEl && labelEl.value.trim()) || ('Programme: '+p.fileName);
  const rows = await dbInsert('site_calendar_events', {org_id:ME.org_id, site_id:p.siteId, title:titleText, event_date:date, is_private:false, reminder_recipient_ids:[], created_by:ME.id});
  const eventId = rows && rows[0] && rows[0].id;
  if(eventId) await dbUpdate('drawing_files', p.fileId, {calendar_event_id:eventId});
  drawingProgrammeKeyDatePrompt = null;
  toast('Key date added to the Calendar');
  render();
};
window.toggleProgrammeKeyDateCandidate = function(idx){
  const p = drawingProgrammeKeyDatePrompt; if(!p) return;
  if(p.selected.has(idx)) p.selected.delete(idx); else p.selected.add(idx);
  render();
};
window.saveProgrammeKeyDates = async function(){
  const p = drawingProgrammeKeyDatePrompt; if(!p) return;
  const idxs = [...p.selected].filter(i=>p.candidates[i]);
  if(!idxs.length){ toast('Tick at least one date, or use Skip.'); return; }
  let firstEventId = null, added = 0;
  for(const i of idxs){
    const c = p.candidates[i];
    const labelEl = document.getElementById('programmeKeyDateLabel_'+i);
    const titleText = (labelEl && labelEl.value.trim()) || c.label || ('Programme: '+p.fileName);
    const rows = await dbInsert('site_calendar_events', {org_id:ME.org_id, site_id:p.siteId, title:titleText, event_date:c.date, is_private:false, reminder_recipient_ids:[], created_by:ME.id});
    const eventId = rows && rows[0] && rows[0].id;
    if(eventId){ added++; if(!firstEventId) firstEventId = eventId; }
  }
  if(firstEventId) await dbUpdate('drawing_files', p.fileId, {calendar_event_id:firstEventId});
  drawingProgrammeKeyDatePrompt = null;
  if(added) toast(added===1 ? 'Key date added to the Calendar' : `${added} key dates added to the Calendar`);
  render();
};
window.skipProgrammeKeyDate = function(){
  drawingProgrammeKeyDatePrompt = null;
  render();
};
// Two-way OneDrive sync for Drawings, push half: best-effort, silent-fail,
// same opportunistic pattern as photo/PDF sync elsewhere — only fires when
// this site has a OneDrive folder linked (Team & Admin › Sync Folder).
async function pushDrawingToOneDrive(siteId, file){
  const site = SITES.find(s=>s.id===siteId);
  if(!site || !site.onedrive_folder_id) return;
  try{
    const buf = await file.arrayBuffer();
    let binary = ''; const bytes = new Uint8Array(buf); const chunk = 0x8000;
    for(let i=0;i<bytes.length;i+=chunk) binary += String.fromCharCode(...bytes.subarray(i, Math.min(i+chunk, bytes.length)));
    const base64 = btoa(binary);
    await sbFetchOD('/functions/v1/onedrive-upload', {method:'POST', body: JSON.stringify({filename: file.name, content_base64: base64, site_id: siteId})});
  }catch(e){ /* silent — OneDrive sync is opportunistic */ }
}
/* ---- Drawings import (pull half of the two-way OneDrive sync) ---- */
let drawingImportStack = null;
let drawingImportFolders = [];
let drawingImportFiles = [];
let drawingImportError = null;
let drawingImportBusy = false;
let drawingImportSiteId = null;
let drawingImportTargetFolderId = null;
let drawingImportSelected = new Set();
window.startDrawingImport = function(siteId, targetFolderId){
  const site = SITES.find(s=>s.id===siteId);
  drawingImportSiteId = siteId;
  drawingImportTargetFolderId = targetFolderId || null;
  drawingImportSelected = new Set();
  drawingImportStack = [{id: site.onedrive_folder_id, name: site.onedrive_folder_name || 'Linked Folder', driveId: site.onedrive_drive_id}];
  go(`#/site/${siteId}/drawings-import`);
  loadDrawingImportLevel();
};
async function loadDrawingImportLevel(){
  drawingImportBusy = true; render();
  const current = drawingImportStack[drawingImportStack.length-1];
  try{
    const body = {includeFiles:true};
    if(current.id){ body.parent_id = current.id; if(current.driveId) body.drive_id = current.driveId; }
    const res = await sbFetchODIdempotent('/functions/v1/onedrive-list-folders', {method:'POST', body:JSON.stringify(body)});
    const d = await res.json();
    if(!res.ok || d.error){ drawingImportError = d.error || 'Could not load OneDrive folders.'; drawingImportFolders = []; drawingImportFiles = []; }
    else { drawingImportFolders = d.folders || []; drawingImportFiles = d.files || []; drawingImportError = null; }
  }catch(e){ drawingImportError = 'Could not reach OneDrive.'; drawingImportFolders = []; drawingImportFiles = []; }
  drawingImportBusy = false; render();
}
window.openDrawingImportFolder = function(id, name, driveId){
  const parentDrive = drawingImportStack[drawingImportStack.length-1].driveId;
  drawingImportStack.push({id, name, driveId: driveId || parentDrive});
  loadDrawingImportLevel();
};
window.drawingImportUp = function(){
  if(drawingImportStack.length>1){ drawingImportStack.pop(); loadDrawingImportLevel(); }
};
window.toggleDrawingImportSelect = function(key){
  if(drawingImportSelected.has(key)) drawingImportSelected.delete(key); else drawingImportSelected.add(key);
  render();
};
window.importSelectedDrawings = async function(){
  if(!drawingImportSelected.size) return;
  const files = drawingImportFiles.filter(f=>drawingImportSelected.has(f.id+'|'+(f.driveId||'')));
  let imported = 0, failed = 0;
  for(const f of files){
    try{
      const res = await sbFetchOD('/functions/v1/onedrive-download-file', {method:'POST', body:JSON.stringify({item_id:f.id, drive_id:f.driveId||null, name:f.name})});
      const d = await res.json();
      if(!res.ok || d.error || !d.content_base64){ failed++; continue; }
      const bytes = Uint8Array.from(atob(d.content_base64), c=>c.charCodeAt(0));
      const blob = new Blob([bytes]);
      const path = drawingImportSiteId+'/'+(drawingImportTargetFolderId||'root')+'/'+uid()+'-'+f.name.replace(/[^a-z0-9.\-]+/gi,'_');
      const stored = await uploadToStorage('drawings', path, blob, 'application/octet-stream');
      if(!stored){ failed++; continue; }
      const rows = await dbInsert('drawing_files', {site_id:drawingImportSiteId, folder_id:drawingImportTargetFolderId||null, name:f.name, storage_path:stored, uploaded_by:ME.id});
      if(rows) imported++; else failed++;
    }catch(e){ failed++; }
  }
  toast(imported ? `${imported} drawing${imported===1?'':'s'} imported from OneDrive`+(failed?`, ${failed} failed`:'') : 'Import failed — try again.');
  go(`#/site/${drawingImportSiteId}/drawings${drawingImportTargetFolderId?'/'+drawingImportTargetFolderId:''}`);
};
async function renderDrawingImportPicker(siteId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  if(!drawingImportStack || drawingImportSiteId!==siteId){ go(`#/site/${siteId}/drawings${drawingImportTargetFolderId?'/'+drawingImportTargetFolderId:''}`); return; }
  const backHref = `#/site/${siteId}/drawings${drawingImportTargetFolderId?'/'+drawingImportTargetFolderId:''}`;
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <div class="stub" style="margin:0 0 10px;">${drawingImportStack.map(f=>escapeHtml(f.name)).join(' › ')}</div>
    ${drawingImportStack.length>1 ? `<button class="ghostbtn" style="margin-bottom:12px;" onclick="drawingImportUp()">‹ Up one level</button>` : ''}
    ${drawingImportError ? `<div class="empty">${escapeHtml(drawingImportError)}</div>` : drawingImportBusy ? `<p class="stub">Loading…</p>` : `
      ${drawingImportFolders.map(f=>`
        <div class="sitecard" style="cursor:pointer;" onclick="openDrawingImportFolder('${f.id}','${jsAttr(f.name)}','${f.driveId||''}')">
          <div class="info"><div class="name">📁 ${escapeHtml(f.name)}</div></div>
        </div>
      `).join('')}
      ${drawingImportFiles.map(f=>{
        const key = f.id+'|'+(f.driveId||'');
        const checked = drawingImportSelected.has(key);
        return `
        <div class="sitecard" style="cursor:pointer;" onclick="toggleDrawingImportSelect('${jsAttr(key)}')">
          <input type="checkbox" style="width:18px;height:18px;flex:0 0 18px;" ${checked?'checked':''} onclick="event.stopPropagation();toggleDrawingImportSelect('${jsAttr(key)}')">
          <div class="info"><div class="name">${/\.(jpe?g|png)$/i.test(f.name)?'🖼':'📐'} ${escapeHtml(f.name)}</div></div>
        </div>`;
      }).join('')}
      ${(!drawingImportFolders.length && !drawingImportFiles.length) ? `<div class="empty">Nothing here.</div>` : ''}
    `}
    ${drawingImportSelected.size ? `<button class="darkbtn" style="margin-top:14px;" onclick="importSelectedDrawings()">Import ${drawingImportSelected.size} Selected</button>` : ''}
  `, {title:'Import from OneDrive', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:backHref, siteId, tabs:false}); }
}
window.deleteDrawingFile = async function(fileId, storagePath){
  if(!await customConfirm('Delete this drawing? This can\'t be undone.')) return;
  const rows = await dbSelect('drawing_files', 'id=eq.'+fileId+'&select=site_id,name');
  const fileRow = rows[0];
  const ok = await dbDelete('drawing_files', fileId);
  if(ok){
    try{ await sbFetch('/storage/v1/object/drawings/'+storagePath, {method:'DELETE'}); }catch(e){ /* non-fatal */ }
    toast('Drawing deleted');
    if(fileRow) logSiteActivity(fileRow.site_id, 'drawing_file_deleted', `Deleted drawing "${fileRow.name||''}"`);
    render();
  }
};
// Renames just the display title — the underlying stored file/link is left
// exactly where it is, so the PDF/image itself never moves.
window.renameDrawingFile = async function(fileId, currentName){
  const next = await customPrompt('Rename drawing', currentName);
  if(next==null) return;
  const trimmed = next.trim();
  if(!trimmed || trimmed===currentName) return;
  const row = await dbUpdate('drawing_files', fileId, {name: trimmed});
  if(row){ toast('Drawing renamed'); render(); }
};
