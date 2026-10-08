/* ================= REPORTS — WORKING WITH NO SIGNAL ================= */
// Inspections, surveys and daily briefings can be filled in, saved and
// completed with no signal. What that means in practice:
//   - While a report is open, a copy (answers AND photos) is kept on the
//     phone, refreshed every few seconds, so closing the app or losing
//     signal never loses it.
//   - "Save & Exit" or "Complete" with no signal (or when sending fails)
//     parks the report on the phone as "waiting to send" and lets the
//     person carry on.
//   - A new report can be started with no signal, as long as the templates
//     were seen on this phone before.
//   - As soon as there is signal, everything waiting is sent on its own:
//     photos first, then the answers, then the completion.
// The copy lives in the browser's own database (IndexedDB), under this
// person's id only, and is removed once the server has it.
const REPORT_OFFLINE_DB = 'ophub-offline';
const REPORT_OFFLINE_STORE = 'reportDrafts';
const SOW_OFFLINE_STORE = 'sowQueue';        // Schedule of Works photos (and the task change that goes with them)
let sowOfflinePending = 0;
let reportOfflinePending = 0;          // how many are waiting to send (shown in the header strip)
let reportOfflineSyncing = false;
function reportOfflineDb(){
  return new Promise((resolve, reject)=>{
    if(typeof indexedDB === 'undefined'){ reject(new Error('no indexedDB')); return; }
    const r = indexedDB.open(REPORT_OFFLINE_DB, 2);
    r.onupgradeneeded = ()=>{
      if(!r.result.objectStoreNames.contains(REPORT_OFFLINE_STORE)) r.result.createObjectStore(REPORT_OFFLINE_STORE, {keyPath:'submissionId'});
      if(!r.result.objectStoreNames.contains(SOW_OFFLINE_STORE)) r.result.createObjectStore(SOW_OFFLINE_STORE, {keyPath:'id'});
    };
    r.onsuccess = ()=>resolve(r.result);
    r.onerror = ()=>reject(r.error);
  });
}
async function reportOfflineTx(mode, fn, store){
  const db = await reportOfflineDb();
  try{
    return await new Promise((resolve, reject)=>{
      const tx = db.transaction(store || REPORT_OFFLINE_STORE, mode);
      const req = fn(tx.objectStore(store || REPORT_OFFLINE_STORE));
      tx.oncomplete = ()=>resolve(req ? req.result : undefined);
      tx.onerror = ()=>reject(tx.error); tx.onabort = ()=>reject(tx.error);
    });
  }finally{ try{ db.close(); }catch(e){} }
}
async function reportOfflineGet(id){
  try{ const r = await reportOfflineTx('readonly', s=>s.get(id)); return (r && ME && r.userId === ME.id) ? r : null; }catch(e){ return null; }
}
async function reportOfflineAll(){
  try{ const all = await reportOfflineTx('readonly', s=>s.getAll()); return (all||[]).filter(r=>ME && r.userId === ME.id); }catch(e){ return []; }
}
async function reportOfflineDel(id){ try{ await reportOfflineTx('readwrite', s=>s.delete(id)); }catch(e){} reportOfflineCount(); }
async function reportOfflinePut(rec){
  try{ await reportOfflineTx('readwrite', s=>s.put(rec)); reportOfflineCount(); return true; }
  catch(e){ console.warn('could not keep an offline copy', e && e.message); return false; }
}
async function reportOfflineCount(){
  const n = (await reportOfflineAll()).filter(r=>r.pending).length;
  const p = (await sowOfflineAll()).filter(r=>r.kind==='photo').length + (typeof SOW_PENDING!=='undefined' ? Object.values(SOW_PENDING).reduce((a,l)=>a+l.filter(x=>x.state==='prep').length,0) : 0);
  if(n !== reportOfflinePending || p !== sowOfflinePending){ reportOfflinePending = n; sowOfflinePending = p; reportOfflinePaintStrip(); }
  return n + p;
}
// A thin strip under the header on every screen while anything is waiting.
function reportOfflinePaintStrip(){
  let el = document.getElementById('reportOfflineStrip');
  if(!reportOfflinePending && !sowOfflinePending){ if(el) el.remove(); return; }
  const what = [reportOfflinePending ? reportOfflinePending+' report'+(reportOfflinePending===1?'':'s') : '', sowOfflinePending ? sowOfflinePending+' photo'+(sowOfflinePending===1?'':'s') : ''].filter(Boolean).join(' and ');
  const photosOnly = !reportOfflinePending;
  const busy = reportOfflineSyncing || (typeof sowPumpP!=='undefined' && sowPumpP);
  if(!el){
    el = document.createElement('div'); el.id = 'reportOfflineStrip';
    el.style.cssText = 'position:fixed;left:0;right:0;bottom:calc(env(safe-area-inset-bottom, 0px) + 74px);z-index:400;display:flex;justify-content:center;pointer-events:none;';
    document.body.appendChild(el);
  }
  el.innerHTML = `<span onclick="reportOfflineSync(true)" style="pointer-events:auto;cursor:pointer;background:var(--warn-bg);color:var(--warn);border:1.5px solid var(--warn);border-radius:999px;padding:6px 14px;font-size:12px;font-weight:800;box-shadow:0 2px 8px rgba(0,0,0,.15);">📤 ${photosOnly && busy && navigator.onLine!==false ? what+' uploading…' : what+' waiting to send'+(busy ? ' — sending…' : (navigator.onLine===false ? ' — no signal' : ' — tap to send'))}</span>`;
}
// The record kept for the report currently open.
function reportOfflineRecord(draft, extra){
  return Object.assign({submissionId: draft.submissionId, userId: ME.id, orgId: ME.org_id, siteId: draft.siteId, draft: JSON.parse(JSON.stringify(draft)), pending: null, updatedAt: Date.now()}, extra||{});
}
// Cheap "has anything changed" fingerprint, so the copy is only rewritten
// when it needs to be (photos make the full text megabytes long).
function reportDraftSignature(d){
  if(!d) return '';
  let n = 0, k = 0;
  const a = d.answers || {};
  for(const key in a){
    k++; const v = a[key];
    if(typeof v === 'string') n += v.length;
    else if(Array.isArray(v)){ n += v.length*7; v.forEach(x=>{ n += (typeof x === 'string') ? x.length : JSON.stringify(x||'').length; }); }
    else n += JSON.stringify(v===undefined?null:v).length;
  }
  return d.submissionId+':'+k+':'+n;
}
let reportOfflineLastSig = '';
setInterval(async ()=>{
  try{
    if(!ME || !reportFillDraft || reportSubmitBusy || reportSaveBusy) return;
    const sig = reportDraftSignature(reportFillDraft);
    if(sig === reportOfflineLastSig) return;
    const existing = await reportOfflineGet(reportFillDraft.submissionId);
    await reportOfflinePut(reportOfflineRecord(reportFillDraft, {pending: existing ? existing.pending : null, create: existing ? existing.create : undefined, completedAt: existing ? existing.completedAt : undefined}));
    reportOfflineLastSig = sig;
  }catch(e){}
}, 4000);
// Called once the server definitely has everything for this report.
async function reportOfflineClear(id){ reportOfflineLastSig = ''; await reportOfflineDel(id); }
// Park the open report on the phone to be sent later, and leave the screen.
async function reportOfflineQueue(kind){
  const d = reportFillDraft; if(!d) return false;
  const existing = await reportOfflineGet(d.submissionId);
  const ok = await reportOfflinePut(reportOfflineRecord(d, {pending: kind, create: existing ? existing.create : undefined, completedAt: kind==='complete' ? new Date().toISOString() : undefined}));
  if(!ok) return false;
  const listPath = reportListPath(d.siteId, d.fromBriefing);
  reportFillDraft = null; reportOfflineLastSig = '';
  customAlert(kind==='complete'
    ? 'Completed and kept on this phone. It will send itself as soon as you have signal — you can carry on.'
    : 'Saved on this phone. It will send itself as soon as you have signal — you can carry on.');
  go(listPath);
  setTimeout(()=>reportOfflineSync(false), 1500);
  return true;
}
// Starting a report with no signal: built from the templates this phone
// has already seen, given its own id now, and created on the server later.
async function reportOfflineStart(siteId, t, answers, generalLabel){
  const general = isGeneralReports(siteId);
  const id = (crypto.randomUUID ? crypto.randomUUID() : null);
  if(!id) return false;
  const create = {id, template_id: t.id, org_id: ME.org_id, site_id: general ? null : siteId, template_name: t.name, sections: t.sections, answers: {}, submitted_by: ME.id, status:'in_progress'};
  if(general) create.general_label = generalLabel;
  const draft = {submissionId:id, siteId, template_name:t.name, sections:t.sections, answers, fromBriefing:false, editingCompleted:false, plantItemId:null, generalLabel: generalLabel||null};
  const ok = await reportOfflinePut(reportOfflineRecord(draft, {pending:'save', create}));
  if(!ok) return false;
  reportFillDraft = null; reportPickerOpen = false;
  toast('Started on this phone — it will send when you have signal');
  go(`${reportListPath(siteId)}/fill/${id}`);
  return true;
}
async function reportOfflineUpload(path, dataUrl){
  // Quiet version of the normal upload: no pop-ups from a background send.
  const blob = await (await fetch(dataUrl)).blob();
  try{ await ensureFreshToken(); }catch(e){}
  if(!SESSION || !SESSION.access_token) return null;
  for(let tryNo=0; tryNo<3; tryNo++){
    try{
      const res = await fetchWithTimeout(SUPABASE_URL+'/storage/v1/object/site-photos/'+path, {method:'POST', headers:{'apikey':SUPABASE_ANON_KEY, 'Authorization':'Bearer '+SESSION.access_token, 'Content-Type': blob.type || 'image/jpeg', 'x-upsert':'true'}, body: blob}, 120000);
      if(res.ok) return path;
      if(![408,429,500,502,503,504,520,522,524,544].includes(res.status)) return null;
    }catch(e){ if(navigator.onLine === false) return null; }
    await new Promise(r=>setTimeout(r, 2000*(tryNo+1)));
  }
  return null;
}
// Sends everything that is waiting. Safe to call at any time.
window.reportOfflineSync = async function(manual){
  if(reportOfflineSyncing || !ME || !SESSION) return;
  if(navigator.onLine === false){ if(manual) toast('Still no signal — it will send on its own when you have some.'); return; }
  const waiting = (await reportOfflineAll()).filter(r=>r.pending);
  const sowWaiting = await sowOfflineAll();
  if(!waiting.length && !sowWaiting.length){ reportOfflineCount(); return; }
  reportOfflineSyncing = true; reportOfflinePaintStrip();
  let sent = 0;
  for(const rec of waiting){
    try{
      // The report someone has open right now is left alone until they leave it.
      if(reportFillDraft && reportFillDraft.submissionId === rec.submissionId) continue;
      const d = rec.draft;
      // 1. create it, if it was started with no signal
      if(rec.create){
        const res = await sbFetch('/rest/v1/report_submissions', {method:'POST', timeoutMs:60000, headers:{'Prefer':'return=minimal'}, body: JSON.stringify(rec.create)});
        if(!res.ok && res.status !== 409) throw new Error('create failed '+res.status);
        delete rec.create; await reportOfflinePut(rec);
      }
      // 2. photos, one at a time, each kept as soon as it lands
      let photoFailed = false;
      const folder = (isGeneralReports(d.siteId) ? 'general' : d.siteId)+'/reports/';
      for(const key of Object.keys(d.answers||{})){
        const arr = d.answers[key];
        if(!Array.isArray(arr)) continue;
        for(let i=0; i<arr.length; i++){
          if(typeof arr[i] !== 'string' || !arr[i].startsWith('data:')) continue;
          let path = null;
          try{ path = await reportOfflineUpload(folder+crypto.randomUUID()+'.jpg', arr[i]); }catch(e){ path = null; }
          if(path){ arr[i] = publicUrl('site-photos', path); await reportOfflinePut(rec); }
          else photoFailed = true;
        }
      }
      if(photoFailed) continue; // try again next time; what uploaded is kept
      // 3. the answers (and the completion, if it was completed)
      const answers = Object.assign({}, d.answers);
      let payload = {answers};
      if(rec.pending === 'complete'){
        (d.sections||[]).forEach(s=>(s.items||[]).forEach(it=>{ if(it.type==='signature' && ME.signature_path && (!d.editingCompleted || !answers[it.id])) answers[it.id] = ME.signature_path; }));
        payload = d.editingCompleted
          ? {answers: Object.assign({}, answers, {_editHistory: (Array.isArray(answers._editHistory) ? answers._editHistory : []).concat([{by: ME.id, byName: ME.name, at: rec.completedAt || new Date().toISOString()}])}), status:'completed'}
          : {answers, status:'completed', submitted_at: rec.completedAt || new Date().toISOString()};
      }
      const res = await sbFetch('/rest/v1/report_submissions?id=eq.'+rec.submissionId, {method:'PATCH', timeoutMs:60000, headers:{'Prefer':'return=representation'}, body: JSON.stringify(payload)});
      if(!res.ok) throw new Error('save failed '+res.status);
      const back = await res.json().catch(()=>[]);
      if(Array.isArray(back) && !back.length) throw new Error('save matched nothing');
      if(rec.pending === 'complete' && d.plantItemId){
        try{
          const p = (await dbSelectNet('plant_items', 'id=eq.'+d.plantItemId+'&limit=1'))[0];
          if(p){ const nextDue = new Date(); nextDue.setMonth(nextDue.getMonth() + (p.inspection_interval_months||12)); await dbUpdate('plant_items', p.id, {last_inspection_date: todayISODate(), next_inspection_due: localISODate(nextDue)}); }
        }catch(e){}
      }
      await reportOfflineDel(rec.submissionId);
      sent++;
    }catch(e){ console.warn('offline report not sent yet', rec.submissionId, e && e.message); }
  }
  let photosSent = 0;
  try{ photosSent = await sowOfflineSend(sowWaiting); }catch(e){ console.warn('offline photos not sent yet', e && e.message); }
  reportOfflineSyncing = false;
  const stillWaiting = (await reportOfflineAll()).filter(r=>r.pending).length; // photos back off on their own (481)
  if(stillWaiting && !sent && !photosSent){ offlineSyncFails++; offlineSyncNextAt = Date.now() + Math.min(15, Math.pow(2, offlineSyncFails-1))*60000; }
  else { offlineSyncFails = 0; offlineSyncNextAt = 0; }
  await reportOfflineCount(); reportOfflinePaintStrip();
  if(sent){
    toast('✓ '+sent+' report'+(sent===1?'':'s')+' sent');
    try{ uiReadCacheClear(); }catch(e){}
    if(/reports|briefings|inspections|schedule/.test(location.hash)) render();
  }
  else if(manual) toast('Could not send yet — it will keep trying.');
};
window.addEventListener('online', ()=>{ setTimeout(()=>reportOfflineSync(false), 2000); });
// Tries again every minute — but backs off (up to 15 minutes) while sends keep
// failing, so a stuck item can't keep the phone busy uploading all day.
let offlineSyncFails = 0, offlineSyncNextAt = 0;
setInterval(()=>{ if(ME && SESSION && reportOfflinePending && navigator.onLine !== false && Date.now() >= offlineSyncNextAt) reportOfflineSync(false);
  else if(ME && SESSION && sowOfflinePending && !sowPumpP && !sowPumpTimer && navigator.onLine !== false) sowPump(); }, 60000);
setTimeout(function first(){ if(ME && SESSION){ reportOfflineCount().then(n=>{ if(n) reportOfflineSync(false); }); } else setTimeout(first, 3000); }, 4000);

/* ---------- Schedule of Works photos with no signal ----------
   A photo taken on a task with no signal (or whose upload fails) is kept on
   the phone, already shrunk to its three sizes, together with the change
   to the task that went with it (moved to In Progress / marked Complete).
   When signal returns the photos go up first, then the task is updated —
   so a task is never shown as Complete on the server without its photos. */
async function sowOfflineAll(){
  try{ const all = await reportOfflineTx('readonly', st=>st.getAll(), SOW_OFFLINE_STORE); return (all||[]).filter(r=>ME && r.userId === ME.id).sort((a,b)=>a.at-b.at); }catch(e){ return []; }
}
async function sowOfflinePut(rec){
  try{ await reportOfflineTx('readwrite', st=>st.put(rec), SOW_OFFLINE_STORE); reportOfflineCount(); return true; }catch(e){ console.warn('could not keep photo offline', e && e.message); return false; }
}
async function sowOfflineDel(id){ try{ await reportOfflineTx('readwrite', st=>st.delete(id), SOW_OFFLINE_STORE); }catch(e){} }
async function sowOfflineKeepPhoto(siteId, taskId, stage, full, mid, thumb, id){
  return sowOfflinePut({id: id || crypto.randomUUID(), kind:'photo', userId: ME.id, siteId, taskId, stage, full, mid: mid||null, thumb: thumb||null, at: Date.now()});
}
// The task change that belongs with photos kept above. One per task; a later one replaces an earlier one.
async function sowOfflineKeepTaskPatch(siteId, taskId, patch){
  return sowOfflinePut({id: 'patch:'+taskId, kind:'patch', userId: ME.id, siteId, taskId, patch, at: Date.now()});
}
// Photos (and their task changes) are sent by the background sender in 481.
async function sowOfflineSend(recs){
  return sowPump();
}
