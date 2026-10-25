/* ============================================================
   OpHUB Finance — invoice jobs on the project Overview (26 Oct 2026, Andy: "when a job is
   invoice not application for payment, in the overview there doesnt need to be an applied or
   retention tile, and the main running forecast should just be contract value and variations.
   but if the total amount invoiced for the job is higher, this needs to override it").
   - Invoice jobs: no Applied or Retention tiles (6 tiles, 3 across).
   - Forecast (final account) = contract value + variations, or the total invoiced to date
     when that is higher. Forecast profit and margin follow it everywhere it's used.
   ============================================================ */
function finIsInvoiceJob(fc){
  return !!fc && typeof finBillingType==='function' && finBillingType(fc.jf, fc.schedItemsN, fc.valuation ? 1 : 0)==='invoice';
}
(function(){
  const base = finJobForecast;
  finJobForecast = function(){
    const fc = base.apply(this, arguments);
    try{
      fc.isInvoiceJob = finIsInvoiceJob(fc);
      fc.ffaFromInvoiced = false;
      if(fc.isInvoiceJob && Number(fc.invoiced||0) > Number(fc.ffa||0)){
        fc.ffaContractVars = fc.ffa;
        fc.ffa = finRound(fc.invoiced);
        fc.ffaFromInvoiced = true;
        const p = Number(fc.ohpPct||0);
        fc.ohpForecast = finRound(fc.ffa*p/100);
        fc.forecastMargin = finRound(fc.ffa - (fc.forecastCost||0) - fc.ohpForecast);
        fc.forecastMarginPct = fc.ffa ? finRound(fc.forecastMargin/fc.ffa*100) : null;
      }
    }catch(e){ console.error(e); }
    return fc;
  };
})();
(function(){
  const tile = finOv2Tile;
  finOv2Tile = function(t, k, d, fc){
    if(finIsInvoiceJob(fc) && t && (t.slot==='ap' || t.slot==='ret')) return '';
    return tile.apply(this, arguments);
  };
  const block = finOvBlockHtml;
  finOvBlockHtml = function(siteId, d, fc){
    let h = block.apply(this, arguments);
    if(!finIsInvoiceJob(fc)) return h;
    h = h.replace('class="finov-grid"', 'class="finov-grid finov-grid6"').replace(' valued (', ' invoiced (');
    if(fc.ffaFromInvoiced){
      h = h.replace('<div class="finov-bar">', `<div class="finov-sm finov-over">Invoiced to date is more than the contract and variations (${finMoney(fc.ffaContractVars, 0)}), so the forecast uses the invoiced total.</div><div class="finov-bar">`);
    }
    return h;
  };
})();
(function(){
  const st = document.createElement('style');
  st.textContent = `.finov-grid.finov-grid6{grid-template-columns:repeat(3,minmax(0,1fr)) !important;}
html.desk .finov-grid.finov-grid6{grid-template-columns:repeat(3,minmax(0,1fr)) !important;}
.finov-over{color:#B45309;font-weight:600;}`;
  document.head.appendChild(st);
})();
