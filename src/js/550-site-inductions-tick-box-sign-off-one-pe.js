/* ================= SITE INDUCTIONS (tick-box sign-off, one per operative per site) =================
   Unlike the other Main-Contractor tiles this isn't a document upload folder
   — it's a fixed, standard induction every operative works through and signs
   with their adopted signature (see MY SIGNATURE above), the same pattern as
   the H&S Policy sign-off inside RAMS. Completed inductions are built into a
   PDF and, when this site has its own OneDrive folder linked (separate from
   the site's photos/drawings folder — see site.site_inductions_folder_id),
   pushed there automatically: same opportunistic, silent-fail sync pattern
   used for progress photos and drawings elsewhere in the app. */
const DEFAULT_SITE_INDUCTION_ITEMS = [
  "I have been shown this site's emergency procedures, including the fire exits, evacuation routes and the assembly point.",
  'I know the location of the first aid box and who the appointed first aiders are on this site.',
  'I understand I must wear the correct PPE for my task at all times on this site.',
  'I have been shown the site welfare facilities (toilets, drying room, canteen/rest area).',
  "I understand this site's permit-to-work requirements (e.g. hot works, confined spaces, working at height) and will not start such work without the correct permit in place.",
  'I have been made aware of the specific hazards on this site (traffic routes, excavations, overhead services, asbestos register where applicable).',
  'I understand how to report an accident, incident or near miss on this site.',
  'I agree to follow all site rules at all times, including signing in/out and wearing my ID badge.',
];
// The induction checklist is org-wide (see organizations.site_induction_questions)
// rather than hardcoded, so a PM/admin can add extra questions once and have
// them apply to every site's induction form for their organisation straight
// away. Falls back to the built-in default list until an org customises it.
function SITE_INDUCTION_ITEMS_LIVE(){
  return (ORG && Array.isArray(ORG.site_induction_questions) && ORG.site_induction_questions.length) ? ORG.site_induction_questions : DEFAULT_SITE_INDUCTION_ITEMS;
}
let inductionTicks = [];
let inductionEmergencyName = '';
let inductionEmergencyNumber = '';
let inductionPage = 1; // operative fill-in flow: 1 = checklist + emergency contact, 2 = health questionnaire + sign
let healthAnswers = {}; // index -> 'yes' | 'no'
let healthDetails = {}; // index -> string, mandatory whenever the matching answer is 'yes'
const HEALTH_QUESTIONNAIRE_ITEMS = [
  {category:'Physical Fitness', question:'Do you have any condition affecting your balance, mobility, or ability to lift loads?'},
  {category:'Working at Height', question:'Do you suffer from vertigo, severe dizziness, or epilepsy?'},
  {category:'Sensory / Alertness', question:'Do you have uncorrected visual or hearing impairments that impact site safety?'},
  {category:'Respiratory Health', question:'Do you suffer from severe asthma or respiratory conditions aggravated by dust/fumes?'},
  {category:'Medication / Safety', question:'Are you taking medication that causes drowsiness or restricts operating machinery?'},
  {category:'Emergency Info', question:'Do you have any severe allergies (e.g., penicillin, latex, bee stings) or medical conditions (e.g., diabetes) that first aiders should be aware of?'},
];
let siteInductionQuestionsOpen = false; // PM: "Induction Form" dropdown in the Outstanding tab
let siteInductionNewQuestion = '';
let siteInductionFilter = 'outstanding'; // PM/client tab state: outstanding | completed
let siteInductionOneDrivePanelOpen = false; // manager: OneDrive sync panel toggled from the "+" beside the tabs
let siteInductionSelectedIds = new Set(); // manager: multi-tick selection on the Completed Inductions tab, for bulk export/email
async function fetchSiteInductionData(siteId){
  const [assigned, completions] = await Promise.all([
    dbSelect('site_assignments', 'site_id=eq.'+siteId+'&select=user_id'),
    dbSelect('site_induction_completions', 'site_id=eq.'+siteId+'&order=completed_at.desc'),
  ]);
  const byOperative = {}; completions.forEach(c=>{ byOperative[c.operative_id]=c; });
  return {assignedIds: assigned.map(a=>a.user_id), completions, byOperative};
}
async function renderSiteInductions(siteId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  const canManage = isManager(ME);
  const isClientView = ME.role==='client';
  await loadAllProfiles();
  const {assignedIds, completions, byOperative} = await fetchSiteInductionData(siteId);
  const linked = !!site.site_inductions_folder_id;

  if(canManage || isClientView){
    const roster = assignedIds.length ? assignedIds : Object.keys(byOperative);
    const outstandingRoster = roster.filter(uid=>!byOperative[uid]);
    const completedRoster = roster.filter(uid=>byOperative[uid]).sort((a,b)=> new Date(byOperative[b].completed_at) - new Date(byOperative[a].completed_at));
    const visibleRoster = siteInductionFilter==='completed' ? completedRoster : outstandingRoster;
    if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
      <div class="row-gap" style="margin:0 0 10px;align-items:center;">
        <div class="filterchip ${siteInductionFilter==='outstanding'?'active':''}" onclick="siteInductionFilter='outstanding';siteInductionSelectedIds=new Set();render()">Outstanding</div>
        <div class="filterchip ${siteInductionFilter==='completed'?'active':''}" onclick="siteInductionFilter='completed';siteInductionSelectedIds=new Set();render()">Completed Inductions</div>
        ${siteInductionFilter==='completed' && canManage && !linked ? `<div class="roundplusbtn" style="width:34px;height:34px;font-size:19px;flex:0 0 auto;" title="Sync to OneDrive folder" onclick="siteInductionOneDrivePanelOpen=!siteInductionOneDrivePanelOpen;render()">+</div>` : ''}
      </div>
      ${siteInductionFilter==='completed' && canManage && !linked && siteInductionOneDrivePanelOpen ? `
      <div class="card" style="margin-bottom:10px;">
        <p class="stub" style="margin:0 0 10px;">Link a OneDrive folder and every signed induction PDF will be pushed there automatically as operatives complete them.</p>
        <button class="darkbtn" onclick="startOneDriveFolderPicker('${siteId}','siteinductions')">Link OneDrive Folder</button>
      </div>
      ` : ''}
      ${siteInductionFilter==='outstanding' && canManage ? `
      <div class="card" style="padding:0;overflow:hidden;margin-bottom:10px;">
        <p class="ddrow" style="margin:0;padding:12px 14px;border:none;border-radius:0;background:transparent;" onclick="siteInductionQuestionsOpen=!siteInductionQuestionsOpen;render()">
          <span class="arrow">${siteInductionQuestionsOpen?'▼':'▶'}</span> Induction Form
        </p>
        ${siteInductionQuestionsOpen ? `
        <div style="padding:0 14px 14px;">
          <p class="stub" style="margin:0 0 10px;">Every operative ticks each of these before signing. Add a question below and it applies to every site's induction form for your organisation straight away.</p>
          ${SITE_INDUCTION_ITEMS_LIVE().map((q,i)=>`
            <div class="sitecard">
              <div class="info"><div class="name" style="font-weight:600;font-size:13px;">${i+1}. ${escapeHtml(q)}</div></div>
              ${SITE_INDUCTION_ITEMS_LIVE().length > 1 ? `<div class="taskicon danger" title="Remove from every site's induction form" onclick="removeSiteInductionQuestion(${i})">🗑</div>` : ''}
            </div>
          `).join('')}
          <div class="formfield" style="margin-top:10px;"><input type="text" id="siteInductionNewQuestionInput" placeholder="Add another question…" value="${escapeHtml(siteInductionNewQuestion)}" oninput="siteInductionNewQuestion=this.value"></div>
          <button class="ghostbtn" onclick="addSiteInductionQuestion()">+ Add Question</button>
        </div>
        ` : ''}
      </div>
      ` : ''}
      <p class="stub" style="margin:0 0 10px;">${roster.length} on the roster · ${completions.length} completed</p>
      ${siteInductionFilter==='completed' && canManage && siteInductionSelectedIds.size ? `
      <div class="row-gap" style="margin-bottom:10px;">
        <button class="ghostbtn" style="flex:1;" onclick="exportSelectedInductions()">⬇️ Export ${siteInductionSelectedIds.size} Selected</button>
        <button class="darkbtn" style="flex:1;" onclick="emailSelectedInductions()">✉️ Email ${siteInductionSelectedIds.size} Selected</button>
      </div>
      ` : ''}
      ${visibleRoster.map(uid=>{
        const c = byOperative[uid];
        return `
        <div class="sitecard">
          ${c && canManage ? `<input type="checkbox" style="width:18px;height:18px;flex:0 0 18px;margin-right:2px;" ${siteInductionSelectedIds.has(c.id)?'checked':''} onclick="event.stopPropagation();toggleSiteInductionSelect('${c.id}')">` : ''}
          <div class="swatch">${operativeInitials(nameOf(uid))}</div>
          <div class="info">
            <div class="name">${escapeHtml(nameOf(uid))}</div>
            <div class="addr">${c ? '✓ Completed '+new Date(c.completed_at).toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'}) : '○ Not yet completed'}</div>
          </div>
          ${c ? `<div class="taskicon" title="View PDF" onclick="event.stopPropagation();exportSiteInductionPdf('${c.id}')">👁</div>` : ''}
          ${c && canManage ? rowActionsMenuHtml('siteinductionrow'+c.id, `
            <div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;exportSiteInductionPdf('${c.id}')">⬇️ Export PDF</div>
            <div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;emailSiteInductionPdf('${c.id}','${jsAttr(nameOf(uid))}')">✉️ Email PDF</div>
            <div class="statusmenu-item danger" onclick="rowActionsMenuOpenFor=null;deleteSiteInductionCompletion('${c.id}')">🗑 Delete — they'll need to redo it</div>
          `) : ''}
        </div>`;
      }).join('') || `<div class="empty">No ${siteInductionFilter==='completed' ? 'completed inductions yet' : 'outstanding operatives'}${siteInductionFilter==='completed'?'.':' — everyone on the roster has completed their induction.'}</div>`}
      ${siteInductionFilter==='completed' && canManage && linked ? `
      <div style="margin-top:14px;position:relative;display:inline-block;" data-rowactions-root onclick="event.stopPropagation();">
        <p class="stub" style="margin:0;color:var(--ok);cursor:pointer;" onclick="toggleRowActionsMenu('siteinductionsod')">📁 Signed inductions are pushed to "<span style="text-decoration:underline;">${escapeHtml(site.site_inductions_folder_name||'')}</span>"</p>
        ${rowActionsMenuOpenFor==='siteinductionsod' ? `
        <div class="statusmenu" style="left:0;right:auto;top:100%;">
          <div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;startOneDriveFolderPicker('${siteId}','siteinductions')">📁 Change Folder</div>
          <div class="statusmenu-item danger" onclick="rowActionsMenuOpenFor=null;unlinkSiteInductionsFolder('${siteId}')">🗑 Unlink</div>
        </div>
        ` : ''}
      </div>
      ` : ''}
    `, {title:'Site Inductions', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/mc`, siteId, activeTab:'more'}); }
    return;
  }

  // Operative view: their own induction only — never the site-wide
  // Outstanding/Completed roster (that's a PM/admin-only view, handled in
  // the branch above). Complete the induction once; re-doing it afterwards
  // is a PM action (deleteSiteInductionCompletion), not a self-service one.
  const mine = byOperative[ME.id];
  if(mine){
    if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
      <div class="card" style="text-align:center;">
        <div style="font-size:34px;margin-bottom:8px;">✅</div>
        <p class="sectiontitle" style="margin:0 0 6px;">Induction completed</p>
        <p class="stub" style="margin:0 0 14px;">You completed this site's induction on ${new Date(mine.completed_at).toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'})}.</p>
        <button class="ghostbtn" onclick="exportSiteInductionPdf('${mine.id}')">View / Download My Induction</button>
      </div>
    `, {title:'Site Inductions', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/mc`, siteId, activeTab:'more'}); }
    return;
  }
  if(inductionTicks.length !== SITE_INDUCTION_ITEMS_LIVE().length) inductionTicks = SITE_INDUCTION_ITEMS_LIVE().map(()=>false);
  const allTicked = inductionTicks.every(Boolean);

  // Page 2: Health Questionnaire, reached via "Next" from page 1, with a
  // "Back" button returning to page 1 without losing anything already
  // entered. Signing off (the actual save) happens at the end of page 2.
  if(inductionPage === 2){
    const allHealthAnswered = HEALTH_QUESTIONNAIRE_ITEMS.every((_,i)=> healthAnswers[i]==='yes' || healthAnswers[i]==='no');
    const allYesDetailed = HEALTH_QUESTIONNAIRE_ITEMS.every((_,i)=> healthAnswers[i]!=='yes' || (healthDetails[i]||'').trim());
    const canSign = allHealthAnswered && allYesDetailed;
    if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
      <p class="stub" style="margin:0 0 14px;">Health Questionnaire for ${escapeHtml(site.name)} — please answer every question. Any "Yes" needs a few details so we can keep you safe on site.</p>
      <div style="display:flex;flex-direction:column;gap:10px;">
      ${HEALTH_QUESTIONNAIRE_ITEMS.map((item,i)=>`
        <div class="card" style="margin:0;">
          <p class="sectiontitle" style="margin:0 0 4px;font-size:11.5px;color:var(--slate);text-transform:uppercase;letter-spacing:.3px;">${escapeHtml(item.category)}</p>
          <p style="margin:0 0 10px;font-size:13px;line-height:1.4;">${escapeHtml(item.question)}</p>
          <div class="row-gap">
            <div class="filterchip ${healthAnswers[i]==='no'?'active':''}" style="flex:1;text-align:center;" onclick="setHealthAnswer(${i},'no')">No</div>
            <div class="filterchip ${healthAnswers[i]==='yes'?'active':''}" style="flex:1;text-align:center;" onclick="setHealthAnswer(${i},'yes')">Yes</div>
          </div>
          ${healthAnswers[i]==='yes' ? `
            <div class="formfield" style="margin-top:10px;margin-bottom:0;"><textarea rows="2" id="healthDetail${i}" required placeholder="Please give details *" oninput="healthDetails[${i}]=this.value">${escapeHtml(healthDetails[i]||'')}</textarea></div>
          ` : ''}
        </div>
      `).join('')}
      </div>
      <div class="card" style="margin-top:14px;">
        <p class="sectiontitle" style="margin-top:0;">Sign to confirm</p>
        ${ME.signature_path ? `
          <div class="siglinebox" style="margin-top:0;cursor:pointer;${canSign?'':'opacity:.6;'}" onclick="submitSiteInduction('${siteId}')">
            <img src="${publicUrl('signatures', ME.signature_path)}" style="height:32px;max-width:160px;object-fit:contain;">
            <span>${canSign?'Tap to sign & complete induction':'Answer every health question first'}</span>
          </div>
        ` : `
          <p class="stub" style="margin:0 0 10px;color:var(--warn);">Adopt your signature first — one tap and it's used everywhere.</p>
          <button class="darkbtn" onclick="go('#/signature')">Adopt Your Signature</button>
        `}
      </div>
      <button class="ghostbtn" style="margin-top:10px;" onclick="inductionPage=1;render()">‹ Back</button>
    `, {title:'Site Inductions', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/mc`, siteId, activeTab:'more'}); }
    return;
  }

  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <p class="stub" style="margin:0 0 14px;">Please read and confirm each item below, then continue to the health questionnaire to complete your site induction for ${escapeHtml(site.name)}.</p>
    <div style="display:flex;flex-direction:column;gap:8px;">
    ${SITE_INDUCTION_ITEMS_LIVE().map((text,i)=>`
      <div class="inductionitem ${inductionTicks[i]?'ticked':''}" style="cursor:pointer;" onclick="toggleInductionTick(${i})">
        <span style="font-size:18px;line-height:1.3;margin-right:8px;flex:0 0 auto;">${inductionTicks[i]?'☑':'☐'}</span>
        <span style="font-size:13px;line-height:1.4;">${escapeHtml(text)}</span>
      </div>
    `).join('')}
    </div>
    <div class="card" style="margin-top:14px;">
      <p class="sectiontitle" style="margin-top:0;">Emergency Contact Details <span style="color:var(--warn);">*</span></p>
      <p class="stub" style="margin:0 0 10px;">Required before you can sign and complete this induction.</p>
      <div class="formfield"><input type="text" id="inductionEmergencyName" required placeholder="Emergency contact name *" value="${escapeHtml(inductionEmergencyName)}" oninput="inductionEmergencyName=this.value"></div>
      <div class="formfield"><input type="tel" id="inductionEmergencyNumber" required placeholder="Emergency contact number *" value="${escapeHtml(inductionEmergencyNumber)}" oninput="inductionEmergencyNumber=this.value"></div>
    </div>
    <button class="darkbtn" style="margin-top:14px;" onclick="goInductionNext('${siteId}')">Next: Health Questionnaire ›</button>
  `, {title:'Site Inductions', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/mc`, siteId, activeTab:'more'}); }
}
window.toggleInductionTick = function(i){ inductionTicks[i] = !inductionTicks[i]; render(); };
window.setHealthAnswer = function(i, val){ healthAnswers[i] = val; if(val !== 'yes') delete healthDetails[i]; render(); };
window.goInductionNext = function(siteId){
  if(!inductionTicks || !inductionTicks.length || !inductionTicks.every(Boolean)){ toast('Tick every item first.'); return; }
  const emergencyName = (document.getElementById('inductionEmergencyName') ? document.getElementById('inductionEmergencyName').value : inductionEmergencyName || '').trim();
  const emergencyNumber = (document.getElementById('inductionEmergencyNumber') ? document.getElementById('inductionEmergencyNumber').value : inductionEmergencyNumber || '').trim();
  if(!emergencyName || !emergencyNumber){ toast('Please enter an emergency contact name and number.'); return; }
  inductionEmergencyName = emergencyName;
  inductionEmergencyNumber = emergencyNumber;
  inductionPage = 2;
  render();
};
window.submitSiteInduction = async function(siteId){
  console.log('[SiteInduction] tap received');
  try{
    if(!ME.signature_path){ toast('Adopt your signature first.'); go('#/signature'); return; }
    if(!inductionTicks || !inductionTicks.length || !inductionTicks.every(Boolean)){ toast('Tick every item first.'); return; }
    const emergencyName = (document.getElementById('inductionEmergencyName') ? document.getElementById('inductionEmergencyName').value : inductionEmergencyName || '').trim();
    const emergencyNumber = (document.getElementById('inductionEmergencyNumber') ? document.getElementById('inductionEmergencyNumber').value : inductionEmergencyNumber || '').trim();
    if(!emergencyName || !emergencyNumber){ toast('Please enter an emergency contact name and number.'); return; }
    inductionEmergencyName = emergencyName;
    inductionEmergencyNumber = emergencyNumber;
    const allHealthAnswered = HEALTH_QUESTIONNAIRE_ITEMS.every((_,i)=> healthAnswers[i]==='yes' || healthAnswers[i]==='no');
    if(!allHealthAnswered){ toast('Please answer every health questionnaire question.'); return; }
    const allYesDetailed = HEALTH_QUESTIONNAIRE_ITEMS.every((_,i)=> healthAnswers[i]!=='yes' || (healthDetails[i]||'').trim());
    if(!allYesDetailed){ toast('Please give details for every "Yes" answer on the health questionnaire.'); return; }
    toast('Saving — building PDF…');
    const answers = {}; SITE_INDUCTION_ITEMS_LIVE().forEach((t,i)=>{ answers['item_'+i]=true; });
    answers.health = HEALTH_QUESTIONNAIRE_ITEMS.map((item,i)=>({category:item.category, question:item.question, answer:healthAnswers[i], details:healthAnswers[i]==='yes' ? (healthDetails[i]||'').trim() : null}));
    const site = SITES.find(s=>s.id===siteId);
    let built;
    try{
      built = await buildSiteInductionPdfBytes(site, ME, emergencyName, emergencyNumber, ME.signature_path, healthAnswers, healthDetails);
    }catch(e){
      console.error('[SiteInduction] PDF build failed', e);
      toast('Could not build the induction PDF — '+(e && e.message ? e.message : 'unknown error')+'. Please try again.');
      return;
    }
    if(!built){ toast('Could not build the induction PDF. Please try again.'); return; }
    toast('Saving — uploading PDF…');
    const pdfPath = siteId+'/site-inductions/'+uid()+'-'+ME.id+'.pdf';
    const stored = await uploadToStorage('mc-documents', pdfPath, new Blob([built.bytes],{type:'application/pdf'}), 'application/pdf');
    if(!stored) return; // uploadToStorage already toasted a specific reason
    toast('Saving — writing record…');
    const rows = await dbInsert('site_induction_completions', {site_id:siteId, operative_id:ME.id, answers, signature_image_path:ME.signature_path, pdf_path:stored, emergency_contact_name:emergencyName, emergency_contact_number:emergencyNumber});
    if(!rows){ toast('The PDF uploaded but the record failed to save — please try again.'); return; } // dbInsert already toasted the specific reason too
    inductionTicks = [];
    inductionEmergencyName = '';
    inductionEmergencyNumber = '';
    inductionPage = 1;
    healthAnswers = {};
    healthDetails = {};
    toast('Induction completed');
    render();
    // Best-effort push to a linked OneDrive folder — same silent-fail pattern
    // used for photo/drawing sync elsewhere in the app.
    if(site && site.site_inductions_folder_id){
      try{
        let binary=''; const chunk=0x8000;
        for(let i=0;i<built.bytes.length;i+=chunk) binary += String.fromCharCode.apply(null, built.bytes.subarray(i,i+chunk));
        const res = await sbFetchOD('/functions/v1/onedrive-upload', {method:'POST', body: JSON.stringify({
          filename: built.filename,
          content_base64: btoa(binary),
          folder_id: site.site_inductions_folder_id,
          drive_id: site.site_inductions_drive_id || undefined,
        })});
        if(res.ok){
          const d = await res.json().catch(()=>({}));
          if(d.ok) await dbUpdate('site_induction_completions', rows[0].id, {pushed_to_onedrive_at: new Date().toISOString()});
        }
      }catch(e){ /* silent — OneDrive sync is opportunistic */ }
    }
  }catch(e){
    console.error('submitSiteInduction failed', e);
    toast('Something went wrong saving your induction — please try again. If it keeps happening, check your signal and retry.');
  }
};
window.exportSiteInductionPdf = async function(completionId){
  const rows = await dbSelect('site_induction_completions', 'id=eq.'+completionId+'&select=pdf_path');
  const path = rows[0] && rows[0].pdf_path;
  if(!path){ toast('PDF not available.'); return; }
  viewDrawing(publicUrl('mc-documents', path), false, 'Site Induction.pdf');
};
window.toggleSiteInductionSelect = function(id){
  if(siteInductionSelectedIds.has(id)) siteInductionSelectedIds.delete(id); else siteInductionSelectedIds.add(id);
  render();
};
window.exportSelectedInductions = async function(){
  const ids = Array.from(siteInductionSelectedIds);
  if(!ids.length) return;
  const rows = await dbSelect('site_induction_completions', 'id=in.('+ids.join(',')+')&select=pdf_path');
  const withPdf = rows.filter(r=>r.pdf_path);
  withPdf.forEach(r=> window.open(publicUrl('mc-documents', r.pdf_path), '_blank'));
  toast(`Opened ${withPdf.length} PDF${withPdf.length===1?'':'s'}`);
};
window.emailSiteInductionPdf = async function(completionId, operativeName){
  const rows = await dbSelect('site_induction_completions', 'id=eq.'+completionId+'&select=pdf_path,site_id,operative_id');
  const row = rows[0];
  if(!row || !row.pdf_path){ toast('PDF not available.'); return; }
  const site = SITES.find(s=>s.id===row.site_id);
  const answer = await customPromptWithCc(`Email this induction PDF for ${operativeName||'this operative'} to:`, '', site);
  if(!answer) return;
  const typedTrim = (answer.value||'').trim();
  if(typedTrim && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(typedTrim)){ toast('Enter a valid email address.'); return; }
  const emailTo = resolvePromptEmailTo(answer);
  if(!emailTo) return; // nothing typed and "CC me a copy" wasn't ticked either
  const trimmed = emailTo.to;
  toast('Sending…');
  try{
    const res = await sbFetch('/functions/v1/send-site-induction-email', {method:'POST', timeoutMs:60000, body: JSON.stringify({
      site_id: row.site_id,
      recipient_email: trimmed,
      cc_email: emailTo.cc,
      client_cc_email: ccClientEmailFromPromptAnswer(answer, site),
      items: [{operative_name: operativeName || nameOf(row.operative_id), file_url: publicUrl('mc-documents', row.pdf_path)}],
    })});
    if(res && res.ok){ toast('Emailed'); } else { toast('Could not send the email — please try again.'); }
  }catch(e){ toast('Could not send the email — please try again.'); }
};
window.emailSelectedInductions = async function(){
  const ids = Array.from(siteInductionSelectedIds);
  if(!ids.length) return;
  const rows = await dbSelect('site_induction_completions', 'id=in.('+ids.join(',')+')&select=pdf_path,operative_id,site_id');
  const withPdf = rows.filter(r=>r.pdf_path);
  if(!withPdf.length){ toast('Nothing to email.'); return; }
  const site = SITES.find(s=>s.id===withPdf[0].site_id);
  const answer = await customPromptWithCc(`Email ${ids.length} selected induction${ids.length===1?'':'s'} to:`, '', site);
  if(!answer) return;
  const typedTrim = (answer.value||'').trim();
  if(typedTrim && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(typedTrim)){ toast('Enter a valid email address.'); return; }
  const emailTo = resolvePromptEmailTo(answer);
  if(!emailTo) return; // nothing typed and "CC me a copy" wasn't ticked either
  const trimmed = emailTo.to;
  toast('Sending…');
  try{
    const res = await sbFetch('/functions/v1/send-site-induction-email', {method:'POST', timeoutMs:60000, body: JSON.stringify({
      site_id: withPdf[0].site_id,
      recipient_email: trimmed,
      cc_email: emailTo.cc,
      client_cc_email: ccClientEmailFromPromptAnswer(answer, site),
      items: withPdf.map(r=>({operative_name: nameOf(r.operative_id), file_url: publicUrl('mc-documents', r.pdf_path)})),
    })});
    if(res && res.ok){ toast('Emailed'); siteInductionSelectedIds = new Set(); render(); } else { toast('Could not send the email — please try again.'); }
  }catch(e){ toast('Could not send the email — please try again.'); }
};
window.deleteSiteInductionCompletion = async function(completionId){
  if(!await customConfirm('Delete this completed induction? The operative will need to complete it again.')) return;
  const ok = await dbDelete('site_induction_completions', completionId);
  if(ok){ toast('Deleted — they can now redo their induction'); render(); }
};
window.unlinkSiteInductionsFolder = async function(siteId){
  if(!await customConfirm('Unlink this OneDrive folder? Signed inductions will stop syncing there until you link a new one.')) return;
  const row = await dbUpdate('sites', siteId, {site_inductions_folder_id: null, site_inductions_folder_name: null, site_inductions_drive_id: null});
  if(row){ const idx = SITES.findIndex(s=>s.id===siteId); if(idx>-1) SITES[idx] = row; toast('Folder unlinked'); render(); }
};
// The induction checklist lives on the organizations row (site_induction_questions),
// so adding/removing a question here updates it for every site at once —
// there's no per-site copy to keep in sync.
window.addSiteInductionQuestion = async function(){
  const inputEl = document.getElementById('siteInductionNewQuestionInput');
  const text = (inputEl ? inputEl.value : siteInductionNewQuestion || '').trim();
  if(!text){ toast('Enter a question first.'); return; }
  const updated = [...SITE_INDUCTION_ITEMS_LIVE(), text];
  const row = await dbUpdate('organizations', ORG.id, {site_induction_questions: updated});
  if(row){ ORG = row; siteInductionNewQuestion=''; toast("Question added — now on every site's induction form"); render(); }
};
window.removeSiteInductionQuestion = async function(i){
  if(!await customConfirm('Remove this question from every site\'s induction form? Operatives who already completed their induction keep their existing signed PDF as-is.')) return;
  const items = SITE_INDUCTION_ITEMS_LIVE().slice();
  items.splice(i,1);
  const row = await dbUpdate('organizations', ORG.id, {site_induction_questions: items});
  if(row){ ORG = row; toast('Removed'); render(); }
};
async function buildSiteInductionPdfBytes(site, operative, emergencyName, emergencyNumber, signaturePathOverride, healthAnswersArg, healthDetailsArg){
  if(!(await loadLib('PDFLib'))){ toast('PDF library failed to load — check connection.'); return null; }
  const pdfDoc = await PDFLib.PDFDocument.create();
  const bold = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);
  const reg = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
  const BRAND = pdfHexToRgb((ORG && ORG.color_primary) || DEFAULT_BRAND1);
  const WHITE = PDFLib.rgb(1,1,1);
  const INK = PDFLib.rgb(0.06,0.06,0.07);
  const SLATE = PDFLib.rgb(0.36,0.37,0.41);
  const OK = PDFLib.rgb(0.2,0.55,0.35);
  const PAGE_W = 595.28, PAGE_H = 841.89;
  const MARGIN = 42;
  const companyName = (ORG && ORG.name) || 'OpHUB';
  function wrapText(text, font, size, maxWidth){
    const words = String(text==null?'':text).split(/\s+/).filter(Boolean); // any whitespace, so a line break in a typed answer can't break the layout
    const lines = [];
    let cur = '';
    for(const w of words){
      const test = cur ? cur+' '+w : w;
      if(font.widthOfTextAtSize(test, size) > maxWidth && cur){ lines.push(cur); cur = w; }
      else cur = test;
    }
    if(cur) lines.push(cur);
    return lines;
  }
  let logoImg = null;
  const logoUrl = ORG && ORG.logo_path ? publicUrl('org-logos', ORG.logo_path) : null;
  if(logoUrl){
    const bytes = await pdfFetchImageBytes(logoUrl);
    if(bytes){ try{ logoImg = await pdfDoc.embedJpg(bytes); }catch(e){ try{ logoImg = await pdfDoc.embedPng(bytes); }catch(e2){} } }
  }
  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  page.drawRectangle({x:0, y:PAGE_H-92, width:PAGE_W, height:92, color:BRAND});
  if(logoImg){
    const dim = logoImg.scale(1);
    const s = 40/Math.max(dim.width, dim.height);
    const w = dim.width*s, h = dim.height*s;
    page.drawRectangle({x:MARGIN, y:PAGE_H-76, width:40, height:40, color:WHITE});
    page.drawImage(logoImg, {x:MARGIN+(40-w)/2, y:PAGE_H-76+(40-h)/2, width:w, height:h});
  }
  const textX = logoImg ? MARGIN+52 : MARGIN;
  page.drawText('SITE INDUCTION', {x:textX, y:PAGE_H-40, size:9, font:bold, color:WHITE, opacity:0.85});
  pdfDrawFit(page, pdfSiteLabel(site), {x:textX, y:PAGE_H-60, size:16, font:bold, color:WHITE});
  page.drawText(companyName, {x:textX, y:PAGE_H-76, size:9.5, font:reg, color:WHITE, opacity:0.9});
  let y = PAGE_H - 118;
  page.drawText('Operative: '+operative.name, {x:MARGIN, y, size:11, font:bold, color:INK});
  y -= 16;
  page.drawText('Completed: '+new Date().toLocaleString('en-GB'), {x:MARGIN, y, size:9.5, font:reg, color:SLATE});
  if(emergencyName || emergencyNumber){
    y -= 16;
    page.drawText('Emergency contact: '+[emergencyName, emergencyNumber].filter(Boolean).join(' — '), {x:MARGIN, y, size:9.5, font:reg, color:SLATE});
  }
  y -= 26;
  const textWidth = PAGE_W - 2*MARGIN - 24;
  for(let i=0;i<SITE_INDUCTION_ITEMS_LIVE().length;i++){
    const lines = wrapText(SITE_INDUCTION_ITEMS_LIVE()[i], reg, 10, textWidth);
    const blockH = 16 + lines.length*13;
    // Carry on to a fresh page when the checklist is longer than one — with
    // enough custom questions the items (and the signature) used to run
    // straight off the bottom of page 1.
    if(y - blockH < 60){ page = pdfDoc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN; }
    // A literal '✓' character isn't in WinAnsi (the encoding pdf-lib's
    // standard Helvetica font uses) and throws "WinAnsi cannot encode…" —
    // draw the tick as two short vector strokes instead so it never depends
    // on font glyph coverage.
    const tickBaseY = y - 11;
    page.drawLine({start:{x:MARGIN, y:tickBaseY-2}, end:{x:MARGIN+3.5, y:tickBaseY-5.5}, thickness:1.6, color:OK});
    page.drawLine({start:{x:MARGIN+3.5, y:tickBaseY-5.5}, end:{x:MARGIN+10, y:tickBaseY+3}, thickness:1.6, color:OK});
    lines.forEach((line,li)=>{
      page.drawText(line, {x:MARGIN+20, y:y-11-(li*13), size:10, font:reg, color:INK});
    });
    y -= blockH;
  }
  y -= 10;
  if(y < 130){ page = pdfDoc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN; } // room for the signature block
  page.drawText('Signature', {x:MARGIN, y, size:9, font:bold, color:SLATE});
  y -= 8;
  const signaturePathForPdf = signaturePathOverride || operative.signature_path;
  if(signaturePathForPdf){
    try{
      const bytes = await pdfFetchImageBytes(publicUrl('signatures', signaturePathForPdf));
      if(bytes){
        let img; try{ img = await pdfDoc.embedPng(bytes); }catch(e){ img = await pdfDoc.embedJpg(bytes); }
        const dim = img.scale(1);
        const boxH = 40, boxW = 160;
        const s2 = Math.min(boxW/dim.width, boxH/dim.height);
        const w = dim.width*s2, h = dim.height*s2;
        page.drawImage(img, {x:MARGIN, y:y-h, width:w, height:h});
        y -= (h+6);
      }
    }catch(e){ /* fall back to name only */ }
  }
  page.drawText(operative.name+' — '+new Date().toLocaleDateString('en-GB'), {x:MARGIN, y:y-4, size:9.5, font:reg, color:SLATE});

  // Page 2 — Health Questionnaire. Plain "Yes"/"No" text only (both are
  // safely inside WinAnsi/cp1252) — no unicode glyphs, so this can't
  // reintroduce the "WinAnsi cannot encode…" crash fixed for the checklist
  // tick (see the vector-drawn tick above).
  if(healthAnswersArg){
    let page2 = pdfDoc.addPage([PAGE_W, PAGE_H]);
    page2.drawRectangle({x:0, y:PAGE_H-70, width:PAGE_W, height:70, color:BRAND});
    page2.drawText('HEALTH QUESTIONNAIRE', {x:MARGIN, y:PAGE_H-32, size:9, font:bold, color:WHITE, opacity:0.85});
    pdfDrawFit(page2, pdfSiteLabel(site), {x:MARGIN, y:PAGE_H-52, size:14, font:bold, color:WHITE});
    let y2 = PAGE_H - 100;
    page2.drawText('Operative: '+operative.name, {x:MARGIN, y:y2, size:11, font:bold, color:INK});
    y2 -= 24;
    const textWidth2 = PAGE_W - 2*MARGIN;
    HEALTH_QUESTIONNAIRE_ITEMS.forEach((item, i)=>{
      const ans = healthAnswersArg[i] || '';
      const detail = (healthDetailsArg && healthDetailsArg[i]) || '';
      const qLines = wrapText(item.category+': '+item.question, bold, 10, textWidth2);
      const detailLines = detail ? wrapText('Details: '+detail, reg, 9.5, textWidth2) : [];
      const blockH = qLines.length*13 + 16 + (detailLines.length ? detailLines.length*12+6 : 0) + 12;
      if(y2 - blockH < 60){ page2 = pdfDoc.addPage([PAGE_W, PAGE_H]); y2 = PAGE_H - MARGIN; }
      qLines.forEach((line,li)=>{ page2.drawText(line, {x:MARGIN, y:y2-(li*13), size:10, font:bold, color:INK}); });
      y2 -= qLines.length*13 + 4;
      page2.drawText('Answer: '+(ans==='yes'?'Yes':ans==='no'?'No':'-'), {x:MARGIN, y:y2, size:10, font:reg, color: ans==='yes'?PDFLib.rgb(0.72,0.28,0.22):SLATE});
      y2 -= 16;
      if(detailLines.length){
        detailLines.forEach((line,li)=>{ page2.drawText(line, {x:MARGIN, y:y2-(li*12), size:9.5, font:reg, color:SLATE}); });
        y2 -= detailLines.length*12 + 6;
      }
      y2 -= 12;
    });
  }

  const filename = exportFilename(site.name, 'Site Induction - '+operative.name, 'pdf');
  pdfDoc.setTitle(filename.replace(/\.pdf$/i,''));
  const outBytes = await pdfDoc.save();
  return {bytes: outBytes, filename};
}

/* ---- Subcontractors ---- */
let subcoAddOpen = false;
let subcoNewName = '';
async function renderSubcontractors(siteId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  const canAdd = isManager(ME);
  const __pMine = (!canAdd && !isClient(ME)) ? getMySubcontractorCompanyId(siteId) : Promise.resolve(null);
  const __pLinks = canAdd ? dbSelect('subcontractor_companies', 'org_id=eq.'+site.org_id+'&select=master_company_id') : Promise.resolve([]);
  const companies = await dbSelect('subcontractor_companies', 'site_id=eq.'+siteId+'&order=created_at.asc');
  // Everyone can see the full list, but a subcontractor operative can only
  // open their own company's tile — the others are shown but not clickable.
  const mySubCompanyId = await __pMine;
  const canOpen = c => canAdd || isClient(ME) || c.id === mySubCompanyId;
  // A company's name can only be edited here if it isn't "from the library"
  // — i.e. its master profile (subcontractor_company_profiles) isn't shared
  // with any other site. Renaming a shared/library company from inside one
  // site's tile would silently rename it everywhere, so that has to happen
  // from the Company Library instead (Settings & Admin).
  let masterUsageCount = {};
  if(canAdd && companies.some(c=>c.master_company_id)){
    const allLinks = await __pLinks;
    allLinks.forEach(l=>{ if(l.master_company_id) masterUsageCount[l.master_company_id] = (masterUsageCount[l.master_company_id]||0)+1; });
  }
  const isEditable = c => canAdd && (!c.master_company_id || (masterUsageCount[c.master_company_id]||0) <= 1);
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <p class="stub" style="margin:0 0 14px;">Each subcontractor gets their own tile with RAMS, COSHH, Toolbox Talks, Daily Briefings and their own operatives — only operatives allocated to a company can open that company's tile.</p>
    ${companies.map(c=>`
      <div class="sitecard" style="${canOpen(c)?'cursor:pointer;':'opacity:.55;'}" onclick="${canOpen(c)?`go('#/site/${siteId}/mc/subcontractors/${c.id}')`:`toast("You don't have access to this subcontractor.")`}">
        <div class="swatch">${operativeInitials(c.name)}</div>
        <div class="info"><div class="name">${escapeHtml(c.name)}</div></div>
        ${isEditable(c) ? `<div class="taskicon" title="Rename" onclick="event.stopPropagation();renameSubcontractorCompany('${siteId}','${c.id}','${c.master_company_id||''}','${jsAttr(c.name)}')">✏️</div>` : ''}
        ${canAdd ? `<div class="taskicon danger" title="Remove" onclick="event.stopPropagation();deleteSubcontractorCompany('${c.id}','${jsAttr(c.name)}')">🗑</div>` : ''}
      </div>
    `).join('') || `<div class="empty">No subcontractors added yet.</div>`}
    ${canAdd ? (subcoAddOpen ? `
      <div class="card" style="margin-top:10px;">
        <div class="formfield" style="margin-top:0;"><input type="text" id="subcoNewNameInput" placeholder="e.g. Acme Scaffolding" value="${escapeHtml(subcoNewName)}" oninput="subcoNewName=this.value"></div>
        <div class="row-gap"><button class="ghostbtn" style="flex:1;" onclick="subcoAddOpen=false;render();">Cancel</button><button class="darkbtn" style="flex:1;" onclick="addSubcontractorCompany('${siteId}')">Add</button></div>
      </div>
    ` : `<button class="ghostbtn" style="margin-top:10px;" onclick="subcoAddOpen=true;subcoNewName='';render();">+ Add Subcontractor</button>`) : ''}
  `, {title:'Subcontractors', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/mc`, siteId, activeTab:'more'}); }
}
window.addSubcontractorCompany = async function(siteId){
  const name = (document.getElementById('subcoNewNameInput')||{}).value ? document.getElementById('subcoNewNameInput').value.trim() : subcoNewName.trim();
  if(!name){ toast('Enter a company name.'); return; }
  const site = SITES.find(s=>s.id===siteId);
  // #411: find-or-create the org-level "master" company profile by exact
  // name match, so a company's library documents (insurance, accreditations
  // etc.) persist across every site that company is chosen for, instead of
  // each site's subcontractor_companies row starting with an empty folder.
  let masterId = null;
  const existingMaster = await dbSelect('subcontractor_company_profiles', 'org_id=eq.'+site.org_id+'&name=eq.'+encodeURIComponent(name)+'&select=id');
  if(existingMaster.length){ masterId = existingMaster[0].id; }
  else {
    const createdMaster = await dbInsert('subcontractor_company_profiles', {org_id: site.org_id, name, created_by:ME.id});
    if(createdMaster) masterId = createdMaster[0].id;
  }
  const rows = await dbInsert('subcontractor_companies', {org_id: site.org_id, site_id:siteId, name, created_by:ME.id, master_company_id: masterId});
  if(rows){ subcoAddOpen=false; subcoNewName=''; toast('Subcontractor added'); render(); }
};
window.deleteSubcontractorCompany = async function(id, name){
  if(!await customConfirm(`Remove "${name}" and everything in their folder? This can't be undone.`)) return;
  const ok = await dbDelete('subcontractor_companies', id);
  if(ok){ toast('Removed'); render(); }
};
window.renameSubcontractorCompany = async function(siteId, companyId, masterCompanyId, currentName){
  const next = await customPrompt('Rename subcontractor', currentName);
  if(!next || !next.trim() || next.trim()===currentName) return;
  const name = next.trim();
  const row = await dbUpdate('subcontractor_companies', companyId, {name});
  if(!row) return;
  // Not "from the library" only ever means this master profile is used by
  // no other site, so it's safe to keep the shared master's own name in
  // sync too — this is the one and only place it's used.
  if(masterCompanyId) await dbUpdate('subcontractor_company_profiles', masterCompanyId, {name});
  toast('Renamed'); render();
};
async function renderSubcontractorHub(siteId, companyId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  const rows = await dbSelect('subcontractor_companies', 'id=eq.'+companyId+'&select=*');
  const company = rows[0];
  if(!company){ go(`#/site/${siteId}/mc/subcontractors`); return; }
  const [ramsRows, coshhRows, tbtRows, briefingRows, opRows, scheduleRows, openPermitRows, inspectionRows] = await Promise.all([
    dbSelect('rams_docs', 'subcontractor_company_id=eq.'+companyId+'&status=eq.current&select=id'),
    dbSelect('coshh_docs', 'subcontractor_company_id=eq.'+companyId+'&select=id'),
    dbSelect('toolbox_talks', 'subcontractor_company_id=eq.'+companyId+'&status=eq.live&select=id'),
    dbSelect('subcontractor_briefings', 'subcontractor_company_id=eq.'+companyId+'&select=id'),
    dbSelect('subcontractor_operatives', 'subcontractor_company_id=eq.'+companyId+'&select=user_id'),
    dbSelect('schedule_tasks', 'site_id=eq.'+siteId+'&subcontractor_company_id=eq.'+companyId+'&select=status'),
    dbSelect('permits', 'subcontractor_company_id=eq.'+companyId+'&status=eq.open&select=id'),
    dbSelect('subcontractor_inspections', 'subcontractor_company_id=eq.'+companyId+'&select=id'),
  ]);
  const scheduleDone = scheduleRows.filter(t=>t.status==='done').length;
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <div class="tilegrid" style="grid-auto-rows:1fr;">
      <div class="tile" onclick="go('#/site/${siteId}/mc/subcontractors/${companyId}/rams')"><div class="icon" style="background:#E7E9EE;color:var(--ink);">📄</div><div class="lbl">RAMS</div><div class="sub">${ramsRows.length} document${ramsRows.length===1?'':'s'}</div></div>
      <div class="tile" onclick="go('#/site/${siteId}/mc/subcontractors/${companyId}/coshh')"><div class="icon" style="background:#E7E9EE;color:var(--ink);">🧪</div><div class="lbl">COSHH</div><div class="sub">${coshhRows.length} document${coshhRows.length===1?'':'s'}</div></div>
      <div class="tile" onclick="go('#/site/${siteId}/mc/subcontractors/${companyId}/tbt')"><div class="icon" style="background:#E7E9EE;color:var(--ink);">📢</div><div class="lbl">TBT</div><div class="sub">${tbtRows.length} live</div></div>
      <div class="tile" onclick="go('#/site/${siteId}/mc/subcontractors/${companyId}/schedule')"><div class="icon" style="background:#E7E9EE;color:var(--ink);">📋</div><div class="lbl">Schedule of Works</div><div class="sub">${scheduleDone} of ${scheduleRows.length} complete</div></div>
      <div class="tile" onclick="go('#/site/${siteId}/mc/subcontractors/${companyId}/permits')"><div class="icon" style="background:#E7E9EE;color:var(--ink);">🧾</div><div class="lbl">Permits To Work</div><div class="sub">${openPermitRows.length ? openPermitRows.length+' open' : 'None open'}</div></div>
      <div class="tile" onclick="go('#/site/${siteId}/mc/subcontractors/${companyId}/inspections')"><div class="icon" style="background:#E7E9EE;color:var(--ink);">🔍</div><div class="lbl">Inspections</div><div class="sub">${inspectionRows.length} file${inspectionRows.length===1?'':'s'}</div></div>
      <div class="tile" onclick="go('#/site/${siteId}/mc/subcontractors/${companyId}/briefings')"><div class="icon" style="background:#E7E9EE;color:var(--ink);">📝</div><div class="lbl">Daily Briefings</div><div class="sub">${briefingRows.length} logged</div></div>
      <div class="tile" onclick="go('#/site/${siteId}/mc/subcontractors/${companyId}/operatives')"><div class="icon" style="background:#E7E9EE;color:var(--ink);">👷</div><div class="lbl">Operatives</div><div class="sub">${opRows.length} allocated</div></div>
    </div>
  `, {title:company.name, subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/mc/subcontractors`, siteId, activeTab:'more'}); }
}
// RTB's own PM/admin has exactly the same upload rights inside a
// subcontractor's tile as they do on RTB's own documents (RAMS, COSHH,
// Toolbox Talks, Daily Briefings) — isSubcontractorAdmin additionally lets
// the subcontractor's own designated "admin" operative (see
// renderSubOperatives) upload on their own company's behalf too.
async function isSubcontractorAdmin(companyId){
  if(isManager(ME) || isClient(ME)) return false;
  const rows = await dbSelect('subcontractor_operatives', 'subcontractor_company_id=eq.'+companyId+'&user_id=eq.'+ME.id+'&is_admin=eq.true&select=id&limit=1');
  return rows.length>0;
}
async function fetchSubRamsData(siteId, companyId){
  const site = SITES.find(s=>s.id===siteId);
  const [docs, assigned] = await Promise.all([
    dbSelect('rams_docs', 'site_id=eq.'+siteId+'&subcontractor_company_id=eq.'+companyId+'&status=eq.current&order=uploaded_at.desc'),
    dbSelect('subcontractor_operatives', 'subcontractor_company_id=eq.'+companyId+'&select=user_id'),
  ]);
  let sigsByDoc = {};
  if(docs.length){
    const ids = docs.map(d=>d.id).join(',');
    let sigs = await dbSelect('rams_signatures', 'rams_id=in.('+ids+')');
    sigs = filterCurrentCycleSigs(sigs, docs, 'rams_id', site);
    sigs.forEach(s=>{ (sigsByDoc[s.rams_id]=sigsByDoc[s.rams_id]||[]).push(s); });
  }
  return {docs, sigsByDoc, assignedIds: assigned.map(a=>a.user_id)};
}
async function renderSubRams(siteId, companyId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  // Started together rather than one after another.
  const __pProfiles = loadAllProfiles();
  const __pSubAdmin = isSubcontractorAdmin(companyId);
  const company = (await dbSelect('subcontractor_companies', 'id=eq.'+companyId+'&select=*'))[0];
  if(!company){ go(`#/site/${siteId}/mc/subcontractors`); return; }
  const isSubAdmin = await __pSubAdmin;
  // "canAdd" here only controls the display mode (static signed-count
  // summary vs a personal sign box) and the delete icon — RTB's PM/admin and
  // the subcontractor's own admin both get that view; uploading itself is
  // restricted further below to the subcontractor admin only, since RTB no
  // longer puts files into a subcontractor's folder.
  const canAdd = isManager(ME) || isSubAdmin;
  await __pProfiles;
  const {docs, sigsByDoc, assignedIds} = await fetchSubRamsData(siteId, companyId);
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    ${ramsDocsHtml(siteId, docs, sigsByDoc, canAdd, assignedIds, site, false)}
    ${canAdd ? `
    <div class="card" style="margin-top:14px;">
      <p class="sectiontitle" style="margin-top:0;">Upload RAMS</p>
      <div class="formfield" style="margin-top:0;"><input type="text" id="subRamsName" placeholder="Document name"></div>
      <div class="ghostbtn" style="cursor:pointer;text-align:center;margin-bottom:10px;" onclick="document.getElementById('subRamsFile').click()">Choose PDF</div>
      <input type="file" accept="application/pdf" id="subRamsFile" style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;" onchange="document.getElementById('subRamsFileName').textContent=this.files[0]?this.files[0].name:''">
      <p class="stub" id="subRamsFileName" style="margin:-4px 0 10px;"></p>
      <button class="darkbtn" onclick="addSubRams('${siteId}','${companyId}')">Upload</button>
    </div>
    ` : ''}
  `, {title:company.name+' — RAMS', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/mc/subcontractors/${companyId}`, siteId, activeTab:'more'}); }
}
window.addSubRams = async function(siteId, companyId){
  const name = document.getElementById('subRamsName').value.trim();
  const fileInput = document.getElementById('subRamsFile');
  const file = fileInput.files && fileInput.files[0];
  if(!name || !file){ toast('Add a name and choose a PDF.'); return; }
  const path = siteId+'/subcontractor-rams/'+companyId+'/'+uid()+'-'+file.name.replace(/[^a-z0-9.\-]+/gi,'_');
  const stored = await uploadToStorage('rams-docs', path, file, 'application/pdf');
  if(!stored) return;
  const rows = await dbInsert('rams_docs', {site_id:siteId, subcontractor_company_id:companyId, name, storage_path:stored, uploaded_by:ME.id, doc_type:'RAMS'});
  if(rows){ toast('RAMS uploaded'); render(); }
};
async function fetchSubCoshhData(siteId, companyId){
  const site = SITES.find(s=>s.id===siteId);
  const [docs, assigned] = await Promise.all([
    dbSelect('coshh_docs', 'site_id=eq.'+siteId+'&subcontractor_company_id=eq.'+companyId+'&order=uploaded_at.desc'),
    dbSelect('subcontractor_operatives', 'subcontractor_company_id=eq.'+companyId+'&select=user_id'),
  ]);
  let sigsByDoc = {};
  if(docs.length){
    const ids = docs.map(d=>d.id).join(',');
    let sigs = await dbSelect('coshh_signatures', 'coshh_id=in.('+ids+')');
    sigs = filterCurrentCycleSigs(sigs, docs, 'coshh_id', site);
    sigs.forEach(s=>{ (sigsByDoc[s.coshh_id]=sigsByDoc[s.coshh_id]||[]).push(s); });
  }
  return {docs, sigsByDoc, assignedIds: assigned.map(a=>a.user_id)};
}
async function renderSubCoshh(siteId, companyId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  // Started together rather than one after another.
  const __pProfiles = loadAllProfiles();
  const __pSubAdmin = isSubcontractorAdmin(companyId);
  const company = (await dbSelect('subcontractor_companies', 'id=eq.'+companyId+'&select=*'))[0];
  if(!company){ go(`#/site/${siteId}/mc/subcontractors`); return; }
  const isSubAdmin = await __pSubAdmin;
  const canAdd = isManager(ME) || isSubAdmin;
  await __pProfiles;
  const {docs, sigsByDoc, assignedIds} = await fetchSubCoshhData(siteId, companyId);
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    ${coshhDocsHtml(siteId, docs, sigsByDoc, canAdd, assignedIds, site, false)}
    ${canAdd ? `
    <div class="card" style="margin-top:14px;">
      <p class="sectiontitle" style="margin-top:0;">Upload COSHH</p>
      <div class="formfield" style="margin-top:0;"><input type="text" id="subCoshhName" placeholder="Document name"></div>
      <div class="ghostbtn" style="cursor:pointer;text-align:center;margin-bottom:10px;" onclick="document.getElementById('subCoshhFile').click()">Choose PDF</div>
      <input type="file" accept="application/pdf" id="subCoshhFile" style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;" onchange="document.getElementById('subCoshhFileName').textContent=this.files[0]?this.files[0].name:''">
      <p class="stub" id="subCoshhFileName" style="margin:-4px 0 10px;"></p>
      <button class="darkbtn" onclick="addSubCoshh('${siteId}','${companyId}')">Upload</button>
    </div>
    ` : ''}
  `, {title:company.name+' — COSHH', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/mc/subcontractors/${companyId}`, siteId, activeTab:'more'}); }
}
window.addSubCoshh = async function(siteId, companyId){
  const name = document.getElementById('subCoshhName').value.trim();
  const fileInput = document.getElementById('subCoshhFile');
  const file = fileInput.files && fileInput.files[0];
  if(!name || !file){ toast('Add a name and choose a PDF.'); return; }
  const path = siteId+'/subcontractor-coshh/'+companyId+'/'+uid()+'-'+file.name.replace(/[^a-z0-9.\-]+/gi,'_');
  const stored = await uploadToStorage('coshh-docs', path, file, 'application/pdf');
  if(!stored) return;
  const rows = await dbInsert('coshh_docs', {site_id:siteId, subcontractor_company_id:companyId, name, storage_path:stored, uploaded_by:ME.id});
  if(rows){ toast('COSHH uploaded'); render(); }
};
// Subcontractor Toolbox Talks — deliberately simpler than the main site's
// Bank/Live/Completed workflow: uploaded straight in as 'live' (issued
// immediately) since a subcontractor's own crew is a small, fixed roster.
async function renderSubTbt(siteId, companyId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  // Started together rather than one after another.
  const __pSubAdmin = isSubcontractorAdmin(companyId);
  const __pList = dbSelect('toolbox_talks', 'subcontractor_company_id=eq.'+companyId+'&order=created_at.desc');
  const company = (await dbSelect('subcontractor_companies', 'id=eq.'+companyId+'&select=*'))[0];
  if(!company){ go(`#/site/${siteId}/mc/subcontractors`); return; }
  const isSubAdmin = await __pSubAdmin;
  const canAdd = isManager(ME) || isSubAdmin;
  const talks = await __pList;
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    ${talks.map(t=>`
      <div class="card" style="margin-bottom:10px;cursor:pointer;" onclick="go('#/site/${siteId}/mc/subcontractors/${companyId}/tbt/${t.id}')">
        <div class="top" style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div><div class="title">${escapeHtml(t.title)}</div><div class="loc">${new Date(t.created_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</div></div>
          <span class="statustag2 ${TBT_STATUS_CLASS[t.status]||'closed'}">${TBT_STATUS_LABEL[t.status]||t.status}</span>
        </div>
      </div>
    `).join('') || `<div class="empty">No toolbox talks yet.</div>`}
    ${canAdd ? `
    <div class="card" style="margin-top:10px;">
      <p class="sectiontitle" style="margin-top:0;">Issue a toolbox talk</p>
      <div class="formfield" style="margin-top:0;"><input type="text" id="subTbtTitle" placeholder="Title, e.g. Working at Height"></div>
      <div class="ghostbtn" style="cursor:pointer;text-align:center;margin-bottom:10px;" onclick="document.getElementById('subTbtFile').click()">Choose PDF</div>
      <input type="file" accept="application/pdf" id="subTbtFile" style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;" onchange="document.getElementById('subTbtFileName').textContent=this.files[0]?this.files[0].name:''">
      <p class="stub" id="subTbtFileName" style="margin:-4px 0 10px;"></p>
      <button class="darkbtn" onclick="addSubToolboxTalk('${siteId}','${companyId}')">Issue</button>
    </div>
    ` : ''}
  `, {title:company.name+' — Toolbox Talks', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/mc/subcontractors/${companyId}`, siteId, activeTab:'more'}); }
}
window.addSubToolboxTalk = async function(siteId, companyId){
  const title = document.getElementById('subTbtTitle').value.trim();
  const fileInput = document.getElementById('subTbtFile');
  const file = fileInput.files && fileInput.files[0];
  if(!title || !file){ toast('Add a title and choose a PDF.'); return; }
  const path = siteId+'/subcontractor-tbt/'+companyId+'/'+uid()+'-'+file.name.replace(/[^a-z0-9.\-]+/gi,'_');
  const stored = await uploadToStorage('rams-docs', path, file, 'application/pdf');
  if(!stored) return;
  const rows = await dbInsert('toolbox_talks', {site_id:siteId, subcontractor_company_id:companyId, title, storage_path:stored, status:'live', created_by:ME.id});
  if(rows){ toast('Toolbox Talk issued'); render(); }
};
/* ---- Subcontractor's own filtered Schedule of Works — same schedule_tasks
   rows as the main SOW (see the "🏗 Assign Subcontractor" picker in
   taskRowHtml), just filtered to this company. Reuses taskRowHtml/
   setTaskStatus/beginTaskComplete/completeTaskWithPhotos/taskPhoto directly
   so a status change or photo add here is the exact same write the main SOW
   reads back — there's nothing to keep "in sync" because it's one row, not a
   copy. canAdd is intentionally false for everyone here (no edit/delete/
   reassign) — RTB's PM/admin can still see and act on these tasks from the
   main Schedule of Works page; this tile is deliberately read+update-status
   only for the subcontractor's own team. */
let subScheduleFilter = 'all';
async function renderSubSchedule(siteId, companyId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  const company = (await dbSelect('subcontractor_companies', 'id=eq.'+companyId+'&select=*'))[0];
  if(!company){ go(`#/site/${siteId}/mc/subcontractors`); return; }
  const allTasks = await dbSelect('schedule_tasks', 'site_id=eq.'+siteId+'&subcontractor_company_id=eq.'+companyId+'&order=position.asc.nullslast,created_at.asc');
  let photosByTask = {};
  if(allTasks.length){
    const ids = allTasks.map(t=>t.id).join(',');
    const photos = await dbSelect('schedule_photos', 'task_id=in.('+ids+')&order=uploaded_at.asc');
    photos.forEach(p=>{ (photosByTask[p.task_id]=photosByTask[p.task_id]||[]).push(p); });
  }
  const tasks = subScheduleFilter==='all' ? allTasks
    : subScheduleFilter==='progress' ? allTasks.filter(t=>t.status==='progress'||t.status==='done')
    : allTasks.filter(t=>t.status===subScheduleFilter);
  const isMultiSite = !!(site && site.multi_site);
  const subAddressesList = isMultiSite ? await dbSelect('site_sub_addresses', 'site_id=eq.'+siteId+'&order=name.asc') : [];
  const subAddrById = {}; subAddressesList.forEach(a=>{ subAddrById[a.id] = a; });
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <p class="stub" style="margin:0 0 14px;">Only the work items assigned to ${escapeHtml(company.name)} — updates here show straight away on RTB's main Schedule of Works, and anything RTB assigns or updates shows here the same way.</p>
    <div class="filterrow">
      ${['all','todo','progress'].map(k=>`<div class="filterchip ${subScheduleFilter===k?'active':''}" onclick="subScheduleFilter='${k}';render()">${k==='all'?'All':k==='todo'?'To Do':'In Progress / Complete'}</div>`).join('')}
    </div>
    ${tasks.length ? tasks.map(t=>taskRowHtml(siteId,t,false,photosByTask,isMultiSite,subAddrById,subAddressesList,[company],false)).join('') : `<div class="empty">No work items assigned to ${escapeHtml(company.name)} yet${subScheduleFilter!=='all'?' for this filter':''}.</div>`}
    <div id="subScheduleLiveMarker" style="display:none;"></div>
  `, {title:company.name+' — Schedule of Works', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/mc/subcontractors/${companyId}`, siteId, activeTab:'more'}); }

  // Same full-page-refresh live poll as the main SOW page (see
  // renderSchedule) — skipped while any inline task editor/picker is open.
  if(subSchedulePollTimer){ clearInterval(subSchedulePollTimer); subSchedulePollTimer = null; }
}
async function renderSubBriefings(siteId, companyId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  // Started together rather than one after another.
  const __pProfiles = loadAllProfiles();
  const __pSubAdmin = isSubcontractorAdmin(companyId);
  const __pList = dbSelect('subcontractor_briefings', 'subcontractor_company_id=eq.'+companyId+'&order=submitted_at.desc');
  const company = (await dbSelect('subcontractor_companies', 'id=eq.'+companyId+'&select=*'))[0];
  if(!company){ go(`#/site/${siteId}/mc/subcontractors`); return; }
  const isSubAdmin = await __pSubAdmin;
  const canManageEntries = isManager(ME) || isSubAdmin; // delete/oversight — RTB can still remove a bad entry
  await __pProfiles;
  const briefings = await __pList;
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    ${briefings.map(b=>`
      <div class="card" style="margin-bottom:8px;">
        <div class="name" style="font-weight:700;">${escapeHtml(b.title)}</div>
        <div class="meta">${escapeHtml(nameOf(b.submitted_by))} · ${new Date(b.submitted_at).toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'})}</div>
        ${b.storage_path ? `<div class="viewlink" style="cursor:pointer;" onclick="viewDrawing('${publicUrl('rams-docs', b.storage_path)}', false, '${jsAttr(/\.pdf$/i.test(b.title)?b.title:b.title+'.pdf')}')">View document ↗</div>` : ''}
        ${canManageEntries ? `<div class="taskicon danger" style="margin-top:6px;" onclick="deleteSubBriefing('${b.id}')">🗑</div>` : ''}
      </div>
    `).join('') || `<div class="empty">No daily briefings logged yet.</div>`}
    ${canManageEntries ? `
    <div class="card" style="margin-top:10px;">
      <p class="sectiontitle" style="margin-top:0;">Log a briefing</p>
      <div class="formfield" style="margin-top:0;"><input type="text" id="subBriefTitle" placeholder="e.g. Monday morning briefing"></div>
      <div class="ghostbtn" style="cursor:pointer;text-align:center;margin-bottom:10px;" onclick="document.getElementById('subBriefFile').click()">Choose PDF (optional)</div>
      <input type="file" accept="application/pdf" id="subBriefFile" style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;" onchange="document.getElementById('subBriefFileName').textContent=this.files[0]?this.files[0].name:''">
      <p class="stub" id="subBriefFileName" style="margin:-4px 0 10px;"></p>
      <button class="darkbtn" onclick="addSubBriefing('${siteId}','${companyId}')">Log Briefing</button>
    </div>
    ` : ''}
  `, {title:company.name+' — Daily Briefings', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/mc/subcontractors/${companyId}`, siteId, activeTab:'more'}); }
}
window.addSubBriefing = async function(siteId, companyId){
  const title = document.getElementById('subBriefTitle').value.trim();
  if(!title){ toast('Add a title.'); return; }
  const fileInput = document.getElementById('subBriefFile');
  const file = fileInput.files && fileInput.files[0];
  let storagePath = null;
  if(file){
    const path = siteId+'/subcontractor-briefings/'+companyId+'/'+uid()+'-'+file.name.replace(/[^a-z0-9.\-]+/gi,'_');
    storagePath = await uploadToStorage('rams-docs', path, file, 'application/pdf');
    if(!storagePath) return;
  }
  const rows = await dbInsert('subcontractor_briefings', {subcontractor_company_id:companyId, site_id:siteId, title, storage_path:storagePath, submitted_by:ME.id});
  if(rows){ toast('Briefing logged'); render(); }
};
window.deleteSubBriefing = async function(id){
  if(!await customConfirm('Delete this briefing?')) return;
  const ok = await dbDelete('subcontractor_briefings', id);
  if(ok){ toast('Deleted'); render(); }
};
async function renderSubOperatives(siteId, companyId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  // Started together rather than one after another.
  const __pProfiles = loadAllProfiles();
  const company = (await dbSelect('subcontractor_companies', 'id=eq.'+companyId+'&select=*'))[0];
  if(!company){ go(`#/site/${siteId}/mc/subcontractors`); return; }
  const canAdd = isManager(ME);
  await __pProfiles;
  const [allocated, siteAssignments, allSubOpRows] = await Promise.all([
    dbSelect('subcontractor_operatives', 'subcontractor_company_id=eq.'+companyId+'&select=*'),
    dbSelect('site_assignments', 'site_id=eq.'+siteId+'&select=user_id'),
    dbSelect('subcontractor_operatives', 'site_id=eq.'+siteId+'&select=user_id'),
  ]);
  const allocatedIds = new Set(allocated.map(a=>a.user_id));
  const alreadyElsewhere = new Set(allSubOpRows.map(a=>a.user_id));
  // Only operatives assigned to this site, and not already allocated to a
  // (possibly different) subcontractor company here, can be picked — each
  // operative belongs to at most one subcontractor company per site.
  const pickable = siteAssignments.map(a=>PROFILES[a.user_id]).filter(p=>p && p.role==='operative' && !alreadyElsewhere.has(p.id)).sort((a,b)=>a.name.localeCompare(b.name));
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <p class="stub" style="margin:0 0 12px;">RTB's own PM/admin and the subcontractor admin can upload RAMS, COSHH, Toolbox Talks and Daily Briefings into this folder — everyone else allocated here just views and signs, the same as an RTB operative does on the main site.</p>
    ${allocated.map(a=>`
      <div class="sitecard">
        <div class="swatch personswatch">${escapeHtml((nameOf(a.user_id)||'?').split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase())}</div>
        <div class="info"><div class="name">${escapeHtml(nameOf(a.user_id))}</div><div class="addr">${a.is_admin ? '⭐ Subcontractor admin' : ''}</div></div>
        ${canAdd ? `
        <button class="ghostbtn" style="width:auto;padding:6px 10px;font-size:11.5px;" onclick="toggleSubOperativeAdmin('${a.id}', ${!a.is_admin})">${a.is_admin ? 'Remove admin' : 'Make admin'}</button>
        <button class="ghostbtn" style="width:auto;padding:6px 10px;font-size:11.5px;" onclick="removeSubOperative('${a.id}')">Remove</button>
        ` : ''}
      </div>
    `).join('') || `<div class="empty">No operatives allocated yet.</div>`}
    ${canAdd ? `
    <div class="card" style="margin-top:14px;">
      <p class="sectiontitle" style="margin-top:0;">Allocate an operative</p>
      <p class="stub" style="margin:0 0 8px;">Only operatives already assigned to this site, and not already with another subcontractor here, are listed.</p>
      <select id="subOpPicker">
        <option value="">Choose an operative…</option>
        ${pickable.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
      </select>
      <label class="stub" style="display:flex;align-items:center;gap:6px;margin:8px 0 0;"><input type="checkbox" id="subOpAsAdmin" style="width:auto;">Make this their subcontractor admin (upload rights)</label>
      <button class="darkbtn" style="margin-top:8px;" onclick="addSubOperative('${siteId}','${companyId}')">Allocate</button>
    </div>
    ` : ''}
  `, {title:company.name+' — Operatives', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/mc/subcontractors/${companyId}`, siteId, activeTab:'more'}); }
}
window.addSubOperative = async function(siteId, companyId){
  const sel = document.getElementById('subOpPicker');
  const userId = sel ? sel.value : '';
  if(!userId){ toast('Choose an operative.'); return; }
  const asAdmin = document.getElementById('subOpAsAdmin') && document.getElementById('subOpAsAdmin').checked;
  const rows = await dbInsert('subcontractor_operatives', {site_id:siteId, subcontractor_company_id:companyId, user_id:userId, assigned_by:ME.id, is_admin:!!asAdmin});
  if(rows){ toast('Allocated'); subOpCache = {}; render(); }
};
window.toggleSubOperativeAdmin = async function(rowId, makeAdmin){
  const row = await dbUpdate('subcontractor_operatives', rowId, {is_admin: makeAdmin});
  if(row){ toast(makeAdmin ? 'Now the subcontractor admin' : 'Admin removed'); render(); }
};
window.removeSubOperative = async function(rowId){
  if(!await customConfirm('Remove this operative from the subcontractor?')) return;
  const ok = await dbDelete('subcontractor_operatives', rowId);
  if(ok){ toast('Removed'); subOpCache = {}; render(); }
};
