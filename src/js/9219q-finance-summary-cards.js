/* ============================================================
   OpHUB Finance — a project's Overview figures you can change
   (23 Oct 2026, Andy: "can we have these tabs be selectable or changeable",
   "Expected … should be Forecasted", "capitalise each word", "Work Valued To Date,
   Cost To Date, Profit To Date, Profit To Date % to be the only rows on show, with the
   ellipsis to change it from value to date, forecast FA, applied to date etc on each").
   Each of the four coloured tiles and the four summary cards has a ⋯ to pick what it
   shows. Choices are remembered on this device.
   ============================================================ */
const FIN_SUM_LS = 'ophub.finSumCards', FIN_TOP_LS = 'ophub.finTopTiles';
function finLsGet(k, def){ try{ return Object.assign({}, def, JSON.parse(localStorage.getItem(k)||'{}')||{}); }catch(e){ return Object.assign({}, def); } }
function finLsSet(k, o){ try{ localStorage.setItem(k, JSON.stringify(o)); }catch(e){} }

// One ⋯ menu. pick = global function name called with (slot, key).
function finPickMenuHtml(title, opts, cur, pick, slot){
  return `<span class="finmb finpick"><button type="button" class="finmb-b" aria-label="${escapeHtml(title)}" onclick="event.stopPropagation();const o=this.parentNode.classList.contains('open');document.querySelectorAll('.finmb.open').forEach(x=>x.classList.remove('open'));if(!o)this.parentNode.classList.add('open')">⋯</button>
    <span class="finmb-m" onclick="event.stopPropagation()"><span class="finmb-h">${escapeHtml(title)}</span>
      ${opts.map(([k,l])=>`<button type="button" class="${cur===k?'on':''}" onclick="${pick}('${slot}','${k}')">${cur===k?'✓ ':''}${escapeHtml(l)}</button>`).join('')}
    </span></span>`;
}

/* ---------- 1. The four coloured tiles at the top ---------- */
const FIN_TOP_OPTS = [
  ['contract','Contract Value'], ['ffa','Forecasted Final Account'], ['valued','Work Valued To Date'],
  ['applied','Applied To Date'], ['certified','Certified To Date'], ['invoiced','Invoiced To Date'],
  ['received','Received To Date'], ['owed','Owed To You'], ['overdue','Overdue'], ['retention','Retention Held By Client'],
  ['cost','Cost To Date'], ['profit','Profit To Date'], ['fprofit','Forecasted Profit']];
const FIN_TOP_DEF = {t1:'contract', t2:'owed', t3:'overdue', t4:'retention'};
let __finTop = null;   // {siteId, d}
function finTopVal(k, d, fc){
  const live = d.invs.filter(i=>i.status!=='void');
  const s = d.siteId, sg = sub=>`finSalesGo('${s}','${sub}')`, tg = t=>`finProjTabGo('${s}','${t}')`;
  const wait = {v:null, go:''};
  if(k==='contract') return {v:Number(d.jf.contract_value||0), go:tg('setup')};
  if(k==='owed') return {v:live.reduce((t,i)=>t+finInvOutstandingNet(i),0), go:sg('invoices'), note:'Excl. VAT'};
  if(k==='overdue'){ const v = live.filter(finInvOverdue).reduce((t,i)=>t+finInvOutstandingNet(i),0); return {v, go:sg('invoices'), hot:v>0, note:'Excl. VAT'}; }
  if(k==='retention') return {v:typeof finRetentionHeld==='function' ? finRetentionHeld(d.apps) : 0, go:sg('retention')};
  if(k==='invoiced') return {v:finRound(live.filter(i=>i.status!=='draft').reduce((t,i)=>t+Number(i.net||0),0)), go:sg('invoices'), note:'Excl. VAT'};
  if(k==='received') return {v:finRound(live.reduce((t,i)=>t+Number(i.paid||0),0)), go:sg('invoices'), note:'Excl. VAT'};
  if(!fc) return wait;
  if(k==='ffa') return {v:fc.ffa, go:`go('#/site/${s}/finance/budget')`};
  if(k==='valued') return {v:fc.sales, go:sg('apps')};
  if(k==='applied') return {v:fc.applied, go:sg('apps')};
  if(k==='certified') return {v:fc.certified, go:sg('apps')};
  if(k==='cost') return {v:fc.costToDate, go:`finCosts=null;go('#/site/${s}/finance/costs')`};
  if(k==='profit'){ const v = finRound(fc.sales - fc.costToDate); return {v, go:'', hot:v<0}; }
  if(k==='fprofit') return fc.budgetTotal==null ? {v:null, go:`go('#/site/${s}/finance/budget')`, note:'Needs A Budget'} : {v:fc.forecastMargin, go:`go('#/site/${s}/finance/budget')`, hot:fc.forecastMargin<0};
  return wait;
}
function finTopTilesHtml(d, fc){
  const cur = finLsGet(FIN_TOP_LS, FIN_TOP_DEF);
  return ['t1','t2','t3','t4'].map(slot=>{
    const k = FIN_TOP_OPTS.some(o=>o[0]===cur[slot]) ? cur[slot] : FIN_TOP_DEF[slot];
    const lab = FIN_TOP_OPTS.find(o=>o[0]===k)[1], r = finTopVal(k, d, fc);
    return `<div class="pmstat fintop" onclick="${escapeHtml(r.go||'')}">${finPickMenuHtml('Show on this tile', FIN_TOP_OPTS, k, 'finTopSet', slot)}
      <b${r.hot?' class="hot"':''}>${r.v==null ? (r.note ? '—' : '…') : finMoney(r.v, 0)}</b><span>${escapeHtml(lab)}${r.note && r.v!=null ? ` <em class="fintop-n">${escapeHtml(r.note)}</em>` : (r.v==null && r.note ? ` <em class="fintop-n">${escapeHtml(r.note)}</em>` : '')}</span></div>`;
  }).join('');
}
function finTopPaint(){
  const el = document.getElementById('finTopTiles'); if(!el || !__finTop) return;
  const fcL = window.__finFcLast && window.__finFcLast.siteId===__finTop.siteId ? window.__finFcLast.fc : null;
  el.innerHTML = finTopTilesHtml(__finTop.d, fcL);
}
window.finTopSet = function(slot, k){
  const cur = finLsGet(FIN_TOP_LS, FIN_TOP_DEF); cur[slot] = k; finLsSet(FIN_TOP_LS, cur);
  finTopPaint();
};
(function(){
  const base = finJobOverviewHtml;
  finJobOverviewHtml = function(d){
    const html = base.apply(this, arguments);
    __finTop = {siteId:d.siteId, d};
    const fcL = window.__finFcLast && window.__finFcLast.siteId===d.siteId ? window.__finFcLast.fc : null;
    // Swap the fixed tiles for the changeable ones.
    const tiles = `<div class="pmstats finstats" id="finTopTiles">${finTopTilesHtml(d, fcL)}</div>`;
    const re = /<div class="pmstats finstats">[\s\S]*?Retention held by client<\/span><\/div>\s*<\/div>/;
    return re.test(html) ? html.replace(re, ()=>tiles) : tiles + html;
  };
})();

/* ---------- 2. Project Summary: four cards, each with a ⋯ ---------- */
const FIN_SUM_DEF = {v:'valued', c:'cost', p:'valued', pp:'valued'};
const FIN_SUM_V = [['valued','Work Valued To Date'],['applied','Applied To Date'],['certified','Certified To Date'],['invoiced','Invoiced To Date'],['ffa','Forecasted Final Account'],['contract','Contract Value']];
const FIN_SUM_C = [['cost','Cost To Date'],['ordered','Cost To Date Incl. Ordered'],['fcost','Forecasted Final Cost'],['budget','Budget']];
const FIN_SUM_P = [['valued','On Work Valued To Date'],['applied','On Applied To Date'],['certified','On Certified To Date'],['invoiced','On Invoiced To Date'],['forecast','Forecasted (Final Account − Final Cost)']];
const FIN_SUM_ON = {valued:'Work Valued To Date', applied:'Applied To Date', certified:'Certified To Date', invoiced:'Invoiced To Date'};
function finSumValueOf(fc, k){ return k==='applied' ? fc.applied||0 : k==='certified' ? fc.certified||0 : k==='invoiced' ? fc.invoiced||0 : fc.sales||0; }
finForecastCardHtml = function(siteId, fc){
  window.__finFcLast = {siteId, fc};
  setTimeout(finTopPaint, 0);
  const cur = finLsGet(FIN_SUM_LS, FIN_SUM_DEF);
  const pctCol = p=>p==null || Math.abs(p)<0.005 ? '' : (p<0 ? 'color:var(--red);' : 'color:var(--ok);');
  const diff = (now, orig)=>orig==null || now==null ? '' : (Math.abs(now-orig) < 0.5 ? '' : ` <i class="${now>orig?'up':'down'}">${now>orig?'+':'−'}${finMoney(Math.abs(now-orig), 0)}</i>`);
  const bar = (p, warn, tone)=>{ const v = p==null ? 0 : Math.max(0, Math.min(100, p)); return `<div class="finbar ${warn?'warn':''} ${tone||''}"><span style="width:${v}%;"></span></div>`; };
  const ff = (l, r)=>`<span class="fintile-ff"><span>${l}</span><b>${r}</b></span>`;
  const tile = (label, menu, val, foot, extra, style)=>`<div class="fintile"><span class="fintile-l">${label} ${menu}</span><b style="${style||''}">${val}</b>${extra||''}<span class="fintile-f">${foot}</span></div>`;
  const pick = (slot, opts)=>{ const k = opts.some(o=>o[0]===cur[slot]) ? cur[slot] : FIN_SUM_DEF[slot]; return k; };
  const vk = pick('v', FIN_SUM_V), ck = pick('c', FIN_SUM_C), pk = pick('p', FIN_SUM_P), ppk = pick('pp', FIN_SUM_P);
  const noBudget = fc.budgetTotal==null;

  // Value
  let vT;
  { const lab = FIN_SUM_V.find(o=>o[0]===vk)[1], m = finPickMenuHtml('Show', FIN_SUM_V, vk, 'finSumSet', 'v');
    if(vk==='ffa') vT = tile(lab, m, finMoney(fc.ffa, 0), fc.origValue!=null ? ff('Original', finMoney(fc.origValue, 0)) : ff('Contract + Variations', finMoney(fc.ffa, 0)), diff(fc.ffa, fc.origValue));
    else if(vk==='contract') vT = tile(lab, m, finMoney(fc.contract, 0), ff('Agreed Variations', finMoney(fc.vAgreed, 0)));
    else { const v = finSumValueOf(fc, vk), p = fc.ffa ? finRound(v/fc.ffa*100) : null;
      vT = tile(lab, m, finMoney(v, 0), ff('Of Forecasted Final Account', finPctTxt(p))+bar(p, false, 'blue')); } }

  // Cost
  let cT;
  { const lab = FIN_SUM_C.find(o=>o[0]===ck)[1], m = finPickMenuHtml('Show', FIN_SUM_C, ck, 'finSumSet', 'c');
    const setB = `<a href="#/site/${siteId}/finance/budget">Set A Budget</a>`;
    if(ck==='cost'||ck==='ordered'){ const v = ck==='cost' ? fc.costToDate : finRound(fc.costToDate + fc.committedTotal), p = fc.budgetTotal ? finRound(v/fc.budgetTotal*100) : null;
      const salesP = fc.ffa ? finRound(fc.sales/fc.ffa*100) : null;
      cT = tile(lab, m, finMoney(v, 0), (fc.budgetTotal ? ff('Of Budget', finPctTxt(p)) : ff('Budget', setB))+bar(p, p!=null && salesP!=null && p > salesP + 5, 'tan'),
        ck==='cost' && fc.committedTotal ? `<span class="fintile-x">+ ${finMoney(fc.committedTotal, 0)} Ordered, Not Invoiced</span>` : ''); }
    else if(ck==='fcost') cT = tile(lab, m, finMoney(fc.forecastCost, 0), fc.budgetTotal!=null ? ff('Budget', finMoney(fc.budgetTotal, 0)) : ff('Budget', setB), fc.budgetTotal!=null ? diff(fc.forecastCost, fc.budgetTotal) : '');
    else cT = tile(lab, m, noBudget ? '—' : finMoney(fc.budgetTotal, 0), noBudget ? setB : (fc.origCost!=null ? ff('Original', finMoney(fc.origCost, 0)) : (fc.budgetSource==='schedule' ? 'From The Bill Of Quantities' : '&nbsp;')), noBudget ? '' : diff(fc.budgetTotal, fc.origCost)); }

  // Profit and Profit %
  const prof = k=>{
    if(k==='forecast') return noBudget ? null : {mg:fc.forecastMargin, pct:fc.forecastMarginPct, on:fc.ffa};
    const on = finSumValueOf(fc, k), mg = finRound(on - fc.costToDate);
    return {mg, pct: on ? finRound(mg/on*100) : null, on};
  };
  let pT, ppT;
  { const r = prof(pk), m = finPickMenuHtml('Profit Measured', FIN_SUM_P, pk, 'finSumSet', 'p');
    if(pk==='forecast') pT = !r ? tile('Forecasted Profit', m, '—', 'Needs A Budget') : tile('Forecasted Profit', m, finMoney(r.mg, 0), fc.origMargin!=null ? ff('Original', finMoney(fc.origMargin, 0)) : ff('On', finMoney(r.on, 0)), diff(r.mg, fc.origMargin), pctCol(r.mg));
    else { const expP = !noBudget && fc.forecastMargin ? finRound(r.mg/fc.forecastMargin*100) : null;
      pT = tile('Profit To Date', m, finMoney(r.mg, 0), (expP!=null ? ff('Of Forecasted Profit', finPctTxt(expP)) : ff('On '+FIN_SUM_ON[pk], finMoney(r.on, 0)))+bar(expP, r.mg<0, 'green'), '', pctCol(r.mg)); } }
  { const r = prof(ppk), m = finPickMenuHtml('Profit % Measured', FIN_SUM_P, ppk, 'finSumSet', 'pp');
    if(ppk==='forecast') ppT = !r ? tile('Forecasted Profit %', m, '—', 'Needs A Budget') : tile('Forecasted Profit %', m, finPctTxt(r.pct), fc.origMarginPct!=null ? ff('Original', finPctTxt(fc.origMarginPct)) : ff('On', 'Forecasted Final Account'), '', pctCol(r.pct));
    else ppT = tile('Profit To Date %', m, finPctTxt(r.pct), ff('On', FIN_SUM_ON[ppk]), '', pctCol(r.pct)); }

  const noOrig = fc.origValue==null && fc.origCost==null;
  const btn = 'class="ghostbtn" style="padding:6px 12px;width:auto;flex:none;margin:0;"';
  return `<div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
      <p class="sectiontitle" style="margin:0;">Project Summary</p>
      <span style="display:flex;align-items:center;gap:8px;"><button type="button" class="ghostbtn" style="width:auto;margin:0;padding:6px 12px;" onclick="finDsTab='summary';go('#/site/${siteId}/finance/summary')">Detailed Summary ›</button>
      <span class="finmb finpick"><button type="button" class="finmb-b" aria-label="Reports and budget" onclick="event.stopPropagation();const o=this.parentNode.classList.contains('open');document.querySelectorAll('.finmb.open').forEach(x=>x.classList.remove('open'));if(!o)this.parentNode.classList.add('open')">⋯</button>
        <span class="finmb-m" onclick="event.stopPropagation()">
          <button type="button" onclick="go('#/site/${siteId}/finance/monthly')">Run Monthly Report</button>
          <button type="button" onclick="go('#/site/${siteId}/finance/budget')">Change Budget</button>
        </span></span></span>
    </div>
    <div class="fintiles">${vT}${cT}${pT}${ppT}</div>
    <div class="finkv" style="margin-top:10px;"><span>Contract ${finMoney(fc.contract, 0)} · Agreed Variations ${finMoney(fc.vAgreed, 0)}${fc.vPending?' · Awaiting Agreement '+finMoney(fc.vPending, 0):''}</span><b>Forecasted Final Cost ${finMoney(fc.forecastCost, 0)}</b></div>
    ${finAutoOriginal(siteId, fc)}
    ${fc.budgetSource==='schedule' && fc.schedCostedN < fc.schedItemsN ? `<div class="finnote warn">${fc.schedItemsN - fc.schedCostedN} Bill of Quantities line${fc.schedItemsN - fc.schedCostedN===1?' has':'s have'} no cost price yet, so the budget is low. <a href="#/site/${siteId}/finance/contract">Add costs</a></div>` : ''}
  </div>`;
};
// The starting point is fixed automatically: the value and budget the job was set up with,
// dated the day the job was created (Andy, 23 Oct — no "save starting point" row).
let finAutoOrigDone = {};
function finAutoOriginal(siteId, fc){
  const jf = fc.jf || {}, patch = {};
  if(jf.original_value==null && fc.contract > 0) patch.original_value = fc.contract;
  if(jf.original_cost==null && fc.budgetTotal!=null && fc.budgetTotal > 0) patch.original_cost = fc.budgetTotal;
  if(!Object.keys(patch).length || finAutoOrigDone[siteId]) return '';
  finAutoOrigDone[siteId] = 1;
  const site = SITES.find(s=>s.id===siteId) || {};
  if(!jf.original_at) patch.original_at = site.created_at || new Date().toISOString();
  if(patch.original_value!=null){ fc.origValue = patch.original_value; } if(patch.original_cost!=null){ fc.origCost = patch.original_cost; }
  sbFetch('/rest/v1/job_finance', {method:'POST', headers:{'Prefer':'resolution=merge-duplicates'}, body:JSON.stringify(Object.assign({site_id:siteId, org_id:ME.org_id}, patch))}).catch(()=>{});
  return '';
}
window.finSumSet = function(slot, k){
  const cur = finLsGet(FIN_SUM_LS, FIN_SUM_DEF); cur[slot] = k; finLsSet(FIN_SUM_LS, cur);
  const d = window.__finFcLast, el = document.getElementById('finFcSlot');
  if(el && d) el.innerHTML = finForecastCardHtml(d.siteId, d.fc);
};
(function(){
  const st = document.createElement('style');
  st.textContent = `.fintop{position:relative;padding-right:40px !important;}
.fintop > .finpick{position:absolute;top:8px;right:8px;}
.fintop > .finpick .finmb-b{background:rgba(255,255,255,.7);}
.fintop-n{font-style:normal;opacity:.7;font-weight:600;}
.fintile-l{display:flex;align-items:center;justify-content:space-between;gap:6px;}
.finpick .finmb-m{max-height:340px;overflow:auto;}`;
  document.head.appendChild(st);
})();

/* ---------- 3. A ⋯ on each application and invoice row (Andy, 23 Oct:
   "add the ellipsis onto the rows of applications / invoices etc to be able to delete etc") ---------- */
let FIN_ROWD = {};
function finRowDots(kind, id){ return `<td class="finrowdots" data-l=""><button type="button" class="finmb-b" aria-label="More" onclick="event.stopPropagation();finRowMenu(this,'${kind}','${id}')">⋯</button></td>`; }
function finRowAddCol(html, kind, rows){
  let i = 0;
  html = html.replace(/<\/tr><\/thead>/, '<th class="finrowdots"></th></tr></thead>');
  html = html.replace(/<tbody>([\s\S]*?)<\/tbody>/, (m, body)=>'<tbody>'+body.replace(/<\/tr>/g, ()=>{ const r = rows[i++]; return (r ? finRowDots(kind, r.id) : '<td></td>')+'</tr>'; })+'</tbody>');
  html = html.replace(/<\/tr><\/tfoot>/, '<td></td></tr></tfoot>');
  return html;
}
(function(){
  const bi = finInvTableHtml, ba = finAppTableHtml;
  finInvTableHtml = function(invs){ invs.forEach(x=>FIN_ROWD['inv:'+x.id] = x); return invs.length ? finRowAddCol(bi.apply(this, arguments), 'inv', invs) : bi.apply(this, arguments); };
  finAppTableHtml = function(apps){ apps.forEach(x=>FIN_ROWD['app:'+x.id] = x); return apps.length ? finRowAddCol(ba.apply(this, arguments), 'app', apps) : ba.apply(this, arguments); };
})();
function finRowMenuClose(){ const m = document.getElementById('finRowMenu'); if(m) m.remove(); }
document.addEventListener('click', finRowMenuClose);
window.addEventListener('scroll', finRowMenuClose, true);
window.finRowMenu = function(btn, kind, id){
  const was = document.getElementById('finRowMenu'); const same = was && was.dataset.id===id; finRowMenuClose(); if(same) return;
  const x = FIN_ROWD[kind+':'+id]; if(!x) return;
  const items = [];
  if(kind==='app'){
    const s = finAppStage(x).k;
    items.push(['Open', `go('#/site/${x.site_id}/finance/application/${x.id}')`]);
    items.push(['Download PDF', `downloadFinAppPdf('${x.id}')`]);
    if(s==='submitted') items.push(['Return To Draft', `finAppToDraft('${x.id}')`]);
    if(x.invoice_id) items.push(['View Invoice', `go('#/site/${x.site_id}/finance/invoice/${x.invoice_id}')`]);
    items.push(['Delete Application', `finRowDelApp('${x.id}')`, 1]);
  } else {
    const out = finInvOutstanding(x);
    items.push(['Open', `go('#/site/${x.site_id}/finance/invoice/${x.id}')`]);
    if(x.status!=='draft') items.push(['View PDF', `openFinInvoicePdf('${x.id}')`]);
    if(out>0) items.push(['Record Payment', `openFinPayment('${x.id}', ${out})`]);
    if(x.status==='draft') items.push(['Delete Draft', `finRowDelInv('${x.id}')`, 1]);
    else if(x.status!=='void') items.push(['Void Invoice', `finRowVoidInv('${x.id}')`, 1]);
  }
  const m = document.createElement('div'); m.id = 'finRowMenu'; m.dataset.id = id; m.className = 'finrowmenu';
  m.innerHTML = items.map(([l, js, bad])=>`<button type="button" class="${bad?'bad':''}" onclick="event.stopPropagation();finRowMenuClose();${escapeHtml(js)}">${escapeHtml(l)}</button>`).join('');
  m.onclick = e=>e.stopPropagation();
  document.body.appendChild(m);
  const r = btn.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w))+'px';
  m.style.top = (r.bottom + h + 6 > window.innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4)+'px';
};
window.finRowDelApp = async function(id){
  const a = (await dbSelect('fin_applications', 'id=eq.'+id))[0]; if(!a){ render(); return; }
  if(a.invoice_id){ toast('This application has an invoice — void the invoice first, then delete it.'); return; }
  const later = (await dbSelect('fin_applications', 'site_id=eq.'+a.site_id+'&number=gt.'+a.number+'&select=id,number,status')).filter(x=>x.status!=='void');
  if(later.length){ toast('Delete the later application'+(later.length>1?'s':'')+' first (No. '+later.map(x=>x.number).sort((p,q)=>q-p).join(', ')+') — each one builds on the last.'); return; }
  if(!await customConfirm(`Delete application No. ${a.number}?${a.cert_net!=null ? '\n\nIt has a certificate — that will be deleted too.' : ''}\n\nThis can’t be undone.`, {confirmLabel:'Delete'})) return;
  if(await dbDelete('fin_applications', id)){ toast('Application deleted'); if(typeof finBookClear==='function') finBookClear(); render(); }
};
window.finRowDelInv = async function(id){
  if(!await customConfirm('Delete this draft invoice? This can’t be undone.', {confirmLabel:'Delete'})) return;
  if(await dbDelete('fin_invoices', id)){ toast('Draft deleted'); render(); }
};
window.finRowVoidInv = async function(id){
  const x = FIN_ROWD['inv:'+id] || {};
  if(!await customConfirm(`Void invoice ${x.number||''}? It stays on record as void, and any application or retention on it can be invoiced again.\n\nThis can’t be undone.`, {confirmLabel:'Void invoice'})) return;
  const row = await dbUpdate('fin_invoices', id, {status:'void', updated_at:new Date().toISOString()});
  if(row){ toast('Invoice voided'); render(); if(typeof finXeroVoid==='function') finXeroVoid(row); }
};
(function(){
  const st = document.createElement('style');
  st.textContent = `.fininvtbl td.finrowdots,.fininvtbl th.finrowdots{width:40px;text-align:right;padding-left:4px;padding-right:8px;}
.finrowmenu{position:fixed;z-index:9999;background:#fff;border:1px solid #E1E4EA;border-radius:12px;box-shadow:0 10px 30px rgba(16,24,40,.16);padding:6px;min-width:190px;display:flex;flex-direction:column;}
.finrowmenu button{border:0;background:none;text-align:left;padding:9px 10px;border-radius:8px;font:inherit;font-size:14px;font-weight:600;color:var(--ink);cursor:pointer;white-space:nowrap;}
.finrowmenu button:hover{background:#F4F6FA;}
.finrowmenu button.bad{color:var(--red);}
@media (max-width:700px){ .fininvtbl td.finrowdots{position:absolute !important;top:6px;right:6px;width:auto;padding:0 !important;} .fininvtbl tbody tr{position:relative;padding-right:44px !important;} }`;
  document.head.appendChild(st);
})();
