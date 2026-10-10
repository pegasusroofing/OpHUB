/* ================= SITE REPORTS (PM fills a template in and submits) ================= */
let reportFillDraft = null; // {submissionId, template_name, answers:{}, sections}
let reportSubmitBusy = false;
let reportSaveBusy = false;
let reportsFilterTemplate = '';      // '' = all templates
let selectedReportIds = new Set();   // checked rows, for bulk email/export/delete
let bulkEmailBusy = false;
let bulkExportBusy = false;
let bulkDeleteBusy = false;
let reportPickerOpen = false;        // shows a template picker at the top of the Reports screen, to start a new inspection
const REPORT_STATUS_LABEL = {in_progress:'In Progress', completed:'Completed'};
const REPORT_STATUS_CLASS = {in_progress:'open', completed:'closed'};
// Templates tile: build/manage report templates for this site. Any PM or
// admin can view and edit templates (isManager), matching the Reports tile's
// access level — editing a template never changes inspections already
// started from it.
// ---- General (no project) surveys -------------------------------------
// The same templates / fill / review / export / email engine as a project's
// Reports tile, but saved against no project at all (site_id is empty) —
// for surveying potential jobs. 'general' stands in for the site id.
const GENERAL_REPORTS = 'general';
function isGeneralReports(siteId){ return siteId === GENERAL_REPORTS || !siteId; }
function reportListPath(siteId, fromBriefing){
  if(isGeneralReports(siteId)) return '#/general-reports';
  return fromBriefing ? `#/site/${siteId}/hs/briefings` : `#/site/${siteId}/snagging/reports`;
}
function reportShellOpts(siteId, site, title, back, label){
  if(isGeneralReports(siteId)) return {title, subtitle: label || 'Not linked to a project', back, tabs:false};
  return {title, subtitle:fullSiteAddress(site), siteNameSubtitle:true, back, siteId, activeTab:'more'};
}
async function renderSiteReportTemplates(siteId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  const canEdit = isManager(ME);
  const templates = await dbSelect('report_templates', 'org_id=eq.'+ME.org_id+'&archived=eq.false&order=name.asc');
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    ${canEdit ? `<p class="stub" style="margin:0 0 10px;">Build and manage templates here. Editing a template never changes inspections already started from it.</p>` : ''}
    ${templates.map(t=>`
      <div class="sitecard">
        <div class="info"><div class="name">${escapeHtml(t.name)}</div>${t.description?`<div class="addr">${escapeHtml(t.description)}</div>`:''}</div>
        ${canEdit ? `
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="ghostbtn" style="width:auto;padding:8px 10px;" onclick="openTemplateEditor('${t.id}','${siteId}')">Edit</button>
            <button class="ghostbtn" style="width:auto;padding:8px 10px;color:var(--warn);" onclick="deleteTemplate('${t.id}','${jsAttr(t.name)}')">Delete</button>
          </div>
        ` : ''}
      </div>
    `).join('') || `<div class="empty">No report templates yet${canEdit?'.':' — ask a Project Manager to create one.'}</div>`}
    ${canEdit ? `<button class="darkbtn" style="margin-top:10px;" onclick="createNewTemplate('${siteId}')">+ New Template</button>` : ''}
  `, {title:'Report Templates', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/snagging`, siteId, activeTab:'more'}); }
}
// Reports tile: inspections list for this site, plus a template picker for
// starting a new one — the "start a report" flow that used to live inside
// the combined Templates/Inspections screen.
async function renderSiteReports(siteId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  const general = isGeneralReports(siteId);
  const [templates, submissions] = await Promise.all([
    dbSelect('report_templates', 'org_id=eq.'+ME.org_id+'&archived=eq.false&order=name.asc'),
    dbSelect('report_submissions', (general ? 'site_id=is.null&org_id=eq.'+ME.org_id : 'site_id=eq.'+siteId)+'&order=submitted_at.desc&limit=100'),
  ]);
  await loadAllProfiles();
  // Reports parked on this phone: flag the ones already in the list, and add
  // any that were started with no signal (the server doesn't know them yet).
  const waitingRecs = (await reportOfflineAll()).filter(r=>r.pending && !(r.draft && r.draft.fromBriefing) && (general ? isGeneralReports(r.siteId) : r.siteId===siteId));
  const waitingIds = new Set(waitingRecs.map(r=>r.submissionId));
  waitingRecs.filter(r=>!submissions.some(s=>s.id===r.submissionId)).forEach(r=>{
    submissions.unshift({id:r.submissionId, template_name:r.draft.template_name, general_label:r.draft.generalLabel, status:'in_progress', submitted_at:new Date(r.updatedAt).toISOString(), submitted_by:ME.id});
  });
  const templateNames = Array.from(new Set(submissions.map(s=>s.template_name))).sort();
  const filtered = reportsFilterTemplate ? submissions.filter(s=>s.template_name===reportsFilterTemplate) : submissions;

  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    ${general ? `<p class="stub" style="margin:0 0 10px;">Surveys and inspections that aren't linked to a project — for potential jobs. Same templates, export and email as inside a project.</p>` : ''}
    ${isManager(ME) ? `
      <button class="darkbtn" style="margin-bottom:10px;" onclick="reportPickerOpen=!reportPickerOpen;render()">${reportPickerOpen?'Cancel':(general?'+ New Survey / Report':'+ New Report')}</button>
      ${reportPickerOpen ? `
        <div class="card" style="margin-bottom:14px;">
          <p class="stub" style="margin:0 0 8px;">Pick a template to start a new inspection:</p>
          ${templates.map(t=>`
            <div class="sitecard">
              <div class="info"><div class="name">${escapeHtml(t.name)}</div>${t.description?`<div class="addr">${escapeHtml(t.description)}</div>`:''}</div>
              <button class="darkbtn" style="width:auto;padding:8px 14px;" onclick="startReport('${siteId}','${t.id}')">Start</button>
            </div>
          `).join('') || `<div class="empty">No report templates yet — an admin can add one from the Admin Centre.</div>`}
        </div>
      ` : ''}
    ` : ''}
    ${templateNames.length>1 ? `
      <div class="formfield" style="margin-top:0;">
        <label class="field-label">Filter by template</label>
        <select onchange="setReportsFilter(this.value)">
          <option value="">All templates</option>
          ${templateNames.map(n=>`<option value="${escapeHtml(n)}" ${reportsFilterTemplate===n?'selected':''}>${escapeHtml(n)}</option>`).join('')}
        </select>
      </div>
    ` : ''}
    ${selectedReportIds.size>0 ? `
      <div class="row-gap" style="margin-bottom:10px;">
        ${isManager(ME) ? `<button class="darkbtn" style="flex:1;" ${bulkEmailBusy?'disabled':''} onclick="emailSelectedReports()">${bulkEmailBusy?'Emailing…':`Email ${selectedReportIds.size} Selected`}</button>` : ''}
        <button class="ghostbtn exportbtn reportsexportbtn" style="flex:1;" ${bulkExportBusy?'disabled':''} onclick="exportSelectedReports('${siteId}')">${bulkExportBusy?'Building…':`Export ${selectedReportIds.size} Selected (PDF)`}</button>
      </div>
      ${isManager(ME) ? `
      <button class="ghostbtn" style="margin-bottom:10px;color:var(--warn);" ${bulkDeleteBusy?'disabled':''} onclick="deleteSelectedReports('${siteId}')">${bulkDeleteBusy?'Deleting…':`Delete ${selectedReportIds.size} Selected`}</button>
      ` : ''}
    ` : ''}
    ${filtered.map(s=>`
      <div class="sitecard" style="flex-wrap:wrap;">
        ${isManager(ME) ? `<input type="checkbox" style="width:18px;height:18px;flex:0 0 18px;margin-top:2px;" ${selectedReportIds.has(s.id)?'checked':''} onclick="toggleReportSelect('${s.id}')">` : ''}
        <div class="info" style="cursor:pointer;" onclick="go('${reportListPath(siteId)}/${s.status==='in_progress'?'fill':'view'}/${s.id}')">
          <div class="name">${general && s.general_label ? escapeHtml(s.general_label)+' — ' : ''}${escapeHtml(s.template_name)}</div>
          <div class="addr">${s.status==='in_progress' ? 'Started' : ('Submitted '+new Date(s.submitted_at).toLocaleString('en-GB'))} · ${escapeHtml(nameOf(s.submitted_by))}</div>
        </div>
        ${waitingIds.has(s.id) ? `<span class="statustag2 open" style="background:var(--warn-bg);color:var(--warn);">📤 Waiting to send</span>` : `<span class="statustag2 ${REPORT_STATUS_CLASS[s.status]||'closed'}">${REPORT_STATUS_LABEL[s.status]||s.status}</span>`}
      </div>
    `).join('') || `<div class="empty">No inspections started yet${reportsFilterTemplate?' for this template.':'.'}</div>`}
  `, general ? {title:'Reports & Inspections', subtitle:'Not linked to a project', back:generalReportsBackHash, tabs:false} : {title:'Reports', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/snagging`, siteId, activeTab:'more'}); }
}
let generalReportsBackHash = '#/sites';
window.renameGeneralReport = async function(id, current){
  const v = await customPrompt('Job name / address for this survey:', current||'');
  if(v===null) return;
  const row = await dbUpdate('report_submissions', id, {general_label: (v||'').trim() || null});
  if(row){ toast('Saved'); render(); } else toast('Could not save — try again.');
};
window.startReport = async function(siteId, templateId){
  let rows = await dbSelect('report_templates', 'id=eq.'+templateId+'&limit=1');
  // No signal: fall back to the template list this phone has already seen.
  if(!rows[0]){ const all = await dbSelect('report_templates', 'org_id=eq.'+ME.org_id+'&archived=eq.false&order=name.asc'); rows = (all||[]).filter(x=>x.id===templateId); }
  const t = rows[0];
  if(!t){ toast('Template not found'); return; }
  const answers = {};
  const general = isGeneralReports(siteId);
  let generalLabel = null;
  if(general){
    const v = await customPrompt('Job name / address for this survey (so you can find it later):', '');
    if(v===null) return;
    generalLabel = (v||'').trim() || null;
  }
  // No project to read an address from, so the site-address question is
  // pre-filled with what was just typed instead.
  const site = general ? {address: generalLabel||'', postcode:''} : SITES.find(s=>s.id===siteId);
  (t.sections||[]).forEach(s=>(s.items||[]).forEach(it=>{
    if(!it.autofill) return;
    const v = autofillValue(it.autofill, site);
    if(v!==undefined) answers[it.id] = v;
  }));
  const payload = {
    template_id: t.id, org_id: ME.org_id, site_id: general ? null : siteId,
    template_name: t.name, sections: t.sections, answers,
    submitted_by: ME.id, status:'in_progress',
  };
  if(general) payload.general_label = generalLabel;
  if(navigator.onLine === false){
    if(await reportOfflineStart(siteId, t, answers, generalLabel)) return;
    toast('No signal, and this phone cannot keep reports offline.'); return;
  }
  const inserted = await dbInsert('report_submissions', payload);
  if(inserted && inserted[0]){
    reportFillDraft = null;
    reportPickerOpen = false;
    toast('Inspection started');
    go(`${reportListPath(siteId)}/fill/${inserted[0].id}`);
  }
};
window.setReportsFilter = function(name){ reportsFilterTemplate = name; render(); };
window.toggleReportSelect = function(id){
  if(selectedReportIds.has(id)) selectedReportIds.delete(id); else selectedReportIds.add(id);
  render();
};
window.exportSelectedReports = async function(siteId){
  if(!selectedReportIds.size) return;
  if(!(await loadLib('PDFLib'))){ toast('PDF library failed to load — check connection.'); return; }
  bulkExportBusy = true; render();
  toast('Building PDF…');
  try{
    const ids = Array.from(selectedReportIds);
    const merged = await PDFLib.PDFDocument.create();
    let any = false;
    let totalPhotoFailures = 0;
    for(const id of ids){
      const built = await buildReportPdf(id);
      if(!built) continue;
      totalPhotoFailures += built.photoEmbedFailures||0;
      const src = await PDFLib.PDFDocument.load(built.bytes);
      const pages = await merged.copyPages(src, src.getPageIndices());
      pages.forEach(p=>merged.addPage(p));
      any = true;
    }
    if(!any){ toast('Could not build any of the selected reports.'); bulkExportBusy=false; render(); return; }
    const site = SITES.find(s=>s.id===siteId);
    const filename = exportFilename(site?site.name:'', `Reports (${ids.length})`, 'pdf');
    merged.setTitle(filename.replace(/\.pdf$/i,''));
    const outBytes = await merged.save();
    if(totalPhotoFailures>0) toast(`${totalPhotoFailures} photo${totalPhotoFailures>1?'s':''} across these reports could not be included — check your connection and re-export if needed.`);
    await deliverPdf(outBytes, filename);
    selectedReportIds = new Set();
  }catch(e){ console.error(e); toast('Could not build the combined PDF.'); }
  bulkExportBusy = false; render();
};
window.emailSelectedReports = async function(){
  if(!selectedReportIds.size) return;
  bulkEmailBusy = true; render();
  toast('Building PDFs…');
  // Each PDF is uploaded to Storage and emailed as a link (same pattern as
  // the single-report "Email" action), rather than posting every report's
  // full PDF as base64 in one request body — that's what "server not
  // found" turned out to be for photo-heavy reports on the single-report
  // path, and posting SEVERAL of them at once in one request is the same
  // problem, worse. Sent one at a time so one bad/huge report doesn't sink
  // the rest.
  const ids = Array.from(selectedReportIds);
  let sent = 0, failed = 0, totalPhotoFailures = 0;
  for(const id of ids){
    try{
      const built = await buildReportPdf(id);
      if(!built || !built.bytes || !built.bytes.length){ failed++; continue; }
      totalPhotoFailures += built.photoEmbedFailures||0;
      const path = (built.sub.site_id||'general')+'/report-exports/'+crypto.randomUUID()+'-'+built.filename.replace(/[^a-z0-9.\-]+/gi,'_');
      const stored = await uploadToStorage('mc-documents', path, new Blob([built.bytes], {type:'application/pdf'}), 'application/pdf');
      if(!stored){ failed++; continue; }
      const res = await sbFetch('/functions/v1/send-document-email', {method:'POST', timeoutMs:90000, body: JSON.stringify({
        site_id: built.sub.site_id, general_label: built.sub.site_id ? undefined : (built.sub.general_label||'General survey'), recipient_email: ME.email, doc_title: built.sub.template_name, file_url: publicUrl('mc-documents', stored),
      })});
      if(res && res.ok) sent++; else failed++;
    }catch(e){ failed++; }
  }
  if(sent) toast(`${sent} report(s) emailed to ${ME.email}${failed?`, ${failed} failed`:''}${totalPhotoFailures>0?` (${totalPhotoFailures} photo(s) could not be included)`:''}`);
  else toast('Could not email the selected reports — check your connection and try again.');
  if(sent) selectedReportIds = new Set();
  bulkEmailBusy = false; render();
};
window.deleteSelectedReports = async function(siteId){
  if(!selectedReportIds.size) return;
  const n = selectedReportIds.size;
  if(!await customConfirm(`Delete ${n} report${n>1?'s':''}? This can't be undone.`)) return;
  bulkDeleteBusy = true; render();
  try{
    const ids = Array.from(selectedReportIds);
    let okCount = 0;
    for(const id of ids){
      const ok = await dbDelete('report_submissions', id);
      if(ok) okCount++;
    }
    selectedReportIds = new Set();
    toast(okCount ? `${okCount} report${okCount>1?'s':''} deleted` : 'Delete failed');
    if(okCount && !isGeneralReports(siteId)) logSiteActivity(siteId, 'briefing_reports_deleted', `Deleted ${okCount} daily briefing submission${okCount>1?'s':''}`);
  }catch(e){ toast('Delete failed.'); }
  bulkDeleteBusy = false; render();
};
async function renderReportFill(siteId, submissionId, fromBriefing){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  const listPath = reportListPath(siteId, fromBriefing);
  // A copy kept on this phone (unsent changes, or a report started or
  // parked with no signal) always wins over what the server has.
  if(!reportFillDraft || reportFillDraft.submissionId !== submissionId){
    const local = await reportOfflineGet(submissionId);
    if(local && local.draft){ reportFillDraft = local.draft; reportFillDraft.siteId = siteId; reportOfflineLastSig = reportDraftSignature(reportFillDraft); }
  }
  if(!reportFillDraft || reportFillDraft.submissionId !== submissionId){
    const rows = await dbSelect('report_submissions', 'id=eq.'+submissionId+'&limit=1');
    const sub = rows[0];
    if(!sub){ toast(navigator.onLine === false ? 'No signal — open this one once with signal first.' : 'Inspection not found'); go(listPath); return; }
    if(sub.status==='completed'){
      // A completed Daily Briefing stays editable by a PM/admin right up
      // until the first operative signature — after that it's locked (same
      // "locked after first signature" rule as TBT). A completed
      // Inspection/Report has no signature mechanism, so it stays editable
      // by a PM/admin/site manager at any time — e.g. to correct a report
      // that was submitted without its photos. Anything else (an operative
      // viewing a completed report, or a signed briefing) bounces to the
      // read-only view as before.
      let editable = false;
      if(isManager(ME)){
        if(fromBriefing){
          const sigs = await dbSelect('daily_briefing_signatures', 'submission_id=eq.'+submissionId+'&select=id&limit=1');
          editable = !sigs.length;
        } else {
          editable = true;
        }
      }
      if(!editable){ go(`${listPath}/view/${submissionId}`); return; }
    }
    reportFillDraft = {submissionId, siteId, template_name: sub.template_name, sections: sub.sections, answers: Object.assign({}, sub.answers||{}), fromBriefing:!!fromBriefing, editingCompleted: sub.status==='completed', plantItemId: sub.plant_item_id||null, generalLabel: sub.general_label||null};
  }
  // Operatives-on-site items auto-populate from the site's assigned
  // operatives the first time this draft is opened — done here (not in the
  // synchronous render) since it needs a roster fetch.
  const operativeItems = (reportFillDraft.sections||[]).flatMap(s=>(s.items||[])).filter(it=>it.type==='operatives');
  for(const it of operativeItems){ await ensureReportOperativesDefault(it.id, siteId); }
  const sc = scoreSections(reportFillDraft.sections, reportFillDraft.answers);
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <p class="sectiontitle" style="margin-top:0;">${escapeHtml(reportFillDraft.template_name)}</p>
    ${trafficKeyHtml(reportFillDraft.sections)}
    ${sc.overall.possible>0 ? `<p class="stub" style="text-align:right;font-weight:800;color:var(--ink);">Score: ${scoreLabel(sc.overall)}</p>` : ''}
    ${(reportFillDraft.sections||[]).map(s=>`
      <div class="card">
        <p class="sectiontitle" style="margin-top:0;display:flex;justify-content:space-between;align-items:center;">
          <span>${escapeHtml(s.title)}</span>
          ${sc.bySection[s.id] ? `<span style="font-weight:700;font-size:12px;color:var(--slate);">${scoreLabel(sc.bySection[s.id])}</span>` : ''}
        </p>
        ${(s.items||[]).filter(it=>itemVisible(it, reportFillDraft.answers)).map(it=>`<div data-rid="${it.id}">` + renderReportFillItem(it) + `</div>` + (it.addedOnSite ? `<div style="text-align:right;margin:-4px 0 8px;"><span class="viewlink" style="cursor:pointer;font-size:12px;color:var(--slate);" onclick="removeReportExtraItem('${s.id}','${it.id}')">✕ Remove ${escapeHtml(it.label)}</span></div>` : '')).join('')}
        ${reportCanAddItem(s) ? `<button class="ghostbtn" style="width:100%;margin-top:6px;" onclick="addReportExtraItem('${s.id}')">+ Add another item</button>` : ''}
      </div>
    `).join('')}
    <div class="row-gap">
      <button class="ghostbtn" style="flex:1;" ${reportSaveBusy||reportSubmitBusy?'disabled':''} onclick="saveReportProgress('${siteId}')">${reportSaveBusy?'Saving…':'Save & Exit'}</button>
      <button class="darkbtn" style="flex:1;" ${reportSubmitBusy||reportSaveBusy?'disabled':''} onclick="submitReport('${siteId}')">${reportSubmitBusy?'Completing…':fromBriefing?'Complete Briefing':'Complete Inspection'}</button>
    </div>
    <p class="stub" id="reportProgressNote" style="text-align:center;margin:10px 0 0;font-weight:700;color:var(--ink);display:none;"></p>
  `, reportShellOpts(siteId, site, fromBriefing?'Daily Briefing':'Inspection', listPath, reportFillDraft.generalLabel)); }
}
// ---- Add more items while filling in ----------------------------------
// A section can need more entries than the template has (a roof condition
// report with 3 areas on one job and 40 on the next). "+ Add another item"
// copies the section's last question (same type, options and photo setting)
// with the next number, e.g. "Item 10" -> "Item 11". The extra questions live
// on this report only (its own copy of the sections), not on the template.
function reportHasExtraItems(d){
  d = d || reportFillDraft;
  return !!(d && (d.sections||[]).some(s=>(s.items||[]).some(it=>it.addedOnSite)));
}
function reportCanAddItem(s){
  const items = (s && s.items) || [];
  const last = items[items.length-1];
  if(!last) return false;
  return ['text','textarea','choice','multichoice','passfail','checkbox','number','photo','date'].indexOf(last.type || 'text') >= 0;
}
function reportNextItemLabel(items, last){
  const m = /^(.*?)(\d+)\s*$/.exec(String(last.label||''));
  if(m){
    const base = m[1];
    let n = parseInt(m[2],10);
    items.forEach(it=>{ const mm = /^(.*?)(\d+)\s*$/.exec(String(it.label||'')); if(mm && mm[1]===base) n = Math.max(n, parseInt(mm[2],10)); });
    return base + (n+1);
  }
  const same = items.filter(it=>String(it.label||'').replace(/ \(\d+\)$/,'') === String(last.label||'').replace(/ \(\d+\)$/,'')).length;
  return String(last.label||'Item').replace(/ \(\d+\)$/,'') + ' (' + (same+1) + ')';
}
window.addReportExtraItem = function(sectionId){
  if(!reportFillDraft) return;
  const s = (reportFillDraft.sections||[]).find(x=>x.id===sectionId); if(!s) return;
  const items = s.items || (s.items = []);
  const last = items[items.length-1]; if(!last) return;
  const copy = JSON.parse(JSON.stringify(last));
  copy.id = 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2,9);
  copy.label = reportNextItemLabel(items, last);
  copy.required = false;
  copy.showIf = null;
  copy.addedOnSite = true;
  delete copy.autofill;
  items.push(copy);
  render().then(()=>{ setTimeout(()=>{ const el = document.querySelector('[data-rid="'+copy.id+'"]') ; if(el && el.scrollIntoView) el.scrollIntoView({block:'center', behavior:'smooth'}); }, 50); });
};
window.removeReportExtraItem = async function(sectionId, itemId){
  if(!reportFillDraft) return;
  const s = (reportFillDraft.sections||[]).find(x=>x.id===sectionId); if(!s) return;
  const it = (s.items||[]).find(x=>x.id===itemId); if(!it || !it.addedOnSite) return;
  const a = reportFillDraft.answers[itemId];
  const hasAnswer = a!==undefined && a!==null && a!=='' && !(Array.isArray(a) && !a.length);
  const media = reportFillDraft.answers[itemId+'__media'];
  if((hasAnswer || (Array.isArray(media) && media.length)) && !(await customConfirm('Remove "'+it.label+'" and what you have entered for it?'))) return;
  s.items = s.items.filter(x=>x.id!==itemId);
  // Close the gap in the numbering of the items added on this report.
  const num = /^(.*?)(\d+)\s*$/;
  const m0 = num.exec(String(it.label||''));
  if(m0){
    const base = m0[1];
    let n = 0;
    s.items.forEach(x=>{ const mm = num.exec(String(x.label||'')); if(!x.addedOnSite && mm && mm[1]===base) n = Math.max(n, parseInt(mm[2],10)); });
    s.items.forEach(x=>{ const mm = num.exec(String(x.label||'')); if(x.addedOnSite && mm && mm[1]===base) x.label = base + (++n); });
  }
  Object.keys(reportFillDraft.answers).forEach(k=>{ if(k===itemId || k.indexOf(itemId+'_')===0 || k.indexOf(itemId+'__')===0) delete reportFillDraft.answers[k]; });
  render();
};
// ---- Report photos: upload in small batches, keep what's done ----------
// A report with a lot of photos (a pre-start with 40, say) used to fail both
// ways out: "Save & Exit" tried to send every photo inside one request, far
// too big to get through in the time allowed; and "Complete" started all 40
// uploads at the same moment, so a few always failed, and every retry began
// again from photo 1. Now photos go up three at a time, each one is swapped
// for its saved link the moment it lands (so a retry only sends what is
// left), and the answers are saved to the server as soon as there is
// anything worth keeping.
function reportPendingPhotoRefs(){
  const answers = (reportFillDraft && reportFillDraft.answers) || {};
  const refs = [];
  Object.keys(answers).forEach(k=>{
    const v = answers[k];
    if(Array.isArray(v)) v.forEach((val,idx)=>{ if(typeof val==='string' && val.startsWith('data:')) refs.push({k, idx, val}); });
  });
  return refs;
}
function setReportProgressNote(text){
  const el = document.getElementById('reportProgressNote');
  if(el){ el.textContent = text || ''; el.style.display = text ? '' : 'none'; }
}
async function uploadReportDraftPhotos(siteId, quiet){
  const refs = reportPendingPhotoRefs();
  const total = refs.length;
  if(!total) return {total:0, failed:0};
  let next = 0, done = 0, failed = 0;
  const note = quiet ? ()=>{} : setReportProgressNote;
  note(`Uploading photos… 0 of ${total}. Keep this page open.`);
  const worker = async ()=>{
    while(next < refs.length){
      const r = refs[next++];
      let path = null;
      try{ path = await uploadDataUrl('site-photos', (isGeneralReports(siteId)?'general':siteId)+'/reports/'+crypto.randomUUID()+'.jpg', r.val); }catch(e){ path = null; }
      const arr = reportFillDraft && reportFillDraft.answers[r.k];
      if(path && Array.isArray(arr)){
        // Written back by value, in case a photo was removed while uploading.
        const at = arr[r.idx]===r.val ? r.idx : arr.indexOf(r.val);
        if(at > -1) arr[at] = publicUrl('site-photos', path);
      } else if(!path) failed++;
      done++;
      note(`Uploading photos… ${done} of ${total}${failed ? ' ('+failed+' failed so far)' : ''}. Keep this page open.`);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return {total, failed};
}
// Saves the answers as they stand. Any photo that still hasn't uploaded is
// left out of what's sent (it stays on this screen to try again) so the
// request is always small enough to get through.
async function saveReportAnswersToServer(extra){
  if(!reportFillDraft || !reportFillDraft.submissionId) return false;
  const out = {};
  Object.keys(reportFillDraft.answers).forEach(k=>{
    const v = reportFillDraft.answers[k];
    out[k] = Array.isArray(v) ? v.filter(val=>!(typeof val==='string' && val.startsWith('data:'))) : v;
  });
  try{
    const res = await sbFetch('/rest/v1/report_submissions?id=eq.'+reportFillDraft.submissionId, {method:'PATCH', timeoutMs:60000, headers:{'Prefer':'return=representation'}, body: JSON.stringify(Object.assign({answers: out}, reportHasExtraItems() ? {sections: reportFillDraft.sections} : {}, extra||{}))});
    if(!res.ok){ console.error(await safeErr(res)); return false; }
    const d = await res.json().catch(()=>[]);
    return Array.isArray(d) ? d.length>0 : !!d;
  }catch(e){ console.error(e); return false; }
}
// Quiet safety net while a report is being filled in: each time photos are
// added they start uploading in the background and the answers are saved,
// so closing the page or losing signal part-way through a long inspection
// no longer loses the photos already taken. Never shows an error and never
// re-draws the form (which would interrupt typing).
let reportAutoSaveRunning = false, reportAutoSaveAgain = false;
async function reportBackgroundSave(){
  if(!reportFillDraft || reportFillDraft.editingCompleted || reportSubmitBusy || reportSaveBusy || navigator.onLine === false) return;
  if(reportAutoSaveRunning){ reportAutoSaveAgain = true; return; }
  reportAutoSaveRunning = true;
  const draftId = reportFillDraft.submissionId;
  try{
    do{
      reportAutoSaveAgain = false;
      if(!reportFillDraft || reportFillDraft.submissionId !== draftId || reportSubmitBusy || reportSaveBusy) break;
      await uploadReportDraftPhotos(reportFillDraft.siteId, true);
      if(!reportFillDraft || reportFillDraft.submissionId !== draftId || reportSubmitBusy || reportSaveBusy) break;
      const okSaved = await saveReportAnswersToServer();
      if(okSaved && reportFillDraft && reportFillDraft.submissionId === draftId && !reportPendingPhotoRefs().length){
        const rec = await reportOfflineGet(draftId);
        if(rec && !rec.pending && !rec.create){ await reportOfflineDel(draftId); reportOfflineLastSig = reportDraftSignature(reportFillDraft); }
      }
    }while(reportAutoSaveAgain);
  }catch(e){ console.warn('report background save failed', e && e.message); }
  reportAutoSaveRunning = false;
}
window.saveReportProgress = async function(siteId){
  if(reportSaveBusy || reportSubmitBusy) return;
  // No signal (or a report that only exists on this phone so far): keep it
  // here and send it later.
  if(navigator.onLine === false || ((await reportOfflineGet(reportFillDraft.submissionId))||{}).create){ if(await reportOfflineQueue('save')) return; }
  reportSaveBusy = true; await render();
  let up = {total:0, failed:0}, saved = false;
  try{
    up = await uploadReportDraftPhotos(siteId);
    setReportProgressNote('Saving…');
    saved = await saveReportAnswersToServer();
  }catch(e){ console.error(e); }
  reportSaveBusy = false;
  if(saved && !up.failed){
    toast('Progress saved');
    const fromBriefing = reportFillDraft.fromBriefing;
    await reportOfflineClear(reportFillDraft.submissionId);
    reportFillDraft = null;
    go(reportListPath(siteId, fromBriefing));
    return;
  }
  await render();
  if(saved) customAlert(`Saved, but ${up.failed} photo${up.failed===1?'':'s'} could not be uploaded. Everything else is safe. Stay on this page and tap Save & Exit again when your signal is better — only the missing photo${up.failed===1?'':'s'} will be sent.`);
  else if(!(await reportOfflineQueue('save'))) toast('Could not save — check your connection and try again. Nothing has been lost from this screen.');
};
// One-time default for an "Operatives On Site" item: every operative
// assigned to the site, ticked (included) by default. A manager can untick
// anyone who isn't actually on site today, or use "+ Add Operative" for
// someone not in the app at all. Only runs once per submission — after
// that the list is whatever the user has edited.
async function ensureReportOperativesDefault(itemId, siteId){
  if(reportFillDraft.answers[itemId] !== undefined) return;
  // No project = no assigned team; start empty and add people by hand.
  if(isGeneralReports(siteId)){ reportFillDraft.answers[itemId] = []; return; }
  const assignedRows = await dbSelect('site_assignments', 'site_id=eq.'+siteId+'&select=user_id');
  await loadAllProfiles();
  const list = assignedRows.map(r=>PROFILES[r.user_id]).filter(p=>p && p.role==='operative')
    .sort((a,b)=>a.name.localeCompare(b.name))
    .map(p=>({id:uid(), userId:p.id, name:p.name, role:'', included:true}));
  reportFillDraft.answers[itemId] = list;
}
let reportOperativeManualDraft = {};
window.setReportOperativeIncluded = function(itemId, idx, checked){
  const list = reportFillDraft.answers[itemId] || [];
  if(list[idx]) list[idx].included = checked;
};
window.setReportOperativeRole = function(itemId, idx, value){
  const list = reportFillDraft.answers[itemId] || [];
  if(list[idx]) list[idx].role = value;
};
window.removeReportOperativeRow = function(itemId, idx){
  const list = reportFillDraft.answers[itemId] || [];
  list.splice(idx,1);
  reportFillDraft.answers[itemId] = list;
  render();
};
window.toggleReportOperativeManualAdd = function(itemId){
  const d = reportOperativeManualDraft[itemId] || {open:false, name:''};
  d.open = !d.open;
  reportOperativeManualDraft[itemId] = d;
  render();
};
window.setReportOperativeManualDraft = function(itemId, value){
  const d = reportOperativeManualDraft[itemId] || {open:true, name:''};
  d.name = value;
  reportOperativeManualDraft[itemId] = d;
};
window.commitManualReportOperative = function(itemId){
  const draft = reportOperativeManualDraft[itemId];
  const name = ((draft && draft.name) || '').trim();
  if(!name){ toast('Enter a name.'); return; }
  const list = reportFillDraft.answers[itemId] || [];
  list.push({id:uid(), userId:null, name, role:'', included:true});
  reportFillDraft.answers[itemId] = list;
  reportOperativeManualDraft[itemId] = {open:false, name:''};
  render();
};
function renderPhotoArrayWidget(key, arr, opts){
  opts = opts || {};
  const size = opts.size || 90;
  return `${arr.length ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;">${arr.map((u,idx)=>`<div style="position:relative;"><img src="${u}" onclick="viewImageEl(this)" style="width:${size}px;height:${size}px;object-fit:cover;border-radius:8px;display:block;border:1px solid var(--line);cursor:pointer;"><div class="taskicon danger" style="position:absolute;top:-6px;right:-6px;background:#fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.25);" onclick="removeReportPhoto('${key}',${idx})">✕</div></div>`).join('')}</div>` : ''}${opts.noButton ? '' : `<label class="ghostbtn" style="display:block;text-align:center;cursor:pointer;margin:0;">📷 Add photos<input type="file" accept="image/*" multiple style="display:none;" onchange="onReportPhotoChosen(this,'${key}')"></label>`}`;
}
// "+ Add note" under an answer while filling in a report. Saved beside the
// answer as <question id>__note and shown on the report and its PDF.
function renderItemTrafficWidget(it, answers){
  const secs = reportFillDraft && reportFillDraft.sections;
  if(!itemHasTraffic(secs, it)) return '';
  const cur = answers[it.id+'__tl'] || '';
  return `<div style="display:flex;flex-wrap:wrap;gap:6px;margin:-6px 0 10px;">${trafficLevels(secs).map(l=>{ const on = cur===l.id; const hex = trafficHex(l.color); return `<button type="button" title="${escapeHtml(l.label||'')}" onclick="reportFillDraft.answers['${it.id}__tl']=${on?"''":`'${l.id}'`};render()" style="display:flex;align-items:center;gap:6px;margin:0;width:auto;padding:6px 10px;border-radius:999px;font-size:11.5px;font-weight:700;cursor:pointer;border:2px solid ${hex};background:${on?hex:'transparent'};color:${on?'#fff':'var(--ink)'};"><span style="width:10px;height:10px;border-radius:50%;background:${on?'#fff':hex};flex:0 0 10px;"></span>${escapeHtml(l.label||'')}</button>`; }).join('')}</div>`;
}
let reportNoteOpen = new Set();
window.openReportNote = function(id){ reportNoteOpen.add(id); render().then(()=>{ const el = document.getElementById('rnote_'+id); if(el) el.focus(); }); };
function renderItemNoteWidget(it, answers){
  if(!itemAllowsNote(it)) return '';
  const key = it.id+'__note';
  const v = answers[key] || '';
  if(!v && !reportNoteOpen.has(it.id)) return `<p style="margin:-8px 0 10px;"><span class="viewlink" style="cursor:pointer;font-size:12px;" onclick="openReportNote('${it.id}')">+ Add note</span></p>`;
  return `<div class="formfield" style="margin-top:-6px;"><label class="field-label" style="font-size:11px;color:var(--slate);">Note</label><textarea id="rnote_${it.id}" style="min-height:54px;" placeholder="Add a note…" oninput="reportFillDraft.answers['${key}']=this.value">${escapeHtml(v)}</textarea></div>`;
}
// A drop-down's answers = the template's list plus any typed in on this
// report (kept beside the answers as <question id>__opts, so they only
// affect this one report — the template itself is unchanged).
function reportItemOptions(it, answers){
  const extra = answers && Array.isArray(answers[it.id+'__opts']) ? answers[it.id+'__opts'] : [];
  const out = (it.options||[]).slice();
  extra.forEach(o=>{ if(!out.includes(o)) out.push(o); });
  return out;
}
window.addReportAnswerOption = async function(id, multi){
  const v = await customPrompt('Type the answer to add:', '');
  const t = (v||'').trim();
  if(!reportFillDraft){ return; }
  if(!t){ render(); return; }
  const a = reportFillDraft.answers;
  if(!Array.isArray(a[id+'__opts'])) a[id+'__opts'] = [];
  if(!a[id+'__opts'].includes(t)) a[id+'__opts'].push(t);
  if(multi){ if(!Array.isArray(a[id])) a[id] = []; if(!a[id].includes(t)) a[id].push(t); }
  else a[id] = t;
  render();
};
// Under each answer: any photos already added, then two clear buttons —
// "Add note" and "Add photo" — and the note box once it's been opened.
function renderItemExtras(it, answers){
  const canNote = itemAllowsNote(it), canMedia = itemAllowsMedia(it);
  if(!canNote && !canMedia) return '';
  const nKey = it.id+'__note', mKey = it.id+'__media';
  const note = answers[nKey] || '';
  const noteOpen = canNote && (!!note || reportNoteOpen.has(it.id));
  const arr = canMedia && Array.isArray(answers[mKey]) ? answers[mKey] : [];
  const isReq = canMedia && mediaRequiredFor(it, answers);
  const btn = 'flex:1;display:block;text-align:center;cursor:pointer;margin:0;padding:10px 6px;';
  return `<div style="margin:-4px 0 14px;">
    ${noteOpen ? `<div class="formfield" style="margin:0 0 8px;"><label class="field-label" style="font-size:11px;color:var(--slate);">Note</label><textarea id="rnote_${it.id}" style="min-height:54px;" placeholder="Add a note…" oninput="reportFillDraft.answers['${nKey}']=this.value">${escapeHtml(note)}</textarea></div>` : ''}
    ${arr.length ? renderPhotoArrayWidget(mKey, arr, {size:70, noButton:true}) : ''}
    ${isReq ? `<p class="stub" style="margin:0 0 6px;color:var(--warn);font-weight:700;">A photo is required for this answer *</p>` : ''}
    <div class="row-gap" style="margin:0;">
      ${canNote && !noteOpen ? `<button type="button" class="ghostbtn" style="${btn}" onclick="openReportNote('${it.id}')">📝 Add note</button>` : ''}
      ${canMedia ? `<label class="ghostbtn" style="${btn}${isReq && !arr.length ? 'border-color:var(--warn);color:var(--warn);' : ''}">📷 Add photo<input type="file" accept="image/*" multiple style="display:none;" onchange="onReportPhotoChosen(this,'${mKey}')"></label>` : ''}
    </div>
  </div>`;
}
function renderExtraMediaWidget(it, answers){
  if(!itemAllowsMedia(it)) return '';
  const key = it.id+'__media';
  const arr = Array.isArray(answers[key]) ? answers[key] : [];
  const isReq = mediaRequiredFor(it, answers);
  return `<div class="formfield" style="margin-top:-6px;">
    <label class="field-label" style="font-size:11px;color:${isReq?'var(--warn)':'var(--slate)'};">${isReq?'Photo required for this answer *':'Attach a photo (optional)'}</label>
    ${renderPhotoArrayWidget(key, arr, {size:70})}
  </div>`;
}
function renderReportFillItem(it){
  const val = reportFillDraft.answers[it.id];
  const reqStar = it.required ? ' *' : '';
  if(it.type==='instruction') return `<p class="stub" style="font-weight:800;color:var(--ink);">${escapeHtml(it.label)}</p>`;
  const autoHint = it.autofill ? ` <span style="font-weight:400;color:var(--slate);font-size:11px;">(auto-filled — edit if needed)</span>` : '';
  const extraMedia = renderItemTrafficWidget(it, reportFillDraft.answers) + renderItemExtras(it, reportFillDraft.answers);
  if(it.type==='text') return `<div class="formfield"><label class="field-label">${escapeHtml(it.label)}${reqStar}${autoHint}</label><input type="text" value="${escapeHtml(val||'')}" oninput="reportFillDraft.answers['${it.id}']=this.value"></div>${extraMedia}`;
  if(it.type==='textarea') return `<div class="formfield"><label class="field-label">${escapeHtml(it.label)}${reqStar}</label><textarea oninput="reportFillDraft.answers['${it.id}']=this.value">${escapeHtml(val||'')}</textarea></div>${extraMedia}`;
  if(it.type==='number') return `<div class="formfield"><label class="field-label">${escapeHtml(it.label)}${reqStar}</label><input type="number" value="${val!=null?val:''}" oninput="reportFillDraft.answers['${it.id}']=this.value"></div>${extraMedia}`;
  if(it.type==='date') return `<div class="formfield" onclick="openDatePickerRow(this)"><label class="field-label">${escapeHtml(it.label)}${reqStar}${autoHint}</label><input type="date" value="${val||''}" oninput="reportFillDraft.answers['${it.id}']=this.value"></div>${extraMedia}`;
  if(it.type==='checkbox') return `<div class="formfield"><label class="field-label">${escapeHtml(it.label)}${reqStar}</label><div class="row-gap">${[{v:true,l:'Yes'},{v:false,l:'No'}].map(o=>`<button type="button" class="${val===o.v?'darkbtn':'ghostbtn'}" style="flex:1;" onclick="reportFillDraft.answers['${it.id}']=${o.v};render()">${o.l}</button>`).join('')}</div></div>${extraMedia}`;
  if(it.type==='passfail') return `<div class="formfield"><label class="field-label">${escapeHtml(it.label)}${reqStar}</label><div class="row-gap">${['Pass','Fail','N/A'].map(o=>`<button type="button" class="${val===o?'darkbtn':'ghostbtn'}" style="flex:1;" onclick="reportFillDraft.answers['${it.id}']='${o}';render()">${pfLbl(it,o)}</button>`).join('')}</div></div>${extraMedia}`;
  if(it.type==='choice'){
    const opts = reportItemOptions(it, reportFillDraft.answers);
    if(val && !opts.includes(val)) opts.push(val);
    if(it.asButtons) return `<div class="formfield"><label class="field-label">${escapeHtml(it.label)}${reqStar}</label><div style="display:flex;flex-wrap:wrap;gap:6px;">${opts.map(o=>`<button type="button" class="${val===o?'darkbtn':'ghostbtn'}" style="margin:0;width:auto;flex:${o.length>5?'1.9':'1'} 1 0;min-width:0;padding:10px 2px;font-size:11.5px;letter-spacing:0;white-space:nowrap;" onclick="reportFillDraft.answers['${it.id}']=${val===o?"''":`'${jsAttr(o)}'`};render()">${escapeHtml(o)}</button>`).join('')}</div></div>${extraMedia}`;
    return `<div class="formfield"><label class="field-label">${escapeHtml(it.label)}${reqStar}</label><select onchange="if(this.value==='__add__'){addReportAnswerOption('${it.id}',false)}else{reportFillDraft.answers['${it.id}']=this.value;render()}"><option value="">Select…</option>${opts.map(o=>`<option value="${escapeHtml(o)}" ${val===o?'selected':''}>${escapeHtml(o)}</option>`).join('')}<option value="__add__">+ Add another answer…</option></select></div>${extraMedia}`;
  }
  if(it.type==='multichoice'){
    const arr = Array.isArray(val) ? val : [];
    const opts = reportItemOptions(it, reportFillDraft.answers);
    arr.forEach(v=>{ if(!opts.includes(v)) opts.push(v); });
    return `<div class="formfield"><label class="field-label">${escapeHtml(it.label)}${reqStar}</label><div class="row-gap" style="flex-wrap:wrap;">${opts.map(o=>`<label class="stub" style="display:flex;align-items:center;gap:5px;border:1px solid var(--line);border-radius:8px;padding:7px 10px;"><input type="checkbox" style="width:auto;" ${arr.includes(o)?'checked':''} onchange="toggleReportMultichoice('${it.id}','${jsAttr(o)}',this.checked)">${escapeHtml(o)}</label>`).join('')}<span class="viewlink" style="cursor:pointer;align-self:center;font-size:12px;" onclick="addReportAnswerOption('${it.id}',true)">+ Add answer</span></div></div>${extraMedia}`;
  }
  if(it.type==='photo'){
    const arr = Array.isArray(val) ? val : (val ? [val] : []);
    return `<div class="formfield"><label class="field-label">${escapeHtml(it.label)}${reqStar}</label>${renderPhotoArrayWidget(it.id, arr)}</div>`;
  }
  if(it.type==='operatives'){
    const list = Array.isArray(val) ? val : [];
    const draft = reportOperativeManualDraft[it.id] || {open:false, name:''};
    return `<div class="formfield">
      <label class="field-label">${escapeHtml(it.label)}${reqStar}</label>
      ${list.length ? list.map((row,idx)=>`
        <div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--line);">
          <input type="checkbox" style="width:auto;flex:0 0 auto;" ${row.included?'checked':''} onchange="setReportOperativeIncluded('${it.id}',${idx},this.checked)">
          <span style="flex:1 1 40%;min-width:0;font-weight:700;font-size:12.5px;overflow-wrap:anywhere;">${escapeHtml(row.name)}</span>
          <input type="text" placeholder="Role on site" value="${escapeHtml(row.role||'')}" style="flex:1 1 40%;min-width:0;padding:6px 8px;font-size:12px;" oninput="setReportOperativeRole('${it.id}',${idx},this.value)">
          ${row.userId ? '' : `<span class="taskicon danger" style="width:20px;height:20px;font-size:10px;flex:0 0 auto;" onclick="removeReportOperativeRow('${it.id}',${idx})">✕</span>`}
        </div>
      `).join('') : `<p class="stub">No operatives assigned to this site yet.</p>`}
      ${draft.open ? `
        <div style="display:flex;gap:6px;margin-top:8px;">
          <input type="text" placeholder="Name" style="flex:1;" value="${escapeHtml(draft.name)}" oninput="setReportOperativeManualDraft('${it.id}',this.value)">
          <button type="button" class="darkbtn" style="flex:0 0 auto;width:auto;padding:8px 12px;" onclick="commitManualReportOperative('${it.id}')">Add</button>
        </div>
      ` : `<button type="button" class="ghostbtn" style="margin-top:8px;padding:8px 6px;font-size:12px;" onclick="toggleReportOperativeManualAdd('${it.id}')">+ Add Operative</button>`}
    </div>`;
  }
  if(it.type==='signature'){
    if(!ME.signature_path) return `<div class="formfield"><label class="field-label">${escapeHtml(it.label)}${reqStar}</label><p class="stub" style="color:var(--warn);">You haven't adopted a signature yet — <span style="text-decoration:underline;cursor:pointer;" onclick="go('#/signature')">set one up</span> before submitting.</p></div>`;
    const signed = !!val;
    return `<div class="formfield"><label class="field-label">${escapeHtml(it.label)}${reqStar}</label>
      <div class="siglinebox ${signed?'signed':''}" onclick="${signed?'':`reportFillDraft.answers['${it.id}']='${jsAttr(ME.signature_path)}';render();`}" style="${signed?'':'cursor:pointer;'}">
        <img src="${publicUrl('signatures', ME.signature_path)}" style="height:34px;max-width:140px;object-fit:contain;">
        <span>${signed?'Signed — tap to attach on submit':'Tap to sign'}</span>
      </div>
    </div>`;
  }
  return '';
}
window.toggleReportMultichoice = function(itemId, value, checked){
  const cur = new Set(reportFillDraft.answers[itemId]||[]);
  if(checked) cur.add(value); else cur.delete(value);
  reportFillDraft.answers[itemId] = Array.from(cur);
  render();
};
window.onReportPhotoChosen = async function(input, key){
  const files = input.files ? Array.from(input.files) : []; if(!files.length) return;
  // Process each photo independently: one bad/unsupported file (e.g. a HEIC
  // capture compressImage can't decode) must not silently discard the whole
  // batch, including photos that already compressed fine — that was quietly
  // dropping entire report submissions' worth of photos before they ever
  // reached reportFillDraft.answers, let alone the database.
  const cur = Array.isArray(reportFillDraft.answers[key]) ? reportFillDraft.answers[key].slice() : (reportFillDraft.answers[key] ? [reportFillDraft.answers[key]] : []);
  let failed = 0, heicFailed = 0;
  for(const file of files){
    try{ cur.push(await compressImage(file, {maxW:2000, quality:0.9})); }
    catch(e){
      failed++;
      if(e && e.message==='heic-unsupported') heicFailed++;
      console.error('compressImage failed for', file && file.name, file && file.type, e);
    }
  }
  reportFillDraft.answers[key] = cur;
  render();
  reportBackgroundSave(); // start uploading/saving straight away, in the background
  // #(compress-image-heic-detection) 2026-10-01 — see compressImage itself.
  // Give the actual reason when every failure was a HEIC file rather than
  // the old generic message, which looked identical whether the file was
  // genuinely corrupt or just a format the browser can't open at all.
  if(heicFailed && heicFailed===failed){
    toast(failed===1 ? "That photo is in iPhone's HEIC format, which this browser can't open — pick it from your Photos library as JPEG, or in iPhone Settings > Camera > Formats choose \"Most Compatible\" so new photos save as JPEG." : (failed+" photos are in iPhone's HEIC format, which this browser can't open — the rest were added. In iPhone Settings > Camera > Formats choose \"Most Compatible\" so new photos save as JPEG."));
  } else if(failed){
    toast(failed===files.length ? 'Could not process that photo.' : (failed+' photo'+(failed===1?'':'s')+' could not be processed — the rest were added.'));
  }
};
window.removeReportPhoto = function(key, idx){
  const cur = Array.isArray(reportFillDraft.answers[key]) ? reportFillDraft.answers[key].slice() : [];
  cur.splice(idx,1);
  reportFillDraft.answers[key] = cur;
  render();
};
window.submitReport = async function(siteId){
  const sections = reportFillDraft.sections;
  for(const s of (sections||[])){
    for(const it of (s.items||[])){
      if(it.type==='instruction') continue;
      if(!itemVisible(it, reportFillDraft.answers)) continue;
      if(it.required){
        const v = reportFillDraft.answers[it.id];
        if(it.type==='photo' || it.type==='multichoice'){
          if(!Array.isArray(v) || !v.length){ toast(`"${it.label}" is required.`); return; }
        } else if(it.type==='operatives'){
          if(!Array.isArray(v) || !v.some(r=>r.included)){ toast(`"${it.label}" needs at least one operative on site.`); return; }
        } else if(it.type==='signature'){
          if(!ME.signature_path){ toast('Adopt your signature before submitting.'); return; }
          if(!v){ toast(`Tap to sign "${it.label}" before submitting.`); return; }
        } else if(v===undefined || v===null || v===''){ toast(`"${it.label}" is required.`); return; }
      }
      if(mediaRequiredFor(it, reportFillDraft.answers)){
        const media = reportFillDraft.answers[it.id+'__media'];
        if(!Array.isArray(media) || !media.length){ toast(`A photo is required for "${it.label}" based on your answer.`); return; }
      }
    }
  }
  if(reportSubmitBusy || reportSaveBusy) return;
  // No signal (or a report that only exists on this phone so far): it is
  // complete as far as the person is concerned — park it and send it later.
  if(navigator.onLine === false || ((await reportOfflineGet(reportFillDraft.submissionId))||{}).create){ if(await reportOfflineQueue('complete')) return; }
  reportSubmitBusy = true; await render();
  const isPmEdit = !!reportFillDraft.editingCompleted;
  // Photos first: three at a time, each kept as soon as it lands (see
  // uploadReportDraftPhotos). If any fail, what did upload — and every
  // answer — is saved to the server before stopping, so nothing has to be
  // redone and a second tap only sends the photos that are still missing.
  let up = {total:0, failed:0};
  try{ up = await uploadReportDraftPhotos(siteId); }
  catch(e){ console.error(e); up = {total:1, failed:1}; }
  if(up.failed>0){
    setReportProgressNote('Saving what has uploaded…');
    const kept = await saveReportAnswersToServer();
    reportSubmitBusy = false;
    await render();
    customAlert(`${up.failed} of ${up.total} photo${up.total===1?'':'s'} could not be uploaded, so the inspection isn't completed yet. ${kept ? 'The other '+(up.total-up.failed)+' and all your answers are saved.' : 'Nothing has been lost from this screen.'} Stay on this page and tap Complete again when your signal is better — only the missing photo${up.failed===1?'':'s'} will be sent.`);
    return;
  }
  setReportProgressNote('Completing…');
  const sections2 = sections;
  const answers = Object.assign({}, reportFillDraft.answers);
  (sections2||[]).forEach(s=>(s.items||[]).forEach(it=>{
    // On a fresh submission, stamp the current user's adopted signature into
    // any signature field. On a PM re-editing an already-completed report,
    // do NOT do this — it would silently replace the original operative's
    // signature with the editing PM's own. Only fill signature fields that
    // are still genuinely empty (e.g. a field added to the template after
    // the original submission).
    if(it.type==='signature' && ME.signature_path && (!isPmEdit || !answers[it.id])) answers[it.id] = ME.signature_path;
  }));
  let rows = null;
  // A PM editing an already-completed report keeps the original
  // submitted_by/submitted_at (that's the operative's record of when THEY
  // submitted it) and instead appends to an edit history kept inside
  // answers, so it's always clear the report was later changed, by whom,
  // and when — rather than looking indistinguishable from the original
  // submission.
  const updatePayload = isPmEdit
    ? { answers: Object.assign({}, answers, { _editHistory: (Array.isArray(answers._editHistory) ? answers._editHistory : []).concat([{ by: ME.id, byName: ME.name, at: new Date().toISOString() }]) }), status:'completed' }
    : { answers, status:'completed', submitted_at:new Date().toISOString() };
  if(reportHasExtraItems()) updatePayload.sections = reportFillDraft.sections;
  try{
    const res = await sbFetch('/rest/v1/report_submissions?id=eq.'+reportFillDraft.submissionId, {method:'PATCH', timeoutMs:60000, headers:{'Prefer':'return=representation'}, body: JSON.stringify(updatePayload)});
    if(res.ok){ const d = await res.json().catch(()=>[]); rows = Array.isArray(d) ? d[0] : d; }
    else console.error(await safeErr(res));
  }catch(e){ console.error(e); }
  reportSubmitBusy = false;
  if(rows){
    // #(loler-plant-due-date-hook): a LOLER Inspection started against a
    // Plant register item (see startLolerInspection) carries plant_item_id —
    // completing it is exactly the "thorough examination just happened"
    // event, so advance that item's last/next inspection dates here rather
    // than making PMs remember to update the register by hand afterwards.
    // Best-effort: the inspection itself is already saved above, so a
    // failure here must never block submission from completing.
    if(reportFillDraft.plantItemId){
      try{
        const pRows = await dbSelect('plant_items', 'id=eq.'+reportFillDraft.plantItemId+'&limit=1');
        const p = pRows[0];
        if(p){
          const nextDue = new Date(); nextDue.setMonth(nextDue.getMonth() + (p.inspection_interval_months||12));
          await dbUpdate('plant_items', p.id, {last_inspection_date: todayISODate(), next_inspection_due: localISODate(nextDue)});
        }
      }catch(e){ console.error('Could not advance plant item inspection date', e); }
    }
    const fromBriefing = reportFillDraft.fromBriefing;
    toast(fromBriefing ? 'Briefing completed' : (isPmEdit ? 'Report updated' : 'Report submitted'));
    const submissionId = reportFillDraft.submissionId;
    await reportOfflineClear(submissionId);
    reportFillDraft = null;
    go(`${reportListPath(siteId, fromBriefing)}/view/${submissionId}`);
  } else if(!(await reportOfflineQueue('complete'))){ toast('Could not submit — check your connection and try again.'); render(); }
};
async function renderReportView(siteId, submissionId, fromBriefing){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  const listPath = reportListPath(siteId, fromBriefing);
  const rows = await dbSelect('report_submissions', 'id=eq.'+submissionId+'&limit=1');
  const sub = rows[0];
  if(!sub){ toast('Report not found'); go(listPath); return; }
  await applyLiveShowUnanswered(sub);
  const general = isGeneralReports(siteId);
  await loadAllProfiles();
  let sigs = [];
  if(fromBriefing) sigs = await dbSelect('daily_briefing_signatures', 'submission_id=eq.'+submissionId+'&order=signed_at.asc');
  const mine = sigs.find(s=>s.user_id===ME.id);
  const sc = scoreSections(sub.sections, sub.answers);
  reportViewSections = sub.sections;
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <p class="sectiontitle" style="margin-top:0;">${escapeHtml(sub.template_name)}</p>
    ${general ? `<p class="stub" style="margin:0 0 6px;"><b>${escapeHtml(sub.general_label||'No job name')}</b>${isManager(ME) ? ` · <span style="text-decoration:underline;cursor:pointer;" onclick="renameGeneralReport('${sub.id}','${jsAttr(sub.general_label||'')}')">Rename</span>` : ''}</p>` : ''}
    <p class="stub">${fromBriefing?'Completed':'Submitted'} ${sub.submitted_at ? new Date(sub.submitted_at).toLocaleString('en-GB') : 'in progress'} by ${escapeHtml(nameOf(sub.submitted_by))}</p>
    ${Array.isArray(sub.answers && sub.answers._editHistory) && sub.answers._editHistory.length ? `<p class="stub" style="color:var(--slate);">${sub.answers._editHistory.map(e=>`Edited ${new Date(e.at).toLocaleString('en-GB')} by ${escapeHtml(e.byName||nameOf(e.by))}`).join(' · ')}</p>` : ''}
    ${sc.overall.possible>0 ? `<p class="stub" style="text-align:right;font-weight:800;color:var(--ink);">Score: ${scoreLabel(sc.overall)}</p>` : ''}
    ${trafficKeyHtml(sub.sections)}
    ${(sub.sections||[]).filter(s=>reportListsSection(sub.sections, s, sub.answers)).map(s=>`
      <div class="card">
        <p class="sectiontitle" style="margin-top:0;display:flex;justify-content:space-between;align-items:center;">
          <span>${escapeHtml(s.title)}</span>
          ${sc.bySection[s.id] ? `<span style="font-weight:700;font-size:12px;color:var(--slate);">${scoreLabel(sc.bySection[s.id])}</span>` : ''}
        </p>
        ${(s.items||[]).filter(it=>itemVisible(it, sub.answers) && reportListsItem(sub.sections, it, sub.answers)).map(it=>renderReportViewItem(it, sub.answers[it.id], sub.answers)).join('')}
      </div>
    `).join('')}
    ${fromBriefing ? `
      <div class="card">
        <p class="sectiontitle" style="margin-top:0;">Signing</p>
        <p class="stub" style="margin:0 0 10px;">${sub.issued_at ? `Issued for signing ${new Date(sub.issued_at).toLocaleString('en-GB')} — every operative in the app can sign it. Signing is optional, so this can be exported at any time regardless of how many have signed.` : 'Not issued for signing yet — issuing is optional; this briefing can be exported as-is at any time.'}</p>
        ${isManager(ME) && !sub.issued_at ? `<button class="ghostbtn" style="margin-bottom:10px;" onclick="issueBriefing('${siteId}','${sub.id}')">Issue for Signing</button>` : ''}
        ${sub.issued_at && !mine ? `<div class="siglinebox" style="cursor:pointer;margin-bottom:10px;" onclick="signBriefing('${siteId}','${sub.id}')">Tap to sign</div>` : ''}
        ${mine ? `<div class="siglinebox signed" style="margin-bottom:10px;">${mine.signature_image_path ? `<img src="${publicUrl('signatures', mine.signature_image_path)}" style="height:34px;max-width:140px;object-fit:contain;">` : `<span class="name">${escapeHtml(ME.name)}</span>`}<span>Signed ${new Date(mine.signed_at).toLocaleDateString(undefined,{day:'2-digit',month:'short'})}</span></div>` : ''}
        ${sigs.length ? `<div class="signerlist">${sigs.map(s=>`<div style="display:flex;align-items:center;gap:8px;">✓ ${escapeHtml(nameOf(s.user_id))}${s.signature_image_path ? `<img src="${publicUrl('signatures', s.signature_image_path)}" style="height:20px;object-fit:contain;">` : ''} — ${new Date(s.signed_at).toLocaleDateString(undefined,{day:'2-digit',month:'short'})}</div>`).join('')}</div>` : ''}
      </div>
    ` : ''}
    ${fromBriefing && isManager(ME) && !sigs.length ? `<button class="ghostbtn" style="margin-bottom:10px;" onclick="go('#/site/${siteId}/hs/briefings/fill/${sub.id}')">Edit Briefing</button>` : ''}
    ${!fromBriefing && isManager(ME) ? `<button class="ghostbtn" style="margin-bottom:10px;" onclick="go('${reportListPath(siteId)}/fill/${sub.id}')">Edit Report</button>` : ''}
    <div class="row-gap">
      <button class="darkbtn" style="flex:1;" onclick="${fromBriefing?`exportDailyBriefingPDF('${sub.id}')`:`exportReportPDF('${sub.id}')`}">Export PDF</button>
      ${isManager(ME) ? `<button class="ghostbtn" style="flex:1;" ${reportEmailBusy===sub.id?'disabled':''} onclick="emailReportPDF('${sub.id}',${fromBriefing?'true':'false'})">${reportEmailBusy===sub.id?'Sending…':'Email Report'}</button>` : ''}
    </div>
  `, reportShellOpts(siteId, site, fromBriefing?'Daily Briefing':'Report', listPath, sub.general_label)); }
}
let reportViewSections = null; // the report on screen, so each answer can show its traffic-light colour
function renderReportViewItem(it, val, answers){
  const tlv = itemTrafficLevel(reportViewSections, it, answers);
  const tlHtml = tlv ? `<p style="margin:4px 0 0;"><span style="display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;background:${trafficHex(tlv.color)};color:#fff;font-size:11.5px;font-weight:700;">${escapeHtml(tlv.label||'')}</span></p>` : '';
  if(it.type==='instruction') return `<p class="stub" style="font-weight:800;color:var(--ink);">${escapeHtml(it.label)}</p>`;
  const mediaArr = (answers && itemAllowsMedia(it) && Array.isArray(answers[it.id+'__media'])) ? answers[it.id+'__media'] : [];
  const extraMediaHtml = mediaArr.length ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin:4px 0 10px;">${mediaArr.map(u=>`<img src="${u}" onclick="viewImageEl(this)" style="cursor:pointer;width:90px;height:90px;object-fit:cover;border-radius:8px;border:1px solid var(--line);">`).join('')}</div>` : '';
  if(it.type==='photo'){
    const arr = Array.isArray(val) ? val : (val ? [val] : []);
    if(!arr.length) return '';
    return `<p class="stub" style="margin-bottom:4px;">${escapeHtml(it.label)}</p><div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">${arr.map(u=>`<img src="${u}" onclick="viewImageEl(this)" style="cursor:pointer;width:140px;height:140px;object-fit:cover;border-radius:8px;">`).join('')}</div>`;
  }
  if(it.type==='signature' && val) return `<p class="stub" style="margin-bottom:4px;">${escapeHtml(it.label)}</p><img src="${publicUrl('signatures', val)}" style="height:44px;background:#fff;border:1px solid var(--line);border-radius:6px;padding:4px;margin-bottom:10px;">`;
  if(it.type==='operatives'){
    const list = Array.isArray(val) ? val.filter(r=>r.included) : [];
    return `<div style="margin-bottom:10px;"><p class="stub" style="margin:0 0 2px;">${escapeHtml(it.label)}</p>${list.length ? list.map(r=>`<p style="margin:2px 0;font-weight:700;font-size:13px;">${escapeHtml(r.name)}${r.role?` <span style="font-weight:400;color:var(--slate);">— ${escapeHtml(r.role)}</span>`:''}</p>`).join('') : `<p style="margin:0;font-weight:700;font-size:13.5px;">—</p>`}</div>`;
  }
  let display = '—';
  if(it.type==='checkbox') display = val===true ? 'Yes' : (val===false ? 'No' : '—');
  else if(it.type==='passfail' && val) display = pfLbl(it,val);
  else if(it.type==='multichoice') display = (Array.isArray(val) && val.length) ? val.join(', ') : '—';
  else if(val!=null && val!=='') display = String(val);
  return `<div style="margin-bottom:10px;"><p class="stub" style="margin:0 0 2px;">${escapeHtml(it.label)}</p><p style="margin:0;font-weight:700;font-size:13.5px;">${escapeHtml(display)}</p>${tlHtml}${(answers && itemAllowsNote(it) && answers[it.id+'__note']) ? `<p style="margin:3px 0 0;font-size:12.5px;color:var(--slate);white-space:pre-wrap;"><b>Note:</b> ${escapeHtml(answers[it.id+'__note'])}</p>` : ''}${extraMediaHtml}</div>`;
}
let reportEmailBusy = null;
// Matches the look of the SafetyCulture PDFs these templates were modelled
// on (see RTB's own Pre-Start Inspection example): a plain title page built
// from the template's first section (Project Address / Date / Attendance —
// every RTB template starts with a simple "details" section like this),
// then each answer after that rendered as a coloured status bar (green
// Pass/Yes, red Fail/No, grey N/A, blue for any other picked answer) with
// free-text answers left as plain paragraphs, section score badges, photos
// numbered continuously through the whole report, and a "Media summary"
// appendix at the end re-showing every photo against the same numbers.
const TITLE_SECTION_TYPES = ['text','date','number','textarea'];
function isTitleSection(s){
  return !!(s && s.items && s.items.length && s.items.every(it=>TITLE_SECTION_TYPES.includes(it.type)));
}
async function buildReportPdf(submissionId, opts){
  const suppressSignatureTimestamp = !!(opts && opts.fromBriefing);
  if(!(await loadLib('PDFLib'))){ toast('PDF library failed to load — check connection.'); return null; }
  const rows = await dbSelect('report_submissions', 'id=eq.'+submissionId+'&limit=1');
  const sub = rows[0]; if(!sub) return null;
  await applyLiveShowUnanswered(sub);
  const site = SITES.find(s=>s.id===sub.site_id);
  const generalLabel = !sub.site_id ? (sub.general_label||'') : '';
  await loadAllProfiles();
  try{
    const scoreInfo = scoreSections(sub.sections, sub.answers);
    const pdfDoc = await PDFLib.PDFDocument.create();
    const bold = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);
    const reg = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
    const WHITE = PDFLib.rgb(1,1,1);
    const INK = PDFLib.rgb(0.06,0.06,0.07);
    const SLATE = PDFLib.rgb(0.36,0.37,0.41);
    const LINE = PDFLib.rgb(0.88,0.88,0.90);
    const FAINT = PDFLib.rgb(0.85,0.84,0.80);
    const HEADBAR = PDFLib.rgb(0.933,0.941,0.961);
    const GREEN = PDFLib.rgb(0.122,0.573,0.322);
    const RED = PDFLib.rgb(0.757,0.231,0.231);
    const GRAY = PDFLib.rgb(0.463,0.463,0.478);
    const BLUE = PDFLib.rgb(0.231,0.435,0.851);
    const GREENTXT = PDFLib.rgb(0.122,0.573,0.322);
    const BRAND = pdfHexToRgb((ORG && ORG.color_primary) || DEFAULT_BRAND1);
    const PAGE_W = 595.28, PAGE_H = 841.89;
    const MARGIN = 44;
    const CONTENT_W = PAGE_W - 2*MARGIN;
    const BAR_X = MARGIN + CONTENT_W*0.46; // colour bars start ~46% across, like the reference PDFs
    const BAR_W = PAGE_W - MARGIN - BAR_X;
    const companyName = (ORG && ORG.name) || 'OpHUB';

    let logoImg = null;
    const logoUrl = ORG && ORG.logo_path ? publicUrl('org-logos', ORG.logo_path) : null;
    if(logoUrl){
      const bytes = await pdfFetchImageBytes(logoUrl);
      if(bytes){ try{ logoImg = await pdfDoc.embedJpg(bytes); }catch(e){ try{ logoImg = await pdfDoc.embedPng(bytes); }catch(e2){} } }
    }

    // Same branded header-band / footer aesthetic as the Snagging PDF export
    // (logo + colour band up top, "Generated via OpHUB" + page number footer)
    // — kept identical across both exports so they read as one system.
    let page, y, pageNum = 0;
    function drawHeaderBand(){
      page.drawRectangle({x:0, y:PAGE_H-92, width:PAGE_W, height:92, color:BRAND});
      if(logoImg){
        const dim = logoImg.scale(1);
        const s = 40/Math.max(dim.width, dim.height);
        const w = dim.width*s, h = dim.height*s;
        // Logo box vertically centred against the optical centre of the
        // 3-line title block beside it (label/title/subtitle baselines run
        // PAGE_H-40 .. PAGE_H-76), not against the plain band height — the
        // old y:PAGE_H-66 box sat ~10pt higher than that text block, which
        // read as "the logo sits too high" next to it.
        page.drawRectangle({x:MARGIN, y:PAGE_H-76, width:40, height:40, color:WHITE});
        page.drawImage(logoImg, {x:MARGIN+(40-w)/2, y:PAGE_H-76+(40-h)/2, width:w, height:h});
      }
      const textX = logoImg ? MARGIN+52 : MARGIN;
      page.drawText('INSPECTION REPORT', {x:textX, y:PAGE_H-40, size:9, font:bold, color:WHITE, opacity:0.85});
      const titleText = sub.template_name.length>44 ? sub.template_name.slice(0,41)+'…' : sub.template_name;
      page.drawText(titleText, {x:textX, y:PAGE_H-60, size:16, font:bold, color:WHITE});
      pdfDrawFit(page, companyName + (site ? ' · '+pdfSiteLabel(site) : (generalLabel ? ' · '+generalLabel : '')), {x:textX, y:PAGE_H-76, size:9.5, font:reg, color:WHITE, opacity:0.9});
    }
    const editHistory = Array.isArray(sub.answers && sub.answers._editHistory) ? sub.answers._editHistory : [];
    const lastEdit = editHistory.length ? editHistory[editHistory.length-1] : null;
    function drawFooter(){
      page.drawLine({start:{x:MARGIN,y:34}, end:{x:PAGE_W-MARGIN,y:34}, thickness:0.75, color:FAINT});
      page.drawText('Generated via OpHUB', {x:MARGIN, y:20, size:8, font:reg, color:SLATE});
      if(lastEdit){
        const editedTxt = 'Edited '+new Date(lastEdit.at).toLocaleString('en-GB',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})+' by '+(lastEdit.byName||nameOf(lastEdit.by));
        page.drawText(editedTxt, {x:PAGE_W-MARGIN-reg.widthOfTextAtSize(editedTxt,8), y:20, size:8, font:reg, color:SLATE});
      }
    }
    function newPage(){
      page = pdfDoc.addPage([PAGE_W, PAGE_H]);
      pageNum += 1;
      drawHeaderBand();
      drawFooter();
      y = PAGE_H - 118;
    }
    function ensureSpace(h){ if(y - h < 50) newPage(); }
    function wrapText(text, font, size, maxWidth){
      const words = String(text).split(/\s+/);
      const lines = []; let line = '';
      words.forEach(w=>{
        const test = line ? line+' '+w : w;
        if(font.widthOfTextAtSize(test, size) > maxWidth && line){ lines.push(line); line = w; }
        else line = test;
      });
      if(line) lines.push(line);
      return lines;
    }
    // A full-width light bar used for section/template headings, with an
    // optional bold score badge right-aligned — e.g. "Scope Of Works  4/9 (44%)".
    function drawHeadingBar(label, scoreText, size){
      size = size || 11.5;
      const h = 26;
      ensureSpace(h+4);
      page.drawRectangle({x:MARGIN, y:y-h, width:CONTENT_W, height:h, color:HEADBAR});
      page.drawText(label, {x:MARGIN+10, y:y-h+8, size, font:bold, color:INK});
      if(scoreText){
        const w = bold.widthOfTextAtSize(scoreText, size-1.5);
        page.drawText(scoreText, {x:PAGE_W-MARGIN-10-w, y:y-h+8, size:size-1.5, font:bold, color:INK});
      }
      y -= h+8;
    }
    // A single question row: label on the left, a coloured status bar (or
    // plain white cell for freeform answers) on the right.
    function drawAnswerRow(label, valueText, barColor){
      const labelLines = wrapText(label, bold, 10.5, BAR_X-MARGIN-16);
      const rowH = Math.max(26, labelLines.length*13+10);
      ensureSpace(rowH+2);
      const top = y;
      if(barColor) page.drawRectangle({x:BAR_X, y:top-rowH, width:BAR_W, height:rowH, color:barColor});
      labelLines.forEach((l,i)=>{ page.drawText(l, {x:MARGIN+2, y:top-16-(i*13), size:10.5, font:bold, color:INK}); });
      if(barColor && valueText){
        const vw = bold.widthOfTextAtSize(valueText, 10.5);
        page.drawText(valueText, {x:PAGE_W-MARGIN-10-vw, y:top-rowH+ (rowH-10.5)/2 +1, size:10.5, font:bold, color:WHITE});
      }
      page.drawLine({start:{x:MARGIN,y:top-rowH}, end:{x:PAGE_W-MARGIN,y:top-rowH}, thickness:0.75, color:LINE});
      y -= rowH;
    }
    function drawParagraphAnswer(label, text){
      ensureSpace(30);
      page.drawText(label, {x:MARGIN, y:y-14, size:10.5, font:bold, color:INK});
      y -= 20;
      wrapText(text, reg, 10, CONTENT_W).forEach(l=>{ ensureSpace(14); page.drawText(l, {x:MARGIN, y:y-10, size:10, font:reg, color:INK}); y -= 14; });
      y -= 8;
    }

    // Photos are numbered once, continuously, in the order they're first
    // drawn — the same numbers are reused later in the Media Summary
    // appendix rather than starting the count over.
    const allPhotos = []; // {url, num}
    let photoEmbedFailures = 0; // count of photos/signature that failed to embed — surfaced to the user after export instead of silently vanishing
    // Handles both a real data: URL (older reports, saved before photos were
    // uploaded to Storage at submit time — see submitReport) and a plain
    // Storage URL (current reports) — fetching the bytes for the latter via
    // the same helper already used for logos/signatures above.
    // Each photo is put into the PDF ONCE (it appears twice — in the body and
    // in the Media Summary — and used to be stored twice at full camera
    // size: a 40-photo inspection came out at 49MB, too big to email as an
    // attachment and very slow to build and upload). Photos are also sized
    // down to 1500px for the PDF, which is sharp even at a full-width photo.
    const embeddedImages = new Map();
    function embedFromDataUrl(urlOrDataUrl){
      const key = String(urlOrDataUrl);
      if(embeddedImages.has(key)) return embeddedImages.get(key);
      const p = (async ()=>{
        let bytes;
        if(key.startsWith('data:')){
          const b64 = key.split(',')[1];
          bytes = Uint8Array.from(atob(b64), c=>c.charCodeAt(0));
        } else {
          bytes = await pdfFetchImageBytesScaled(urlOrDataUrl, 1500, 0.82);
          if(!bytes) throw new Error('Could not fetch photo');
        }
        try{ return await pdfDoc.embedJpg(bytes); }catch(e){ return await pdfDoc.embedPng(bytes); }
      })();
      embeddedImages.set(key, p);
      p.catch(()=>{ embeddedImages.delete(key); });
      return p;
    }
    async function drawPhotoGrid(urls){
      if(!urls.length) return;
      const colW = (CONTENT_W-16)/2, boxH = 180, capH = 16;
      for(let i=0;i<urls.length;i+=2){
        ensureSpace(boxH+capH+10);
        const pair = urls.slice(i,i+2);
        let maxH = 0;
        for(let c=0;c<pair.length;c++){
          const entry = pair[c];
          const cx = MARGIN + c*(colW+16);
          try{
            const img = await embedFromDataUrl(entry.url);
            const dim = img.scale(1);
            const sc = Math.min(colW/dim.width, boxH/dim.height, 1);
            const w = dim.width*sc, h = dim.height*sc;
            page.drawImage(img, {x:cx, y:y-h, width:w, height:h});
            page.drawText('Photo '+entry.num, {x:cx, y:y-boxH-13, size:8.5, font:reg, color:SLATE});
            maxH = Math.max(maxH, h);
          }catch(e){
            photoEmbedFailures++;
            page.drawRectangle({x:cx, y:y-boxH, width:colW, height:boxH, color:HEADBAR});
            page.drawText('Photo '+entry.num+' — could not be loaded', {x:cx+8, y:y-boxH/2, size:9, font:reg, color:SLATE});
            page.drawText('Photo '+entry.num, {x:cx, y:y-boxH-13, size:8.5, font:reg, color:SLATE});
          }
        }
        y -= boxH+capH+10;
      }
    }
    // Get every photo ready up front, four at a time, instead of fetching
    // and shrinking them one after another as each page is drawn — on a
    // 40-photo inspection that one-at-a-time wait was most of the delay.
    // Shows a running count so it's clear something is happening.
    {
      const found = new Set();
      const scan = v=>{
        if(typeof v==='string'){ if(v.startsWith('data:image') || /^https?:\/\/.+\/storage\/v1\/object\//.test(v)) found.add(v); }
        else if(Array.isArray(v)) v.forEach(scan);
        else if(v && typeof v==='object') Object.values(v).forEach(scan);
      };
      scan(sub.answers);
      const list = Array.from(found);
      if(list.length > 4){
        let next = 0, done = 0;
        const worker = async ()=>{
          while(next < list.length){
            const u = list[next++];
            try{ await embedFromDataUrl(u); }catch(e){ /* drawn as "could not be loaded" later */ }
            done++;
            if(done % 4 === 0 && done < list.length){ try{ toast('Preparing photos… '+done+' of '+list.length); }catch(e){} }
          }
        };
        await Promise.all([worker(), worker(), worker(), worker()]);
        try{ toast('Building PDF…'); }catch(e){}
      }
    }
    function collectPhotos(urls){
      return urls.map(u=>{ const num = allPhotos.length+1; const entry = {url:u, num}; allPhotos.push(entry); return entry; });
    }
    // Media summary appendix grid: fixed 2x2 layout, exactly 4 photos per
    // page with each tile roughly a quarter of the page — deliberately
    // different from drawPhotoGrid's flowing 2-per-row layout used inline in
    // the report body, per the "4 photos to each page" spec for this section.
    async function drawMediaSummaryGrid(urls){
      if(!urls.length) return;
      await pdfPrefetchImages(urls);
      const cols = 2, rows = 2, gutter = 14, capH = 16;
      const cellW = (CONTENT_W - gutter) / cols;
      for(let i=0; i<urls.length; i+=cols*rows){
        if(i>0) newPage();
        const startY = y;
        // Tile height is worked out from the room actually left on THIS
        // page (below the header band and any heading, above the footer).
        // It used to assume the whole page was free, so the bottom row ran
        // over the footer and the captions for photos 3 and 4 fell off the
        // bottom of the page.
        const cellH = Math.max(80, (startY - 60 - gutter - capH*rows) / rows);
        const group = urls.slice(i, i+cols*rows);
        for(let r=0; r<rows; r++){
          const rowItems = group.slice(r*cols, r*cols+cols);
          if(!rowItems.length) break;
          const rowTop = startY - r*(cellH+capH+gutter);
          for(let c=0; c<rowItems.length; c++){
            const entry = rowItems[c];
            const cx = MARGIN + c*(cellW+gutter);
            try{
              const img = await embedFromDataUrl(entry.url);
              const dim = img.scale(1);
              // 0.8x smaller than the cell's max fit, matching the shrink applied
              // to every other Media Summary appendix (Schedule, Snagging, Variations).
              const sc = Math.min(cellW/dim.width, cellH/dim.height, 1) * 0.8;
              const w = dim.width*sc, h = dim.height*sc;
              page.drawImage(img, {x:cx+(cellW-w)/2, y:rowTop-cellH+(cellH-h)/2, width:w, height:h});
              page.drawText('Photo '+entry.num, {x:cx, y:rowTop-cellH-13, size:8.5, font:reg, color:SLATE});
            }catch(e){
              photoEmbedFailures++;
              page.drawRectangle({x:cx, y:rowTop-cellH, width:cellW, height:cellH, color:HEADBAR});
              page.drawText('Photo '+entry.num+' — could not be loaded', {x:cx+8, y:rowTop-cellH/2, size:9, font:reg, color:SLATE});
              page.drawText('Photo '+entry.num, {x:cx, y:rowTop-cellH-13, size:8.5, font:reg, color:SLATE});
            }
          }
        }
        y = startY - rows*(cellH+capH+gutter);
      }
    }

    /* ---------- Page 1: title page ---------- */
    newPage();

    const sections = sub.sections||[];
    const titleSection = isTitleSection(sections[0]) ? sections[0] : null;
    const bodySections = titleSection ? sections.slice(1) : sections;

    // repeated-name row + Complete badge
    {
      const rowH = 30;
      ensureSpace(rowH);
      page.drawText(sub.template_name, {x:MARGIN+8, y:y-20, size:12.5, font:reg, color:INK});
      const badgeText = sub.status==='completed' ? 'Complete' : 'In Progress';
      const bw = bold.widthOfTextAtSize(badgeText, 10.5);
      page.drawText(badgeText, {x:PAGE_W-MARGIN-10-bw, y:y-19, size:10.5, font:bold, color: sub.status==='completed'?GREENTXT:SLATE});
      page.drawLine({start:{x:MARGIN,y:y-rowH}, end:{x:PAGE_W-MARGIN,y:y-rowH}, thickness:0.75, color:LINE});
      y -= rowH;
    }
    if(scoreInfo.overall.possible>0){
      const rowH = 30;
      ensureSpace(rowH);
      page.drawRectangle({x:MARGIN, y:y-rowH, width:CONTENT_W, height:rowH, color:HEADBAR});
      page.drawText('Score', {x:MARGIN+8, y:y-20, size:11, font:bold, color:INK});
      const st = scoreLabel(scoreInfo.overall);
      const sw = bold.widthOfTextAtSize(st, 11);
      page.drawText(st, {x:PAGE_W-MARGIN-10-sw, y:y-20, size:11, font:bold, color:INK});
      y -= rowH;
    }
    // Date-type answers are stored as a raw "YYYY-MM-DD" string — shown
    // as-is that reads as a cramped, technical-looking date compared to the
    // "19 Sep 2026" format every other date in the app (and in this same
    // PDF's own footer/header) uses. Reformat just for display; the stored
    // answer itself is untouched.
    function formatAnswerDisplay(it, val){
      if(it.type==='date' && val){
        const d = new Date(val+'T00:00:00');
        if(!isNaN(d)) return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
      }
      return (val!=null && val!=='') ? String(val) : '—';
    }
    if(titleSection){
      for(const it of titleSection.items){
        if(!itemVisible(it, sub.answers) || !reportListsItem(sub.sections, it, sub.answers)) continue;
        const val = sub.answers[it.id];
        const display = formatAnswerDisplay(it, val);
        const rowH = 30;
        ensureSpace(rowH);
        page.drawText(it.label, {x:MARGIN+8, y:y-20, size:11, font:bold, color:INK});
        const dw = reg.widthOfTextAtSize(display, 10.5);
        page.drawText(display, {x:PAGE_W-MARGIN-10-dw, y:y-20, size:10.5, font:reg, color:INK});
        page.drawLine({start:{x:MARGIN,y:y-rowH}, end:{x:PAGE_W-MARGIN,y:y-rowH}, thickness:0.75, color:LINE});
        y -= rowH;
      }
    }

    /* ---------- Body: one heading bar per section, then its questions ---------- */
    newPage();
    drawHeadingBar(sub.template_name, scoreInfo.overall.possible>0 ? scoreLabel(scoreInfo.overall) : null, 12.5);
    // Traffic light key — which colour means what.
    const tlLevels = trafficLevels(sub.sections);
    if(tlLevels){
      ensureSpace(22 + tlLevels.length*16);
      page.drawText('Condition key', {x:MARGIN, y:y-12, size:10.5, font:bold, color:INK}); y -= 20;
      tlLevels.forEach(l=>{
        ensureSpace(16);
        page.drawRectangle({x:MARGIN+2, y:y-11, width:22, height:10, color:pdfHexToRgb(trafficHex(l.color))});
        page.drawText(String(l.label||''), {x:MARGIN+32, y:y-10, size:9.5, font:reg, color:INK});
        y -= 16;
      });
      y -= 8;
    }

    for(const s of bodySections){
      if(!reportListsSection(sub.sections, s, sub.answers)) continue;
      const sc = scoreInfo.bySection[s.id];
      drawHeadingBar(s.title||'', sc ? scoreLabel(sc) : null);

      for(const it of (s.items||[])){
        if(!itemVisible(it, sub.answers) || !reportListsItem(sub.sections, it, sub.answers)) continue;
        const val = sub.answers[it.id];

        if(it.type==='instruction'){
          ensureSpace(24);
          wrapText(it.label, reg, 9.5, CONTENT_W).forEach(l=>{ page.drawText(l, {x:MARGIN, y:y-10, size:9.5, font:reg, color:SLATE}); y -= 13; });
          y -= 6; continue;
        }

        if(it.type==='photo'){
          const arr = Array.isArray(val) ? val : (val ? [val] : []);
          if(!arr.length) continue;
          ensureSpace(24);
          page.drawText(it.label, {x:MARGIN, y:y-12, size:10.5, font:bold, color:INK}); y -= 20;
          await drawPhotoGrid(collectPhotos(arr));
          continue;
        }
        if(it.type==='operatives'){
          const list = Array.isArray(val) ? val.filter(r=>r.included) : [];
          ensureSpace(24);
          page.drawText(it.label, {x:MARGIN, y:y-14, size:10.5, font:bold, color:INK}); y -= 20;
          if(!list.length){
            page.drawText('None recorded', {x:MARGIN, y:y-10, size:10, font:reg, color:SLATE}); y -= 14;
          } else {
            list.forEach(r=>{
              ensureSpace(14);
              const line = r.role ? `${r.name} — ${r.role}` : r.name;
              page.drawText(line, {x:MARGIN, y:y-10, size:10, font:reg, color:INK}); y -= 14;
            });
          }
          y -= 8;
          continue;
        }
        if(it.type==='signature'){
          if(!val) continue;
          ensureSpace(80);
          page.drawText(it.label, {x:MARGIN, y:y-12, size:10.5, font:bold, color:INK}); y -= 20;
          try{
            const bytes = await pdfFetchImageBytes(publicUrl('signatures', val));
            if(bytes){
              let img; try{ img = await pdfDoc.embedPng(bytes); }catch(e){ img = await pdfDoc.embedJpg(bytes); }
              const dim = img.scale(1); const sc2 = Math.min(130/dim.width, 46/dim.height, 1);
              const w = dim.width*sc2, h = dim.height*sc2;
              page.drawImage(img, {x:MARGIN, y:y-h, width:w, height:h});
              const signer = nameOf(sub.submitted_by);
              const when = sub.submitted_at ? new Date(sub.submitted_at).toLocaleString('en-GB', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',timeZoneName:'short'}).replace(',', '') : '';
              page.drawText(signer, {x:MARGIN+150, y:y-16, size:9.5, font:reg, color:INK});
              if(!suppressSignatureTimestamp && when) page.drawText(when, {x:MARGIN+150, y:y-29, size:9, font:reg, color:SLATE});
              y -= h+16;
            } else {
              photoEmbedFailures++;
              page.drawText('Signature could not be loaded', {x:MARGIN, y:y-10, size:9, font:reg, color:SLATE});
              y -= 20;
            }
          }catch(e){ photoEmbedFailures++; page.drawText('Signature could not be loaded', {x:MARGIN, y:y-10, size:9, font:reg, color:SLATE}); y -= 20; }
          page.drawLine({start:{x:MARGIN,y}, end:{x:PAGE_W-MARGIN,y}, thickness:0.75, color:LINE}); y -= 12;
          continue;
        }

        // freeform text — plain paragraph, no colour bar (matches how
        // free-text answers like "any other issues" read in the reference)
        if(it.type==='text' || it.type==='textarea' || it.type==='number' || it.type==='date'){
          const display = formatAnswerDisplay(it, val);
          drawParagraphAnswer(it.label, display);
        } else {
          let display = '—', color = GRAY;
          if(it.type==='checkbox'){
            display = val===true ? 'Yes' : (val===false ? 'No' : '—');
            color = val===true ? GREEN : (val===false ? RED : GRAY);
          } else if(it.type==='passfail' && val){
            display = pfLbl(it,val);
            color = val==='Pass' ? GREEN : (val==='Fail' ? RED : GRAY);
          } else if(it.type==='multichoice'){
            display = (Array.isArray(val) && val.length) ? val.join(', ') : '—';
            color = BLUE;
          } else if(it.type==='choice' && val){
            display = val; color = val==='Yes' ? GREEN : (val==='No' ? RED : ((val==='N/A' || val==='Not Visible') ? GRAY : BLUE));
          }
          drawAnswerRow(it.label, display, color);
        }

        // the traffic-light condition picked for this answer
        const tlPick = itemTrafficLevel(sub.sections, it, sub.answers);
        if(tlPick){
          const tlText = 'Condition: '+String(tlPick.label||'');
          const tw = Math.min(bold.widthOfTextAtSize(tlText, 9.5)+16, CONTENT_W);
          ensureSpace(24);
          page.drawRectangle({x:MARGIN, y:y-20, width:tw, height:16, color:pdfHexToRgb(trafficHex(tlPick.color))});
          pdfDrawFit(page, tlText, {x:MARGIN+8, y:y-15.5, size:9.5, font:bold, color:WHITE, maxWidth:tw-12});
          y -= 26;
        }
        // a note typed against this specific answer
        const itemNote = itemAllowsNote(it) ? String(sub.answers[it.id+'__note']||'').trim() : '';
        if(itemNote){
          const noteLines = ('Note: '+itemNote).split(/\r?\n/).flatMap(par=>wrapText(par, reg, 9.5, CONTENT_W-12));
          noteLines.forEach(l=>{ ensureSpace(14); page.drawText(l, {x:MARGIN+6, y:y-10, size:9.5, font:reg, color:SLATE}); y -= 13; });
          y -= 5;
        }
        // an optional photo attached to this specific answer
        const extraMedia = itemAllowsMedia(it) && Array.isArray(sub.answers[it.id+'__media']) ? sub.answers[it.id+'__media'] : [];
        if(extraMedia.length) await drawPhotoGrid(collectPhotos(extraMedia));
      }
      y -= 6;
    }

    /* ---------- Media summary appendix — same photos, same numbers ---------- */
    if(allPhotos.length){
      newPage();
      drawHeadingBar('Media summary', null, 12.5);
      await drawMediaSummaryGrid(allPhotos);
    }

    const total = pdfDoc.getPageCount();
    pdfDoc.getPages().forEach((p,idx)=>{
      p.drawText((idx+1)+'/'+total, {x:PAGE_W-MARGIN-26, y:26, size:8.5, font:reg, color:SLATE});
    });

    const filename = exportFilename(site?site.name:generalLabel, sub.template_name, 'pdf');
    pdfDoc.setTitle(filename.replace(/\.pdf$/i,''));
    const outBytes = await pdfDoc.save();
    let binary=''; const chunk=0x8000;
    for(let i=0;i<outBytes.length;i+=chunk) binary += String.fromCharCode.apply(null, outBytes.subarray(i,i+chunk));
    const base64 = btoa(binary);
    return {bytes: outBytes, base64, filename, sub, photoEmbedFailures};
  }catch(e){
    console.error(e);
    toast('Could not build the PDF.');
    return null;
  }
}
window.exportReportPDF = async function(submissionId){
  toast('Building PDF…');
  const built = await buildReportPdf(submissionId);
  if(!built) return;
  if(!built.bytes || !built.bytes.length){ toast('Something went wrong building this PDF — it came out empty. Please try again.'); return; }
  if(built.photoEmbedFailures>0) toast(`${built.photoEmbedFailures} photo${built.photoEmbedFailures>1?'s':''} could not be included in the PDF — check your connection and re-export if needed.`);
  await deliverPdf(built.bytes, built.filename);

  // Best-effort OneDrive sync — same silent-fail pattern as photo sync.
  try{
    if(built.sub.site_id) await sbFetchOD('/functions/v1/onedrive-upload', {method:'POST', body: JSON.stringify({filename: built.filename, content_base64: built.base64, site_id: built.sub.site_id})});
  }catch(e){ /* silent — OneDrive sync is opportunistic */ }
};
// Emails a link to the report PDF (uploaded to storage first) rather than
// attaching the full PDF's base64 directly in the request body — a report
// with several photos can produce a large attachment, and posting that in
// one go to the edge function was what surfaced as "server not found" for
// bigger reports. Same pattern as emailSignedRams/emailSignedCoshh, and now
// prompts for a recipient the same way (was previously silently sent only
// to the PM's own address with no way to pick who).
window.emailReportPDF = async function(submissionId, fromBriefing){
  // A quick site_id-only lookup ahead of building the PDF — just enough to
  // know whether to offer "CC client contact" on the prompt, without
  // waiting on the (potentially slow, photo-heavy) full PDF build first.
  const subRow = await dbSelect('report_submissions', 'id=eq.'+submissionId+'&select=site_id&limit=1');
  const site = subRow.length ? SITES.find(s=>s.id===subRow[0].site_id) : null;
  const answer = await customPromptWithCc('Email this report PDF to:', ME.email||'', site);
  if(!answer) return;
  const typedTrim = (answer.value||'').trim();
  if(typedTrim && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(typedTrim)){ toast('Enter a valid email address.'); return; }
  const emailTo = resolvePromptEmailTo(answer);
  if(!emailTo) return; // nothing typed and "CC me a copy" wasn't ticked either
  const trimmed = emailTo.to;
  reportEmailBusy = submissionId; render();
  toast('Building PDF…');
  try{
    const built = await buildReportPdf(submissionId, {fromBriefing:!!fromBriefing});
    if(!built){ reportEmailBusy = null; render(); return; }
    if(!built.bytes || !built.bytes.length){ toast('Something went wrong building this PDF — it came out empty. Please try again.'); reportEmailBusy = null; render(); return; }
    const path = (built.sub.site_id||'general')+'/report-exports/'+crypto.randomUUID()+'-'+built.filename.replace(/[^a-z0-9.\-]+/gi,'_');
    const stored = await uploadToStorage('mc-documents', path, new Blob([built.bytes], {type:'application/pdf'}), 'application/pdf');
    if(!stored){ toast('Could not upload the PDF — try again.'); reportEmailBusy = null; render(); return; }
    toast('Sending…');
    const res = await sbFetch('/functions/v1/send-document-email', {method:'POST', timeoutMs:90000, body: JSON.stringify({
      site_id: built.sub.site_id, general_label: built.sub.site_id ? undefined : (built.sub.general_label||'General survey'), recipient_email: trimmed, cc_email: emailTo.cc, doc_title: built.sub.template_name, file_url: publicUrl('mc-documents', stored),
      client_cc_email: ccClientEmailFromPromptAnswer(answer, site),
    })});
    if(res && res.ok){ toast(built.photoEmbedFailures>0 ? `Emailed — but ${built.photoEmbedFailures} photo${built.photoEmbedFailures>1?'s':''} could not be included.` : 'Emailed'); } else { toast('Could not send the email — '+(await safeErr(res))); }
  }catch(e){
    console.error(e);
    toast('Could not send the email — '+((e && e.message) || e || 'unknown error'));
  }
  reportEmailBusy = null; render();
};
