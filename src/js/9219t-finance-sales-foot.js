/* ============================================================
   OpHUB Finance — a totals bar under the applications and invoices lists
   (23 Oct 2026, Andy: "add a summary bar below the last job as we have in projects,
   in the sales, so it calculates the total for the filtered jobs — i.e. the total for
   the month"). It adds up only the rows on show (the chips, the search box and the
   month picker in the bar all count). Also: the ⋯ date menu on the figure boxes sits
   above the "+ New application" button.
   ============================================================ */
let finSalesMonth = '';
function finMonthOf(d){ return String(d||'').slice(0,7); }
function finMonthLabel(m){ if(!m) return ''; const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo-1, 1)).toLocaleDateString('en-GB', {month:'short', year:'numeric', timeZone:'UTC'}); }
function finRowData(html, rows, attrs){
  let i = 0;
  return html.replace(/<tbody>([\s\S]*?)<\/tbody>/, (m, body)=>'<tbody>'+body.replace(/<tr class="click/g, ()=>{ const r = rows[i++]; return r ? `<tr ${attrs(r)} class="click` : '<tr class="click'; })+'</tbody>');
}
function finSalesFootHtml(kind, rows, monthOf){
  const months = Array.from(new Set(rows.map(monthOf).filter(Boolean))).sort().reverse();
  if(finSalesMonth && !months.includes(finSalesMonth)) months.unshift(finSalesMonth);
  return `<div class="fgfoot finsfoot" data-kind="${kind}">
    <span class="finsfoot-t"></span>
    <select class="finsfoot-m" aria-label="Month" onchange="finSalesMonth=this.value;finSalesFootPaintAll()"><option value="">All months</option>${months.map(m=>`<option value="${m}" ${finSalesMonth===m?'selected':''}>${finMonthLabel(m)}</option>`).join('')}</select>
  </div>`;
}
(function(){
  const ba = finAppTableHtml, bi = finInvTableHtml;
  finAppTableHtml = function(apps){
    const h = ba.apply(this, arguments); if(!apps.length) return h;
    const out = finRowData(h, apps, a=>`data-m="${finMonthOf(a.valuation_date)}" data-a="${Number(a.net_due||0)}" data-c="${a.cert_net!=null?Number(a.cert_net):''}"`);
    setTimeout(finSalesFootPaintAll, 0);
    return out.replace(/<\/table><\/div>\s*$/, '</table></div>'+finSalesFootHtml('app', apps, a=>finMonthOf(a.valuation_date)));
  };
  finInvTableHtml = function(invs){
    const h = bi.apply(this, arguments); if(!invs.length) return h;
    const out = finRowData(h, invs, i=>`data-m="${finMonthOf(i.issue_date||i.created_at)}" data-void="${i.status==='void'?1:0}" data-n="${Number(i.net||0)}" data-v="${Number(i.vat||0)}" data-g="${Number(i.total||0)}" data-o="${finInvOutstandingNet(i)}"`);
    setTimeout(finSalesFootPaintAll, 0);
    return out.replace(/<\/table><\/div>\s*$/, '</table></div>'+finSalesFootHtml('inv', invs, i=>finMonthOf(i.issue_date||i.created_at)));
  };
  const lf = liveFilter;
  liveFilter = function(){ const r = lf.apply(this, arguments); finSalesFootPaintAll(); return r; };
  window.liveFilter = liveFilter;
})();
function finSalesFootPaintAll(){
  document.querySelectorAll('.finsfoot').forEach(foot=>{
    const wrap = foot.previousElementSibling; const tb = wrap && wrap.querySelector('tbody'); if(!tb) return;
    const sel = foot.querySelector('.finsfoot-m'); if(sel && sel.value!==finSalesMonth) sel.value = finSalesMonth;
    const rows = Array.from(tb.querySelectorAll('tr[data-m]'));
    rows.forEach(r=>r.classList.toggle('fmhide', !!finSalesMonth && r.dataset.m!==finSalesMonth));
    const vis = rows.filter(r=>r.style.display!=='none' && !r.classList.contains('fmhide'));
    const sum = k=>finRound(vis.reduce((t,r)=>t+(r.dataset[k]==='' || r.dataset.void==='1' ? 0 : Number(r.dataset[k]||0)),0));
    const t = foot.querySelector('.finsfoot-t'); if(!t) return;
    const when = finSalesMonth ? ' · '+finMonthLabel(finSalesMonth) : '';
    if(foot.dataset.kind==='app') t.innerHTML = vis.length ? `<b>${vis.length} application${vis.length===1?'':'s'}${when}</b><span>Applied ${finMoney(sum('a'))}</span><span>Certified ${finMoney(sum('c'))}</span>` : `<b>Nothing${when}</b>`;
    else { const live = vis.filter(r=>r.dataset.void!=='1').length;
      t.innerHTML = vis.length ? `<b>${live} invoice${live===1?'':'s'}${when}</b><span>Net ${finMoney(sum('n'))}</span><span>VAT ${finMoney(sum('v'))}</span><span>Gross ${finMoney(sum('g'))}</span>${sum('o') ? `<span class="fgfoot-bad">Owed ${finMoney(sum('o'))}</span>` : ''}` : `<b>Nothing${when}</b>`; }
  });
}
window.finSalesFootPaintAll = finSalesFootPaintAll;
(function(){
  const st = document.createElement('style');
  st.textContent = `.finsfoot{margin-top:8px !important;border-radius:10px !important;padding:5px 12px !important;font-size:12.5px;min-height:0;}
.finsfoot .finsfoot-m{height:24px !important;min-height:24px !important;font-size:11.5px !important;}
@media (min-width:701px){
  .finreptbl-wrap:has(+ .finsfoot) .fininvtbl th, .finreptbl-wrap:has(+ .finsfoot) .fininvtbl td{text-align:center !important;}
  .finreptbl-wrap:has(+ .finsfoot) .fininvtbl th:first-child, .finreptbl-wrap:has(+ .finsfoot) .fininvtbl td:first-child{text-align:left !important;}
  .finreptbl-wrap:has(+ .finsfoot) .fininvtbl .finrowdots{text-align:right !important;}
}
.finsfoot .finsfoot-t{display:flex;gap:6px 18px;flex-wrap:wrap;align-items:center;}
.finsfoot .finsfoot-m{margin-left:auto !important;height:28px !important;min-height:28px !important;padding:0 24px 0 10px !important;font-size:12px !important;font-weight:600 !important;width:auto !important;border-radius:8px !important;background-color:rgba(255,255,255,.16) !important;border:1px solid rgba(255,255,255,.35) !important;color:var(--brand1-text,#fff) !important;}
.finsfoot .finsfoot-m option{color:#111;background:#fff;}
.finreptbl-wrap:has(+ .finsfoot) tfoot{display:none;}
tr.fmhide{display:none !important;}
#finPcDate, #finDefects{height:32px !important;min-height:32px !important;padding:0 10px !important;font-size:13.5px !important;border-radius:8px !important;margin:0 !important;box-sizing:border-box;}
#finPcDate{max-width:160px;} #finDefects{max-width:80px;}
label:has(> #finPcDate), label:has(> #finDefects){font-size:11.5px !important;gap:3px !important;}
.finstatp:has(.finstatp-menu){z-index:80;}
.finstatp-menu{z-index:1000 !important;}
.pmstats.finstats{position:relative;z-index:5;}
`;
  document.head.appendChild(st);
})();
