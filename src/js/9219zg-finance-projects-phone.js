/* ============================================================
   OpHUB Finance — Projects list on the phone (24 Oct 2026, Andy):
   - compact project tiles (job + name on top, then Client · PM · Status / Start · Value · PO in two short rows);
   - the bottom bar's sort is a small "Sort ▾" button that opens the choices;
   - a Project search (job no., name, client, PM, postcode) on the same row as "+ New project",
     replacing the Client box.
   ============================================================ */
let finJobQ = '';
function finJobSearchApply(){
  const g = document.getElementById('finJobGrid'); if(!g) return;
  const q = finJobQ.trim().toLowerCase();
  let n = 0, all = 0;
  g.querySelectorAll('tbody tr').forEach(tr=>{
    const ok = !q || String(tr.dataset.lf||tr.textContent).toLowerCase().includes(q);
    tr.classList.toggle('fjq-hide', !ok);
    if(tr.style.display==='none') return;
    all++; if(ok && !tr.classList.contains('fg-hide')) n++;
  });
  const foot = document.getElementById('finJobGridFoot');
  if(foot){ let note = foot.querySelector('.fjq-n'); if(q){ if(!note){ note = document.createElement('em'); note.className = 'fjq-n'; const b = foot.querySelector('b'); if(b) b.after(note); else foot.prepend(note); } note.textContent = n+' match'; } else if(note) note.remove(); }
}
window.finJobSearch = function(v){ finJobQ = v||''; finJobSearchApply(); };
function finJobPhoneTidy(){
  const g = document.getElementById('finJobGrid'); if(!g) return;
  // Search row (shown on phones; the column filters do this job on a computer)
  if(!document.getElementById('finJobQRow')){
    const newBtn = Array.from(document.querySelectorAll('#app button')).find(b=>/New project/i.test(b.textContent||''));
    const row = document.createElement('div'); row.id = 'finJobQRow'; row.className = 'fjq-row';
    row.innerHTML = `<input type="search" id="finJobQ" placeholder="Search projects" value="${escapeHtml(finJobQ)}" oninput="finJobSearch(this.value)" autocomplete="off">`
      + (newBtn ? `<button type="button" class="darkbtn fjq-new" onclick="${escapeHtml(newBtn.getAttribute('onclick')||'')}">+ New project</button>` : '');
    if(newBtn) newBtn.classList.add('fjq-oldnew');
    const anchor = document.querySelector('#app .finprojfilt') || g.closest('.finreptbl-wrap') || g;
    anchor.parentNode.insertBefore(row, anchor);
  }
  // Sort: a small "Sort ▾" button over the real drop-down
  const foot = document.getElementById('finJobGridFoot');
  const sel = foot && foot.querySelector('select[aria-label="Sort"]');
  if(sel && !sel.closest('.fjq-sort')){
    const lab = document.createElement('label'); lab.className = 'fjq-sort'; lab.title = 'Sort by';
    sel.parentNode.insertBefore(lab, sel); lab.appendChild(document.createTextNode('Sort ▾')); lab.appendChild(sel);
  }
  finJobSearchApply();
}
(function(){
  const base = render;
  render = async function(){
    const r = await base.apply(this, arguments);
    try{ if(document.getElementById('finJobGrid')) finJobPhoneTidy(); }catch(e){ console.warn(e); }
    return r;
  };
  window.render = render;
  const gf = window.finGridFilter;
  if(gf) window.finGridFilter = function(id){ const r = gf.apply(this, arguments); if(id==='finJobGrid') finJobSearchApply(); return r; };
  const st = document.createElement('style');
  st.textContent = `.fjq-row{display:none;}
#finJobGrid tbody tr.fjq-hide{display:none !important;}
.fjq-n{font-style:normal;font-size:12px;opacity:.85;margin-left:6px;}
.fjq-sort{position:relative;display:inline-flex;align-items:center;justify-content:center;height:28px;padding:0 12px;border-radius:8px;font-size:12px;font-weight:700;white-space:nowrap;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.35);color:inherit;cursor:pointer;flex:none !important;}
.fjq-sort select{position:absolute !important;inset:0 !important;width:100% !important;height:100% !important;opacity:0 !important;cursor:pointer;margin:0 !important;}
@media (max-width:700px){
  .fjq-row{display:flex;gap:8px;align-items:center;margin:0 0 10px;}
  .fjq-row input{flex:1;min-width:0;height:38px !important;min-height:38px !important;margin:0 !important;padding:0 12px !important;font-size:14px !important;border-radius:10px !important;}
  .fjq-row .fjq-new{flex:none;width:auto !important;margin:0 !important;padding:9px 12px !important;font-size:13.5px !important;white-space:nowrap;}
  .fjq-oldnew{display:none !important;}
  #app .finprojfilt{display:none !important;}
  #finJobGrid tbody tr{padding:8px 10px !important;column-gap:8px !important;row-gap:4px !important;}
  #finJobGrid td[data-l="Job"], #finJobGrid td[data-l="Project"]{padding:0 0 5px !important;}
  #finJobGrid td[data-l="Project"]{font-size:13.5px !important;flex:1 1 calc(100% - 90px) !important;text-align:left !important;}
  #finJobGrid tbody td{background:transparent !important;}
  #finJobGrid td[data-l="Client"]{order:1;} #finJobGrid td[data-l="PM"]{order:2;} #finJobGrid td[data-l="Status"]{order:3;}
  #finJobGrid td[data-l="Start"]{order:4;} #finJobGrid td[data-l="Value"]{order:5;} #finJobGrid td[data-l="Client PO"]{order:6;}
  #finJobGrid tbody td:not([data-l="Job"]):not([data-l="Project"]){flex:0 0 calc((100% - 16px) / 3) !important;display:block !important;text-align:left !important;font-size:12.5px !important;line-height:1.25;padding:2px 0 !important;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  #finJobGrid tbody td:not([data-l="Job"]):not([data-l="Project"])::before{display:block !important;font-size:9.5px !important;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:var(--slate);margin:0 0 1px !important;}
  #finJobGrid td[data-l="Value"]{font-weight:700;}
  #finJobGrid td[data-l="Status"] .finpill{font-size:10.5px;padding:1px 7px;}
  #finJobGridFoot .fgfoot-ctl select{font-size:11.5px !important;}
  #finJobGridFoot .fjq-sort{height:28px;padding:0 10px;font-size:11.5px;}
}`;
  document.head.appendChild(st);
})();
