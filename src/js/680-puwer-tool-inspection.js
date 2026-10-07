/* ================= PUWER TOOL INSPECTION =================
   Weekly, per-operative record mirroring the HAVS week-based cadence: pick
   an operative, the matrix auto-populates one column per tool from their
   Operative Tools log, the five PUWER pass/fail questions as rows. Ticking
   defaults to UNTICKED when an operative fills their own (they must
   actively confirm each pass) and TICKED when a PM/Admin fills it on
   someone else's behalf. Un-ticking any box pops a warning that the tool
   can't be used until brought back in line with PUWER; a tool with every
   box ticked shows a green "acceptable" line. Exports as a PDF in the same
   house style as HAVS/RAMS, with a tool photo summary (photo + serial
   "Item ID") at the end. */
const PUWER_QUESTIONS = [
  {key:'q_suitability', label:'Suitability', text:'Is the tool or machine right for the specific job you are using it for?'},
  {key:'q_guarding', label:'Guarding', text:'Are all safety guards, interlocks, and protective devices present, secure, and working properly?'},
  {key:'q_controls', label:'Controls', text:'Do the start, stop, and speed controls function correctly, and are emergency stop buttons easy to reach?'},
  {key:'q_maintenance', label:'Maintenance & Condition', text:'Is there any sign of damage, excessive wear, corrosion, leaks, or electrical faults?'},
  {key:'q_markings', label:'Markings & Warnings', text:'Are all safety signs, operational instructions, and warning labels clear and easy to read?'},
];
let puwerWeekOffset = 0;
window.shiftPuwerWeek = function(dir){ puwerWeekOffset += dir; render(); };
function puwerWeekStartDate(offset){ return new Date(startOfWeek(Date.now()) + offset*7*24*60*60*1000); }
function puwerWeekStartISO(offset){ return localISODate(puwerWeekStartDate(offset)); }
function puwerWeekLabel(offset){
  const start = puwerWeekStartDate(offset);
  const end = new Date(start.getTime() + 4*86400000);
  return start.toLocaleDateString('en-GB',{day:'2-digit',month:'short'}) + ' – ' + end.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
}
let puwerMarkCompleteBusy = false;
async function renderPuwer(siteId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  const canManage = isManager(ME);
  const isClientView = ME.role==='client';
  const viewAsManager = canManage || isClientView; // clients get the same read-only roster view as managers, minus any edit/manage controls (gated separately below by canManage)
  await loadAllProfiles();
  const weekStartISO = puwerWeekStartISO(puwerWeekOffset);
  const [assignedRows, inspections, completionRows] = await Promise.all([
    dbSelect('site_assignments', 'site_id=eq.'+siteId+'&select=user_id'),
    dbSelect('puwer_inspections', 'site_id=eq.'+siteId+'&week_start=eq.'+weekStartISO+'&select=id,user_id'),
    dbSelect('puwer_weekly_completions', 'site_id=eq.'+siteId+'&week_start=eq.'+weekStartISO+'&select=id,completed_at,completed_by'),
  ]);
  const completion = completionRows[0] || null;
  const operatives = viewAsManager
    ? assignedRows.map(r=>PROFILES[r.user_id]).filter(p=>p && p.role==='operative').sort((a,b)=>a.name.localeCompare(b.name))
    : [ME];
  const inspectedIds = new Set(inspections.map(i=>i.user_id));
  // Pull through each operative's registered tool count (from My Tools /
  // Admin Centre's Operative Tools) so PMs/admins can see at a glance who
  // actually has tools logged before opening their inspection.
  let toolCountByUser = {};
  if(operatives.length){
    const idsIn = operatives.map(op=>op.id).join(',');
    const toolRows = await dbSelect('operative_tools', 'user_id=in.('+idsIn+')&select=user_id');
    toolRows.forEach(t=>{ toolCountByUser[t.user_id] = (toolCountByUser[t.user_id]||0)+1; });
  }
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <div class="row-gap" style="align-items:center;margin-bottom:14px;">
      <span class="taskicon" onclick="shiftPuwerWeek(-1)">‹</span>
      <span style="flex:1;text-align:center;font-weight:700;font-size:13px;">${puwerWeekLabel(puwerWeekOffset)}</span>
      <span class="taskicon" style="${puwerWeekOffset>=0?'opacity:.35;pointer-events:none;':''}" onclick="shiftPuwerWeek(1)">›</span>
    </div>
    ${completion ? `<div class="card" style="margin-bottom:14px;background:var(--ok-bg);"><p class="stub" style="margin:0;color:var(--ok);font-weight:700;">✓ Week marked complete — ${new Date(completion.completed_at).toLocaleDateString(undefined,{day:'2-digit',month:'short'})}</p></div>` : ''}
    ${canManage ? `<p class="stub" style="margin:0 0 8px;">Tick an operative to include them in Export Selected below.</p>` : ''}
    ${operatives.map(op=>`
      <div class="sitecard" ${isClientView?'':'style="cursor:pointer;"'} ${isClientView?'':`onclick="go('#/site/${siteId}/hs/puwer/${op.id}')"`}>
        ${canManage ? `<input type="checkbox" style="width:18px;height:18px;flex:0 0 18px;" ${puwerExportSelectedIds.includes(op.id)?'checked':''} onclick="event.stopPropagation();togglePuwerExportSelected('${op.id}')">` : ''}
        <div class="swatch personswatch">${escapeHtml((op.name||'?').split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase())}</div>
        <div class="info"><div class="name">${escapeHtml(op.name)}${op.id===ME.id?' (you)':''}</div><div class="addr">${inspectedIds.has(op.id) ? 'Inspection recorded' : 'Not yet inspected'}${canManage ? ` · <span style="text-decoration:underline;cursor:pointer;" onclick="event.stopPropagation();openAdminOperativeTools('${op.id}')">🔧 ${toolCountByUser[op.id]||0} tool${(toolCountByUser[op.id]||0)===1?'':'s'} — open in Operatives</span>` : ''}</div></div>
        <div class="status ${inspectedIds.has(op.id)?'active':'upcoming'}">${inspectedIds.has(op.id)?'Done':'Pending'}</div>
        ${(canManage||isClientView) && inspectedIds.has(op.id) ? `<div class="ghostbtn" style="flex:0 0 auto;width:auto;padding:4px 8px;font-size:10px;" onclick="event.stopPropagation();exportPuwerIndividual('${siteId}','${op.id}')">Export</div>` : ''}
      </div>
    `).join('') || `<div class="empty">No operatives assigned to this site.</div>`}
    ${viewAsManager && operatives.length ? `
      <div style="display:flex;gap:8px;margin-top:12px;">
        <button class="ghostbtn" style="flex:1;width:auto;padding:8px 6px;font-size:11px;" ${puwerExportAllBusy?'disabled':''} onclick="exportPuwerCollective('${siteId}')">${puwerExportAllBusy?'Building…':'Export All Operatives Weekly PUWER'}</button>
        ${canManage ? `<button class="ghostbtn" style="flex:1;width:auto;padding:8px 6px;font-size:11px;" ${puwerEmailAllBusy?'disabled':''} onclick="emailPuwerCollective('${siteId}')">${puwerEmailAllBusy?'Sending…':'Email All Operatives Weekly PUWER'}</button>` : ''}
      </div>
      ${puwerExportSelectedIds.length ? `
      <button class="ghostbtn" style="width:100%;margin-top:8px;padding:7px 6px;font-size:11px;" onclick="exportPuwerSelected('${siteId}')">Export Selected (${puwerExportSelectedIds.length})</button>
      ` : ''}
    ` : ''}
    ${canManage && !completion ? `<button class="darkbtn" style="margin-top:18px;padding:8px 6px;font-size:11.5px;" ${puwerMarkCompleteBusy?'disabled':''} onclick="markPuwerWeekComplete('${siteId}','${weekStartISO}')">${puwerMarkCompleteBusy?'Marking…':'Mark This Week As Complete'}</button>` : ''}
    ${canManage && completion ? `<button class="ghostbtn" style="margin-top:18px;" onclick="reopenPuwerWeek('${completion.id}')">Reopen This Week</button>` : ''}
  `, {title:'PUWER Tool Inspection', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/hs/havspuwer`, siteId, activeTab:'more'}); }
}
let puwerExportSelectedIds = [];
let puwerExportAllBusy = false;
let puwerEmailAllBusy = false;
window.togglePuwerExportSelected = function(userId){
  const i = puwerExportSelectedIds.indexOf(userId);
  if(i>-1) puwerExportSelectedIds.splice(i,1); else puwerExportSelectedIds.push(userId);
  render();
};
window.markPuwerWeekComplete = async function(siteId, weekStart){
  puwerMarkCompleteBusy = true; render();
  const row = await dbInsert('puwer_weekly_completions', {org_id:ME.org_id, site_id:siteId, week_start:weekStart, completed_by:ME.id});
  if(row){ toast('Week marked complete'); puwerWeekOffset += 1; }
  puwerMarkCompleteBusy = false; render();
};
window.reopenPuwerWeek = async function(completionId){
  puwerMarkCompleteBusy = true; render();
  const ok = await dbDelete('puwer_weekly_completions', completionId);
  if(ok) toast('Week reopened');
  puwerMarkCompleteBusy = false; render();
};
let puwerFillDraft = null; // {siteId, userId, weekStart, inspectionId, comments, tools:[{dbId, toolId, name, serial_number, photo_path, q_suitability,...}]}
let puwerFillSaving = false;
async function loadPuwerFillDraft(siteId, userId, weekStart){
  const [inspRows, ownedTools] = await Promise.all([
    dbSelect('puwer_inspections', 'site_id=eq.'+siteId+'&user_id=eq.'+userId+'&week_start=eq.'+weekStart+'&select=*'),
    dbSelect('operative_tools', 'user_id=eq.'+userId+'&order=created_at.asc'),
  ]);
  const insp = inspRows[0] || null;
  const existingTools = insp ? await dbSelect('puwer_inspection_tools', 'inspection_id=eq.'+insp.id+'&order=sort_order.asc') : [];
  const defaultChecked = isManager(ME);
  const existingByToolId = {};
  existingTools.forEach(t=>{ if(t.tool_id) existingByToolId[t.tool_id] = t; });
  const tools = [];
  // Keep every already-answered row, even for a tool since removed from the
  // operative's log — the inspection is a historical record, not a live view.
  existingTools.forEach(t=>{
    tools.push({dbId:t.id, toolId:t.tool_id, name:t.name, serial_number:t.serial_number, photo_path:t.photo_path,
      q_suitability:t.q_suitability, q_guarding:t.q_guarding, q_controls:t.q_controls, q_maintenance:t.q_maintenance, q_markings:t.q_markings});
  });
  // Append any tool logged since that isn't in the inspection yet.
  ownedTools.forEach(ot=>{
    if(existingByToolId[ot.id]) return;
    tools.push({dbId:null, toolId:ot.id, name:ot.name, serial_number:ot.serial_number, photo_path:ot.photo_path,
      q_suitability:defaultChecked, q_guarding:defaultChecked, q_controls:defaultChecked, q_maintenance:defaultChecked, q_markings:defaultChecked});
  });
  puwerFillDraft = {siteId, userId, weekStart, inspectionId: insp?insp.id:null, comments: insp?(insp.comments||''):'', tools,
    inspectedBy: insp ? insp.inspected_by : null, inspectedAt: insp ? insp.created_at : null}; // who carried it out and when — printed on the PDF
}
window.togglePuwerAnswer = function(idx, qKey){
  if(!puwerFillDraft) return;
  const t = puwerFillDraft.tools[idx];
  t[qKey] = !t[qKey];
  if(!t[qKey]) customAlert('This tool cannot be used until brought in line with PUWER regulations.');
  render();
};
window.setPuwerComments = function(val){ if(puwerFillDraft) puwerFillDraft.comments = val; };
async function renderPuwerFill(siteId, userId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  await loadAllProfiles();
  const op = PROFILES[userId];
  if(!op){ go(`#/site/${siteId}/hs/puwer`); return; }
  const weekStart = puwerWeekStartISO(puwerWeekOffset);
  if(!puwerFillDraft || puwerFillDraft.siteId!==siteId || puwerFillDraft.userId!==userId || puwerFillDraft.weekStart!==weekStart){
    await loadPuwerFillDraft(siteId, userId, weekStart);
  }
  const draft = puwerFillDraft;
  const canEdit = isManager(ME) || ME.id===userId;
  // Once saved once, the record is closed for comments/status editing (#255)
  // — everything else (tool list, export/email) stays exactly as before.
  const locked = !!draft.inspectionId && !draft.saveIncomplete; // stays unlocked after a partly-failed save so it can be retried
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <p class="stub" style="margin:0 0 14px;">Week of ${puwerWeekLabel(puwerWeekOffset)}</p>
    <div class="card" style="margin-bottom:14px;">
      <p class="sectiontitle" style="margin-top:0;">${escapeHtml(op.name)}'s Registered Tools</p>
      ${draft.tools.length ? `<p class="stub" style="margin:0 0 8px;">${draft.tools.length} tool${draft.tools.length===1?'':'s'} pulled through from ${op.id===ME.id?'My Tools':'their My Tools'}: ${draft.tools.map(t=>escapeHtml(t.name)).join(', ')}</p>` : `<p class="stub" style="margin:0 0 8px;">No tools registered yet.</p>`}
      ${isManager(ME) ? `<span style="font-size:12.5px;font-weight:700;color:var(--brand1);text-decoration:underline;cursor:pointer;" onclick="openAdminOperativeTools('${userId}')">Manage in Operatives — Operative Tools ↗</span>` : ''}
    </div>
    ${!draft.tools.length ? `
      <div class="empty">${escapeHtml(op.name)} hasn't logged any tools yet.${op.id===ME.id ? ` <span style="color:var(--brand1);cursor:pointer;font-weight:700;" onclick="go('#/site/${siteId}/hs/mytools')">Add one in My Tools</span>` : ' Ask them to add their tools via My Tools first.'}</div>
    ` : `
      <div style="overflow-x:auto;margin-bottom:14px;">
        <table style="border-collapse:collapse;width:100%;min-width:${220+draft.tools.length*130}px;">
          <thead>
            <tr>
              <th style="text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);font-size:11px;color:var(--slate);text-transform:uppercase;letter-spacing:.03em;">Question</th>
              ${draft.tools.map(t=>`<th style="text-align:center;padding:8px 10px;border-bottom:1px solid var(--line);font-size:12.5px;font-weight:700;color:var(--ink);min-width:120px;">${escapeHtml(t.name)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${PUWER_QUESTIONS.map(q=>`
              <tr>
                <td style="padding:10px;border-bottom:1px solid var(--line);font-size:12.5px;font-weight:600;color:var(--ink);max-width:180px;">${escapeHtml(q.label)}<div class="stub" style="margin:2px 0 0;font-size:10.5px;">${escapeHtml(q.text)}</div></td>
                ${draft.tools.map((t,idx)=>`
                  <td style="text-align:center;padding:10px;border-bottom:1px solid var(--line);">
                    <input type="checkbox" style="width:20px;height:20px;" ${t[q.key]?'checked':''} ${(canEdit && !locked)?'':'disabled'} onclick="togglePuwerAnswer(${idx},'${q.key}')">
                  </td>
                `).join('')}
              </tr>
            `).join('')}
            <tr>
              <td style="padding:10px;font-size:11px;color:var(--slate);text-transform:uppercase;letter-spacing:.03em;">Status</td>
              ${draft.tools.map(t=>{
                const pass = PUWER_QUESTIONS.every(q=>t[q.key]);
                return `<td style="text-align:center;padding:10px;">${pass ? `<span style="color:var(--ok);font-weight:700;font-size:11.5px;">✓ Acceptable</span>` : `<span style="color:var(--warn);font-weight:700;font-size:11.5px;">✗ Cannot be used</span>`}</td>`;
              }).join('')}
            </tr>
          </tbody>
        </table>
      </div>
    `}
    ${isManager(ME) ? `
      ${operativeToolsAddOpenFor===userId ? `
        <div class="card" style="margin-bottom:14px;">
          <p class="sectiontitle" style="margin-top:0;">Add Tool for ${escapeHtml(op.name)}</p>
          <div class="formfield" style="margin-top:0;"><input type="text" id="opToolName-${userId}" value="${escapeHtml(operativeToolsNameDraft)}" placeholder="Tool name, e.g. Impact Driver"></div>
          <div class="formfield"><input type="text" id="opToolSerial-${userId}" value="${escapeHtml(operativeToolsSerialDraft)}" placeholder="Serial / item number"></div>
          <div class="ghostbtn" style="cursor:pointer;text-align:center;margin-bottom:10px;" onclick="document.getElementById('opToolPhotoInput-${userId}').click()">${operativeToolsPhotoFile ? 'Photo chosen: '+escapeHtml(operativeToolsPhotoFile.name) : 'Choose Photo'}</div>
          <input type="file" id="opToolPhotoInput-${userId}" accept="image/*" style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;" onchange="onOperativeToolsPhotoChosen(this,'${userId}')">
          <div class="row-gap">
            <button class="darkbtn" style="flex:1;" onclick="addPuwerOperativeTool('${siteId}','${userId}')">Save Tool</button>
            <button class="ghostbtn" style="flex:1;" onclick="operativeToolsAddOpenFor=null;operativeToolsPhotoFile=null;operativeToolsNameDraft='';operativeToolsSerialDraft='';render()">Cancel</button>
          </div>
        </div>
      ` : `<button class="ghostbtn" style="margin-bottom:14px;" onclick="operativeToolsAddOpenFor='${userId}';operativeToolsPhotoFile=null;render()">+ Add Tool for ${escapeHtml(op.name)}</button>`}
    ` : ''}
    ${!locked ? `
    <p class="sectiontitle">Any Other Comments</p>
    <div class="card">
      <textarea id="puwerComments" rows="3" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:10px;font-size:13px;font-family:inherit;background:#fff;color:var(--ink);resize:vertical;" placeholder="Optional" ${canEdit?'':'disabled'} oninput="setPuwerComments(this.value)">${escapeHtml(draft.comments)}</textarea>
    </div>
    ` : (draft.comments ? `
    <p class="sectiontitle">Any Other Comments</p>
    <div class="card"><p style="margin:0;font-size:13px;color:var(--ink);white-space:pre-wrap;">${escapeHtml(draft.comments)}</p></div>
    ` : '')}
    ${canEdit && !locked && draft.tools.length ? `<button class="darkbtn" style="margin-top:14px;" ${puwerFillSaving?'disabled':''} onclick="savePuwerInspection()">Save Inspection</button>` : ''}
    ${draft.inspectionId ? `
      <div class="row-gap" style="margin-top:10px;">
        <button class="darkbtn" style="flex:1;" onclick="exportPuwerInspection('${siteId}','${userId}')">Export PDF</button>
        ${isManager(ME) ? `<button class="ghostbtn" style="flex:1;" ${puwerEmailBusy?'disabled':''} onclick="emailPuwerInspection('${siteId}','${userId}')">${puwerEmailBusy?'Sending…':'Email PUWER Report'}</button>` : ''}
      </div>
      ${isManager(ME) ? `<button class="ghostbtn" style="margin-top:10px;color:var(--warn);" ${puwerDeleteBusy?'disabled':''} onclick="deletePuwerInspection('${siteId}','${userId}')">${puwerDeleteBusy?'Deleting…':'Delete Inspection'}</button>` : ''}
    ` : ''}
  `, {title: op.name, subtitle:'PUWER Tool Inspection', back:`#/site/${siteId}/hs/puwer`, siteId, tabs:false}); }
}
window.savePuwerInspection = async function(){
  if(!puwerFillDraft) return;
  puwerFillSaving = true; render();
  const {siteId, userId, weekStart, tools, comments} = puwerFillDraft;
  let inspectionId = puwerFillDraft.inspectionId;
  if(!inspectionId){
    const rows = await dbInsert('puwer_inspections', {org_id:ME.org_id, site_id:siteId, user_id:userId, week_start:weekStart, inspected_by:ME.id, comments:comments||null});
    if(!rows){ puwerFillSaving=false; render(); return; }
    inspectionId = rows[0].id;
    puwerFillDraft.inspectionId = inspectionId;
  } else {
    // inspected_by is left alone on a later edit — it records who carried
    // the inspection out, not whoever last opened it to amend a comment.
    const upd = await dbUpdate('puwer_inspections', inspectionId, {comments:comments||null, updated_at:new Date().toISOString()});
    if(!upd){ puwerFillSaving=false; toast('Inspection NOT saved — check your signal and try again.'); render(); return; }
  }
  if(!puwerFillDraft.inspectedBy){ puwerFillDraft.inspectedBy = ME.id; puwerFillDraft.inspectedAt = new Date().toISOString(); }
  let puwerToolFailures = 0;
  for(let i=0;i<tools.length;i++){
    const t = tools[i];
    const payload = {q_suitability:t.q_suitability, q_guarding:t.q_guarding, q_controls:t.q_controls, q_maintenance:t.q_maintenance, q_markings:t.q_markings, sort_order:i};
    if(t.dbId){
      const row = await dbUpdate('puwer_inspection_tools', t.dbId, payload);
      if(!row) puwerToolFailures++;
    } else {
      const rows = await dbInsert('puwer_inspection_tools', Object.assign({inspection_id:inspectionId, tool_id:t.toolId, name:t.name, serial_number:t.serial_number, photo_path:t.photo_path}, payload));
      if(rows && rows[0]) t.dbId = rows[0].id; else puwerToolFailures++;
    }
  }
  // Each tool is saved separately; this used to say "Inspection saved" even
  // when some of them had failed. Pressing Save again retries only the ones
  // that didn't go through (saved tools keep their ids).
  puwerFillDraft.saveIncomplete = puwerToolFailures>0;
  toast(puwerToolFailures ? `${puwerToolFailures} tool${puwerToolFailures>1?'s':''} did NOT save — check your signal and press Save Inspection again.` : 'Inspection saved');
  puwerFillSaving = false;
  render();
};
let puwerEmailBusy = false;
let puwerDeleteBusy = false;
// PM/admin only (#254) — matches the confirm pattern used by drawing/message delete.
window.deletePuwerInspection = async function(siteId, userId){
  if(!puwerFillDraft || !puwerFillDraft.inspectionId) return;
  if(!isManager(ME)) return;
  if(!await customConfirm('Delete this PUWER inspection? This can\'t be undone.')) return;
  puwerDeleteBusy = true; render();
  const inspectionId = puwerFillDraft.inspectionId;
  try{ await sbFetch('/rest/v1/puwer_inspection_tools?inspection_id=eq.'+inspectionId, {method:'DELETE'}); }catch(e){}
  const ok = await dbDelete('puwer_inspections', inspectionId);
  puwerDeleteBusy = false;
  if(ok){
    toast('Inspection deleted');
    logSiteActivity(siteId, 'puwer_inspection_deleted', `Deleted PUWER inspection for ${nameOf(userId)}`);
    puwerFillDraft = null;
    await loadPuwerFillDraft(siteId, userId, puwerWeekStartISO(puwerWeekOffset));
  }
  render();
};
// Shared by Export PDF and Email PUWER Report — both build the exact same
// PDF, just differ in what happens to the bytes afterwards.
async function buildPuwerPdf(siteId, userId){
  if(!(await loadLib('PDFLib'))){ toast('PDF library failed to load — check connection.'); return null; }
  await loadAllProfiles();
  const op = PROFILES[userId];
  const site = SITES.find(s=>s.id===siteId);
  const pdfDoc = await PDFLib.PDFDocument.create();
  const fonts = await havsPdfFonts(pdfDoc);
  const logoImg = await havsFetchLogoImg(pdfDoc);
  const weekLabel = puwerWeekLabel(puwerWeekOffset);
  await drawPuwerInspectionPage(pdfDoc, fonts, pdfSiteLabel(site), weekLabel, op, puwerFillDraft.tools, puwerFillDraft.comments,
    puwerFillDraft.inspectedBy ? nameOf(puwerFillDraft.inspectedBy) : ME.name, logoImg, undefined, puwerFillDraft.inspectedAt || null);
  const bytes = await pdfDoc.save();
  const filename = exportFilename(site.name, 'PUWER - '+op.name+' - '+weekLabel, 'pdf');
  return {bytes, filename, site, op, weekLabel};
}
window.exportPuwerInspection = async function(siteId, userId){
  if(!(await loadLib('PDFLib'))){ toast('PDF library failed to load — check connection.'); return; }
  if(!puwerFillDraft || !puwerFillDraft.inspectionId){ toast('Save the inspection first.'); return; }
  toast('Building PDF…');
  try{
    const {bytes, filename} = await buildPuwerPdf(siteId, userId);
    await deliverPdf(bytes, filename);
  }catch(err){
    console.error('PUWER export failed', err);
    toast('Export failed — '+(err && err.message ? err.message : 'unknown error'));
  }
};
window.emailPuwerInspection = async function(siteId, userId){
  if(!(await loadLib('PDFLib'))){ toast('PDF library failed to load — check connection.'); return; }
  if(!puwerFillDraft || !puwerFillDraft.inspectionId){ toast('Save the inspection first.'); return; }
  const puwerCcSite = SITES.find(s=>s.id===siteId);
  let puwerCcClientEmail = null;
  if(puwerCcSite && puwerCcSite.client_email){
    const cc = await customConfirm('CC client contact'+((puwerCcSite.client_contact_name||puwerCcSite.client_name)?' ('+(puwerCcSite.client_contact_name||puwerCcSite.client_name)+')':'')+' on this email?', {confirmLabel:'Yes, CC them', cancelLabel:'No'});
    if(cc) puwerCcClientEmail = puwerCcSite.client_email;
  }
  puwerEmailBusy = true; render();
  toast('Building PDF…');
  try{
    const {bytes, filename, site, op, weekLabel} = await buildPuwerPdf(siteId, userId);
    let binary=''; const chunk=0x8000;
    for(let i=0;i<bytes.length;i+=chunk) binary += String.fromCharCode.apply(null, bytes.subarray(i,i+chunk));
    const content_base64 = btoa(binary);
    const res = await sbFetch('/functions/v1/send-puwer-email', {method:'POST', timeoutMs:60000, body: JSON.stringify({site_id:siteId, filename, content_base64, week_label:weekLabel, operative_name:op.name, client_cc_email: puwerCcClientEmail})});
    const d = await res.json();
    if(!res.ok || d.error){ toast('Email failed — '+(d.error||res.status)); }
    else toast('PUWER report emailed to '+ME.email);
  }catch(err){
    console.error('PUWER email failed', err);
    toast('Email failed — '+(err && err.message ? err.message : 'unknown error'));
  }
  puwerEmailBusy = false; render();
};
// Read-only fetch of one operative's saved inspection for a given week —
// used by the multi-operative exports below, which build straight from the
// database rather than from puwerFillDraft (which only ever holds one
// operative at a time).
async function loadPuwerInspectionForExport(siteId, userId, weekStart){
  const insp = (await dbSelect('puwer_inspections', 'site_id=eq.'+siteId+'&user_id=eq.'+userId+'&week_start=eq.'+weekStart+'&select=*'))[0] || null;
  if(!insp) return {tools:[], comments:'', hasInspection:false, inspectedBy:null, inspectedAt:null};
  const tools = await dbSelect('puwer_inspection_tools', 'inspection_id=eq.'+insp.id+'&order=sort_order.asc');
  return {tools, comments: insp.comments||'', hasInspection:true, inspectedBy: insp.inspected_by, inspectedAt: insp.created_at};
}
// Shared by "Export All", "Export Selected" and per-row Export — builds one
// PDF with one operative's inspection page-set per operative, mirroring
// buildHavsPdf's multi-operative loop.
async function buildPuwerCollectivePdf(siteId, operatives, labelForFilename){
  if(!(await loadLib('PDFLib'))){ toast('PDF library failed to load — check connection.'); return null; }
  await loadAllProfiles(); // inspector names
  const site = SITES.find(s=>s.id===siteId);
  const weekStart = puwerWeekStartISO(puwerWeekOffset);
  const weekLabel = puwerWeekLabel(puwerWeekOffset);
  const pdfDoc = await PDFLib.PDFDocument.create();
  const fonts = await havsPdfFonts(pdfDoc);
  const logoImg = await havsFetchLogoImg(pdfDoc);
  for(const op of operatives){
    const {tools, comments, hasInspection, inspectedBy, inspectedAt} = await loadPuwerInspectionForExport(siteId, op.id, weekStart);
    // Each operative's page carries whoever actually inspected THEIR tools
    // and the date it was done — not the person pressing Export, today.
    await drawPuwerInspectionPage(pdfDoc, fonts, pdfSiteLabel(site), weekLabel, op, tools, comments, inspectedBy ? nameOf(inspectedBy) : '—', logoImg, hasInspection, inspectedAt);
  }
  const bytes = await pdfDoc.save();
  const filename = exportFilename(site.name, 'PUWER - '+labelForFilename+' - '+weekLabel, 'pdf');
  return {bytes, filename, weekLabel};
}
async function puwerResolveAllOperatives(siteId){
  await loadAllProfiles();
  const assignedRows = await dbSelect('site_assignments', 'site_id=eq.'+siteId+'&select=user_id');
  const operativeIds = assignedRows.map(r=>r.user_id).filter(id => PROFILES[id] && PROFILES[id].role==='operative');
  return operativeIds.map(id=>PROFILES[id]).filter(Boolean).sort((a,b)=>a.name.localeCompare(b.name));
}
window.exportPuwerIndividual = async function(siteId, userId){
  if(!(await loadLib('PDFLib'))){ toast('PDF library failed to load — check connection.'); return; }
  try{
    await loadAllProfiles();
    const op = PROFILES[userId];
    if(!op){ toast('Could not find that operative.'); return; }
    const {bytes, filename} = await buildPuwerCollectivePdf(siteId, [op], op.name);
    await deliverPdf(bytes, filename);
  }catch(err){
    console.error('PUWER individual export failed', err);
    toast('Export failed — '+(err && err.message ? err.message : 'unknown error'));
  }
};
window.exportPuwerCollective = async function(siteId){
  if(!(await loadLib('PDFLib'))){ toast('PDF library failed to load — check connection.'); return; }
  puwerExportAllBusy = true; render();
  try{
    const operatives = await puwerResolveAllOperatives(siteId);
    if(!operatives.length){ toast('No operatives to export.'); }
    else{
      const {bytes, filename} = await buildPuwerCollectivePdf(siteId, operatives, 'All Operatives');
      await deliverPdf(bytes, filename);
    }
  }catch(err){
    console.error('PUWER collective export failed', err);
    toast('Export failed — '+(err && err.message ? err.message : 'unknown error'));
  }
  puwerExportAllBusy = false; render();
};
window.emailPuwerCollective = async function(siteId){
  if(!(await loadLib('PDFLib'))){ toast('PDF library failed to load — check connection.'); return; }
  const puwerCcSite2 = SITES.find(s=>s.id===siteId);
  let puwerCcClientEmail2 = null;
  if(puwerCcSite2 && puwerCcSite2.client_email){
    const cc = await customConfirm('CC client contact'+((puwerCcSite2.client_contact_name||puwerCcSite2.client_name)?' ('+(puwerCcSite2.client_contact_name||puwerCcSite2.client_name)+')':'')+' on this email?', {confirmLabel:'Yes, CC them', cancelLabel:'No'});
    if(cc) puwerCcClientEmail2 = puwerCcSite2.client_email;
  }
  puwerEmailAllBusy = true; render();
  try{
    const operatives = await puwerResolveAllOperatives(siteId);
    if(!operatives.length){ toast('No operatives to email.'); }
    else{
      const {bytes, filename, weekLabel} = await buildPuwerCollectivePdf(siteId, operatives, 'All Operatives');
      let binary=''; const chunk=0x8000;
      for(let i=0;i<bytes.length;i+=chunk) binary += String.fromCharCode.apply(null, bytes.subarray(i,i+chunk));
      const content_base64 = btoa(binary);
      const res = await sbFetch('/functions/v1/send-puwer-email', {method:'POST', timeoutMs:60000, body: JSON.stringify({site_id:siteId, filename, content_base64, week_label:weekLabel, client_cc_email: puwerCcClientEmail2})});
      const d = await res.json();
      if(!res.ok || d.error){ toast('Email failed — '+(d.error||res.status)); }
      else toast('PUWER register emailed to '+ME.email);
    }
  }catch(err){
    console.error('PUWER collective email failed', err);
    toast('Email failed — '+(err && err.message ? err.message : 'unknown error'));
  }
  puwerEmailAllBusy = false; render();
};
window.exportPuwerSelected = async function(siteId){
  if(!(await loadLib('PDFLib'))){ toast('PDF library failed to load — check connection.'); return; }
  if(!puwerExportSelectedIds.length){ toast('Tick at least one operative to export.'); return; }
  try{
    await loadAllProfiles();
    const operatives = puwerExportSelectedIds.map(id=>PROFILES[id]).filter(Boolean).sort((a,b)=>a.name.localeCompare(b.name));
    if(!operatives.length){ toast('Could not find those operatives.'); return; }
    const {bytes, filename} = await buildPuwerCollectivePdf(siteId, operatives, 'Selected Operatives');
    await deliverPdf(bytes, filename);
  }catch(err){
    console.error('PUWER selected export failed', err);
    toast('Export failed — '+(err && err.message ? err.message : 'unknown error'));
  }
};
// House-style PDF page — header band + logo top-right like HAVS/RAMS, a
// question x tool matrix, comments, then a Tool Photo Summary (photo +
// serial "Item ID") per tool at the end, mirroring the layout of RTB's
// existing PUWER export.
async function drawPuwerInspectionPage(pdfDoc, fonts, siteName, weekLabel, op, tools, comments, inspectedByName, logoImg, hasInspection, inspectedAt){
  if(hasInspection === undefined) hasInspection = true;
  const {bold, reg, italic, INK, SLATE, LINE, HEADBG, RED, GREEN, BRAND, WHITE} = fonts;
  const PAGE_W = 595.28, PAGE_H = 841.89;
  const MARGIN = 44;
  const TABLE_W = PAGE_W - 2*MARGIN;
  let page, y;
  function drawHeaderBand(){
    page.drawRectangle({x:0, y:PAGE_H-80, width:PAGE_W, height:80, color:BRAND});
    if(logoImg){
      const dim = logoImg.scale(1);
      const s = HAVS_LOGO_SIZE/Math.max(dim.width, dim.height);
      const w = dim.width*s, h = dim.height*s;
      page.drawRectangle({x:HAVS_LOGO_RIGHT_X, y:PAGE_H-72, width:HAVS_LOGO_SIZE, height:HAVS_LOGO_SIZE, color:WHITE});
      page.drawImage(logoImg, {x:HAVS_LOGO_RIGHT_X+(HAVS_LOGO_SIZE-w)/2, y:PAGE_H-72+(HAVS_LOGO_SIZE-h)/2, width:w, height:h});
    }
    page.drawText('PUWER TOOL INSPECTION', {x:MARGIN, y:PAGE_H-34, size:9, font:bold, color:WHITE, opacity:0.85});
    page.drawText(op.name, {x:MARGIN, y:PAGE_H-54, size:16, font:bold, color:WHITE, maxWidth:PAGE_W-2*MARGIN-(logoImg?HAVS_LOGO_SIZE+8:0)});
    pdfDrawFit(page, siteName + ' · Week ' + weekLabel, {x:MARGIN, y:PAGE_H-70, size:9.5, font:reg, color:WHITE, opacity:0.9, maxWidth:PAGE_W-2*MARGIN-(logoImg?HAVS_LOGO_SIZE+8:0)});
  }
  function drawFooter(){
    page.drawLine({start:{x:MARGIN,y:34}, end:{x:PAGE_W-MARGIN,y:34}, thickness:0.75, color:LINE});
    page.drawText('Generated via OpHUB', {x:MARGIN, y:20, size:8, font:reg, color:SLATE});
  }
  function newPage(){
    page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    drawHeaderBand();
    drawFooter();
    y = PAGE_H - 100;
  }
  function ensureRoom(h){ if(y - h < 60){ newPage(); } }
  newPage();

  if(!hasInspection){
    ensureRoom(20);
    page.drawText('No PUWER inspection recorded this week.', {x:MARGIN, y, size:10, font:italic, color:SLATE});
    return;
  }

  const QCOL_W = 150;
  const toolColW = tools.length ? (TABLE_W - QCOL_W)/tools.length : 0;
  const HEADER_H = 28;
  function colX(i){ return i===0 ? MARGIN : MARGIN + QCOL_W + (i-1)*toolColW; }

  if(tools.length){
    ensureRoom(HEADER_H+10);
    page.drawRectangle({x:MARGIN, y:y-HEADER_H, width:TABLE_W, height:HEADER_H, color:HEADBG});
    page.drawText('Question', {x:MARGIN+6, y:y-HEADER_H+10, size:8, font:bold, color:INK});
    tools.forEach((t,i)=>{
      const wrapped = pdfWrapText(bold, 8, t.name, toolColW-10).slice(0,2);
      wrapped.forEach((ln,li)=>{
        const tw = bold.widthOfTextAtSize(ln, 8);
        page.drawText(ln, {x:colX(i+1)+(toolColW-tw)/2, y:y-HEADER_H+18-li*10, size:8, font:bold, color:INK});
      });
    });
    page.drawLine({start:{x:MARGIN,y:y-HEADER_H}, end:{x:MARGIN+TABLE_W,y:y-HEADER_H}, thickness:1, color:INK});
    y -= HEADER_H;

    PUWER_QUESTIONS.forEach(q=>{
      // Question text can run to 2-3 wrapped lines — size the row to the
      // wrapped line count (with a bit of bottom padding) instead of a fixed
      // height, so the last line never lands under the row's bottom rule (#256).
      const wrapped = pdfWrapText(reg, 7.5, q.text, QCOL_W-12);
      const rh = Math.max(24, 28 + (wrapped.length-1)*9.5);
      ensureRoom(rh);
      const top = y;
      page.drawText(q.label, {x:MARGIN+6, y:top-11, size:8.5, font:bold, color:INK});
      wrapped.forEach((ln,li)=>{ page.drawText(ln, {x:MARGIN+6, y:top-22-li*9.5, size:7.5, font:reg, color:SLATE}); });
      tools.forEach((t,i)=>{
        // Plain Y/N letters rather than tick/cross glyphs — the Unicode
        // check/cross marks aren't part of the WinAnsi encoding pdf-lib's
        // standard fonts use, which crashed export/email with a
        // "WinAnsi cannot encode" error.
        const mark = t[q.key] ? 'Y' : 'N';
        const markColor = t[q.key] ? GREEN : RED;
        const tw = bold.widthOfTextAtSize(mark, 11);
        page.drawText(mark, {x:colX(i+1)+(toolColW-tw)/2, y:top-rh/2-4, size:11, font:bold, color:markColor});
      });
      page.drawLine({start:{x:MARGIN,y:top-rh}, end:{x:MARGIN+TABLE_W,y:top-rh}, thickness:0.5, color:LINE});
      y = top - rh;
    });
    {
      const rh = 26;
      ensureRoom(rh);
      const top = y;
      page.drawText('Status', {x:MARGIN+6, y:top-16, size:8.5, font:bold, color:INK});
      tools.forEach((t,i)=>{
        const pass = PUWER_QUESTIONS.every(q=>t[q.key]);
        const label = pass ? 'Acceptable' : 'Cannot be used';
        const color = pass ? GREEN : RED;
        const tw = bold.widthOfTextAtSize(label, 7.5);
        page.drawText(label, {x:colX(i+1)+(toolColW-tw)/2, y:top-16, size:7.5, font:bold, color});
      });
      page.drawLine({start:{x:MARGIN,y:top-rh}, end:{x:MARGIN+TABLE_W,y:top-rh}, thickness:1, color:INK});
      y = top - rh;
    }
    const allPass = tools.every(t=>PUWER_QUESTIONS.every(q=>t[q.key]));
    y -= 6;
    ensureRoom(20);
    const boxH = 18;
    if(allPass){
      page.drawRectangle({x:MARGIN, y:y-boxH, width:TABLE_W, height:boxH, color:PDFLib.rgb(0.91,0.97,0.93)});
      page.drawText('All tools inspected are acceptable for use.', {x:MARGIN+8, y:y-boxH+6, size:8.5, font:bold, color:GREEN});
    } else {
      page.drawRectangle({x:MARGIN, y:y-boxH, width:TABLE_W, height:boxH, color:PDFLib.rgb(0.98,0.92,0.92)});
      page.drawText('One or more tools cannot be used until brought in line with PUWER regulations.', {x:MARGIN+8, y:y-boxH+6, size:8.5, font:bold, color:RED, maxWidth:TABLE_W-16});
    }
    y -= boxH;
  }

  y -= 14;
  ensureRoom(24);
  page.drawText('Any Other Comments', {x:MARGIN, y, size:9, font:bold, color:INK});
  y -= 14;
  const commentLines = pdfWrapText(reg, 8.5, comments || '—', TABLE_W);
  commentLines.forEach(ln=>{ ensureRoom(12); page.drawText(ln, {x:MARGIN, y, size:8.5, font:reg, color:INK}); y -= 12; });

  y -= 10;
  ensureRoom(20);
  page.drawText('Inspected by ' + inspectedByName + ' · ' + (inspectedAt ? new Date(inspectedAt).toLocaleDateString('en-GB') : 'not yet saved'), {x:MARGIN, y, size:8.5, font:italic, color:SLATE});
  y -= 20;

  if(tools.length){
    ensureRoom(24);
    page.drawText('TOOL PHOTO SUMMARY', {x:MARGIN, y, size:11, font:bold, color:INK});
    y -= 18;
    for(let i=0;i<tools.length;i++){
      const t = tools[i];
      const pass = PUWER_QUESTIONS.every(q=>t[q.key]);
      ensureRoom(160);
      page.drawText('Tool '+(i+1)+': '+t.name, {x:MARGIN, y, size:10, font:bold, color:INK});
      y -= 14;
      page.drawText('Item ID: '+(t.serial_number||'—'), {x:MARGIN, y, size:8.5, font:reg, color:SLATE});
      y -= 12;
      let imgH = 0;
      if(t.photo_path){
        try{
          const bytes = await pdfFetchImageBytes(publicUrl('operative-tools', t.photo_path));
          if(bytes){
            let img; try{ img = await pdfDoc.embedJpg(bytes); }catch(e){ img = await pdfDoc.embedPng(bytes); }
            const dim = img.scale(1);
            const maxW = 140, maxH = 105;
            const s = Math.min(maxW/dim.width, maxH/dim.height, 1);
            const w = dim.width*s, h = dim.height*s;
            ensureRoom(h+10);
            page.drawImage(img, {x:MARGIN, y:y-h, width:w, height:h});
            imgH = h;
          }
        }catch(e){}
      }
      const boxY = y - Math.max(imgH, 20);
      const boxW = 200, boxH2 = 16;
      page.drawRectangle({x:MARGIN+160, y:y-boxH2, width:boxW, height:boxH2, color: pass ? GREEN : RED});
      page.drawText(pass ? 'Compliant' : 'Non-Compliant', {x:MARGIN+168, y:y-boxH2+5, size:8.5, font:bold, color:WHITE});
      y = boxY - 14;
      if(!pass){
        const warnLines = pdfWrapText(italic, 7.5, 'Cannot be used until brought in line with PUWER regulations.', TABLE_W);
        warnLines.forEach(ln=>{ ensureRoom(10); page.drawText(ln, {x:MARGIN, y, size:7.5, font:italic, color:RED}); y -= 10; });
      }
      y -= 8;
      page.drawLine({start:{x:MARGIN,y}, end:{x:MARGIN+TABLE_W,y}, thickness:0.5, color:LINE});
      y -= 10;
    }
  }
}
