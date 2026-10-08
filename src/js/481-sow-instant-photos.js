/* ================= Schedule of Works: instant photos =================
 * Picking photos on a task no longer waits for the upload. Each photo shows
 * on the task straight away (with a small "sending" mark), is shrunk and
 * kept safely on the phone, and goes up in the background, two at a time,
 * while the operative carries on. If signal drops it simply waits and
 * carries on later (same phone store as the no-signal queue, see 435).
 * The task change that goes with the photos (In Progress / Complete) shows
 * on the phone at once and is saved to the server once its photos are up,
 * so a task is never Complete on the server without its photos. */
const SOW_PENDING = {};            // taskId -> [{id, src, state:'prep'|'queued'|'sending'|'done'|'wait'}]
let sowPrepChain = Promise.resolve();
let sowPumpP = null, sowPumpAgain = false, sowPumpFails = 0, sowPumpTimer = null, sowPumpSentRun = 0;
const sowTaskNameCache = {};

function sowPendingFind(id){
  for(const k in SOW_PENDING){ const p = SOW_PENDING[k].find(x=>x.id===id); if(p) return p; }
  return null;
}
function sowPendingTileHtml(p){
  const mark = p.state==='done' ? '' : `<div class="sowpendmark ${p.state==='wait'?'wait':''}">${p.state==='wait' ? '⟳' : '<span class="sowspin"></span>'}</div>`;
  return `<div class="taskphotowrap sowpend" data-pid="${p.id}"><img src="${p.src}" width="40" height="40" alt="">${mark}</div>`;
}
// Repaints just the pending tiles of one task (no full page reload).
function sowPaintPending(taskId){
  const box = document.getElementById('sowPh-'+taskId);
  if(!box) return;
  box.querySelectorAll('.sowpend').forEach(e=>e.remove());
  const list = SOW_PENDING[taskId] || [];
  box.insertAdjacentHTML('beforeend', list.map(sowPendingTileHtml).join(''));
  box.style.display = box.children.length ? '' : 'none';
}
function sowSetState(id, state){
  const p = sowPendingFind(id); if(!p) return;
  p.state = state;
  const el = document.querySelector('.sowpend[data-pid="'+id+'"]');
  if(el) el.outerHTML = sowPendingTileHtml(p);
}
// Called by renderSchedule: brings back anything still on the phone (after a
// reload) and lays queued task changes over the server copy of the tasks.
async function sowPendingForRender(siteId, allTasks, photos){
  const recs = await sowOfflineAll();
  if(allTasks) recs.filter(r=>r.kind==='patch' && r.siteId===siteId).forEach(r=>{
    const t = allTasks.find(x=>x.id===r.taskId); if(t) Object.assign(t, r.patch);
  });
  if(!photos) return;
  const onServer = new Set((photos||[]).map(p=>p.id));
  recs.filter(r=>r.kind==='photo' && r.siteId===siteId).forEach(r=>{
    if(sowPendingFind(r.id)) return;
    (SOW_PENDING[r.taskId] = SOW_PENDING[r.taskId] || []).push({id:r.id, src:r.thumb || r.mid || r.full, state: navigator.onLine===false ? 'wait' : 'queued'});
  });
  // Photos that have landed and now come back from the server drop out.
  for(const k in SOW_PENDING){ SOW_PENDING[k] = SOW_PENDING[k].filter(p=>!(p.state==='done' && onServer.has(p.id))); if(!SOW_PENDING[k].length) delete SOW_PENDING[k]; }
  if(recs.some(r=>r.kind==='photo') && !sowPumpP) setTimeout(()=>sowPump(), 300);
}
// Adds the picked files to a task. Returns at once; shrinking and sending
// happen in the background.
function sowAddPhotos(siteId, taskId, files, stage){
  const list = SOW_PENDING[taskId] = SOW_PENDING[taskId] || [];
  const items = files.map(f=>{
    const p = {id: crypto.randomUUID(), src: URL.createObjectURL(f), state:'prep', obj:true};
    list.push(p); return {p, f};
  });
  sowPaintPending(taskId);
  try{ reportOfflineCount(); }catch(e){}
  items.forEach(({p, f})=>{
    sowPrepChain = sowPrepChain.then(async ()=>{
      try{
        // Quiet: no "Uploading… please wait" pill — nobody is waiting.
        uploadBusy.quietNext = true;
        let fullP; try{ fullP = compressImage(f, SOW_PHOTO_FULL); } finally { uploadBusy.quietNext = false; }
        const full = await fullP;
        let mid = null, thumb = null;
        try{ mid = await shrinkDataUrl(full, SOW_PHOTO_MID.max, SOW_PHOTO_MID.quality); thumb = await shrinkDataUrl(mid, SOW_PHOTO_THUMB.max, SOW_PHOTO_THUMB.quality); }catch(e){}
        const kept = await sowOfflineKeepPhoto(siteId, taskId, stage, full, mid, thumb, p.id);
        if(!kept) throw new Error('not kept');
        if(p.obj){ try{ URL.revokeObjectURL(p.src); }catch(e){} }
        p.src = thumb || mid || full; p.obj = false;
        sowSetState(p.id, navigator.onLine===false ? 'wait' : 'queued');
        sowPump();
      }catch(e){
        SOW_PENDING[taskId] = (SOW_PENDING[taskId]||[]).filter(x=>x!==p);
        sowPaintPending(taskId);
        toast('One photo could not be read — please try that one again.');
      }
    });
  });
}
// Background sender. Safe to call any time; only one runs at once.
function sowPump(){
  if(sowPumpP){ sowPumpAgain = true; return sowPumpP; }
  clearTimeout(sowPumpTimer); sowPumpTimer = null;
  sowPumpP = sowPumpRun().catch(e=>{ console.warn('photo send', e && e.message); return 0; }).finally(()=>{
    sowPumpP = null;
    try{ reportOfflineCount(); reportOfflinePaintStrip(); }catch(e){}
    if(sowPumpAgain){ sowPumpAgain = false; setTimeout(()=>sowPump(), 50); }
  });
  try{ reportOfflinePaintStrip(); }catch(e){}
  return sowPumpP;
}
async function sowTaskName(taskId){
  if(sowTaskNameCache[taskId]) return sowTaskNameCache[taskId];
  try{ const r = await dbSelectNet('schedule_tasks', 'id=eq.'+taskId+'&select=name&limit=1'); sowTaskNameCache[taskId] = ((r && r[0] && r[0].name) || 'Photo').replace(/[^a-z0-9 ]+/gi,'').trim() || 'Photo'; }
  catch(e){ return 'Photo'; }
  return sowTaskNameCache[taskId];
}
async function sowSendOne(r){
  sowSetState(r.id, 'sending');
  const base = r.siteId+'/schedule/'+r.taskId+'/'+r.id;
  const stored = await reportOfflineUpload(base+'.jpg', r.full);
  if(!stored) return false;
  let m = null, t = null;
  try{ if(r.thumb) t = await reportOfflineUpload(base+'_t.jpg', r.thumb); }catch(e){}
  try{ if(r.mid) m = await reportOfflineUpload(base+'_m.jpg', r.mid); }catch(e){}
  // The photo's id is fixed when it is taken, so a repeat send can never make a duplicate.
  const res = await sbFetch('/rest/v1/schedule_photos', {method:'POST', timeoutMs:60000, headers:{'Prefer':'return=minimal'}, body: JSON.stringify({id:r.id, task_id:r.taskId, storage_path:stored, mid_path:m, thumb_path:t, uploaded_by:ME.id, stage:r.stage})});
  if(!res.ok && res.status !== 409) return false;
  await sowOfflineDel(r.id);
  sowSetState(r.id, 'done');
  try{ const nm = await sowTaskName(r.taskId); queueOneDrivePhoto(r.full, nm+' '+new Date(r.at).toISOString().slice(0,16).replace(/[:T]/g,'-')+' '+r.id.slice(0,4)+'.jpg', r.siteId); }catch(e){}
  return true;
}
async function sowPumpRun(){
  if(!ME || !SESSION) return 0;
  let sent = 0;
  const failed = new Set();
  while(true){
    if(navigator.onLine === false) break;
    const todo = (await sowOfflineAll()).filter(r=>r.kind==='photo' && !failed.has(r.id));
    if(!todo.length) break;
    await runPool(todo, 2, async r=>{
      let ok = false;
      try{ ok = await sowSendOne(r); }catch(e){ ok = false; }
      if(ok) sent++; else { failed.add(r.id); sowSetState(r.id, 'wait'); }
    });
  }
  // Task changes go once none of that task's photos are still waiting.
  const left = await sowOfflineAll();
  const waitingTasks = new Set(left.filter(r=>r.kind==='photo').map(r=>r.taskId));
  let patched = false;
  for(const p of left.filter(r=>r.kind==='patch')){
    if(waitingTasks.has(p.taskId) || navigator.onLine === false) continue;
    try{
      const res = await sbFetch('/rest/v1/schedule_tasks?id=eq.'+p.taskId, {method:'PATCH', timeoutMs:60000, headers:{'Prefer':'return=representation'}, body: JSON.stringify(p.patch)});
      if(res.ok){
        await sowOfflineDel(p.id); patched = true;
        if(p.patch && p.patch.status==='done'){
          const back = await res.json().catch(()=>[]);
          const row = Array.isArray(back) ? back[0] : null;
          if(row && row.section_id){ try{ await maybeAutoCloseVariationForSection(p.siteId, row.section_id); }catch(e){} }
        }
      }
    }catch(e){}
  }
  if(patched){ try{ uiReadCacheClear(); }catch(e){} }
  const stillPhotos = left.filter(r=>r.kind==='photo').length;
  sowPumpSentRun += sent;
  if(stillPhotos){
    // Something didn't get through: try again shortly, backing off to 5 minutes.
    if(!sent) sowPumpFails++; else sowPumpFails = 0;
    const wait = Math.min(300000, 10000 * Math.pow(2, Math.max(0, sowPumpFails-1)));
    clearTimeout(sowPumpTimer); sowPumpTimer = setTimeout(()=>sowPump(), wait);
  } else {
    sowPumpFails = 0;
    if(sowPumpSentRun){ toast('✓ '+sowPumpSentRun+' photo'+(sowPumpSentRun===1?'':'s')+' uploaded'); sowPumpSentRun = 0; }
  }
  return sent;
}
window.addEventListener('online', ()=>{ for(const k in SOW_PENDING) SOW_PENDING[k].forEach(p=>{ if(p.state==='wait') sowSetState(p.id, 'queued'); }); setTimeout(()=>sowPump(), 1000); });
window.addEventListener('offline', ()=>{ for(const k in SOW_PENDING) SOW_PENDING[k].forEach(p=>{ if(p.state==='queued'||p.state==='sending') sowSetState(p.id, 'wait'); }); });
