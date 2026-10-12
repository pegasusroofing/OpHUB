/* ================= HANDOVER / O&M MANUAL =================
   #(handover) A Handover tile on each project once it's marked Closed (it
   takes the To Do List's place). Three parts:
   - Data sheets: technical data sheets / DoPs / specs for the products used.
   - Guarantees: certificates with provider, reference, expiry and maintenance.
   - O&M manual: built from the job (Schedule of Works, data sheets, COSHH,
     guarantees, drawings, photos, contacts) into sections that can all be
     edited, moved, deleted or added to, then exported as PDF (with the data
     sheets, guarantees, COSHH and drawings attached behind it) or as a Word
     file to carry on editing. */
let hoTab = 'manual';
let hoState = null; // {siteId, data, dirty}
let hoSaveTimer = null;
let hoBusy = '';

const HO_MAINT = {
  general: {label:'General', text:
`• Roof access is for competent persons only, using safe access (fixed ladders, edge protection or a harness system) — never stand on rooflights or other fragile surfaces.
• Inspect the roof after severe weather (storms, heavy snow, high winds) as well as on the routine visits below.
• Keep a record of every inspection and any work done, and keep this manual with the building's health and safety file.
• Do not fix through, cut into or add anything to the roof covering (aerials, plant, signs, solar) without first speaking to the roofing contractor or manufacturer — it can affect the guarantee.
• Do not store materials or equipment on the roof. Protect the roof surface when other trades work on it.`},
  felt: {label:'Flat roof – bituminous (felt / torch-on)', text:
`Every 3 months (and after autumn leaf fall):
• Clear outlets, gutters, leaf guards and sumps; remove leaves, silt, moss and any vegetation.
Every 6 months:
• Walk-over visual inspection of the membrane for splits, blisters, ponding, punctures or loss of mineral surfacing.
• Check laps, upstands, kerbs, penetrations and edge trims for lifting or damage.
Every year:
• Inspect flashings, termination bars, mastic and sealant joints; re-seal where needed.
• Check outlets are firmly fixed and the outlet seals are sound.
Repairs:
• Use compatible materials from the system manufacturer only. Hot works (torch-on) must only be carried out by trained operatives under a hot works permit.`},
  liquid: {label:'Flat roof – liquid applied (PU / PMMA)', text:
`Every 3 months (and after autumn leaf fall):
• Clear outlets, gutters and leaf guards; remove debris and vegetation.
Every 6 months:
• Visual inspection for damage, cracking, blistering or delamination, especially at details, upstands and penetrations.
• Check the top coat for wear or UV breakdown.
Every year:
• Inspect terminations and detail work; arrange recoating of worn areas with the manufacturer's compatible top coat.
Cleaning and repairs:
• Clean with low-pressure water and a mild detergent only — no solvents and no pressure washer close to the surface.
• Repairs must follow the manufacturer's repair procedure (surface preparation, primer and resin) and be carried out by a trained installer.`},
  singleply: {label:'Flat roof – single ply membrane', text:
`Every 3 months (and after autumn leaf fall):
• Clear outlets, gutters and leaf guards; remove debris and vegetation.
Every 6 months:
• Visual inspection of seams and laps, membrane surface, mechanical fixings and ballast (if any) for displacement.
Every year:
• Check perimeter details, clamping bars, upstands and sealants.
Care and repairs:
• Avoid sharp objects and heavy point loads; wear soft-soled footwear.
• Repairs must be hot-air welded with the manufacturer's matching membrane by a trained installer.`},
  pitched: {label:'Pitched roof – slates / tiles', text:
`Twice a year (spring and autumn):
• Clear gutters, hoppers and downpipes.
Every year:
• Inspect from safe access (or from the ground with binoculars) for slipped, cracked or missing slates/tiles, and check ridges, hips, verges and valleys.
• Check flashings, leadwork, fascias, soffits and that ventilation openings are not blocked.
Repairs:
• Replace slipped slates using tingles or slate hooks and matching slates/tiles. Do not walk directly on slates or tiles — use roof ladders or crawling boards.`},
  lead: {label:'Leadwork', text:
`Every year:
• Inspect lead flashings, soakers, clips, wedges and joints for cracking, splitting, lifting or fatigue.
• Check the lead is still dressed tight to the surface and fixings are secure.
Notes:
• New lead was treated with patination oil; no further treatment is normally needed.
• Rainwater run-off from moss/lichen-covered roofs can corrode lead — keep surfaces above clear.
• Report any sign of lead theft straight away.`},
  rooflight: {label:'Rooflights', text:
`Every year:
• Clean the glazing with a mild detergent and soft cloth (no abrasive cleaners or solvents).
• Check seals, gaskets and fixings; check any opening vents and actuators operate correctly.
• Rooflights are fragile — never stand, sit or lean on them.`},
  rainwater: {label:'Gutters, downpipes, fascias and soffits', text:
`Twice a year:
• Clear gutters and downpipes and check joints for leaks.
Every year:
• Wipe uPVC fascias, soffits and gutters with warm water and a mild detergent.
• Check brackets and fixings are secure.`},
};
function hoDetectSystems(text){
  const t = String(text||'').toLowerCase();
  const out = ['general'];
  if(/felt|torch|bitumen|bituminous|cap ?sheet|underlay|elastoflex|icopal|langley|bauder (k|super|tec)|sbs/.test(t)) out.push('felt');
  if(/liquid|pmma|resin|liqui|decothane|sikalastic|alsan|triflex|proteus|p1 |polyroof|rapid ?roof|wethan|catalyst/.test(t)) out.push('liquid');
  if(/single ?ply|pvc|tpo|epdm|flagon|bauderpvc|sarnafil|elastocol|flexocol/.test(t)) out.push('singleply');
  if(/slate|tile|pitched|ridge|batten/.test(t)) out.push('pitched');
  if(/lead/.test(t)) out.push('lead');
  if(/rooflight|roof light|ridgelight|skylight|dome/.test(t)) out.push('rooflight');
  if(/gutter|downpipe|fascia|soffit|upvc/.test(t)) out.push('rainwater');
  return out;
}
function hoUid(){ return 's'+Math.random().toString(36).slice(2,9); }
function hoFmtDate(d){ return d ? new Date(d.length===10 ? d+'T00:00:00' : d).toLocaleDateString('en-GB',{day:'2-digit',month:'2-digit',year:'numeric'}) : ''; }

async function hoLoadDocs(siteId){ return await dbSelect('handover_docs', 'site_id=eq.'+siteId+'&order=position.asc,created_at.asc'); }
async function hoJobPhotos(siteId){
  const tasks = await dbSelect('schedule_tasks', 'site_id=eq.'+siteId+'&select=id,name');
  if(!tasks.length) return [];
  const photos = await dbSelect('schedule_photos', 'task_id=in.('+tasks.map(t=>t.id).join(',')+')&order=uploaded_at.desc&limit=200');
  const nm = {}; tasks.forEach(t=>{ nm[t.id] = t.name; });
  return photos.map(p=>({bucket:'site-photos', path:p.mid_path || p.storage_path, thumb:p.thumb_path || p.mid_path || p.storage_path, caption:nm[p.task_id]||'', stage:p.stage||''}));
}

// Build the manual from what's on the job.
async function hoBuildDefault(siteId){
  const site = SITES.find(s=>s.id===siteId) || {};
  const st = ramsSettings();
  const pm = site.responsible_pm_id && PROFILES[site.responsible_pm_id] ? PROFILES[site.responsible_pm_id] : ME;
  const [sections, tasks, docs, coshh, drawings, photos] = await Promise.all([
    dbSelect('schedule_sections', 'site_id=eq.'+siteId+'&order=position.asc'),
    dbSelect('schedule_tasks', 'site_id=eq.'+siteId+'&order=position.asc&select=id,name,status,section_id'),
    hoLoadDocs(siteId),
    dbSelect('coshh_docs', 'site_id=eq.'+siteId+'&order=uploaded_at.asc&select=id,name'),
    dbSelect('drawing_files', 'site_id=eq.'+siteId+'&order=uploaded_at.asc&select=id,name,uploaded_at,status'),
    hoJobPhotos(siteId),
  ]);
  const company = (ORG && ORG.name) || 'Our company';
  const done = tasks.filter(t=>t.status==='done' || t.status==='completed' || t.status==='complete');
  const useTasks = done.length ? done : tasks;
  const bySec = {}; useTasks.forEach(t=>{ (bySec[t.section_id||'']=bySec[t.section_id||'']||[]).push(t); });
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  let scope = '';
  sections.forEach(sec=>{ const ts = bySec[sec.id]; if(!ts || !ts.length) return; scope += `The following works were carried out to ${sec.name}:\n` + ts.map((t,i)=>`${letters[i%26]}.  ${t.name}`).join('\n') + '\n\n'; });
  if(bySec['']) scope += (scope ? 'Other works:\n' : '') + bySec[''].map((t,i)=>`${letters[i%26]}.  ${t.name}`).join('\n');
  const sheets = docs.filter(d=>d.kind==='datasheet'), guars = docs.filter(d=>d.kind==='guarantee');
  const matRows = []; let n = 1;
  sheets.forEach(d=>{ matRows.push([String(n++), '', d.name.replace(/\.pdf$/i,''), d.provider||'']); });
  coshh.forEach(c=>{ const nm = c.name.replace(/^COSHH\s*[—-]\s*/i,'').replace(/^COSHH Assessment\s*-\s*/i,'').replace(/\.pdf$/i,''); if(!matRows.some(r=>r[2].toLowerCase()===nm.toLowerCase())) matRows.push([String(n++), 'COSHH', nm, '']); });
  const sysText = [scope, sheets.map(d=>d.name+' '+(d.provider||'')).join(' '), coshh.map(c=>c.name).join(' ')].join(' ');
  const systems = hoDetectSystems(sysText);
  const maint = systems.map(k=>`${HO_MAINT[k].label}\n${HO_MAINT[k].text}`).join('\n\n');
  const addr = fullSiteAddress(site) || '';
  return {
    cover: {title:'O&M MANUAL', project:site.name||'', address:addr, subtitle:'Operation and Maintenance Manual and As Built Information — Construction (Design and Management) Regulations 2015', revision:'1', date:localISODate(new Date()), coverPhoto: photos[0] ? {bucket:photos[0].bucket, path:photos[0].path} : null},
    attach: {datasheets:true, guarantees:true, coshh:true, drawings:false},
    sections: [
      {id:hoUid(), type:'table', title:'Contractor Details', columns:['',''], rows:[
        ['Name', company], ['Address', String(st.address||'').replace(/\n/g, ', ')], ['Telephone', st.phone||''], ['Email', (pm && pm.email) || ME.email || ''],
        ['Client', site.client_name||''], ['Job number', site.job_number||''], ['Revision', '1'], ['Date', hoFmtDate(localISODate(new Date()))],
      ]},
      {id:hoUid(), type:'text', title:'1. Introduction', body:
`This document confirms the formal handover of the completed roofing works at ${site.name||'the site'}${addr?', '+addr:''} — on behalf of ${company}${site.client_name?' to '+site.client_name:''}.

This document records the scope of works carried out, materials and systems installed, guarantee and maintenance provisions, health and safety information, and the parties' formal sign-off.`},
      {id:hoUid(), type:'text', title:'2. Scope of Works Completed', body: scope.trim() || 'Describe the works carried out.'},
      {id:hoUid(), type:'table', title:'3. Materials Log – Data & COSHH', columns:['Log No.','Element','Product','Manufacturer'], rows: matRows.length ? matRows : [['1','','','']]},
      {id:hoUid(), type:'table', title:'4. Guarantees & Warranties', columns:['Manufacturer / Item','Ref','Expiry','Maintenance'], rows: guars.length ? guars.map(g=>[g.provider ? g.provider+' – '+g.name.replace(/\.pdf$/i,'') : g.name.replace(/\.pdf$/i,''), g.ref||'', g.expiry_date ? hoFmtDate(g.expiry_date) : '', g.maintenance||'']) : [['','','','']]},
      {id:hoUid(), type:'text', title:'5. Maintenance Procedures', body: maint},
      {id:hoUid(), type:'table', title:'6. Specifications & Drawings', columns:['File Name','Ref','Date','Provider'], rows: drawings.filter(d=>d.status!=='superseded').map(d=>[d.name.replace(/\.[a-z0-9]+$/i,''), '', hoFmtDate((d.uploaded_at||'').slice(0,10)), '']).concat([['O&M Documentation', 'O&M '+(site.name||''), hoFmtDate(localISODate(new Date())), company]])},
      {id:hoUid(), type:'text', title:'7. Health & Safety Information', body:
`Residual risks for anyone working on or maintaining the roof:
• Working at height — use safe access and edge protection or a harness system; roof access by competent persons only.
• Fragile surfaces — rooflights and any fragile sheeting must not be walked on.
• Hot works — any torch-on repairs need a hot works permit and fire watch.
• Hazardous substances — products used for maintenance must be used in line with their COSHH assessments (see the Materials Log and attached COSHH).
• Overhead services and plant — isolate before working nearby.

RAMS and COSHH assessments for this project are held on the project in the OpHUB app.`},
      {id:hoUid(), type:'photos', title:'8. Photographs', photos: photos.slice(0, 8).map(p=>({bucket:p.bucket, path:p.path, caption:p.caption}))},
      {id:hoUid(), type:'table', title:'9. Handover & Sign-off', columns:['','Contractor','Client / Main Contractor'], rows:[['Name', (pm&&pm.name)||'', ''], ['Position', '', ''], ['Signature', '', ''], ['Date', '', '']]},
      {id:hoUid(), type:'table', title:'Contacts', columns:['',company], rows:[['Contact name', (pm&&pm.name)||''], ['Position',''], ['Telephone', (pm&&pm.phone)||st.phone||''], ['Email', (pm&&pm.email)||'']]},
    ],
  };
}
async function hoLoadManual(siteId){
  if(hoState && hoState.siteId===siteId) return hoState;
  const rows = await dbSelect('handover_manuals', 'site_id=eq.'+siteId);
  let data = rows[0] && rows[0].data && rows[0].data.sections ? rows[0].data : null;
  const isNew = !data;
  if(!data) data = await hoBuildDefault(siteId);
  hoState = {siteId, data, dirty:isNew};
  if(isNew) hoSaveNow();
  return hoState;
}
function hoTouch(){ if(!hoState) return; hoState.dirty = true; clearTimeout(hoSaveTimer); hoSaveTimer = setTimeout(hoSaveNow, 900); }
async function hoSaveNow(){
  if(!hoState || !hoState.dirty) return true;
  const st = hoState; st.dirty = false;
  const site = SITES.find(s=>s.id===st.siteId);
  const res = await sbFetch('/rest/v1/handover_manuals?on_conflict=site_id', {method:'POST', headers:{'Prefer':'resolution=merge-duplicates,return=minimal'}, body: JSON.stringify({site_id:st.siteId, org_id:(site&&site.org_id)||ME.org_id, data:st.data, updated_at:new Date().toISOString(), updated_by:ME.id})});
  if(!res || !res.ok){ st.dirty = true; toast('Could not save the manual — check signal'); return false; }
  return true;
}
window.addEventListener('beforeunload', ()=>{ if(hoState && hoState.dirty) hoSaveNow(); });

// ---------- editing ----------
const hoSec = id => hoState.data.sections.find(s=>s.id===id);
window.hoSet = function(id, key, val){ const s = hoSec(id); if(s){ s[key] = val; hoTouch(); } };
window.hoCover = function(key, val){ hoState.data.cover[key] = val; hoTouch(); };
window.hoAttach = function(key, on){ hoState.data.attach[key] = !!on; hoTouch(); };
window.hoCell = function(id, r, c, val){ const s = hoSec(id); if(s && s.rows[r]){ s.rows[r][c] = val; hoTouch(); } };
window.hoHead = function(id, c, val){ const s = hoSec(id); if(s){ s.columns[c] = val; hoTouch(); } };
window.hoAddRow = function(id){ const s = hoSec(id); s.rows.push(s.columns.map(()=>'')); hoTouch(); render(); };
window.hoDelRow = function(id, r){ const s = hoSec(id); s.rows.splice(r,1); hoTouch(); render(); };
window.hoAddCol = function(id){ const s = hoSec(id); s.columns.push('New column'); s.rows.forEach(r=>r.push('')); hoTouch(); render(); };
window.hoDelCol = function(id, c){ const s = hoSec(id); if(s.columns.length<=1) return; s.columns.splice(c,1); s.rows.forEach(r=>r.splice(c,1)); hoTouch(); render(); };
window.hoMove = function(id, dir){ const a = hoState.data.sections, i = a.findIndex(s=>s.id===id), j = i+dir; if(i<0 || j<0 || j>=a.length) return; [a[i],a[j]] = [a[j],a[i]]; hoTouch(); render(); };
window.hoDelSection = async function(id){ const s = hoSec(id); if(!(await customConfirm(`Delete the section "${s.title||'Untitled'}"?`))) return; hoState.data.sections = hoState.data.sections.filter(x=>x.id!==id); hoTouch(); render(); };
window.hoAddSection = function(type){
  const s = {id:hoUid(), type, title:type==='table' ? 'New table' : type==='photos' ? 'Photographs' : 'New section'};
  if(type==='text') s.body = '';
  if(type==='table'){ s.columns = ['Item','Details']; s.rows = [['','']]; }
  if(type==='photos') s.photos = [];
  hoState.data.sections.push(s); hoTouch(); render();
  setTimeout(()=>{ const el = document.getElementById('hosec-'+s.id); if(el) el.scrollIntoView({behavior:'smooth', block:'center'}); }, 80);
};
window.hoAddMaint = function(key){
  const k = key; if(!HO_MAINT[k]) return;
  let s = hoState.data.sections.find(x=>/maintenance/i.test(x.title||'') && x.type==='text');
  if(!s){ s = {id:hoUid(), type:'text', title:'Maintenance Procedures', body:''}; hoState.data.sections.push(s); }
  s.body = (s.body ? s.body.trim()+'\n\n' : '') + HO_MAINT[k].label+'\n'+HO_MAINT[k].text;
  hoTouch(); render(); toast(HO_MAINT[k].label+' wording added');
};
window.hoRebuild = async function(){
  if(!(await customConfirm('Rebuild the manual from the job? This replaces every section with fresh ones from the Schedule of Works, data sheets, guarantees, COSHH, drawings and photos — your edits will be lost.'))) return;
  hoBusy = 'Rebuilding…'; render();
  hoState.data = await hoBuildDefault(hoState.siteId); hoState.dirty = true; await hoSaveNow();
  hoBusy = ''; toast('Rebuilt from the job'); render();
};
window.hoRemovePhoto = function(id, i){ const s = hoSec(id); s.photos.splice(i,1); hoTouch(); render(); };
window.hoPhotoCaption = function(id, i, v){ const s = hoSec(id); if(s.photos[i]){ s.photos[i].caption = v; hoTouch(); } };
window.hoPickPhotos = async function(id, forCover){
  const photos = await hoJobPhotos(hoState.siteId);
  if(!photos.length){ toast('No Schedule of Works photos on this job yet'); return; }
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.5);display:flex;align-items:flex-end;justify-content:center;';
  ov.innerHTML = `<div style="background:#fff;border-radius:18px 18px 0 0;width:100%;max-width:640px;max-height:80vh;overflow:auto;padding:16px 16px calc(16px + env(safe-area-inset-bottom));">
    <p class="sectiontitle" style="margin-top:0;">${forCover ? 'Pick the cover photo' : 'Tick photos to add'}</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px;">${photos.map((p,i)=>`<button type="button" data-i="${i}" style="all:unset;cursor:pointer;position:relative;display:block;border-radius:10px;overflow:hidden;border:3px solid transparent;"><img src="${publicUrl(p.bucket, p.thumb)}" style="width:100%;aspect-ratio:1;object-fit:cover;display:block;"><span style="position:absolute;left:0;right:0;bottom:0;background:rgba(0,0,0,.55);color:#fff;font-size:10px;padding:2px 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(p.caption)}</span></button>`).join('')}</div>
    ${forCover ? '' : `<button type="button" class="darkbtn" data-done="1" style="margin-top:12px;">Add ticked photos</button>`}
    <button type="button" class="ghostbtn" data-cancel="1" style="margin-top:8px;">Cancel</button></div>`;
  const picked = new Set();
  ov.addEventListener('click', ev=>{
    const b = ev.target.closest('button');
    if(ev.target===ov || (b && b.dataset.cancel)){ ov.remove(); return; }
    if(b && b.dataset.i !== undefined){
      const i = Number(b.dataset.i);
      if(forCover){ const p = photos[i]; hoState.data.cover.coverPhoto = {bucket:p.bucket, path:p.path}; hoTouch(); ov.remove(); render(); return; }
      if(picked.has(i)){ picked.delete(i); b.style.borderColor = 'transparent'; } else { picked.add(i); b.style.borderColor = 'var(--brand1)'; }
      return;
    }
    if(b && b.dataset.done){ const s = hoSec(id); [...picked].forEach(i=>{ const p = photos[i]; s.photos.push({bucket:p.bucket, path:p.path, caption:p.caption}); }); hoTouch(); ov.remove(); render(); }
  });
  document.body.appendChild(ov);
};

// ---------- data sheets / guarantees ----------
window.hoUploadDocs = async function(input, kind){
  const files = Array.from(input.files||[]); input.value = '';
  if(!files.length) return;
  const siteId = hoState ? hoState.siteId : (/^#\/site\/([^\/]+)/.exec(location.hash)||[])[1];
  const site = SITES.find(s=>s.id===siteId);
  let made = 0;
  for(let i=0;i<files.length;i++){
    hoBusy = `Uploading ${i+1} of ${files.length}…`; render();
    const f = files[i];
    const path = (site&&site.org_id||ME.org_id)+'/handover/'+siteId+'/'+uid()+'-'+f.name.replace(/[^a-z0-9.\-]+/gi,'_');
    const stored = await uploadToStorage('mc-documents', path, f, f.type || 'application/pdf');
    if(!stored) continue;
    const guessProvider = (f.name.match(/^(bauder|langley|icopal|sika|soprema|triflex|kemper|westwood|proteus|garland|kingspan|rockwool|knauf|marley|redland|sandtoft|ibstock|ubbink|klober|alm|sig|cembrit|tapco|glidevale)/i)||[])[1] || '';
    const row = await dbInsert('handover_docs', {org_id:(site&&site.org_id)||ME.org_id, site_id:siteId, kind, name:f.name, storage_path:stored, provider: guessProvider ? guessProvider.charAt(0).toUpperCase()+guessProvider.slice(1).toLowerCase() : null, uploaded_by:ME.id});
    if(row) made++;
  }
  hoBusy = ''; toast(made+' added'); render();
};
window.hoDocField = async function(id, key, val){ await dbUpdate('handover_docs', id, {[key]: (val===''?null:val)}); };
window.hoDeleteDoc = async function(id, path){
  if(!(await customConfirm('Delete this document from the handover?'))) return;
  if(await dbDelete('handover_docs', id)){ if(path) sbFetch('/storage/v1/object/mc-documents/'+path, {method:'DELETE'}).catch(()=>{}); toast('Deleted'); render(); }
};
window.hoAddGuarantee = async function(){
  const siteId = hoState.siteId; const site = SITES.find(s=>s.id===siteId);
  const r = await dbInsert('handover_docs', {org_id:(site&&site.org_id)||ME.org_id, site_id:siteId, kind:'guarantee', name:'Roofing system guarantee', uploaded_by:ME.id});
  if(r) render();
};
window.hoAttachToDoc = async function(input, id){
  const f = input.files && input.files[0]; input.value = ''; if(!f) return;
  const siteId = hoState.siteId; const site = SITES.find(s=>s.id===siteId);
  hoBusy = 'Uploading…'; render();
  const path = ((site&&site.org_id)||ME.org_id)+'/handover/'+siteId+'/'+uid()+'-'+f.name.replace(/[^a-z0-9.\-]+/gi,'_');
  const stored = await uploadToStorage('mc-documents', path, f, f.type||'application/pdf');
  if(stored) await dbUpdate('handover_docs', id, {storage_path:stored});
  hoBusy = ''; render();
};

// Data sheets / guarantees added after the manual was first built get a row
// in the Materials Log / Guarantees table automatically (once each — a row
// the user deletes stays deleted). A blank placeholder row is filled first.
function hoSyncDocs(docs){
  const d = hoState.data; d.synced = d.synced || {};
  if(!d.syncInit){ docs.forEach(x=>{ d.synced[x.id] = 1; }); d.syncInit = 1; hoTouch(); return; }
  let changed = false;
  docs.forEach(x=>{
    if(d.synced[x.id]) return;
    const isSheet = x.kind==='datasheet';
    const t = d.sections.find(s=>s.type==='table' && (isSheet ? /material/i.test(s.title||'') : /guarantee|warrant/i.test(s.title||'')));
    d.synced[x.id] = 1; changed = true;
    if(!t) return;
    const nm = String(x.name||'').replace(/\.pdf$/i,'');
    const row = t.columns.map(()=>'');
    if(isSheet){ row[0] = String(t.rows.filter(r=>r.some((v,i)=>i>0 && v)).length+1); if(row.length>2) row[2] = nm; if(row.length>3) row[3] = x.provider||''; }
    else { row[0] = x.provider ? x.provider+' – '+nm : nm; if(row.length>1) row[1] = x.ref||''; if(row.length>2) row[2] = x.expiry_date ? hoFmtDate(x.expiry_date) : ''; if(row.length>3) row[3] = x.maintenance||''; }
    const blank = t.rows.findIndex(r=>r.every((v,i)=>!v || (isSheet && i===0)));
    if(blank>=0) t.rows[blank] = row; else t.rows.push(row);
  });
  if(changed) hoTouch();
}

// ---------- page ----------
async function renderHandover(siteId){
  const __gen = RENDER_GEN;
  if(!isManager(ME)){ go('#/site/'+siteId+'/home'); return; }
  const site = SITES.find(s=>s.id===siteId);
  if(!site){ go('#/sites'); return; }
  if(hoState && hoState.siteId!==siteId){ if(hoState.dirty) await hoSaveNow(); hoState = null; }
  await hoLoadManual(siteId);
  const docs = await hoLoadDocs(siteId);
  if(__gen !== RENDER_GEN) return;
  hoSyncDocs(docs);
  const sheets = docs.filter(d=>d.kind==='datasheet'), guars = docs.filter(d=>d.kind==='guarantee');
  const d = hoState.data, c = d.cover;
  const tab = (k, l, n) => `<button type="button" class="pmchip ${hoTab===k?'on':''}" onclick="hoTab='${k}';render()">${l}${n!=null?' ('+n+')':''}</button>`;
  const docView = x => x.storage_path ? `<button type="button" class="ghostbtn" style="width:auto;margin:0;padding:6px 10px;font-size:11.5px;" onclick="viewDrawing('${publicUrl('mc-documents', x.storage_path)}', ${/\.(jpe?g|png)$/i.test(x.storage_path)}, '${jsAttr(x.name)}')">View</button>` : '';
  let body = '';
  if(hoTab==='sheets'){
    body = `<div class="card">
      <p class="stub" style="margin:0 0 10px;">Technical data sheets, declarations of performance and specs for the products used. They're listed in the manual's Materials Log and attached to the back of the PDF.</p>
      <label class="darkbtn" style="display:block;text-align:center;cursor:pointer;">📄 Upload data sheets (several at once)<input type="file" accept="application/pdf,image/*" multiple style="display:none;" onchange="hoUploadDocs(this,'datasheet')"></label>
    </div>
    ${sheets.map(x=>`<div class="card" style="padding:12px 14px;">
      <input type="text" value="${escapeHtml(x.name)}" style="font-weight:700;margin:0 0 6px;" onchange="hoDocField('${x.id}','name',this.value)">
      <div class="row-gap" style="align-items:center;"><input type="text" placeholder="Manufacturer" value="${escapeHtml(x.provider||'')}" style="flex:1;margin:0;" onchange="hoDocField('${x.id}','provider',this.value)">${docView(x)}<button type="button" class="taskicon danger" onclick="hoDeleteDoc('${x.id}','${jsAttr(x.storage_path||'')}')">🗑</button></div>
    </div>`).join('') || `<div class="empty">No data sheets yet.</div>`}`;
  } else if(hoTab==='guar'){
    body = `<div class="card">
      <p class="stub" style="margin:0 0 10px;">Manufacturer guarantees and your own workmanship warranty. They fill the manual's Guarantees table and the certificates are attached to the PDF.</p>
      <div class="row-gap"><label class="darkbtn" style="flex:1;display:block;text-align:center;cursor:pointer;">📄 Upload certificates<input type="file" accept="application/pdf,image/*" multiple style="display:none;" onchange="hoUploadDocs(this,'guarantee')"></label><button type="button" class="ghostbtn" style="flex:1;margin:0;" onclick="hoAddGuarantee()">+ Add without a file</button></div>
    </div>
    ${guars.map(x=>`<div class="card" style="padding:12px 14px;">
      <input type="text" value="${escapeHtml(x.name)}" style="font-weight:700;margin:0 0 6px;" onchange="hoDocField('${x.id}','name',this.value)">
      <div class="row-gap" style="margin-bottom:6px;"><input type="text" placeholder="Manufacturer / provider" value="${escapeHtml(x.provider||'')}" style="flex:1;margin:0;" onchange="hoDocField('${x.id}','provider',this.value)"><input type="text" placeholder="Guarantee ref" value="${escapeHtml(x.ref||'')}" style="flex:1;margin:0;" onchange="hoDocField('${x.id}','ref',this.value)"></div>
      <div class="formfield" style="margin:0 0 6px;"><label class="field-label">Expiry date</label><input type="date" value="${x.expiry_date||''}" onchange="hoDocField('${x.id}','expiry_date',this.value)"></div>
      <textarea rows="2" placeholder="Maintenance required to keep the guarantee (e.g. outlets cleared every 3 months, inspection every 6 months)" onchange="hoDocField('${x.id}','maintenance',this.value)">${escapeHtml(x.maintenance||'')}</textarea>
      <div class="row-gap" style="margin-top:6px;align-items:center;">${x.storage_path ? docView(x) : `<label class="ghostbtn" style="width:auto;margin:0;padding:6px 10px;font-size:11.5px;cursor:pointer;">Attach certificate<input type="file" accept="application/pdf,image/*" style="display:none;" onchange="hoAttachToDoc(this,'${x.id}')"></label>`}<span style="flex:1;"></span><button type="button" class="taskicon danger" onclick="hoDeleteDoc('${x.id}','${jsAttr(x.storage_path||'')}')">🗑</button></div>
    </div>`).join('') || `<div class="empty">No guarantees yet.</div>`}`;
  } else {
    const secHtml = s => {
      let inner = '';
      if(s.type==='text') inner = `<textarea rows="${Math.min(18, Math.max(4, String(s.body||'').split('\n').length+1))}" oninput="hoSet('${s.id}','body',this.value)">${escapeHtml(s.body||'')}</textarea>`;
      if(s.type==='table') inner = `<div class="hotable"><table><thead><tr>${s.columns.map((h,ci)=>`<th><input value="${escapeHtml(h)}" oninput="hoHead('${s.id}',${ci},this.value)">${s.columns.length>1?`<button type="button" class="hox" title="Delete column" onclick="hoDelCol('${s.id}',${ci})">✕</button>`:''}</th>`).join('')}<th></th></tr></thead>
        <tbody>${s.rows.map((r,ri)=>`<tr>${r.map((v,ci)=>`<td><textarea rows="2" oninput="hoCell('${s.id}',${ri},${ci},this.value)">${escapeHtml(v||'')}</textarea></td>`).join('')}<td><button type="button" class="hox" title="Delete row" onclick="hoDelRow('${s.id}',${ri})">🗑</button></td></tr>`).join('')}</tbody></table></div>
        <div class="row-gap" style="margin-top:6px;"><button type="button" class="ghostbtn" style="flex:1;margin:0;padding:6px;font-size:12px;" onclick="hoAddRow('${s.id}')">+ Row</button><button type="button" class="ghostbtn" style="flex:1;margin:0;padding:6px;font-size:12px;" onclick="hoAddCol('${s.id}')">+ Column</button></div>`;
      if(s.type==='photos') inner = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;">${s.photos.map((p,i)=>`<div><div style="position:relative;"><img src="${publicUrl(p.bucket, p.path)}" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:8px;display:block;"><button type="button" class="hox" style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,.6);color:#fff;" onclick="hoRemovePhoto('${s.id}',${i})">✕</button></div><input type="text" value="${escapeHtml(p.caption||'')}" placeholder="Caption" style="margin:4px 0 0;font-size:12px;" oninput="hoPhotoCaption('${s.id}',${i},this.value)"></div>`).join('')}</div>
        <button type="button" class="ghostbtn" style="margin-top:8px;" onclick="hoPickPhotos('${s.id}')">+ Add photos from the job</button>`;
      return `<div class="card hosec" id="hosec-${s.id}">
        <div class="row-gap" style="align-items:center;margin-bottom:8px;"><input type="text" value="${escapeHtml(s.title||'')}" style="flex:1;margin:0;font-weight:800;" oninput="hoSet('${s.id}','title',this.value)">
          <button type="button" class="hox" title="Move up" onclick="hoMove('${s.id}',-1)">↑</button><button type="button" class="hox" title="Move down" onclick="hoMove('${s.id}',1)">↓</button><button type="button" class="hox" title="Delete section" style="color:var(--warn);" onclick="hoDelSection('${s.id}')">🗑</button></div>
        ${inner}</div>`;
    };
    body = `
    <div class="card">
      <p class="sectiontitle" style="margin-top:0;">Cover</p>
      <div class="formfield" style="margin-top:0;"><label class="field-label">Title</label><input type="text" value="${escapeHtml(c.title||'')}" oninput="hoCover('title',this.value)"></div>
      <div class="formfield"><label class="field-label">Project</label><input type="text" value="${escapeHtml(c.project||'')}" oninput="hoCover('project',this.value)"></div>
      <div class="formfield"><label class="field-label">Address</label><input type="text" value="${escapeHtml(c.address||'')}" oninput="hoCover('address',this.value)"></div>
      <div class="formfield"><label class="field-label">Sub-title</label><textarea rows="2" oninput="hoCover('subtitle',this.value)">${escapeHtml(c.subtitle||'')}</textarea></div>
      <div class="row-gap"><div class="formfield" style="flex:1;"><label class="field-label">Revision</label><input type="text" value="${escapeHtml(c.revision||'')}" oninput="hoCover('revision',this.value)"></div><div class="formfield" style="flex:1;"><label class="field-label">Date</label><input type="date" value="${escapeHtml(c.date||'')}" onchange="hoCover('date',this.value)"></div></div>
      <div class="row-gap" style="align-items:center;">${c.coverPhoto ? `<img src="${publicUrl(c.coverPhoto.bucket, c.coverPhoto.path)}" style="width:96px;height:72px;object-fit:cover;border-radius:8px;">` : '<span class="stub" style="margin:0;">No cover photo</span>'}<button type="button" class="ghostbtn" style="flex:1;margin:0;" onclick="hoPickPhotos(null,true)">${c.coverPhoto?'Change':'Pick'} cover photo</button>${c.coverPhoto?`<button type="button" class="hox" onclick="hoCover('coverPhoto',null);render()">✕</button>`:''}</div>
    </div>
    ${d.sections.map(secHtml).join('')}
    <div class="card">
      <p class="sectiontitle" style="margin-top:0;">Add</p>
      <div class="row-gap" style="flex-wrap:wrap;"><button type="button" class="ghostbtn" style="flex:1;margin:0;" onclick="hoAddSection('text')">+ Text section</button><button type="button" class="ghostbtn" style="flex:1;margin:0;" onclick="hoAddSection('table')">+ Table</button><button type="button" class="ghostbtn" style="flex:1;margin:0;" onclick="hoAddSection('photos')">+ Photos</button></div>
      <p class="field-label" style="margin:12px 0 6px;">Standard maintenance wording</p>
      <div class="pmchips" style="margin:0;flex-wrap:wrap;">${Object.keys(HO_MAINT).map(k=>`<button type="button" class="pmchip" onclick="hoAddMaint('${k}')">+ ${escapeHtml(HO_MAINT[k].label)}</button>`).join('')}</div>
    </div>
    <div class="card">
      <p class="sectiontitle" style="margin-top:0;">Attach to the back of the PDF</p>
      ${[['datasheets','Data sheets ('+sheets.length+')'],['guarantees','Guarantee certificates ('+guars.filter(g=>g.storage_path).length+')'],['coshh','COSHH assessments on this job'],['drawings','Drawings & specifications']].map(([k,l])=>`<label class="stub" style="display:flex;align-items:center;gap:8px;margin:0 0 6px;"><input type="checkbox" style="width:auto;" ${d.attach[k]?'checked':''} onchange="hoAttach('${k}',this.checked)">${l}</label>`).join('')}
    </div>
    <button type="button" class="ghostbtn" style="color:var(--warn);border-color:var(--warn);" onclick="hoRebuild()">⟳ Rebuild from the job</button>`;
  }
  const html = `
    <div class="pmchips" style="margin:0 0 12px;">${tab('manual','O&M manual')}${tab('sheets','Data sheets', sheets.length)}${tab('guar','Guarantees', guars.length)}</div>
    ${hoBusy ? `<div class="card" style="text-align:center;"><span class="spinner"></span> ${escapeHtml(hoBusy)}</div>` : ''}
    ${body}
    <div class="hoexport">
      <button type="button" class="darkbtn" style="flex:1;margin:0;" onclick="hoExportPdf()">📄 Export PDF</button>
      <button type="button" class="ghostbtn" style="flex:1;margin:0;" onclick="hoExportWord()">📝 Export Word</button>
    </div>`;
  document.getElementById('app').innerHTML = shell(html, {title:'Handover', subtitle:site.name, siteNameSubtitle:true, back:'#/site/'+siteId+'/home', siteId});
}

// ---------- images ----------
async function hoImage(bucket, path, maxDim){
  try{
    const bytes = await pdfFetchImageBytes(publicUrl(bucket, path));
    if(!bytes) return null;
    const url = URL.createObjectURL(new Blob([bytes]));
    const img = await new Promise((res, rej)=>{ const im = new Image(); im.onload = ()=>res(im); im.onerror = rej; im.src = url; });
    const sc = Math.min(1, (maxDim||1400)/Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(img.naturalWidth*sc)); cv.height = Math.max(1, Math.round(img.naturalHeight*sc));
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url);
    const b64 = cv.toDataURL('image/jpeg', 0.82).split(',')[1];
    return {bytes: Uint8Array.from(atob(b64), ch=>ch.charCodeAt(0)), w:cv.width, h:cv.height};
  }catch(e){ return null; }
}
async function hoLogo(){
  if(!(ORG && ORG.logo_path)) return null;
  const im = await hoImage('org-logos', ORG.logo_path, 600);
  return im;
}

// ---------- PDF ----------
window.hoExportPdf = async function(){
  await hoSaveNow();
  if(!(await loadLib('PDFLib'))){ toast('PDF library failed to load — check connection.'); return; }
  hoBusy = 'Building the PDF…'; render();
  try{
    const bytes = await hoBuildPdf();
    const site = SITES.find(s=>s.id===hoState.siteId);
    hoBusy = ''; render();
    if(bytes) await deliverPdf(bytes, 'O&M Manual - '+((site&&site.name)||'Project').replace(/[\\/:*?"<>|]+/g,'-')+'.pdf', {siteId:hoState.siteId});
  }catch(e){ console.error('[hoPdf]', e); hoBusy = ''; render(); toast('Could not build the PDF — try again'); }
};
async function hoBuildPdf(){
  const d = hoState.data, c = d.cover, rgb = PDFLib.rgb;
  const pdf = await PDFLib.PDFDocument.create();
  const bold = await pdf.embedFont(PDFLib.StandardFonts.HelveticaBold), reg = await pdf.embedFont(PDFLib.StandardFonts.Helvetica);
  const BRAND = pdfHexToRgb((ORG && ORG.color_primary) || '#8B1A1A'), INK = rgb(0.08,0.08,0.09), SLATE = rgb(0.35,0.36,0.4), LINE = rgb(0.7,0.7,0.72), LIGHT = rgb(0.94,0.94,0.95), WHITE = rgb(1,1,1);
  const W = 595.28, H = 841.89, M = 42, CW = W-2*M;
  let page, y;
  const safe = t => ramsPdfSafe(String(t==null?'':t));
  const newPage = ()=>{ page = pdf.addPage([W,H]); y = H-M; };
  const ensure = h => { if(y-h < M+20) newPage(); };
  const wrap = (t, font, size, maxW) => { const out = []; safe(t).split('\n').forEach(par=>{ const words = par.split(/\s+/).filter(Boolean); if(!words.length){ out.push(''); return; } let line = ''; words.forEach(w=>{ const tryL = line ? line+' '+w : w; if(font.widthOfTextAtSize(tryL, size) > maxW && line){ out.push(line); line = w; } else line = tryL; }); out.push(line); }); return out; };
  const txt = (t, x, yy, size, font, color) => page.drawText(safe(t), {x, y:yy, size, font:font||reg, color:color||INK});
  // cover
  newPage();
  const logo = await hoLogo();
  if(logo){ const img = await pdf.embedJpg(logo.bytes); const h = 60, w = h*logo.w/logo.h; page.drawImage(img, {x:M, y:H-M-h, width:Math.min(w, 200), height:h}); }
  y = H - M - 90;
  page.drawRectangle({x:M, y:y-4, width:CW, height:3, color:BRAND});
  y -= 40; txt(c.title||'O&M MANUAL', M, y, 30, bold); y -= 34;
  wrap(c.project||'', bold, 18, CW).forEach(l=>{ txt(l, M, y, 18, bold); y -= 22; });
  wrap(c.address||'', reg, 12, CW).forEach(l=>{ txt(l, M, y, 12, reg, SLATE); y -= 16; });
  y -= 10;
  if(c.coverPhoto){ const im = await hoImage(c.coverPhoto.bucket, c.coverPhoto.path, 1600); if(im){ const img = await pdf.embedJpg(im.bytes); let w = CW, h = w*im.h/im.w; if(h > 330){ h = 330; w = h*im.w/im.h; } page.drawImage(img, {x:M+(CW-w)/2, y:y-h, width:w, height:h}); y -= h+16; } }
  wrap(c.subtitle||'', reg, 10.5, CW).forEach(l=>{ txt(l, M, y, 10.5, reg, SLATE); y -= 14; });
  txt('Revision '+(c.revision||'1')+'   ·   '+hoFmtDate(c.date), M, M, 10, reg, SLATE);
  // sections
  newPage();
  for(const s of d.sections){
    ensure(40);
    const tl = wrap(s.title||'', bold, 13, CW-12);
    page.drawRectangle({x:M, y:y-18-(tl.length-1)*15, width:CW, height:18+(tl.length-1)*15+4, color:BRAND});
    tl.forEach((l,i)=>txt(l, M+6, y-14-i*15, 13, bold, WHITE)); y -= 26+(tl.length-1)*15;
    if(s.type==='text'){
      wrap(s.body||'', reg, 10, CW).forEach(l=>{ ensure(14); txt(l, M, y-10, 10); y -= 13.5; }); y -= 10;
    } else if(s.type==='table'){
      const cols = s.columns.length; const colW = CW/cols; const hasHead = s.columns.some(h=>String(h||'').trim());
      const rowsAll = (hasHead ? [s.columns] : []).concat(s.rows);
      rowsAll.forEach((r, ri)=>{
        const isHead = hasHead && ri===0;
        const cells = r.map(v=>wrap(v||'', isHead?bold:reg, 9, colW-8));
        const h = Math.max(16, Math.max(...cells.map(cl=>cl.length))*11+6);
        ensure(h);
        r.forEach((v, ci)=>{
          page.drawRectangle({x:M+ci*colW, y:y-h, width:colW, height:h, color: isHead ? LIGHT : (ci===0 && !hasHead ? LIGHT : WHITE), borderColor:LINE, borderWidth:0.6});
          cells[ci].forEach((l, li)=>txt(l, M+ci*colW+4, y-11-li*11, 9, isHead || (ci===0 && !hasHead) ? bold : reg));
        });
        y -= h;
      });
      y -= 14;
    } else if(s.type==='photos'){
      const per = 2, gap = 10, pw = (CW-gap)/per, ph = pw*0.75;
      for(let i=0;i<s.photos.length;i+=per){
        ensure(ph+26);
        for(let j=0;j<per && i+j<s.photos.length;j++){
          const p = s.photos[i+j]; const im = await hoImage(p.bucket, p.path, 1200);
          const x = M + j*(pw+gap);
          if(im){ const img = await pdf.embedJpg(im.bytes); let w = pw, h = w*im.h/im.w; if(h > ph){ h = ph; w = h*im.w/im.h; } page.drawImage(img, {x:x+(pw-w)/2, y:y-ph+(ph-h)/2, width:w, height:h}); }
          wrap(p.caption||'', reg, 8.5, pw).slice(0,2).forEach((l,li)=>txt(l, x, y-ph-11-li*10, 8.5, reg, SLATE));
        }
        y -= ph+30;
      }
    }
  }
  // attachments
  const docs = await hoLoadDocs(hoState.siteId);
  const att = [];
  if(d.attach.datasheets) docs.filter(x=>x.kind==='datasheet' && x.storage_path).forEach(x=>att.push({bucket:'mc-documents', path:x.storage_path, name:x.name}));
  if(d.attach.guarantees) docs.filter(x=>x.kind==='guarantee' && x.storage_path).forEach(x=>att.push({bucket:'mc-documents', path:x.storage_path, name:x.name}));
  if(d.attach.coshh){ (await dbSelect('coshh_docs', 'site_id=eq.'+hoState.siteId+'&select=name,storage_path')).forEach(x=>att.push({bucket:'coshh-docs', path:x.storage_path, name:x.name})); }
  if(d.attach.drawings){ (await dbSelect('drawing_files', 'site_id=eq.'+hoState.siteId+'&select=name,storage_path,status')).filter(x=>x.status!=='superseded').forEach(x=>att.push({bucket:'drawings', path:x.storage_path, name:x.name})); }
  if(att.length){
    newPage(); txt('Appendices', M, y-20, 18, bold); y -= 44;
    att.forEach((a,i)=>{ ensure(14); txt((i+1)+'.  '+a.name, M, y, 10); y -= 14; });
    for(let i=0;i<att.length;i++){
      const a = att[i]; hoBusy = `Attaching ${i+1} of ${att.length}…`; render();
      try{
        if(/\.(jpe?g|png)$/i.test(a.path)){ const im = await hoImage(a.bucket, a.path, 1800); if(im){ newPage(); const img = await pdf.embedJpg(im.bytes); let w = CW, h = w*im.h/im.w; if(h > H-2*M){ h = H-2*M; w = h*im.w/im.h; } page.drawImage(img, {x:M, y:H-M-h, width:w, height:h}); } continue; }
        const res = await fetchWithTimeout(publicUrl(a.bucket, a.path), {}, 60000);
        const src = await PDFLib.PDFDocument.load(await res.arrayBuffer(), {ignoreEncryption:true});
        (await pdf.copyPages(src, src.getPageIndices())).forEach(pg=>pdf.addPage(pg));
      }catch(e){ console.warn('[ho attach]', a.name, e); }
    }
  }
  // page numbers
  const pages = pdf.getPages(); const nMain = pages.length;
  pages.forEach((pg, i)=>{ if(i===0) return; pg.drawText(safe(`${c.project||''} — O&M Manual   ·   Page ${i+1} of ${nMain}`), {x:M, y:20, size:7.5, font:reg, color:SLATE}); });
  return await pdf.save();
}

// ---------- Word (.docx) ----------
function hoX(t){ return String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function hoRun(t, o){ o = o||{}; const pr = (o.b?'<w:b/>':'')+(o.color?`<w:color w:val="${o.color}"/>`:'')+(o.sz?`<w:sz w:val="${o.sz}"/>`:''); const lines = String(t==null?'':t).split('\n'); return lines.map((l,i)=>`<w:r>${pr?`<w:rPr>${pr}</w:rPr>`:''}${i?'<w:br/>':''}<w:t xml:space="preserve">${hoX(l)}</w:t></w:r>`).join(''); }
function hoPara(t, o){ o = o||{}; return `<w:p>${o.style?`<w:pPr><w:pStyle w:val="${o.style}"/></w:pPr>`:''}${hoRun(t, o)}</w:p>`; }
window.hoExportWord = async function(){
  await hoSaveNow();
  if(!(await loadLib('JSZip'))){ toast('Word library failed to load — check connection.'); return; }
  hoBusy = 'Building the Word file…'; render();
  try{
    const d = hoState.data, c = d.cover;
    const brand = String((ORG && ORG.color_primary) || '#8B1A1A').replace('#','').toUpperCase();
    const media = []; // {name, bytes, w, h}
    const imgXml = (im, maxWcm) => {
      const idx = media.length+1; const name = 'image'+idx+'.jpg'; media.push({name, bytes:im.bytes});
      const maxEmu = Math.round((maxWcm||16)*360000); let cx = maxEmu, cy = Math.round(cx*im.h/im.w); if(cy > 9*360000*1.4){ cy = Math.round(9*360000*1.4); cx = Math.round(cy*im.w/im.h); }
      return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${idx}" name="Picture ${idx}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${idx}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImg${idx}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
    };
    let body = '';
    const logo = await hoLogo(); if(logo) body += `<w:p>${imgXml(logo, 5)}</w:p>`;
    body += hoPara(c.title||'O&M MANUAL', {style:'Title'}) + hoPara(c.project||'', {style:'Heading1'}) + hoPara(c.address||'');
    if(c.coverPhoto){ const im = await hoImage(c.coverPhoto.bucket, c.coverPhoto.path, 1600); if(im) body += `<w:p>${imgXml(im, 16)}</w:p>`; }
    body += hoPara(c.subtitle||'') + hoPara('Revision '+(c.revision||'1')+'  ·  '+hoFmtDate(c.date)) + '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
    for(const s of d.sections){
      body += hoPara(s.title||'', {style:'Heading1'});
      if(s.type==='text') String(s.body||'').split('\n').forEach(l=>{ body += hoPara(l); });
      if(s.type==='table'){
        const hasHead = s.columns.some(h=>String(h||'').trim());
        const n = s.columns.length; const gw = Math.floor(9638/n);
        const cell = (t, head) => `<w:tc><w:tcPr><w:tcW w:w="${gw}" w:type="dxa"/>${head?'<w:shd w:val="clear" w:color="auto" w:fill="EDEDEF"/>':''}</w:tcPr><w:p>${hoRun(t, {b:head})}</w:p></w:tc>`;
        body += `<w:tbl><w:tblPr><w:tblW w:w="9638" w:type="dxa"/><w:tblBorders>${['top','left','bottom','right','insideH','insideV'].map(b=>`<w:${b} w:val="single" w:sz="4" w:color="B5B5B9"/>`).join('')}</w:tblBorders></w:tblPr><w:tblGrid>${s.columns.map(()=>`<w:gridCol w:w="${gw}"/>`).join('')}</w:tblGrid>`
          + (hasHead ? `<w:tr>${s.columns.map(h=>cell(h, true)).join('')}</w:tr>` : '')
          + s.rows.map(r=>`<w:tr>${r.map((v,ci)=>cell(v, !hasHead && ci===0)).join('')}</w:tr>`).join('') + `</w:tbl>` + hoPara('');
      }
      if(s.type==='photos'){
        for(const p of s.photos){ const im = await hoImage(p.bucket, p.path, 1200); if(im){ body += `<w:p>${imgXml(im, 12)}</w:p>`; } if(p.caption) body += hoPara(p.caption, {color:'5B6070', sz:18}); }
      }
    }
    const docs = await hoLoadDocs(hoState.siteId);
    const names = [];
    if(d.attach.datasheets) docs.filter(x=>x.kind==='datasheet').forEach(x=>names.push(x.name));
    if(d.attach.guarantees) docs.filter(x=>x.kind==='guarantee' && x.storage_path).forEach(x=>names.push(x.name));
    if(d.attach.coshh) (await dbSelect('coshh_docs', 'site_id=eq.'+hoState.siteId+'&select=name')).forEach(x=>names.push(x.name));
    if(names.length){ body += hoPara('Appendices', {style:'Heading1'}) + hoPara('The following documents accompany this manual (attached in the PDF version):'); names.forEach((n,i)=>{ body += hoPara((i+1)+'.  '+n); }); }
    const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="21"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="56"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="100"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="${brand}"/><w:sz w:val="30"/></w:rPr></w:style></w:styles>`;
    const zip = new JSZip();
    zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`);
    zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
    zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${media.map((m,i)=>`<Relationship Id="rIdImg${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${m.name}"/>`).join('')}</Relationships>`);
    zip.file('word/document.xml', docXml); zip.file('word/styles.xml', styles);
    media.forEach(m=>zip.file('word/media/'+m.name, m.bytes));
    const blob = await zip.generateAsync({type:'blob', mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
    const site = SITES.find(s=>s.id===hoState.siteId);
    const fname = 'O&M Manual - '+((site&&site.name)||'Project').replace(/[\\/:*?"<>|]+/g,'-')+'.docx';
    hoBusy = ''; render();
    await hoDeliverBlob(blob, fname);
  }catch(e){ console.error('[hoWord]', e); hoBusy = ''; render(); toast('Could not build the Word file — try again'); }
};
async function hoDeliverBlob(blob, filename){
  const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  if(isNative){
    try{
      const path = 'exports/'+uid()+'-'+filename.replace(/[^a-z0-9.\-]+/gi,'-');
      const stored = await uploadToStorage('site-photos', path, blob, blob.type);
      if(stored && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser){ await window.Capacitor.Plugins.Browser.open({url: publicUrl('site-photos', stored)+'?download='+encodeURIComponent(filename)}); return; }
    }catch(e){}
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 4000);
  window.__lastDownload = {name:filename, size:blob.size};
  toast('Word file downloaded');
}
