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
