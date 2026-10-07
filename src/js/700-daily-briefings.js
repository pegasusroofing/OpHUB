/* ================= DAILY BRIEFINGS =================
   Uses the same templated Report system as Reports (a template with
   sections/items, filled per site — see SITE REPORTS below) but any
   template flagged is_daily_briefing surfaces here instead of Reports.
   Adds a document-level "issue for signing" step (every operative on the
   app can then tap to sign it, mirroring RAMS) and exports exactly like
   RAMS — a PDF with a signature table appended — except issuing is never
   compulsory: a briefing a PM has simply completed can be exported with
   zero signatures. */
let briefingPickerOpen = false;
let briefingTemplatesManageOpen = false;
let selectedBriefingIds = new Set();
let bulkBriefingEmailBusy = false;
let bulkBriefingExportBusy = false;
let briefingWeekOpen = {}; // weekKey -> bool, defaults to "only the current week" the first time each week is seen
// Monday-start week key/label for grouping the briefings log — matches how
// UK working weeks are usually thought of (Mon-Sun), not the JS default
// (Sun-Sat).
function mondayOfWeek(d){
  const dt = new Date(d); dt.setHours(0,0,0,0);
  const day = dt.getDay(); // 0=Sun..6=Sat
  const diff = (day===0 ? -6 : 1-day);
  dt.setDate(dt.getDate()+diff);
  return dt;
}
function weekKeyOf(d){ return localISODate(mondayOfWeek(d)); }
function weekLabelOf(mondayIso){
  const start = new Date(mondayIso+'T00:00:00');
  const end = new Date(start); end.setDate(end.getDate()+6);
  const fmt = dt => dt.toLocaleDateString('en-GB', {day:'2-digit',month:'short'});
  return `Week of ${fmt(start)} – ${fmt(end)}`;
}
async function renderDailyBriefings(siteId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  const canManage = isManager(ME);
  const allTemplates = canManage ? await dbSelect('report_templates', 'org_id=eq.'+ME.org_id+'&archived=eq.false&order=name.asc') : [];
  const templates = canManage ? allTemplates.filter(t=>t.is_daily_briefing) : await dbSelect('report_templates', 'org_id=eq.'+ME.org_id+'&is_daily_briefing=eq.true&archived=eq.false&order=name.asc');
  let submissions = [];
  if(templates.length){
    const ids = templates.map(t=>t.id).join(',');
    submissions = await dbSelect('report_submissions', 'site_id=eq.'+siteId+'&template_id=in.('+ids+')&order=submitted_at.desc');
  }
  await loadAllProfiles();
  let sigsBySubmission = {};
  if(submissions.length){
    const subIds = submissions.map(s=>s.id).join(',');
    const sigs = await dbSelect('daily_briefing_signatures', 'submission_id=in.('+subIds+')');
    sigs.forEach(s=>{ (sigsBySubmission[s.submission_id]=sigsBySubmission[s.submission_id]||[]).push(s); });
  }
  // Group by Monday-start week, most recent week first. The current week is
  // auto-expanded the first time it's seen; every other week defaults
  // collapsed but remembers whatever the user's toggled since.
  const currentWeekKey = weekKeyOf(new Date());
  const weeks = {}; // key -> submissions[]
  submissions.forEach(s=>{ const k = weekKeyOf(new Date(s.submitted_at)); (weeks[k]=weeks[k]||[]).push(s); });
  const weekKeys = Object.keys(weeks).sort((a,b)=>b.localeCompare(a));
  weekKeys.forEach(k=>{ if(!(k in briefingWeekOpen)) briefingWeekOpen[k] = (k===currentWeekKey); });
  function submissionRowHtml(s){
    const sigs = sigsBySubmission[s.id]||[];
    const mine = sigs.find(x=>x.user_id===ME.id);
    const needsMySignature = s.issued_at && s.status==='completed' && !mine;
    return `
      <div class="sitecard" style="flex-wrap:wrap;">
        ${canManage ? `<input type="checkbox" style="width:18px;height:18px;flex:0 0 18px;margin-top:2px;" ${selectedBriefingIds.has(s.id)?'checked':''} onclick="toggleBriefingSelect('${s.id}')">` : ''}
        <div class="info" style="cursor:pointer;" onclick="go('#/site/${siteId}/hs/briefings/${s.status==='in_progress'?'fill':'view'}/${s.id}')">
          <div class="name">${escapeHtml(s.template_name)}</div>
          <div class="addr">${s.status==='in_progress' ? 'Started' : 'Completed'} ${new Date(s.submitted_at).toLocaleString('en-GB')} · ${escapeHtml(nameOf(s.submitted_by))}</div>
          <div class="addr">${s.issued_at ? `Issued for signing · ${sigs.length} signed` : 'Not issued for signing'}</div>
        </div>
        <span class="statustag2 ${REPORT_STATUS_CLASS[s.status]||'closed'}">${REPORT_STATUS_LABEL[s.status]||s.status}</span>
        ${s.status==='in_progress' && ME.role==='admin' ? `<div class="taskicon danger" style="flex:0 0 auto;" onclick="deleteBriefingSubmission('${siteId}','${s.id}')">🗑</div>` : ''}
      </div>
      ${needsMySignature ? `
        <div class="siglinebox" style="cursor:pointer;margin:-6px 0 10px;" onclick="signBriefing('${siteId}','${s.id}')">Tap to sign — ${escapeHtml(s.template_name)}</div>
      ` : ''}
    `;
  }
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    ${canManage ? `
      <!-- #292: no per-tab template dropdown/picker any more, and no
           create/edit/remove controls here either — the org's Daily
           Briefing template is managed exclusively from Admin Centre's
           Report Templates area (tick "Use as a Daily Briefing template"
           on a template there). "New Briefing" resolves straight to that
           one template (the first one flagged, if more than one somehow
           is) instead of asking which to use. -->
      <button class="darkbtn" style="margin:0 0 14px;" ${templates.length ? '' : 'disabled'} onclick="startBriefing('${siteId}','${templates[0] ? templates[0].id : ''}')">+ New Briefing</button>
      ${!templates.length ? `<p class="stub" style="margin:-8px 0 14px;">No Daily Briefing template set up yet — an admin can flag one in Admin Centre &gt; Report Templates.</p>` : ''}
    ` : ''}
    ${canManage && selectedBriefingIds.size>0 ? `
      <div class="row-gap" style="margin-bottom:14px;">
        <button class="darkbtn" style="flex:1;" ${bulkBriefingExportBusy?'disabled':''} onclick="exportSelectedBriefings('${siteId}')">${bulkBriefingExportBusy?'Building…':`Export ${selectedBriefingIds.size} Selected (PDF)`}</button>
        <button class="ghostbtn exportbtn" style="flex:1;" ${bulkBriefingEmailBusy?'disabled':''} onclick="emailSelectedBriefings()">${bulkBriefingEmailBusy?'Emailing…':`Email ${selectedBriefingIds.size} Selected`}</button>
      </div>
    ` : ''}
    ${weekKeys.length ? weekKeys.map(k=>`
      <div class="ddrow" onclick="briefingWeekOpen['${k}']=!briefingWeekOpen['${k}'];render();"><span class="arrow">${briefingWeekOpen[k]?'▼':'▶'}</span> ${weekLabelOf(k)}${k===currentWeekKey?' (current)':''} <span class="stub">(${weeks[k].length})</span></div>
      ${briefingWeekOpen[k] ? weeks[k].map(submissionRowHtml).join('') : ''}
    `).join('') : `<div class="empty">No Daily Briefings yet${templates.length?'.':' — set up a Daily Briefing template first.'}</div>`}
  `, {title:'Daily Briefings', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/hs`, siteId, activeTab:'more'}); }
}
window.toggleBriefingSelect = function(id){
  if(selectedBriefingIds.has(id)) selectedBriefingIds.delete(id); else selectedBriefingIds.add(id);
  render();
};
// One briefing as a finished PDF: the report itself plus, when anyone has
// signed it, the signature table on the end. The single "Export PDF" button
// always did this; the bulk export and bulk email built the report only, so
// their copies came out with the signatures missing.
async function buildBriefingPdfWithSignatures(submissionId){
  const built = await buildReportPdf(submissionId, {fromBriefing:true});
  if(!built) return null;
  const sigs = await dbSelect('daily_briefing_signatures', 'submission_id=eq.'+submissionId+'&order=signed_at.asc');
  if(!sigs.length) return built;
  await loadAllProfiles();
  const pdfDoc = await PDFLib.PDFDocument.load(built.bytes);
  const signers = sigs.map(sg=>({
    name: nameOf(sg.user_id),
    when: new Date(sg.signed_at).toLocaleString('en-GB', {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}),
    imagePath: sg.signature_image_path,
  }));
  await drawSignatureTablePages(pdfDoc, {title: built.sub.template_name, disclaimer: `I confirm I have read and understood the contents of this briefing (${built.sub.template_name}).`, signers});
  const bytes = await pdfDoc.save();
  return Object.assign({}, built, {bytes});
}
// Joins several already-built PDFs (each a Uint8Array) into one document.
async function mergePdfBytes(list, title){
  const merged = await PDFLib.PDFDocument.create();
  for(const bytes of list){
    const src = await PDFLib.PDFDocument.load(bytes);
    const pages = await merged.copyPages(src, src.getPageIndices());
    pages.forEach(pg=>merged.addPage(pg));
  }
  if(title) merged.setTitle(title);
  return merged.save();
}
// Emails a PDF as a LINK: the file is uploaded to storage first and the
// email carries a button to it. The alternative — posting the PDF itself
// inside the request — is what fails as "could not reach the server" once a
// document (or several at once) gets large. Same route the single-report,
// signed-RAMS and signed-COSHH emails already use. Returns true if sent.
async function emailPdfAsLink(o){
  const safe = String(o.filename||'document.pdf').replace(/[^a-z0-9.\-]+/gi,'_');
  const path = (o.siteId || ME.org_id)+'/email-exports/'+uid()+'-'+safe;
  const stored = await uploadToStorage('mc-documents', path, new Blob([o.bytes], {type:'application/pdf'}), 'application/pdf');
  if(!stored) return false;
  try{
    const res = await sbFetch('/functions/v1/send-document-email', {method:'POST', timeoutMs:60000, body: JSON.stringify({
      site_id: o.siteId, recipient_email: o.to, cc_email: o.cc || undefined, client_cc_email: o.clientCc || undefined,
      doc_title: o.title, file_url: publicUrl('mc-documents', stored),
    })});
    return !!(res && res.ok);
  }catch(e){ return false; }
}
window.exportSelectedBriefings = async function(siteId){
  if(!selectedBriefingIds.size) return;
  if(!(await loadLib('PDFLib'))){ toast('PDF library failed to load — check connection.'); return; }
  bulkBriefingExportBusy = true; render();
  toast('Building PDF…');
  try{
    const ids = Array.from(selectedBriefingIds);
    const parts = [];
    for(const id of ids){
      const built = await buildBriefingPdfWithSignatures(id);
      if(built) parts.push(built.bytes);
    }
    if(!parts.length){ toast('Could not build any of the selected briefings.'); return; }
    const site = SITES.find(s=>s.id===siteId);
    const filename = exportFilename(site?site.name:'', `Daily Briefings (${parts.length})`, 'pdf');
    const outBytes = await mergePdfBytes(parts, filename.replace(/\.pdf$/i,''));
    await deliverPdf(outBytes, filename);
    selectedBriefingIds = new Set();
  }catch(e){ console.error(e); toast('Could not build the combined PDF.'); }
  finally{ bulkBriefingExportBusy = false; render(); }
};
window.emailSelectedBriefings = async function(){
  if(!selectedBriefingIds.size) return;
  if(!(await loadLib('PDFLib'))){ toast('PDF library failed to load — check connection.'); return; }
  bulkBriefingEmailBusy = true; render();
  toast('Building PDFs…');
  try{
    const ids = Array.from(selectedBriefingIds);
    const parts = []; let siteId = null;
    for(const id of ids){
      const built = await buildBriefingPdfWithSignatures(id);
      if(built){ parts.push(built.bytes); siteId = siteId || built.sub.site_id; }
    }
    if(!parts.length){ toast('Could not build any of the selected briefings.'); return; }
    // One combined PDF, emailed as a link — these used to go as separate
    // attachments posted in a single request, which failed once the
    // briefings carried photos.
    const site = SITES.find(st=>st.id===siteId);
    const filename = exportFilename(site?site.name:'', `Daily Briefings (${parts.length})`, 'pdf');
    const outBytes = await mergePdfBytes(parts, filename.replace(/\.pdf$/i,''));
    toast('Sending…');
    const ok = await emailPdfAsLink({siteId, bytes: outBytes, filename, title: `Daily Briefings (${parts.length})`, to: ME.email});
    if(ok){ toast(`${parts.length} briefing(s) emailed to ${ME.email}`); selectedBriefingIds = new Set(); }
    else toast('Email failed — please try again.');
  }catch(e){ console.error(e); toast('Email failed — could not reach the server.'); }
  finally{ bulkBriefingEmailBusy = false; render(); }
};
window.deleteBriefingSubmission = async function(siteId, submissionId){
  if(!await customConfirm('Delete this in-progress briefing? This can\'t be undone.')) return;
  const rows = await dbSelect('report_submissions', 'id=eq.'+submissionId+'&select=template_name');
  const templateName = rows[0] && rows[0].template_name;
  const ok = await dbDelete('report_submissions', submissionId);
  if(ok){ toast('Briefing deleted'); logSiteActivity(siteId, 'briefing_submission_deleted', `Deleted daily briefing "${templateName||''}"`); render(); }
};
window.startBriefing = async function(siteId, templateId){
  const rows = await dbSelect('report_templates', 'id=eq.'+templateId+'&limit=1');
  const t = rows[0];
  if(!t){ toast('Template not found'); return; }
  const answers = {};
  const site = SITES.find(s=>s.id===siteId);
  (t.sections||[]).forEach(s=>(s.items||[]).forEach(it=>{
    if(!it.autofill) return;
    const v = autofillValue(it.autofill, site);
    if(v!==undefined) answers[it.id] = v;
  }));
  const inserted = await dbInsert('report_submissions', {
    template_id: t.id, org_id: ME.org_id, site_id: siteId,
    template_name: t.name, sections: t.sections, answers,
    submitted_by: ME.id, status:'in_progress',
  });
  if(inserted && inserted[0]){
    reportFillDraft = null;
    briefingPickerOpen = false;
    toast('Briefing started');
    go(`#/site/${siteId}/hs/briefings/fill/${inserted[0].id}`);
  }
};
window.issueBriefing = async function(siteId, submissionId){
  if(!await customConfirm('Issue this briefing for signing? Every operative in the app will be able to sign it — this is optional and can still be exported without any signatures.')) return;
  const row = await dbUpdate('report_submissions', submissionId, {issued_at:new Date().toISOString(), issued_by:ME.id});
  if(row){ toast('Briefing issued for signing'); render(); }
};
window.signBriefing = async function(siteId, submissionId){
  if(!ME.signature_path){
    toast('Adopt your signature first — one tap and it\'s used everywhere.');
    go('#/signature');
    return;
  }
  const rows = await dbInsert('daily_briefing_signatures', {submission_id:submissionId, user_id:ME.id, signature_image_path:ME.signature_path});
  if(rows){ toast('Signed'); render(); }
};
window.exportDailyBriefingPDF = async function(submissionId){
  if(!(await loadLib('PDFLib'))){ toast('PDF library failed to load — check connection.'); return; }
  toast('Building PDF…');
  try{
    const built = await buildBriefingPdfWithSignatures(submissionId);
    if(!built) return;
    await deliverPdf(built.bytes, built.filename);
  }catch(e){
    console.error(e);
    toast('Could not build the signed PDF.');
  }
};
