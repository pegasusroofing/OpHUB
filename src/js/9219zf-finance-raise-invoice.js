/* ============================================================
   OpHUB Finance — Raise invoice from a certificate in one step (23 Oct 2026, Andy: "when I
   click raise invoice it should automatically approve, with a pop-up to say post to Xero —
   on by default, tick to unselect — then Raise invoice. I don't like the Check & issue").
   The pop-up issues the invoice straight away (numbered, approved, PDF saved). Untick
   "Post to Xero" to leave it out for now; it can be posted later from the invoice.
   ============================================================ */
(function(){
  const prev = window.raiseInvoiceFromCert;
  async function finRaiseRun(siteId, appId, post){
    const realIns = dbInsert, realGo = window.go;
    const onApp = typeof isDeskMode==='function' && isDeskMode() && /\/finance\/application\//.test(location.hash);
    let target = null;
    dbInsert = function(t, row){ if(t==='fin_invoices' && row && !Array.isArray(row)) row = Object.assign({}, row, {xero_post:!!post}); return realIns.apply(this, [t, row].concat(Array.prototype.slice.call(arguments, 2))); };
    window.go = h=>{ target = h; };
    try{ await prev.call(this, siteId, appId, true); }
    finally{ dbInsert = realIns; window.go = realGo; }
    const m = target && /\/invoice\/([^/?#]+)/.exec(target);
    if(!m){ if(target) go(target); return; }
    const inv = (await dbSelect('fin_invoices', 'id=eq.'+m[1]+'&select=id,status,xero_id').catch(()=>[]))[0];
    if(!inv || inv.status==='draft'){ go(target); return; }   // e.g. nobody to bill yet — finish it on the invoice page
    if(post && typeof finXeroConnected==='function' && finXeroConnected() && !(FIN_SETTINGS && FIN_SETTINGS.xero_auto) && !inv.xero_id){
      finXeroPush('invoice', inv.id, true).then(ok=>{ if(ok) toast('Also posted to Xero'); });
    }
    if(onApp && typeof finAppShowInvoice==='function'){ finApp = null; render(); setTimeout(()=>finAppShowInvoice(inv.id, appId), 400); }
    else go(target);
  }
  window.finRaiseInvPop = async function(siteId, appId){
    const a = (await dbSelect('fin_applications', 'id=eq.'+appId).catch(()=>[]))[0]; if(!a) return;
    if(a.invoice_id){ go(`#/site/${siteId}/finance/invoice/${a.invoice_id}`); return; }
    let ov = document.getElementById('finRaiseOv');
    if(!ov){ ov = document.createElement('div'); ov.id = 'finRaiseOv'; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
    ov.onclick = e=>{ if(e.target===ov) ov.style.display = 'none'; };
    const xc = typeof finXeroConnected==='function' && finXeroConnected();
    ov.innerHTML = `<div class="geo-modal-card finraise-card">
      <h3 style="margin:0 0 6px;">Raise Invoice</h3>
      <p class="stub" style="margin:0 0 14px;font-style:normal;">Application ${escapeHtml(String(a.number||''))} · <b>${finMoney(a.cert_net)}</b> net as certified. It gets the next invoice number, is approved and saved as a PDF ready to email.</p>
      <label class="finswitch" style="margin:0 0 16px;"><input type="checkbox" id="finRaiseXero" checked> <span><b>Post to Xero</b><br><span class="stub" style="font-style:normal;">${xc ? 'Untick to leave it out of Xero for now — you can post it later from the invoice.' : 'Xero isn’t connected yet — it’ll be ready to post once it is.'}</span></span></label>
      <div style="display:flex;gap:8px;"><button type="button" class="ghostbtn" style="margin:0;" onclick="document.getElementById('finRaiseOv').style.display='none'">Cancel</button>
      <button type="button" class="darkbtn" style="margin:0;" id="finRaiseGo" onclick="finRaiseGo('${siteId}','${appId}')">🧾 Raise Invoice</button></div>
    </div>`;
    ov.style.display = 'flex';
    if(typeof modalAddX==='function') modalAddX();
  };
  window.finRaiseGo = async function(siteId, appId){
    const btn = document.getElementById('finRaiseGo'); if(btn){ if(btn.disabled) return; btn.disabled = true; btn.textContent = 'Raising…'; }
    const post = !!(document.getElementById('finRaiseXero')||{}).checked;
    try{ await finRaiseRun(siteId, appId, post); }
    finally{ const ov = document.getElementById('finRaiseOv'); if(ov) ov.style.display = 'none'; }
  };
  // Raise invoice buttons (certificate box, Sales lists) open the pop-up. Certify with
  // "raise and issue now" ticked still goes straight through.
  window.raiseInvoiceFromCert = function(siteId, appId, issueNow){
    if(issueNow) return prev.apply(this, arguments);
    return finRaiseInvPop(siteId, appId);
  };
  window.finRaiseCertInvoice = function(siteId, appId){ return finRaiseInvPop(siteId, appId); };
  const st = document.createElement('style');
  st.textContent = `.finraise-card{max-width:440px !important;width:min(440px,94vw);}`;
  document.head.appendChild(st);
})();
