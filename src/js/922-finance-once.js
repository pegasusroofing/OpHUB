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
  const running = new Map(); // key -> the save that is still going
  const wrap = name=>{
    const fn = window[name];
    if(typeof fn!=='function' || fn.__once || skip.has(name)) return;
    if(fn.constructor && fn.constructor.name!=='AsyncFunction') return;
    const w = async function(...args){
      // Xero posts are guarded per record, so posting several bills at once isn't dropped (audit FB-06).
      const key = name==='finXeroPush' ? name+':'+args[0]+':'+args[1] : name;
      // Already working on it: don't start a second one, but hand back the first
      // one's answer when it finishes, so a caller that waits (e.g. Apply waiting
      // for Save) doesn't carry on while it is still writing (audit FB-24).
      if(running.has(key)) return running.get(key);
      document.documentElement.classList.add('finbusy');
      const p = (async ()=>{
        try{ return await fn.apply(this, args); }
        finally{ running.delete(key); if(!running.size) document.documentElement.classList.remove('finbusy'); }
      })();
      running.set(key, p);
      return p;
    };
    w.__once = true; window[name] = w;
  };
  Object.keys(window).filter(k=>(pattern.test(k) && /Fin|Purchase|Client|Site|Retention|Invoice/.test(k)) || extra.includes(k)).forEach(wrap);
})();
