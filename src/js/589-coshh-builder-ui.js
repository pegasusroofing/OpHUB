/* ================= COSHH Builder =================
 * Library (Admin Centre → Libraries → COSHH Substances, #/coshh-substances):
 *   one entry per product — name, manufacturer, use, the Safety Data Sheet
 *   itself (optional), hazard symbols, signal word, H / P codes (type the code,
 *   the wording fills in), how it can harm you, PPE, controls, first aid,
 *   storage, spills, disposal, fire. Upload the data sheet and the app reads
 *   the codes, symbols and signal word off it for you to check.
 *   Stored in rams_library_items with kind 'coshh' (same org + PM rules).
 * On a job (COSHH → Create / Upload COSHH → Create COSHH,
 * #/site/<id>/hs/coshh/new): tick the products, add where they're used, Issue.
 * Each product becomes its own COSHH assessment PDF (with its data sheet
 * attached at the back) in the job's COSHH list, for operatives to sign. */
const COSHH_DEFAULTS = {
  firstAid: 'Eyes: rinse cautiously with clean water for several minutes, remove contact lenses if easy to do, keep rinsing and get medical advice if irritation persists.\nSkin: wash with plenty of soap and water; remove contaminated clothing.\nBreathed in: move to fresh air and rest; get medical advice if unwell.\nSwallowed: rinse mouth, do not make the person sick, get medical advice and show the container or data sheet.',
  storage: 'Keep in the original container, tightly closed, in a cool, dry, well-ventilated place away from heat and ignition sources, and locked away from the public.',
  spill: 'Stop the leak if safe to do so, contain with sand or absorbent, scoop into a labelled container and stop it entering drains or watercourses.',
  disposal: 'Dispose of contents and containers through a licensed waste carrier in line with the data sheet. Do not pour into drains.',
  fire: 'Use extinguishing media suitable for the surrounding fire (as per the data sheet). Keep containers cool. Do not breathe smoke or fumes.',
};
function coshhBlank(){
  return {manufacturer:'', use:'', sdsPath:'', sdsName:'', pictos:[], signal:'', h:[], p:[], routes:[], ppe:['hand','eye'], wel:'', controls:'', firstAid:COSHH_DEFAULTS.firstAid, storage:COSHH_DEFAULTS.storage, spill:COSHH_DEFAULTS.spill, disposal:COSHH_DEFAULTS.disposal, fire:COSHH_DEFAULTS.fire, risk:'Low'};
}
async function coshhLoadLibrary(){
  const rows = await dbSelect('rams_library_items', 'org_id=eq.'+ME.org_id+'&kind=eq.coshh&order=title.asc');
  return (rows||[]).map(r=>Object.assign(r, {data: Object.assign(coshhBlank(), r.data||{})}));
}
function coshhPictoImgHtml(k, size){ const u = COSHH_PICTO_IMG[k]; return u ? `<img src="${u}" width="${size}" height="${size}" alt="${k}" style="display:block;">` : ''; }
function coshhCodeListHtml(codes){
  if(!codes.length) return '';
  return `<div class="coshhcodes">${codes.map(c=>{ const t = coshhCodeText(c); return `<div><b>${escapeHtml(c)}</b> ${t ? escapeHtml(t) : '<span style="color:#C0392B;">— code not recognised, check it</span>'}</div>`; }).join('')}</div>`;
}

// ---------- Library list ----------
let coshhLibQ = '';
async function renderCoshhLibrary(editId){
  const __gen = RENDER_GEN;
  if(!isFullManager(ME)){ go('#/team'); return; }
  if(editId) return renderCoshhSubstanceEdit(editId);
  const lib = await coshhLoadLibrary();
  let oldLeft = 0;
  if(false) try{ const done = new Set(lib.map(i=>i.data && i.data.importedFrom).filter(Boolean)); const old = await dbSelect('coshh_library_files', 'org_id=eq.'+ME.org_id+'&select=id,name'); oldLeft = old.filter(f=>/\.pdf$/i.test(f.name||'') && !/^COSHH Assessment/i.test(f.name||'') && !done.has(f.id)).length; }catch(e){}
  const lfq = coshhLibQ.trim().toLowerCase(), lfOf = i => (i.title+' '+(i.data.manufacturer||'')).toLowerCase();
  const hits = lib.filter(i=>!lfq || lfOf(i).includes(lfq)).length;
  const html = `<div class="card">
    <div class="coshhsteps"><div><b>1</b><span>Open a folder and <b>upload the data sheet</b> — the reader fills in the details.</span></div><div><b>2</b><span>Check it and tap <b>Create COSHH assessment</b> — it's saved in that folder.</span></div><div><b>3</b><span>Tick assessments to <b>export or email</b>, or add them to a job (COSHH › Add from COSHH Library).</span></div></div>
    <div class="pmchips" style="margin:0 0 12px;"><button type="button" class="pmchip ${coshhLibTab==='assess'?'on':''}" onclick="coshhLibTab='assess';render()">Assessments (folders)</button><button type="button" class="pmchip ${coshhLibTab==='products'?'on':''}" onclick="coshhLibTab='products';render()">Products (data sheets)</button></div>
    ${coshhLibTab==='assess' ? await coshhLibraryBrowserHtml() : `
    ${(()=>{ const c = {}; lib.forEach(i=>{ const k = coshhTitleKey(i.title); c[k] = (c[k]||0)+1; }); const d = Object.values(c).reduce((t,v)=>t+(v>1?v-1:0),0); return d ? `<div class="card" style="border:1.5px solid var(--warn);background:var(--warn-bg);padding:10px 12px;"><b>${d} duplicate product${d===1?'':'s'}</b> — the same data sheet was added more than once. <button type="button" class="darkbtn" style="margin-top:8px;" onclick="coshhRemoveDuplicates()">Remove duplicates</button></div>` : ''; })()}
    <input type="search" id="coshhLibSearch" placeholder="Search products…" value="${escapeHtml(coshhLibQ)}" autocomplete="off" style="width:100%;margin-bottom:10px;box-sizing:border-box;" oninput="coshhLibQ=this.value;liveFilter(this.value,'#coshhLibList')">
    <div id="coshhLibList">
    ${lib.map(it=>{ const d = it.data; return `<div class="card ramsitem" data-lf="${lfText(lfOf(it))}" style="cursor:pointer;${!lfq || lfOf(it).includes(lfq) ? '' : 'display:none;'}" onclick="go('#/coshh-substances/${it.id}')">
      <div class="ramsitem-head"><div style="flex:1;min-width:0;"><div class="ramsitem-title">${escapeHtml(it.title)}</div>
        <div class="stub" style="margin:0;">${escapeHtml(d.manufacturer||'')}${d.manufacturer?' · ':''}${d.h.length} hazard code${d.h.length===1?'':'s'}${d.sdsPath?' · 📄 data sheet':''}${d.signal?' · '+escapeHtml(d.signal):''}${d.needsCheck?' · <b style="color:var(--warn);">check me</b>':''}</div></div>
        <div style="display:flex;gap:2px;flex-wrap:wrap;justify-content:flex-end;max-width:120px;">${d.pictos.map(k=>coshhPictoImgHtml(k,26)).join('')}</div></div>
        <button type="button" class="ghostbtn" style="margin:8px 0 0;padding:6px 10px;font-size:12px;width:auto;" onclick="event.stopPropagation();coshhMakeAssessment('${it.id}')">📋 Create COSHH assessment ›</button></div>`; }).join('')}<div class="empty lf-empty" ${hits?'style="display:none;"':''}>${lib.length ? 'Nothing matches.' : 'No products yet — add your first one below.'}</div>
    </div>
    ${coshhBulk ? `<div class="card" style="margin:6px 0 0;text-align:center;"><span class="spinner"></span> ${escapeHtml(coshhBulk)}</div>` : `
    <label class="darkbtn" style="display:block;text-align:center;margin-top:6px;cursor:pointer;">📄 Add products from data sheets (PDF)
      <input type="file" accept="application/pdf" multiple style="display:none;" onchange="coshhBulkFromSds(this)"></label>
    <p class="stub" style="margin:6px 0 0;font-size:11.5px;">Pick one or several data sheets — the reader fills in each product for you to check.</p>
    <button class="ghostbtn" style="margin-top:8px;" onclick="coshhNewSubstance()">+ Add a product without a data sheet</button>`}`}
  </div>
  ${false && oldLeft ? `<div class="card" style="border:1.5px solid var(--brand1);">
    <p class="sectiontitle" style="margin-top:0;">Bring in your old COSHH library</p>
    <p class="stub" style="margin:0 0 10px;">${oldLeft} data sheet${oldLeft===1?'':'s'} from the old COSHH Library ${oldLeft===1?'hasn\'t':'haven\'t'} been turned into products yet. The reader will go through each one and set it up as a product — check each one afterwards.</p>
    <button class="darkbtn" ${coshhBulk?'disabled':''} onclick="coshhImportOld()">Bring in ${oldLeft} data sheet${oldLeft===1?'':'s'}</button>
  </div>` : ''}`;
  if(__gen === RENDER_GEN) document.getElementById('app').innerHTML = shell(html, {title:'COSHH Library', back:'#/team/libraries'});
}
// #(coshh-merge) One COSHH library: data sheets go in, the reader builds the
// product, and the data sheet is attached when an assessment is issued.
let coshhBulk = '';
// "Company designation Bauder Ltd." / "Supplier Bauder Ltd" → "Bauder Ltd"
function coshhCleanMaker(m){
  return String(m||'').replace(/^\s*(company\s*designation|company\s*name|company|supplier(\s*name)?|manufacturer(\s*name)?|name)\s*[:\-]?\s*/i,'').replace(/\.\s*$/,'').trim();
}
function coshhTitleKey(t){ return String(t||'').toLowerCase().replace(/[–—-]/g,'-').replace(/\s+/g,' ').trim(); }
// #(coshh-dupes) Same product uploaded twice: remove the extra copies (the
// first one made is kept) and tidy the manufacturer names.
window.coshhRemoveDuplicates = async function(){
  const lib = await coshhLoadLibrary();
  const seen = {}, extra = [];
  lib.slice().sort((a,b)=>new Date(a.created_at||0)-new Date(b.created_at||0)).forEach(it=>{ const k = coshhTitleKey(it.title); if(seen[k]) extra.push(it); else seen[k] = it; });
  if(!extra.length){ toast('No duplicates'); return; }
  if(!(await customConfirm(`Remove ${extra.length} duplicate product${extra.length===1?'':'s'}? The first copy of each is kept. Assessments already in folders aren't touched.`))) return;
  let n = 0; for(const it of extra){ if(await dbDelete('rams_library_items', it.id)) n++; }
  for(const it of Object.values(seen)){ const m = coshhCleanMaker(it.data && it.data.manufacturer); if(it.data && m !== it.data.manufacturer){ await dbUpdate('rams_library_items', it.id, {data:Object.assign({}, it.data, {manufacturer:m})}); } }
  toast(n+' duplicate'+(n===1?'':'s')+' removed'); render();
};
let coshhLibTab = 'assess';
let coshhPresetFolder; // folder chosen before the product was made (Assessments tab upload)
// #(coshh-assess-folders) Product → COSHH assessment PDF (data sheet on the
// back) saved into a folder of the COSHH Library; jobs add it from there.
function coshhPickFolder(folders, title){
  const byParent = {}; folders.forEach(f=>{ (byParent[f.parent_id||'']=byParent[f.parent_id||'']||[]).push(f); });
  const rows = []; const walk = (pid, depth)=>{ (byParent[pid]||[]).sort((a,b)=>a.name.localeCompare(b.name, undefined, {sensitivity:'base', numeric:true})).forEach(f=>{ rows.push({f, depth}); walk(f.id, depth+1); }); }; walk('', 0);
  return new Promise(resolve=>{
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;justify-content:center;';
    ov.innerHTML = `<div style="background:#fff;border-radius:18px 18px 0 0;width:100%;max-width:520px;max-height:75vh;overflow:auto;padding:16px 16px calc(16px + env(safe-area-inset-bottom));">
      <p class="sectiontitle" style="margin-top:0;">${escapeHtml(title || 'Save the assessment in which folder?')}</p>
      <button type="button" class="ghostbtn" data-id="" style="display:block;width:100%;text-align:left;margin:0 0 6px;text-transform:none;font-weight:700;">📂 Top level</button>
      ${rows.map(r=>`<button type="button" class="ghostbtn" data-id="${r.f.id}" style="display:block;width:100%;text-align:left;margin:0 0 6px;text-transform:none;font-weight:700;padding-left:${12+r.depth*18}px;">📁 ${escapeHtml(r.f.name)}</button>`).join('')}
      <button type="button" class="ghostbtn" data-new="1" style="margin-top:6px;">+ New folder</button>
      <button type="button" class="ghostbtn" data-cancel="1" style="margin-top:6px;">Cancel</button></div>`;
    ov.addEventListener('click', async ev=>{
      const b = ev.target.closest('button');
      if(ev.target===ov || (b && b.dataset.cancel)){ ov.remove(); resolve(undefined); return; }
      if(b && b.dataset.new){ ov.remove(); const name = await customPrompt('New folder name (e.g. Bauder, or Flat Roofing)', ''); if(!name || !name.trim()){ resolve(undefined); return; } const r = await dbInsert('coshh_library_folders', {org_id:ME.org_id, name:name.trim(), parent_id:null}); resolve(r && r[0] ? r[0].id : undefined); return; }
      if(b && b.dataset.id !== undefined){ ov.remove(); resolve(b.dataset.id || null); }
    });
    document.body.appendChild(ov);
  });
}
async function coshhSaveAssessment(it, folderId){
  const bytes = await buildCoshhPdf(it, null, {where:'', note:''});
  if(!bytes) return false;
  const fileName = 'COSHH Assessment - '+it.title.replace(/[\\/:*?"<>|]+/g,'-')+'.pdf';
  const path = ME.org_id+'/'+(folderId||'root')+'/'+uid()+'-'+fileName.replace(/[^a-z0-9.\-]+/gi,'_');
  const stored = await uploadToStorage('coshh-library', path, new Blob([bytes], {type:'application/pdf'}), 'application/pdf');
  if(!stored) return false;
  const rows = await dbInsert('coshh_library_files', {org_id:ME.org_id, folder_id:folderId||null, name:fileName, storage_path:stored, uploaded_by:ME.id});
  return !!rows;
}
window.coshhMakeAssessment = async function(productId, saveFirst){
  if(saveFirst && coshhEd && coshhEd.id===productId){
    if(!coshhEd.title.trim()){ toast('Give the product a name first'); return; }
    const ok = await dbUpdate('rams_library_items', coshhEd.id, {title:coshhEd.title.trim(), data:Object.assign({}, coshhEd.data, {needsCheck:undefined})});
    if(!ok){ toast('Could not save — try again'); return; }
  }
  const it = (await dbSelect('rams_library_items', 'id=eq.'+productId))[0];
  if(!it){ toast('Product not found'); return; }
  it.data = Object.assign(coshhBlank(), it.data||{});
  let folderId;
  if(coshhPresetFolder !== undefined){ folderId = coshhPresetFolder; coshhPresetFolder = undefined; }
  else { const folders = await dbSelect('coshh_library_folders', 'org_id=eq.'+ME.org_id+'&select=id,name,parent_id,position'); folderId = await coshhPickFolder(folders); }
  if(folderId === undefined) return;
  toast('Building the COSHH assessment…');
  const ok = await coshhSaveAssessment(it, folderId);
  if(!ok){ toast('Could not build or save it — try again'); return; }
  coshhEd = null; coshhLibTab = 'assess'; coshhLibFolderId = folderId || null;
  toast('Saved to the COSHH Library — add it to jobs from there');
  go('#/coshh-substances');
};
async function coshhProductFromSds(blob, fileName, opts){
  opts = opts || {};
  const e = {title:'', data:coshhBlank()};
  let stored = opts.sdsPath || null;
  if(!stored){
    const path = ME.org_id+'/sds/'+uid()+'-'+String(fileName||'data-sheet.pdf').replace(/[^a-z0-9.\-]+/gi,'_');
    stored = await uploadToStorage('coshh-library', path, blob, 'application/pdf');
  }
  if(stored){ e.data.sdsPath = stored; e.data.sdsName = fileName; }
  let n = 0;
  try{ n = coshhApplySds(e, await coshhReadSds(blob)); }catch(err){ console.warn('[sds]', err); }
  if(!e.title) e.title = String(fileName||'Product').replace(/\.pdf$/i,'').replace(/[_-]+/g,' ').trim();
  if(!e.data.manufacturer && opts.folderName) e.data.manufacturer = opts.folderName;
  if(opts.importedFrom) e.data.importedFrom = opts.importedFrom;
  e.data.needsCheck = true;
  // Same product already in the library (e.g. the sheet uploaded again): update it rather than adding a second copy.
  const existing = (await coshhLoadLibrary()).find(i=>coshhTitleKey(i.title)===coshhTitleKey(e.title));
  if(existing){ const row = await dbUpdate('rams_library_items', existing.id, {title:e.title.slice(0,140), data:e.data, updated_at:new Date().toISOString()}); return row ? {id:existing.id, n, updated:true} : null; }
  const rows = await dbInsert('rams_library_items', [{org_id:ME.org_id, kind:'coshh', title:e.title.slice(0,140), data:e.data, sort_order:0, created_by:ME.id}]);
  return rows && rows[0] ? {id:rows[0].id, n} : null;
}
window.coshhBulkFromSds = async function(input){
  const files = Array.from(input.files||[]).filter(f=>/pdf/i.test(f.type) || /\.pdf$/i.test(f.name)); input.value = '';
  if(!files.length) return;
  let made = 0, firstId = null;
  for(let i=0;i<files.length;i++){
    coshhBulk = `Reading data sheet ${i+1} of ${files.length}…`; render();
    try{ const r = await coshhProductFromSds(files[i], files[i].name); if(r){ made++; firstId = firstId || r.id; } }catch(e){}
  }
  coshhBulk = ''; 
  if(made===1 && firstId){ toast('Product set up from the data sheet — please check it'); go('#/coshh-substances/'+firstId); return; }
  toast(made ? made+' products set up — open each to check' : 'Could not read those files — try again'); render();
};
window.coshhImportOld = async function(){
  const lib = await coshhLoadLibrary();
  const done = new Set(lib.map(i=>i.data && i.data.importedFrom).filter(Boolean));
  const [files, folders] = await Promise.all([
    dbSelect('coshh_library_files', 'org_id=eq.'+ME.org_id+'&select=*&order=name.asc'),
    dbSelect('coshh_library_folders', 'org_id=eq.'+ME.org_id+'&select=id,name,parent_id'),
  ]);
  const fname = id => { const f = folders.find(x=>x.id===id); return f ? f.name : ''; };
  const todo = files.filter(f=>/\.pdf$/i.test(f.name||'') && !/^COSHH Assessment/i.test(f.name||'') && !done.has(f.id));
  if(!todo.length){ toast('Nothing left to bring in'); return; }
  if(!(await customConfirm(`Bring in ${todo.length} data sheet${todo.length===1?'':'s'}? Each becomes a product — it can take a minute.`))) return;
  let made = 0;
  for(let i=0;i<todo.length;i++){
    const f = todo[i];
    coshhBulk = `Reading ${i+1} of ${todo.length}: ${f.name}`; render();
    try{
      const res = await fetchWithTimeout(publicUrl('coshh-library', f.storage_path), {}, 60000);
      if(!res.ok) continue;
      const blob = await res.blob();
      const r = await coshhProductFromSds(blob, f.name, {sdsPath:f.storage_path, folderName:fname(f.folder_id), importedFrom:f.id});
      if(r) made++;
    }catch(e){}
  }
  coshhBulk = ''; toast(made+' product'+(made===1?'':'s')+' brought in — tap each to check'); render();
};
window.coshhNewSubstance = async function(){
  const name = await customPrompt('Product name', '');
  if(!name || !name.trim()) return;
  const rows = await dbInsert('rams_library_items', [{org_id:ME.org_id, kind:'coshh', title:name.trim(), data:coshhBlank(), sort_order:0, created_by:ME.id}]);
  if(rows && rows[0]) go('#/coshh-substances/'+rows[0].id);
};

// ---------- Library entry editor ----------
let coshhEd = null; // {id, title, data, busy}
let coshhReturnSite = null; // set when a product is added from a job's Create COSHH page
// #(coshh-link) Product → assessment: pick the job, land on Create COSHH with it ticked.
window.coshhAssessFrom = async function(productId, saveFirst){
  if(saveFirst && coshhEd && coshhEd.id===productId){
    if(!coshhEd.title.trim()){ toast('Give the product a name first'); return; }
    const ok = await dbUpdate('rams_library_items', coshhEd.id, {title:coshhEd.title.trim(), data:coshhEd.data});
    if(!ok){ toast('Could not save — try again'); return; }
  }
  const sites = SITES.filter(s=>{ const k = siteStatusKey(s); return k==='live' || k==='upcoming'; }).sort((a,b)=>a.name.localeCompare(b.name));
  if(!sites.length){ toast('No live or upcoming jobs'); return; }
  const picked = await coshhPickSite(sites);
  if(!picked) return;
  coshhEd = null;
  go('#/site/'+picked+'/hs/coshh/new?pick='+productId);
};
function coshhPickSite(sites){
  return new Promise(resolve=>{
    const ov = document.createElement('div');
    ov.className = 'pdfoverlay'; ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;justify-content:center;';
    ov.innerHTML = `<div style="background:#fff;border-radius:18px 18px 0 0;width:100%;max-width:520px;max-height:75vh;overflow:auto;padding:16px 16px calc(16px + env(safe-area-inset-bottom));">
      <p class="sectiontitle" style="margin-top:0;">Which job is it for?</p>
      <input type="search" placeholder="Search jobs…" style="width:100%;box-sizing:border-box;margin-bottom:8px;" oninput="const q=this.value.toLowerCase();this.parentNode.querySelectorAll('[data-sn]').forEach(b=>b.style.display=b.dataset.sn.includes(q)?'':'none')">
      ${sites.map(s=>`<button type="button" class="ghostbtn" data-sn="${escapeHtml((s.name+' '+(s.address||'')).toLowerCase())}" data-id="${s.id}" style="display:block;width:100%;text-align:left;margin:0 0 6px;text-transform:none;font-weight:700;">${escapeHtml(s.name)}<span class="stub" style="display:block;margin:0;font-weight:400;">${escapeHtml(fullSiteAddress(s)||'')}</span></button>`).join('')}
      <button type="button" class="ghostbtn" data-cancel="1" style="margin-top:6px;">Cancel</button></div>`;
    ov.addEventListener('click', ev=>{ const b = ev.target.closest('button'); if(ev.target===ov || (b && b.dataset.cancel)){ ov.remove(); resolve(null); return; } if(b && b.dataset.id){ ov.remove(); resolve(b.dataset.id); } });
    document.body.appendChild(ov);
  });
}
window.coshhPreviewAssessment = async function(){
  const e = coshhEd; if(!e) return;
  toast('Building preview…');
  const bytes = await buildCoshhPdf({id:e.id, title:e.title, data:e.data}, null, {where:'', note:''});
  if(bytes) await deliverPdf(bytes, 'COSHH preview - '+(e.title||'product').replace(/[\\/:*?"<>|]+/g,'-')+'.pdf');
};
window.coshhNewProductForSite = async function(siteId){
  const name = await customPrompt('New product name', '');
  if(!name || !name.trim()) return;
  const rows = await dbInsert('rams_library_items', [{org_id:ME.org_id, kind:'coshh', title:name.trim(), data:coshhBlank(), sort_order:0, created_by:ME.id}]);
  if(rows && rows[0]){ coshhReturnSite = siteId; go('#/coshh-substances/'+rows[0].id); }
};
async function renderCoshhSubstanceEdit(id){
  const __gen = RENDER_GEN;
  if(!coshhEd || coshhEd.id!==id){
    const r = (await dbSelect('rams_library_items', 'id=eq.'+id))[0];
    if(!r){ toast('Not found'); go('#/coshh-substances'); return; }
    coshhEd = {id, title:r.title, data:Object.assign(coshhBlank(), r.data||{}), busy:false};
  }
  const e = coshhEd, d = e.data;
  const area = (k, label, rows) => `<div class="formfield"><label class="field-label">${label}</label><textarea rows="${rows||3}" oninput="coshhEd.data['${k}']=this.value">${escapeHtml(d[k]||'')}</textarea></div>`;
  const html = `
    <div class="card coshhlink">
      <p class="sectiontitle" style="margin-top:0;">COSHH assessment from this product</p>
      <p class="stub" style="margin:0 0 8px;">Makes the COSHH assessment from these details${d.sdsPath?' with the data sheet on the back':''} and saves it into a folder of the COSHH Library, ready to add to jobs.</p>
      <div class="row-gap"><button type="button" class="darkbtn" style="flex:1;" onclick="coshhMakeAssessment('${e.id}', true)">📋 Create COSHH assessment</button><button type="button" class="ghostbtn" style="flex:0 0 auto;width:auto;padding:10px 14px;" onclick="coshhPreviewAssessment()">👁 Preview</button></div>
    </div>
    <div class="card">
      <div class="formfield"><label class="field-label">Product name <span style="color:#C0392B;">*</span></label><input type="text" value="${escapeHtml(e.title)}" oninput="coshhEd.title=this.value"></div>
      <div class="formfield"><label class="field-label">Manufacturer / supplier</label><input type="text" value="${escapeHtml(d.manufacturer)}" oninput="coshhEd.data.manufacturer=this.value"></div>
      <div class="formfield"><label class="field-label">What it's used for</label><input type="text" placeholder="e.g. Bonding insulation boards to the deck" value="${escapeHtml(d.use)}" oninput="coshhEd.data.use=this.value"></div>
    </div>
    <div class="card">
      <p class="sectiontitle" style="margin-top:0;">Safety Data Sheet <span class="stub" style="display:inline;">(optional)</span></p>
      ${d.sdsPath ? `<div class="meta" style="margin-bottom:8px;">📄 <span class="viewlink" style="cursor:pointer;" onclick="viewDrawing('${publicUrl('coshh-library', d.sdsPath)}', false, '${jsAttr(d.sdsName||'Safety Data Sheet.pdf')}')">${escapeHtml(d.sdsName||'Safety Data Sheet')}</span> · <span class="viewlink" style="cursor:pointer;color:var(--warn);" onclick="coshhEd.data.sdsPath='';coshhEd.data.sdsName='';render()">remove</span></div>` : ''}
      <div class="ghostbtn" style="cursor:pointer;text-align:center;" onclick="document.getElementById('coshhSdsFile').click()">${e.busy ? 'Reading the data sheet…' : (d.sdsPath ? 'Replace data sheet (PDF)' : 'Add data sheet (PDF)')}</div>
      <input type="file" id="coshhSdsFile" accept="application/pdf" style="display:none;" onchange="coshhAddSds(this)">
      <p class="stub" style="margin:6px 0 0;">The codes, symbols and signal word are read off the data sheet and filled in below — check them. It's attached to the back of every COSHH assessment made from this product.</p>
    </div>
    <div class="card">
      <p class="sectiontitle" style="margin-top:0;">Hazard symbols</p>
      <div class="coshhpictos">${COSHH_PICTOS.map(p=>`<label class="coshhpicto ${d.pictos.includes(p.key)?'on':''}"><input type="checkbox" ${d.pictos.includes(p.key)?'checked':''} onchange="coshhTogglePicto('${p.key}',this.checked,this)">${coshhPictoImgHtml(p.key,48)}<span>${p.label}</span></label>`).join('')}</div>
      <p class="field-label" style="margin:12px 0 6px;">Signal word</p>
      <div class="filterrow">${['','Warning','Danger'].map(w=>`<div class="filterchip ${d.signal===w?'active':''}" onclick="coshhEd.data.signal='${w}';coshhRerender()">${w||'None'}</div>`).join('')}</div>
    </div>
    <div class="card">
      <p class="sectiontitle" style="margin-top:0;">Hazard statements (H codes)</p>
      <input type="text" id="coshhH" placeholder="Type the codes, e.g. H315 H317 H319" value="${escapeHtml(d.h.join(' '))}" oninput="coshhCodesInput('h',this.value)">
      <div id="coshhHList">${coshhCodeListHtml(d.h)}</div>
      ${d.h.length && !d.pictos.length ? `<button class="ghostbtn" style="margin-top:8px;" onclick="coshhUseSuggested()">Fill in the usual symbols & signal word for these codes</button>` : ''}
      <p class="sectiontitle">Precautionary statements (P codes)</p>
      <input type="text" id="coshhP" placeholder="e.g. P280 P305+P351+P338" value="${escapeHtml(d.p.join(' '))}" oninput="coshhCodesInput('p',this.value)">
      <div id="coshhPList">${coshhCodeListHtml(d.p)}</div>
      <div class="formfield" style="margin-top:10px;"><label class="field-label">Workplace exposure limit (if on the data sheet)</label><input type="text" placeholder="e.g. Portland cement dust 10 mg/m³ inhalable (8hr TWA)" value="${escapeHtml(d.wel)}" oninput="coshhEd.data.wel=this.value"></div>
    </div>
    <div class="card">
      <p class="sectiontitle" style="margin-top:0;">How can it harm you?</p>
      <div class="ramschips">${COSHH_ROUTES.map(([k,l])=>`<label class="ramschip ${d.routes.includes(k)?'on':''}"><input type="checkbox" ${d.routes.includes(k)?'checked':''} onchange="coshhToggleArr('routes','${k}',this.checked,this)"> ${l}</label>`).join('')}</div>
      <p class="sectiontitle">PPE to wear</p>
      <div class="ramschips">${RAMS_PPE.map(p=>`<label class="ramschip ${d.ppe.includes(p.key)?'on':''}"><input type="checkbox" ${d.ppe.includes(p.key)?'checked':''} onchange="coshhToggleArr('ppe','${p.key}',this.checked,this)"> ${p.icon} ${p.label}</label>`).join('')}</div>
      <p class="field-label" style="margin:12px 0 6px;">Risk level</p>
      <div class="filterrow">${['Low','Medium','High'].map(w=>`<div class="filterchip ${d.risk===w?'active':''}" onclick="coshhEd.data.risk='${w}';coshhRerender()">${w}</div>`).join('')}</div>
    </div>
    <div class="card">
      ${area('controls', 'How to use it safely (controls)', 4)}
      ${area('firstAid', 'First aid', 5)}
      ${area('storage', 'Storage')}
      ${area('spill', 'Spillage')}
      ${area('disposal', 'Disposal')}
      ${area('fire', 'Fire')}
    </div>
    <button class="darkbtn" onclick="coshhSaveSubstance()">Save product</button>
    <button class="ghostbtn" style="margin-top:8px;color:var(--warn);" onclick="coshhDeleteSubstance()">Delete product</button>
  `;
  if(__gen === RENDER_GEN) document.getElementById('app').innerHTML = shell(html, {title:'COSHH Product', back:'#/coshh-substances'});
}
async function coshhRerender(){ const y = appScrollY(); await render(); appScrollTo(y); }
window.coshhTogglePicto = function(k, on, el){ const d = coshhEd.data; d.pictos = d.pictos.filter(x=>x!==k); if(on) d.pictos.push(k); d.pictos = COSHH_PICTOS.map(p=>p.key).filter(x=>d.pictos.includes(x)); if(el) el.parentNode.classList.toggle('on', on); };
window.coshhToggleArr = function(key, val, on, el){ const d = coshhEd.data; d[key] = (d[key]||[]).filter(x=>x!==val); if(on) d[key].push(val); if(el) el.parentNode.classList.toggle('on', on); };
window.coshhCodesInput = function(which, val){
  coshhEd.data[which] = coshhParseCodes(val, which==='p'?'P':'H');
  const el = document.getElementById(which==='p'?'coshhPList':'coshhHList'); if(el) el.innerHTML = coshhCodeListHtml(coshhEd.data[which]);
};
window.coshhUseSuggested = function(){ const d = coshhEd.data; d.pictos = coshhSuggestPictos(d.h); if(!d.signal) d.signal = coshhSuggestSignal(d.h); coshhRerender(); };
window.coshhSaveSubstance = async function(){
  const e = coshhEd; if(!e) return;
  if(!String(e.title||'').trim()){ toast('Give the product a name'); return; }
  delete e.data.needsCheck;
  const row = await dbUpdate('rams_library_items', e.id, {title:e.title.trim(), data:e.data, updated_at:new Date().toISOString()});
  if(row){ toast('Saved'); coshhEd = null; if(coshhReturnSite){ const sid = coshhReturnSite; coshhReturnSite = null; go('#/site/'+sid+'/hs/coshh/new?pick='+e.id); } else go('#/coshh-substances'); }
};
window.coshhDeleteSubstance = async function(){
  const e = coshhEd; if(!e) return;
  if(!(await customConfirm(`Delete "${e.title}" from the COSHH library?\n\nCOSHH assessments already issued on jobs are not affected.`))) return;
  await dbDelete('rams_library_items', e.id); coshhEd = null; go('#/coshh-substances');
};
// Upload the data sheet, then read the codes off it.
window.coshhAddSds = async function(input){
  const file = input.files && input.files[0]; input.value = '';
  if(!file) return;
  const e = coshhEd; e.busy = true; coshhRerender();
  try{
    const path = ME.org_id+'/sds/'+uid()+'-'+file.name.replace(/[^a-z0-9.\-]+/gi,'_');
    const stored = await uploadToStorage('coshh-library', path, file, 'application/pdf');
    if(stored){ e.data.sdsPath = stored; e.data.sdsName = file.name; }
    const found = await coshhReadSds(file);
    const n = coshhApplySds(e, found);
    toast(n ? 'Filled in '+n+' item'+(n===1?'':'s')+' from the data sheet — please check them' : 'Data sheet attached. Nothing could be read from it (it may be a scan) — fill it in by hand.');
  }catch(err){ console.warn('[sds]', err); toast('Data sheet attached, but it could not be read — fill it in by hand.'); }
  e.busy = false; coshhRerender();
};
// Puts what was read into the form. Text boxes are only filled if they're empty
// or still hold the standard wording, so nothing you've typed is overwritten.
function coshhApplySds(e, f){
  const d = e.data; let n = 0;
  const isDefault = k => !String(d[k]||'').trim() || d[k]===COSHH_DEFAULTS[k];
  const setText = (k, v) => { if(v && isDefault(k)){ d[k] = v; n++; } };
  if(f.h.length){ d.h = f.h; n++; }
  if(f.p.length){ d.p = f.p; n++; }
  if(f.pictos.length){ d.pictos = f.pictos; n++; } else if(f.h.length && !d.pictos.length){ d.pictos = coshhSuggestPictos(f.h); n++; }
  if(f.signal){ d.signal = f.signal; n++; } else if(f.h.length && !d.signal){ d.signal = coshhSuggestSignal(f.h); }
  if(f.product && (!e.title || /^new product$/i.test(e.title))){ e.title = f.product; n++; }
  if(f.manufacturer && !d.manufacturer){ d.manufacturer = f.manufacturer; n++; }
  if(f.use && !d.use){ d.use = f.use; n++; }
  if(f.wel && !d.wel){ d.wel = f.wel; n++; }
  setText('firstAid', f.firstAid); setText('fire', f.fire); setText('spill', f.spill); setText('storage', f.storage); setText('disposal', f.disposal);
  if(f.controls && !String(d.controls||'').trim()){ d.controls = f.controls; n++; }
  if(f.ppe.length){ f.ppe.forEach(k=>{ if(!d.ppe.includes(k)) d.ppe.push(k); }); n++; }
  const add = r => { if(!d.routes.includes(r)) d.routes.push(r); };
  if(f.h.some(c=>/^H33|^H304/.test(c))) add('inhale');
  if(f.h.some(c=>/^H31[0-7]|^EUH066/.test(c))) add('skin');
  if(f.h.some(c=>/^H31[489]/.test(c))) add('eyes');
  if(f.h.some(c=>/^H30[0-4]/.test(c))) add('swallow');
  return n;
}
// ---- Safety Data Sheet reader (no AI) ----
// Every SDS has the same 16 numbered sections (UK/EU REACH), even though the
// layouts differ. The text is rebuilt line by line, split at those section
// headings, then each part is tidied up for the form.
const COSHH_SDS_SECTIONS = [
  [1, 'identification'], [2, 'hazards?\\s*identification'], [3, 'composition'], [4, 'first[\\s-]*aid'], [5, 'fire[\\s-]*fighting'],
  [6, 'accidental\\s*release'], [7, 'handling\\s*and\\s*storage'], [8, 'exposure\\s*controls'], [9, 'physical'],
  [10, 'stability'], [11, 'toxicolog'], [12, 'ecolog'], [13, 'disposal'], [14, 'transport'], [15, 'regulatory'], [16, 'other\\s*information'],
];
async function coshhSdsText(file){
  if(!(await loadLib('pdfjsLib'))) return '';
  const pdf = await pdfjsLib.getDocument({data: new Uint8Array(await file.arrayBuffer())}).promise;
  const pages = [];
  for(let i=1; i<=Math.min(pdf.numPages, 25); i++){
    const pg = await pdf.getPage(i); const tc = await pg.getTextContent();
    // Put the text back in reading order (top to bottom, left to right) —
    // PDFs don't always store it that way.
    const items = tc.items.filter(t=>t.str && t.transform).map(t=>({s:t.str, x:t.transform[4], y:t.transform[5]}));
    items.sort((a,b)=> Math.abs(b.y-a.y) > 3 ? b.y-a.y : a.x-b.x);
    let out = '', lastY = null;
    items.forEach(t=>{
      if(lastY!==null && Math.abs(t.y-lastY) > 3) out += '\n'; else if(out && !/[ \n]$/.test(out)) out += ' ';
      out += t.s; lastY = t.y;
    });
    pages.push(out);
  }
  // Lines that repeat on most pages are headers/footers — drop them.
  const count = {};
  pages.forEach(p=>{ new Set(p.split('\n').map(l=>l.trim()).filter(Boolean)).forEach(l=>{ count[l] = (count[l]||0)+1; }); });
  const minRep = Math.max(3, Math.ceil(pages.length*0.6));
  return pages.map(p=>p.split('\n').filter(l=>{ const t = l.trim(); return !(count[t] >= minRep) && !/^pag\s*e\s*\d+\s*(of|\/)\s*\d+$/i.test(t) && !/^page\s*\d+\s*(of|\/)\s*\d+$/i.test(t); }).join('\n')).join('\n');
}
function coshhSdsSplit(text){
  const pos = {};
  let from = 0;
  COSHH_SDS_SECTIONS.forEach(([n, kw])=>{
    const re = new RegExp('(?:^|\\n)[ \\t]*(?:section|SECTION|Section)?[ \\t]*'+n+'[ \\t]*[.:\\-–)]?[ \\t]*(?:[A-Za-z ]{0,15})?'+kw, 'i');
    const m = re.exec(text.slice(from));
    if(m){ pos[n] = from + m.index; from = pos[n] + 4; }
  });
  const out = {};
  const keys = Object.keys(pos).map(Number).sort((a,b)=>a-b);
  keys.forEach((n,i)=>{ const end = i+1<keys.length ? pos[keys[i+1]] : text.length; out[n] = text.slice(pos[n], end); });
  return out;
}
// Clean a section for a text box: drop its heading, join wrapped lines, keep "Eye contact:"-style labels on new lines.
function coshhSdsTidy(t, max){
  if(!t) return '';
  let lines = t.split('\n').map(l=>l.replace(/\s+/g,' ').trim()).filter(Boolean);
  lines.shift(); // section heading
  lines = lines.filter(l=>!/^(SECTION|Section)\s*\d+/.test(l) && !/^\d{1,2}\.\d{1,2}\.?\s*$/.test(l));
  let out = '';
  lines.forEach(l=>{
    l = l.replace(/^\d{1,2}\.\d{1,2}(\.\d)?\.?\s+/, '');
    l = l.replace(/^description of first[\s-]*aid measures\s*:?\s*/i, '');
    l = l.replace(/^(extinguishing media|suitable extinguishing (?:media|equipment)|unsuitable extinguishing (?:media|equipment)|special hazards arising from the substance or mixture|advice for fire[\s-]*fighters|personal precautions[^:]{0,60}|environmental precautions|methods and materials? for containment and cleaning up|methods for cleaning up|precautions for safe handling|conditions for safe storage[^:]{0,60}|waste treatment methods)\s*:?\s*/i, (m0,t)=>t.charAt(0).toUpperCase()+t.slice(1).toLowerCase()+': ');
    if(!l) return;
    const startsNew = /^[A-Z][A-Za-z /()\-]{2,45}[:\-–]/.test(l) || /^[•\-–]\s/.test(l) || /[.:]$/.test(out);
    out += out ? (startsNew ? '\n' : ' ') + l : l;
  });
  out = out.replace(/\n{2,}/g,'\n').replace(/[ \t]{2,}/g,' ').replace(/: \n/g,':\n').trim();
  if(max && out.length > max){ out = out.slice(0, max); out = out.slice(0, Math.max(out.lastIndexOf('. '), max-80)+1) + ' (see data sheet)'; }
  return out;
}
function coshhSdsSub(sec, n, sub){
  if(!sec) return '';
  const re = new RegExp('(?:^|\\n)[ \\t]*'+n+'\\.'+sub+'\\b');
  const m = re.exec(sec); if(!m) return '';
  const rest = sec.slice(m.index+1);
  const nx = new RegExp('\\n[ \\t]*'+n+'\\.'+(sub+1)+'\\b').exec(rest);
  return 'x\n'+(nx ? rest.slice(0, nx.index) : rest);
}
async function coshhReadSds(file){
  const res = {h:[], p:[], pictos:[], signal:'', manufacturer:'', product:'', use:'', wel:'', firstAid:'', fire:'', spill:'', storage:'', disposal:'', controls:'', ppe:[]};
  const text = await coshhSdsText(file);
  if(!text.trim()) return res;
  const S = coshhSdsSplit(text);
  const s2 = S[2] || text.slice(0, 8000);
  res.h = coshhParseCodes(s2, 'H').filter(c=>coshhCodeText(c));
  res.p = coshhParseCodes(s2, 'P').filter(c=>coshhCodeText(c));
  res.pictos = COSHH_PICTOS.map(p=>p.key).filter(k=>new RegExp(k.replace('0','0?'),'i').test(s2));
  const sw = /Signal\s*words?\s*[:\-]?\s*(Danger|Warning)/i.exec(s2); if(sw) res.signal = sw[1][0].toUpperCase()+sw[1].slice(1).toLowerCase();
  const s1 = S[1] || text.slice(0, 3000);
  const pick = (re) => { const m = re.exec(s1); return m ? m[1].replace(/\s+/g,' ').trim().replace(/[.,;]$/,'') : ''; };
  res.product = pick(/(?:Product\s*name|Trade\s*name)[ \t]*[:\-]?[ \t]*([^\n]{3,90})/i) || pick(/Product\s*identifier[ \t]*[:\-][ \t]*([^\n]{3,90})/i);
  res.use = pick(/(?:Intended\s*use|Identified\s*uses?|Recommended\s*use|Use\s*of\s*the\s*(?:substance|mixture))[ \t]*[:\-][ \t]*([^\n]{3,90})/i);
  res.manufacturer = pick(/(?:Company\s*name|Supplier|Manufacturer)[ \t]*(?:name)?[ \t]*[:\-][ \t]*([^\n]{3,120})/i) || (()=>{ const m = /1\.3[^\n]*\n\s*([^\n]{3,120})/.exec(s1); return m ? m[1].replace(/\s+/g,' ').trim() : ''; })();
  res.manufacturer = coshhCleanMaker(res.manufacturer);
  if(/^(name|address|details|of the)/i.test(res.manufacturer)) res.manufacturer = '';
  res.firstAid = coshhSdsTidy(coshhSdsSub(S[4], 4, 1) || S[4], 900);
  res.fire = coshhSdsTidy(S[5], 600);
  res.spill = coshhSdsTidy((coshhSdsSub(S[6], 6, 2)||'') + (coshhSdsSub(S[6], 6, 3)||'').replace(/^x\n/, '\n') || S[6], 700);
  res.storage = coshhSdsTidy(coshhSdsSub(S[7], 7, 2) || S[7], 600);
  res.controls = coshhSdsTidy(coshhSdsSub(S[7], 7, 1), 700);
  res.disposal = coshhSdsTidy(coshhSdsSub(S[13], 13, 1) || S[13], 500);
  if(S[8]){
    // UK limits: a "WEL GBR" row in a limits table (with the substance named above it), or any line giving mg/m³ / ppm.
    const lines8 = S[8].split('\n').map(l=>l.replace(/\s+/g,' ').trim()).filter(Boolean);
    const wel = [];
    lines8.forEach((l,i)=>{
      const m = /^WEL\s+(?:GBR|UK|GB)\s+([\d.,-]+)\s+([\d.,-]+)(?:\s+([\d.,-]+)\s+([\d.,-]+))?/i.exec(l);
      if(m){
        let name = ''; for(let j=i-1; j>=0 && j>i-25; j--){ const c = lines8[j]; if(/^[A-Z0-9][A-Z0-9 ,()\-\/]{3,60}$/.test(c) && !/THRESHOLD|TYPE|TWA|STEL|COUNTRY|VALUE|MG\/M|PPM/i.test(c) && !/\b(ESP|FRA|FIN|GBR|ITA|ROU|EU|DEU|NLD|IRL|BEL|AUT|POL|PRT|SWE|DNK|CZE|SVK|HUN|USA)\b/.test(c) && (c.match(/\d+/g)||[]).length < 3){ name = c; break; } }
        const v = (a,b)=>[a&&a!=='-'?a+' mg/m³':'', b&&b!=='-'?b+' ppm':''].filter(Boolean).join(' / ');
        wel.push((name ? name.charAt(0)+name.slice(1).toLowerCase()+': ' : '')+[v(m[1],m[2]) ? v(m[1],m[2])+' (8hr)' : '', v(m[3],m[4]) ? v(m[3],m[4])+' (15 min)' : ''].filter(Boolean).join(', '));
      }
    });
    if(!wel.length) lines8.forEach(l=>{ if(/(mg\/m|ppm|f\/ml)/i.test(l) && /\d/.test(l) && /[a-z]{3}/i.test(l.replace(/mg\/m|ppm/gi,'')) && l.length > 15 && l.length < 160 && !/^type\b/i.test(l)) wel.push(l); });
    res.wel = wel.slice(0, 6).join('; ');
    const t = S[8].toLowerCase();
    if(/glove|hand protection/.test(t)) res.ppe.push('hand');
    if(/goggle|safety glasses|eye protection|eye\/face/.test(t)) res.ppe.push('eye');
    if(/face shield|face-shield|visor/.test(t)) res.ppe.push('face');
    if(/respirator|respiratory protection|filter type|ffp3|half mask|full face mask/.test(t)) res.ppe.push(/dust|ffp2|p2\b/.test(t) && !/ffp3|filter type a/.test(t) ? 'dust' : 'ffp3');
    if(/overall|coverall|protective clothing|body protection/.test(t)) res.ppe.push('overalls');
    if(/safety boots|safety footwear|protective footwear|boots/.test(t)) res.ppe.push('boots');
    if(/hearing|ear protection|ear defender/.test(t)) res.ppe.push('ear');
  }
  return res;
}

// ---------- Create COSHH on a job ----------
let coshhNewQ = '';
async function renderCoshhNew(siteId){
  const __gen = RENDER_GEN;
  if(!isManager(ME)){ go('#/site/'+siteId+'/hs/coshh'); return; }
  const site = SITES.find(s=>s.id===siteId);
  const lib = await coshhLoadLibrary();
  const pick = routeQuery().get('pick') || '';
  const html = `
    <div class="card">
      <p class="stub" style="margin:0 0 10px;">Tick the products being used on this job. Each one becomes its own COSHH assessment in the job's COSHH list for the team to sign, with its data sheet attached.</p>
      ${lib.length ? `<input type="text" id="coshhNewSearch" placeholder="Search products…" style="width:100%;box-sizing:border-box;margin-bottom:6px;" oninput="const q=this.value.toLowerCase();document.querySelectorAll('.coshhNewRow').forEach(r=>r.style.display=r.dataset.n.includes(q)?'':'none')">` : ''}
      <div id="coshhSelAllWrap" style="${pick?'':'display:none;'}"><label class="ramsstart"><input type="checkbox" id="coshhSelAll" onchange="document.querySelectorAll('.coshhPick').forEach(c=>{ if(c.closest('.coshhNewRow').style.display!=='none') c.checked=this.checked; })"> <div><b>Select all</b></div></label></div>
      ${lib.map(it=>`<label class="ramsstart coshhNewRow" data-n="${escapeHtml((it.title+' '+(it.data.manufacturer||'')).toLowerCase())}"><input type="checkbox" class="coshhPick" value="${it.id}" ${it.id===pick?'checked':''} onchange="document.getElementById('coshhSelAllWrap').style.display=document.querySelector('.coshhPick:checked')?'':'none'"> <div style="flex:1;min-width:0;"><b>${escapeHtml(it.title)}</b><div class="stub" style="margin:0;">${escapeHtml(it.data.manufacturer||'')}${it.data.sdsPath?(it.data.manufacturer?' · ':'')+'📄 data sheet':''}</div></div><div style="display:flex;gap:2px;">${it.data.pictos.slice(0,4).map(k=>coshhPictoImgHtml(k,22)).join('')}</div></label>`).join('') || `<div class="empty">No products in the COSHH library yet.${isFullManager(ME) ? ` <span class="viewlink" style="cursor:pointer;" onclick="go('#/coshh-substances')">Add them here</span>` : ''}</div>`}
    </div>
    ${isFullManager(ME) ? `<button type="button" class="ghostbtn" style="margin:-4px 0 12px;" onclick="coshhNewProductForSite('${siteId}')">+ Product not listed? Add it to the library</button>` : ''}
    ${lib.length ? `<div class="card">
      <div class="formfield" style="margin-top:0;"><label class="field-label">Where is it used on this job? <span class="stub" style="display:inline;">(optional)</span></label><input type="text" id="coshhWhere" placeholder="e.g. Flat roof to rear, applied by roller"></div>
      <div class="formfield"><label class="field-label">Anything else to note <span class="stub" style="display:inline;">(optional)</span></label><input type="text" id="coshhNote" placeholder="e.g. Residents' windows to be closed while in use"></div>
    </div>
    <button class="darkbtn" onclick="coshhIssue('${siteId}')">Issue COSHH</button>` : ''}
  `;
  if(__gen === RENDER_GEN) document.getElementById('app').innerHTML = shell(html, {title:'Create COSHH', subtitle:site?site.name:'', siteNameSubtitle:true, back:`#/site/${siteId}/hs/coshh`, siteId});
}
window.coshhIssue = async function(siteId){
  const ids = Array.from(document.querySelectorAll('.coshhPick:checked')).map(c=>c.value);
  if(!ids.length){ toast('Tick at least one product'); return; }
  const where = (document.getElementById('coshhWhere')||{}).value || '';
  const note = (document.getElementById('coshhNote')||{}).value || '';
  const lib = await coshhLoadLibrary();
  const picks = lib.filter(i=>ids.includes(i.id));
  const site = SITES.find(s=>s.id===siteId);
  toast('Building '+picks.length+' COSHH assessment'+(picks.length===1?'':'s')+'…');
  let made = 0;
  for(const it of picks){
    try{
      const bytes = await buildCoshhPdf(it, site, {where, note});
      if(!bytes) continue;
      const name = 'COSHH — '+it.title;
      const path = siteId+'/coshh/'+uid()+'-COSHH-'+it.title.replace(/[^a-z0-9.\-]+/gi,'_').slice(0,60)+'.pdf';
      const stored = await uploadToStorage('coshh-docs', path, new Blob([bytes], {type:'application/pdf'}), 'application/pdf');
      if(!stored) continue;
      const rows = await dbInsert('coshh_docs', {site_id:siteId, name, storage_path:stored, uploaded_by:ME.id});
      if(rows){ made++; notifyDocNeedsSigning(siteId, 'COSHH', name); }
    }catch(e){ console.error('[coshhIssue]', e); }
  }
  if(made){ logSiteActivity(siteId, 'coshh_issued', `Issued ${made} COSHH assessment${made===1?'':'s'}`); toast(made+' COSHH assessment'+(made===1?'':'s')+' issued'); go('#/site/'+siteId+'/hs/coshh'); }
  else customAlert('Could not issue — check signal and try again.');
};

// ---------- The COSHH assessment PDF ----------
async function buildCoshhPdf(it, site, job){
  if(!(await loadLib('PDFLib'))){ toast('PDF library failed to load — check connection.'); return null; }
  const d = it.data, st = ramsSettings(), rgb = PDFLib.rgb;
  const pdf = await PDFLib.PDFDocument.create();
  const bold = await pdf.embedFont(PDFLib.StandardFonts.HelveticaBold);
  const reg = await pdf.embedFont(PDFLib.StandardFonts.Helvetica);
  const INK = rgb(0.08,0.08,0.09), SLATE = rgb(0.35,0.36,0.4), LINE = rgb(0.55,0.55,0.58), LIGHT = rgb(0.93,0.93,0.94), WHITE = rgb(1,1,1);
  const BRAND = pdfHexToRgb((ORG && ORG.color_primary) || '#8B1A1A');
  const W = 595.28, H = 841.89, M = 36, CW = W-2*M;
  const pages = []; let page, y;
  const newPage = ()=>{ page = pdf.addPage([W,H]); pages.push(page); y = H - M; };
  const ensure = h => { if(y - h < 46) newPage(); };
  const txt = (t, x, yy, size, font, color) => page.drawText(ramsPdfSafe(t), {x, y:yy, size, font:font||reg, color:color||INK});
  const rect = (x, yy, w, h, fill, border) => page.drawRectangle({x, y:yy, width:w, height:h, color:fill||undefined, borderColor:border===false?undefined:(border||LINE), borderWidth:border===false?0:0.6});
  const wrap = (t, font, size, maxW) => { const out = []; ramsPdfSafe(t).split('\n').forEach(par=>{ const words = par.split(/\s+/).filter(Boolean); let line=''; if(!words.length){ out.push(''); return; } words.forEach(w=>{ const test = line ? line+' '+w : w; if(font.widthOfTextAtSize(test,size) > maxW && line){ out.push(line); line = w; } else line = test; }); if(line) out.push(line); }); return out; };
  const bar = label => { ensure(26); rect(M, y-18, CW, 18, BRAND, false); txt(label, M+6, y-13, 10.5, bold, WHITE); y -= 24; };
  const kv = rows => { const lw = 150; rows.filter(r=>r[1]).forEach(([k,v])=>{ const lines = wrap(v, reg, 9, CW-lw-10); const h = Math.max(16, lines.length*11+6); ensure(h); rect(M, y-h, lw, h, LIGHT); rect(M+lw, y-h, CW-lw, h); txt(k, M+5, y-11.5, 9, bold); lines.forEach((l,i)=>txt(l, M+lw+5, y-11.5-i*11, 9, reg)); y -= h; }); y -= 10; };
  const para = (t, size) => { size = size||9; wrap(t, reg, size, CW).forEach(l=>{ ensure(size+4); txt(l, M, y-size, size, reg); y -= size+3.5; }); y -= 6; };
  const embedData = async u => { try{ return await pdf.embedJpg(Uint8Array.from(atob(u.split(',')[1]), c=>c.charCodeAt(0))); }catch(e){ return null; } };
  // header
  newPage();
  let logo = null;
  if(ORG && ORG.logo_path){ const b = await pdfFetchImageBytes(publicUrl('org-logos', ORG.logo_path)); if(b){ try{ logo = await pdf.embedPng(b); }catch(e){ try{ logo = await pdf.embedJpg(b); }catch(e2){} } } }
  let hy = y - 12; txt(((ORG&&ORG.name)||'').toUpperCase(), M, hy, 12, bold); hy -= 14;
  String(st.address||'').split('\n').map(s=>s.trim()).filter(Boolean).forEach(l=>{ txt(l, M, hy, 9, reg, SLATE); hy -= 11; });
  if(st.phone){ txt('Tel: '+st.phone, M, hy, 9, reg, SLATE); hy -= 11; }
  if(logo){ const dim = logo.scale(1); const s = Math.min(150/dim.width, 64/dim.height); page.drawImage(logo, {x:W-M-dim.width*s, y:y-dim.height*s, width:dim.width*s, height:dim.height*s}); }
  y = Math.min(hy, y-70) - 10;
  const title = 'COSHH Assessment'; txt(title, (W-bold.widthOfTextAtSize(title,17))/2, y-17, 17, bold); y -= 28;
  const pname = ramsPdfSafe(it.title); txt(pname, (W-bold.widthOfTextAtSize(pname,13))/2, y-13, 13, bold, BRAND); y -= 26;
  const today = new Date(), review = new Date(); review.setFullYear(review.getFullYear()+1);
  const fmt = t => t.toLocaleDateString('en-GB', {day:'2-digit', month:'2-digit', year:'numeric'});
  bar('1.0 Product & Job');
  kv([['Product', it.title], ['Manufacturer / supplier', d.manufacturer], ['Used for', d.use], ['Job / site', site ? (site.name+(typeof fullSiteAddress==='function' && fullSiteAddress(site) ? ' — '+fullSiteAddress(site) : '')) : ''], ['Where used on this job', job.where], ['Notes', job.note], ['Assessed by', ME.name||''], ['Date', fmt(today)], ['Review date', fmt(review)], ['Risk level', d.risk]]);
  bar('2.0 Hazards');
  if(d.pictos.length){
    const IS = 52, per = 6, cw = CW/per;
    for(let i=0;i<d.pictos.length;i+=per){ ensure(IS+24);
      for(const [j,k] of d.pictos.slice(i,i+per).entries()){ const img = await embedData(COSHH_PICTO_IMG[k]); const cx = M + j*cw + cw/2; if(img) page.drawImage(img, {x:cx-IS/2, y:y-IS, width:IS, height:IS}); const lb = (COSHH_PICTOS.find(p=>p.key===k)||{}).label||k; const lw = reg.widthOfTextAtSize(lb, 7.5); txt(lb, cx-lw/2, y-IS-10, 7.5, reg); }
      y -= IS+22; }
  }
  if(d.signal){ ensure(22); txt('Signal word: ', M, y-12, 11, bold); txt(d.signal.toUpperCase(), M+bold.widthOfTextAtSize('Signal word: ',11), y-12, 11, bold, d.signal==='Danger' ? rgb(0.8,0.1,0.1) : rgb(0.75,0.45,0.05)); y -= 22; }
  const codeRows = list => list.map(c=>[c, coshhCodeText(c)||'—']);
  if(d.h.length){ ensure(20); txt('Hazard statements', M, y-11, 10, bold); y -= 16; kv(codeRows(d.h)); }
  if(d.wel) kv([['Workplace exposure limit', d.wel]]);
  if(d.routes.length) kv([['How it can harm you', COSHH_ROUTES.filter(([k])=>d.routes.includes(k)).map(([,l])=>l).join(', ')]]);
  bar('3.0 Controls');
  if(d.p.length){ ensure(20); txt('Precautionary statements', M, y-11, 10, bold); y -= 16; kv(codeRows(d.p)); }
  if(d.controls) para(d.controls);
  const ppe = RAMS_PPE.filter(p=>d.ppe.includes(p.key));
  if(ppe.length){
    ensure(20); txt('PPE to wear', M, y-11, 10, bold); y -= 18;
    const IS = 38, per = 5, cw = CW/per;
    for(let i=0;i<ppe.length;i+=per){ ensure(IS+22);
      for(const [j,p] of ppe.slice(i,i+per).entries()){ const u = typeof RAMS_PPE_IMG!=='undefined' && RAMS_PPE_IMG[p.key]; const img = u ? await embedData(u) : null; const cx = M + j*cw + cw/2; if(img) page.drawImage(img, {x:cx-IS/2, y:y-IS, width:IS, height:IS}); const lw = reg.widthOfTextAtSize(p.label, 8); txt(p.label, cx-lw/2, y-IS-11, 8, reg); }
      y -= IS+20; }
    y -= 4;
  }
  bar('4.0 Emergencies');
  kv([['First aid', d.firstAid], ['Spillage', d.spill], ['Fire', d.fire]]);
  bar('5.0 Storage & Disposal');
  kv([['Storage', d.storage], ['Disposal', d.disposal]]);
  // issued by
  ensure(60);
  txt('ISSUED BY: '+(ME.name||''), M, y-12, 10, bold); txt('Date: '+fmt(today), M+300, y-12, 10, reg);
  if(ME.signature_path){ try{ const b = await pdfFetchImageBytes(publicUrl('signatures', ME.signature_path)); if(b){ let img; try{ img = await pdf.embedPng(b); }catch(e){ img = await pdf.embedJpg(b); } const dim = img.scale(1); const s = Math.min(120/dim.width, 34/dim.height); page.drawImage(img, {x:M, y:y-52, width:dim.width*s, height:dim.height*s}); } }catch(e){} }
  y -= 60;
  if(d.sdsPath){ ensure(20); txt('The manufacturer\'s Safety Data Sheet is attached at the back of this assessment.', M, y-10, 8.5, reg, SLATE); y -= 16; }
  const total = pages.length;
  pages.forEach((pg,i)=>{ const f = ramsPdfSafe(`COSHH Assessment - ${it.title} || Page ${i+1} of ${total}`); pg.drawText(f, {x:(W-reg.widthOfTextAtSize(f,8))/2, y:20, size:8, font:reg, color:SLATE}); pg.drawText('Generated via OpHUB', {x:M, y:20, size:7, font:reg, color:SLATE}); });
  // the data sheet itself, at the back
  if(d.sdsPath){
    try{
      const res = await fetchWithTimeout(publicUrl('coshh-library', d.sdsPath), {}, 60000);
      if(res.ok){ const src = await PDFLib.PDFDocument.load(await res.arrayBuffer(), {ignoreEncryption:true}); const cp = await pdf.copyPages(src, src.getPageIndices()); cp.forEach(p=>pdf.addPage(p)); }
    }catch(e){ console.warn('[coshh sds attach]', e); }
  }
  pdf.setTitle('COSHH Assessment - '+it.title);
  return await pdf.save();
}
