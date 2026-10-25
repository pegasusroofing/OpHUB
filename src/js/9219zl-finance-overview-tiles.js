/* ============================================================
   OpHUB Finance — project Overview tiles, round 2 (25 Oct 2026, Andy):
   - eight fixed tiles: Contract Value · Variations · Costs · Profit %
                        Applied · Invoiced · Overdue · Retention
   - each ⋯ only offers versions of its own tile (e.g. Costs → Materials / Labour / Plant…;
     Variations → Approved (default) / Unapproved / All);
   - the separate Variations & Day Works row underneath is gone (it's the Variations tile now);
   - ⋯ menus are kept on the screen (on an iPhone the first one used to open off the left edge);
   - company overheads (OHP): a company admin sets a % in Finance › Settings (a project can
     have its own in Project Admin). It is charged on the work valued and comes off profit
     and margin everywhere the forecast is used (Overview, reports, budgets).
   ============================================================ */

/* ---------- Company overheads (OHP) ---------- */
function finOhpPct(jf){
  const j = jf && jf.ohp_pct;
  if(j!=null && j!=='' && !isNaN(j)) return Number(j);
  const s = typeof FIN_SETTINGS!=='undefined' && FIN_SETTINGS && FIN_SETTINGS.ohp_pct;
  return s!=null && s!=='' && !isNaN(s) ? Number(s) : 0;
}
(function(){
  const base = finJobForecast;
  finJobForecast = function(b, siteId){
    const fc = base.apply(this, arguments);
    const p = finOhpPct(fc.jf);
    fc.ohpPct = p;
    fc.ohpToDate = finRound((fc.sales||0)*p/100);
    fc.ohpOnValuation = finRound((fc.valuation||0)*p/100);
    fc.ohpForecast = finRound((fc.ffa||0)*p/100);
    fc.grossProfitToDate = finRound((fc.sales||0) - (fc.costToDate||0));     // before overheads
    if(p){
      fc.salesMargin = finRound(fc.salesMargin - fc.ohpToDate);
      fc.salesMarginPct = fc.sales ? finRound(fc.salesMargin/fc.sales*100) : null;
      fc.marginToDate = finRound(fc.marginToDate - fc.ohpOnValuation);
      fc.marginToDatePct = fc.valuation ? finRound(fc.marginToDate/fc.valuation*100) : null;
      fc.forecastMargin = finRound(fc.forecastMargin - fc.ohpForecast);
      fc.forecastMarginPct = fc.ffa ? finRound(fc.forecastMargin/fc.ffa*100) : null;
    }
    fc.profitToDate = fc.salesMargin; fc.profitToDatePct = fc.salesMarginPct;
    return fc;
  };
})();

// The company OHP % lives in the Finance settings — make sure they're loaded whenever a job book is.
(function(){
  const base = finLoadBook;
  finLoadBook = async function(){
    const [b] = await Promise.all([base.apply(this, arguments), (typeof FIN_SETTINGS==='undefined' || !FIN_SETTINGS) && typeof finLoadSettings==='function' ? finLoadSettings().catch(()=>null) : null]);
    return b;
  };
})();

/* ---------- the eight tiles ---------- */
const FIN_OV2_LS = 'ophub.finOv2';
const FIN_OV2 = [
  {slot:'cv',  t:'Contract Value', ts:'Contract', def:'contract', opts:[['contract','Contract Value'],['cva','Contract + Approved Variations'],['ffa','Forecasted Final Account']]},
  {slot:'var', t:'Variations',     def:'va', opts:[['va','Approved Variations'],['vu','Unapproved Variations'],['v','All Variations'],['da','Approved Day Works'],['d','All Day Works']]},
  {slot:'cost',t:'Costs',          def:'all', opts:[['all','All Costs To Date'],['materials','Materials'],['labour','Labour'],['plant','Plant'],['subcontract','Subcontract'],['overheads','Prelims & Site Costs'],['other','Other'],['committed','Ordered, Not Invoiced']]},
  {slot:'pr',  t:'Profit',         def:'td', opts:[['td','Profit To Date'],['fc','Forecast Profit'],['gross','Profit Before Overheads']]},
  {slot:'ap',  t:'Applied',        def:'applied', opts:[['applied','Applied To Date'],['certified','Certified To Date'],['valued','Valued To Date']]},
  {slot:'inv', t:'Invoiced',       def:'invoiced', opts:[['invoiced','Invoiced To Date'],['owed','Owed To You'],['received','Paid To Date']]},
  {slot:'od',  t:'Overdue',        def:'net', opts:[['net','Overdue (excl. VAT)'],['gross','Overdue (incl. VAT)']]},
  {slot:'ret', t:'Retention',      def:'held', opts:[['held','Held By Client'],['released','Released To Date'],['taken','Total Retention Taken']]},
];
const FIN_OV2_SHORT = {cva:'Contract + Variations', ffa:'Final Account', va:'Variations', vu:'Unapproved', v:'Variations', da:'Day Works', d:'Day Works',
  all:'Costs', materials:'Materials', labour:'Labour', plant:'Plant', subcontract:'Subcontract', overheads:'Prelims', other:'Other Costs', committed:'Ordered',
  td:'Profit', fc:'Forecast Profit', gross:'Profit (pre-OHP)', certified:'Certified', valued:'Valued', owed:'Owed', received:'Paid', released:'Released', taken:'Retention Taken'};
function finOv2Cur(){ const c = finLsGet(FIN_OV2_LS, {}); const out = {}; FIN_OV2.forEach(t=>{ out[t.slot] = t.opts.some(o=>o[0]===c[t.slot]) ? c[t.slot] : t.def; }); return out; }
window.finOv2Set = function(slot, k){ const c = finLsGet(FIN_OV2_LS, {}); c[slot] = k; finLsSet(FIN_OV2_LS, c); document.querySelectorAll('.finmb.open').forEach(x=>x.classList.remove('open')); finOvPaint(); };
function finOv2Tile(t, k, d, fc){
  const s = d.siteId, sg = sub=>`finSalesGo('${s}','${sub}')`;
  const live = (d.invs||[]).filter(i=>i.status!=='void');
  const pc = (a, b)=>b ? Math.round(a/b*1000)/10 : null;
  let v = null, sub = '', tone = 'blue', go = '', big = null;
  if(t.slot==='cv'){
    const contract = fc ? fc.contract : Number((d.jf||{}).contract_value||0);
    v = k==='contract' ? contract : !fc ? null : k==='cva' ? finRound(fc.contract + (fc.vAgreed||0)) : fc.ffa;
    sub = k==='ffa' ? 'incl. submitted variations' : 'excl. VAT'; go = `finProjTabGo('${s}','setup')`;
  } else if(t.slot==='var'){
    const r = typeof finVdTotals==='function' ? finVdTotals(s, k) : null;
    const D = typeof FIN_VD_DATA!=='undefined' && FIN_VD_DATA[s];
    if(!D || Date.now()-(D.at||0) > 3000) setTimeout(()=>finVdLoad(s), 0);
    v = r ? r.v : null; sub = r ? r.n+' '+(k[0]==='v' ? (r.n===1?'variation':'variations') : (r.n===1?'day work':'day works'))+(k.length===1?'':k[1]==='a'?' approved':' not approved') : '';
    tone = k[1]==='u' ? 'amber' : 'blue';
    go = `finBoqSub['${s}']='${k[0]==='v'?'var':'dw'}';go('#/site/${s}/finance/contract')`;
  } else if(t.slot==='cost'){
    tone = 'grey'; go = `finCosts=null;go('#/site/${s}/finance/costs')`;
    if(fc){
      v = k==='all' ? fc.costToDate : k==='committed' ? fc.committedTotal : (fc.actual||{})[k];
      if(k==='all') sub = fc.budgetTotal ? pc(fc.costToDate, fc.budgetTotal)+'% of budget' : 'No budget yet';
      else if(k==='committed') sub = 'on POs, no invoice yet';
      else { const bud = (fc.budget||{})[k]; sub = bud ? pc(v||0, bud)+'% of '+finK(bud)+' budget' : fc.costToDate ? pc(v||0, fc.costToDate)+'% of all costs' : 'to date'; }
    }
  } else if(t.slot==='pr'){
    if(fc){
      let p, m;
      if(k==='fc'){ if(fc.budgetTotal==null || fc.forecastMarginPct==null){ p = null; sub = 'Needs a budget'; go = `go('#/site/${s}/finance/budget')`; } else { p = fc.forecastMarginPct; m = fc.forecastMargin; } }
      else if(k==='gross'){ m = fc.grossProfitToDate; p = fc.sales ? pc(m, fc.sales) : null; }
      else { m = fc.profitToDate; p = fc.sales ? fc.profitToDatePct : null; }
      if(p==null && !sub) sub = 'Nothing valued yet';
      if(p!=null) p = Math.round(p*10)/10;
      big = p==null ? '—' : p+'%';
      if(p!=null) sub = finMoney(m, 0)+(k==='td' && fc.ohpPct ? ' after '+fc.ohpPct+'% OHP' : k==='gross' ? ' before OHP' : k==='fc' ? ' forecast' : ' to date');
      v = p; tone = p==null ? 'grey' : p<0 ? 'red' : 'green';
      if(!go) go = `go('#/site/${s}/finance/budget')`;
    }
  } else if(t.slot==='ap'){
    v = !fc ? null : k==='applied' ? fc.applied : k==='certified' ? fc.certified : fc.sales;
    const p = fc ? pc(v||0, fc.ffa) : null; sub = p!=null ? p+'% of final account' : ''; go = sg('apps');
  } else if(t.slot==='inv'){
    if(k==='invoiced') v = finRound(live.filter(i=>i.status!=='draft').reduce((a,i)=>a+Number(i.net||0),0));
    else if(k==='owed') v = finRound(live.reduce((a,i)=>a+finInvOutstandingNet(i),0));
    else v = finRound(live.reduce((a,i)=>{ const tt = Number(i.total||0); return a + (tt ? Math.min(Number(i.paid||0), tt)*Number(i.net||0)/tt : 0); },0));
    sub = 'excl. VAT'; tone = 'green'; go = sg('invoices');
  } else if(t.slot==='od'){
    const od = live.filter(finInvOverdue);
    v = finRound(od.reduce((a,i)=>a+(k==='gross' ? finInvOutstanding(i) : finInvOutstandingNet(i)),0));
    sub = od.length ? od.length+' invoice'+(od.length===1?'':'s') : (k==='gross'?'incl. VAT':'excl. VAT'); tone = v>0 ? 'red' : 'grey'; go = sg('invoices');
  } else if(t.slot==='ret'){
    const apps = d.apps||[], taken = finRetentionHeld(apps), still = finRetentionStillHeld(apps, d.jf, d.invs);
    v = k==='held' ? still : k==='taken' ? taken : finRound(Math.max(0, taken - still) + finRetentionPeakDrop(apps));
    sub = k==='held' ? 'still with the client' : k==='taken' ? 'on the latest certificate' : 'invoiced or applied for'; tone = 'amber'; go = sg('retention');
  }
  const title = k===t.def ? t.t : (FIN_OV2_SHORT[k] || t.t);
  const shortT = k===t.def ? (t.ts || t.t) : title;
  return `<div class="finov-box ${tone}" onclick="${escapeHtml(go)}">
      <div class="finov-row"><span class="finov-bl"><span class="finov-lt">${escapeHtml(title)}</span><span class="finov-st">${escapeHtml(shortT)}</span></span>${finPickMenuHtml(t.t, t.opts, k, 'finOv2Set', t.slot)}</div>
      <b>${big!=null ? big : v==null ? '…' : finK(v)}</b><span class="finov-bs">${escapeHtml(sub||'')}</span></div>`;
}
// Retention given back through an application (lower % on a later certificate) — highest certificate retention less the latest.
function finRetentionPeakDrop(apps){
  const c = (apps||[]).filter(a=>a.cert_retention!=null && a.status!=='void');
  if(!c.length) return 0;
  const peak = Math.max(...c.map(a=>Number(a.cert_retention||0)));
  return finRound(Math.max(0, peak - finRetentionHeld(apps)));
}
function finOvBlockHtml(siteId, d, fc){
  const cur = finLsGet(FIN_OV_LS, FIN_OV_DEF);
  const hk = FIN_OV_H.some(o=>o[0]===cur.h) ? cur.h : 'ffa';
  const contract = fc ? fc.contract : Number((d.jf||{}).contract_value||0);
  const hv = hk==='contract' ? contract : (fc ? fc.ffa : null);
  const valued = fc ? fc.sales : null;
  let mPct = null, mLabel = '';
  if(fc && fc.budgetTotal!=null && fc.forecastMarginPct!=null){ mPct = fc.forecastMarginPct; mLabel = 'margin'; }
  else if(fc && fc.sales){ mPct = fc.profitToDatePct; mLabel = 'margin to date'; }
  if(mPct!=null) mPct = Math.round(mPct*10)/10;
  const pill = mPct==null ? `<span class="finov-pill grey" onclick="event.stopPropagation();go('#/site/${siteId}/finance/budget')">Set a budget</span>` : `<span class="finov-pill ${mPct<0?'red':'green'}">${mPct}% ${mLabel}</span>`;
  const pv = fc && fc.ffa ? Math.max(0, Math.min(100, Math.round(valued/fc.ffa*100))) : 0;
  const subLine = fc ? `Contract ${finMoney(fc.contract, 0)} + ${finMoney(fc.vAgreed||0, 0)} agreed variations${fc.vPending ? ' + '+finMoney(fc.vPending, 0)+' submitted' : ''}${fc.budgetTotal!=null ? ' · forecast profit '+finMoney(fc.forecastMargin, 0) : ''}${fc.ohpPct ? ' (after '+fc.ohpPct+'% overheads)' : ''}` : '';
  const head = `<div class="card finov-head" onclick="finProjTabGo('${siteId}','setup')">
    <div class="finov-row"><span class="finov-lbl">${escapeHtml(FIN_OV_H.find(o=>o[0]===hk)[1])}</span>${finPickMenuHtml('Headline', FIN_OV_H, hk, 'finOvSet', 'h')}</div>
    <div class="finov-row"><span class="finov-big">${hv==null ? '…' : finMoney(hv, 0)}</span>${pill}</div>
    ${subLine ? `<div class="finov-sm">${subLine}</div>` : ''}
    <div class="finov-bar"><i style="width:${pv}%"></i></div>
    <div class="finov-row finov-sm"><span>${valued==null ? '' : finMoney(valued, 0)+' valued ('+pv+'%)'}</span><span>${fc && fc.ffa ? finMoney(Math.max(0, fc.ffa - valued), 0)+' to go' : ''}</span></div>
  </div>`;
  const cur2 = finOv2Cur();
  const boxes = FIN_OV2.map(t=>finOv2Tile(t, cur2[t.slot], d, fc)).join('');
  const warn = fc && fc.budgetSource==='schedule' && fc.schedCostedN < fc.schedItemsN ? `<div class="finnote warn">${fc.schedItemsN - fc.schedCostedN} Bill of Quantities line${fc.schedItemsN - fc.schedCostedN===1?' has':'s have'} no cost price yet, so the budget is low.</div>` : '';
  return `${head}<div class="finov-grid">${boxes}</div>${warn}
    <div class="finsumbtns finov-btns">
      <button type="button" class="ghostbtn" onclick="finDsTab='summary';go('#/site/${siteId}/finance/summary')">Full Summary</button>
      <button type="button" class="ghostbtn" onclick="go('#/site/${siteId}/finance/reports')">Reports</button>
      <button type="button" class="ghostbtn" onclick="go('#/site/${siteId}/finance/budget')">Budgets</button>
    </div>`;
}
// The variations tile fills in once its two small lists have loaded.
(function(){
  const base = finVdLoad;
  finVdLoad = async function(siteId){
    if(finVdLoad.__busy && finVdLoad.__busy[siteId]) return;
    (finVdLoad.__busy = finVdLoad.__busy || {})[siteId] = 1;
    try{ await base.apply(this, arguments); } finally { delete finVdLoad.__busy[siteId]; }
    if(__finOv && __finOv.siteId===siteId && document.getElementById('finOvTop')) finOvPaint();
  };
})();

/* ---------- keep ⋯ menus on the screen ---------- */
function finMenuClamp(){
  document.querySelectorAll('.finmb.open .finmb-m').forEach(m=>{
    m.style.transform = ''; m.style.maxWidth = 'calc(100vw - 16px)';
    const r = m.getBoundingClientRect(), vw = document.documentElement.clientWidth;
    let dx = 0;
    if(r.left < 8) dx = 8 - r.left; else if(r.right > vw - 8) dx = (vw - 8) - r.right;
    if(dx) m.style.transform = 'translateX('+Math.round(dx)+'px)';
    const rb = m.getBoundingClientRect();
    if(rb.bottom > window.innerHeight - 8 && rb.top > rb.height + 40){ m.style.top = 'auto'; m.style.bottom = '26px'; }
  });
}
document.addEventListener('click', e=>{ if(e.target && e.target.closest && e.target.closest('.finmb-b')) requestAnimationFrame(finMenuClamp); }, true);
window.addEventListener('resize', ()=>{ if(document.querySelector('.finmb.open')) finMenuClamp(); });
(function(){
  const st = document.createElement('style');
  st.textContent = `.finov .finvdrow{display:none !important;}
.finov-box .finmb-m{min-width:200px;}
.finov-box > b{line-height:1.15;}
.finov-st{display:none;} @media (max-width:700px){ .finov-lt{display:none;} .finov-st{display:inline;} }
html.desk .finov-grid{grid-template-columns:repeat(4,minmax(0,1fr)) !important;gap:8px !important;}
html.desk .finov-box{padding:10px 12px !important;}
html.desk .finov-bs{white-space:normal;}`;
  document.head.appendChild(st);
})();
