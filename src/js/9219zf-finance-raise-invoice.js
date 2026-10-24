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
  document.documentElement.classList.remove('finidsplit','finidpage');
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
    if(!finInvDraft) return r;
    const xc = typeof finXeroConnected==='function' && finXeroConnected();
    document.documentElement.classList.add('finidpage');
    // 23 Oct (Andy): Post to Xero + Approve & Issue sit at the top of the left side.
    const first = Array.from(document.querySelectorAll('#app .card')).find(c=>/Draft invoice/i.test((c.querySelector('.sectiontitle')||{}).textContent||''));
    if(first && !document.getElementById('finIdBox')) first.insertAdjacentHTML('beforebegin', `<div class="card finidbox" id="finIdBox">
        <label class="finswitch" style="margin:0;"><input type="checkbox" id="finIdXero" ${finInvDraft.xero_post!==false?'checked':''} onchange="finInvDraft.xero_post=this.checked"> <span><b>Post to Xero</b> <span class="stub" style="font-style:normal;">${xc ? '· untick to post it later from the invoice' : '· Xero isn’t connected yet — it’ll be ready to post once it is'}</span></span></label>
        <div class="finidp-btns">
          <button type="button" class="ghostbtn" onclick="saveFinInvoiceDraft(true)">Save Draft</button>
          <button type="button" class="darkbtn" id="finIdIssue" onclick="finIdIssue('${site.id}')">✓ Approve &amp; Issue Invoice</button>
        </div>
        <p class="stub" style="margin:0;font-style:normal;font-size:11.5px;">Issuing gives it the next invoice number and saves the PDF — it can’t be changed afterwards.</p>
      </div>`);
    if(!finIdOn()){ finIdSite = site; return r; }
    const wrap = document.querySelector('.scrollarea'); if(!wrap) return r;
    document.documentElement.classList.add('finidsplit');
    wrap.insertAdjacentHTML('beforeend', `<div class="dwpanel finidp" id="finIdPanel">
      <div class="dwpanel-bar"><b>🧾 Invoice Preview</b><span class="finpill grey">Draft</span></div>
      <iframe class="dwpanel-frame" id="finIdFrame" title="Invoice preview"></iframe>
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
    try{ await issueFinInvoice(siteId, true); }   // the box is the confirmation
    finally{ const b = document.getElementById('finIdIssue'); if(b){ b.disabled = false; b.textContent = '✓ Approve & Issue Invoice'; } }
    const inv = (await dbSelect('fin_invoices', 'id=eq.'+id+'&select=id,status,xero_id').catch(()=>[]))[0];
    if(inv && inv.status!=='draft' && post && typeof finXeroConnected==='function' && finXeroConnected() && !(FIN_SETTINGS && FIN_SETTINGS.xero_auto) && !inv.xero_id){
      finXeroPush('invoice', inv.id, true).then(ok=>{ if(ok){ toast('Also posted to Xero'); render(); } });
    }
  };

  const st = document.createElement('style');
  st.textContent = `html.desk.finidsplit .scrollarea > *:not(#finIdPanel){margin-right:calc((100vw - 248px) * .5) !important;}
html.desk #finIdPanel{width:calc((100vw - 248px) * .5 - 24px);}
html.finidpage .finxpost, html.finidpage #finInvIssue, html.finidpage .fininv-actions{display:none !important;}
.finidbox{display:flex;flex-direction:column;gap:10px;border:1.5px solid var(--brand1,#e3262b) !important;}
/* compact invoice form (Andy, 23 Oct: "it all seems too big") */
html.finidpage #app .card{padding:14px 16px !important;margin-bottom:10px !important;}
html.finidpage #app .card .sectiontitle{font-size:15px !important;margin-bottom:6px !important;}
html.finidpage #app .formfield{margin-bottom:8px !important;}
html.finidpage #app .field-label{font-size:11.5px !important;margin-bottom:3px !important;}
html.finidpage #app .card input:not([type=checkbox]), html.finidpage #app .card select{height:34px !important;min-height:34px !important;padding:0 10px !important;font-size:13.5px !important;border-radius:8px !important;}
html.finidpage #app .card textarea{min-height:34px !important;padding:7px 10px !important;font-size:13.5px !important;border-radius:8px !important;height:auto;field-sizing:content;}
html.finidpage #finInvBillAddr{min-height:34px !important;}
html.finidpage #finInvTotals .finkv{padding:4px 0 !important;font-size:13.5px !important;}
html.finidpage #finInvTotals .finkv.big{font-size:15px !important;padding:6px 0 !important;}
html.finidpage #finInvTotals .finrc{padding:8px 10px !important;margin-top:6px !important;}
html.finidpage .finline{grid-template-columns:minmax(0,1fr) 120px 110px 22px !important;align-items:start;padding:6px 0 !important;gap:6px !important;}
html.finidpage .finline-r{display:contents !important;}
html.finidpage .finline-vat{margin-top:0 !important;min-width:0 !important;width:100% !important;}
html.finidpage .finline .linkbtn{font-size:0 !important;padding:8px 0 0 !important;margin:0 !important;}
html.finidpage .finline .linkbtn::after{content:'✕';font-size:14px;color:var(--red);}
html.finidpage #app .card > .ghostbtn{padding:7px 12px !important;font-size:13px !important;}
@media (max-width:600px){ html.finidpage .finline{grid-template-columns:minmax(0,1fr) 100px 22px !important;} html.finidpage .finline > textarea{grid-column:1/-1;} }
.finidp-btns{display:flex;gap:8px;}
.finidp-btns button{margin:0 !important;width:auto !important;}
.finidp-btns .darkbtn{flex:1;font-size:14.5px !important;padding:9px 16px !important;}`;
  document.head.appendChild(st);
})();
