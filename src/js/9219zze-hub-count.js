/* ============================================================
   HUB count matches the HUB (3 Nov 2026, Andy: "the hub is still showing 7 when there is only 1 item in there").
   The number on the Hub button was only worked out on the Home / Projects pages, at most every 20 seconds,
   and then kept (even across a reload). Clear things in the HUB, or open it from anywhere else, and the old
   number stayed on the side menu. Now:
   - opening the HUB sets the number from the same list the page shows;
   - moving between pages re-checks it in the background (at most every 20 seconds) and updates the menu
     badge in place, wherever you are;
   - if the HUB's own filters (type, site, due date) are hiding some items, the page says so, with a
     one-tap "Show all".
   ============================================================ */
(function(){
  if(typeof computeHubItems!=='function') return;
  function paintHubBadge(n){
    try{
      document.querySelectorAll('.desknav-i').forEach(b=>{
        const oc = b.getAttribute('onclick')||'';
        if(oc.indexOf("'#/hub'")<0 && oc.indexOf("'#/outstanding'")<0) return;
        let el = b.querySelector('.desknav-badge');
        if(!n){ if(el) el.remove(); return; }
        if(!el){ el = document.createElement('b'); el.className = 'desknav-badge'; b.appendChild(el); }
        el.textContent = n;
      });
      document.querySelectorAll('.tabbar .tb').forEach(b=>{
        const oc = b.getAttribute('onclick')||'';
        if(oc.indexOf("'#/hub'")<0 && oc.indexOf("'#/outstanding'")<0) return;
        let el = b.querySelector('.badge-count');
        if(!n){ if(el) el.remove(); return; }
        if(!el){ el = document.createElement('span'); el.className = 'badge-count'; el.style.cssText = 'position:absolute;top:2px;right:calc(50% - 22px);'; b.appendChild(el); }
        el.textContent = n;
      });
    }catch(e){}
  }
  function setHubCount(n){
    if(!ME || typeof homeExtras==='undefined') return;
    if(homeExtras.uid !== ME.id) return;
    homeExtras.at = Date.now();
    if(homeExtras.count === n) return;
    homeExtras.count = n;
    try{ saveBootSnapshot(); }catch(e){}
    paintHubBadge(n);
  }
  window.hubLastTotal = null;
  const base = computeHubItems;
  computeHubItems = async function(forcedPmId){
    const out = await base.apply(this, arguments);
    try{
      const who = forcedPmId!==undefined ? forcedPmId : (typeof hubFilterPmId!=='undefined' ? hubFilterPmId : '');
      if(out && Array.isArray(out.items)){
        if(forcedPmId===undefined) window.hubLastTotal = out.items.length;
        if(who==='' && ME && isManager(ME)) setHubCount(out.items.length);
      }
    }catch(e){}
    return out;
  };
  // The HUB page: say when its filters hide items.
  if(typeof renderHub==='function'){
    const rb = renderHub;
    renderHub = async function(){
      const r = await rb.apply(this, arguments);
      try{
        const filtersOn = hubFilterType!=='all' || !!hubFilterSiteId || hubFilterDue!=='all';
        const shown = document.querySelectorAll('#app .sitecard[onclick]').length;
        const total = window.hubLastTotal;
        if(filtersOn && total!=null && shown < total && !document.getElementById('hubFilterNote')){
          const list = document.querySelector('#app .filterrow');
          if(list){
            const d = document.createElement('div');
            d.id = 'hubFilterNote';
            d.style.cssText = 'margin:10px 0 0;padding:8px 12px;border-radius:10px;background:var(--warn-bg);color:var(--warn);font-size:13px;font-weight:600;display:flex;align-items:center;gap:10px;';
            d.innerHTML = `<span style="flex:1;">Showing ${shown} of ${total} — your filters are hiding ${total-shown}.</span><button type="button" class="ghostbtn" style="width:auto;margin:0;padding:6px 12px;font-size:12px;" onclick="hubFilterType='all';hubFilterSiteId='';hubFilterDue='all';render()">Show all</button>`;
            list.parentNode.insertBefore(d, list.nextSibling);
          }
        }
      }catch(e){}
      return r;
    };
  }
  // Re-check in the background when moving between pages (Home/Projects already do their own).
  let busy = false, last = 0;
  function bg(){
    if(!ME || !SESSION || busy || navigator.onLine===false) return;
    if(Date.now()-last < 20000) return;
    if(typeof isSitesRoute==='function' && isSitesRoute()) return;
    const p = (typeof parseRoute==='function') ? parseRoute() : [];
    if(p[0]==='hub') return; // the page sets it itself
    busy = true; last = Date.now();
    computeMyOutstandingCount().then(n=>{ busy = false; setHubCount(n||0); }).catch(()=>{ busy = false; });
  }
  window.addEventListener('hashchange', ()=>setTimeout(bg, 1500));
  setInterval(bg, 60000);
})();
