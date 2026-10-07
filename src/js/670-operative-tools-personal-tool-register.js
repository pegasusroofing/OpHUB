/* ================= OPERATIVE TOOLS (personal tool register) =================
   Every operative's own log of the power tools they use — name, serial/item
   number, and a photo. Never its own H&S tile: the entry point is a small
   "My Tools" link inside H&S (always about the current user's own tools),
   plus an "Operative Tools" browse section at the bottom of the Operatives
   list (#/operatives) for PM/Admin oversight of everyone's — also editable
   per-operative on their own page. PUWER Tool Inspections snapshot from here at
   fill time, so a tool renamed/removed later doesn't rewrite past reports. */
let myToolsAddOpen = false;
let myToolsPhotoFile = null; // File staged for the add-tool form until Save is tapped
// Name/serial are plain uncontrolled inputs (read from the DOM on Save) so
// typing never needs a re-render — but choosing a photo DOES re-render (to
// show "Photo chosen: ..."), and a full render() replaces that input markup.
// These drafts capture whatever's currently typed right before that re-render
// so the fresh markup can be seeded with it instead of coming back blank.
let myToolsNameDraft = '';
let myToolsSerialDraft = '';
window.onMyToolPhotoChosen = function(input){
  const nameEl = document.getElementById('myToolName'), serialEl = document.getElementById('myToolSerial');
  if(nameEl) myToolsNameDraft = nameEl.value;
  if(serialEl) myToolsSerialDraft = serialEl.value;
  myToolsPhotoFile = (input.files && input.files[0]) || null;
  render();
};
window.addMyTool = async function(){
  const name = document.getElementById('myToolName').value.trim();
  const serial = document.getElementById('myToolSerial').value.trim();
  if(!name){ toast('Enter a tool name.'); return; }
  let photoPath = null;
  if(myToolsPhotoFile){
    let dataUrl;
    try{ dataUrl = await compressImage(myToolsPhotoFile); }
    catch(e){ toast('Could not process that photo — tool was not saved.'); return; }
    photoPath = await uploadDataUrl('operative-tools', ME.org_id+'/'+ME.id+'/'+crypto.randomUUID()+'.jpg', dataUrl);
    if(!photoPath){ toast('Photo failed to upload — check your connection and try again.'); return; }
  }
  const rows = await dbInsert('operative_tools', {org_id:ME.org_id, user_id:ME.id, name, serial_number:serial||null, photo_path:photoPath, created_by:ME.id});
  if(rows){ toast('Tool added'); myToolsAddOpen=false; myToolsPhotoFile=null; myToolsNameDraft=''; myToolsSerialDraft=''; render(); }
};
// Add/replace a photo on an ALREADY-EXISTING tool record (edit path — #252).
// Uploads straight away and patches photo_path, no separate "save" step.
let myToolsEditPhotoBusyId = null;
window.onMyToolEditPhotoChosen = async function(input, toolId){
  const file = input.files && input.files[0];
  if(!file) return;
  myToolsEditPhotoBusyId = toolId; render();
  let photoPath = null;
  try{
    const dataUrl = await compressImage(file);
    photoPath = await uploadDataUrl('operative-tools', ME.org_id+'/'+ME.id+'/'+crypto.randomUUID()+'.jpg', dataUrl);
  }catch(e){ photoPath = null; }
  if(photoPath) await dbUpdate('operative_tools', toolId, {photo_path:photoPath});
  myToolsEditPhotoBusyId = null;
  toast(photoPath ? 'Photo updated' : 'Photo upload failed');
  render();
};
// Shared by "My Tools" (deleting your own) and Admin Centre's Operative
// Tools browser (PM/Admin deleting anyone's) — RLS allows both.
window.deleteOperativeTool = async function(toolId, photoPath){
  if(!await customConfirm('Delete this tool? This can\'t be undone.')) return;
  const ok = await dbDelete('operative_tools', toolId);
  if(ok){
    if(photoPath){ try{ await sbFetch('/storage/v1/object/operative-tools/'+photoPath, {method:'DELETE'}); }catch(e){} }
    toast('Tool deleted');
    render();
  }
};
// My Tools content is shared by the site-scoped legacy entry point
// (renderMyTools, kept so the existing H&S tile link keeps working) and the
// new dedicated Operative Dashboard (renderOperativeDashboard) it now
// primarily lives under — tools were always per-operative, not per-site, so
// the markup itself never needed a siteId.
function myToolsBodyHtml(tools, compact){
  const cardPad = compact ? '8px 10px' : '12px 14px';
  const imgSize = compact ? 36 : 48;
  const nameSize = compact ? '12.5px' : '14px';
  return `
    <p class="stub" style="margin:0 0 14px;">Your own power tools — name, serial/item number, and a photo. Used to auto-populate PUWER Tool Inspections.</p>
    ${tools.map(t=>`
      <div class="card" style="display:flex;align-items:center;gap:${compact?'8px':'10px'};padding:${cardPad};margin-bottom:${compact?'6px':'10px'};">
        ${t.photo_path ? `<img src="${publicUrl('operative-tools', t.photo_path)}" style="width:${imgSize}px;height:${imgSize}px;object-fit:cover;border-radius:8px;flex:0 0 ${imgSize}px;border:1px solid var(--line);" onerror="this.onerror=null;this.src='${PHOTO_PLACEHOLDER_INLINE}';">` : `<div class="swatch" style="flex:0 0 ${imgSize}px;width:${imgSize}px;height:${imgSize}px;">🔧</div>`}
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:${nameSize};color:var(--ink);white-space:normal;word-break:break-word;">${escapeHtml(t.name)}</div>
          ${t.serial_number ? `<div class="stub" style="margin:2px 0 0;${compact?'font-size:10px;':''}">Serial: ${escapeHtml(t.serial_number)}</div>` : ''}
        </div>
        <span class="stub" style="text-decoration:underline;cursor:pointer;flex:0 0 auto;${compact?'font-size:10px;':''}" onclick="document.getElementById('myToolEditPhoto-${t.id}').click()">${myToolsEditPhotoBusyId===t.id?'Uploading…':(t.photo_path?'Change photo':'Add photo')}</span>
        <input type="file" id="myToolEditPhoto-${t.id}" accept="image/*" capture="environment" style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;" onchange="onMyToolEditPhotoChosen(this,'${t.id}')">
        <div class="taskicon danger" onclick="deleteOperativeTool('${t.id}','${jsAttr(t.photo_path||'')}')">🗑</div>
      </div>
    `).join('') || `<div class="empty">No tools added yet.</div>`}
    ${myToolsAddOpen ? `
      <div class="card" style="margin-top:10px;">
        <p class="sectiontitle" style="margin-top:0;">Add a Tool</p>
        <div class="formfield" style="margin-top:0;"><input type="text" id="myToolName" value="${escapeHtml(myToolsNameDraft)}" placeholder="Tool name, e.g. Impact Driver"></div>
        <div class="formfield"><input type="text" id="myToolSerial" value="${escapeHtml(myToolsSerialDraft)}" placeholder="Serial / item number"></div>
        <div class="ghostbtn" style="cursor:pointer;text-align:center;margin-bottom:10px;" onclick="document.getElementById('myToolPhotoInput').click()">${myToolsPhotoFile ? 'Photo chosen: '+escapeHtml(myToolsPhotoFile.name) : 'Choose Photo'}</div>
        <input type="file" id="myToolPhotoInput" accept="image/*" capture="environment" style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;" onchange="onMyToolPhotoChosen(this)">
        <div class="row-gap">
          <button class="darkbtn" style="flex:1;" onclick="addMyTool()">Save Tool</button>
          <button class="ghostbtn" style="flex:1;" onclick="myToolsAddOpen=false;myToolsPhotoFile=null;myToolsNameDraft='';myToolsSerialDraft='';render()">Cancel</button>
        </div>
      </div>
    ` : `
      <button class="darkbtn" style="margin-top:10px;" onclick="myToolsAddOpen=true;render()">+ Add Tool</button>
    `}
  `;
}
async function renderMyTools(siteId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  const tools = await dbSelect('operative_tools', 'user_id=eq.'+ME.id+'&order=created_at.asc');
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(myToolsBodyHtml(tools), {title:'My Tools', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/hs/havspuwer`, siteId, tabs:false}); }
}
// Operative Dashboard: a non-site-scoped home for an operative's own stuff,
// reachable directly from the home bar — starts with My Tools (moved here
// from the per-site HAVS & PUWER tile) and a shortcut into their Outstanding
// items so everything personal to them has one place to live.
// #270/#384: multi-select export/email for any certificate listing, with a
// recipient picker — a dropdown of PMs (role filtered to manager) or a
// "Custom" option revealing a free-text address. Generalized to key-based
// state so the same picker UI works for every cert list on the page (the
// operative's own dashboard, each assigned operative, each manual person) —
// not just the one originally built for the Operative Dashboard.
let certEmailPickerOpenFor = {};
let certEmailRecipientChoiceFor = {}; // key -> '' (unset) | a pm user id | 'custom'
let certEmailCustomAddrFor = {};
let certEmailCcMeFor = {}; // key -> bool, "CC me a copy" when sending to someone else
window.toggleCertEmailPickerFor = function(key){ certEmailPickerOpenFor[key] = !certEmailPickerOpenFor[key]; render(); };
window.setCertEmailRecipientChoiceFor = function(key, v){ certEmailRecipientChoiceFor[key] = v; render(); };
// #336: Certifications now live inside the Operative Dashboard as their own
// collapsible sub-folder (open by default, matching the always-shown
// behaviour this replaces) rather than only as a separate sibling tile off
// the Operatives hub — same list/upload UI, just folded into the Dashboard.
let odCertFolderOpen = true;
window.toggleOdCertFolder = function(){ odCertFolderOpen = !odCertFolderOpen; render(); };
window.sendCertEmailFor = async function(key, ids){
  let recipient = null;
  const choice = certEmailRecipientChoiceFor[key];
  if(choice==='custom'){
    const addr = (certEmailCustomAddrFor[key]||'').trim();
    if(!addr || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)){ toast('Enter a valid email address.'); return; }
    recipient = {to_email: addr};
  } else if(choice){
    recipient = {to_user_id: choice};
  }
  if(choice && certEmailCcMeFor[key]) recipient = Object.assign({}, recipient, {cc_email: ME.email});
  await emailSelectedCerts(ids, recipient);
  certEmailPickerOpenFor[key] = false; certEmailRecipientChoiceFor[key]=''; certEmailCustomAddrFor[key]=''; certEmailCcMeFor[key]=false;
};
// #381/#383: renderOperativeDashboard now takes an optional siteId. With no
// siteId (the Home bar's "My Dashboard") it's exactly the personal view it
// always was. Opened from a site's H&S "Operatives" tile, back-navigation
// correctly returns to that site's H&S page instead of always bouncing to
// #/sites — and if the viewer is a PM/admin, they get the site-wide
// all-operatives overview (merged in from the old separate Certifications
// page + Dashboard/Certification picker hub) instead of their own tools.
// PMs/admins can now set an operative's contact number directly from the
// Operative Dashboard (not just the operative themselves from their own
// Account Settings) — the same profiles.phone column either side writes to,
// so whichever one is set last is what shows everywhere it's read (delivery
// site contacts, this dashboard, their own settings).
// Admin/PM renaming an operative from their own Operatives page — the only
// place a name can be corrected after signup (an operative can't rename
// themselves; the name they signed up with just sticks otherwise). Same
// profiles.name column everything else already reads (site rosters,
// messages, PUWER, certificates, exports), so a rename shows up everywhere
// immediately.
window.saveOperativeName = async function(operativeId){
  const input = document.getElementById('opName_'+operativeId);
  const name = input ? input.value.trim() : '';
  if(!name){ toast('Enter a name.'); return; }
  const row = await dbUpdate('profiles', operativeId, {name});
  if(row){ if(PROFILES[operativeId]) PROFILES[operativeId].name = name; operativeNameEditOpen[operativeId] = false; toast('Name saved'); render(); }
  else { toast('Could not save — check your connection and try again.'); }
};
window.saveOperativePhone = async function(operativeId){
  const input = document.getElementById('opPhone_'+operativeId);
  const phone = input ? input.value.trim() : '';
  const row = await dbUpdate('profiles', operativeId, {phone: phone||null});
  if(row){ if(PROFILES[operativeId]) PROFILES[operativeId].phone = phone||null; operativePhoneEditOpen[operativeId] = false; toast('Contact number saved'); render(); }
  else { toast('Could not save — check your connection and try again.'); }
};
async function renderOperativeDashboard(siteId){
  const __gen = RENDER_GEN;
  const site = siteId ? SITES.find(s=>s.id===siteId) : null;
  if(siteId && !site){ go('#/sites'); return; }
  const backHash = siteId ? `#/site/${siteId}/hs` : '#/sites';

  if(siteId && (isManager(ME) || ME.role==='client')){
    const isClientView = ME.role==='client';
    await loadAllProfiles();
    const [assignedRows, myCerts, manualPeople] = await Promise.all([
      dbSelect('site_assignments', 'site_id=eq.'+siteId+'&select=user_id'),
      dbSelect('operative_certifications', 'operative_id=eq.'+ME.id+'&order=created_at.desc'),
      dbSelect('certification_manual_people', 'site_id=eq.'+siteId+'&order=created_at.asc'),
    ]);
    const assignedOperatives = assignedRows.map(r=>PROFILES[r.user_id]).filter(p=>p && p.role==='operative').sort((a,b)=>a.name.localeCompare(b.name));
    const pmList = Object.values(PROFILES).filter(p=>isManager(p)).sort((a,b)=>a.name.localeCompare(b.name));
    // #390: was one unfiltered `operative_certifications` select — every cert
    // row for every operative across every org in the database — trimmed
    // down to name/storage_path-bearing columns that then got dropped, which
    // silently blanked file names and broke View/Delete for this exact view.
    // Now two `in.(...)` queries scoped to just this site's assigned
    // operatives and manual people, with every column intact, replacing both
    // the whole-table read and the old one-request-per-manual-person loop.
    const assignedOpIds = assignedOperatives.map(o=>o.id);
    const manualIds = manualPeople.map(p=>p.id);
    const [opCerts, manualCertsAll] = await Promise.all([
      assignedOpIds.length ? dbSelect('operative_certifications', 'operative_id=in.('+assignedOpIds.join(',')+')&order=created_at.desc') : Promise.resolve([]),
      manualIds.length ? dbSelect('operative_certifications', 'manual_person_id=in.('+manualIds.join(',')+')&order=created_at.desc') : Promise.resolve([]),
    ]);
    const certCountByOp = {}, allCertsByOp = {};
    opCerts.forEach(c=>{
      certCountByOp[c.operative_id] = (certCountByOp[c.operative_id]||0)+1;
      (allCertsByOp[c.operative_id]=allCertsByOp[c.operative_id]||[]).push(c);
    });
    const certCountByManual = {}, manualCertsById = {};
    manualCertsAll.forEach(c=>{
      certCountByManual[c.manual_person_id] = (certCountByManual[c.manual_person_id]||0)+1;
      (manualCertsById[c.manual_person_id]=manualCertsById[c.manual_person_id]||[]).push(c);
    });

    if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
      ${isClientView ? '' : `
      <p class="ddrow" style="margin-top:0;" onclick="siteCertOpen.__self=!siteCertOpen.__self;render();"><span class="arrow">${siteCertOpen.__self?'▼':'▶'}</span> Your Certificates</p>
      ${siteCertOpen.__self ? `
        ${certListSelectionBarHtml(myCerts, 'sitecertself', ME.id, pmList)}
        ${certAddToggleHtml(ME.id, 'sitecertself')}
        ${operativeCertListHtml(myCerts, true, {compact:true, selectable:true})}
      ` : ''}
      `}

      <p class="sectiontitle" style="margin-top:20px;">Assigned Operatives (${assignedOperatives.length})</p>
      ${assignedOperatives.length ? assignedOperatives.map(o=>`
        <p class="ddrow" onclick="siteCertOpen['${o.id}']=!siteCertOpen['${o.id}'];render();"><span class="arrow">${siteCertOpen[o.id]?'▼':'▶'}</span> ${escapeHtml(o.name)} <span class="stub" style="margin-left:4px;">${certCountByOp[o.id]||0} cert${(certCountByOp[o.id]||0)===1?'':'s'}${o.phone?' · 📞 '+escapeHtml(o.phone):''}</span></p>
        ${siteCertOpen[o.id] ? `
          ${isClientView ? '' : `
          <div class="card" style="margin-bottom:10px;">
            <label class="field-label">Contact number</label>
            <div style="display:flex;gap:8px;">
              <input type="tel" id="opPhone_${o.id}" value="${escapeHtml(o.phone||'')}" placeholder="e.g. 07123 456789" style="flex:2;min-width:0;">
              <button class="darkbtn" style="flex:1;min-width:0;width:auto;padding:10px 6px;" onclick="saveOperativePhone('${o.id}')">Save</button>
            </div>
          </div>
          `}
          ${isClientView ? '' : certListSelectionBarHtml(allCertsByOp[o.id]||[], 'siteop-'+o.id, o.id, pmList)}
          ${operativeCertListHtml(allCertsByOp[o.id]||[], !isClientView, {compact:true, selectable:!isClientView})}
          ${isClientView ? '' : `<button class="ghostbtn" style="margin-bottom:10px;" onclick="go('#/operatives/${o.id}?from=${siteId}')">Full Profile &amp; Upload →</button>`}
        ` : ''}
      `).join('') : `<div class="empty">No operatives assigned to this site yet.</div>`}

      <p class="sectiontitle" style="margin-top:20px;">Other People (${manualPeople.length})</p>
      <p class="stub" style="margin:0 0 10px;">For someone with certificates to track who isn't a registered operative — a subcontractor, for example. No account or login is created for them.</p>
      ${manualPeople.map(p=>`
        <div class="sitecard" ${isClientView?'':'style="cursor:pointer;"'} onclick="${isClientView?'':`siteCertManualOpen['${p.id}']=!siteCertManualOpen['${p.id}'];render();`}">
          <div class="swatch">${operativeInitials(p.name)}</div>
          <div class="info"><div class="name">${escapeHtml(p.name)}</div><div class="addr">${certCountByManual[p.id]||0} certificate${(certCountByManual[p.id]||0)===1?'':'s'}</div></div>
          ${isClientView ? '' : `<div class="taskicon danger" title="Remove" onclick="event.stopPropagation();removeManualCertPerson('${p.id}')">🗑</div>`}
        </div>
        ${siteCertManualOpen[p.id] && !isClientView ? `
          ${certListSelectionBarHtml(manualCertsById[p.id]||[], 'sitemanual-'+p.id, null, pmList)}
          ${manualCertAddToggleHtml(p.id, 'sitecertmanual'+p.id.replace(/[^a-zA-Z0-9]/g,''))}
          ${operativeCertListHtml(manualCertsById[p.id]||[], true, {compact:true, selectable:true})}
        ` : ''}
      `).join('')}
      ${isClientView ? '' : (siteCertManualAddOpen ? `
        <div class="card" style="margin-top:6px;">
          <p class="field-label" style="margin-bottom:6px;">Name</p>
          <input type="text" id="manualCertPersonName" placeholder="e.g. Joe Bloggs (subcontractor)" style="width:100%;padding:10px;border:1.5px solid var(--line);border-radius:8px;margin-bottom:8px;">
          <div class="row-gap">
            <button class="ghostbtn" style="flex:1;" onclick="siteCertManualAddOpen=false;render();">Cancel</button>
            <button class="darkbtn" style="flex:1;" onclick="addManualCertPerson('${siteId}')">Add</button>
          </div>
        </div>
      ` : `<button class="ghostbtn" style="margin-top:2px;" onclick="siteCertManualAddOpen=true;render();">+ Add a person</button>`)}
    `, {title:'Operative Dashboard', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:backHash, siteId, activeTab:'more'}); }
    return;
  }

  // Personal view — an operative (from the Home bar, or from a site's H&S
  // tile), or a manager with no site context.
  const [tools, certs] = await Promise.all([
    dbSelect('operative_tools', 'user_id=eq.'+ME.id+'&order=created_at.asc'),
    dbSelect('operative_certifications', 'operative_id=eq.'+ME.id+'&order=created_at.desc'),
  ]);
  await loadAllProfiles();
  const pmList = Object.values(PROFILES).filter(p=>isManager(p)).sort((a,b)=>a.name.localeCompare(b.name));
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <div class="card" style="margin-bottom:16px;cursor:pointer;" onclick="go('#/outstanding')">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
        <div style="font-weight:800;font-size:13.5px;">Outstanding Items</div>
        <span style="font-size:20px;color:var(--slate);">›</span>
      </div>
      <div class="stub" style="margin:2px 0 0;">RAMS, COSHH and Toolbox Talks awaiting your signature</div>
    </div>

    ${operativeCertSummaryCardsHtml(certs)}
    <p class="stub" style="margin:-8px 0 16px;">These feed the company Training Matrix automatically — your PM/admin sees this exact record under Operatives.</p>

    <p class="ddrow" style="margin:0 0 8px;cursor:pointer;" onclick="toggleOdCertFolder()"><span class="arrow">${odCertFolderOpen?'▼':'▶'}</span> Certifications (${certs.length})</p>
    ${odCertFolderOpen ? `
    ${certListSelectionBarHtml(certs, 'oddash', ME.id, pmList)}
    ${certAddToggleHtml(ME.id, 'oddash')}
    ${operativeCertListHtml(certs, false, {selectable:true, compact:true})}
    ` : ''}

    <p class="sectiontitle" style="margin:20px 0 8px;">My Tools</p>
    ${myToolsBodyHtml(tools, true)}
  `, {title:'Operative Dashboard', ...(site ? {subtitle:fullSiteAddress(site), siteNameSubtitle:true, siteId, activeTab:'more'} : {tabs:false}), back:backHash}); }
}
