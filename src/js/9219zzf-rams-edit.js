/* ============================================================
   Edit a RAMS that's already issued (3 Nov 2026, Andy: "can you add in for the rams to be edited please?
   ie re open them to edit?").
   Each RAMS on the job's list gets an Edit option in its ⋯ menu:
   - made with Create RAMS → "✎ Edit RAMS" reopens it in the builder. Change anything, then Re-issue: the new
     version replaces the old one (kept on file as Superseded) and everyone is asked to sign again.
   - an uploaded PDF → "↻ Upload a new version" opens the upload form with this document already picked
     under "Supersedes", so the new PDF replaces it the same way.
   ============================================================ */
(function(){
  if(typeof renderRams!=='function' || typeof rowActionsMenuHtml!=='function') return;
  let buildByDoc = {}, buildFor = null;
  async function loadBuilds(siteId){
    try{
      const rows = await dbSelect('rams_builds', 'site_id=eq.'+siteId+'&select=id,ra_doc_id,ms_doc_id');
      const m = {};
      (rows||[]).forEach(b=>{ if(b.ra_doc_id) m[b.ra_doc_id] = b.id; if(b.ms_doc_id) m[b.ms_doc_id] = b.id; });
      buildByDoc = m; buildFor = siteId;
    }catch(e){ buildByDoc = {}; buildFor = siteId; }
  }
  const baseRender = renderRams;
  renderRams = async function(siteId){
    if(isManager(ME)) await loadBuilds(siteId);
    return baseRender.apply(this, arguments);
  };
  const baseMenu = rowActionsMenuHtml;
  rowActionsMenuHtml = function(key, itemsHtml){
    try{
      if(typeof key==='string' && key.indexOf('ramsdoc-')===0 && isManager(ME)){
        const docId = key.slice(8);
        const m = /^#\/site\/([^\/?]+)/.exec(location.hash||'');
        const siteId = m ? m[1] : buildFor;
        const buildId = buildFor===siteId ? buildByDoc[docId] : null;
        const extra = buildId
          ? `<div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;ramsEd=null;go('#/site/${siteId}/hs/rams/build/${buildId}')">✎ Edit RAMS</div>`
          : `<div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;ramsNewVersion('${docId}')">↻ Upload a new version</div>`;
        itemsHtml = extra + itemsHtml;
      }
    }catch(e){}
    return baseMenu.call(this, key, itemsHtml);
  };
  window.ramsNewVersion = function(docId){
    ramsUploadOpen = true; ramsAddMode = 'upload';
    render();
    let tries = 0;
    const pick = ()=>{
      const sel = document.getElementById('ramsSupersedes');
      if(!sel){ if(++tries < 20) setTimeout(pick, 150); return; }
      sel.value = docId;
      const box = sel.closest('.card') || sel;
      try{ box.scrollIntoView({behavior:'smooth', block:'start'}); }catch(e){}
      toast('Choose the new PDF — it will replace this one and everyone signs again');
    };
    setTimeout(pick, 150);
  };
})();
