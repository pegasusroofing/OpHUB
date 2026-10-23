/* ============================================================
   OpHUB — tidy-up from deep dive 3 (23 Oct 2026, Andy: "do 1 & 2"):
   1. Every Finance list gets the same totals bar (+ month picker when it has a date
      column) and centred columns, like Sales; Finance labels in Title Case.
   2. A clickable trail at the top: Finance › Projects › SBX-107 Andy House › Application 3
      (and Projects › SBX-107 › Schedule of Works on the project side).
   ============================================================ */

/* ---------- 2. breadcrumb ---------- */
const FIN_SEC_LBL = {jobs:'Projects', sales:'Sales', purchases:'Purchases', subs:'Subcontractors & Labour', labour:'Labour', reports:'Reports', directory:'Directory', settings:'Settings', inbox:'Purchases'};
const FIN_SUB_LBL = {apps:'Applications & Certificates', invoices:'Invoices', retention:'Retention', orders:'Purchase Orders', plant:'Plant', suppliers:'Suppliers', pricebook:'Price Book', clients:'Clients'};
const FIN_SITE_LBL = {application:'Application', invoice:'Invoice', contract:'Bill of Quantities', variations:'Variations', summary:'Detailed Summary', reports:'Run Reports', budget:'Budget', monthly:'Monthly Report', costs:'All Costs', parts:'Costs By Plot', po:'Purchase Order', sub:'Subcontract', shopping:'Shopping List'};
function navCrumbs(opts){
  const p = parseRoute(); const [a, b, c, d] = p;
  const title = String((opts && opts.title) || '').replace(/^.*·\s*/, '');
  const site = a==='site' && b ? SITES.find(s=>s.id===b) : null;
  const sName = site ? ((site.job_number ? site.job_number+' ' : '')+(site.name||'')) : '';
  const tc = s=>typeof finTitleCase==='function' ? finTitleCase(s) : s;
  const cr = [];
  if(a==='finance'){
    cr.push(['Finance', '#/finance']);
    if(b && FIN_SEC_LBL[b]) cr.push([FIN_SEC_LBL[b], '#/finance/'+b]);
    if(b==='reports' && c) cr.push([tc(title||'Report'), null]);
    else if(c && FIN_SUB_LBL[c]) cr.push([FIN_SUB_LBL[c], null]);
  } else if(a==='site' && site && c==='finance'){
    cr.push(['Finance', '#/finance'], ['Projects', '#/finance/jobs'], [sName, `finProjTab['${b}']='overview';go('#/site/${b}/finance')`]);
    if(d) cr.push([FIN_SITE_LBL[d] && !/^(application|invoice|po|sub)$/.test(d) ? FIN_SITE_LBL[d] : tc(title || FIN_SITE_LBL[d] || ''), null]);
  } else if(a==='site' && site){
    cr.push(['Projects', '#/sites'], [sName, `go('#/site/${b}/home')`]);
    if(c && c!=='home') cr.push([tc(title||''), null]);
  } else return '';
  if(cr.length < 2) return '';
  return `<nav class="navcrumbs" aria-label="Where you are">${cr.map(([l, h], i)=>{
    const last = i===cr.length-1 || !h;
    const js = !h ? '' : (h.startsWith('#') ? `go('${h}')` : h);
    return (i ? '<i>›</i>' : '') + (last ? `<span>${escapeHtml(l)}</span>` : `<button type="button" onclick="${escapeHtml(js)}">${escapeHtml(l)}</button>`);
  }).join('')}</nav>`;
}
(function(){
  const sh = shell;
  shell = function(inner, opts){
    const h = sh.apply(this, arguments);
    let crumbs = ''; try{ crumbs = navCrumbs(opts||{}); }catch(e){}
    if(!crumbs) return h;
    return h.replace(/(<div class="scrollarea"[^>]*>)/, '$1'+crumbs);
  };
})();

/* ---------- 1a. Title Case on Finance labels ---------- */
const FIN_TC_KEEP = new Set(['VAT','CIS','PO','POs','BoQ','CVR','PAYE','UTR','HMRC','OpHUB','PDF','PM','PMs','QS','DRC','RC','ID','AFP','No.','Xero','Excel']);
function finTitleCase(s){
  return String(s||'').replace(/[A-Za-z][A-Za-z'’.]*/g, w=>{
    if(FIN_TC_KEEP.has(w) || /[A-Z].*[A-Z]/.test(w)) return w;
    if(/^(excl|incl)\.?$/i.test(w)) return w.charAt(0).toUpperCase()+w.slice(1);
    return w.charAt(0).toUpperCase()+w.slice(1);
  });
}
function finTcNode(el){
  el.childNodes.forEach(n=>{ if(n.nodeType===3 && /[a-z]/.test(n.nodeValue)){ const t = finTitleCase(n.nodeValue); if(t!==n.nodeValue) n.nodeValue = t; } });
}
function finTcSweep(){
  if(!document.documentElement.classList.contains('finmode')) return;
  const app = document.getElementById('app'); if(!app) return;
  app.querySelectorAll('.sectiontitle, .pmstat > span, .pmchip, .finsubtabs button, .finsecnav button, .finboqsub button, .fintodo-t > b, .fincoll-s > span:first-child, .finfold-t, .finsec-h, .finsechead h3, .finsechead .sectiontitle, .fincs-r > span, .finds-kv > span').forEach(el=>{
    if(el.closest('input, textarea, select, [contenteditable]')) return;
    finTcNode(el);
  });
}
/* ---------- 1b. totals bar on any Finance list that doesn't have one ---------- */
const FIN_MON3 = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12};
function finParseUkDate(t){ const m = /(\d{1,2})\s+([A-Za-z]{3,4})\w*\s+(\d{4})/.exec(String(t||'')); if(!m) return ''; const mo = FIN_MON3[m[2].toLowerCase()]; return mo ? `${m[3]}-${String(mo).padStart(2,'0')}` : ''; }
function finParseMoney(t){ const m = /-?−?£\s?-?[\d,]+(\.\d+)?/.exec(String(t||'')); if(!m) return null; const neg = /[-−]/.test(m[0]); const n = Number(m[0].replace(/[^\d.]/g,'')); return isNaN(n) ? null : (neg ? -n : n); }
let finAutoMonth = {};
function finAutoFoot(){
  if(!document.documentElement.classList.contains('finmode')) return;
  document.querySelectorAll('#app .finreptbl-wrap').forEach(wrap=>{
    const tbl = wrap.querySelector('table.fininvtbl'); if(!tbl || tbl.classList.contains('fggrid')) return;
    const nx = wrap.nextElementSibling;
    if(nx && (nx.classList.contains('finsfoot') || nx.classList.contains('findsfoot') || nx.classList.contains('fgfoot'))) return;
    const ths = Array.from(tbl.querySelectorAll('thead tr:first-child th')); if(!ths.length) return;
    const moneyCols = ths.map((th,i)=>th.classList.contains('num') ? i : -1).filter(i=>i>=0);
    const dateCol = ths.findIndex(th=>/^(date|received|invoice date|on hire|week)$/i.test(th.textContent.trim()));
    const key = (location.hash||'')+'|'+ths.map(t=>t.textContent.trim()).join(',');
    const foot = document.createElement('div'); foot.className = 'fgfoot finsfoot finautofoot'; foot.dataset.key = key;
    foot.innerHTML = '<span class="finsfoot-t"></span>';
    if(dateCol>=0){
      const months = Array.from(new Set(Array.from(tbl.querySelectorAll('tbody tr')).map(tr=>finParseUkDate((tr.children[dateCol]||{}).textContent)).filter(Boolean))).sort().reverse();
      if(months.length > 1 || finAutoMonth[key]){
        const cur = finAutoMonth[key] || '';
        foot.insertAdjacentHTML('beforeend', `<select class="finsfoot-m" aria-label="Month"><option value="">All months</option>${months.map(m=>`<option value="${m}" ${cur===m?'selected':''}>${finMonthLabel(m)}</option>`).join('')}</select>`);
        foot.querySelector('select').onchange = e=>{ finAutoMonth[key] = e.target.value; finAutoFootPaint(); };
      }
    }
    foot._cols = {money:moneyCols.map(i=>[i, ths[i].textContent.trim()]), date:dateCol};
    wrap.after(foot);
  });
  finAutoFootPaint();
}
function finAutoFootPaint(){
  document.querySelectorAll('#app .finautofoot').forEach(foot=>{
    const wrap = foot.previousElementSibling; const tbl = wrap && wrap.querySelector('table'); if(!tbl || !foot._cols) return;
    const m = finAutoMonth[foot.dataset.key] || '';
    const rows = Array.from(tbl.querySelectorAll('tbody tr'));
    rows.forEach(tr=>tr.classList.toggle('fmhide', !!m && finParseUkDate((tr.children[foot._cols.date]||{}).textContent)!==m));
    const vis = rows.filter(tr=>tr.style.display!=='none' && !tr.classList.contains('fmhide') && !tr.classList.contains('void') && !tr.classList.contains('fg-hide'));
    const t = foot.querySelector('.finsfoot-t');
    const sums = foot._cols.money.map(([i, l])=>{ let s = 0, any = false; vis.forEach(tr=>{ const v = finParseMoney((tr.children[i]||{}).textContent); if(v!=null){ s += v; any = true; } }); return any ? `<span>${escapeHtml(finTitleCase(l.toLowerCase()))} ${finMoney(finRound(s))}</span>` : ''; }).join('');
    t.innerHTML = `<b>${vis.length} shown${m ? ' · '+finMonthLabel(m) : ''}</b>${sums}`;
  });
}
(function(){
  let tmr = null;
  const run = ()=>{ clearTimeout(tmr); tmr = setTimeout(()=>{ try{ finAutoFoot(); finTcSweep(); }catch(e){ console.error(e); } }, 60); };
  const start = ()=>{ const app = document.getElementById('app'); if(!app) return setTimeout(start, 400); new MutationObserver(muts=>{ if(muts.some(m=>Array.from(m.addedNodes).some(n=>n.nodeType===1 && !(n.classList && (n.classList.contains('finautofoot') || n.classList.contains('finsfoot-t')))))) run(); }).observe(app, {childList:true, subtree:true}); run(); };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', start); else start();
  const lf = liveFilter;
  liveFilter = function(){ const r = lf.apply(this, arguments); finAutoFootPaint(); return r; };
  window.liveFilter = liveFilter;
  const st = document.createElement('style');
  st.textContent = `.navcrumbs{display:flex;align-items:center;flex-wrap:wrap;gap:4px 6px;font-size:12.5px;color:var(--slate);margin:0 0 10px;}
.navcrumbs button{all:unset;cursor:pointer;font-weight:700;color:var(--brand1);padding:2px 4px;border-radius:6px;}
.navcrumbs button:hover{background:rgba(0,0,0,.05);text-decoration:underline;}
.navcrumbs > span{font-weight:700;color:var(--ink);padding:2px 4px;}
.navcrumbs > i{font-style:normal;color:#B8BDC6;}
@media (max-width:700px){ .navcrumbs{font-size:11.5px;margin-bottom:8px;} }`;
  document.head.appendChild(st);
})();
