/* ============================================================
   New job pack (2 Nov 2026, Andy: "in the html app, can we also build in, that claude code has just done.
   to create copy job packs ... and link the app per folder to the job as needed").
   Same rules, table and server function as the new app (job_pack_settings, sites.job_pack, onedrive-job-pack):
   - Admin Centre › OneDrive › New job pack: switch it on and edit the rules (where job folders go, which
     folders and documents, which folder each kind of file goes to, weekly folders).
   - A new project (Projects or Finance) gets its OneDrive folder made from the rules, the documents copied
     from the template, and the job linked to its folders (photos, material orders, inductions).
   - Files the app makes are filed by rule: Schedule of Works photos, RAMS, COSHH, toolbox talks, approved
     variation photos, drawings added in the app, and PDFs saved to OneDrive from the viewer.
   A job set up before the pack, or a company that hasn't switched it on, carries on exactly as before.
   ============================================================ */
const JP_PROG = '5. OpHUB x Photos & Inspections/1. Progress Reports (Safety Culture)';
const JP_WEEK = JP_PROG+'/{week folder}';
const JP_HS = '2. Health & Safety';
const JP_MC = JP_HS+'/4. Main Contractor Docs';
const JP_IND = JP_MC+'/2. Induction Forms & Competency Certs';
// What each rule is, in the order the page lists them (the same list as the new app).
const JP_RULES = [
  {key:'sow_prestart', area:'Schedule of Works', when:'Pre-start photo saved', folder:JP_PROG+'/1. Pre Start', on:true},
  {key:'sow_progress', area:'Schedule of Works', when:'Progress or completed photo saved', folder:JP_WEEK, on:true},
  {key:'sow_export', area:'Schedule of Works', when:'Export saved to OneDrive', folder:JP_WEEK, on:true},
  {key:'rams_issued', area:'RAMS', when:'RAMS issued', folder:JP_HS+'/1. RAMS', on:true},
  {key:'rams_superseded', area:'RAMS', when:'RAMS superseded (the old file stays)', folder:JP_HS+'/1. RAMS', on:true},
  {key:'tbt_issued', area:'Toolbox talks', when:'Talk issued on this job', folder:JP_HS+'/3. Toolbox Talks', on:true},
  {key:'coshh_added', area:'COSHH', when:'COSHH sheet added to this job', folder:JP_HS+'/2. COSHH', on:true},
  {key:'om_manual', area:'O&M', when:'O&M manual saved to OneDrive', folder:'8. Handover/2. Warranties & Inspections', on:true},
  {key:'induction', area:'Inductions', when:'Induction completed', folder:JP_IND+'/1. Completed Inductions', on:true},
  {key:'permit_closed', area:'Permits', when:'Permit closed', folder:JP_MC+'/3. Permits to Work', on:true, nativeOnly:true},
  {key:'incident', area:'Incidents', when:'Incident submitted', folder:JP_MC+'/4. Accident  Near Miss Reports', on:false, nativeOnly:true},
  {key:'briefing', area:'Daily briefings', when:'Briefing saved to OneDrive', folder:JP_WEEK, on:true},
  {key:'report', area:'Inspections and reports', when:'Report saved to OneDrive', folder:JP_WEEK, on:true},
  {key:'variation_approved', area:'Variations', when:'Variation approved (its photo)', folder:'1. Contract & Commercial/3. Variations', on:true},
  {key:'drawing_out', area:'Drawings', when:'File added in the app', folder:'3. Drawings & Technical/1. Project Drawings & Generic Spec', on:true},
  {key:'drawing_in', area:'Drawings', when:'File added in OneDrive comes into the app', folder:'3. Drawings & Technical/1. Project Drawings & Generic Spec', on:true},
  {key:'material_orders_in', area:'Material orders', when:'File added in OneDrive comes into the app', folder:'4. Subcontractors & Suppliers/4. Supplier Material Orders', on:true},
];
const JP_FOLDERS = [
  '1. Contract & Commercial', '1. Contract & Commercial/1. Contract-Order', '1. Contract & Commercial/2. Estimating', '1. Contract & Commercial/3. Variations', '1. Contract & Commercial/4. Applications for Payment & Certificates',
  JP_HS, JP_HS+'/1. RAMS', JP_HS+'/2. COSHH', JP_HS+'/3. Toolbox Talks', JP_MC, JP_MC+'/1. Construction Phase Plan', JP_IND, JP_IND+'/1. Completed Inductions', JP_IND+'/2. Competency Certs', JP_IND+'/3. Signing In Sheet', JP_MC+'/3. Permits to Work', JP_MC+'/4. Accident  Near Miss Reports',
  '3. Drawings & Technical', '3. Drawings & Technical/1. Project Drawings & Generic Spec', '3. Drawings & Technical/2.  Manufacturers Specification', '3. Drawings & Technical/2.  Manufacturers Specification/1. U-Value Condensation Risk Calculations',
  '4. Subcontractors & Suppliers', '4. Subcontractors & Suppliers/1. Subcontractor Quotes & Orders', '4. Subcontractors & Suppliers/1. Subcontractor Quotes & Orders/1. Quotes', '4. Subcontractors & Suppliers/1. Subcontractor Quotes & Orders/2. Orders', '4. Subcontractors & Suppliers/3. Supplier Price Lists', '4. Subcontractors & Suppliers/4. Supplier Material Orders',
  '5. OpHUB x Photos & Inspections', JP_PROG, JP_PROG+'/1. Pre Start', '5. OpHUB x Photos & Inspections/2. Additional Photos',
  '6. Programme', '6. Programme/1. Programme', '7. Main Contractor Docs', '8. Handover', '8. Handover/2. Warranties & Inspections', '8. Handover/3. Defects  Snagging', '8. Handover/4. Practical Completion Certificate',
];
const JP_FILES = [
  {folder:'1. Contract & Commercial/4. Applications for Payment & Certificates', name:'RTB Roofing - Application for Payment.xlsx'},
  {folder:'3. Drawings & Technical', name:'RTB_Drawing_Submittal_Tracker.xlsx'},
  {folder:'4. Subcontractors & Suppliers/1. Subcontractor Quotes & Orders', name:'Sub Contractor Price.xlsx'},
  {folder:'6. Programme/1. Programme', name:'RTB Programme Template.xlsx'},
  {folder:'6. Programme', name:'RTB_Delivery_Schedule.xlsx'},
  {folder:'', name:'RTB Handover Checklist.xlsx'},
];
function jpStartingPack(){
  const rules = {}; JP_RULES.forEach(r=>{ rules[r.key] = {on:r.on, folder:r.folder}; });
  return {parent_path:'RTB Roofing Ltd/Live Projects', template_path:'RTB Roofing Ltd/Live Projects/- New Job Pack - Template',
    folders:JP_FOLDERS.slice(), files:JP_FILES.map(f=>Object.assign({}, f)), rules,
    weekly:{name:'{order}. Week {n}', addDate:false, weekStart:1, week1:'start'}};
}
function jpCleanFolder(s){ return String(s||'').replace(/\\/g,'/').split('/').map(x=>x.trim()).filter(Boolean).join('/'); }
function jpWeekExample(w, n){ return String(w.name||'').replace('{order}', String(n+1)).replace('{n}', String(n))+(w.addDate ? ' (w-c 02 Nov 2026)' : ''); }
function jpProblem(c){
  if(!jpCleanFolder(c.parent_path)) return 'Say where new job folders go.';
  if(c.files.length && !jpCleanFolder(c.template_path)) return 'Say where the template folder is, as documents are copied from it.';
  if(!/\{n\}/.test(c.weekly.name||'')) return 'The week folder’s name needs {n} in it, so each week has its own folder.';
  return null;
}

// ---- the company's settings (read once, kept until changed) ----
let jpSettings, jpSettingsFor = null, jpSettingsLoading = null;
function jpLoad(force){
  if(!ME || !ME.org_id) return Promise.resolve(null);
  if(!force && jpSettingsFor===ME.org_id && jpSettings!==undefined) return Promise.resolve(jpSettings);
  if(jpSettingsLoading && !force) return jpSettingsLoading;
  jpSettingsLoading = dbSelect('job_pack_settings', 'org_id=eq.'+ME.org_id+'&select=enabled,config').then(rows=>{
    jpSettings = (rows && rows[0]) || null; jpSettingsFor = ME.org_id; jpSettingsLoading = null; return jpSettings;
  }).catch(()=>{ jpSettingsLoading = null; return null; });
  return jpSettingsLoading;
}
// For screens: what is known now, and a re-draw once it has loaded.
function jpKnown(){
  if(ME && jpSettingsFor===ME.org_id && jpSettings!==undefined) return jpSettings;
  jpLoad().then(()=>{ try{ render(); }catch(e){} });
  return null;
}
async function jpCall(body){
  try{
    const res = await sbFetchOD('/functions/v1/onedrive-job-pack', {method:'POST', timeoutMs:120000, body:JSON.stringify(body)});
    let out = null; try{ out = await res.json(); }catch(e){}
    if(!res.ok || !out || out.error) return {error:(out && out.error) || ('error '+res.status)};
    return out;
  }catch(e){ return {error:'could not reach the server'}; }
}
function jpErrText(e){
  return e==='not_enabled' ? 'The job pack isn’t switched on for this company.' : e==='not_connected' ? 'OneDrive isn’t connected.' : (e || 'Could not set up the job pack.');
}
const jpBusy = new Set();
// Makes the job's folder from the rules and links the job to it. quiet = no pop-up, just a toast.
async function jpSetup(siteId, quiet){
  if(jpBusy.has(siteId)) return;
  jpBusy.add(siteId); try{ render(); }catch(e){}
  if(!quiet) toast('Setting up the job pack in OneDrive…');
  const r = await jpCall({action:'setup', site_id:siteId});
  jpBusy.delete(siteId);
  if(r.error){ toast('Job pack not set up — '+jpErrText(r.error)); try{ render(); }catch(e){} return false; }
  const sitesRes = await dbSelectChecked('sites', 'select=*&order=created_at.asc');
  if(sitesRes.ok) SITES = sitesRes.data;
  const failed = (r.failed||[]).length;
  toast('Job pack ready in OneDrive — '+(r.path||'')+(failed ? ' ('+failed+' item'+(failed===1?'':'s')+' could not be made)' : ''));
  try{ render(); }catch(e){}
  return true;
}
window.jpSetupJob = async function(siteId){
  const s = SITES.find(x=>x.id===siteId);
  if(s && s.onedrive_folder_id && !s.job_pack){ customAlert('This job is already linked to a OneDrive folder. Unlink it first if you want a job pack made for it.'); return; }
  if(!await customConfirm('Make the job pack for '+((s && s.name) || 'this job')+' in OneDrive?\n\nIt makes the job folder and its sub-folders, copies the template documents in, and links the job to them. Nothing already there is overwritten.')) return;
  jpSetup(siteId);
};
async function jpAfterNewJob(siteId){
  const st = await jpLoad(true);
  if(st && st.enabled && st.config) jpSetup(siteId, true);
}

// ---- filing a file by rule ----
function jpSiteHasPack(siteId){ const s = SITES.find(x=>x.id===siteId); return !!(s && s.job_pack); }
function jpRuleOn(rule){ const st = jpSettings; return !!(st && st.enabled && st.config && st.config.rules && st.config.rules[rule] && st.config.rules[rule].on); }
function jpPdfName(n){ n = String(n||'Document').trim() || 'Document'; return /\.[a-z0-9]{2,4}$/i.test(n) ? n : n+'.pdf'; }
let jpChain = Promise.resolve();
// Puts a file in the job's pack. false when the job has no pack (the caller does what it did before).
// src: {photo_path} | {file:{bucket,path}} | {bytes}. Runs one at a time, in the background.
function jpPut(siteId, rule, filename, src){
  if(!siteId || !jpSiteHasPack(siteId)) return false;
  jpChain = jpChain.then(async ()=>{
    // The server checks the rule is on (operatives can't read the rules, so it's not checked here).
    let body = {action:'put', site_id:siteId, rule, filename};
    if(src.photo_path) body.photo_path = src.photo_path;
    else if(src.file && String(src.file.path||'').indexOf(siteId+'/')===0) body.file = src.file;
    else {
      let blob = src.blob || null;
      if(!blob && src.bytes) blob = new Blob([src.bytes], {type:'application/pdf'});
      if(!blob && src.file){ // a company library copy (not under the job): fetched here and sent on
        const res = await sbFetch('/storage/v1/object/'+src.file.bucket+'/'+src.file.path, {timeoutMs:60000});
        if(!res.ok) return;
        blob = await res.blob();
      }
      if(!blob) return;
      if(blob.size > 3*1024*1024){
        const stored = await uploadToStorage('mc-documents', siteId+'/onedrive-tmp/'+crypto.randomUUID()+'-'+String(filename).replace(/[^a-z0-9.\-]+/gi,'_'), blob, blob.type||'application/octet-stream');
        if(!stored) return;
        body.file = {bucket:'mc-documents', path:stored};
      } else body.content_base64 = await blobToBase64(blob);
    }
    const r = await jpCall(body);
    if(r.error) console.warn('[job pack] '+rule+' not filed:', r.error);
  }).catch(e=>console.warn('[job pack]', e));
  return true;
}

// Schedule of Works photos: pre-start to "Pre Start", progress/completed to that week's folder.
if(typeof queueOneDrivePhotoPath==='function'){
  const base = queueOneDrivePhotoPath;
  queueOneDrivePhotoPath = function(photoPath, filename, siteId, stage){
    if(jpPut(siteId, stage==='todo' ? 'sow_prestart' : 'sow_progress', filename, {photo_path:photoPath})) return;
    return base.apply(this, arguments);
  };
}
// Drawings added in the app.
if(typeof pushDrawingToOneDrive==='function'){
  const base = pushDrawingToOneDrive;
  pushDrawingToOneDrive = async function(siteId, file){
    if(file && jpPut(siteId, 'drawing_out', file.name, {blob:file})) return;
    return base.apply(this, arguments);
  };
}
// ☁️ in the PDF viewer: a job's Schedule of Works export, O&M, briefing or report goes to its rule's folder.
function jpRuleForPdf(name){
  const n = String(name||'');
  if(/schedule of works/i.test(n)) return 'sow_export';
  if(/o&m|o & m|operation.{0,6}maintenance/i.test(n)) return 'om_manual';
  if(/briefing/i.test(n)) return 'briefing';
  if(/report|inspection|survey/i.test(n)) return 'report';
  return null;
}
if(typeof window.syncPdfViewerDoc==='function'){
  const base = window.syncPdfViewerDoc;
  window.syncPdfViewerDoc = async function(){
    const st = typeof pdfViewerState!=='undefined' ? pdfViewerState : null;
    const m = /^#\/site\/([^\/?]+)/.exec(location.hash||'');
    const siteId = st && (st.siteId || (m ? m[1] : null));
    const rule = st && st.bytes ? jpRuleForPdf(st.filename) : null;
    if(siteId && rule && jpSiteHasPack(siteId)){
      const known = isFullManager(ME) ? await jpLoad() : null;
      if(!known || jpRuleOn(rule)){
        jpPut(siteId, rule, jpPdfName(st.filename), {bytes:st.bytes});
        toast('Saving to the job pack in OneDrive…');
        const btn = document.getElementById('pdfViewerSyncBtn'); if(btn) btn.textContent = '✅';
        return;
      }
    }
    return base.apply(this, arguments);
  };
}
// RAMS, COSHH and toolbox talks as they're saved; a variation's photo when it's approved.
(function(){
  const ins = dbInsert, upd = dbUpdate;
  dbInsert = async function(table, rowOrRows){
    const out = await ins.apply(this, arguments);
    try{
      if(out && (table==='rams_docs' || table==='coshh_docs' || table==='toolbox_talks')){
        (Array.isArray(out) ? out : [out]).forEach(r=>{
          if(!r || !r.site_id || !r.storage_path) return;
          if(table==='toolbox_talks'){ if(r.status==='live') jpPut(r.site_id, 'tbt_issued', jpPdfName(r.title), {file:{bucket:'rams-docs', path:r.storage_path}}); return; }
          if(table==='coshh_docs') return jpPut(r.site_id, 'coshh_added', jpPdfName(r.name), {file:{bucket:'coshh-docs', path:r.storage_path}});
          const rule = /coshh/i.test(r.doc_type||'') ? 'coshh_added' : r.supersedes ? 'rams_superseded' : 'rams_issued';
          jpPut(r.site_id, rule, jpPdfName(r.name), {file:{bucket:'rams-docs', path:r.storage_path}});
        });
      }
    }catch(e){ console.warn('[job pack]', e); }
    return out;
  };
  dbUpdate = async function(table, id, patch){
    const out = await upd.apply(this, arguments);
    try{
      if(out && table==='variations' && patch && patch.approval_status==='approved' && out.photo_path && out.site_id){
        const d = String(patch.description || out.description || 'Variation').replace(/[^a-z0-9 ]+/gi,'').trim().slice(0,80) || 'Variation';
        jpPut(out.site_id, 'variation_approved', d+' '+new Date().toISOString().slice(0,10)+'.jpg', {photo_path:out.photo_path});
      }
    }catch(e){ console.warn('[job pack]', e); }
    return out;
  };
  window.dbInsert = dbInsert; window.dbUpdate = dbUpdate;
})();

// New projects (Projects and Finance) get their pack straight away.
['addSite','saveFinNewJob'].forEach(fn=>{
  const base = window[fn];
  if(typeof base!=='function') return;
  window[fn] = async function(){
    const before = new Set(SITES.map(s=>s.id));
    const out = await base.apply(this, arguments);
    try{ SITES.filter(s=>!before.has(s.id)).forEach(s=>{ if(!s.job_pack && !s.onedrive_folder_id) jpAfterNewJob(s.id); }); }catch(e){}
    return out;
  };
});

// ---- Admin Centre › OneDrive: the card, and per project ----
function jobPackAdminCardHtml(){
  if(!isFullManager(ME)) return '';
  const st = jpKnown(), cfg = st && st.config;
  const on = cfg ? Object.values(cfg.rules||{}).filter(r=>r && r.on).length : 0;
  return `<div class="card" style="margin-top:10px;">
    <p class="sectiontitle" style="margin-top:0;">📦 New job pack</p>
    <p class="stub" style="margin:0 0 8px;">A new job gets its own OneDrive folder made from your template, and the app files photos, RAMS, COSHH, toolbox talks, variations and drawings where your rules say.</p>
    ${!(ME && jpSettingsFor===ME.org_id) ? `<p class="stub" style="margin:0 0 8px;">Loading…</p>` : cfg ? `<p style="margin:0 0 8px;font-size:13.5px;">${cfg.folders.length} folders · ${cfg.files.length} documents · ${on} rules on · <b style="color:${st.enabled?'var(--ok)':'var(--slate)'};">${st.enabled?'Switched on':'Switched off'}</b></p>` : `<p style="margin:0 0 8px;font-size:13.5px;">Not set up yet.</p>`}
    ${ME.role==='admin' ? `<button class="${cfg?'ghostbtn':'darkbtn'}" onclick="jpOpenEditor()">${cfg ? 'Change the rules' : 'Set it up'}</button>` : `<p class="stub" style="margin:0;">Only an admin can change the rules.</p>`}
  </div>`;
}
function jobPackSiteRowHtml(s, backHash){
  if(!isFullManager(ME)) return '';
  const st = jpKnown();
  if(s.job_pack) return `<div class="integ-row"><span class="integ-dot on"></span><span class="integ-txt"><b>Job pack</b><span>📦 ${escapeHtml(s.job_pack.path||'Made')}</span></span></div>`;
  if(!(st && st.enabled && st.config)) return '';
  return `<div class="integ-row"><span class="integ-dot"></span><span class="integ-txt"><b>Job pack</b><span>${s.onedrive_folder_id ? 'Already linked to its own folder' : 'Not made yet'}</span></span>
    ${s.onedrive_folder_id ? '' : `<button type="button" class="ghostbtn" style="width:auto;margin:0;padding:6px 10px;font-size:12px;" ${jpBusy.has(s.id)?'disabled':''} onclick="jpSetupJob('${s.id}')">${jpBusy.has(s.id)?'Making…':'Make job pack'}</button>`}</div>`;
}
// The job's Settings & Admin › Sync Folder card.
function jobPackSiteCardHtml(site){
  if(!isFullManager(ME)) return '';
  const st = jpKnown();
  if(site.job_pack) return `<p class="stub" style="margin:0 0 8px;font-size:13px;color:var(--ok);">📦 Job pack: ${escapeHtml(site.job_pack.path||'')}</p>`;
  if(!(st && st.enabled && st.config) || site.onedrive_folder_id) return '';
  return `<button class="darkbtn" style="margin:0 0 8px;" ${jpBusy.has(site.id)?'disabled':''} onclick="jpSetupJob('${site.id}')">${jpBusy.has(site.id)?'Making the job pack…':'📦 Make this job’s pack in OneDrive'}</button>`;
}

// ---- the rules editor ----
let jpEd = null;
window.jpOpenEditor = async function(){
  const st = await jpLoad(true);
  const cfg = (st && st.config) ? JSON.parse(JSON.stringify(st.config)) : jpStartingPack();
  cfg.rules = cfg.rules || {}; JP_RULES.forEach(r=>{ if(!cfg.rules[r.key]) cfg.rules[r.key] = {on:r.on, folder:r.folder}; });
  cfg.weekly = Object.assign({name:'{order}. Week {n}', addDate:false, weekStart:1, week1:'start'}, cfg.weekly||{});
  cfg.files = cfg.files || []; cfg.folders = cfg.folders || [];
  jpEd = {enabled: st ? !!st.enabled : true, cfg, isNew: !st};
  jpDraw();
};
function jpRead(){
  if(!jpEd) return;
  const v = id=>{ const el = document.getElementById(id); return el ? el.value : ''; };
  const c = jpEd.cfg;
  const en = document.getElementById('jpEnabled'); if(en) jpEd.enabled = en.checked;
  c.parent_path = jpCleanFolder(v('jpParent')); c.template_path = jpCleanFolder(v('jpTemplate'));
  c.folders = v('jpFolders').split('\n').map(jpCleanFolder).filter(Boolean);
  c.files = v('jpFiles').split('\n').map(l=>l.trim()).filter(Boolean).map(l=>{
    const i = l.lastIndexOf('|');
    return i<0 ? {folder:'', name:l.trim()} : {folder:jpCleanFolder(l.slice(0,i)), name:l.slice(i+1).trim()};
  }).filter(f=>f.name);
  JP_RULES.forEach(r=>{
    const box = document.getElementById('jpOn_'+r.key), f = document.getElementById('jpF_'+r.key);
    if(box) c.rules[r.key] = {on:box.checked, folder: (f && f.value.indexOf('{week folder}')>=0) ? f.value.split('/').map(x=>x.trim()).filter(Boolean).join('/') : jpCleanFolder(f ? f.value : '')};
  });
  c.weekly = {name:(v('jpWkName')||'').trim(), addDate:!!(document.getElementById('jpWkDate')||{}).checked, weekStart:Number(v('jpWkStart')||1), week1:v('jpWk1')||'start'};
}
window.jpWeekPreview = function(){ jpRead(); const p = document.getElementById('jpWkEx'); if(p) p.textContent = 'e.g. '+jpWeekExample(jpEd.cfg.weekly, 1)+', '+jpWeekExample(jpEd.cfg.weekly, 2)+' …'; };
function jpDraw(){
  let ov = document.getElementById('jpOverlay');
  if(!jpEd){ if(ov) ov.remove(); return; }
  if(!ov){ ov = document.createElement('div'); ov.id = 'jpOverlay'; ov.className = 'geo-modal-overlay'; ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,17,21,.45);z-index:9000;display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:24px 12px;'; document.body.appendChild(ov); }
  const c = jpEd.cfg, w = c.weekly;
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  let lastArea = '';
  ov.innerHTML = `<div class="jp-card">
    <div class="jp-head"><div><h3>📦 New job pack</h3><p class="stub" style="margin:2px 0 0;">The same rules the new app uses. Folder paths start at the top of your OneDrive; use / between folders.</p></div>
      <button type="button" class="jp-x" onclick="jpClose()" aria-label="Close">✕</button></div>
    <label class="jp-switch"><input type="checkbox" id="jpEnabled" ${jpEd.enabled?'checked':''}> <b>Switched on</b> <span class="stub" style="margin:0;">— new jobs get a pack, and files are filed by these rules</span></label>
    <div class="jp-sec">Where things go</div>
    <div class="formfield"><label class="field-label">New job folders go in</label><input id="jpParent" value="${escapeHtml(c.parent_path||'')}" placeholder="e.g. RTB Roofing Ltd/Live Projects"></div>
    <div class="formfield"><label class="field-label">Template folder (documents are copied from here)</label><input id="jpTemplate" value="${escapeHtml(c.template_path||'')}" placeholder="e.g. RTB Roofing Ltd/Live Projects/- New Job Pack - Template"></div>
    <p class="stub" style="margin:-2px 0 6px;">Each job's folder is named after the project, e.g. <b>${escapeHtml(jpCleanFolder(c.parent_path)||'…')}/Ruth House</b>.</p>
    <div class="jp-sec">Folders made in every job <span class="stub" style="margin:0;font-weight:500;">· one per line</span></div>
    <textarea id="jpFolders" rows="8" class="jp-ta">${escapeHtml(c.folders.join('\n'))}</textarea>
    <div class="jp-sec">Documents copied from the template <span class="stub" style="margin:0;font-weight:500;">· one per line: folder | file name (no folder = the job's top folder)</span></div>
    <textarea id="jpFiles" rows="5" class="jp-ta">${escapeHtml(c.files.map(f=>(f.folder?f.folder+' | ':'')+f.name).join('\n'))}</textarea>
    <div class="jp-sec">What the app files where <span class="stub" style="margin:0;font-weight:500;">· {week folder} = that week's folder</span></div>
    <div class="jp-rules">${JP_RULES.map(r=>{
      const cur = c.rules[r.key] || {on:r.on, folder:r.folder};
      const head = r.area!==lastArea ? `<div class="jp-area">${escapeHtml(r.area)}</div>` : ''; lastArea = r.area;
      return head+`<div class="jp-rule"><label class="jp-when"><input type="checkbox" id="jpOn_${r.key}" ${cur.on?'checked':''}> ${escapeHtml(r.when)}${r.nativeOnly?' <span class="jp-tag">new app</span>':''}</label><input id="jpF_${r.key}" value="${escapeHtml(cur.folder||'')}"></div>`;
    }).join('')}</div>
    <div class="jp-sec">Weekly folders</div>
    <div class="jp-row2">
      <div class="formfield"><label class="field-label">Week folder name</label><input id="jpWkName" value="${escapeHtml(w.name||'')}" oninput="jpWeekPreview()"></div>
      <div class="formfield"><label class="field-label">Week starts on</label><select id="jpWkStart" onchange="jpWeekPreview()">${days.map((d,i)=>`<option value="${i}" ${Number(w.weekStart)===i?'selected':''}>${d}</option>`).join('')}</select></div>
    </div>
    <div class="jp-row2">
      <div class="formfield"><label class="field-label">Week 1 is</label><select id="jpWk1"><option value="start" ${w.week1!=='first'?'selected':''}>The week of the job's start date</option><option value="first" ${w.week1==='first'?'selected':''}>The week of the first photo or report</option></select></div>
      <label class="jp-switch" style="margin-top:22px;"><input type="checkbox" id="jpWkDate" ${w.addDate?'checked':''} onchange="jpWeekPreview()"> Add the week's date</label>
    </div>
    <p class="stub" id="jpWkEx" style="margin:0 0 4px;">e.g. ${escapeHtml(jpWeekExample(w,1))}, ${escapeHtml(jpWeekExample(w,2))} …</p>
    <p class="stub" style="margin:0 0 10px;">Use {n} for the week number and {order} for the number in front (so Week 1 sorts as 2, after "1. Pre Start"). Weekly folders are only made when the first file for that week arrives.</p>
    <div class="jp-foot">${jpEd.isNew ? '' : `<button type="button" class="ghostbtn" style="width:auto;" onclick="jpResetStart()">Start again from RTB's template</button>`}<span style="flex:1"></span>
      <button type="button" class="ghostbtn" style="width:auto;" onclick="jpClose()">Cancel</button><button type="button" class="darkbtn" style="width:auto;" onclick="jpSave()">Save</button></div>
  </div>`;
}
window.jpClose = function(){ jpEd = null; jpDraw(); };
window.jpResetStart = async function(){
  if(!await customConfirm('Put every folder, document and rule back to the starting set taken from RTB’s template? Your changes here are lost when you save.')) return;
  jpEd.cfg = jpStartingPack(); jpDraw();
};
window.jpSave = async function(){
  jpRead();
  const c = jpEd.cfg, p = jpProblem(c);
  if(p){ customAlert(p); return; }
  const res = await sbFetch('/rest/v1/job_pack_settings', {method:'POST', headers:{'Prefer':'resolution=merge-duplicates,return=minimal'},
    body:JSON.stringify({org_id:ME.org_id, enabled:jpEd.enabled, config:c, updated_at:new Date().toISOString(), updated_by:ME.id})});
  if(!res.ok){ toast('Could not save — '+(await safeErr(res))); return; }
  jpSettings = {enabled:jpEd.enabled, config:c}; jpSettingsFor = ME.org_id;
  jpEd = null; jpDraw();
  toast('Job pack rules saved'+(jpSettings.enabled ? ' — new jobs will get their pack' : ' (switched off)'));
  render();
};
