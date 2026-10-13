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
// First two pages follow the company's own O&M template (Parkhill): page 1
// = heading, wide photo, title/project/address/volume line; page 2 = logo,
// CDM wording, Contractor Details + Revision Details table.
const HO_COVER_HEADER = 'CONTRACTOR INFORMATION FOR HEALTH AND SAFETY FILE';
const HO_COVER_VOLUME = 'Volume Book 1 O&M Manuals documentation';
const HO_COVER_SUB = 'Construction (Design and Management)\nRegulations 2015\n\nOperation and maintenance manuals and\nAs Built Information';
function hoAddrLines(a){ const parts = String(a||'').split(',').map(x=>x.trim()).filter(Boolean); if(parts.length>=2 && /\d/.test(parts[parts.length-1])) return [parts.slice(0,-1).join(', '), parts[parts.length-1]]; return parts.length ? [parts.join(', ')] : []; }
function hoContractorSec(d){ return d.sections.find(s=>s.type==='table' && /contractor details/i.test(s.title||'')); }
function hoContractorRows(d){ const s = hoContractorSec(d); return s ? s.rows.filter(r=>!/^(revision|date)\b/i.test(String(r[0]||'').trim()) && r.slice(1).some(v=>String(v||'').trim())) : []; }
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
    dbSelect('coshh_docs', 'site_id=eq.'+siteId+'&order=uploaded_at.asc&select=id,name,storage_path'),
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
  const matRows = [], matLinks = []; let n = 1;
  sheets.forEach(d=>{ matRows.push([String(n++), '', d.name.replace(/\.pdf$/i,''), d.provider||'']); matLinks.push([{docId:d.id, name:d.name}]); });
  coshh.forEach(c=>{ const nm = c.name.replace(/^COSHH\s*[—-]\s*/i,'').replace(/^COSHH Assessment\s*-\s*/i,'').replace(/\.pdf$/i,''); const lk = c.storage_path ? {bucket:'coshh-docs', path:c.storage_path, name:c.name} : null; const at = matRows.findIndex(r=>r[2].toLowerCase()===nm.toLowerCase()); if(at>=0){ if(lk) matLinks[at].push(lk); } else { matRows.push([String(n++), 'COSHH', nm, '']); matLinks.push(lk ? [lk] : []); } });
  const sysText = [scope, sheets.map(d=>d.name+' '+(d.provider||'')).join(' '), coshh.map(c=>c.name).join(' ')].join(' ');
  const systems = hoDetectSystems(sysText);
  const maintItems = systems.map(k=>({id:hoUid(), key:k, title:HO_MAINT[k].label, text:HO_MAINT[k].text}));
  const addr = fullSiteAddress(site) || '';
  return {
    cover: {title:'O&M MANUAL', project:site.name||'', address:addr, header:HO_COVER_HEADER, volume:HO_COVER_VOLUME, subtitle:HO_COVER_SUB, revision:'1', date:localISODate(new Date()), coverPhoto: photos[0] ? {bucket:photos[0].bucket, path:photos[0].path} : null},
    attach: {datasheets:true, guarantees:true, coshh:true, drawings:false},
    appendix: [],
    sections: [
      {id:hoUid(), type:'table', title:'Contractor Details', columns:['',''], rows:[
        ['Name', company], ['Address', String(st.address||'').replace(/\n/g, ', ')], ['Telephone', st.phone||''], ['Email', (pm && pm.email) || ME.email || ''],
        ['Client', site.client_name||''], ['Job number', site.job_number||''], ['Revision', '1'], ['Date', hoFmtDate(localISODate(new Date()))],
      ]},
      {id:hoUid(), type:'text', title:'1. Introduction', body:
`This document confirms the formal handover of the completed roofing works at ${site.name||'the site'}${addr?', '+addr:''} — on behalf of ${company}${site.client_name?' to '+site.client_name:''}.

This document records the scope of works carried out, materials and systems installed, guarantee and maintenance provisions, health and safety information, and the parties' formal sign-off.`},
      {id:hoUid(), key:'scope', type:'text', title:'2. Scope of Works Completed', body: scope.trim()},
      {id:hoUid(), type:'materials', title:'3. Materials Log – Data & COSHH', columns:['Log No.','Element','Product','Manufacturer'], rows: matRows.length ? matRows : [['1','','','']], links: matRows.length ? matLinks : [[]]},
      {id:hoUid(), type:'table', title:'4. Guarantees & Warranties', columns:['Manufacturer / Item','Ref','Expiry','Maintenance'], rows: guars.length ? guars.map(g=>[g.provider ? g.provider+' – '+g.name.replace(/\.pdf$/i,'') : g.name.replace(/\.pdf$/i,''), g.ref||'', g.expiry_date ? hoFmtDate(g.expiry_date) : '', g.maintenance||'']) : [['','','','']], links: guars.length ? guars.map(g=>[{docId:g.id, name:g.name}]) : [[]]},
      {id:hoUid(), type:'maint', title:'5. Maintenance Procedures', items: maintItems},
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
// #(om-multi) A job can have several O&M manuals (handover_om_manuals, one
// row each). The Handover tile opens the list; each manual opens at
// #/site/<site>/handover/<manual id>.
async function hoLoadManual(siteId, manualId){
  if(hoState && hoState.siteId===siteId && hoState.manualId===manualId) return hoState;
  const rows = await dbSelect('handover_om_manuals', 'id=eq.'+manualId+'&site_id=eq.'+siteId);
  const row = rows && rows[0];
  if(!row) return null;
  let data = row.data && row.data.sections ? row.data : null;
  const isNew = !data;
  if(!data) data = await hoBuildDefault(siteId);
  const changed = hoNormalize(data);
  hoState = {siteId, manualId, name: row.name || 'O&M Manual', data, dirty:isNew || changed};
  if(hoState.dirty) hoSaveNow();
  return hoState;
}
function hoTouch(){ if(!hoState) return; hoState.dirty = true; clearTimeout(hoSaveTimer); hoSaveTimer = setTimeout(hoSaveNow, 900); }
async function hoSaveNow(){
  if(!hoState || !hoState.dirty) return true;
  const st = hoState; st.dirty = false;
  const res = await sbFetch('/rest/v1/handover_om_manuals?id=eq.'+st.manualId, {method:'PATCH', headers:{'Prefer':'return=minimal'}, body: JSON.stringify({data:st.data, name:st.name, updated_at:new Date().toISOString(), updated_by:ME.id})});
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
window.hoAddRow = function(id){ const s = hoSec(id); s.rows.push(s.columns.map(()=>'')); (s.links = s.links||[]).push([]); hoTouch(); render(); };
window.hoDelRow = function(id, r){ const s = hoSec(id); s.rows.splice(r,1); if(s.links) s.links.splice(r,1); hoTouch(); render(); };
window.hoAddCol = function(id){ const s = hoSec(id); s.columns.push('New column'); s.rows.forEach(r=>r.push('')); hoTouch(); render(); };
window.hoDelCol = function(id, c){ const s = hoSec(id); if(s.columns.length<=1) return; s.columns.splice(c,1); s.rows.forEach(r=>r.splice(c,1)); hoTouch(); render(); };
window.hoMove = function(id, dir){ const a = hoState.data.sections, i = a.findIndex(s=>s.id===id), j = i+dir; if(i<0 || j<0 || j>=a.length) return; [a[i],a[j]] = [a[j],a[i]]; hoTouch(); render(); };
window.hoDelSection = async function(id){ const s = hoSec(id); if(s.key==='scope'){ toast('The Scope of Works has to stay in the manual'); return; } if(!(await customConfirm(`Delete the section "${s.title||'Untitled'}"?`))) return; hoState.data.sections = hoState.data.sections.filter(x=>x.id!==id); hoTouch(); render(); };
window.hoAddSection = function(type){
  const s = {id:hoUid(), type, title:type==='table' ? 'New table' : type==='photos' ? 'Photographs' : 'New section'};
  if(type==='text') s.body = '';
  if(type==='table'){ s.columns = ['Item','Details']; s.rows = [['','']]; }
  if(type==='photos') s.photos = [];
  if(type==='table'){ s.links = [[]]; }
  if(type==='maint'){ s.title = 'Maintenance Procedures'; s.items = []; }
  hoState.data.sections.push(s); hoTouch(); render();
  setTimeout(()=>{ const el = document.getElementById('hosec-'+s.id); if(el) el.scrollIntoView({behavior:'smooth', block:'center'}); }, 80);
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

// Older saved manuals: Materials Log table → semi-automatic materials
// section, maintenance text → pick-list section, Scope of Works flagged as
// the required section, every table gets per-row attachments.
function hoNormalize(d){
  let ch = false;
  if(!Array.isArray(d.appendix)){ d.appendix = []; ch = true; }
  // Older manuals: data sheets, guarantees and the job's COSHH go in the back by default.
  if(!d.attach){ d.attach = {}; ch = true; }
  ['datasheets','guarantees','coshh'].forEach(k=>{ if(d.attach[k]==null){ d.attach[k] = true; ch = true; } });
  d.cover = d.cover || {};
  if(d.cover.header==null){ d.cover.header = HO_COVER_HEADER; ch = true; }
  if(d.cover.volume==null){ d.cover.volume = HO_COVER_VOLUME; ch = true; }
  if(!d.cover.subtitle || /^Operation and Maintenance Manual and As Built Information — Construction/.test(d.cover.subtitle)){ d.cover.subtitle = HO_COVER_SUB; ch = true; }
  d.sections.forEach(s=>{
    if(s.type==='table' && /materials?\s+log/i.test(s.title||'')){ s.type = 'materials'; ch = true; }
    if(s.type==='table' || s.type==='materials'){
      if(!Array.isArray(s.links)){ s.links = []; ch = true; }
      while(s.links.length < s.rows.length){ s.links.push([]); ch = true; }
      if(s.links.length > s.rows.length){ s.links.length = s.rows.length; ch = true; }
    }
    if(s.type==='text' && !s.key && /scope of works/i.test(s.title||'')){ s.key = 'scope'; ch = true; }
  });
  const mt = d.sections.find(s=>s.type==='text' && /maintenance/i.test(s.title||''));
  if(mt && !d.sections.some(s=>s.type==='maint')){
    const items = [];
    String(mt.body||'').split(/\n\s*\n/).forEach(b=>{
      if(!b.trim()) return;
      const lines = b.split('\n'); const first = lines[0].trim();
      const k = Object.keys(HO_MAINT).find(k=>HO_MAINT[k].label===first);
      if(k) items.push({id:hoUid(), key:k, title:first, text:lines.slice(1).join('\n')});
      else items.push({id:hoUid(), key:null, title:'Maintenance', text:b.trim()});
    });
    mt.type = 'maint'; mt.items = items; delete mt.body; ch = true;
  }
  if(!d.sections.some(s=>s.key==='scope')){
    d.sections.splice(Math.min(2, d.sections.length), 0, {id:hoUid(), key:'scope', type:'text', title:'Scope of Works Completed', body:''}); ch = true;
  }
  return ch;
}
function hoScopeEmpty(){ const s = hoState && hoState.data.sections.find(x=>x.key==='scope'); return !s || !String(s.body||'').trim() || /^describe the works carried out\.?$/i.test(String(s.body||'').trim()); }
function hoCheckRequired(){
  if(!hoScopeEmpty()) return true;
  toast('Describe the Scope of Works first — it has to be filled in');
  hoTab = 'manual'; render();
  setTimeout(()=>{ const s = hoState.data.sections.find(x=>x.key==='scope'); const el = s && document.getElementById('hosec-'+s.id); if(el){ el.scrollIntoView({behavior:'smooth', block:'center'}); const ta = el.querySelector('textarea'); if(ta) ta.focus(); } }, 120);
  return false;
}

// ---- maintenance pick-list ----
window.hoMaintToggle = function(id, key){
  const s = hoSec(id); if(!s || !HO_MAINT[key]) return;
  const at = s.items.findIndex(x=>x.key===key);
  if(at>=0) s.items.splice(at,1); else s.items.push({id:hoUid(), key, title:HO_MAINT[key].label, text:HO_MAINT[key].text});
  hoTouch(); render();
};
window.hoMaintCustom = function(id){ const s = hoSec(id); const it = {id:hoUid(), key:null, title:'', text:''}; s.items.push(it); hoTouch(); render(); setTimeout(()=>{ const el = document.getElementById('hoit-'+it.id); if(el){ el.scrollIntoView({behavior:'smooth', block:'center'}); const i = el.querySelector('input'); if(i) i.focus(); } }, 100); };
window.hoMaintSet = function(id, itemId, key, val){ const s = hoSec(id); const it = s && s.items.find(x=>x.id===itemId); if(it){ it[key] = val; hoTouch(); } };
window.hoMaintDel = function(id, itemId){ const s = hoSec(id); s.items = s.items.filter(x=>x.id!==itemId); hoTouch(); render(); };
window.hoMaintMove = function(id, itemId, dir){ const a = hoSec(id).items, i = a.findIndex(x=>x.id===itemId), j = i+dir; if(i<0 || j<0 || j>=a.length) return; [a[i],a[j]] = [a[j],a[i]]; hoTouch(); render(); };

// ---- files attached to a table row ----
async function hoUploadFile(f, folder){
  const site = SITES.find(s=>s.id===hoState.siteId);
  const path = ((site&&site.org_id)||ME.org_id)+'/handover/'+hoState.siteId+'/'+(folder?folder+'/':'')+uid()+'-'+f.name.replace(/[^a-z0-9.\-]+/gi,'_');
  return await uploadToStorage('mc-documents', path, f, f.type || 'application/pdf');
}
window.hoRowUpload = async function(input, id, r){
  const files = Array.from(input.files||[]); input.value = ''; if(!files.length) return;
  const s = hoSec(id); s.links = s.links||[]; s.links[r] = s.links[r]||[];
  for(let i=0;i<files.length;i++){
    hoBusy = `Uploading ${i+1} of ${files.length}…`; render();
    const stored = await hoUploadFile(files[i], 'rows');
    if(stored) s.links[r].push({bucket:'mc-documents', path:stored, name:files[i].name});
  }
  hoBusy = ''; hoTouch(); render(); toast('Attached');
};
window.hoUnlink = async function(id, r, li){
  const s = hoSec(id); const l = s.links[r][li]; if(!l) return;
  if(!(await customConfirm(`Remove "${l.name}" from this row?`))) return;
  s.links[r].splice(li,1); hoTouch(); render();
};
function hoLinkView(l, docs){
  const d = l.docId ? (docs||[]).find(x=>x.id===l.docId) : null;
  const bucket = d ? 'mc-documents' : l.bucket, path = d ? d.storage_path : l.path;
  if(!path) return '';
  return `viewDrawing('${publicUrl(bucket, path)}', ${/\.(jpe?g|png)$/i.test(path)}, '${jsAttr(l.name||'')}')`;
}

// ---- cover photo from the phone ----
window.hoCoverFile = async function(input){
  const f = input.files && input.files[0]; input.value = ''; if(!f) return;
  hoBusy = 'Uploading the cover photo…'; render();
  let blob = f;
  try{ const du = await compressImage(f, {maxW:2000, quality:0.88}); blob = await (await fetch(du)).blob(); }catch(e){}
  const stored = await hoUploadFile(new File([blob], (f.name||'cover').replace(/\.[a-z0-9]+$/i,'')+'.jpg', {type:'image/jpeg'}), 'cover');
  hoBusy = '';
  if(stored){ hoState.data.cover.coverPhoto = {bucket:'mc-documents', path:stored}; hoTouch(); toast('Cover photo set'); } else toast('Upload failed — check signal');
  render();
};

// ---- bottom sheet chooser ----
function hoSheet(title, inner, onClick){
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.5);display:flex;align-items:flex-end;justify-content:center;';
  ov.innerHTML = `<div class="hosheet" style="background:#fff;border-radius:18px 18px 0 0;width:100%;max-width:640px;max-height:82vh;overflow:auto;padding:16px 16px calc(16px + env(safe-area-inset-bottom));"><p class="sectiontitle" style="margin-top:0;">${escapeHtml(title)}</p>${inner}<button type="button" class="ghostbtn" data-cancel="1" style="margin-top:10px;">Cancel</button></div>`;
  ov.addEventListener('click', ev=>{ const b = ev.target.closest('[data-cancel]'); if(ev.target===ov || b){ ov.remove(); return; } onClick(ev, ov); });
  document.body.appendChild(ov);
  return ov;
}

// ---- Materials Log: choose data sheets from the COSHH library ----
window.hoPickDatasheets = async function(id){
  hoBusy = 'Loading the library…'; render();
  let lib = [], amap = {};
  try{ lib = await coshhLoadLibrary(); amap = await coshhAssessMap(lib); }catch(e){}
  hoBusy = ''; render();
  if(!lib.length){ toast('No products in the COSHH library yet — add data sheets in Admin › COSHH Library'); return; }
  const s0 = hoSec(id);
  const have = new Set(s0.rows.map(r=>String(r[2]||'').trim().toLowerCase()));
  const row = (it, i) => { const a = amap[it.id]; const inLog = have.has(String(it.title||'').trim().toLowerCase());
    return `<label class="hopick" data-t="${escapeHtml(String(it.title+' '+(it.data.manufacturer||'')).toLowerCase())}" style="display:flex;gap:10px;align-items:flex-start;padding:9px 4px;border-bottom:1px solid #EEE;cursor:pointer;">
      <input type="checkbox" data-i="${i}" style="width:auto;margin:3px 0 0;" ${inLog?'disabled':''}>
      <span style="flex:1;"><b>${escapeHtml(it.title)}</b><br><span class="stub" style="margin:0;font-size:12px;">${escapeHtml(it.data.manufacturer||'')}${it.data.manufacturer?' · ':''}${it.data.sdsPath?'📄 data sheet':'no data sheet'} · ${a?'✓ COSHH assessment':'no COSHH yet'}${inLog?' · already in the log':''}</span></span></label>`; };
  const ov = hoSheet('Choose data sheets from the library', `
    <input type="search" placeholder="Search products" style="margin:0 0 6px;" oninput="const q=this.value.toLowerCase();this.closest('.hosheet').querySelectorAll('.hopick').forEach(el=>{el.style.display=el.dataset.t.includes(q)?'':'none';})">
    <p class="stub" style="margin:0 0 6px;font-size:12px;">Each product goes into the log with its data sheet, and its COSHH assessment is added straight after.</p>
    ${lib.map(row).join('')}
    <button type="button" class="darkbtn" data-done="1" style="margin-top:12px;">Add ticked products</button>`, async (ev, ov)=>{
      if(!ev.target.closest('[data-done]')) return;
      const picked = [...ov.querySelectorAll('input[data-i]:checked')].map(x=>lib[Number(x.dataset.i)]);
      ov.remove(); if(!picked.length) return;
      const s = hoSec(id); s.links = s.links||[];
      const numbered = () => s.rows.filter(r=>r.some((v,i)=>i>0 && v)).length;
      picked.forEach(it=>{
        const r = s.columns.map(()=>''); r[0] = String(numbered()+1); if(r.length>1) r[1] = ''; if(r.length>2) r[2] = it.title; if(r.length>3) r[3] = it.data.manufacturer||'';
        const links = [];
        if(it.data.sdsPath) links.push({bucket:'coshh-library', path:it.data.sdsPath, name:'Data sheet – '+it.title});
        const a = amap[it.id]; if(a && a.file) links.push({bucket:'coshh-library', path:a.file.storage_path, name:'COSHH – '+it.title});
        const blank = s.rows.findIndex(x=>x.every((v,i)=>!v || i===0));
        if(blank>=0){ s.rows[blank] = r; s.links[blank] = links; } else { s.rows.push(r); s.links.push(links); }
      });
      hoTouch(); render(); toast(picked.length+' added to the Materials Log');
    });
};

// ---- appendices: Schedule of Works / handover report at the back ----
window.hoAddAppendix = async function(cat){
  const siteId = hoState.siteId;
  const opts = [];
  if(cat==='sow'){
    opts.push({v:'app', label:"📋 This job's Schedule of Works (from the app)", sub:'Built fresh when you export — every item, with its photos'});
    try{ (await dbSelect('schedule_documents', 'site_id=eq.'+siteId+'&order=created_at.desc')).filter(x=>/\.(pdf|jpe?g|png)$/i.test(x.storage_path||x.name||'')).forEach(x=>opts.push({v:'doc', label:'📄 '+x.name, sub:'Uploaded to the Schedule of Works', bucket:'schedule-docs', path:x.storage_path, name:x.name})); }catch(e){}
  } else {
    try{
      const subs = (await dbSelect('report_submissions', 'site_id=eq.'+siteId+'&order=submitted_at.desc&limit=100&select=id,template_name,submitted_at,status,general_label')).filter(x=>x.status!=='in_progress');
      subs.sort((a,b)=>(/handover|completion|practical/i.test(b.template_name||'')?1:0)-(/handover|completion|practical/i.test(a.template_name||'')?1:0));
      subs.forEach(x=>opts.push({v:'report', label:'📝 '+(x.template_name||'Report'), sub:'Submitted '+hoFmtDate((x.submitted_at||'').slice(0,10)), reportId:x.id, name:(x.template_name||'Report')+' – '+hoFmtDate((x.submitted_at||'').slice(0,10))}));
    }catch(e){}
  }
  hoSheet(cat==='sow' ? 'Add a Schedule of Works to the back' : 'Add a handover report to the back', `
    ${opts.map((o,i)=>`<button type="button" class="ghostbtn" data-o="${i}" style="text-align:left;margin:0 0 8px;text-transform:none;letter-spacing:0;"><b>${escapeHtml(o.label)}</b><br><span class="stub" style="margin:0;font-size:12px;">${escapeHtml(o.sub||'')}</span></button>`).join('') || `<p class="stub">No ${cat==='sow'?'schedule documents':'submitted reports'} on this job yet.</p>`}
    <label class="darkbtn" style="display:block;text-align:center;cursor:pointer;margin-top:4px;">⬆️ Upload a file (PDF or photo)<input type="file" accept="application/pdf,image/*" multiple style="display:none;" data-up="1"></label>`, (ev, ov)=>{
      const b = ev.target.closest('[data-o]'); if(!b) return;
      const o = opts[Number(b.dataset.o)]; ov.remove();
      const e = {id:hoUid(), cat};
      if(o.v==='doc'){ (async ()=>{
        // Schedule documents live in a private bucket — copy the file into
        // the handover folder so the export can read it.
        hoBusy = 'Copying '+o.name+'…'; render();
        let stored = null;
        try{ const res = await sbFetch('/storage/v1/object/authenticated/schedule-docs/'+o.path.split('/').map(encodeURIComponent).join('/'), {timeoutMs:60000}); if(res && res.ok){ const blob = await res.blob(); stored = await hoUploadFile(new File([blob], o.name, {type:blob.type||'application/pdf'}), 'appendix'); } }catch(err){}
        hoBusy = '';
        if(stored){ hoState.data.appendix.push({id:e.id, cat, kind:'file', bucket:'mc-documents', path:stored, label:o.name.replace(/\.pdf$/i,'')}); hoTouch(); toast('Added to the back of the manual'); } else toast('Could not copy that file — try uploading it instead');
        render();
      })(); return; }
      if(o.v==='app'){ e.kind = 'sow-app'; e.label = 'Schedule of Works'; }
      else if(o.v==='report'){ e.kind = 'report'; e.reportId = o.reportId; e.label = o.name; }
      else { e.kind = 'file'; e.bucket = o.bucket; e.path = o.path; e.label = o.name; }
      hoState.data.appendix.push(e); hoTouch(); render(); toast('Added to the back of the manual');
    });
  setTimeout(()=>{ const inp = document.querySelector('.hosheet input[data-up]'); if(inp) inp.addEventListener('change', async ()=>{
    const files = Array.from(inp.files||[]); const ov = inp.closest('.hosheet').parentNode; ov.remove();
    for(let i=0;i<files.length;i++){
      hoBusy = `Uploading ${i+1} of ${files.length}…`; render();
      const stored = await hoUploadFile(files[i], 'appendix');
      if(stored) hoState.data.appendix.push({id:hoUid(), cat, kind:'file', bucket:'mc-documents', path:stored, label:files[i].name.replace(/\.pdf$/i,'')});
    }
    hoBusy = ''; hoTouch(); render();
  }); }, 30);
};
window.hoAppLabel = function(i, v){ const e = hoState.data.appendix[i]; if(e){ e.label = v; hoTouch(); } };
window.hoAppMove = function(i, dir){ const a = hoState.data.appendix, j = i+dir; if(j<0 || j>=a.length) return; [a[i],a[j]] = [a[j],a[i]]; hoTouch(); render(); };
window.hoAppDel = async function(i){ const e = hoState.data.appendix[i]; if(!e || !(await customConfirm(`Remove "${e.label}" from the back of the manual?`))) return; hoState.data.appendix.splice(i,1); hoTouch(); render(); };

// Every document that goes behind the manual, in order: files on table rows
// (data sheets, COSHH, guarantees…), then the ticked job documents not
// already included, then the Schedule of Works / reports at the very end.
// Order in the back of the PDF (Andy, 13 Oct 2026):
//   1. Schedule of Works / completed reports / handover / other added files
//   2. Guarantees & warranties
//   3. Drawings & specifications
//   4. COSHH assessments and data sheets (always last) — in Materials Log
//      order, each product's data sheet then its COSHH.
async function hoCollectAttachments(){
  const d = hoState.data, docs = await hoLoadDocs(hoState.siteId);
  const G = {app:[], guar:[], draw:[], coshh:[]}, seen = new Set();
  // The same COSHH assessment can be on the job (copied from the library) and
  // linked from the library itself — only attach it once.
  const coshhSeen = new Set();
  const add = (g, a) => {
    if(a.path){ const k = a.bucket+'|'+a.path; if(seen.has(k)) return; seen.add(k); }
    if(/coshh/i.test(a.name||'') && !/^data sheet/i.test(a.name||'')){ const n = hoCoshhName(a.name); if(n){ if(coshhSeen.has(n)) return; coshhSeen.add(n); } }
    G[g].push(a);
  };
  const groupOf = s => s.type==='materials' ? 'coshh' : /guarantee|warrant/i.test(s.title||'') ? 'guar' : /drawing|specification/i.test(s.title||'') ? 'draw' : 'app';
  (d.appendix||[]).forEach(e=>{ if(e.kind==='file') add('app', {bucket:e.bucket, path:e.path, name:e.label}); else G.app.push({gen:e, name:e.label}); });
  d.sections.forEach(s=>{ const g = groupOf(s); (s.links||[]).forEach(ls=>(ls||[]).forEach(l=>{
    if(l.docId){ const x = docs.find(y=>y.id===l.docId); if(x && x.storage_path) add(x.kind==='datasheet' ? 'coshh' : x.kind==='guarantee' ? 'guar' : g, {bucket:'mc-documents', path:x.storage_path, name:x.name}); }
    else if(l.path) add(g, {bucket:l.bucket, path:l.path, name:l.name});
  })); });
  if(d.attach.guarantees) docs.filter(x=>x.kind==='guarantee' && x.storage_path).forEach(x=>add('guar', {bucket:'mc-documents', path:x.storage_path, name:x.name}));
  if(d.attach.drawings){ try{ (await dbSelect('drawing_files', 'site_id=eq.'+hoState.siteId+'&select=name,storage_path,status')).filter(x=>x.status!=='superseded').forEach(x=>add('draw', {bucket:'drawings', path:x.storage_path, name:x.name})); }catch(e){} }
  if(d.attach.coshh){ try{ (await dbSelect('coshh_docs', 'site_id=eq.'+hoState.siteId+'&subcontractor_company_id=is.null&select=name,storage_path')).forEach(x=>add('coshh', {bucket:'coshh-docs', path:x.storage_path, name:x.name})); }catch(e){} }
  if(d.attach.datasheets) docs.filter(x=>x.kind==='datasheet' && x.storage_path).forEach(x=>add('coshh', {bucket:'mc-documents', path:x.storage_path, name:x.name}));
  return [].concat(G.app, G.guar, G.draw, G.coshh);
}

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
    const t = isSheet ? d.sections.find(s=>s.type==='materials') : d.sections.find(s=>s.type==='table' && /guarantee|warrant/i.test(s.title||''));
    d.synced[x.id] = 1; changed = true;
    if(!t) return;
    const nm = String(x.name||'').replace(/\.pdf$/i,'');
    const row = t.columns.map(()=>'');
    if(isSheet){ row[0] = String(t.rows.filter(r=>r.some((v,i)=>i>0 && v)).length+1); if(row.length>2) row[2] = nm; if(row.length>3) row[3] = x.provider||''; }
    else { row[0] = x.provider ? x.provider+' – '+nm : nm; if(row.length>1) row[1] = x.ref||''; if(row.length>2) row[2] = x.expiry_date ? hoFmtDate(x.expiry_date) : ''; if(row.length>3) row[3] = x.maintenance||''; }
    t.links = t.links || [];
    const blank = t.rows.findIndex(r=>r.every((v,i)=>!v || (isSheet && i===0)));
    if(blank>=0){ t.rows[blank] = row; t.links[blank] = [{docId:x.id, name:x.name}]; } else { t.rows.push(row); t.links[t.rows.length-1] = [{docId:x.id, name:x.name}]; }
  });
  if(changed) hoTouch();
}

// #(om-coshh-autosync) COSHH assessments on the job (H&S › COSHH) go into
// the Materials Log automatically — each with its PDF linked to the row, so
// it's attached in the back of the manual straight after that product.
// Ones added to the job after the manual was started are picked up too.
// Matched by product name to a row already there (e.g. picked from the
// COSHH library) so nothing is listed twice. A row the user deletes stays
// deleted.
function hoCoshhName(n){ return String(n||'').replace(/\.pdf$/i,'').replace(/^COSHH\s*(Assessment)?\s*[—–-]\s*/i,'').replace(/^Data sheet\s*[—–-]\s*/i,'').trim().toLowerCase(); }
function hoSyncCoshh(coshh){
  const d = hoState.data; d.syncedCoshh = d.syncedCoshh || {};
  const t = d.sections.find(s=>s.type==='materials');
  if(!t) return;
  t.links = t.links || [];
  let changed = false;
  (coshh||[]).forEach(c=>{
    if(!c.storage_path || d.syncedCoshh[c.id]) return;
    d.syncedCoshh[c.id] = 1; changed = true;
    const lk = {bucket:'coshh-docs', path:c.storage_path, name:c.name};
    const nm = hoCoshhName(c.name);
    // Already linked somewhere in the log?
    if(t.links.some(ls=>(ls||[]).some(l=>l.path===c.storage_path))) return;
    let at = t.rows.findIndex(r=>hoCoshhName(r[2])===nm && nm);
    if(at<0) at = t.links.findIndex(ls=>(ls||[]).some(l=>hoCoshhName(l.name)===nm));
    if(at>=0){
      // Same product already in the log: if it already carries a COSHH assessment (from the library) leave it.
      const ls = t.links[at] = t.links[at] || [];
      if(!ls.some(l=>/coshh/i.test(l.name||'') && !/^data sheet/i.test(l.name||''))) ls.push(lk);
      return;
    }
    const row = t.columns.map(()=>'');
    row[0] = String(t.rows.filter(r=>r.some((v,i)=>i>0 && v)).length+1);
    if(row.length>1) row[1] = 'COSHH';
    if(row.length>2) row[2] = String(c.name||'').replace(/\.pdf$/i,'').replace(/^COSHH\s*(Assessment)?\s*[—–-]\s*/i,'');
    const blank = t.rows.findIndex(r=>r.every((v,i)=>!v || i===0));
    if(blank>=0){ t.rows[blank] = row; t.links[blank] = [lk]; } else { t.rows.push(row); t.links[t.rows.length-1] = [lk]; }
  });
  if(changed) hoTouch();
}

// ---------- page ----------
async function renderHandover(siteId){
  const __gen = RENDER_GEN;
  if(!isManager(ME)){ go('#/site/'+siteId+'/home'); return; }
  const site = SITES.find(s=>s.id===siteId);
  if(!site){ go('#/sites'); return; }
  const manualId = (location.hash.split('?')[0].split('/')[4]) || '';
  if(!manualId) return renderHandoverList(siteId);
  if(hoState && (hoState.siteId!==siteId || hoState.manualId!==manualId)){ if(hoState.dirty) await hoSaveNow(); hoState = null; hoMenu = null; }
  if(!(await hoLoadManual(siteId, manualId))){ toast('That O&M manual no longer exists'); go('#/site/'+siteId+'/handover'); return; }
  const [docs, jobCoshh] = await Promise.all([
    hoLoadDocs(siteId),
    dbSelect('coshh_docs', 'site_id=eq.'+siteId+'&subcontractor_company_id=is.null&order=uploaded_at.asc&select=id,name,storage_path').catch(()=>[]),
  ]);
  if(__gen !== RENDER_GEN) return;
  hoSyncDocs(docs);
  hoSyncCoshh(jobCoshh||[]);
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
    const tableHtml = s => {
      const links = s.links || [];
      return `<div class="hotable"><table><thead><tr><th class="hofilescol">Files</th>${s.columns.map((h,ci)=>`<th><input value="${escapeHtml(h)}" oninput="hoHead('${s.id}',${ci},this.value)">${s.columns.length>1?`<button type="button" class="hox" title="Delete column" onclick="hoDelCol('${s.id}',${ci})">✕</button>`:''}</th>`).join('')}<th></th></tr></thead>
        <tbody>${s.rows.map((r,ri)=>`<tr><td class="hofiles">${(links[ri]||[]).map((l,li)=>{ const v = hoLinkView(l, docs); return `<span class="holink"><span class="holinkname" ${v?`onclick="${v}"`:''}>📄 ${escapeHtml(l.name||'File')}</span><button type="button" class="hox" title="Remove" onclick="hoUnlink('${s.id}',${ri},${li})">✕</button></span>`; }).join('')}<label class="hox hoattach" title="Attach a file to this row">📎 Attach<input type="file" accept="application/pdf,image/*" multiple style="display:none;" onchange="hoRowUpload(this,'${s.id}',${ri})"></label></td>
          ${r.map((v,ci)=>`<td><textarea rows="2" oninput="hoCell('${s.id}',${ri},${ci},this.value)">${escapeHtml(v||'')}</textarea></td>`).join('')}
          <td><button type="button" class="hox" title="Delete row" onclick="hoDelRow('${s.id}',${ri})">🗑</button></td></tr>`).join('')}</tbody></table></div>
        <div class="row-gap" style="margin-top:6px;"><button type="button" class="ghostbtn" style="flex:1;margin:0;padding:6px;font-size:12px;" onclick="hoAddRow('${s.id}')">+ Row</button><button type="button" class="ghostbtn" style="flex:1;margin:0;padding:6px;font-size:12px;" onclick="hoAddCol('${s.id}')">+ Column</button></div>`;
    };
    const secHtml = s => {
      let inner = '';
      const req = s.key==='scope';
      if(s.type==='text') inner = `<textarea rows="${Math.min(18, Math.max(4, String(s.body||'').split('\n').length+1))}" ${req?`placeholder="Describe the works carried out (required)" class="${hoScopeEmpty()?'horequired':''}"`:''} oninput="hoSet('${s.id}','body',this.value);${req?`this.classList.toggle('horequired', !this.value.trim())`:''}">${escapeHtml(s.body||'')}</textarea>${req?`<p class="stub" style="margin:4px 0 0;font-size:12px;">Required — the manual can't be exported until this is filled in.</p>`:''}`;
      if(s.type==='table') inner = tableHtml(s);
      if(s.type==='materials') inner = `<button type="button" class="darkbtn" style="margin:0 0 8px;" onclick="hoPickDatasheets('${s.id}')">📚 Choose data sheets from the library</button>
        <p class="stub" style="margin:0 0 6px;font-size:12px;">Each product's data sheet and COSHH assessment are attached to its row and go in the back of the PDF. COSHH assessments on the job (H&amp;S › COSHH) and data sheets uploaded on the Data sheets tab are added here automatically.</p>` + tableHtml(s);
      if(s.type==='maint'){
        const on = new Set(s.items.map(x=>x.key).filter(Boolean));
        inner = `<p class="field-label" style="margin:0 0 6px;">Tap to add or remove standard wording</p>
          <div class="pmchips" style="margin:0 0 10px;flex-wrap:wrap;">${Object.keys(HO_MAINT).map(k=>`<button type="button" class="pmchip ${on.has(k)?'on':''}" onclick="hoMaintToggle('${s.id}','${k}')">${on.has(k)?'✓ ':'+ '}${escapeHtml(HO_MAINT[k].label)}</button>`).join('')}</div>
          ${s.items.map((it,ii)=>`<div class="homaint" id="hoit-${it.id}">
            <div class="row-gap" style="align-items:center;margin-bottom:6px;"><input type="text" value="${escapeHtml(it.title||'')}" placeholder="Heading (e.g. Green roof)" style="flex:1;margin:0;font-weight:700;" oninput="hoMaintSet('${s.id}','${it.id}','title',this.value)">
              <button type="button" class="hox" onclick="hoMaintMove('${s.id}','${it.id}',-1)">↑</button><button type="button" class="hox" onclick="hoMaintMove('${s.id}','${it.id}',1)">↓</button><button type="button" class="hox" style="color:var(--warn);" onclick="hoMaintDel('${s.id}','${it.id}')">🗑</button></div>
            <textarea rows="${Math.min(14, Math.max(3, String(it.text||'').split('\n').length+1))}" placeholder="Maintenance wording" oninput="hoMaintSet('${s.id}','${it.id}','text',this.value)">${escapeHtml(it.text||'')}</textarea></div>`).join('') || '<p class="stub" style="margin:0 0 8px;">Nothing chosen yet.</p>'}
          <button type="button" class="ghostbtn" style="margin:4px 0 0;" onclick="hoMaintCustom('${s.id}')">+ Add custom maintenance</button>`;
      }
      if(s.type==='photos') inner = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;">${s.photos.map((p,i)=>`<div><div style="position:relative;"><img src="${publicUrl(p.bucket, p.path)}" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:8px;display:block;"><button type="button" class="hox" style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,.6);color:#fff;" onclick="hoRemovePhoto('${s.id}',${i})">✕</button></div><input type="text" value="${escapeHtml(p.caption||'')}" placeholder="Caption" style="margin:4px 0 0;font-size:12px;" oninput="hoPhotoCaption('${s.id}',${i},this.value)"></div>`).join('')}</div>
        <button type="button" class="ghostbtn" style="margin-top:8px;" onclick="hoPickPhotos('${s.id}')">+ Add photos from the job</button>`;
      return `<div class="card hosec" id="hosec-${s.id}">
        <div class="row-gap" style="align-items:center;margin-bottom:8px;"><input type="text" value="${escapeHtml(s.title||'')}" style="flex:1;margin:0;font-weight:800;" oninput="hoSet('${s.id}','title',this.value)">${req?'<span class="horeqtag">Required</span>':''}
          <button type="button" class="hox" title="Move up" onclick="hoMove('${s.id}',-1)">↑</button><button type="button" class="hox" title="Move down" onclick="hoMove('${s.id}',1)">↓</button>${req?'':`<button type="button" class="hox" title="Delete section" style="color:var(--warn);" onclick="hoDelSection('${s.id}')">🗑</button>`}</div>
        ${inner}</div>`;
    };
    const app = d.appendix || [];
    body = `
    <div class="card">
      <p class="sectiontitle" style="margin-top:0;">Cover</p>
      <div class="formfield" style="margin-top:0;"><label class="field-label">Title</label><input type="text" value="${escapeHtml(c.title||'')}" oninput="hoCover('title',this.value)"></div>
      <div class="formfield"><label class="field-label">Project</label><input type="text" value="${escapeHtml(c.project||'')}" oninput="hoCover('project',this.value)"></div>
      <div class="formfield"><label class="field-label">Address</label><input type="text" value="${escapeHtml(c.address||'')}" oninput="hoCover('address',this.value)"></div>
      <div class="formfield"><label class="field-label">Volume line</label><input type="text" value="${escapeHtml(c.volume||'')}" oninput="hoCover('volume',this.value)"></div>
      <div class="formfield"><label class="field-label">Heading at the top of page 1</label><input type="text" value="${escapeHtml(c.header||'')}" oninput="hoCover('header',this.value)"></div>
      <div class="formfield"><label class="field-label">Page 2 wording (under your logo)</label><textarea rows="5" oninput="hoCover('subtitle',this.value)">${escapeHtml(c.subtitle||'')}</textarea></div>
      <p class="stub" style="margin:0 0 10px;font-size:12px;">Page 2 also shows the Contractor Details table below and the revision number and date.</p>
      <div class="row-gap"><div class="formfield" style="flex:1;"><label class="field-label">Revision</label><input type="text" value="${escapeHtml(c.revision||'')}" oninput="hoCover('revision',this.value)"></div><div class="formfield" style="flex:1;"><label class="field-label">Date</label><input type="date" value="${escapeHtml(c.date||'')}" onchange="hoCover('date',this.value)"></div></div>
      <label class="field-label" style="display:block;margin:4px 0 6px;">Cover photo</label>
      ${c.coverPhoto ? `<div style="position:relative;margin-bottom:8px;"><img src="${publicUrl(c.coverPhoto.bucket, c.coverPhoto.path)}" style="width:100%;max-height:220px;object-fit:cover;border-radius:10px;display:block;"><button type="button" class="hox" style="position:absolute;top:6px;right:6px;background:rgba(0,0,0,.6);color:#fff;" onclick="hoCover('coverPhoto',null);render()">✕</button></div>` : '<p class="stub" style="margin:0 0 8px;">No cover photo yet.</p>'}
      <div class="hocoverbtns">
        <label class="ghostbtn">📷 Take photo<input type="file" accept="image/*" capture="environment" style="display:none;" onchange="hoCoverFile(this)"></label>
        <label class="ghostbtn">🖼 From library<input type="file" accept="image/*" style="display:none;" onchange="hoCoverFile(this)"></label>
        <button type="button" class="ghostbtn" onclick="hoPickPhotos(null,true)">🏗 Job photos</button>
      </div>
    </div>
    ${d.sections.map(secHtml).join('')}
    <div class="card">
      <p class="sectiontitle" style="margin-top:0;">Add a section</p>
      <div class="row-gap" style="flex-wrap:wrap;"><button type="button" class="ghostbtn" style="flex:1;margin:0;" onclick="hoAddSection('text')">+ Text</button><button type="button" class="ghostbtn" style="flex:1;margin:0;" onclick="hoAddSection('table')">+ Table</button><button type="button" class="ghostbtn" style="flex:1;margin:0;" onclick="hoAddSection('photos')">+ Photos</button>${d.sections.some(x=>x.type==='maint')?'':`<button type="button" class="ghostbtn" style="flex:1;margin:0;" onclick="hoAddSection('maint')">+ Maintenance</button>`}</div>
    </div>
    <div class="card">
      <p class="sectiontitle" style="margin-top:0;">At the back of the manual</p>
      <p class="stub" style="margin:0 0 8px;">Add as many as you need — they go at the very end of the PDF, in this order.</p>
      ${app.map((e,i)=>`<div class="row-gap" style="align-items:center;margin-bottom:6px;"><span style="font-size:18px;flex:0 0 auto;width:auto;">${e.cat==='sow'?'📋':'📝'}</span><input type="text" value="${escapeHtml(e.label||'')}" style="flex:1;margin:0;min-width:0;" oninput="hoAppLabel(${i},this.value)"><button type="button" class="hox" onclick="hoAppMove(${i},-1)">↑</button><button type="button" class="hox" onclick="hoAppMove(${i},1)">↓</button><button type="button" class="hox" style="color:var(--warn);" onclick="hoAppDel(${i})">🗑</button></div>`).join('')}
      <div class="row-gap" style="flex-wrap:wrap;"><button type="button" class="ghostbtn" style="flex:1;margin:0;" onclick="hoAddAppendix('sow')">+ Schedule of Works</button><button type="button" class="ghostbtn" style="flex:1;margin:0;" onclick="hoAddAppendix('report')">+ Handover report</button></div>
    </div>
    <div class="card">
      <p class="sectiontitle" style="margin-top:0;">Also attach to the back of the PDF</p>
      ${[['datasheets','Data sheets tab ('+sheets.length+')'],['guarantees','Guarantee certificates ('+guars.filter(g=>g.storage_path).length+')'],['coshh','COSHH assessments on this job ('+(jobCoshh||[]).filter(x=>x.storage_path).length+')'],['drawings','Drawings & specifications']].map(([k,l])=>`<label class="stub" style="display:flex;align-items:center;gap:8px;margin:0 0 6px;"><input type="checkbox" style="width:auto;" ${d.attach[k]?'checked':''} onchange="hoAttach('${k}',this.checked)">${l}</label>`).join('')}
    </div>`;
  }
  const html = `
    <div class="formfield" style="margin-top:0;"><label class="field-label">O&amp;M name</label><input type="text" value="${escapeHtml(hoState.name||'')}" placeholder="e.g. O&amp;M Manual – Main roof" oninput="hoState.name=this.value;hoTouch()"></div>
    <div class="pmchips" style="margin:0 0 12px;">${tab('manual','O&M manual')}${tab('sheets','Data sheets', sheets.length)}${tab('guar','Guarantees', guars.length)}</div>
    ${hoBusy ? `<div class="card" style="text-align:center;"><span class="spinner"></span> ${escapeHtml(hoBusy)}</div>` : ''}
    ${body}
    <div class="hoexport">
      <div class="hoexp-col">
        <button type="button" class="darkbtn" onclick="hoMenu=hoMenu==='export'?null:'export';render()">⬇ Export ▾</button>
        ${hoMenu==='export' ? `<div class="hoexp-menu"><button type="button" onclick="hoMenu=null;hoExportPdf()">📄 PDF</button><button type="button" onclick="hoMenu=null;hoExportWord()">📝 Word</button></div>` : ''}
      </div>
      <div class="hoexp-col">
        <button type="button" class="ghostbtn" onclick="hoMenu=hoMenu==='email'?null:'email';render()">✉ Email ▾</button>
        ${hoMenu==='email' ? `<div class="hoexp-menu"><button type="button" onclick="hoMenu=null;hoEmail('pdf')">📄 PDF</button><button type="button" onclick="hoMenu=null;hoEmail('docx')">📝 Word</button></div>` : ''}
      </div>
    </div>
    <button type="button" class="darkbtn" style="width:100%;margin:0 0 16px;" onclick="hoSaveClose()">💾 Save &amp; close</button>`;
  document.getElementById('app').innerHTML = shell(html, {title:hoState.name||'O&M Manual', subtitle:site.name, siteNameSubtitle:true, back:'#/site/'+siteId+'/handover', siteId});
}
window.hoSaveClose = async function(){
  if(!hoState) return;
  const siteId = hoState.siteId;
  hoState.dirty = true;
  const ok = await hoSaveNow();
  if(!ok) return;
  toast('O&M saved');
  hoState = null; hoMenu = null;
  go('#/site/'+siteId+'/handover');
};

// ---------- list of O&M manuals on the job ----------
async function renderHandoverList(siteId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  if(hoState){ if(hoState.dirty) await hoSaveNow(); hoState = null; }
  const list = await dbSelect('handover_om_manuals', 'site_id=eq.'+siteId+'&order=created_at.asc&select=id,name,created_at,updated_at,updated_by');
  if(__gen !== RENDER_GEN) return;
  const when = t => t ? new Date(t).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '';
  const rows = (list||[]).map(m=>`
    <div class="card" style="display:flex;align-items:center;gap:10px;cursor:pointer;" onclick="go('#/site/${siteId}/handover/${m.id}')">
      <div style="font-size:24px;">📘</div>
      <div style="flex:1;min-width:0;"><b>${escapeHtml(m.name||'O&M Manual')}</b><div class="stub" style="margin:2px 0 0;font-size:12px;">Updated ${when(m.updated_at||m.created_at)}${m.updated_by && PROFILES[m.updated_by] ? ' by '+escapeHtml(PROFILES[m.updated_by].name) : ''}</div></div>
      <div onclick="event.stopPropagation()">${rowActionsMenuHtml('om-'+m.id, `
        <div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;go('#/site/${siteId}/handover/${m.id}')">✎ Edit</div>
        <div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;hoRenameManual('${m.id}','${jsAttr(m.name||'')}')">🏷 Rename</div>
        <div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;hoDuplicateManual('${siteId}','${m.id}')">⧉ Duplicate</div>
        <div class="statusmenu-item" style="color:var(--warn);" onclick="rowActionsMenuOpenFor=null;hoDeleteManual('${siteId}','${m.id}','${jsAttr(m.name||'')}')">🗑 Delete</div>`)}</div>
    </div>`).join('');
  document.getElementById('app').innerHTML = shell(`
    <p class="stub" style="margin:0 0 12px;">Operation &amp; Maintenance manuals for this job. Open one to edit it, or start a new one.</p>
    ${rows || `<div class="empty">No O&amp;M manuals yet.</div>`}
    <button type="button" class="darkbtn" style="width:100%;margin-top:6px;" onclick="hoNewManual('${siteId}')">+ New O&amp;M manual</button>
  `, {title:'Handover – O&M manuals', subtitle:site.name, siteNameSubtitle:true, back:'#/site/'+siteId+'/home', siteId});
}
window.hoNewManual = async function(siteId){
  const list = await dbSelect('handover_om_manuals', 'site_id=eq.'+siteId+'&select=id');
  const name = await customPrompt('Name for the new O&M manual', 'O&M Manual'+((list||[]).length ? ' '+((list||[]).length+1) : ''));
  if(name==null) return;
  const site = SITES.find(s=>s.id===siteId);
  toast('Building from the job…');
  const data = await hoBuildDefault(siteId); hoNormalize(data);
  const rows = await dbInsert('handover_om_manuals', {site_id:siteId, org_id:(site&&site.org_id)||ME.org_id, name:(name.trim()||'O&M Manual'), data, created_by:ME.id, updated_by:ME.id});
  if(rows && rows[0]){ hoTab = 'manual'; go('#/site/'+siteId+'/handover/'+rows[0].id); }
};
window.hoRenameManual = async function(id, cur){
  const name = await customPrompt('Rename this O&M manual', cur||'O&M Manual');
  if(name==null || !name.trim()) return;
  const r = await dbUpdate('handover_om_manuals', id, {name:name.trim()});
  if(r){ toast('Renamed'); render(); }
};
window.hoDuplicateManual = async function(siteId, id){
  const rows = await dbSelect('handover_om_manuals', 'id=eq.'+id);
  const m = rows && rows[0]; if(!m) return;
  const r = await dbInsert('handover_om_manuals', {site_id:siteId, org_id:m.org_id, name:(m.name||'O&M Manual')+' (copy)', data:m.data, created_by:ME.id, updated_by:ME.id});
  if(r){ toast('Copied'); render(); }
};
window.hoDeleteManual = async function(siteId, id, name){
  if(!(await customConfirm(`Delete "${name||'O&M Manual'}"? This can't be undone.`, {confirmLabel:'Yes — delete', danger:true}))) return;
  const ok = await dbDelete('handover_om_manuals', id);
  if(ok){ if(hoState && hoState.manualId===id) hoState = null; toast('Deleted'); render(); }
};

// ---------- images ----------
async function hoImage(bucket, path, maxDim, aspect){
  try{
    const bytes = await pdfFetchImageBytes(publicUrl(bucket, path));
    if(!bytes) return null;
    const url = URL.createObjectURL(new Blob([bytes]));
    const img = await new Promise((res, rej)=>{ const im = new Image(); im.onload = ()=>res(im); im.onerror = rej; im.src = url; });
    // optional centre-crop to a width:height ratio (the wide cover photo)
    let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
    if(aspect){ if(sw/sh > aspect){ const nw = sh*aspect; sx = (sw-nw)/2; sw = nw; } else { const nh = sw/aspect; sy = (sh-nh)/2; sh = nh; } }
    const sc = Math.min(1, (maxDim||1400)/Math.max(sw, sh));
    const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(sw*sc)); cv.height = Math.max(1, Math.round(sh*sc));
    cv.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url);
    const b64 = cv.toDataURL('image/jpeg', 0.82).split(',')[1];
    return {bytes: Uint8Array.from(atob(b64), ch=>ch.charCodeAt(0)), w:cv.width, h:cv.height};
  }catch(e){ return null; }
}
async function hoLogo(){
  if(!(ORG && ORG.logo_path)) return null;
  const im = await hoImage('org-logos', ORG.logo_path, 900);
  return im;
}

// ---------- PDF ----------
let hoMenu = null;
// ✉ Email: builds the PDF or Word file, saves it, and emails it (attached;
// a link instead if it's too big to attach).
window.hoEmail = async function(kind){
  if(!hoCheckRequired()) return;
  const site = SITES.find(s=>s.id===hoState.siteId);
  const to = await customPrompt('Email the O&M manual ('+(kind==='docx'?'Word':'PDF')+') to:', '');
  if(!to) return;
  const email = to.trim();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ toast('Enter a valid email address.'); return; }
  const send = async (blob, fname)=>{
    hoBusy = 'Sending the email…'; render();
    try{
      const path = hoState.siteId+'/om-exports/'+uid()+'-'+fname.replace(/[^a-z0-9.\-]+/gi,'_');
      const stored = await uploadToStorage('mc-documents', path, blob, blob.type);
      if(!stored){ hoBusy = ''; render(); toast('Could not upload the file — try again.'); return; }
      const res = await sbFetch('/functions/v1/send-document-email', {method:'POST', timeoutMs:120000, body: JSON.stringify({site_id: hoState.siteId, recipient_email: email, cc_email: email!==ME.email ? ME.email : undefined, doc_title: 'O&M Manual', file_url: publicUrl('mc-documents', stored), file_ext: kind==='docx' ? 'docx' : 'pdf'})});
      hoBusy = ''; render();
      const out = res ? await res.json().catch(()=>({})) : {};
      if(res && res.ok && !out.error) toast('O&M manual emailed to '+email+(email!==ME.email?' (you\'ve been copied in)':'')+(out.attached===false?' — sent as a link (too big to attach)':''));
      else toast('Could not send the email — '+String((out && out.error) || (res && res.status) || 'try again').slice(0,140));
    }catch(e){ hoBusy = ''; render(); toast('Could not send the email — check your connection.'); }
  };
  if(kind==='docx') await hoExportWord(send); else await hoExportPdf(send);
};
window.hoExportPdf = async function(onBuilt){
  if(!hoCheckRequired()) return;
  await hoSaveNow();
  if(!(await loadLib('PDFLib'))){ toast('PDF library failed to load — check connection.'); return; }
  hoBusy = 'Building the PDF…'; render();
  try{
    const bytes = await hoBuildPdf();
    const site = SITES.find(s=>s.id===hoState.siteId);
    hoBusy = ''; render();
    const fname = 'O&M Manual - '+((site&&site.name)||'Project').replace(/[\\/:*?"<>|]+/g,'-')+'.pdf';
    if(bytes && typeof onBuilt==='function') await onBuilt(new Blob([bytes], {type:'application/pdf'}), fname);
    else if(bytes) await deliverPdf(bytes, fname, {siteId:hoState.siteId});
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
  const ctr = (t, yy, size, font, color) => { const w = font.widthOfTextAtSize(safe(t), size); txt(t, M+(CW-w)/2, yy, size, font, color); };
  const NAVY = rgb(0.12,0.2,0.3), DARK = rgb(0.09,0.2,0.23);
  // page 1 — heading, wide photo, title block
  newPage();
  if(c.header) wrap(c.header, bold, 12, CW).forEach((l,i)=>ctr(l, H-M-12-i*15, 12, bold));
  y = H - M - 70;
  if(c.coverPhoto){ const im = await hoImage(c.coverPhoto.bucket, c.coverPhoto.path, 1800, 2); if(im){ const img = await pdf.embedJpg(im.bytes); const w = CW, h = w*im.h/im.w; page.drawImage(img, {x:M, y:y-h, width:w, height:h}); y -= h; } }
  y -= 80;
  wrap(c.title||'O&M MANUAL', reg, 26, CW).forEach(l=>{ txt(l, M, y, 26, reg); y -= 34; });
  wrap(c.project||'', reg, 26, CW).forEach(l=>{ txt(l, M, y, 26, reg); y -= 34; });
  y -= 2;
  hoAddrLines(c.address).forEach(a=>wrap(a, bold, 15, CW).forEach(l=>{ txt(l, M, y, 15, bold); y -= 25; }));
  if(c.volume){ wrap(c.volume, bold, 9, CW).forEach(l=>{ txt(l, M, y+2, 9, bold); y -= 13; }); }
  // page 2 — logo, CDM wording, contractor + revision details
  newPage();
  y = H - M - 60;
  const logo = await hoLogo();
  if(logo){ const img = await pdf.embedJpg(logo.bytes); let w = 210, h = w*logo.h/logo.w; if(h > 170){ h = 170; w = h*logo.w/logo.h; } page.drawImage(img, {x:M+(CW-w)/2, y:y-h, width:w, height:h}); y -= h; }
  y -= 70;
  String(c.subtitle||'').split('\n').forEach(par=>{ if(!par.trim()){ y -= 14; return; } wrap(par, reg, 15, CW).forEach(l=>{ ctr(l, y, 15, reg, NAVY); y -= 20; }); });
  {
    const rowsC = hoContractorRows(d);
    const L = CW*0.38, rh = 23, hb = 15;
    let ty = Math.min(y - 60, M + 60 + hb*2 + rh*(rowsC.length+1));
    const bar = (label) => { page.drawRectangle({x:M, y:ty-hb, width:CW, height:hb, color:DARK, borderColor:INK, borderWidth:0.6}); txt(label, M+5, ty-11, 8.5, reg, WHITE); ty -= hb; };
    const cellB = (x, w, h, t, f) => { page.drawRectangle({x, y:ty-h, width:w, height:h, borderColor:INK, borderWidth:0.6}); wrap(t||'', f||reg, 9, w-10).slice(0,2).forEach((l,li)=>txt(l, x+5, ty-h/2-3-li*10+(Math.min(2, wrap(t||'', f||reg, 9, w-10).length)-1)*5, 9, f||reg)); };
    bar('Contractor Details');
    rowsC.forEach(r=>{ cellB(M, L, rh, String(r[0]||'').trim().replace(/:?$/, ':')); cellB(M+L, CW-L, rh, r.slice(1).filter(Boolean).join('  ')); ty -= rh; });
    bar('Revision Details');
    const w2 = CW*0.29, w3 = CW*0.16, w4 = CW-L-w2-w3;
    cellB(M, L, rh, 'Revision Number:'); cellB(M+L, w2, rh, c.revision||''); cellB(M+L+w2, w3, rh, 'Date:'); cellB(M+L+w2+w3, w4, rh, hoFmtDate(c.date)); ty -= rh;
  }
  // sections
  newPage();
  const skipSec = hoContractorSec(d);
  for(const s of d.sections){
    if(s===skipSec) continue;
    ensure(40);
    const tl = wrap(s.title||'', bold, 13, CW-12);
    page.drawRectangle({x:M, y:y-18-(tl.length-1)*15, width:CW, height:18+(tl.length-1)*15+4, color:BRAND});
    tl.forEach((l,i)=>txt(l, M+6, y-14-i*15, 13, bold, WHITE)); y -= 26+(tl.length-1)*15;
    if(s.type==='text'){
      wrap(s.body||'', reg, 10, CW).forEach(l=>{ ensure(14); txt(l, M, y-10, 10); y -= 13.5; }); y -= 10;
    } else if(s.type==='maint'){
      (s.items||[]).forEach(it=>{
        if(it.title){ ensure(30); wrap(it.title, bold, 11, CW).forEach(l=>{ txt(l, M, y-11, 11, bold); y -= 15; }); y -= 2; }
        wrap(it.text||'', reg, 10, CW).forEach(l=>{ ensure(14); txt(l, M, y-10, 10); y -= 13.5; }); y -= 10;
      });
    } else if(s.type==='table' || s.type==='materials'){
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
  const att = await hoCollectAttachments();
  let nOwn = pdf.getPageCount();
  if(att.length){
    newPage(); txt('Appendices', M, y-20, 18, bold); y -= 44;
    att.forEach((a,i)=>{ wrap((i+1)+'.  '+a.name, reg, 10, CW).forEach(l=>{ ensure(14); txt(l, M, y, 10); y -= 14; }); });
    nOwn = pdf.getPageCount();
    const notAttached = [];
    for(let i=0;i<att.length;i++){
      const a = att[i]; hoBusy = `Attaching ${i+1} of ${att.length}…`; render();
      let placed = false;
      try{
        let src = null;
        if(a.gen){
          if(a.gen.kind==='sow-app'){
            const keep = scheduleFilter; scheduleFilter = 'all';
            let r = null; try{ r = await buildSchedulePdfBytes(hoState.siteId); } finally { scheduleFilter = keep; }
            if(r && r.outBytes) src = await PDFLib.PDFDocument.load(r.outBytes, {ignoreEncryption:true});
          } else if(a.gen.kind==='report'){
            const r = await buildReportPdf(a.gen.reportId);
            if(r && r.bytes) src = await PDFLib.PDFDocument.load(r.bytes, {ignoreEncryption:true});
          }
        } else if(/\.(jpe?g|png)$/i.test(a.path)){ const im = await hoImage(a.bucket, a.path, 1800); if(im){ newPage(); const img = await pdf.embedJpg(im.bytes); let w = CW, h = w*im.h/im.w; if(h > H-2*M){ h = H-2*M; w = h*im.w/im.h; } page.drawImage(img, {x:M, y:H-M-h, width:w, height:h}); placed = true; } }
        else { const res = await fetchWithTimeout(publicUrl(a.bucket, a.path), {}, 60000); if(res.ok) src = await PDFLib.PDFDocument.load(await res.arrayBuffer(), {ignoreEncryption:true}); }
        if(src){ (await pdf.copyPages(src, src.getPageIndices())).forEach(pg=>pdf.addPage(pg)); placed = true; }
      }catch(e){ console.warn('[ho attach]', a.name, e); }
      if(!placed) notAttached.push(a.name + (a.gen && a.gen.kind==='sow-app' ? ' (no tasks on this job yet)' : ''));
    }
    if(notAttached.length) setTimeout(()=>customAlert('These could not be added to the back of the manual: '+notAttached.join('; ')), 400);
  }
  // page numbers
  // Only the manual's own pages get its footer — attached documents keep
  // their own (stamping over them clashed with their footers).
  const pages = pdf.getPages().slice(0, nOwn); const nMain = pdf.getPageCount();
  pages.forEach((pg, i)=>{ if(i<2) return; pg.drawText(safe(`${c.project||''} — O&M Manual   ·   Page ${i+1} of ${nMain}`), {x:M, y:20, size:7.5, font:reg, color:SLATE}); });
  return await pdf.save();
}

// ---------- Word (.docx) ----------
function hoX(t){ return String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function hoRun(t, o){ o = o||{}; const pr = (o.b?'<w:b/>':'')+(o.color?`<w:color w:val="${o.color}"/>`:'')+(o.sz?`<w:sz w:val="${o.sz}"/>`:''); const lines = String(t==null?'':t).split('\n'); return lines.map((l,i)=>`<w:r>${pr?`<w:rPr>${pr}</w:rPr>`:''}${i?'<w:br/>':''}<w:t xml:space="preserve">${hoX(l)}</w:t></w:r>`).join(''); }
function hoPara(t, o){ o = o||{}; const pp = (o.style?`<w:pStyle w:val="${o.style}"/>`:'')+(o.jc?`<w:jc w:val="${o.jc}"/>`:''); return `<w:p>${pp?`<w:pPr>${pp}</w:pPr>`:''}${hoRun(t, o)}</w:p>`; }
window.hoExportWord = async function(onBuilt){
  if(!hoCheckRequired()) return;
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
    const brk = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
    // page 1
    if(c.header) body += hoPara(c.header, {b:true, jc:'center', sz:24});
    body += hoPara('');
    if(c.coverPhoto){ const im = await hoImage(c.coverPhoto.bucket, c.coverPhoto.path, 1800, 2); if(im) body += `<w:p>${imgXml(im, 17)}</w:p>`; }
    body += hoPara('') + hoPara('') + hoPara(c.title||'O&M MANUAL', {sz:52}) + hoPara(c.project||'', {sz:52});
    hoAddrLines(c.address).forEach(a=>{ body += hoPara(a, {b:true, sz:30}); });
    if(c.volume) body += hoPara(c.volume, {b:true, sz:18});
    body += brk;
    // page 2
    body += hoPara('') + hoPara('');
    const logo = await hoLogo(); if(logo) body += `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>${imgXml(logo, 7.5)}</w:p>`;
    body += hoPara('') + hoPara('');
    String(c.subtitle||'').split('\n').forEach(l=>{ body += hoPara(l, {jc:'center', sz:30, color:'1F3A5A'}); });
    body += hoPara('') + hoPara('');
    {
      const G = [3600, 2800, 1500, 1738];
      const bdr = `<w:tblBorders>${['top','left','bottom','right','insideH','insideV'].map(b=>`<w:${b} w:val="single" w:sz="4" w:color="000000"/>`).join('')}</w:tblBorders>`;
      const tc = (t, w, span, fill, white) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${span>1?`<w:gridSpan w:val="${span}"/>`:''}${fill?`<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>`:''}<w:vAlign w:val="center"/></w:tcPr><w:p>${hoRun(t, white?{color:'FFFFFF', sz:18}:{sz:20})}</w:p></w:tc>`;
      const bar = l => `<w:tr>${tc(l, 9638, 4, '17323A', true)}</w:tr>`;
      const row = cells => `<w:tr><w:trPr><w:trHeight w:val="440"/></w:trPr>${cells}</w:tr>`;
      body += `<w:tbl><w:tblPr><w:tblW w:w="9638" w:type="dxa"/>${bdr}</w:tblPr><w:tblGrid>${G.map(g=>`<w:gridCol w:w="${g}"/>`).join('')}</w:tblGrid>`
        + bar('Contractor Details')
        + hoContractorRows(d).map(r=>row(tc(String(r[0]||'').trim().replace(/:?$/, ':'), G[0], 1) + tc(r.slice(1).filter(Boolean).join('  '), G[1]+G[2]+G[3], 3))).join('')
        + bar('Revision Details')
        + row(tc('Revision Number:', G[0], 1) + tc(c.revision||'', G[1], 1) + tc('Date:', G[2], 1) + tc(hoFmtDate(c.date), G[3], 1))
        + `</w:tbl>`;
    }
    body += brk;
    const skipSec = hoContractorSec(d);
    for(const s of d.sections){
      if(s===skipSec) continue;
      body += hoPara(s.title||'', {style:'Heading1'});
      if(s.type==='text') String(s.body||'').split('\n').forEach(l=>{ body += hoPara(l); });
      if(s.type==='maint') (s.items||[]).forEach(it=>{ if(it.title) body += hoPara(it.title, {b:true}); String(it.text||'').split('\n').forEach(l=>{ body += hoPara(l); }); body += hoPara(''); });
      if(s.type==='table' || s.type==='materials'){
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
    const names = (await hoCollectAttachments()).map(a=>a.name);
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
    if(typeof onBuilt==='function') await onBuilt(blob, fname); else await hoDeliverBlob(blob, fname);
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
