/* ============================================================
   OpHUB Finance — applications save themselves (23 Oct 2026, Andy: "does it save after I
   update an applied amount, in case signal goes?").
   A draft application saves itself a moment after each change. A copy is also kept on the
   device, so if the signal drops it keeps trying, and if the page is closed before it gets
   through, the changes come back next time the application is opened and are saved then.
   ============================================================ */
let finAsTimer = null, finAsLast = {}, finAsBusy = false;
const FIN_AS_KEY = 'ophub_finapp_autosave_';
function finAsOn(){ return !!(finApp && finApp.id && finAppCtx && !finAppCtx.locked && document.getElementById('finAppLines')); }
function finAsSnap(){ const r = finAppRowForSave(); delete r.updated_at; return JSON.stringify(r); }
function finAsShow(state){
  const el = document.getElementById('finAutoSave'); if(!el) return;
  const map = {saving:['Saving…','s'], saved:['✓ Saved','ok'], offline:['No signal — saved on this device, will send when back','off'], '':['','']};
  const m = map[state] || map['']; el.textContent = m[0]; el.className = 'finautosave '+m[1];
}
function finAsLocal(id, snap){ try{ if(snap) localStorage.setItem(FIN_AS_KEY+id, JSON.stringify({t:Date.now(), row:JSON.parse(snap)})); else localStorage.removeItem(FIN_AS_KEY+id); }catch(e){} }
function finAsLocalGet(id){ try{ return JSON.parse(localStorage.getItem(FIN_AS_KEY+id)||'null'); }catch(e){ return null; } }
window.finAsQueue = function(){
  if(!finAsOn()) return;
  clearTimeout(finAsTimer); finAsTimer = setTimeout(finAsSave, 1200);
};
async function finAsSave(){
  if(!finAsOn()) return;
  if(finAsBusy){ finAsQueue(); return; }
  const id = finApp.id; let snap;
  try{ snap = finAsSnap(); }catch(e){ return; }
  if(finAsLast[id]===snap) return;
  finAsLocal(id, snap); finAsBusy = true; finAsShow('saving');
  let ok = false;
  try{
    const row = Object.assign(JSON.parse(snap), {updated_at:new Date().toISOString()});
    const res = await sbFetch('/rest/v1/fin_applications?id=eq.'+id, {method:'PATCH', headers:{'Prefer':'return=representation'}, body:JSON.stringify(row)});
    ok = !!(res && res.ok);
    // Remember what the server now holds, so the next redraw keeps the in-memory copy (bug FB-02).
    if(ok){ try{ const d = await res.json(); const u = (Array.isArray(d) ? d[0] : d || {}).updated_at; if(u && finApp && finApp.id===id) finApp.__loaded = u; }catch(e){} }
  }catch(e){ ok = false; }
  finAsBusy = false;
  if(ok){ finAsLast[id] = snap; finAsLocal(id, null); finAsShow('saved'); try{ if(finAsOn() && finApp.id===id && finAsSnap()!==snap) finAsQueue(); }catch(e){} }
  else { finAsShow('offline'); clearTimeout(finAsTimer); finAsTimer = setTimeout(finAsSave, 15000); }
}
window.addEventListener('online', ()=>{ if(finAsOn()) finAsSave(); });
['input','change'].forEach(ev=>document.addEventListener(ev, e=>{ if(e.target && e.target.closest && e.target.closest('#app')) finAsQueue(); }, true));
document.addEventListener('click', e=>{ if(e.target && e.target.closest && e.target.closest('#app button, #app .linkbtn')) setTimeout(finAsQueue, 50); }, true);
(function(){
  const base = renderFinApplication;
  renderFinApplication = async function(siteId, appId){
    const r = await base.apply(this, arguments);
    if(!finApp || !finAppCtx) return r;
    const tools = document.getElementById('finAppTools');
    if(tools && !document.getElementById('finAutoSave')) tools.insertAdjacentHTML('beforebegin', '<span id="finAutoSave" class="finautosave"></span>');
    if(finAppCtx.locked){ finAsLocal(finApp.id, null); return r; }
    // Changes kept on this device that never reached the server — put them back and send them.
    const b = finAsLocalGet(finApp.id);
    const srv = Date.parse(finApp.updated_at||'') || 0;
    if(b && b.row && b.t > srv){
      ['valuation_date','due_date','final_date','lines','variations','dayworks','discount_pct','retention_pct'].forEach(k=>{ if(k in b.row) finApp[k] = b.row[k]; });
      if(typeof finAppPaintLines==='function') finAppPaintLines();
      if(typeof finAppPaint==='function') finAppPaint();
      toast('Unsent changes from this device put back — saving them now');
      finAsSave();
    } else {
      if(b) finAsLocal(finApp.id, null);
      try{ finAsLast[finApp.id] = finAsSnap(); }catch(e){}
    }
    return r;
  };
  const st = document.createElement('style');
  st.textContent = `.finautosave{font-size:12px;font-weight:700;color:var(--slate);margin-left:auto;margin-right:6px;}
.finautosave.ok{color:#1E6B45;} .finautosave.off{color:var(--warn,#B7791F);}
.finappbtns{padding:0 14px;box-sizing:border-box;}
html.desk.finmode .finappbtns{padding:0 24px;}`;
  document.head.appendChild(st);
})();
// Changes made by buttons that redraw the page (e.g. "Use site progress") are saved too.
(function(){
  ['finAppUseSiteProgress','finSpUseLine'].forEach(n=>{
    const f = window[n]; if(typeof f!=='function') return;
    window[n] = async function(){ const r = await f.apply(this, arguments); if(typeof finAsQueue==='function') finAsQueue(); return r; };
  });
})();
