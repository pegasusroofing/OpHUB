/* ============================================================
   OpHUB Finance — money strip at the top of a project's home page
   (Andy, 20 Oct: "as a QS and admin… a summary at the top of the project
   page: costs to date, invoiced to date (applied below it), profit margin").
   Finance users only. Fills in after the page shows, so the home page
   isn't slowed down. Tap it to open the project's Finance.
   ============================================================ */
function finHomeStripHtml(siteId){
  if(typeof isFinanceUser!=='function' || !isFinanceUser() || !(ORG && ORG.has_finance)) return '';
  setTimeout(()=>finHomeStripFill(siteId), 0);
  return `<div role="button" tabindex="0" class="finhome" id="finHomeStrip" onclick="go('#/site/${siteId}/finance')" onkeydown="if(event.key==='Enter')go('#/site/${siteId}/finance')" aria-label="Open project finance">
    <div class="finhome-t"><span>Costs to date</span><b class="sk">&nbsp;</b><em>&nbsp;</em></div>
    <div class="finhome-t"><span>Invoiced to date</span><b class="sk">&nbsp;</b><em>&nbsp;</em></div>
    <div class="finhome-t"><span>Profit margin</span><b class="sk">&nbsp;</b><em>&nbsp;</em></div>
  </div>`;
}
async function finHomeStripFill(siteId){
  const gen = RENDER_GEN;
  let fc;
  try{ const b = await finLoadBook(siteId); fc = finJobForecast(b, siteId); }catch(e){ console.error(e); return; }
  const el = document.getElementById('finHomeStrip'); if(!el || gen !== RENDER_GEN) return;
  window.__finHomeFc = {siteId, fc};
  finHomeStripPaint();
}

/* ---------- what the margin is measured against (⋯ menu) ---------- */
const FIN_MBASIS = {applied:'Applied', certified:'Certified', invoiced:'Invoiced'};
function finMarginBasisGet(){ try{ const v = localStorage.getItem('ophub.finMarginBasis'); return FIN_MBASIS[v] ? v : 'auto'; }catch(e){ return 'auto'; } }
// The value the margin is worked out on. 'auto' = certified if there is one, else applied, else invoiced
// (invoice-only projects: invoiced).
function finMarginOn(fc, basis){
  basis = basis || finMarginBasisGet();
  if(basis==='applied') return {value:fc.applied||0, label:'applied', basis};
  if(basis==='certified') return {value:fc.certified||0, label:'certified', basis};
  if(basis==='invoiced') return {value:fc.invoiced||0, label:'invoiced', basis};
  if(fc.certified) return {value:fc.certified, label:'certified', basis:'auto'};
  if(fc.applied) return {value:fc.applied, label:'applied', basis:'auto'};
  return {value:fc.invoiced||0, label:'invoiced', basis:'auto'};
}
function finMarginMenuHtml(){
  const cur = finMarginBasisGet();
  return `<span class="finmb"><button type="button" class="finmb-b" aria-label="Measure margin against" onclick="event.stopPropagation();this.parentNode.classList.toggle('open')">⋯</button>
    <span class="finmb-m" onclick="event.stopPropagation()"><span class="finmb-h">Measure margin against</span>
      ${[['auto','Latest (certified, else applied)'],['applied','Applied'],['certified','Certified'],['invoiced','Invoiced']].map(([k,l])=>`<button type="button" class="${cur===k?'on':''}" onclick="finMarginBasisSet('${k}')">${cur===k?'✓ ':''}${l}</button>`).join('')}
    </span></span>`;
}
window.finMarginBasisSet = function(k){
  try{ if(k==='auto') localStorage.removeItem('ophub.finMarginBasis'); else localStorage.setItem('ophub.finMarginBasis', k); }catch(e){}
  finHomeStripPaint();
  if(document.getElementById('finFcSlot') && window.__finFcLast) document.getElementById('finFcSlot').innerHTML = finForecastCardHtml(window.__finFcLast.siteId, window.__finFcLast.fc);
  toast('Margin measured against '+(k==='auto' ? 'the latest (certified, else applied)' : FIN_MBASIS[k].toLowerCase()));
};
document.addEventListener('click', ()=>document.querySelectorAll('.finmb.open').forEach(x=>x.classList.remove('open')));
function finHomeStripPaint(){
  const el = document.getElementById('finHomeStrip'); const d = window.__finHomeFc; if(!el || !d) return;
  const fc = d.fc;
  const prog = fc.certified || fc.applied || 0;
  const on = finMarginOn(fc);
  const value = on.value, margin = finRound(value - fc.costToDate), pct = value ? finRound(margin/value*100) : null;
  const col = margin<0 ? 'var(--red)' : (value ? 'var(--ok,#1E6B45)' : 'var(--ink)');
  el.innerHTML = `
    <div class="finhome-t"><span>Costs to date</span><b>${finMoney(fc.costToDate, 0)}</b><em>${fc.committedTotal ? '+ '+finMoney(fc.committedTotal, 0)+' ordered' : (fc.budgetTotal ? finPctTxt(finRound(fc.costToDate/fc.budgetTotal*100))+' of budget' : '&nbsp;')}</em></div>
    <div class="finhome-t"><span>Invoiced to date</span><b>${finMoney(fc.invoiced, 0)}</b><em>${prog ? (fc.certified ? 'Certified ' : 'Applied ')+finMoney(prog, 0) : (fc.ffa ? 'of '+finMoney(fc.ffa, 0) : '&nbsp;')}</em></div>
    <div class="finhome-t"><span class="finhome-hd">Profit margin ${finMarginMenuHtml()}</span><b style="color:${col};">${value ? finMoney(margin, 0)+' <small>'+finPctTxt(pct)+'</small>' : '—'}</b><em>${value ? 'on '+finMoney(value, 0)+' '+on.label : 'Nothing '+(on.basis==='auto' ? 'applied or invoiced' : on.label)+' yet'}</em></div>`;
}
