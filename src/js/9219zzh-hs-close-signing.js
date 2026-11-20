/* ============================================================
   Close a RAMS / COSHH for signing (20 Nov 2026, Andy: "allow rams, coshh and tbt to be closed by pms,
   so signatures are no longer required (therefore removing notification from the hub)").
   - PMs/admins get "🔒 Close for signing" (and "↺ Reopen for signing") in each RAMS / COSHH ⋯ menu.
   - A closed document stays on file and can still be viewed and exported, but nobody is asked to sign
     it: it drops out of the HUB, the job's tile counts, the operative "to sign" pop-up and the daily
     reminders (rams_docs / coshh_docs.signing_closed_at; the database only lets managers set it).
   - Toolbox Talks already have "Close TBT" on each talk, which does the same.
   ============================================================ */
(function(){
  const HS_CLOSED = {}; // doc id -> signing_closed_at (or null)
  window.HS_CLOSED = HS_CLOSED;
  const tableOf = {ramsdoc:'rams_docs', coshhdoc:'coshh_docs'};

  // Remember each RAMS / COSHH row's closed state whenever it is loaded.
  if(typeof dbSelect==='function'){
    const baseSelect = dbSelect;
    dbSelect = async function(table, q){
      const rows = await baseSelect.apply(this, arguments);
      try{
        if((table==='rams_docs' || table==='coshh_docs') && Array.isArray(rows))
          rows.forEach(r=>{ if(r && r.id && Object.prototype.hasOwnProperty.call(r, 'signing_closed_at')) HS_CLOSED[r.id] = r.signing_closed_at || null; });
      }catch(e){}
      return rows;
    };
  }

  function keyInfo(key){
    const m = /^(ramsdoc|coshhdoc)-(.+)$/.exec(String(key||''));
    return m ? {kind:m[1], id:m[2], table:tableOf[m[1]]} : null;
  }

  // ⋯ menu: Close / Reopen for signing (managers only).
  if(typeof rowActionsMenuHtml==='function'){
    const baseMenu = rowActionsMenuHtml;
    rowActionsMenuHtml = function(key, itemsHtml){
      try{
        const k = keyInfo(key);
        if(k && isManager(ME)){
          const closed = !!HS_CLOSED[k.id];
          itemsHtml = `<div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;hsSetSigningClosed('${k.table}','${k.id}',${closed?'false':'true'})">${closed ? '↺ Reopen for signing' : '🔒 Close for signing'}</div>` + itemsHtml;
        }
      }catch(e){}
      return baseMenu.call(this, key, itemsHtml);
    };
  }

  // Manager list row: a closed document shows "Closed" instead of the signed count.
  if(typeof hsDocRowHtml==='function'){
    const baseRow = hsDocRowHtml;
    hsDocRowHtml = function(o){
      try{
        const m = /(?:ramsdoc|coshhdoc)-([0-9a-f-]{36})/.exec((o && o.menu) || '');
        if(m && HS_CLOSED[m[1]]){
          o = Object.assign({}, o, {pill:`<span class="hspill" title="Closed for signing — nobody is asked to sign">🔒 Closed</span>`,
            body:`<div class="stub" style="margin:6px 0 0;">Closed for signing${hsClosedWhen(m[1])}. Nobody is asked to sign it; it stays on file.</div>` + (o.body||'')});
        }
      }catch(e){}
      return baseRow.call(this, o);
    };
  }
  function hsClosedWhen(id){
    const t = HS_CLOSED[id]; if(!t) return '';
    try{ return ' on '+new Date(t).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}); }catch(e){ return ''; }
  }

  window.hsSetSigningClosed = async function(table, id, close){
    if(!isManager(ME)) return;
    if(close && !await customConfirm('Close this document for signing? It stays on file, but nobody will be asked to sign it and it comes off the HUB. You can reopen it later.')) return;
    const row = await dbUpdate(table, id, {signing_closed_at: close ? new Date().toISOString() : null});
    if(!row){ toast('Could not change that — please try again.'); return; }
    HS_CLOSED[id] = close ? (row.signing_closed_at || new Date().toISOString()) : null;
    toast(close ? 'Closed for signing' : 'Reopened for signing');
    try{ if(typeof refreshHubCount==='function') refreshHubCount(); }catch(e){}
    render();
  };

  // Operatives: a closed document can't be signed.
  ['signRams','signCoshh'].forEach(fn=>{
    const base = window[fn];
    if(typeof base!=='function') return;
    window[fn] = function(siteId, docId){
      if(HS_CLOSED[docId] && !isManager(ME)){ toast('This document is closed — no signature needed.'); return; }
      return base.apply(this, arguments);
    };
  });

  // Operative list: swap the sign box of a closed document for a plain note.
  function markClosedSignBoxes(){
    try{
      document.querySelectorAll('.ramssigbox:not(.signed), .coshhsigbox:not(.signed)').forEach(el=>{
        const m = /sign(?:Rams|Coshh)\('[^']*','([^']+)'\)/.exec(el.getAttribute('onclick')||'');
        if(m && HS_CLOSED[m[1]]){ el.removeAttribute('onclick'); el.style.cursor = 'default'; el.innerHTML = '<span class="name">🔒 Closed</span><span>No signature needed</span>'; }
      });
    }catch(e){}
  }
  ['renderRams','renderCoshh'].forEach(fn=>{
    const base = (typeof window[fn]==='function') ? window[fn] : null;
    if(!base) return;
    const wrapped = async function(){ const r = await base.apply(this, arguments); markClosedSignBoxes(); return r; };
    try{ if(fn==='renderRams') renderRams = wrapped; else renderCoshh = wrapped; }catch(e){ window[fn] = wrapped; }
  });
})();
