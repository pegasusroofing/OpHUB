/* ============================================================
   OpHUB Finance — VAT rates in Settings (22 Oct 2026, Andy: "a VAT section,
   where we can add VAT rates, domestic reversal 20%, drc 5%, no vat, 20% vat,
   Vat exempt").
   The company's list lives in fin_settings.vat_rates
   [{code, name, rate, rc, active}]. It feeds every VAT drop-down that uses
   rates: PO lines, the Directory's default sales / purchase VAT.
   Codes are fixed once made, so old POs and suppliers keep their rate even if
   a rate is switched off (switched-off rates just leave the drop-downs).
   ============================================================ */
const FIN_VAT_DEFAULTS = [
  {code:'20',   name:'20% VAT',                       rate:20, rc:false, active:true},
  {code:'5',    name:'5% VAT (reduced rate)',         rate:5,  rc:false, active:true},
  {code:'rc20', name:'Domestic reverse charge 20%',   rate:20, rc:true,  active:true},
  {code:'rc5',  name:'Domestic reverse charge 5%',    rate:5,  rc:true,  active:true},
  {code:'0',    name:'Zero rated (0%)',               rate:0,  rc:false, active:true},
  {code:'ex',   name:'VAT exempt',                    rate:0,  rc:false, active:true},
  {code:'none', name:'No VAT (outside the scope)',    rate:0,  rc:false, active:true},
];
function finVatList(){
  const saved = FIN_SETTINGS && Array.isArray(FIN_SETTINGS.vat_rates) && FIN_SETTINGS.vat_rates.length ? FIN_SETTINGS.vat_rates : null;
  return (saved || FIN_VAT_DEFAULTS).map(r=>Object.assign({}, r));
}
function finVatShort(r){ return r.rc ? 'RC '+r.rate+'%' : r.code==='ex' ? 'Exempt' : r.code==='none' ? 'No VAT' : r.rate+'%'; }
// Rebuild the drop-down lists in place. Switched-off rates and the old 'rc' code stay
// readable (non-enumerable) so existing POs still work them out right.
function finVatApply(){
  const list = finVatList();
  const reset = o=>Object.keys(o).forEach(k=>delete o[k]);
  const hide = (o, k, v)=>{ try{ Object.defineProperty(o, k, {value:v, enumerable:false, configurable:true, writable:true}); }catch(e){} };
  if(typeof FIN_VAT_RATES!=='undefined'){
    reset(FIN_VAT_RATES);
    list.forEach(r=>{ const v = {l:r.name, s:finVatShort(r), r:r.rc ? 0 : Number(r.rate||0)/100, rc:!!r.rc}; if(r.active!==false) FIN_VAT_RATES[r.code] = v; else hide(FIN_VAT_RATES, r.code, v); });
    const rc = list.find(r=>r.code==='rc20') || list.find(r=>r.rc);
    hide(FIN_VAT_RATES, 'rc', {l:rc?rc.name:'Reverse charge', s:'RC', r:0, rc:true});
  }
  if(typeof FIN_DIR_VAT!=='undefined'){
    reset(FIN_DIR_VAT); reset(FIN_DIR_VAT_S);
    list.forEach(r=>{ if(r.active!==false){ FIN_DIR_VAT[r.code] = r.name; FIN_DIR_VAT_S[r.code] = finVatShort(r); } else { hide(FIN_DIR_VAT, r.code, r.name); hide(FIN_DIR_VAT_S, r.code, finVatShort(r)); } });
  }
}
finVatApply();
(function(){
  const base = finLoadSettings;
  finLoadSettings = async function(){ const r = await base.apply(this, arguments); finVatApply(); return r; };
  const dir = window.openFinDirEdit;
  if(dir) window.openFinDirEdit = async function(){ if(!FIN_SETTINGS) await finLoadSettings(); else finVatApply(); return dir.apply(this, arguments); };
})();

/* ---- the Settings card ---- */
let finVatEdit = null; // working copy while the Settings page is open
function finVatRatesCardHtml(){
  finVatEdit = finVatList();
  return `<div class="card" id="finVatCard"><p class="sectiontitle" style="margin-top:0;">VAT rates</p><div id="finVatBody">${finVatBodyHtml()}</div></div>`;
}
function finVatBodyHtml(){
  return `<p class="stub" style="margin:0 0 10px;font-style:normal;">The rates you can pick on purchase orders and as a client’s or supplier’s default in the Directory. Switch one off to hide it; anything already using it keeps it.</p>
    <div class="finvat">
      <div class="finvat-h"><span>Name</span><span>Rate %</span><span>Reverse charge</span><span>In use</span></div>
      ${finVatEdit.map((r,i)=>`<div class="finvat-r ${r.active===false?'off':''}">
        <input type="text" value="${escapeHtml(r.name||'')}" oninput="finVatSet(${i},'name',this.value)" aria-label="Name">
        <input type="number" min="0" max="100" step="0.5" value="${escapeHtml(String(r.rate??0))}" oninput="finVatSet(${i},'rate',this.value)" aria-label="Rate %" ${r.custom?'':'disabled title="Built-in rate"'}>
        <label class="finvat-c"><input type="checkbox" ${r.rc?'checked':''} ${r.custom?'':'disabled'} onchange="finVatSet(${i},'rc',this.checked)"></label>
        <label class="finvat-c"><input type="checkbox" ${r.active!==false?'checked':''} onchange="finVatSet(${i},'active',this.checked);this.closest('.finvat-r').classList.toggle('off',!this.checked)"></label>
      </div>`).join('')}
    </div>
    <button type="button" class="ghostbtn" style="width:auto;padding:6px 12px;margin-top:10px;" onclick="finVatAdd()">+ Add VAT rate</button>
    <p class="stub" style="margin:8px 0 0;font-style:normal;">Reverse charge: no VAT goes on the invoice — the customer accounts for it (CIS construction work). Saved with <b>Save settings</b> at the bottom.</p>`;
}
window.finVatSet = function(i, k, v){ const r = finVatEdit && finVatEdit[i]; if(!r) return; r[k] = k==='rate' ? Number(v) : v; };
window.finVatAdd = function(){
  finVatEdit.push({code:'c'+Date.now().toString(36), name:'', rate:0, rc:false, active:true, custom:true});
  const b = document.getElementById('finVatBody'); if(b){ b.innerHTML = finVatBodyHtml(); const ins = b.querySelectorAll('.finvat-r input[type=text]'); if(ins.length) ins[ins.length-1].focus(); }
};
(function(){
  const base = window.saveFinanceSettings;
  if(!base) return;
  window.saveFinanceSettings = async function(){
    if(finVatEdit && document.getElementById('finVatCard')){
      const list = finVatEdit.filter(r=>String(r.name||'').trim() || !r.custom).map(r=>({code:r.code, name:String(r.name||'').trim()||r.code, rate:Math.max(0, Math.min(100, Number(r.rate)||0)), rc:!!r.rc, active:r.active!==false, ...(r.custom?{custom:true}:{})}));
      if(!list.some(r=>r.active)){ toast('Keep at least one VAT rate switched on.'); return; }
      if(FIN_SETTINGS){
        const res = await sbFetch('/rest/v1/fin_settings?org_id=eq.'+ME.org_id, {method:'PATCH', headers:{'Prefer':'return=representation'}, body:JSON.stringify({vat_rates:list})});
        if(!res.ok){ toast('VAT rates not saved — '+(await safeErr(res))); return; }
        FIN_SETTINGS.vat_rates = list; finVatApply();
      } else {
        const r = await base.apply(this, arguments);
        await sbFetch('/rest/v1/fin_settings?org_id=eq.'+ME.org_id, {method:'PATCH', body:JSON.stringify({vat_rates:list})});
        await finLoadSettings(); return r;
      }
    }
    return base.apply(this, arguments);
  };
})();
(function(){
  if(typeof FIN_SET_ICONS!=='undefined') FIN_SET_ICONS['vat rates'] = ['%','#eaf6ee','#1e7a3c'];
  if(document.getElementById('finVatCss')) return;
  const st = document.createElement('style'); st.id = 'finVatCss';
  st.textContent = `.finvat{display:grid;gap:6px;max-width:640px;}
.finvat-h,.finvat-r{display:grid;grid-template-columns:minmax(0,1fr) 90px 110px 70px;gap:8px;align-items:center;}
.finvat-h span{font-size:11.5px;font-weight:700;color:var(--slate);text-transform:uppercase;letter-spacing:.04em;}
.finvat-h span:nth-child(n+3){text-align:center;}
.finvat-r input[type=text],.finvat-r input[type=number]{margin:0;}
.finvat-c{display:flex;justify-content:center;}
.finvat-r.off input[type=text]{color:#9aa0a8;text-decoration:line-through;}
@media (max-width:600px){ .finvat-h,.finvat-r{grid-template-columns:minmax(0,1fr) 64px 56px 48px;} .finvat-h span{font-size:10px;} }`;
  document.head.appendChild(st);
})();
