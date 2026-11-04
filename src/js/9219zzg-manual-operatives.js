/* ============================================================
   Add an operative by hand (4 Nov 2026, Andy: "under operatives dashboard, can we add in an add operative
   section. this can then be linked with the operatives when they sign up. i need it to be as it is and still
   sync with one drive folders, but we manually enter their name and number etc for now").
   - Operatives page: "+ Add operative" (name, number, email, trade). They list under "Not signed up yet".
   - Their page works like a signed-up operative's: details, OneDrive folder link + Sync Now + Upload to
     OneDrive, certificates (upload, expiry, export, email), and they show in the Training Matrix.
   - When they sign up with the same email, the database moves everything onto their login by itself
     (manual_operative_autolink). Or press "Link to their login" on their page and pick them.
   Stored in manual_operatives; their certificates are operative_certifications rows with manual_operative_id.
   In the app a hand-added operative's id is written 'm-<uuid>', so the existing certificate pieces can be
   reused; the wrappers below send those to manual_operatives instead of profiles.
   ============================================================ */
let manualOps = null, manualOpsAt = 0, manualOpsCertCount = {};
let manualOpAddOpen = false, manualOpEditOpen = {};
const isManualOpId = id => typeof id==='string' && id.indexOf('m-')===0;
const manualOpUuid = id => String(id).slice(2);
async function loadManualOps(force){
  if(!force && manualOps && Date.now()-manualOpsAt < 20000) return manualOps;
  const [rows, certs] = await Promise.all([
    dbSelect('manual_operatives', 'org_id=eq.'+ME.org_id+'&linked_profile_id=is.null&order=name.asc'),
    dbSelect('operative_certifications', 'org_id=eq.'+ME.org_id+'&manual_operative_id=not.is.null&select=manual_operative_id'),
  ]);
  manualOps = rows || []; manualOpsAt = Date.now();
  manualOpsCertCount = {};
  (certs||[]).forEach(c=>{ manualOpsCertCount[c.manual_operative_id] = (manualOpsCertCount[c.manual_operative_id]||0)+1; });
  return manualOps;
}
function manualOpById(uuid){ return (manualOps||[]).find(m=>m.id===uuid) || null; }

// ---- Operatives page: + Add operative and the "Not signed up yet" list ----
function manualOpsListHtml(){
  const q = (typeof operativeSearchQuery==='string' ? operativeSearchQuery : '').trim().toLowerCase();
  const list = (manualOps||[]).filter(m=>!q || String(m.name||'').toLowerCase().includes(q));
  return `<div id="manualOpsBlock" style="margin:4px 0 16px;">
    ${manualOpAddOpen ? `
      <div class="card" style="margin-bottom:12px;">
        <p class="sectiontitle" style="margin-top:0;">Add an operative</p>
        <p class="stub" style="margin:0 0 10px;">For someone who hasn't signed up to OpHUB yet. When they sign up with this email, their certificates and OneDrive folder move onto their login automatically.</p>
        <div class="formfield"><label class="field-label">Name</label><input type="text" id="mopName" placeholder="Full name" oninput="applyTitleCase(this)"></div>
        <div style="display:flex;gap:10px;">
          <div class="formfield" style="flex:1;min-width:0;"><label class="field-label">Contact number</label><input type="tel" id="mopPhone" placeholder="e.g. 07123 456789"></div>
          <div class="formfield" style="flex:1;min-width:0;"><label class="field-label">Email (to link when they sign up)</label><input type="email" id="mopEmail" placeholder="name@example.com" autocomplete="off"></div>
        </div>
        <div class="formfield"><label class="field-label">Trade / role (optional)</label><input type="text" id="mopTrade" placeholder="e.g. Roofer, Labourer" oninput="applyTitleCase(this)"></div>
        <div class="row-gap"><button class="darkbtn" style="flex:2;" onclick="saveManualOperative()">Add operative</button><button class="ghostbtn" style="flex:1;" onclick="manualOpAddOpen=false;render()">Cancel</button></div>
      </div>` : `<button class="darkbtn" style="width:100%;margin-bottom:12px;" onclick="manualOpAddOpen=true;render();setTimeout(()=>{const e=document.getElementById('mopName');if(e)e.focus();},50)">+ Add operative</button>`}
    ${list.length ? `<p class="sectiontitle" style="margin:6px 0 8px;">Not signed up yet (${list.length})</p>
      ${list.map(m=>`<div class="sitecard" style="cursor:pointer;" onclick="go('#/operatives/m-${m.id}')">
        <div class="swatch" style="background:var(--paper);color:var(--slate);border:1.5px dashed var(--line);">${escapeHtml(operativeInitials(m.name))}</div>
        <div class="info"><div class="name">${escapeHtml(m.name)}</div><div class="addr">${[m.trade, m.phone].filter(Boolean).map(escapeHtml).join(' · ') || 'No details yet'} · ${manualOpsCertCount[m.id]||0} certificate${(manualOpsCertCount[m.id]||0)===1?'':'s'}${m.onedrive_folder_id?' · 📁 OneDrive':''}</div></div>
        <span class="opmat-pill" style="background:#FFF4E0;color:#8A5300;flex:none;">Not signed up</span>
      </div>`).join('')}
      <p class="sectiontitle" style="margin:16px 0 8px;">Signed up</p>` : ''}
  </div>`;
}
if(typeof renderOperativesList==='function'){
  const base = renderOperativesList;
  renderOperativesList = async function(){
    try{ await loadManualOps(); }catch(e){ manualOps = []; }
    const gen = RENDER_GEN;
    const r = await base.apply(this, arguments);
    try{
      if(gen===RENDER_GEN && !document.getElementById('manualOpsBlock')){
        const anchor = [...document.querySelectorAll('#app button')].find(b=>/exportTrainingMatrixPdf/.test(b.getAttribute('onclick')||''));
        if(anchor) anchor.insertAdjacentHTML('afterend', manualOpsListHtml());
      }
    }catch(e){ console.error(e); }
    return r;
  };
}
window.saveManualOperative = async function(){
  const v = id=>((document.getElementById(id)||{}).value||'').trim();
  const name = v('mopName'), phone = v('mopPhone'), email = v('mopEmail').toLowerCase(), trade = v('mopTrade');
  if(!name){ toast('Enter their name.'); return; }
  if(email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ toast('Check the email address.'); return; }
  if(email){
    await loadAllProfiles();
    const already = Object.values(PROFILES).find(p=>String(p.email||'').toLowerCase()===email);
    if(already){ toast(already.name+' has already signed up with that email.'); go('#/operatives/'+already.id); return; }
  }
  const rows = await dbInsert('manual_operatives', {org_id:ME.org_id, name, phone:phone||null, email:email||null, trade:trade||null, created_by:ME.id});
  if(!rows || !rows[0]) return;
  manualOpAddOpen = false; manualOps = null;
  toast(name+' added');
  go('#/operatives/m-'+rows[0].id);
};

// ---- A hand-added operative's own page ----
if(typeof renderOperativeDetail==='function'){
  const base = renderOperativeDetail;
  renderOperativeDetail = async function(operativeId){
    if(isManualOpId(operativeId)) return renderManualOperativeDetail(manualOpUuid(operativeId));
    return base.apply(this, arguments);
  };
}
async function renderManualOperativeDetail(uuid){
  const __gen = RENDER_GEN;
  const opId = 'm-'+uuid;
  const [rows, certs] = await Promise.all([
    dbSelect('manual_operatives', 'id=eq.'+uuid),
    dbSelect('operative_certifications', 'manual_operative_id=eq.'+uuid+'&order=created_at.desc'),
    loadAllProfiles(),
  ]);
  const m = rows && rows[0];
  if(!m){ toast('That operative is no longer on the list.'); go('#/operatives'); return; }
  if(m.linked_profile_id){ go('#/operatives/'+m.linked_profile_id); return; }
  const pmList = Object.values(PROFILES).filter(p=>isManager(p)).sort((a,b)=>a.name.localeCompare(b.name));
  const signedUp = Object.values(PROFILES).filter(p=>p.role==='operative').sort((a,b)=>a.name.localeCompare(b.name));
  const syncBusy = !!operativeCertSyncBusy[opId];
  const editing = !!manualOpEditOpen[uuid];
  const row = (label, val)=>`<div style="display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid var(--line);"><span class="field-label" style="margin:0;">${label}</span><b style="font-size:14.5px;text-align:right;overflow-wrap:anywhere;">${val ? escapeHtml(val) : '—'}</b></div>`;
  if(__gen !== RENDER_GEN) return;
  document.getElementById('app').innerHTML = shell(`
    <div class="card" style="margin-bottom:14px;background:#FFF8EC;border-color:#F1D9A8;">
      <b style="color:#8A5300;">Not signed up yet.</b>
      <span class="stub" style="margin:0;display:block;">${m.email ? `When they sign up with <b>${escapeHtml(m.email)}</b>, their certificates and OneDrive folder move onto their login by themselves.` : 'Add their email so they link up by themselves when they sign up, or link them below once they have.'}</span>
    </div>

    <p class="sectiontitle" style="margin-top:0;">Details</p>
    <div class="card" style="margin-bottom:16px;">
      ${editing ? `
        <div class="formfield" style="margin-top:0;"><label class="field-label">Name</label><input type="text" id="mopEdName" value="${escapeHtml(m.name||'')}"></div>
        <div style="display:flex;gap:10px;">
          <div class="formfield" style="flex:1;min-width:0;"><label class="field-label">Contact number</label><input type="tel" id="mopEdPhone" value="${escapeHtml(m.phone||'')}"></div>
          <div class="formfield" style="flex:1;min-width:0;"><label class="field-label">Email</label><input type="email" id="mopEdEmail" value="${escapeHtml(m.email||'')}" autocomplete="off"></div>
        </div>
        <div class="formfield"><label class="field-label">Trade / role</label><input type="text" id="mopEdTrade" value="${escapeHtml(m.trade||'')}"></div>
        <div class="row-gap"><button class="darkbtn" style="flex:2;" onclick="saveManualOperativeEdit('${uuid}')">Save</button><button class="ghostbtn" style="flex:1;" onclick="manualOpEditOpen['${uuid}']=false;render()">Cancel</button></div>
      ` : `
        ${row('Name', m.name)}${row('Contact number', m.phone)}${row('Email', m.email)}${row('Trade / role', m.trade)}
        <button class="darkbtn" style="margin-top:10px;width:auto;padding:8px 16px;" onclick="manualOpEditOpen['${uuid}']=true;render()">Edit</button>
      `}
    </div>

    ${signedUp.length ? `<p class="sectiontitle">Signed up already?</p>
    <div class="card" style="margin-bottom:16px;">
      <p class="stub" style="margin:0 0 8px;">Pick their login to move everything here onto it (certificates, OneDrive folder and number).</p>
      <div class="row-gap">
        <select id="mopLinkTo" style="flex:2;min-width:0;"><option value="">Choose the operative…</option>${signedUp.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}${p.email?' — '+escapeHtml(p.email):''}</option>`).join('')}</select>
        <button class="darkbtn" style="flex:1;min-width:0;" onclick="linkManualOperative('${uuid}')">Link</button>
      </div>
    </div>` : ''}

    ${operativeCertSummaryCardsHtml(certs)}

    <p class="sectiontitle" style="margin-top:0;">OneDrive Sync</p>
    ${m.onedrive_folder_id ? `
      <p class="stub" style="margin:0 0 4px;color:var(--ok);">📁 Linked to "${escapeHtml(m.onedrive_folder_name||'')}"</p>
      <p class="stub" style="margin:0 0 10px;">${m.onedrive_last_synced_at ? 'Last synced '+new Date(m.onedrive_last_synced_at).toLocaleString('en-GB') : 'Not synced yet.'}</p>
      <p class="stub" style="margin:0 0 10px;">Sync Now pulls in anything new in their OneDrive folder. To send a certificate uploaded here the other way, tick it below and use "Upload to OneDrive".</p>
      <div style="display:flex;gap:8px;margin-bottom:16px;align-items:center;">
        <button class="darkbtn" style="flex:1;" ${syncBusy?'disabled':''} onclick="syncOperativeCertifications('${opId}')">${syncBusy?'Syncing…':'🔄 Sync Now'}</button>
        <div style="position:relative;flex:0 0 auto;" data-opfoldermenu-root>
          <span class="taskicon" title="More actions" onclick="event.stopPropagation();toggleOpFolderMenu('${opId}')">▾</span>
          ${opFolderMenuOpenFor===opId ? `<div class="statusmenu" style="right:0;left:auto;">
            <div class="statusmenu-item" onclick="opFolderMenuOpenFor=null;startOperativeFolderPicker('${opId}')">Change Folder</div>
            <div class="statusmenu-item" onclick="opFolderMenuOpenFor=null;unlinkOperativeFolder('${opId}')">Unlink</div>
          </div>` : ''}
        </div>
      </div>
    ` : `
      <p class="stub" style="margin:0 0 10px;">Link their OneDrive folder to sync their certificates both ways, the same as a signed-up operative.</p>
      <button class="darkbtn" style="margin-bottom:16px;" onclick="startOperativeFolderPicker('${opId}')">Link OneDrive Folder</button>
    `}

    <p class="sectiontitle">Certificates</p>
    ${certListSelectionBarHtml(certs, 'op-'+opId, opId, pmList)}
    ${certAddToggleHtml(opId, 'mopdet')}
    ${operativeCertListHtml(certs, true, {selectable:true})}
    <button class="ghostbtn" style="width:100%;margin-top:14px;" onclick="exportTrainingMatrixExcel()">📊 Export Full Training Matrix (Excel)</button>
    <button class="ghostbtn" style="width:100%;margin-top:18px;color:var(--warn);border-color:var(--warn);" onclick="removeManualOperative('${uuid}')">Remove ${escapeHtml(m.name)}</button>
  `, {title: m.name, subtitle:'Operative · not signed up', back:'#/operatives', tabs:false});
}
window.saveManualOperativeEdit = async function(uuid){
  const v = id=>((document.getElementById(id)||{}).value||'').trim();
  const name = v('mopEdName'), email = v('mopEdEmail').toLowerCase();
  if(!name){ toast('Enter their name.'); return; }
  if(email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ toast('Check the email address.'); return; }
  const row = await dbUpdate('manual_operatives', uuid, {name, phone:v('mopEdPhone')||null, email:email||null, trade:v('mopEdTrade')||null});
  if(row){ manualOpEditOpen[uuid] = false; manualOps = null; toast('Saved'); render(); }
};
window.linkManualOperative = async function(uuid){
  const sel = document.getElementById('mopLinkTo');
  const pid = sel && sel.value;
  if(!pid){ toast('Choose who they signed up as.'); return; }
  const p = PROFILES[pid];
  if(!await customConfirm('Link to '+((p && p.name) || 'this operative')+'?\n\nTheir certificates move onto that login, and the OneDrive folder and number are used if the login has none yet.')) return;
  try{
    const res = await sbFetch('/rest/v1/rpc/link_manual_operative', {method:'POST', body: JSON.stringify({p_manual: uuid, p_profile: pid})});
    const ok = res.ok ? await res.json() : false;
    if(!res.ok || ok!==true){ toast('Could not link them — '+(res.ok ? 'already linked, or not in your company' : await safeErr(res))); return; }
  }catch(e){ toast('Could not link them — check your connection.'); return; }
  manualOps = null;
  try{ if(typeof profilesLoadedAt!=='undefined') profilesLoadedAt = 0; await loadAllProfiles(); }catch(e){}
  toast('Linked — everything is now on their login');
  go('#/operatives/'+pid);
};
window.removeManualOperative = async function(uuid){
  const m = manualOpById(uuid);
  if(!await customConfirm('Remove '+((m && m.name) || 'this operative')+' from OpHUB?\n\nTheir certificates here are removed too. Files in their OneDrive folder are not touched.')) return;
  const ok = await dbDelete('manual_operatives', uuid);
  if(ok!==false){ manualOps = null; toast('Removed'); go('#/operatives'); }
};

// ---- the certificate and OneDrive pieces, sent to the hand-added operative ----
if(typeof window.uploadOperativeCert==='function'){
  const base = window.uploadOperativeCert;
  window.uploadOperativeCert = async function(operativeId, prefix){
    if(!isManualOpId(operativeId)) return base.apply(this, arguments);
    const uuid = manualOpUuid(operativeId);
    const fileInput = document.getElementById(prefix+'CertFile');
    const file = fileInput && fileInput.files && fileInput.files[0];
    if(!file){ toast('Choose a file to upload.'); return; }
    const catSel = document.getElementById(prefix+'CertCategory');
    const category = catSel ? catSel.value : 'other';
    const otherDescEl = document.getElementById(prefix+'CertOtherDesc');
    const otherDesc = category==='other' && otherDescEl ? otherDescEl.value.trim() : '';
    const expiryEl = document.getElementById(prefix+'CertExpiry');
    const expiry = expiryEl && expiryEl.value ? expiryEl.value : null;
    const path = ME.org_id+'/m-'+uuid+'/'+uid()+'-'+file.name.replace(/[^a-z0-9.\-]+/gi,'_');
    const stored = await uploadToStorage('certifications', path, file, file.type || 'application/octet-stream');
    if(!stored) return;
    const rows = await dbInsert('operative_certifications', {org_id:ME.org_id, operative_id:null, manual_operative_id:uuid, category, other_type_description:otherDesc||null, expiry_date:expiry, name:file.name, storage_path:stored, size:file.size, source:'upload', uploaded_by:ME.id});
    if(rows){ toast('Certificate uploaded'); certAddOpenFor[prefix] = false; manualOps = null; render(); }
  };
}
if(typeof window.syncOperativeCertifications==='function'){
  const base = window.syncOperativeCertifications;
  window.syncOperativeCertifications = async function(operativeId){
    if(!isManualOpId(operativeId)) return base.apply(this, arguments);
    operativeCertSyncBusy[operativeId] = true; render();
    try{
      const res = await sbFetch('/functions/v1/sync-operative-certification', {method:'POST', body: JSON.stringify({manual_operative_id: manualOpUuid(operativeId)})});
      const d = await res.json();
      if(!res.ok || d.error) toast('Sync failed — '+(d.error||res.status));
      else toast(`Synced — ${d.pulled||0} pulled in from OneDrive.`);
    }catch(e){ toast('Sync failed — could not reach the server.'); }
    operativeCertSyncBusy[operativeId] = false; manualOps = null; render();
  };
}
if(typeof window.pushSelectedCertsToOneDrive==='function'){
  const base = window.pushSelectedCertsToOneDrive;
  window.pushSelectedCertsToOneDrive = async function(ids, operativeId){
    if(!isManualOpId(operativeId)) return base.apply(this, arguments);
    if(!ids || !ids.length) return;
    certBulkPushBusy = true; render();
    try{
      const res = await sbFetch('/functions/v1/sync-operative-certification', {method:'POST', body: JSON.stringify({manual_operative_id: manualOpUuid(operativeId), cert_ids: ids})});
      const d = await res.json();
      if(!res.ok || d.error) toast('Upload to OneDrive failed — '+(d.error||res.status));
      else { toast(d.pushed ? `Uploaded ${d.pushed} to OneDrive.` : 'Nothing to upload — already on OneDrive.'); ids.forEach(id=>certSelectedIds.delete(id)); }
    }catch(e){ toast('Upload to OneDrive failed — could not reach the server.'); }
    certBulkPushBusy = false; render();
  };
}
if(typeof window.selectOneDriveFolder==='function'){
  const base = window.selectOneDriveFolder;
  window.selectOneDriveFolder = async function(siteId, folderId, folderName, driveId){
    if(odPickerTarget==='operative' && isManualOpId(odPickerOperativeId)){
      const opId = odPickerOperativeId;
      const row = await dbUpdate('manual_operatives', manualOpUuid(opId), {onedrive_folder_id:folderId, onedrive_folder_name:folderName, onedrive_drive_id:driveId||null, onedrive_last_synced_at:null});
      if(row){
        odPickerStack = null; odPickerOperativeId = null; manualOps = null;
        toast('Folder linked — tap Sync Now to pull files in or push uploads out');
        go('#/operatives/'+opId);
      }
      return;
    }
    return base.apply(this, arguments);
  };
}
if(typeof window.unlinkOperativeFolder==='function'){
  const base = window.unlinkOperativeFolder;
  window.unlinkOperativeFolder = async function(operativeId){
    if(!isManualOpId(operativeId)) return base.apply(this, arguments);
    if(!await customConfirm('Unlink this OneDrive folder? Nothing in OneDrive is deleted.')) return;
    const row = await dbUpdate('manual_operatives', manualOpUuid(operativeId), {onedrive_folder_id:null, onedrive_folder_name:null, onedrive_drive_id:null});
    if(row){ manualOps = null; toast('Folder unlinked'); render(); }
  };
}
// The Training Matrix (Excel and PDF) includes the hand-added operatives.
if(typeof trainingMatrixData==='function'){
  const base = trainingMatrixData;
  trainingMatrixData = async function(){
    const out = await base.apply(this, arguments);
    try{
      const [ops, certs] = await Promise.all([
        dbSelect('manual_operatives', 'org_id=eq.'+ME.org_id+'&linked_profile_id=is.null&order=name.asc'),
        dbSelect('operative_certifications', 'org_id=eq.'+ME.org_id+'&manual_operative_id=not.is.null&select=manual_operative_id,category,name,expiry_date'),
      ]);
      (certs||[]).forEach(c=>{
        const bucket = (out.byOp['m-'+c.manual_operative_id] = out.byOp['m-'+c.manual_operative_id] || {});
        const entry = (bucket[c.category] = bucket[c.category] || {count:0, expiry:null});
        entry.count += 1;
        if(c.expiry_date && (!entry.expiry || c.expiry_date < entry.expiry)) entry.expiry = c.expiry_date;
      });
      (ops||[]).forEach(m=>out.operatives.push({id:'m-'+m.id, name:m.name+' (not signed up)', role:'operative', phone:m.phone, email:m.email}));
      out.operatives.sort((a,b)=>String(a.name).localeCompare(String(b.name)));
    }catch(e){ console.error(e); }
    return out;
  };
}
