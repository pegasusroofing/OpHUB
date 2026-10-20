/* ============================================================
   OpHUB Finance — no double taps (deep dive, 20 Oct).
   Every Finance action that saves, sends or creates something ignores a
   second tap while the first is still running, so a slow connection can't
   make two payments, invoices, POs, applications or schedule tasks.
   Wraps the global window.* functions once this file loads (it's last).
   ============================================================ */
(function(){
  const pattern = /^(save|new|raise|mark|issue|send|void|delete|clear)[A-Z]/;
  const extra = ['finInboxFile','finInboxUpload','finShopSave','finShopAddManual','finPoQuoteApply','finSendToSow','finSetOriginal','finQuoteHideAll','finAddWorker','finTeamNewInvite','finXeroPush','finXeroPullPayments','setFinBillingType','setFinPoStatus','setPurchaseInvoiceStatus','setFinPiPaid','uploadFinAppExcel','finContractUploadPicked','toggleFinanceAccess'];
  const skip = new Set(['finAppSaveSoft']);
  const running = new Set();
  const wrap = name=>{
    const fn = window[name];
    if(typeof fn!=='function' || fn.__once || skip.has(name)) return;
    if(fn.constructor && fn.constructor.name!=='AsyncFunction') return;
    const w = async function(...args){
      if(running.has(name)) return; // already working on it — ignore the second tap
      running.add(name); document.documentElement.classList.add('finbusy');
      try{ return await fn.apply(this, args); }
      finally{ running.delete(name); if(!running.size) document.documentElement.classList.remove('finbusy'); }
    };
    w.__once = true; window[name] = w;
  };
  Object.keys(window).filter(k=>(pattern.test(k) && /Fin|Purchase|Client|Site|Retention|Invoice/.test(k)) || extra.includes(k)).forEach(wrap);
})();
