/* ============================================================
   OpHUB Finance — Raise invoice → the invoice screen, with the invoice shown on the right
   (23 Oct 2026, Andy: "click raise invoice and it takes me into the invoice screen with the
   pop up, but clearer. I don't need the summary on the left if the pop-up is on the right").
   On a computer a draft invoice shows its details on the left and the invoice itself on the
   right, with Post to Xero (ticked — untick to post later from the invoice) and one clear
   "Approve & Issue Invoice" button. Phones keep the normal invoice page.
   ============================================================ */
let finIdTimer = null, finIdUrl = null;
function finIdOn(){ return typeof isDeskMode==='function' && isDeskMode(); }
function finIdClear(){
  document.documentElement.classList.remove('finidsplit');
  const p = document.getElementById('finIdPanel'); if(p) p.remove();
  if(finIdUrl){ try{ URL.revokeObjectURL(finIdUrl); }catch(e){} finIdUrl = null; }
}
window.addEventListener('hashchange', ()=>{ if(!/\/finance\/invoice\//.test(location.hash)) finIdClear(); });
async function finIdPreview(site){
  const fr = document.getElementById('finIdFrame'); if(!fr || !finInvDraft) return;
  try{
    const inv = Object.assign({}, finInvDraft, finInvDraftRow(), {number:'DRAFT', status:'draft'});
    const bytes = await finBuildInvoicePdf(inv, site, await finLoadSettings()); if(!bytes) return;
    const url = URL.createObjectURL(new Blob([bytes], {type:'application/pdf'}));
    if(finIdUrl) try{ URL.revokeObjectURL(finIdUrl); }catch(e){}
    finIdUrl = url; const f2 = document.getElementById('finIdFrame'); if(f2) f2.src = url+'#view=FitH';
  }catch(e){ console.warn('invoice preview', e); }
}
(function(){
  // Every "Raise invoice" makes the draft and opens it (no more panel on the application).
  window.finRaiseCertInvoice = function(siteId, appId){ return raiseInvoiceFromCert(siteId, appId); };

  const rfi = renderFinInvoice;
  renderFinInvoice = async function(){ finIdClear(); return rfi.apply(this, arguments); };

  const base = renderFinInvoiceDraft;
  renderFinInvoiceDraft = function(site, inv, pos){
    const r = base.apply(this, arguments);
    if(!finIdOn() || !finInvDraft) return r;
    const wrap = document.querySelector('.scrollarea'); if(!wrap) return r;
    const xc = typeof finXeroConnected==='function' && finXeroConnected();
    document.documentElement.classList.add('finidsplit');
    wrap.insertAdjacentHTML('beforeend', `<div class="dwpanel finidp" id="finIdPanel">
      <div class="dwpanel-bar"><b>🧾 Invoice Preview</b><span class="finpill grey">Draft</span></div>
      <iframe class="dwpanel-frame" id="finIdFrame" title="Invoice preview"></iframe>
      <div class="finidp-foot">
        <label class="finswitch" style="margin:0;"><input type="checkbox" id="finIdXero" ${finInvDraft.xero_post!==false?'checked':''} onchange="finInvDraft.xero_post=this.checked"> <span><b>Post to Xero</b><br><span class="stub" style="font-style:normal;">${xc ? 'Untick to leave it out for now — you can post it later from the invoice.' : 'Xero isn’t connected yet — it’ll be ready to post once it is.'}</span></span></label>
        <div class="finidp-btns">
          <button type="button" class="ghostbtn" onclick="saveFinInvoiceDraft(true)">Save Draft</button>
          <button type="button" class="darkbtn" id="finIdIssue" onclick="finIdIssue('${site.id}')">✓ Approve &amp; Issue Invoice</button>
        </div>
        <p class="stub" style="margin:0;font-style:normal;font-size:12px;">Change anything on the left and the preview updates. Issuing gives it the next invoice number and saves the PDF — it can’t be changed afterwards.</p>
      </div>
    </div>`);
    finIdPreview(site);
    finIdSite = site;
    return r;
  };
  let finIdSite = null;
  const queue = ()=>{ if(!document.getElementById('finIdPanel')) return; clearTimeout(finIdTimer); finIdTimer = setTimeout(()=>finIdSite && finIdPreview(finIdSite), 1200); };
  ['input','change'].forEach(ev=>document.addEventListener(ev, e=>{ if(e.target && e.target.closest && e.target.closest('#app') && !e.target.closest('#finIdPanel')) queue(); }, true));
  document.addEventListener('click', e=>{ if(e.target && e.target.closest && e.target.closest('#app .linkbtn, #app .ghostbtn') && !e.target.closest('#finIdPanel')) setTimeout(queue, 50); }, true);

  window.finIdIssue = async function(siteId){
    const btn = document.getElementById('finIdIssue'); if(btn && btn.disabled) return;
    const post = !!(document.getElementById('finIdXero')||{}).checked;
    finInvDraft.xero_post = post;
    const id = finInvDraft.id;
    if(btn){ btn.disabled = true; btn.textContent = 'Issuing…'; }
    const realConfirm = window.customConfirm;
    window.customConfirm = async()=>true;   // the panel is the confirmation
    try{ await issueFinInvoice(siteId); }
    finally{ window.customConfirm = realConfirm; const b = document.getElementById('finIdIssue'); if(b){ b.disabled = false; b.textContent = '✓ Approve & Issue Invoice'; } }
    const inv = (await dbSelect('fin_invoices', 'id=eq.'+id+'&select=id,status,xero_id').catch(()=>[]))[0];
    if(inv && inv.status!=='draft' && post && typeof finXeroConnected==='function' && finXeroConnected() && !(FIN_SETTINGS && FIN_SETTINGS.xero_auto) && !inv.xero_id){
      finXeroPush('invoice', inv.id, true).then(ok=>{ if(ok){ toast('Also posted to Xero'); render(); } });
    }
  };

  const st = document.createElement('style');
  st.textContent = `html.desk.finidsplit .scrollarea > *:not(#finIdPanel){margin-right:calc((100vw - 248px) * .5) !important;}
html.desk #finIdPanel{width:calc((100vw - 248px) * .5 - 24px);}
html.finidsplit .finxpost, html.finidsplit #finInvIssue, html.finidsplit .fininv-actions{display:none !important;}
html.finidsplit .finline textarea{min-height:44px !important;height:auto;field-sizing:content;}
.finidp-foot{border-top:1px solid #ECEEF2;padding:12px 14px;display:flex;flex-direction:column;gap:10px;background:#fff;}
.finidp-btns{display:flex;gap:8px;}
.finidp-btns button{margin:0 !important;width:auto !important;}
.finidp-btns .darkbtn{flex:1;font-size:15px !important;padding:11px 16px !important;}`;
  document.head.appendChild(st);
})();
