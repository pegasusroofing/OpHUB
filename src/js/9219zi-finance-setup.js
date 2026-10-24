/* ============================================================
   OpHUB Finance — project set-up tidy (24 Oct 2026, Andy):
   - Getting started: compact; finished steps drop off the list; no "Make the first application";
     "Check retention, VAT…" has a ✓ Done button (saving Project Admin also ticks it).
   - "Paid by" → "Payment Procedure", on one tidy row.
   - Contract value typed on a new project is kept; when the Bill of Quantities adds up to
     something different, a pop-up (and a bar on the BoQ page) asks which to use.
   - Finance › Projects (phone): bottom bar on one row.
   ============================================================ */

/* ---------- contract value: typed vs Bill of Quantities ---------- */
async function finCvPatch(siteId, total){
  const jf = (await dbSelect('job_finance', 'site_id=eq.'+siteId+'&select=contract_value_source').catch(()=>[]))[0];
  return jf && jf.contract_value_source==='manual' ? {} : {contract_value:total};
}
async function finCvCheck(siteId){
  const [jfs, items] = await Promise.all([
    dbSelect('job_finance', 'site_id=eq.'+siteId+'&select=contract_value,contract_value_source').catch(()=>[]),
    dbSelect('fin_contract_items', 'site_id=eq.'+siteId+'&select=kind,value&limit=10000').catch(()=>null)]);
  const jf = jfs[0]; if(!jf || jf.contract_value_source!=='manual' || !items) return null;
  const boq = finRound(items.filter(finIsItem).reduce((t,i)=>t+Number(i.value||0),0));
  const typed = finRound(Number(jf.contract_value||0));
  if(!boq || Math.abs(boq-typed) < 0.5) return null;
  return {boq, typed};
}
function finCvAckKey(siteId, c){ return 'finCvAck:'+siteId+':'+c.boq+':'+c.typed; }
window.finCvUse = async function(siteId, which, boq){
  const ov = document.getElementById('finCvOv'); if(ov) ov.style.display = 'none';
  if(which==='boq'){
    const res = await sbFetch('/rest/v1/job_finance?on_conflict=site_id', {method:'POST', headers:{'Prefer':'resolution=merge-duplicates'}, body:JSON.stringify({site_id:siteId, org_id:ME.org_id, contract_value:boq, contract_value_source:'boq', updated_at:new Date().toISOString(), updated_by:ME.id})});
    if(!res.ok){ toast('Not saved — '+(await safeErr(res))); return; }
    toast('Contract value now follows the Bill of Quantities');
  } else {
    const c = await finCvCheck(siteId); if(c) try{ localStorage.setItem(finCvAckKey(siteId, c), '1'); }catch(e){}
    toast('Kept the typed contract value');
  }
  render();
};
function finCvPrompt(siteId, c){
  let ov = document.getElementById('finCvOv');
  if(!ov){ ov = document.createElement('div'); ov.id = 'finCvOv'; ov.className = 'geo-modal-overlay'; }
  document.body.appendChild(ov);
  ov.onclick = e=>{ if(e.target===ov) ov.style.display = 'none'; };
  ov.innerHTML = `<div class="geo-modal-card" style="max-width:440px;">
    <h3 style="margin:0 0 6px;">Contract Value Doesn’t Match</h3>
    <p class="stub" style="margin:0 0 14px;font-style:normal;">The Bill of Quantities adds up to <b>${finMoney(c.boq)}</b>, but the contract value typed on the project is <b>${finMoney(c.typed)}</b> (excl. VAT). Which should the project use?</p>
    <button type="button" class="darkbtn" style="width:100%;margin:0 0 8px;" onclick="finCvUse('${siteId}','boq',${c.boq})">Use the Bill of Quantities — ${finMoney(c.boq)}</button>
    <button type="button" class="ghostbtn" style="width:100%;margin:0;" onclick="finCvUse('${siteId}','manual')">Keep the typed value — ${finMoney(c.typed)}</button>
  </div>`;
  ov.style.display = 'flex'; if(typeof modalAddX==='function') modalAddX();
}
(function(){
  // Pop-up when the BoQ is saved
  const sv = window.saveFinContract;
  if(sv) window.saveFinContract = async function(siteId){
    const sid = siteId || (parseRoute()||[])[1];
    const r = await sv.apply(this, arguments);
    try{ const c = sid && await finCvCheck(sid); if(c) finCvPrompt(sid, c); }catch(e){}
    return r;
  };
  // Bar on the BoQ page while they differ
  const rc = renderFinContract;
  renderFinContract = async function(siteId){
    const r = await rc.apply(this, arguments);
    try{
      const c = await finCvCheck(siteId);
      if(c && !document.getElementById('finCvBar')){
        let ack = false; try{ ack = localStorage.getItem(finCvAckKey(siteId, c))==='1'; }catch(e){}
        if(!ack){
          const first = document.querySelector('#app .scrollarea .card') || document.querySelector('#app .card');
          if(first) first.insertAdjacentHTML('beforebegin', `<div class="finnote warn" id="finCvBar" style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
            <span>⚠ The Bill of Quantities (<b>${finMoney(c.boq)}</b>) doesn’t match the typed contract value (<b>${finMoney(c.typed)}</b>).</span>
            <span style="display:flex;gap:6px;"><button class="darkbtn" style="width:auto;margin:0;padding:6px 12px;" onclick="finCvUse('${siteId}','boq',${c.boq})">Use BoQ</button><button class="ghostbtn" style="width:auto;margin:0;padding:6px 12px;" onclick="finCvUse('${siteId}','manual')">Keep Typed</button></span></div>`);
        }
      }
    }catch(e){}
    return r;
  };
})();

/* ---------- Getting started ---------- */
window.finSetupDone = async function(siteId){
  const res = await sbFetch('/rest/v1/job_finance?on_conflict=site_id', {method:'POST', headers:{'Prefer':'resolution=merge-duplicates'}, body:JSON.stringify({site_id:siteId, org_id:ME.org_id, setup_checked_at:new Date().toISOString(), updated_by:ME.id})});
  if(!res.ok){ toast('Not saved — '+(await safeErr(res))); return; }
  render();
};
function finStartCardHtml(siteId, bt, n){
  if(n.invs || n.apps) return '';
  const jf = n.jf || {};
  const b = (label, js, dark)=>`<button type="button" class="${dark?'darkbtn':'ghostbtn'} finstart-b" onclick="${js}">${label}</button>`;
  const step = (done, t, btns)=>done ? '' : `<div class="finstart-step"><span class="finstart-tick"></span><b>${t}</b><span class="finstart-btns">${btns}</span></div>`;
  const checked = !!jf.setup_checked_at;
  const steps = bt==='application' ? [
    step(n.items>0, 'Set up the Bill of Quantities', b('Open BoQ', `finProjTabGo('${siteId}','boq')`)),
    step(n.pos>0, 'Add the client’s PO', b('Add PO', `openClientPoForm('${siteId}')`)),
    step(checked, 'Check retention, VAT and application dates', b('Project Admin', `finProjTabGo('${siteId}','setup')`)+b('✓ Done', `finSetupDone('${siteId}')`, 1)),
  ] : [
    step(checked, 'Check the contract value, VAT and payment terms', b('Project Admin', `finProjTabGo('${siteId}','setup')`)+b('✓ Done', `finSetupDone('${siteId}')`, 1)),
    step(n.pos>0, 'Add the client’s PO', b('Add PO', `openClientPoForm('${siteId}')`)),
  ];
  const left = steps.filter(Boolean);
  if(!left.length) return '';
  return `<div class="card finstart"><p class="sectiontitle" style="margin:0 0 4px;">Getting Started</p>${left.join('')}</div>`;
}
(function(){
  // Saving Project Admin counts as checking the terms.
  const save = window.saveSiteFinance;
  if(save) window.saveSiteFinance = async function(siteId){
    const r = await save.apply(this, arguments);
    try{ await sbFetch('/rest/v1/job_finance?on_conflict=site_id', {method:'POST', headers:{'Prefer':'resolution=merge-duplicates'}, body:JSON.stringify({site_id:siteId, org_id:ME.org_id, setup_checked_at:new Date().toISOString()})}); }catch(e){}
    return r;
  };
})();

/* ---------- Payment Procedure line ---------- */
function finBillingLineHtml(siteId, bt){
  if(!bt) return '';
  const other = bt==='invoice' ? 'application' : 'invoice';
  return `<div class="finpaidby"><span class="finpaidby-l">Payment Procedure</span><b>${FIN_BT[bt].icon} ${FIN_BT[bt].t}</b><button type="button" class="linkbtn" onclick="setFinBillingType('${siteId}','${other}')">Change to ${bt==='invoice'?'applications':'invoices'}</button></div>`;
}

(function(){
  const st = document.createElement('style');
  st.textContent = `#finCvBar b{display:inline !important;}
.finstart{padding:12px 16px !important;}
html.desk.finmode .finstart{padding:14px 20px !important;}
.finstart .finstart-step{display:flex;align-items:center;gap:10px;padding:7px 0 !important;border-top:1px solid #F0F1F4;}
.finstart .finstart-step:first-of-type{border-top:0;}
.finstart .finstart-tick{width:16px;height:16px;border-width:2px;}
.finstart .finstart-step > b{flex:1;min-width:0;font-size:13.5px;font-weight:700;line-height:1.25;}
.finstart-btns{display:flex;gap:6px;flex:none;}
.finstart-b{width:auto !important;margin:0 !important;padding:5px 10px !important;font-size:12.5px !important;}
.finpaidby{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 0;border-top:1px solid var(--line,#EEF0F3);font-size:14px;}
.finpaidby-l{color:var(--slate);min-width:140px;}
.finpaidby b{font-weight:700;}
.finpaidby .linkbtn{margin-left:auto;font-size:13px;padding:0;}
@media (max-width:700px){
  .finpaidby{gap:4px 10px;padding:6px 0;font-size:13.5px;}
  .finpaidby-l{min-width:0;width:100%;font-size:12px;}
  .finstart .finstart-step{flex-wrap:wrap;}
  .finstart .finstart-step > b{flex:1 1 calc(100% - 30px);}
  .finstart-btns{margin-left:26px;}
  #finJobGridFoot{flex-wrap:nowrap !important;gap:6px !important;padding:7px 10px !important;align-items:center;}
  #finJobGridFoot > b{font-size:12px;white-space:nowrap;flex:none;}
  #finJobGridFoot > span:not(.fgfoot-ctl){font-size:11.5px;white-space:nowrap;flex:none;}
  #finJobGridFoot .fgfoot-ctl{flex:1 1 auto !important;display:flex;gap:5px;justify-content:flex-end;min-width:0;order:0 !important;}
  #finJobGridFoot .fgfoot-ctl select{flex:0 1 auto !important;width:auto !important;max-width:86px;min-width:0;height:26px !important;min-height:26px !important;font-size:11px !important;padding:0 18px 0 6px !important;}
  #finJobGridFoot .fjq-sort{height:26px;padding:0 8px;font-size:11px;}
  #finJobGridFoot .fgcolbtn{flex:none;height:26px;padding:0 7px !important;order:0 !important;}
  #finJobGridFoot .fgfoot-n, #finJobGridFoot .fjq-n{display:none;}
}`;
  document.head.appendChild(st);
})();
