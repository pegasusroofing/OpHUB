/* ============================================================
   OpHUB Finance — project Overview: one block (24 Oct 2026, Andy picked "option 1 layout
   with option 2 boxes"). Replaces the four coloured tiles and the Project Summary card:
   - headline card: value (⋯ Forecasted Final Account / Contract Value), margin pill,
     contract + variations line, progress bar (valued vs value);
   - six colour boxes, each with a ⋯ to choose what it shows;
   - the Variations & Day Works row, then Full Summary · Reports · Budgets.
   ============================================================ */
const FIN_OV_LS = 'ophub.finOvBoxes';
const FIN_OV_DEF = {h:'ffa', b1:'valued', b2:'cost', b3:'profit', b4:'margin', b5:'owed', b6:'overdue', b7:'retention', b8:'invoiced'};
const FIN_OV_OPTS = FIN_TOP_OPTS.concat([['margin','Margin % To Date'],['fmargin','Forecasted Margin %']]);
const FIN_OV_H = [['ffa','Forecasted Final Account'],['contract','Contract Value']];
const FIN_OV_SHORT = {contract:'Contract', ffa:'Final Account', valued:'Valued', applied:'Applied', certified:'Certified', invoiced:'Invoiced', received:'Received', owed:'Owed', overdue:'Overdue', retention:'Retention', cost:'Cost', profit:'Profit', fprofit:'Forecast Profit', margin:'Margin', fmargin:'Forecast Margin'};
let __finOv = null;  // {siteId, d}
function finK(v){
  if(v==null || isNaN(v)) return '—';
  const a = Math.abs(v), sg = v<0 ? '−' : '';
  if(a >= 1000000) return sg+'£'+(a/1000000).toFixed(2).replace(/\.?0+$/,'')+'m';
  if(a >= 1000) return sg+'£'+(a/1000).toFixed(a>=100000?0:1)+'k';
  return sg+'£'+Math.round(a);
}
// Margin boxes are percentages; everything else comes from the top-tile figures.
function finOvVal(k, d, fc){
  if(k==='margin'){ if(!fc) return {v:null}; if(!fc.sales) return {v:null, note:'Nothing valued yet'}; return {v:Math.round((fc.sales-fc.costToDate)/fc.sales*1000)/10, pct:1, go:`finProjTabGo('${d.siteId}','overview')`}; }
  if(k==='fmargin'){ if(!fc) return {v:null}; if(fc.budgetTotal==null || fc.forecastMarginPct==null) return {v:null, note:'Needs a budget', go:`go('#/site/${d.siteId}/finance/budget')`}; return {v:fc.forecastMarginPct, pct:1, go:`go('#/site/${d.siteId}/finance/budget')`}; }
  return finTopVal(k, d, fc) || {};
}
function finOvTone(k, v){
  if(k==='margin' || k==='fmargin') return v<0 ? 'red' : 'green';
  if(k==='overdue') return v>0 ? 'red' : 'grey';
  if(k==='retention') return 'amber';
  if(k==='cost') return 'grey';
  if(k==='profit' || k==='fprofit') return v<0 ? 'red' : 'green';
  if(k==='owed' || k==='received') return 'green';
  return 'blue';
}
function finOvSub(k, d, fc, r){
  const pct = (a, b)=>b ? Math.round(a/b*1000)/10 : null;
  if(!fc && ['valued','applied','certified','ffa','cost','profit','fprofit'].includes(k)) return '';
  if(k==='valued' || k==='applied' || k==='certified'){ const p = pct(r.v||0, fc.ffa); return p!=null ? p+'% done' : ''; }
  if(k==='cost') return fc.budgetTotal ? pct(fc.costToDate, fc.budgetTotal)+'% budget' : 'No budget yet';
  if(k==='profit'){ return 'on work valued'; }
  if(k==='margin') return r.v==null ? '' : 'on work valued';
  if(k==='fmargin') return r.v==null ? '' : 'forecast';
  if(k==='fprofit') return fc.forecastMarginPct!=null ? fc.forecastMarginPct+'%' : 'Needs a budget';
  if(k==='overdue'){ const n = (d.invs||[]).filter(i=>i.status!=='void').filter(finInvOverdue).length; return n ? n+' invoice'+(n===1?'':'s') : 'excl. VAT'; }
  if(k==='retention') return 'held';
  if(k==='owed' || k==='invoiced' || k==='received') return 'excl. VAT';
  if(k==='contract') return 'excl. VAT';
  return '';
}
function finOvBlockHtml(siteId, d, fc){
  const cur = finLsGet(FIN_OV_LS, FIN_OV_DEF);
  const hk = FIN_OV_H.some(o=>o[0]===cur.h) ? cur.h : 'ffa';
  const contract = fc ? fc.contract : Number((d.jf||{}).contract_value||0);
  const hv = hk==='contract' ? contract : (fc ? fc.ffa : null);
  const valued = fc ? fc.sales : null;
  // margin: forecast if there's a budget, otherwise profit on work valued
  let mPct = null, mLabel = '';
  if(fc && fc.budgetTotal!=null && fc.forecastMarginPct!=null){ mPct = fc.forecastMarginPct; mLabel = 'margin'; }
  else if(fc && fc.sales){ mPct = Math.round((fc.sales - fc.costToDate)/fc.sales*1000)/10; mLabel = 'margin to date'; }
  const pill = mPct==null ? `<span class="finov-pill grey" onclick="event.stopPropagation();go('#/site/${siteId}/finance/budget')">Set a budget</span>` : `<span class="finov-pill ${mPct<0?'red':'green'}">${mPct}% ${mLabel}</span>`;
  const pv = fc && fc.ffa ? Math.max(0, Math.min(100, Math.round(valued/fc.ffa*100))) : 0;
  const subLine = fc ? `Contract ${finMoney(fc.contract, 0)} + ${finMoney(fc.vAgreed||0, 0)} agreed variations${fc.budgetTotal!=null ? ' · forecast profit '+finMoney(fc.forecastMargin, 0) : ''}` : '';
  const head = `<div class="card finov-head" onclick="finProjTabGo('${siteId}','setup')">
    <div class="finov-row"><span class="finov-lbl">${escapeHtml(FIN_OV_H.find(o=>o[0]===hk)[1])}</span>${finPickMenuHtml('Headline', FIN_OV_H, hk, 'finOvSet', 'h')}</div>
    <div class="finov-row"><span class="finov-big">${hv==null ? '…' : finMoney(hv, 0)}</span>${pill}</div>
    ${subLine ? `<div class="finov-sm">${subLine}</div>` : ''}
    <div class="finov-bar"><i style="width:${pv}%"></i></div>
    <div class="finov-row finov-sm"><span>${valued==null ? '' : finMoney(valued, 0)+' valued ('+pv+'%)'}</span><span>${fc && fc.ffa ? finMoney(Math.max(0, fc.ffa - valued), 0)+' to go' : ''}</span></div>
  </div>`;
  const boxes = ['b1','b2','b3','b4','b5','b6','b7','b8'].map(slot=>{
    const k = FIN_OV_OPTS.some(o=>o[0]===cur[slot]) ? cur[slot] : FIN_OV_DEF[slot];
    const r = finOvVal(k, d, fc);
    return `<div class="finov-box ${finOvTone(k, r.v||0)}" onclick="${escapeHtml(r.go||'')}">
      <div class="finov-row"><span class="finov-bl">${escapeHtml(FIN_OV_SHORT[k]||k)}</span>${finPickMenuHtml('Show in this box', FIN_OV_OPTS, k, 'finOvSet', slot)}</div>
      <b>${r.v==null ? (r.note ? '—' : '…') : (r.pct ? r.v+'%' : finK(r.v))}</b><span class="finov-bs">${escapeHtml(finOvSub(k, d, fc, r) || (r.v==null && r.note ? r.note : ''))}</span></div>`;
  }).join('');
  const warn = fc && fc.budgetSource==='schedule' && fc.schedCostedN < fc.schedItemsN ? `<div class="finnote warn">${fc.schedItemsN - fc.schedCostedN} Bill of Quantities line${fc.schedItemsN - fc.schedCostedN===1?' has':'s have'} no cost price yet, so the budget is low.</div>` : '';
  return `${head}<div class="finov-grid">${boxes}</div>
    <div class="finvdrow" id="finVdRow" data-site="${siteId}">${finVdRowHtml(siteId)}</div>${warn}
    <div class="finsumbtns finov-btns">
      <button type="button" class="ghostbtn" onclick="finDsTab='summary';go('#/site/${siteId}/finance/summary')">Full Summary</button>
      <button type="button" class="ghostbtn" onclick="go('#/site/${siteId}/finance/reports')">Reports</button>
      <button type="button" class="ghostbtn" onclick="go('#/site/${siteId}/finance/budget')">Budgets</button>
    </div>`;
}
function finOvPaint(){
  const el = document.getElementById('finOvTop'); if(!el || !__finOv) return;
  const fcL = window.__finFcLast && window.__finFcLast.siteId===__finOv.siteId ? window.__finFcLast.fc : null;
  el.innerHTML = finOvBlockHtml(__finOv.siteId, __finOv.d, fcL);
}
window.finOvSet = function(slot, k){
  const cur = finLsGet(FIN_OV_LS, FIN_OV_DEF); cur[slot] = k; finLsSet(FIN_OV_LS, cur);
  finOvPaint();
};
(function(){
  // Overview: the old coloured tiles become the new block's slot.
  const base = finJobOverviewHtml;
  finJobOverviewHtml = function(d){
    const html = base.apply(this, arguments);
    __finOv = {siteId:d.siteId, d};
    const fcL = window.__finFcLast && window.__finFcLast.siteId===d.siteId ? window.__finFcLast.fc : null;
    const block = `<div id="finOvTop" class="finov">${finOvBlockHtml(d.siteId, d, fcL)}</div>`;
    return block + html;   // old tiles are hidden by CSS
  };
  // The Project Summary card is now part of the block above.
  const fcHtml = finForecastCardHtml;
  finForecastCardHtml = function(siteId, fc){
    fcHtml.apply(this, arguments);           // keeps its side effects (starting point, last figures)
    window.__finFcLast = {siteId, fc};
    setTimeout(finOvPaint, 0);
    return '';
  };
  const st = document.createElement('style');
  st.textContent = `#finTopTiles{display:none !important;}
.finov{margin-bottom:14px;}
.finov-head{cursor:pointer;padding:14px 16px !important;margin-bottom:10px !important;}
.finov-row{display:flex;justify-content:space-between;align-items:center;gap:8px;}
.finov-lbl{font-size:10.5px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--slate);}
.finov-big{font-size:30px;font-weight:800;letter-spacing:-.5px;line-height:1.15;font-variant-numeric:tabular-nums;}
.finov-sm{font-size:12px;color:var(--slate);margin-top:2px;}
.finov-pill{display:inline-block;font-size:12.5px;font-weight:800;border-radius:10px;padding:4px 10px;white-space:nowrap;}
.finov-pill.green{background:#E7F6EC;color:#1E7A43;} .finov-pill.red{background:#FDECEC;color:#B91C1C;} .finov-pill.grey{background:#F1F2F4;color:#4B5563;cursor:pointer;}
.finov-bar{height:8px;background:#EEF0F3;border-radius:5px;overflow:hidden;margin-top:10px;} .finov-bar i{display:block;height:100%;background:var(--brand1,#E3262B);border-radius:5px;}
.finov-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-bottom:10px;}
.finov-box{border-radius:12px;padding:8px 8px;border:1px solid;cursor:pointer;min-width:0;}
.finov-box > b{display:block;font-size:16px;font-weight:800;letter-spacing:-.3px;margin:1px 0;font-variant-numeric:tabular-nums;white-space:nowrap;}
.finov-bl{font-size:11px;font-weight:700;color:#4B5563;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.finov-bs{display:block;font-size:10.5px;color:#4B5563;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.finov-box{position:relative;} .finov-box .finmb{position:absolute;top:5px;right:5px;} .finov-box .finmb-b{transform:scale(.8);transform-origin:top right;} .finov-box .finov-row{padding-right:20px;}
.finov .finvdrow{margin:0 0 10px;}
.finov-box.blue{background:#EEF4FF;border-color:#D6E2FF;} .finov-box.blue > b{color:#1D4ED8;}
.finov-box.green{background:#EAF7EF;border-color:#CDEBD8;} .finov-box.green > b{color:#1E7A43;}
.finov-box.red{background:#FDEEEE;border-color:#F7D4D4;} .finov-box.red > b{color:#C81E1E;}
.finov-box.amber{background:#FFF8E6;border-color:#F6E3B5;} .finov-box.amber > b{color:#B45309;}
.finov-box.grey{background:#F6F7F9;border-color:#E6E8EC;} .finov-box.grey > b{color:#111827;}
.finov-btns{border-top:0 !important;padding-top:0 !important;margin-top:0 !important;}
html.desk .finov-grid{grid-template-columns:repeat(8,minmax(0,1fr));}
html.desk .finov-box > b{font-size:22px;}
@media (max-width:700px){ .finov-box .finmb{top:2px;right:2px;} .finov-box .finmb-b{transform:scale(.7);} .finov-box .finov-row{padding-right:16px;} .finov-bl{font-size:10.5px;} .finov-bs{white-space:normal;line-height:1.2;} }`;
  document.head.appendChild(st);
})();
