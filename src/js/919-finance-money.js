/* ============================================================
   OpHUB Finance — money boxes always read "£12,000.00" (Andy, 20 Oct:
   "anywhere there is money… commas and the £ sign built in").
   Any <input data-money> shows £ and commas; while you're typing in it
   it shows the plain number, and it's formatted again when you leave it.
   finNum() already ignores £ and commas, so saving is unchanged.
   ============================================================ */
function finMoneyIn(v){
  const n = finNum(v);
  if(n===null || isNaN(n)) return v==null ? '' : String(v);
  const dp = Math.abs(n*100 - Math.round(n*100)) > 1e-6 ? 4 : 2; // rates can have 4 decimals
  return (n<0?'-':'')+'£'+Math.abs(n).toLocaleString('en-GB', {minimumFractionDigits:2, maximumFractionDigits:dp});
}
function finMoneyRaw(v){ const n = finNum(v); return (n===null || isNaN(n)) ? (v==null?'':String(v)) : String(n); }
// Set a money box from code (keeps the £ format unless the person is typing in it).
function finSetMoney(el, v){ if(!el) return; el.value = (document.activeElement===el) ? finMoneyRaw(v) : finMoneyIn(v); }
function finMoneyFormatAll(root){
  (root || document).querySelectorAll('input[data-money]').forEach(el=>{
    if(el===document.activeElement || el.dataset.mfmt===el.value) return;
    if(el.value!=='') el.value = finMoneyIn(el.value);
    if(el.placeholder && /^\s*£?\s*[\d.,]+\s*$/.test(el.placeholder)) el.placeholder = finMoneyIn(el.placeholder);
    el.dataset.mfmt = el.value;
  });
}
(function(){
  if(typeof document==='undefined') return;
  document.addEventListener('focusin', e=>{ const el = e.target; if(el && el.matches && el.matches('input[data-money]') && !el.readOnly){ el.value = finMoneyRaw(el.value); try{ el.select(); }catch(_){} } });
  document.addEventListener('focusout', e=>{ const el = e.target; if(el && el.matches && el.matches('input[data-money]')){ if(el.value!=='') el.value = finMoneyIn(el.value); el.dataset.mfmt = el.value; } });
  let pending = false;
  const run = ()=>{ pending = false; finMoneyFormatAll(); };
  const start = ()=>{ new MutationObserver(()=>{ if(!pending){ pending = true; requestAnimationFrame(run); } }).observe(document.body, {childList:true, subtree:true}); run(); };
  if(document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
