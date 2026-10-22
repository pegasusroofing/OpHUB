/* ============================================================
   OpHUB Finance — look tweaks (21 Oct 2026, Andy).
   1. Finance › Settings groups use the same drop-down rows as Projects /
      Admin Centre (.ddrow-hdr): one full-width stack, an icon swatch,
      bold label and ▶ / ▼ — instead of the two-column cards.
   2. Buttons in a section's title row (+ Add cost code, + New supplier,
      Pull from Xero …) are small, not full-size red slabs.
   ============================================================ */
const FIN_SET_ICONS = {
  'who can see material costs':['👁','#eef2ff','#3b4cca'], 'project numbers':['#','#fdecec','#c62828'],
  'purchase orders':['🧾','#fff4e0','#a35f00'], 'invoice numbers':['№','#eaf6ee','#1e7a3c'],
  'defaults for new projects':['⚙','#f1f3f6','#4a5260'], 'on your invoices':['🏦','#e8f4fb','#1b6a96'],
  'invoice inbox (email)':['📥','#f4ecfb','#6b3fa0'], 'xero':['🔗','#e6f7fb','#0b7a99'],
};
(function(){
  const base = finCollapseCards;
  finCollapseCards = function(root, key){
    base(root, key);
    if(key!=='settings' || !root) return;
    root.classList.add('finset-dd');
    root.querySelectorAll('.card.fincoll').forEach(card=>{
      const s = card.querySelector(':scope > details > summary.fincoll-s'); if(!s || s.dataset.dd) return;
      s.dataset.dd = '1';
      const lbl = (s.querySelector('span')||{}).textContent || '';
      const ic = FIN_SET_ICONS[lbl.trim().toLowerCase()] || ['•','#f1f3f6','#4a5260'];
      s.innerHTML = `<span class="icon" style="background:${ic[1]};color:${ic[2]};">${ic[0]}</span><span class="lbl">${escapeHtml(lbl)}</span><span class="arrow" aria-hidden="true">▶</span>`;
    });
  };
  const css = `
  html.finmode .finset-dd, html.desk.finmode .finset-dd{display:block !important;}
  .finset-dd > .card.fincoll{margin:10px 0 0 !important;border-radius:9px;border:1px solid var(--line);box-shadow:0 1px 3px rgba(16,17,20,.04);background:#fff;}
  .finset-dd .fincoll-s{padding:11px 14px;gap:11px;justify-content:flex-start;font-size:13.5px;font-weight:800;}
  .finset-dd .fincoll-s .icon{width:32px;height:32px;border-radius:9px;flex:0 0 32px;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800;}
  .finset-dd .fincoll-s .lbl{flex:1;color:var(--ink);}
  .finset-dd .fincoll-s .arrow{font-size:11px;color:var(--slate);}
  .finset-dd .fincoll-d[open] .fincoll-s .arrow{font-size:0;}
  .finset-dd .fincoll-d[open] .fincoll-s .arrow::after{content:'▼';font-size:11px;}
  .finset-dd .fincoll-b{padding:4px 14px 16px 57px;}
  @media (max-width:700px){ .finset-dd .fincoll-b{padding:4px 14px 16px;} }
  .finset-dd > #finSettingsSave{margin-top:16px;max-width:260px;}
  .finsechead .darkbtn, .finsechead .ghostbtn{width:auto !important;flex:none;margin:0 !important;padding:7px 12px !important;font-size:13px !important;min-height:0 !important;height:auto !important;border-radius:8px !important;line-height:1.2;}
  .finsechead > div{gap:6px !important;}`;
  try{ const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); }catch(e){}
})();

/* 3. Finance › Reports: each group is a Projects-style drop-down row; the
      reports inside are plain rows (title + what it shows). */
const FIN_REP_ICONS = {qs:['📊','#eef2ff','#3b4cca'], money:['£','#eaf6ee','#1e7a3c'], tax:['🧾','#fff4e0','#a35f00']};
let FIN_REP_OPEN = (()=>{ try{ return new Set(JSON.parse(localStorage.getItem('ophub.finRepOpen')||'["qs"]')); }catch(e){ return new Set(['qs']); } })();
window.finRepToggle = function(g){ if(FIN_REP_OPEN.has(g)) FIN_REP_OPEN.delete(g); else FIN_REP_OPEN.add(g); try{ localStorage.setItem('ophub.finRepOpen', JSON.stringify(Array.from(FIN_REP_OPEN))); }catch(e){} render(); };
function renderFinReports(){
  if(!finGuard()) return;
  document.getElementById('app').innerHTML = shell(`
    ${finSectionNav('reports')}
    <p class="stub" style="margin:0 0 12px;">Pick a report, set the project and dates, then download it as Excel or PDF.</p>
    ${Object.keys(FIN_REPORT_GROUPS).map((g,i)=>{ const ic = FIN_REP_ICONS[g] || ['•','#f1f3f6','#4a5260']; const list = FIN_REPORTS.filter(r=>r.group===g); const open = FIN_REP_OPEN.has(g);
      return `<p class="ddrow ddrow-hdr" style="margin-top:${i?10:0}px;" onclick="finRepToggle('${g}')"><span class="icon" style="background:${ic[1]};color:${ic[2]};">${ic[0]}</span><span class="lbl">${escapeHtml(FIN_REPORT_GROUPS[g])} <span class="stub" style="font-weight:500;">· ${list.length} report${list.length===1?'':'s'}</span></span><span class="arrow">${open?'▼':'▶'}</span></p>
      ${open ? `<div class="finrep-sub">${list.map(r=>`<p class="ddrow" onclick="finRep=null;go('#/finance/reports/${r.id}')"><span class="finrep-t"><b>${escapeHtml(r.title)}</b><span>${escapeHtml(r.desc)}</span></span><span class="arrow">›</span></p>`).join('')}</div>` : ''}`; }).join('')}
  `, {title:'Reports', subtitle:'OpHUB Finance', back:finSecBack(), tabs:false});
}
(function(){
  const css = `.finrep-sub{padding:0 0 4px 22px;}
  .finrep-sub .ddrow{margin-top:6px;}
  .finrep-t{flex:1;display:flex;flex-direction:column;gap:2px;}
  .finrep-t b{font-size:13px;font-weight:700;color:var(--ink);}
  .finrep-t span{font-size:12px;color:var(--slate);font-weight:400;}
  .finrep-sub .arrow{font-size:16px !important;}`;
  try{ const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); }catch(e){}
})();

/* 4. Subcontractors & labour: Pay run tab taken off (Andy, 21 Oct) — the
      page still works at #/finance/labour/payrun if it's ever wanted. */
FIN_SUBS.subs = FIN_SUBS.subs.filter(t=>t[0]!=='payrun');

/* 5. No repeated headings (Andy, 21 Oct): when a section's title is the same
      as the tab you're on (Purchase orders, Purchase invoices, Cost codes…),
      the title is left off and only its button shows. */
function finSecHead(title, btnLabel, btnClick){
  const tabLabels = new Set([].concat(...Object.values(FIN_SUBS)).map(t=>String(t[1]).toLowerCase()));
  const t = tabLabels.has(String(title||'').toLowerCase()) ? '' : title;
  return `<div class="finsechead${t?'':' finsechead-notitle'}"><h3>${escapeHtml(t||'')}</h3>${btnLabel?`<button class="darkbtn" onclick="${btnClick}">${btnLabel}</button>`:''}</div>`;
}
(function(){
  const css = `.finsechead-notitle{margin-top:10px !important;}
  .finsechead-notitle:not(:has(button)){display:none;}
  .finsechead > h3:empty{flex:1;}`;
  try{ const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); }catch(e){}
})();

/* 6. Finance filter chips (Open / Invoiced / Cancelled …) as one neat
      segmented bar with small count badges, instead of big round pills. */
(function(){
  const css = `html.finmode .pmchips{display:inline-flex;flex-wrap:wrap;gap:2px;padding:3px;background:#eceef2;border-radius:10px;margin:0 0 12px;max-width:100%;}
  html.finmode .pmchips .pmchip{border:0 !important;background:transparent !important;box-shadow:none !important;border-radius:8px !important;padding:6px 12px !important;font-size:13px !important;font-weight:600 !important;color:var(--slate) !important;min-height:0 !important;height:auto !important;line-height:1.25;display:inline-flex;align-items:center;gap:6px;}
  html.finmode .pmchips .pmchip:hover{color:var(--ink) !important;}
  html.finmode .pmchips .pmchip.on{background:#fff !important;color:var(--ink) !important;box-shadow:0 1px 3px rgba(16,17,20,.12) !important;}
  html.finmode .finchip-n{display:inline-block;min-width:18px;padding:1px 6px;border-radius:999px;background:#dfe2e8;color:#4a5260;font-size:11px;font-weight:700;text-align:center;line-height:16px;}
  html.finmode .pmchip.on .finchip-n{background:var(--brand,#e3262b);color:#fff;}
  html.finmode span.pmchip{cursor:default;}`;
  try{ const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); }catch(e){}
})();

/* 7. Tighter Finance pages (Andy, 21 Oct): less space above / below the page
      title and the section tabs; a title-less section's button sits on the
      right of the filter chips row; the search box sits in the filter row;
      the Projects grid's header row is bold, underlined and centred. */
(function(){
  const css = `html.desk.finmode .appbar{padding-top:8px !important;padding-bottom:8px !important;}
  html.desk.finmode .appbar .row{min-height:44px !important;}
  html.desk.finmode .scrollarea{padding-top:12px !important;}
  html.finmode .finsecnav{margin-bottom:10px !important;}
  html.finmode .finsubtabs{margin-bottom:10px !important;}
  html.finmode .finsechead-notitle{float:right;margin:0 0 0 12px !important;position:relative;z-index:2;}
  html.finmode .finsechead-notitle h3{display:none;}
  html.finmode .finsechead-notitle ~ div:not(.pmchips):not(.finsechead), html.finmode .finsechead-notitle ~ details, html.finmode .finsechead-notitle ~ table{clear:both;}
  html.finmode .finjobfilt .fin-searchlbl{flex:1 1 240px !important;min-width:200px;max-width:380px;}
  @media (max-width:640px){ html.finmode .finjobfilt .fin-searchlbl{grid-column:1/-1;min-width:0;max-width:none;} }
  html.finmode .finjobfilt .fin-searchlbl input{width:100%;}
  .fggrid thead tr:first-child th{font-weight:800 !important;text-decoration:underline;text-underline-offset:3px;text-align:center !important;color:var(--ink) !important;}
  .fggrid tbody td, .fggrid tbody td.num{text-align:center !important;}
  .fgfoot .fgcolbtn{margin-left:auto;background:#2A2F37;color:#fff;border:1px solid #3A404A;border-radius:8px;padding:5px 10px;font-size:12px;font-weight:700;cursor:pointer;}
  .fgfoot .fgfoot-n{margin-left:auto;} .fgfoot .fgfoot-n + .fgcolbtn{margin-left:10px;}
  .fgcols-card{max-width:380px;width:100%;}
  .fgcols-list{border:1px solid var(--line);border-radius:10px;overflow:hidden;max-height:55vh;overflow-y:auto;}
  .fgcols-row{display:flex;justify-content:space-between;align-items:center;width:100%;padding:9px 12px;border:0;border-bottom:1px solid var(--line);background:#fff;font-size:13.5px;text-align:left;cursor:pointer;color:var(--ink);}
  .fgcols-row:last-child{border-bottom:0;}
  .fgcols-row[disabled]{cursor:default;color:var(--slate);}
  .fgcols-row small{font-size:11px;color:var(--slate);}
  .fgcols-ic{width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:#fff;}
  .fgcols-ic.on{background:#1e8a5a;} .fgcols-ic.off{background:#d64545;}
  .fgcols-btns{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px;}`;
  try{ const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); }catch(e){}
  // move the search box into the filter row next to the drop-downs
  const tidy = ()=>{
    if(!document.documentElement.classList.contains('finmode')) return;
    document.querySelectorAll('#app .finjobfilt').forEach(row=>{
      const nx = row.nextElementSibling;
      if(!nx || !nx.classList.contains('formfield')) return;
      const inp = nx.querySelector('input[oninput*="liveFilter"]'); if(!inp || nx.children.length!==1) return;
      const lbl = document.createElement('label'); lbl.className = 'fin-searchlbl'; lbl.textContent = 'Search';
      lbl.appendChild(inp); row.appendChild(lbl); nx.remove();
    });
  };
  const start = ()=>{ const app = document.getElementById('app'); if(!app) return setTimeout(start, 500); new MutationObserver(tidy).observe(app, {childList:true}); };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', start); else start();
})();

/* 8. Projects grid: filter boxes centred like their columns; Status column narrower. */
(function(){
  const css = `.fggrid .fgfilters input{text-align:center;}
  .fggrid .fgfilters input::placeholder{text-align:center;}
  html.finmode .finjobfilt .fin-searchlbl input{text-align:center;}
  .fggrid td[data-l="Status"]{width:96px;max-width:110px;}
  .fggrid td[data-l="Job"]{width:72px;}`;
  try{ const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); }catch(e){}
})();

/* 9. Wide screens (Andy, 22 Oct): every Finance page lines up in one centred
      column — tabs, chips, filters, tables and the title buttons share the same
      left and right edges (before, block items were centred at 1720px while
      the chips and floated buttons sat at the screen edges). */
(function(){
  const css = `html.desk.finmode .scrollarea{padding-left:max(40px, calc((100% - 1720px) / 2)) !important;padding-right:max(40px, calc((100% - 1720px) / 2)) !important;}
  html.desk.finmode .scrollarea > *{max-width:none !important;margin-left:0 !important;margin-right:0 !important;}`;
  try{ const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); }catch(e){}
})();
