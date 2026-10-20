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
  return `<button type="button" class="finhome" id="finHomeStrip" onclick="go('#/site/${siteId}/finance')" aria-label="Open project finance">
    <div class="finhome-t"><span>Costs to date</span><b class="sk">&nbsp;</b><em>&nbsp;</em></div>
    <div class="finhome-t"><span>Invoiced to date</span><b class="sk">&nbsp;</b><em>&nbsp;</em></div>
    <div class="finhome-t"><span>Profit margin</span><b class="sk">&nbsp;</b><em>&nbsp;</em></div>
  </button>`;
}
async function finHomeStripFill(siteId){
  const gen = RENDER_GEN;
  let fc;
  try{ const b = await finLoadBook(siteId); fc = finJobForecast(b, siteId); }catch(e){ console.error(e); return; }
  const el = document.getElementById('finHomeStrip'); if(!el || gen !== RENDER_GEN) return;
  const applied = fc.valuation || 0;
  const isInv = fc.sales===fc.invoiced && fc.sales!==fc.valuation;
  const value = isInv ? fc.invoiced : (applied || fc.invoiced);
  const margin = finRound(value - fc.costToDate), pct = value ? finRound(margin/value*100) : null;
  const col = margin<0 ? 'var(--red)' : (value ? 'var(--ok,#1E6B45)' : 'var(--ink)');
  el.innerHTML = `
    <div class="finhome-t"><span>Costs to date</span><b>${finMoney(fc.costToDate, 0)}</b><em>${fc.committedTotal ? '+ '+finMoney(fc.committedTotal, 0)+' ordered' : (fc.budgetTotal ? finPctTxt(finRound(fc.costToDate/fc.budgetTotal*100))+' of budget' : '&nbsp;')}</em></div>
    <div class="finhome-t"><span>Invoiced to date</span><b>${finMoney(fc.invoiced, 0)}</b><em>${applied ? (fc.certified ? 'Certified ' : 'Applied ')+finMoney(applied, 0) : (fc.ffa ? 'of '+finMoney(fc.ffa, 0) : '&nbsp;')}</em></div>
    <div class="finhome-t"><span>Profit margin</span><b style="color:${col};">${value ? finMoney(margin, 0)+' <small>'+finPctTxt(pct)+'</small>' : '—'}</b><em>${value ? 'on '+finMoney(value, 0)+(isInv || !applied ? ' invoiced' : (fc.certified ? ' certified' : ' applied')) : 'Nothing applied or invoiced yet'}</em></div>`;
}
