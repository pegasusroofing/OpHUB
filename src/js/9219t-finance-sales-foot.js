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

/* Projects list bar (Andy, 23 Oct): the controls evenly spaced, and "5 projects" lines up
   with the left edge of the job-number boxes (same gap on the right, so it's symmetrical). */
function finJobFootAlign(){
  const foot = document.getElementById('finJobGridFoot'), job = document.querySelector('#finJobGrid .fgjob');
  if(!foot || !job) return;
  const off = Math.max(10, Math.round(job.getBoundingClientRect().left - foot.getBoundingClientRect().left));
  foot.style.paddingLeft = off+'px'; foot.style.paddingRight = off+'px';
}
(function(){
  const base = finJobGridHtml;
  finJobGridHtml = function(){ const h = base.apply(this, arguments); setTimeout(finJobFootAlign, 0); return h; };
  window.addEventListener('resize', ()=>finJobFootAlign());
  const st = document.createElement('style');
  st.textContent = `#finJobGrid thead tr:first-child th{font-size:12.1px !important;}
#finJobGridFoot{column-gap:8px !important;}
#finJobGridFoot > b{margin-right:10px;}
#finJobGridFoot .fgfoot-ctl{gap:8px !important;}
#finJobGridFoot .fgcolbtn{margin-left:0 !important;}
@media (max-width:700px){ #finJobGridFoot{padding-left:12px !important;padding-right:12px !important;} }`;
  document.head.appendChild(st);
})();

/* Projects list filters on Start (dates) and Value (type e.g. 50k, >100k, <25k, 25k-100k,
   or pick a range) — Andy, 23 Oct. Status drop-down text centred. */
let finJobDV = {d:'', from:'', to:'', v:''};
function finJobDateRange(k){
  const t = finToday(), y = Number(t.slice(0,4)), m = Number(t.slice(5,7)), pad = n=>String(n).padStart(2,'0');
  const last = (yy,mm)=>new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  if(k==='month') return [`${y}-${pad(m)}-01`, `${y}-${pad(m)}-${pad(last(y,m))}`];
  if(k==='last'){ const yy = m===1?y-1:y, mm = m===1?12:m-1; return [`${yy}-${pad(mm)}-01`, `${yy}-${pad(mm)}-${pad(last(yy,mm))}`]; }
  if(k==='next'){ const yy = m===12?y+1:y, mm = m===12?1:m+1; return [`${yy}-${pad(mm)}-01`, `${yy}-${pad(mm)}-${pad(last(yy,mm))}`]; }
  if(k==='quarter'){ const q = Math.floor((m-1)/3)*3+1; return [`${y}-${pad(q)}-01`, `${y}-${pad(q+2)}-${pad(last(y,q+2))}`]; }
  if(k==='year') return [`${y}-01-01`, `${y}-12-31`];
  if(k==='12m'){ const d = new Date(t+'T12:00:00Z'); d.setUTCFullYear(d.getUTCFullYear()-1); return [d.toISOString().slice(0,10), t]; }
  if(k==='custom') return [finJobDV.from||'0000-01-01', finJobDV.to||'9999-12-31'];
  return null;
}
function finJobValTest(q){
  q = String(q||'').toLowerCase().replace(/[£,\s]/g,''); if(!q) return null;
  const n = x=>{ const mm = /^(\d+(?:\.\d+)?)(k|m)?$/.exec(x); if(!mm) return NaN; return Number(mm[1])*(mm[2]==='k'?1e3:mm[2]==='m'?1e6:1); };
  let r;
  if((r = /^(.+)-(.+)$/.exec(q))) { const a = n(r[1]), b = n(r[2]); if(!isNaN(a) && !isNaN(b)) return v=>v>=a && v<=b; }
  if(q[0]==='>'){ const a = n(q.replace(/^>=?/,'')); if(!isNaN(a)) return v=>v>=a; }
  if(q[0]==='<'){ const a = n(q.replace(/^<=?/,'')); if(!isNaN(a)) return v=>v<=a; }
  const a = n(q); if(!isNaN(a)) return v=>String(Math.round(v)).includes(String(Math.round(a))) || Math.abs(v-a)<0.5;
  return null;
}
function finJobDVSetup(){
  const g = document.getElementById('finJobGrid'); if(!g) return;
  const fr = g.querySelector('tr.fgfilters'); if(!fr || fr.dataset.dv) return; fr.dataset.dv = '1';
  const cols = finJobColsOn(); const iS = cols.findIndex(c=>c.k==='start'), iV = cols.findIndex(c=>c.k==='value');
  if(iS>=0 && fr.children[iS]){ fr.children[iS].className = 'fgf'; fr.children[iS].innerHTML = `<select class="fgdv" aria-label="Start dates" onclick="event.stopPropagation()" onchange="finJobDVDate(this.value)">${[['','Any date'],['month','This month'],['next','Next month'],['last','Last month'],['quarter','This quarter'],['year','This year'],['12m','Last 12 months'],['custom', finJobDV.d==='custom' && finJobDV.from ? finDate(finJobDV.from)+' – '+finDate(finJobDV.to) : 'Pick dates…']].map(([k,l])=>`<option value="${k}" ${finJobDV.d===k?'selected':''}>${l}</option>`).join('')}</select>`; }
  if(iV>=0 && fr.children[iV]){ fr.children[iV].className = 'fgf'; fr.children[iV].innerHTML = `<input type="text" class="fgdv" list="finJobValList" placeholder="Value" value="${escapeHtml(finJobDV.v)}" title="Type e.g. 50k, >100k, <25k or 25k-100k" onclick="event.stopPropagation()" oninput="finJobDV.v=this.value;finGridFilter('finJobGrid')"><datalist id="finJobValList">${['<25k','25k-100k','100k-250k','250k-500k','>500k'].map(x=>`<option value="${x}">`).join('')}</datalist>`; }
}
window.finJobDVDate = async function(k){
  if(k==='custom'){
    const from = await customPrompt('Start date from (YYYY-MM-DD)', finJobDV.from || finToday().slice(0,8)+'01'); if(from==null){ render(); return; }
    const to = await customPrompt('Start date to (YYYY-MM-DD)', finJobDV.to || finToday()); if(to==null){ render(); return; }
    if(!/^\d{4}-\d{2}-\d{2}$/.test(from.trim()) || !/^\d{4}-\d{2}-\d{2}$/.test(to.trim())){ toast('Use dates like '+finToday()); render(); return; }
    finJobDV.from = from.trim(); finJobDV.to = to.trim();
  }
  finJobDV.d = k; render();
};
(function(){
  window.finGridFilter = function(id){
    { const tb = document.getElementById(id); if(!tb) return;
      const fs = Array.from(tb.querySelectorAll('.fgfilters input[data-col]')).map(i=>({c:Number(i.dataset.col), q:i.value.trim().toLowerCase()})).filter(f=>f.q);
      let n = 0;
      tb.querySelectorAll('tbody tr').forEach(tr=>{ const ok = fs.every(f=>{ const td = tr.children[f.c]; return td && td.textContent.toLowerCase().includes(f.q); }); tr.classList.toggle('fg-hide', !ok); if(ok && tr.style.display!=='none') n++; });
      const foot = document.getElementById(id+'Foot');
      if(foot){ let note = foot.querySelector('.fgfoot-n'); if(!note){ note = document.createElement('em'); note.className = 'fgfoot-n'; const cb = foot.querySelector('.fgcolbtn'); if(cb) foot.insertBefore(note, cb); else foot.appendChild(note); } note.textContent = fs.length ? n+' shown with filters' : ''; } }
    if(id!=='finJobGrid') return;
    const g = document.getElementById(id); if(!g) return;
    const rng = finJobDV.d ? finJobDateRange(finJobDV.d) : null, vt = finJobValTest(finJobDV.v);
    if(!rng && !vt) return;
    let n = 0;
    g.querySelectorAll('tbody tr').forEach(tr=>{
      if(tr.classList.contains('fg-hide')) return;
      const d = tr.querySelector('td[data-d]'), v = tr.querySelector('td[data-v]');
      let ok = true;
      if(rng) ok = !!(d && d.dataset.d && d.dataset.d>=rng[0] && d.dataset.d<=rng[1]);
      if(ok && vt) ok = !!(v && vt(Number(v.dataset.v||0)));
      tr.classList.toggle('fg-hide', !ok); if(ok && tr.style.display!=='none') n++;
    });
    const foot = document.getElementById(id+'Foot'); const note = foot && foot.querySelector('.fgfoot-n'); if(note) note.textContent = n+' shown with filters';
  };
  const base = finJobGridHtml;
  finJobGridHtml = function(){ const h = base.apply(this, arguments); setTimeout(()=>{ finJobDVSetup(); if(finJobDV.d || finJobDV.v) finGridFilter('finJobGrid'); }, 0); return h; };
  const st = document.createElement('style');
  st.textContent = `.fggrid .fgfilters .fgdv{width:100%;box-sizing:border-box;margin:0 !important;height:26px !important;min-height:26px !important;padding:0 6px !important;font-size:11.5px !important;border:1px solid var(--line) !important;border-radius:7px !important;background-color:#fff !important;text-align:center;box-shadow:none !important;}
.fggrid .fgfilters select.fgdv{padding-right:18px !important;text-align-last:center;}
.fggrid .fgfilters select.fgstat{text-align:center !important;text-align-last:center !important;min-width:120px !important;padding:0 22px !important;}`;
  document.head.appendChild(st);
})();
